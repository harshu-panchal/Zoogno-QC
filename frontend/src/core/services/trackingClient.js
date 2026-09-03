/**
 * trackingClient.js
 * -----------------
 * Customer-side real-time tracking subscriptions via Firebase RTDB.
 * Mirrors the Firebase paths that the delivery boy's backend writes to:
 *
 *   /deliveryLocations/{orderId}/{deliveryId}  → rider live location
 *   /orders/{orderId}/rider                    → fallback rider location
 *   /orders/{orderId}/route                    → cached route polyline
 *   /orders/{orderId}/trail                    → GPS breadcrumb trail
 *
 * Also hooks into Socket.IO "order:location:update" / "order:route:update"
 * for lower-latency updates.
 */

import { ref, onValue, off } from "firebase/database";
import { getRealtimeDb } from "@/core/firebase/client";
import { getOrderSocket } from "@/core/services/orderSocket";

/** Validate that a location object has finite lat/lng */
function isValidLoc(loc) {
  return (
    loc &&
    typeof loc.lat === "number" &&
    typeof loc.lng === "number" &&
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lng)
  );
}

function enrichLocationFields(raw = {}) {
  const eta =
    raw.eta_seconds != null && Number.isFinite(Number(raw.eta_seconds))
      ? Number(raw.eta_seconds)
      : null;
  const distanceRemaining =
    raw.distance_remaining != null &&
    Number.isFinite(Number(raw.distance_remaining))
      ? Number(raw.distance_remaining)
      : null;
  const routeVersion =
    raw.route_version != null && Number.isFinite(Number(raw.route_version))
      ? Number(raw.route_version)
      : null;

  return {
    eta_seconds: eta,
    distance_remaining: distanceRemaining,
    route_version: routeVersion,
  };
}

function normalizeRoutePayload(val) {
  if (!val?.polyline) return null;
  return {
    polyline: val.polyline,
    phase: val.phase || "pickup",
    distanceMeters: val.distance ?? val.distanceMeters ?? null,
    duration: val.duration ?? null,
    destination: val.destination || null,
    origin: val.origin || null,
    bounds: val.bounds || null,
    route_version: val.route_version ?? null,
    cachedAt: val.cachedAt,
  };
}

/**
 * Subscribe to the rider's live location for an order.
 * Listens to Firebase RTDB /deliveryLocations/{orderId} (primary)
 * and falls back to /orders/{orderId}/rider if nothing is found.
 * Also hooks Socket.IO "order:location:update" for sub-second updates.
 *
 * @param {string} orderId
 * @param {() => string|null} getToken — customer auth token getter for Socket.IO
 * @param {(loc: object) => void} onLocation
 * @returns {() => void} unsubscribe function
 */
export function subscribeToOrderLocation(orderId, getToken, onLocation) {
  if (!orderId || typeof onLocation !== "function") return () => {};

  const db = getRealtimeDb();
  let fbPrimaryRef = null;
  let fbFallbackRef = null;
  let socketOff = null;
  let lastFbTimestamp = 0;

  // ── Firebase primary: /deliveryLocations/{orderId} ──────────────────────
  if (db) {
    fbPrimaryRef = ref(db, `/deliveryLocations/${orderId}`);
    onValue(fbPrimaryRef, (snapshot) => {
      const val = snapshot.val();
      if (!val || typeof val !== "object") return;

      // val is a map of deliveryId → location snapshot — pick most recent valid one
      let bestLoc = null;
      let bestTime = 0;
      for (const key of Object.keys(val)) {
        const raw = val[key];
        if (!raw || !Number.isFinite(Number(raw.lat)) || !Number.isFinite(Number(raw.lng))) continue;
        const t = raw.lastUpdatedAt
          ? new Date(raw.lastUpdatedAt).getTime()
          : raw.timestamp
            ? new Date(raw.timestamp).getTime()
            : 0;
        if (!bestLoc || t > bestTime) {
          bestLoc = {
            lat: Number(raw.lat),
            lng: Number(raw.lng),
            heading:
              raw.heading != null
                ? Number(raw.heading)
                : raw.bearing != null
                  ? Number(raw.bearing)
                  : undefined,
            speed: raw.speed != null ? Number(raw.speed) : undefined,
            accuracy: raw.accuracy != null ? Number(raw.accuracy) : undefined,
            lastUpdatedAt: raw.lastUpdatedAt || raw.timestamp,
            ...enrichLocationFields(raw),
          };
          bestTime = t;
        }
      }

      if (bestLoc && isValidLoc(bestLoc)) {
        lastFbTimestamp = Date.now();
        onLocation(bestLoc);
      }
    });

    // ── Firebase fallback: /orders/{orderId}/rider ──────────────────────────
    fbFallbackRef = ref(db, `/orders/${orderId}/rider`);
    onValue(fbFallbackRef, (snapshot) => {
      // Only use this if primary hasn't sent anything recently (within 10s)
      if (Date.now() - lastFbTimestamp < 10000) return;
      const raw = snapshot.val();
      if (!raw || !Number.isFinite(Number(raw.lat)) || !Number.isFinite(Number(raw.lng))) return;
      const loc = {
        lat: Number(raw.lat),
        lng: Number(raw.lng),
        heading:
          raw.heading != null
            ? Number(raw.heading)
            : raw.bearing != null
              ? Number(raw.bearing)
              : undefined,
        speed: raw.speed != null ? Number(raw.speed) : undefined,
        lastUpdatedAt: raw.lastUpdatedAt,
        ...enrichLocationFields(raw),
      };
      if (isValidLoc(loc)) {
        lastFbTimestamp = Date.now();
        onLocation(loc);
      }
    });
  }

  // ── Socket.IO layer: "order:location:update" (lower latency overlay) ──────
  try {
    const socket = getOrderSocket(getToken);
    if (socket) {
      const handler = (payload) => {
        if (!payload) return;
        const payloadOrderId = payload.orderId || payload.activeOrderId;
        if (payloadOrderId && payloadOrderId !== orderId) return;
        const loc = {
          lat: Number(payload.lat ?? payload.location?.lat ?? payload.location?.latitude),
          lng: Number(payload.lng ?? payload.location?.lng ?? payload.location?.longitude),
          heading:
            payload.heading ??
            payload.bearing ??
            payload.location?.heading ??
            payload.location?.bearing,
          speed: payload.speed ?? payload.location?.speed,
          accuracy: payload.accuracy ?? payload.location?.accuracy,
          lastUpdatedAt:
            payload.lastUpdatedAt ??
            payload.location?.lastUpdatedAt ??
            payload.at,
          ...enrichLocationFields({
            eta_seconds:
              payload.eta_seconds ?? payload.location?.eta_seconds ?? null,
            distance_remaining:
              payload.distance_remaining ??
              payload.location?.distance_remaining ??
              null,
            route_version:
              payload.route_version ?? payload.location?.route_version ?? null,
          }),
        };
        if (isValidLoc(loc)) {
          lastFbTimestamp = Date.now();
          onLocation(loc);
        }
      };
      socket.on("order:location:update", handler);
      socketOff = () => socket.off("order:location:update", handler);
    }
  } catch {
    /* Socket not available */
  }

  // ── Unsubscribe cleanup ───────────────────────────────────────────────────
  return () => {
    if (db) {
      if (fbPrimaryRef) off(fbPrimaryRef);
      if (fbFallbackRef) off(fbFallbackRef);
    }
    if (socketOff) socketOff();
  };
}

