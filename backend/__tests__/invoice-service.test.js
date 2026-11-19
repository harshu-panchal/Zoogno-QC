import { jest } from "@jest/globals";
import mongoose from "mongoose";

/**
 * invoiceService tests run against a small in-memory fake of the DB that enforces the SAME
 * unique indexes as models/invoice.js and rolls counters back when a transaction fails.
 * Those two behaviours are what the "no gaps, no duplicates, no reuse" guarantees rest on, so
 * the fake models them explicitly rather than mocking the guarantees away.
 */

// ── in-memory database ──────────────────────────────────────────────────────
let counters; // Map<_id, sequence_value>
let invoices; // stored Invoice docs
let sellers; // Map<idString, seller>

const oid = () => new mongoose.Types.ObjectId();
const chain = (value) => ({ lean: async () => value, select: () => chain(value) });

function dupKeyError(what) {
  const e = new Error(`E11000 duplicate key error collection: ${what}`);
  e.code = 11000;
  return e;
}

function matches(doc, filter) {
  return Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date)) {
      return true; // operators ($or etc.) are not needed by the code under test here
    }
    return String(doc[k]) === String(v);
  });
}

const mockCounterFindOneAndUpdate = jest.fn(async ({ _id }, update) => {
  const next = (counters.get(_id) || 0) + update.$inc.sequence_value;
  counters.set(_id, next);
  return { _id, sequence_value: next };
});

const mockInvoiceFindOne = jest.fn((filter) => chain(invoices.find((d) => matches(d, filter)) || null));

const mockInvoiceCreate = jest.fn(async ([doc]) => {
  // Same unique indexes as models/invoice.js
  for (const d of invoices) {
    if (d.zoognoRefNo === doc.zoognoRefNo) throw dupKeyError("zoognoRefNo");
    if (d.sellerDocNo === doc.sellerDocNo) throw dupKeyError("sellerDocNo");
    if (
      String(d.sellerId) === String(doc.sellerId) &&
      d.docType === doc.docType &&
      d.financialYear === doc.financialYear &&
      d.sellerDocSeq === doc.sellerDocSeq
    ) throw dupKeyError("sellerId+docType+FY+seq");
    if (d.docType === doc.docType && d.financialYear === doc.financialYear && d.zoognoRefSeq === doc.zoognoRefSeq) {
      throw dupKeyError("docType+FY+zoognoRefSeq");
    }
    if (doc.docType === "INVOICE" && d.docType === "INVOICE" && String(d.orderMongoId) === String(doc.orderMongoId)) {
      throw dupKeyError("uniq_invoice_per_order");
    }
    if (doc.noteKey && d.noteKey === doc.noteKey) throw dupKeyError("noteKey");
  }
  const stored = { ...doc, _id: oid() };
  invoices.push(stored);
  return [{ ...stored, toObject: () => stored }];
});

const mockInvoiceFindOneAndUpdate = jest.fn((filter, update) => {
  const doc = invoices.find((d) => matches(d, filter));
  if (!doc) return chain(null);
  Object.assign(doc, update.$set);
  return chain({ ...doc });
});

const mockOrderUpdateOne = jest.fn(async () => ({}));

const mockSellerFindById = jest.fn((id) => {
  const s = sellers.get(String(id));
  return chain(s ? { ...s } : null);
});
const mockSellerFindOneAndUpdate = jest.fn((filter, update) => {
  const run = async () => {
    const s = sellers.get(String(filter._id));
    if (!s || s.invoicePrefix) return null; // filter only matches a seller with no prefix yet
    const candidate = update.$set.invoicePrefix;
    for (const other of sellers.values()) {
      if (other.invoicePrefix === candidate) throw dupKeyError("invoicePrefix");
    }
    s.invoicePrefix = candidate;
    return { invoicePrefix: candidate };
  };
  return { select: () => ({ lean: run }) };
});
const mockUserFindById = jest.fn(() => chain({ name: "Asha Customer" }));

jest.unstable_mockModule("../app/models/invoice.js", () => ({
  default: {
    findOne: mockInvoiceFindOne,
    create: mockInvoiceCreate,
    findOneAndUpdate: mockInvoiceFindOneAndUpdate,
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));
jest.unstable_mockModule("../app/models/counter.js", () => ({
  default: { findOneAndUpdate: mockCounterFindOneAndUpdate },
}));
jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { updateOne: mockOrderUpdateOne, findById: jest.fn() },
}));
jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: { findById: mockSellerFindById, findOneAndUpdate: mockSellerFindOneAndUpdate },
}));
jest.unstable_mockModule("../app/models/customer.js", () => ({
  default: { findById: mockUserFindById },
}));

