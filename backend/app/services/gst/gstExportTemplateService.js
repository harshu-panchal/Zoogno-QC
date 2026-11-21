/**
 * gstExportTemplateService.js
 *
 * Admin-configurable field mapping for GST report exports (JSON today, usable for CSV too).
 * A template only ever says which of the already-stored fields to include, what label to
 * show, and in what order - it never changes how the underlying GstTransaction/Invoice data
 * is computed, so a GST Portal / accounting-software format change is a template edit, not a
 * reporting-code change.
 */

import GstExportTemplate, { GST_EXPORT_REPORT_TYPES } from "../../models/gstExportTemplate.js";

// ─────────────────────────────────────────────────────────────────────────────
// Built-in default field lists (fallback template per report type)
// ─────────────────────────────────────────────────────────────────────────────

function fields(list) {
  return list.map((f, i) => ({ key: f[0], label: f[1], order: i, enabled: true }));
}

export const DEFAULT_FIELDS = {
  seller_sales: fields([
    ["financialYear", "Financial Year"], ["taxPeriod", "Tax Period"], ["orderRefId", "Order ID"],
    ["sellerId", "Seller ID"], ["sellerName", "Seller Name"], ["sellerGstin", "Seller GSTIN"],
    ["sellerGstStatus", "Seller GST Status"], ["sellerState", "Seller State"],
    ["supplierInvoiceNo", "Invoice No"], ["supplierInvoiceDate", "Invoice Date"],
    ["customerType", "Customer Type"], ["customerGstin", "Customer GSTIN"],
    ["customerName", "Customer Name"], ["customerState", "Customer State"],
    ["placeOfSupply", "Place of Supply"], ["placeOfSupplyCode", "Place of Supply Code"],
    ["productName", "Product Name"], ["hsnSac", "HSN/SAC"], ["quantity", "Quantity"], ["unit", "Unit"],
    ["taxableValue", "Taxable Value"], ["gstRate", "GST Rate"],
    ["cgstRate", "CGST Rate"], ["sgstRate", "SGST Rate"], ["igstRate", "IGST Rate"],
    ["cgstAmount", "CGST Amount"], ["sgstAmount", "SGST Amount"], ["igstAmount", "IGST Amount"],
    ["cessAmount", "Cess"], ["gstAmount", "Total GST"], ["invoiceTotal", "Invoice Total"],
    ["tcsApplicable", "TCS Applicable"], ["tcsRate", "TCS Rate"], ["tcsAmount", "TCS Amount"],
    ["section", "ECO Mechanism"], ["supplyType", "Supply Type"], ["isInterState", "Is Inter-State"],
    ["originalInvoiceNo", "Original Invoice No"], ["settlementId", "Settlement ID"],
    ["settlementStatus", "Settlement Status"], ["zoognoRefNo", "Zoogno Ref No"],
  ]),
  documents_issued: fields([
    ["financialYear", "Financial Year"], ["docType", "Document Type"], ["documentKind", "Document Kind"],
    ["sellerDocNo", "Seller Document No"], ["zoognoRefNo", "Zoogno Ref No"], ["issuedAt", "Issue Date"],
    ["status", "Status"], ["cancelledAt", "Cancelled On"], ["cancelReason", "Cancel Reason"],
    ["sellerId", "Seller ID"], ["sellerName", "Seller Name"], ["sellerGstin", "Seller GSTIN"],
    ["orderRefId", "Order ID"], ["customerName", "Customer Name"],
    ["taxableValue", "Taxable Value"], ["cgstAmount", "CGST"], ["sgstAmount", "SGST"],
    ["igstAmount", "IGST"], ["cessAmount", "Cess"], ["gstAmount", "Total Tax"],
    ["grandTotal", "Document Total"], ["originalSellerDocNo", "Original Seller Document No"],
    ["originalZoognoRefNo", "Original Zoogno Ref No"], ["reason", "Reason"],
    ["issueTrigger", "Issued By Trigger"],
  ]),
  service_invoice: fields([
    ["financialYear", "Financial Year"], ["taxPeriod", "Tax Period"], ["orderRefId", "Order ID"],
    ["zoognoInvoiceNo", "Zoogno Invoice No"], ["zoognoInvoiceDate", "Invoice Date"],
    ["customerType", "Customer Type"], ["customerGstin", "Customer GSTIN"],
    ["customerName", "Customer Name"], ["customerState", "Customer State"],
    ["placeOfSupply", "Place of Supply"], ["serviceType", "Service Type"], ["sacCode", "SAC"],
    ["sacDescription", "Description"], ["taxableValue", "Taxable Value"], ["gstRate", "GST Rate"],
    ["igstAmount", "IGST"], ["cgstAmount", "CGST"], ["sgstAmount", "SGST"], ["cessAmount", "Cess"],
    ["gstAmount", "GST Amount"], ["invoiceTotal", "Invoice Total"], ["supplyType", "Supply Type"],
    ["isInterState", "Is Inter-State"], ["irn", "IRN"], ["irnDate", "IRN Date"],
    ["eInvoiceStatus", "E-Invoice Status"], ["settlementId", "Settlement ID"],
  ]),
  commission: fields([
    ["financialYear", "Financial Year"], ["taxPeriod", "Tax Period"], ["orderRefId", "Order ID"],
    ["sellerId", "Seller ID"], ["sellerName", "Seller Name"], ["sellerGstin", "Seller GSTIN"],
    ["sellerGstStatus", "Seller GST Status"], ["zoognoInvoiceNo", "Commission Invoice No"],
    ["zoognoInvoiceDate", "Commission Invoice Date"], ["commissionPercentage", "Commission %"],
    ["commissionBase", "Gross Order Value"], ["commissionValue", "Commission Base Value"],
    ["sacCode", "SAC"], ["gstRate", "GST Rate"], ["igstAmount", "IGST"], ["cgstAmount", "CGST"],
    ["sgstAmount", "SGST"], ["cessAmount", "Cess"], ["commissionGstAmount", "GST Amount"],
    ["commissionInvoiceTotal", "Commission Invoice Total"], ["settlementId", "Settlement ID"],
    ["settlementDate", "Settlement Date"], ["settlementStatus", "Settlement Status"],
  ]),
  settlement: fields([
    ["financialYear", "Financial Year"], ["taxPeriod", "Tax Period"], ["settlementId", "Settlement ID"],
    ["settlementDate", "Settlement Date"], ["sellerId", "Seller ID"], ["sellerName", "Seller Name"],
    ["sellerGstin", "Seller GSTIN"], ["grossProductSales", "Gross Product Sales"],
    ["productGst", "Product GST"], ["commissionValue", "Zoogno Commission"],
    ["commissionGst", "Commission GST"], ["platformFee", "Zoogno Platform Fee"],
    ["platformFeeGst", "Platform Fee GST"], ["deliveryFee", "Delivery Collected"],
    ["deliveryFeeGst", "Delivery GST"], ["tcsCollected", "TCS Collected"],
    ["refundValue", "Refunds"], ["payoutId", "Payout ID"],
  ]),
  reconciliation: fields([
    ["financialYear", "Financial Year"], ["taxPeriod", "Tax Period"],
    ["sellerCount", "Seller Count"], ["registeredSellerCount", "Registered Seller Count"],
    ["unregisteredSellerCount", "Unregistered Seller Count"],
    ["b2bTaxableValue", "B2B Taxable Value"], ["b2cTaxableValue", "B2C Taxable Value"],
    ["interstateTaxableValue", "Interstate Taxable Value"],
    ["intrastateTaxableValue", "Intrastate Taxable Value"],
    ["igstTotal", "IGST"], ["cgstTotal", "CGST"], ["sgstTotal", "SGST"], ["cessTotal", "Cess"],
    ["totalOutputTax", "Total Output Tax"], ["commissionTaxableValue", "Commission Taxable Value"],
    ["commissionGstTotal", "Commission GST"], ["platformFeeTaxableValue", "Platform Fee Taxable Value"],
    ["platformFeeGstTotal", "Platform Fee GST"], ["deliveryTaxableValue", "Delivery Taxable Value"],
    ["deliveryGstTotal", "Delivery GST"], ["tcsCollectedTotal", "TCS Collected"],
    ["sec95TaxableValue", "Section 9(5) Taxable Value"], ["sec95GstTotal", "Section 9(5) Tax"],
    ["creditNoteTotal", "Credit Notes"], ["debitNoteTotal", "Debit Notes"],
    ["refundValueTotal", "Refund Value"],
  ]),
};

