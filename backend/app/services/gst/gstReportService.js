/**
 * gstReportService.js
 *
 * Generates all 5 GST CSVs + ZIP CA package from the GstTransaction collection.
 *
 * Reports:
 *  1. SELLER_SALES_GST.csv         — seller's product sales
 *  2. ZOOGNO_SERVICE_INVOICE.csv   — Zoogno platform + delivery fee invoices
 *  3. SELLER_COMMISSION.csv        — Zoogno commission invoices to sellers
 *  4. SETTLEMENT_REPORT.csv        — per-settlement reconciliation
 *  5. GST_RECONCILIATION_SUMMARY.csv — monthly consolidated GST working
 *
 * All reports read from GstTransaction. No raw order data needed at report time.
 */

import GstTransaction from "../../models/gstTransaction.js";
import { buildGstFilter } from "./gstTransactionService.js";
import { roundCurrency } from "../../utils/money.js";

// ─────────────────────────────────────────────────────────────────────────────
// CSV Utilities
// ─────────────────────────────────────────────────────────────────────────────

function escapeCsv(value) {
  if (value == null || value === undefined) return "";
  const text = String(value).replace(/"/g, '""');
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text}"`;
  }
  return text;
}

function buildCsv(headers, rows) {
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(","));
  }
  return lines.join("\n");
}

function fmtDate(d) {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
}

function fmtAmt(n) {
  return n != null ? roundCurrency(n).toFixed(2) : "0.00";
}

