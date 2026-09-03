import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

let initialized = false;

export function getMapboxAccessToken() {
  return import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() || "";
}

export function getMapboxStyleUrl() {
  return (
    import.meta.env.VITE_MAPBOX_STYLE?.trim() ||
    "mapbox://styles/mapbox/light-v11"
  );
}

export function isMapboxConfigured() {
  const token = getMapboxAccessToken();
  return Boolean(token && !token.includes("dummy"));
}

/** Single init — safe to call multiple times. */
export function initMapbox() {
  const token = getMapboxAccessToken();
  if (!token) return false;
  if (!initialized) {
    mapboxgl.accessToken = token;
    initialized = true;
  }
  return true;
}

export { mapboxgl };