export { GST_EXPORT_REPORT_TYPES };

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listTemplates(reportType) {
  const filter = reportType ? { reportType } : {};
  return GstExportTemplate.find(filter).sort({ reportType: 1, name: 1 }).lean();
}

/** The template to actually use: the DB default for this report type, else the built-in one. */
export async function getActiveFields(reportType) {
  const def = await GstExportTemplate.findOne({ reportType, isDefault: true }).lean();
  if (def?.fields?.length) return def.fields;
  return DEFAULT_FIELDS[reportType] || [];
}

export async function upsertTemplate({ _id, reportType, name, fields: fieldList, isDefault, createdBy }) {
  if (!GST_EXPORT_REPORT_TYPES.includes(reportType)) {
    throw new Error(`Unknown reportType: ${reportType}`);
  }
  const normalizedFields = (fieldList || []).map((f, i) => ({
    key: f.key,
    label: f.label || f.key,
    order: Number.isFinite(f.order) ? f.order : i,
    enabled: f.enabled !== false,
  }));

  if (isDefault) {
    await GstExportTemplate.updateMany(
      { reportType, ...(_id ? { _id: { $ne: _id } } : {}) },
      { $set: { isDefault: false } },
    );
  }

  if (_id) {
    return GstExportTemplate.findByIdAndUpdate(
      _id,
      { name, fields: normalizedFields, isDefault: Boolean(isDefault) },
      { new: true },
    ).lean();
  }

  const created = await GstExportTemplate.create({
    reportType,
    name,
    fields: normalizedFields,
    isDefault: Boolean(isDefault),
    createdBy,
  });
  return created.toObject();
}

export async function deleteTemplate(id) {
  const deleted = await GstExportTemplate.findByIdAndDelete(id).lean();
  return Boolean(deleted);
}

// ─────────────────────────────────────────────────────────────────────────────
// Projection — the "data model decoupled from template" step
// ─────────────────────────────────────────────────────────────────────────────

/** Project one lean Mongo doc through a field template into an ordered, relabelled object. */
export function projectRow(fieldDefs, doc) {
  const active = (fieldDefs || [])
    .filter((f) => f.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const out = {};
  for (const f of active) {
    out[f.label || f.key] = doc?.[f.key] ?? null;
  }
  return out;
}
