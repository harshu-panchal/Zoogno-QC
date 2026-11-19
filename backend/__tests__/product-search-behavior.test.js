import { jest } from "@jest/globals";
import mongoose from "mongoose";

/**
 * Behavioural test: the engine's REAL generated Mongo filters are evaluated (by `sift`, a JS
 * implementation of Mongo's query operators) against a realistic fixture catalogue, so we assert
 * on what a customer would actually SEE - not just on the shape of the query. The models are the
 * only thing faked; everything in services/search/ runs for real.
 */
const siftModule = await import("sift");
const sift = [siftModule.default?.default, siftModule.default, siftModule].find((f) => typeof f === "function");

const oid = () => new mongoose.Types.ObjectId();

// ── fixture catalogue ───────────────────────────────────────────────────────
const cat = {
  grocery: { _id: oid(), name: "Grocery & Kitchen", status: "active" },
  dairy: { _id: oid(), name: "Dairy & Eggs", status: "active" },
  milk: { _id: oid(), name: "Milk & Cream", status: "active" },
  meat: { _id: oid(), name: "Meat & Seafood", status: "active" },
  chicken: { _id: oid(), name: "Chicken", status: "active" },
  produce: { _id: oid(), name: "Fruits & Vegetables", status: "active" },
  snacks: { _id: oid(), name: "Snacks & Biscuits", status: "active" },
};
const shop = {
  reliance: { _id: oid(), shopName: "Reliance Fresh", isActive: true, isVerified: true },
  dairyMart: { _id: oid(), shopName: "Local Dairy Mart", isActive: true, isVerified: true },
  kirana: { _id: oid(), shopName: "Sharma Kirana", isActive: true, isVerified: true },
  faraway: { _id: oid(), shopName: "Faraway Reliance Outlet", isActive: true, isVerified: true },
};
const nearbySellerIds = [shop.reliance._id, shop.dairyMart._id, shop.kirana._id]; // faraway is NOT nearby

let n = 0;
const P = (name, o = {}) => {
  n += 1;
  return {
    _id: oid(),
    name,
    status: "active",
    approvalStatus: "approved",
    stock: 20,
    isOutOfStock: false,
    price: 100,
    headerId: cat.grocery._id,
    categoryId: cat.grocery._id,
    subcategoryId: cat.grocery._id,
    sellerId: shop.kirana._id,
    tags: [],
    variants: [],
    createdAt: new Date(2026, 0, n),
    ...o,
  };
};

const catalogue = [
  P("Amul Butter Salted 500g", { brand: "Amul", tags: ["butter", "spread"], weight: "500g", upcNumber: "8901262010011", categoryId: cat.dairy._id, subcategoryId: cat.milk._id, sellerId: shop.reliance._id }),
  P("Amul Butter Unsalted 100g", { brand: "Amul", weight: "100g", categoryId: cat.dairy._id, subcategoryId: cat.milk._id, sellerId: shop.reliance._id }),
  P("Britannia Butter Cookies 200g", { brand: "Britannia", weight: "200g", categoryId: cat.snacks._id, subcategoryId: cat.snacks._id }),
  P("Butter Biscuits 100g", { categoryId: cat.snacks._id }), // in stock, NAME STARTS with "butter"
  P("Butter Naan 4 pcs", { stock: 0, categoryId: cat.snacks._id }), // out of stock, name starts with "butter"
  P("Fresh Chicken Breast Boneless 500g", { weight: "500g", categoryId: cat.meat._id, subcategoryId: cat.chicken._id, sellerId: shop.reliance._id }),
  P("Chicken Sausage 250g", { weight: "250g", categoryId: cat.meat._id, subcategoryId: cat.chicken._id }),
  P("Fresh Tomato 1kg", { categoryId: cat.produce._id, subcategoryId: cat.produce._id }),
  P("Tomato Ketchup 500g", { weight: "500g", brand: "Kissan" }),
  P("Amul Fresh Milk 1L", { brand: "Amul", tags: ["milk"], weight: "1L", categoryId: cat.dairy._id, subcategoryId: cat.milk._id, sellerId: shop.dairyMart._id }),
  P("Paneer Block 200g", { weight: "200g", categoryId: cat.dairy._id, sellerId: shop.dairyMart._id }),
  P("Organic Honey 500g", { weight: "500g", tags: ["organic"] }),
  P("Apple Juice 1L", { weight: "1L" }),
  P("Potato Chips Classic 50g", { weight: "50g", categoryId: cat.snacks._id }),
  P("Chocolate Cake", { categoryId: cat.snacks._id }),
  P("Panchakarma Massage Oil"), // contains 'ch' mid-word only
  P("Churna Digestive Powder"), // a word STARTING with 'ch'
  P("Variant Rice", { variants: [{ name: "5kg" }, { name: "10kg" }] }),
  // ── things a customer must NEVER see, whatever they search ──
  P("Amul Butter Garlic (far away)", { brand: "Amul", sellerId: shop.faraway._id }),
  P("Amul Butter Discontinued", { brand: "Amul", status: "inactive", sellerId: shop.reliance._id }),
  P("Amul Butter Pending Approval", { brand: "Amul", approvalStatus: "pending", sellerId: shop.reliance._id }),
];
const byName = (name) => catalogue.find((p) => p.name === name);
const hidden = ["Amul Butter Garlic (far away)", "Amul Butter Discontinued", "Amul Butter Pending Approval"].map((nm) => String(byName(nm)._id));

