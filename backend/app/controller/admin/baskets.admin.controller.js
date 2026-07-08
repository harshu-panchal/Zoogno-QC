import QRCode from "qrcode";
import Basket from "../../models/basket.js";
import Seller from "../../models/seller.js";
import Setting from "../../models/setting.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// ── Helper: generate a unique BSK-XXXXXXXX id ────────────────────────────────
const generateBasketId = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/1/O/0 to avoid ambiguity
  let id = "BSK-";
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
};

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE BASKETS
// POST /admin/baskets/create   { quantity, size, notes }
// ═══════════════════════════════════════════════════════════════════════════════
export const createBaskets = async (req, res) => {
  try {
    const { quantity = 1, size, notes } = req.body;

    if (!size) {
      return res.status(400).json({ success: false, message: "Size is required" });
    }
    if (quantity < 1 || quantity > 100) {
      return res.status(400).json({ success: false, message: "Quantity must be between 1 and 100" });
    }

    const newBaskets = [];

    for (let i = 0; i < quantity; i++) {
      // Generate unique basket ID (retry on collision)
      let basketId;
      let attempts = 0;
      do {
        basketId = generateBasketId();
        attempts++;
      } while (attempts < 5 && await Basket.findOne({ basketId }));

      const qrCodeData = `${FRONTEND_URL}/verify-basket/${basketId}`;
      const qrCodeImage = await QRCode.toDataURL(qrCodeData, {
        width: 300,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      newBaskets.push({
        basketId,
        qrCodeData,
        qrCodeImage,
        size,
        status: "AVAILABLE",
        notes,
        timeline: [
          {
            status: "AVAILABLE",
            actorModel: "Admin",
            actorId: req.user._id,
            notes: "Basket created",
          },
        ],
      });
    }

    await Basket.insertMany(newBaskets);

    res.status(201).json({
      success: true,
      message: `Successfully created ${quantity} basket(s)`,
      result: {
        count: newBaskets.length,
        basketIds: newBaskets.map((b) => b.basketId),
      },
    });
  } catch (error) {
    console.error("Create baskets error:", error);
    res.status(500).json({ success: false, message: "Failed to create baskets" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET INVENTORY
// GET /admin/baskets   ?page=1&limit=20&status=AVAILABLE&search=BSK-
// ═══════════════════════════════════════════════════════════════════════════════
export const getInventory = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const query = {};

    if (status) {
      query.status = status.toUpperCase();
    }
    if (search) {
      query.$or = [{ basketId: new RegExp(search, "i") }];
    }

    const baskets = await Basket.find(query)
      .populate("assignedSellerId", "name shopName phone")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Basket.countDocuments(query);

    res.status(200).json({
      success: true,
      result: {
        items: baskets.map((b) => ({
          ...b,
          seller: b.assignedSellerId
            ? {
                _id: b.assignedSellerId._id,
                name: b.assignedSellerId.shopName || b.assignedSellerId.name || "Unknown",
              }
            : null,
        })),
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
// GET STATS
// GET /admin/baskets/stats
// ═══════════════════════════════════════════════════════════════════════════════
export const getStats = async (req, res) => {
  try {
    const pipeline = [
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ];
    const agg = await Basket.aggregate(pipeline);
    const counts = {};
    agg.forEach((a) => { counts[a._id] = a.count; });

    res.status(200).json({
      success: true,
      result: {
        total: Object.values(counts).reduce((s, c) => s + c, 0),
        available: counts.AVAILABLE || 0,
        assigned: counts.ASSIGNED || 0,
        inUse: counts.IN_USE || 0,
        packed: counts.PACKED || 0,
        lost: counts.LOST || 0,
        damaged: counts.DAMAGED || 0,
      },
    });
  } catch (error) {
    console.error("Get basket stats error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch basket stats" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET BASKET DETAILS
// GET /admin/baskets/:basketId
// ═══════════════════════════════════════════════════════════════════════════════
export const getBasketDetails = async (req, res) => {
  try {
    const { basketId } = req.params;
    const basket = await Basket.findOne({ basketId })
      .populate("assignedSellerId", "name shopName phone email")
      .populate("currentOrderId");

    if (!basket) {
      return res.status(404).json({ success: false, message: "Basket not found" });
    }

    res.status(200).json({ success: true, result: basket });
  } catch (error) {
    console.error("Get basket details error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch basket details" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ASSIGN TO SELLER
// POST /admin/baskets/assign   { sellerId, basketIds: [] }
// ═══════════════════════════════════════════════════════════════════════════════
export const assignToSeller = async (req, res) => {
  try {
    const { sellerId, basketIds, requestId } = req.body;

    if (!sellerId || !basketIds || !basketIds.length) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller not found" });
    }

    const result = await Basket.updateMany(
      { basketId: { $in: basketIds }, status: "AVAILABLE" },
      {
        $set: {
          status: "ASSIGNED",
          assignedSellerId: sellerId,
          assignedAt: new Date(),
        },
        $push: {
          timeline: {
            status: "ASSIGNED",
            actorModel: "Admin",
            actorId: req.user._id,
            notes: `Assigned to ${seller.shopName || seller.name}`,
          },
        },
      }
    );

    // If a requestId is provided, mark it as dispatched
    if (requestId && result.modifiedCount > 0) {
      const request = await BasketRequest.findById(requestId);
      if (request && request.status === "payment_completed") {
        request.status = "dispatched";
        request.dispatchedAt = new Date();
        request.adminNotes = (request.adminNotes ? request.adminNotes + " | " : "") + `Manually assigned ${result.modifiedCount} baskets.`;
        await request.save();
      }
    }

    res.status(200).json({
      success: true,
      message: `Assigned ${result.modifiedCount} basket(s) to seller`,
      result: { assignedCount: result.modifiedCount },
    });
  } catch (error) {
    console.error("Assign baskets error:", error);
    res.status(500).json({ success: false, message: "Failed to assign baskets" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET SELLERS WITH BASKET COUNT
// GET /admin/baskets/sellers
// ═══════════════════════════════════════════════════════════════════════════════
export const getSellersWithBasketCount = async (req, res) => {
  try {
    const sellers = await Seller.find({})
      .select("_id name shopName")
      .sort({ shopName: 1 })
      .lean();

    const basketCounts = await Basket.aggregate([
      { $match: { status: "ASSIGNED" } },
      { $group: { _id: "$assignedSellerId", count: { $sum: 1 } } },
    ]);

    const countMap = new Map(basketCounts.map((b) => [b._id.toString(), b.count]));

    const items = sellers.map((s) => ({
      _id: s._id,
      name: s.name || s.shopName || "Unknown",
      shopName: s.shopName || "",
      basketsAvailable: countMap.get(s._id.toString()) || 0,
    }));

    res.status(200).json({ success: true, result: { items } });
  } catch (error) {
    console.error("Get sellers with basket count error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch sellers" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// DISABLE BASKET
// PUT /admin/baskets/:basketId/disable
// ═══════════════════════════════════════════════════════════════════════════════
export const disableBasket = async (req, res) => {
  try {
    const { basketId } = req.params;
    const basket = await Basket.findOne({ basketId });

    if (!basket) {
      return res.status(404).json({ success: false, message: "Basket not found" });
    }

    basket.status = "DISABLED";
    basket.timeline.push({
      status: "DISABLED",
      actorModel: "Admin",
      actorId: req.user._id,
      notes: "Basket disabled by admin",
    });

    await basket.save();

    res.status(200).json({ success: true, message: "Basket disabled" });
  } catch (error) {
    console.error("Disable basket error:", error);
    res.status(500).json({ success: false, message: "Failed to disable basket" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET REQUESTS
// GET /admin/baskets/requests
// ═══════════════════════════════════════════════════════════════════════════════
import BasketRequest from "../../models/basketRequest.js";

export const getBasketRequests = async (req, res) => {
  try {
    const { status, sellerId, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (sellerId) query.sellerId = sellerId;

    const requests = await BasketRequest.find(query)
      .populate("sellerId", "storeName ownerName phone email shopName name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await BasketRequest.countDocuments(query);

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
    res.status(500).json({ success: false, message: "Failed to fetch requests" });
  }
};

export const getPendingRequestsCount = async (req, res) => {
  try {
    const count = await BasketRequest.countDocuments({ status: "pending" });
    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch pending requests count" });
  }
};

export const approveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    const request = await BasketRequest.findById(id).populate("sellerId");
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });
    if (request.status !== "pending") return res.status(400).json({ success: false, message: "Request is not pending" });

    const approvedQuantity = quantity || request.quantity;
    
    // Calculate total amount based on pricing
    const settings = await Setting.findOne();
    const basketPricing = settings?.basketPricing || { small: 0, medium: 0, large: 0 };
    const pricePerBasket = basketPricing[request.size.toLowerCase()] || 0;
    const totalAmount = approvedQuantity * pricePerBasket;

    if (totalAmount === 0) {
        return res.status(400).json({ success: false, message: `Price for ${request.size} baskets is not configured. Please set the price in Create Baskets page.` });
    }

    request.status = "approved_payment_pending";
    request.approvedQuantity = approvedQuantity;
    request.totalAmount = totalAmount;
    request.adminNotes = `Approved for ${approvedQuantity} baskets. Payment pending.`;

    await request.save();

    res.status(200).json({ success: true, message: "Request approved successfully" });
  } catch (error) {
    console.error("Approve request error:", error);
    res.status(500).json({ success: false, message: "Failed to approve request" });
  }
};

export const rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const request = await BasketRequest.findById(id);
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });
    if (request.status !== "pending") return res.status(400).json({ success: false, message: "Request is not pending" });

    request.status = "rejected";
    request.adminNotes = reason || "Rejected by admin";
    await request.save();

    res.status(200).json({ success: true, message: "Request rejected" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to reject request" });
  }
};

export const dispatchBasketRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { trackingDetails } = req.body;

    const request = await BasketRequest.findById(id).populate("sellerId");
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });
    if (request.status !== "payment_completed") return res.status(400).json({ success: false, message: "Request must be paid before dispatch" });

    const quantityToAssign = request.approvedQuantity || request.quantity;
    
    const availableBaskets = await Basket.find({ status: "AVAILABLE", size: request.size }).limit(quantityToAssign);
    if (availableBaskets.length < quantityToAssign) {
        return res.status(400).json({ success: false, message: `Only ${availableBaskets.length} available baskets of size ${request.size}.` });
    }

    const basketIds = availableBaskets.map(b => b.basketId);

    await Basket.updateMany(
      { basketId: { $in: basketIds } },
      {
        $set: {
          status: "ASSIGNED",
          assignedSellerId: request.sellerId._id,
          assignedAt: new Date()
        },
        $push: {
          timeline: {
            status: "ASSIGNED",
            actorModel: "Admin",
            actorId: req.user._id,
            notes: `Assigned to ${request.sellerId.shopName} via request dispatch`
          }
        }
      }
    );

    request.status = "dispatched";
    request.trackingDetails = trackingDetails;
    request.dispatchedAt = new Date();
    request.adminNotes = (request.adminNotes ? request.adminNotes + " | " : "") + `Dispatched and assigned ${quantityToAssign} baskets.`;
    await request.save();

    res.status(200).json({ success: true, message: "Request dispatched and baskets assigned successfully" });
  } catch (error) {
    console.error("Dispatch request error:", error);
    res.status(500).json({ success: false, message: "Failed to dispatch request" });
  }
};

export const markBasketRequestDelivered = async (req, res) => {
  try {
    const { id } = req.params;

    const request = await BasketRequest.findById(id);
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });
    if (request.status !== "dispatched") return res.status(400).json({ success: false, message: "Request is not dispatched yet" });

    request.status = "delivered";
    await request.save();

    res.status(200).json({ success: true, message: "Request marked as delivered" });
  } catch (error) {
    console.error("Mark delivered error:", error);
    res.status(500).json({ success: false, message: "Failed to mark request as delivered" });
  }
};