const svc = await import("../app/services/gst/invoiceService.js");

// Transactions: snapshot counters + invoices, restore both if the callback throws.
mongoose.startSession = jest.fn(async () => ({
  withTransaction: async (fn) => {
    const snapCounters = new Map(counters);
    const snapInvoices = [...invoices];
    try {
      await fn();
    } catch (err) {
      counters = snapCounters;
      invoices = snapInvoices;
      throw err;
    }
  },
  endSession: jest.fn(),
}));

// ── fixtures ────────────────────────────────────────────────────────────────
const NOW = "2026-08-15T05:00:00Z"; // FY 2026-27

function makeSeller(over = {}) {
  const s = {
    _id: oid(),
    shopName: "Dine in Dime",
    gstin: "21ABCDE1234F1Z5",
    gstStatus: "REGISTERED",
    stateCode: "21",
    ...over,
  };
  sellers.set(String(s._id), s);
  return s;
}

let orderSeq = 0;
function makeOrder(seller, over = {}) {
  orderSeq += 1;
  return {
    _id: oid(),
    orderId: `ORD-TEST-${orderSeq}`,
    seller: seller._id,
    customer: oid(),
    status: "out_for_delivery",
    workflowStatus: "OUT_FOR_DELIVERY",
    items: [
      { product: oid(), name: "Burger", quantity: 2, price: 100, gstRate: 18, hsnCode: "1905", variantSlot: "r" },
      { product: oid(), name: "Fries", quantity: 1, price: 50, gstRate: 5, hsnCode: "2004" },
    ],
    ...over,
  };
}

beforeEach(() => {
  counters = new Map();
  invoices = [];
  sellers = new Map();
  orderSeq = 0;
  jest.clearAllMocks();
  jest.useFakeTimers({
    now: new Date(NOW),
    // Only Date is faked; every timer API stays real so async code is unaffected.
    doNotFake: [
      "hrtime", "nextTick", "performance", "queueMicrotask", "requestAnimationFrame",
      "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback", "setImmediate",
      "clearImmediate", "setInterval", "clearInterval", "setTimeout", "clearTimeout",
    ],
  });
});

afterEach(() => {
  jest.useRealTimers();
});

