/**
 * invoiceNumbering.js - PURE helpers for the dual invoice numbering system.
 * No database access here: allocation of sequence values lives in invoiceService.js, so
 * the formatting / validation rules below can be unit-tested in isolation.
 *
 * Two numbers per document
 * ────────────────────────
 *  1. Zoogno reference  - platform-wide, sequential, internal tracking reference:
 *         ZOO/INV/2026-27/000501      (credit note: ZOO/CN/..., debit note: ZOO/DN/...)
 *  2. Seller document no. - the seller's statutory number, an independent series per
 *     seller, per financial year, per document type:
 *         ABC/26-27/000001            invoice
 *         ABC/26-27/CN0001            credit note
 *         ABC/26-27/DN0001            debit note
 *
 * WHY the seller number is compact (GST law, not style)
 * ─────────────────────────────────────────────────────
 * CGST Rule 46(b) (invoices) and Rule 53 (credit/debit notes) require a consecutive serial
 * number of AT MOST 16 characters using only letters, digits, "-" and "/". The GSTR-1 upload
 * schema enforces the same. The format "ABC/INV/2026-27/000001" is 22 characters and would be
 * rejected, so the seller series keeps the same structure (prefix / FY / sequence) in 16.
 * assertValidSellerDocNo() makes a non-compliant number impossible to issue.
 *
 * Financial year is computed in IST (UTC+05:30), not server-local time: a document issued at
 * 00:30 IST on 1 April must land in the NEW financial year even on a UTC server.
 */

import { INVOICE_DOC_TYPE } from "../../constants/finance.js";

/** Rule 46(b) / Rule 53 hard limit for the statutory serial number. */
export const SELLER_DOC_MAX_LENGTH = 16;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const FY_START_MONTH = 4; // India: 1 April - 31 March (statutory, not configurable)

const ZOOGNO_DOC_CODE = {
  [INVOICE_DOC_TYPE.INVOICE]: "INV",
  [INVOICE_DOC_TYPE.CREDIT_NOTE]: "CN",
  [INVOICE_DOC_TYPE.DEBIT_NOTE]: "DN",
};

// Seller series: sequence width + the marker placed before the sequence.
const SELLER_SERIES_SHAPE = {
  [INVOICE_DOC_TYPE.INVOICE]: { marker: "", width: 6 },
  [INVOICE_DOC_TYPE.CREDIT_NOTE]: { marker: "CN", width: 4 },
  [INVOICE_DOC_TYPE.DEBIT_NOTE]: { marker: "DN", width: 4 },
};

// What the GSTN schema accepts for an invoice/note number.
const STATUTORY_NO_PATTERN = /^[A-Z0-9][A-Z0-9/-]{0,15}$/;

function assertDocType(docType) {
  if (!ZOOGNO_DOC_CODE[docType]) {
    throw new Error(`Unknown invoice document type: ${docType}`);
  }
}

/**
 * Financial year ("2026-27") that `date` falls in, evaluated in IST.
 */
export function financialYearIST(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date for financial year");
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const month = ist.getUTCMonth() + 1; // 1-12
  const year = ist.getUTCFullYear();
  const start = month >= FY_START_MONTH ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

/** "2026-27" -> "26-27" (used inside the 16-char statutory number). */
export function shortFinancialYear(financialYear) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(financialYear || ""));
  if (!m) throw new Error(`Invalid financial year: ${financialYear}`);
  return `${m[1].slice(-2)}-${m[2]}`;
}

const pad = (n, width) => String(n).padStart(width, "0");

function assertPositiveInt(seq) {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`Invalid sequence value: ${seq}`);
  }
}

/**
 * Platform-wide Zoogno reference, e.g. ZOO/INV/2026-27/000501.
 * Not a statutory number, so the 16-char limit does not apply to it.
 */
export function formatZoognoRefNo(docType, financialYear, seq) {
  assertDocType(docType);
  assertPositiveInt(seq);
  shortFinancialYear(financialYear); // validates shape
  return `ZOO/${ZOOGNO_DOC_CODE[docType]}/${financialYear}/${pad(seq, 6)}`;
}

/**
 * Throws unless `no` is a legal statutory number (<= 16 chars, A-Z 0-9 / -).
 * Called on every number before it is stored, so a non-compliant number can never be issued.
 */
export function assertValidSellerDocNo(no) {
  if (
    typeof no !== "string" ||
    no.length > SELLER_DOC_MAX_LENGTH ||
    !STATUTORY_NO_PATTERN.test(no)
  ) {
    const err = new Error(
      `Seller document number "${no}" is not GST-compliant (max ${SELLER_DOC_MAX_LENGTH} chars, A-Z 0-9 / - only)`,
    );
    err.code = "SELLER_DOC_NO_INVALID";
    throw err;
  }
  return no;
}

/**
 * Seller statutory number, e.g. ABC/26-27/000001 (invoice) or ABC/26-27/CN0001 (credit note).
 */
export function formatSellerDocNo({ docType, prefix, financialYear, seq }) {
  assertDocType(docType);
  assertPositiveInt(seq);
  if (!/^[A-Z0-9]{1,3}$/.test(String(prefix || ""))) {
    throw new Error(`Invalid seller invoice prefix: ${prefix}`);
  }
  const { marker, width } = SELLER_SERIES_SHAPE[docType];
  const no = `${prefix}/${shortFinancialYear(financialYear)}/${marker}${pad(seq, width)}`;
  return assertValidSellerDocNo(no);
}

// ── Counter ids (the Counter collection is keyed by string _id) ──────────────

/** One platform-wide counter per (docType, FY): Zoogno refs never collide across sellers. */
export function zoognoCounterId(docType, financialYear) {
  assertDocType(docType);
  return `ZOO_REF:${docType}:${financialYear}`;
}

/** One independent counter per (seller, docType, FY): separate series, reset each FY. */
export function sellerCounterId(sellerId, docType, financialYear) {
  assertDocType(docType);
  if (!sellerId) throw new Error("sellerId is required for a seller counter");
  return `SELLER_DOC:${String(sellerId)}:${docType}:${financialYear}`;
}

// ── Seller prefix derivation ─────────────────────────────────────────────────

const PREFIX_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Ordered candidate prefixes (1-3 chars of A-Z0-9) derived from a shop name. The caller
 * claims the first one not already taken; the prefix is then immutable for that seller.
 * Always returns at least one candidate.
 */
export function sellerPrefixCandidates(name) {
  const cleaned = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  const words = cleaned ? cleaned.split(" ") : [];
  const compact = words.join("");

  const out = [];
  const add = (c) => {
    const v = String(c || "").slice(0, 3);
    if (/^[A-Z0-9]{1,3}$/.test(v) && !out.includes(v)) out.push(v);
  };

  if (words.length >= 3) add(words.slice(0, 3).map((w) => w[0]).join("")); // "Dine in Dime" -> DID
  if (words.length === 2) add(`${words[0][0]}${words[1].slice(0, 2)}`); // "Any Food" -> AFO
  add(compact.slice(0, 3)); // "Zepto" -> ZEP
  add(compact.slice(0, 2));

  // Collision variants: keep the first two chars, vary the third.
  const base2 = (compact.slice(0, 2) || "SL").padEnd(2, "X");
  for (const ch of PREFIX_ALPHABET) add(base2 + ch);

  if (out.length === 0) add("SLR");
  return out;
}
