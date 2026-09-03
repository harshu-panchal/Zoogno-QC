/**
 * DeliveryTrackingMap — Mapbox heading-up navigation + live GPS publish.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Map, { Marker } from "react-map-gl/mapbox";
import { Loader2, Crosshair, Navigation, Maximize, Minimize } from "lucide-react";
import customerPin from "@/assets/customer-pin.png";
import storePin from "@/assets/store-pin.png";
import { deliveryApi } from "../services/deliveryApi";
import {
  getCachedDeliveryPartnerLocation,
  saveDeliveryPartnerLocation,
} from "../utils/deliveryLastLocation";
import { registerPrimaryLocationTracker } from "../utils/activeLocationTracker";
import { createLocationPublisher } from "../utils/locationPublisher";
import { useNavigationSession } from "../hooks/useNavigationSession";
import {
  initMapbox,
  getMapboxAccessToken,
  getMapboxStyleUrl,
  isMapboxConfigured,
} from "@/core/services/mapboxLoader";
import { BearingFilter } from "@/core/utils/bearingFilter";
import { computeBearing, boundsFromPoints, snapToPolyline } from "@/core/utils/mapGeometry";
import { useHeadingUpCamera } from "@/core/hooks/useHeadingUpCamera";
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

const DeliveryTrackingMapComponent = ({
  orderId,
  phase,
  order,
  onRouteStatsChange,
}) => {
  const mapRef = useRef(null);
  const bearingFilterRef = useRef(new BearingFilter(0));
  const publisherRef = useRef(null);
  const routeVersionRef = useRef(0);

  const [rawRider, setRawRider] = useState(() => {
    const c = getCachedDeliveryPartnerLocation();
    return c ? { lat: c.lat, lng: c.lng } : null;
  });
  const [bearing, setBearing] = useState(0);
  const [routeData, setRouteData] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const [offRoute, setOffRoute] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const rider = useMemo(() => {
    if (!rawRider) return null;
    if (routeData?.polyline && !offRoute) {
      const snapped = snapToPolyline(rawRider, routeData.polyline);
      if (snapped) return snapped;
    }
    return rawRider;
  }, [rawRider, routeData?.polyline, offRoute]);

  const riderRef = useRef(rider);
  useEffect(() => {
    riderRef.current = rider;
  }, [rider]);

  useEffect(() => registerPrimaryLocationTracker(), []);

  const dest = useMemo(() => {
    const fromOrder = destinationForPhase(order, phase);
    if (fromOrder) return fromOrder;
    const rd = routeData?.destination;
    if (rd?.lat != null && rd?.lng != null) return { lat: rd.lat, lng: rd.lng };
    return null;
  }, [order, phase, routeData]);

  const fetchRouteApi = useCallback(
    (params) => deliveryApi.getOrderRoute(orderId, params),
    [orderId],
  );

  const onRouteChange = useCallback((route, version) => {
    setRouteData(route);
    routeVersionRef.current = version;
  }, []);

  const navSession = useNavigationSession({
    orderId,
    phase,
    rider: rawRider,
    destination: dest,
    fetchRouteApi,
    onRouteChange,
  });

  const evaluateRef = useRef(navSession.evaluate);
  evaluateRef.current = navSession.evaluate;
  const routeMetaRef = useRef({ duration: null, distanceMeters: null });
  routeMetaRef.current = {
    duration: routeData?.duration ?? null,
    distanceMeters: routeData?.distanceMeters ?? routeData?.distance ?? null,
  };
  const orderStatusRef = useRef(order?.workflowStatus);
  orderStatusRef.current = order?.workflowStatus;

  useEffect(() => {
    publisherRef.current = createLocationPublisher(async (payload) => {
      await deliveryApi.postLocation(payload, { timeout: 8000 });
    });
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return undefined;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        const heading = pos.coords.heading;
        const speed = pos.coords.speed;

        const rawNext = { lat, lng };
        setRawRider(rawNext);
        saveDeliveryPartnerLocation(lat, lng);

        let next = rawNext;
        const currentRoute = navSession.getRoute();
        const isCurrentlyOffRoute = navSession.isOffRoute();

        if (currentRoute?.polyline && !isCurrentlyOffRoute) {
          const snapped = snapToPolyline(rawNext, currentRoute.polyline);
          if (snapped) {
            next = snapped;
          }
        }

        const smoothBearing = bearingFilterRef.current.update(
          heading,
          next,
          speed,
          computeBearing,
        );
        const finalHeading = next?.bearing != null ? next.bearing : smoothBearing;
        setBearing(finalHeading);

        setRouteLoading(true);
        const nav = await evaluateRef.current();
        setRouteLoading(false);
        if (nav) setOffRoute(nav.offRoute);

        publisherRef.current?.({
          lat: next.lat,
          lng: next.lng,
          accuracy,
          heading: finalHeading,
          speed,
          orderId: orderId || null,
          eta_seconds: nav?.etaSeconds ?? routeMetaRef.current.duration ?? null,
          distance_remaining:
            nav?.distanceRemaining ?? routeMetaRef.current.distanceMeters ?? null,
          route_version: nav?.routeVersion ?? routeVersionRef.current,
          status: orderStatusRef.current || "OUT_FOR_DELIVERY",
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [orderId]);

  useEffect(() => {
    if (!rider || !dest) return undefined;
    const interval = setInterval(() => {
      evaluateRef.current();
    }, navSession.constants.ETA_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [rider, dest, navSession.constants.ETA_REFRESH_INTERVAL_MS]);

  useEffect(() => {
    if (typeof onRouteStatsChange !== "function") return;
    onRouteStatsChange({
      phase,
      rider,
      destination: dest,
      routeDurationSeconds: Number(routeData?.duration) || null,
      routeDistanceMeters:
        Number(routeData?.distanceMeters ?? routeData?.distance) || null,
      offRoute,
    });
  }, [onRouteStatsChange, phase, rider, dest, routeData, offRoute]);

  const { recenter } = useHeadingUpCamera({
    mapRef,
    target: rider,
    bearing,
    enabled: isFollowing && mapLoaded,
    zoom: 17,
    pitch: 55,
  });

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded || isFollowing) return;
    const points = [];
    if (rider) points.push(rider);
    if (dest) points.push(dest);
    const b = boundsFromPoints(points);
    if (b) map.fitBounds(b, { padding: 48, duration: 500 });
  }, [mapLoaded, rider, dest, isFollowing, routeData?.polyline]);

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
          Set <code className="font-mono">VITE_MAPBOX_ACCESS_TOKEN</code> for live navigation.
        </p>
      </div>
    );
  }

  if (!isMapboxConfigured()) {
    return (
      <div className="relative w-full h-48 bg-amber-50 rounded-2xl flex items-center justify-center text-center px-4 border border-amber-100">
        <p className="text-xs text-amber-800">
          Mapbox dummy token detected — replace with your real public token when ready.
        </p>
      </div>
    );
  }

  useEffect(() => {
    // Mapbox needs a manual resize trigger when the container dimensions change drastically
    const timeout = setTimeout(() => {
      mapRef.current?.resize();
    }, 100);
    return () => clearTimeout(timeout);
  }, [isFullScreen]);

  const initialView = rider
    ? { longitude: rider.lng, latitude: rider.lat, zoom: 16, pitch: 55, bearing }
    : dest
      ? { longitude: dest.lng, latitude: dest.lat, zoom: 14, pitch: 0, bearing: 0 }
      : { longitude: 78.9629, latitude: 20.5937, zoom: 4, pitch: 0, bearing: 0 };

  const mapContent = (
    <div
      className={
        isFullScreen
          ? "fixed inset-0 z-[100] w-screen h-screen overflow-hidden bg-slate-100"
          : "relative w-full h-full overflow-hidden bg-slate-100"
      }
    >
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        mapStyle={styleUrl}
        initialViewState={initialView}
        style={{ width: "100%", height: "100%", minHeight: 200 }}
        onLoad={() => setMapLoaded(true)}
        onDragStart={() => setIsFollowing(false)}
        attributionControl={false}
      >
        <RouteLine encoded={routeData?.polyline} id="delivery-route" />
        {rider && (
          <BikeMarker
            latitude={rider.lat}
            longitude={rider.lng}
            bearing={rider.bearing != null ? rider.bearing : bearing}
          />
        )}
        {dest && (
          <Marker latitude={dest.lat} longitude={dest.lng} anchor="bottom">
            <img src={destPin} alt="" className="w-10 h-10 object-contain" draggable={false} />
          </Marker>
        )}
      </Map>

      <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
        {offRoute && (
          <span className="bg-rose-600 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow">
            Off route — rerouting…
          </span>
        )}
        <span className="bg-white/95 text-slate-700 text-[10px] font-bold px-2 py-1 rounded-md border border-slate-200 shadow-sm flex items-center gap-1">
          <Navigation size={12} className="text-green-600" />
          {routeLoading ? "Updating route…" : "Navigation"}
        </span>
      </div>

      {!isFollowing && (
        <button
          type="button"
          onClick={() => {
            setIsFollowing(true);
            recenter();
          }}
          className="absolute bottom-3 left-3 z-10 bg-green-600 hover:bg-green-700 text-white shadow-md px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1"
        >
          <Crosshair size={14} /> Re-center
        </button>
      )}

      <button
        type="button"
        onClick={() => setIsFullScreen((prev) => !prev)}
        className="absolute bottom-3 right-3 z-10 bg-white/90 hover:bg-white text-slate-700 shadow-md p-2 rounded-md transition-colors flex items-center justify-center"
      >
        {isFullScreen ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>
    </div>
  );

  return isFullScreen ? createPortal(mapContent, document.body) : mapContent;
};

const DeliveryTrackingMap = memo(DeliveryTrackingMapComponent);
export default DeliveryTrackingMap;
