import crypto from "crypto";
import mongoose from "mongoose";
import Order from "../../models/order.js";
import Seller from "../../models/seller.js";
import Delivery from "../../models/delivery.js";
import User from "../../models/customer.js";
import Admin from "../../models/admin.js";
import Ticket from "../../models/ticket.js";
import Transaction from "../../models/transaction.js";
import OrderEvidence from "../../models/orderEvidence.js";
import Penalty, {
  PENALTY_STATUS,
  PENALTY_REASON,
  PENALTY_REASON_LABEL,
} from "../../models/penalty.js";
import { BENEFICIARY_TYPE } from "../../models/settlementPayout.js";
import { orderMatchQueryFromRouteParam } from "../../utils/orderLookup.js";
import { roundCurrency } from "../../utils/money.js";
import { getRemainingPayable } from "../finance/settlementService.js";
import { getEvidenceStatus } from "./orderEvidenceService.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";
import logger from "../logger.js";

const MAX_PENALTY_AMOUNT = () => Number(process.env.MAX_PENALTY_AMOUNT || 100000);

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function generatePenaltyId() {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  return `PEN-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function userModelFor(beneficiaryType) {
  return beneficiaryType === BENEFICIARY_TYPE.SELLER ? "Seller" : "Delivery";
}

function normalizeType(value) {
  const v = String(value || "").toUpperCase();
  if (v === "SELLER") return BENEFICIARY_TYPE.SELLER;
  if (v === "DELIVERY_PARTNER" || v === "DELIVERY") return BENEFICIARY_TYPE.DELIVERY_PARTNER;
  return null;
}

async function findOrder(routeOrderId) {
  const key = orderMatchQueryFromRouteParam(routeOrderId);
  if (!key) throw httpError("Order not found", 404);
  const order = await Order.findOne(key);
  if (!order) throw httpError("Order not found", 404);
  return order;
}

async function getAdminActor(adminId) {
  const admin = await Admin.findById(adminId).select("name email").lean();
  return { id: adminId, name: admin?.name || admin?.email || "Admin" };
}

async function loadBeneficiary(type, id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw httpError("Invalid seller / delivery partner", 400);
  if (type === BENEFICIARY_TYPE.SELLER) {
    const seller = await Seller.findById(id).select("shopName name phone").lean();
    if (!seller) throw httpError("Seller not found", 404);
    return { name: seller.shopName || seller.name || "", phone: seller.phone || "" };
  }
  const rider = await Delivery.findById(id).select("name phone").lean();
  if (!rider) throw httpError("Delivery partner not found", 404);
  return { name: rider.name || "", phone: rider.phone || "" };
}

/** URLs of every piece of evidence tied to an order (used to validate what admin attaches). */
async function collectEvidenceCatalog(order) {
  const [docs, tickets] = await Promise.all([
    OrderEvidence.find({ order: order._id }).lean(),
    Ticket.find({ orderId: order.orderId }).select("subject attachments messages").lean(),
  ]);

  const catalog = new Map(); // url -> kind
  docs.forEach((d) =>
    (d.images || []).forEach((img) => catalog.set(img.url, d.stage)),
  );
  (order.returnImages || []).forEach((u) => catalog.set(u, "CUSTOMER_RETURN"));
  (order.returnPickupImages || []).forEach((u) => catalog.set(u, "RETURN_PICKUP"));
  tickets.forEach((t) => {
    (t.attachments || []).forEach((u) => catalog.set(u, "CUSTOMER_TICKET"));
    (t.messages || []).forEach((m) => {
      if (m.mediaUrl && !m.isAdmin) catalog.set(m.mediaUrl, "CUSTOMER_TICKET");
    });
  });
  return { catalog, tickets };
}

/* ------------------------------------------------------------------ */
/* Apply / revoke                                                      */
/* ------------------------------------------------------------------ */

export async function applyPenalty({
  adminId,
  beneficiaryType,
  beneficiaryId,
  orderId,
  productId,
  amount,
  reason,
  notes,
  evidenceUrls = [],
  relatedTicketId,
}) {
  const type = normalizeType(beneficiaryType);
  if (!type) throw httpError("beneficiaryType must be SELLER or DELIVERY_PARTNER", 400);

  const numericAmount = roundCurrency(Number(amount));
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw httpError("Penalty amount must be greater than zero", 400);
  }
  if (numericAmount > MAX_PENALTY_AMOUNT()) {
    throw httpError(`Penalty amount cannot exceed ₹${money(MAX_PENALTY_AMOUNT())}`, 400);
  }
  if (!Object.values(PENALTY_REASON).includes(reason)) {
    throw httpError("Please select a valid penalty reason", 400);
  }
  const cleanNotes = String(notes || "").trim().slice(0, 1000);
  if (reason === PENALTY_REASON.OTHER && !cleanNotes) {
    throw httpError("Please add a note explaining the penalty", 400);
  }

  const order = await findOrder(orderId);
  const beneficiary = await loadBeneficiary(type, beneficiaryId);

  // The penalised party must actually have been involved in this order.
  const involved =
    type === BENEFICIARY_TYPE.SELLER
      ? String(order.seller) === String(beneficiaryId)
      : [order.deliveryBoy, order.returnDeliveryBoy].some((id) => id && String(id) === String(beneficiaryId));
  if (!involved) {
    throw httpError(
      `This ${type === BENEFICIARY_TYPE.SELLER ? "seller" : "delivery partner"} was not part of order #${order.orderId}`,
      400,
    );
  }

  let product = null;
  if (productId) {
    const item = (order.items || []).find((i) => String(i.product) === String(productId));
    if (!item) throw httpError("Selected product is not part of this order", 400);
    product = { id: item.product, name: item.name || "" };
  }

  const { catalog, tickets } = await collectEvidenceCatalog(order);
  const evidence = [];
  const seen = new Set();
  for (const entry of Array.isArray(evidenceUrls) ? evidenceUrls : []) {
    const url = String(typeof entry === "string" ? entry : entry?.url || "").trim();
    if (!url || seen.has(url) || !catalog.has(url)) continue; // only evidence that belongs to this order
    seen.add(url);
    evidence.push({ kind: catalog.get(url), url, caption: String(entry?.caption || "").slice(0, 120) });
  }

  let ticket = null;
  if (relatedTicketId && mongoose.Types.ObjectId.isValid(relatedTicketId)) {
    ticket = tickets.find((t) => String(t._id) === String(relatedTicketId)) || null;
  }

  // Guard against an accidental double-click creating two identical penalties.
  const duplicate = await Penalty.findOne({
    beneficiaryType: type,
    beneficiary: beneficiaryId,
    order: order._id,
    reason,
    amount: numericAmount,
    status: PENALTY_STATUS.APPLIED,
    createdAt: { $gte: new Date(Date.now() - 30 * 1000) },
  }).lean();
  if (duplicate) throw httpError("An identical penalty was just applied for this order", 409);

  const admin = await getAdminActor(adminId);
  const before = await getRemainingPayable(type, beneficiaryId);
  const remainingAfter = roundCurrency(
    Math.max(0, before.earned - (before.penalty + numericAmount) - before.committed),
  );

  const penaltyId = generatePenaltyId();
  const now = new Date();
  const session = await mongoose.startSession();
  let penalty;
  try {
    await session.withTransaction(async () => {
      [penalty] = await Penalty.create(
        [
          {
            penaltyId,
            beneficiaryType: type,
            beneficiary: beneficiaryId,
            beneficiaryName: beneficiary.name,
            beneficiaryPhone: beneficiary.phone,
            order: order._id,
            orderId: order.orderId,
            ...(product ? { product: product.id, productName: product.name } : {}),
            amount: numericAmount,
            reason,
            reasonLabel: PENALTY_REASON_LABEL[reason],
            notes: cleanNotes,
            relatedReturnStatus: order.returnStatus && order.returnStatus !== "none" ? order.returnStatus : "",
            relatedReturnReason: order.returnReason || "",
            ...(ticket ? { relatedTicket: ticket._id, relatedTicketSubject: ticket.subject } : {}),
            evidence,
            status: PENALTY_STATUS.APPLIED,
            amountDeducted: numericAmount,
            earnedAtApplication: before.earned,
            remainingBefore: before.remaining,
            remainingAfter,
            appliedBy: adminId,
            appliedByName: admin.name,
            history: [
              {
                action: "APPLIED",
                at: now,
                by: adminId,
                byName: admin.name,
                note: cleanNotes,
              },
            ],
          },
        ],
        { session },
      );

      // Wallet debit — shows up in the seller / rider wallet ledger and legacy withdrawable balance.
      const [tx] = await Transaction.create(
        [
          {
            user: beneficiaryId,
            userModel: userModelFor(type),
            order: order._id,
            type: "Penalty",
            amount: -numericAmount,
            status: "Settled",
            reference: `PEN-${penaltyId}`,
            meta: {
              penaltyId,
              orderId: order.orderId,
              reason,
              reasonLabel: PENALTY_REASON_LABEL[reason],
              notes: cleanNotes,
              appliedBy: admin.name,
              productName: product?.name || "",
            },
          },
        ],
        { session },
      );

      penalty.walletTransaction = tx._id;
      penalty.walletTransactionRef = tx.reference;
      await penalty.save({ session });
    });
  } finally {
    session.endSession();
  }

  notifyBeneficiary(NOTIFICATION_EVENTS.PENALTY_APPLIED, penalty, {
    message: `A penalty of ₹${money(numericAmount)} was applied for order #${order.orderId} (${PENALTY_REASON_LABEL[reason]}). It has been deducted from your earnings.`,
  });

  return penalty.toObject();
}

