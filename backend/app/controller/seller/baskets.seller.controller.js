import BasketRequest from "../../models/basketRequest.js";
import Basket from "../../models/basket.js";

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE BASKET REQUEST
// POST /seller/baskets/requests
// ═══════════════════════════════════════════════════════════════════════════════
export const createBasketRequest = async (req, res) => {
  try {
    const { quantity, size, notes } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: "Valid quantity is required" });
    }

    const newRequest = await BasketRequest.create({
      sellerId: req.user.id,
      quantity,
      size: size || "MEDIUM",
      requestNotes: notes,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Basket request submitted successfully",
      data: newRequest,
    });
  } catch (error) {
    console.error("Create basket request error:", error);
    res.status(500).json({ success: false, message: "Failed to submit basket request" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET BASKET REQUESTS
// GET /seller/baskets/requests
// ═══════════════════════════════════════════════════════════════════════════════
export const getBasketRequests = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const requests = await BasketRequest.find({ sellerId: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await BasketRequest.countDocuments({ sellerId: req.user.id });

    res.status(200).json({
      success: true,
      data: requests,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get basket requests error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch basket requests" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET PENDING REQUEST COUNT
// GET /seller/baskets/requests/pending-count
// ═══════════════════════════════════════════════════════════════════════════════
export const getPendingBasketRequestCount = async (req, res) => {
  try {
    const count = await BasketRequest.countDocuments({
      sellerId: req.user.id,
      status: "pending",
    });

    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    console.error("Get pending basket request count error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch pending count" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET INVENTORY
// GET /seller/baskets
// ═══════════════════════════════════════════════════════════════════════════════
export const getBasketInventory = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    
    const query = { assignedSellerId: req.user.id };
    if (status) {
      if (status === 'AVAILABLE') {
        query.status = { $in: ['ASSIGNED', 'AVAILABLE'] };
      } else {
        query.status = status;
      }
    }

    const baskets = await Basket.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Basket.countDocuments(query);

    res.status(200).json({
      success: true,
      data: baskets,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get basket inventory error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch basket inventory" });
  }
};
