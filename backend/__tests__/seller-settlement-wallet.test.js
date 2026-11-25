import { jest } from "@jest/globals";

const mockWalletFindOne = jest.fn();
const mockWalletCreate = jest.fn();

jest.unstable_mockModule("../app/models/wallet.js", () => ({
  default: { findOne: mockWalletFindOne, create: mockWalletCreate },
}));
jest.unstable_mockModule("../app/models/payout.js", () => ({
  default: { aggregate: jest.fn() },
}));
jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { aggregate: jest.fn() },
}));

const { creditWallet, debitWalletWithCarryForward } = await import(
  "../app/services/finance/walletService.js"
);

describe("seller settlement wallet carry-forward adjustments", () => {
  let wallet;

  beforeEach(() => {
    wallet = {
      status: "ACTIVE",
      availableBalance: 10,
      pendingBalance: 0,
      adjustmentBalance: 0,
      totalCredited: 10,
      totalDebited: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockWalletFindOne.mockResolvedValue(wallet);
    mockWalletCreate.mockReset();
  });

  it("carries an uncovered return deduction into future settlements", async () => {
    const debit = await debitWalletWithCarryForward({
      ownerType: "SELLER",
      ownerId: "seller-1",
      amount: 30,
    });

    expect(debit.debitedFromBalance).toBe(10);
    expect(debit.carriedForward).toBe(20);
    expect(wallet.availableBalance).toBe(0);
    expect(wallet.adjustmentBalance).toBe(20);
    expect(wallet.totalDebited).toBe(30);
  });

  it("offsets carried adjustments before a new settlement becomes withdrawable", async () => {
    wallet.availableBalance = 0;
    wallet.adjustmentBalance = 20;

    const credit = await creditWallet({
      ownerType: "SELLER",
      ownerId: "seller-1",
      amount: 50,
      bucket: "available",
    });

    expect(credit.adjustmentApplied).toBe(20);
    expect(credit.creditedToBalance).toBe(30);
    expect(wallet.adjustmentBalance).toBe(0);
    expect(wallet.availableBalance).toBe(30);
  });
});
