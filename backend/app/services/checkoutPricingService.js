import Seller from "../models/seller.js";
import Category from "../models/category.js";
import BestOfferListing from "../models/bestOfferListing.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { HANDLING_FEE_STRATEGY } from "../constants/finance.js";
import {
  calculateHandlingFee,
  generateOrderPaymentBreakdown,
  hydrateOrderItems,
} from "./finance/pricingService.js";
import { getOrCreateFinanceSettings } from "./finance/financeSettingsService.js";
import { computeSurgeChargeForCheckout } from "./finance/surgeChargeService.js";
import { calculateCouponDiscount } from "./couponService.js";
import { getCachedRoute } from "./mapsRouteService.js";
import {
  checkOfferCustomerEligibility,
  computeSellerOfferForSubtotal,
  getIstDateKey,
  isOfferStructurallyActive,
} from "./bestOfferService.js";

function normalizeLocation(location = null) {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

export function groupHydratedItemsBySeller(hydratedItems = []) {
  const grouped = new Map();
  for (const item of hydratedItems) {
    const sellerId = String(item?.sellerId || "");
    if (!sellerId) {
      const err = new Error("Unable to resolve seller for one or more checkout items");
      err.statusCode = 400;
      throw err;
    }
    if (!grouped.has(sellerId)) {
      grouped.set(sellerId, []);
    }
    grouped.get(sellerId).push(item);
  }
  return grouped;
}

async function computeDistanceKmForSeller({ sellerId, addressLocation, session = null }) {
  const normalizedLocation = normalizeLocation(addressLocation);
  if (!normalizedLocation) return 0;

  const query = Seller.findById(sellerId).select("location serviceRadius shopName").lean();
  if (session) query.session(session);
  const seller = await query;
  if (!seller) {
    const err = new Error("Seller not found");
    err.statusCode = 404;
    throw err;
  }
  const coords = seller?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return 0;

  const [sellerLng, sellerLat] = coords;
  const originLatNum = Number(sellerLat);
  const originLngNum = Number(sellerLng);

  const route = await getCachedRoute(
    { lat: originLatNum, lng: originLngNum },
    { lat: normalizedLocation.lat, lng: normalizedLocation.lng },
    "driving"
  );

  let distanceKm = 0;

  if (route && route.distanceMeters != null) {
    distanceKm = Number((route.distanceMeters / 1000).toFixed(3));
  } else {
    const distanceInMeters = distanceMeters(
      normalizedLocation.lat,
      normalizedLocation.lng,
      originLatNum,
      originLngNum,
    );
    distanceKm = Number((distanceInMeters / 1000).toFixed(3));
  }
  
  const radius = Number(seller.serviceRadius || 5);
  if (distanceKm > radius) {
    const err = new Error(`${seller.shopName || "Store"} does not deliver to your current location (Distance: ${distanceKm}km, Service Radius: ${radius}km)`);
    err.statusCode = 400;
    throw err;
  }

  return distanceKm;
}

function sumField(rows, field) {
  return Number(
    rows.reduce((sum, row) => sum + Number(row?.[field] || 0), 0).toFixed(2),
  );
}

function round2(value) {
  return Number((Number(value || 0)).toFixed(2));
}

function buildAggregateBreakdown(sellerBreakdowns = []) {
  const aggregate = {
    currency: sellerBreakdowns[0]?.currency || "INR",
    productSubtotal: sumField(sellerBreakdowns, "productSubtotal"),
    mrpSubtotal: sumField(sellerBreakdowns, "mrpSubtotal"),
    itemDiscountTotal: sumField(sellerBreakdowns, "itemDiscountTotal"),
    deliveryFeeCharged: sumField(sellerBreakdowns, "deliveryFeeCharged"),
    handlingFeeCharged: sumField(sellerBreakdowns, "handlingFeeCharged"),
    platformFeeCharged: sumField(sellerBreakdowns, "platformFeeCharged"),
    surgeChargeCharged: sumField(sellerBreakdowns, "surgeChargeCharged"),
    surgeRuleName: sellerBreakdowns[0]?.surgeRuleName || null,
    tipTotal: sumField(sellerBreakdowns, "tipTotal"),
    discountTotal: sumField(sellerBreakdowns, "discountTotal"),
    offerDiscount: sumField(sellerBreakdowns, "offerDiscount"),
    couponDiscount: sumField(sellerBreakdowns, "couponDiscount"),
    sellerFundedDiscount: sumField(sellerBreakdowns, "sellerFundedDiscount"),
    platformFundedDiscount: sumField(sellerBreakdowns, "platformFundedDiscount"),
    platformFundedOfferDiscount: sumField(sellerBreakdowns, "platformFundedOfferDiscount"),
    platformFundedCouponDiscount: sumField(sellerBreakdowns, "platformFundedCouponDiscount"),
    offerSnapshot: sellerBreakdowns.find((b) => b?.offerSnapshot)?.offerSnapshot || null,
    couponSnapshot: sellerBreakdowns.find((b) => b?.couponSnapshot)?.couponSnapshot || null,
    grandTotal: sumField(sellerBreakdowns, "grandTotal"),
    sellerPayoutTotal: sumField(sellerBreakdowns, "sellerPayoutTotal"),
    adminProductCommissionTotal: sumField(sellerBreakdowns, "adminProductCommissionTotal"),
    riderPayoutBase: sumField(sellerBreakdowns, "riderPayoutBase"),
    riderPayoutDistance: sumField(sellerBreakdowns, "riderPayoutDistance"),
    riderPayoutBonus: sumField(sellerBreakdowns, "riderPayoutBonus"),
    riderTipAmount: sumField(sellerBreakdowns, "riderTipAmount"),
    riderPayoutTotal: sumField(sellerBreakdowns, "riderPayoutTotal"),
    platformLogisticsMargin: sumField(sellerBreakdowns, "platformLogisticsMargin"),
    platformTotalEarning: sumField(sellerBreakdowns, "platformTotalEarning"),
    codCollectedAmount: sumField(sellerBreakdowns, "codCollectedAmount"),
    codRemittedAmount: sumField(sellerBreakdowns, "codRemittedAmount"),
    codPendingAmount: sumField(sellerBreakdowns, "codPendingAmount"),
    distanceKmActual: sumField(sellerBreakdowns, "distanceKmActual"),
    distanceKmRounded: sumField(sellerBreakdowns, "distanceKmRounded"),
    snapshots: {
      perSeller: sellerBreakdowns.map((row, index) => ({
        index,
        sellerId: row.sellerId,
        snapshots: row.snapshots || {},
      })),
    },
    lineItems: sellerBreakdowns.flatMap((row) =>
      (Array.isArray(row.lineItems) ? row.lineItems : []).map((lineItem) => ({
        ...lineItem,
        sellerId: row.sellerId,
      })),
    ),
  };
  return aggregate;
}

function allocateCheckoutTipToSellerBreakdowns(
  sellerBreakdownEntries = [],
  totalTipAmount = 0,
) {
  const normalizedTip = round2(totalTipAmount);
  if (!Number.isFinite(normalizedTip) || normalizedTip <= 0 || sellerBreakdownEntries.length === 0) {
    return;
  }

  const totalBase = sellerBreakdownEntries.reduce(
    (sum, entry) => sum + Number(entry?.breakdown?.grandTotal || 0),
    0,
  );

  let allocatedSoFar = 0;
  sellerBreakdownEntries.forEach((entry, index) => {
    const breakdown = entry?.breakdown;
    if (!breakdown) return;

    let allocatedTip = 0;
    if (index === sellerBreakdownEntries.length - 1) {
      allocatedTip = round2(normalizedTip - allocatedSoFar);
    } else if (totalBase > 0) {
      allocatedTip = round2(
        (Number(breakdown.grandTotal || 0) / totalBase) * normalizedTip,
      );
      allocatedSoFar = round2(allocatedSoFar + allocatedTip);
    }

    breakdown.tipTotal = round2(Number(breakdown.tipTotal || 0) + allocatedTip);
    breakdown.riderTipAmount = round2(
      Number(breakdown.riderTipAmount || 0) + allocatedTip,
    );
    breakdown.riderPayoutTotal = round2(
      Number(breakdown.riderPayoutTotal || 0) + allocatedTip,
    );
    breakdown.grandTotal = round2(Number(breakdown.grandTotal || 0) + allocatedTip);
  });
}

async function computeGlobalHandlingFeeForCheckout(hydratedItems = [], { session = null } = {}) {
  const headerIds = Array.from(
    new Set(hydratedItems.map((item) => String(item?.headerCategoryId || "")).filter(Boolean)),
  );
  if (headerIds.length === 0) {
    return {
      handlingFeeCharged: 0,
      handlingCategoryUsed: null,
    };
  }

  const categoryQuery = Category.find({ _id: { $in: headerIds } })
    .select("_id name handlingFees handlingFeeType handlingFeeValue")
    .lean();
  if (session) categoryQuery.session(session);
  const categories = await categoryQuery;
  const categoryById = new Map(categories.map((category) => [String(category._id), category]));

  const handling = calculateHandlingFee(hydratedItems, {
    handlingFeeStrategy: HANDLING_FEE_STRATEGY.HIGHEST_CATEGORY_FEE,
    categoryById,
  });

  return {
    handlingFeeCharged: Number(handling.handlingFeeCharged || 0),
    handlingCategoryUsed: handling.handlingCategoryUsed || null,
  };
}

function applyGlobalHandlingFeeToSellerBreakdowns(
  sellerBreakdownEntries = [],
  globalHandling = { handlingFeeCharged: 0, handlingCategoryUsed: null },
) {
  const fee = Number(globalHandling?.handlingFeeCharged || 0);
  if (!Number.isFinite(fee) || fee <= 0 || sellerBreakdownEntries.length === 0) return;

  const usedHeaderId = String(globalHandling?.handlingCategoryUsed?.headerCategoryId || "");
  let chosenSellerId = null;
  if (usedHeaderId) {
    for (const entry of sellerBreakdownEntries) {
      const entryItems = Array.isArray(entry?.items) ? entry.items : [];
      if (entryItems.some((item) => String(item?.headerCategoryId || "") === usedHeaderId)) {
        chosenSellerId = entry.sellerId;
        break;
      }
    }
  }
  if (!chosenSellerId) {
    chosenSellerId = sellerBreakdownEntries[0]?.sellerId || null;
  }

  for (const entry of sellerBreakdownEntries) {
    const breakdown = entry?.breakdown;
    if (!breakdown) continue;

    const shouldCharge = chosenSellerId && entry.sellerId === chosenSellerId;
    const handlingFeeCharged = shouldCharge ? fee : 0;

    breakdown.handlingFeeCharged = handlingFeeCharged;
    breakdown.snapshots = breakdown.snapshots && typeof breakdown.snapshots === "object"
      ? breakdown.snapshots
      : {};
    breakdown.snapshots.handlingFeeStrategy = HANDLING_FEE_STRATEGY.HIGHEST_CATEGORY_FEE;
    breakdown.snapshots.handlingCategoryUsed = shouldCharge
      ? globalHandling.handlingCategoryUsed || {}
      : {};

    const productSubtotal = Number(breakdown.productSubtotal || 0);
    const deliveryFeeCharged = Number(breakdown.deliveryFeeCharged || 0);
    const discountTotal = Number(breakdown.discountTotal || 0);
    const surgeChargeCharged = Number(breakdown.surgeChargeCharged || 0);
    const platformFeeCharged = Number(breakdown.platformFeeCharged || 0);

    breakdown.grandTotal = round2(
      Math.max(
        0,
        productSubtotal + deliveryFeeCharged + handlingFeeCharged + surgeChargeCharged + platformFeeCharged - discountTotal,
      ),
    );
    // Bug fix (pre-existing, unrelated to the perf pass): these previously referenced
    // bare `riderPayoutTotal`/`adminProductCommissionTotal` identifiers that don't exist
    // in this function's scope, throwing a ReferenceError whenever a positive global
    // handling fee applied to a multi-seller checkout preview.
    breakdown.platformLogisticsMargin = round2(
      deliveryFeeCharged + handlingFeeCharged + surgeChargeCharged + platformFeeCharged - Number(breakdown.riderPayoutTotal || 0),
    );
    breakdown.platformTotalEarning = round2(
      Number(breakdown.adminProductCommissionTotal || 0) +
        breakdown.platformLogisticsMargin -
        Number(breakdown.platformFundedDiscount || 0),
    );
  }
}

export async function buildCheckoutPricingSnapshot({
  orderItems = [],
  address = {},
  tipAmount = 0,
  discountTotal = 0,
  couponCode = null,
  customerId = null,
  session = null,
}) {
  const hydratedItems = await hydrateOrderItems(orderItems, {
    session,
    enforceServerPricing: true,
  });
  if (!hydratedItems.length) {
    const err = new Error("Cannot checkout with empty cart");
    err.statusCode = 400;
    throw err;
  }

  const itemsBySeller = groupHydratedItemsBySeller(hydratedItems);
  const sellerIds = Array.from(itemsBySeller.keys()).sort((a, b) => a.localeCompare(b));
  const sellerBreakdownEntries = [];

  const [globalHandling, financeSettings] = await Promise.all([
    computeGlobalHandlingFeeForCheckout(hydratedItems, { session }),
    getOrCreateFinanceSettings({ session }),
  ]);

  const offerGuardrails = financeSettings?.offerGuardrails || {};
  const minPlatformMargin = Math.max(0, Number(offerGuardrails.minPlatformMargin ?? 5));
  const minSellerPayoutPct = Math.min(100, Math.max(0, Number(offerGuardrails.minSellerPayoutPct ?? 60)));
  const allowCouponStacking = offerGuardrails.allowCouponStacking !== false;
  const commissionBase = offerGuardrails.commissionBase === "original" ? "original" : "discounted";

  // Pre-compute each seller's subtotal for offer evaluation & coupon distribution
  const sellerSubtotals = new Map();
  let totalSubtotal = 0;
  for (const sellerId of sellerIds) {
    const items = itemsBySeller.get(sellerId) || [];
    const subtotal = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
    sellerSubtotals.set(sellerId, round2(subtotal));
    totalSubtotal = round2(totalSubtotal + subtotal);
  }

  // Step 1: Look up and compute each seller's automatic active BestOfferListing
  const now = new Date();
  const todayKey = getIstDateKey(now);
  const offerQuery = BestOfferListing.find({
    sellerId: { $in: sellerIds },
    isEnabled: true,
    adminStatus: "active",
    discountValue: { $gt: 0 },
  }).lean();
  if (session) offerQuery.session(session);
  const sellerOffers = await offerQuery;
  const offerBySellerId = new Map(sellerOffers.map((o) => [String(o.sellerId), o]));

  const sellerOfferResults = new Map();
  let totalOfferDiscount = 0;

  for (const sellerId of sellerIds) {
    const offer = offerBySellerId.get(sellerId);
    const subtotal = sellerSubtotals.get(sellerId) || 0;
    let computed = {
      applied: false,
      offerDiscount: 0,
      sellerFundedDiscount: 0,
      platformFundedOfferDiscount: 0,
      sellerPct: 100,
      platformPct: 0,
      offerSnapshot: null,
    };

    if (offer && isOfferStructurallyActive(offer, now, todayKey)) {
      const eligibility = await checkOfferCustomerEligibility(offer, { customerId, session });
      if (eligibility.eligible) {
        const res = computeSellerOfferForSubtotal({ offer, subtotal, todayKey });
        if (res.applied) {
          computed = {
            ...res,
            offerSnapshot: {
              offerId: offer._id,
              offerText: offer.offerText || "",
              discountType: offer.discountType,
              discountValue: offer.discountValue,
              maxDiscount: offer.maxDiscount ?? null,
              minOrderValue: offer.minOrderValue || 0,
              sellerPct: res.sellerPct,
              platformPct: res.platformPct,
              commissionBase,
              budgetDateKey: todayKey,
            },
          };
          totalOfferDiscount = round2(totalOfferDiscount + res.offerDiscount);
        }
      }
    }
    sellerOfferResults.set(sellerId, computed);
  }

  // Step 2: Stacking rule & admin coupon on the remaining amount after seller offers
  let verifiedCouponDiscount = 0;
  let hasFreeDeliveryCoupon = false;
  let couponMeta = null;
  if (couponCode) {
    if (!allowCouponStacking && totalOfferDiscount > 0) {
      const err = new Error("Coupons cannot be stacked with an active store Best Offer");
      err.statusCode = 400;
      throw err;
    }
    try {
      const remainingCartTotal = round2(Math.max(0, totalSubtotal - totalOfferDiscount));
      const couponResult = await calculateCouponDiscount({
        code: couponCode,
        cartTotal: remainingCartTotal,
        items: hydratedItems,
        customerId,
        lat: address?.location?.lat,
        lng: address?.location?.lng,
      });
      verifiedCouponDiscount = round2(couponResult.discountAmount || 0);
      hasFreeDeliveryCoupon = couponResult.freeDelivery === true;
      couponMeta = {
        couponId: couponResult.couponId || null,
        code: couponResult.code || String(couponCode).toUpperCase(),
        discountAmount: verifiedCouponDiscount,
      };
    } catch (e) {
      const err = new Error("Invalid or inapplicable coupon: " + e.message);
      err.statusCode = 400;
      throw err;
    }
  }

  // Step 3: Build per-seller breakdowns with seller floor safety net
  const remainingSubtotalAfterOffers = round2(Math.max(0, totalSubtotal - totalOfferDiscount));

  async function buildSellerEntry(sellerId) {
    const sellerItems = itemsBySeller.get(sellerId) || [];
    const distanceKm = await computeDistanceKmForSeller({
      sellerId,
      addressLocation: address?.location,
      session,
    });

    const sellerSub = sellerSubtotals.get(sellerId) || 0;
    const offerRes = sellerOfferResults.get(sellerId) || {
      applied: false,
      offerDiscount: 0,
      sellerFundedDiscount: 0,
      platformFundedOfferDiscount: 0,
      sellerPct: 100,
      platformPct: 0,
      offerSnapshot: null,
    };

    const sellerRemaining = round2(Math.max(0, sellerSub - offerRes.offerDiscount));
    const sellerRatio =
      remainingSubtotalAfterOffers > 0
        ? sellerRemaining / remainingSubtotalAfterOffers
        : totalSubtotal > 0
        ? sellerSub / totalSubtotal
        : 1 / sellerIds.length;
    const sellerCouponDiscount = round2(verifiedCouponDiscount * sellerRatio);

    let offerDiscountVal = offerRes.offerDiscount;
    let sellerFundedVal = offerRes.sellerFundedDiscount;
    let platformOfferVal = offerRes.platformFundedOfferDiscount;
    let offerSnapshotVal = offerRes.offerSnapshot;

    const buildBreakdownFor = (od, sf, po) =>
      generateOrderPaymentBreakdown({
        preHydratedItems: sellerItems,
        distanceKm,
        offerDiscount: od,
        couponDiscount: sellerCouponDiscount,
        sellerFundedDiscount: sf,
        platformFundedOfferDiscount: po,
        platformFundedCouponDiscount: sellerCouponDiscount,
        commissionBase,
        offerSnapshot: od > 0 ? offerSnapshotVal : null,
        couponSnapshot:
          sellerCouponDiscount > 0 && couponMeta
            ? { ...couponMeta, discountAmount: sellerCouponDiscount }
            : null,
        deliverySettings: financeSettings,
        session,
      });

    let breakdown = await buildBreakdownFor(offerDiscountVal, sellerFundedVal, platformOfferVal);

    // Seller payout floor safety net: sellerPayoutTotal >= minSellerPayoutPct% of productSubtotal
    const minAllowedSellerPayout = round2((breakdown.productSubtotal * minSellerPayoutPct) / 100);
    let floorAttempts = 0;
    while (
      floorAttempts < 5 &&
      offerRes.applied &&
      sellerFundedVal > 0 &&
      breakdown.sellerPayoutTotal < minAllowedSellerPayout
    ) {
      floorAttempts += 1;
      const shortfall = round2(minAllowedSellerPayout - breakdown.sellerPayoutTotal);
      const discBase = Math.max(1, Number(breakdown.productSubtotal || 0) - offerDiscountVal);
      const effectiveCommRate =
        commissionBase === "discounted"
          ? Math.min(0.9, Math.max(0, Number(breakdown.adminProductCommissionTotal || 0) / discBase))
          : 0;
      const neededDrop = Math.max(0.01, round2(shortfall / Math.max(0.1, 1 - effectiveCommRate)));
      const nextSellerFunded = round2(Math.max(0, sellerFundedVal - neededDrop));
      const scale = sellerFundedVal > 0 ? nextSellerFunded / sellerFundedVal : 0;
      offerDiscountVal = round2(offerDiscountVal * scale);
      sellerFundedVal = nextSellerFunded;
      platformOfferVal = round2(Math.max(0, offerDiscountVal - sellerFundedVal));
      breakdown = await buildBreakdownFor(offerDiscountVal, sellerFundedVal, platformOfferVal);
    }

    const surge = await computeSurgeChargeForCheckout(sellerItems, address, breakdown.productSubtotal, { session });
    breakdown.surgeChargeCharged = surge.surgeChargeCharged;
    breakdown.surgeRuleName = surge.surgeRuleName;
    breakdown.grandTotal = round2(Math.max(0, Number(breakdown.grandTotal) + surge.surgeChargeCharged));
    breakdown.platformLogisticsMargin = round2(Number(breakdown.platformLogisticsMargin) + surge.surgeChargeCharged);
    breakdown.platformTotalEarning = round2(Number(breakdown.platformTotalEarning) + surge.surgeChargeCharged);

    return {
      sellerId,
      distanceKm,
      items: sellerItems,
      breakdown: {
        ...breakdown,
        sellerId,
      },
    };
  }

  if (session) {
    for (const sellerId of sellerIds) {
      sellerBreakdownEntries.push(await buildSellerEntry(sellerId));
    }
  } else {
    sellerBreakdownEntries.push(...(await Promise.all(sellerIds.map(buildSellerEntry))));
  }

  applyGlobalHandlingFeeToSellerBreakdowns(sellerBreakdownEntries, globalHandling);
  allocateCheckoutTipToSellerBreakdowns(sellerBreakdownEntries, tipAmount);

  // Apply Free Delivery (Threshold OR Coupon)
  const freeDeliveryThreshold = financeSettings?.freeDeliveryThreshold || 0;
  const meetsThreshold = freeDeliveryThreshold > 0 && totalSubtotal >= freeDeliveryThreshold;

  if (meetsThreshold || hasFreeDeliveryCoupon) {
    for (const entry of sellerBreakdownEntries) {
      if (entry.breakdown) {
        const bd = entry.breakdown;
        bd.deliveryFeeCharged = 0;

        const productSubtotal = Number(bd.productSubtotal || 0);
        const handlingFeeCharged = Number(bd.handlingFeeCharged || 0);
        const discountVal = Number(bd.discountTotal || 0);
        const riderPayoutTotal = Number(bd.riderPayoutTotal || 0);
        const adminProductCommissionTotal = Number(bd.adminProductCommissionTotal || 0);
        const surgeChargeCharged = Number(bd.surgeChargeCharged || 0);
        const platformFeeCharged = Number(bd.platformFeeCharged || 0);
        const tipTotal = Number(bd.tipTotal || 0);
        const platformFunded = Number(bd.platformFundedDiscount || 0);

        bd.grandTotal = round2(
          Math.max(
            0,
            productSubtotal +
              bd.deliveryFeeCharged +
              handlingFeeCharged +
              surgeChargeCharged +
              platformFeeCharged -
              discountVal +
              tipTotal,
          ),
        );
        bd.platformLogisticsMargin = round2(
          bd.deliveryFeeCharged +
            handlingFeeCharged +
            surgeChargeCharged +
            platformFeeCharged -
            riderPayoutTotal,
        );
        bd.platformTotalEarning = round2(
          adminProductCommissionTotal + bd.platformLogisticsMargin - platformFunded,
        );

        bd.snapshots = bd.snapshots || {};
        if (meetsThreshold) bd.snapshots.appliedFreeDeliveryThreshold = freeDeliveryThreshold;
        if (hasFreeDeliveryCoupon) bd.snapshots.appliedFreeDeliveryCoupon = true;
      }
    }
  }

  // Step 4: Platform minimum margin guardrail on combined platform share (offer + coupon)
  for (const entry of sellerBreakdownEntries) {
    const bd = entry?.breakdown;
    if (!bd) continue;

    const rawPlatformOffer = round2(Number(bd.platformFundedOfferDiscount || 0));
    const rawPlatformCoupon = round2(Number(bd.platformFundedCouponDiscount || 0));
    const combinedRawPlatform = round2(rawPlatformOffer + rawPlatformCoupon);
    if (combinedRawPlatform <= 0) continue;

    const preDiscountPlatformEarning = round2(
      Number(bd.adminProductCommissionTotal || 0) + Number(bd.platformLogisticsMargin || 0),
    );
    const maxAllowedPlatform = round2(Math.max(0, preDiscountPlatformEarning - minPlatformMargin));

    if (combinedRawPlatform > maxAllowedPlatform) {
      const cappedPlatformOffer = round2(Math.min(rawPlatformOffer, maxAllowedPlatform));
      const remainingCap = round2(Math.max(0, maxAllowedPlatform - cappedPlatformOffer));
      const cappedPlatformCoupon = round2(Math.min(rawPlatformCoupon, remainingCap));
      const cappedPlatformTotal = round2(cappedPlatformOffer + cappedPlatformCoupon);

      // If platform offer share shrank and commission was computed on discounted price,
      // recompute product commissions with the capped offerDiscount so numbers stay exact.
      if (cappedPlatformOffer !== rawPlatformOffer && commissionBase === "discounted") {
        const cappedOfferDiscount = round2(
          Number(bd.sellerFundedDiscount || 0) + cappedPlatformOffer,
        );
        const recomputed = await generateOrderPaymentBreakdown({
          preHydratedItems: entry.items,
          distanceKm: entry.distanceKm,
          offerDiscount: cappedOfferDiscount,
          couponDiscount: cappedPlatformCoupon,
          sellerFundedDiscount: Number(bd.sellerFundedDiscount || 0),
          platformFundedOfferDiscount: cappedPlatformOffer,
          platformFundedCouponDiscount: cappedPlatformCoupon,
          commissionBase,
          offerSnapshot: cappedOfferDiscount > 0 ? bd.offerSnapshot : null,
          couponSnapshot:
            cappedPlatformCoupon > 0 && bd.couponSnapshot
              ? { ...bd.couponSnapshot, discountAmount: cappedPlatformCoupon }
              : null,
          deliverySettings: financeSettings,
          session,
        });
        bd.lineItems = recomputed.lineItems;
        bd.adminProductCommissionTotal = recomputed.adminProductCommissionTotal;
        bd.sellerPayoutTotal = recomputed.sellerPayoutTotal;
        bd.offerDiscount = cappedOfferDiscount;
        bd.offerSnapshot = recomputed.offerSnapshot;
      } else {
        bd.offerDiscount = round2(Number(bd.sellerFundedDiscount || 0) + cappedPlatformOffer);
      }

      bd.platformFundedOfferDiscount = cappedPlatformOffer;
      bd.offerBudgetSpent = cappedPlatformOffer;
      bd.platformFundedCouponDiscount = cappedPlatformCoupon;
      bd.couponDiscount = cappedPlatformCoupon;
      if (bd.couponSnapshot) {
        bd.couponSnapshot =
          cappedPlatformCoupon > 0
            ? { ...bd.couponSnapshot, discountAmount: cappedPlatformCoupon }
            : null;
      }
      bd.platformFundedDiscount = cappedPlatformTotal;
      bd.discountTotal = round2(Number(bd.offerDiscount || 0) + cappedPlatformCoupon);

      bd.grandTotal = round2(
        Math.max(
          0,
          Number(bd.productSubtotal || 0) +
            Number(bd.deliveryFeeCharged || 0) +
            Number(bd.handlingFeeCharged || 0) +
            Number(bd.surgeChargeCharged || 0) +
            Number(bd.platformFeeCharged || 0) -
            bd.discountTotal +
            Number(bd.tipTotal || 0),
        ),
      );
      bd.platformTotalEarning = round2(
        Number(bd.adminProductCommissionTotal || 0) +
          Number(bd.platformLogisticsMargin || 0) -
          cappedPlatformTotal,
      );
      bd.snapshots = bd.snapshots || {};
      bd.snapshots.platformMarginCapped = true;
      bd.snapshots.minPlatformMarginApplied = minPlatformMargin;
    }
  }

  const aggregateBreakdown = buildAggregateBreakdown(
    sellerBreakdownEntries.map((entry) => entry.breakdown),
  );

  return {
    hydratedItems,
    sellerBreakdownEntries,
    aggregateBreakdown,
    sellerCount: sellerBreakdownEntries.length,
    itemCount: hydratedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  };
}

export default {
  buildCheckoutPricingSnapshot,
  groupHydratedItemsBySeller,
};
