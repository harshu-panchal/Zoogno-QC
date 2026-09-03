import { mapboxMapMatch } from "./mapboxClient.js";

/**
 * Snap a delivery partner GPS point to the road network (Map Matching API).
 * Returns null when matching unavailable — caller should use raw GPS.
 */
export async function snapLocationToRoad({ lat, lng, bearing, speed, timestamp }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const now = timestamp || Date.now();
  const points = [{ lat, lng, timestamp: now }];

  if (Number.isFinite(bearing) && Number.isFinite(speed) && speed > 0.5) {
    const backM = Math.min(30, speed * 2);
    const rad = ((bearing - 90) * Math.PI) / 180;
    const dLat = (backM / 111320) * Math.cos(rad);
    const dLng =
      (backM / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(rad);
    points.unshift({
      lat: lat - dLat,
      lng: lng - dLng,
      timestamp: now - 2000,
    });
  }

  return mapboxMapMatch(points);
}
