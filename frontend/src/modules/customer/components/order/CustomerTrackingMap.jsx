/**
 * CustomerTrackingMap.jsx
 * -----------------------
 * Read-only live tracking map for the customer order detail page.
 * Shows the same map as the delivery boy (same markers, same polyline, same smooth overlay).
 *
 * Key difference from DeliveryTrackingMap:
 *  - Does NOT use GPS / watchPosition
 *  - Does NOT call postLocation()
 *  - Reads rider location from Firebase RTDB + Socket.IO (via trackingClient)
 *  - Reads route polyline from Firebase RTDB (written by backend when delivery map fetches route)
 *  - Falls back to calling GET /orders/workflow/:orderId/route if no Firebase route
 */
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { Loader2, Crosshair, MapPin } from "lucide-react";
import { customerApi } from "../../services/customerApi";
import {
  subscribeToOrderLocation,
  subscribeToOrderRoute,
} from "@/core/services/trackingClient";

// Assets — same ones delivery panel uses
import deliveryIcon from "@/assets/deliveryIcon.png";
import customerPin from "@/assets/customer-pin.png";
import storePin from "@/assets/store-pin.png";

const libraries = ["geometry"];

const containerStyle = {
  width: "100%",
  height: "100%",
  minHeight: "220px",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function coordsToLatLng(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function distanceMeters(from, to) {
  if (!from || !to) return null;
  if (
    !Number.isFinite(from.lat) || !Number.isFinite(from.lng) ||
    !Number.isFinite(to.lat) || !Number.isFinite(to.lng)
  ) return null;
  const r = 6371000;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Resolve the destination for a given phase.
 * pickup phase → seller location
 * delivery phase → customer address
 */
function destinationForPhase(order, phase) {
  const isReturn = order?.returnStatus && order.returnStatus !== "none";
  if (phase === "pickup") {
    if (isReturn) {
      const loc = order?.address?.location;
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
        return { lat: loc.lat, lng: loc.lng };
      }
      return null;
    }
    return coordsToLatLng(order?.seller?.location?.coordinates);
  }
  if (isReturn) {
    return coordsToLatLng(order?.seller?.location?.coordinates);
  }
  const loc = order?.address?.location;
  if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
    return { lat: loc.lat, lng: loc.lng };
  }
  return null;
}

const ROUTE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const ROUTE_REFRESH_THRESHOLD_M = 150;

// ── Component ─────────────────────────────────────────────────────────────────

const CustomerTrackingMapComponent = ({
  orderId,
  phase,
  order,
  getToken,
  onRouteStatsChange,
}) => {
  const mapRef = useRef(null);
  const routePolylineRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);

  // Rider state — populated from Firebase / Socket.IO
  const [rider, setRider] = useState(null);
  const [riderHeading, setRiderHeading] = useState(0);
  const riderRef = useRef(null);

  // Route state — populated from Firebase RTDB cache or API fallback
  const [routeData, setRouteData] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const [isFollowing, setIsFollowing] = useState(true);
  const isFollowingRef = useRef(true);
  useEffect(() => {
    isFollowingRef.current = isFollowing;
  }, [isFollowing]);

  const lastRouteFetchRef = useRef({ at: 0, phase: null, orderId: null });
  const routeOriginRef = useRef(null);
  const routeInFlightRef = useRef(false);
  const routeAbortRef = useRef(null);

  const nativeOverlayRef = useRef(null);
  const liveAnimationRef = useRef(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

  const { isLoaded, loadError } = useJsApiLoader({
    id: "customer-tracking-map",
    googleMapsApiKey: apiKey,
    libraries,
  });

  // ── Subscribe to rider location via Firebase RTDB + Socket.IO ────────────
  useEffect(() => {
    if (!orderId) return;
    const unsub = subscribeToOrderLocation(orderId, getToken, (loc) => {
      setRider({ lat: loc.lat, lng: loc.lng });
      riderRef.current = { lat: loc.lat, lng: loc.lng };
      if (loc.heading != null && Number.isFinite(loc.heading)) {
        setRiderHeading(loc.heading);
      }
    });
    return () => unsub();
  }, [orderId, getToken]);

  // ── Subscribe to route polyline from Firebase RTDB ───────────────────────
  useEffect(() => {
    if (!orderId) return;
    const unsub = subscribeToOrderRoute(orderId, (route) => {
      if (route?.polyline) {
        // Only use if phase matches (or route has no phase tag — treat as compatible)
        const routePhase = route.phase || "pickup";
        if (routePhase === phase || !route.phase) {
          setRouteData(route);
        }
      }
    });
    return () => unsub();
  }, [orderId, phase]);

  // ── API fallback: fetch route when Firebase has no polyline yet ───────────
  const fetchRouteFallback = useCallback(async () => {
    const currentRider = riderRef.current;
    if (!currentRider || !orderId) return;
    if (routeInFlightRef.current) return;

    const now = Date.now();
    const sameCtx =
      lastRouteFetchRef.current.phase === phase &&
      lastRouteFetchRef.current.orderId === orderId;
    const originDrift =
      routeOriginRef.current
        ? distanceMeters(routeOriginRef.current, currentRider)
        : null;

    if (
      sameCtx &&
      lastRouteFetchRef.current.at &&
      now - lastRouteFetchRef.current.at < ROUTE_REFRESH_INTERVAL_MS &&
      (originDrift === null || originDrift < ROUTE_REFRESH_THRESHOLD_M)
    ) {
      return;
    }

    lastRouteFetchRef.current = { at: now, phase, orderId };
    routeInFlightRef.current = true;

    if (routeAbortRef.current) routeAbortRef.current.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;

    setRouteLoading(true);
    try {
      const res = await customerApi.getOrderRoute(
        orderId,
        {
          phase,
          originLat: currentRider.lat,
          originLng: currentRider.lng,
          _t: now,
        },
        { signal: controller.signal }
      );
      if (res.data?.success) {
        const nextRoute = res.data.result || null;
        if (nextRoute?.polyline) {
          setRouteData({ ...nextRoute, phase });
          routeOriginRef.current = { ...currentRider };
        }
      }
    } catch {
      /* silently ignore — firebase subscription will retry */
    } finally {
      routeInFlightRef.current = false;
      if (routeAbortRef.current === controller) routeAbortRef.current = null;
      setRouteLoading(false);
    }
  }, [orderId, phase]);

  // Trigger API fallback when we have a rider location but no route polyline yet
  useEffect(() => {
    if (!rider) return;
    if (routeData?.polyline) return; // Firebase already has it
    fetchRouteFallback();
  }, [rider, routeData?.polyline, fetchRouteFallback]);

  // Reset route when phase/orderId changes
  useEffect(() => {
    setRouteData(null);
    lastRouteFetchRef.current = { at: 0, phase: null, orderId: null };
    routeOriginRef.current = null;
  }, [orderId, phase]);

  // ── Destination ───────────────────────────────────────────────────────────
  const dest = useMemo(() => {
    const fromOrder = destinationForPhase(order, phase);
    if (fromOrder) return fromOrder;
    const rd = routeData?.destination;
    if (rd && Number.isFinite(rd.lat) && Number.isFinite(rd.lng)) {
      return { lat: rd.lat, lng: rd.lng };
    }
    return null;
  }, [order, phase, routeData]);

  // ── Emit route stats to parent (for ETA display) ──────────────────────────
  useEffect(() => {
    if (typeof onRouteStatsChange !== "function") return;
    onRouteStatsChange({
      phase,
      rider,
      destination: dest,
      routeDurationSeconds: Number(routeData?.duration) || null,
      routeDistanceMeters: Number(routeData?.distanceMeters ?? routeData?.distance) || null,
    });
  }, [onRouteStatsChange, phase, rider, dest, routeData]);

  // ── Decode polyline ────────────────────────────────────────────────────────
  const decodedPath = useMemo(() => {
    const encoded = routeData?.polyline;
    if (!encoded || !isLoaded || !mapInstance) return null;
    try {
      const decode = window.google?.maps?.geometry?.encoding?.decodePath;
      if (!decode) return null;
      return decode(encoded);
    } catch {
      return null;
    }
  }, [routeData?.polyline, isLoaded, mapInstance]);

  // ── Native SmoothOverlay for rider marker ─────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !mapInstance || !window.google?.maps) return;
    if (nativeOverlayRef.current) return; // already created
    if (!rider) return; // wait for first location

    class SmoothOverlay extends window.google.maps.OverlayView {
      constructor(pos, heading) {
        super();
        this.position = pos;
        this.heading = heading || 0;
        this.div = null;
      }
      onAdd() {
        this.div = document.createElement("div");
        this.div.style.position = "absolute";
        this.div.style.width = "44px";
        this.div.style.height = "64px";
        this.div.style.transformOrigin = "center center";
        this.div.style.transition = "transform 0.1s linear";
        this.div.style.zIndex = "999";
        const img = document.createElement("img");
        img.src = deliveryIcon;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        this.div.appendChild(img);
        const panes = this.getPanes();
        panes.markerLayer.appendChild(this.div);
      }
      draw() {
        if (!this.div) return;
        const proj = this.getProjection();
        if (!proj || !this.position) return;
        const pos = proj.fromLatLngToDivPixel(
          new window.google.maps.LatLng(this.position)
        );
        if (pos) {
          this.div.style.left = pos.x - 22 + "px";
          this.div.style.top = pos.y - 32 + "px";
          this.div.style.transform = `rotate(${this.heading}deg)`;
        }
      }
      onRemove() {
        if (this.div?.parentNode) {
          this.div.parentNode.removeChild(this.div);
          this.div = null;
        }
      }
      updatePosition(newPos, newHeading) {
        this.position = newPos;
        if (newHeading !== undefined) this.heading = newHeading;
        this.draw();
      }
    }

    nativeOverlayRef.current = new SmoothOverlay(rider, riderHeading);
    nativeOverlayRef.current.setMap(mapInstance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, mapInstance, rider !== null]);

  // ── Smooth interpolation animation when new rider location arrives ────────
  useEffect(() => {
    if (!nativeOverlayRef.current || !rider || !window.google?.maps?.geometry?.spherical) return;

    const currentPos = nativeOverlayRef.current.position;
    if (!currentPos) {
      nativeOverlayRef.current.updatePosition(rider, riderHeading);
      return;
    }

    const newPos = new window.google.maps.LatLng(rider.lat, rider.lng);
    const startPos = new window.google.maps.LatLng(
      typeof currentPos.lat === "function" ? currentPos.lat() : currentPos.lat,
      typeof currentPos.lng === "function" ? currentPos.lng() : currentPos.lng
    );

    const dist = window.google.maps.geometry.spherical.computeDistanceBetween(startPos, newPos);
    if (dist < 1) return;

    if (liveAnimationRef.current) cancelAnimationFrame(liveAnimationRef.current);

    // Interpolate over 3 seconds (location updates come every ~5s from backend)
    const durationMs = 3000;
    const startTime = performance.now();
    let currentCameraHeading = mapRef.current?.getHeading() || riderHeading || 0;

    const animate = (time) => {
      const fraction = Math.min((time - startTime) / durationMs, 1);
      // easeInOutQuad
      const ease = fraction < 0.5 ? 2 * fraction * fraction : 1 - Math.pow(-2 * fraction + 2, 2) / 2;
      const interpolated = window.google.maps.geometry.spherical.interpolate(startPos, newPos, ease);
      const interpLatLng = { lat: interpolated.lat(), lng: interpolated.lng() };

      let headingDiff = riderHeading - currentCameraHeading;
      if (headingDiff > 180) headingDiff -= 360;
      if (headingDiff < -180) headingDiff += 360;
      currentCameraHeading += headingDiff * 0.1;

      nativeOverlayRef.current?.updatePosition(interpLatLng, riderHeading);

      if (mapRef.current && isFollowingRef.current) {
        mapRef.current.moveCamera({
          center: interpLatLng,
          heading: currentCameraHeading,
          tilt: 45,
        });
      }

      if (fraction < 1) {
        liveAnimationRef.current = requestAnimationFrame(animate);
      }
    };

    liveAnimationRef.current = requestAnimationFrame(animate);
    return () => {
      if (liveAnimationRef.current) cancelAnimationFrame(liveAnimationRef.current);
    };
  }, [rider, riderHeading]);

  // ── Draw route polyline ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded || !mapInstance || !window.google?.maps) return;

    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    if (!decodedPath?.length) return;

    const pl = new window.google.maps.Polyline({
      path: decodedPath,
      strokeColor: "#2563eb",
      strokeOpacity: 0.95,
      strokeWeight: 5,
      map: mapInstance,
      zIndex: 10,
    });
    routePolylineRef.current = pl;

    return () => {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
    };
  }, [isLoaded, mapInstance, decodedPath]);

  // ── Initial camera fit ────────────────────────────────────────────────────
  const hasInitialCenteredRef = useRef(false);
  const trackRiderCamera = useCallback((map, riderLocation, heading) => {
    if (!map || !riderLocation) return;
    map.moveCamera({ center: riderLocation, heading: heading || 0, tilt: 45, zoom: 17 });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    if (hasInitialCenteredRef.current) return;

    if (rider) {
      trackRiderCamera(map, rider, riderHeading);
      hasInitialCenteredRef.current = true;
      return;
    }

    try {
      const bounds = new window.google.maps.LatLngBounds();
      let hasPoints = false;
      if (decodedPath?.length) {
        decodedPath.forEach((p) => bounds.extend(p));
        hasPoints = true;
      }
      if (dest) { bounds.extend(dest); hasPoints = true; }
      if (hasPoints) {
        map.fitBounds(bounds, 32);
        hasInitialCenteredRef.current = true;
      }
    } catch { /* ignore */ }
  }, [decodedPath, rider, dest, trackRiderCamera, riderHeading]);

  const handleUserInteraction = useCallback(() => {
    if (isFollowingRef.current) setIsFollowing(false);
  }, []);

  const mapCenter = useMemo(() => {
    if (rider) return rider;
    if (dest) return dest;
    return { lat: 22.9734, lng: 78.6569 }; // India center
  }, [rider, dest]);

  const isReturn = order?.returnStatus && order.returnStatus !== "none";

  // ── Marker icons ──────────────────────────────────────────────────────────
  const customerMarkerIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;
    return {
      url: customerPin,
      scaledSize: new window.google.maps.Size(40, 40),
      anchor: new window.google.maps.Point(20, 40),
    };
  }, [isLoaded]);

  const storeMarkerIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;
    return {
      url: storePin,
      scaledSize: new window.google.maps.Size(40, 40),
      anchor: new window.google.maps.Point(20, 40),
    };
  }, [isLoaded]);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
    setMapInstance(map);
  }, []);

  // ── Early returns ─────────────────────────────────────────────────────────
  if (!apiKey) {
    return (
      <div className="relative w-full h-48 bg-slate-100 rounded-2xl flex items-center justify-center text-center px-4">
        <p className="text-xs text-slate-500">
          Set <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> to show live tracking.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="relative w-full h-48 bg-rose-50 rounded-2xl flex items-center justify-center text-xs text-rose-700 px-4">
        Map failed to load. Check the API key and billing.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="relative w-full h-48 bg-slate-50 rounded-2xl flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-slate-100"
      onMouseDownCapture={handleUserInteraction}
      onTouchStartCapture={handleUserInteraction}
      onWheelCapture={handleUserInteraction}
    >
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={mapCenter}
        zoom={14}
        onLoad={onMapLoad}
        options={{
          mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          tilt: 45,
        }}
      >
        {/* Destination marker (store during pickup, customer during delivery) */}
        {dest && (
          <Marker
            position={dest}
            title={
              phase === "pickup"
                ? isReturn ? "Pickup (customer)" : "Store"
                : isReturn ? "Drop (seller)" : "Your Location"
            }
            icon={
              phase === "pickup"
                ? isReturn ? customerMarkerIcon : storeMarkerIcon
                : isReturn ? storeMarkerIcon : customerMarkerIcon
            }
          />
        )}
      </GoogleMap>

      {/* Waiting for rider overlay */}
      {!rider && (
        <div className="absolute inset-0 flex items-end justify-center pb-8 pointer-events-none">
          <div className="bg-white/95 backdrop-blur shadow-md rounded-2xl px-4 py-2.5 flex items-center gap-2 text-sm font-semibold text-slate-700 border border-slate-200">
            <Loader2 size={15} className="animate-spin text-brand-500 shrink-0" />
            Waiting for rider location...
          </div>
        </div>
      )}

      {/* Re-center button */}
      {!isFollowing && (
        <div className="absolute bottom-3 left-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsFollowing(true);
              if (mapRef.current && rider) {
                mapRef.current.moveCamera({ center: rider, heading: riderHeading || 0, tilt: 45 });
              }
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-md px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
          >
            <Crosshair size={13} /> Track Rider
          </button>
        </div>
      )}

      {/* Route loading indicator */}
      <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur px-2 py-1 rounded-lg text-[10px] text-slate-600 font-bold border border-slate-200 shadow-sm">
        {routeLoading ? "Updating route…" : rider ? "Live Tracking" : "Connecting…"}
      </div>
    </div>
  );
};

// Memoized to prevent unnecessary re-renders (same memo logic as DeliveryTrackingMap)
const CustomerTrackingMap = memo(CustomerTrackingMapComponent, (prev, next) => {
  const destPrev = destinationForPhase(prev.order, prev.phase);
  const destNext = destinationForPhase(next.order, next.phase);
  return (
    prev.orderId === next.orderId &&
    prev.phase === next.phase &&
    destPrev?.lat === destNext?.lat &&
    destPrev?.lng === destNext?.lng
  );
});

CustomerTrackingMap.displayName = "CustomerTrackingMap";

export default CustomerTrackingMap;
