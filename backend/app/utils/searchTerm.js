/**
 * searchTerm.js - one safe way for list endpoints to turn a `?search=` query param into a
 * MongoDB filter. Every admin / seller search handler should use this instead of building a
 * regex from raw input.
 *
 * Why it exists - problems found across the panels:
 *  - `new RegExp(search)` / `{ $regex: search }` on raw input: a search for "(" or "[" threw a
 *    500, "(a+)+$" is a catastrophic-backtracking (ReDoS) pattern, and "a.*" matched everything.
 *  - Express/qs turns `?search=a&search=b` into an ARRAY and `?search[$ne]=x` into an OBJECT, so
 *    `search.trim()` crashed (and an object could even be treated as a Mongo operator).
 *  - A handler that set `query.$or = [search...]` after another filter had already set `$or`
 *    (or before one did) silently DROPPED one of them - e.g. coupons filtered "expired" lost the
 *    expiry filter as soon as you typed a search.
 */

/** Longest search string any list endpoint will act on. */
export const MAX_SEARCH_LENGTH = 100;

/** Escape every regex metacharacter so user text is always matched literally. */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Coerce a raw query-string value into a clean search string, or "" if there is none.
 * Accepts a string/number; takes the first string of an array; ignores objects entirely
 * (`?search[$ne]=x` must never reach the database layer).
 */
export function parseSearchTerm(value, maxLength = MAX_SEARCH_LENGTH) {
  let v = value;
  if (Array.isArray(v)) v = v.find((x) => typeof x === "string" || typeof x === "number");
  if (typeof v === "number" && Number.isFinite(v)) v = String(v);
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * Case-insensitive, literal-match RegExp for a search term (or null when the term is empty).
 * A RegExp OBJECT is used (not a `$regex` string) so it works both in `find()` filters and in
 * `$match` pipeline stages.
 */
export function searchRegex(rawTerm) {
  const term = parseSearchTerm(rawTerm);
  return term ? new RegExp(escapeRegex(term), "i") : null;
}

/**
 * `{ $or: [{field: rx}, ...] }` matching the term in ANY of `fields`, or null if there is no
 * term. Extra clauses (e.g. an id lookup) can be passed in `extra`.
 */
export function anyFieldMatch(fields, rawTerm, extra = []) {
  const rx = searchRegex(rawTerm);
  if (!rx) return null;
  return { $or: [...fields.map((f) => ({ [f]: rx })), ...extra] };
}

/**
 * Add `clause` to `query` WITHOUT clobbering what is already there. Always goes through `$and`,
 * so two `$or` conditions (a status filter and a search, say) both apply.
 * Returns `query` for chaining. A null/empty clause is a no-op.
 */
export function andInto(query, clause) {
  if (!clause || (typeof clause === "object" && Object.keys(clause).length === 0)) return query;
  if (!Array.isArray(query.$and)) query.$and = [];
  query.$and.push(clause);
  return query;
}

/** A plain string from a query value for exact-match filters (status, type...), or "". */
export function parseStringParam(value, maxLength = 60) {
  return parseSearchTerm(value, maxLength);
}

/** True for a 24-char hex string (a Mongo ObjectId), e.g. when someone pastes an id into search. */
export function looksLikeObjectId(value) {
  return typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
}
