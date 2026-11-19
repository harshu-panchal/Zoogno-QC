/**
 * productSearch.js - the customer app's product search engine ("wild search").
 *
 * What it does that a single regex cannot
 * ───────────────────────────────────────
 *  1. Every WORD of the query must match somewhere, in any order, in ANY of: name, brand, tags,
 *     variant names, weight, SKU / UPC / HSN, description, the product's category / subcategory /
 *     header NAMES, or the SELLER's shop name.  "amul butter", "butter amul" and "butter 500g"
 *     all work; "amul butter" finds Amul's butter even when "Amul" is only in the brand.
 *  2. Results are RANKED by relevance (exact / starts-with name > whole-word > brand > tag >
 *     category > seller; in-stock first) instead of simply newest-first.
 *  3. Typos are corrected ("chiken" -> "chicken") against the real catalogue vocabulary - but
 *     only when the exact search finds nothing, so valid queries are never "corrected".
 *  4. If still nothing and the query has several words, it falls back to products matching ANY
 *     word and says so, rather than showing an empty page.
 *
 * Used for customer requests only; admin / seller product lists keep their existing matching.
 */

import Product from "../../models/product.js";
import Category from "../../models/category.js";
import Seller from "../../models/seller.js";
import logger from "../logger.js";
import {
  MAX_QUERY_LENGTH,
  tokenize,
  normalizeText,
  stemVariants,
  escapeRegex,
  buildTokenRegexSource,
  buildVocabulary,
  correctTokens,
} from "./queryAnalysis.js";

/** Most matching products ranked in memory per search (a lightweight projection, so cheap). */
const CANDIDATE_CAP = parseInt(process.env.SEARCH_CANDIDATE_CAP || "2000", 10);
const FUZZY_ENABLED = process.env.SEARCH_FUZZY_ENABLED !== "false";
const VOCAB_TTL_MS = parseInt(process.env.SEARCH_VOCAB_TTL_MS || String(10 * 60 * 1000), 10);
const VOCAB_RETRY_MS = 60 * 1000;

/** Only what ranking needs - kept small so thousands of candidates stay cheap. */
const RANK_FIELDS =
  "name brand tags sku upcNumber weight variants.name categoryId subcategoryId headerId sellerId stock isOutOfStock ratingAverage ratingCount createdAt";

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue vocabulary (for typo correction)
// ─────────────────────────────────────────────────────────────────────────────

const vocabCache = { vocabulary: null, builtAt: 0, failedAt: 0, loading: null };

export function resetVocabularyCache() {
  vocabCache.vocabulary = null;
  vocabCache.builtAt = 0;
  vocabCache.failedAt = 0;
  vocabCache.loading = null;
}

/**
 * Words used across product names, brands, tags, category names and shop names. Cached and
 * refreshed in the background window; one rebuild at a time. Returns null if it cannot be built
 * (typo correction is then simply skipped - search itself is unaffected).
 */