/**
 * Subscribe to the cached route polyline for an order.
 * Firebase RTDB `/orders/{orderId}/route` plus Socket.IO `order:route:update`.
 *
 * @param {string} orderId
 * @param {(route: object | null) => void} onRoute
 * @param {() => string|null} [getToken] — optional; enables socket route updates
 * @returns {() => void} unsubscribe
 */
export function subscribeToOrderRoute(orderId, onRoute, getToken) {
  if (!orderId || typeof onRoute !== "function") return () => {};

  const db = getRealtimeDb();
  let routeRef = null;
  let socketOff = null;
  let lastSocketAt = 0;

  if (db) {
    routeRef = ref(db, `/orders/${orderId}/route`);
    onValue(routeRef, (snapshot) => {
      // Prefer recent socket updates (within 5s) to avoid stale Firebase race
      if (Date.now() - lastSocketAt < 5000) return;

      const val = snapshot.val();
      if (!val || !val.polyline) {
        onRoute(null);
        return;
      }

      if (val.expiresAt) {
        const expiresAt = new Date(val.expiresAt).getTime();
        if (expiresAt < Date.now()) {
          onRoute(null);
          return;
        }
      }

      onRoute(normalizeRoutePayload(val));
    });
  }

  try {
    const socket = typeof getToken === "function" ? getOrderSocket(getToken) : null;
    if (socket) {
      const handler = (payload) => {
        if (!payload) return;
        const payloadOrderId = payload.orderId;
        if (payloadOrderId && payloadOrderId !== orderId) return;
        const route = normalizeRoutePayload(payload.route || payload);
        if (!route) return;
        lastSocketAt = Date.now();
        onRoute(route);
      };
      socket.on("order:route:update", handler);
      socketOff = () => socket.off("order:route:update", handler);
    }
  } catch {
    /* Socket not available */
  }

  return () => {
    if (db && routeRef) off(routeRef);
    if (socketOff) socketOff();
  };
}

/**
 * Subscribe to the GPS trail for an order (breadcrumb path).
 * Path: /orders/{orderId}/trail
 *
 * @param {string} orderId
 * @param {(trail: Array<{lat: number, lng: number, t: number}>) => void} onTrail
 * @returns {() => void} unsubscribe
 */
export function subscribeToOrderTrail(orderId, onTrail) {
  if (!orderId || typeof onTrail !== "function") return () => {};

  const db = getRealtimeDb();
  if (!db) return () => {};

  const trailRef = ref(db, `/orders/${orderId}/trail`);
  onValue(trailRef, (snapshot) => {
    const val = snapshot.val();
    if (!val || typeof val !== "object") {
      onTrail([]);
      return;
    }
    const points = Object.values(val)
      .filter((p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
      .map((p) => ({ lat: Number(p.lat), lng: Number(p.lng), t: p.t || 0 }))
      .sort((a, b) => a.t - b.t);
    onTrail(points);
  });

  return () => {
    if (db) off(trailRef);
  };
}
