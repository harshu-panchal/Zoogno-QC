import Seller from "../models/seller.js";
import Delivery from "../models/delivery.js";
import Customer from "../models/customer.js";
import Zone from "../models/zone.js";
import { isPointInPolygon } from "../utils/zoneVisibility.js";

/**
 * Narrows a candidate list of user ids down to the ones whose *current* zone
 * intersects `zoneIds`. Empty/absent `zoneIds` means "All Zones" — every
 * candidate passes through unchanged, matching the rest of the zone-scoping
 * convention (zoneVisibility.js).
 *
 * Each role resolves "current zone" differently because that's all the data
 * model gives us: sellers have a stored `zone` field, delivery partners only
 * have a live GPS point, and customers only have saved addresses.
 */
export async function resolveZoneRestrictedUserIds({ role, userIds = [], zoneIds = [] }) {
  const ids = (userIds || []).map(String).filter(Boolean);
  const targetZoneIds = (zoneIds || []).map(String).filter(Boolean);
  if (!ids.length) return [];
  if (!targetZoneIds.length) return ids;

  if (role === "seller") {
    const sellers = await Seller.find({
      _id: { $in: ids },
      zone: { $in: targetZoneIds },
    })
      .select("_id")
      .lean();
    return sellers.map((s) => String(s._id));
  }

  const zones = await Zone.find({ _id: { $in: targetZoneIds } })
    .select("location")
    .lean();
  if (!zones.length) return [];

  if (role === "delivery") {
    const riders = await Delivery.find({ _id: { $in: ids } })
      .select("_id location")
      .lean();
    return riders
      .filter((rider) => {
        const coords = Array.isArray(rider?.location?.coordinates)
          ? rider.location.coordinates
          : [];
        const [lng, lat] = coords;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
        if (lng === 0 && lat === 0) return false;
        return zones.some((z) => isPointInPolygon([lng, lat], z.location?.coordinates));
      })
      .map((r) => String(r._id));
  }

  // customer (default)
  const customers = await Customer.find({ _id: { $in: ids } })
    .select("_id addresses")
    .lean();
  return customers
    .filter((customer) => {
      const addresses = Array.isArray(customer?.addresses) ? customer.addresses : [];
      return addresses.some((addr) => {
        const lat = Number(addr?.location?.lat);
        const lng = Number(addr?.location?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        return zones.some((z) => isPointInPolygon([lng, lat], z.location?.coordinates));
      });
    })
    .map((c) => String(c._id));
}
