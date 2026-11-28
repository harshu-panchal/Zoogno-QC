import mongoose from "mongoose";
import BestOfferListing from "../models/bestOfferListing.js";
import Product from "../models/product.js";
import Category from "../models/category.js";
import Order from "../models/order.js";
import { roundCurrency } from "../utils/money.js";
import { resolveCommissionConfig } from "./finance/pricingService.js";
import { COMMISSION_TYPE } from "../constants/finance.js";

const OFFER_PRICE_HISTORY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns YYYY-MM-DD in Asia/Kolkata so daily budget resets at midnight IST.
 */
export function getIstDateKey(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}`;
  } catch {
    return new Date(date).toISOString().slice(0, 10);
  }
}

function formatRupee(n) {
  const num = Number(n || 0);
  return Number.isInteger(num) ? String(num) : num.toFixed(0);
}

/**
 * Generates customer-facing card text directly from structured offer fields
 * so the displayed offer always matches checkout behavior.
 */
export function generateOfferText({
  discountType = "percentage",
  discountValue = 0,
  maxDiscount = null,
  minOrderValue = 0,
} = {}) {
  const val = Number(discountValue || 0);
  if (!Number.isFinite(val) || val <= 0) return "";

  const maxCap = Number(maxDiscount || 0);
  const mov = Number(minOrderValue || 0);

  let text = "";
  if (discountType === "flat") {
    text = `₹${formatRupee(val)} OFF`;
    if (mov > 0) {
      text += ` above ₹${formatRupee(mov)}`;
    }
  } else {
    text = `${formatRupee(val)}% OFF`;
    if (maxCap > 0) {
      text += ` up to ₹${formatRupee(maxCap)}`;
    } else if (mov > 0) {
      text += ` above ₹${formatRupee(mov)}`;
    }
  }

  return text.slice(0, 60);
}

export function isOfferWindowActive(offer, now = new Date()) {
  if (!offer) return false;
  if (offer.startsAt && new Date(offer.startsAt) > now) return false;
  if (offer.endsAt && new Date(offer.endsAt) < now) return false;
  return true;
}

export function getEffectiveDailySpent(offer, todayKey = getIstDateKey()) {
  if (!offer?.budget) return 0;
  if (offer.budget.platformDailyDate !== todayKey) return 0;
  return roundCurrency(Math.max(0, Number(offer.budget.platformDailySpent || 0)));
}

export function getRemainingPlatformBudget(offer, todayKey = getIstDateKey()) {
  const platformPct = Number(offer?.funding?.platformPct ?? 0);
  if (platformPct <= 0) {
    return {
      hasPlatformFunding: false,
      remainingTotal: Infinity,
      remainingDaily: Infinity,
      remainingEffective: Infinity,
      dailyExhausted: false,
      totalExhausted: false,
    };
  }

  const totalCap = Number(offer?.budget?.platformTotalCap || 0);
  const dailyCap = Number(offer?.budget?.platformDailyCap || 0);
  const totalSpent = roundCurrency(Math.max(0, Number(offer?.budget?.platformSpent || 0)));
  const dailySpent = getEffectiveDailySpent(offer, todayKey);

  const remainingTotal = totalCap > 0 ? roundCurrency(Math.max(0, totalCap - totalSpent)) : Infinity;
  const remainingDaily = dailyCap > 0 ? roundCurrency(Math.max(0, dailyCap - dailySpent)) : Infinity;
  const remainingEffective = Math.min(remainingTotal, remainingDaily);

  return {
    hasPlatformFunding: true,
    remainingTotal,
    remainingDaily,
    remainingEffective,
    dailyExhausted: dailyCap > 0 && remainingDaily <= 0,
    totalExhausted: totalCap > 0 && remainingTotal <= 0,
  };
}

export function isOfferBudgetAvailable(offer, todayKey = getIstDateKey()) {
  const status = getRemainingPlatformBudget(offer, todayKey);
  if (!status.hasPlatformFunding) return true;
  return status.remainingEffective > 0;
}

export function isOfferStructurallyActive(offer, now = new Date(), todayKey = getIstDateKey()) {
  if (!offer) return false;
  if (offer.isEnabled === false) return false;
  if (offer.adminStatus === "hidden") return false;
  if (Number(offer.discountValue || 0) <= 0) return false;
  if (!isOfferWindowActive(offer, now)) return false;
  if (!isOfferBudgetAvailable(offer, todayKey)) return false;
  return true;
}

/**
 * Resolves the highest percentage commission rate applicable to a seller's
 * products (or the global commission rate when useGlobalBilling is enabled).
 */
export async function resolveSellerCommissionCeiling(sellerId, financeSettings = {}, { session = null } = {}) {
  if (financeSettings?.useGlobalBilling) {
    const type = financeSettings.globalCommissionType || COMMISSION_TYPE.PERCENTAGE;
    const val = Math.max(0, Number(financeSettings.globalCommissionValue || 0));
    return type === COMMISSION_TYPE.PERCENTAGE ? val : 0;
  }

  const prodQuery = Product.find({ sellerId, status: "active" })
    .select("subcategoryId")
    .lean();
  if (session) prodQuery.session(session);
  const products = await prodQuery;

  const subIds = Array.from(
    new Set(products.map((p) => String(p.subcategoryId || "")).filter(Boolean)),
  );
  if (!subIds.length) return 0;

  const catQuery = Category.find({ _id: { $in: subIds }, isCommissionActive: true })
    .select("adminCommission adminCommissionType adminCommissionValue adminCommissionFixedRule")
    .lean();
  if (session) catQuery.session(session);
  const categories = await catQuery;

  let maxPct = 0;
  for (const cat of categories) {
    const resolved = resolveCommissionConfig(cat);
    if (resolved.type === COMMISSION_TYPE.PERCENTAGE && resolved.value > maxPct) {
      maxPct = resolved.value;
    }
  }
  return maxPct;
}

/**
 * Validates that an offer configuration preserves the minimum seller payout floor
 * (`minSellerPayoutPct`% of order subtotal) across eligible order values.
 */
export function validateOfferAgainstSellerFloor({
  discountType = "percentage",
  discountValue = 0,
  maxDiscount = null,
  minOrderValue = 0,
  sellerPct = 100,
  commissionPct = 0,
  minSellerPayoutPct = 60,
  commissionBase = "discounted",
} = {}) {
  const val = Number(discountValue || 0);
  const mov = Math.max(0, Number(minOrderValue || 0));
  const maxCap = Number(maxDiscount || 0);
  const sPct = Math.min(100, Math.max(0, Number(sellerPct ?? 100))) / 100;
  const cRate = Math.min(100, Math.max(0, Number(commissionPct || 0))) / 100;
  const floorRatio = Math.min(100, Math.max(0, Number(minSellerPayoutPct ?? 60))) / 100;

  if (val <= 0 || sPct <= 0) {
    return { ok: true, worstCasePayoutPct: roundCurrency((1 - cRate) * 100) };
  }

  const computePayoutRatioAt = (subtotal) => {
    if (subtotal <= 0) return 0;
    let rawDiscount =
      discountType === "flat" ? val : (subtotal * val) / 100;
    if (discountType === "percentage" && maxCap > 0) {
      rawDiscount = Math.min(rawDiscount, maxCap);
    }
    rawDiscount = Math.min(rawDiscount, subtotal);

    const sellerShare = rawDiscount * sPct;
    const commBase =
      commissionBase === "original" ? subtotal : Math.max(0, subtotal - rawDiscount);
    const comm = commBase * cRate;
    const payout = subtotal - sellerShare - comm;
    return payout / subtotal;
  };

  let worstRatio;
  if (discountType === "flat") {
    if (mov <= 0) {
      return {
        ok: false,
        worstCasePayoutPct: 0,
        message: `Flat seller-funded discounts require a minimum order value so your payout stays at least ${minSellerPayoutPct}% of subtotal.`,
      };
    }
    worstRatio = computePayoutRatioAt(mov);
  } else {
    // Percentage offer: lowest payout ratio occurs at minOrderValue (or any subtotal <= maxDiscount/rate)
    // where the full percentage applies without hitting maxDiscount.
    const testSubtotal = mov > 0 ? mov : 1000;
    worstRatio = computePayoutRatioAt(testSubtotal);
    if (maxCap > 0 && mov > 0) {
      // Also verify the boundary where cap kicks in, just in case
      const capBoundary = val > 0 ? (maxCap * 100) / val : mov;
      if (capBoundary >= mov) {
        worstRatio = Math.min(worstRatio, computePayoutRatioAt(capBoundary));
      }
    }
  }

  const worstPct = roundCurrency(worstRatio * 100);
  if (worstRatio + 1e-6 < floorRatio) {
    return {
      ok: false,
      worstCasePayoutPct: worstPct,
      message: `This offer could reduce your payout to ${worstPct}% of the order value, below the ${minSellerPayoutPct}% minimum floor (after ~${roundCurrency(cRate * 100)}% commission). Lower the discount, raise minimum order value, or increase platform co-funding.`,
    };
  }

  return { ok: true, worstCasePayoutPct: worstPct };
}

/**
 * Checks customer-specific eligibility (`newUsersOnly`, `perUserLimit`) for an offer.
 */
export async function checkOfferCustomerEligibility(offer, { customerId = null, session = null } = {}) {
  if (!offer) return { eligible: false, reason: "NO_OFFER" };

  if (offer.newUsersOnly && customerId) {
    const query = Order.exists({
      customer: customerId,
      status: { $ne: "cancelled" },
      workflowStatus: { $ne: "CANCELLED" },
    });
    if (session) query.session(session);
    const hasPriorOrder = await query;
    if (hasPriorOrder) {
      return { eligible: false, reason: "NEW_USERS_ONLY" };
    }
  }

  const perUserLimit = Number(offer.perUserLimit || 0);
  if (perUserLimit > 0 && customerId) {
    const countQuery = Order.countDocuments({
      customer: customerId,
      status: { $ne: "cancelled" },
      workflowStatus: { $ne: "CANCELLED" },
      "paymentBreakdown.offerSnapshot.offerId": offer._id,
    });
    if (session) countQuery.session(session);
    const usedByUser = await countQuery;
    if (usedByUser >= perUserLimit) {
      return { eligible: false, reason: "PER_USER_LIMIT_REACHED" };
    }
  }

  return { eligible: true, reason: null };
}

/**
 * Computes raw offer discount and initial seller/platform funding split for a seller's subtotal.
 */
export function computeSellerOfferForSubtotal({
  offer,
  subtotal,
  todayKey = getIstDateKey(),
} = {}) {
  const zero = {
    applied: false,
    offerDiscount: 0,
    sellerFundedDiscount: 0,
    platformFundedOfferDiscount: 0,
    sellerPct: 100,
    platformPct: 0,
  };

  if (!offer || subtotal <= 0) return zero;
  const val = Number(offer.discountValue || 0);
  if (val <= 0) return zero;

  const minOrderValue = Number(offer.minOrderValue || 0);
  if (subtotal < minOrderValue) return zero;

  let rawDiscount =
    offer.discountType === "flat"
      ? val
      : roundCurrency((subtotal * val) / 100);

  const maxCap = Number(offer.maxDiscount || 0);
  if (offer.discountType === "percentage" && maxCap > 0) {
    rawDiscount = Math.min(rawDiscount, maxCap);
  }
  rawDiscount = roundCurrency(Math.min(rawDiscount, subtotal));
  if (rawDiscount <= 0) return zero;

  const sellerPct = Math.min(100, Math.max(0, Number(offer.funding?.sellerPct ?? 100)));
  const platformPct = roundCurrency(100 - sellerPct);

  let sellerFundedDiscount = roundCurrency((rawDiscount * sellerPct) / 100);
  let platformFundedOfferDiscount = roundCurrency(rawDiscount - sellerFundedDiscount);

  // Enforce remaining daily / total platform budget on platform share
  if (platformPct > 0 && platformFundedOfferDiscount > 0) {
    const budgetStatus = getRemainingPlatformBudget(offer, todayKey);
    if (budgetStatus.remainingEffective <= 0) {
      // Platform budget ran out — if 100% platform funded, offer cannot apply
      if (sellerPct <= 0) return zero;
      platformFundedOfferDiscount = 0;
    } else if (platformFundedOfferDiscount > budgetStatus.remainingEffective) {
      platformFundedOfferDiscount = roundCurrency(budgetStatus.remainingEffective);
    }
  }

  const effectiveOfferDiscount = roundCurrency(
    sellerFundedDiscount + platformFundedOfferDiscount,
  );
  if (effectiveOfferDiscount <= 0) return zero;

  return {
    applied: true,
    offerDiscount: effectiveOfferDiscount,
    sellerFundedDiscount,
    platformFundedOfferDiscount,
    sellerPct,
    platformPct,
  };
}

/**
 * Atomically increments `budget.platformSpent` (and `budget.platformDailySpent` for today)
 * with conditional cap guards so concurrent orders never overspend the platform budget.
 * Auto-disables `isEnabled` if `platformTotalCap` is exhausted.
 */
export async function reserveOfferBudgetAtomic({
  offerId,
  amount,
  todayKey = getIstDateKey(),
  session = null,
} = {}) {
  const spend = roundCurrency(amount || 0);
  if (!offerId || spend <= 0) return null;

  const opts = { new: true };
  if (session) opts.session = session;

  // Case A: Same IST day — increment both total and daily spent atomically
  const sameDayFilter = {
    _id: offerId,
    isEnabled: true,
    adminStatus: "active",
    "budget.platformDailyDate": todayKey,
    $and: [
      {
        $or: [
          { "budget.platformTotalCap": null },
          { "budget.platformTotalCap": { $lte: 0 } },
          {
            $expr: {
              $lte: [
                { $add: [{ $ifNull: ["$budget.platformSpent", 0] }, spend] },
                "$budget.platformTotalCap",
              ],
            },
          },
        ],
      },
      {
        $or: [
          { "budget.platformDailyCap": null },
          { "budget.platformDailyCap": { $lte: 0 } },
          {
            $expr: {
              $lte: [
                { $add: [{ $ifNull: ["$budget.platformDailySpent", 0] }, spend] },
                "$budget.platformDailyCap",
              ],
            },
          },
        ],
      },
    ],
  };

  let updated = await BestOfferListing.findOneAndUpdate(
    sameDayFilter,
    {
      $inc: {
        "budget.platformSpent": spend,
        "budget.platformDailySpent": spend,
      },
    },
    opts,
  );

  // Case B: New IST day (or first spend ever) — reset daily spent to `spend` and increment total
  if (!updated) {
    const newDayFilter = {
      _id: offerId,
      isEnabled: true,
      adminStatus: "active",
      "budget.platformDailyDate": { $ne: todayKey },
      $and: [
        {
          $or: [
            { "budget.platformTotalCap": null },
            { "budget.platformTotalCap": { $lte: 0 } },
            {
              $expr: {
                $lte: [
                  { $add: [{ $ifNull: ["$budget.platformSpent", 0] }, spend] },
                  "$budget.platformTotalCap",
                ],
              },
            },
          ],
        },
        {
          $or: [
            { "budget.platformDailyCap": null },
            { "budget.platformDailyCap": { $lte: 0 } },
            { "budget.platformDailyCap": { $gte: spend } },
          ],
        },
      ],
    };

    updated = await BestOfferListing.findOneAndUpdate(
      newDayFilter,
      {
        $set: {
          "budget.platformDailyDate": todayKey,
          "budget.platformDailySpent": spend,
        },
        $inc: {
          "budget.platformSpent": spend,
        },
      },
      opts,
    );
  }

  if (!updated) {
    const err = new Error("Best Offer platform budget has been exhausted. Please refresh checkout.");
    err.statusCode = 409;
    throw err;
  }

  // Turn off offer automatically when total budget runs out
  const totalCap = Number(updated.budget?.platformTotalCap || 0);
  if (totalCap > 0 && Number(updated.budget?.platformSpent || 0) >= totalCap) {
    await BestOfferListing.updateOne(
      { _id: updated._id },
      { $set: { isEnabled: false, exhaustedReason: "TOTAL_BUDGET_EXHAUSTED" } },
      session ? { session } : {},
    );
  }

  return updated;
}

/**
 * Refunds `platformSpent` back to the offer's budget when an unpaid (or pre-settlement)
 * order is cancelled. Atomic and idempotent via `paymentBreakdown.offerBudgetRefunded`.
 */
export async function refundOfferBudgetForCancelledOrder(orderOrId, { session = null } = {}) {
  const orderId = orderOrId?._id || orderOrId;
  if (!orderId) return null;

  const findOpts = session ? { session } : {};
  const existingOrder = await Order.findById(orderId)
    .select("paymentMode paymentStatus financeFlags paymentBreakdown")
    .setOptions(findOpts)
    .lean();

  if (!existingOrder) return null;

  const spent = roundCurrency(existingOrder.paymentBreakdown?.offerBudgetSpent || 0);
  const offerId = existingOrder.paymentBreakdown?.offerSnapshot?.offerId;
  if (spent <= 0 || !offerId || existingOrder.paymentBreakdown?.offerBudgetRefunded) {
    return null;
  }

  const isUnpaid =
    !existingOrder.financeFlags?.onlinePaymentCaptured &&
    !existingOrder.financeFlags?.codMarkedCollected &&
    existingOrder.paymentStatus !== "PAID";

  if (!isUnpaid && existingOrder.financeFlags?.deliveredSettlementApplied) {
    return null;
  }

  const claimed = await Order.findOneAndUpdate(
    {
      _id: orderId,
      "paymentBreakdown.offerBudgetSpent": { $gt: 0 },
      "paymentBreakdown.offerBudgetRefunded": { $ne: true },
    },
    { $set: { "paymentBreakdown.offerBudgetRefunded": true } },
    { new: true, ...(session ? { session } : {}) },
  );
  if (!claimed) return null;

  const offer = await BestOfferListing.findById(offerId).setOptions(findOpts).lean();
  if (!offer) return null;

  const budgetDateKey = existingOrder.paymentBreakdown?.offerSnapshot?.budgetDateKey;
  const nextTotalSpent = roundCurrency(Math.max(0, Number(offer.budget?.platformSpent || 0) - spent));
  const setUpdate = {
    "budget.platformSpent": nextTotalSpent,
  };

  if (budgetDateKey && offer.budget?.platformDailyDate === budgetDateKey) {
    setUpdate["budget.platformDailySpent"] = roundCurrency(
      Math.max(0, Number(offer.budget?.platformDailySpent || 0) - spent),
    );
  }

  const totalCap = Number(offer.budget?.platformTotalCap || 0);
  if (
    offer.exhaustedReason === "TOTAL_BUDGET_EXHAUSTED" &&
    offer.isEnabled === false &&
    totalCap > 0 &&
    nextTotalSpent < totalCap
  ) {
    setUpdate.isEnabled = true;
    setUpdate.exhaustedReason = null;
  }

  return BestOfferListing.findByIdAndUpdate(
    offerId,
    { $set: setUpdate },
    { new: true, ...(session ? { session } : {}) },
  );
}

/**
 * Computes proportional seller/platform discount reversal and net customer refund
 * for full or partial post-delivery returns.
 */
export function computeProportionalDiscountRefund(order, grossReturnValue) {
  const pb = order?.paymentBreakdown || {};
  const productSubtotal = roundCurrency(pb.productSubtotal || order?.pricing?.subtotal || 0);
  const gross = roundCurrency(Math.max(0, Number(grossReturnValue || 0)));

  const returnRatio =
    productSubtotal > 0
      ? Math.min(Math.max(gross / productSubtotal, 0), 1)
      : 1;

  const totalDiscount = roundCurrency(pb.discountTotal || order?.pricing?.discount || 0);
  let sellerFundedDiscount = roundCurrency(pb.sellerFundedDiscount || 0);
  let platformFundedDiscount = roundCurrency(pb.platformFundedDiscount || 0);

  // Backward compatibility: orders with legacy discountTotal but no explicit split were 100% platform funded
  if (totalDiscount > 0 && sellerFundedDiscount === 0 && platformFundedDiscount === 0) {
    platformFundedDiscount = totalDiscount;
  }

  const sellerShareReversed = roundCurrency(sellerFundedDiscount * returnRatio);
  const platformShareReversed = roundCurrency(platformFundedDiscount * returnRatio);
  const reversedTotal = roundCurrency(sellerShareReversed + platformShareReversed);
  const customerRefundAmount = roundCurrency(Math.max(0, gross - reversedTotal));

  return {
    returnRatio: Number(returnRatio.toFixed(6)),
    grossReturnValue: gross,
    sellerShareReversed,
    platformShareReversed,
    reversedTotal,
    customerRefundAmount,
  };
}

function effectiveUnitPrice(price, salePrice) {
  const sp = Number(salePrice || 0);
  const p = Number(price || 0);
  return sp > 0 ? sp : p;
}

/**
 * Appends a priceHistory snapshot (retaining up to 30 days) when a product is created or price-edited.
 */
export function buildUpdatedPriceHistory(existingHistory = [], { price, salePrice } = {}, now = new Date()) {
  const cutoff = now.getTime() - OFFER_PRICE_HISTORY_DAYS * DAY_MS;
  const pruned = (Array.isArray(existingHistory) ? existingHistory : []).filter((entry) => {
    const ts = entry?.recordedAt ? new Date(entry.recordedAt).getTime() : 0;
    return ts >= cutoff;
  });

  const eff = effectiveUnitPrice(price, salePrice);
  const latest = pruned[pruned.length - 1];
  if (
    latest &&
    Number(latest.price) === Number(price || 0) &&
    Number(latest.salePrice || 0) === Number(salePrice || 0) &&
    Number(latest.effectivePrice) === eff
  ) {
    return pruned;
  }

  return [
    ...pruned,
    {
      price: Number(price || 0),
      salePrice: Number(salePrice || 0),
      effectivePrice: eff,
      recordedAt: now,
    },
  ];
}

/**
 * Prevents sellers from inflating product prices while a Best Offer is active
 * (or above the 30-day lowest recorded price during an active offer).
 */
export async function assertSellerPriceNotLockedForOffer({
  sellerId,
  existingProduct,
  incomingData = {},
  role = "seller",
  now = new Date(),
} = {}) {
  if (role === "admin" || !sellerId || !existingProduct) return;

  const listing = await BestOfferListing.findOne({ sellerId }).lean();
  const offerActive = isOfferStructurallyActive(listing, now);
  if (!offerActive) return;

  const oldPrice = Number(existingProduct.price || 0);
  const oldSale = Number(existingProduct.salePrice || 0);
  const oldEff = effectiveUnitPrice(oldPrice, oldSale);

  const newPrice =
    incomingData.price !== undefined ? Number(incomingData.price) : oldPrice;
  const newSale =
    incomingData.salePrice !== undefined ? Number(incomingData.salePrice) : oldSale;
  const newEff = effectiveUnitPrice(newPrice, newSale);

  // Compare against both current price AND 30-day lowest price in priceHistory
  const cutoff = now.getTime() - OFFER_PRICE_HISTORY_DAYS * DAY_MS;
  const recentHistory = (Array.isArray(existingProduct.priceHistory) ? existingProduct.priceHistory : [])
    .filter((h) => h?.recordedAt && new Date(h.recordedAt).getTime() >= cutoff)
    .map((h) => Number(h.effectivePrice ?? effectiveUnitPrice(h.price, h.salePrice)))
    .filter((n) => Number.isFinite(n) && n > 0);
  const lowest30d = recentHistory.length ? Math.min(oldEff, ...recentHistory) : oldEff;

  if (newPrice > oldPrice || newSale > oldSale || newEff > lowest30d) {
    const err = new Error(
      "Product prices cannot be increased while a Best Offer is active (locked against 30-day lowest price). Disable your offer first.",
    );
    err.statusCode = 400;
    throw err;
  }

  if (Array.isArray(incomingData.variants)) {
    const existingVariants = Array.isArray(existingProduct.variants) ? existingProduct.variants : [];
    for (let i = 0; i < incomingData.variants.length; i += 1) {
      const nextVar = incomingData.variants[i] || {};
      const prevVar =
        existingVariants.find((v) => v.sku && nextVar.sku && v.sku === nextVar.sku) ||
        existingVariants[i];
      if (!prevVar) continue;
      const prevVarPrice = Number(prevVar.price || 0);
      const prevVarSale = Number(prevVar.salePrice || 0);
      const prevVarEff = effectiveUnitPrice(prevVarPrice, prevVarSale);
      const nextVarPrice = nextVar.price !== undefined ? Number(nextVar.price) : prevVarPrice;
      const nextVarSale = nextVar.salePrice !== undefined ? Number(nextVar.salePrice) : prevVarSale;
      const nextVarEff = effectiveUnitPrice(nextVarPrice, nextVarSale);
      if (nextVarPrice > prevVarPrice || nextVarSale > prevVarSale || nextVarEff > prevVarEff) {
        const err = new Error(
          `Variant price for "${nextVar.name || nextVar.sku || i + 1}" cannot be increased while a Best Offer is active.`,
        );
        err.statusCode = 400;
        throw err;
      }
    }
  }
}

export default {
  getIstDateKey,
  generateOfferText,
  isOfferWindowActive,
  getEffectiveDailySpent,
  getRemainingPlatformBudget,
  isOfferBudgetAvailable,
  isOfferStructurallyActive,
  resolveSellerCommissionCeiling,
  validateOfferAgainstSellerFloor,
  checkOfferCustomerEligibility,
  computeSellerOfferForSubtotal,
  reserveOfferBudgetAtomic,
  refundOfferBudgetForCancelledOrder,
  computeProportionalDiscountRefund,
  buildUpdatedPriceHistory,
  assertSellerPriceNotLockedForOffer,
};
