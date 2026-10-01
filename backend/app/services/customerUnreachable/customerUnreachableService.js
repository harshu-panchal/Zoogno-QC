import crypto from "crypto";
import mongoose from "mongoose";
import Order from "../../models/order.js";
import User from "../../models/customer.js";
import Admin from "../../models/admin.js";
import Delivery from "../../models/delivery.js";
import Transaction from "../../models/transaction.js";
import CustomerUnreachableCase, {
  UNREACHABLE_CASE_STATUS,
  ACTIVE_CASE_STATUSES,
} from "../../models/customerUnreachableCase.js";
import UnreachableCharge, {
  UNREACHABLE_CHARGE_STATUS,
} from "../../models/unreachableCharge.js";
import { WORKFLOW_STATUS } from "../../constants/orderWorkflow.js";
import { requireCanonicalOrderId } from "../../utils/orderLookup.js";
import { distanceMeters } from "../../utils/geoUtils.js";
import { roundCurrency } from "../../utils/money.js";
import { getSettlementDateRange } from "../../utils/settlementPeriod.js";
import { getIO } from "../../socket/socketManager.js";
import { emitOrderStatusUpdate, emitToDelivery } from "../orderSocketEmitter.js";
import { compensateOrderCancellation } from "../orderCompensation.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";
import logger from "../logger.js";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const MIN_CALL_ATTEMPTS = () =>
  Math.max(0, parseInt(process.env.UNREACHABLE_MIN_CALL_ATTEMPTS || "2", 10));
const MIN_WAIT_MINUTES = () =>
  Math.max(0, parseFloat(process.env.UNREACHABLE_MIN_WAIT_MINUTES || "5"));
// Rider must be this close to the drop pin to report "reached" (0 disables the check).
const REACHED_RADIUS_M = () =>
  Math.max(0, parseInt(process.env.UNREACHABLE_REACHED_RADIUS_METERS || "200", 10));
const MAX_CALL_ATTEMPTS = 25;

const UNREACHABLE_REASON_TEXT =
  "Customer was unreachable after the delivery partner reached the delivery location.";

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function orderAmountOf(order) {
  return roundCurrency(order?.paymentBreakdown?.grandTotal || order?.pricing?.total || 0);
}