// ── a tiny Mongo: find / countDocuments / distinct over the fixtures ─────────
function queryOver(rows, filter) {
  let out = rows.filter(sift(filter));
  let sortSpec = null;
  let skipN = 0;
  let limitN = Infinity;
  const q = {
    select: () => q,
    sort: (s) => { sortSpec = s; return q; },
    skip: (x) => { skipN = x; return q; },
    limit: (x) => { limitN = x; return q; },
    lean: async () => {
      if (sortSpec) {
        const [[field, dir]] = Object.entries(sortSpec);
        out = [...out].sort((a, b) => (a[field] > b[field] ? dir : -dir));
      }
      return out.slice(skipN, skipN + limitN).map((d) => ({ ...d }));
    },
  };
  return q;
}
const distinctOf = (rows, field, filter = {}) => {
  const vals = [];
  for (const r of rows.filter(sift(filter))) {
    const v = r[field];
    if (Array.isArray(v)) vals.push(...v);
    else if (v != null) vals.push(v);
  }
  return [...new Set(vals)];
};

const sellersArr = Object.values(shop);
const catsArr = Object.values(cat);

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    find: (f) => queryOver(catalogue, f),
    countDocuments: async (f) => catalogue.filter(sift(f)).length,
    distinct: async (field, f) => distinctOf(catalogue, field, f),
  },
}));
jest.unstable_mockModule("../app/models/category.js", () => ({
  default: { find: (f) => queryOver(catsArr, f), distinct: async (field, f) => distinctOf(catsArr, field, f) },
}));
jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: { find: (f) => queryOver(sellersArr, f), distinct: async (field, f) => distinctOf(sellersArr, field, f) },
}));

const { searchCustomerProducts, resetVocabularyCache } = await import("../app/services/search/productSearch.js");

// What productController builds for a customer: active + approved + only sellers that serve them.
const baseFilter = {
  $and: [
    { status: "active", sellerId: { $in: nearbySellerIds } },
    { $or: [{ approvalStatus: "approved" }, { approvalStatus: { $exists: false } }] },
  ],
};

beforeEach(() => resetVocabularyCache());

async function run(rawQuery, extra = {}) {
  const res = await searchCustomerProducts({
    rawQuery,
    baseFilter,
    sellerScopeIds: nearbySellerIds,
    select: "name",
    limit: 50,
    ...extra,
  });
  return { ...res, names: res.items.map((p) => p.name) };
}