// ── issuing ─────────────────────────────────────────────────────────────────
describe("issueInvoiceForOrder", () => {
  test("issues BOTH numbers: Zoogno reference + the seller's statutory number", async () => {
    const seller = makeSeller();
    const order = makeOrder(seller);

    const { invoice, created } = await svc.issueInvoiceForOrder(order);

    expect(created).toBe(true);
    expect(invoice.zoognoRefNo).toBe("ZOO/INV/2026-27/000001");
    expect(invoice.sellerDocNo).toBe("DID/26-27/000001");
    expect(invoice.sellerDocNo.length).toBeLessThanOrEqual(16);
    expect(invoice).toMatchObject({
      docType: "INVOICE",
      status: "ISSUED",
      documentKind: "TAX_INVOICE",
      financialYear: "2026-27",
      issueTrigger: "DISPATCH",
      orderRefId: order.orderId,
      sellerPrefix: "DID",
      sellerGstin: "21ABCDE1234F1Z5",
    });
    // 2 x 100 @18% + 1 x 50 @5%
    expect(invoice.taxableValue).toBe(250);
    expect(invoice.gstAmount).toBe(38.5);
    expect(invoice.grandTotal).toBe(288.5);
    expect(invoice.lines).toHaveLength(2);
  });

  test("writes both numbers onto the order so every customer invoice can show them", async () => {
    const order = makeOrder(makeSeller());
    await svc.issueInvoiceForOrder(order);

    expect(mockOrderUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = mockOrderUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: order._id });
    expect(update.$set.invoice).toMatchObject({
      zoognoRefNo: "ZOO/INV/2026-27/000001",
      sellerInvoiceNo: "DID/26-27/000001",
      status: "ISSUED",
    });
  });

  test("each seller has an independent series; Zoogno references are platform-wide and never repeat", async () => {
    const a = makeSeller({ shopName: "Dine in Dime" });
    const b = makeSeller({ shopName: "Any Time Food" });

    const a1 = (await svc.issueInvoiceForOrder(makeOrder(a))).invoice;
    const b1 = (await svc.issueInvoiceForOrder(makeOrder(b))).invoice;
    const a2 = (await svc.issueInvoiceForOrder(makeOrder(a))).invoice;

    // Seller numbers: each series starts at 1 independently
    expect(a1.sellerDocNo).toBe("DID/26-27/000001");
    expect(b1.sellerDocNo).toBe("ATF/26-27/000001");
    expect(a2.sellerDocNo).toBe("DID/26-27/000002");
    // Zoogno references: one platform-wide sequence across both sellers
    expect([a1, b1, a2].map((i) => i.zoognoRefNo)).toEqual([
      "ZOO/INV/2026-27/000001",
      "ZOO/INV/2026-27/000002",
      "ZOO/INV/2026-27/000003",
    ]);
    expect(new Set([a1, b1, a2].map((i) => i.zoognoRefNo)).size).toBe(3);
    // Different sellers got different prefixes
    expect(a1.sellerPrefix).not.toBe(b1.sellerPrefix);
  });

  test("prevents duplicate generation: re-issuing for the same order returns the SAME invoice and consumes nothing", async () => {
    const order = makeOrder(makeSeller());
    const first = await svc.issueInvoiceForOrder(order);
    const before = new Map(counters);

    const second = await svc.issueInvoiceForOrder(order);
    const third = await svc.issueInvoiceForOrder(order, { trigger: "DELIVERY_BACKSTOP" });

    expect(second.created).toBe(false);
    expect(third.created).toBe(false);
    expect(second.invoice.sellerDocNo).toBe(first.invoice.sellerDocNo);
    expect(third.invoice.zoognoRefNo).toBe(first.invoice.zoognoRefNo);
    expect(invoices).toHaveLength(1);
    expect(counters).toEqual(before); // no numbers burned
  });

  test("an order cancelled BEFORE invoicing consumes no statutory number", async () => {
    const seller = makeSeller();
    const byStatus = makeOrder(seller, { status: "cancelled", workflowStatus: undefined });
    const byWorkflow = makeOrder(seller, { workflowStatus: "CANCELLED" });

    for (const order of [byStatus, byWorkflow]) {
      const res = await svc.issueInvoiceForOrder(order);
      expect(res).toMatchObject({ invoice: null, created: false, skipped: "ORDER_CANCELLED" });
    }
    expect(counters.size).toBe(0);
    expect(invoices).toHaveLength(0);

    // ...so the next real invoice is still number 1, with no hole in the series.
    const real = await svc.issueInvoiceForOrder(makeOrder(seller));
    expect(real.invoice.sellerDocNo).toBe("DID/26-27/000001");
    expect(real.invoice.zoognoRefNo).toBe("ZOO/INV/2026-27/000001");
  });

  test("skips (allocating nothing) when there is no seller / no items", async () => {
    const seller = makeSeller();
    expect(await svc.issueInvoiceForOrder(makeOrder(seller, { seller: null }))).toMatchObject({ skipped: "NO_SELLER" });
    expect(await svc.issueInvoiceForOrder(makeOrder(seller, { items: [] }))).toMatchObject({ skipped: "NO_ITEMS" });
    expect(await svc.issueInvoiceForOrder(makeOrder({ _id: oid() }))).toMatchObject({ skipped: "SELLER_NOT_FOUND" });
    expect(counters.size).toBe(0);
  });

  test("NO GAPS: if anything fails mid-transaction the counters roll back with it", async () => {
    const seller = makeSeller();
    mockOrderUpdateOne.mockRejectedValueOnce(new Error("db hiccup"));

    await expect(svc.issueInvoiceForOrder(makeOrder(seller))).rejects.toThrow("db hiccup");
    expect(counters.size).toBe(0); // both sequences were allocated, then rolled back
    expect(invoices).toHaveLength(0);

    const retry = await svc.issueInvoiceForOrder(makeOrder(seller));
    expect(retry.invoice.sellerDocNo).toBe("DID/26-27/000001"); // still 1 - nothing skipped
    expect(retry.invoice.zoognoRefNo).toBe("ZOO/INV/2026-27/000001");
  });

  test("a concurrent issuer that wins the race is converged on, not duplicated", async () => {
    const seller = makeSeller();
    const order = makeOrder(seller);
    const winner = (await svc.issueInvoiceForOrder(order)).invoice;
    const countersAfterWinner = new Map(counters);

    // Simulate the loser: its pre-check ran BEFORE the winner committed, so it saw nothing...
    mockInvoiceFindOne.mockImplementationOnce(() => chain(null));
    const loser = await svc.issueInvoiceForOrder(order);

    // ...it then hit the unique-per-order index, rolled back, and returned the winner's invoice.
    expect(loser.created).toBe(false);
    expect(loser.invoice.sellerDocNo).toBe(winner.sellerDocNo);
    expect(invoices).toHaveLength(1);
    expect(counters).toEqual(countersAfterWinner);
  });

  test("unregistered / composition sellers get a Bill of Supply, flagged for the consultant", async () => {
    const s = makeSeller({ gstStatus: "UNREGISTERED", gstin: undefined });
    const { invoice } = await svc.issueInvoiceForOrder(makeOrder(s));
    expect(invoice.documentKind).toBe("BILL_OF_SUPPLY");
    expect(invoice.sellerGstin).toBeNull();
  });

  test("records when the invoice was raised late by the delivery backstop", async () => {
    const { invoice } = await svc.issueInvoiceForOrder(makeOrder(makeSeller()), { trigger: "DELIVERY_BACKSTOP" });
    expect(invoice.issueTrigger).toBe("DELIVERY_BACKSTOP");
  });

  test("financial-year counters are separate and reset at 1 April IST", async () => {
    const seller = makeSeller();

    jest.setSystemTime(new Date("2027-03-31T18:00:00Z")); // 23:30 IST, 31 Mar -> still FY 2026-27
    const last = (await svc.issueInvoiceForOrder(makeOrder(seller))).invoice;
    expect(last.financialYear).toBe("2026-27");
    expect(last.sellerDocNo).toBe("DID/26-27/000001");

    jest.setSystemTime(new Date("2027-03-31T19:00:00Z")); // 00:30 IST, 1 Apr -> NEW FY
    const first = (await svc.issueInvoiceForOrder(makeOrder(seller))).invoice;
    expect(first.financialYear).toBe("2027-28");
    expect(first.sellerDocNo).toBe("DID/27-28/000001"); // restarted
    expect(first.zoognoRefNo).toBe("ZOO/INV/2027-28/000001"); // platform counter restarted too

    // The old FY's counters were not disturbed
    expect(counters.get(`SELLER_DOC:${seller._id}:INVOICE:2026-27`)).toBe(1);
    expect(counters.get(`SELLER_DOC:${seller._id}:INVOICE:2027-28`)).toBe(1);
  });
});

