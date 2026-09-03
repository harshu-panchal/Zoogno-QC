import polyline from "@mapbox/polyline";
import * as redisManager from "./redisManager.js";
import { writeRoutePolyline, getRoutePolyline } from "./firebaseService.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { buildTrailPolyline, buildStraightLinePolyline } from "./trailPolylineService.js";
import { mapboxDirections, getMapboxToken } from "./mapboxClient.js";
import { emitOrderRouteUpdate } from "./orderSocketEmitter.js";

const ROUTE_CACHE_TTL_SEC = () =>
  parseInt(process.env.ROUTE_CACHE_TTL_SEC || "900", 10);
const ROUTE_CACHE_MATCH_THRESHOLD_M = () =>
  parseInt(process.env.ROUTE_CACHE_MATCH_THRESHOLD_METERS || "150", 10);

function roundCoord(n) {
  return Math.round(n * 1e5) / 1e5;
}

function cacheKey(origin, dest, mode) {
  const id = `${roundCoord(origin.lat)},${roundCoord(origin.lng)}:${roundCoord(dest.lat)},${roundCoord(dest.lng)}:${mode}`;
  return redisManager.buildKey("maps", "route_v5", id);
}

function degradedPayload() {
  return {
    polyline: null,
    bounds: null,
    distanceMeters: null,
    duration: null,
    degraded: true,
  };
}

function hasValidPoint(point) {
  return (
    point &&
    typeof point.lat === "number" &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng)
  );
}

function isRouteCacheCompatible(cached, origin, dest, phase, mode) {
  if (!cached?.polyline) return false;
  if ((cached.phase || "pickup") !== phase) return false;
  if ((cached.mode || "driving") !== mode) return false;
  if (!hasValidPoint(origin) || !hasValidPoint(dest)) return false;
  if (!hasValidPoint(cached.origin) || !hasValidPoint(cached.destination)) {
    return false;
  }

  const originDrift = distanceMeters(
    origin.lat,
    origin.lng,
    cached.origin.lat,
    cached.origin.lng,
  );
  const destDrift = distanceMeters(
    dest.lat,
    dest.lng,
    cached.destination.lat,
    cached.destination.lng,
  );

  const threshold = Math.max(25, ROUTE_CACHE_MATCH_THRESHOLD_M());
  return originDrift <= threshold && destDrift <= threshold;
}

/** polyline6 → legacy encoded polyline for existing clients */
function normalizePolylineForClient(encoded) {
  if (!encoded || typeof encoded !== "string") return null;
  try {
    const decoded = polyline.decode(encoded, 6);
    if (!decoded?.length) return encoded;
    return polyline.encode(decoded);
  } catch {
    try {
      polyline.decode(encoded);
      return encoded;
    } catch {
      return null;
    }
  }
}

function mapboxProfileForMode(mode) {
  if (mode === "walking") return "mapbox/walking";
  if (mode === "cycling" || mode === "bicycling") return "mapbox/cycling";
  return "mapbox/driving-traffic";
}

/**
 * Cached route via Mapbox Directions with Firebase/Redis/trail/straight fallbacks.
 */
export async function getCachedRoute(
  origin,
  dest,
  mode = "driving",
  orderId = null,
  phase = "pickup",
) {
  if (orderId) {
    try {
      const firebaseRoute = await getRoutePolyline(orderId);
      const cachedPhase = firebaseRoute?.phase || "pickup";
      if (isRouteCacheCompatible(firebaseRoute, origin, dest, phase, mode)) {
        return {
          polyline: firebaseRoute.polyline,
          bounds: firebaseRoute.bounds,
          distanceMeters: firebaseRoute.distance,
          duration: firebaseRoute.duration,
          degraded: false,
          source: "firebase",
          phase: cachedPhase,
          route_version: firebaseRoute.route_version ?? 1,
        };
      }
    } catch {
      /* ignore */
    }
  }

  const key = cacheKey(origin, dest, mode);
  const cached = await redisManager.get(key);
  if (cached?.distanceMeters !== undefined) {
    return { ...cached, source: "redis", phase };
  }

  if (getMapboxToken()) {
    try {
      const profile = mapboxProfileForMode(mode);
      const mb = await mapboxDirections(origin, dest, { profile });
      const encodedPolyline = normalizePolylineForClient(mb.polyline);

      if (encodedPolyline) {
        const payload = {
          polyline: encodedPolyline,
          bounds: mb.bounds,
          distanceMeters: mb.distanceMeters,
          duration: mb.duration,
          degraded: false,
          source: "api",
          phase,
          route_version: Date.now(),
        };

        await redisManager.set(key, payload, ROUTE_CACHE_TTL_SEC());

        if (orderId) {
          try {
            await writeRoutePolyline(orderId, {
              polyline: encodedPolyline,
              phase,
              origin,
              destination: dest,
              mode,
              bounds: mb.bounds,
              distance: mb.distanceMeters,
              duration: mb.duration,
              route_version: payload.route_version,
            });
            emitOrderRouteUpdate(orderId, {
              polyline: encodedPolyline,
              phase,
              origin,
              destination: dest,
              distanceMeters: mb.distanceMeters,
              duration: mb.duration,
              bounds: mb.bounds,
              route_version: payload.route_version,
            });
          } catch {
            /* ignore */
          }
        }

        return payload;
      }
    } catch (err) {
      console.warn("[mapsRoute] Mapbox Directions failed:", err.message);
    }
  }

  if (orderId) {
    try {
      const trailResult = await buildTrailPolyline(orderId, origin, dest, phase);
      if (trailResult?.polyline) return trailResult;
    } catch (err) {
      console.warn("[mapsRoute] Trail fallback failed:", err.message);
    }
  }

  try {
    const straightResult = buildStraightLinePolyline(origin, dest, phase);
    if (straightResult?.polyline) return straightResult;
  } catch {
    /* ignore */
  }

  return degradedPayload();
}