async function getVocabulary() {
  const now = Date.now();
  if (vocabCache.vocabulary && now - vocabCache.builtAt < VOCAB_TTL_MS) return vocabCache.vocabulary;
  // A recent failure: don't hammer the database, reuse whatever we had (possibly nothing).
  if (vocabCache.failedAt && now - vocabCache.failedAt < VOCAB_RETRY_MS) return vocabCache.vocabulary;

  if (!vocabCache.loading) {
    vocabCache.loading = (async () => {
      try {
        const [names, brands, tags, categories, shops] = await Promise.all([
          Product.distinct("name", { status: "active" }),
          Product.distinct("brand", { status: "active" }),
          Product.distinct("tags", { status: "active" }),
          Category.distinct("name", { status: "active" }),
          Seller.distinct("shopName", { isActive: true, isVerified: true }),
        ]);
        vocabCache.vocabulary = buildVocabulary([...names, ...brands, ...tags, ...categories, ...shops]);
        vocabCache.builtAt = Date.now();
        vocabCache.failedAt = 0;
      } catch (err) {
        vocabCache.failedAt = Date.now();
        logger.warn("Search vocabulary build failed - typo correction paused", {
          scope: "SEARCH",
          error: err.message,
        });
      } finally {
        vocabCache.loading = null;
      }
      return vocabCache.vocabulary;
    })();
  }
  return vocabCache.loading;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For each token, the categories whose NAME contains it and the (in-scope) sellers whose SHOP NAME
 * contains it. This is what lets "dairy" find products by their category and "reliance" find a
 * shop's products. Tokens under 3 characters never match entity names (far too broad).
 */
async function resolveEntityMatches(tokens, sellerScopeIds) {
  const result = new Map(tokens.map((t) => [t, { categoryIds: [], sellerIds: [] }]));
  const usable = tokens.filter((t) => t.length >= 3);
  if (!usable.length) return result;

  const variantsByToken = new Map(usable.map((t) => [t, stemVariants(t)]));
  const source = [...new Set([...variantsByToken.values()].flat())]
    .filter((v) => v.length >= 3)
    .map(escapeRegex)
    .join("|");
  const rx = { $regex: source, $options: "i" };

  // A customer only sees sellers that serve them, so shop-name matching is confined to that set.
  const sellerScope =
    Array.isArray(sellerScopeIds) && sellerScopeIds.length
      ? { _id: { $in: sellerScopeIds } }
      : { isActive: true, isVerified: true };

  const [categories, sellers] = await Promise.all([
    Category.find({ name: rx, status: "active" }).select("_id name").limit(200).lean(),
    Seller.find({ ...sellerScope, shopName: rx }).select("_id shopName").limit(200).lean(),
  ]);

  for (const token of usable) {
    const variants = variantsByToken.get(token);
    const hasToken = (name) => {
      const n = normalizeText(name);
      return variants.some((v) => n.includes(v));
    };
    result.set(token, {
      categoryIds: categories.filter((c) => hasToken(c.name)).map((c) => c._id),
      sellerIds: sellers.filter((s) => hasToken(s.shopName)).map((s) => s._id),
    });
  }
  return result;
}

/**
 * Mongo clause satisfied when ONE token matches ANY searchable field of a product.
 * Exported for tests.
 */
export function buildTokenClause(token, matches) {
  const rx = { $regex: buildTokenRegexSource(token), $options: "i" };
  const or = [{ name: rx }, { brand: rx }, { tags: rx }, { "variants.name": rx }, { weight: rx }];
  // Codes and prose are only searched for real words: "ch" must not light up every SKU.
  if (token.length >= 3) or.push({ sku: rx }, { upcNumber: rx }, { hsnCode: rx });
  if (token.length >= 4) or.push({ description: rx });

  const categoryIds = matches?.categoryIds || [];
  if (categoryIds.length) {
    or.push(
      { categoryId: { $in: categoryIds } },
      { subcategoryId: { $in: categoryIds } },
      { headerId: { $in: categoryIds } },
    );
  }
  const sellerIds = matches?.sellerIds || [];
  if (sellerIds.length) or.push({ sellerId: { $in: sellerIds } });
  return { $or: or };
}

// ─────────────────────────────────────────────────────────────────────────────
// Relevance scoring
// ─────────────────────────────────────────────────────────────────────────────

const idIn = (list, id) => !!id && Array.isArray(list) && list.some((x) => String(x) === String(id));

/**
 * Score one product for the given tokens. Higher is better. Exported for tests.
 * @returns {{ score: number, matched: number, inStock: boolean, exactName: boolean }}
 *   `matched` = how many query words hit anything; `inStock` / `exactName` drive the
 *   availability tier in byRelevance().
 */
export function scoreProduct(product, { tokens, phrase, matches }) {
  const name = normalizeText(product.name);
  const nameWords = name ? name.split(" ") : [];
  const brand = normalizeText(product.brand);
  const tags = (product.tags || []).map(normalizeText);
  const variantNames = (product.variants || []).map((v) => normalizeText(v?.name));
  const weight = normalizeText(product.weight);
  const sku = normalizeText(product.sku);
  const upc = normalizeText(product.upcNumber);

  let score = 0;
  let matched = 0;
  let nameHits = 0;

  for (const token of tokens) {
    const variants = stemVariants(token);
    const has = (text) => !!text && variants.some((v) => text.includes(v));
    let hit = false;

    if (nameWords.some((w) => variants.includes(w))) {
      score += 120; // a whole word of the name
      nameHits += 1;
      hit = true;
    } else if (nameWords.some((w) => variants.some((v) => w.startsWith(v)))) {
      score += 90; // the start of a word ("chick" -> "chicken")
      nameHits += 1;
      hit = true;
    } else if (has(name)) {
      score += 50; // somewhere inside a word
      nameHits += 1;
      hit = true;
    }
    if (has(brand)) { score += 45; hit = true; }
    if (tags.some(has)) { score += 35; hit = true; }
    if (variantNames.some(has)) { score += 20; hit = true; }
    if (has(weight)) { score += 10; hit = true; }

    const m = matches?.get(token);
    if (m) {
      if (idIn(m.categoryIds, product.subcategoryId)) { score += 35; hit = true; }
      if (idIn(m.categoryIds, product.categoryId)) { score += 30; hit = true; }
      if (idIn(m.categoryIds, product.headerId)) { score += 10; hit = true; }
      if (idIn(m.sellerIds, product.sellerId)) { score += 25; hit = true; }
    }

    // Scanning / typing a barcode or SKU: an exact code match beats everything else.
    if (/^[a-z0-9-]{4,}$/.test(token) && (sku === token || upc === token)) {
      score += 400;
      hit = true;
    } else if (has(sku) || has(upc)) {
      score += 15;
      hit = true;
    }

    if (hit) matched += 1;
  }

  const exactName = !!name && name === phrase; // typed the product's exact name
  if (name && phrase) {
    if (exactName) score += 1000;
    else if (name.startsWith(phrase)) score += 300;
    else if (name.includes(phrase)) score += 150; // the words appear together, in order
  }
  if (tokens.length > 1 && nameHits === tokens.length) score += 100; // every word is in the name

  score += matched * 200; // matters in the "any word" fallback: more words matched ranks higher
  const inStock = !product.isOutOfStock && Number(product.stock) > 0;
  score += inStock ? 20 : -40; // within a tier, availability still nudges the order
  score += (Number(product.ratingAverage) || 0) * 2 + Math.log1p(Number(product.ratingCount) || 0);

  return { score, matched, inStock, exactName };
}

/**
 * Availability is a TIER, not just a score: in-stock results always come before out-of-stock
 * ones (a high-relevance item the customer cannot buy must not bury ones they can). The one
 * exception is an exact-name match, which stays on top even when out of stock - the customer
 * plainly wants that item and the app shows it as unavailable.
 */
function byRelevance(a, b) {
  const tier = (r) => (r.inStock || r.exactName ? 0 : 1);
  if (tier(a) !== tier(b)) return tier(a) - tier(b);
  if (b.score !== a.score) return b.score - a.score;
  const ta = a.p.createdAt ? new Date(a.p.createdAt).getTime() : 0;
  const tb = b.p.createdAt ? new Date(b.p.createdAt).getTime() : 0;
  if (tb !== ta) return tb - ta;
  return String(b.p._id).localeCompare(String(a.p._id));
}

// ─────────────────────────────────────────────────────────────────────────────
// The engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run one search pass for a fixed set of tokens.
 * mode "all": every token must match. mode "any": at least one token must match.
 */
async function runPass({ tokens, mode, baseFilter, sellerScopeIds, select, skip, limit, sortQuery, relevance }) {
  const matches = await resolveEntityMatches(tokens, sellerScopeIds);
  const clauses = tokens.map((t) => buildTokenClause(t, matches.get(t)));
  const filter = { $and: [baseFilter, mode === "all" ? { $and: clauses } : { $or: clauses }] };

  // An explicit sort (price, name...) is the customer's choice: let the database order and page.
  if (!relevance) {
    const [items, total] = await Promise.all([
      Product.find(filter).select(select).sort(sortQuery).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    return { items, total };
  }

  // Relevance: rank a lightweight candidate set in memory, then load full documents for just
  // the requested page - so ranking is exact without pulling thousands of full products.
  const candidates = await Product.find(filter).select(RANK_FIELDS).limit(CANDIDATE_CAP).lean();
  if (!candidates.length) return { items: [], total: 0 };

  const phrase = tokens.join(" ");
  const ranked = candidates
    .map((p) => ({ p, ...scoreProduct(p, { tokens, phrase, matches }) }))
    .sort(byRelevance);
  const total = candidates.length < CANDIDATE_CAP ? candidates.length : await Product.countDocuments(filter);

  const pageIds = ranked.slice(skip, skip + limit).map((r) => r.p._id);
  if (!pageIds.length) return { items: [], total };

  const docs = await Product.find({ _id: { $in: pageIds } }).select(select).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const items = pageIds.map((id) => byId.get(String(id))).filter(Boolean);
  return { items, total };
}

/**
 * Search products for the customer app.
 *
 * @param {object} args
 * @param {string} args.rawQuery        what the customer typed
 * @param {object} args.baseFilter      everything EXCEPT the text match: status, approval, location /
 *                                      seller scope, category, price, stock ... (already built by the caller)
 * @param {Array}  [args.sellerScopeIds] sellers that serve this customer (for shop-name matching)
 * @param {string} args.select          fields to return for the page
 * @param {number} [args.page]
 * @param {number} [args.limit]
 * @param {object} [args.sortQuery]     DB sort, used only when `relevance` is false
 * @param {boolean} [args.relevance]    true = rank by relevance; false = honour `sortQuery`
 * @returns {Promise<null | { items: object[], total: number, meta: object }>} null when there is no query
 */
export async function searchCustomerProducts({
  rawQuery,
  baseFilter,
  sellerScopeIds = null,
  select,
  page = 1,
  limit = 24,
  sortQuery = null,
  relevance = true,
}) {
  if (!rawQuery || !String(rawQuery).trim()) return null;

  const tokens = tokenize(rawQuery);
  const meta = {
    query: String(rawQuery).trim().slice(0, MAX_QUERY_LENGTH),
    tokens,
    matchType: "exact",
  };
  // Something was typed but there's nothing searchable in it ("&&", "!!!"): an empty result,
  // NOT "no filter" - that would list the whole catalogue.
  if (!tokens.length) return { items: [], total: 0, meta: { ...meta, matchType: "none" } };

  const skip = (Math.max(1, page) - 1) * limit;
  const pass = (passTokens, mode) =>
    runPass({ tokens: passTokens, mode, baseFilter, sellerScopeIds, select, skip, limit, sortQuery, relevance });

  // 1. Strict: every word must match somewhere.
  let result = await pass(tokens, "all");
  if (result.total > 0) return { ...result, meta };

  // 2. Typo correction against the real catalogue vocabulary.
  let fallbackTokens = tokens;
  if (FUZZY_ENABLED) {
    const vocabulary = await getVocabulary();
    if (vocabulary && vocabulary.size) {
      const fixed = correctTokens(tokens, vocabulary);
      if (fixed.changed) {
        fallbackTokens = fixed.tokens;
        result = await pass(fixed.tokens, "all");
        if (result.total > 0) {
          return {
            ...result,
            meta: {
              ...meta,
              tokens: fixed.tokens,
              matchType: "corrected",
              correctedQuery: fixed.tokens.join(" "),
              corrections: fixed.changes,
            },
          };
        }
      }
    }
  }

  // 3. Several words and no product has them all: show products matching ANY of them
  //    (best matches first), clearly marked as related rather than exact.
  if (fallbackTokens.length > 1) {
    result = await pass(fallbackTokens, "any");
    if (result.total > 0) {
      return { ...result, meta: { ...meta, tokens: fallbackTokens, matchType: "related" } };
    }
  }

  return { items: [], total: 0, meta: { ...meta, matchType: "none" } };
}