// ── cancellation ────────────────────────────────────────────────────────────
describe("cancelInvoiceForOrder", () => {
  test("keeps the number: status flips to CANCELLED, the document stays, the number is never reused", async () => {
    const seller = makeSeller();
    const order = makeOrder(seller);
    const { invoice } = await svc.issueInvoiceForOrder(order);

    const res = await svc.cancelInvoiceForOrder(order, { reason: "Customer unreachable", cancelledBy: "admin" });

    expect(res.cancelled).toBe(true);
    expect(res.invoice).toMatchObject({
      status: "CANCELLED",
      cancelReason: "Customer unreachable",
      cancelledBy: "admin",
      sellerDocNo: invoice.sellerDocNo, // same number
      zoognoRefNo: invoice.zoognoRefNo,
    });
    expect(res.invoice.cancelledAt).toBeInstanceOf(Date);
    expect(invoices).toHaveLength(1); // never deleted
    expect(mockOrderUpdateOne).toHaveBeenLastCalledWith({ _id: order._id }, { $set: { "invoice.status": "CANCELLED" } });

    // The cancelled number is not recycled: the next invoice is 2, not 1.
    const next = (await svc.issueInvoiceForOrder(makeOrder(seller))).invoice;
    expect(next.sellerDocNo).toBe("DID/26-27/000002");
    expect(next.zoognoRefNo).toBe("ZOO/INV/2026-27/000002");
    expect(new Set(invoices.map((d) => d.sellerDocNo)).size).toBe(2);
  });

  test("an order that never got an invoice has nothing to cancel (and nothing is allocated)", async () => {
    const order = makeOrder(makeSeller());
    expect(await svc.cancelInvoiceForOrder(order)).toMatchObject({ cancelled: false, skipped: "NO_INVOICE" });
    expect(counters.size).toBe(0);
  });

  test("a delivered order is NOT cancelled - the supply happened, so it needs a credit note", async () => {
    const order = makeOrder(makeSeller());
    await svc.issueInvoiceForOrder(order);

    const delivered = { ...order, status: "delivered", workflowStatus: "DELIVERED", deliveredAt: new Date() };
    const res = await svc.cancelInvoiceForOrder(delivered);

    expect(res).toMatchObject({ cancelled: false, skipped: "ALREADY_DELIVERED" });
    expect(invoices[0].status).toBe("ISSUED");
  });

  test("cancelling twice is a no-op", async () => {
    const order = makeOrder(makeSeller());
    await svc.issueInvoiceForOrder(order);
    await svc.cancelInvoiceForOrder(order);
    expect(await svc.cancelInvoiceForOrder(order)).toMatchObject({ cancelled: false, skipped: "ALREADY_CANCELLED" });
  });

  test("re-issuing for an order whose invoice was cancelled does NOT mint a new number", async () => {
    const order = makeOrder(makeSeller());
    const { invoice } = await svc.issueInvoiceForOrder(order);
    await svc.cancelInvoiceForOrder(order);
    const before = new Map(counters);

    const again = await svc.issueInvoiceForOrder({ ...order, status: "out_for_delivery", workflowStatus: "OUT_FOR_DELIVERY" });

    expect(again.created).toBe(false);
    expect(again.invoice.sellerDocNo).toBe(invoice.sellerDocNo);
    expect(counters).toEqual(before);
  });
});

