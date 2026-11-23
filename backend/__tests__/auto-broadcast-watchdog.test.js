process.env.REDIS_DISABLED = "true";

import { jest } from "@jest/globals";

const store = { orders: [] };
const mockStart = jest.fn();
const mockSellerTimeout = jest.fn();
const mockDeliveryTimeout = jest.fn();

function matches(o, f) {
  return Object.entries(f).every(([k, cond]) => {
    const v = o[k];
    if (k === "$or") return cond.some((c) => matches(o, c));
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("$gte" in cond && !(v >= cond.$gte)) return false;
      if ("$lte" in cond && !(v != null && v <= cond.$lte)) return false;
      if ("$ne" in cond && v === cond.$ne) return false;
      return true;
    }
    if (cond === null) return v == null;
    return v === cond;
  });
}
jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    find: (f) => {
      const rows = store.orders.filter((o) => matches(o, f));
      const c = { select: () => c, limit: () => c, lean: async () => rows };
      return c;
    },
  },
}));
jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  processBroadcastStartJob: mockStart,
  processSellerTimeoutJob: mockSellerTimeout,
  processDeliveryTimeoutJob: mockDeliveryTimeout,
}));

const { sweepDueBroadcastStarts, sweepSellerTimeouts } = await import("../app/jobs/deliveryRebroadcastWatchdog.js");

const past = () => new Date(Date.now() - 5000);
const future = () => new Date(Date.now() + 600_000);
const accepted = (orderId, over = {}) => ({
  orderId, workflowVersion: 2, workflowStatus: "SELLER_ACCEPTED", deliveryBoy: null,
  deliveryBroadcastScheduledAt: past(), ...over,
});

beforeEach(() => { jest.clearAllMocks(); store.orders = []; });

describe("admin-timed AUTO broadcast start (no Redis timer needed)", () => {
  test("starts the broadcast for an accepted order whose scheduled time has arrived", async () => {
    store.orders = [accepted("A")];
    expect(await sweepDueBroadcastStarts()).toBe(1);
    expect(mockStart).toHaveBeenCalledWith({ orderId: "A" });
  });

  test("waits for orders whose scheduled time is still in the future (respects the admin's timing)", async () => {
    store.orders = [accepted("B", { deliveryBroadcastScheduledAt: future() })];
    expect(await sweepDueBroadcastStarts()).toBe(0);
    expect(mockStart).not.toHaveBeenCalled();
  });

  test("ignores orders with no schedule, with a rider, or already past the accepted stage", async () => {
    store.orders = [
      accepted("C", { deliveryBroadcastScheduledAt: null }),
      accepted("D", { deliveryBoy: "rider1" }),
      accepted("E", { workflowStatus: "DELIVERY_SEARCH" }),
      accepted("F", { workflowStatus: "CANCELLED" }),
    ];
    expect(await sweepDueBroadcastStarts()).toBe(0);
  });

  test("one failing order does not stop the rest", async () => {
    store.orders = [accepted("G"), accepted("H")];
    mockStart.mockRejectedValueOnce(new Error("boom"));
    await sweepDueBroadcastStarts();
    expect(mockStart).toHaveBeenCalledTimes(2);
  });
});

describe("seller auto-accept deadline", () => {
  test("auto-accepts pending orders past their deadline, leaves the rest", async () => {
    store.orders = [
      { orderId: "P1", workflowVersion: 2, workflowStatus: "SELLER_PENDING", sellerPendingExpiresAt: past() },
      { orderId: "P2", workflowVersion: 2, workflowStatus: "SELLER_PENDING", sellerPendingExpiresAt: future() },
      { orderId: "P3", workflowVersion: 2, workflowStatus: "SELLER_PENDING", sellerPendingExpiresAt: null },
    ];
    expect(await sweepSellerTimeouts()).toBe(1);
    expect(mockSellerTimeout).toHaveBeenCalledWith({ orderId: "P1" });
  });
});
