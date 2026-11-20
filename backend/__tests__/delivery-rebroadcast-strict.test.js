process.env.REDIS_DISABLED = "true";

import { jest } from "@jest/globals";
import mongoose from "mongoose";

const oid = () => new mongoose.Types.ObjectId();

// ── a tiny stateful "orders collection" ──────────────────────────────────────
const store = { orders: [] };
const mockSchedule = jest.fn();
const mockEmitBroadcast = jest.fn();

function matches(o, f) {
  return Object.entries(f).every(([k, cond]) => {
    const v = o[k];
    if (k === "$or") return cond.some((c) => matches(o, c));
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !(cond instanceof mongoose.Types.ObjectId)) {
      if ("$gte" in cond) return v >= cond.$gte;
      if ("$lte" in cond) return v != null && v <= cond.$lte;
      if ("$in" in cond) return cond.$in.some((x) => (x == null ? v == null : +new Date(x) === +new Date(v)));
      return true;
    }
    if (cond === null) return v == null;
    return String(v) === String(cond);
  });
}
const lean = (get) => ({ lean: async () => get(), select() { return this; }, limit() { return this; }, populate() { return this; }, then: (r, j) => Promise.resolve(get()).then(r, j) });

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: jest.fn((f) => lean(() => { const o = store.orders.find((x) => matches(x, f)); return o ? { ...o } : null; })),
    find: jest.fn((f) => lean(() => store.orders.filter((o) => matches(o, f)).map((o) => ({ ...o })))),
    updateOne: jest.fn(async () => ({})),
    countDocuments: jest.fn(async () => 0),
    findOneAndUpdate: jest.fn(async (f, u) => {
      const o = store.orders.find((x) => matches(x, f));
      if (!o) return null;
      Object.assign(o, u.$set || {});
      return o;
    }),
  },
}));
for (const m of ["deliveryAssignment", "orderOtp", "seller", "setting"]) {
  jest.unstable_mockModule(`../app/models/${m}.js`, () => ({ default: {} }));
}
jest.unstable_mockModule("../app/services/orderCompensation.js", () => ({ compensateOrderCancellation: jest.fn() }));
jest.unstable_mockModule("../app/services/penalty/penaltyService.js", () => ({ applySellerRejectionPenalty: jest.fn() }));
jest.unstable_mockModule("../app/services/redisManager.js", () => ({ set: jest.fn(), get: jest.fn(), buildKey: jest.fn() }));
jest.unstable_mockModule("../app/services/workflow/jobSchedulerPort.js", () => ({
  scheduleSellerTimeout: jest.fn(), removeSellerTimeout: jest.fn(),
  scheduleDeliveryTimeout: mockSchedule, removeDeliveryTimeout: jest.fn(),
  scheduleBroadcastStart: jest.fn(), removeBroadcastStart: jest.fn(),
}));
jest.unstable_mockModule("../app/services/orderPreparationConfig.js", () => ({
  getOrderPreparationConfig: async () => ({ rebroadcastIntervalSeconds: 300 }),
  resolvePreparationMinutes: jest.fn(),
}));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitOrderStatusUpdate: jest.fn(), emitToSeller: jest.fn(), emitToCustomer: jest.fn(),
  emitDeliveryBroadcastForSeller: mockEmitBroadcast, retractDeliveryBroadcastForOrder: jest.fn(),
}));
jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({ applyDeliveredSettlement: jest.fn() }));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({ requireCanonicalOrderId: async (x) => x }));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({ emitNotificationEvent: jest.fn() }));
jest.unstable_mockModule("../app/domains/deliverySurge/deliverySurge.evaluation.js", () => ({ previewDeliverySurgesForOrder: jest.fn(async () => null) }));
jest.unstable_mockModule("../app/services/gst/invoiceService.js", () => ({ issueInvoiceForOrder: jest.fn() }));

const { processDeliveryTimeoutJob } = await import("../app/services/orderWorkflowService.js");
const { sweepDeliverySearches } = await import("../app/jobs/deliveryRebroadcastWatchdog.js");

const searching = (over = {}) => ({
  _id: oid(), orderId: "ORD-S-1", workflowVersion: 2, workflowStatus: "DELIVERY_SEARCH",
  deliveryBoy: null, seller: oid(), skippedBy: [],
  deliverySearchExpiresAt: new Date(Date.now() - 1000),
  deliverySearchMeta: { attempt: 1, radiusMeters: 5000 },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  store.orders = [];
  mockEmitBroadcast.mockResolvedValue(undefined);
});

