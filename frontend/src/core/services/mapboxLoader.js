import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  getMapboxAccessToken,
  getMapboxStyleUrl,
  isMapboxConfigured,
} from "./mapboxConfig";

let initialized = false;

export { getMapboxAccessToken, getMapboxStyleUrl, isMapboxConfigured };

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
