import { useCallback, useMemo, useState } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint, polygon as turfPolygon } from "@turf/helpers";
import { Search, MapPin } from "lucide-react";
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

function zonesGeoJson(zones) {
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

export function isPointInAnyZone(lat, lng, zones) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  const pt = turfPoint([lng, lat]);
  for (const zone of zones || []) {
    const ring = zone.location?.coordinates?.[0];
    if (!ring?.length) continue;
    try {
      if (booleanPointInPolygon(pt, turfPolygon([ring]))) return true;
    } catch {
      /* skip malformed */
    }
  }
  return false;
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
      </div>

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
