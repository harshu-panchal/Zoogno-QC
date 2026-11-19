import { jest } from "@jest/globals";
import mongoose from "mongoose";

const mockProductFind = jest.fn();
const mockProductCount = jest.fn();
const mockProductDistinct = jest.fn();
const mockCategoryFind = jest.fn();
const mockCategoryDistinct = jest.fn();
const mockSellerFind = jest.fn();
const mockSellerDistinct = jest.fn();

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: { find: mockProductFind, countDocuments: mockProductCount, distinct: mockProductDistinct },
}));
jest.unstable_mockModule("../app/models/category.js", () => ({
  default: { find: mockCategoryFind, distinct: mockCategoryDistinct },
}));
jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: { find: mockSellerFind, distinct: mockSellerDistinct },
}));

const { searchCustomerProducts, scoreProduct, buildTokenClause, resetVocabularyCache } = await import(
  "../app/services/search/productSearch.js"
);
const { tokenize } = await import("../app/services/search/queryAnalysis.js");

const oid = () => new mongoose.Types.ObjectId();

/** A chainable Mongo query stub that records what was asked of it. */
function chain(result) {
  const c = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
  return c;
}
const entityChain = (rows) => ({
  select: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(rows),
});

let seq = 0;
function product(over = {}) {
  seq += 1;
  return {
    _id: oid(),
    name: `Product ${seq}`,
    stock: 10,
    isOutOfStock: false,
    createdAt: new Date(2026, 0, seq),
    ...over,
  };
}

const baseFilter = { status: "active", sellerId: { $in: ["s1", "s2"] } };
const SELECT = "name price";

beforeEach(() => {
  // resetAllMocks (not clearAllMocks): it also drains unconsumed mockReturnValueOnce queues,
  // which would otherwise leak a previous test's stubbed results into the next one.
  jest.resetAllMocks();
  resetVocabularyCache();
  seq = 0;
  // Any search pass the test did not explicitly stub simply finds nothing.
  mockProductFind.mockImplementation(() => chain([]));
  mockCategoryFind.mockReturnValue(entityChain([]));
  mockSellerFind.mockReturnValue(entityChain([]));
  mockProductCount.mockResolvedValue(0);
  mockProductDistinct.mockResolvedValue([]);
  mockCategoryDistinct.mockResolvedValue([]);
  mockSellerDistinct.mockResolvedValue([]);
});

const search = (rawQuery, extra = {}) =>
  searchCustomerProducts({ rawQuery, baseFilter, select: SELECT, sellerScopeIds: ["s1", "s2"], ...extra });

describe("searchCustomerProducts - basics", () => {
  test("no query -> null, so the caller falls back to the normal listing", async () => {
    expect(await search("")).toBeNull();
    expect(await search("   ")).toBeNull();
    expect(await search(undefined)).toBeNull();
    expect(mockProductFind).not.toHaveBeenCalled();
  });

  test("a query with nothing searchable ('&&') is an EMPTY result, never 'no filter'", async () => {
    const res = await search("&&& !!!");
    expect(res).toMatchObject({ items: [], total: 0, meta: { matchType: "none", tokens: [] } });
    expect(mockProductFind).not.toHaveBeenCalled(); // must not list the whole catalogue
  });
});

