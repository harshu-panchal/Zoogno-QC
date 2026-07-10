import QRPaperBag from "../../models/qrPaperBag.js";
import QRPaperBagRequest from "../../models/qrPaperBagRequest.js";
import Seller from "../../models/seller.js";

// Generate new bags
export const generateBags = async (req, res) => {
  try {
    const { quantity, size, notes, bagIds } = req.body;
    
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ success: false, message: "Invalid quantity" });
    }

    const newBags = [];
    const timestamp = Date.now();

    for (let i = 0; i < quantity; i++) {
      const bagId = (bagIds && bagIds[i]) ? bagIds[i] : `PB-${timestamp}-${i}-${Math.floor(Math.random() * 1000)}`;
      const qrCodeData = `${process.env.FRONTEND_URL || "http://localhost:5173"}/verify-bag/${bagId}`;
      
      newBags.push({
        bagId,
        qrCodeData,
        size: size || "medium",
        status: "generated",
        notes,
        timeline: [{
          status: "generated",
          actorModel: "Admin",
          actorId: req.user._id,
          notes: "Bag generated"
        }]
      });
    }

    await QRPaperBag.insertMany(newBags);

    res.status(201).json({
      success: true,
      message: `Successfully generated ${quantity} bags`,
      data: { count: quantity }
    });
  } catch (error) {
    console.error("Generate bags error:", error);
    res.status(500).json({ success: false, message: "Failed to generate bags" });
  }
};

// Get inventory
export const getInventory = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    const query = {};
    if (status) {
        const lowerStatus = status.toLowerCase();
        if (lowerStatus === 'available') {
            query.status = 'generated';
        } else if (lowerStatus === 'in_use') {
            query.status = { $in: ['packed', 'in_transit'] };
        } else {
            query.status = lowerStatus;
        }
    }
    
    if (search) {
        query.$or = [
            { bagId: new RegExp(search, 'i') },
        ];
        // If search can be orderId, we would need to join or we can just try matching bagId
    }

    const bags = await QRPaperBag.find(query)
      .populate("assignedSellerId", "name shopName phone")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await QRPaperBag.countDocuments(query);

    res.status(200).json({
      success: true,
      result: {
        items: bags.map(bag => ({
            ...bag.toObject(),
            // Ensure seller has a 'name' property for the frontend
            seller: bag.assignedSellerId ? {
                ...bag.assignedSellerId.toObject(),
                name: bag.assignedSellerId.shopName || bag.assignedSellerId.name || 'Unknown Seller'
            } : null,
            status: bag.status.toUpperCase() // Map to uppercase for frontend UI
        })),
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get inventory error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch inventory" });
  }
};

// Get single bag details
export const getBagDetails = async (req, res) => {
  try {
    const { bagId } = req.params;
    const bag = await QRPaperBag.findOne({ bagId })
      .populate("assignedSellerId", "shopName name phone email")
      .populate("currentOrderId");

    if (!bag) {
      return res.status(404).json({ success: false, message: "Bag not found" });
    }

    res.status(200).json({ success: true, data: bag });
  } catch (error) {
    console.error("Get bag details error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch bag details" });
  }
};

// Get single bag timeline
export const getBagTimeline = async (req, res) => {
  try {
    const { bagId } = req.params;
    const bag = await QRPaperBag.findOne({ bagId }).select("timeline");

    if (!bag) {
      return res.status(404).json({ success: false, message: "Bag not found" });
    }

    res.status(200).json({ success: true, data: bag.timeline });
  } catch (error) {
    console.error("Get bag timeline error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch bag timeline" });
  }
};

// Assign bags to seller
export const assignBagsToSeller = async (req, res) => {
  try {
    const { sellerId, bagIds } = req.body;

    if (!sellerId || !bagIds || !bagIds.length) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }

    const result = await QRPaperBag.updateMany(
      { bagId: { $in: bagIds }, status: "generated" },
      {
        $set: {
          status: "assigned",
          assignedSellerId: sellerId,
          assignedAt: new Date()
        },
        $push: {
          timeline: {
            status: "assigned",
            actorModel: "Admin",
            actorId: req.user._id,
            notes: `Assigned to ${seller.shopName}`
          }
        }
      }
    );

    res.status(200).json({
      success: true,
      message: `Assigned ${result.modifiedCount} bags to seller`,
      data: { assignedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error("Assign bags error:", error);
    res.status(500).json({ success: false, message: "Failed to assign bags" });
  }
};

// Get Seller Bags
export const getSellerBags = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const bags = await QRPaperBag.find({ assignedSellerId: sellerId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await QRPaperBag.countDocuments({ assignedSellerId: sellerId });

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
    console.error("Get seller bags error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch seller bags" });
  }
};

// Get Sellers with Available Bags Count
export const getSellersWithBagCount = async (req, res) => {
  try {
    const sellers = await Seller.find({})
      .select("_id name shopName")
      .sort({ shopName: 1 })
      .lean();

    const bagCounts = await QRPaperBag.aggregate([
      { $match: { status: "assigned" } },
      { $group: { _id: "$assignedSellerId", count: { $sum: 1 } } }
    ]);

    const countMap = new Map(bagCounts.map(b => [b._id.toString(), b.count]));

    const resultItems = sellers.map(seller => ({
      _id: seller._id,
      name: seller.name || seller.shopName || "Unknown",
      shopName: seller.shopName || "",
      bagsAvailable: countMap.get(seller._id.toString()) || 0
    }));

    res.status(200).json({
      success: true,
      result: {
        items: resultItems
      }
    });
  } catch (error) {
    console.error("Get sellers with bag count error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch sellers" });
  }
};

