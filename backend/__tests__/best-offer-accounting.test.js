import { describe, expect, it, jest, beforeEach } from "@jest/globals";

const mockCategoryFind = jest.fn();
const mockProductFind = jest.fn();
const mockSellerFindById = jest.fn();
const mockGetOrCreateFinanceSettings = jest.fn();
const mockBestOfferFindOne = jest.fn();
const mockBestOfferFind = jest.fn();
const mockBestOfferFindOneAndUpdate = jest.fn();
const mockBestOfferFindById = jest.fn();
const mockBestOfferFindByIdAndUpdate = jest.fn();
const mockBestOfferUpdateOne = jest.fn();
const mockOrderExists = jest.fn();
const mockOrderCountDocuments = jest.fn();
const mockOrderFindById = jest.fn();
const mockOrderFindOneAndUpdate = jest.fn();
const mockCalculateCouponDiscount = jest.fn();
const mockComputeSurgeChargeForCheckout = jest.fn();
const mockGetCachedRoute = jest.fn();

const createLeanChain = (val) => {
  const chain = {
    select: jest.fn(() => chain),
    session: jest.fn(() => chain),
    setOptions: jest.fn(() => chain),
    lean: jest.fn(async () => val),
  };
  return chain;
};

jest.unstable_mockModule("../app/models/category.js", () => ({
  default: {
    find: (...args) => mockCategoryFind(...args),
  },
}));

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    find: (...args) => mockProductFind(...args),
  },
}));

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {
    findById: (...args) => mockSellerFindById(...args),
  },
}));

jest.unstable_mockModule("../app/models/bestOfferListing.js", () => ({
  default: {
    findOne: (...args) => mockBestOfferFindOne(...args),
    find: (...args) => mockBestOfferFind(...args),
    findOneAndUpdate: (...args) => mockBestOfferFindOneAndUpdate(...args),
    findById: (...args) => mockBestOfferFindById(...args),
    findByIdAndUpdate: (...args) => mockBestOfferFindByIdAndUpdate(...args),
    updateOne: (...args) => mockBestOfferUpdateOne(...args),
  },
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    exists: (...args) => mockOrderExists(...args),
    countDocuments: (...args) => mockOrderCountDocuments(...args),
    findById: (...args) => mockOrderFindById(...args),
    findOneAndUpdate: (...args) => mockOrderFindOneAndUpdate(...args),
  },
}));

jest.unstable_mockModule("../app/services/finance/financeSettingsService.js", () => ({
  getOrCreateFinanceSettings: (...args) => mockGetOrCreateFinanceSettings(...args),
}));

jest.unstable_mockModule("../app/services/couponService.js", () => ({
  calculateCouponDiscount: (...args) => mockCalculateCouponDiscount(...args),
}));

jest.unstable_mockModule("../app/services/finance/surgeChargeService.js", () => ({
  computeSurgeChargeForCheckout: (...args) => mockComputeSurgeChargeForCheckout(...args),
}));

jest.unstable_mockModule("../app/services/mapsRouteService.js", () => ({
  getCachedRoute: (...args) => mockGetCachedRoute(...args),
}));

const {
  generateOrderPaymentBreakdown,
} = await import("../app/services/finance/pricingService.js");
const {
  buildCheckoutPricingSnapshot,
} = await import("../app/services/checkoutPricingService.js");
const {
  generateOfferText,
  validateOfferAgainstSellerFloor,
  reserveOfferBudgetAtomic,
  refundOfferBudgetForCancelledOrder,
  computeProportionalDiscountRefund,
  assertSellerPriceNotLockedForOffer,
  getIstDateKey,
} = await import("../app/services/bestOfferService.js");