describe("strict search (every word must match)", () => {
  test("builds one clause per word, ANDed onto the caller's filter - so location/status always apply", async () => {
    mockProductFind.mockReturnValueOnce(chain([]));
    await search("amul butter");

    const [filter] = mockProductFind.mock.calls[0];
    expect(filter.$and[0]).toBe(baseFilter); // status / seller scope / etc. untouched
    expect(filter.$and[1].$and).toHaveLength(2); // amul AND butter
    expect(Object.keys(filter.$and[1].$and[0].$or[0])[0]).toBe("name");
  });

  test("ranks by relevance: exact name > starts-with > word match > weaker matches", async () => {
    const weak = product({ name: "Deluxe Gift Box", tags: ["butter"] }); // tag only
    const word = product({ name: "Salted Butter 500g" }); // a word of the name
    const starts = product({ name: "Butter Cookies" }); // name starts with it
    const exact = product({ name: "Butter" }); // exactly the name
    mockProductFind
      .mockReturnValueOnce(chain([weak, word, starts, exact])) // stage 1: candidates
      .mockReturnValueOnce(chain([exact, starts, word, weak])); // stage 2: page documents

    const res = await search("butter");

    expect(res.meta.matchType).toBe("exact");
    expect(res.total).toBe(4);
    // stage 2 asked for the page IDs in RANKED order
    const [stage2] = mockProductFind.mock.calls[1];
    expect(stage2._id.$in.map(String)).toEqual([exact, starts, word, weak].map((p) => String(p._id)));
    expect(res.items.map((p) => p.name)).toEqual(["Butter", "Butter Cookies", "Salted Butter 500g", "Deluxe Gift Box"]);
  });

  test("availability is a tier: an out-of-stock name match never outranks an in-stock one", async () => {
    const oosStartsWith = product({ name: "Butter Naan", stock: 0 }); // better text match, unavailable
    const inStockMid = product({ name: "Amul Butter Salted" }); // weaker text match, available
    const oosExact = product({ name: "Butter", stock: 0 }); // the exact name, unavailable
    mockProductFind
      .mockReturnValueOnce(chain([oosStartsWith, inStockMid, oosExact]))
      .mockReturnValueOnce(chain([]));

    await search("butter");

    const [stage2] = mockProductFind.mock.calls[1];
    expect(stage2._id.$in.map(String)).toEqual([oosExact, inStockMid, oosStartsWith].map((p) => String(p._id)));
    // exact name first (even though unavailable) -> then in-stock -> then the rest of the unavailable
  });

  test("returns the page documents in the ranked order even if the database returns them shuffled", async () => {
    const a = product({ name: "Butter" });
    const b = product({ name: "Butter Cookies" });
    mockProductFind
      .mockReturnValueOnce(chain([b, a]))
      .mockReturnValueOnce(chain([b, a])); // DB order != rank order
    const res = await search("butter");
    expect(res.items.map((p) => p.name)).toEqual(["Butter", "Butter Cookies"]);
  });

  test("pagination slices the ranked list and reports the full total", async () => {
    const ps = Array.from({ length: 5 }, (_, i) => product({ name: `Butter ${i}`, stock: 10 - i }));
    mockProductFind.mockReturnValueOnce(chain(ps)).mockReturnValueOnce(chain([]));

    const res = await search("butter", { page: 2, limit: 2 });

    expect(res.total).toBe(5);
    const [stage2] = mockProductFind.mock.calls[1];
    expect(stage2._id.$in).toHaveLength(2); // items 3-4 of the ranking
  });

  test("a page past the end is empty but still reports the total", async () => {
    mockProductFind.mockReturnValueOnce(chain([product({ name: "Butter" })]));
    const res = await search("butter", { page: 5, limit: 10 });
    expect(res).toMatchObject({ items: [], total: 1 });
    expect(mockProductFind).toHaveBeenCalledTimes(1); // no pointless stage-2 query
  });

  test("when the candidate cap is hit the true total comes from a count query", async () => {
    const many = Array.from({ length: 2000 }, () => product({ name: "Butter" }));
    mockProductFind.mockReturnValueOnce(chain(many)).mockReturnValueOnce(chain([]));
    mockProductCount.mockResolvedValue(5321);

    const res = await search("butter");
    expect(res.total).toBe(5321);
  });

  test("ranking only loads lightweight fields; full documents are fetched for the page alone", async () => {
    const c1 = chain([product({ name: "Butter" })]);
    mockProductFind.mockReturnValueOnce(c1).mockReturnValueOnce(chain([]));
    await search("butter");
    expect(c1.select.mock.calls[0][0]).toContain("variants.name");
    expect(c1.select.mock.calls[0][0]).not.toContain("description");
  });
});

