/**
 * gstConfigService.js
 *
 * Helpers for GST configuration:
 *  - Loading GST config from Setting
 *  - State code resolution (from GSTIN or address)
 *  - Supply type determination (intra/inter-state → CGST+SGST or IGST)
 *  - Financial year & tax period computation
 *  - Sequential invoice number generation
 *  - Tax amount computation (IGST vs CGST+SGST split)
 */

import Setting from "../../models/setting.js";
import Counter from "../../models/counter.js";
import {
  GST_STATE_CODES,
  UNION_TERRITORY_CODES,
  INVOICE_SERIES,
} from "../../constants/finance.js";
import { buildKey, getOrSet, getTTL, invalidate } from "../cacheService.js";
import { roundCurrency } from "../../utils/money.js";

const GST_CONFIG_CACHE_KEY = buildKey("gst", "config");

// ─────────────────────────────────────────────────────────────────────────────
// Config Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load the gstConfig sub-document from Setting.
 * Returns a normalized object with safe defaults.
 */
export async function getGstConfig({ bypassCache = false } = {}) {
  const loader = async () => {
    const setting = await Setting.findOne({}).lean();
    const raw = setting?.gstConfig || {};
    return normalizeGstConfig(raw, setting);
  };

  if (bypassCache) return loader();
  return getOrSet(GST_CONFIG_CACHE_KEY, loader, getTTL("settings"));
}

/**
 * Normalize raw gstConfig from DB with safe defaults.
 */
export function normalizeGstConfig(raw = {}, setting = {}) {
  return {
    zoognoGstin: raw.zoognoGstin || setting?.gstin || "",
    zoognoLegalName: raw.zoognoLegalName || setting?.companyName || "Zoogno",
    zoognoStateCode: raw.zoognoStateCode || "",
    zoognoState: raw.zoognoState || "",

    // Separate TCS GSTIN (Section 52)
    tcsGstin: raw.tcsGstin || raw.zoognoGstin || setting?.gstin || "",
    tcsStateName: raw.tcsStateName || "",

    defaultEcoTaxMechanism: raw.defaultEcoTaxMechanism || "SECTION_52_TCS",
    tcsRate: raw.tcsRate ?? 1,

    platformFeeSac: raw.platformFeeSac || "998599",
    platformFeeGstRate: raw.platformFeeGstRate ?? 18,
    platformFeeDescription: raw.platformFeeDescription || "Online Marketplace Services",

    deliveryFeeSac: raw.deliveryFeeSac || "996813",
    deliveryFeeGstRate: raw.deliveryFeeGstRate ?? 18,
    deliveryFeeDescription: raw.deliveryFeeDescription || "Local Delivery of Goods",

    handlingFeeSac: raw.handlingFeeSac || "996711",
    handlingFeeGstRate: raw.handlingFeeGstRate ?? 18,
    handlingFeeDescription: raw.handlingFeeDescription || "Packaging and Handling Charges",

    commissionSac: raw.commissionSac || "998599",
    commissionGstRate: raw.commissionGstRate ?? 18,
    commissionDescription: raw.commissionDescription || "Marketplace Commission",

    fyStartMonth: raw.fyStartMonth ?? 4,
    eInvoiceThreshold: raw.eInvoiceThreshold ?? 50000000,
  };
}

/**
 * Save updated gstConfig to Setting and invalidate cache.
 */