function generateChargeId() {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  return `UCH-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function isValidCoord(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  );
}

async function getAdminActor(adminId) {
  const admin = await Admin.findById(adminId).select("name email").lean();
  return { id: adminId, name: admin?.name || admin?.email || "Admin" };
}

function emitToAdmins(event, payload) {
  try {
    const io = getIO();
    if (io) io.to("admin:orders").emit(event, payload);
  } catch (error) {
    logger.warn("[customerUnreachable] admin socket emit failed", { event, message: error.message });
  }
}

/* ------------------------------------------------------------------ */
/* Delivery boy flow                                                   */
/* ------------------------------------------------------------------ */

async function findRiderOrder(deliveryId, routeOrderId) {
  const orderId = await requireCanonicalOrderId(routeOrderId);
  const order = await Order.findOne({
    orderId,
    deliveryBoy: deliveryId,
    workflowVersion: { $gte: 2 },
  });
  if (!order) throw httpError("Order not found for this delivery partner", 404);
  return order;
}

function riderCaseView(caseDoc) {
  if (!caseDoc) return null;
  const c = typeof caseDoc.toObject === "function" ? caseDoc.toObject() : caseDoc;
  return {
    _id: c._id,
    orderId: c.orderId,
    status: c.status,
    reachedAt: c.reachedAt,
    callAttemptCount: c.callAttemptCount || 0,
    reportedAt: c.reportedAt || null,
    resolvedAt: c.resolvedAt || null,
  };
}

function riderCaseRules(caseDoc) {
  const minAttempts = MIN_CALL_ATTEMPTS();
  const minWaitMs = MIN_WAIT_MINUTES() * 60 * 1000;
  const reachedMs = caseDoc?.reachedAt ? new Date(caseDoc.reachedAt).getTime() : null;
  const unlockAt = reachedMs != null ? new Date(reachedMs + minWaitMs) : null;
  return {
    minCallAttempts: minAttempts,
    minWaitMinutes: MIN_WAIT_MINUTES(),
    unlockAt,
    serverNow: new Date(),
    canMarkUnreachable:
      Boolean(caseDoc) &&
      caseDoc.status === UNREACHABLE_CASE_STATUS.REACHED &&
      (caseDoc.callAttemptCount || 0) >= minAttempts &&
      (unlockAt == null || unlockAt.getTime() <= Date.now()),
  };
}

export async function getRiderCaseState(deliveryId, routeOrderId) {
  const order = await findRiderOrder(deliveryId, routeOrderId);
  const caseDoc = await CustomerUnreachableCase.findOne({
    order: order._id,
    status: { $in: ACTIVE_CASE_STATUSES },
  }).lean();
  return {
    orderId: order.orderId,
    workflowStatus: order.workflowStatus,
    unreachableState: order.customerUnreachable?.state || null,
    case: riderCaseView(caseDoc),
    rules: riderCaseRules(caseDoc),
  };
}

/** Rider reports they reached the customer's drop location. */
export async function reachedCustomerLocation(deliveryId, routeOrderId, { lat, lng } = {}) {
  const order = await findRiderOrder(deliveryId, routeOrderId);

  const existing = await CustomerUnreachableCase.findOne({
    order: order._id,
    status: { $in: ACTIVE_CASE_STATUSES },
  });
  if (existing) {
    return { case: riderCaseView(existing), rules: riderCaseRules(existing), duplicate: true };
  }

  if (order.workflowStatus !== WORKFLOW_STATUS.OUT_FOR_DELIVERY) {
    throw httpError("Order must be out for delivery to mark reached", 409);
  }

  let distanceFromDropMeters;
  const drop = order.address?.location;
  if (isValidCoord(lat, lng) && isValidCoord(drop?.lat, drop?.lng)) {
    distanceFromDropMeters = Math.round(distanceMeters(lat, lng, drop.lat, drop.lng));
    const radius = REACHED_RADIUS_M();
    if (radius > 0 && distanceFromDropMeters > radius) {
      throw httpError(
        `You are too far from the customer location (${distanceFromDropMeters}m away, must be within ${radius}m)`,
        400,
      );
    }
  }

  const [customer, rider] = await Promise.all([
    User.findById(order.customer).select("name phone").lean(),
    Delivery.findById(deliveryId).select("name phone").lean(),
  ]);

  const reachedAt = new Date();
  let caseDoc;
  try {
    caseDoc = await CustomerUnreachableCase.create({
      order: order._id,
      orderId: order.orderId,
      customer: order.customer,
      customerName: order.address?.name || customer?.name || "",
      customerPhone: order.address?.phone || customer?.phone || "",
      deliveryBoy: deliveryId,
      deliveryBoyName: rider?.name || "",
      deliveryBoyPhone: rider?.phone || "",
      seller: order.seller,
      orderAmount: orderAmountOf(order),
      paymentMode: order.paymentMode,
      items: (order.items || []).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      address: {
        name: order.address?.name,
        phone: order.address?.phone,
        address: order.address?.address,
        city: order.address?.city,
        landmark: order.address?.landmark,
      },
      status: UNREACHABLE_CASE_STATUS.REACHED,
      reachedAt,
      ...(isValidCoord(lat, lng)
        ? { reachedLocation: { lat, lng, distanceFromDropMeters } }
        : {}),
    });
  } catch (error) {
    if (error?.code === 11000) {
      const dup = await CustomerUnreachableCase.findOne({
        order: order._id,
        status: { $in: ACTIVE_CASE_STATUSES },
      });
      return { case: riderCaseView(dup), rules: riderCaseRules(dup), duplicate: true };
    }
    throw error;
  }

  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        "customerUnreachable.caseId": caseDoc._id,
        "customerUnreachable.reachedAt": reachedAt,
      },
    },
  );

  return { case: riderCaseView(caseDoc), rules: riderCaseRules(caseDoc), duplicate: false };
}

/** Each tap on "Call customer" counts as one call attempt. */
export async function recordCallAttempt(deliveryId, routeOrderId) {
  const order = await findRiderOrder(deliveryId, routeOrderId);
  const updated = await CustomerUnreachableCase.findOneAndUpdate(
    {
      order: order._id,
      deliveryBoy: deliveryId,
      status: UNREACHABLE_CASE_STATUS.REACHED,
      callAttemptCount: { $lt: MAX_CALL_ATTEMPTS },
    },
    {
      $push: { callAttempts: { at: new Date(), channel: "phone" } },
      $inc: { callAttemptCount: 1 },
    },
    { new: true },
  );
  if (!updated) {
    throw httpError("Mark 'Reached Customer Location' first before calling the customer", 409);
  }
  return { case: riderCaseView(updated), rules: riderCaseRules(updated) };
}

/** Rider reports the customer unreachable. The rider can NOT cancel the order. */
export async function markCustomerUnreachable(deliveryId, routeOrderId, { lat, lng, note } = {}) {
  const order = await findRiderOrder(deliveryId, routeOrderId);

  const caseDoc = await CustomerUnreachableCase.findOne({
    order: order._id,
    deliveryBoy: deliveryId,
    status: UNREACHABLE_CASE_STATUS.REACHED,
  });
  if (!caseDoc) {
    throw httpError("Mark 'Reached Customer Location' first", 409);
  }
  if (order.workflowStatus !== WORKFLOW_STATUS.OUT_FOR_DELIVERY) {
    throw httpError("Order is not out for delivery", 409);
  }

  const rules = riderCaseRules(caseDoc);
  if ((caseDoc.callAttemptCount || 0) < rules.minCallAttempts) {
    throw httpError(
      `Please call the customer at least ${rules.minCallAttempts} time(s) before marking unreachable (${caseDoc.callAttemptCount || 0} done)`,
      400,
    );
  }
  if (rules.unlockAt && rules.unlockAt.getTime() > Date.now()) {
    const waitSeconds = Math.ceil((rules.unlockAt.getTime() - Date.now()) / 1000);
    throw httpError(
      `Please wait ${Math.ceil(waitSeconds / 60)} more minute(s) at the location before marking unreachable`,
      400,
    );
  }

  const now = new Date();
  const reportSet = {
    status: UNREACHABLE_CASE_STATUS.CUSTOMER_UNREACHABLE,
    reportedAt: now,
  };
  if (note) reportSet.riderNote = String(note).slice(0, 500);
  if (isValidCoord(lat, lng)) {
    reportSet.reportedLocation = { lat, lng };
    const drop = order.address?.location;
    if (isValidCoord(drop?.lat, drop?.lng)) {
      reportSet.reportedLocation.distanceFromDropMeters = Math.round(
        distanceMeters(lat, lng, drop.lat, drop.lng),
      );
    }
  }

  // 1) atomically claim the case so a double-tap cannot report twice
  const claimed = await CustomerUnreachableCase.findOneAndUpdate(
    { _id: caseDoc._id, status: UNREACHABLE_CASE_STATUS.REACHED },
    { $set: reportSet },
    { new: true },
  );
  if (!claimed) throw httpError("This order was already reported", 409);

  // 2) move the order out of the normal delivery path
  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      deliveryBoy: deliveryId,
      workflowStatus: WORKFLOW_STATUS.OUT_FOR_DELIVERY,
    },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.CUSTOMER_UNREACHABLE,
        "customerUnreachable.caseId": claimed._id,
        "customerUnreachable.state": "REPORTED",
        "customerUnreachable.reportedAt": now,
      },
    },
    { new: true },
  );
  if (!updatedOrder) {
    await CustomerUnreachableCase.updateOne(
      { _id: claimed._id },
      { $set: { status: UNREACHABLE_CASE_STATUS.REACHED }, $unset: { reportedAt: 1 } },
    );
    throw httpError("Order state changed, please refresh", 409);
  }

  // 3) notify admins (socket for live toast + persisted notification)
  const alertPayload = {
    caseId: String(claimed._id),
    orderId: claimed.orderId,
    customerName: claimed.customerName,
    customerPhone: claimed.customerPhone,
    deliveryBoyName: claimed.deliveryBoyName,
    orderAmount: claimed.orderAmount,
    items: claimed.items,
    address: claimed.address,
    reachedAt: claimed.reachedAt,
    reportedAt: claimed.reportedAt,
    callAttemptCount: claimed.callAttemptCount,
    status: "CUSTOMER_UNREACHABLE",
    message: `Customer Unreachable – Order #${claimed.orderId} requires admin action.`,
  };
  emitToAdmins("customer_unreachable_alert", alertPayload);

  Admin.find({}).select("_id").lean()
    .then((admins) => {
      emitNotificationEvent(NOTIFICATION_EVENTS.CUSTOMER_UNREACHABLE_REPORTED, {
        orderId: claimed.orderId,
        caseId: String(claimed._id),
        adminIds: admins.map((a) => String(a._id)),
        data: {
          customerName: claimed.customerName,
          customerPhone: claimed.customerPhone,
          deliveryBoyName: claimed.deliveryBoyName,
          orderAmount: claimed.orderAmount,
          callAttemptCount: claimed.callAttemptCount,
        },
      });
    })
    .catch((error) =>
      logger.warn("[customerUnreachable] admin notification failed", { message: error.message }),
    );

  emitOrderStatusUpdate(
    claimed.orderId,
    { workflowStatus: WORKFLOW_STATUS.CUSTOMER_UNREACHABLE },
    order.customer,
  );

  return { case: riderCaseView(claimed), rules: riderCaseRules(claimed) };
}

