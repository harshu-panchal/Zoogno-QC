import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  MAX_SEARCH_LENGTH,
  escapeRegex,
  parseSearchTerm,
  searchRegex,
  anyFieldMatch,
  andInto,
  parseStringParam,
  looksLikeObjectId,
} from "../app/utils/searchTerm.js";

describe("parseSearchTerm", () => {
  test("trims, collapses whitespace and returns a string", () => {
    expect(parseSearchTerm("  amul   butter \n")).toBe("amul butter");
    expect(parseSearchTerm("abc")).toBe("abc");
  });

  test("a number is accepted as its text", () => {
    expect(parseSearchTerm(9876543210)).toBe("9876543210");
  });

  test("?search=a&search=b (an ARRAY) takes the first usable string instead of crashing", () => {
    expect(parseSearchTerm(["first", "second"])).toBe("first");
    expect(parseSearchTerm([{ x: 1 }, "ok"])).toBe("ok");
  });

  test("?search[$ne]=x (an OBJECT) is ignored - an operator must never reach the database", () => {
    expect(parseSearchTerm({ $ne: "x" })).toBe("");
    expect(parseSearchTerm({ $regex: ".*" })).toBe("");
  });

  test("empty / missing values give an empty term", () => {
    for (const v of [undefined, null, "", "   ", [], NaN, true, () => 1]) {
      expect(parseSearchTerm(v)).toBe("");
    }
  });

  test("a very long term is cut to a safe length", () => {
    expect(parseSearchTerm("x".repeat(5000)).length).toBe(MAX_SEARCH_LENGTH);
    expect(parseSearchTerm("abcdef", 3)).toBe("abc");
  });
});

describe("escapeRegex / searchRegex", () => {
  test("every metacharacter is escaped", () => {
    expect(escapeRegex(".*+?^${}()|[]\\")).toBe("\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
  });

  test("hostile input never throws and is matched literally", () => {
    for (const evil of ["(", "[", "(a+)+$", "*", "\\", "a{1,", "(?<=x)", ")", "?", "+"]) {
      const rx = searchRegex(evil);
      expect(rx).toBeInstanceOf(RegExp);
      expect(rx.test(evil)).toBe(true); // finds the literal text
    }
  });

  test("'.*' matches only the literal characters, not everything", () => {
    const rx = searchRegex(".*");
    expect(rx.test("anything at all")).toBe(false);
    expect(rx.test("has .* inside")).toBe(true);
  });

  test("a catastrophic-backtracking pattern is harmless (literal, linear)", () => {
    const rx = searchRegex("(a+)+$");
    const start = Date.now();
    expect(rx.test("a".repeat(40) + "!")).toBe(false);
    expect(Date.now() - start).toBeLessThan(200);
  });

  test("case-insensitive; null for no term", () => {
    expect(searchRegex("AmUl").test("amul butter")).toBe(true);
    expect(searchRegex("")).toBeNull();
    expect(searchRegex({ $ne: 1 })).toBeNull();
  });
});

describe("anyFieldMatch", () => {
  test("builds an $or across the fields", () => {
    const clause = anyFieldMatch(["name", "phone"], "98");
    expect(clause.$or).toHaveLength(2);
    expect(clause.$or[0].name).toBeInstanceOf(RegExp);
    expect(clause.$or[1].phone.source).toBe("98");
  });

  test("appends extra clauses (e.g. an id lookup)", () => {
    const clause = anyFieldMatch(["name"], "x", [{ user: { $in: [1] } }]);
    expect(clause.$or).toHaveLength(2);
    expect(clause.$or[1]).toEqual({ user: { $in: [1] } });
  });

  test("no term -> null, so callers add nothing (rather than matching everything or nothing)", () => {
    expect(anyFieldMatch(["name"], "")).toBeNull();
    expect(anyFieldMatch(["name"], undefined)).toBeNull();
    expect(anyFieldMatch(["name"], { $ne: "x" })).toBeNull();
  });
});

describe("andInto - never clobbers an existing condition", () => {
  test("two $or conditions BOTH survive", () => {
    const query = { $or: [{ a: 1 }, { b: 2 }] }; // e.g. a status filter
    andInto(query, { $or: [{ c: 3 }] }); // e.g. the search
    expect(query.$or).toEqual([{ a: 1 }, { b: 2 }]); // untouched
    expect(query.$and).toEqual([{ $or: [{ c: 3 }] }]); // added alongside
  });

  test("keeps accumulating into $and", () => {
    const q = {};
    andInto(q, { x: 1 });
    andInto(q, { y: 2 });
    expect(q.$and).toEqual([{ x: 1 }, { y: 2 }]);
  });

  test("null / empty clauses are no-ops and the query is returned for chaining", () => {
    const q = { a: 1 };
    expect(andInto(q, null)).toBe(q);
    andInto(q, undefined);
    andInto(q, {});
    expect(q).toEqual({ a: 1 });
  });
});

describe("small helpers", () => {
  test("parseStringParam coerces exact-match filters safely", () => {
    expect(parseStringParam(" Pending ")).toBe("Pending");
    expect(parseStringParam({ $gt: "" })).toBe("");
    expect(parseStringParam(["a"])).toBe("a");
  });

  test("looksLikeObjectId", () => {
    expect(looksLikeObjectId("507f1f77bcf86cd799439011")).toBe(true);
    expect(looksLikeObjectId("507f1f77bcf86cd79943901")).toBe(false);
    expect(looksLikeObjectId("zzzf1f77bcf86cd799439011")).toBe(false);
    expect(looksLikeObjectId(123)).toBe(false);
  });
});

/**
 * Regression net for the whole backend: the unsafe patterns this audit removed must not come back.
 * (Heuristic by design - it greps source - but it fails loudly the moment someone writes
 * `new RegExp(search)` or `{ $regex: term }` on raw user input again.)
 */
describe("source guard: no raw user input in regexes", () => {
  const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app");

  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return p.endsWith(".js") ? [p] : [];
    });
  }

  const files = walk(appDir).filter((f) => !f.includes(`${path.sep}search${path.sep}`));
  // A user-supplied-looking identifier going straight into a regex...
  const UNSAFE = [
    /new RegExp\(\s*(search|searchTerm|term|q|keyword|query)\b/,
    /\$regex:\s*(search|searchTerm|term|q|keyword)\b[^.]/,
    /\$regex:\s*req\.query/,
    /new RegExp\(\s*req\.(query|body|params)/,
    // ...and `.trim()` on something that may be an array/object (crashes on ?search=a&search=b)
    /\bsearch\.trim\(\)/,
  ];
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  test.each(UNSAFE.map((r) => [String(r), r]))("no handler matches %s", (_label, rx) => {
    const offenders = [];
    for (const f of files) {
      const src = stripComments(fs.readFileSync(f, "utf8"));
      if (rx.test(src)) offenders.push(path.relative(appDir, f));
    }
    expect(offenders).toEqual([]);
  });
});
