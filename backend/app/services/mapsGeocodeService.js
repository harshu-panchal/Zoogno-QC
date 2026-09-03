import crypto from "crypto";
import * as redisManager from "./redisManager.js";
import GeocodeCache from "../models/geocodeCache.js";
import {
  getMapboxToken,
  mapboxForwardGeocode,
  mapboxReverseGeocode,
} from "./mapboxClient.js";

const GEOCODE_CACHE_TTL_SEC = () =>
  parseInt(process.env.GEOCODE_CACHE_TTL_SEC || "2592000", 10);

function cacheKeyAddress(address, country) {
  const raw = `geocode:v3:mapbox:addr:${country || ""}:${address || ""}`.toLowerCase();
  const h = crypto.createHash("sha1").update(raw).digest("hex");
  return redisManager.buildKey("maps", "geocode", h);
}

function cacheKeyPlaceId(placeId) {
  const raw = `geocode:v3:mapbox:pid:${placeId || ""}`.toLowerCase();
  const h = crypto.createHash("sha1").update(raw).digest("hex");
  return redisManager.buildKey("maps", "geocode", h);
}

function cacheKeyReverse(lat, lng) {
  const raw = `geocode:v3:mapbox:rev:${lat}:${lng}`.toLowerCase();
  const h = crypto.createHash("sha1").update(raw).digest("hex");
  return redisManager.buildKey("maps", "geocode", h);
}

async function readCache(key) {
  const cached = await redisManager.get(key);
  if (cached) return cached;

  try {
    const doc = await GeocodeCache.findOne({ key }).lean();
    if (doc?.expiresAt && doc.expiresAt > new Date()) {
      return {
        lat: doc.lat,
        lng: doc.lng,
        formattedAddress: doc.formattedAddress,
        placeId: doc.placeId || null,
        types: Array.isArray(doc.types) ? doc.types : [],
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function writeCache(key, result) {
  const expiresAt = new Date(Date.now() + GEOCODE_CACHE_TTL_SEC() * 1000);
  await redisManager.set(key, result, GEOCODE_CACHE_TTL_SEC());
  try {
    await GeocodeCache.updateOne(
      { key },
      {
        $set: {
          lat: result.lat,
          lng: result.lng,
          formattedAddress: result.formattedAddress,
          placeId: result.placeId,
          types: result.types,
          expiresAt,
          source: "geocode-api",
        },
      },
      { upsert: true },
    );
  } catch {
    /* ignore */
  }
}

function assertToken() {
  if (!getMapboxToken()) {
    const err = new Error(
      "Mapbox access token missing. Set MAPBOX_ACCESS_TOKEN (Geocoding API).",
    );
    err.statusCode = 500;
    err.code = "MAPS_KEY_MISSING";
    throw err;
  }
}

/** Google place ids (ChIJ...) are not valid on Mapbox — detect and reject for explicit placeId lookup. */
function isLegacyGooglePlaceId(placeId) {
  return typeof placeId === "string" && /^ChI[A-Za-z0-9_-]{20,}$/.test(placeId.trim());
}

export async function geocodeAddress(address, { country } = {}) {
  if (!address || typeof address !== "string" || address.trim().length < 3) {
    const err = new Error("address is required");
    err.statusCode = 400;
    throw err;
  }

  assertToken();
  const addr = address.trim();
  const key = cacheKeyAddress(addr, country);
  const cached = await readCache(key);
  if (cached) return cached;

  const result = await mapboxForwardGeocode(addr, { country });
  await writeCache(key, result);
  return result;
}

export async function geocodePlaceId(placeId) {
  if (!placeId || typeof placeId !== "string" || placeId.trim().length < 5) {
    const err = new Error("placeId is required");
    err.statusCode = 400;
    throw err;
  }

  assertToken();
  const pid = placeId.trim();

  if (isLegacyGooglePlaceId(pid)) {
    const err = new Error(
      "Legacy Google placeId cannot be resolved on Mapbox. Geocode by address instead.",
    );
    err.statusCode = 400;
    err.code = "LEGACY_PLACE_ID";
    throw err;
  }

  const key = cacheKeyPlaceId(pid);
  const cached = await readCache(key);
  if (cached) return cached;

  const token = getMapboxToken();
  const params = new URLSearchParams({
    access_token: token,
    limit: "1",
  });
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(pid)}.json?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature?.center) {
    const err = new Error("Geocoding returned no coordinates");
    err.statusCode = 404;
    err.code = "ZERO_RESULTS";
    throw err;
  }
  const [lng, lat] = feature.center;
  const result = {
    lat,
    lng,
    formattedAddress: feature.place_name || "",
    placeId: feature.id || pid,
    types: Array.isArray(feature.place_type) ? feature.place_type : [],
  };
  await writeCache(key, result);
  return result;
}

export async function reverseGeocode(lat, lng) {
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    const err = new Error("Valid lat and lng are required");
    err.statusCode = 400;
    throw err;
  }

  assertToken();
  const key = cacheKeyReverse(lat, lng);
  const cached = await readCache(key);
  if (cached) return cached;

  const result = await mapboxReverseGeocode(lat, lng);
  await writeCache(key, result);
  return result;
}
