import { jest } from "@jest/globals";
import mongoose from "mongoose";

const mockOrderFind = jest.fn();
const mockIsEligible = jest.fn();
const mockEmitToPartner = jest.fn();
const mockBuildPayload = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: { find: mockOrderFind },
}));
jest.unstable_mockModule("../app/services/deliveryNearbyService.js", () => ({
  isDeliveryPartnerEligibleForSeller: mockIsEligible,
}));
jest.unstable_mockModule("../app/services/orderSocketEmitter.js", () => ({
  emitDeliveryBroadcastToPartner: mockEmitToPartner,
}));
jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  deliveryBroadcastPayloadFromOrder: mockBuildPayload,
}));

const { offerOpenBroadcastsToDeliveryPartner } = await import(
  "../app/services/deliveryBroadcastCatchUp.js"
);

const oid = () => new mongoose.Types.ObjectId();
const riderId = oid();

function chain(result) {
  const c = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
  return c;
}

let seq = 0;
function openOrder(sellerId, over = {}) {
  seq += 1;
  return {
    _id: oid(),
    orderId: `ORD-OPEN-${seq}`,
    seller: { _id: sellerId, shopName: "Shop" },
    deliverySearchMeta: { attempt: 2 },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  seq = 0;
  mockIsEligible.mockResolvedValue(true);
  mockEmitToPartner.mockResolvedValue(undefined);
  mockBuildPayload.mockImplementation(async (order, extra) => ({
    orderId: order.orderId,
    ...extra,
  }));
});

describe("offerOpenBroadcastsToDeliveryPartner", () => {
  test("offers a rider who just came online every open, eligible order - flagged as a catch-up", async () => {
    const seller = oid();
    const a = openOrder(seller);
    const b = openOrder(seller);
    mockOrderFind.mockReturnValue(chain([a, b]));

    const res = await offerOpenBroadcastsToDeliveryPartner(riderId);

    expect(res).toEqual({ offered: 2, orderIds: [a.orderId, b.orderId] });
    expect(mockEmitToPartner).toHaveBeenCalledTimes(2);
    const [to, payload] = mockEmitToPartner.mock.calls[0];
    expect(String(to)).toBe(String(riderId));
    expect(payload).toMatchObject({ orderId: a.orderId, catchUp: true });
    // Truthy retryAttempt so the app re-opens an order it may already have shown this session.
    expect(payload.retryAttempt).toBeTruthy();
  });

  test("only considers orders still genuinely open to this rider", async () => {
    mockOrderFind.mockReturnValue(chain([]));
    await offerOpenBroadcastsToDeliveryPartner(riderId);

    const [filter] = mockOrderFind.mock.calls[0];
    expect(filter).toMatchObject({
      workflowStatus: "DELIVERY_SEARCH", // still searching - not accepted/cancelled
      deliveryBoy: null, // nobody has accepted it
    });
    expect(filter.deliverySearchExpiresAt.$gt).toBeInstanceOf(Date); // window not expired
    expect(filter.skippedBy).toEqual({ $nin: [riderId] }); // not one this rider rejected
    expect(filter.workflowVersion).toEqual({ $gte: 2 });
  });

  test("oldest orders first - they have waited longest", async () => {
    const c = chain([]);
    mockOrderFind.mockReturnValue(c);
    await offerOpenBroadcastsToDeliveryPartner(riderId);
    expect(c.sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
  });

  test("never offers an order from a seller whose zone the rider is not eligible for", async () => {
    const inZone = oid();
    const outOfZone = oid();
    const a = openOrder(outOfZone);
    const b = openOrder(inZone);
    mockOrderFind.mockReturnValue(chain([a, b]));
    mockIsEligible.mockImplementation(async (_rider, sellerId) => sellerId === String(inZone));

    const res = await offerOpenBroadcastsToDeliveryPartner(riderId);

    expect(res.orderIds).toEqual([b.orderId]);
    expect(mockEmitToPartner).toHaveBeenCalledTimes(1);
  });

  test("checks eligibility once per seller, not once per order", async () => {
    const seller = oid();
    mockOrderFind.mockReturnValue(chain([openOrder(seller), openOrder(seller), openOrder(seller)]));

    await offerOpenBroadcastsToDeliveryPartner(riderId);

    expect(mockIsEligible).toHaveBeenCalledTimes(1);
    expect(mockIsEligible).toHaveBeenCalledWith(riderId, String(seller));
  });

  test("caps the offers so the rider isn't flooded (the app shows one at a time)", async () => {
    const seller = oid();
    mockOrderFind.mockReturnValue(chain(Array.from({ length: 10 }, () => openOrder(seller))));

    const res = await offerOpenBroadcastsToDeliveryPartner(riderId);
    expect(res.offered).toBe(3);

    mockEmitToPartner.mockClear();
    const res2 = await offerOpenBroadcastsToDeliveryPartner(riderId, { maxOffers: 1 });
    expect(res2.offered).toBe(1);
  });

  test("one order failing does not stop the rider being offered the rest", async () => {
    const seller = oid();
    const bad = openOrder(seller);
    const good = openOrder(seller);
    mockOrderFind.mockReturnValue(chain([bad, good]));
    mockBuildPayload.mockImplementation(async (order, extra) => {
      if (order.orderId === bad.orderId) throw new Error("surge lookup exploded");
      return { orderId: order.orderId, ...extra };
    });

    const res = await offerOpenBroadcastsToDeliveryPartner(riderId);
    expect(res.orderIds).toEqual([good.orderId]);
  });

  test("does nothing - and touches nothing - for an invalid rider id", async () => {
    for (const bad of [undefined, null, "", "not-an-object-id"]) {
      expect(await offerOpenBroadcastsToDeliveryPartner(bad)).toEqual({ offered: 0, orderIds: [] });
    }
    expect(mockOrderFind).not.toHaveBeenCalled();
  });

  test("nothing open -> nothing offered", async () => {
    mockOrderFind.mockReturnValue(chain([]));
    expect(await offerOpenBroadcastsToDeliveryPartner(riderId)).toEqual({ offered: 0, orderIds: [] });
    expect(mockEmitToPartner).not.toHaveBeenCalled();
  });

  test("accepts a string id (as it arrives from the request/session)", async () => {
    mockOrderFind.mockReturnValue(chain([openOrder(oid())]));
    const res = await offerOpenBroadcastsToDeliveryPartner(String(riderId));
    expect(res.offered).toBe(1);
  });
});