// ── credit / debit notes ────────────────────────────────────────────────────
describe("credit notes", () => {
  async function invoicedOrder() {
    const seller = makeSeller();
    const order = makeOrder(seller);
    const { invoice } = await svc.issueInvoiceForOrder(order);
    return { seller, order, invoice };
  }

  test("are issued in the SELLER'S credit-note series, linked to the original invoice", async () => {
    const { order, invoice } = await invoicedOrder();

    const { note, created } = await svc.issueCreditNoteForOrder(order, {
      returnItems: [{ itemIndex: 0, product: order.items[0].product, quantity: 1, price: 100 }],
      reason: "RETURN",
    });

    expect(created).toBe(true);
    expect(note).toMatchObject({
      docType: "CREDIT_NOTE",
      sellerDocNo: "DID/26-27/CN0001",
      zoognoRefNo: "ZOO/CN/2026-27/000001",
      originalSellerDocNo: invoice.sellerDocNo,
      originalZoognoRefNo: invoice.zoognoRefNo,
      reason: "RETURN",
      issueTrigger: "RETURN",
    });
    expect(note.sellerDocNo.length).toBeLessThanOrEqual(16);
    // only the returned item, not the whole invoice: 1 x 100 @18%
    expect(note.lines).toHaveLength(1);
    expect(note).toMatchObject({ taxableValue: 100, cgstAmount: 9, sgstAmount: 9, gstAmount: 18, grandTotal: 118 });
  });

  test("do not disturb the invoice series", async () => {
    const { seller, order } = await invoicedOrder();
    await svc.issueCreditNoteForOrder(order, {
      returnItems: [{ itemIndex: 1, product: order.items[1].product, quantity: 1, price: 50 }],
    });

    const next = (await svc.issueInvoiceForOrder(makeOrder(seller))).invoice;
    expect(next.sellerDocNo).toBe("DID/26-27/000002");
    expect(next.zoognoRefNo).toBe("ZOO/INV/2026-27/000002");
  });

  test("are idempotent per order - a retry returns the same note and burns no number", async () => {
    const { order } = await invoicedOrder();
    const args = { returnItems: [{ itemIndex: 0, product: order.items[0].product, quantity: 1, price: 100 }] };

    const first = await svc.issueCreditNoteForOrder(order, args);
    const before = new Map(counters);
    const second = await svc.issueCreditNoteForOrder(order, args);

    expect(second.created).toBe(false);
    expect(second.note.sellerDocNo).toBe(first.note.sellerDocNo);
    expect(invoices.filter((d) => d.docType === "CREDIT_NOTE")).toHaveLength(1);
    expect(counters).toEqual(before);
  });

  test("can never credit more than was invoiced", async () => {
    const { order } = await invoicedOrder();
    const { note } = await svc.issueCreditNoteForOrder(order, {
      returnItems: [{ itemIndex: 0, product: order.items[0].product, quantity: 99, price: 100 }],
    });
    expect(note.lines[0].quantity).toBe(2); // the invoice had 2
    expect(note.taxableValue).toBe(200);
  });

  test("match items by product when itemIndex is absent", async () => {
    const { order } = await invoicedOrder();
    const { note } = await svc.issueCreditNoteForOrder(order, {
      returnItems: [{ product: order.items[1].product, quantity: 1, price: 50 }],
    });
    expect(note.lines).toHaveLength(1);
    expect(note.lines[0].productName).toBe("Fries");
  });

  test("skip - allocating nothing - without a live original invoice", async () => {
    const seller = makeSeller();
    const legacy = makeOrder(seller); // delivered before dual numbering: no invoice exists
    expect(
      await svc.issueCreditNoteForOrder(legacy, {
        returnItems: [{ itemIndex: 0, product: legacy.items[0].product, quantity: 1, price: 100 }],
      }),
    ).toMatchObject({ note: null, skipped: "NO_ORIGINAL_INVOICE" });
    expect(counters.size).toBe(0);

    const { order } = await invoicedOrder();
    await svc.cancelInvoiceForOrder(order);
    expect(
      await svc.issueCreditNoteForOrder(order, {
        returnItems: [{ itemIndex: 0, product: order.items[0].product, quantity: 1, price: 100 }],
      }),
    ).toMatchObject({ note: null, skipped: "ORIGINAL_INVOICE_CANCELLED" });
  });

  test("skip when there is nothing creditable", async () => {
    const { order } = await invoicedOrder();
    const before = new Map(counters);
    for (const returnItems of [[], [{ product: oid(), quantity: 1, price: 10 }], [{ itemIndex: 0, product: order.items[0].product, quantity: 0, price: 100 }]]) {
      expect(await svc.issueCreditNoteForOrder(order, { returnItems })).toMatchObject({ skipped: "NOTHING_TO_CREDIT" });
    }
    expect(counters).toEqual(before);
  });
});

