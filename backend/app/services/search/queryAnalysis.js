/**
 * queryAnalysis.js - PURE text helpers for the customer product search.
 * No database access: tokenising, normalising, plural handling, typo correction and regex
 * building live here so they can be unit-tested in isolation (see productSearch.js for the
 * DB-facing engine that uses them).
 */

/** Longest search string we will process; anything beyond is ignored. */
export const MAX_QUERY_LENGTH = 80;
/** Most distinct words we will match on, so a pasted paragraph can't build a huge query. */
export const MAX_TOKENS = 6;
const MAX_TOKEN_LENGTH = 40;

/** Words that carry no search meaning. Dropped unless that would leave nothing to search. */
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "with", "in", "on", "to", "by", "me", "near",
]);

/**
 * Lower-case, strip Latin accents ("café" -> "cafe"), turn every other symbol into a space and
 * collapse whitespace. Letters and digits from ANY script are kept, so Devanagari etc. survive.
 */
export function normalizeText(value) {
  if (value == null) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining marks of Latin accents only (keeps Indic matras)
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ") // '&', '-', '.', quotes... become spaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split a raw search string into distinct, normalised words.
 * "Amul  Butter & Cheese!" -> ["amul", "butter", "cheese"]
 */
export function tokenize(raw) {
  const text = normalizeText(String(raw ?? "").slice(0, MAX_QUERY_LENGTH));
  if (!text) return [];

  const all = [];
  for (const word of text.split(" ")) {
    const t = word.slice(0, MAX_TOKEN_LENGTH);
    if (t && !all.includes(t)) all.push(t);
  }
  const meaningful = all.filter((t) => !STOP_WORDS.has(t));
  // "the" / "a" on their own are still a query - don't throw everything away.
  return (meaningful.length ? meaningful : all).slice(0, MAX_TOKENS);
}

/**
 * The token plus simple singular forms, so a plural query still finds the singular product:
 * "tomatoes" -> tomato, "berries" -> berry, "chips" -> chip. (The reverse already works because
 * matching is by substring: "tomato" is inside "tomatoes".)
 */
export function stemVariants(token) {
  const out = [token];
  const add = (v) => {
    if (v.length >= 3 && !out.includes(v)) out.push(v);
  };
  if (/^\d+$/.test(token)) return out; // numbers are never plurals

  if (token.length > 4 && token.endsWith("ies")) add(`${token.slice(0, -3)}y`);
  if (token.length > 4 && token.endsWith("es")) add(token.slice(0, -2));
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) add(token.slice(0, -1));
  return out;
}

export function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Regex SOURCE (usable as Mongo `$regex` with option "i", and as a JS RegExp) for one token.
 *  - 3+ characters: matches ANYWHERE in the value ("chick" finds "Chicken").
 *  - 1-2 characters: must start a WORD ("ch" finds "Chips" but not "Panchakarma"), because a
 *    two-letter substring would match half the catalogue and rank as noise.
 */
export function buildTokenRegexSource(token) {
  const alternatives = stemVariants(token).map(escapeRegex).join("|");
  if (token.length < 3) return `(?:^|[^a-z0-9])(?:${alternatives})`;
  return `(?:${alternatives})`;
}

// ── typo tolerance ───────────────────────────────────────────────────────────

/** How many single-character edits we allow for a word of this length. */
export function maxEditsFor(length) {
  if (length <= 3) return 0; // too short to correct safely ("cat" vs "car")
  if (length <= 5) return 1;
  return 2;
}

/**
 * Damerau-Levenshtein ("optimal string alignment") distance, abandoned early once it is certain
 * to exceed `max`. Counts a swap of two neighbours ("teh" vs "the") as ONE edit - a very common
 * way to mistype - alongside the usual insert / delete / substitute. Returns max + 1 when over
 * the limit.
 */
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb <= max ? lb : max + 1;
  if (lb === 0) return la <= max ? la : max + 1;

  let prevPrev = new Array(lb + 1).fill(0);
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  let curr = new Array(lb + 1).fill(0);

  for (let i = 1; i <= la; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= lb; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prevPrev[j - 2] + 1);
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1; // every path already exceeds the budget
    [prevPrev, prev, curr] = [prev, curr, prevPrev];
  }
  return prev[lb] <= max ? prev[lb] : max + 1;
}

/**
 * Build a vocabulary from raw catalogue strings: word -> how often it appears. Frequency lets a
 * correction prefer the word the catalogue actually uses most ("paneer" over a one-off typo).
 */
export function buildVocabulary(strings, { maxWords = 60000 } = {}) {
  const freq = new Map();
  for (const s of strings) {
    for (const w of normalizeText(s).split(" ")) {
      if (w.length < 3 || w.length > 30) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }
  if (freq.size <= maxWords) return freq;
  // Keep the most common words if the catalogue is enormous.
  return new Map([...freq.entries()].sort((x, y) => y[1] - x[1]).slice(0, maxWords));
}

/** Does any catalogue word contain this token (or its singular form)? Then it is not a typo. */
export function isKnownToken(token, vocabulary) {
  const variants = stemVariants(token);
  for (const word of vocabulary.keys()) {
    for (const v of variants) {
      if (word.includes(v)) return true;
    }
  }
  return false;
}

/**
 * Best catalogue word for a (probably mistyped) token, or null. Fewest edits wins, then the most
 * frequent word. Two-edit corrections must keep the first letter (people rarely get that wrong,
 * and it prevents wild matches).
 */
export function suggestCorrection(token, vocabulary) {
  if (/^\d+$/.test(token)) return null;
  const max = maxEditsFor(token.length);
  if (max === 0) return null;

  let best = null;
  let bestDist = max + 1;
  let bestFreq = -1;
  for (const [word, freq] of vocabulary) {
    if (Math.abs(word.length - token.length) > max) continue;
    const d = editDistance(token, word, max);
    if (d > max || d === 0) continue;
    if (d >= 2 && word[0] !== token[0]) continue;
    if (d < bestDist || (d === bestDist && freq > bestFreq)) {
      best = word;
      bestDist = d;
      bestFreq = freq;
    }
  }
  return best;
}

/**
 * Replace tokens that look mistyped with the nearest real catalogue word. Tokens that already
 * occur in the catalogue (even as part of a longer word) are left exactly as typed.
 * @returns {{ tokens: string[], changed: boolean, changes: Array<{from: string, to: string}> }}
 */
export function correctTokens(tokens, vocabulary) {
  const changes = [];
  const out = tokens.map((token) => {
    if (isKnownToken(token, vocabulary)) return token;
    const fix = suggestCorrection(token, vocabulary);
    if (fix && fix !== token) {
      changes.push({ from: token, to: fix });
      return fix;
    }
    return token;
  });
  return { tokens: out, changed: changes.length > 0, changes };
}
