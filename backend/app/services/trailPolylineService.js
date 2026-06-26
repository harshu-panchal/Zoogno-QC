/**
 * trailPolylineService.js
 *
 * Builds an encoded polyline from the rider's real-time GPS trail
 * stored in Firebase RTDB. Uses simplify-js to reduce point density
 * (like Zomato/Uber do for smooth route rendering without relying
 * on the Google Directions API).
 *
 * Fallback chain in getCachedRoute:
 *   1. Google Directions API (ideal)
 *   2. GPS trail from Firebase + simplify-js (this service)
 *   3. Straight-line polyline origin → dest (last resort)
 */

import simplify from "simplify-js";
import polyline from "@mapbox/polyline";
import { getFirebaseRealtimeDb } from "../config/firebaseAdmin.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { withTimeout } from "./firebaseService.js";

const TRAIL_PATH = (orderId) => `/orders/${orderId}/trail`;

/** Average driving speed for ETA estimate (km/h). */
const AVG_SPEED_KMH = 25;

/**
 * Simplify tolerance — in degrees.
 * ~0.00005° ≈ 5 m at equator, good for city roads.
 */
const SIMPLIFY_TOLERANCE = 0.00005;

/**
 * Read all GPS trail points for an order from Firebase RTDB.
 * Each point is { lat, lng, timestamp?, ... }.
 * Returns an array sorted chronologically (push-key order).
 */
async function readTrailPoints(orderId) {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) return [];

    const snapshot = await withTimeout(
      db
        .ref(TRAIL_PATH(orderId))
        .orderByKey()
        .limitToLast(500) // cap to avoid huge reads
        .once("value"),
      1500
    );

    const val = snapshot.val();
    if (!val || typeof val !== "object") return [];

    const points = [];
    for (const key of Object.keys(val)) {
      const p = val[key];
      if (
        p &&
        typeof p.lat === "number" &&
        typeof p.lng === "number" &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng)
      ) {
        points.push({ lat: p.lat, lng: p.lng });
      }
    }
    return points;
  } catch (err) {
    console.warn("[trailPolyline] Failed to read trail:", err.message);
    return [];
  }
}

/**
 * Calculate total Haversine distance along a path of { lat, lng } points.
 */
function totalPathDistance(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distanceMeters(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng,
    );
  }
  return total;
}

/**
 * Estimate duration in seconds from distance in meters
 * using average city driving speed.
 */
function estimateDuration(distMeters) {
  if (!distMeters || distMeters <= 0) return null;
  return Math.round(distMeters / ((AVG_SPEED_KMH * 1000) / 3600));
}

/**
 * Build a polyline from the rider's GPS trail + destination.
 *
 * @param {string} orderId
 * @param {{ lat: number, lng: number }} origin   — rider's current position
 * @param {{ lat: number, lng: number }} dest     — delivery destination
 * @param {string} phase
 * @returns {{ polyline, distanceMeters, duration, bounds, degraded, source, phase } | null}
 */
export async function buildTrailPolyline(orderId, origin, dest, phase = "pickup") {
  const trail = await readTrailPoints(orderId);

  // Build the full path: trail points + current position + destination
  const rawPoints = [];

  // Add trail points (rider's history)
  if (trail.length > 0) {
    rawPoints.push(...trail);
  }

  // Always include current rider position
  if (
    origin &&
    typeof origin.lat === "number" &&
    typeof origin.lng === "number" &&
    Number.isFinite(origin.lat) &&
    Number.isFinite(origin.lng)
  ) {
    rawPoints.push({ lat: origin.lat, lng: origin.lng });
  }

  // Always include destination
  if (
    dest &&
    typeof dest.lat === "number" &&
    typeof dest.lng === "number" &&
    Number.isFinite(dest.lat) &&
    Number.isFinite(dest.lng)
  ) {
    rawPoints.push({ lat: dest.lat, lng: dest.lng });
  }

  if (rawPoints.length < 2) return null;

  // Simplify the path using simplify-js
  // simplify-js expects [{ x, y }] format
  const xyPoints = rawPoints.map((p) => ({ x: p.lng, y: p.lat }));

  const simplified = simplify(xyPoints, SIMPLIFY_TOLERANCE, true);

  if (simplified.length < 2) return null;

  // Convert back to [lat, lng] pairs for polyline encoding
  const latLngPairs = simplified.map((p) => [p.y, p.x]);

  // Encode as @mapbox/polyline
  const encoded = polyline.encode(latLngPairs);

  // Calculate Haversine distance along the simplified path
  const pathPoints = simplified.map((p) => ({ lat: p.y, lng: p.x }));
  const dist = totalPathDistance(pathPoints);
  const duration = estimateDuration(dist);

  // Compute bounds
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const p of pathPoints) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  return {
    polyline: encoded,
    distanceMeters: Math.round(dist),
    duration,
    bounds: {
      northeast: { lat: maxLat, lng: maxLng },
      southwest: { lat: minLat, lng: minLng },
    },
    degraded: false,
    source: "trail",
    phase,
  };
}

/**
 * Last-resort straight-line polyline from origin to destination.
 * Uses Haversine distance for the distance field.
 */
export function buildStraightLinePolyline(origin, dest, phase = "pickup") {
  if (
    !origin ||
    !dest ||
    !Number.isFinite(origin.lat) ||
    !Number.isFinite(origin.lng) ||
    !Number.isFinite(dest.lat) ||
    !Number.isFinite(dest.lng)
  ) {
    return null;
  }

  // Create a multi-point interpolated path for smooth curve
  const steps = 20;
  const latLngPairs = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = origin.lat + (dest.lat - origin.lat) * t;
    const lng = origin.lng + (dest.lng - origin.lng) * t;
    latLngPairs.push([lat, lng]);
  }

  const encoded = polyline.encode(latLngPairs);
  const dist = distanceMeters(origin.lat, origin.lng, dest.lat, dest.lng);
  const duration = estimateDuration(dist);

  return {
    polyline: encoded,
    distanceMeters: Math.round(dist),
    duration,
    bounds: {
      northeast: {
        lat: Math.max(origin.lat, dest.lat),
        lng: Math.max(origin.lng, dest.lng),
      },
      southwest: {
        lat: Math.min(origin.lat, dest.lat),
        lng: Math.min(origin.lng, dest.lng),
      },
    },
    degraded: false,
    source: "straight_line",
    phase,
  };
}
