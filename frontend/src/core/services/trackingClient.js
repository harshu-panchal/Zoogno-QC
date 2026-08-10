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
 * Also hooks into Socket.IO "order:location:update" for lower-latency updates.
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

/**
 * Subscribe to the rider's live location for an order.
 * Listens to Firebase RTDB /deliveryLocations/{orderId} (primary)
 * and falls back to /orders/{orderId}/rider if nothing is found.
 * Also hooks Socket.IO "order:location:update" for sub-second updates.
 *
 * @param {string} orderId
 * @param {() => string|null} getToken — customer auth token getter for Socket.IO
 * @param {(loc: {lat: number, lng: number, heading?: number, speed?: number}) => void} onLocation
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
        const t = raw.lastUpdatedAt ? new Date(raw.lastUpdatedAt).getTime() : 0;
        if (!bestLoc || t > bestTime) {
          bestLoc = {
            lat: Number(raw.lat),
            lng: Number(raw.lng),
            heading: raw.heading != null ? Number(raw.heading) : undefined,
            speed: raw.speed != null ? Number(raw.speed) : undefined,
            accuracy: raw.accuracy != null ? Number(raw.accuracy) : undefined,
            lastUpdatedAt: raw.lastUpdatedAt,
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
        heading: raw.heading != null ? Number(raw.heading) : undefined,
        speed: raw.speed != null ? Number(raw.speed) : undefined,
        lastUpdatedAt: raw.lastUpdatedAt,
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
        // Payload may carry orderId — filter to this order only
        const payloadOrderId = payload.orderId || payload.activeOrderId;
        if (payloadOrderId && payloadOrderId !== orderId) return;
        const loc = {
          lat: Number(payload.lat),
          lng: Number(payload.lng),
          heading: payload.heading != null ? Number(payload.heading) : undefined,
          speed: payload.speed != null ? Number(payload.speed) : undefined,
          lastUpdatedAt: payload.lastUpdatedAt,
        };
        if (isValidLoc(loc)) {
          lastFbTimestamp = Date.now(); // suppress firebase fallback
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
 * Subscribe to the cached route polyline for an order from Firebase RTDB.
 * Path: /orders/{orderId}/route
 * This is written by the backend's mapsRouteService.getCachedRoute() whenever
 * the delivery boy's map fetches the route.
 *
 * @param {string} orderId
 * @param {(route: {polyline: string, phase: string, distanceMeters: number, duration: number, destination: object} | null) => void} onRoute
 * @returns {() => void} unsubscribe
 */
export function subscribeToOrderRoute(orderId, onRoute) {
  if (!orderId || typeof onRoute !== "function") return () => {};

  const db = getRealtimeDb();
  if (!db) return () => {};

  const routeRef = ref(db, `/orders/${orderId}/route`);
  onValue(routeRef, (snapshot) => {
    const val = snapshot.val();
    if (!val || !val.polyline) {
      onRoute(null);
      return;
    }

    // Check expiry
    if (val.expiresAt) {
      const expiresAt = new Date(val.expiresAt).getTime();
      if (expiresAt < Date.now()) {
        onRoute(null);
        return;
      }
    }

    onRoute({
      polyline: val.polyline,
      phase: val.phase || "pickup",
      distanceMeters: val.distance || val.distanceMeters || null,
      duration: val.duration || null,
      destination: val.destination || null,
      bounds: val.bounds || null,
      cachedAt: val.cachedAt,
    });
  });

  return () => {
    if (db) off(routeRef);
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
