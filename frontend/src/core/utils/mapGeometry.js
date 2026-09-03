/** Geo + navigation math (replaces google.maps.geometry.spherical). */

const EARTH_R = 6371000;

export function distanceMeters(from, to) {
  if (!from || !to) return null;
  const { lat: lat1, lng: lng1 } = from;
  const { lat: lat2, lng: lng2 } = to;
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2)
  ) {
    return null;
  }
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a1 = (lat1 * Math.PI) / 180;
  const a2 = (lat2 * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a1) * Math.cos(a2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Bearing from A → B in degrees [0, 360). */
export function computeBearing(from, to) {
  if (!from || !to) return 0;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/** Shortest-angle difference in degrees (-180, 180]. */
export function shortestAngleDelta(fromDeg, toDeg) {
  let diff = toDeg - fromDeg;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

/** Calculates continuous cumulative bearing angle to prevent 360-deg spin artifacts on turn transitions. */
export function getContinuousBearing(prevAngle, targetAngle) {
  if (!Number.isFinite(prevAngle)) return targetAngle || 0;
  if (!Number.isFinite(targetAngle)) return prevAngle || 0;
  const delta = shortestAngleDelta(prevAngle % 360, targetAngle % 360);
  return prevAngle + delta;
}

/** Linear interpolate lat/lng. */
export function interpolatePosition(from, to, t) {
  const f = Math.max(0, Math.min(1, t));
  return {
    lat: from.lat + (to.lat - from.lat) * f,
    lng: from.lng + (to.lng - from.lng) * f,
  };
}

/** Ease in-out quad for smooth marker motion. */
export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Bounds from lat/lng points → [[west,south],[east,north]] for mapbox fitBounds. */
export function boundsFromPoints(points) {
  if (!points?.length) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  if (!Number.isFinite(minLat)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

import polyline from "@mapbox/polyline";

/** Decode encoded polyline → [{ lat, lng }] */
export function decodePolyline(encoded) {
  if (!encoded) return [];
  try {
    const coords = polyline.decode(encoded);
    return coords.map(([lat, lng]) => ({ lat, lng }));
  } catch {
    return [];
  }
}

/** 
 * Finds the closest point on a polyline to the given point.
 * Uses a local flat-earth approximation for segment projection.
 */
export function snapToPolyline(point, encoded) {
  if (!point || !encoded) return null;
  const coords = decodePolyline(encoded);
  if (coords.length === 0) return null;
  if (coords.length === 1) return coords[0];

  const pLat = point.lat;
  const pLng = point.lng;
  // Approximation factor for longitude distance vs latitude distance
  const cosLat = Math.cos((pLat * Math.PI) / 180);

  let minDist = Infinity;
  let closest = null;

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];

    const dx = (b.lng - a.lng) * cosLat;
    const dy = b.lat - a.lat;
    
    // Segment length squared
    const l2 = dx * dx + dy * dy;
    
    let t = 0;
    if (l2 !== 0) {
      // Vector projection scalar
      t = ((pLng - a.lng) * cosLat * dx + (pLat - a.lat) * dy) / l2;
      t = Math.max(0, Math.min(1, t)); // Clamp to segment
    }

    const projLat = a.lat + t * (b.lat - a.lat);
    const projLng = a.lng + t * (b.lng - a.lng);

    const distSq =
      Math.pow((pLng - projLng) * cosLat, 2) + Math.pow(pLat - projLat, 2);

    if (distSq < minDist) {
      minDist = distSq;

      let segBearing = computeBearing(a, b);
      // If segment a-b is tiny (< 1m), try taking bearing to next coordinate c if available
      if (distanceMeters(a, b) < 1 && i < coords.length - 2) {
        segBearing = computeBearing(a, coords[i + 2]);
      }

      closest = { lat: projLat, lng: projLng, bearing: segBearing, segmentIndex: i };
    }
  }

  return closest;
}

export function formatEtaMinutes(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins === 1 ? "1 min" : `${mins} min`;
}

export function formatDistanceKm(meters) {
  if (!Number.isFinite(meters) || meters < 0) return null;
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}