export async function revokePenalty(penaltyMongoId, { adminId, reason }) {
  if (!mongoose.Types.ObjectId.isValid(penaltyMongoId)) throw httpError("Penalty not found", 404);
  const cleanReason = String(reason || "").trim().slice(0, 500);
  if (!cleanReason) throw httpError("Please enter a reason for revoking this penalty", 400);

  const admin = await getAdminActor(adminId);
  const now = new Date();
  const session = await mongoose.startSession();
  let revoked;
  try {
    await session.withTransaction(async () => {
      revoked = await Penalty.findOneAndUpdate(
        { _id: penaltyMongoId, status: PENALTY_STATUS.APPLIED },
        {
          $set: {
            status: PENALTY_STATUS.REVOKED,
            revokedAt: now,
            revokedBy: adminId,
            revokedByName: admin.name,
            revokeReason: cleanReason,
          },
          $push: {
            history: { action: "REVOKED", at: now, by: adminId, byName: admin.name, note: cleanReason },
          },
        },
        { new: true, session },
      );
      if (!revoked) {
        const current = await Penalty.findById(penaltyMongoId).select("status").session(session).lean();
        if (!current) throw httpError("Penalty not found", 404);
        throw httpError("This penalty has already been revoked", 409);
      }

      const reversalRef = `PEN-REV-${revoked.penaltyId}`;
      await Transaction.create(
        [
          {
            user: revoked.beneficiary,
            userModel: userModelFor(revoked.beneficiaryType),
            order: revoked.order,
            type: "Penalty",
            amount: revoked.amount,
            status: "Settled",
            reference: reversalRef,
            meta: {
              penaltyId: revoked.penaltyId,
              orderId: revoked.orderId,
              reversal: true,
              note: "Penalty revoked by admin",
              reason: cleanReason,
              revokedBy: admin.name,
            },
          },
        ],
        { session },
      );
      revoked.reversalTransactionRef = reversalRef;
      await revoked.save({ session });
    });
  } finally {
    session.endSession();
  }

  notifyBeneficiary(NOTIFICATION_EVENTS.PENALTY_REVOKED, revoked, {
    message: `The ₹${money(revoked.amount)} penalty for order #${revoked.orderId} was revoked and credited back to your earnings.`,
  });

  return revoked.toObject();
}

