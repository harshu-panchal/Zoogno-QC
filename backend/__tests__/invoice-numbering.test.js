import {
  SELLER_DOC_MAX_LENGTH,
  financialYearIST,
  shortFinancialYear,
  formatZoognoRefNo,
  formatSellerDocNo,
  assertValidSellerDocNo,
  zoognoCounterId,
  sellerCounterId,
  sellerPrefixCandidates,
} from "../app/services/gst/invoiceNumbering.js";

// What the GSTN GSTR-1 schema accepts for an invoice / note number.
const GSTN_NUMBER = /^[A-Z0-9][A-Z0-9/-]{0,15}$/;

describe("financialYearIST", () => {
  test("splits the year at 1 April", () => {
    expect(financialYearIST(new Date("2026-08-15T10:00:00Z"))).toBe("2026-27");
    expect(financialYearIST(new Date("2027-01-10T10:00:00Z"))).toBe("2026-27");
    expect(financialYearIST(new Date("2026-04-01T10:00:00Z"))).toBe("2026-27");
    expect(financialYearIST(new Date("2026-03-15T10:00:00Z"))).toBe("2025-26");
  });

  test("evaluates the boundary in IST, not UTC", () => {
    // 23:59:59 IST on 31 March = 18:29:59 UTC -> still the old FY
    expect(financialYearIST(new Date("2027-03-31T18:29:59Z"))).toBe("2026-27");
    // 00:00:00 IST on 1 April = 18:30:00 UTC on 31 March -> already the NEW FY.
    // (A UTC server using local getMonth() would wrongly say 2026-27 here.)
    expect(financialYearIST(new Date("2027-03-31T18:30:00Z"))).toBe("2027-28");
  });

  test("rejects an invalid date", () => {
    expect(() => financialYearIST(new Date("nope"))).toThrow();
  });
});

describe("shortFinancialYear", () => {
  test("compacts the FY for the 16-char statutory number", () => {
    expect(shortFinancialYear("2026-27")).toBe("26-27");
    expect(shortFinancialYear("2099-00")).toBe("99-00");
  });
  test("rejects malformed input", () => {
    expect(() => shortFinancialYear("2026")).toThrow();
    expect(() => shortFinancialYear("")).toThrow();
  });
});

describe("formatZoognoRefNo (platform-wide reference)", () => {
  test("matches the documented example format", () => {
    expect(formatZoognoRefNo("INVOICE", "2026-27", 501)).toBe("ZOO/INV/2026-27/000501");
  });
  test("credit and debit notes have their own reference series", () => {
    expect(formatZoognoRefNo("CREDIT_NOTE", "2026-27", 3)).toBe("ZOO/CN/2026-27/000003");
    expect(formatZoognoRefNo("DEBIT_NOTE", "2026-27", 3)).toBe("ZOO/DN/2026-27/000003");
  });
  test("keeps counting past six digits instead of truncating", () => {
    expect(formatZoognoRefNo("INVOICE", "2026-27", 1234567)).toBe("ZOO/INV/2026-27/1234567");
  });
  test("rejects a bad sequence or document type", () => {
    expect(() => formatZoognoRefNo("INVOICE", "2026-27", 0)).toThrow();
    expect(() => formatZoognoRefNo("INVOICE", "2026-27", 1.5)).toThrow();
    expect(() => formatZoognoRefNo("RECEIPT", "2026-27", 1)).toThrow();
  });
});

describe("formatSellerDocNo (statutory seller number)", () => {
  test("invoice: prefix / FY / 6-digit sequence, exactly the 16-char limit", () => {
    const no = formatSellerDocNo({ docType: "INVOICE", prefix: "ABC", financialYear: "2026-27", seq: 1 });
    expect(no).toBe("ABC/26-27/000001");
    expect(no).toHaveLength(SELLER_DOC_MAX_LENGTH);
    expect(no).toMatch(GSTN_NUMBER);
  });

  test("credit and debit notes are separate series that stay within 16 chars", () => {
    const cn = formatSellerDocNo({ docType: "CREDIT_NOTE", prefix: "ABC", financialYear: "2026-27", seq: 1 });
    const dn = formatSellerDocNo({ docType: "DEBIT_NOTE", prefix: "ABC", financialYear: "2026-27", seq: 1 });
    expect(cn).toBe("ABC/26-27/CN0001");
    expect(dn).toBe("ABC/26-27/DN0001");
    for (const no of [cn, dn]) {
      expect(no.length).toBeLessThanOrEqual(SELLER_DOC_MAX_LENGTH);
      expect(no).toMatch(GSTN_NUMBER);
    }
    // A credit note can never be mistaken for an invoice number.
    expect(cn).not.toBe(formatSellerDocNo({ docType: "INVOICE", prefix: "ABC", financialYear: "2026-27", seq: 1 }));
  });

  test("shorter prefixes still produce valid numbers", () => {
    expect(formatSellerDocNo({ docType: "INVOICE", prefix: "Z9", financialYear: "2026-27", seq: 42 })).toBe("Z9/26-27/000042");
    expect(formatSellerDocNo({ docType: "INVOICE", prefix: "X", financialYear: "2026-27", seq: 7 })).toBe("X/26-27/000007");
  });

  test("REFUSES to issue a number that would breach the 16-char rule (fails loudly, never truncates)", () => {
    // invoice series capacity is 999,999 per seller per FY
    expect(() => formatSellerDocNo({ docType: "INVOICE", prefix: "ABC", financialYear: "2026-27", seq: 1000000 })).toThrow(/not GST-compliant/);
    // credit-note capacity is 9,999
    expect(() => formatSellerDocNo({ docType: "CREDIT_NOTE", prefix: "ABC", financialYear: "2026-27", seq: 10000 })).toThrow(/not GST-compliant/);
    expect(formatSellerDocNo({ docType: "CREDIT_NOTE", prefix: "ABC", financialYear: "2026-27", seq: 9999 })).toBe("ABC/26-27/CN9999");
  });

  test("rejects an invalid prefix", () => {
    for (const prefix of ["ABCD", "ab", "A B", "", "A/B", undefined]) {
      expect(() => formatSellerDocNo({ docType: "INVOICE", prefix, financialYear: "2026-27", seq: 1 })).toThrow();
    }
  });
});

