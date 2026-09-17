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
  // Commission invoices are always recorded with section: "NOT_APPLICABLE"
  // (the ECO section 52/9(5)/Normal-Supply distinction only describes how a
  // SELLER's own product sale is taxed, not Zoogno's own commission supply).
  // None of the 3 section options the admin UI exposes ever match, so
  // honoring this filter here would silently return zero rows no matter
  // which section is selected — drop it instead.
  delete filter.section;

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
// 3b. ZOOGNO_COMMISSION_SUMMARY.csv — GSTR-1 "B2B Summary" style, grouped by
// seller then invoice, with a rate-wise tax breakdown row per invoice and a
// grand Total row. Same underlying data as SELLER_COMMISSION.csv (one
// GstTransaction per commission invoice) but presented the way a CA expects
// to see it for return filing / reconciliation, instead of one flat row per
// transaction.
// ─────────────────────────────────────────────────────────────────────────────

export async function generateZoognoCommissionSummaryCsv(params = {}) {
  const filter = {
    ...buildGstFilter(params),
    txnType: "ZOOGNO_SELLER_COMMISSION",
  };
  // See the matching comment in generateSellerCommissionCsv — section is
  // always "NOT_APPLICABLE" for commission invoices and never matches the
  // admin UI's 3 section options.
  delete filter.section;

  const txns = await GstTransaction.find(filter)
    .sort({ sellerName: 1, zoognoInvoiceDate: 1, zoognoInvoiceNo: 1 })
    .lean();

  const bySeller = new Map();
  for (const t of txns) {
    const key = t.sellerGstin || t.sellerId ? String(t.sellerId) : t.sellerName || "UNKNOWN";
    if (!bySeller.has(key)) bySeller.set(key, []);
    bySeller.get(key).push(t);
  }

  const lines = [];
  let grandTaxable = 0;
  let grandIgst = 0;
  let grandCgst = 0;
  let grandSgst = 0;
  let grandCess = 0;

  for (const [, sellerTxns] of bySeller) {
    const seller = sellerTxns[0];
    lines.push([escapeCsv(seller.sellerName || "")].join(","));
    lines.push([escapeCsv(`Summary For B2B (${sellerTxns.length})`)].join(","));
    lines.push("");
    lines.push(
      ["GSTIN/UIN", "Receiver Name", "Invoice Number", "Invoice Date", "Place Of Supply", "Invoice Value", "Supply Type"]
        .map(escapeCsv).join(","),
    );

    for (const t of sellerTxns) {
      lines.push(
        [
          t.sellerGstin || "UNREGISTERED",
          t.sellerName || "",
          t.zoognoInvoiceNo || "",
          fmtDate(t.zoognoInvoiceDate),
          t.placeOfSupply || "",
          fmtAmt(t.commissionInvoiceTotal),
          t.isInterState ? "Inter state" : "Intra state",
        ].map(escapeCsv).join(","),
      );
      lines.push(
        ["", "", "Rate(%)", "Taxable Value (₹)", "Integrated Tax (₹)", "Central Tax (₹)", "State/UT Tax (₹)", "CESS (₹)"]
          .map(escapeCsv).join(","),
      );
      lines.push(
        [
          "", "",
          t.gstRate ?? 0,
          fmtAmt(t.commissionValue),
          fmtAmt(t.igstAmount),
          fmtAmt(t.cgstAmount),
          fmtAmt(t.sgstAmount),
          fmtAmt(t.cessAmount),
        ].map(escapeCsv).join(","),
      );

      grandTaxable += Number(t.commissionValue) || 0;
      grandIgst += Number(t.igstAmount) || 0;
      grandCgst += Number(t.cgstAmount) || 0;
      grandSgst += Number(t.sgstAmount) || 0;
      grandCess += Number(t.cessAmount) || 0;
    }

    lines.push("");
  }

  lines.push(
    [
      "Total", "", "",
      fmtAmt(grandTaxable),
      fmtAmt(grandIgst),
      fmtAmt(grandCgst),
      fmtAmt(grandSgst),
      fmtAmt(grandCess),
    ].map(escapeCsv).join(","),
  );

  return lines.join("\n");
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

  const [sellerSales, serviceInvoice, commission, commissionSummary, settlement, reconciliation] = await Promise.all([
    generateSellerSalesGstCsv(params),
    generateZoognoServiceInvoiceCsv(params),
    generateSellerCommissionCsv(params),
    generateZoognoCommissionSummaryCsv(params),
    generateSettlementReportCsv(params),
    generateGstReconciliationCsv(params),
  ]);

  return {
    dirName,
    files: [
      { name: "Seller_Sales_GST.csv", content: sellerSales },
      { name: "Zoogno_Service_Invoices.csv", content: serviceInvoice },
      { name: "Seller_Commission.csv", content: commission },
      { name: "Zoogno_Commission_Summary.csv", content: commissionSummary },
      { name: "Seller_Settlement.csv", content: settlement },
      { name: "GST_Reconciliation_Summary.csv", content: reconciliation },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Paginated Transaction List (for admin panel table view)
// ─────────────────────────────────────────────────────────────────────────────

// Only these fields may be sorted on — keeps `sortField` from being used to
// force a full-collection scan on an unindexed field.
const SORTABLE_FIELDS = {
  taxPeriodDate: "taxPeriodDate",
  sellerName: "sellerName",
};

export async function listGstTransactions(params = {}) {
  const filter = buildGstFilter(params);
  const page = Math.max(parseInt(params.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 25, 1), 200);
  const skip = (page - 1) * limit;

  const sortField = SORTABLE_FIELDS[params.sortField] || "taxPeriodDate";
  const sortDir = params.sortOrder === "asc" ? 1 : -1;
  // Secondary sort keeps paging stable when the primary field has ties
  // (many rows share the same sellerName or taxPeriodDate).
  const sort = { [sortField]: sortDir, _id: sortDir };

  const [items, total] = await Promise.all([
    GstTransaction.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    GstTransaction.countDocuments(filter),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
}
