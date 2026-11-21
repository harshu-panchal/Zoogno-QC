process.env.REDIS_DISABLED = "true";

import { jest } from "@jest/globals";
import mongoose from "mongoose";

const sellerId = new mongoose.Types.ObjectId();
const orderMongoId = new mongoose.Types.ObjectId();
const store = { order: null };

const mockEmitBroadcast = jest.fn();
const mockScheduleDelivery = jest.fn();
const mockRemoveBroadcastStart = jest.fn();
const mockCreateAssignment = jest.fn();

function matches(order, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = order?.[key];
    if (expected && typeof expected === "object" && !(expected instanceof mongoose.Types.ObjectId)) {
      if ("$gte" in expected) return actual >= expected.$gte;
      return true;
    }
    if (expected === null) return actual == null;
    return String(actual) === String(expected);
  });
}

function query(execute) {
  let promise;
  const run = () => {
    if (!promise) promise = Promise.resolve().then(execute);
    return promise;
  };
  return {
    select() { return this; },
    populate() { return this; },
    lean() { return run(); },
    then(resolve, reject) { return run().then(resolve, reject); },
  };
}

function hydratedOrder() {
  if (!store.order) return null;
  return {
    ...store.order,
    seller: { _id: sellerId, shopName: "Test seller" },
    async save() {
      Object.assign(store.order, {
        workflowStatus: this.workflowStatus,
        status: this.status,
        deliverySearchExpiresAt: this.deliverySearchExpiresAt,
        deliveryBroadcastScheduledAt: this.deliveryBroadcastScheduledAt,
        deliverySearchMeta: this.deliverySearchMeta,
      });
      return this;
    },
  };
}

const Order = {
  findOneAndUpdate: jest.fn((filter, update) => query(() => {
    if (!store.order || !matches(store.order, filter)) return null;
    Object.assign(store.order, update.$set || {});
    return hydratedOrder();
  })),
  findOne: jest.fn((filter) => query(() => {
    if (!store.order || !matches(store.order, filter)) return null;
    return hydratedOrder();
  })),
  findById: jest.fn((id) => query(() => (
    store.order && String(store.order._id) === String(id) ? hydratedOrder() : null
  ))),
  updateOne: jest.fn(async (filter, update) => {
    if (!store.order || !matches(store.order, filter)) return { matchedCount: 0 };
    Object.assign(store.order, update.$set || {});
    return { matchedCount: 1 };
  }),
  countDocuments: jest.fn(async () => 0),
};

jest.unstable_mockModule("../app/models/order.js", () => ({ default: Order }));
jest.unstable_mockModule("../app/models/deliveryAssignment.js", () => ({
  default: { create: mockCreateAssignment },
}));
for (const model of ["orderOtp", "seller", "setting"]) {
  jest.unstable_mockModule(`../app/models/${model}.js`, () => ({ default: {} }));
}
jest.unstable_mockModule("../app/services/orderCompensation.js", () => ({ compensateOrderCancellation: jest.fn() }));
jest.unstable_mockModule("../app/services/penalty/penaltyService.js", () => ({ applySellerRejectionPenalty: jest.fn() }));
jest.unstable_mockModule("../app/services/redisManager.js", () => ({ set: jest.fn(), get: jest.fn(), buildKey: jest.fn() }));
jest.unstable_mockModule("../app/services/workflow/jobSchedulerPort.js", () => ({
  scheduleSellerTimeout: jest.fn(),
  removeSellerTimeout: jest.fn(),
  scheduleDeliveryTimeout: mockScheduleDelivery,
  removeDeliveryTimeout: jest.fn(),
  scheduleBroadcastStart: jest.fn(),
  removeBroadcastStart: mockRemoveBroadcastStart,
}));
jest.unstable_mockModule("../app/services/orderPreparationConfig.js", () => ({
  getOrderPreparationConfig: async () => ({ rebroadcastIntervalSeconds: 30 }),
  resolvePreparationMinutes: jest.fn(),
}));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: jest.fn(),
  emitToSeller: jest.fn(),
  emitToCustomer: jest.fn(),
  emitDeliveryBroadcastForSeller: mockEmitBroadcast,
  retractDeliveryBroadcastForOrder: jest.fn(),
}));
jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({ applyDeliveredSettlement: jest.fn() }));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({ requireCanonicalOrderId: async (value) => value }));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({ emitNotificationEvent: jest.fn() }));
jest.unstable_mockModule("../app/domains/deliverySurge/deliverySurge.evaluation.js", () => ({
  previewDeliverySurgesForOrder: jest.fn(async () => null),
}));
jest.unstable_mockModule("../app/services/gst/invoiceService.js", () => ({ issueInvoiceForOrder: jest.fn() }));

const { processBroadcastStartJob, sellerDispatchOrder } = await import("../app/services/orderWorkflowService.js");

beforeEach(() => {
  jest.clearAllMocks();
  store.order = {
    _id: orderMongoId,
    orderId: "ORD-RACE-1",
    seller: sellerId,
    workflowVersion: 2,
    workflowStatus: "SELLER_ACCEPTED",
    deliveryBoy: null,
    deliveryBroadcastScheduledAt: new Date(Date.now() + 60_000),
    address: {},
    items: [],
    pricing: { total: 100 },
  };
  mockCreateAssignment.mockResolvedValue({});
  mockEmitBroadcast.mockResolvedValue(undefined);
  mockScheduleDelivery.mockResolvedValue(undefined);
  mockRemoveBroadcastStart.mockResolvedValue(undefined);
});

test("automatic timer and manual Proceed racing emit exactly one rider broadcast", async () => {
  await Promise.all([
    processBroadcastStartJob({ orderId: store.order.orderId }),
    sellerDispatchOrder(sellerId, store.order.orderId),
  ]);

  expect(store.order.workflowStatus).toBe("DELIVERY_SEARCH");
  expect(mockCreateAssignment).toHaveBeenCalledTimes(1);
  expect(mockEmitBroadcast).toHaveBeenCalledTimes(1);
  expect(mockScheduleDelivery).toHaveBeenCalledTimes(1);
});

test("manual Proceed starts early and removes its pending automatic timer", async () => {
  await sellerDispatchOrder(sellerId, store.order.orderId);

  expect(store.order.workflowStatus).toBe("DELIVERY_SEARCH");
  expect(mockEmitBroadcast).toHaveBeenCalledTimes(1);
  expect(mockRemoveBroadcastStart).toHaveBeenCalledWith(store.order.orderId);
});
