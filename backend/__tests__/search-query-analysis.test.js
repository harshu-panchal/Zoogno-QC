import {
  MAX_QUERY_LENGTH,
  MAX_TOKENS,
  normalizeText,
  tokenize,
  stemVariants,
  escapeRegex,
  buildTokenRegexSource,
  maxEditsFor,
  editDistance,
  buildVocabulary,
  isKnownToken,
  suggestCorrection,
  correctTokens,
} from "../app/services/search/queryAnalysis.js";

describe("normalizeText", () => {
  test("lower-cases, strips Latin accents, and turns symbols into spaces", () => {
    expect(normalizeText("Café  Déjà-Vu & Sons!")).toBe("cafe deja vu sons");
    expect(normalizeText("  AMUL   Butter ")).toBe("amul butter");
    expect(normalizeText("Dal/Rice (500g)")).toBe("dal rice 500g");
  });

  test("keeps text in other scripts intact (Devanagari vowel signs survive)", () => {
    expect(normalizeText("दूध")).toBe("दूध");
    expect(normalizeText("Amul दूध 1L")).toBe("amul दूध 1l");
  });

  test("tolerates null / non-strings", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
    expect(normalizeText(42)).toBe("42");
  });
});

describe("tokenize", () => {
  test("splits into distinct normalised words in typed order", () => {
    expect(tokenize("Amul  Butter & Cheese!")).toEqual(["amul", "butter", "cheese"]);
    expect(tokenize("milk milk MILK")).toEqual(["milk"]);
  });

  test("drops stop-words, but never leaves an empty query", () => {
    expect(tokenize("salt and pepper")).toEqual(["salt", "pepper"]);
    expect(tokenize("bread for the kids")).toEqual(["bread", "kids"]);
    expect(tokenize("the")).toEqual(["the"]); // only stop-words typed: still a query
  });

  test("an empty or symbol-only query has no tokens", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
    expect(tokenize("&&& !!!")).toEqual([]);
    expect(tokenize(null)).toEqual([]);
  });

  test("bounds the work a hostile or pasted query can cause", () => {
    const many = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    expect(tokenize(many).length).toBeLessThanOrEqual(MAX_TOKENS);
    expect(tokenize("x".repeat(500))[0].length).toBeLessThanOrEqual(40);
    // text beyond MAX_QUERY_LENGTH is ignored entirely
    expect(tokenize(`${"a".repeat(MAX_QUERY_LENGTH)} secretword`)).not.toContain("secretword");
  });
});

describe("stemVariants (plural queries find singular products)", () => {
  test.each([
    ["tomatoes", "tomato"],
    ["berries", "berry"],
    ["chips", "chip"],
    ["eggs", "egg"],
    ["biscuits", "biscuit"],
  ])("%s also tries %s", (plural, singular) => {
    const v = stemVariants(plural);
    expect(v[0]).toBe(plural);
    expect(v).toContain(singular);
  });

  test("leaves words that are not plurals alone", () => {
    expect(stemVariants("rice")).toEqual(["rice"]);
    expect(stemVariants("glass")).toEqual(["glass"]); // 'ss' is not a plural
    expect(stemVariants("gas")).toEqual(["gas"]); // too short to stem
    expect(stemVariants("500")).toEqual(["500"]); // numbers are never plurals
  });
});

describe("buildTokenRegexSource", () => {
  const matches = (token, text) => new RegExp(buildTokenRegexSource(token), "i").test(text);

  test("3+ characters match anywhere in the value ('wild' substring)", () => {
    expect(matches("chick", "Chicken Breast 500g")).toBe(true);
    expect(matches("utter", "Amul Butter")).toBe(true);
    expect(matches("mul", "Amul Butter")).toBe(true);
    expect(matches("milk", "Soya Chaap")).toBe(false);
  });

  test("a plural query matches the singular product", () => {
    expect(matches("tomatoes", "Fresh Tomato 1kg")).toBe(true);
    expect(matches("chips", "Potato Chip Classic")).toBe(true);
  });

  test("1-2 character tokens only match at the START of a word, to avoid noise", () => {
    expect(matches("ch", "Chips")).toBe(true);
    expect(matches("ch", "Dairy Chocolate")).toBe(true); // start of the 2nd word
    expect(matches("ch", "Panchakarma")).toBe(false); // buried mid-word
    expect(matches("5", "Pack of 5")).toBe(true);
    expect(matches("5", "Vitamin B12")).toBe(false);
  });

  test("regex metacharacters in a token are literal, never executable", () => {
    expect(escapeRegex("a.b*c(d)[e]+?^$|\\")).toBe("a\\.b\\*c\\(d\\)\\[e\\]\\+\\?\\^\\$\\|\\\\");
    const evil = buildTokenRegexSource("(a+)+$");
    expect(() => new RegExp(evil, "i")).not.toThrow();
    expect(new RegExp(evil, "i").test("aaaaaaaaaaaaaaaaaaaaaaaa!")).toBe(false);
  });
});

