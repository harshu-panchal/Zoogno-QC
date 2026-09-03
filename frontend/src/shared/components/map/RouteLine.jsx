import { Source, Layer } from "react-map-gl/mapbox";
import polyline from "@mapbox/polyline";
import {
  ZOOGNO_ROUTE_COLOR,
  ZOOGNO_ROUTE_OPACITY,
  ZOOGNO_ROUTE_WIDTH,
} from "@/shared/constants/mapStyles.js";

/**
 * GeoJSON LineString layer for encoded route polyline.
 */
export default function RouteLine({ encoded, coordinates, id = "zoogno-route" }) {
  if (!encoded && !coordinates) return null;

  let coords = coordinates;
  if (!coords && encoded) {
    try {
      coords = polyline.decode(encoded).map(([lat, lng]) => [lng, lat]);
    } catch {
      try {
        coords = polyline.decode(encoded, 6).map(([lat, lng]) => [lng, lat]);
      } catch {
        return null;
      }
    }
  }

  if (!coords || coords.length < 2) return null;

  const geojson = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords },
  };

  return (
    <Source id={`${id}-source`} type="geojson" data={geojson}>
      <Layer
        id={`${id}-casing`}
        type="line"
        paint={{
          "line-color": "#ffffff",
          "line-width": ZOOGNO_ROUTE_WIDTH + 3,
          "line-opacity": 0.55,
        }}
        layout={{ "line-cap": "round", "line-join": "round" }}
      />
      <Layer
        id={`${id}-line`}
        type="line"
        paint={{
          "line-color": ZOOGNO_ROUTE_COLOR,
          "line-width": ZOOGNO_ROUTE_WIDTH,
          "line-opacity": ZOOGNO_ROUTE_OPACITY,
        }}
        layout={{ "line-cap": "round", "line-join": "round" }}
      />
    </Source>
  );
}
