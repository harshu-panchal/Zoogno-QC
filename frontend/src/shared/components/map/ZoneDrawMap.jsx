import { useCallback, useEffect, useRef, useState } from "react";
import { Search, RotateCcw, Trash2, PenTool, Loader2 } from "lucide-react";
import { loadGoogleMaps } from "@/core/services/googleMapsLoader";
import Input from "@shared/components/ui/Input";
import Button from "@shared/components/ui/Button";

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

export default function ZoneDrawMap({
  coordinates = [],
  onCoordinatesChange,
  center = DEFAULT_CENTER,
  zoom = 5,
  mapKey = "default",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const polygonRef = useRef(null);
  const vertexMarkersRef = useRef([]);
  const coordinatesRef = useRef(coordinates);
  const onCoordinatesChangeRef = useRef(onCoordinatesChange);
  const drawingRef = useRef(true);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [drawing, setDrawing] = useState(true);
  const [mapStatus, setMapStatus] = useState("loading");
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || "";

  useEffect(() => {
    coordinatesRef.current = coordinates;
  }, [coordinates]);

  useEffect(() => {
    onCoordinatesChangeRef.current = onCoordinatesChange;
  }, [onCoordinatesChange]);

  const setDrawingMode = useCallback((value) => {
    drawingRef.current = value;
    setDrawing(value);
    mapRef.current?.setOptions({ draggableCursor: value ? "crosshair" : null });
  }, []);

  const updateCoordinate = useCallback((index, lat, lng) => {
    const next = coordinatesRef.current.map((point, pointIndex) =>
      pointIndex === index ? [lng, lat] : point,
    );
    onCoordinatesChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    if (!apiKey) return undefined;

    let disposed = false;
    const listeners = [];
    setMapStatus("loading");

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (disposed || !containerRef.current) return;
        const first = coordinatesRef.current[0];
        const initialCenter = first
          ? { lat: Number(first[1]), lng: Number(first[0]) }
          : center;
        const map = new maps.Map(containerRef.current, {
          center: initialCenter,
          zoom: first ? Math.max(zoom, 13) : zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          disableDoubleClickZoom: true,
          draggableCursor: "crosshair",
          gestureHandling: "greedy",
        });
        mapRef.current = map;

        listeners.push(
          map.addListener("click", (event) => {
            if (!drawingRef.current) return;
            const lat = event.latLng?.lat();
            const lng = event.latLng?.lng();
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            onCoordinatesChangeRef.current?.([
              ...coordinatesRef.current,
              [lng, lat],
            ]);
          }),
        );

        if (coordinatesRef.current.length >= 3) {
          const bounds = new maps.LatLngBounds();
          coordinatesRef.current.forEach(([lng, lat]) => bounds.extend({ lat, lng }));
          map.fitBounds(bounds, 48);
          setDrawingMode(false);
        }
        setMapStatus("ready");
      })
      .catch(() => {
        if (!disposed) setMapStatus("error");
      });

    return () => {
      disposed = true;
      listeners.forEach((listener) => listener?.remove?.());
      vertexMarkersRef.current.forEach((marker) => marker.setMap(null));
      vertexMarkersRef.current = [];
      polygonRef.current?.setMap(null);
      polygonRef.current = null;
      mapRef.current = null;
    };
  }, [apiKey, center, mapKey, setDrawingMode, zoom]);

  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapRef.current;
    if (!maps || !map || mapStatus !== "ready") return;

    const path = coordinates.map(([lng, lat]) => ({ lat, lng }));
    if (!polygonRef.current) {
      polygonRef.current = new maps.Polygon({
        map,
        strokeColor: "#4f46e5",
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: "#4f46e5",
        fillOpacity: 0.18,
        clickable: false,
      });
    }
    polygonRef.current.setPath(path);

    vertexMarkersRef.current.forEach((marker) => marker.setMap(null));
    vertexMarkersRef.current = path.map((position, index) => {
      const marker = new maps.Marker({
        map,
        position,
        draggable: true,
        label: {
          text: String(index + 1),
          color: "#ffffff",
          fontSize: "10px",
          fontWeight: "700",
        },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: index === 0 ? 7 : 6,
          fillColor: index === 0 ? "#059669" : "#4f46e5",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
        title: index === 0 ? "First boundary point" : `Boundary point ${index + 1}`,
      });
      marker.addListener("dragend", (event) => {
        const lat = event.latLng?.lat();
        const lng = event.latLng?.lng();
        if (Number.isFinite(lat) && Number.isFinite(lng)) updateCoordinate(index, lat, lng);
      });
      if (index === 0) {
        marker.addListener("click", () => {
          if (coordinatesRef.current.length >= 3) setDrawingMode(false);
        });
      }
      return marker;
    });
  }, [coordinates, mapStatus, setDrawingMode, updateCoordinate]);

  const handleSearch = async () => {
    const query = search.trim();
    if (!query || !window.google?.maps?.Geocoder) return;
    setSearching(true);
    try {
      const geocoder = new window.google.maps.Geocoder();
      const response = await geocoder.geocode({
        address: query,
        componentRestrictions: { country: "IN" },
      });
      const location = response.results?.[0]?.geometry?.location;
      if (location) {
        mapRef.current?.panTo(location);
        mapRef.current?.setZoom(13);
      }
    } finally {
      setSearching(false);
    }
  };

  const handleClear = () => {
    onCoordinatesChangeRef.current?.([]);
    setDrawingMode(true);
  };

  const handleUndo = () => {
    onCoordinatesChangeRef.current?.(coordinatesRef.current.slice(0, -1));
    setDrawingMode(true);
  };

  if (!apiKey) {
    return (
      <div className="h-[450px] rounded-lg border border-amber-200 bg-amber-50 flex items-center justify-center text-xs text-amber-800 px-4 text-center">
        Configure <code className="ml-1 font-mono">VITE_GOOGLE_MAPS_API_KEY</code> to draw zones.
      </div>
    );
  }

  if (mapStatus === "error") {
    return (
      <div className="h-[450px] rounded-lg border border-rose-200 bg-rose-50 flex items-center justify-center text-xs text-rose-700 px-4 text-center">
        Google Maps could not be loaded. Check the API key, billing, Maps JavaScript API, and allowed domains.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSearch();
            }
          }}
          placeholder="Search city or area to center map..."
          icon={Search}
        />
        <Button type="button" onClick={handleSearch} disabled={searching || mapStatus !== "ready"}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go"}
        </Button>
      </div>

      <div className="bg-amber-50/90 border border-amber-200/80 text-amber-900 text-xs px-3.5 py-2.5 rounded-lg flex items-center justify-between gap-3">
        <span>
          <strong>How to draw:</strong> Activate drawing, then click boundary corners. Click the green first point or Finish Drawing when done. Drag numbered points to adjust the zone.
        </span>
        <span className={`shrink-0 font-bold px-2 py-0.5 rounded text-[11px] ${coordinates.length >= 3 ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-amber-100 text-amber-800 border border-amber-300"}`}>
          {coordinates.length >= 3 ? `${coordinates.length} points ready` : `${coordinates.length} / 3 min points`}
        </span>
      </div>

      <div className="relative rounded-lg overflow-hidden border border-slate-200 h-[450px]">
        <div ref={containerRef} className="h-full w-full" />
        {mapStatus === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        <div className="absolute bottom-3 left-3 flex gap-2 z-10">
          <button type="button" onClick={() => setDrawingMode(!drawing)} className={`bg-white/95 hover:bg-slate-50 shadow px-2.5 py-1 rounded text-[10px] font-bold flex items-center gap-1 border ${drawing ? "text-violet-700 border-violet-300" : "text-slate-700 border-slate-200"}`}>
            <PenTool size={12} /> {drawing ? "Finish Drawing" : "Draw Polygon"}
          </button>
          <button type="button" onClick={handleUndo} disabled={!coordinates.length} className="bg-white/95 hover:bg-slate-50 disabled:opacity-50 shadow px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 border border-slate-200">
            <RotateCcw size={12} /> Undo
          </button>
          <button type="button" onClick={handleClear} disabled={!coordinates.length} className="bg-white/95 hover:bg-slate-50 disabled:opacity-50 shadow px-2 py-1 rounded text-[10px] font-bold text-rose-600 flex items-center gap-1 border border-slate-200">
            <Trash2 size={12} /> Clear
          </button>
          <span className="bg-white/95 shadow px-2.5 py-1 rounded text-[10px] font-bold text-slate-700 border border-slate-200">
            {coordinates.length} points
          </span>
        </div>
      </div>
    </div>
  );
}