describe("debit notes", () => {
  test("have their own series, separate from credit notes and invoices", async () => {
    const seller = makeSeller();
    const order = makeOrder(seller);
    const { invoice } = await svc.issueInvoiceForOrder(order);

    const dn = await svc.issueDebitNote(invoice._id, {
      lines: [{ description: "Price correction", taxableValue: 40, gstRate: 18 }],
      reason: "UPWARD_REVISION",
      noteKey: "DEBIT_NOTE:test:1",
    });
    expect(dn.note).toMatchObject({
      docType: "DEBIT_NOTE",
      sellerDocNo: "DID/26-27/DN0001",
      zoognoRefNo: "ZOO/DN/2026-27/000001",
      originalSellerDocNo: invoice.sellerDocNo,
      taxableValue: 40,
      gstAmount: 7.2,
      grandTotal: 47.2,
    });

    // A credit note issued afterwards is still CN0001 - the series are independent.
    const cn = await svc.issueCreditNoteForOrder(order, {
      returnItems: [{ itemIndex: 0, product: order.items[0].product, quantity: 1, price: 100 }],
    });
    expect(cn.note.sellerDocNo).toBe("DID/26-27/CN0001");
  });

  test("skip a cancelled original or an empty amount", async () => {
    const order = makeOrder(makeSeller());
    const { invoice } = await svc.issueInvoiceForOrder(order);
    expect(await svc.issueDebitNote(invoice._id, { lines: [{ taxableValue: 0, gstRate: 18 }] })).toMatchObject({ skipped: "NOTHING_TO_DEBIT" });
    await svc.cancelInvoiceForOrder(order);
    expect(await svc.issueDebitNote(invoice._id, { lines: [{ taxableValue: 10, gstRate: 18 }] })).toMatchObject({ skipped: "ORIGINAL_INVOICE_CANCELLED" });
  });
});

