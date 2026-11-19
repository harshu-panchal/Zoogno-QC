/**
 * A tiny in-memory stand-in for a Mongoose model, backed by `sift` (a JS implementation of
 * Mongo's query operators). It lets controller / service tests run the REAL filters a handler
 * builds against fixture rows and assert on which rows come back - instead of only checking the
 * shape of the query.
 *
 * Queries are chainable AND awaitable (like Mongoose): `await Model.find(f).sort(s).skip(n)`
 * works without `.lean()`.
 */
import mongoose from "mongoose";

const siftModule = await import("sift");
export const sift = [siftModule.default?.default, siftModule.default, siftModule].find(
  (f) => typeof f === "function",
);

export const oid = () => new mongoose.Types.ObjectId();

// Rows behave like Mongoose documents: handlers call `doc.toObject()` on them.
const clone = (d) => {
  const c = { ...d };
  Object.defineProperty(c, "toObject", { value: () => ({ ...d }), enumerable: false });
  return c;
};

/**
 * sift cannot evaluate `$expr`, but the ticket search legitimately uses
 *   { $expr: { $regexMatch: { input: { $toString: "$_id" }, regex, options } } }
 * (real MongoDB supports it). Translate that one shape into an equivalent `$where` so such
 * filters can run here; anything else passes through unchanged.
 */
export function translateFilter(filter) {
  if (Array.isArray(filter)) return filter.map(translateFilter);
  if (!filter || typeof filter !== "object" || filter instanceof RegExp || filter instanceof Date) return filter;
  if (filter._bsontype) return filter; // ObjectId
  const out = {};
  for (const [k, v] of Object.entries(filter)) {
    if (k === "$expr" && v?.$regexMatch?.input?.$toString === "$_id") {
      const { regex, options } = v.$regexMatch;
      const rx = new RegExp(regex, options);
      out.$where = function () { return rx.test(String(this._id)); };
    } else {
      out[k] = translateFilter(v);
    }
  }
  return out;
}

export function queryOver(rows, filter = {}) {
  let out = rows.filter(sift(translateFilter(filter || {})));
  let sortSpec = null;
  let skipN = 0;
  let limitN = Infinity;
  const run = async () => {
    let res = out;
    if (sortSpec) {
      const [[field, dir]] = Object.entries(sortSpec);
      res = [...res].sort((a, b) => (a[field] > b[field] ? dir : a[field] < b[field] ? -dir : 0));
    }
    return res.slice(skipN, skipN + limitN).map(clone);
  };
  const q = {
    select: () => q,
    populate: () => q,
    sort: (s) => { sortSpec = s; return q; },
    skip: (n) => { skipN = Number(n) || 0; return q; },
    limit: (n) => { limitN = Number(n) || Infinity; return q; },
    lean: () => run(),
    then: (resolve, reject) => run().then(resolve, reject),
  };
  return q;
}

/** `rowsOrFn` may be an array or a function returning one (so tests can swap fixtures). */
export function fakeModel(rowsOrFn) {
  const rows = () => (typeof rowsOrFn === "function" ? rowsOrFn() : rowsOrFn);
  return {
    find: (filter) => queryOver(rows(), filter),
    findOne: (filter) => {
      const r = rows().find(sift(translateFilter(filter || {})));
      const q = { select: () => q, populate: () => q, lean: async () => (r ? clone(r) : null), then: (a, b) => q.lean().then(a, b) };
      return q;
    },
    countDocuments: async (filter) => rows().filter(sift(translateFilter(filter || {}))).length,
  };
}

/** Minimal Express `res` that records what a handler sent. */
export function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { res.statusCode = code; return res; },
    json(payload) { res.body = payload; return res; },
  };
  return res;
}
