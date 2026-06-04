import QRPaperBag from "../../models/qrPaperBag.js";
import QRPaperBagRequest from "../../models/qrPaperBagRequest.js";
import Order from "../../models/order.js";
import { emitOrderStatusUpdate } from "../../services/orderSocketEmitter.js";

// Request Bags
export const requestBags = async (req, res) => {
  try {
    const { quantity, size, priority, remarks } = req.body;
    
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ success: false, message: "Invalid quantity" });
    }

    const request = new QRPaperBagRequest({
      sellerId: req.user.id,
      quantity,
      size: size || "medium",
      priority: priority || "MEDIUM",
      requestNotes: remarks || "",
      status: "pending"
    });

    await request.save();

    res.status(201).json({
      success: true,
      message: "Bag request submitted successfully",
      data: request
    });
  } catch (error) {
    console.error("Request bags error:", error);
    res.status(500).json({ success: false, message: "Failed to submit request" });
  }
};

// Get requests
export const getBagRequests = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const requests = await QRPaperBagRequest.find({ sellerId: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await QRPaperBagRequest.countDocuments({ sellerId: req.user.id });

    res.status(200).json({
      success: true,
      data: requests,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get bag requests error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch requests" });
  }
};

// Get pending request count
export const getPendingRequestsCount = async (req, res) => {
  try {
    const count = await QRPaperBagRequest.countDocuments({ sellerId: req.user.id, status: "pending" });
    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    console.error("Get pending count error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch pending count" });
  }
};

// Get assigned bags
export const getMyBags = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const query = { assignedSellerId: req.user.id };
    if (status) query.status = status;
    if (search) {
      query.bagId = { $regex: search, $options: "i" };
    }

    const bags = await QRPaperBag.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await QRPaperBag.countDocuments(query);

    res.status(200).json({
      success: true,
      data: bags,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get my bags error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch bags" });
  }
};

// Validate a bag
export const validateBag = async (req, res) => {
  try {
    const { bagId } = req.params;

    const bag = await QRPaperBag.findOne({ bagId, assignedSellerId: req.user.id });
    
    if (!bag) {
      return res.status(404).json({ success: false, message: "Bag not found or not assigned to you" });
    }

    if (bag.status !== "assigned") {
      return res.status(400).json({ success: false, message: `Bag is currently in ${bag.status} state` });
    }

    res.status(200).json({ success: true, data: bag });
  } catch (error) {
    console.error("Validate bag error:", error);
    res.status(500).json({ success: false, message: "Failed to validate bag" });
  }
};

// Attach or Replace bag for order
export const attachBag = async (req, res) => {
  try {
    const { bagId, orderId } = req.body;

    if (!bagId || !orderId) {
      return res.status(400).json({ success: false, message: "Bag ID and Order ID are required" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.seller.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: "Order does not belong to you" });
    }
    
    // Check if order already has a bag. If so, replace it (if allowed).
    const existingBag = await QRPaperBag.findOne({ currentOrderId: orderId, status: "packed" });
    if (existingBag) {
        if (existingBag.bagId === bagId) {
             return res.status(400).json({ success: false, message: "This bag is already attached to this order" });
        }
        // Only allow replacement if order is not picked up or delivered
        const invalidStatuses = ['out_for_delivery', 'delivered', 'cancelled'];
        if (invalidStatuses.includes(order.status)) {
             return res.status(400).json({ success: false, message: `Cannot change bag when order is ${order.status}` });
        }
        
        // Detach old bag
        existingBag.status = "assigned";
        existingBag.currentOrderId = null;
        existingBag.timeline.push({
            status: "assigned",
            actorModel: "Seller",
            actorId: req.user.id,
            notes: `Detached from order ${orderId} (Replaced)`
        });
        await existingBag.save();
    }

    const bag = await QRPaperBag.findOne({ bagId });
    if (!bag) {
      return res.status(404).json({ success: false, message: "Bag not found" });
    }
    
    if (bag.assignedSellerId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ success: false, message: "Invalid Bag: Belongs to another seller" });
    }

    if (bag.status !== "assigned") {
      return res.status(400).json({ success: false, message: `Bag Already Used or Lost (Status: ${bag.status})` });
    }

    bag.status = "packed";
    bag.currentOrderId = orderId;
    bag.usedAt = new Date();
    bag.timeline.push({
      status: "packed",
      actorModel: "Seller",
      actorId: req.user.id,
      notes: `Packed for order ${orderId}`
    });

    await bag.save();

    // Update order status if it's currently pending or confirmed
    if (['pending', 'confirmed'].includes(order.status)) {
        order.status = "packed";
        await order.save();
    }

    // Emit live tracking event
    emitOrderStatusUpdate(orderId, {
      status: "packed",
      workflowStatus: "PACKED"
    }, order.customer);

    res.status(200).json({ success: true, message: existingBag ? "Bag replaced successfully" : "Bag attached successfully", data: bag });
  } catch (error) {
    console.error("Attach bag error:", error);
    res.status(500).json({ success: false, message: "Failed to attach bag" });
  }
};

// Detach bag
export const detachBag = async (req, res) => {
  try {
    const { bagId } = req.params;

    const bag = await QRPaperBag.findOne({ bagId, assignedSellerId: req.user.id, status: "packed" });
    if (!bag) {
      return res.status(404).json({ success: false, message: "Bag not found or not in packed state" });
    }

    const orderId = bag.currentOrderId;

    bag.status = "assigned";
    bag.currentOrderId = null;
    bag.timeline.push({
      status: "assigned",
      actorModel: "Seller",
      actorId: req.user.id,
      notes: "Detached from order"
    });

    await bag.save();

    res.status(200).json({ success: true, message: "Bag detached successfully" });
  } catch (error) {
    console.error("Detach bag error:", error);
    res.status(500).json({ success: false, message: "Failed to detach bag" });
  }
};

// Get Label Data
export const getLabelData = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ _id: orderId, seller: req.user.id })
      .populate("address")
      .populate("customer", "name phone");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const bag = await QRPaperBag.findOne({ currentOrderId: orderId });

    res.status(200).json({
      success: true,
      data: {
        orderId: order._id,
        customerName: order.address?.name || order.customer?.name,
        customerPhone: order.address?.phone || order.customer?.phone,
        address: order.address,
        bagId: bag ? bag.bagId : null,
        itemsCount: order.items?.length || 0,
        total: order.pricing?.total
      }
    });
  } catch (error) {
    console.error("Get label data error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch label data" });
  }
};