describe("shop and category matching", () => {
  test("shop names are matched only among sellers that serve this customer", async () => {
    mockProductFind.mockReturnValueOnce(chain([]));
    await search("reliance");

    const [sellerFilter] = mockSellerFind.mock.calls[0];
    expect(sellerFilter._id).toEqual({ $in: ["s1", "s2"] }); // never the whole seller base
    expect(sellerFilter.shopName.$options).toBe("i");
  });

  test("a matching shop / category adds seller and category clauses for that word", async () => {
    const shopId = oid();
    const catId = oid();
    mockSellerFind.mockReturnValue(entityChain([{ _id: shopId, shopName: "Reliance Fresh" }]));
    mockCategoryFind.mockReturnValue(entityChain([{ _id: catId, name: "Dairy & Eggs" }]));
    mockProductFind.mockReturnValueOnce(chain([]));

    await search("reliance dairy");

    const [filter] = mockProductFind.mock.calls[0];
    const [relianceClause, dairyClause] = filter.$and[1].$and;
    expect(relianceClause.$or).toContainEqual({ sellerId: { $in: [shopId] } });
    expect(relianceClause.$or).not.toContainEqual({ categoryId: { $in: [catId] } }); // not a category word
    expect(dairyClause.$or).toContainEqual({ categoryId: { $in: [catId] } });
    expect(dairyClause.$or).toContainEqual({ subcategoryId: { $in: [catId] } });
    expect(dairyClause.$or).toContainEqual({ headerId: { $in: [catId] } });
    expect(dairyClause.$or).not.toContainEqual({ sellerId: { $in: [shopId] } });
  });

  test("products found only through their shop or category are ranked by that match", async () => {
    const shopId = oid();
    mockSellerFind.mockReturnValue(entityChain([{ _id: shopId, shopName: "Fresh Mart" }]));
    const inShop = product({ name: "Mystery Item", sellerId: shopId });
    mockProductFind.mockReturnValueOnce(chain([inShop])).mockReturnValueOnce(chain([inShop]));

    const res = await search("fresh");
    expect(res.total).toBe(1);
    expect(res.items[0].name).toBe("Mystery Item");
  });

  test("words under 3 characters never query shop / category names (far too broad)", async () => {
    mockProductFind.mockReturnValueOnce(chain([]));
    await search("ch");
    expect(mockCategoryFind).not.toHaveBeenCalled();
    expect(mockSellerFind).not.toHaveBeenCalled();
  });
});

describe("typo correction", () => {
  const vocabulary = () => {
    mockProductDistinct.mockImplementation(async (field) =>
      field === "name" ? ["Chicken Breast Boneless", "Fresh Paneer"] : field === "brand" ? ["Amul"] : [],
    );
  };

  test("when nothing matches, a mistyped word is corrected against the catalogue and re-searched", async () => {
    vocabulary();
    const chicken = product({ name: "Chicken Breast Boneless" });
    mockProductFind
      .mockReturnValueOnce(chain([])) // strict pass: "chiken" finds nothing
      .mockReturnValueOnce(chain([chicken])) // corrected pass
      .mockReturnValueOnce(chain([chicken])); // stage 2

    const res = await search("chiken");

    expect(res.total).toBe(1);
    expect(res.meta).toMatchObject({
      matchType: "corrected",
      correctedQuery: "chicken",
      corrections: [{ from: "chiken", to: "chicken" }],
      tokens: ["chicken"],
    });
    // the second pass really used the corrected spelling
    const [secondFilter] = mockProductFind.mock.calls[1];
    expect(JSON.stringify(secondFilter)).toContain("chicken");
  });

  test("a query that already matches is NEVER 'corrected'", async () => {
    vocabulary();
    mockProductFind.mockReturnValueOnce(chain([product({ name: "Chiken Special" })])).mockReturnValueOnce(chain([]));
    const res = await search("chiken");
    expect(res.meta.matchType).toBe("exact");
    expect(res.meta.correctedQuery).toBeUndefined();
    expect(mockProductDistinct).not.toHaveBeenCalled(); // vocabulary not even built
  });

  test("the vocabulary is built once and then cached", async () => {
    vocabulary();
    for (let i = 0; i < 3; i += 1) {
      mockProductFind.mockReturnValueOnce(chain([])).mockReturnValueOnce(chain([]));
      await search("zzzzzz");
    }
    // 2 distinct() calls per Product vocabulary field set: name/brand/tags = 3 calls, once only
    expect(mockProductDistinct).toHaveBeenCalledTimes(3);
  });

  test("if the vocabulary cannot be built, search still works - just without correction", async () => {
    mockProductDistinct.mockRejectedValue(new Error("BSONObj size exceeded"));
    mockProductFind.mockReturnValueOnce(chain([]));
    const res = await search("chiken");
    expect(res).toMatchObject({ items: [], total: 0, meta: { matchType: "none" } });
  });
});