/* ------------------------------------------------------------------ */
/* Admin: cases                                                        */
/* ------------------------------------------------------------------ */

const TAB_FILTERS = {
  pending: { status: UNREACHABLE_CASE_STATUS.CUSTOMER_UNREACHABLE },
  cancelled: { status: UNREACHABLE_CASE_STATUS.CANCELLED },
  recovered: {
    status: UNREACHABLE_CASE_STATUS.CANCELLED,
    chargeStatus: UNREACHABLE_CHARGE_STATUS.RECOVERED,
  },
  retry: { status: UNREACHABLE_CASE_STATUS.RETRY },
  history: {
    status: {
      $in: [
        UNREACHABLE_CASE_STATUS.CUSTOMER_UNREACHABLE,
        UNREACHABLE_CASE_STATUS.CANCELLED,
        UNREACHABLE_CASE_STATUS.RETRY,
      ],
    },
  },
};

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listCases({ tab = "pending", search = "", page = 1, limit = 20 } = {}) {
  const base = TAB_FILTERS[tab] || TAB_FILTERS.pending;
  const query = { ...base };
  if (search) {
    const rx = new RegExp(escapeRegex(search.trim()), "i");
    query.$or = [
      { orderId: rx },
      { customerName: rx },
      { customerPhone: rx },
      { deliveryBoyName: rx },
    ];
  }

  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);

  const [items, total, counts] = await Promise.all([
    CustomerUnreachableCase.find(query)
      .sort({ reportedAt: -1, createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    CustomerUnreachableCase.countDocuments(query),
    getTabCounts(),
  ]);

  return {
    items,
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit) || 1,
    counts,
  };
}

