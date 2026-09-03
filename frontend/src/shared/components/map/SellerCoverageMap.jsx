import { useEffect, useMemo, useRef } from "react";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import circle from "@turf/circle";
import {
  getMapboxAccessToken,
  getMapboxStyleUrl,
  initMapbox,
  isMapboxConfigured,
} from "@/core/services/mapboxLoader";

initMapbox();

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

function sellerCircleGeoJson(sellers, getColor) {
  const features = [];
  for (const seller of sellers) {
    if (!seller.hasValidLocation || !seller.location) continue;
    const { lat, lng } = seller.location;
    const radiusKm = Number(seller.serviceRadiusKm || seller.serviceRadius || 5);
    const radiusMeters = Number(seller.serviceRadiusMeters || radiusKm * 1000);
    const color = getColor(seller.id);
    try {
      const poly = circle([lng, lat], radiusMeters / 1000, {
        steps: 48,
        units: "kilometers",
      });
      poly.properties = {
        sellerId: seller.id,
        color,
        fillOpacity: seller.id === seller.selectedId ? 0.22 : 0.12,
      };
      features.push(poly);
    } catch {
      /* skip invalid */
    }
  }
  return { type: "FeatureCollection", features };
}

export default function SellerCoverageMap({
  mapMeta,
  mapItems = [],
  selectedSeller,
  setSelectedSellerId,
  getSellerColor,
}) {
  const mapRef = useRef(null);
  const token = getMapboxAccessToken();
  const styleUrl = getMapboxStyleUrl();

  const circles = useMemo(() => {
    const withSel = mapItems.map((s) => ({
      ...s,
      selectedId: selectedSeller?.id,
    }));
    return sellerCircleGeoJson(withSel, getSellerColor);
  }, [mapItems, selectedSeller?.id, getSellerColor]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;

    if (selectedSeller?.location) {
      map.flyTo({
        center: [selectedSeller.location.lng, selectedSeller.location.lat],
        zoom: 12,
        duration: 600,
      });
      return;
    }

    if (mapMeta?.bounds) {
      const { south, west, north, east } = mapMeta.bounds;
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 60, duration: 600, maxZoom: 11 },
      );
      return;
    }

    const center = mapMeta?.center || DEFAULT_CENTER;
    map.flyTo({ center: [center.lng, center.lat], zoom: 5, duration: 0 });
  }, [mapMeta, selectedSeller, mapItems.length]);

  if (!token || !isMapboxConfigured()) {
    return (
      <div className="h-full min-h-[680px] flex items-center justify-center bg-slate-100 text-sm text-slate-600 px-6 text-center">
        Configure <code className="font-mono mx-1">VITE_MAPBOX_ACCESS_TOKEN</code> to view seller coverage.
      </div>
    );
  }

  const center = mapMeta?.center || DEFAULT_CENTER;
  const initialView = {
    longitude: center.lng,
    latitude: center.lat,
    zoom: 5,
  };

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={token}
      mapStyle={styleUrl}
      initialViewState={initialView}
      style={{ width: "100%", height: "100%", minHeight: 680 }}
      attributionControl={false}
    >
      <Source id="seller-circles" type="geojson" data={circles}>
        <Layer
          id="seller-circles-fill"
          type="fill"
          paint={{
            "fill-color": ["get", "color"],
            "fill-opacity": ["get", "fillOpacity"],
          }}
        />
        <Layer
          id="seller-circles-line"
          type="line"
          paint={{
            "line-color": ["get", "color"],
            "line-width": 2,
            "line-opacity": 0.65,
          }}
        />
      </Source>

      {mapItems.map((seller) => {
        if (!seller.hasValidLocation || !seller.location) return null;
        const color = getSellerColor(seller.id);
        const isSelected = selectedSeller?.id === seller.id;
        return (
          <Marker
            key={seller.id}
            latitude={seller.location.lat}
            longitude={seller.location.lng}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelectedSellerId?.(seller.id);
            }}
          >
            <div
              className="rounded-full border-2 border-white shadow-md cursor-pointer"
              style={{
                width: isSelected ? 14 : 10,
                height: isSelected ? 14 : 10,
                backgroundColor: color,
              }}
              title={seller.shopName}
            />
          </Marker>
        );
      })}
    </Map>
  );
}