// Get requests
export const getBagRequests = async (req, res) => {
  try {
    const { status, paymentStatus, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    const requests = await QRPaperBagRequest.find(query)
      .populate("sellerId", "shopName name phone email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await QRPaperBagRequest.countDocuments(query);

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
    const count = await QRPaperBagRequest.countDocuments({ status: "pending_approval" });
    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    console.error("Get pending requests count error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch pending requests count" });
  }
};

// Approve request
export const approveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    const request = await QRPaperBagRequest.findById(id).populate("sellerId");
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    if (request.status !== "pending_approval") {
      return res.status(400).json({ success: false, message: "Request is not pending approval" });
    }

    const approvedQuantity = quantity || request.quantity;

    // Update request status
    request.status = "approved_payment_pending";
    request.approvedQuantity = approvedQuantity;
    request.adminNotes = `Approved for ${approvedQuantity} bags. Payment pending.`;
    
    // If it's free, skip payment directly to payment_completed
    if (request.totalAmount === 0) {
        request.status = "payment_completed";
        request.paymentStatus = "completed";
    }

    await request.save();

    res.status(200).json({ success: true, message: "Request approved successfully" });
  } catch (error) {
    console.error("Approve request error:", error);
    res.status(500).json({ success: false, message: "Failed to approve request" });
  }
};

// Reject request
export const rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const request = await QRPaperBagRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    if (request.status !== "pending_approval") {
      return res.status(400).json({ success: false, message: "Request is not pending approval" });
    }

    request.status = "rejected";
    request.adminNotes = reason;
    await request.save();

    res.status(200).json({ success: true, message: "Request rejected" });
  } catch (error) {
    console.error("Reject request error:", error);
    res.status(500).json({ success: false, message: "Failed to reject request" });
  }
};

// Dispatch request
export const dispatchBagRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { trackingDetails } = req.body;

    const request = await QRPaperBagRequest.findById(id).populate("sellerId");
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    if (request.status !== "payment_completed") {
      return res.status(400).json({ success: false, message: "Request must be paid before dispatch" });
    }

    const quantityToAssign = request.approvedQuantity || request.quantity;
    
    // Find available generated bags
    const availableBags = await QRPaperBag.find({ status: "generated", size: request.size }).limit(quantityToAssign);
    
    if (availableBags.length < quantityToAssign) {
        return res.status(400).json({ success: false, message: `Only ${availableBags.length} generated bags of size ${request.size} available. Please generate more bags first.` });
    }

    const bagIds = availableBags.map(b => b.bagId);

    // Assign bags to seller
    await QRPaperBag.updateMany(
      { bagId: { $in: bagIds } },
      {
        $set: {
          status: "assigned",
          assignedSellerId: request.sellerId._id,
          assignedAt: new Date()
        },
        $push: {
          timeline: {
            status: "assigned",
            actorModel: "Admin",
            actorId: req.user._id,
            notes: `Assigned to ${request.sellerId.shopName} via request dispatch`
          }
        }
      }
    );

    // Update request status
    request.status = "dispatched";
    request.trackingDetails = trackingDetails;
    request.dispatchedAt = new Date();
    request.adminNotes = (request.adminNotes ? request.adminNotes + " | " : "") + `Dispatched and assigned ${quantityToAssign} bags.`;
    await request.save();

    res.status(200).json({ success: true, message: "Request dispatched and bags assigned successfully" });
  } catch (error) {
    console.error("Dispatch request error:", error);
    res.status(500).json({ success: false, message: "Failed to dispatch request" });
  }
};

// Mark as Delivered
export const markBagRequestDelivered = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await QRPaperBagRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    if (request.status !== "dispatched") {
      return res.status(400).json({ success: false, message: "Request is not dispatched yet" });
    }

    request.status = "delivered";
    await request.save();

    res.status(200).json({ success: true, message: "Request marked as delivered" });
  } catch (error) {
    console.error("Mark delivered error:", error);
    res.status(500).json({ success: false, message: "Failed to mark request as delivered" });
  }
};