describe("wild search - what the customer actually sees", () => {
  test("multi-word: 'amul butter' finds Amul's butters, and 'butter amul' finds the same ones", async () => {
    const a = await run("amul butter");
    const b = await run("butter amul");
    expect(a.names.slice().sort()).toEqual(["Amul Butter Salted 500g", "Amul Butter Unsalted 100g"]);
    expect(b.names.slice().sort()).toEqual(a.names.slice().sort());
    expect(a.meta.matchType).toBe("exact");
  });

  test("words can be matched across DIFFERENT fields: brand + name + weight", async () => {
    const res = await run("amul butter 500g");
    expect(res.names).toEqual(["Amul Butter Salted 500g"]);
  });

  test("partial words work anywhere in a word: 'chick' finds chicken but not chips", async () => {
    const res = await run("chick");
    expect(res.names.sort()).toEqual(["Chicken Sausage 250g", "Fresh Chicken Breast Boneless 500g"]);
  });

  test("plural queries find singular products: 'tomatoes' -> tomato", async () => {
    const res = await run("tomatoes");
    expect(res.names.sort()).toEqual(["Fresh Tomato 1kg", "Tomato Ketchup 500g"]);
  });

  test("tags are searched: 'organic'", async () => {
    expect((await run("organic")).names).toEqual(["Organic Honey 500g"]);
  });

  test("variant names are searched: '10kg' finds the rice sold in 10kg", async () => {
    expect((await run("10kg")).names).toEqual(["Variant Rice"]);
  });

  test("category names are searched: 'meat' returns everything in Meat & Seafood", async () => {
    const res = await run("seafood");
    expect(res.names.sort()).toEqual(["Chicken Sausage 250g", "Fresh Chicken Breast Boneless 500g"]);
  });

  test("subcategory names are searched: 'cream' reaches products in 'Milk & Cream'", async () => {
    const res = await run("cream");
    expect(res.names).toEqual(expect.arrayContaining(["Amul Butter Salted 500g", "Amul Fresh Milk 1L"]));
    expect(res.names).not.toContain("Chicken Sausage 250g");
  });

  test("SELLER names are searched: 'reliance' returns that shop's products - and ONLY nearby shops", async () => {
    const res = await run("reliance");
    expect(res.names).toEqual(expect.arrayContaining(["Amul Butter Salted 500g", "Fresh Chicken Breast Boneless 500g"]));
    // the 'Faraway Reliance Outlet' also has 'reliance' in its name but doesn't serve this customer
    expect(res.names).not.toContain("Amul Butter Garlic (far away)");
  });

  test("a shop word and a product word combine: 'dairy mart paneer' -> that shop's paneer", async () => {
    const res = await run("dairy paneer");
    expect(res.names).toEqual(["Paneer Block 200g"]);
  });

  test("short words only match at the START of a word: 'ch' is not 'Panchakarma'", async () => {
    const res = await run("ch");
    expect(res.names).toEqual(expect.arrayContaining(["Churna Digestive Powder", "Potato Chips Classic 50g", "Chocolate Cake"]));
    expect(res.names).not.toContain("Panchakarma Massage Oil");
  });

  test("a barcode finds exactly that product, first", async () => {
    const res = await run("8901262010011");
    expect(res.names[0]).toBe("Amul Butter Salted 500g");
  });

  test("case, spacing and punctuation don't matter", async () => {
    const plain = await run("amul butter");
    const messy = await run("  AMUL   (Butter)!! ");
    expect(messy.names.sort()).toEqual(plain.names.sort());
  });

  test("regex characters are literal: 'a.*' does not match the whole catalogue", async () => {
    const res = await run("a.*");
    expect(res.total).toBeLessThan(catalogue.length - hidden.length);
  });
});

