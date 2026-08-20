import Setting from "../../models/setting.js";
import {
  DELIVERY_PRICING_MODE,
  HANDLING_FEE_STRATEGY,
} from "../../constants/finance.js";
import { roundCurrency } from "../../utils/money.js";
import { buildKey, getOrSet, getTTL, invalidate } from "../cacheService.js";

const SETTINGS_CACHE_KEY = buildKey("finance", "settings");

const DEFAULT_FINANCE_SETTINGS = {
  deliveryPricingMode: DELIVERY_PRICING_MODE.DISTANCE_BASED,
  customerBaseDeliveryFee: 30,
  riderEarningType: 'fixed',
  riderFixedAmount: 20,
  riderBaseDistance: 4,
  riderBaseEarning: 25,
  riderExtraPerKm: 5,
  fixedDeliveryFee: 30,
  handlingFeeStrategy: HANDLING_FEE_STRATEGY.HIGHEST_CATEGORY_FEE,
  codEnabled: true,
  onlineEnabled: true,
  freeDeliveryThreshold: 0,
};

export function normalizeFinanceSettings(raw = {}) {
  const deliveryPricingMode =
    raw.deliveryPricingMode ||
    raw.pricingMode ||
    DEFAULT_FINANCE_SETTINGS.deliveryPricingMode;

  const customerBaseDeliveryFee = roundCurrency(
    raw.customerBaseDeliveryFee ?? raw.baseDeliveryCharge ?? DEFAULT_FINANCE_SETTINGS.customerBaseDeliveryFee,
  );

  const riderEarningType = raw.riderEarningType || DEFAULT_FINANCE_SETTINGS.riderEarningType;
  const riderFixedAmount = roundCurrency(raw.riderFixedAmount ?? DEFAULT_FINANCE_SETTINGS.riderFixedAmount);
  const riderBaseDistance = Number(raw.riderBaseDistance ?? DEFAULT_FINANCE_SETTINGS.riderBaseDistance);
  const riderBaseEarning = roundCurrency(raw.riderBaseEarning ?? DEFAULT_FINANCE_SETTINGS.riderBaseEarning);
  const riderExtraPerKm = roundCurrency(raw.riderExtraPerKm ?? DEFAULT_FINANCE_SETTINGS.riderExtraPerKm);

  const baseDistanceCapacityKm = Number(
    raw.baseDistanceCapacityKm ?? DEFAULT_FINANCE_SETTINGS.baseDistanceCapacityKm,
  );

  const incrementalKmSurcharge = roundCurrency(
    raw.incrementalKmSurcharge ?? DEFAULT_FINANCE_SETTINGS.incrementalKmSurcharge,
  );

  const fixedDeliveryFee = roundCurrency(
    raw.fixedDeliveryFee ?? raw.baseDeliveryCharge ?? customerBaseDeliveryFee,
  );

  const handlingFeeStrategy =
    raw.handlingFeeStrategy || DEFAULT_FINANCE_SETTINGS.handlingFeeStrategy;

  return {
    deliveryPricingMode,
    pricingMode: deliveryPricingMode,
    customerBaseDeliveryFee,
    riderEarningType,
    riderFixedAmount,
    riderBaseDistance: Number.isFinite(riderBaseDistance) ? Math.max(riderBaseDistance, 0) : DEFAULT_FINANCE_SETTINGS.riderBaseDistance,
    riderBaseEarning,
    riderExtraPerKm,
    baseDeliveryCharge: customerBaseDeliveryFee,
    baseDistanceCapacityKm: Number.isFinite(baseDistanceCapacityKm)
      ? Math.max(baseDistanceCapacityKm, 0)
      : DEFAULT_FINANCE_SETTINGS.baseDistanceCapacityKm,
    incrementalKmSurcharge,
    fixedDeliveryFee,
    handlingFeeStrategy,
    codEnabled: raw.codEnabled ?? DEFAULT_FINANCE_SETTINGS.codEnabled,
    onlineEnabled: raw.onlineEnabled ?? DEFAULT_FINANCE_SETTINGS.onlineEnabled,
    freeDeliveryThreshold: raw.freeDeliveryThreshold ?? DEFAULT_FINANCE_SETTINGS.freeDeliveryThreshold,
  };
}

async function loadFinanceSettings({ session } = {}) {
  const query = {};
  const options = session ? { session } : {};
  let settings = await Setting.findOne(query, null, options);

  if (!settings) {
    settings = await Setting.create(
      {
        ...DEFAULT_FINANCE_SETTINGS,
        pricingMode: DEFAULT_FINANCE_SETTINGS.deliveryPricingMode,
        baseDeliveryCharge: DEFAULT_FINANCE_SETTINGS.customerBaseDeliveryFee,
        fleetCommissionRatePerKm: DEFAULT_FINANCE_SETTINGS.deliveryPartnerRatePerKm,
      },
      options,
    );
  }

  const rawObj = settings.toObject?.() || settings;
  return {
    ...rawObj,
    ...normalizeFinanceSettings(rawObj)
  };
}

// This document rarely changes but was previously read fresh from Mongo on
// every single call (up to 2-3x per checkout pricing preview alone). Cached
// with the same TTL used for other slow-changing config elsewhere in the app,
// and invalidated immediately on save so admin changes take effect right away
// rather than waiting out the TTL.
//
// Calls made with a `session` (i.e. inside an existing DB transaction, such as
// order placement) bypass the cache entirely — those are rare, and reading
// through cache mid-transaction isn't worth the consistency risk for a config
// document this cheap to fetch directly.
export async function getOrCreateFinanceSettings({ session } = {}) {
  if (session) {
    return loadFinanceSettings({ session });
  }
  return getOrSet(SETTINGS_CACHE_KEY, () => loadFinanceSettings({}), getTTL("settings"));
}

export async function updateDeliveryFinanceSettings(payload, { session } = {}) {
  const normalized = normalizeFinanceSettings(payload || {});
  const query = {};
  const options = { upsert: true, new: true };
  if (session) options.session = session;

  const updated = await Setting.findOneAndUpdate(query, { $set: normalized }, options);
  await invalidate(SETTINGS_CACHE_KEY);
  return normalizeFinanceSettings(updated.toObject?.() || updated);
}

// The same Setting document also gets written by the generic platform-settings
// route (admin/settingsController.js updatePlatformSettings — global billing
// override, commission/handling/platform fee type+value) and by the
// centralized settings route (settingsController.js). Both write fields that
// getOrCreateFinanceSettings() reads, so both must invalidate this cache too,
// or an admin's change there would silently not take effect until the TTL
// expires.
export async function invalidateFinanceSettingsCache() {
  await invalidate(SETTINGS_CACHE_KEY);
}

export { DEFAULT_FINANCE_SETTINGS };
