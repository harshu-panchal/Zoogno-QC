import mongoose from "mongoose";
import BestOfferListing from "../models/bestOfferListing.js";
import BestOfferZoneOrder from "../models/bestOfferZoneOrder.js";
import Seller from "../models/seller.js";
import Review from "../models/review.js";
import Setting from "../models/setting.js";
import handleResponse from "../utils/helper.js";
import { calculateDynamicDeliveryTime } from "./productController.js";
import {
  parseCustomerCoordinates,
  getNearbySellerIdsForCustomer,
  getCustomerZoneIds,
} from "../services/customerVisibilityService.js";
import {
  getOrCreateFinanceSettings,
  invalidateFinanceSettingsCache,
} from "../services/finance/financeSettingsService.js";
import {
  generateOfferText,
  getEffectiveDailySpent,
  getIstDateKey,
  getRemainingPlatformBudget,
  isOfferStructurallyActive,
  resolveSellerCommissionCeiling,
  validateOfferAgainstSellerFloor,
} from "../services/bestOfferService.js";

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));

const clean = (v, max) => String(v ?? "").trim().slice(0, max);

// undefined => invalid, null => cleared
const parseDate = (v) => {
  if (v === null || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const parseOptionalNonNegativeNumber = (v) => {
  if (v === null || v === "" || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
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
        discountValue: { $gt: 0 },
      }).lean(),
      BestOfferZoneOrder.find({ zoneId: { $in: zoneIds } }).lean(),
    ]);

    const now = new Date();
    const todayKey = getIstDateKey(now);
    const visible = listings.filter((l) => isOfferStructurallyActive(l, now, todayKey));
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
        const computedOfferText = generateOfferText(l) || l.offerText;
        return {
          sellerId: String(l.sellerId),
          shopName: s?.shopName || "Store",
          image: l.image,
          offerText: computedOfferText,
          discountType: l.discountType || "percentage",
          discountValue: Number(l.discountValue || 0),
          maxDiscount: l.maxDiscount ?? null,
          minOrderValue: Number(l.minOrderValue || 0),
          newUsersOnly: Boolean(l.newUsersOnly),
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
    const [listing, financeSettings] = await Promise.all([
      BestOfferListing.findOne({ sellerId: req.user.id }).lean(),
      getOrCreateFinanceSettings(),
    ]);
    const commissionPct = await resolveSellerCommissionCeiling(req.user.id, financeSettings);
    const todayKey = getIstDateKey();

    if (!listing) {
      return handleResponse(res, 200, "Best offer fetched", {
        listing: null,
        commissionPct,
        offerGuardrails: financeSettings.offerGuardrails,
      });
    }

    const budgetStatus = getRemainingPlatformBudget(listing, todayKey);
    return handleResponse(res, 200, "Best offer fetched", {
      ...listing,
      offerText: generateOfferText(listing) || listing.offerText,
      commissionPct,
      offerGuardrails: financeSettings.offerGuardrails,
      budgetStatus: {
        ...budgetStatus,
        effectiveDailySpent: getEffectiveDailySpent(listing, todayKey),
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const upsertMyBestOffer = async (req, res) => {
  try {
    const {
      image,
      tagline,
      isEnabled,
      startsAt,
      endsAt,
      discountType,
      discountValue,
      maxDiscount,
      minOrderValue,
      perUserLimit,
      newUsersOnly,
      funding,
    } = req.body || {};

    const existing = await BestOfferListing.findOne({ sellerId: req.user.id }).lean();
    const update = {};

    if (image !== undefined) update.image = clean(image, 2000);
    if (tagline !== undefined) update.tagline = clean(tagline, 30);
    if (isEnabled !== undefined) update.isEnabled = Boolean(isEnabled);
    if (newUsersOnly !== undefined) update.newUsersOnly = Boolean(newUsersOnly);

    if (startsAt !== undefined) {
      update.startsAt = parseDate(startsAt);
      if (update.startsAt === undefined) return handleResponse(res, 400, "Invalid start date");
    }
    if (endsAt !== undefined) {
      update.endsAt = parseDate(endsAt);
      if (update.endsAt === undefined) return handleResponse(res, 400, "Invalid end date");
    }

    const finalStartsAt = update.startsAt !== undefined ? update.startsAt : existing?.startsAt;
    const finalEndsAt = update.endsAt !== undefined ? update.endsAt : existing?.endsAt;
    if (finalStartsAt && finalEndsAt && finalEndsAt < finalStartsAt) {
      return handleResponse(res, 400, "End date must be after start date");
    }

    const finalDiscountType = discountType ?? existing?.discountType ?? "percentage";
    if (!["percentage", "flat"].includes(finalDiscountType)) {
      return handleResponse(res, 400, "discountType must be 'percentage' or 'flat'");
    }
    update.discountType = finalDiscountType;

    const rawDiscountValue =
      discountValue !== undefined ? Number(discountValue) : Number(existing?.discountValue || 0);
    if (!Number.isFinite(rawDiscountValue) || rawDiscountValue < 0) {
      return handleResponse(res, 400, "discountValue must be a non-negative number");
    }
    if (finalDiscountType === "percentage" && rawDiscountValue > 95) {
      return handleResponse(res, 400, "Percentage discount cannot exceed 95%");
    }
    update.discountValue = rawDiscountValue;

    if (maxDiscount !== undefined) {
      const parsedMax = parseOptionalNonNegativeNumber(maxDiscount);
      if (parsedMax === undefined) return handleResponse(res, 400, "Invalid maxDiscount");
      update.maxDiscount = parsedMax === 0 ? null : parsedMax;
    }

    const finalMinOrder =
      minOrderValue !== undefined ? Number(minOrderValue || 0) : Number(existing?.minOrderValue || 0);
    if (!Number.isFinite(finalMinOrder) || finalMinOrder < 0) {
      return handleResponse(res, 400, "minOrderValue must be a non-negative number");
    }
    update.minOrderValue = finalMinOrder;

    if (perUserLimit !== undefined) {
      const parsedLimit = parseOptionalNonNegativeNumber(perUserLimit);
      if (parsedLimit === undefined || (parsedLimit !== null && !Number.isInteger(parsedLimit))) {
        return handleResponse(res, 400, "perUserLimit must be a positive whole number or empty");
      }
      update.perUserLimit = parsedLimit === 0 ? null : parsedLimit;
    }

    // Only admin can grant platformPct co-funding; sellers default to 100% seller-funded
    const existingFunding = existing?.funding || { sellerPct: 100, platformPct: 0 };
    if (funding && Number(funding.platformPct || 0) > Number(existingFunding.platformPct || 0)) {
      return handleResponse(res, 403, "Only admin can configure platform co-funding");
    }
    update.funding = {
      sellerPct: Number(existingFunding.sellerPct ?? 100),
      platformPct: Number(existingFunding.platformPct ?? 0),
    };

    const finalImage = update.image ?? existing?.image ?? "";
    const finalIsEnabled = update.isEnabled ?? existing?.isEnabled ?? true;
    if (finalIsEnabled && !finalImage) {
      return handleResponse(res, 400, "Upload an image before enabling");
    }
    if (finalIsEnabled && rawDiscountValue <= 0) {
      return handleResponse(res, 400, "Set a discount value greater than 0 before enabling");
    }

    const finalMaxDiscount =
      update.maxDiscount !== undefined ? update.maxDiscount : existing?.maxDiscount ?? null;

    // Enforce seller payout floor guardrail
    const financeSettings = await getOrCreateFinanceSettings();
    const commissionPct = await resolveSellerCommissionCeiling(req.user.id, financeSettings);
    const guardrails = financeSettings.offerGuardrails || {};
    const floorCheck = validateOfferAgainstSellerFloor({
      discountType: finalDiscountType,
      discountValue: rawDiscountValue,
      maxDiscount: finalMaxDiscount,
      minOrderValue: finalMinOrder,
      sellerPct: update.funding.sellerPct,
      commissionPct,
      minSellerPayoutPct: guardrails.minSellerPayoutPct ?? 60,
      commissionBase: guardrails.commissionBase || "discounted",
    });
    if (!floorCheck.ok) {
      return handleResponse(res, 400, floorCheck.message);
    }

    // If re-enabling after total platform budget exhaustion, block if platform budget is still exhausted
    if (finalIsEnabled && update.funding.platformPct > 0) {
      const budgetStatus = getRemainingPlatformBudget({
        ...existing,
        funding: update.funding,
      });
      if (budgetStatus.totalExhausted) {
        return handleResponse(
          res,
          400,
          "Platform budget for this offer is exhausted. Contact admin to increase the budget or switch to 100% seller funding.",
        );
      }
    }
    if (finalIsEnabled && existing?.exhaustedReason === "TOTAL_BUDGET_EXHAUSTED" && update.funding.platformPct === 0) {
      update.exhaustedReason = null;
    }

    update.offerText = generateOfferText({
      discountType: finalDiscountType,
      discountValue: rawDiscountValue,
      maxDiscount: finalMaxDiscount,
      minOrderValue: finalMinOrder,
    });

    const listing = await BestOfferListing.findOneAndUpdate(
      { sellerId: req.user.id },
      { $set: update },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();

    return handleResponse(res, 200, "Best offer saved", {
      ...listing,
      commissionPct,
      offerGuardrails: guardrails,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ---------------- Admin ---------------- */
export const getAdminZoneListings = async (req, res) => {
  try {
    const { zoneId } = req.params;
    if (!isObjectId(zoneId)) return handleResponse(res, 400, "Invalid zone id");

    const [sellers, order, financeSettings] = await Promise.all([
      Seller.find({ zone: zoneId, isActive: true, isVerified: true }).select("shopName").lean(),
      BestOfferZoneOrder.findOne({ zoneId }).lean(),
      getOrCreateFinanceSettings(),
    ]);
    const listings = await BestOfferListing.find({
      sellerId: { $in: sellers.map((s) => s._id) },
    }).lean();
    const byId = new Map(listings.map((l) => [String(l.sellerId), l]));
    const todayKey = getIstDateKey();

    const rows = sellers
      .filter((s) => byId.has(String(s._id)))
      .map((s) => {
        const l = byId.get(String(s._id));
        const budgetStatus = getRemainingPlatformBudget(l, todayKey);
        return {
          ...l,
          offerText: generateOfferText(l) || l.offerText,
          shopName: s.shopName,
          sellerId: String(s._id),
          budgetStatus: {
            ...budgetStatus,
            effectiveDailySpent: getEffectiveDailySpent(l, todayKey),
          },
        };
      });

    const pos = new Map((order?.sellerIds || []).map((id, i) => [String(id), i]));
    rows.sort((a, b) => {
      const pa = pos.get(a.sellerId) ?? Infinity;
      const pb = pos.get(b.sellerId) ?? Infinity;
      if (pa !== pb) return pa < pb ? -1 : 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    return handleResponse(res, 200, "Zone listings fetched", {
      rows,
      offerGuardrails: financeSettings.offerGuardrails,
    });
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

export const updateAdminOfferConfig = async (req, res) => {
  try {
    const { sellerId } = req.params;
    if (!isObjectId(sellerId)) return handleResponse(res, 400, "Invalid seller id");

    const existing = await BestOfferListing.findOne({ sellerId }).lean();
    if (!existing) {
      return handleResponse(
        res,
        404,
        "Seller has not opted into Best Offers yet. Only sellers can create a seller-funded offer.",
      );
    }

    const { funding, budget, adminStatus } = req.body || {};
    const update = {};

    if (adminStatus !== undefined) {
      if (!["active", "hidden"].includes(adminStatus)) {
        return handleResponse(res, 400, "Invalid adminStatus");
      }
      update.adminStatus = adminStatus;
    }

    const financeSettings = await getOrCreateFinanceSettings();
    const guardrails = financeSettings.offerGuardrails || {};

    if (funding !== undefined) {
      const sellerPct = Number(funding.sellerPct);
      const platformPct = Number(funding.platformPct);
      if (
        !Number.isFinite(sellerPct) ||
        !Number.isFinite(platformPct) ||
        sellerPct < 0 ||
        sellerPct > 100 ||
        platformPct < 0 ||
        platformPct > 100 ||
        Math.abs(sellerPct + platformPct - 100) > 0.001
      ) {
        return handleResponse(res, 400, "sellerPct and platformPct must be between 0 and 100 and add up to 100");
      }

      // Only seller can opt into a higher seller share; admin cannot force seller share higher than seller configured
      if (sellerPct > Number(existing.funding?.sellerPct ?? 100)) {
        const commissionPct = await resolveSellerCommissionCeiling(sellerId, financeSettings);
        const floorCheck = validateOfferAgainstSellerFloor({
          discountType: existing.discountType,
          discountValue: existing.discountValue,
          maxDiscount: existing.maxDiscount,
          minOrderValue: existing.minOrderValue,
          sellerPct,
          commissionPct,
          minSellerPayoutPct: guardrails.minSellerPayoutPct ?? 60,
          commissionBase: guardrails.commissionBase || "discounted",
        });
        if (!floorCheck.ok) {
          return handleResponse(res, 400, floorCheck.message);
        }
      }

      update["funding.sellerPct"] = sellerPct;
      update["funding.platformPct"] = platformPct;
    }

    if (budget !== undefined) {
      if (budget.platformDailyCap !== undefined) {
        const dailyCap = parseOptionalNonNegativeNumber(budget.platformDailyCap);
        if (dailyCap === undefined) return handleResponse(res, 400, "Invalid platformDailyCap");
        update["budget.platformDailyCap"] = dailyCap === 0 ? null : dailyCap;
      }
      if (budget.platformTotalCap !== undefined) {
        const totalCap = parseOptionalNonNegativeNumber(budget.platformTotalCap);
        if (totalCap === undefined) return handleResponse(res, 400, "Invalid platformTotalCap");
        update["budget.platformTotalCap"] = totalCap === 0 ? null : totalCap;

        const spent = Number(existing.budget?.platformSpent || 0);
        if (
          existing.exhaustedReason === "TOTAL_BUDGET_EXHAUSTED" &&
          (totalCap === null || totalCap === 0 || totalCap > spent)
        ) {
          update.exhaustedReason = null;
          update.isEnabled = true;
        }
      }
    }

    const updated = await BestOfferListing.findOneAndUpdate(
      { sellerId },
      { $set: update },
      { new: true, runValidators: true },
    ).lean();

    const todayKey = getIstDateKey();
    return handleResponse(res, 200, "Offer config updated", {
      ...updated,
      offerText: generateOfferText(updated) || updated.offerText,
      budgetStatus: {
        ...getRemainingPlatformBudget(updated, todayKey),
        effectiveDailySpent: getEffectiveDailySpent(updated, todayKey),
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateOfferGuardrails = async (req, res) => {
  try {
    const {
      minPlatformMargin,
      minSellerPayoutPct,
      allowCouponStacking,
      commissionBase,
    } = req.body || {};

    const current = await getOrCreateFinanceSettings();
    const next = { ...(current.offerGuardrails || {}) };

    if (minPlatformMargin !== undefined) {
      const val = Number(minPlatformMargin);
      if (!Number.isFinite(val) || val < 0) {
        return handleResponse(res, 400, "minPlatformMargin must be a non-negative number");
      }
      next.minPlatformMargin = val;
    }
    if (minSellerPayoutPct !== undefined) {
      const val = Number(minSellerPayoutPct);
      if (!Number.isFinite(val) || val < 0 || val > 100) {
        return handleResponse(res, 400, "minSellerPayoutPct must be between 0 and 100");
      }
      next.minSellerPayoutPct = val;
    }
    if (allowCouponStacking !== undefined) {
      next.allowCouponStacking = Boolean(allowCouponStacking);
    }
    if (commissionBase !== undefined) {
      if (!["discounted", "original"].includes(commissionBase)) {
        return handleResponse(res, 400, "commissionBase must be 'discounted' or 'original'");
      }
      next.commissionBase = commissionBase;
    }

    await Setting.findOneAndUpdate(
      {},
      { $set: { offerGuardrails: next } },
      { upsert: true, new: true },
    );
    await invalidateFinanceSettingsCache();

    return handleResponse(res, 200, "Offer guardrails updated", next);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