describe("related fallback (any word)", () => {
  test("several words that never occur together fall back to products matching ANY of them", async () => {
    mockProductFind.mockReturnValueOnce(chain([])); // strict "organic apple": nothing has both
    const apple = product({ name: "Apple Juice" });
    mockProductFind.mockReturnValueOnce(chain([apple])).mockReturnValueOnce(chain([apple]));

    const res = await search("organic apple");

    expect(res.meta.matchType).toBe("related");
    expect(res.items.map((p) => p.name)).toEqual(["Apple Juice"]);
    const [anyFilter] = mockProductFind.mock.calls[1];
    expect(anyFilter.$and[1].$or).toHaveLength(2); // OR across the words, not AND
  });

  test("products matching more of the words rank higher in the fallback", async () => {
    const both = product({ name: "Organic Apple Cider" });
    const one = product({ name: "Apple Pie", ratingAverage: 5, ratingCount: 900 });
    mockProductFind.mockReturnValueOnce(chain([])).mockReturnValueOnce(chain([one, both])).mockReturnValueOnce(chain([both, one]));

    const res = await search("organic apple cider");
    expect(res.items[0].name).toBe("Organic Apple Cider");
  });

  test("a single unmatched word has nothing to relax - empty result", async () => {
    mockProductFind.mockReturnValueOnce(chain([]));
    const res = await search("qqqqqqq");
    expect(res.meta.matchType).toBe("none");
    expect(mockProductFind).toHaveBeenCalledTimes(1);
  });
});

describe("explicit sort", () => {
  test("a customer-chosen sort is honoured by the database (skip/limit/count), not re-ranked", async () => {
    const c = chain([product({ name: "Butter A" }), product({ name: "Butter B" })]);
    mockProductFind.mockReturnValueOnce(c);
    mockProductCount.mockResolvedValue(42);

    const res = await search("butter", { relevance: false, sortQuery: { price: 1 }, page: 3, limit: 10 });

    expect(res.total).toBe(42);
    expect(c.sort).toHaveBeenCalledWith({ price: 1 });
    expect(c.skip).toHaveBeenCalledWith(20);
    expect(c.limit).toHaveBeenCalledWith(10);
    expect(mockProductFind).toHaveBeenCalledTimes(1); // no two-stage ranking
  });
});