async function getTabCounts() {
  const entries = await Promise.all(
    Object.entries(TAB_FILTERS).map(async ([key, filter]) => [
      key,
      await CustomerUnreachableCase.countDocuments(filter),
    ]),
  );
  return Object.fromEntries(entries);
}

export async function getPendingCaseCount() {
  return CustomerUnreachableCase.countDocuments(TAB_FILTERS.pending);
}

export async function getCaseDetail(caseId) {
  if (!mongoose.Types.ObjectId.isValid(caseId)) throw httpError("Case not found", 404);
  const caseDoc = await CustomerUnreachableCase.findById(caseId).lean();
  if (!caseDoc) throw httpError("Case not found", 404);

  const [order, charge] = await Promise.all([
    Order.findById(caseDoc.order)
      .select("orderId status workflowStatus paymentMode paymentStatus payment pricing paymentBreakdown items address createdAt deliveredAt cancelReason cancelledBy customerUnreachable unreachableRecovery")
      .lean(),
    caseDoc.charge ? UnreachableCharge.findById(caseDoc.charge).lean() : null,
  ]);

  return { case: caseDoc, order, charge };
}

/** Admin cancels the order because the customer was unreachable (optionally with a charge). */
export async function adminCancelCase(caseId, { adminId, chargeAmount = 0, note = "" } = {}) {
  if (!mongoose.Types.ObjectId.isValid(caseId)) throw httpError("Case not found", 404);

  const existing = await CustomerUnreachableCase.findById(caseId).lean();
  if (!existing) throw httpError("Case not found", 404);
  if (existing.status !== UNREACHABLE_CASE_STATUS.CUSTOMER_UNREACHABLE) {
    throw httpError("This case has already been resolved", 409);
  }

  const amount = roundCurrency(Number(chargeAmount || 0));
  if (!Number.isFinite(amount) || amount < 0) {
    throw httpError("Unreachable charge must be zero or a positive amount", 400);
  }
  if (amount > existing.orderAmount) {
    throw httpError(
      `Unreachable charge (₹${formatMoney(amount)}) cannot exceed the order amount (₹${formatMoney(existing.orderAmount)})`,
      400,
    );
  }

  const admin = await getAdminActor(adminId);
  const now = new Date();
  const session = await mongoose.startSession();
  let cancelledCase;
  let charge = null;
  try {
    await session.withTransaction(async () => {
      cancelledCase = await CustomerUnreachableCase.findOneAndUpdate(
        { _id: caseId, status: UNREACHABLE_CASE_STATUS.CUSTOMER_UNREACHABLE },
        {
          $set: {
            status: UNREACHABLE_CASE_STATUS.CANCELLED,
            isActive: false,
            resolvedAt: now,
            resolvedBy: adminId,
            resolvedByName: admin.name,
            adminNote: String(note || "").slice(0, 500),
            chargeAmount: amount,
          },
        },
        { new: true, session },
      );
      if (!cancelledCase) throw httpError("This case has already been resolved", 409);

      const updatedOrder = await Order.findOneAndUpdate(
        { _id: cancelledCase.order, workflowStatus: WORKFLOW_STATUS.CUSTOMER_UNREACHABLE },
        {
          $set: {
            workflowStatus: WORKFLOW_STATUS.CANCELLED,
            status: "cancelled",
            orderStatus: "cancelled",
            cancelledBy: "admin",
            cancelReason: UNREACHABLE_REASON_TEXT,
            "settlementStatus.overall": "CANCELLED",
            "customerUnreachable.state": "CANCELLED",
            "customerUnreachable.cancelledAt": now,
            "customerUnreachable.chargeAmount": amount,
            "customerUnreachable.reason": UNREACHABLE_REASON_TEXT,
          },
        },
        { new: true, session },
      );
      if (!updatedOrder) throw httpError("Order is no longer awaiting admin action", 409);

      if (amount > 0) {
        const chargeId = generateChargeId();
        [charge] = await UnreachableCharge.create(
          [
            {
              chargeId,
              customer: cancelledCase.customer,
              customerName: cancelledCase.customerName,
              customerPhone: cancelledCase.customerPhone,
              originalOrder: cancelledCase.order,
              originalOrderId: cancelledCase.orderId,
              originalOrderAmount: cancelledCase.orderAmount,
              case: cancelledCase._id,
              amount,
              reason: "Customer Unreachable",
              status: UNREACHABLE_CHARGE_STATUS.PENDING,
              createdBy: adminId,
              createdByName: admin.name,
              history: [
                {
                  action: "CREATED",
                  at: now,
                  by: adminId,
                  byName: admin.name,
                  byRole: "admin",
                  note: String(note || "").slice(0, 500),
                },
              ],
            },
          ],
          { session },
        );

        await Transaction.create(
          [
            {
              user: cancelledCase.customer,
              userModel: "User",
              order: cancelledCase.order,
              type: "Unreachable Charge",
              amount: -amount,
              status: "Pending",
              reference: `UNR-${chargeId}`,
              meta: {
                chargeId,
                orderId: cancelledCase.orderId,
                reason: "Customer Unreachable",
                note: "Pending recovery — will be added to the next order",
              },
            },
          ],
          { session },
        );

        cancelledCase.charge = charge._id;
        cancelledCase.chargeStatus = UNREACHABLE_CHARGE_STATUS.PENDING;
        await cancelledCase.save({ session });
      }
    });
  } finally {
    session.endSession();
  }

  // Post-commit side effects (never roll back the cancellation).
  try {
    await compensateOrderCancellation({ _id: cancelledCase.order }, cancelledCase.orderId);
  } catch (error) {
    logger.warn("[customerUnreachable] stock compensation failed", {
      orderId: cancelledCase.orderId,
      message: error.message,
    });
  }

  emitOrderStatusUpdate(
    cancelledCase.orderId,
    {
      workflowStatus: WORKFLOW_STATUS.CANCELLED,
      cancelType: "CUSTOMER_UNREACHABLE",
      chargeAmount: amount,
    },
    cancelledCase.customer,
  );

  const customerMessage =
    amount > 0
      ? `Your order #${cancelledCase.orderId} was cancelled because the delivery partner could not reach you. A ₹${formatMoney(amount)} delivery charge has been added to your pending balance and will be applied to your next order.`
      : `Your order #${cancelledCase.orderId} was cancelled because the delivery partner could not reach you.`;
  emitNotificationEvent(NOTIFICATION_EVENTS.CUSTOMER_UNREACHABLE_CANCELLED, {
    orderId: cancelledCase.orderId,
    customerId: cancelledCase.customer,
    userId: cancelledCase.customer,
    customerMessage,
  });
  if (cancelledCase.seller) {
    emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
      orderId: cancelledCase.orderId,
      sellerId: cancelledCase.seller,
      sellerMessage: `Order #${cancelledCase.orderId} was cancelled (customer unreachable).`,
    });
  }

  return { case: cancelledCase.toObject(), charge: charge ? charge.toObject() : null };
}

