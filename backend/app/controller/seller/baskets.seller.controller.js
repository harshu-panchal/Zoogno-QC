import BasketRequest from "../../models/basketRequest.js";
import Basket from "../../models/basket.js";
import Order from "../../models/order.js";
import { emitOrderStatusUpdate } from "../../services/orderSocketEmitter.js";
import { emitNotificationEvent } from "../../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../../modules/notifications/notification.constants.js";

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

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATE BASKET
// GET /seller/baskets/:basketId/validate
// ═══════════════════════════════════════════════════════════════════════════════
export const validateBasket = async (req, res) => {
  try {
    const { basketId } = req.params;

    const basket = await Basket.findOne({ basketId, assignedSellerId: req.user.id });
    
    if (!basket) {
      return res.status(404).json({ success: false, message: "Basket not found or not assigned to you" });
    }

    if (basket.status !== "ASSIGNED" && basket.status !== "AVAILABLE") {
      return res.status(400).json({ success: false, message: `Basket is currently in ${basket.status} state` });
    }

    res.status(200).json({ success: true, data: basket });
  } catch (error) {
    console.error("Validate basket error:", error);
    res.status(500).json({ success: false, message: "Failed to validate basket" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ATTACH / REPLACE BASKET FOR ORDER
// POST /seller/baskets/attach
// ═══════════════════════════════════════════════════════════════════════════════
export const attachBasket = async (req, res) => {
  try {
    const { basketId, orderId } = req.body;

    if (!basketId || !orderId) {
      return res.status(400).json({ success: false, message: "Basket ID and Order ID are required" });
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(orderId);
    const order = await Order.findOne(isObjectId ? { _id: orderId } : { orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.seller?.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: "Order does not belong to you" });
    }
    
    // Check if order already has a basket
    const existingBasket = await Basket.findOne({ currentOrderId: order._id, status: { $in: ["PACKED", "IN_USE"] } });
    if (existingBasket) {
        if (existingBasket.basketId === basketId) {
             return res.status(400).json({ success: false, message: "This basket is already attached to this order" });
        }
        const invalidStatuses = ['out_for_delivery', 'delivered', 'cancelled'];
        if (invalidStatuses.includes(order.status)) {
             return res.status(400).json({ success: false, message: `Cannot change basket when order is ${order.status}` });
        }
        
        // Detach old basket
        existingBasket.status = "ASSIGNED";
        existingBasket.currentOrderId = null;
        existingBasket.timeline.push({
            status: "ASSIGNED",
            actorModel: "Seller",
            actorId: req.user.id,
            notes: `Detached from order ${orderId} (Replaced)`
        });
        await existingBasket.save();
    }

    const basket = await Basket.findOne({ basketId });
    if (!basket) {
      return res.status(404).json({ success: false, message: "Basket not found" });
    }
    
    if (basket.assignedSellerId?.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: "Invalid Basket: Belongs to another seller" });
    }

    const allowedStatuses = ["ASSIGNED", "AVAILABLE", "DELIVERED", "RETURNED"];
    if (!allowedStatuses.includes(basket.status)) {
      return res.status(400).json({ success: false, message: `Basket cannot be attached (Status: ${basket.status})` });
    }

    basket.status = "PACKED";
    basket.currentOrderId = order._id;
    basket.usedAt = new Date();
    basket.reuseCount = (basket.reuseCount || 0) + 1;
    if (!basket.usageHistory) basket.usageHistory = [];
    basket.usageHistory.push({ orderId: order._id, usedAt: new Date() });
    
    basket.timeline.push({
      status: "PACKED",
      actorModel: "Seller",
      actorId: req.user.id,
      notes: `Packed for order ${orderId} (Reuse #${basket.reuseCount})`
    });

    await basket.save();

    if (['pending', 'confirmed'].includes(order.status)) {
        order.status = "packed";
        order.orderStatus = "packed";
        if (order.workflowVersion < 2 && order.deliveryBoy) {
            order.deliveryRiderStep = 2;
        }
        await order.save();

        emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_PACKED, {
          orderId: order.orderId,
          customerId: order.customer,
          userId: order.customer,
          sellerId: order.seller,
          deliveryId: order.deliveryBoy,
        });

        if (order.deliveryBoy) {
          emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_READY, {
            orderId: order.orderId,
            deliveryId: order.deliveryBoy,
            sellerId: order.seller,
          });
        }
    }

    emitOrderStatusUpdate(orderId, {
      status: "packed",
      workflowStatus: "PACKED"
    }, order.customer);

    res.status(200).json({ success: true, message: existingBasket ? "Basket replaced successfully" : "Basket attached successfully", data: basket });
  } catch (error) {
    console.error("Attach basket error:", error);
    res.status(500).json({ success: false, message: "Failed to attach basket" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// DETACH BASKET
// POST /seller/baskets/:basketId/detach
// ═══════════════════════════════════════════════════════════════════════════════
export const detachBasket = async (req, res) => {
  try {
    const { basketId } = req.params;

    const basket = await Basket.findOne({ basketId, assignedSellerId: req.user.id, status: { $in: ["PACKED", "IN_USE"] } });
    if (!basket) {
      return res.status(404).json({ success: false, message: "Basket not found or not in packed state" });
    }

    basket.status = "ASSIGNED";
    basket.currentOrderId = null;
    basket.timeline.push({
      status: "ASSIGNED",
      actorModel: "Seller",
      actorId: req.user.id,
      notes: "Detached from order"
    });

    await basket.save();

    res.status(200).json({ success: true, message: "Basket detached successfully" });
  } catch (error) {
    console.error("Detach basket error:", error);
    res.status(500).json({ success: false, message: "Failed to detach basket" });
  }
};

