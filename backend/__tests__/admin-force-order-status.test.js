process.env.REDIS_DISABLED = "true";

import { jest } from "@jest/globals";
import mongoose from "mongoose";

const oid = () => new mongoose.Types.ObjectId();

// ── mocks: the services a forced change calls into ──────────────────────────
const state = { order: null, updates: [] };

const mockStartSearch = jest.fn();
const mockRetract = jest.fn();
const mockEmitStatus = jest.fn();
const mockRemoveSeller = jest.fn();
const mockRemoveBroadcastStart = jest.fn();
const mockRemoveDeliveryTimeout = jest.fn();
const mockCompensate = jest.fn();
const mockReverseFinance = jest.fn();
const mockSettle = jest.fn();
const mockIssueInvoice = jest.fn();
const mockCancelInvoice = jest.fn();
const mockNotify = jest.fn();
const mockBulkWrite = jest.fn();
const mockInsertHistory = jest.fn();
const mockProductFind = jest.fn();
const mockAssignmentUpdateMany = jest.fn();
const mockOrderUpdateOne = jest.fn();

const chain = (getValue) => ({
  lean: async () => getValue(),
  then: (resolve, reject) => Promise.resolve(getValue()).then(resolve, reject),
});

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findById: jest.fn(() => chain(() => state.order)),
    findOneAndUpdate: jest.fn((filter, update) => {
      state.updates.push(update);
      // apply the $set so a later read sees the change, like the database would
      const next = { ...state.order, ...(update.$set || {}) };
      for (const k of Object.keys(update.$unset || {})) delete next[k];
      if (update.$push?.adminStatusOverrides) {
        next.adminStatusOverrides = [...(state.order.adminStatusOverrides || []), update.$push.adminStatusOverrides];
      }
      state.order = next;
      return chain(() => state.order);
    }),
    updateOne: mockOrderUpdateOne,
  },
}));
jest.unstable_mockModule("../app/models/product.js", () => ({
  default: { bulkWrite: mockBulkWrite, find: mockProductFind },
}));
jest.unstable_mockModule("../app/models/stockHistory.js", () => ({ default: { insertMany: mockInsertHistory } }));
jest.unstable_mockModule("../app/models/deliveryAssignment.js", () => ({ default: { updateMany: mockAssignmentUpdateMany } }));

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({ startDeliverySearchForOrder: mockStartSearch }));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  retractDeliveryBroadcastForOrder: mockRetract,
  emitOrderStatusUpdate: mockEmitStatus,
}));
jest.unstable_mockModule("../app/services/workflow/jobSchedulerPort.js", () => ({
  removeSellerTimeout: mockRemoveSeller,
  removeBroadcastStart: mockRemoveBroadcastStart,
  removeDeliveryTimeout: mockRemoveDeliveryTimeout,
}));
jest.unstable_mockModule("../app/services/orderCompensation.js", () => ({ compensateOrderCancellation: mockCompensate }));
jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({ reverseOrderFinanceOnCancellation: mockReverseFinance }));
jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({ applyDeliveredSettlement: mockSettle }));
jest.unstable_mockModule("../app/services/gst/invoiceService.js", () => ({
  issueInvoiceForOrder: mockIssueInvoice,
  cancelInvoiceForOrder: mockCancelInvoice,
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({ emitNotificationEvent: mockNotify }));

const { planForcedStatus, normalizeForcedStatus, forceOrderStatus, ADMIN_FORCEABLE_STATUSES } = await import(
  "../app/services/adminOrderStatusService.js"
);

const riderA = oid();
const baseOrder = (over = {}) => ({
  _id: oid(),
  orderId: "ORD-FORCE-1",
  workflowVersion: 2,
  workflowStatus: "SELLER_PENDING",
  status: "pending",
  customer: oid(),
  seller: oid(),
  items: [{ product: oid(), quantity: 2 }],
  paymentBreakdown: { grandTotal: 200 },
  settlementStatus: {},
  deliverySearchMeta: { attempt: 3 },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  state.updates = [];
  state.order = baseOrder();
  mockProductFind.mockReturnValue({ select: () => ({ lean: async () => [] }) });
  mockOrderUpdateOne.mockResolvedValue({});
  mockBulkWrite.mockResolvedValue({});
  mockInsertHistory.mockResolvedValue([]);
  mockAssignmentUpdateMany.mockResolvedValue({});
  mockIssueInvoice.mockResolvedValue({ invoice: {}, created: true });
  mockCancelInvoice.mockResolvedValue({ cancelled: true });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("normalizeForcedStatus", () => {
  test.each([
    ["pending", "pending"], ["Confirmed", "confirmed"], ["PACKED", "packed"],
    ["Out for Delivery", "out_for_delivery"], ["out-for-delivery", "out_for_delivery"], ["OUT_FOR_DELIVERY", "out_for_delivery"],
    ["delivered", "delivered"], ["  Cancelled ", "cancelled"],
  ])("%p -> %p", (raw, expected) => expect(normalizeForcedStatus(raw)).toBe(expected));

  test.each([["rto"], ["shipped"], [""], [null], [undefined], [{ $ne: "x" }], [["delivered"]], [42]])(
    "%p is rejected",
    (raw) => expect(normalizeForcedStatus(raw)).toBeNull(),
  );

  test("the dropdown's six statuses are exactly the forceable ones", () => {
    expect(ADMIN_FORCEABLE_STATUSES).toEqual(["pending", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("planForcedStatus - writes status AND workflowStatus together (the bug)", () => {
  const WORKFLOW = {
    pending: "SELLER_PENDING",
    confirmed: "SELLER_ACCEPTED",
    out_for_delivery: "OUT_FOR_DELIVERY",
    delivered: "DELIVERED",
    cancelled: "CANCELLED",
  };

  test.each(Object.entries(WORKFLOW))("%s -> workflowStatus %s and the matching legacy status", (target, wf) => {
    const plan = planForcedStatus(baseOrder({ workflowStatus: "DELIVERY_ASSIGNED", status: "packed" }), target);
    expect(plan.set.workflowStatus).toBe(wf);
    expect(plan.set.status).toBe(target);
    expect(plan.set.orderStatus).toBe(target);
  });

  test("EVERY from -> to combination is allowed (no state-machine rules)", () => {
    const froms = ["SELLER_PENDING", "SELLER_ACCEPTED", "DELIVERY_SEARCH", "DELIVERY_ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];
    for (const from of froms) {
      for (const target of ADMIN_FORCEABLE_STATUSES) {
        expect(() => planForcedStatus(baseOrder({ workflowStatus: from }), target)).not.toThrow();
      }
    }
  });

  test("an unknown target throws a 400", () => {
    try {
      planForcedStatus(baseOrder(), "rto");
    } catch (e) {
      expect(e.statusCode).toBe(400);
      return;
    }
    throw new Error("expected a throw");
  });

  test("a v1 (legacy) order only gets the legacy status - it has no workflow state", () => {
    const plan = planForcedStatus({ workflowVersion: 1, status: "pending" }, "confirmed");
    expect(plan.set.status).toBe("confirmed");
    expect("workflowStatus" in plan.set).toBe(false);
  });
});

describe("planForcedStatus - moving BACK clears what no longer matches", () => {
  const dispatched = baseOrder({
    workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery", deliveryBoy: riderA,
    assignedAt: new Date(1), pickupConfirmedAt: new Date(2), outForDeliveryAt: new Date(3),
  });

  test.each(["pending", "confirmed"])("-> %s removes the rider and every pickup / delivery timestamp", (target) => {
    const { set, unset } = planForcedStatus(dispatched, target);
    expect(set).toMatchObject({
      deliveryBoy: null, deliveryPartner: null, // BOTH: the pre-save hook re-fills deliveryBoy from deliveryPartner
      assignedAt: null, pickupConfirmedAt: null, pickupReadyAt: null, outForDeliveryAt: null, deliveredAt: null,
      deliverySearchExpiresAt: null, skippedBy: [],
    });
    expect(unset).toEqual({ deliveryRiderStep: 1 });
  });

  test("-> pending/confirmed parks the seller timer (null expiry never auto-accepts)", () => {
    expect(planForcedStatus(dispatched, "pending").set.sellerPendingExpiresAt).toBeNull();
    expect(planForcedStatus(dispatched, "confirmed").set.sellerPendingExpiresAt).toBeNull();
  });

  test("-> packed WITH a rider keeps them: assigned, not yet picked up", () => {
    const { set, toWorkflow } = planForcedStatus(dispatched, "packed");
    expect(toWorkflow).toBe("DELIVERY_ASSIGNED");
    expect(set.deliveryBoy).toBe(riderA);
    expect(set).toMatchObject({ outForDeliveryAt: null, pickupConfirmedAt: null, deliveredAt: null, deliveryRiderStep: 1 });
  });

  test("-> packed with NO rider means 'find one': rider search", () => {
    const { toWorkflow, startSearch } = planForcedStatus(baseOrder({ workflowStatus: "SELLER_ACCEPTED", status: "confirmed" }), "packed");
    expect(toWorkflow).toBe("DELIVERY_SEARCH");
    expect(startSearch).toBe(true);
  });

  test("an admin-chosen rider is honoured, and counts as a change even when the status is the same", () => {
    const o = baseOrder({ workflowStatus: "DELIVERY_ASSIGNED", status: "packed", deliveryBoy: oid() });
    const plan = planForcedStatus(o, "packed", { deliveryBoyId: riderA });
    expect(plan.set.deliveryBoy).toBe(riderA);
    expect(plan.noop).toBe(false);
  });
});

describe("planForcedStatus - moving FORWARD", () => {
  test("-> out_for_delivery stamps pickup times (keeping existing ones)", () => {
    const now = new Date(1000);
    const fresh = planForcedStatus(baseOrder(), "out_for_delivery", { now });
    expect(fresh.set).toMatchObject({ pickupConfirmedAt: now, outForDeliveryAt: now, deliveryRiderStep: 3 });
    const earlier = new Date(50);
    const kept = planForcedStatus(baseOrder({ outForDeliveryAt: earlier, pickupConfirmedAt: earlier }), "out_for_delivery", { now });
    expect(kept.set.outForDeliveryAt).toBe(earlier);
  });

  test("-> delivered stamps deliveredAt once and stops any search", () => {
    const now = new Date(2000);
    const plan = planForcedStatus(baseOrder({ workflowStatus: "DELIVERY_SEARCH", status: "packed" }), "delivered", { now });
    expect(plan.set.deliveredAt).toBe(now);
    expect(plan.set.deliverySearchExpiresAt).toBeNull();
    expect(plan.leavingSearch).toBe(true);
    const done = new Date(5);
    expect(planForcedStatus(baseOrder({ deliveredAt: done }), "delivered").set.deliveredAt).toBe(done);
  });

  test("-> cancelled records who and why (a default reason if none given)", () => {
    expect(planForcedStatus(baseOrder(), "cancelled", { reason: "  fraud  " }).set).toMatchObject({ cancelledBy: "admin", cancelReason: "fraud" });
    expect(planForcedStatus(baseOrder(), "cancelled").set.cancelReason).toBe("Cancelled by admin");
  });
});

describe("planForcedStatus - rider search bookkeeping", () => {
  test("leaving DELIVERY_SEARCH for anything else ends the loop", () => {
    for (const target of ["pending", "confirmed", "out_for_delivery", "delivered", "cancelled"]) {
      expect(planForcedStatus(baseOrder({ workflowStatus: "DELIVERY_SEARCH", status: "packed" }), target).leavingSearch).toBe(true);
    }
  });

  test("an order already searching is NOT started again (no second broadcast loop)", () => {
    const plan = planForcedStatus(baseOrder({ workflowStatus: "DELIVERY_SEARCH", status: "packed" }), "packed");
    expect(plan.startSearch).toBe(false);
    expect(plan.leavingSearch).toBe(false);
  });

  test("setting the status it already has is a no-op", () => {
    expect(planForcedStatus(baseOrder({ workflowStatus: "SELLER_ACCEPTED", status: "confirmed" }), "confirmed").noop).toBe(true);
    expect(planForcedStatus(baseOrder({ workflowStatus: "DELIVERED", status: "delivered" }), "delivered").noop).toBe(true);
  });

  test("a mismatched order (legacy says confirmed, workflow says pending) is NOT a no-op: it gets re-synced", () => {
    expect(planForcedStatus(baseOrder({ workflowStatus: "SELLER_PENDING", status: "confirmed" }), "confirmed").noop).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("forceOrderStatus - the write", () => {
  test("persists status + workflowStatus together and appends an audit entry", async () => {
    const admin = oid();
    const res = await forceOrderStatus(state.order._id, "confirmed", { adminId: admin, reason: "seller phoned in" });

    expect(res.changed).toBe(true);
    const [update] = state.updates;
    expect(update.$set).toMatchObject({ status: "confirmed", orderStatus: "confirmed", workflowStatus: "SELLER_ACCEPTED" });
    expect(update.$push.adminStatusOverrides).toMatchObject({
      from: "pending", to: "confirmed", fromWorkflow: "SELLER_PENDING", toWorkflow: "SELLER_ACCEPTED", reason: "seller phoned in",
    });
    expect(String(update.$push.adminStatusOverrides.by)).toBe(String(admin));
    expect(res.order.workflowStatus).toBe("SELLER_ACCEPTED");
  });

  test("a no-op writes nothing and triggers nothing", async () => {
    state.order = baseOrder({ workflowStatus: "SELLER_ACCEPTED", status: "confirmed" });
    const res = await forceOrderStatus(state.order._id, "confirmed", {});
    expect(res.changed).toBe(false);
    expect(state.updates).toHaveLength(0);
    expect(mockEmitStatus).not.toHaveBeenCalled();
  });

  test("rejects an invalid status (400), an invalid rider id (400) and a missing order (404)", async () => {
    await expect(forceOrderStatus(state.order._id, "shipped", {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(forceOrderStatus(state.order._id, "packed", { deliveryBoyId: "nope" })).rejects.toMatchObject({ statusCode: 400 });
    state.order = null;
    await expect(forceOrderStatus(oid(), "packed", {})).rejects.toMatchObject({ statusCode: 404 });
  });

  test("tells the panels (socket) and clears the timers of the state it left", async () => {
    await forceOrderStatus(state.order._id, "confirmed", {});
    expect(mockEmitStatus).toHaveBeenCalledWith("ORD-FORCE-1", expect.objectContaining({ status: "confirmed", workflowStatus: "SELLER_ACCEPTED" }), expect.anything());
    expect(mockRemoveSeller).toHaveBeenCalledWith("ORD-FORCE-1");
    expect(mockRemoveBroadcastStart).toHaveBeenCalledWith("ORD-FORCE-1");
    expect(mockRemoveDeliveryTimeout).toHaveBeenCalledWith("ORD-FORCE-1", 3); // the order's current attempt
  });
});

describe("forceOrderStatus - leaving / entering the rider search", () => {
  test("forcing an order OUT of the search stops the loop: popups withdrawn, assignment cancelled", async () => {
    state.order = baseOrder({ workflowStatus: "DELIVERY_SEARCH", status: "packed" });
    await forceOrderStatus(state.order._id, "confirmed", {});
    expect(mockRetract).toHaveBeenCalledWith("ORD-FORCE-1");
    expect(mockAssignmentUpdateMany).toHaveBeenCalledWith({ orderId: "ORD-FORCE-1", status: "broadcasting" }, { $set: { status: "cancelled" } });
    expect(mockStartSearch).not.toHaveBeenCalled();
  });

  test("forcing 'Packed' on an order with no rider starts the rider search", async () => {
    state.order = baseOrder({ workflowStatus: "SELLER_ACCEPTED", status: "confirmed" });
    await forceOrderStatus(state.order._id, "packed", {});
    expect(mockStartSearch).toHaveBeenCalledTimes(1);
  });

  test("'Packed' on an order that is already searching does NOT start another loop", async () => {
    state.order = baseOrder({ workflowStatus: "DELIVERY_SEARCH", status: "packed" });
    await forceOrderStatus(state.order._id, "packed", {});
    expect(mockStartSearch).not.toHaveBeenCalled();
  });
});

describe("forceOrderStatus - cancelling", () => {
  test("an active order: stock restored, refund issued, invoice cancelled, customer notified - no warnings", async () => {
    state.order = baseOrder({ workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery" });
    const res = await forceOrderStatus(state.order._id, "cancelled", { reason: "customer unreachable" });

    expect(mockCompensate).toHaveBeenCalledTimes(1);
    expect(mockReverseFinance).toHaveBeenCalledTimes(1);
    expect(mockCancelInvoice).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cancelledBy: "admin" }));
    expect(mockNotify).toHaveBeenCalledWith(expect.stringMatching(/CANCELLED/i), expect.any(Object));
    expect(res.warnings).toEqual([]);
    expect(res.order.cancelReason).toBe("customer unreachable");
  });

  test("a refund is not issued twice: skipped when the order's finance was already cancelled", async () => {
    state.order = baseOrder({ workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery", settlementStatus: { overall: "CANCELLED" } });
    await forceOrderStatus(state.order._id, "cancelled", {});
    expect(mockReverseFinance).not.toHaveBeenCalled();
  });

  test("an already DELIVERED order: stock is NOT put back (the goods are with the customer), nothing financial is reversed, and the admin is warned", async () => {
    state.order = baseOrder({ workflowStatus: "DELIVERED", status: "delivered", deliveredAt: new Date() });
    const res = await forceOrderStatus(state.order._id, "cancelled", {});
    expect(mockCompensate).not.toHaveBeenCalled();
    expect(mockReverseFinance).not.toHaveBeenCalled();
    expect(res.warnings.join(" ")).toMatch(/stock was NOT restored/i);
    expect(res.warnings.join(" ")).toMatch(/NOT reversed/i);
  });

  test("cancelling an already-cancelled order does nothing", async () => {
    state.order = baseOrder({ workflowStatus: "CANCELLED", status: "cancelled" });
    const res = await forceOrderStatus(state.order._id, "cancelled", {});
    expect(res.changed).toBe(false);
    expect(mockCompensate).not.toHaveBeenCalled();
  });

  test("a failing refund is REPORTED as a warning - the status change itself still succeeds", async () => {
    state.order = baseOrder({ workflowStatus: "SELLER_ACCEPTED", status: "confirmed" });
    mockReverseFinance.mockRejectedValueOnce(new Error("wallet locked"));
    const res = await forceOrderStatus(state.order._id, "cancelled", {});
    expect(res.changed).toBe(true);
    expect(res.order.workflowStatus).toBe("CANCELLED");
    expect(res.warnings.join(" ")).toMatch(/refund this customer manually.*wallet locked/i);
  });
});

describe("forceOrderStatus - reopening a cancelled order", () => {
  test("stock is taken again (and flagged if it goes negative), with a clear refund warning", async () => {
    state.order = baseOrder({ workflowStatus: "CANCELLED", status: "cancelled", stockReservation: { status: "RELEASED" } });
    mockProductFind.mockReturnValue({ select: () => ({ lean: async () => [{ name: "Amul Butter", stock: -1 }] }) });

    const res = await forceOrderStatus(state.order._id, "confirmed", {});

    expect(mockBulkWrite).toHaveBeenCalledTimes(1);
    const [ops] = mockBulkWrite.mock.calls[0];
    expect(ops[0].updateOne.update.$inc.stock).toBe(-2); // taken, not released
    expect(mockOrderUpdateOne).toHaveBeenCalledWith({ _id: state.order._id }, expect.objectContaining({ $set: expect.objectContaining({ "stockReservation.status": "COMMITTED" }) }));
    expect(res.warnings.join(" ")).toMatch(/negative for: Amul Butter/);
    expect(res.warnings.join(" ")).toMatch(/refund already issued.*NOT taken back/i);
    expect(mockCompensate).not.toHaveBeenCalled();
  });

  test("variant stock is taken from the right variant", async () => {
    state.order = baseOrder({ workflowStatus: "CANCELLED", status: "cancelled", items: [{ product: oid(), quantity: 1, variantSlot: "500g" }] });
    await forceOrderStatus(state.order._id, "pending", {});
    const [ops] = mockBulkWrite.mock.calls[0];
    expect(ops[0].updateOne.filter["variants.sku"]).toBe("500g");
    expect(ops[0].updateOne.update.$inc).toMatchObject({ stock: -1, "variants.$.stock": -1 });
  });
});

describe("forceOrderStatus - delivered / out for delivery", () => {
  test("delivered runs the normal settlement", async () => {
    state.order = baseOrder({ workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery", deliveryBoy: riderA });
    const res = await forceOrderStatus(state.order._id, "delivered", {});
    expect(mockSettle).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(expect.stringMatching(/DELIVERED/i), expect.any(Object));
    expect(res.order.deliveredAt).toBeInstanceOf(Date);
  });

  test("a COD order cannot be force-delivered by admin (rider must record the cash)", async () => {
    state.order = baseOrder({ paymentMode: "COD", workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery", deliveryBoy: riderA });
    await expect(forceOrderStatus(state.order._id, "delivered", {})).rejects.toMatchObject({ statusCode: 403 });
    expect(mockSettle).not.toHaveBeenCalled();
  });

  test("an ONLINE order can still be force-delivered", async () => {
    state.order = baseOrder({ paymentMode: "ONLINE", financeFlags: { onlinePaymentCaptured: true }, workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery", deliveryBoy: riderA });
    await forceOrderStatus(state.order._id, "delivered", {});
    expect(mockSettle).toHaveBeenCalledTimes(1);
  });

  test("if settlement fails the order is still marked delivered, with a warning", async () => {
    mockSettle.mockRejectedValueOnce(new Error("seller never accepted"));
    const res = await forceOrderStatus(state.order._id, "delivered", {});
    expect(res.changed).toBe(true);
    expect(res.order.workflowStatus).toBe("DELIVERED");
    expect(res.warnings.join(" ")).toMatch(/settlement could not be applied.*seller never accepted/i);
  });

  test("moving AWAY from delivered warns that settled earnings are not reversed", async () => {
    state.order = baseOrder({ workflowStatus: "DELIVERED", status: "delivered", deliveredAt: new Date() });
    const res = await forceOrderStatus(state.order._id, "out_for_delivery", {});
    expect(res.warnings.join(" ")).toMatch(/NOT reversed/i);
    expect(mockSettle).not.toHaveBeenCalled();
    expect(res.order.deliveredAt).toBeNull();
  });

  test("out for delivery issues the seller's tax invoice (dispatch)", async () => {
    await forceOrderStatus(state.order._id, "out_for_delivery", {});
    expect(mockIssueInvoice).toHaveBeenCalledWith(expect.anything(), { trigger: "DISPATCH" });
  });

  test("rolling BACK from out-for-delivery leaves the issued invoice alone (re-dispatch must reuse it)", async () => {
    state.order = baseOrder({ workflowStatus: "OUT_FOR_DELIVERY", status: "out_for_delivery" });
    await forceOrderStatus(state.order._id, "confirmed", {});
    expect(mockCancelInvoice).not.toHaveBeenCalled();
  });
});

describe("forceOrderStatus - resilience", () => {
  test("every cleanup step failing still leaves the status changed, with warnings", async () => {
    state.order = baseOrder({ workflowStatus: "DELIVERY_SEARCH", status: "packed" });
    mockRemoveSeller.mockRejectedValue(new Error("redis down"));
    mockRetract.mockRejectedValue(new Error("socket down"));
    const res = await forceOrderStatus(state.order._id, "confirmed", {});
    expect(res.changed).toBe(true);
    expect(res.order.workflowStatus).toBe("SELLER_ACCEPTED");
    expect(res.warnings.join(" ")).toMatch(/Rider broadcast could not be fully withdrawn/);
  });

  test("works for a legacy v1 order too", async () => {
    state.order = { _id: oid(), orderId: "ORD-OLD", workflowVersion: 1, status: "pending", customer: oid(), seller: oid(), items: [] };
    const res = await forceOrderStatus(state.order._id, "confirmed", {});
    expect(res.order.status).toBe("confirmed");
    expect(state.updates[0].$set.workflowStatus).toBeUndefined();
  });
});