/** Admin asks the rider to try delivering again. */
export async function adminRetryCase(caseId, { adminId, note = "" } = {}) {
  if (!mongoose.Types.ObjectId.isValid(caseId)) throw httpError("Case not found", 404);
  const admin = await getAdminActor(adminId);
  const now = new Date();

  const resolved = await CustomerUnreachableCase.findOneAndUpdate(
    { _id: caseId, status: UNREACHABLE_CASE_STATUS.CUSTOMER_UNREACHABLE },
    {
      $set: {
        status: UNREACHABLE_CASE_STATUS.RETRY,
        isActive: false,
        resolvedAt: now,
        resolvedBy: adminId,
        resolvedByName: admin.name,
        adminNote: String(note || "").slice(0, 500),
      },
    },
    { new: true },
  );
  if (!resolved) throw httpError("This case has already been resolved", 409);

  const order = await Order.findOneAndUpdate(
    { _id: resolved.order, workflowStatus: WORKFLOW_STATUS.CUSTOMER_UNREACHABLE },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.OUT_FOR_DELIVERY,
        "customerUnreachable.state": "RETRY",
      },
    },
    { new: true },
  );
  if (!order) {
    await CustomerUnreachableCase.updateOne(
      { _id: resolved._id },
      {
        $set: { status: UNREACHABLE_CASE_STATUS.CUSTOMER_UNREACHABLE, isActive: true },
        $unset: { resolvedAt: 1 },
      },
    );
    throw httpError("Order is no longer awaiting admin action", 409);
  }

  emitOrderStatusUpdate(
    resolved.orderId,
    { workflowStatus: WORKFLOW_STATUS.OUT_FOR_DELIVERY, unreachableResolved: "RETRY" },
    resolved.customer,
  );
  emitToDelivery(resolved.deliveryBoy, {
    event: "order:unreachable:retry",
    payload: { orderId: resolved.orderId, message: "Admin asked you to retry the delivery." },
  });

  return { case: resolved.toObject() };
}

/* ------------------------------------------------------------------ */
/* Charges: recovery on the customer's next order                      */
/* ------------------------------------------------------------------ */

