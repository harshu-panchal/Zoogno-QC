import { jest } from "@jest/globals";
import mongoose from "mongoose";

const mockSellerFindById = jest.fn();
const mockZoneFindOne = jest.fn();
const mockDeliveryExists = jest.fn();
const mockOrderAggregate = jest.fn();
const mockSettingFindOne = jest.fn();
const mockNotifExists = jest.fn();
const mockNotifUpdateOne = jest.fn();
const mockNotifCreate = jest.fn();

const lean = (v) => ({ select: () => ({ lean: async () => v }), lean: async () => v });

jest.unstable_mockModule("../app/models/seller.js", () => ({ default: { findById: mockSellerFindById } }));
jest.unstable_mockModule("../app/models/zone.js", () => ({ default: { findOne: mockZoneFindOne } }));
jest.unstable_mockModule("../app/models/delivery.js", () => ({ default: { exists: mockDeliveryExists } }));
jest.unstable_mockModule("../app/models/order.js", () => ({ default: { aggregate: mockOrderAggregate } }));
jest.unstable_mockModule("../app/models/setting.js", () => ({ default: { findOne: mockSettingFindOne } }));
jest.unstable_mockModule("../app/models/notification.js", () => ({
  default: { exists: mockNotifExists, updateOne: mockNotifUpdateOne, create: mockNotifCreate },
}));
jest.unstable_mockModule("../app/modules/notifications/notification.emitter.js", () => ({
  emitNotificationEvent: jest.fn(),
}));

const { isDeliveryPartnerEligibleForSeller } = await import("../app/services/deliveryNearbyService.js");
const { emitDeliveryBroadcastToPartner, registerOrderSocketGetter } = await import(
  "../app/services/orderSocketEmitter.js"
);

const oid = () => new mongoose.Types.ObjectId();
const riderId = oid();
const sellerId = oid();
const zonePolygon = { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] };

beforeEach(() => {
  jest.clearAllMocks();
  mockSellerFindById.mockReturnValue(lean({ location: { type: "Point", coordinates: [77.2, 28.6] } }));
  mockZoneFindOne.mockReturnValue(lean({ location: zonePolygon }));
  mockDeliveryExists.mockResolvedValue({ _id: riderId });
  mockSettingFindOne.mockReturnValue(lean({ maxActiveOrdersPerDeliveryBoy: 3 }));
  mockOrderAggregate.mockResolvedValue([]); // rider has no active orders
  delete process.env.DELIVERY_BROADCAST_REQUIRE_VERIFIED;
});

describe("isDeliveryPartnerEligibleForSeller (same rules as a normal broadcast)", () => {
  test("eligible: online rider located inside the seller's active zone with capacity", async () => {
    expect(await isDeliveryPartnerEligibleForSeller(riderId, sellerId)).toBe(true);

    const [filter] = mockDeliveryExists.mock.calls[0];
    expect(filter._id).toBe(riderId);
    expect(filter.isOnline).toBe(true); // must be online
    expect(filter.location.$geoWithin.$geometry).toBe(zonePolygon); // inside the seller's zone
  });

  test("requires verification when DELIVERY_BROADCAST_REQUIRE_VERIFIED is on (same as a normal broadcast)", async () => {
    process.env.DELIVERY_BROADCAST_REQUIRE_VERIFIED = "true";
    await isDeliveryPartnerEligibleForSeller(riderId, sellerId);
    expect(mockDeliveryExists.mock.calls[0][0].isVerified).toBe(true);
  });

  test("not eligible when the rider is outside the seller's zone or offline", async () => {
    mockDeliveryExists.mockResolvedValue(null);
    expect(await isDeliveryPartnerEligibleForSeller(riderId, sellerId)).toBe(false);
  });

  test("not eligible when the rider is already at the max active orders", async () => {
    mockOrderAggregate.mockResolvedValue([{ _id: riderId, count: 3 }]);
    expect(await isDeliveryPartnerEligibleForSeller(riderId, sellerId)).toBe(false);
  });

  test("still eligible one order below the cap", async () => {
    mockOrderAggregate.mockResolvedValue([{ _id: riderId, count: 2 }]);
    expect(await isDeliveryPartnerEligibleForSeller(riderId, sellerId)).toBe(true);
  });

  test("not eligible when the seller is not inside any active zone", async () => {
    mockZoneFindOne.mockReturnValue(lean(null));
    expect(await isDeliveryPartnerEligibleForSeller(riderId, sellerId)).toBe(false);
    expect(mockDeliveryExists).not.toHaveBeenCalled();
  });

  test("not eligible when the seller has no usable location", async () => {
    for (const location of [undefined, { coordinates: [] }, { coordinates: [0, 0] }, { coordinates: [NaN, 1] }]) {
      mockSellerFindById.mockReturnValue(lean({ location }));
      expect(await isDeliveryPartnerEligibleForSeller(riderId, sellerId)).toBe(false);
    }
    expect(mockZoneFindOne).not.toHaveBeenCalled();
  });

  test("missing ids are never eligible", async () => {
    expect(await isDeliveryPartnerEligibleForSeller(null, sellerId)).toBe(false);
    expect(await isDeliveryPartnerEligibleForSeller(riderId, undefined)).toBe(false);
  });

  test("a database error means 'not eligible', never a crash", async () => {
    mockDeliveryExists.mockRejectedValue(new Error("geo index missing"));
    expect(await isDeliveryPartnerEligibleForSeller(riderId, sellerId)).toBe(false);
  });
});

