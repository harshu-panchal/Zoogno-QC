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
export default function RouteLine({ encoded, id = "zoogno-route" }) {
  if (!encoded) return null;

  let coordinates;
  try {
    coordinates = polyline.decode(encoded).map(([lat, lng]) => [lng, lat]);
  } catch {
    try {
      coordinates = polyline.decode(encoded, 6).map(([lat, lng]) => [lng, lat]);
    } catch {
      return null;
    }
  }

  if (coordinates.length < 2) return null;

  const geojson = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates },
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
