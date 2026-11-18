import mongoose from "mongoose";
import Order from "../models/order.js";
import Product from "../models/product.js";
import Review from "../models/review.js";
import { orderMatchQueryFlexible } from "../utils/orderLookup.js";
import { buildKey, invalidate } from "./cacheService.js";
import { enqueueProductIndex } from "./searchSyncService.js";

function serviceError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function productIdOf(item) {
  return String(item?.product?._id || item?.product || "").trim();
}

function isDelivered(order) {
  return (
    String(order?.status || "").toLowerCase() === "delivered" ||
    String(order?.workflowStatus || "").toUpperCase() === "DELIVERED"
  );
}

function safeImages(images) {
  return (Array.isArray(images) ? images : [])
    .map((url) => String(url || "").trim())
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, 5);
}

async function findOwnedOrder(customerId, orderIdentifier) {
  const match = orderMatchQueryFlexible(orderIdentifier);
  if (!match) throw serviceError("Order not found", 404, "ORDER_NOT_FOUND");
  const order = await Order.findOne({ $and: [match, { customer: customerId }] })
    .populate("items.product", "name mainImage status approvalStatus sellerId")
    .lean();
  if (!order) throw serviceError("Order not found for this account", 404, "ORDER_NOT_FOUND");
  if (!isDelivered(order)) {
    throw serviceError("Products can be reviewed only after delivery", 409, "ORDER_NOT_DELIVERED");
  }
  return order;
}

function reviewableItems(order) {
  const seen = new Set();
  return (order?.items || []).filter((item) => {
    const id = productIdOf(item);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export async function getOrderReviewEligibility({ customerId, orderIdentifier }) {
  const order = await findOwnedOrder(customerId, orderIdentifier);
  const items = reviewableItems(order);
  const productIds = items.map(productIdOf);
  const existing = await Review.find({ userId: customerId, productId: { $in: productIds } }).lean();
  const byProduct = new Map(existing.map((review) => [String(review.productId), review]));
  const resultItems = items.map((item) => {
    const productId = productIdOf(item);
    const product = item.product || {};
    const review = byProduct.get(productId) || null;
    return {
      productId,
      orderItemId: item._id,
      name: item.name || product.name || "Product",
      image: item.image || product.mainImage || "",
      variantName: item.variantName || "",
      variantSlot: item.variantSlot || "",
      eligible: Boolean(productId && product && String(product.status || "active") === "active"),
      review,
    };
  });
  return {
    orderId: order.orderId,
    deliveredAt: order.deliveredAt || null,
    reviewedCount: resultItems.filter((item) => item.review).length,
    totalReviewable: resultItems.length,
    items: resultItems,
  };
}

export async function submitVerifiedReview({ customerId, orderIdentifier, payload }) {
  const order = await findOwnedOrder(customerId, orderIdentifier);
  const productId = String(payload.productId || "").trim();
  const item = (order.items || []).find((candidate) => productIdOf(candidate) === productId);
  if (!item) throw serviceError("This product is not part of the delivered order", 403, "PRODUCT_NOT_IN_ORDER");
  const product = item.product;
  if (!product || String(product.status || "active") !== "active") {
    throw serviceError("This product is no longer available for review", 409, "PRODUCT_UNAVAILABLE");
  }
  const existing = await Review.findOne({ userId: customerId, productId }).lean();
  if (existing) {
    const error = serviceError("You have already reviewed this product", 409, "REVIEW_ALREADY_EXISTS");
    error.data = { reviewId: existing._id, status: existing.status };
    throw error;
  }
  try {
    return await Review.create({
      userId: customerId,
      productId,
      order: order._id,
      orderId: order.orderId,
      orderItemId: item._id,
      sellerId: order.seller || product.sellerId || null,
      productSnapshot: {
        name: item.name || product.name || "Product",
        image: item.image || product.mainImage || "",
        variantName: item.variantName || "",
        variantSlot: item.variantSlot || "",
      },
      rating: payload.rating,
      comment: String(payload.comment || "").trim(),
      images: safeImages(payload.images),
      verifiedPurchase: true,
      purchasedAt: order.createdAt || null,
      deliveredAt: order.deliveredAt || null,
      status: "pending",
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw serviceError("You have already reviewed this product", 409, "REVIEW_ALREADY_EXISTS");
    }
    throw error;
  }
}

export async function updateOwnReview({ customerId, reviewId, payload }) {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) throw serviceError("Review not found", 404, "REVIEW_NOT_FOUND");
  const review = await Review.findOne({ _id: reviewId, userId: customerId });
  if (!review) throw serviceError("Review not found", 404, "REVIEW_NOT_FOUND");
  const wasApproved = review.status === "approved";
  review.rating = payload.rating;
  review.comment = String(payload.comment || "").trim();
  review.images = safeImages(payload.images);
  review.status = "pending";
  review.moderationNote = "";
  review.moderatedBy = null;
  review.moderatedAt = null;
  review.editedAt = new Date();
  await review.save();
  if (wasApproved) await recomputeProductReviewSummary(review.productId);
  return review;
}

export async function recomputeProductReviewSummary(productId) {
  const objectId = new mongoose.Types.ObjectId(String(productId));
  const rows = await Review.aggregate([
    { $match: { productId: objectId, status: "approved" } },
    { $group: { _id: "$rating", count: { $sum: 1 } } },
  ]);
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let weighted = 0;
  rows.forEach((row) => {
    const rating = Number(row._id);
    const count = Number(row.count || 0);
    if (breakdown[rating] !== undefined) breakdown[rating] = count;
    total += count;
    weighted += rating * count;
  });
  const average = total ? Number((weighted / total).toFixed(2)) : 0;
  await Product.updateOne(
    { _id: objectId },
    { $set: { ratingAverage: average, ratingCount: total, ratingBreakdown: breakdown } },
  );
  await Promise.allSettled([
    invalidate(buildKey("catalog", "product", String(productId))),
    invalidate(buildKey("catalog", "productList", "*")),
    invalidate("cache:offersections:public:*"),
    enqueueProductIndex(String(productId)),
  ]);
  return { average, count: total, breakdown };
}

export async function moderateReview({ reviewId, status, moderationNote, adminId }) {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) throw serviceError("Review not found", 404, "REVIEW_NOT_FOUND");
  const review = await Review.findById(reviewId);
  if (!review) throw serviceError("Review not found", 404, "REVIEW_NOT_FOUND");
  review.status = status;
  review.moderationNote = String(moderationNote || "").trim();
  review.moderatedBy = adminId;
  review.moderatedAt = new Date();
  await review.save();
  const summary = await recomputeProductReviewSummary(review.productId);
  return { review, summary };
}

export function toPublicReview(review) {
  const rawName = String(review?.userId?.name || "Anonymous").trim();
  const parts = rawName.split(/\s+/).filter(Boolean);
  const displayName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : (parts[0] || "Anonymous");
  return { ...review, userId: { name: displayName }, verifiedPurchase: review.verifiedPurchase === true };
}
