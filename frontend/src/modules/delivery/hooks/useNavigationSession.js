import { useCallback, useRef } from "react";
import polyline from "@mapbox/polyline";
import { distanceMeters } from "@/core/utils/mapGeometry.js";

const OFF_ROUTE_M = Number(
  import.meta.env.VITE_OFF_ROUTE_THRESHOLD_M || 40,
);
const ROUTE_REFRESH_THRESHOLD_M = 150;
const ROUTE_REFRESH_INTERVAL_MS = 90 * 1000;
const ETA_REFRESH_INTERVAL_MS = 60 * 1000;

function distanceToPolyline(point, encoded) {
  if (!point || !encoded) return null;
  let coords;
  try {
    coords = polyline.decode(encoded);
  } catch {
    return null;
  }
  let min = Infinity;
  for (const [lat, lng] of coords) {
    const d = distanceMeters(point, { lat, lng });
    if (d != null && d < min) min = d;
  }
  return Number.isFinite(min) ? min : null;
}

/**
 * Navigation session: route fetch, off-route detection, ETA, route_version.
 * State is kept in a ref so GPS ticks do not wipe the cached route and
 * re-fetch Directions/Firebase on every render.
 */
export function useNavigationSession({
  orderId,
  phase,
  rider,
  destination,
  fetchRouteApi,
  onRouteChange,
}) {
  const stateRef = useRef({
    route: null,
    routeVersion: 0,
    lastFetchAt: 0,
    lastOrigin: null,
    offRoute: false,
    inFlight: false,
  });

  const orderIdRef = useRef(orderId);
  const phaseRef = useRef(phase);
  const riderRef = useRef(rider);
  const destinationRef = useRef(destination);
  const fetchRouteApiRef = useRef(fetchRouteApi);
  const onRouteChangeRef = useRef(onRouteChange);

  orderIdRef.current = orderId;
  phaseRef.current = phase;
  riderRef.current = rider;
  destinationRef.current = destination;
  fetchRouteApiRef.current = fetchRouteApi;
  onRouteChangeRef.current = onRouteChange;

  const evaluate = useCallback(async () => {
    const currentOrderId = orderIdRef.current;
    const currentPhase = phaseRef.current;
    const currentRider = riderRef.current;
    const currentDestination = destinationRef.current;
    const fetchApi = fetchRouteApiRef.current;
    if (!currentOrderId || !currentRider || !currentDestination || !fetchApi) {
      return null;
    }

    const state = stateRef.current;
    const now = Date.now();
    const encoded = state.route?.polyline;
    const distToRoute = encoded
      ? distanceToPolyline(currentRider, encoded)
      : null;
    const offRoute =
      distToRoute != null && distToRoute > OFF_ROUTE_M && encoded != null;
    state.offRoute = offRoute;

    const originDrift = state.lastOrigin
      ? distanceMeters(state.lastOrigin, currentRider)
      : Infinity;

    const needsRefresh =
      !encoded ||
      offRoute ||
      !state.lastFetchAt ||
      now - state.lastFetchAt > ROUTE_REFRESH_INTERVAL_MS ||
      originDrift > ROUTE_REFRESH_THRESHOLD_M;

    if (!needsRefresh) {
      return {
        route: state.route,
        routeVersion: state.routeVersion,
        offRoute,
        etaSeconds: state.route?.duration ?? null,
        distanceRemaining: state.route?.distanceMeters ?? null,
      };
    }

    if (state.inFlight) {
      return {
        route: state.route,
        routeVersion: state.routeVersion,
        offRoute: state.offRoute,
        etaSeconds: state.route?.duration ?? null,
        distanceRemaining: state.route?.distanceMeters ?? null,
      };
    }

    state.inFlight = true;
    try {
      const res = await fetchApi({
        orderId: currentOrderId,
        phase: currentPhase,
        originLat: currentRider.lat,
        originLng: currentRider.lng,
      });
      const next = res?.data?.result || res?.data?.data || null;
      if (next?.polyline) {
        const versionChanged =
          !state.route?.polyline ||
          next.polyline !== state.route.polyline ||
          offRoute;
        if (versionChanged) {
          state.routeVersion += 1;
        }
        state.route = {
          ...next,
          route_version: next.route_version ?? state.routeVersion,
        };
        state.lastFetchAt = Date.now();
        state.lastOrigin = { ...currentRider };
        onRouteChangeRef.current?.(state.route, state.routeVersion);
      }
    } catch {
      /* keep last route */
    } finally {
      state.inFlight = false;
    }

    return {
      route: state.route,
      routeVersion: state.routeVersion,
      offRoute: state.offRoute,
      etaSeconds: state.route?.duration ?? null,
      distanceRemaining: state.route?.distanceMeters ?? null,
    };
  }, []);

  const reset = useCallback(() => {
    stateRef.current = {
      route: null,
      routeVersion: 0,
      lastFetchAt: 0,
      lastOrigin: null,
      offRoute: false,
      inFlight: false,
    };
  }, []);

  return {
    evaluate,
    getRoute: () => stateRef.current.route,
    getRouteVersion: () => stateRef.current.routeVersion,
    isOffRoute: () => stateRef.current.offRoute,
    reset,
    constants: {
      ETA_REFRESH_INTERVAL_MS,
      ROUTE_REFRESH_INTERVAL_MS,
    },
  };
}