describe("assertValidSellerDocNo", () => {
  test("the spec's illustrative example is NOT statutory-compliant (22 chars)", () => {
    // Documented finding: "ABC/INV/2026-27/000001" exceeds Rule 46(b)'s 16-character limit
    // and would be rejected by GSTR-1 upload, which is why the seller series is compacted.
    expect("ABC/INV/2026-27/000001").toHaveLength(22);
    expect(() => assertValidSellerDocNo("ABC/INV/2026-27/000001")).toThrow(/not GST-compliant/);
  });

  test("rejects illegal characters and case", () => {
    expect(() => assertValidSellerDocNo("abc/26-27/000001")).toThrow();
    expect(() => assertValidSellerDocNo("ABC 26-27 0001")).toThrow();
    expect(() => assertValidSellerDocNo("ABC\\26-27\\0001")).toThrow();
    expect(() => assertValidSellerDocNo("/ABC/26-27/001")).toThrow();
    expect(() => assertValidSellerDocNo("")).toThrow();
    expect(() => assertValidSellerDocNo(null)).toThrow();
  });

  test("accepts compliant numbers", () => {
    expect(assertValidSellerDocNo("ABC/26-27/000001")).toBe("ABC/26-27/000001");
    expect(assertValidSellerDocNo("A-1/26-27/CN0001")).toBe("A-1/26-27/CN0001");
  });

  test("the error carries a machine-readable code", () => {
    try {
      assertValidSellerDocNo("TOO/LONG/NUMBER/123456");
    } catch (e) {
      expect(e.code).toBe("SELLER_DOC_NO_INVALID");
      return;
    }
    throw new Error("expected assertValidSellerDocNo to throw");
  });
});

describe("counter ids (independent series)", () => {
  test("Zoogno counter is shared by all sellers but separate per doc type and FY", () => {
    expect(zoognoCounterId("INVOICE", "2026-27")).toBe("ZOO_REF:INVOICE:2026-27");
    expect(zoognoCounterId("INVOICE", "2026-27")).not.toBe(zoognoCounterId("INVOICE", "2027-28"));
    expect(zoognoCounterId("INVOICE", "2026-27")).not.toBe(zoognoCounterId("CREDIT_NOTE", "2026-27"));
  });

  test("each seller has its own counter, per doc type and FY", () => {
    const a = sellerCounterId("sellerA", "INVOICE", "2026-27");
    const b = sellerCounterId("sellerB", "INVOICE", "2026-27");
    expect(a).not.toBe(b);
    expect(a).not.toBe(sellerCounterId("sellerA", "INVOICE", "2027-28")); // FY reset
    expect(a).not.toBe(sellerCounterId("sellerA", "CREDIT_NOTE", "2026-27")); // separate series
  });

  test("requires a seller", () => {
    expect(() => sellerCounterId(undefined, "INVOICE", "2026-27")).toThrow();
  });
});

describe("sellerPrefixCandidates", () => {
  test("derives readable prefixes from shop names", () => {
    expect(sellerPrefixCandidates("Dine in Dime")[0]).toBe("DID");
    expect(sellerPrefixCandidates("Any Time Food")[0]).toBe("ATF");
    expect(sellerPrefixCandidates("Zepto")[0]).toBe("ZEP");
    expect(sellerPrefixCandidates("Any Food")[0]).toBe("AFO");
  });

  test("always yields valid, unique candidates - even for empty / symbol-only names", () => {
    for (const name of ["", "   ", "!!!", undefined, null, "Café Déjà Vu", "42", "A"]) {
      const list = sellerPrefixCandidates(name);
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
      for (const c of list) expect(c).toMatch(/^[A-Z0-9]{1,3}$/);
    }
  });

  test("offers many fallbacks so a collision can be resolved deterministically", () => {
    expect(sellerPrefixCandidates("Dine in Dime").length).toBeGreaterThan(30);
  });
});
