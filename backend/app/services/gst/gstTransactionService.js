/**
 * gstTransactionService.js
 *
 * Creates GST transaction records when an order is settled (delivered).
 *
 * Per delivered order, creates:
 *  1. SELLER_PRODUCT_SALE   — one per line item (seller's outward supply)
 *  2. ZOOGNO_SERVICE_SALE   — PLATFORM_FEE + DELIVERY_FEE (Zoogno's service supply)
 *  3. ZOOGNO_SELLER_COMMISSION — one per order (Zoogno's commission from seller)
 *
 * Section 52 TCS vs Section 9(5):
 *  - Section 52: Seller is the supplier. Seller raises invoice. Zoogno captures it.
 *    Zoogno collects TCS and files GSTR-8.
 *  - Section 9(5): Zoogno is deemed supplier. Zoogno raises invoice.
 *    Zoogno pays GST. This is applied only to specifically notified services/categories.
 *
 * Design: raw financial data from order.paymentBreakdown is the source of truth.
 *         This service READS from orders and WRITES to GstTransaction.
 *         It does NOT modify financial data.
 */

import GstTransaction from "../../models/gstTransaction.js";
import Seller from "../../models/seller.js";
import User from "../../models/customer.js";
import { roundCurrency } from "../../utils/money.js";
import {
  getGstConfig,
  computeFinancialYear,
  computeTaxPeriod,
  computeTaxBreakdown,
  stateCodeFromGstin,
  stateNameFromCode,
  nextInvoiceNumber,
  nextGstTxnId,
  buildSettlementId,
} from "./gstConfigService.js";
import {
  GST_TXN_TYPE,
  GST_SERVICE_TYPE,
  INVOICE_SERIES,
} from "../../constants/finance.js";

// ─────────────────────────────────────────────────────────────────────────────
// Main Entry Point — called from settleDeliveredOrder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create all GST transaction records for a delivered order.
 * Safe to call: checks if records already exist (idempotent).
 *
 * @param {Object} order - Populated/partially populated order document
 * @param {Object} opts
 * @param {mongoose.ClientSession} opts.session - DB session (optional)
 * @param {Object} opts.payoutRef - Payout document created during settlement
 */
