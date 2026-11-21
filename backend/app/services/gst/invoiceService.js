/**
 * invoiceService.js - issues and tracks seller tax invoices, credit notes and debit notes
 * with DUAL numbering (see invoiceNumbering.js).
 *
 * Guarantees
 * ──────────
 *  - No gaps: both sequence values are allocated INSIDE the same Mongo transaction that
 *    inserts the document. If anything fails the whole transaction aborts and the counters
 *    roll back, so a number is consumed only when its document exists.
 *  - No duplicates: a partial unique index allows one INVOICE per order, and number/sequence
 *    uniqueness is enforced by unique indexes - so concurrent dispatches, retries and
 *    backstops all converge on the single invoice instead of issuing a second one.
 *  - No reuse: documents are never deleted. Cancelling flips `status` and keeps the number.
 *  - Cancelled-before-invoice consumes nothing: an invoice is only ever created at dispatch
 *    (rider pickup); orders cancelled earlier never reach this code.
 *  - Seller isolation: every seller has an independent series, and every query helper that
 *    serves a seller is scoped by sellerId.
 */

import mongoose from "mongoose";
import Invoice from "../../models/invoice.js";
import Counter from "../../models/counter.js";
import Order from "../../models/order.js";
import Seller from "../../models/seller.js";
import User from "../../models/customer.js";
import { roundCurrency } from "../../utils/money.js";
import { escapeRegExp } from "../admin/shared/sellerAdminUtils.js";
import logger from "../logger.js";
import {
  computeTaxBreakdown,
  stateCodeFromGstin,
  stateNameFromCode,
} from "./gstConfigService.js";
import {
  financialYearIST,
  formatZoognoRefNo,
  formatSellerDocNo,
  zoognoCounterId,
  sellerCounterId,
  sellerPrefixCandidates,
} from "./invoiceNumbering.js";
import {
  INVOICE_DOC_TYPE,
  INVOICE_STATUS,
  INVOICE_ISSUE_TRIGGER,
  TAX_DOCUMENT_KIND,
  SELLER_GST_STATUS,
} from "../../constants/finance.js";

const MAX_ISSUE_ATTEMPTS = 5;
const PREFIX_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Build the integrity indexes this module's guarantees rest on. Called at startup so they
 * exist even where Mongoose `autoIndex` is disabled (as it can be in production).
 *
 * Without these, the application-level checks still prevent the common cases, but only the
 * database can close the concurrent-request race: one invoice per order, a number is never
 * issued twice, and a seller prefix belongs to one seller. Idempotent; throws if an index
 * cannot be built (e.g. a conflicting legacy definition) so the caller can flag it loudly.
 */
export async function ensureInvoiceIndexes() {
  await Invoice.createIndexes();
  await Seller.collection.createIndex(
    { invoicePrefix: 1 },
    { unique: true, partialFilterExpression: { invoicePrefix: { $type: "string" } } },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function isDuplicateKeyError(err) {
  return err?.code === 11000 || /E11000/.test(String(err?.message || ""));
}

function toPlain(doc) {
  return doc && typeof doc.toObject === "function" ? doc.toObject() : doc;
}

function isOrderCancelled(order) {
  return order?.workflowStatus === "CANCELLED" || order?.status === "cancelled";
}

function isOrderDelivered(order) {
  return (
    order?.workflowStatus === "DELIVERED" ||
    order?.status === "delivered" ||
    Boolean(order?.deliveredAt)
  );
}

async function loadOrder(orderOrId) {
  if (orderOrId && typeof orderOrId === "object" && orderOrId._id && Array.isArray(orderOrId.items)) {
    return toPlain(orderOrId);
  }
  const id = orderOrId?._id || orderOrId;
  if (!id) return null;
  return Order.findById(id).lean();
}

/** Run `work(session)` in one transaction (auto-retrying transient errors). */
async function runInTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    session.endSession();
  }
}

async function allocateSequence(counterId, session) {
  const doc = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { sequence_value: 1 } },
    { upsert: true, new: true, session },
  );
  return doc.sequence_value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seller invoice prefix (assigned once, then immutable)
// ─────────────────────────────────────────────────────────────────────────────

function randomPrefix() {
  let s = "";
  for (let i = 0; i < 3; i += 1) {
    s += PREFIX_ALPHABET[Math.floor(Math.random() * PREFIX_ALPHABET.length)];
  }
  return s;
}

