import mongoose from "mongoose";
import Delivery from "../models/delivery.js";
import Seller from "../models/seller.js";
import Zone from "../models/zone.js";
import Order from "../models/order.js";
import Setting from "../models/setting.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { distanceMeters } from "../utils/geoUtils.js";

/** When true, only verified riders receive broadcasts (stricter). Default: do not require. */
const requireVerifiedForBroadcast = () =>
  process.env.DELIVERY_BROADCAST_REQUIRE_VERIFIED === "true";

const HAVERSINE_FALLBACK_LIMIT = () =>
  parseInt(process.env.DELIVERY_BROADCAST_HAVERSINE_LIMIT || "2000", 10);

function buildDeliveryFilter() {
  const q = { isOnline: true };
  if (requireVerifiedForBroadcast()) {
    q.isVerified = true;
  }
  return q;
}

function filterByHaversine(candidates, lat, lng, maxDistanceM) {
  return candidates
    .filter((d) => {
      const c = d.location?.coordinates;
      if (!Array.isArray(c) || c.length < 2) return false;
      const [dlng, dlat] = c;
      if (!Number.isFinite(dlat) || !Number.isFinite(dlng)) return false;
      if (Math.abs(dlat) < 1e-5 && Math.abs(dlng) < 1e-5) return false;
      return distanceMeters(dlat, dlng, lat, lng) <= maxDistanceM;
    })
    .map((d) => d._id.toString());
}

async function filterByMaxActiveOrders(candidateIds) {
  if (!candidateIds || !candidateIds.length) return [];
  
  const setting = await Setting.findOne().select("maxActiveOrdersPerDeliveryBoy").lean();
  const maxAllowed = setting?.maxActiveOrdersPerDeliveryBoy || 3;

  const activeStatuses = [
    WORKFLOW_STATUS.DELIVERY_ASSIGNED,
    WORKFLOW_STATUS.PICKUP_READY,
    WORKFLOW_STATUS.OUT_FOR_DELIVERY,
    WORKFLOW_STATUS.CUSTOMER_UNREACHABLE,
  ];

  const orderCounts = await Order.aggregate([
    {
      $match: {
        deliveryBoy: { $in: candidateIds.map(id => new mongoose.Types.ObjectId(id)) },
        workflowStatus: { $in: activeStatuses },
        workflowVersion: { $gte: 2 }
      }
    },
    {
      $group: {
        _id: "$deliveryBoy",
        count: { $sum: 1 }
      }
    }
  ]);

  const countMap = {};
  for (const oc of orderCounts) {
    countMap[oc._id.toString()] = oc.count;
  }

  return candidateIds.filter(id => {
    const currentCount = countMap[id] || 0;
    return currentCount < maxAllowed;
  });
}

/**
 * Delivery partner IDs whose last known location is within the seller's
 * `serviceRadius` (km) of the seller store.
 * Uses MongoDB $near first; if that returns no rows, falls back to Haversine
 * (helps when geo index / $near is strict or data is borderline).
 */
export async function getDeliveryPartnerIdsWithinSellerRadius(sellerId) {
  if (!sellerId) return [];

  const seller = await Seller.findById(sellerId)
    .select("location")
    .lean();

  if (!seller?.location?.coordinates?.length) return [];

  const [lng, lat] = seller.location.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  if (Math.abs(lat) < 1e-5 && Math.abs(lng) < 1e-5) return [];

  // Find the active zone containing the seller's store location
  const zone = await Zone.findOne({
    isActive: true,
    location: {
      $geoIntersects: {
        $geometry: seller.location,
      },
    },
  }).lean();

  if (!zone) {
    console.warn(`[deliveryNearby] Seller ${sellerId} is not located in any active zone.`);
    return [];
  }

  const base = buildDeliveryFilter();

  try {
    const candidates = await Delivery.find({
      ...base,
      location: {
        $geoWithin: {
          $geometry: zone.location,
        },
      },
    })
      .select("_id")
      .lean();

    const rawIds = candidates.map((d) => d._id.toString());
    return await filterByMaxActiveOrders(rawIds);
  } catch (e) {
    console.error("[deliveryNearby] Zone-based rider search failed:", e.message);
    return [];
  }
}

/**
 * Generic nearby rider search by coordinates.
 */
export async function getDeliveryPartnerIdsWithinRadius(lat, lng, radiusKm = 5) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  
  const maxDistanceM = radiusKm * 1000;
  const base = buildDeliveryFilter();

  let ids = [];
  try {
    const candidates = await Delivery.find({
      ...base,
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: maxDistanceM,
        },
      },
    })
      .select("_id location")
      .lean();

    ids = filterByHaversine(candidates, lat, lng, maxDistanceM);
  } catch (e) {
    console.warn("[deliveryNearby] $near fallback search failed:", e.message);
  }

  if (ids.length) return await filterByMaxActiveOrders(ids);

  try {
    const rough = await Delivery.find({
      ...base,
      "location.coordinates": { $exists: true },
    })
      .select("_id location")
      .limit(HAVERSINE_FALLBACK_LIMIT())
      .lean();

    const fallbackIds = filterByHaversine(rough, lat, lng, maxDistanceM);
    return await filterByMaxActiveOrders(fallbackIds);
  } catch (e) {
    return [];
  }
}

export async function getDeliveryPartnerIdsWithinCustomerRadius(customerLocation, radiusKm = 5) {
  const lat = customerLocation?.lat;
  const lng = customerLocation?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const zone = await Zone.findOne({
    isActive: true,
    location: {
      $geoIntersects: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
      },
    },
  }).lean();

  if (!zone) {
    console.warn(`[deliveryNearby] Customer location is not in any active zone.`);
    return [];
  }

  const base = buildDeliveryFilter();
  try {
    const candidates = await Delivery.find({
      ...base,
      location: {
        $geoWithin: {
          $geometry: zone.location,
        },
      },
    })
      .select("_id")
      .lean();

    const rawIds = candidates.map((d) => d._id.toString());
    return await filterByMaxActiveOrders(rawIds);
  } catch (e) {
    console.error("[deliveryNearby] Zone-based rider search failed for customer:", e.message);
    return [];
  }
}
