import mongoose from "mongoose";
import {
  ALL_INVOICE_DOC_TYPES,
  ALL_INVOICE_STATUSES,
  ALL_TAX_DOCUMENT_KINDS,
  ALL_INVOICE_ISSUE_TRIGGERS,
  INVOICE_DOC_TYPE,
  INVOICE_STATUS,
} from "../constants/finance.js";

/**
 * Invoice - immutable register of every statutory document issued for a seller's sale:
 * tax invoices, credit notes and debit notes (one row each).
 *
 * Dual numbering:
 *   zoognoRefNo  e.g. ZOO/INV/2026-27/000501   platform-wide, sequential, never duplicated
 *   sellerDocNo  e.g. ABC/26-27/000001         the seller's own per-FY series
 *
 * Integrity rules enforced by the indexes below (not just by application code):
 *   - one INVOICE per order            -> no duplicate invoice generation
 *   - a number is unique forever       -> an issued/cancelled number can never be re-issued
 *   - a sequence value is unique per (seller, docType, FY)
 * Documents are never deleted. Cancelling flips `status` to CANCELLED and keeps the number.
 */
const lineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: String,
    hsnSac: String,
    quantity: Number,
    unitPrice: Number,
    taxableValue: Number,
    gstRate: Number,
    cgstAmount: Number,
    sgstAmount: Number,
    igstAmount: Number,
    gstAmount: Number,
    lineTotal: Number,
    lineItemIndex: Number,
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    docType: {
      type: String,
      enum: ALL_INVOICE_DOC_TYPES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ALL_INVOICE_STATUSES,
      default: INVOICE_STATUS.ISSUED,
      index: true,
    },
    documentKind: {
      type: String,
      enum: ALL_TAX_DOCUMENT_KINDS,
      required: true,
    },
    financialYear: { type: String, required: true, index: true }, // "2026-27"

    // ── Dual numbers ─────────────────────────────────────────────────────────
    zoognoRefNo: { type: String, required: true },
    zoognoRefSeq: { type: Number, required: true },
    sellerDocNo: { type: String, required: true },
    sellerDocSeq: { type: Number, required: true },

    // ── Seller (supplier) snapshot ───────────────────────────────────────────
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    sellerPrefix: { type: String },
    sellerName: { type: String },
    sellerGstin: { type: String },
    sellerGstStatus: { type: String },
    sellerStateCode: { type: String },

    // ── Order / customer ─────────────────────────────────────────────────────
    // NOTE: deliberately NO `index: true` here. The only index on this key is the partial
    // unique "uniq_invoice_per_order" below; a second plain {orderMongoId:1} index would
    // clash with it (same key pattern, different options) and Mongoose only LOGS that error,
    // which would silently leave the duplicate-invoice guard uncreated.
    orderMongoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    orderRefId: { type: String, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    customerName: { type: String },
    placeOfSupply: { type: String },
    placeOfSupplyCode: { type: String },

    issuedAt: { type: Date, required: true, index: true },
    issueTrigger: { type: String, enum: ALL_INVOICE_ISSUE_TRIGGERS },

    // ── Amounts (INR) ────────────────────────────────────────────────────────
    taxableValue: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    cessAmount: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    lines: [lineSchema],

    // ── Credit / debit note linkage ──────────────────────────────────────────
    originalInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
    originalSellerDocNo: { type: String },
    originalZoognoRefNo: { type: String },
    reason: { type: String },
    // Idempotency key for notes (e.g. "CREDIT_NOTE:<orderId>:RETURN").
    noteKey: { type: String },

    // ── Cancellation (number is retained) ────────────────────────────────────
    cancelledAt: { type: Date },
    cancelReason: { type: String },
    cancelledBy: { type: String },
  },
  { timestamps: true },
);

// A number, once issued, is unique across the whole register - cancelled ones included.
invoiceSchema.index({ zoognoRefNo: 1 }, { unique: true });
invoiceSchema.index({ sellerDocNo: 1 }, { unique: true });
// A sequence value can be used once per seller/docType/FY (belt and braces vs. counters).
invoiceSchema.index(
  { sellerId: 1, docType: 1, financialYear: 1, sellerDocSeq: 1 },
  { unique: true },
);
invoiceSchema.index(
  { docType: 1, financialYear: 1, zoognoRefSeq: 1 },
  { unique: true },
);
// Exactly one tax invoice per order, ever (cancelled invoices count - no re-issue).
invoiceSchema.index(
  { orderMongoId: 1 },
  {
    unique: true,
    partialFilterExpression: { docType: INVOICE_DOC_TYPE.INVOICE },
    name: "uniq_invoice_per_order",
  },
);
invoiceSchema.index(
  { noteKey: 1 },
  { unique: true, partialFilterExpression: { noteKey: { $type: "string" } } },
);
// Seller-scoped reporting + admin dashboard filters. (issuedAt already has a single-field
// index from the field definition; a descending twin would be redundant.)
invoiceSchema.index({ sellerId: 1, financialYear: 1, issuedAt: 1 });

export default mongoose.model("Invoice", invoiceSchema);