function notifyBeneficiary(eventType, penalty, { message }) {
  try {
    emitNotificationEvent(eventType, {
      orderId: penalty.orderId,
      ...(penalty.beneficiaryType === BENEFICIARY_TYPE.SELLER
        ? { sellerId: penalty.beneficiary }
        : { deliveryId: penalty.beneficiary }),
      penaltyId: penalty.penaltyId,
      message,
    });
  } catch (error) {
    logger.warn("[penalty] notification failed", { message: error.message });
  }
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listPenalties({
  type,
  status,
  beneficiaryId,
  orderId,
  search,
  page = 1,
  limit = 20,
} = {}) {
  const query = {};
  const normalizedType = normalizeType(type);
  if (normalizedType) query.beneficiaryType = normalizedType;
  if (status && Object.values(PENALTY_STATUS).includes(status)) query.status = status;
  if (beneficiaryId && mongoose.Types.ObjectId.isValid(beneficiaryId)) {
    query.beneficiary = new mongoose.Types.ObjectId(beneficiaryId);
  }
  if (orderId) query.orderId = String(orderId).trim();
  if (search) {
    const rx = new RegExp(escapeRegex(String(search).trim()), "i");
    query.$or = [
      { penaltyId: rx },
      { orderId: rx },
      { beneficiaryName: rx },
      { beneficiaryPhone: rx },
      { productName: rx },
    ];
  }

  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);

  const [items, total, [totals]] = await Promise.all([
    Penalty.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    Penalty.countDocuments(query),
    Penalty.aggregate([
      { $match: { ...query, status: PENALTY_STATUS.APPLIED } },
      { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]);

  return {
    items,
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit) || 1,
    totals: { appliedAmount: roundCurrency(totals?.amount || 0), appliedCount: totals?.count || 0 },
  };
}

export async function getPenaltyDetail(penaltyMongoId) {
  if (!mongoose.Types.ObjectId.isValid(penaltyMongoId)) throw httpError("Penalty not found", 404);
  const penalty = await Penalty.findById(penaltyMongoId).lean();
  if (!penalty) throw httpError("Penalty not found", 404);

  const order = await Order.findById(penalty.order)
    .select("orderId status workflowStatus createdAt deliveredAt items paymentMode pricing returnStatus returnReason")
    .lean();
  return { penalty, order };
}

export async function listMyPenalties(role, userId, { page = 1, limit = 20 } = {}) {
  const type = role === "seller" ? BENEFICIARY_TYPE.SELLER : role === "delivery" ? BENEFICIARY_TYPE.DELIVERY_PARTNER : null;
  if (!type) throw httpError("Access denied", 403);

  const query = { beneficiaryType: type, beneficiary: new mongoose.Types.ObjectId(userId) };
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);

  const [items, total] = await Promise.all([
    Penalty.find(query)
      .select("penaltyId orderId productName amount reason reasonLabel notes status createdAt appliedByName revokedAt revokeReason")
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    Penalty.countDocuments(query),
  ]);

  return { items, page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) || 1 };
}