function yesNo(v) {
  return v ? "YES" : "NO";
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SELLER_SALES_GST.csv
// ─────────────────────────────────────────────────────────────────────────────

export async function generateSellerSalesGstCsv(params = {}) {
  const filter = {
    ...buildGstFilter(params),
    txnType: "SELLER_PRODUCT_SALE",
  };

  const txns = await GstTransaction.find(filter)
    .sort({ taxPeriodDate: 1, orderRefId: 1, lineItemIndex: 1 })
    .lean();

  const headers = [
    "Financial_Year", "Tax_Period", "Order_ID", "Seller_ID", "Seller_Name",
    "Seller_GSTIN", "Seller_GST_Status", "Seller_State",
    "Invoice_No", "Invoice_Date",
    "Customer_Type", "Customer_GSTIN", "Customer_Name", "Customer_State",
    "Place_of_Supply", "Place_of_Supply_Code",
    "Product_Name", "HSN_SAC", "Quantity", "Unit",
    "Taxable_Value", "GST_Rate",
    "IGST", "CGST", "SGST_UTGST", "Cess",
    "Invoice_Tax", "Invoice_Total",
    "ECO_TCS_Applicable", "ECO_TCS_Rate", "ECO_TCS_Amount",
    "Section_9_5_Applicable",
    "ECO_Mechanism", "Supply_Type", "Is_Inter_State",
    "Credit_Debit_Note", "Original_Invoice_No",
    "Order_Status", "Settlement_ID", "Settlement_Status",
  ];

  const rows = txns.map((t) => [
    t.financialYear,
    t.taxPeriod,
    t.orderRefId,
    t.sellerId ? String(t.sellerId) : "",
    t.sellerName,
    t.sellerGstin || "UNREGISTERED",
    t.sellerGstStatus,
    t.sellerState,
    t.supplierInvoiceNo || "",
    fmtDate(t.supplierInvoiceDate),
    t.customerType,
    t.customerGstin || "",
    t.customerName,
    t.customerState,
    t.placeOfSupply,
    t.placeOfSupplyCode,
    t.productName,
    t.hsnSac,
    t.quantity,
    t.unit,
    fmtAmt(t.taxableValue),
    t.gstRate,
    fmtAmt(t.igstAmount),
    fmtAmt(t.cgstAmount),
    fmtAmt(t.sgstAmount),
    fmtAmt(t.cessAmount),
    fmtAmt(t.gstAmount),
    fmtAmt(t.invoiceTotal),
    yesNo(t.tcsApplicable),
    t.tcsRate || 0,
    fmtAmt(t.tcsAmount),
    yesNo(t.section === "SECTION_9_5"),
    t.section,
    t.supplyType,
    yesNo(t.isInterState),
    t.isAdjustment ? (t.creditNoteNo ? "CREDIT_NOTE" : "DEBIT_NOTE") : "NO",
    t.originalInvoiceNo || "",
    "DELIVERED",
    t.settlementId || "",
    t.settlementStatus,
  ]);

  return buildCsv(headers, rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ZOOGNO_SERVICE_INVOICE.csv
// ─────────────────────────────────────────────────────────────────────────────

export async function generateZoognoServiceInvoiceCsv(params = {}) {
  const filter = {
    ...buildGstFilter(params),
    txnType: "ZOOGNO_SERVICE_SALE",
  };

  const txns = await GstTransaction.find(filter)
    .sort({ taxPeriodDate: 1, zoognoInvoiceNo: 1 })
    .lean();

  const headers = [
    "Financial_Year", "Tax_Period", "Order_ID",
    "Zoogno_Invoice_No", "Invoice_Date",
    "Customer_Type", "Customer_GSTIN", "Customer_Name", "Customer_State",
    "Place_of_Supply",
    "Service_Type", "SAC", "Description",
    "Taxable_Value", "GST_Rate",
    "IGST", "CGST", "SGST_UTGST", "Cess",
    "GST_Amount", "Invoice_Total",
    "Supply_Type", "Is_Inter_State",
    "IRN", "IRN_Date", "E_Invoice_Status",
    "Credit_Debit_Note", "Original_Invoice_No",
    "Settlement_ID",
  ];

  const rows = txns.map((t) => [
    t.financialYear,
    t.taxPeriod,
    t.orderRefId,
    t.zoognoInvoiceNo,
    fmtDate(t.zoognoInvoiceDate),
    t.customerType,
    t.customerGstin || "",
    t.customerName,
    t.customerState,
    t.placeOfSupply,
    t.serviceType,
    t.sacCode,
    t.sacDescription,
    fmtAmt(t.taxableValue),
    t.gstRate,
    fmtAmt(t.igstAmount),
    fmtAmt(t.cgstAmount),
    fmtAmt(t.sgstAmount),
    fmtAmt(t.cessAmount),
    fmtAmt(t.gstAmount),
    fmtAmt(t.invoiceTotal),
    t.supplyType,
    yesNo(t.isInterState),
    t.irn || "",
    fmtDate(t.irnDate),
    t.eInvoiceStatus || "NOT_REQUIRED",
    t.isAdjustment ? "CREDIT_NOTE" : "NO",
    t.originalInvoiceNo || "",
    t.settlementId || "",
  ]);

  return buildCsv(headers, rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SELLER_COMMISSION.csv
// ─────────────────────────────────────────────────────────────────────────────

export async function generateSellerCommissionCsv(params = {}) {
  const filter = {
    ...buildGstFilter(params),
    txnType: "ZOOGNO_SELLER_COMMISSION",
  };

  const txns = await GstTransaction.find(filter)
    .sort({ taxPeriodDate: 1, zoognoInvoiceNo: 1 })
    .lean();

  const headers = [
    "Financial_Year", "Tax_Period", "Order_ID",
    "Seller_ID", "Seller_Name", "Seller_GSTIN", "Seller_GST_Status",
    "Commission_Invoice_No", "Commission_Invoice_Date",
    "Commission_Percentage", "Gross_Order_Value", "Commission_Base_Value",
    "SAC", "GST_Rate",
    "IGST", "CGST", "SGST_UTGST", "Cess",
    "GST_Amount", "Commission_Invoice_Total",
    "Amount_Receivable_From_Seller",
    "Settlement_ID", "Settlement_Date", "Settlement_Status",
    "Credit_Debit_Note", "Original_Invoice_No",
  ];

  const rows = txns.map((t) => [
    t.financialYear,
    t.taxPeriod,
    t.orderRefId,
    t.sellerId ? String(t.sellerId) : "",
    t.sellerName,
    t.sellerGstin || "UNREGISTERED",
    t.sellerGstStatus,
    t.zoognoInvoiceNo,
    fmtDate(t.zoognoInvoiceDate),
    fmtAmt(t.commissionPercentage),
    fmtAmt(t.commissionBase),
    fmtAmt(t.commissionValue),
    t.sacCode,
    t.gstRate,
    fmtAmt(t.igstAmount),
    fmtAmt(t.cgstAmount),
    fmtAmt(t.sgstAmount),
    fmtAmt(t.cessAmount),
    fmtAmt(t.commissionGstAmount),
    fmtAmt(t.commissionInvoiceTotal),
    fmtAmt(t.commissionInvoiceTotal), // Amount receivable = commission + GST
    t.settlementId || "",
    fmtDate(t.settlementDate),
    t.settlementStatus,
    t.isAdjustment ? "CREDIT_NOTE" : "NO",
    t.originalInvoiceNo || "",
  ]);

  return buildCsv(headers, rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SETTLEMENT_REPORT.csv
// ─────────────────────────────────────────────────────────────────────────────

export async function generateSettlementReportCsv(params = {}) {
  const baseFilter = { ...buildGstFilter(params) };
  delete baseFilter.txnType;

  // Aggregate per settlement
  const pipeline = [
    { $match: { ...baseFilter, status: "ACTIVE" } },
    {
      $group: {
        _id: {
          settlementId: "$settlementId",
          sellerId: "$sellerId",
          financialYear: "$financialYear",
          taxPeriod: "$taxPeriod",
        },
        sellerName: { $first: "$sellerName" },
        sellerGstin: { $first: "$sellerGstin" },
        settlementDate: { $first: "$settlementDate" },
        payoutId: { $first: "$payoutId" },

        // Product sales (SELLER_PRODUCT_SALE)
        grossProductSales: {
          $sum: {
            $cond: [{ $eq: ["$txnType", "SELLER_PRODUCT_SALE"] }, "$taxableValue", 0]
          }
        },
        productGst: {
          $sum: {
            $cond: [{ $eq: ["$txnType", "SELLER_PRODUCT_SALE"] }, "$gstAmount", 0]
          }
        },
        tcsCollected: {
          $sum: {
            $cond: [{ $eq: ["$txnType", "SELLER_PRODUCT_SALE"] }, "$tcsAmount", 0]
          }
        },

        // Platform fee
        platformFee: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$txnType", "ZOOGNO_SERVICE_SALE"] }, { $eq: ["$serviceType", "PLATFORM_FEE"] }] },
              "$taxableValue", 0
            ]
          }
        },
        platformFeeGst: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$txnType", "ZOOGNO_SERVICE_SALE"] }, { $eq: ["$serviceType", "PLATFORM_FEE"] }] },
              "$gstAmount", 0
            ]
          }
        },

        // Delivery fee
        deliveryFee: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$txnType", "ZOOGNO_SERVICE_SALE"] }, { $eq: ["$serviceType", "DELIVERY_FEE"] }] },
              "$taxableValue", 0
            ]
          }
        },
        deliveryFeeGst: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$txnType", "ZOOGNO_SERVICE_SALE"] }, { $eq: ["$serviceType", "DELIVERY_FEE"] }] },
              "$gstAmount", 0
            ]
          }
        },

        // Commission
        commissionValue: {
          $sum: {
            $cond: [{ $eq: ["$txnType", "ZOOGNO_SELLER_COMMISSION"] }, "$commissionValue", 0]
          }
        },
        commissionGst: {
          $sum: {
            $cond: [{ $eq: ["$txnType", "ZOOGNO_SELLER_COMMISSION"] }, "$commissionGstAmount", 0]
          }
        },

        // Refunds
        refundValue: { $sum: "$refundValue" },
      }
    },
    { $sort: { "_id.settlementId": 1 } }
  ];

  const results = await GstTransaction.aggregate(pipeline);

  const headers = [
    "Financial_Year", "Tax_Period", "Settlement_ID", "Settlement_Date",
    "Seller_ID", "Seller_Name", "Seller_GSTIN",
    "Gross_Product_Sales", "Product_GST",
    "Zoogno_Commission", "Commission_GST",
    "Zoogno_Platform_Fee", "Platform_Fee_GST",
    "Delivery_Collected", "Delivery_GST",
    "TCS_Collected",
    "Refunds",
    "Payout_ID",
  ];

  const rows = results.map((r) => {
    const id = r._id;
    return [
      id.financialYear,
      id.taxPeriod,
      id.settlementId || "",
      fmtDate(r.settlementDate),
      id.sellerId ? String(id.sellerId) : "",
      r.sellerName,
      r.sellerGstin || "UNREGISTERED",
      fmtAmt(r.grossProductSales),
      fmtAmt(r.productGst),
      fmtAmt(r.commissionValue),
      fmtAmt(r.commissionGst),
      fmtAmt(r.platformFee),
      fmtAmt(r.platformFeeGst),
      fmtAmt(r.deliveryFee),
      fmtAmt(r.deliveryFeeGst),
      fmtAmt(r.tcsCollected),
      fmtAmt(r.refundValue),
      r.payoutId ? String(r.payoutId) : "",
    ];
  });

  return buildCsv(headers, rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. GST_RECONCILIATION_SUMMARY.csv
// ─────────────────────────────────────────────────────────────────────────────

export async function generateGstReconciliationCsv(params = {}) {
  const baseFilter = buildGstFilter(params);
  delete baseFilter.txnType;

  const pipeline = [
    { $match: { ...baseFilter, status: "ACTIVE" } },
    {
      $group: {
        _id: { financialYear: "$financialYear", taxPeriod: "$taxPeriod" },

        sellerCount: { $addToSet: "$sellerId" },
        registeredSellerCount: {
          $addToSet: {
            $cond: [{ $eq: ["$sellerGstStatus", "REGISTERED"] }, "$sellerId", "$$REMOVE"]
          }
        },
        unregisteredSellerCount: {
          $addToSet: {
            $cond: [{ $eq: ["$sellerGstStatus", "UNREGISTERED"] }, "$sellerId", "$$REMOVE"]
          }
        },

        // Seller product taxable values
        b2bTaxableValue: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$txnType", "SELLER_PRODUCT_SALE"] }, { $eq: ["$supplyType", "B2B"] }] },
              "$taxableValue", 0
            ]
          }
        },
        b2cTaxableValue: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$txnType", "SELLER_PRODUCT_SALE"] }, { $eq: ["$supplyType", "B2C"] }] },
              "$taxableValue", 0
            ]
          }
        },
        interstateTaxableValue: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$txnType", "SELLER_PRODUCT_SALE"] }, { $eq: ["$isInterState", true] }] },
              "$taxableValue", 0
            ]
          }
        },
        intrastateTaxableValue: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$txnType", "SELLER_PRODUCT_SALE"] }, { $eq: ["$isInterState", false] }] },
              "$taxableValue", 0
            ]
          }
        },

        // Tax totals for seller sales
        igstTotal: {
          $sum: { $cond: [{ $eq: ["$txnType", "SELLER_PRODUCT_SALE"] }, "$igstAmount", 0] }
        },
        cgstTotal: {
          $sum: { $cond: [{ $eq: ["$txnType", "SELLER_PRODUCT_SALE"] }, "$cgstAmount", 0] }
        },
        sgstTotal: {
          $sum: { $cond: [{ $eq: ["$txnType", "SELLER_PRODUCT_SALE"] }, "$sgstAmount", 0] }
        },
        cessTotal: {
          $sum: { $cond: [{ $eq: ["$txnType", "SELLER_PRODUCT_SALE"] }, "$cessAmount", 0] }
        },
        totalOutputTax: {
          $sum: { $cond: [{ $eq: ["$txnType", "SELLER_PRODUCT_SALE"] }, "$gstAmount", 0] }
        },

        // Commission totals
        commissionTaxableValue: {
          $sum: { $cond: [{ $eq: ["$txnType", "ZOOGNO_SELLER_COMMISSION"] }, "$commissionValue", 0] }
        },
        commissionGstTotal: {
          $sum: { $cond: [{ $eq: ["$txnType", "ZOOGNO_SELLER_COMMISSION"] }, "$commissionGstAmount", 0] }
        },

        // Platform fee totals
        platformFeeTaxableValue: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$txnType", "ZOOGNO_SERVICE_SALE"] }, { $eq: ["$serviceType", "PLATFORM_FEE"] }] },
              "$taxableValue", 0
            ]
          }
        },
        platformFeeGstTotal: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$txnType", "ZOOGNO_SERVICE_SALE"] }, { $eq: ["$serviceType", "PLATFORM_FEE"] }] },
              "$gstAmount", 0
            ]
          }
        },

        // Delivery fee totals
        deliveryTaxableValue: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$txnType", "ZOOGNO_SERVICE_SALE"] }, { $eq: ["$serviceType", "DELIVERY_FEE"] }] },
              "$taxableValue", 0
            ]
          }
        },
        deliveryGstTotal: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ["$txnType", "ZOOGNO_SERVICE_SALE"] }, { $eq: ["$serviceType", "DELIVERY_FEE"] }] },
              "$gstAmount", 0
            ]
          }
        },

        // TCS
        tcsCollectedTotal: { $sum: "$tcsAmount" },

        // Section 9(5)
        sec95TaxableValue: {
          $sum: {
            $cond: [{ $eq: ["$section", "SECTION_9_5"] }, "$taxableValue", 0]
          }
        },
        sec95GstTotal: {
          $sum: {
            $cond: [{ $eq: ["$section", "SECTION_9_5"] }, "$gstAmount", 0]
          }
        },

        // Credit/Debit notes
        creditNoteTotal: {
          $sum: { $cond: [{ $eq: ["$txnType", "CREDIT_NOTE"] }, "$refundValue", 0] }
        },
        debitNoteTotal: {
          $sum: { $cond: [{ $eq: ["$txnType", "DEBIT_NOTE"] }, "$refundValue", 0] }
        },
        refundValueTotal: { $sum: "$refundValue" },
      }
    },
    { $sort: { "_id.financialYear": 1, "_id.taxPeriodDate": 1 } }
  ];

  const results = await GstTransaction.aggregate(pipeline);

  const headers = [
    "Financial_Year", "Tax_Period",
    "Seller_Count", "Registered_Seller_Count", "Unregistered_Seller_Count",
    "B2B_Taxable_Value", "B2C_Taxable_Value",
    "Interstate_Taxable_Value", "Intrastate_Taxable_Value",
    "IGST", "CGST", "SGST", "Cess",
    "Total_Output_Tax",
    "Commission_Taxable_Value", "Commission_GST",
    "Platform_Fee_Taxable_Value", "Platform_Fee_GST",
    "Delivery_Taxable_Value", "Delivery_GST",
    "TCS_Collected",
    "Section_9_5_Taxable_Value", "Section_9_5_Tax",
    "Credit_Notes", "Debit_Notes", "Refund_Value",
  ];

  const rows = results.map((r) => [
    r._id.financialYear,
    r._id.taxPeriod,
    (r.sellerCount || []).filter(Boolean).length,
    (r.registeredSellerCount || []).filter(Boolean).length,
    (r.unregisteredSellerCount || []).filter(Boolean).length,
    fmtAmt(r.b2bTaxableValue),
    fmtAmt(r.b2cTaxableValue),
    fmtAmt(r.interstateTaxableValue),
    fmtAmt(r.intrastateTaxableValue),
    fmtAmt(r.igstTotal),
    fmtAmt(r.cgstTotal),
    fmtAmt(r.sgstTotal),
    fmtAmt(r.cessTotal),
    fmtAmt(r.totalOutputTax),
    fmtAmt(r.commissionTaxableValue),
    fmtAmt(r.commissionGstTotal),
    fmtAmt(r.platformFeeTaxableValue),
    fmtAmt(r.platformFeeGstTotal),
    fmtAmt(r.deliveryTaxableValue),
    fmtAmt(r.deliveryGstTotal),
    fmtAmt(r.tcsCollectedTotal),
    fmtAmt(r.sec95TaxableValue),
    fmtAmt(r.sec95GstTotal),
    fmtAmt(r.creditNoteTotal),
    fmtAmt(r.debitNoteTotal),
    fmtAmt(r.refundValueTotal),
  ]);

  return buildCsv(headers, rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// CA Package — all CSVs as named buffers (frontend zips them)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate all 5 CSVs and return as named string map.
 * The controller will zip these and send as application/zip.
 */
export async function generateCaPackage(params = {}) {
  const fy = params.financialYear || "ALL";
  const period = params.taxPeriod || "ALL";
  const dirName = `ZOOGNO_GST_${fy}_${period}`.replace(/\s+/g, "_");

  const [sellerSales, serviceInvoice, commission, settlement, reconciliation] = await Promise.all([
    generateSellerSalesGstCsv(params),
    generateZoognoServiceInvoiceCsv(params),
    generateSellerCommissionCsv(params),
    generateSettlementReportCsv(params),
    generateGstReconciliationCsv(params),
  ]);

  return {
    dirName,
    files: [
      { name: "Seller_Sales_GST.csv", content: sellerSales },
      { name: "Zoogno_Service_Invoices.csv", content: serviceInvoice },
      { name: "Seller_Commission.csv", content: commission },
      { name: "Seller_Settlement.csv", content: settlement },
      { name: "GST_Reconciliation_Summary.csv", content: reconciliation },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Paginated Transaction List (for admin panel table view)
// ─────────────────────────────────────────────────────────────────────────────

export async function listGstTransactions(params = {}) {
  const filter = buildGstFilter(params);
  const page = Math.max(parseInt(params.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 25, 1), 200);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    GstTransaction.find(filter)
      .sort({ taxPeriodDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    GstTransaction.countDocuments(filter),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
}
