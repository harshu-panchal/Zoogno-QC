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

export async function getNearbySellerIdsForCustomer(lat, lng) {
  const fetchFn = async () => {
    // 1. Find all zones the customer is standing inside
    const customerZones = await Zone.find({
      isActive: true,
      location: {
        $geoIntersects: {
          $geometry: {
            type: "Point",
            coordinates: [Number(lng), Number(lat)],
          },
        },
      },
    }).select("_id");

    if (!customerZones.length) return [];

    const customerZoneIds = customerZones.map((z) => z._id);

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
