import mongoose from "mongoose";
import Admin from "../models/admin.js";
import Review from "../models/review.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import {
  getOrderReviewEligibility,
  moderateReview,
  submitVerifiedReview,
  toPublicReview,
  updateOwnReview,
} from "../services/reviewService.js";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";

function respondError(res, error) {
  return handleResponse(res, error.statusCode || 500, error.message || "Unable to process review", {
    code: error.code || "REVIEW_ERROR",
    ...(error.data || {}),
  });
}

async function notifyAdminsOfReview(review) {
  try {
    const admins = await Admin.find({ isActive: { $ne: false } }).select("_id").lean();
    emitNotificationEvent(NOTIFICATION_EVENTS.REVIEW_SUBMITTED, {
      adminIds: admins.map((admin) => admin._id),
      reviewId: review._id,
      productName: review.productSnapshot?.name,
      rating: review.rating,
      comment: review.comment,
    });
  } catch {
    // Notification delivery must never make an otherwise valid review fail.
  }
}

export const submitReview = async (req, res) => {
  try {
    const review = await submitVerifiedReview({ customerId: req.user.id, orderIdentifier: req.body.orderId, payload: req.body });
    await notifyAdminsOfReview(review);
    return handleResponse(res, 201, "Review submitted and pending approval", review);
  } catch (error) { return respondError(res, error); }
};

export const updateMyReview = async (req, res) => {
  try {
    const review = await updateOwnReview({ customerId: req.user.id, reviewId: req.params.id, payload: req.body });
    return handleResponse(res, 200, "Review updated and returned to moderation", review);
  } catch (error) { return respondError(res, error); }
};

export const getReviewEligibility = async (req, res) => {
  try {
    const result = await getOrderReviewEligibility({ customerId: req.user.id, orderIdentifier: req.params.orderId });
    return handleResponse(res, 200, "Review eligibility fetched successfully", result);
  } catch (error) { return respondError(res, error); }
};

export const getMyReviews = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, { defaultLimit: 20, maxLimit: 100 });
    const query = { userId: req.user.id };
    const [items, total] = await Promise.all([
      Review.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.countDocuments(query),
    ]);
    return handleResponse(res, 200, "Reviews fetched successfully", { items, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (error) { return respondError(res, error); }
};

export const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) return handleResponse(res, 400, "Invalid product id");
    const { page, limit, skip } = getPagination(req, { defaultLimit: 20, maxLimit: 100 });
    const query = { productId, status: "approved" };
    const requestedRating = Number(req.query.rating);
    if (Number.isInteger(requestedRating) && requestedRating >= 1 && requestedRating <= 5) query.rating = requestedRating;
    const sort = req.query.sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };
    const [reviews, total, ratingRows] = await Promise.all([
      Review.find(query).populate("userId", "name").sort(sort).skip(skip).limit(limit).lean(),
      Review.countDocuments(query),
      Review.aggregate([
        { $match: { productId: new mongoose.Types.ObjectId(productId), status: "approved" } },
        { $group: { _id: "$rating", count: { $sum: 1 } } },
      ]),
    ]);
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let ratingCount = 0;
    let weightedTotal = 0;
    ratingRows.forEach((row) => {
      const rating = Number(row._id);
      const count = Number(row.count || 0);
      if (breakdown[rating] !== undefined) breakdown[rating] = count;
      ratingCount += count;
      weightedTotal += rating * count;
    });
    return handleResponse(res, 200, "Reviews fetched successfully", {
      summary: {
        average: ratingCount ? Number((weightedTotal / ratingCount).toFixed(2)) : 0,
        count: ratingCount,
        breakdown,
      },
      items: reviews.map(toPublicReview), page, limit, total, totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) { return respondError(res, error); }
};

export const getPendingReviews = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, { defaultLimit: 25, maxLimit: 200 });
    const allowedStatuses = new Set(["pending", "approved", "rejected"]);
    const status = String(req.query.status || "all").toLowerCase();
    const query = allowedStatuses.has(status) ? { status } : {};
    const [items, total] = await Promise.all([
      Review.find(query).populate("userId", "name email").populate("productId", "name mainImage sellerId").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.countDocuments(query),
    ]);
    return handleResponse(res, 200, "Reviews fetched successfully", { items, page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  } catch (error) { return respondError(res, error); }
};

export const updateReviewStatus = async (req, res) => {
  try {
    const result = await moderateReview({ reviewId: req.params.id, status: req.body.status, moderationNote: req.body.moderationNote, adminId: req.user.id });
    emitNotificationEvent(NOTIFICATION_EVENTS.REVIEW_MODERATED, {
      userId: result.review.userId,
      reviewId: result.review._id,
      status: result.review.status,
      moderationNote: result.review.moderationNote,
    });
    return handleResponse(res, 200, `Review ${req.body.status} successfully`, result);
  } catch (error) { return respondError(res, error); }
};