describe("scoreProduct", () => {
  const score = (p, query, matches) => {
    const tokens = tokenize(query);
    return scoreProduct(p, { tokens, phrase: tokens.join(" "), matches }).score;
  };

  test("name relevance order: exact > starts-with > whole word > inside a word", () => {
    const exact = score(product({ name: "Butter" }), "butter");
    const starts = score(product({ name: "Butter Cookies" }), "butter");
    const word = score(product({ name: "Salted Butter 500g" }), "butter");
    const inside = score(product({ name: "Peanutbutterspread" }), "butter");
    expect(exact).toBeGreaterThan(starts);
    expect(starts).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
  });

  test("a name hit beats a brand-only hit, which beats a tag-only hit", () => {
    const name = score(product({ name: "Amul Cheese" }), "amul");
    const brand = score(product({ name: "Cheese Slices", brand: "Amul" }), "amul");
    const tag = score(product({ name: "Cheese Slices", tags: ["amul"] }), "amul");
    expect(name).toBeGreaterThan(brand);
    expect(brand).toBeGreaterThan(tag);
  });

  test("words in order together beat the same words scattered; all-words-in-name gets a bonus", () => {
    const together = score(product({ name: "Amul Butter Salted" }), "amul butter");
    const scattered = score(product({ name: "Butter by Amul Dairy Foods" }), "amul butter");
    expect(together).toBeGreaterThan(scattered);
    const allInName = score(product({ name: "Amul Butter" }), "amul butter");
    const oneInName = score(product({ name: "Butter", brand: "Amul" }), "amul butter");
    expect(allInName).toBeGreaterThan(oneInName);
  });

  test("an exact barcode / SKU match outranks a merely partial code match", () => {
    const exact = score(product({ name: "Mystery Snack", upcNumber: "8901234567890" }), "8901234567890");
    const partial = score(product({ name: "Mystery Snack", upcNumber: "89012345678901" }), "8901234567890");
    expect(exact).toBeGreaterThan(partial + 300); // decisively, not by a hair
  });

  test("category and shop matches contribute", () => {
    const catId = oid();
    const shopId = oid();
    const matches = new Map([["dairy", { categoryIds: [catId], sellerIds: [] }], ["fresh", { categoryIds: [], sellerIds: [shopId] }]]);
    const inCat = score(product({ name: "Mystery", categoryId: catId }), "dairy", matches);
    const outCat = score(product({ name: "Mystery", categoryId: oid() }), "dairy", matches);
    expect(inCat).toBeGreaterThan(outCat);
    const inShop = score(product({ name: "Mystery", sellerId: shopId }), "fresh", matches);
    const outShop = score(product({ name: "Mystery", sellerId: oid() }), "fresh", matches);
    expect(inShop).toBeGreaterThan(outShop);
  });

  test("out-of-stock products stay but rank below in-stock ones; ratings break ties", () => {
    const inStock = score(product({ name: "Butter", stock: 5 }), "butter");
    const oos = score(product({ name: "Butter", stock: 0 }), "butter");
    const flagged = score(product({ name: "Butter", stock: 5, isOutOfStock: true }), "butter");
    expect(inStock).toBeGreaterThan(oos);
    expect(inStock).toBeGreaterThan(flagged);
    const loved = score(product({ name: "Butter", ratingAverage: 4.8, ratingCount: 500 }), "butter");
    expect(loved).toBeGreaterThan(inStock);
  });

  test("reports how many query words matched at all", () => {
    const tokens = tokenize("amul butter jam");
    const r = scoreProduct(product({ name: "Amul Butter" }), { tokens, phrase: tokens.join(" ") });
    expect(r.matched).toBe(2);
  });

  test("tolerates sparse documents (missing brand / tags / variants)", () => {
    expect(() => scoreProduct({ _id: oid(), name: "x" }, { tokens: ["x"], phrase: "x" })).not.toThrow();
    expect(() => scoreProduct({ _id: oid() }, { tokens: ["x"], phrase: "x" })).not.toThrow();
  });
});

describe("buildTokenClause", () => {
  const fields = (clause) => clause.$or.map((c) => Object.keys(c)[0]);

  test("a normal word searches names, brands, tags, variants, weight, codes and descriptions", () => {
    expect(fields(buildTokenClause("butter"))).toEqual(
      expect.arrayContaining(["name", "brand", "tags", "variants.name", "weight", "sku", "upcNumber", "hsnCode", "description"]),
    );
  });

  test("short words skip codes and prose, so they cannot match everything", () => {
    const f = fields(buildTokenClause("ch"));
    expect(f).toEqual(expect.arrayContaining(["name", "brand", "tags"]));
    expect(f).not.toContain("sku");
    expect(f).not.toContain("description");
    expect(fields(buildTokenClause("abc"))).not.toContain("description"); // description needs 4+ chars
  });

  test("category / seller clauses appear only when that word matched one", () => {
    expect(fields(buildTokenClause("butter", { categoryIds: [], sellerIds: [] }))).not.toContain("sellerId");
    const f = fields(buildTokenClause("butter", { categoryIds: [oid()], sellerIds: [oid()] }));
    expect(f).toEqual(expect.arrayContaining(["categoryId", "subcategoryId", "headerId", "sellerId"]));
  });
});