describe("ranking", () => {
  test("a name that STARTS with the query beats one that merely contains it (both in stock)", async () => {
    const res = await run("butter");
    expect(res.names.indexOf("Butter Biscuits 100g")).toBeLessThan(res.names.indexOf("Britannia Butter Cookies 200g"));
  });

  test("in-stock results always come before out-of-stock ones - even when the unavailable one is a 'better' name match", async () => {
    const res = await run("butter");
    expect(res.names.length).toBe(5);
    // "Butter Naan" (out of stock) STARTS with 'butter' and would outscore "Amul Butter Unsalted"
    // on text alone; availability must still sink it to the bottom.
    expect(res.names[res.names.length - 1]).toBe("Butter Naan 4 pcs");
    expect(res.names.indexOf("Butter Naan 4 pcs")).toBeGreaterThan(res.names.indexOf("Amul Butter Unsalted 100g"));
  });

  test("...except an EXACT-name match, which stays on top even when out of stock", async () => {
    const res = await run("butter naan 4 pcs");
    expect(res.names[0]).toBe("Butter Naan 4 pcs");
  });

  test("the exact product name comes first", async () => {
    const res = await run("amul fresh milk 1l");
    expect(res.names[0]).toBe("Amul Fresh Milk 1L");
  });

  test("strict search returns only products containing EVERY word (not just some)", async () => {
    const res = await run("amul butter");
    expect(res.names.length).toBe(2); // not 'Amul Fresh Milk' (no butter) or 'Butter Biscuits' (no amul)
  });
});

describe("typo correction and fallbacks", () => {
  test("'chiken' is corrected to 'chicken' and says so", async () => {
    const res = await run("chiken");
    expect(res.meta).toMatchObject({ matchType: "corrected", correctedQuery: "chicken" });
    expect(res.names.sort()).toEqual(["Chicken Sausage 250g", "Fresh Chicken Breast Boneless 500g"]);
  });

  test("one typo among valid words: 'amul buter' -> 'amul butter'", async () => {
    const res = await run("amul buter");
    expect(res.meta.correctedQuery).toBe("amul butter");
    expect(res.names.sort()).toEqual(["Amul Butter Salted 500g", "Amul Butter Unsalted 100g"]);
  });

  test("a transposition is corrected: 'pnaeer' -> 'paneer'", async () => {
    const res = await run("paneeer");
    expect(res.names).toEqual(["Paneer Block 200g"]);
  });

  test("words that never occur together fall back to products matching ANY word, flagged 'related'", async () => {
    const res = await run("organic jam");
    expect(res.meta.matchType).toBe("related");
    expect(res.names).toEqual(["Organic Honey 500g"]);
  });

  test("a single word that matches nothing at all returns nothing", async () => {
    const res = await run("qqqqzzzz");
    expect(res).toMatchObject({ items: [], total: 0 });
    expect(res.meta.matchType).toBe("none");
  });

  test("junk input returns nothing rather than the whole catalogue", async () => {
    expect((await run("&&& !!!")).total).toBe(0);
  });
});

describe("safety: products a customer must never see", () => {
  const QUERIES = ["amul", "butter", "amul butter", "reliance", "garlic", "discontinued", "pending", "amul buter", "dairy", "a", "ch"];

  test.each(QUERIES)("'%s' never returns inactive, unapproved or out-of-area products", async (q) => {
    const res = await run(q);
    for (const item of res.items) {
      expect(hidden).not.toContain(String(item._id));
    }
  });

  test("searching a hidden product's exact name finds nothing", async () => {
    expect((await run("Amul Butter Discontinued")).names).not.toContain("Amul Butter Discontinued");
    expect((await run("Amul Butter Garlic")).names).not.toContain("Amul Butter Garlic (far away)");
  });
});

describe("pagination", () => {
  test("pages are consecutive and disjoint, and the total is stable", async () => {
    const all = await run("fresh", { limit: 50 });
    const p1 = await run("fresh", { limit: 2, page: 1 });
    const p2 = await run("fresh", { limit: 2, page: 2 });
    expect(p1.total).toBe(all.total);
    expect(p2.total).toBe(all.total);
    expect([...p1.names, ...p2.names]).toEqual(all.names.slice(0, 4));
  });
});