function chargeSummary(charge) {
  return {
    _id: charge._id,
    chargeId: charge.chargeId,
    amount: charge.amount,
    originalOrderId: charge.originalOrderId,
    reason: charge.reason,
    status: charge.status,
    createdAt: charge.createdAt,
  };
}

async function recoverCharge(charge, order) {
  const now = new Date();
  const recovered = await UnreachableCharge.findOneAndUpdate(
    { _id: charge._id, status: UNREACHABLE_CHARGE_STATUS.APPLIED },
    {
      $set: {
        status: UNREACHABLE_CHARGE_STATUS.RECOVERED,
        recoveredAt: now,
        adminEarning: charge.amount,
      },
      $push: {
        history: {
          action: "RECOVERED",
          at: now,
          byRole: "system",
          note: `Recovered through order ${order?.orderId || charge.appliedOrderId}`,
        },
      },
    },
    { new: true },
  );
  if (!recovered) return null; // already recovered / released — never recover twice

  await CustomerUnreachableCase.updateOne(
    { _id: recovered.case },
    { $set: { chargeStatus: UNREACHABLE_CHARGE_STATUS.RECOVERED } },
  );
  await Transaction.findOneAndUpdate(
    { reference: `UNR-${recovered.chargeId}` },
    { $set: { status: "Settled" } },
  ).catch(() => {});
  await Transaction.create({
    user: recovered.customer,
    userModel: "User",
    order: recovered.appliedOrder,
    type: "Unreachable Charge",
    amount: -recovered.amount,
    status: "Settled",
    reference: `UNR-REC-${recovered.chargeId}`,
    meta: {
      chargeId: recovered.chargeId,
      originalOrderId: recovered.originalOrderId,
      recoveredOrderId: recovered.appliedOrderId,
      note: "Recovered through next order",
    },
  }).catch((error) => {
    if (error?.code !== 11000) {
      logger.warn("[customerUnreachable] recovery transaction failed", { message: error.message });
    }
  });

  emitNotificationEvent(NOTIFICATION_EVENTS.UNREACHABLE_CHARGE_RECOVERED, {
    orderId: recovered.appliedOrderId,
    customerId: recovered.customer,
    userId: recovered.customer,
    customerMessage: `Your ₹${formatMoney(recovered.amount)} pending Customer Unreachable Charge has been successfully recovered.`,
  });
  return recovered;
}

async function releaseCharge(charge, reason) {
  const now = new Date();
  const released = await UnreachableCharge.findOneAndUpdate(
    { _id: charge._id, status: UNREACHABLE_CHARGE_STATUS.APPLIED },
    {
      $set: { status: UNREACHABLE_CHARGE_STATUS.PENDING },
      $unset: { appliedOrder: 1, appliedOrderId: 1, appliedAt: 1 },
      $push: { history: { action: "RELEASED", at: now, byRole: "system", note: reason } },
    },
    { new: true },
  );
  if (released) {
    await CustomerUnreachableCase.updateOne(
      { _id: released.case },
      { $set: { chargeStatus: UNREACHABLE_CHARGE_STATUS.PENDING } },
    );
  }
  return released;
}

/**
 * Settles APPLIED charges against their carrying order:
 *   delivered -> RECOVERED, cancelled -> back to PENDING.
 * Called lazily (checkout / customer & admin reads) as a safety net on top of
 * the direct delivered-order hook.
 */
export async function reconcileAppliedCharges({ customerId = null } = {}) {
  const filter = { status: UNREACHABLE_CHARGE_STATUS.APPLIED };
  if (customerId) filter.customer = customerId;
  const applied = await UnreachableCharge.find(filter).limit(200);
  if (!applied.length) return;

  const orderIds = [...new Set(applied.map((c) => String(c.appliedOrder)).filter(Boolean))];
  const orders = await Order.find({ _id: { $in: orderIds } })
    .select("orderId status workflowStatus")
    .lean();
  const orderById = new Map(orders.map((o) => [String(o._id), o]));

  for (const charge of applied) {
    const order = orderById.get(String(charge.appliedOrder));
    if (!order) continue;
    if (order.status === "delivered" || order.workflowStatus === WORKFLOW_STATUS.DELIVERED) {
      await recoverCharge(charge, order);
    } else if (order.status === "cancelled" || order.workflowStatus === WORKFLOW_STATUS.CANCELLED) {
      await releaseCharge(charge, `Order ${order.orderId} was cancelled — charge returned to pending`);
    }
  }
}

/** Hook: called right after an order has been settled as delivered. */
export async function recoverChargesForDeliveredOrder(orderDoc) {
  const orderId = orderDoc?._id;
  if (!orderId) return;
  const charges = await UnreachableCharge.find({
    appliedOrder: orderId,
    status: UNREACHABLE_CHARGE_STATUS.APPLIED,
  });
  for (const charge of charges) {
    await recoverCharge(charge, orderDoc);
  }
}