export async function createGstTransactionsForOrder(order, { session, payoutRef } = {}) {
  try {
    // Idempotency: skip if already created
    const existing = await GstTransaction.countDocuments(
      { orderId: order._id, status: "ACTIVE" },
      session ? { session } : {},
    );
    if (existing > 0) return;

    const gstConfig = await getGstConfig();
    const deliveredAt = order.deliveredAt || order.updatedAt || new Date();
    const financialYear = computeFinancialYear(deliveredAt, gstConfig.fyStartMonth);
    const taxPeriod = computeTaxPeriod(deliveredAt);

    // Fetch seller & customer data
    const [seller, customer] = await Promise.all([
      order.seller
        ? Seller.findById(order.seller).select("name shopName gstin gstStatus stateCode state ecoTaxMechanism").lean()
        : null,
      order.customer
        ? User.findById(order.customer).select("name email phone addresses").lean()
        : null,
    ]);

    const ctx = buildContext({ order, seller, customer, gstConfig, financialYear, taxPeriod, deliveredAt, payoutRef });

    const docs = [];

    // 1. SELLER_PRODUCT_SALE records (per line item)
    const sellerSaleDocs = await buildSellerProductSaleDocs(ctx);
    docs.push(...sellerSaleDocs);

    // 2. ZOOGNO_SERVICE_SALE records (platform fee + delivery fee)
    const zoognoServiceDocs = await buildZoognoServiceDocs(ctx);
    docs.push(...zoognoServiceDocs);

    // 3. ZOOGNO_SELLER_COMMISSION record
    if ((order.paymentBreakdown?.adminProductCommissionTotal || 0) > 0) {
      const commissionDoc = await buildCommissionDoc(ctx);
      if (commissionDoc) docs.push(commissionDoc);
    }

    if (docs.length > 0) {
      const insertOpts = session ? { session } : {};
      await GstTransaction.insertMany(docs, insertOpts);
    }
  } catch (err) {
    // Non-blocking: GST txn creation failure must NOT break the finance settlement
    console.error("[GstTransactionService] Error creating GST transactions:", err.message, { orderId: String(order._id) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Builder — shared state for all sub-builders
// ─────────────────────────────────────────────────────────────────────────────

function buildContext({ order, seller, customer, gstConfig, financialYear, taxPeriod, deliveredAt, payoutRef }) {
  const breakdown = order.paymentBreakdown || {};

  // Seller state
  const sellerGstin = seller?.gstin || null;
  const sellerGstStatus = seller?.gstStatus || "UNREGISTERED";
  let sellerStateCode = seller?.stateCode || null;
  if (!sellerStateCode && sellerGstin) {
    sellerStateCode = stateCodeFromGstin(sellerGstin);
  }
  const sellerState = stateNameFromCode(sellerStateCode);
  const sellerEcoMechanism = seller?.ecoTaxMechanism || gstConfig.defaultEcoTaxMechanism;

  // Zoogno state (supplier for service/commission invoices)
  const zoognoStateCode = gstConfig.zoognoStateCode || "";
  const zoognoGstin = gstConfig.zoognoGstin || "";

  // Customer place of supply — use delivery address state
  const deliveryState = order.address?.state || "";
  const customerGstin = null; // B2C consumers typically don't provide GSTIN
  // For B2C, place of supply = delivery address state
  // We'll use a simple heuristic mapping from state name to code
  // For production, seller/customer registration state code should be stored
  const posCode = sellerStateCode || ""; // Simplified: for B2C, POS = delivery state or seller state

  const settlementId = payoutRef
    ? buildSettlementId(payoutRef._id)
    : buildSettlementId(order._id, "ORD");

  return {
    order,
    breakdown,
    seller,
    customer,
    gstConfig,
    financialYear,
    taxPeriod,
    taxPeriodDate: deliveredAt,
    deliveredAt,
    payoutRef,

    sellerGstin,
    sellerGstStatus,
    sellerStateCode,
    sellerState,
    sellerEcoMechanism,

    zoognoStateCode,
    zoognoGstin,
    customerGstin,
    posCode,
    deliveryState,
    settlementId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SELLER_PRODUCT_SALE (per line item)
// ─────────────────────────────────────────────────────────────────────────────

async function buildSellerProductSaleDocs(ctx) {
  const { order, breakdown, gstConfig, financialYear, taxPeriod, ctx: _c, ...rest } = { ...ctx };
  const items = order.items || [];
  if (items.length === 0) return [];

  // For Section 52: seller is the supplier.
  // We capture seller's invoice. TCS collected by Zoogno.
  const isSec52 = ctx.sellerEcoMechanism === "SECTION_52_TCS";

  const docs = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const gstTxnId = await nextGstTxnId(financialYear);
    const price = roundCurrency(item.price || 0);
    const qty = item.quantity || 1;
    const taxableValue = roundCurrency(price * qty);
    const gstRate = item.gstRate || 0;

    const taxBreak = computeTaxBreakdown({
      supplierStateCode: ctx.sellerStateCode,
      posCode: ctx.posCode,
      taxableValue,
      gstRate,
      customerGstin: ctx.customerGstin,
    });

    // TCS only applicable for Section 52 on registered/unregistered sellers
    const tcsApplicable = isSec52 && gstConfig.tcsRate > 0;
    const tcsAmount = tcsApplicable
      ? roundCurrency((taxableValue * gstConfig.tcsRate) / 100)
      : 0;

    docs.push({
      gstTxnId,
      txnType: GST_TXN_TYPE.SELLER_PRODUCT_SALE,
      status: "ACTIVE",
      orderId: order._id,
      orderRefId: order.orderId,
      lineItemIndex: i,
      lineItemId: item._id || undefined,

      financialYear,
      taxPeriod,
      taxPeriodDate: ctx.taxPeriodDate,

      // Seller
      sellerId: order.seller,
      sellerName: ctx.seller?.shopName || ctx.seller?.name || "",
      sellerGstin: ctx.sellerGstin,
      sellerGstStatus: ctx.sellerGstStatus,
      sellerStateCode: ctx.sellerStateCode,
      sellerState: ctx.sellerState,
      sellerEcoTaxMechanism: ctx.sellerEcoMechanism,

      // Customer
      customerId: order.customer,
      customerName: ctx.customer?.name || "",
      customerGstin: ctx.customerGstin,
      customerType: ctx.customerGstin ? "B2B" : "B2C",
      customerState: ctx.deliveryState,

      // Supply
      supplyType: ctx.customerGstin ? "B2B" : "B2C",
      placeOfSupply: ctx.deliveryState,
      placeOfSupplyCode: ctx.posCode,
      isInterState: taxBreak.isInterState,
      isUnionTerritory: taxBreak.isUnionTerritory,
      section: ctx.sellerEcoMechanism,

      // Invoice (Section 52: seller raises own invoice)
      // For now, supplierInvoiceNo is generated as a reference.
      // Admin/seller can update with actual invoice number later.
      supplierInvoiceNo: null,
      supplierInvoiceDate: ctx.deliveredAt,

      // Product line
      productId: item.product,
      productName: item.name,
      hsnSac: item.hsnCode || "",
      quantity: qty,
      unit: "NOS",

      // Tax
      taxableValue,
      gstRate,
      ...taxBreak,
      cessRate: 0,
      cessAmount: 0,

      // TCS
      tcsApplicable,
      tcsRate: tcsApplicable ? gstConfig.tcsRate : 0,
      tcsAmount,
      tcsGstin: tcsApplicable ? (gstConfig.tcsGstin || gstConfig.zoognoGstin) : null,

      // Settlement
      settlementId: ctx.settlementId,
      payoutId: ctx.payoutRef?._id,
      settlementDate: ctx.deliveredAt,
      settlementStatus: "PENDING",

      generatedBy: "SYSTEM",
    });
  }
  return docs;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ZOOGNO_SERVICE_SALE (platform fee + delivery fee)
// ─────────────────────────────────────────────────────────────────────────────

async function buildZoognoServiceDocs(ctx) {
  const { breakdown, gstConfig, financialYear, taxPeriod } = ctx;
  const docs = [];

  // Zoogno invoice number — shared across platform + delivery on same order
  const zoognoInvoiceNo = await nextInvoiceNumber(INVOICE_SERIES.ZOOGNO_SERVICE, financialYear);
  const zoognoInvoiceDate = ctx.deliveredAt;

  const serviceLines = [];

  // Platform fee
  const platformFee = roundCurrency(breakdown.platformFeeCharged || 0);
  if (platformFee > 0) {
    serviceLines.push({
      serviceType: GST_SERVICE_TYPE.PLATFORM_FEE,
      sacCode: gstConfig.platformFeeSac,
      sacDescription: gstConfig.platformFeeDescription,
      taxableValue: platformFee,
      gstRate: gstConfig.platformFeeGstRate,
    });
  }

  // Delivery fee
  const deliveryFee = roundCurrency(breakdown.deliveryFeeCharged || 0);
  if (deliveryFee > 0) {
    serviceLines.push({
      serviceType: GST_SERVICE_TYPE.DELIVERY_FEE,
      sacCode: gstConfig.deliveryFeeSac,
      sacDescription: gstConfig.deliveryFeeDescription,
      taxableValue: deliveryFee,
      gstRate: gstConfig.deliveryFeeGstRate,
    });
  }

  // Handling fee
  const handlingFee = roundCurrency(breakdown.handlingFeeCharged || 0);
  if (handlingFee > 0) {
    serviceLines.push({
      serviceType: GST_SERVICE_TYPE.HANDLING_FEE,
      sacCode: gstConfig.handlingFeeSac,
      sacDescription: gstConfig.handlingFeeDescription,
      taxableValue: handlingFee,
      gstRate: gstConfig.handlingFeeGstRate,
    });
  }

  for (const line of serviceLines) {
    const gstTxnId = await nextGstTxnId(financialYear);

    // Zoogno is the supplier for service invoices
    const taxBreak = computeTaxBreakdown({
      supplierStateCode: ctx.zoognoStateCode,
      posCode: ctx.posCode,
      taxableValue: line.taxableValue,
      gstRate: line.gstRate,
      customerGstin: ctx.customerGstin,
    });

    docs.push({
      gstTxnId,
      txnType: GST_TXN_TYPE.ZOOGNO_SERVICE_SALE,
      status: "ACTIVE",
      orderId: ctx.order._id,
      orderRefId: ctx.order.orderId,

      financialYear,
      taxPeriod,
      taxPeriodDate: ctx.taxPeriodDate,

      // For service invoices, Zoogno is the seller/supplier
      sellerId: ctx.order.seller,
      sellerName: ctx.seller?.shopName || ctx.seller?.name || "",
      sellerGstin: ctx.sellerGstin,
      sellerGstStatus: ctx.sellerGstStatus,
      sellerStateCode: ctx.zoognoStateCode, // Zoogno's state as supplier
      sellerState: ctx.gstConfig.zoognoState,
      sellerEcoTaxMechanism: ctx.sellerEcoMechanism,

      // Customer
      customerId: ctx.order.customer,
      customerName: ctx.customer?.name || "",
      customerGstin: ctx.customerGstin,
      customerType: ctx.customerGstin ? "B2B" : "B2C",
      customerState: ctx.deliveryState,

      // Supply
      supplyType: ctx.customerGstin ? "B2B" : "B2C",
      placeOfSupply: ctx.deliveryState,
      placeOfSupplyCode: ctx.posCode,
      isInterState: taxBreak.isInterState,
      isUnionTerritory: taxBreak.isUnionTerritory,
      section: "SECTION_52_TCS", // Zoogno's own service is always its own supply

      // Invoice
      zoognoInvoiceNo,
      zoognoInvoiceDate,
      zoognoInvoiceSeries: INVOICE_SERIES.ZOOGNO_SERVICE,

      // Service line
      hsnSac: line.sacCode,
      quantity: 1,
      unit: "SRV",
      serviceType: line.serviceType,
      sacCode: line.sacCode,
      sacDescription: line.sacDescription,

      // Tax
      taxableValue: line.taxableValue,
      gstRate: line.gstRate,
      ...taxBreak,
      cessRate: 0,
      cessAmount: 0,

      // No TCS on Zoogno's own service invoices
      tcsApplicable: false,

      // Settlement
      settlementId: ctx.settlementId,
      payoutId: ctx.payoutRef?._id,
      settlementDate: ctx.deliveredAt,
      settlementStatus: "PENDING",

      generatedBy: "SYSTEM",
    });
  }
  return docs;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ZOOGNO_SELLER_COMMISSION
// ─────────────────────────────────────────────────────────────────────────────

async function buildCommissionDoc(ctx) {
  const { breakdown, gstConfig, financialYear, taxPeriod } = ctx;
  const commissionBase = roundCurrency(breakdown.productSubtotal || 0);
  const commissionValue = roundCurrency(breakdown.adminProductCommissionTotal || 0);
  if (commissionValue <= 0) return null;

  // Determine commission % from snapshot if available, else compute
  const commissionPct = commissionBase > 0
    ? roundCurrency((commissionValue / commissionBase) * 100)
    : 0;

  const gstTxnId = await nextGstTxnId(financialYear);
  const commissionInvoiceNo = await nextInvoiceNumber(INVOICE_SERIES.ZOOGNO_COMMISSION, financialYear);

  // Zoogno charges seller: Zoogno's state is supplier state, seller's state is recipient state
  const taxBreak = computeTaxBreakdown({
    supplierStateCode: ctx.zoognoStateCode,
    posCode: ctx.sellerStateCode || ctx.zoognoStateCode,
    taxableValue: commissionValue,
    gstRate: gstConfig.commissionGstRate,
    customerGstin: ctx.sellerGstin, // Seller may be registered (B2B)
  });

  return {
    gstTxnId,
    txnType: GST_TXN_TYPE.ZOOGNO_SELLER_COMMISSION,
    status: "ACTIVE",
    orderId: ctx.order._id,
    orderRefId: ctx.order.orderId,

    financialYear,
    taxPeriod,
    taxPeriodDate: ctx.taxPeriodDate,

    // Commission: seller is the recipient (customer here)
    sellerId: ctx.order.seller,
    sellerName: ctx.seller?.shopName || ctx.seller?.name || "",
    sellerGstin: ctx.sellerGstin,
    sellerGstStatus: ctx.sellerGstStatus,
    sellerStateCode: ctx.sellerStateCode,
    sellerState: ctx.sellerState,
    sellerEcoTaxMechanism: ctx.sellerEcoMechanism,

    // Seller is the "customer" for commission invoice
    customerId: ctx.order.seller,
    customerName: ctx.seller?.shopName || ctx.seller?.name || "",
    customerGstin: ctx.sellerGstin,
    customerType: ctx.sellerGstin ? "B2B" : "B2C",
    customerState: ctx.sellerState,
    customerStateCode: ctx.sellerStateCode,

    // Supply: Zoogno to seller
    supplyType: ctx.sellerGstin ? "B2B" : "B2C",
    placeOfSupply: ctx.sellerState,
    placeOfSupplyCode: ctx.sellerStateCode,
    isInterState: taxBreak.isInterState,
    isUnionTerritory: taxBreak.isUnionTerritory,
    section: "NOT_APPLICABLE", // Commission is Zoogno's own outward supply

    // Invoice — Zoogno raises commission invoice to seller
    zoognoInvoiceNo: commissionInvoiceNo,
    zoognoInvoiceDate: ctx.deliveredAt,
    zoognoInvoiceSeries: INVOICE_SERIES.ZOOGNO_COMMISSION,

    // Service line
    hsnSac: gstConfig.commissionSac,
    quantity: 1,
    unit: "SRV",
    serviceType: GST_SERVICE_TYPE.OTHER,
    sacCode: gstConfig.commissionSac,
    sacDescription: gstConfig.commissionDescription,

    // Tax
    taxableValue: commissionValue,
    gstRate: gstConfig.commissionGstRate,
    ...taxBreak,
    cessRate: 0,
    cessAmount: 0,

    // Commission-specific
    commissionPercentage: commissionPct,
    commissionBase,
    commissionValue,
    commissionGstAmount: taxBreak.gstAmount,
    commissionInvoiceTotal: taxBreak.invoiceTotal,

    // No TCS on commission invoices
    tcsApplicable: false,

    // Settlement
    settlementId: ctx.settlementId,
    payoutId: ctx.payoutRef?._id,
    settlementDate: ctx.deliveredAt,
    settlementStatus: "PENDING",

    generatedBy: "SYSTEM",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Credit Note Creation (for Returns)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create credit note GST records when a return/refund is processed.
 * Links back to the original SELLER_PRODUCT_SALE records.
 */
export async function createCreditNoteForReturn(order, refundAmount, { session } = {}) {
  try {
    const gstConfig = await getGstConfig();
    const now = new Date();
    const financialYear = computeFinancialYear(now, gstConfig.fyStartMonth);
    const taxPeriod = computeTaxPeriod(now);

    // Find original GST transactions for this order
    const originals = await GstTransaction.find({
      orderId: order._id,
      txnType: GST_TXN_TYPE.SELLER_PRODUCT_SALE,
      status: "ACTIVE",
    }).lean();

    if (originals.length === 0) return;

    const creditNoteNo = await nextInvoiceNumber(INVOICE_SERIES.CREDIT_NOTE, financialYear);
    const docs = [];

    for (const orig of originals) {
      // Proportional refund: credit note value = same as original (full return assumed)
      // Partial return logic can be added later
      const gstTxnId = await nextGstTxnId(financialYear);
      const taxBreak = computeTaxBreakdown({
        supplierStateCode: orig.sellerStateCode,
        posCode: orig.placeOfSupplyCode,
        taxableValue: orig.taxableValue,
        gstRate: orig.gstRate,
        customerGstin: orig.customerGstin,
      });

      docs.push({
        gstTxnId,
        txnType: GST_TXN_TYPE.CREDIT_NOTE,
        status: "ACTIVE",
        orderId: order._id,
        orderRefId: order.orderId,

        financialYear,
        taxPeriod,
        taxPeriodDate: now,

        sellerId: orig.sellerId,
        sellerName: orig.sellerName,
        sellerGstin: orig.sellerGstin,
        sellerGstStatus: orig.sellerGstStatus,
        sellerStateCode: orig.sellerStateCode,
        sellerState: orig.sellerState,
        sellerEcoTaxMechanism: orig.sellerEcoTaxMechanism,

        customerId: orig.customerId,
        customerName: orig.customerName,
        customerGstin: orig.customerGstin,
        customerType: orig.customerType,
        customerState: orig.customerState,

        supplyType: orig.supplyType,
        placeOfSupply: orig.placeOfSupply,
        placeOfSupplyCode: orig.placeOfSupplyCode,
        isInterState: taxBreak.isInterState,
        section: orig.section,

        // Credit note reference
        zoognoInvoiceNo: creditNoteNo,
        zoognoInvoiceDate: now,
        zoognoInvoiceSeries: INVOICE_SERIES.CREDIT_NOTE,
        creditNoteNo,
        originalGstTxnId: orig.gstTxnId,
        originalInvoiceNo: orig.supplierInvoiceNo || orig.zoognoInvoiceNo,
        isAdjustment: true,
        refundValue: orig.taxableValue,
        adjustmentReason: "RETURN",

        productId: orig.productId,
        productName: orig.productName,
        hsnSac: orig.hsnSac,
        quantity: orig.quantity,
        unit: orig.unit,

        taxableValue: orig.taxableValue,
        gstRate: orig.gstRate,
        ...taxBreak,
        cessRate: 0,
        cessAmount: 0,

        tcsApplicable: false,

        settlementStatus: "NOT_APPLICABLE",
        generatedBy: "SYSTEM",
      });
    }

    if (docs.length > 0) {
      const insertOpts = session ? { session } : {};
      await GstTransaction.insertMany(docs, insertOpts);
    }
  } catch (err) {
    console.error("[GstTransactionService] Error creating credit notes:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build MongoDB filter from user-supplied filter params.
 * Used by report generators and admin list API.
 */
export function buildGstFilter(params = {}) {
  const filter = { status: "ACTIVE" };

  if (params.financialYear) filter.financialYear = params.financialYear;
  if (params.taxPeriod) filter.taxPeriod = params.taxPeriod;
  if (params.txnType) filter.txnType = params.txnType;
  if (params.sellerId) filter.sellerId = params.sellerId;
  if (params.sellerGstin) filter.sellerGstin = params.sellerGstin;
  if (params.sellerGstStatus) filter.sellerGstStatus = params.sellerGstStatus;
  if (params.section) filter.section = params.section;
  if (params.supplyType) filter.supplyType = params.supplyType;
  if (params.serviceType) filter.serviceType = params.serviceType;
  if (params.isInterState !== undefined) filter.isInterState = params.isInterState === "true" || params.isInterState === true;
  if (params.settlementStatus) filter.settlementStatus = params.settlementStatus;
  if (params.settlementId) filter.settlementId = params.settlementId;
  if (params.isAdjustment !== undefined) filter.isAdjustment = params.isAdjustment === "true" || params.isAdjustment === true;

  // Date range
  if (params.startDate || params.endDate) {
    filter.taxPeriodDate = {};
    if (params.startDate) filter.taxPeriodDate.$gte = new Date(params.startDate);
    if (params.endDate) filter.taxPeriodDate.$lte = new Date(params.endDate);
  }

  return filter;
}
