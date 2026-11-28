import Seller from "../models/seller.js";
import Zone from "../models/zone.js";
import Product from "../models/product.js";
import Coupon from "../models/coupon.js";
import Review from "../models/review.js";
import BestOfferListing from "../models/bestOfferListing.js";
import {
  generateOfferText,
  isOfferStructurallyActive,
} from "../services/bestOfferService.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { calculateDynamicDeliveryTime } from "./productController.js";
import { handleResponse } from "../utils/helper.js";
import mongoose from "mongoose";
import { invalidateSellerName } from "../services/entityNameCache.js";
import { getIO } from "../socket/socketManager.js";
import { invalidate, buildKey } from "../services/cacheService.js";
import {
  issueSellerBankUpdateOtp,
  verifySellerBankUpdateOtp,
  verifySellerBankUpdateToken,
  hasBankOrUpiChanges,
} from "../services/sellerVerificationService.js";
import {
  generateSellerSalesGstCsv,
  generateSellerCommissionCsv,
  generateSettlementReportCsv,
  generateDocumentsIssuedCsv,
} from "../services/gst/gstReportService.js";
import { listInvoices, getInvoiceById } from "../services/gst/invoiceService.js";
import getPagination from "../utils/pagination.js";
import {
  getNearbySellerIdsForCustomer,
  parseCustomerCoordinates,
} from "../services/customerVisibilityService.js";

