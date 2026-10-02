import mongoose from "mongoose";
import Order from "../../models/order.js";
import Seller from "../../models/seller.js";
import Delivery from "../../models/delivery.js";
import OrderEvidence, {
  EVIDENCE_STAGE,
  EVIDENCE_CONDITION,
} from "../../models/orderEvidence.js";
import { orderMatchQueryFromRouteParam } from "../../utils/orderLookup.js";
import { WORKFLOW_STATUS } from "../../constants/orderWorkflow.js";

const MAX_IMAGES_PER_UPLOAD = 8;
const MAX_IMAGES_PER_STAGE = 15;

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/** Evidence is mandatory unless EVIDENCE_REQUIRED=false. Optional rollout date for in-flight orders. */
export function isEvidenceRequired(order) {
  if (String(process.env.EVIDENCE_REQUIRED || "true").toLowerCase() === "false") return false;
  const from = process.env.EVIDENCE_ENFORCE_FROM ? new Date(process.env.EVIDENCE_ENFORCE_FROM) : null;
  if (from && !Number.isNaN(from.getTime()) && order?.createdAt && new Date(order.createdAt) < from) {
    return false;
  }
  return true;
}

async function findOrder(routeOrderId) {
  const key = orderMatchQueryFromRouteParam(routeOrderId);
  if (!key) throw httpError("Order not found", 404);
  const order = await Order.findOne(key);
  if (!order) throw httpError("Order not found", 404);
  return order;
}

export function stageForRole(role) {
  if (role === "seller") return EVIDENCE_STAGE.SELLER_DISPATCH;
  if (role === "delivery") return EVIDENCE_STAGE.RIDER_PICKUP;
  return null;
}

/** Throws a 400 when the mandatory photo proof for `stage` has not been uploaded yet. */
export async function assertEvidenceUploaded(order, stage) {
  if (!isEvidenceRequired(order)) return;
  const doc = await OrderEvidence.findOne({ order: order._id, stage }).select("images").lean();
  if (doc?.images?.length > 0) return;
  throw httpError(
    stage === EVIDENCE_STAGE.SELLER_DISPATCH
      ? "Please upload product condition photos before packing this order."
      : "Please upload product condition photos (as received from the seller) before confirming pickup.",
    400,
  );
}

export async function getEvidenceStatus(order) {
  const docs = await OrderEvidence.find({ order: order._id }).select("stage images").lean();
  const has = (stage) => docs.some((d) => d.stage === stage && d.images?.length > 0);
  return {
    required: isEvidenceRequired(order),
    sellerDispatch: has(EVIDENCE_STAGE.SELLER_DISPATCH),
    riderPickup: has(EVIDENCE_STAGE.RIDER_PICKUP),
  };
}

function sanitizeImages(rawImages, order) {
  if (!Array.isArray(rawImages) || rawImages.length === 0) {
    throw httpError("At least one image is required", 400);
  }
  if (rawImages.length > MAX_IMAGES_PER_UPLOAD) {
    throw httpError(`You can upload up to ${MAX_IMAGES_PER_UPLOAD} images at a time`, 400);
  }

  const productById = new Map(
    (order.items || []).map((item) => [String(item.product), item.name || ""]),
  );

  return rawImages.map((entry) => {
    const url = String(typeof entry === "string" ? entry : entry?.url || "").trim();
    if (!/^https:\/\//i.test(url)) throw httpError("Invalid image URL", 400);
    const out = { url, uploadedAt: new Date() };
    const productId = typeof entry === "object" ? String(entry?.productId || "") : "";
    if (productId && productById.has(productId)) {
      out.product = new mongoose.Types.ObjectId(productId);
      out.productName = productById.get(productId);
    }
    return out;
  });
}

/**
 * Seller / delivery partner uploads photos of the product condition.
 * Stage is derived from the caller's role — it can never be chosen by the client.
 */
export async function addEvidence({ actor, routeOrderId, images, condition, note }) {
  const stage = stageForRole(actor.role);
  if (!stage) throw httpError("Only sellers and delivery partners can upload order evidence", 403);

  const order = await findOrder(routeOrderId);

  if (stage === EVIDENCE_STAGE.SELLER_DISPATCH) {
    if (String(order.seller) !== String(actor.id)) throw httpError("This order does not belong to you", 403);
    if (!["pending", "confirmed", "packed"].includes(order.status)) {
      throw httpError(`Photos can't be added when the order is ${order.status}`, 409);
    }
  } else {
    if (String(order.deliveryBoy) !== String(actor.id)) {
      throw httpError("This order is not assigned to you", 403);
    }
    const pickupWindow = [WORKFLOW_STATUS.DELIVERY_ASSIGNED, WORKFLOW_STATUS.PICKUP_READY];
    const before =
      order.workflowVersion >= 2 ? pickupWindow.includes(order.workflowStatus) : order.status === "packed";
    if (!before) throw httpError("Pickup photos can only be added before the order is picked up", 409);
  }

  const cleanImages = sanitizeImages(images, order);
  const safeCondition = Object.values(EVIDENCE_CONDITION).includes(condition)
    ? condition
    : EVIDENCE_CONDITION.GOOD;
  const safeNote = String(note || "").trim().slice(0, 500);

  const existing = await OrderEvidence.findOne({ order: order._id, stage }).select("images").lean();
  if ((existing?.images?.length || 0) + cleanImages.length > MAX_IMAGES_PER_STAGE) {
    throw httpError(`A maximum of ${MAX_IMAGES_PER_STAGE} photos are allowed per stage`, 400);
  }

  let uploaderName = "";
  if (stage === EVIDENCE_STAGE.SELLER_DISPATCH) {
    const seller = await Seller.findById(actor.id).select("shopName name").lean();
    uploaderName = seller?.shopName || seller?.name || "";
  } else {
    const rider = await Delivery.findById(actor.id).select("name").lean();
    uploaderName = rider?.name || "";
  }

  const now = new Date();
  const doc = await OrderEvidence.findOneAndUpdate(
    { order: order._id, stage },
    {
      $push: { images: { $each: cleanImages } },
      $set: {
        condition: safeCondition,
        ...(safeNote ? { note: safeNote } : {}),
        lastUploadedAt: now,
      },
      $setOnInsert: {
        orderId: order.orderId,
        uploadedBy: actor.id,
        uploadedByModel: stage === EVIDENCE_STAGE.SELLER_DISPATCH ? "Seller" : "Delivery",
        uploadedByName: uploaderName,
        firstUploadedAt: now,
      },
    },
    { upsert: true, new: true },
  ).lean();

  return doc;
}

/** Evidence visible to the owning seller / assigned rider / admin. */
export async function getEvidenceForActor({ actor, routeOrderId }) {
  const order = await findOrder(routeOrderId);

  const isOwnerSeller = actor.role === "seller" && String(order.seller) === String(actor.id);
  const isRider = actor.role === "delivery" && String(order.deliveryBoy) === String(actor.id);
  if (actor.role !== "admin" && !isOwnerSeller && !isRider) {
    throw httpError("Access denied", 403);
  }

  const docs = await OrderEvidence.find({ order: order._id }).sort({ createdAt: 1 }).lean();
  const status = await getEvidenceStatus(order);
  return { orderId: order.orderId, status, evidence: docs };
}
