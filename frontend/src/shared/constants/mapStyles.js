/** Zoogno Mapbox theme — route + style helpers */

export const ZOOGNO_ROUTE_COLOR = "#16a34a";
export const ZOOGNO_ROUTE_WIDTH = 5;
export const ZOOGNO_ROUTE_OPACITY = 0.92;

export function getMapboxStyleUrl() {
  return (
    import.meta.env.VITE_MAPBOX_STYLE?.trim() ||
    "mapbox://styles/mapbox/light-v11"
  );
}

/** @deprecated Google mutedMapStyle — use VITE_MAPBOX_STYLE instead */
export const mutedMapStyle = [];
