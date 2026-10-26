import { useCallback, useMemo, useState } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint, polygon as turfPolygon } from "@turf/helpers";
import { Search, MapPin, LocateFixed, Loader2 } from "lucide-react";
import {
  getMapboxAccessToken,
  getMapboxStyleUrl,
  initMapbox,
  isMapboxConfigured,
} from "@/core/services/mapboxLoader";
import { mapsApi } from "@/core/services/mapsApi";
import Input from "@shared/components/ui/Input";
import Button from "@shared/components/ui/Button";

initMapbox();

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

export function zonesGeoJson(zones) {
  const features = (zones || [])
    .map((zone) => {
      const ring = zone.location?.coordinates?.[0];
      if (!Array.isArray(ring) || ring.length < 4) return null;
      return {
        type: "Feature",
        properties: { id: zone._id, name: zone.name },
        geometry: { type: "Polygon", coordinates: [ring] },
      };
    })
    .filter(Boolean);
  return { type: "FeatureCollection", features };
}

export function findZoneContainingPoint(lat, lng, zones) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const pt = turfPoint([lng, lat]);
  for (const zone of zones || []) {
    const ring = zone.location?.coordinates?.[0];
    if (!ring?.length) continue;
    try {
      if (booleanPointInPolygon(pt, turfPolygon([ring]))) return zone;
    } catch {
      /* skip malformed */
    }
  }
  return null;
}

export function isPointInAnyZone(lat, lng, zones) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  return Boolean(findZoneContainingPoint(lat, lng, zones));
}

export default function SellerLocationMap({
  zones = [],
  lat,
  lng,
  onLocationChange,
  center = DEFAULT_CENTER,
  zoom = 5,
}) {
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  const token = getMapboxAccessToken();
  const styleUrl = getMapboxStyleUrl();
  const zoneData = useMemo(() => zonesGeoJson(zones), [zones]);

  const reverseAndNotify = useCallback(
    async (newLat, newLng) => {
      let addressFields = {};
      try {
        const res = await mapsApi.reverseGeocode(newLat, newLng);
        const formatted = res.data?.result?.formattedAddress || "";
        addressFields = { formattedAddress: formatted, address: formatted };
      } catch {
        /* coords still valid */
      }
      onLocationChange?.({ lat: newLat, lng: newLng, ...addressFields });
    },
    [onLocationChange],
  );

  const onMapClick = useCallback(
    (evt) => {
      const { lat: newLat, lng: newLng } = evt.lngLat;
      reverseAndNotify(newLat, newLng);
    },
    [reverseAndNotify],
  );

  const handleSearch = async () => {
    const q = search.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await mapsApi.geocodeAddress(q);
      const loc = res.data?.result?.location;
      if (loc?.lat != null && loc?.lng != null) {
        await reverseAndNotify(loc.lat, loc.lng);
      }
    } finally {
      setSearching(false);
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Location access isn't available on this device/browser.");
      return;
    }
    setLocationError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await reverseAndNotify(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
      },
      (err) => {
        setLocationError(
          err?.code === 1
            ? "Location permission denied. Allow location access or pick the pin manually."
            : "Couldn't detect your location. Please pick the pin manually.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  if (!token || !isMapboxConfigured()) {
    return (
      <div className="h-[400px] rounded-xl border border-amber-100 bg-amber-50 flex items-center justify-center text-xs text-amber-800 px-4 text-center">
        Set <code className="font-mono">VITE_MAPBOX_ACCESS_TOKEN</code> to pin your store.
      </div>
    );
  }

  const initialView =
    lat != null && lng != null
      ? { longitude: lng, latitude: lat, zoom: 14 }
      : { longitude: center.lng, latitude: center.lat, zoom };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search address to locate store…"
          icon={Search}
        />
        <Button type="button" onClick={handleSearch} disabled={searching}>
          Search
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleUseMyLocation}
          disabled={locating}
          title="Use my current location"
          className="shrink-0 px-3"
        >
          {locating ? <Loader2 className="animate-spin w-4 h-4" /> : <LocateFixed className="w-4 h-4" />}
        </Button>
      </div>
      {locationError && (
        <p className="text-xs font-semibold text-rose-600 -mt-2">{locationError}</p>
      )}

      <div className="relative rounded-xl overflow-hidden border border-slate-200 h-[400px]">
        <Map
          mapboxAccessToken={token}
          mapStyle={styleUrl}
          initialViewState={{ ...initialView, bearing: 0, pitch: 0 }}
          style={{ width: "100%", height: "100%" }}
          onClick={onMapClick}
          cursor="crosshair"
        >
          <Source id="seller-zones" type="geojson" data={zoneData}>
            <Layer
              id="seller-zones-fill"
              type="fill"
              paint={{ "fill-color": "#4f46e5", "fill-opacity": 0.15 }}
            />
            <Layer
              id="seller-zones-line"
              type="line"
              paint={{ "line-color": "#4f46e5", "line-width": 2 }}
            />
          </Source>

          {lat != null && lng != null && (
            <Marker
              latitude={lat}
              longitude={lng}
              anchor="bottom"
              draggable
              onDragEnd={(e) => reverseAndNotify(e.lngLat.lat, e.lngLat.lng)}
            >
              <MapPin className="w-8 h-8 text-green-600 drop-shadow" />
            </Marker>
          )}
        </Map>
        <div className="absolute top-3 left-3 bg-white/95 text-[10px] font-black uppercase text-brand-600 px-2 py-1 rounded shadow">
          Click or drag pin
        </div>
      </div>
    </div>
  );
}
