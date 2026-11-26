import mongoose from "mongoose";
import BestOfferListing from "../models/bestOfferListing.js";
import BestOfferZoneOrder from "../models/bestOfferZoneOrder.js";
import Seller from "../models/seller.js";
import Review from "../models/review.js";
import handleResponse from "../utils/helper.js";
import { calculateDynamicDeliveryTime } from "./productController.js";
import {
  parseCustomerCoordinates,
  getNearbySellerIdsForCustomer,
  getCustomerZoneIds,
} from "../services/customerVisibilityService.js";

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));

const withinWindow = (l, now = new Date()) =>
  (!l.startsAt || l.startsAt <= now) && (!l.endsAt || l.endsAt >= now);

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

// undefined => invalid, null => cleared
const parseDate = (v) => {
  if (v === null || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

async function ratingsFor(sellerIds) {
  if (!sellerIds.length) return new Map();
  const rows = await Review.aggregate([
    {
      $match: {
        status: "approved",
        sellerId: { $in: sellerIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
      },
    },
    { $group: { _id: "$sellerId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  return new Map(
    rows.map((r) => [String(r._id), { avg: Math.round(r.avg * 10) / 10, count: r.count }]),
  );
}

/* ---------------- Customer ---------------- */
export const getPublicBestOffers = async (req, res) => {
  try {
    const coords = parseCustomerCoordinates(req.query || {});
    if (!coords.valid) return handleResponse(res, 400, "lat and lng are required");

    const [nearbyIds, zoneIds] = await Promise.all([
      getNearbySellerIdsForCustomer(coords.lat, coords.lng),
      getCustomerZoneIds(coords.lat, coords.lng),
    ]);
    if (!nearbyIds.length || !zoneIds.length) {
      return handleResponse(res, 200, "Best offers fetched", []);
    }

    const [listings, orders] = await Promise.all([
      BestOfferListing.find({
        sellerId: { $in: nearbyIds },
        isEnabled: true,
        adminStatus: "active",
        image: { $ne: "" },
      }).lean(),
      BestOfferZoneOrder.find({ zoneId: { $in: zoneIds } }).lean(),
    ]);

    const visible = listings.filter((l) => withinWindow(l));
    const sellerIds = visible.map((l) => l.sellerId);
    const [sellers, ratings] = await Promise.all([
      Seller.find({ _id: { $in: sellerIds }, zone: { $in: zoneIds } })
        .select("shopName ratingAverage ratingCount location preparationTime estimatedDeliveryTime")
        .lean(),
      ratingsFor(sellerIds),
    ]);
    const sellerMap = new Map(sellers.map((s) => [String(s._id), s]));

    // Position by admin order (customer's zones in turn); unordered go last.
    const position = new Map();
    let pos = 0;
    for (const zid of zoneIds) {
      const o = orders.find((x) => String(x.zoneId) === String(zid));
      for (const sid of o?.sellerIds || []) {
        if (!position.has(String(sid))) position.set(String(sid), pos++);
      }
    }

    const items = visible
      .filter((l) => sellerMap.has(String(l.sellerId)))
      .sort((a, b) => {
        const pa = position.get(String(a.sellerId)) ?? Infinity;
        const pb = position.get(String(b.sellerId)) ?? Infinity;
        if (pa !== pb) return pa < pb ? -1 : 1;
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      })
      .map((l) => {
        const r = ratings.get(String(l.sellerId));
        const s = sellerMap.get(String(l.sellerId));
        const rating = r?.avg ?? (s?.ratingAverage > 0 ? s.ratingAverage : null);
        const ratingCount = r?.count ?? s?.ratingCount ?? 0;
        const deliveryTime = calculateDynamicDeliveryTime(coords, s);
        return {
          sellerId: String(l.sellerId),
          shopName: s?.shopName || "Store",
          image: l.image,
          offerText: l.offerText,
          tagline: l.tagline || "Near & Fast",
          deliveryTime,
          rating,
          ratingCount,
        };
      });

    return handleResponse(res, 200, "Best offers fetched", items);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ---------------- Seller ---------------- */
export const getMyBestOffer = async (req, res) => {
  try {
    const listing = await BestOfferListing.findOne({ sellerId: req.user.id }).lean();
    return handleResponse(res, 200, "Best offer fetched", listing || null);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const upsertMyBestOffer = async (req, res) => {
  try {
    const { image, offerText, tagline, isEnabled, startsAt, endsAt } = req.body || {};
    const update = {};
    if (image !== undefined) update.image = clean(image, 2000);
    if (offerText !== undefined) update.offerText = clean(offerText, 60);
    if (tagline !== undefined) update.tagline = clean(tagline, 30);
    if (isEnabled !== undefined) update.isEnabled = Boolean(isEnabled);
    if (startsAt !== undefined) {
      update.startsAt = parseDate(startsAt);
      if (update.startsAt === undefined) return handleResponse(res, 400, "Invalid start date");
    }
    if (endsAt !== undefined) {
      update.endsAt = parseDate(endsAt);
      if (update.endsAt === undefined) return handleResponse(res, 400, "Invalid end date");
    }
    if (update.startsAt && update.endsAt && update.endsAt < update.startsAt) {
      return handleResponse(res, 400, "End date must be after start date");
    }

    const existing = await BestOfferListing.findOne({ sellerId: req.user.id }).lean();
    const finalImage = update.image ?? existing?.image ?? "";
    if (update.isEnabled && !finalImage) {
      return handleResponse(res, 400, "Upload an image before enabling");
    }

    const listing = await BestOfferListing.findOneAndUpdate(
      { sellerId: req.user.id },
      { $set: update },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return handleResponse(res, 200, "Best offer saved", listing);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ---------------- Admin ---------------- */
export const getAdminZoneListings = async (req, res) => {
  try {
    const { zoneId } = req.params;
    if (!isObjectId(zoneId)) return handleResponse(res, 400, "Invalid zone id");

    const [sellers, order] = await Promise.all([
      Seller.find({ zone: zoneId, isActive: true, isVerified: true }).select("shopName").lean(),
      BestOfferZoneOrder.findOne({ zoneId }).lean(),
    ]);
    const listings = await BestOfferListing.find({
      sellerId: { $in: sellers.map((s) => s._id) },
    }).lean();
    const byId = new Map(listings.map((l) => [String(l.sellerId), l]));

    const rows = sellers
      .filter((s) => byId.has(String(s._id)))
      .map((s) => ({
        ...byId.get(String(s._id)),
        shopName: s.shopName,
        sellerId: String(s._id),
      }));

    const pos = new Map((order?.sellerIds || []).map((id, i) => [String(id), i]));
    rows.sort((a, b) => {
      const pa = pos.get(a.sellerId) ?? Infinity;
      const pb = pos.get(b.sellerId) ?? Infinity;
      if (pa !== pb) return pa < pb ? -1 : 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    return handleResponse(res, 200, "Zone listings fetched", rows);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const saveZoneOrder = async (req, res) => {
  try {
    const { zoneId } = req.params;
    const { sellerIds } = req.body || {};
    if (!isObjectId(zoneId)) return handleResponse(res, 400, "Invalid zone id");
    if (!Array.isArray(sellerIds) || !sellerIds.every(isObjectId)) {
      return handleResponse(res, 400, "sellerIds must be an array of valid ids");
    }
    await BestOfferZoneOrder.findOneAndUpdate(
      { zoneId },
      { $set: { sellerIds: [...new Set(sellerIds.map(String))] } },
      { upsert: true, new: true },
    );
    return handleResponse(res, 200, "Order saved");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const setListingVisibility = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { adminStatus } = req.body || {};
    if (!isObjectId(sellerId)) return handleResponse(res, 400, "Invalid seller id");
    if (!["active", "hidden"].includes(adminStatus)) {
      return handleResponse(res, 400, "Invalid status");
    }
    const listing = await BestOfferListing.findOneAndUpdate(
      { sellerId },
      { $set: { adminStatus } },
      { new: true },
    ).lean();
    if (!listing) return handleResponse(res, 404, "Listing not found");
    return handleResponse(res, 200, "Updated", listing);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
