/**
 * Mapbox HTTP client for Zoogno backend (Directions, Geocoding, Map Matching).
 * Uses MAPBOX_ACCESS_TOKEN (secret sk.* recommended).
 */

const MAPBOX_BASE = "https://api.mapbox.com";

export function getMapboxToken() {
  return (
    process.env.MAPBOX_ACCESS_TOKEN?.trim() ||
    process.env.MAPBOX_SECRET_TOKEN?.trim() ||
    ""
  );
}

export function assertMapboxToken() {
  const token = getMapboxToken();
  if (!token) {
    const err = new Error(
      "Mapbox access token missing. Set MAPBOX_ACCESS_TOKEN on the server.",
    );
    err.statusCode = 500;
    err.code = "MAPS_KEY_MISSING";
    throw err;
  }
  return token;
}

async function mapboxFetch(url, { timeout = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.message || data?.error || res.statusText;
      const err = new Error(`Mapbox API error: ${msg}`);
      err.statusCode = res.status === 404 ? 404 : 502;
      err.code = "MAPBOX_ERROR";
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} dest
 * @param {{ profile?: string, alternatives?: boolean }} opts
 */
export async function mapboxDirections(origin, dest, opts = {}) {
  const token = assertMapboxToken();
  const profile = opts.profile || "mapbox/driving-traffic";
  const coords = `${origin.lng},${origin.lat};${dest.lng},${dest.lat}`;
  const params = new URLSearchParams({
    access_token: token,
    geometries: "polyline6",
    overview: "full",
    steps: "true",
    annotations: "duration,distance",
  });
  if (opts.alternatives) params.set("alternatives", "true");

  const url = `${MAPBOX_BASE}/directions/v5/${profile}/${coords}?${params}`;
  const data = await mapboxFetch(url);

  const route = data.routes?.[0];
  if (!route) {
    const err = new Error("Mapbox Directions returned no route");
    err.statusCode = 404;
    err.code = "ZERO_RESULTS";
    throw err;
  }

  const [minLng, minLat, maxLng, maxLat] = route.bounds || [
    Math.min(origin.lng, dest.lng),
    Math.min(origin.lat, dest.lat),
    Math.max(origin.lng, dest.lng),
    Math.max(origin.lat, dest.lat),
  ];

  return {
    polyline: route.geometry,
    distanceMeters: Math.round(route.distance ?? 0),
    duration: Math.round(route.duration ?? 0),
    bounds: {
      northeast: { lat: maxLat, lng: maxLng },
      southwest: { lat: minLat, lng: minLng },
    },
    raw: route,
  };
}

/**
 * Forward geocode — address string.
 */
export async function mapboxForwardGeocode(query, { country } = {}) {
  const token = assertMapboxToken();
  const encoded = encodeURIComponent(query.trim());
  const params = new URLSearchParams({
    access_token: token,
    limit: "1",
    language: "en",
  });
  const cc =
    country?.trim()?.toUpperCase() ||
    process.env.MAPS_DEFAULT_COUNTRY?.trim()?.toUpperCase();
  if (cc) params.set("country", cc);

  const url = `${MAPBOX_BASE}/geocoding/v5/mapbox.places/${encoded}.json?${params}`;
  const data = await mapboxFetch(url);
  const feature = data.features?.[0];
  if (!feature?.center) {
    const err = new Error("Geocoding returned no coordinates");
    err.statusCode = 404;
    err.code = "ZERO_RESULTS";
    throw err;
  }
  const [lng, lat] = feature.center;
  return {
    lat,
    lng,
    formattedAddress: feature.place_name || query,
    placeId: feature.id || null,
    types: Array.isArray(feature.place_type) ? feature.place_type : [],
  };
}

/**
 * Reverse geocode — lat/lng.
 */
export async function mapboxReverseGeocode(lat, lng) {
  const token = assertMapboxToken();
  const params = new URLSearchParams({
    access_token: token,
    limit: "1",
    language: "en",
    types: "address,poi,place,locality,neighborhood",
  });
  const url = `${MAPBOX_BASE}/geocoding/v5/mapbox.places/${lng},${lat}.json?${params}`;
  const data = await mapboxFetch(url);
  const feature = data.features?.[0];
  if (!feature?.center) {
    const err = new Error("Reverse geocoding returned no result");
    err.statusCode = 404;
    err.code = "ZERO_RESULTS";
    throw err;
  }
  const [flng, flat] = feature.center;
  return {
    lat: flat,
    lng: flng,
    formattedAddress: feature.place_name || "",
    placeId: feature.id || null,
    types: Array.isArray(feature.place_type) ? feature.place_type : [],
  };
}

/**
 * Map Matching — snap GPS trace to road network.
 * @param {Array<{ lat: number, lng: number, timestamp?: number }>} points
 */
export async function mapboxMapMatch(points, { profile = "mapbox/driving" } = {}) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const token = assertMapboxToken();
  const coordStr = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const params = new URLSearchParams({
    access_token: token,
    geometries: "polyline6",
    overview: "full",
    tidy: "true",
  });
  const timestamps = points
    .map((p) => (p.timestamp ? Math.floor(p.timestamp / 1000) : null))
    .filter((t) => t != null);
  if (timestamps.length === points.length) {
    params.set("timestamps", timestamps.join(";"));
  }

  const url = `${MAPBOX_BASE}/matching/v5/${profile}/${coordStr}?${params}`;
  try {
    const data = await mapboxFetch(url);
    const match = data.matchings?.[0];
    const tracepoint = data.tracepoints?.[data.tracepoints.length - 1];
    if (!match && !tracepoint) return null;

    const loc = tracepoint?.location;
    return {
      lat: loc ? loc[1] : points[points.length - 1].lat,
      lng: loc ? loc[0] : points[points.length - 1].lng,
      bearing: tracepoint?.properties?.bearing ?? null,
      polyline: match?.geometry || null,
      distanceMeters: match?.distance ?? null,
      duration: match?.duration ?? null,
      matched: true,
    };
  } catch {
    return null;
  }
}