/**
 * Adds the customer's pending unreachable charges to the checkout pricing as a
 * separate line (never hidden in product totals). Mutates the snapshot and
 * returns { amount, chargeIds, charges } or null when nothing is pending.
 */
export async function attachPendingChargesToSnapshot(pricingSnapshot, customerId, { session = null } = {}) {
  if (!customerId || !pricingSnapshot?.sellerBreakdownEntries?.length) return null;

  await reconcileAppliedCharges({ customerId });

  const query = UnreachableCharge.find({
    customer: customerId,
    status: UNREACHABLE_CHARGE_STATUS.PENDING,
  }).sort({ createdAt: 1 });
  if (session) query.session(session);
  const charges = await query.lean();
  if (!charges.length) return null;

  const amount = roundCurrency(charges.reduce((sum, c) => sum + Number(c.amount || 0), 0));
  if (amount <= 0) return null;

  const breakdown = pricingSnapshot.sellerBreakdownEntries[0].breakdown;
  breakdown.unreachableChargeCharged = amount;
  breakdown.grandTotal = roundCurrency(Number(breakdown.grandTotal || 0) + amount);

  const aggregate = pricingSnapshot.aggregateBreakdown;
  if (aggregate) {
    aggregate.unreachableChargeCharged = amount;
    aggregate.grandTotal = roundCurrency(Number(aggregate.grandTotal || 0) + amount);
  }

  return {
    amount,
    chargeIds: charges.map((c) => c._id),
    charges: charges.map(chargeSummary),
  };
}

/** Atomically reserves the charges for a newly placed order (inside its transaction). */
export async function claimChargesForOrder({ chargeIds, order, session }) {
  if (!chargeIds?.length) return;
  const now = new Date();
  const result = await UnreachableCharge.updateMany(
    {
      _id: { $in: chargeIds },
      customer: order.customer,
      status: UNREACHABLE_CHARGE_STATUS.PENDING,
    },
    {
      $set: {
        status: UNREACHABLE_CHARGE_STATUS.APPLIED,
        appliedOrder: order._id,
        appliedOrderId: order.orderId,
        appliedAt: now,
      },
      $push: {
        history: {
          action: "APPLIED",
          at: now,
          byRole: "system",
          note: `Added to order ${order.orderId}`,
        },
      },
    },
    { session },
  );
  if (result.modifiedCount !== chargeIds.length) {
    throw httpError("Your pending charges changed while placing the order. Please try again.", 409);
  }
  await CustomerUnreachableCase.updateMany(
    { charge: { $in: chargeIds } },
    { $set: { chargeStatus: UNREACHABLE_CHARGE_STATUS.APPLIED } },
    { session },
  );
}

export function notifyChargesApplied(order, amount) {
  if (!order?.customer || !(amount > 0)) return;
  emitNotificationEvent(NOTIFICATION_EVENTS.UNREACHABLE_CHARGE_APPLIED, {
    orderId: order.orderId,
    customerId: order.customer,
    userId: order.customer,
    customerMessage: `Your pending ₹${formatMoney(amount)} Customer Unreachable Charge has been added to this order.`,
  });
}

/* ------------------------------------------------------------------ */
/* Customer view                                                       */
/* ------------------------------------------------------------------ */

export async function getCustomerCharges(customerId) {
  await reconcileAppliedCharges({ customerId });

  const charges = await UnreachableCharge.find({ customer: customerId })
    .sort({ createdAt: -1 })
    .populate("originalOrder", "orderId items createdAt pricing paymentBreakdown status")
    .lean();

  const view = charges.map((c) => ({
    _id: c._id,
    chargeId: c.chargeId,
    amount: c.amount,
    reason: c.reason,
    status: c.status === "APPLIED" ? "PENDING_RECOVERY_APPLIED" : c.status,
    rawStatus: c.status,
    originalOrderId: c.originalOrderId,
    originalOrderAmount: c.originalOrderAmount,
    originalOrder: c.originalOrder
      ? {
          orderId: c.originalOrder.orderId,
          createdAt: c.originalOrder.createdAt,
          items: (c.originalOrder.items || []).map((i) => ({
            name: i.name,
            quantity: i.quantity,
            price: i.price,
          })),
        }
      : null,
    appliedOrderId: c.appliedOrderId || null,
    recoveredAt: c.recoveredAt || null,
    createdAt: c.createdAt,
  }));

  const pendingTotal = roundCurrency(
    charges
      .filter((c) => c.status === UNREACHABLE_CHARGE_STATUS.PENDING)
      .reduce((sum, c) => sum + Number(c.amount || 0), 0),
  );

  return { pendingTotal, charges: view };
}

/* ------------------------------------------------------------------ */
/* Admin: charges, waive, earnings                                      */
/* ------------------------------------------------------------------ */