async function tryClaimPrefix(sellerId, candidate) {
  const claimed = await Seller.findOneAndUpdate(
    // Only claim while the seller still has none - never overwrite an existing prefix.
    { _id: sellerId, $or: [{ invoicePrefix: { $exists: false } }, { invoicePrefix: null }] },
    { $set: { invoicePrefix: candidate } },
    { new: true },
  )
    .select("invoicePrefix")
    .lean();
  if (claimed?.invoicePrefix) return claimed.invoicePrefix;

  // Lost a race to a concurrent request that already assigned one - use theirs.
  const fresh = await Seller.findById(sellerId).select("invoicePrefix").lean();
  return fresh?.invoicePrefix || null;
}

/**
 * Returns the seller's series prefix, assigning a unique one on first use.
 * The unique index on Seller.invoicePrefix makes a collision a DB error, not a silent dupe.
 */
export async function ensureSellerInvoicePrefix(seller) {
  if (seller?.invoicePrefix) return seller.invoicePrefix;

  const candidates = sellerPrefixCandidates(seller?.shopName || seller?.name);
  for (const candidate of candidates) {
    try {
      const prefix = await tryClaimPrefix(seller._id, candidate);
      if (prefix) return prefix;
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err; // taken by another seller - try the next
    }
  }
  for (let i = 0; i < 50; i += 1) {
    try {
      const prefix = await tryClaimPrefix(seller._id, randomPrefix());
      if (prefix) return prefix;
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
  throw new Error("Unable to allocate a unique invoice prefix for seller");
}

// ─────────────────────────────────────────────────────────────────────────────
// Amount computation (same tax logic as the GST ledger, so figures agree)
// ─────────────────────────────────────────────────────────────────────────────

function resolveSellerStateCode(seller) {
  return seller?.stateCode || (seller?.gstin ? stateCodeFromGstin(seller.gstin) : null) || null;
}

/**
 * `includeTax` is false for an unregistered/composition seller's Bill of Supply: per the
 * corrections brief, that document must show NO GST, HSN or tax breakup at all - just the
 * plain product value - so tax is never computed for it, not merely hidden at render time.
 */
function buildLine({ item, index, unitPrice, quantity, sellerStateCode, posCode, includeTax = true }) {
  const price = roundCurrency(unitPrice || 0);
  const qty = quantity || 1;
  const taxableValue = roundCurrency(price * qty);

  if (!includeTax) {
    return {
      productId: item?.product,
      productName: item?.name,
      hsnSac: "",
      quantity: qty,
      unitPrice: price,
      taxableValue,
      gstRate: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      gstAmount: 0,
      lineTotal: taxableValue,
      lineItemIndex: index,
    };
  }

  const gstRate = item?.gstRate || 0;
  const tax = computeTaxBreakdown({
    supplierStateCode: sellerStateCode,
    posCode,
    taxableValue,
    gstRate,
    customerGstin: null,
  });
  return {
    productId: item?.product,
    productName: item?.name,
    hsnSac: item?.hsnCode || "",
    quantity: qty,
    unitPrice: price,
    taxableValue,
    gstRate,
    cgstAmount: tax.cgstAmount,
    sgstAmount: tax.sgstAmount,
    igstAmount: tax.igstAmount,
    gstAmount: tax.gstAmount,
    lineTotal: tax.invoiceTotal,
    lineItemIndex: index,
  };
}

function totalsFromLines(lines) {
  const sum = (key) => roundCurrency(lines.reduce((acc, l) => acc + Number(l[key] || 0), 0));
  return {
    taxableValue: sum("taxableValue"),
    cgstAmount: sum("cgstAmount"),
    sgstAmount: sum("sgstAmount"),
    igstAmount: sum("igstAmount"),
    cessAmount: 0,
    gstAmount: sum("gstAmount"),
    grandTotal: sum("lineTotal"),
  };
}

function documentKindForSeller(seller) {
  return seller?.gstStatus === SELLER_GST_STATUS.REGISTERED
    ? TAX_DOCUMENT_KIND.TAX_INVOICE
    : TAX_DOCUMENT_KIND.BILL_OF_SUPPLY;
}

// ─────────────────────────────────────────────────────────────────────────────
// Issue the seller tax invoice (at dispatch)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Issue the seller's statutory tax invoice + Zoogno reference for an order.
 * Idempotent: returns the existing invoice if one was already issued.
 *
 * Returns { invoice, created, skipped? }. `skipped` explains why no number was consumed
 * (order cancelled / not found / no items) - in those cases NOTHING is allocated.
 */
export async function issueInvoiceForOrder(
  orderOrId,
  { trigger = INVOICE_ISSUE_TRIGGER.DISPATCH } = {},
) {
  const order = await loadOrder(orderOrId);
  if (!order) return { invoice: null, created: false, skipped: "ORDER_NOT_FOUND" };

  // A cancelled order must never consume a statutory invoice number.
  if (isOrderCancelled(order)) {
    return { invoice: null, created: false, skipped: "ORDER_CANCELLED" };
  }
  if (!order.seller) return { invoice: null, created: false, skipped: "NO_SELLER" };
  if (!Array.isArray(order.items) || order.items.length === 0) {
    return { invoice: null, created: false, skipped: "NO_ITEMS" };
  }

  const findExisting = () =>
    Invoice.findOne({ orderMongoId: order._id, docType: INVOICE_DOC_TYPE.INVOICE }).lean();

  const existing = await findExisting();
  if (existing) return { invoice: existing, created: false };

  const seller = await Seller.findById(order.seller)
    .select("name shopName gstin gstStatus stateCode invoicePrefix")
    .lean();
  if (!seller) return { invoice: null, created: false, skipped: "SELLER_NOT_FOUND" };

  const sellerPrefix = await ensureSellerInvoicePrefix(seller);
  const customer = order.customer
    ? await User.findById(order.customer).select("name").lean()
    : null;

  const sellerStateCode = resolveSellerStateCode(seller);
  // Same simplification as gstTransactionService: place of supply follows the seller's state.
  const posCode = sellerStateCode || "";
  const includeTax = documentKindForSeller(seller) === TAX_DOCUMENT_KIND.TAX_INVOICE;
  const lines = order.items.map((item, index) =>
    buildLine({
      item,
      index,
      unitPrice: item.price,
      quantity: item.quantity,
      sellerStateCode,
      posCode,
      includeTax,
    }),
  );
  const totals = totalsFromLines(lines);

  let lastErr;
  for (let attempt = 0; attempt < MAX_ISSUE_ATTEMPTS; attempt += 1) {
    const issuedAt = new Date();
    const financialYear = financialYearIST(issuedAt);
    try {
      const invoice = await runInTransaction(async (session) => {
        const zoognoRefSeq = await allocateSequence(
          zoognoCounterId(INVOICE_DOC_TYPE.INVOICE, financialYear),
          session,
        );
        const sellerDocSeq = await allocateSequence(
          sellerCounterId(seller._id, INVOICE_DOC_TYPE.INVOICE, financialYear),
          session,
        );
        const zoognoRefNo = formatZoognoRefNo(INVOICE_DOC_TYPE.INVOICE, financialYear, zoognoRefSeq);
        const sellerDocNo = formatSellerDocNo({
          docType: INVOICE_DOC_TYPE.INVOICE,
          prefix: sellerPrefix,
          financialYear,
          seq: sellerDocSeq,
        });

        const [created] = await Invoice.create(
          [
            {
              docType: INVOICE_DOC_TYPE.INVOICE,
              status: INVOICE_STATUS.ISSUED,
              documentKind: documentKindForSeller(seller),
              financialYear,
              zoognoRefNo,
              zoognoRefSeq,
              sellerDocNo,
              sellerDocSeq,
              sellerId: seller._id,
              sellerPrefix,
              sellerName: seller.shopName || seller.name || "",
              sellerGstin: seller.gstin || null,
              sellerGstStatus: seller.gstStatus || SELLER_GST_STATUS.UNREGISTERED,
              sellerStateCode,
              orderMongoId: order._id,
              orderRefId: order.orderId,
              customerId: order.customer,
              customerName: customer?.name || "",
              placeOfSupply: stateNameFromCode(posCode),
              placeOfSupplyCode: posCode,
              issuedAt,
              issueTrigger: trigger,
              ...totals,
              lines,
            },
          ],
          { session },
        );

        await Order.updateOne(
          { _id: order._id },
          {
            $set: {
              invoice: {
                invoiceId: created._id,
                zoognoRefNo,
                sellerInvoiceNo: sellerDocNo,
                issuedAt,
                status: INVOICE_STATUS.ISSUED,
              },
            },
          },
          { session },
        );
        return toPlain(created);
      });
      return { invoice, created: true };
    } catch (err) {
      lastErr = err;
      if (!isDuplicateKeyError(err)) throw err;
      // Either another request just issued this order's invoice (converge on it) or two
      // transactions raced to create the same brand-new counter (retry).
      const again = await findExisting();
      if (again) return { invoice: again, created: false };
    }
  }
  logger.error("Invoice issue failed after retries", {
    scope: "INVOICE",
    orderId: order.orderId,
    error: lastErr?.message,
  });
  throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancellation (number retained)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark an order's invoice CANCELLED. The number is kept and can never be reused.
 *
 *  - No invoice yet            -> no-op; nothing was ever allocated for this order.
 *  - Order already delivered   -> NOT cancelled: the supply happened, so the correct
 *                                 instrument is a credit note (issueCreditNoteForOrder).
 */
export async function cancelInvoiceForOrder(
  orderOrId,
  { reason = "Order cancelled", cancelledBy = "system" } = {},
) {
  const order = await loadOrder(orderOrId);
  if (!order) return { cancelled: false, skipped: "ORDER_NOT_FOUND" };

  const invoice = await Invoice.findOne({
    orderMongoId: order._id,
    docType: INVOICE_DOC_TYPE.INVOICE,
  }).lean();
  if (!invoice) return { cancelled: false, skipped: "NO_INVOICE" };
  if (invoice.status === INVOICE_STATUS.CANCELLED) {
    return { cancelled: false, invoice, skipped: "ALREADY_CANCELLED" };
  }
  if (isOrderDelivered(order)) {
    return { cancelled: false, invoice, skipped: "ALREADY_DELIVERED" };
  }

  const now = new Date();
  const updated = await Invoice.findOneAndUpdate(
    { _id: invoice._id, status: INVOICE_STATUS.ISSUED },
    {
      $set: {
        status: INVOICE_STATUS.CANCELLED,
        cancelledAt: now,
        cancelReason: String(reason).slice(0, 500),
        cancelledBy,
      },
    },
    { new: true },
  ).lean();
  if (!updated) return { cancelled: false, skipped: "ALREADY_CANCELLED" };

  await Order.updateOne({ _id: order._id }, { $set: { "invoice.status": INVOICE_STATUS.CANCELLED } });
  return { cancelled: true, invoice: updated };
}

// ─────────────────────────────────────────────────────────────────────────────
// Credit notes / debit notes (separate series, seller-issued)
// ─────────────────────────────────────────────────────────────────────────────

async function persistNote({ docType, original, lines, reason, noteKey, trigger, order }) {
  const totals = totalsFromLines(lines);

  const findByKey = () => (noteKey ? Invoice.findOne({ noteKey }).lean() : null);
  const already = await findByKey();
  if (already) return { note: already, created: false };

  let lastErr;
  for (let attempt = 0; attempt < MAX_ISSUE_ATTEMPTS; attempt += 1) {
    const issuedAt = new Date();
    const financialYear = financialYearIST(issuedAt);
    try {
      const note = await runInTransaction(async (session) => {
        const zoognoRefSeq = await allocateSequence(zoognoCounterId(docType, financialYear), session);
        const sellerDocSeq = await allocateSequence(
          sellerCounterId(original.sellerId, docType, financialYear),
          session,
        );
        const [created] = await Invoice.create(
          [
            {
              docType,
              status: INVOICE_STATUS.ISSUED,
              documentKind: original.documentKind,
              financialYear,
              zoognoRefNo: formatZoognoRefNo(docType, financialYear, zoognoRefSeq),
              zoognoRefSeq,
              sellerDocNo: formatSellerDocNo({
                docType,
                prefix: original.sellerPrefix,
                financialYear,
                seq: sellerDocSeq,
              }),
              sellerDocSeq,
              sellerId: original.sellerId,
              sellerPrefix: original.sellerPrefix,
              sellerName: original.sellerName,
              sellerGstin: original.sellerGstin,
              sellerGstStatus: original.sellerGstStatus,
              sellerStateCode: original.sellerStateCode,
              orderMongoId: original.orderMongoId,
              orderRefId: original.orderRefId,
              customerId: original.customerId,
              customerName: original.customerName,
              placeOfSupply: original.placeOfSupply,
              placeOfSupplyCode: original.placeOfSupplyCode,
              issuedAt,
              issueTrigger: trigger,
              ...totals,
              lines,
              originalInvoiceId: original._id,
              originalSellerDocNo: original.sellerDocNo,
              originalZoognoRefNo: original.zoognoRefNo,
              reason: String(reason || "").slice(0, 500),
              ...(noteKey ? { noteKey } : {}),
            },
          ],
          { session },
        );
        return toPlain(created);
      });
      return { note, created: true, order };
    } catch (err) {
      lastErr = err;
      if (!isDuplicateKeyError(err)) throw err;
      const again = await findByKey();
      if (again) return { note: again, created: false };
    }
  }
  throw lastErr;
}

/**
 * Issue a CREDIT NOTE (seller's CN series) against the order's tax invoice for returned goods.
 *
 * `returnItems` mirror Order.returnItems: { itemIndex?, product, variantSlot?, quantity, price }.
 * Idempotent per order via `noteKey`. Skips (consuming nothing) when the order has no issued
 * invoice - e.g. orders delivered before dual numbering existed - rather than inventing a
 * credit note that references no invoice.
 */
export async function issueCreditNoteForOrder(
  orderOrId,
  { returnItems = [], reason = "RETURN", noteKey } = {},
) {
  const order = await loadOrder(orderOrId);
  if (!order) return { note: null, created: false, skipped: "ORDER_NOT_FOUND" };

  const original = await Invoice.findOne({
    orderMongoId: order._id,
    docType: INVOICE_DOC_TYPE.INVOICE,
  }).lean();
  if (!original) return { note: null, created: false, skipped: "NO_ORIGINAL_INVOICE" };
  if (original.status === INVOICE_STATUS.CANCELLED) {
    return { note: null, created: false, skipped: "ORIGINAL_INVOICE_CANCELLED" };
  }

  const orderItems = Array.isArray(order.items) ? order.items : [];
  const includeTax = original.documentKind === TAX_DOCUMENT_KIND.TAX_INVOICE;
  const lines = [];
  for (const ri of returnItems) {
    const idx = Number.isInteger(ri.itemIndex) && orderItems[ri.itemIndex]
      ? ri.itemIndex
      : orderItems.findIndex(
          (it) =>
            String(it.product) === String(ri.product) &&
            (ri.variantSlot == null || it.variantSlot === ri.variantSlot),
        );
    const item = idx >= 0 ? orderItems[idx] : null;
    if (!item) continue;
    // Never credit more than was invoiced for the line.
    const quantity = Math.min(Number(ri.quantity) || 0, Number(item.quantity) || 0);
    if (quantity <= 0) continue;
    lines.push(
      buildLine({
        item,
        index: idx,
        unitPrice: ri.price ?? item.price,
        quantity,
        sellerStateCode: original.sellerStateCode,
        posCode: original.placeOfSupplyCode || "",
        includeTax,
      }),
    );
  }
  if (lines.length === 0) return { note: null, created: false, skipped: "NOTHING_TO_CREDIT" };

  return persistNote({
    docType: INVOICE_DOC_TYPE.CREDIT_NOTE,
    original,
    lines,
    reason,
    noteKey: noteKey || `${INVOICE_DOC_TYPE.CREDIT_NOTE}:${order._id}:RETURN`,
    trigger: INVOICE_ISSUE_TRIGGER.RETURN,
    order,
  });
}

/**
 * Issue a DEBIT NOTE (seller's DN series) raising the value of an already-issued invoice
 * (e.g. an upward price/tax correction). No automatic business event triggers this today; it
 * exists so debit notes have their own series and register rows, separate from credit notes.
 *
 * `lines`: [{ description, taxableValue, gstRate }]
 */
export async function issueDebitNote(invoiceId, { lines = [], reason, noteKey } = {}) {
  const original = await Invoice.findOne({
    _id: invoiceId,
    docType: INVOICE_DOC_TYPE.INVOICE,
  }).lean();
  if (!original) return { note: null, created: false, skipped: "NO_ORIGINAL_INVOICE" };
  if (original.status === INVOICE_STATUS.CANCELLED) {
    return { note: null, created: false, skipped: "ORIGINAL_INVOICE_CANCELLED" };
  }

  const includeTax = original.documentKind === TAX_DOCUMENT_KIND.TAX_INVOICE;
  const built = lines
    .filter((l) => Number(l.taxableValue) > 0)
    .map((l, i) => {
      const taxableValue = roundCurrency(l.taxableValue);
      if (!includeTax) {
        return {
          productName: l.description || "Debit note adjustment",
          hsnSac: "",
          quantity: 1,
          unitPrice: taxableValue,
          taxableValue,
          gstRate: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          gstAmount: 0,
          lineTotal: taxableValue,
          lineItemIndex: i,
        };
      }
      const tax = computeTaxBreakdown({
        supplierStateCode: original.sellerStateCode,
        posCode: original.placeOfSupplyCode || "",
        taxableValue,
        gstRate: l.gstRate || 0,
        customerGstin: null,
      });
      return {
        productName: l.description || "Debit note adjustment",
        hsnSac: l.hsnSac || "",
        quantity: 1,
        unitPrice: taxableValue,
        taxableValue,
        gstRate: l.gstRate || 0,
        cgstAmount: tax.cgstAmount,
        sgstAmount: tax.sgstAmount,
        igstAmount: tax.igstAmount,
        gstAmount: tax.gstAmount,
        lineTotal: tax.invoiceTotal,
        lineItemIndex: i,
      };
    });
  if (built.length === 0) return { note: null, created: false, skipped: "NOTHING_TO_DEBIT" };

  return persistNote({
    docType: INVOICE_DOC_TYPE.DEBIT_NOTE,
    original,
    lines: built,
    reason,
    noteKey,
    trigger: INVOICE_ISSUE_TRIGGER.MANUAL,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads (admin dashboard / seller view / reports)
// ─────────────────────────────────────────────────────────────────────────────

export async function getInvoiceForOrder(orderMongoId) {
  return Invoice.findOne({ orderMongoId, docType: INVOICE_DOC_TYPE.INVOICE }).lean();
}

/**
 * Build the register filter. `sellerId` is how a seller is confined to their own documents:
 * the seller-facing controller always passes the authenticated seller's id, never a client value.
 * Search matches EITHER number (or order id / seller name).
 */
export function buildInvoiceFilter(params = {}) {
  const filter = {};

  if (params.sellerId) {
    filter.sellerId = mongoose.Types.ObjectId.isValid(String(params.sellerId))
      ? new mongoose.Types.ObjectId(String(params.sellerId))
      : params.sellerId;
  }
  if (params.docType) filter.docType = params.docType;
  if (params.status) filter.status = params.status;
  if (params.financialYear) filter.financialYear = params.financialYear;

  const term = String(params.search || "").trim();
  if (term) {
    const rx = new RegExp(escapeRegExp(term), "i");
    filter.$or = [
      { zoognoRefNo: rx },
      { sellerDocNo: rx },
      { originalSellerDocNo: rx },
      { originalZoognoRefNo: rx },
      { orderRefId: rx },
      { sellerName: rx },
    ];
  }

  if (params.startDate || params.endDate) {
    filter.issuedAt = {};
    if (params.startDate) filter.issuedAt.$gte = new Date(params.startDate);
    if (params.endDate) {
      const end = new Date(params.endDate);
      end.setHours(23, 59, 59, 999);
      filter.issuedAt.$lte = end;
    }
  }
  return filter;
}

export async function listInvoices(params = {}, { skip = 0, limit = 25, page = 1 } = {}) {
  const filter = buildInvoiceFilter(params);
  const [items, total] = await Promise.all([
    Invoice.find(filter).sort({ issuedAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    Invoice.countDocuments(filter),
  ]);
  return { items, page, limit, total, totalPages: Math.ceil(total / limit) || 1 };
}

/** Fetch one document; pass `sellerId` to confine a seller to their own. */
export async function getInvoiceById(id, { sellerId } = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) return null;
  const filter = { _id: id };
  if (sellerId) filter.sellerId = sellerId;
  return Invoice.findOne(filter).lean();
}