describe("editDistance", () => {
  test("counts insert, delete and substitute as one edit each", () => {
    expect(editDistance("paneer", "paneer")).toBe(0);
    expect(editDistance("panner", "paneer")).toBe(1); // substitute
    expect(editDistance("chiken", "chicken")).toBe(1); // insert
    expect(editDistance("chickken", "chicken")).toBe(1); // delete
    expect(editDistance("kitten", "sitting", 3)).toBe(3);
  });

  test("an adjacent swap is ONE edit (a very common typo)", () => {
    expect(editDistance("teh", "the")).toBe(1);
    expect(editDistance("buttre", "butter")).toBe(1);
  });

  test("returns max+1 once the distance is certain to exceed the limit", () => {
    expect(editDistance("apple", "orange", 2)).toBe(3);
    expect(editDistance("a", "abcdef", 2)).toBe(3); // length gap alone exceeds it
  });

  test("handles empty strings", () => {
    expect(editDistance("", "ab", 2)).toBe(2);
    expect(editDistance("ab", "", 2)).toBe(2);
    expect(editDistance("", "abcd", 2)).toBe(3);
  });
});

describe("maxEditsFor", () => {
  test("short words are never 'corrected'; longer words get more slack", () => {
    expect(maxEditsFor(3)).toBe(0);
    expect(maxEditsFor(4)).toBe(1);
    expect(maxEditsFor(5)).toBe(1);
    expect(maxEditsFor(6)).toBe(2);
    expect(maxEditsFor(12)).toBe(2);
  });
});

describe("vocabulary + typo correction", () => {
  const vocab = buildVocabulary([
    "Fresh Paneer 200g",
    "Amul Paneer Block",
    "Chicken Breast Boneless",
    "Amul Butter Salted",
    "Amul Butter Unsalted",
    "Tomato Ketchup",
  ]);

  test("buildVocabulary counts word frequency and drops tiny words", () => {
    expect(vocab.get("paneer")).toBe(2);
    expect(vocab.get("amul")).toBe(3);
    expect(vocab.has("g")).toBe(false);
    expect(vocab.has("200g")).toBe(true);
  });

  test("buildVocabulary keeps only the most common words when the catalogue is huge", () => {
    const big = buildVocabulary(["alpha alpha alpha", "bravo bravo", "charlie"], { maxWords: 2 });
    expect([...big.keys()].sort()).toEqual(["alpha", "bravo"]);
  });

  test("isKnownToken: a token inside a real catalogue word is not a typo", () => {
    expect(isKnownToken("chick", vocab)).toBe(true); // inside 'chicken'
    expect(isKnownToken("tomatoes", vocab)).toBe(true); // singular form 'tomato' exists
    expect(isKnownToken("chiken", vocab)).toBe(false);
  });

  test.each([
    ["chiken", "chicken"],
    ["panner", "paneer"],
    ["amull", "amul"],
    ["buttre", "butter"], // transposition
    ["ketchp", "ketchup"],
  ])("suggestCorrection(%s) -> %s", (typo, fix) => {
    expect(suggestCorrection(typo, vocab)).toBe(fix);
  });

  test("never guesses for very short words or numbers", () => {
    expect(suggestCorrection("cat", buildVocabulary(["car", "cab"]))).toBeNull();
    expect(suggestCorrection("1234", vocab)).toBeNull();
  });

  test("a two-edit correction must keep the first letter (stops wild guesses)", () => {
    const v = buildVocabulary(["chicken"]);
    expect(suggestCorrection("xhicken", v)).toBe("chicken"); // 1 edit: fine
    expect(suggestCorrection("xhickn", v)).toBeNull(); // 2 edits AND wrong first letter
    expect(suggestCorrection("chickn", v)).toBe("chicken");
  });

  test("on a tie the more common catalogue word wins", () => {
    const v = buildVocabulary(["dairy dairy dairy", "diary"]);
    expect(suggestCorrection("daiyr", v)).toBe("dairy");
  });

  test("correctTokens fixes unknown words and leaves valid ones exactly as typed", () => {
    expect(correctTokens(["amul", "buter"], vocab)).toEqual({
      tokens: ["amul", "butter"],
      changed: true,
      changes: [{ from: "buter", to: "butter" }],
    });
    // 'tomato' is real: never "corrected" even though 'tomatos' would be a near neighbour
    expect(correctTokens(["tomato"], vocab).changed).toBe(false);
    // nothing close in the catalogue: left alone
    expect(correctTokens(["zzzzzzz"], vocab)).toEqual({ tokens: ["zzzzzzz"], changed: false, changes: [] });
  });
});
