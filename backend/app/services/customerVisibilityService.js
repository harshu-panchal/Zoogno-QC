import Seller from "../models/seller.js";
import Zone from "../models/zone.js";
import { calculateDistance } from "../utils/helper.js";
import { buildKey, getOrSet, getTTL } from "./cacheService.js";

const MAX_SELLER_SEARCH_DISTANCE_M = 100000;

export function parseCustomerCoordinates(query = {}) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, lat: null, lng: null };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, lat: null, lng: null };
  }

  return { valid: true, lat, lng };
}

/**
 * Round lat/lng to 4 decimal places (~11m precision) for cache key.
 * This groups nearby requests into the same cache bucket.
 */
function buildNearbySellersKey(lat, lng) {
  const rLat = Number(lat).toFixed(4);
  const rLng = Number(lng).toFixed(4);
  return buildKey("sellers", "nearby", `${rLat}:${rLng}`);
}

function buildCustomerZoneIdsKey(lat, lng) {
  const rLat = Number(lat).toFixed(4);
  const rLng = Number(lng).toFixed(4);
  return buildKey("zones", "customer", `${rLat}:${rLng}`);
}

/**
 * Zone(s) whose polygon contains the given point. Shared by any
 * zone-scoped content (offer sections, experience sections, hero config,
 * coupons) that needs to know which zone(s) a customer is currently in.
 * Returns string ids (not ObjectId instances) so callers can use them
 * directly in cache keys or $in queries.
 */
export async function getCustomerZoneIds(lat, lng) {
  const fetchFn = async () => {
    // NOTE: inactive zones are intentionally included. When admin switches a zone
    // off, customers there must still browse products (sellers/content stay visible);
    // ordering is blocked separately via getZoneServiceStatus / assertZoneServiceable.
    const customerZones = await Zone.find({
      location: {
        $geoIntersects: {
          $geometry: {
            type: "Point",
            coordinates: [Number(lng), Number(lat)],
          },
        },
      },
    }).select("_id");

    return customerZones.map((z) => String(z._id));
  };

  return getOrSet(buildCustomerZoneIdsKey(lat, lng), fetchFn, getTTL("nearbySellers"));
}

/**
 * Whether delivery service is switched on for the customer's point.
 * A point is unserviceable only when it lies inside at least one zone and every
 * containing zone is switched off. Points outside all zones are left to the
 * existing "no sellers nearby" behaviour (serviceable: true here).
 * Not cached on purpose: the admin toggle must take effect immediately.
 */
export async function getZoneServiceStatus(lat, lng) {
  const zones = await Zone.find({
    location: {
      $geoIntersects: {
        $geometry: { type: "Point", coordinates: [Number(lng), Number(lat)] },
      },
    },
  })
    .select("name isActive")
    .lean();

  if (!zones.length) return { serviceable: true, zoneId: null, zoneName: null };
  const active = zones.find((z) => z.isActive !== false);
  if (active) return { serviceable: true, zoneId: String(active._id), zoneName: active.name };
  return { serviceable: false, zoneId: String(zones[0]._id), zoneName: zones[0].name };
}

export const ZONE_SERVICE_OFF_MESSAGE =
  "Service is currently unavailable in your zone. Please try again later.";

/** Throws a 403 when the given {lat,lng} lies in a zone that is switched off. */
export async function assertZoneServiceable(location) {
  const coords = parseCustomerCoordinates({ lat: location?.lat, lng: location?.lng });
  if (!coords.valid) return;
  const status = await getZoneServiceStatus(coords.lat, coords.lng);
  if (!status.serviceable) {
    const err = new Error(ZONE_SERVICE_OFF_MESSAGE);
    err.statusCode = 403;
    err.code = "ZONE_SERVICE_OFF";
    throw err;
  }
}

export async function getNearbySellerIdsForCustomer(lat, lng) {
  const fetchFn = async () => {
    // 1. Find all zones the customer is standing inside
    const customerZoneIds = await getCustomerZoneIds(lat, lng);

    if (!customerZoneIds.length) return [];

    // 2. Fetch active & online sellers who selected these zones and are nearby
    const sellers = await Seller.find({
      isActive: true,
      isOnline: { $ne: false },
      zone: { $in: customerZoneIds },
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [Number(lng), Number(lat)],
          },
          $maxDistance: MAX_SELLER_SEARCH_DISTANCE_M,
        },
      },
    }).lean();

    // 3. Filter by individual service radius
    const validSellers = sellers.filter((seller) => {
      const sellerLng = seller.location.coordinates[0];
      const sellerLat = seller.location.coordinates[1];
      const distance = calculateDistance(
        Number(lat),
        Number(lng),
        sellerLat,
        sellerLng
      );
      return distance <= (seller.serviceRadius || 5);
    });

    return validSellers.map((seller) => String(seller._id));
  };

  return getOrSet(buildNearbySellersKey(lat, lng), fetchFn, getTTL("nearbySellers"));
}