describe("emitDeliveryBroadcastToPartner", () => {
  const emitted = [];
  beforeEach(() => {
    emitted.length = 0;
    registerOrderSocketGetter(() => ({
      to: (room) => ({ emit: (event, body) => emitted.push({ room, event, body }) }),
    }));
  });

  const payload = {
    orderId: "ORD-1",
    preview: { pickup: "Shop", drop: "Home", total: 100 },
    riderEarnings: 30,
    earningsBreakdown: { totalEarning: 30 },
    deliverySearchExpiresAt: new Date("2026-08-15T10:05:00Z"),
    catchUp: true,
  };

  test("sends the live event ONLY to that rider's room", async () => {
    mockNotifExists.mockResolvedValue(null);
    await emitDeliveryBroadcastToPartner(riderId, payload);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ room: `delivery:${riderId}`, event: "delivery:broadcast" });
    expect(emitted[0].body).toMatchObject({ orderId: "ORD-1", catchUp: true });
    expect(emitted[0].body.at).toBeTruthy();
  });

  test("creates the in-app notification row when the rider has none for this order", async () => {
    mockNotifExists.mockResolvedValue(null);
    await emitDeliveryBroadcastToPartner(riderId, payload);

    expect(mockNotifCreate).toHaveBeenCalledTimes(1);
    expect(mockNotifCreate.mock.calls[0][0]).toMatchObject({
      recipientModel: "Delivery",
      type: "order",
      data: { orderId: "ORD-1", riderEarnings: 30 },
    });
    expect(String(mockNotifCreate.mock.calls[0][0].recipient)).toBe(String(riderId));
  });

  test("never duplicates a row the rider already has - refreshes the unread one instead", async () => {
    mockNotifExists.mockResolvedValue({ _id: oid() });
    await emitDeliveryBroadcastToPartner(riderId, payload);

    expect(mockNotifCreate).not.toHaveBeenCalled();
    const [filter, update] = mockNotifUpdateOne.mock.calls[0];
    expect(filter).toMatchObject({ "data.orderId": "ORD-1", isRead: false }); // a dismissed row stays dismissed
    expect(update.$set["data.deliverySearchExpiresAt"]).toEqual(payload.deliverySearchExpiresAt);
  });

  test("a notification-store failure never blocks the live offer", async () => {
    mockNotifExists.mockRejectedValue(new Error("db down"));
    await expect(emitDeliveryBroadcastToPartner(riderId, payload)).resolves.toBeUndefined();
    expect(emitted).toHaveLength(1); // the socket event still went out
  });

  test("ignores a missing/invalid rider or payload", async () => {
    await emitDeliveryBroadcastToPartner(undefined, payload);
    await emitDeliveryBroadcastToPartner("nope", payload);
    await emitDeliveryBroadcastToPartner(riderId, {});
    expect(emitted).toHaveLength(0);
  });
});