describe("Structured Best Offers & Discount Accounting", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockCategoryFind.mockImplementation(() =>
      createLeanChain([
        {
          _id: "sub-1",
          name: "Meals",
          isCommissionActive: true,
          adminCommissionType: "percentage",
          adminCommissionValue: 10,
          handlingFeeType: "none",
          handlingFeeValue: 0,
        },
      ]),
    );

    mockGetOrCreateFinanceSettings.mockResolvedValue({
      deliveryPricingMode: "fixed_price",
      fixedDeliveryFee: 30,
      customerBaseDeliveryFee: 30,
      riderEarningType: "fixed",
      riderFixedAmount: 20,
      handlingFeeStrategy: "highest_category_fee",
      freeDeliveryThreshold: 0,
      offerGuardrails: {
        minPlatformMargin: 5,
        minSellerPayoutPct: 60,
        allowCouponStacking: true,
        commissionBase: "discounted",
      },
    });

    mockSellerFindById.mockImplementation(() =>
      createLeanChain({
        _id: "seller-1",
        shopName: "Test Kitchen",
        serviceRadius: 5,
        location: { coordinates: [77.5946, 12.9716] },
      }),
    );

    mockGetCachedRoute.mockResolvedValue({ distanceMeters: 1500 });
    mockComputeSurgeChargeForCheckout.mockResolvedValue({
      surgeChargeCharged: 0,
      surgeRuleName: null,
    });
    mockOrderExists.mockImplementation(() => ({
      session: jest.fn().mockReturnThis(),
      then: (res) => res(null),
    }));
    mockOrderCountDocuments.mockImplementation(() => ({
      session: jest.fn().mockReturnThis(),
      then: (res) => res(0),
    }));
    mockBestOfferFind.mockImplementation(() => createLeanChain([]));
    mockBestOfferFindOne.mockImplementation(() => createLeanChain(null));
  });

  it("generates accurate offerText from structured fields", () => {
    expect(
      generateOfferText({
        discountType: "percentage",
        discountValue: 50,
        maxDiscount: 100,
        minOrderValue: 199,
      }),
    ).toBe("50% OFF up to ₹100");

    expect(
      generateOfferText({
        discountType: "flat",
        discountValue: 75,
        minOrderValue: 299,
      }),
    ).toBe("₹75 OFF above ₹299");
  });

  it("subtracts 100% platform-funded coupon discountTotal from platformTotalEarning", async () => {
    const breakdown = await generateOrderPaymentBreakdown({
      preHydratedItems: [
        {
          productId: "p1",
          productName: "Thali",
          quantity: 1,
          price: 200,
          headerCategoryId: "hdr-1",
          categoryId: "cat-1",
          subcategoryId: "sub-1",
          sellerId: "seller-1",
        },
      ],
      distanceKm: 2,
      discountTotal: 15,
    });

    // Commission 10% of 200 = 20; logistics margin = 30 - 20 = 10; pre-discount = 30
    // Coupon = 15 (100% platform funded) -> platformTotalEarning = 30 - 15 = 15
    expect(breakdown.sellerPayoutTotal).toBe(180);
    expect(breakdown.platformFundedDiscount).toBe(15);
    expect(breakdown.platformTotalEarning).toBe(15);
    expect(breakdown.grandTotal).toBe(215); // 200 + 30 - 15
    expect(
      breakdown.sellerPayoutTotal + breakdown.riderPayoutTotal + breakdown.platformTotalEarning,
    ).toBe(breakdown.grandTotal);
  });

  it("charges commission on discounted price and preserves grandTotal conservation on seller-funded offer", async () => {
    const breakdown = await generateOrderPaymentBreakdown({
      preHydratedItems: [
        {
          productId: "p1",
          productName: "Combo",
          quantity: 1,
          price: 400,
          headerCategoryId: "hdr-1",
          categoryId: "cat-1",
          subcategoryId: "sub-1",
          sellerId: "seller-1",
        },
      ],
      distanceKm: 2,
      offerDiscount: 100,
      sellerFundedDiscount: 100,
      platformFundedOfferDiscount: 0,
      commissionBase: "discounted",
    });

    // Discounted price = 400 - 100 = 300; 10% commission on 300 = 30; seller payout = 300 - 30 = 270
    expect(breakdown.adminProductCommissionTotal).toBe(30);
    expect(breakdown.sellerPayoutTotal).toBe(270);
    expect(breakdown.platformTotalEarning).toBe(40); // 30 comm + 10 logistics
    expect(breakdown.grandTotal).toBe(330); // 400 + 30 delivery - 100 offer
    expect(
      breakdown.sellerPayoutTotal + breakdown.riderPayoutTotal + breakdown.platformTotalEarning,
    ).toBe(breakdown.grandTotal);
  });

  it("auto-applies seller offer, stacks coupon on remaining amount, and caps combined platform share by minPlatformMargin", async () => {
    mockProductFind.mockImplementation(() =>
      createLeanChain([
        {
          _id: "p1",
          name: "Biryani",
          price: 400,
          salePrice: 400,
          stock: 10,
          status: "active",
          approvalStatus: "approved",
          isOutOfStock: false,
          headerId: "hdr-1",
          categoryId: "cat-1",
          subcategoryId: "sub-1",
          sellerId: "seller-1",
        },
      ]),
    );

    mockBestOfferFind.mockImplementation(() =>
      createLeanChain([
        {
          _id: "offer-1",
          sellerId: "seller-1",
          isEnabled: true,
          adminStatus: "active",
          discountType: "percentage",
          discountValue: 50,
          maxDiscount: 100,
          minOrderValue: 199,
          funding: { sellerPct: 80, platformPct: 20 },
          budget: { platformDailyCap: 500, platformTotalCap: 2000, platformSpent: 0 },
        },
      ]),
    );

    mockCalculateCouponDiscount.mockResolvedValue({
      couponId: "coup-1",
      code: "EXTRA50",
      discountAmount: 50,
      freeDelivery: false,
    });

    const snapshot = await buildCheckoutPricingSnapshot({
      orderItems: [{ productId: "p1", quantity: 1 }],
      address: { location: { lat: 12.98, lng: 77.6 } },
      couponCode: "EXTRA50",
      customerId: "cust-1",
    });

    // Coupon must have been evaluated on remaining amount after offer (400 - 100 = 300)
    expect(mockCalculateCouponDiscount).toHaveBeenCalledWith(
      expect.objectContaining({ cartTotal: 300 }),
    );

    const bd = snapshot.aggregateBreakdown;
    // Pre-discount platform earning: 10% of 300 (30) + logistics (30 - 20 = 10) = 40
    // With minPlatformMargin = 5 -> maxAllowedPlatform = 35
    // Raw platform share = 20 (offer 20%) + 50 (coupon) = 70 -> capped at 35 (20 offer + 15 coupon)
    expect(bd.offerDiscount).toBe(100);
    expect(bd.sellerFundedDiscount).toBe(80);
    expect(bd.platformFundedOfferDiscount).toBe(20);
    expect(bd.couponDiscount).toBe(15);
    expect(bd.platformFundedDiscount).toBe(35);
    expect(bd.platformTotalEarning).toBe(5);
    expect(bd.sellerPayoutTotal).toBe(290); // 400 - 30 comm - 80 sellerFunded
    expect(bd.grandTotal).toBe(315); // 400 + 30 - 115
  });

  it("caps offer discount at checkout if seller payout floor would be breached", async () => {
    mockProductFind.mockImplementation(() =>
      createLeanChain([
        {
          _id: "p1",
          name: "Bowl",
          price: 200,
          salePrice: 200,
          stock: 10,
          status: "active",
          approvalStatus: "approved",
          isOutOfStock: false,
          headerId: "hdr-1",
          categoryId: "cat-1",
          subcategoryId: "sub-1",
          sellerId: "seller-1",
        },
      ]),
    );

    // 50% OFF (₹100 on ₹200) 100% seller funded would leave ₹90 (45%), below 60% floor (₹120)
    mockBestOfferFind.mockImplementation(() =>
      createLeanChain([
        {
          _id: "offer-2",
          sellerId: "seller-1",
          isEnabled: true,
          adminStatus: "active",
          discountType: "percentage",
          discountValue: 50,
          maxDiscount: 100,
          minOrderValue: 100,
          funding: { sellerPct: 100, platformPct: 0 },
        },
      ]),
    );

    const snapshot = await buildCheckoutPricingSnapshot({
      orderItems: [{ productId: "p1", quantity: 1 }],
      address: { location: { lat: 12.98, lng: 77.6 } },
      customerId: "cust-1",
    });

    expect(snapshot.aggregateBreakdown.sellerPayoutTotal).toBeGreaterThanOrEqual(120);
    expect(snapshot.aggregateBreakdown.offerDiscount).toBeLessThan(100);
  });

  it("validates seller payout floor on offer creation", () => {
    const bad = validateOfferAgainstSellerFloor({
      discountType: "percentage",
      discountValue: 50,
      maxDiscount: 100,
      minOrderValue: 199,
      sellerPct: 100,
      commissionPct: 10,
      minSellerPayoutPct: 60,
      commissionBase: "discounted",
    });
    expect(bad.ok).toBe(false);

    const good = validateOfferAgainstSellerFloor({
      discountType: "percentage",
      discountValue: 25,
      maxDiscount: 100,
      minOrderValue: 199,
      sellerPct: 100,
      commissionPct: 10,
      minSellerPayoutPct: 60,
      commissionBase: "discounted",
    });
    expect(good.ok).toBe(true);
  });

  it("atomically increments offer platformSpent and auto-disables when total cap is reached", async () => {
    const todayKey = getIstDateKey();
    mockBestOfferFindOneAndUpdate.mockResolvedValueOnce({
      _id: "offer-1",
      budget: {
        platformTotalCap: 100,
        platformSpent: 100,
        platformDailyCap: 100,
        platformDailySpent: 100,
        platformDailyDate: todayKey,
      },
    });
    mockBestOfferUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 });

    await reserveOfferBudgetAtomic({ offerId: "offer-1", amount: 25, todayKey });

    expect(mockBestOfferFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockBestOfferUpdateOne).toHaveBeenCalledWith(
      { _id: "offer-1" },
      { $set: { isEnabled: false, exhaustedReason: "TOTAL_BUDGET_EXHAUSTED" } },
      {},
    );
  });

  it("refunds platformSpent back to budget on unpaid order cancellation", async () => {
    const todayKey = getIstDateKey();
    mockOrderFindById.mockImplementation(() =>
      createLeanChain({
        _id: "ord-1",
        paymentMode: "ONLINE",
        paymentStatus: "CREATED",
        financeFlags: { onlinePaymentCaptured: false },
        paymentBreakdown: {
          offerBudgetSpent: 20,
          offerBudgetRefunded: false,
          offerSnapshot: { offerId: "offer-1", budgetDateKey: todayKey },
        },
      }),
    );
    mockOrderFindOneAndUpdate.mockResolvedValueOnce({ _id: "ord-1" });
    mockBestOfferFindById.mockImplementation(() =>
      createLeanChain({
        _id: "offer-1",
        isEnabled: false,
        exhaustedReason: "TOTAL_BUDGET_EXHAUSTED",
        budget: {
          platformTotalCap: 100,
          platformSpent: 100,
          platformDailySpent: 40,
          platformDailyDate: todayKey,
        },
      }),
    );
    mockBestOfferFindByIdAndUpdate.mockResolvedValueOnce({ _id: "offer-1" });

    await refundOfferBudgetForCancelledOrder("ord-1");

    expect(mockBestOfferFindByIdAndUpdate).toHaveBeenCalledWith(
      "offer-1",
      {
        $set: {
          "budget.platformSpent": 80,
          "budget.platformDailySpent": 20,
          isEnabled: true,
          exhaustedReason: null,
        },
      },
      { new: true },
    );
  });

  it("computes proportional seller & platform discount reversals on partial return", () => {
    const order = {
      paymentBreakdown: {
        productSubtotal: 400,
        discountTotal: 100,
        sellerFundedDiscount: 60,
        platformFundedDiscount: 40,
      },
    };
    const partial = computeProportionalDiscountRefund(order, 200);
    expect(partial.returnRatio).toBe(0.5);
    expect(partial.sellerShareReversed).toBe(30);
    expect(partial.platformShareReversed).toBe(20);
    expect(partial.reversedTotal).toBe(50);
    expect(partial.customerRefundAmount).toBe(150);
  });

  it("locks product price increases while a seller Best Offer is active", async () => {
    mockBestOfferFindOne.mockImplementation(() =>
      createLeanChain({
        _id: "offer-1",
        sellerId: "seller-1",
        isEnabled: true,
        adminStatus: "active",
        discountValue: 20,
      }),
    );

    await expect(
      assertSellerPriceNotLockedForOffer({
        sellerId: "seller-1",
        existingProduct: {
          price: 100,
          salePrice: 90,
          priceHistory: [{ price: 100, salePrice: 80, effectivePrice: 80, recordedAt: new Date() }],
        },
        incomingData: { price: 120, salePrice: 110 },
        role: "seller",
      }),
    ).rejects.toThrow(/locked/i);

    await expect(
      assertSellerPriceNotLockedForOffer({
        sellerId: "seller-1",
        existingProduct: {
          price: 100,
          salePrice: 80,
          priceHistory: [{ price: 100, salePrice: 80, effectivePrice: 80, recordedAt: new Date() }],
        },
        incomingData: { price: 100, salePrice: 75 },
        role: "seller",
      }),
    ).resolves.toBeUndefined();
  });
});
