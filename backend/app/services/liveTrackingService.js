import polyline from "@mapbox/polyline";
import * as redisManager from "./redisManager.js";
import { distanceMeters } from "../utils/geoUtils.js";

const ACTIVE_TTL_SEC = 7200;

function activeKey(orderId) {
  return redisManager.buildKey("tracking", "active", String(orderId));
}

/**
 * Persist latest enriched tracking snapshot for an order (Redis hot state).
 */
export async function setActiveTrackingState(orderId, snapshot) {
  if (!orderId || !snapshot) return;
  try {
    await redisManager.set(activeKey(orderId), snapshot, ACTIVE_TTL_SEC);
  } catch {
    /* ignore */
  }
}

export async function getActiveTrackingState(orderId) {
  if (!orderId) return null;
  try {
    return await redisManager.get(activeKey(orderId));
  } catch {
    return null;
  }
}

export async function clearActiveTrackingState(orderId) {
  if (!orderId) return;
  try {
    await redisManager.del(activeKey(orderId));
  } catch {
    /* ignore */
  }
}

/**
 * Distance from point to encoded route polyline (meters). Used for off-route hints.
 */
export function distanceToPolylineMeters(point, encodedPolyline) {
  if (!point || !encodedPolyline) return null;
  let coords;
  try {
    coords = polyline.decode(encodedPolyline);
  } catch {
    return null;
  }
  if (!coords?.length) return null;

  let min = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const [lat, lng] = coords[i];
    const d = distanceMeters(point.lat, point.lng, lat, lng);
    if (d < min) min = d;
  }
  return Number.isFinite(min) ? min : null;
}

/**
 * Build enriched location payload for Socket + Firebase.
 */
export function buildLiveLocationPayload({
  orderId,
  deliveryId,
  lat,
  lng,
  bearing,
  speed,
  accuracy,
  status,
  etaSeconds,
  distanceRemaining,
  routeVersion,
  matched,
}) {
  const timestamp = new Date().toISOString();
  return {
    order_id: orderId,
    delivery_partner_id: deliveryId,
    orderId,
    deliveryId,
    latitude: lat,
    longitude: lng,
    lat,
    lng,
    bearing: bearing ?? null,
    heading: bearing ?? null,
    speed: speed ?? null,
    accuracy: accuracy ?? null,
    timestamp,
    lastUpdatedAt: timestamp,
    status: status || null,
    eta_seconds: etaSeconds ?? null,
    distance_remaining: distanceRemaining ?? null,
    route_version: routeVersion ?? null,
    matched: Boolean(matched),
    source: matched ? "map_matched" : "gps",
  };
}
