import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadGoogleMaps } from "@/core/services/googleMapsLoader";

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

function zonePath(zone) {
  const ring = zone?.location?.coordinates?.[0];
  if (!Array.isArray(ring)) return [];
  return ring
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

export default function GoogleSellerLocationMap({
  lat,
  lng,
  center = DEFAULT_CENTER,
  zoom = 5,
  zones = [],
  onLocationChange,
  className = "h-[400px]",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const polygonsRef = useRef([]);
  const onLocationChangeRef = useRef(onLocationChange);
  const [status, setStatus] = useState("loading");

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || "";

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    if (!apiKey) {
      setStatus("missing-key");
      return undefined;
    }

    let disposed = false;
    let clickListener = null;

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (disposed || !containerRef.current) return;

        const hasPin = Number.isFinite(lat) && Number.isFinite(lng);
        const initialCenter = hasPin ? { lat, lng } : center;
        const map = new maps.Map(containerRef.current, {
          center: initialCenter,
          zoom: hasPin ? Math.max(zoom, 14) : zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        mapRef.current = map;

        clickListener = map.addListener("click", (event) => {
          const nextLat = event.latLng?.lat();
          const nextLng = event.latLng?.lng();
          if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
            onLocationChangeRef.current?.({ lat: nextLat, lng: nextLng });
          }
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!disposed) setStatus("error");
      });

    return () => {
      disposed = true;
      clickListener?.remove?.();
      polygonsRef.current.forEach((polygon) => polygon.setMap(null));
      polygonsRef.current = [];
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [apiKey]);

  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapRef.current;
    if (!maps || !map || status !== "ready") return;

    polygonsRef.current.forEach((polygon) => polygon.setMap(null));
    polygonsRef.current = zones
      .map((zone) => zonePath(zone))
      .filter((path) => path.length >= 3)
      .map(
        (path) =>
          new maps.Polygon({
            map,
            paths: path,
            strokeColor: "#4f46e5",
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: "#4f46e5",
            fillOpacity: 0.14,
            clickable: false,
          }),
      );
  }, [status, zones]);

  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapRef.current;
    if (!maps || !map || status !== "ready") return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const position = { lat, lng };
    if (!markerRef.current) {
      const marker = new maps.Marker({
        map,
        position,
        draggable: true,
        title: "Store location",
      });
      marker.addListener("dragend", (event) => {
        const nextLat = event.latLng?.lat();
        const nextLng = event.latLng?.lng();
        if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
          onLocationChangeRef.current?.({ lat: nextLat, lng: nextLng });
        }
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setPosition(position);
    }
    map.panTo(position);
    if (map.getZoom() < 14) map.setZoom(14);
  }, [lat, lng, status]);

  if (status === "missing-key") {
    return (
      <div className={`${className} rounded-xl border border-amber-200 bg-amber-50 flex items-center justify-center p-5 text-center text-xs font-semibold text-amber-800`}>
        Configure VITE_GOOGLE_MAPS_API_KEY to select the store location.
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={`${className} rounded-xl border border-rose-200 bg-rose-50 flex items-center justify-center p-5 text-center text-xs font-semibold text-rose-700`}>
        Google Maps could not be loaded. Check the API key, Maps JavaScript API, billing, and allowed domains.
      </div>
    );
  }

  return (
    <div className={`relative rounded-xl overflow-hidden border border-slate-200 ${className}`}>
      <div ref={containerRef} className="h-full w-full" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      <div className="pointer-events-none absolute left-3 top-3 rounded bg-white/95 px-2 py-1 text-[10px] font-black uppercase text-brand-600 shadow">
        Click or drag pin
      </div>
    </div>
  );
}