/* ===============================
   GET NEARBY SELLERS
================================ */
export const getNearbySellers = async (req, res) => {
  try {
    const { lat, lng } = req.query;

    const coordinates = parseCustomerCoordinates({ lat, lng });
    if (!coordinates.valid) {
      return handleResponse(res, 400, "Latitude and longitude are required");
    }

    const sellerIds = await getNearbySellerIdsForCustomer(
      coordinates.lat,
      coordinates.lng,
    );
    const sellers = await Seller.find({ _id: { $in: sellerIds } })
      .select("shopName storefrontImage shopImage estimatedDeliveryTime preparationTime")
      .lean();
    const sellersById = new Map(sellers.map((seller) => [String(seller._id), seller]));
    const nearbySellers = sellerIds.map((id) => sellersById.get(String(id))).filter(Boolean);

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
   GET SHOP SCHEDULE (auto open/close)
================================ */
export const getShopSchedule = async (req, res) => {
  try {
    const seller = await Seller.findById(req.user.id).select("shopSchedule");
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }
    return handleResponse(res, 200, "Shop schedule fetched", {
      enabled: Boolean(seller.shopSchedule?.enabled),
      openTime: seller.shopSchedule?.openTime || "09:00",
      closeTime: seller.shopSchedule?.closeTime || "21:00",
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE SHOP SCHEDULE (auto open/close)
================================ */
const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const updateShopSchedule = async (req, res) => {
  try {
    const { enabled, openTime, closeTime } = req.body;

    if (typeof enabled !== "boolean") {
      return handleResponse(res, 400, "enabled must be a boolean");
    }
    if (!HH_MM.test(String(openTime || ""))) {
      return handleResponse(res, 400, "openTime must be in HH:MM (24h) format");
    }
    if (!HH_MM.test(String(closeTime || ""))) {
      return handleResponse(res, 400, "closeTime must be in HH:MM (24h) format");
    }
    if (openTime === closeTime) {
      return handleResponse(res, 400, "Opening and closing time cannot be the same");
    }

    const seller = await Seller.findByIdAndUpdate(
      req.user.id,
      { shopSchedule: { enabled, openTime, closeTime } },
      { new: true },
    ).select("shopSchedule isOnline lastSeen");

    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    return handleResponse(res, 200, "Shop schedule updated", {
      enabled: Boolean(seller.shopSchedule?.enabled),
      openTime: seller.shopSchedule?.openTime,
      closeTime: seller.shopSchedule?.closeTime,
      isOnline: seller.isOnline,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REQUEST WITHDRAWAL (Seller)
================================ */
/* ===============================
   GET SELLER PROFILE
================================ */
export const getSellerProfile = async (req, res) => {
  try {
    const seller = await Seller.findById(req.user.id).populate("zone", "name");
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
    const { name, shopName, shopImage, phone, address, locality, pincode, city, state, lat, lng, radius, panNumber, cinNumber, tradeLicenseNumber, gstin, description, category, bankDetails, upiDetails, preparationTime, zone, bankUpdateToken } = req.body;

    // Find seller
    const seller = await Seller.findById(req.user.id);
    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    // Bank account / UPI details are the payout destination — require a fresh OTP
    // verification (step-up auth) before accepting any actual change to them. A
    // resubmit of the exact same values already on file (e.g. the seller only edited
    // their shop name, and the client happened to echo bankDetails/upiDetails back
    // unchanged) is not treated as a change and doesn't need re-verification.
    if (hasBankOrUpiChanges(seller, { bankDetails, upiDetails })) {
      try {
        verifySellerBankUpdateToken({ sellerId: req.user.id, token: bankUpdateToken });
      } catch (verificationError) {
        return handleResponse(
          res,
          verificationError.statusCode || 403,
          verificationError.message,
        );
      }
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
    if (req.body.storefrontImage !== undefined) seller.storefrontImage = req.body.storefrontImage;
    if (req.body.storefrontVideo !== undefined) seller.storefrontVideo = req.body.storefrontVideo;
    if (req.body.foodType !== undefined) seller.foodType = req.body.foodType;
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
      if (!mongoose.Types.ObjectId.isValid(zone)) {
        return handleResponse(res, 400, "Invalid delivery zone");
      }
      const selectedZoneQuery = { _id: zone, isActive: true };
      if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
        selectedZoneQuery.location = {
          $geoIntersects: {
            $geometry: {
              type: "Point",
              coordinates: [Number(lng), Number(lat)],
            },
          },
        };
      }
      const selectedZone = await Zone.findOne(selectedZoneQuery);
      if (!selectedZone) {
        return handleResponse(
          res,
          400,
          "Store location must be inside the selected active delivery zone",
        );
      }
      seller.zone = selectedZone._id;
    }

    const updatedSeller = await seller.save();
    await updatedSeller.populate("zone", "name");

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

/* ===============================
   BANK / UPI UPDATE — STEP-UP OTP
================================ */
export const sendBankUpdateOtp = async (req, res) => {
  try {
    const { channel } = req.body || {};
    const result = await issueSellerBankUpdateOtp({
      sellerId: req.user.id,
      channel,
      ipAddress: req.ip,
    });
    return handleResponse(res, 200, "OTP sent successfully", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const verifyBankUpdateOtp = async (req, res) => {
  try {
    const { channel, otp } = req.body || {};
    const result = await verifySellerBankUpdateOtp({
      sellerId: req.user.id,
      channel,
      otp,
      ipAddress: req.ip,
    });
    return handleResponse(res, 200, "OTP verified successfully", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

/* ===============================
   GST REPORT DOWNLOAD (SELLER)
================================ */
// Only the reports that are meaningful for a single seller to see about
// themselves — the cross-seller aggregates (commission summaries, the
// platform-wide reconciliation working) stay admin-only.
const SELLER_GST_REPORT_GENERATORS = {
  seller_sales: { fn: generateSellerSalesGstCsv, name: "My_Sales_GST" },
  documents_issued: { fn: generateDocumentsIssuedCsv, name: "My_Documents_Issued" },
  commission: { fn: generateSellerCommissionCsv, name: "Commission_Invoice_GST" },
  settlement: { fn: generateSettlementReportCsv, name: "Settlement_Report" },
};

export const downloadSellerGstReportController = async (req, res) => {
  try {
    const { reportType = "seller_sales", financialYear, taxPeriod, startDate, endDate } = req.query || {};

    const generator = SELLER_GST_REPORT_GENERATORS[reportType];
    if (!generator) {
      return handleResponse(res, 400, `Unknown reportType: ${reportType}`);
    }

    // Always scope to the logged-in seller — a sellerId sent by the client is
    // never honored, so a seller can never pull another seller's GST data.
    const params = {
      financialYear,
      taxPeriod,
      startDate,
      endDate,
      sellerId: req.user.id,
    };

    const csv = await generator.fn(params);
    const fy = financialYear || "ALL";
    const period = taxPeriod || "ALL";
    const filename = `${generator.name}_${fy}_${period}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

/* ===============================
   MY INVOICES (SELLER) - dual-numbered tax invoices, credit & debit notes
================================ */
// Confined to the logged-in seller: `sellerId` is taken from the verified token and any
// sellerId in the query string is ignored, so another seller's invoices can never be listed.
export const listMyInvoicesController = async (req, res) => {
  try {
    const { search, docType, status, financialYear, startDate, endDate } = req.query || {};
    const pagination = getPagination(req, { defaultLimit: 25, maxLimit: 100 });
    const result = await listInvoices(
      { sellerId: req.user.id, search, docType, status, financialYear, startDate, endDate },
      pagination,
    );
    return handleResponse(res, 200, "Invoices fetched", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getMyInvoiceController = async (req, res) => {
  try {
    const invoice = await getInvoiceById(req.params.invoiceId, { sellerId: req.user.id });
    if (!invoice) return handleResponse(res, 404, "Invoice not found");
    return handleResponse(res, 200, "Invoice fetched", invoice);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const getActiveZonesForSeller = async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "").toLowerCase() === "true";
    const zones = await Zone.find(includeInactive ? {} : { isActive: true })
      .select("name location isActive")
      .sort({ name: 1 })
      .lean();
    return handleResponse(res, 200, "Zones fetched successfully", zones);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET STOREFRONT DETAILS (Customer)
================================ */
export const getStorefrontDetails = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { lat, lng } = req.query;

    const query = mongoose.Types.ObjectId.isValid(sellerId)
      ? { $or: [{ _id: sellerId }, { sellerId }] }
      : { sellerId };

    const seller = await Seller.findOne(query)
      .select("name shopName shopImage storefrontImage storefrontVideo foodType category description address locality city serviceRadius preparationTime estimatedDeliveryTime location ratingAverage ratingCount ratingBreakdown isOnline")
      .lean();

    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    // 1. Calculate dynamic distance and delivery time
    const coords = parseCustomerCoordinates({ lat, lng });
    let distanceKm = null;
    if (coords.valid && seller.location?.length === 2 && (seller.location[0] !== 0 || seller.location[1] !== 0)) {
      const distMeters = distanceMeters(coords.lat, coords.lng, seller.location[1], seller.location[0]);
      distanceKm = Number((distMeters / 1000).toFixed(1));
    }
    const deliveryTime = calculateDynamicDeliveryTime(coords, seller);

    // 2. Fetch coupons applicable and seller's active structured Best Offer
    const now = new Date();
    const [coupons, bestOfferDoc] = await Promise.all([
      Coupon.find({
        isActive: true,
        $or: [{ startDate: { $exists: false } }, { startDate: { $lte: now } }],
        $or: [{ expiryDate: { $exists: false } }, { expiryDate: { $gte: now } }],
      })
        .select("code title description discountType discountValue maxDiscount minOrderValue")
        .limit(6)
        .lean(),
      BestOfferListing.findOne({ sellerId: seller._id }).lean(),
    ]);

    const activeOffer =
      bestOfferDoc && isOfferStructurallyActive(bestOfferDoc, now)
        ? {
            offerText: generateOfferText(bestOfferDoc) || bestOfferDoc.offerText,
            discountType: bestOfferDoc.discountType,
            discountValue: bestOfferDoc.discountValue,
            maxDiscount: bestOfferDoc.maxDiscount ?? null,
            minOrderValue: bestOfferDoc.minOrderValue || 0,
            newUsersOnly: Boolean(bestOfferDoc.newUsersOnly),
          }
        : null;

    // 3. Fetch latest approved customer reviews for this seller
    const reviews = await Review.find({ sellerId: seller._id, status: "approved" })
      .populate("userId", "name")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // 4. Fetch seller's active products
    const products = await Product.find({
      sellerId: seller._id,
      status: "active",
      approvalStatus: "approved",
    })
      .select("name slug description price salePrice stock mainImage foodPreference weight ratingAverage ratingCount categoryId isFeatured tags")
      .populate("categoryId", "name")
      .sort({ isFeatured: -1, createdAt: -1 })
      .lean();

    // Group products by category
    const categoryMap = new Map();
    products.forEach((p) => {
      const catName = p.categoryId?.name || "Recommended";
      if (!categoryMap.has(catName)) {
        categoryMap.set(catName, []);
      }
      categoryMap.get(catName).push(p);
    });

    const categories = Array.from(categoryMap.entries()).map(([name, items]) => ({
      name,
      items,
    }));

    return handleResponse(res, 200, "Storefront details fetched successfully", {
      seller: {
        ...seller,
        distanceKm,
        deliveryTime,
      },
      coupons,
      activeOffer,
      reviews,
      categories,
      totalProducts: products.length,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