// ── seller prefix ───────────────────────────────────────────────────────────
describe("ensureSellerInvoicePrefix", () => {
  test("assigns a unique prefix once and then never changes it", async () => {
    const seller = makeSeller();
    const p1 = await svc.ensureSellerInvoicePrefix(seller);
    expect(p1).toBe("DID");

    mockSellerFindOneAndUpdate.mockClear();
    const p2 = await svc.ensureSellerInvoicePrefix({ ...seller, invoicePrefix: p1 });
    expect(p2).toBe("DID");
    expect(mockSellerFindOneAndUpdate).not.toHaveBeenCalled(); // immutable once set
  });

  test("two sellers with the same name get DIFFERENT prefixes", async () => {
    const a = makeSeller({ shopName: "Dine in Dime" });
    const b = makeSeller({ shopName: "Dine in Dime" });
    const pa = await svc.ensureSellerInvoicePrefix(a);
    const pb = await svc.ensureSellerInvoicePrefix(b);
    expect(pa).not.toBe(pb);
    for (const p of [pa, pb]) expect(p).toMatch(/^[A-Z0-9]{1,3}$/);
  });

  test("never overwrites a prefix that a concurrent request just assigned", async () => {
    const seller = makeSeller();
    sellers.get(String(seller._id)).invoicePrefix = "WIN"; // assigned by the other request
    // This caller still holds the stale seller (no prefix); its claim matches nothing.
    const prefix = await svc.ensureSellerInvoicePrefix({ ...seller, invoicePrefix: undefined });
    expect(prefix).toBe("WIN");
  });
});

// ── queries: seller isolation + dual-number search ──────────────────────────
describe("buildInvoiceFilter", () => {
  test("a seller query is pinned to that seller", () => {
    const id = oid();
    const filter = svc.buildInvoiceFilter({ sellerId: String(id) });
    expect(String(filter.sellerId)).toBe(String(id));
    expect(filter.sellerId).toBeInstanceOf(mongoose.Types.ObjectId);
  });

  test("an admin query (no sellerId) spans every seller", () => {
    expect(svc.buildInvoiceFilter({}).sellerId).toBeUndefined();
  });

  test("search covers BOTH numbers, the linked original numbers, the order id and the seller", () => {
    const filter = svc.buildInvoiceFilter({ search: "000501" });
    const fields = filter.$or.map((c) => Object.keys(c)[0]);
    expect(fields).toEqual(
      expect.arrayContaining(["zoognoRefNo", "sellerDocNo", "originalSellerDocNo", "originalZoognoRefNo", "orderRefId", "sellerName"]),
    );
    expect(filter.$or[0].zoognoRefNo.test("ZOO/INV/2026-27/000501")).toBe(true);
    expect(filter.$or[1].sellerDocNo.test("DID/26-27/000501")).toBe(true);
  });

  test("search input is regex-escaped (no injection, '/' and '(' are literals)", () => {
    const filter = svc.buildInvoiceFilter({ search: "DID/26-27/(1)+.*" });
    const rx = filter.$or[1].sellerDocNo;
    expect(rx.test("DID/26-27/(1)+.*")).toBe(true);
    expect(rx.test("DID/26-27/1111")).toBe(false);
  });

  test("filters by type, status, FY, and an inclusive date range", () => {
    const filter = svc.buildInvoiceFilter({
      docType: "CREDIT_NOTE",
      status: "CANCELLED",
      financialYear: "2026-27",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(filter).toMatchObject({ docType: "CREDIT_NOTE", status: "CANCELLED", financialYear: "2026-27" });
    expect(filter.issuedAt.$gte).toEqual(new Date("2026-08-01"));
    expect(filter.issuedAt.$lte.getHours()).toBe(23); // end of the last day is included
  });
});

describe("getInvoiceById seller isolation", () => {
  test("a seller can fetch their own invoice but not another seller's", async () => {
    const a = makeSeller();
    const b = makeSeller({ shopName: "Any Time Food" });
    const { invoice } = await svc.issueInvoiceForOrder(makeOrder(a));

    expect(await svc.getInvoiceById(invoice._id, { sellerId: a._id })).not.toBeNull();
    expect(await svc.getInvoiceById(invoice._id, { sellerId: b._id })).toBeNull();
    // admin (no seller scope) can see it
    expect(await svc.getInvoiceById(invoice._id)).not.toBeNull();
    // garbage ids are rejected, not queried
    expect(await svc.getInvoiceById("not-an-id")).toBeNull();
  });
});
