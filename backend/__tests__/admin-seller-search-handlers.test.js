process.env.REDIS_DISABLED = "true";

import { jest } from "@jest/globals";
import { fakeModel, fakeRes, oid } from "./helpers/fakeMongo.js";

/**
 * Behavioural tests for every admin / seller search handler fixed in the search audit. The REAL
 * controllers and services run; only the models are replaced by an in-memory Mongo (see
 * helpers/fakeMongo.js), so each test asserts on which rows a user would actually get back.
 */

// ── fixtures live in `db`, swapped per test ─────────────────────────────────
const db = {
  delivery: [], zone: [], ticket: [], customer: [], seller: [], order: [], transaction: [],
  coupon: [], category: [], faq: [], basket: [], bag: [], product: [], ledger: [], surge: [], payout: [],
};
const mockTxAggregate = jest.fn(async () => []);
const mockDeliveryAggregate = jest.fn(async () => [{ meta: [{ total: 0 }], items: [] }]);

const withExtras = (rows, extra = {}) => ({ default: { ...fakeModel(rows), ...extra } });
jest.unstable_mockModule("../app/models/delivery.js", () => withExtras(() => db.delivery, { aggregate: mockDeliveryAggregate }));
jest.unstable_mockModule("../app/models/zone.js", () => withExtras(() => db.zone));
jest.unstable_mockModule("../app/models/ticket.js", () => withExtras(() => db.ticket));
jest.unstable_mockModule("../app/models/customer.js", () => withExtras(() => db.customer));
jest.unstable_mockModule("../app/models/seller.js", () => withExtras(() => db.seller));
jest.unstable_mockModule("../app/models/order.js", () => withExtras(() => db.order));
jest.unstable_mockModule("../app/models/transaction.js", () => withExtras(() => db.transaction, { aggregate: mockTxAggregate }));
jest.unstable_mockModule("../app/models/coupon.js", () => withExtras(() => db.coupon));
jest.unstable_mockModule("../app/models/category.js", () => withExtras(() => db.category));
jest.unstable_mockModule("../app/models/faq.js", () => withExtras(() => db.faq));
jest.unstable_mockModule("../app/models/basket.js", () => withExtras(() => db.basket));
jest.unstable_mockModule("../app/models/qrPaperBag.js", () => withExtras(() => db.bag));
jest.unstable_mockModule("../app/models/ledgerEntry.js", () => withExtras(() => db.ledger));
jest.unstable_mockModule("../app/models/deliverySurgeRule.js", () => withExtras(() => db.surge));
// Product has extra aggregate-style counts the seller list performs; count is irrelevant to these tests.
jest.unstable_mockModule("../app/models/product.js", () => ({
  default: { ...fakeModel(() => db.product), countDocuments: async () => 0 },
}));

const { getDeliveryPartners } = await import("../app/controller/admin/deliveryController.js");
const { getAllTickets, buildTicketSearchQuery } = await import("../app/controller/ticketController.js");
const wallet = await import("../app/services/admin/walletAdminService.js");
const cash = await import("../app/services/admin/cashService.js");
const { listCoupons } = await import("../app/controller/couponController.js");
const { getFAQs } = await import("../app/controller/faqController.js");
const { getCategories } = await import("../app/controller/categoryController.js");
const adminBags = await import("../app/controller/admin/qrBags.admin.controller.js");
const sellerBags = await import("../app/controller/seller/qrBags.seller.controller.js");
const adminBaskets = await import("../app/controller/admin/baskets.admin.controller.js");
const sellerBaskets = await import("../app/controller/seller/baskets.seller.controller.js");
const { getSellerProducts } = await import("../app/controller/productController.js");
const { getLedgerEntries } = await import("../app/services/finance/ledgerService.js");
const { financeLedgerQuerySchema } = await import("../app/validation/financeValidation.js");
const { validateBodySafe } = await import("../app/middleware/validate.js");
const { listRules } = await import("../app/domains/deliverySurge/deliverySurge.service.js");
// settlementPayout.js exports constants the service needs, so use the REAL module and only swap its query methods.
const SettlementPayout = (await import("../app/models/settlementPayout.js")).default;
Object.assign(SettlementPayout, fakeModel(() => db.payout));
const { getPayoutHistory } = await import("../app/services/finance/settlementService.js");

const payload = (res) => res.body.result ?? res.body.results ?? res.body.data ?? res.body;
const names = (items, key = "name") => items.map((i) => i[key]).sort();
const HOSTILE = ["(", "[", "*", "(a+)+$", "\\", "a{1,", "?"];

