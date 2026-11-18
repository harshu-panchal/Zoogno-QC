import { jest } from "@jest/globals";

const orderFindOne = jest.fn();
const reviewFind = jest.fn();
const reviewFindOne = jest.fn();
const reviewCreate = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { findOne: orderFindOne },
}));
jest.unstable_mockModule("../app/models/product.js", () => ({
  default: { updateOne: jest.fn() },
}));
jest.unstable_mockModule("../app/models/review.js", () => ({
  default: {
    find: reviewFind,
    findOne: reviewFindOne,
    create: reviewCreate,
    aggregate: jest.fn(),
    findById: jest.fn(),
  },
}));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  orderMatchQueryFlexible: (value) => value ? { orderId: value } : null,
}));
jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  buildKey: (...parts) => parts.join(":"),
  invalidate: jest.fn(),
}));
jest.unstable_mockModule("../app/services/searchSyncService.js", () => ({
  enqueueProductIndex: jest.fn(),
}));

const { getOrderReviewEligibility, submitVerifiedReview } = await import("../app/services/reviewService.js");

const customerId = "507f1f77bcf86cd799439011";
const productId = "507f191e810c19729de860ea";
const itemId = "507f191e810c19729de860eb";

function mockOrder(order) {
  const lean = jest.fn().mockResolvedValue(order);
  const populate = jest.fn().mockReturnValue({ lean });
  orderFindOne.mockReturnValue({ populate });
}

beforeEach(() => {
  jest.clearAllMocks();
  reviewFind.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
  reviewFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
});

test("blocks reviews until the owned order is delivered", async () => {
  mockOrder({ orderId: "ORD-100000", status: "confirmed", items: [] });
  await expect(getOrderReviewEligibility({ customerId, orderIdentifier: "ORD-100000" }))
    .rejects.toMatchObject({ statusCode: 409, code: "ORDER_NOT_DELIVERED" });
});

test("blocks a product that is not in the delivered order", async () => {
  mockOrder({ _id: itemId, orderId: "ORD-100000", status: "delivered", items: [] });
  await expect(submitVerifiedReview({
    customerId,
    orderIdentifier: "ORD-100000",
    payload: { productId, rating: 5, comment: "Great" },
  })).rejects.toMatchObject({ statusCode: 403, code: "PRODUCT_NOT_IN_ORDER" });
});

test("creates a verified pending review from a delivered order item", async () => {
  const created = { _id: "507f191e810c19729de860ec", status: "pending" };
  mockOrder({
    _id: "507f191e810c19729de860ed",
    orderId: "ORD-100000",
    status: "delivered",
    deliveredAt: new Date("2026-11-18T10:00:00Z"),
    items: [{
      _id: itemId,
      product: { _id: productId, status: "active", sellerId: "507f191e810c19729de860ef", name: "Milk" },
      name: "Milk",
      image: "https://example.com/milk.jpg",
    }],
  });
  reviewCreate.mockResolvedValue(created);

  await expect(submitVerifiedReview({
    customerId,
    orderIdentifier: "ORD-100000",
    payload: { productId, rating: 5, comment: "Great", images: ["javascript:bad", "https://example.com/a.jpg"] },
  })).resolves.toEqual(created);
  expect(reviewCreate).toHaveBeenCalledWith(expect.objectContaining({
    productId,
    verifiedPurchase: true,
    status: "pending",
    images: ["https://example.com/a.jpg"],
  }));
});
