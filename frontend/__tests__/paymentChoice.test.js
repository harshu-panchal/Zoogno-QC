import { resolvePaymentFlow, toPaymentMode, walletAmountForOrder } from "../src/shared/utils/paymentChoice.js";

const online = { id: "online" };
const cash = { id: "cash" };
const walletOk = { id: "wallet" };
const walletOff = { id: "wallet", disabled: true };

describe("resolvePaymentFlow - when does the customer get asked?", () => {
  test("normal order: online and COD are both usable -> ask (popup), never pick for them", () => {
    const r = resolvePaymentFlow({ amountDue: 250, methods: [online, cash, walletOff] });
    expect(r.action).toBe("choose");
    expect(r.options.map((o) => o.id)).toEqual(["online", "cash"]);
  });

  test("a usable wallet is offered in the popup as well; an unusable (disabled) one is not", () => {
    expect(resolvePaymentFlow({ amountDue: 250, methods: [online, cash, walletOk] }).options.map((o) => o.id)).toEqual(["online", "cash", "wallet"]);
    expect(resolvePaymentFlow({ amountDue: 250, methods: [online, cash, walletOff] }).options.map((o) => o.id)).toEqual(["online", "cash"]);
  });

  test("free order / nothing left to pay: no popup (there is no payment to choose)", () => {
    expect(resolvePaymentFlow({ amountDue: 0, methods: [online, cash] })).toEqual({ action: "place", method: "cash" });
  });

  test("fully covered by wallet credit: placed as a wallet order, no popup", () => {
    expect(resolvePaymentFlow({ amountDue: 0, walletAmountToUse: 180, methods: [online, cash, walletOk] })).toEqual({
      action: "place",
      method: "wallet",
    });
  });

  test("only ONE usable method (e.g. admin switched COD off and the wallet is empty): nothing to choose", () => {
    expect(resolvePaymentFlow({ amountDue: 250, methods: [online, walletOff] })).toEqual({ action: "place", method: "online" });
    expect(resolvePaymentFlow({ amountDue: 250, methods: [cash, walletOff] })).toEqual({ action: "place", method: "cash" });
  });

  test("no usable method at all", () => {
    expect(resolvePaymentFlow({ amountDue: 250, methods: [walletOff] })).toEqual({ action: "none" });
    expect(resolvePaymentFlow({ amountDue: 250, methods: [] })).toEqual({ action: "none" });
    expect(resolvePaymentFlow({ amountDue: 250 })).toEqual({ action: "none" });
  });

  test("tolerates a missing/garbage amount by treating it as nothing due", () => {
    expect(resolvePaymentFlow({ amountDue: undefined, methods: [online, cash] }).action).toBe("place");
    expect(resolvePaymentFlow({ amountDue: NaN, methods: [online, cash] }).action).toBe("place");
  });
});

describe("toPaymentMode", () => {
  test("maps every UI method to the API mode", () => {
    expect(toPaymentMode("online")).toBe("ONLINE");
    expect(toPaymentMode("cash")).toBe("COD");
    expect(toPaymentMode("wallet")).toBe("WALLET");
  });

  test("no choice yet -> the fallback (the preview does not depend on the mode)", () => {
    expect(toPaymentMode(null)).toBe("ONLINE");
    expect(toPaymentMode(undefined)).toBe("ONLINE");
    expect(toPaymentMode(null, "COD")).toBe("COD");
  });
});

describe("walletAmountForOrder - computed from the choice, not from stale state", () => {
  test("choosing Wallet covers the whole total", () => {
    expect(walletAmountForOrder({ method: "wallet", grandTotal: 240, walletBalance: 500 })).toBe(240);
  });

  test("online/COD with the wallet toggle on: as much as the balance allows, capped at the total", () => {
    expect(walletAmountForOrder({ method: "online", grandTotal: 240, useWallet: true, walletBalance: 100 })).toBe(100);
    expect(walletAmountForOrder({ method: "cash", grandTotal: 240, useWallet: true, walletBalance: 900 })).toBe(240);
  });

  test("wallet toggle off, or no balance: nothing from the wallet", () => {
    expect(walletAmountForOrder({ method: "online", grandTotal: 240, useWallet: false, walletBalance: 900 })).toBe(0);
    expect(walletAmountForOrder({ method: "online", grandTotal: 240, useWallet: true, walletBalance: 0 })).toBe(0);
  });

  test("switching from Wallet in the list to Online in the popup does not carry the wallet over", () => {
    // The state said "wallet" (amount = total) a moment ago; the new choice is Online with no toggle.
    expect(walletAmountForOrder({ method: "online", grandTotal: 240, useWallet: false, walletBalance: 900 })).toBe(0);
  });

  test("never negative / NaN", () => {
    expect(walletAmountForOrder({ method: "wallet", grandTotal: -5 })).toBe(0);
    expect(walletAmountForOrder({ method: "wallet", grandTotal: undefined })).toBe(0);
  });
});
