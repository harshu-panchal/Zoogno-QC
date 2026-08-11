import DeliveryRating from "../models/deliveryRating.js";
import Delivery from "../models/delivery.js";
import Order from "../models/order.js";
import handleResponse from "../utils/helper.js";
import { orderMatchQueryFromRouteParam } from "../utils/orderLookup.js";
import mongoose from "mongoose";

/* ===============================
   SUBMIT DELIVERY RATING (Customer)
================================ */
export const submitDeliveryRating = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { orderId, rating, review } = req.body;

    if (!orderId) {
      return handleResponse(res, 400, "orderId is required");
    }
    if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return handleResponse(res, 400, "Rating must be an integer between 1 and 5");
    }

    // Find order
    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }

    const order = await Order.findOne({ ...orderKey, customer: customerId });
    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    // Check order is delivered
    if (order.status !== "delivered") {
      return handleResponse(res, 400, "You can rate delivery partner only after delivery");
    }

    // Check delivery boy exists
    const deliveryBoyId = order.deliveryBoy;
    if (!deliveryBoyId) {
      return handleResponse(res, 400, "No delivery partner assigned to this order");
    }

    // Check already rated
    const existingRating = await DeliveryRating.findOne({
      customer: customerId,
      order: order._id,
    });
    if (existingRating) {
      return handleResponse(res, 400, "You have already rated this delivery");
    }

    // Save rating
    const newRating = await DeliveryRating.create({
      customer: customerId,
      deliveryBoy: deliveryBoyId,
      order: order._id,
      orderId: order.orderId,
      rating,
      review: review ? String(review).trim().slice(0, 1000) : undefined,
    });

    // Update delivery boy average rating
    const deliveryBoy = await Delivery.findById(deliveryBoyId);
    if (deliveryBoy) {
      const oldTotal = deliveryBoy.averageRating * deliveryBoy.totalRatings;
      const newTotal = oldTotal + rating;
      const newCount = deliveryBoy.totalRatings + 1;
      deliveryBoy.averageRating = Number((newTotal / newCount).toFixed(2));
      deliveryBoy.totalRatings = newCount;
      await deliveryBoy.save();
    }

    return handleResponse(res, 201, "Rating submitted successfully", {
      rating: newRating,
      averageRating: deliveryBoy?.averageRating,
      totalRatings: deliveryBoy?.totalRatings,
    });
  } catch (error) {
    if (error.code === 11000) {
      return handleResponse(res, 400, "You have already rated this delivery");
    }
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET MY RATING (Delivery Boy)
================================ */
export const getMyRating = async (req, res) => {
  try {
    const deliveryId = req.user.id;

    const deliveryBoy = await Delivery.findById(deliveryId)
      .select("averageRating totalRatings")
      .lean();

    if (!deliveryBoy) {
      return handleResponse(res, 404, "Delivery partner not found");
    }

    // Star distribution
    const distribution = await DeliveryRating.aggregate([
      {
        $match: {
          deliveryBoy: new mongoose.Types.ObjectId(deliveryId),
        },
      },
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    const starCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    distribution.forEach((d) => {
      starCounts[d._id] = d.count;
    });

    return handleResponse(res, 200, "Rating fetched", {
      averageRating: deliveryBoy.averageRating,
      totalRatings: deliveryBoy.totalRatings,
      starDistribution: starCounts,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET DELIVERY BOY RATINGS (Admin/Delivery)
================================ */
export const getDeliveryBoyRatings = async (req, res) => {
  try {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const deliveryBoy = await Delivery.findById(id)
      .select("name averageRating totalRatings")
      .lean();

    if (!deliveryBoy) {
      return handleResponse(res, 404, "Delivery partner not found");
    }

    const [reviews, total] = await Promise.all([
      DeliveryRating.find({ deliveryBoy: id })
        .populate("customer", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DeliveryRating.countDocuments({ deliveryBoy: id }),
    ]);

    // Mask customer names for privacy
    const maskedReviews = reviews.map((r) => {
      const name = r.customer?.name || "Customer";
      const masked = name.charAt(0) + "****";
      return {
        _id: r._id,
        rating: r.rating,
        review: r.review,
        customerName: masked,
        orderId: r.orderId,
        createdAt: r.createdAt,
      };
    });

    return handleResponse(res, 200, "Reviews fetched", {
      deliveryBoy: {
        name: deliveryBoy.name,
        averageRating: deliveryBoy.averageRating,
        totalRatings: deliveryBoy.totalRatings,
      },
      reviews: maskedReviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET ORDER DELIVERY RATING (Customer)
================================ */
export const getOrderDeliveryRating = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { orderId } = req.params;

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      return handleResponse(res, 200, "No rating found", { rating: null });
    }

    const order = await Order.findOne({ ...orderKey, customer: customerId })
      .select("_id")
      .lean();

    if (!order) {
      return handleResponse(res, 200, "No rating found", { rating: null });
    }

    const existing = await DeliveryRating.findOne({
      customer: customerId,
      order: order._id,
    }).lean();

    return handleResponse(
      res,
      200,
      existing ? "Rating found" : "No rating found",
      { rating: existing || null }
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
