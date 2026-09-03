import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { Search, RotateCcw, Trash2 } from "lucide-react";
import {
  getMapboxAccessToken,
  getMapboxStyleUrl,
  initMapbox,
  isMapboxConfigured,
} from "@/core/services/mapboxLoader";
import Input from "@shared/components/ui/Input";
import Button from "@shared/components/ui/Button";

initMapbox();

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

function ringFromDrawFeature(feature) {
  const ring = feature?.geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return [];
  return ring.slice(0, -1).map(([lng, lat]) => [lng, lat]);
}

function featureFromCoordinates(coords) {
  if (!coords?.length || coords.length < 3) return null;
  const ring = [...coords];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

export default function ZoneDrawMap({
  coordinates = [],
  onCoordinatesChange,
  center = DEFAULT_CENTER,
  zoom = 5,
  mapKey = "default",
}) {
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const seededRef = useRef(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);

  const token = getMapboxAccessToken();
  const styleUrl = getMapboxStyleUrl();

  const syncFromDraw = useCallback(() => {
    const draw = drawRef.current;
    if (!draw) return;
    const data = draw.getAll();
    const feature = data.features?.[0];
    if (!feature) {
      onCoordinatesChange?.([]);
      return;
    }
    onCoordinatesChange?.(ringFromDrawFeature(feature));
  }, [onCoordinatesChange]);

  useEffect(() => {
    seededRef.current = false;
  }, [mapKey]);

  const onMapLoad = useCallback(
    (evt) => {
      const map = evt.target;
      mapRef.current = map;

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
        defaultMode: "draw_polygon",
      });
      drawRef.current = draw;
      map.addControl(draw, "top-right");

      map.on("draw.create", syncFromDraw);
      map.on("draw.update", syncFromDraw);
      map.on("draw.delete", syncFromDraw);

      if (!seededRef.current && coordinates.length >= 3) {
        const feature = featureFromCoordinates(coordinates);
        if (feature) {
          draw.add(feature);
          const b = new mapboxgl.LngLatBounds();
          feature.geometry.coordinates[0].forEach(([lng, lat]) => b.extend([lng, lat]));
          map.fitBounds(b, { padding: 40, duration: 0 });
        }
        seededRef.current = true;
      }
    },
    [coordinates, syncFromDraw],
  );

  const handleSearch = async () => {
    const q = search.trim();
    if (!q || !token) return;
    setSearching(true);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&country=in&limit=1`;
      const res = await fetch(url);
      const data = await res.json();
      const f = data.features?.[0];
      if (f?.center) {
        mapRef.current?.flyTo({ center: f.center, zoom: 13, duration: 800 });
      }
    } finally {
      setSearching(false);
    }
  };

  const handleClear = () => {
    drawRef.current?.deleteAll();
    onCoordinatesChange?.([]);
  };

  const handleUndo = () => {
    onCoordinatesChange?.(coordinates.slice(0, -1));
    drawRef.current?.deleteAll();
    const feature = featureFromCoordinates(coordinates.slice(0, -1));
    if (feature) drawRef.current?.add(feature);
  };

  if (!token || !isMapboxConfigured()) {
    return (
      <div className="h-[450px] rounded-lg border border-amber-100 bg-amber-50 flex items-center justify-center text-xs text-amber-800 px-4 text-center">
        Set a real <code className="font-mono">VITE_MAPBOX_ACCESS_TOKEN</code> to draw zones.
      </div>
    );
  }

  const initialView =
    coordinates.length > 0
      ? { longitude: coordinates[0][0], latitude: coordinates[0][1], zoom: 13 }
      : { longitude: center.lng, latitude: center.lat, zoom };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search city or area to center map…"
          icon={Search}
        />
        <Button type="button" onClick={handleSearch} disabled={searching}>
          Go
        </Button>
      </div>

      <div className="relative rounded-lg overflow-hidden border border-slate-200 h-[450px]">
        <Map
          key={mapKey}
          mapboxAccessToken={token}
          mapStyle={styleUrl}
          initialViewState={{ ...initialView, bearing: 0, pitch: 0 }}
          style={{ width: "100%", height: "100%" }}
          onLoad={onMapLoad}
        />
        <div className="absolute bottom-3 left-3 flex gap-2 z-10">
          <button
            type="button"
            onClick={handleUndo}
            className="bg-white/95 shadow px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1"
          >
            <RotateCcw size={12} /> Undo
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="bg-white/95 shadow px-2 py-1 rounded text-[10px] font-bold text-rose-600 flex items-center gap-1"
          >
            <Trash2 size={12} /> Clear
          </button>
          <span className="bg-white/95 shadow px-2 py-1 rounded text-[10px] font-bold text-slate-600">
            {coordinates.length} points
          </span>
        </div>
      </div>
    </div>
  );
}