beforeEach(() => {
  for (const k of Object.keys(db)) db[k] = [];
  mockTxAggregate.mockClear();
  mockDeliveryAggregate.mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("admin rider list - search was ignored by the server", () => {
  beforeEach(() => {
    db.delivery = [
      { _id: oid(), name: "Ravi Kumar", phone: "9876500001", email: "ravi@mail.com", vehicleNumber: "MH12AB1234", city: "Pune", isOnline: true, isVerified: true },
      { _id: oid(), name: "Sita Rao", phone: "9123400002", email: "sita@mail.com", vehicleNumber: "KA01CD5678", city: "Bengaluru", isOnline: false, isVerified: true },
      { _id: oid(), name: "Ravi Sharma", phone: "9000000003", email: "rs@mail.com", vehicleNumber: "DL09EF9999", city: "Delhi", isOnline: false, isVerified: false },
    ];
  });
  const list = async (query) => {
    const res = fakeRes();
    await getDeliveryPartners({ query }, res);
    return payload(res);
  };

  test("finds a rider by name, phone, email, vehicle number and city", async () => {
    expect(names((await list({ search: "ravi" })).items)).toEqual(["Ravi Kumar", "Ravi Sharma"]);
    expect(names((await list({ search: "98765" })).items)).toEqual(["Ravi Kumar"]);
    expect(names((await list({ search: "sita@mail" })).items)).toEqual(["Sita Rao"]);
    expect(names((await list({ search: "ka01cd" })).items)).toEqual(["Sita Rao"]);
    expect(names((await list({ search: "bengal" })).items)).toEqual(["Sita Rao"]);
  });

  test("the total reflects the search (so pagination is right), not the whole fleet", async () => {
    const r = await list({ search: "ravi" });
    expect(r.total).toBe(2);
  });

  test("combines with the online / verified filters instead of replacing them", async () => {
    expect(names((await list({ search: "ravi", status: "online" })).items)).toEqual(["Ravi Kumar"]);
    expect(names((await list({ search: "ravi", verified: "false" })).items)).toEqual(["Ravi Sharma"]);
  });

  test.each(HOSTILE)("hostile input %p returns 200 with no crash", async (evil) => {
    const res = fakeRes();
    await getDeliveryPartners({ query: { search: evil } }, res);
    expect(res.statusCode).toBe(200);
  });

  test("'.*' is literal - it does not match every rider", async () => {
    expect((await list({ search: ".*" })).items).toHaveLength(0);
  });

  test("?search[$ne]=x and ?search=a&search=b do not crash", async () => {
    expect((await list({ search: { $ne: "x" } })).items).toHaveLength(3); // an operator is ignored
    expect(names((await list({ search: ["sita", "ravi"] })).items)).toEqual(["Sita Rao"]); // first value wins
  });

  test("no search still lists everyone", async () => {
    expect((await list({})).items).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("admin support tickets - search was ignored by the server", () => {
  const custA = oid();
  const custB = oid();
  const sellerA = oid();
  beforeEach(() => {
    db.customer = [
      { _id: custA, name: "Asha Verma", email: "asha@mail.com", phone: "9811111111" },
      { _id: custB, name: "Bimal Das", email: "bimal@mail.com", phone: "9822222222" },
    ];
    db.seller = [{ _id: sellerA, name: "Raj Patel", shopName: "Fresh Mart", email: "raj@shop.com", phone: "9833333333" }];
    db.ticket = [
      { _id: oid(), subject: "Refund not received", description: "money missing", orderId: "ORD-777", issueType: "payment", userId: custA, userType: "Customer", createdAt: new Date(3) },
      { _id: oid(), subject: "App crashes", description: "on checkout", orderId: "ORD-888", issueType: "app", userId: custB, userType: "Customer", createdAt: new Date(2) },
      { _id: oid(), subject: "Payout delay", description: "settlement late", orderId: "", issueType: "payout", userId: sellerA, userType: "Seller", createdAt: new Date(1) },
    ];
  });
  const search = async (term) => {
    const res = fakeRes();
    await getAllTickets({ query: { search: term } }, res);
    return payload(res);
  };
  const subjects = (r) => r.items.map((t) => t.subject).sort();

  test("finds tickets by subject, description, order id and issue type", async () => {
    expect(subjects(await search("refund"))).toEqual(["Refund not received"]);
    expect(subjects(await search("checkout"))).toEqual(["App crashes"]);
    expect(subjects(await search("ORD-888"))).toEqual(["App crashes"]);
    expect(subjects(await search("payout"))).toEqual(["Payout delay"]);
  });

  test("finds tickets by the PERSON who raised them - customer name/email/phone, seller shop", async () => {
    expect(subjects(await search("Asha"))).toEqual(["Refund not received"]);
    expect(subjects(await search("bimal@mail"))).toEqual(["App crashes"]);
    expect(subjects(await search("9833"))).toEqual(["Payout delay"]);
    expect(subjects(await search("Fresh Mart"))).toEqual(["Payout delay"]);
  });

  test("the total reflects the search", async () => {
    expect((await search("Asha")).total).toBe(1);
  });

  test.each(HOSTILE)("hostile input %p is harmless", async (evil) => {
    const res = fakeRes();
    await getAllTickets({ query: { search: evil } }, res);
    expect(res.statusCode).toBe(200);
  });

  test("the short ticket code shown in the list (tail of the id) is searchable", async () => {
    const q = await buildTicketSearchQuery("a1B2c3");
    const expr = q.$or.find((c) => c.$expr);
    expect(expr).toBeDefined();
    expect(expr.$expr.$regexMatch).toMatchObject({ regex: "a1B2c3", options: "i" });
    expect(expr.$expr.$regexMatch.input).toEqual({ $toString: "$_id" });
  });

  test("a non-hex term adds no id scan; an empty term adds no filter at all", async () => {
    expect((await buildTicketSearchQuery("refund")).$or.some((c) => c.$expr)).toBe(false);
    expect(await buildTicketSearchQuery("")).toEqual({});
    expect(await buildTicketSearchQuery(undefined)).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("seller transactions - search, status, type and seller filters were all ignored", () => {
  const shopA = oid();
  const shopB = oid();
  const ord1 = oid();
  const ord2 = oid();
  beforeEach(() => {
    db.seller = [
      { _id: shopA, name: "Raj", shopName: "Fresh Mart", phone: "9811111111", email: "raj@x.com" },
      { _id: shopB, name: "Meena", shopName: "Spice Hub", phone: "9822222222", email: "m@x.com" },
    ];
    db.order = [{ _id: ord1, orderId: "ORD-AAA111" }, { _id: ord2, orderId: "ORD-BBB222" }];
    const tx = (o) => ({ _id: oid(), userModel: "Seller", createdAt: new Date(), ...o });
    db.transaction = [
      tx({ reference: "TXN-1001", user: shopA, order: ord1, type: "Seller Earning", status: "Settled" }),
      tx({ reference: "TXN-1002", user: shopB, order: ord2, type: "Seller Earning", status: "Pending" }),
      tx({ reference: "PAY-2001", user: shopA, type: "Payout", status: "Completed" }),
      tx({ reference: "REF-3001", user: shopB, type: "Refund", status: "Failed" }),
      { _id: oid(), userModel: "Delivery", reference: "TXN-9999", user: oid(), type: "Seller Earning", status: "Settled" }, // wrong model: must never appear
    ];
  });
  const get = (filters) => wallet.getSellerTransactionsData({ page: 1, limit: 25, skip: 0, ...filters });
  const refs = (r) => r.items.map((t) => t.reference).sort();

  test("search matches the transaction reference", async () => {
    expect(refs(await get({ search: "TXN-1001" }))).toEqual(["TXN-1001"]);
    expect(refs(await get({ search: "pay-" }))).toEqual(["PAY-2001"]);
  });

  test("search matches the SELLER (shop / owner name, phone, email)", async () => {
    expect(refs(await get({ search: "Fresh Mart" }))).toEqual(["PAY-2001", "TXN-1001"]);
    expect(refs(await get({ search: "meena" }))).toEqual(["REF-3001", "TXN-1002"]);
    expect(refs(await get({ search: "9822" }))).toEqual(["REF-3001", "TXN-1002"]);
  });

  test("search matches the ORDER's public id", async () => {
    expect(refs(await get({ search: "BBB222" }))).toEqual(["TXN-1002"]);
  });

  test("status filter: 'settled' covers Settled/Completed; 'pending'; any other is an exact match", async () => {
    expect(refs(await get({ status: "settled" }))).toEqual(["PAY-2001", "TXN-1001"]);
    expect(refs(await get({ status: "pending" }))).toEqual(["TXN-1002"]);
    expect(refs(await get({ status: "failed" }))).toEqual(["REF-3001"]);
  });

  test("type filter: sale / payout / other", async () => {
    expect(refs(await get({ type: "sale" }))).toEqual(["TXN-1001", "TXN-1002"]);
    expect(refs(await get({ type: "payout" }))).toEqual(["PAY-2001"]);
    expect(refs(await get({ type: "refund" }))).toEqual(["REF-3001"]);
  });

  test("seller filter by id", async () => {
    expect(refs(await get({ sellerId: String(shopB) }))).toEqual(["REF-3001", "TXN-1002"]);
  });

  test("filters combine (AND), and the total follows", async () => {
    const r = await get({ sellerId: String(shopA), status: "settled", search: "pay" });
    expect(refs(r)).toEqual(["PAY-2001"]);
    expect(r.total).toBe(1);
  });

  test("never returns another user model's transactions", async () => {
    expect(refs(await get({ search: "TXN-9999" }))).toEqual([]);
    expect(refs(await get({}))).not.toContain("TXN-9999");
  });

  test.each(HOSTILE)("hostile search / status / type %p do not crash", async (evil) => {
    await expect(get({ search: evil, status: evil, type: evil })).resolves.toBeDefined();
  });

  test("summary cards describe the seller, NOT the search/status/type filters", async () => {
    await get({ search: "TXN-1001", status: "pending", type: "sale", sellerId: String(shopA) });
    const [pipeline] = mockTxAggregate.mock.calls[0];
    const match = pipeline.find((s) => s.$match).$match;
    expect(Object.keys(match).sort()).toEqual(["user", "userModel"]);
  });
});

describe("delivery transactions - escaped search/status/type and a correct stats match", () => {
  const riderA = oid();
  beforeEach(() => {
    db.delivery = [{ _id: riderA, name: "Ravi Kumar", phone: "9876500001" }];
    db.transaction = [
      { _id: oid(), userModel: "Delivery", reference: "DEL-1", user: riderA, type: "Delivery Earning", status: "Settled", createdAt: new Date() },
      { _id: oid(), userModel: "Delivery", reference: "DEL-2", user: oid(), type: "Cash Collection", status: "Pending", createdAt: new Date() },
    ];
  });
  const get = (f) => wallet.getDeliveryTransactionsData({ page: 1, limit: 25, skip: 0, ...f });

  test("search by reference and by rider name/phone", async () => {
    expect((await get({ search: "DEL-2" })).items.map((t) => t.reference)).toEqual(["DEL-2"]);
    expect((await get({ search: "ravi" })).items.map((t) => t.reference)).toEqual(["DEL-1"]);
    expect((await get({ search: "98765" })).items.map((t) => t.reference)).toEqual(["DEL-1"]);
  });

  test.each(HOSTILE)("hostile search/status/type %p no longer throws (they were raw RegExp input)", async (evil) => {
    await expect(get({ search: evil, status: evil, type: evil })).resolves.toBeDefined();
  });

  test("the stats $match receives the rider id as an ObjectId (aggregate() does not cast strings)", async () => {
    await get({ riderId: String(riderA) });
    const match = mockTxAggregate.mock.calls[0][0].find((s) => s.$match).$match;
    expect(String(match.user)).toBe(String(riderA));
    expect(typeof match.user).toBe("object");
  });

  test("type filters map to the stored vocabulary", async () => {
    expect((await get({ type: "earning" })).items.map((t) => t.reference)).toEqual(["DEL-1"]);
    expect((await get({ type: "cash" })).items.map((t) => t.reference)).toEqual(["DEL-2"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("cash screens - balances and settlement history ignored search; COD history used a raw regex", () => {
  test("rider cash balances: a search becomes a FIRST-stage $match (before the expensive lookups)", async () => {
    await cash.getDeliveryCashBalancesData({ page: 1, limit: 25, skip: 0, search: "ravi" });
    const pipeline = mockDeliveryAggregate.mock.calls[0][0];
    expect(Object.keys(pipeline[0])).toEqual(["$match"]);
    expect(pipeline[0].$match.$or.map((c) => Object.keys(c)[0])).toEqual(["name", "phone"]);
    expect(pipeline[0].$match.$or[0].name.test("Ravi Kumar")).toBe(true);
  });

  test("no search -> no extra stage", async () => {
    await cash.getDeliveryCashBalancesData({ page: 1, limit: 25, skip: 0 });
    expect(Object.keys(mockDeliveryAggregate.mock.calls[0][0][0])).toEqual(["$lookup"]);
  });

  test("hostile balance search cannot throw", async () => {
    for (const evil of HOSTILE) {
      await expect(cash.getDeliveryCashBalancesData({ page: 1, limit: 25, skip: 0, search: evil })).resolves.toBeDefined();
    }
  });

  test("settlement history: search by reference or rider", async () => {
    const riderA = oid();
    db.delivery = [{ _id: riderA, name: "Ravi Kumar", phone: "9876500001" }];
    db.transaction = [
      { _id: oid(), userModel: "Delivery", type: "Cash Settlement", reference: "SET-1", user: riderA, amount: 100, createdAt: new Date() },
      { _id: oid(), userModel: "Delivery", type: "Cash Settlement", reference: "SET-2", user: oid(), amount: 50, createdAt: new Date() },
    ];
    const ids = async (search) =>
      (await cash.getCashSettlementHistoryData({ page: 1, limit: 25, skip: 0, search })).items.map((i) => i.id).sort();
    expect(await ids("SET-2")).toEqual(["SET-2"]);
    expect(await ids("ravi")).toEqual(["SET-1"]);
    expect(await ids("")).toEqual(["SET-1", "SET-2"]);
    expect(await ids("(")).toEqual([]); // no throw
  });

  test("COD history: orderId / recipient / the RIDER who collected; hostile input is literal", async () => {
    const riderA = oid();
    db.delivery = [{ _id: riderA, name: "Ravi Kumar", phone: "9876500001" }];
    db.order = [
      { _id: oid(), paymentMode: "COD", financeFlags: { codMarkedCollected: true }, orderId: "ORD-COD1", address: { name: "Meena Joshi" }, deliveryBoy: riderA, paymentBreakdown: { grandTotal: 100 }, updatedAt: new Date() },
      { _id: oid(), paymentMode: "COD", financeFlags: { codMarkedCollected: true }, orderId: "ORD-COD2", address: { name: "Karan" }, deliveryBoy: oid(), paymentBreakdown: { grandTotal: 50 }, updatedAt: new Date() },
    ];
    const ids = async (search) =>
      (await cash.getCodCollectionHistoryData({ page: 1, limit: 25, skip: 0, search })).items.map((i) => i.orderId ?? i.id).sort();
    expect((await ids("COD2")).length).toBe(1);
    expect((await ids("meena")).length).toBe(1);
    expect((await ids("ravi")).length).toBe(1); // by rider
    for (const evil of HOSTILE) await expect(ids(evil)).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("coupons - the search used to REPLACE the 'expired' filter", () => {
  const past = new Date(Date.now() - 86400000 * 30);
  const future = new Date(Date.now() + 86400000 * 30);
  beforeEach(() => {
    db.coupon = [
      { _id: oid(), code: "SAVE10", title: "Save big", description: "", isActive: true, validFrom: past, validTill: future, createdAt: new Date(3) },
      { _id: oid(), code: "SAVE20", title: "Old sale", description: "", isActive: true, validFrom: past, validTill: past, createdAt: new Date(2) }, // expired by date
      { _id: oid(), code: "WINTER", title: "Winter deal", description: "snow", isActive: false, validFrom: past, validTill: future, createdAt: new Date(1) }, // deactivated
    ];
  });
  const list = async (query) => {
    const res = fakeRes();
    await listCoupons({ query }, res);
    return (res.body.results ?? payload(res)).map((c) => c.code).sort();
  };

  test("REGRESSION: status=expired + a search returns only EXPIRED coupons that match", async () => {
    // Before the fix the search $or overwrote the expiry $or, so live "SAVE10" leaked in.
    expect(await list({ status: "expired", search: "SAVE" })).toEqual(["SAVE20"]);
  });

  test("status=expired alone, and a search alone, both still work", async () => {
    expect(await list({ status: "expired" })).toEqual(["SAVE20", "WINTER"]);
    expect(await list({ search: "save" })).toEqual(["SAVE10", "SAVE20"]);
    expect(await list({ search: "snow" })).toEqual(["WINTER"]); // description
  });

  test("status=active + search", async () => {
    expect(await list({ status: "active", search: "save" })).toEqual(["SAVE10"]);
  });

  test.each(HOSTILE)("hostile input %p is literal, not a regex", async (evil) => {
    await expect(list({ search: evil })).resolves.toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("FAQs and categories - escaped, type-safe search", () => {
  test("FAQ search matches question and answer; hostile input is safe; non-strings don't crash", async () => {
    db.faq = [
      { _id: oid(), question: "How do I get a refund?", answer: "Go to orders", category: "Payments", createdAt: new Date() },
      { _id: oid(), question: "Delivery time?", answer: "Usually 10 min (varies)", category: "Delivery", createdAt: new Date() },
    ];
    const run = async (search) => {
      const res = fakeRes();
      await getFAQs({ query: { search } }, res);
      expect(res.statusCode).toBe(200);
      return payload(res).items.map((f) => f.question);
    };
    expect(await run("refund")).toEqual(["How do I get a refund?"]);
    expect(await run("varies")).toEqual(["Delivery time?"]);
    expect(await run("(varies)")).toEqual(["Delivery time?"]); // parentheses are matched LITERALLY (the answer contains them)
    expect(await run("(refund)")).toEqual([]); // ...and are not a regex group, which would have matched "refund"
    for (const evil of HOSTILE) await run(evil);
    expect(await run({ $ne: "x" })).toHaveLength(2); // operator ignored
    expect(await run(["refund", "delivery"])).toEqual(["How do I get a refund?"]);
  });

  test("category search (paginated list) by name or slug", async () => {
    db.category = [
      { _id: oid(), name: "Dairy & Eggs", slug: "dairy-eggs", type: "category", sortOrder: 1 },
      { _id: oid(), name: "Snacks", slug: "snacks-biscuits", type: "category", sortOrder: 2 },
    ];
    const run = async (search) => {
      const res = fakeRes();
      await getCategories({ query: { page: "1", limit: "20", search } }, res);
      expect(res.statusCode).toBe(200);
      return payload(res).items.map((c) => c.name);
    };
    expect(await run("dairy")).toEqual(["Dairy & Eggs"]);
    expect(await run("biscuits")).toEqual(["Snacks"]); // slug
    for (const evil of HOSTILE) expect(await run(evil)).toEqual([]);
    expect(await run(["dairy"])).toEqual(["Dairy & Eggs"]);
    expect(await run({ $regex: ".*" })).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("QR bags and baskets - escaped search; baskets had no seller search at all", () => {
  const sellerA = oid();
  const sellerB = oid();
  const req = (query, id) => ({ query, user: { id: String(id ?? sellerA) } });

  test("admin bag inventory: search by bag id, hostile input safe", async () => {
    db.bag = [
      { _id: oid(), bagId: "BAG-1001", status: "generated", createdAt: new Date() },
      { _id: oid(), bagId: "BAG-2002", status: "generated", createdAt: new Date() },
    ];
    const run = async (search) => {
      const res = fakeRes();
      await adminBags.getInventory({ query: { search } }, res);
      return { code: res.statusCode, items: payload(res).bags ?? payload(res).items ?? payload(res).data ?? [] };
    };
    expect((await run("2002")).items.map((b) => b.bagId)).toEqual(["BAG-2002"]);
    for (const evil of HOSTILE) expect((await run(evil)).code).toBe(200);
  });

  test("admin basket inventory: search by basket id, hostile input safe", async () => {
    db.basket = [
      { _id: oid(), basketId: "BSK-001", status: "AVAILABLE", createdAt: new Date() },
      { _id: oid(), basketId: "BSK-002", status: "AVAILABLE", createdAt: new Date() },
    ];
    const run = async (search) => {
      const res = fakeRes();
      await adminBaskets.getInventory({ query: { search } }, res);
      return { code: res.statusCode, items: res.body?.result?.baskets ?? res.body?.result?.items ?? res.body?.data ?? [] };
    };
    expect((await run("002")).items.map((b) => b.basketId)).toEqual(["BSK-002"]);
    for (const evil of HOSTILE) expect((await run(evil)).code).toBe(200);
  });

  test("seller bags: search by bag id OR the public id of the order being packed - only this seller's", async () => {
    const orderA = oid();
    const orderB = oid();
    db.order = [
      { _id: orderA, orderId: "ORD-55", seller: sellerA },
      { _id: orderB, orderId: "ORD-55-B", seller: sellerB }, // another seller's order with a similar id
    ];
    db.bag = [
      { _id: oid(), bagId: "BAG-A1", currentOrderId: orderA, assignedSellerId: sellerA, createdAt: new Date() },
      { _id: oid(), bagId: "BAG-A2", assignedSellerId: sellerA, createdAt: new Date() },
      { _id: oid(), bagId: "BAG-B1", currentOrderId: orderB, assignedSellerId: sellerB, createdAt: new Date() },
    ];
    const run = async (search, as) => {
      const res = fakeRes();
      await sellerBags.getMyBags(req({ search }, as), res);
      expect(res.statusCode).toBe(200);
      return (res.body.data ?? payload(res).bags ?? payload(res).items ?? []).map((b) => b.bagId).sort();
    };
    expect(await run("A2")).toEqual(["BAG-A2"]); // by bag id
    expect(await run("ORD-55")).toEqual(["BAG-A1"]); // by order id: my bag only - NOT seller B's bag, whose order id also matches
    expect(await run("BAG-B1")).toEqual([]); // another seller's bag is unreachable
    expect(await run("ORD-55-B")).toEqual([]); // ...and so is a bag reached through another seller's order id
    for (const evil of HOSTILE) await run(evil);
  });

  test("seller baskets: search now WORKS (the handler never read it), scoped to this seller", async () => {
    db.basket = [
      { _id: oid(), basketId: "BSK-A1", status: "ASSIGNED", assignedSellerId: sellerA, createdAt: new Date() },
      { _id: oid(), basketId: "BSK-A2", status: "ASSIGNED", assignedSellerId: sellerA, createdAt: new Date() },
      { _id: oid(), basketId: "BSK-B1", status: "ASSIGNED", assignedSellerId: sellerB, createdAt: new Date() },
    ];
    const run = async (search) => {
      const res = fakeRes();
      await sellerBaskets.getBasketInventory(req({ search }), res);
      expect(res.statusCode).toBe(200);
      return res.body.data.map((b) => b.basketId).sort();
    };
    expect(await run(undefined)).toEqual(["BSK-A1", "BSK-A2"]);
    expect(await run("A2")).toEqual(["BSK-A2"]);
    expect(await run("B1")).toEqual([]); // never another seller's basket
    for (const evil of HOSTILE) await run(evil);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("seller product list - the search was dropped when an approval filter was active", () => {
  const me = oid();
  beforeEach(() => {
    const P = (name, o = {}) => ({ _id: oid(), name, sku: `SKU-${name}`, sellerId: me, status: "active", approvalStatus: "approved", tags: [], brand: "", createdAt: new Date(), ...o });
    db.product = [
      P("Amul Butter", { brand: "Amul" }),
      P("Fresh Milk", { tags: ["dairy"] }),
      P("Butter Cookies", { approvalStatus: "pending" }),
      P("Legacy Butter Naan", { approvalStatus: undefined }), // pre-moderation product: counts as approved
      P("Garlic Butter", { sellerId: oid() }), // another seller's product: must never appear
    ];
  });
  const run = async (query) => {
    const res = fakeRes();
    await getSellerProducts({ query, user: { id: String(me) } }, res);
    expect(res.statusCode).toBe(200);
    const items = payload(res).items ?? payload(res).products ?? [];
    return items.map((p) => p.name).sort();
  };

  test("REGRESSION: search inside the Approved tab only returns APPROVED matches", async () => {
    // Before: the approval filter's $or overwrote the search's $or, so every approved product came back.
    expect(await run({ approvalStatus: "approved", search: "butter" })).toEqual(["Amul Butter", "Legacy Butter Naan"]);
  });

  test("search alone, and in the Pending tab", async () => {
    expect(await run({ search: "butter" })).toEqual(["Amul Butter", "Butter Cookies", "Legacy Butter Naan"]);
    expect(await run({ approvalStatus: "pending", search: "butter" })).toEqual(["Butter Cookies"]);
  });

  test("brand and tags are searched too, `q` is accepted as well as `search`", async () => {
    expect(await run({ search: "amul" })).toEqual(["Amul Butter"]); // brand (was name/sku/tags only)
    expect(await run({ search: "dairy" })).toEqual(["Fresh Milk"]); // tag
    expect(await run({ q: "milk" })).toEqual(["Fresh Milk"]);
  });

  test("another seller's products are never returned, whatever is typed", async () => {
    expect(await run({ search: "garlic" })).toEqual([]);
  });

  test.each(HOSTILE)("hostile input %p is literal", async (evil) => {
    expect(await run({ search: evil })).toEqual([]);
  });

  test("non-string search is ignored safely", async () => {
    expect(await run({ search: { $ne: "x" } })).toHaveLength(4); // all of MY products
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ledger - `search` was silently stripped by the validator", () => {
  test("the query schema now keeps `search` (and bounds its length)", () => {
    const ok = validateBodySafe(financeLedgerQuerySchema, { page: 1, search: "TXN-1" });
    expect(ok.isValid).toBe(true);
    expect(ok.value.search).toBe("TXN-1");
    expect(validateBodySafe(financeLedgerQuerySchema, { search: "x".repeat(500) }).isValid).toBe(false);
    expect(validateBodySafe(financeLedgerQuerySchema, { search: "" }).isValid).toBe(true);
  });

  test("search matches reference / transaction id / description / type and the order's public id", async () => {
    const o1 = oid();
    db.order = [{ _id: o1, orderId: "ORD-LEDGER1" }];
    db.ledger = [
      { _id: oid(), reference: "REF-AAA", transactionId: "T-1", description: "Seller payout", type: "PAYOUT", createdAt: new Date(3) },
      { _id: oid(), reference: "REF-BBB", transactionId: "T-2", description: "Order revenue", type: "ORDER", orderId: o1, createdAt: new Date(2) },
      { _id: oid(), reference: "REF-CCC", transactionId: "T-3", description: "Refund", type: "REFUND", createdAt: new Date(1) },
    ];
    const refs = async (search) => (await getLedgerEntries({ search })).items.map((e) => e.reference).sort();
    expect(await refs("REF-AAA")).toEqual(["REF-AAA"]);
    expect(await refs("t-3")).toEqual(["REF-CCC"]);
    expect(await refs("revenue")).toEqual(["REF-BBB"]);
    expect(await refs("refund")).toEqual(["REF-CCC"]);
    expect(await refs("LEDGER1")).toEqual(["REF-BBB"]); // by order id
    expect(await refs("")).toHaveLength(3);
    for (const evil of HOSTILE) expect(await refs(evil)).toEqual([]);
  });
});

describe("delivery surge rules", () => {
  test("rule-name search is literal and safe", async () => {
    db.surge = [
      { _id: oid(), name: "Rain surge (peak)", status: "active", priority: 1, updatedAt: new Date() },
      { _id: oid(), name: "Night", status: "active", priority: 2, updatedAt: new Date() },
    ];
    const names2 = async (search) => (await listRules({ search })).items.map((r) => r.name);
    expect(await names2("rain")).toEqual(["Rain surge (peak)"]);
    expect(await names2("(peak)")).toEqual(["Rain surge (peak)"]); // literal parentheses
    for (const evil of HOSTILE) {
      // "(" is literally IN the first rule's name, so it legitimately matches; the rest match nothing
      expect(await names2(evil)).toEqual(evil === "(" ? ["Rain surge (peak)"] : []);
    }
  });
});


// ─────────────────────────────────────────────────────────────────────────────
describe("lost / damaged baskets - the endpoint the admin page calls did not exist", () => {
  const shopA = oid();
  const shopB = oid();
  beforeEach(() => {
    db.seller = [
      { _id: shopA, shopName: "Fresh Mart", name: "Raj" },
      { _id: shopB, shopName: "Spice Hub", name: "Meena" },
    ];
    const b = (basketId, status, seller, o = {}) => ({
      _id: oid(), basketId, status, size: "LARGE", assignedSellerId: seller, notes: "",
      timeline: [{ status: "ASSIGNED", timestamp: new Date(1), notes: "assigned" }, { status, timestamp: new Date(2026, 7, 1), notes: `marked ${status}` }],
      updatedAt: new Date(2026, 7, 1), ...o,
    });
    db.basket = [
      b("BSK-LOST1", "LOST", shopA),
      b("BSK-LOST2", "LOST", shopB),
      b("BSK-DMG01", "DAMAGED", shopA),
      b("BSK-OK001", "AVAILABLE", shopA), // a healthy basket must never be listed
    ];
  });
  const run = async (query) => {
    const res = fakeRes();
    await adminBaskets.getLostDamaged({ query }, res);
    expect(res.statusCode).toBe(200);
    return res.body.result;
  };
  const ids = (r) => r.items.map((i) => i.basketId).sort();

  test("lists only LOST and DAMAGED baskets, never healthy ones", async () => {
    expect(ids(await run({}))).toEqual(["BSK-DMG01", "BSK-LOST1", "BSK-LOST2"]);
  });

  test("type filter", async () => {
    expect(ids(await run({ type: "LOST" }))).toEqual(["BSK-LOST1", "BSK-LOST2"]);
    expect(ids(await run({ type: "damaged" }))).toEqual(["BSK-DMG01"]);
    expect(ids(await run({ type: "AVAILABLE" }))).toEqual(["BSK-DMG01", "BSK-LOST1", "BSK-LOST2"]); // can't be used to list healthy baskets
  });

  test("search by basket id", async () => {
    expect(ids(await run({ search: "lost2" }))).toEqual(["BSK-LOST2"]);
  });

  test("search by the SELLER it was assigned to (shop name or owner)", async () => {
    expect(ids(await run({ search: "Fresh Mart" }))).toEqual(["BSK-DMG01", "BSK-LOST1"]);
    expect(ids(await run({ search: "meena" }))).toEqual(["BSK-LOST2"]);
  });

  test("reports the reason and date from the timeline entry that set the current state", async () => {
    const r = await run({ search: "DMG01" });
    expect(r.items[0]).toMatchObject({ basketId: "BSK-DMG01", status: "DAMAGED", reason: "marked DAMAGED" });
    expect(new Date(r.items[0].markedAt).getFullYear()).toBe(2026);
  });

  test("pagination metadata", async () => {
    const r = await run({ page: "1", limit: "2" });
    expect(r).toMatchObject({ total: 3, page: 1, limit: 2, pages: 2 });
    expect(r.items).toHaveLength(2);
  });

  test.each(HOSTILE)("hostile search %p is literal and safe", async (evil) => {
    const res = fakeRes();
    await adminBaskets.getLostDamaged({ query: { search: evil } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.result.items).toHaveLength(0);
  });
});

describe("seller payout history - the search only ever covered one loaded page", () => {
  const me = oid();
  beforeEach(() => {
    const p = (o) => ({ _id: oid(), beneficiaryId: me, beneficiaryType: "SELLER", status: "PAID", paymentDate: new Date(), createdAt: new Date(), ...o });
    db.payout = [
      p({ payoutId: "PAY-1001", transactionReference: "UTR-ABC123", paymentMethod: "UPI", notes: "weekly" }),
      p({ payoutId: "PAY-1002", transactionReference: "UTR-XYZ789", paymentMethod: "BANK_TRANSFER", notes: "" }),
      p({ payoutId: "PAY-9999", transactionReference: "UTR-OTHER", beneficiaryId: oid() }), // someone else's payout: never returned
    ];
  });
  const refs = async (search) => (await getPayoutHistory("SELLER", me, { search })).items.map((i) => i.payoutId).sort();

  test("finds a payout by reference, payout id, method, or note", async () => {
    expect(await refs("abc123")).toEqual(["PAY-1001"]);
    expect(await refs("PAY-1002")).toEqual(["PAY-1002"]);
    expect(await refs("bank")).toEqual(["PAY-1002"]);
    expect(await refs("weekly")).toEqual(["PAY-1001"]);
  });

  test("never returns another beneficiary's payouts", async () => {
    expect(await refs("UTR-OTHER")).toEqual([]);
    expect(await refs("")).toEqual(["PAY-1001", "PAY-1002"]);
  });

  test("the total follows the search; hostile input is literal", async () => {
    expect((await getPayoutHistory("SELLER", me, { search: "xyz" })).total).toBe(1);
    for (const evil of HOSTILE) expect(await refs(evil)).toEqual([]);
  });
});

describe("ledger search also covers the actor and the amount (what the wallet table shows)", () => {
  test("finds entries by actor type and by amount (either sign)", async () => {
    db.ledger = [
      { _id: oid(), reference: "R1", transactionId: "T1", description: "x", type: "ORDER", actorType: "SELLER", amount: 250, createdAt: new Date(3) },
      { _id: oid(), reference: "R2", transactionId: "T2", description: "y", type: "PAYOUT", actorType: "DELIVERY_PARTNER", amount: -250, createdAt: new Date(2) },
      { _id: oid(), reference: "R3", transactionId: "T3", description: "z", type: "ORDER", actorType: "ADMIN", amount: 99, createdAt: new Date(1) },
    ];
    const refs = async (search) => (await getLedgerEntries({ search })).items.map((e) => e.reference).sort();
    expect(await refs("delivery")).toEqual(["R2"]); // actor
    expect(await refs("250")).toEqual(["R1", "R2"]); // amount, matched regardless of sign
    expect(await refs("1,000")).toEqual([]); // formatted number: parsed, matches nothing
    expect(await refs("99")).toEqual(["R3"]);
  });
});

describe("seller products - variant SKUs are searchable", () => {
  test("a product is found by one of its variant SKUs", async () => {
    const me2 = oid();
    db.product = [
      { _id: oid(), name: "Rice", sku: "RICE-MAIN", sellerId: me2, status: "active", approvalStatus: "approved", tags: [], variants: [{ name: "5kg", sku: "RICE-5KG-X" }], createdAt: new Date() },
      { _id: oid(), name: "Oil", sku: "OIL-MAIN", sellerId: me2, status: "active", approvalStatus: "approved", tags: [], variants: [], createdAt: new Date() },
    ];
    const res = fakeRes();
    await getSellerProducts({ query: { search: "5KG-X" }, user: { id: String(me2) } }, res);
    expect((payload(res).items ?? payload(res).products).map((p) => p.name)).toEqual(["Rice"]);
  });
});
