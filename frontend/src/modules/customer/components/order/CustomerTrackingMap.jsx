/**
 * CustomerTrackingMap — read-only live tracking (Mapbox).
 * Consumes the same location/route stream the delivery partner publishes.
 * Bike rotates; map stays north-up (observe mode) for customer UX.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker } from "react-map-gl/mapbox";
import { Loader2, Crosshair, Navigation } from "lucide-react";
import { customerApi } from "../../services/customerApi";
import {
  subscribeToOrderLocation,
  subscribeToOrderRoute,
} from "@/core/services/trackingClient";
import customerPin from "@/assets/customer-pin.png";
import storePin from "@/assets/store-pin.png";
import {
  initMapbox,
  getMapboxAccessToken,
  getMapboxStyleUrl,
  isMapboxConfigured,
} from "@/core/services/mapboxLoader";
import { BearingFilter } from "@/core/utils/bearingFilter";
import { computeBearing, boundsFromPoints, snapToPolyline, decodePolyline } from "@/core/utils/mapGeometry";
import { useSmoothMarker } from "@/core/hooks/useSmoothMarker";
import BikeMarker from "@/shared/components/map/BikeMarker";
import RouteLine from "@/shared/components/map/RouteLine";

initMapbox();

function coordsToLatLng(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function destinationForPhase(order, phase) {
  const isReturn = order?.returnStatus && order.returnStatus !== "none";
  if (phase === "pickup") {
    if (isReturn) {
      const loc = order?.address?.location;
      if (loc?.lat != null && loc?.lng != null) return { lat: loc.lat, lng: loc.lng };
      return null;
    }
    return coordsToLatLng(order?.seller?.location?.coordinates);
  }
  if (isReturn) return coordsToLatLng(order?.seller?.location?.coordinates);
  const loc = order?.address?.location;
  if (loc?.lat != null && loc?.lng != null) return { lat: loc.lat, lng: loc.lng };
  return null;
}

const CustomerTrackingMapComponent = ({
  orderId,
  phase,
  order,
  getToken,
  onRouteStatsChange,
  onLiveLocationChange,
}) => {
  const mapRef = useRef(null);
  const bearingFilterRef = useRef(new BearingFilter(0));
  const routeVersionRef = useRef(null);
  const routeFetchRef = useRef({ inFlight: false, lastAt: 0 });

  const [rider, setRider] = useState(null);
  const [bearing, setBearing] = useState(0);
  const [routeData, setRouteData] = useState(null);
  const [liveEtaSeconds, setLiveEtaSeconds] = useState(null);
  const [liveDistanceM, setLiveDistanceM] = useState(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [routeUpdating, setRouteUpdating] = useState(false);

  const displayRider = useMemo(() => {
    if (!rider) return null;
    if (routeData?.polyline) {
      const snapped = snapToPolyline(rider, routeData.polyline);
      if (snapped) return snapped;
    }
    return rider;
  }, [rider, routeData?.polyline]);

  const smoothRider = useSmoothMarker(displayRider, { durationMs: 2800 });
  const bootstrapDoneRef = useRef(null);
  const onLiveLocationChangeRef = useRef(onLiveLocationChange);
  const onRouteStatsChangeRef = useRef(onRouteStatsChange);

  useEffect(() => {
    onLiveLocationChangeRef.current = onLiveLocationChange;
  }, [onLiveLocationChange]);

  useEffect(() => {
    onRouteStatsChangeRef.current = onRouteStatsChange;
  }, [onRouteStatsChange]);

  const applyRoute = useCallback(
    (route) => {
      if (!route?.polyline) return;
      const routePhase = route.phase || "pickup";
      if (routePhase === phase || !route.phase) {
        setRouteData(route);
        if (route.route_version != null) {
          routeVersionRef.current = route.route_version;
        }
        if (route.duration != null && Number.isFinite(Number(route.duration))) {
          setLiveEtaSeconds(Number(route.duration));
        }
        if (
          route.distanceMeters != null &&
          Number.isFinite(Number(route.distanceMeters))
        ) {
          setLiveDistanceM(Number(route.distanceMeters));
        }
      }
    },
    [phase],
  );

  const fetchRouteFromRider = useCallback(
    async (origin, { force = false } = {}) => {
      if (!orderId || !origin?.lat || !origin?.lng) return;
      const now = Date.now();
      if (
        !force &&
        (routeFetchRef.current.inFlight ||
          now - routeFetchRef.current.lastAt < 5000)
      ) {
        return;
      }
      routeFetchRef.current = { inFlight: true, lastAt: now };
      setRouteUpdating(true);
      try {
        const res = await customerApi.getOrderRoute(orderId, {
          phase,
          originLat: origin.lat,
          originLng: origin.lng,
          _t: now,
        });
        const next = res.data?.result;
        if (next?.polyline) applyRoute({ ...next, phase });
      } catch {
        /* keep last route */
      } finally {
        routeFetchRef.current.inFlight = false;
        setRouteUpdating(false);
      }
    },
    [orderId, phase, applyRoute],
  );

  useEffect(() => {
    if (!orderId) return undefined;
    const unsub = subscribeToOrderLocation(orderId, getToken, (loc) => {
      const next = { lat: loc.lat, lng: loc.lng };
      setRider(next);
      onLiveLocationChangeRef.current?.(loc);

      const h = loc.heading ?? loc.bearing;
      const spd = loc.speed;
      const smooth = bearingFilterRef.current.update(
        h,
        next,
        spd,
        computeBearing,
      );
      setBearing(Number.isFinite(h) ? smooth : bearingFilterRef.current.get());

      if (loc.eta_seconds != null) setLiveEtaSeconds(loc.eta_seconds);
      if (loc.distance_remaining != null) setLiveDistanceM(loc.distance_remaining);

      const nextVersion = loc.route_version;
      if (
        nextVersion != null &&
        routeVersionRef.current != null &&
        nextVersion !== routeVersionRef.current
      ) {
        routeVersionRef.current = nextVersion;
        fetchRouteFromRider(next, { force: true });
      } else if (nextVersion != null && routeVersionRef.current == null) {
        routeVersionRef.current = nextVersion;
      }
    });
    return unsub;
  }, [orderId, getToken, fetchRouteFromRider]);

  useEffect(() => {
    if (!orderId) return undefined;
    const unsub = subscribeToOrderRoute(orderId, applyRoute, getToken);
    return unsub;
  }, [orderId, applyRoute, getToken]);

  useEffect(() => {
    if (!rider || !orderId || routeData?.polyline) return;
    fetchRouteFromRider(rider);
  }, [rider, orderId, routeData?.polyline, fetchRouteFromRider]);

  // Cold-start bootstrap once per order (avoid retry loops when Firebase times out)
  useEffect(() => {
    if (!orderId || rider) return undefined;
    if (bootstrapDoneRef.current === orderId) return undefined;
    bootstrapDoneRef.current = orderId;

    let ignore = false;
    customerApi
      .getOrderTrackingState(orderId)
      .then((res) => {
        if (ignore) return;
        const state = res.data?.result;
        const loc = state?.location || state?.rider || state;
        if (
          loc &&
          Number.isFinite(Number(loc.lat)) &&
          Number.isFinite(Number(loc.lng))
        ) {
          setRider({ lat: Number(loc.lat), lng: Number(loc.lng) });
          if (loc.eta_seconds != null) setLiveEtaSeconds(Number(loc.eta_seconds));
          if (loc.distance_remaining != null) {
            setLiveDistanceM(Number(loc.distance_remaining));
          }
          if (loc.route_version != null) {
            routeVersionRef.current = Number(loc.route_version);
          }
          onLiveLocationChangeRef.current?.(loc);
        }
        if (state?.route?.polyline) applyRoute(state.route);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [orderId, rider, applyRoute]);

  const dest = useMemo(() => {
    const fromOrder = destinationForPhase(order, phase);
    if (fromOrder) return fromOrder;
    const rd = routeData?.destination;
    if (rd?.lat != null && rd?.lng != null) return { lat: rd.lat, lng: rd.lng };
    return null;
  }, [order, phase, routeData]);

  useEffect(() => {
    const cb = onRouteStatsChangeRef.current;
    if (typeof cb !== "function") return;
    cb({
      phase,
      rider: smoothRider,
      destination: dest,
      routeDurationSeconds:
        liveEtaSeconds ?? Number(routeData?.duration) ?? null,
      routeDistanceMeters:
        liveDistanceM ??
        Number(routeData?.distanceMeters ?? routeData?.distance) ??
        null,
      route_version: routeVersionRef.current,
    });
  }, [
    phase,
    smoothRider,
    dest,
    routeData,
    liveEtaSeconds,
    liveDistanceM,
  ]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded || !isFollowing || !smoothRider) return;
    map.easeTo({
      center: [smoothRider.lng, smoothRider.lat],
      zoom: 15.5,
      pitch: 30,
      bearing: 0,
      duration: 400,
      essential: true,
    });
  }, [smoothRider?.lat, smoothRider?.lng, mapLoaded, isFollowing]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded || isFollowing) return;
    const points = [];
    if (smoothRider) points.push(smoothRider);
    if (dest) points.push(dest);
    const b = boundsFromPoints(points);
    if (b) map.fitBounds(b, { padding: 48, duration: 500, pitch: 0 });
  }, [mapLoaded, smoothRider, dest, isFollowing, routeData?.polyline]);

  const token = getMapboxAccessToken();
  const styleUrl = getMapboxStyleUrl();
  const isReturn = order?.returnStatus && order.returnStatus !== "none";

  const destPin =
    phase === "pickup"
      ? isReturn
        ? customerPin
        : storePin
      : isReturn
        ? storePin
        : customerPin;

  if (!token) {
    return (
      <div className="relative w-full h-48 bg-slate-100 rounded-2xl flex items-center justify-center text-center px-4">
        <p className="text-xs text-slate-500">
          Set <code className="font-mono">VITE_MAPBOX_ACCESS_TOKEN</code> to show live tracking.
        </p>
      </div>
    );
  }

  if (!isMapboxConfigured()) {
    return (
      <div className="relative w-full h-48 bg-amber-50 rounded-2xl flex items-center justify-center text-center px-4 border border-amber-100">
        <p className="text-xs text-amber-800">
          Mapbox dummy token — add your real public token to enable the live map.
        </p>
      </div>
    );
  }

  const trimmedRouteCoords = useMemo(() => {
    if (!routeData?.polyline) return null;
    const coords = decodePolyline(routeData.polyline);
    if (!coords || coords.length === 0) return null;

    if (displayRider?.segmentIndex != null) {
      const sliced = coords.slice(displayRider.segmentIndex);
      if (sliced.length > 0) {
        if (smoothRider) {
          sliced[0] = { lat: smoothRider.lat, lng: smoothRider.lng };
        } else {
          sliced[0] = { lat: displayRider.lat, lng: displayRider.lng };
        }
        return sliced.map(p => [p.lng, p.lat]);
      }
    }
    return coords.map(p => [p.lng, p.lat]);
  }, [routeData?.polyline, displayRider, smoothRider]);

  const initialView = smoothRider
    ? {
        longitude: smoothRider.lng,
        latitude: smoothRider.lat,
        zoom: 15.5,
        bearing: 0,
        pitch: 30,
      }
    : dest
      ? { longitude: dest.lng, latitude: dest.lat, zoom: 14, bearing: 0, pitch: 0 }
      : { longitude: 78.9629, latitude: 20.5937, zoom: 4, bearing: 0, pitch: 0 };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-100">
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        mapStyle={styleUrl}
        initialViewState={initialView}
        style={{ width: "100%", height: "100%", minHeight: 220 }}
        onLoad={() => setMapLoaded(true)}
        onDragStart={() => setIsFollowing(false)}
        attributionControl={false}
      >
        <RouteLine coordinates={trimmedRouteCoords} id="customer-route" />
        {smoothRider && (
          <BikeMarker
            latitude={smoothRider.lat}
            longitude={smoothRider.lng}
            bearing={displayRider?.bearing != null ? displayRider.bearing : bearing}
          />
        )}
        {dest && (
          <Marker latitude={dest.lat} longitude={dest.lng} anchor="bottom">
            <img src={destPin} alt="" className="w-10 h-10 object-contain" draggable={false} />
          </Marker>
        )}
      </Map>

      {routeUpdating && (
        <div className="absolute top-2 left-2 z-10">
          <span className="bg-white/95 text-slate-700 text-[10px] font-bold px-2 py-1 rounded-md border border-slate-200 shadow-sm flex items-center gap-1">
            <Navigation size={12} className="text-green-600" />
            Updating route…
          </span>
        </div>
      )}

      {!smoothRider && (() => {
        const ws = String(order?.workflowStatus || "").toUpperCase();
        const hasDeliveryBoy = Boolean(order?.deliveryBoy);
        const isOutForDelivery =
          ws === "OUT_FOR_DELIVERY" ||
          String(order?.status || "").toLowerCase() === "out_for_delivery" ||
          Number(order?.deliveryRiderStep) >= 3;
        const isAssigned =
          hasDeliveryBoy ||
          ws === "DELIVERY_ASSIGNED" ||
          ws === "PICKUP_READY" ||
          Number(order?.deliveryRiderStep) >= 1;

        let overlayMessage = "Waiting for delivery partner…";
        if (isOutForDelivery) {
          overlayMessage = "Locating rider on map…";
        } else if (isAssigned) {
          overlayMessage = "Locating delivery partner…";
        }

        return (
          <div className="absolute inset-0 flex items-end justify-center pb-8 pointer-events-none">
            <div className="bg-white/95 backdrop-blur shadow-md rounded-2xl px-4 py-2.5 flex items-center gap-2 text-sm font-semibold text-slate-700 border border-slate-200">
              <Loader2 size={15} className="animate-spin text-green-600 shrink-0" />
              {overlayMessage}
            </div>
          </div>
        );
      })()}

      {!isFollowing && smoothRider && (
        <button
          type="button"
          onClick={() => setIsFollowing(true)}
          className="absolute bottom-3 left-3 z-10 bg-green-600 hover:bg-green-700 text-white shadow-md px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1"
        >
          <Crosshair size={14} /> Re-center
        </button>
      )}
    </div>
  );
};

const CustomerTrackingMap = memo(CustomerTrackingMapComponent);
export default CustomerTrackingMap;
