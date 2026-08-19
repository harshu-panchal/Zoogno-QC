import Seller from "../models/seller.js";
import Zone from "../models/zone.js";
import Transaction from "../models/transaction.js";
import { handleResponse, calculateDistance } from "../utils/helper.js";
import mongoose from "mongoose";
import { invalidateSellerName } from "../services/entityNameCache.js";
import { getIO } from "../socket/socketManager.js";
import { invalidate, buildKey } from "../services/cacheService.js";
import { roundCurrency } from "../utils/money.js";
import { computeWithdrawableBalance } from "../utils/transactionBalance.js";

/* ===============================
   GET NEARBY SELLERS
================================ */
export const getNearbySellers = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return handleResponse(res, 400, "Latitude and longitude are required");
    }

    const customerLat = Number(lat);
    const customerLng = Number(lng);

    // 1. Find all zones that the customer is currently standing inside
    const customerZones = await Zone.find({
      isActive: true,
      location: {
        $geoIntersects: {
          $geometry: {
            type: "Point",
            coordinates: [customerLng, customerLat],
          },
        },
      },
    }).select("_id");

    const customerZoneIds = customerZones.map((z) => z._id);

    // 2. Fetch all active/verified sellers that have selected a zone the customer is in
    // and are within a reasonable max distance (e.g. 100km)
    const sellers = await Seller.find({
      isActive: true,
      isVerified: true,
      zone: { $in: customerZoneIds }, // Must be in a zone the customer is in
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [customerLng, customerLat],
          },
          $maxDistance: 100000, // 100km max search area for performance
        },
      },
    }).lean();

    // Filter based on individual service radius
    const nearbySellers = sellers.filter((seller) => {
      const sellerLng = seller.location.coordinates[0];
      const sellerLat = seller.location.coordinates[1];
      const distance = calculateDistance(
        customerLat,
        customerLng,
        sellerLat,
        sellerLng,
      );

      // Add distance to seller object for frontend
      seller.distance = distance;

      return distance <= (seller.serviceRadius || 5);
    });

    return handleResponse(
      res,
      200,
      "Nearby sellers fetched successfully",
      nearbySellers,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET STORE STATUS
================================ */
export const getStoreStatus = async (req, res) => {
  try {
    const seller = await Seller.findById(req.user.id).select("isOnline lastSeen");
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }
    return handleResponse(res, 200, "Store status fetched", {
      isOnline: seller.isOnline !== false, // default to true if missing
      lastSeen: seller.lastSeen
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE STORE STATUS
================================ */
export const updateStoreStatus = async (req, res) => {
  try {
    const { isOnline } = req.body;
    if (typeof isOnline !== 'boolean') {
      return handleResponse(res, 400, "isOnline must be a boolean");
    }

    const seller = await Seller.findByIdAndUpdate(
      req.user.id,
      {
        isOnline,
        lastSeen: new Date()
      },
      { new: true }
    );

    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    // Invalidate product caches that might contain this seller's products
    invalidate(buildKey("products", "list", "*"));
    invalidate(buildKey("sellers", "nearby", "*"));
    invalidate(buildKey("category", "list", "*"));

    // Emit socket event to customers and the seller themselves
    try {
      const io = getIO();
      if (io) {
        io.to("customer:online").emit("seller-status-updated", {
          sellerId: seller._id,
          isOnline: seller.isOnline,
        });
        io.to(`seller:${seller._id}`).emit("store-status-updated", {
          isOnline: seller.isOnline,
        });
      }
    } catch (socketError) {
      console.warn("Socket emission failed for store status:", socketError.message);
    }

    return handleResponse(res, 200, "Store status updated", {
      isOnline: seller.isOnline,
      lastSeen: seller.lastSeen
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REQUEST WITHDRAWAL (Seller)
================================ */
export const requestWithdrawal = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return handleResponse(res, 400, "Please enter a valid amount");
    }

    const seller = await Seller.findById(sellerId).select("bankDetails upiDetails");
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    const hasBankDetails = seller.bankDetails && seller.bankDetails.accountNumber && seller.bankDetails.ifscCode;
    const hasUpiDetails = seller.upiDetails && seller.upiDetails.upiId;

    if (!hasBankDetails && !hasUpiDetails) {
      return handleResponse(res, 400, "Please add Bank Details or UPI Details in your profile to request withdrawal.");
    }

    // 1. Calculate current available balance — shared with getSellerEarnings()'s
    // display figure, so the two can never drift apart again.
    const { availableBalance } = await computeWithdrawableBalance(sellerId, "Seller");

    if (roundCurrency(amount) > availableBalance) {
      return handleResponse(
        res,
        400,
        `Insufficient balance. Available: ₹${availableBalance}`,
      );
    }

    // 2. Create Withdrawal Transaction
    // Withdrawals have negative amounts per the model comment
    const withdrawal = await Transaction.create({
      user: sellerId,
      userModel: "Seller",
      type: "Withdrawal",
      amount: -Math.abs(amount),
      status: "Pending",
      reference: `WDR-${Date.now()}`,
    });

    return handleResponse(
      res,
      201,
      "Withdrawal request submitted successfully",
      withdrawal,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SELLER PROFILE
================================ */
export const getSellerProfile = async (req, res) => {
  try {
    const seller = await Seller.findById(req.user.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }
    return handleResponse(
      res,
      200,
      "Seller profile fetched successfully",
      seller,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE SELLER PROFILE
================================ */
export const updateSellerProfile = async (req, res) => {
  try {
    const { name, shopName, shopImage, phone, address, locality, pincode, city, state, lat, lng, radius, panNumber, cinNumber, tradeLicenseNumber, gstin, description, category, bankDetails, upiDetails, preparationTime, zone } = req.body;

    // Find seller
    const seller = await Seller.findById(req.user.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    // Update fields if provided
    if (name) seller.name = name;
    if (shopName) seller.shopName = shopName;
    if (shopImage !== undefined) seller.shopImage = shopImage;
    if (phone) seller.phone = phone;
    if (address !== undefined) seller.address = address;
    if (locality !== undefined) seller.locality = locality;
    if (pincode !== undefined) seller.pincode = pincode;
    if (city !== undefined) seller.city = city;
    if (state !== undefined) seller.state = state;
    if (panNumber !== undefined) seller.panNumber = panNumber;
    if (cinNumber !== undefined) seller.cinNumber = cinNumber;
    if (tradeLicenseNumber !== undefined) seller.tradeLicenseNumber = tradeLicenseNumber;
    if (gstin !== undefined) seller.gstin = gstin;
    if (description !== undefined) seller.description = description;
    if (category !== undefined) seller.category = category;
    if (bankDetails !== undefined) seller.bankDetails = { ...seller.bankDetails, ...bankDetails };
    if (upiDetails !== undefined) seller.upiDetails = { ...seller.upiDetails, ...upiDetails };
    if (preparationTime !== undefined) seller.preparationTime = Number(preparationTime) || 10;

    // Validate and update geo data
    if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
      if (lat < -90 || lat > 90)
        return handleResponse(res, 400, "Invalid latitude");
      if (lng < -180 || lng > 180)
        return handleResponse(res, 400, "Invalid longitude");

      // Check if coordinates fall within any active Zone
      const insideZone = await Zone.findOne({
        isActive: true,
        location: {
          $geoIntersects: {
            $geometry: {
              type: "Point",
              coordinates: [Number(lng), Number(lat)],
            },
          },
        },
      });

      if (!insideZone) {
        return handleResponse(
          res,
          400,
          "Your store location must be within an active delivery zone."
        );
      }

      seller.location = {
        type: "Point",
        coordinates: [Number(lng), Number(lat)],
      };
    }

    if (radius !== undefined) {
      if (radius < 1 || radius > 100)
        return handleResponse(res, 400, "Radius must be between 1 and 100 km");
      seller.serviceRadius = Number(radius);
    }

    if (zone) {
      seller.zone = zone;
    }

    const updatedSeller = await seller.save();

    // Invalidate cached seller name in case shopName changed
    invalidateSellerName(req.user.id).catch((err) => {
      console.warn("[Seller] Name cache invalidation failed:", err.message);
    });

    return handleResponse(
      res,
      200,
      "Profile updated successfully",
      updatedSeller,
    );
  } catch (error) {
    // Handle duplicate phone error
    if (error.code === 11000) {
      return handleResponse(res, 400, "Phone number already in use");
    }
    return handleResponse(res, 500, error.message);
  }
};

export const getActiveZonesForSeller = async (req, res) => {
  try {
    const zones = await Zone.find({ isActive: true }).select("name location").lean();
    return handleResponse(res, 200, "Active zones fetched successfully", zones);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