/** Orders a given seller / delivery partner took part in (for the "Apply Penalty" order picker). */
export async function getBeneficiaryOrders({ type, beneficiaryId, search = "" }) {
  const normalizedType = normalizeType(type);
  if (!normalizedType || !mongoose.Types.ObjectId.isValid(beneficiaryId)) {
    throw httpError("Invalid seller / delivery partner", 400);
  }
  const oid = new mongoose.Types.ObjectId(beneficiaryId);
  const query =
    normalizedType === BENEFICIARY_TYPE.SELLER
      ? { seller: oid }
      : { $or: [{ deliveryBoy: oid }, { returnDeliveryBoy: oid }] };
  // Order IDs are stored without "#"; admins often type "#ORD-123", so strip it.
  const cleanSearch = String(search || "").trim().replace(/^#+/, "").trim();
  if (cleanSearch) query.orderId = new RegExp(escapeRegex(cleanSearch), "i");

  const orders = await Order.find(query)
    .select("orderId status createdAt pricing.total items.product items.name items.quantity returnStatus")
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  return orders.map((o) => ({
    _id: o._id,
    orderId: o.orderId,
    status: o.status,
    createdAt: o.createdAt,
    total: o.pricing?.total || 0,
    returnStatus: o.returnStatus || "none",
    items: (o.items || []).map((i) => ({ productId: i.product, name: i.name, quantity: i.quantity })),
  }));
}

/* ------------------------------------------------------------------ */
/* Admin investigation bundle                                          */
/* ------------------------------------------------------------------ */

function timelineEvent(list, at, label, detail) {
  if (at) list.push({ at: new Date(at), label, detail: detail || "" });
}

export async function getInvestigation(routeOrderId) {
  const order = await findOrder(routeOrderId);

  const [seller, rider, returnRider, customer, evidenceDocs, tickets, penalties, evidenceStatus] =
    await Promise.all([
      Seller.findById(order.seller).select("shopName name phone").lean(),
      order.deliveryBoy ? Delivery.findById(order.deliveryBoy).select("name phone").lean() : null,
      order.returnDeliveryBoy ? Delivery.findById(order.returnDeliveryBoy).select("name phone").lean() : null,
      User.findById(order.customer).select("name phone email").lean(),
      OrderEvidence.find({ order: order._id }).sort({ createdAt: 1 }).lean(),
      Ticket.find({ orderId: order.orderId }).sort({ createdAt: -1 }).lean(),
      Penalty.find({ order: order._id }).sort({ createdAt: -1 }).lean(),
      getEvidenceStatus(order),
    ]);

  const sellerEvidence = evidenceDocs.find((d) => d.stage === "SELLER_DISPATCH") || null;
  const riderEvidence = evidenceDocs.find((d) => d.stage === "RIDER_PICKUP") || null;

  const hasReturn = order.returnStatus && order.returnStatus !== "none";
  const returnInfo = hasReturn
    ? {
        status: order.returnStatus,
        reason: order.returnReason || "",
        reasonDetail: order.returnReasonDetail || "",
        requestedAt: order.returnRequestedAt || null,
        conditionAssurance: Boolean(order.returnConditionAssurance),
        images: order.returnImages || [],
        items: order.returnItems || [],
        pickupImages: order.returnPickupImages || [],
        pickupCondition: order.returnPickupCondition || "",
        pickupConditionNote: order.returnPickupConditionNote || "",
        qcStatus: order.returnQcStatus || "",
        qcNote: order.returnQcNote || "",
        rejectedReason: order.returnRejectedReason || "",
        refundAmount: order.returnRefundAmount || 0,
        pickedAt: order.returnPickedAt || null,
        deliveredBackAt: order.returnDeliveredBackAt || null,
        returnRider: returnRider ? { _id: returnRider._id, name: returnRider.name, phone: returnRider.phone } : null,
      }
    : null;

  const timeline = [];
  timelineEvent(timeline, order.createdAt, "Order placed", `₹${money(order.pricing?.total)} · ${order.paymentMode || ""}`);
  timelineEvent(timeline, order.sellerAcceptedAt, "Seller accepted the order");
  if (sellerEvidence) {
    timelineEvent(
      timeline,
      sellerEvidence.firstUploadedAt,
      "Seller uploaded product condition photos",
      `${sellerEvidence.images.length} photo(s) · condition: ${sellerEvidence.condition}`,
    );
  }
  timelineEvent(timeline, order.assignedAt, "Delivery partner accepted", rider?.name || "");
  timelineEvent(timeline, order.pickupReadyAt, "Delivery partner arrived at store");
  if (riderEvidence) {
    timelineEvent(
      timeline,
      riderEvidence.firstUploadedAt,
      "Delivery partner uploaded pickup condition photos",
      `${riderEvidence.images.length} photo(s) · condition: ${riderEvidence.condition}`,
    );
  }
  timelineEvent(timeline, order.pickupConfirmedAt, "Order picked up from seller");
  timelineEvent(timeline, order.outForDeliveryAt, "Out for delivery");
  timelineEvent(timeline, order.deliveredAt, "Delivered to customer");
  timelineEvent(timeline, order.returnRequestedAt, "Customer raised a return request", order.returnReason || "");
  timelineEvent(timeline, order.returnPickedAt, "Return picked up from customer");
  timelineEvent(timeline, order.returnDeliveredBackAt, "Return delivered back to seller");
  timelineEvent(timeline, order.returnQcAt, "Return QC completed", order.returnQcStatus || "");
  tickets.forEach((t) =>
    timelineEvent(timeline, t.createdAt, "Customer raised a support ticket", t.subject),
  );
  penalties.forEach((p) =>
    timelineEvent(
      timeline,
      p.createdAt,
      p.status === PENALTY_STATUS.REVOKED ? "Penalty applied (later revoked)" : "Penalty applied",
      `${p.beneficiaryName} · ₹${money(p.amount)}`,
    ),
  );
  timeline.sort((a, b) => a.at - b.at);

  return {
    order: {
      _id: order._id,
      orderId: order.orderId,
      status: order.status,
      workflowStatus: order.workflowStatus,
      paymentMode: order.paymentMode,
      total: order.pricing?.total || 0,
      createdAt: order.createdAt,
      deliveredAt: order.deliveredAt || null,
      items: (order.items || []).map((i) => ({
        productId: i.product,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        image: i.image,
      })),
    },
    seller: seller ? { _id: seller._id, name: seller.shopName || seller.name, phone: seller.phone } : null,
    deliveryBoy: rider ? { _id: rider._id, name: rider.name, phone: rider.phone } : null,
    customer: customer ? { _id: customer._id, name: customer.name, phone: customer.phone } : null,
    evidenceStatus,
    sellerEvidence,
    riderEvidence,
    returnInfo,
    tickets: tickets.map((t) => ({
      _id: t._id,
      subject: t.subject,
      description: t.description,
      issueType: t.issueType || "",
      status: t.status,
      createdAt: t.createdAt,
      attachments: t.attachments || [],
      media: (t.messages || [])
        .filter((m) => m.mediaUrl && !m.isAdmin)
        .map((m) => ({ url: m.mediaUrl, at: m.createdAt })),
    })),
    penalties,
    timeline,
  };
}