describe("strict rider re-broadcast", () => {
  test("an expired wave is re-broadcast: new window, next attempt, widened radius", async () => {
    store.orders = [searching()];
    await processDeliveryTimeoutJob({ orderId: "ORD-S-1", attempt: 1 });
    const o = store.orders[0];
    expect(o.deliverySearchMeta.attempt).toBe(2);
    expect(o.deliverySearchMeta.radiusMeters).toBeGreaterThan(5000);
    expect(o.deliverySearchExpiresAt.getTime()).toBeGreaterThan(Date.now() + 290_000);
    expect(mockEmitBroadcast).toHaveBeenCalledTimes(1);
  });

  test("a rider's Skip never ends the search: the next wave clears it", async () => {
    store.orders = [searching({ skippedBy: [oid()] })];
    await processDeliveryTimeoutJob({ orderId: "ORD-S-1", attempt: 1 });
    expect(store.orders[0].skippedBy).toEqual([]);
  });

  test("it never gives up: 50 consecutive waves, still searching, attempt keeps counting", async () => {
    store.orders = [searching()];
    for (let i = 0; i < 50; i++) {
      store.orders[0].deliverySearchExpiresAt = new Date(Date.now() - 1000); // window lapses
      await processDeliveryTimeoutJob({ orderId: "ORD-S-1", attempt: i + 1 });
    }
    expect(store.orders[0].workflowStatus).toBe("DELIVERY_SEARCH");
    expect(store.orders[0].deliverySearchMeta.attempt).toBe(51);
    expect(mockEmitBroadcast).toHaveBeenCalledTimes(50);
  });

  test("a timer firing 1s EARLY still re-broadcasts instead of being dropped", async () => {
    store.orders = [searching({ deliverySearchExpiresAt: new Date(Date.now() + 1000) })];
    await processDeliveryTimeoutJob({ orderId: "ORD-S-1", attempt: 1 });
    expect(mockEmitBroadcast).toHaveBeenCalledTimes(1);
  });

  test("a wave that is not due yet is left alone", async () => {
    store.orders = [searching({ deliverySearchExpiresAt: new Date(Date.now() + 120_000) })];
    await processDeliveryTimeoutJob({ orderId: "ORD-S-1", attempt: 1 });
    expect(mockEmitBroadcast).not.toHaveBeenCalled();
  });

  test("an order a rider already took is not re-broadcast", async () => {
    store.orders = [searching({ workflowStatus: "DELIVERY_ASSIGNED", deliveryBoy: oid() })];
    await processDeliveryTimeoutJob({ orderId: "ORD-S-1", attempt: 1 });
    expect(mockEmitBroadcast).not.toHaveBeenCalled();
  });

  test("two workers firing for the SAME wave broadcast it once (compare-and-set)", async () => {
    store.orders = [searching()];
    await Promise.all([
      processDeliveryTimeoutJob({ orderId: "ORD-S-1", attempt: 1 }),
      processDeliveryTimeoutJob({ orderId: "ORD-S-1", attempt: 1 }),
    ]);
    expect(mockEmitBroadcast).toHaveBeenCalledTimes(1);
  });
});

describe("watchdog (MongoDB only - no Redis involved)", () => {
  test("revives an order whose window lapsed, with no Bull timer", async () => {
    store.orders = [searching()];
    expect(await sweepDeliverySearches()).toBe(1);
    expect(store.orders[0].deliverySearchMeta.attempt).toBe(2);
  });

  test("revives an order whose expiry is missing altogether", async () => {
    store.orders = [searching({ deliverySearchExpiresAt: null })];
    await sweepDeliverySearches();
    expect(mockEmitBroadcast).toHaveBeenCalledTimes(1);
  });

  test("ignores orders still inside their window, assigned, or not searching", async () => {
    store.orders = [
      searching({ orderId: "A", deliverySearchExpiresAt: new Date(Date.now() + 60_000) }),
      searching({ orderId: "B", deliveryBoy: oid() }),
      searching({ orderId: "C", workflowStatus: "CANCELLED" }),
    ];
    expect(await sweepDeliverySearches()).toBe(0);
    expect(mockEmitBroadcast).not.toHaveBeenCalled();
  });

  test("one order failing does not stop the others", async () => {
    store.orders = [searching({ orderId: "X" }), searching({ orderId: "Y" })];
    mockEmitBroadcast.mockRejectedValueOnce(new Error("socket down"));
    await sweepDeliverySearches();
    expect(mockEmitBroadcast).toHaveBeenCalledTimes(2);
  });
});