export async function updateGstConfig(updates = {}) {
  const updatePayload = {};
  for (const [key, val] of Object.entries(updates)) {
    updatePayload[`gstConfig.${key}`] = val;
  }
  await Setting.findOneAndUpdate({}, { $set: updatePayload }, { upsert: true, new: true });
  await invalidate(GST_CONFIG_CACHE_KEY);
  return getGstConfig({ bypassCache: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// State Code Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive 2-digit state code from a valid GSTIN.
 * GSTIN format: 2-digit state code + 13 chars = 15 chars total.
 * Returns null if GSTIN is invalid/missing.
 */
export function stateCodeFromGstin(gstin) {
  if (!gstin || typeof gstin !== "string") return null;
  const clean = gstin.trim().toUpperCase();
  if (clean.length < 2) return null;
  const code = clean.slice(0, 2);
  return GST_STATE_CODES[code] ? code : null;
}

/**
 * Get state name from a 2-digit state code.
 */
export function stateNameFromCode(code) {
  if (!code) return "";
  return GST_STATE_CODES[String(code).padStart(2, "0")] || "";
}

/**
 * Validate a GSTIN format (basic regex check, not API lookup).
 * Format: 2 digits + 10-char PAN + 1 entity code + Z + 1 checksum
 */
export function isValidGstin(gstin) {
  if (!gstin || typeof gstin !== "string") return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.trim().toUpperCase());
}

/**
 * Determine if a state code is a Union Territory (UTGST applies instead of SGST).
 */
export function isUnionTerritory(stateCode) {
  return UNION_TERRITORY_CODES.includes(String(stateCode));
}

// ─────────────────────────────────────────────────────────────────────────────
// Supply Type & Tax Computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine supply type and compute IGST vs CGST+SGST/UTGST split.
 *
 * Rules:
 *  - Same state (supplier state = place of supply) → CGST + SGST (or UTGST for UT)
 *  - Different state → IGST
 *
 * @param {string} supplierStateCode - 2-digit code of supplier
 * @param {string} posCode - 2-digit Place of Supply code
 * @param {number} taxableValue - Amount before GST
 * @param {number} gstRate - Total GST rate (e.g. 18)
 * @param {string} customerGstin - Customer's GSTIN (if B2B)
 * @returns {object} Tax breakdown
 */
export function computeTaxBreakdown({ supplierStateCode, posCode, taxableValue, gstRate, customerGstin }) {
  const isInterState = supplierStateCode && posCode && supplierStateCode !== posCode;
  const isUT = isUnionTerritory(posCode);
  const isB2B = Boolean(customerGstin);

  const halfRate = roundCurrency(gstRate / 2);
  const igstRate = isInterState ? gstRate : 0;
  const cgstRate = !isInterState ? halfRate : 0;
  const sgstRate = !isInterState ? halfRate : 0;

  const taxable = roundCurrency(taxableValue || 0);
  const igstAmt = isInterState ? roundCurrency((taxable * gstRate) / 100) : 0;
  const cgstAmt = !isInterState ? roundCurrency((taxable * cgstRate) / 100) : 0;
  const sgstAmt = !isInterState ? roundCurrency((taxable * sgstRate) / 100) : 0;
  const totalGst = roundCurrency(igstAmt + cgstAmt + sgstAmt);

  return {
    isInterState: Boolean(isInterState),
    isUnionTerritory: isUT,
    isB2B,
    gstRate,
    igstRate,
    cgstRate,
    sgstRate,
    igstAmount: igstAmt,
    cgstAmount: cgstAmt,
    sgstAmount: sgstAmt,
    isUTGST: isUT && !isInterState,
    gstAmount: totalGst,
    invoiceTotal: roundCurrency(taxable + totalGst),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial Year & Tax Period
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Compute financial year string for a given date.
 * India FY: April to March.
 * e.g. date = 2026-08-24 → "2026-27"
 *      date = 2026-01-15 → "2025-26"
 */
export function computeFinancialYear(date, fyStartMonth = 4) {
  const d = date instanceof Date ? date : new Date(date);
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();

  let fyStart, fyEnd;
  if (month >= fyStartMonth) {
    fyStart = year;
    fyEnd = year + 1;
  } else {
    fyStart = year - 1;
    fyEnd = year;
  }
  return `${fyStart}-${String(fyEnd).slice(-2)}`;
}

/**
 * Compute tax period (month-year string) for a given date.
 * e.g. date = 2026-08-24 → "Aug-2026"
 */
export function computeTaxPeriod(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${MONTH_NAMES[d.getMonth()]}-${d.getFullYear()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sequential Invoice Number Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate next sequential invoice number for a given series + FY.
 * Uses the existing Counter model with findOneAndUpdate for atomicity.
 *
 * Series examples:
 *  ZG_INV  → ZG-INV-2026-27-000001
 *  ZG_COM  → ZG-COM-2026-27-000001
 *  ZG_CN   → ZG-CN-2026-27-000001
 *  SELLER_INV → captured from seller, not auto-generated
 */
export async function nextInvoiceNumber(series, financialYear) {
  const counterId = `${series}:${financialYear}`;
  const updated = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { sequence_value: 1 } },
    { upsert: true, new: true },
  );
  const seq = String(updated.sequence_value).padStart(6, "0");
  const prefix = series.replace("_", "-"); // ZG_INV → ZG-INV
  return `${prefix}-${financialYear}-${seq}`;
}

/**
 * Generate a unique GST Transaction ID.
 */
export async function nextGstTxnId(financialYear) {
  const counterId = `ZTXN:${financialYear}`;
  const updated = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { sequence_value: 1 } },
    { upsert: true, new: true },
  );
  const seq = String(updated.sequence_value).padStart(6, "0");
  return `ZTXN-${financialYear}-${seq}`;
}

/**
 * Build a settlement ID from a payout ID (for reporting).
 */
export function buildSettlementId(payoutId, prefix = "SET") {
  if (!payoutId) return null;
  return `${prefix}-${String(payoutId).slice(-8).toUpperCase()}`;
}