export async function listCharges({ status = "", search = "", page = 1, limit = 20 } = {}) {
  const query = {};
  if (status && Object.values(UNREACHABLE_CHARGE_STATUS).includes(status)) query.status = status;
  if (status === "OUTSTANDING") {
    query.status = { $in: [UNREACHABLE_CHARGE_STATUS.PENDING, UNREACHABLE_CHARGE_STATUS.APPLIED] };
  }
  if (search) {
    const rx = new RegExp(escapeRegex(search.trim()), "i");
    query.$or = [
      { chargeId: rx },
      { customerName: rx },
      { customerPhone: rx },
      { originalOrderId: rx },
      { appliedOrderId: rx },
    ];
  }

  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);

  const [items, total] = await Promise.all([
    UnreachableCharge.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    UnreachableCharge.countDocuments(query),
  ]);

  return {
    items,
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit) || 1,
  };
}

export async function waiveCharge(chargeMongoId, { adminId, reason = "" } = {}) {
  if (!mongoose.Types.ObjectId.isValid(chargeMongoId)) throw httpError("Charge not found", 404);
  const admin = await getAdminActor(adminId);
  const now = new Date();

  const waived = await UnreachableCharge.findOneAndUpdate(
    { _id: chargeMongoId, status: UNREACHABLE_CHARGE_STATUS.PENDING },
    {
      $set: {
        status: UNREACHABLE_CHARGE_STATUS.WAIVED,
        waivedAt: now,
        waivedBy: adminId,
        waivedByName: admin.name,
        waiveReason: String(reason || "").slice(0, 500),
      },
      $push: {
        history: {
          action: "WAIVED",
          at: now,
          by: adminId,
          byName: admin.name,
          byRole: "admin",
          note: String(reason || "").slice(0, 500),
        },
      },
    },
    { new: true },
  );

  if (!waived) {
    const current = await UnreachableCharge.findById(chargeMongoId).select("status").lean();
    if (!current) throw httpError("Charge not found", 404);
    if (current.status === UNREACHABLE_CHARGE_STATUS.APPLIED) {
      throw httpError("This charge is already added to an in-flight order and cannot be waived", 409);
    }
    throw httpError(`Only pending charges can be waived (current status: ${current.status})`, 409);
  }

  await CustomerUnreachableCase.updateOne(
    { _id: waived.case },
    { $set: { chargeStatus: UNREACHABLE_CHARGE_STATUS.WAIVED } },
  );
  await Transaction.findOneAndUpdate(
    { reference: `UNR-${waived.chargeId}` },
    { $set: { status: "Failed", "meta.waived": true } },
  ).catch(() => {});
  await Transaction.create({
    user: waived.customer,
    userModel: "User",
    order: waived.originalOrder,
    type: "Unreachable Charge",
    amount: waived.amount,
    status: "Settled",
    reference: `UNR-WAIVE-${waived.chargeId}`,
    meta: {
      chargeId: waived.chargeId,
      note: "Charge waived by admin",
      reason: waived.waiveReason,
      waivedBy: admin.name,
    },
  }).catch(() => {});

  return waived.toObject();
}

async function sumByStatus(match = {}) {
  const rows = await UnreachableCharge.aggregate([
    { $match: match },
    { $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  const out = {};
  for (const row of rows) out[row._id] = { total: roundCurrency(row.total), count: row.count };
  return out;
}

async function recoveredBetween(range) {
  const match = { status: UNREACHABLE_CHARGE_STATUS.RECOVERED };
  if (range) match.recoveredAt = { $gte: range.start, $lte: range.end };
  const [row] = await UnreachableCharge.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$adminEarning" } } },
  ]);
  return roundCurrency(row?.total || 0);
}

export async function getEarningsSummary() {
  await reconcileAppliedCharges();

  const [byStatus, today, week, month, total] = await Promise.all([
    sumByStatus(),
    recoveredBetween(getSettlementDateRange("today")),
    recoveredBetween(getSettlementDateRange("this_week")),
    recoveredBetween(getSettlementDateRange("this_month")),
    recoveredBetween(null),
  ]);

  const get = (s) => byStatus[s]?.total || 0;
  const pendingRecovery = roundCurrency(
    get(UNREACHABLE_CHARGE_STATUS.PENDING) + get(UNREACHABLE_CHARGE_STATUS.APPLIED),
  );
  const recovered = get(UNREACHABLE_CHARGE_STATUS.RECOVERED);
  const waived = get(UNREACHABLE_CHARGE_STATUS.WAIVED);

  return {
    totalChargesGenerated: roundCurrency(pendingRecovery + recovered + waived + get(UNREACHABLE_CHARGE_STATUS.CANCELLED)),
    pendingRecovery,
    recoveredAmount: recovered,
    waivedAmount: waived,
    todayEarnings: today,
    weeklyEarnings: week,
    monthlyEarnings: month,
    totalEarnings: total,
    counts: {
      pending: (byStatus.PENDING?.count || 0) + (byStatus.APPLIED?.count || 0),
      recovered: byStatus.RECOVERED?.count || 0,
      waived: byStatus.WAIVED?.count || 0,
    },
  };
}
