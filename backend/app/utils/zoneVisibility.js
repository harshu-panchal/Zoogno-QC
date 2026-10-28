/**
 * Shared zone-visibility helpers for admin-managed content that can be
 * scoped to specific zones (experience sections, hero config, offer
 * sections, coupons). Convention: an empty/missing `zoneIds` array means
 * "All Zones" — this keeps existing records (which have no zoneIds field
 * at all) visible everywhere with no migration needed.
 */

/**
 * Mongo query fragment matching documents that are either zone-unscoped
 * ("All Zones") or scoped to include at least one of the customer's zones.
 * Merge into an existing query object, e.g. `{ ...query, ...zoneVisibilityMatch(zoneIds) }`.
 */
export function zoneVisibilityMatch(customerZoneIds = [], field = "zoneIds") {
  const ids = Array.isArray(customerZoneIds) ? customerZoneIds.filter(Boolean) : [];
  const clauses = [{ [field]: { $exists: false } }, { [field]: { $size: 0 } }];
  if (ids.length) clauses.push({ [field]: { $in: ids } });
  return { $or: clauses };
}

/**
 * In-memory equivalent of zoneVisibilityMatch, for content already fetched
 * (e.g. a single findOne result) rather than filtered at query time.
 */
export function isVisibleInZones(doc, customerZoneIds = [], field = "zoneIds") {
  const docZoneIds = Array.isArray(doc?.[field]) ? doc[field].map(String) : [];
  if (docZoneIds.length === 0) return true; // All Zones
  const ids = Array.isArray(customerZoneIds) ? customerZoneIds.map(String) : [];
  return docZoneIds.some((id) => ids.includes(id));
}

/**
 * Normalizes a raw zoneIds payload from an admin request body into a clean
 * array of id strings (or [] for "All Zones"). Throws on any malformed id.
 */
/**
 * Ray-casting point-in-polygon test. `point` is a [lng, lat] pair, and
 * `polygonCoordinates` is a GeoJSON Polygon's `coordinates` (array of rings,
 * only the outer ring is checked). Shared by any zone-membership check that
 * needs to resolve a user's zone from a raw lat/lng rather than relying on a
 * stored zone reference (e.g. a delivery partner's live location, or a
 * customer's saved address).
 */
export function isPointInPolygon(point, polygonCoordinates) {
  if (!point || !Array.isArray(point) || point.length < 2) return false;
  if (!polygonCoordinates || !Array.isArray(polygonCoordinates) || !polygonCoordinates[0]) {
    return false;
  }
  const [lng, lat] = point;
  const ring = polygonCoordinates[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function normalizeZoneIds(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    const err = new Error("zoneIds must be an array");
    err.statusCode = 400;
    throw err;
  }
  const ids = raw.map((v) => String(v).trim()).filter(Boolean);
  const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
  for (const id of ids) {
    if (!OBJECT_ID_RE.test(id)) {
      const err = new Error(`Invalid zone id: ${id}`);
      err.statusCode = 400;
      throw err;
    }
  }
  return ids;
}
