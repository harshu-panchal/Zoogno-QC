import mongoose from "mongoose";
import Delivery from "../../models/delivery.js";
import Order from "../../models/order.js";
import Zone from "../../models/zone.js";
import IncentiveAssignment from "../../models/incentiveAssignment.js";

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

export function riderCoords(rider) {
  const coords = Array.isArray(rider?.location?.coordinates)
    ? rider.location.coordinates
    : [];
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (coords.length < 2 || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }
  if (lng === 0 && lat === 0) return null;
  return [lng, lat];
}

export function riderMatchesZone(rider, zones) {
  if (!zones?.length) return true;
  const point = riderCoords(rider);
  if (!point) return false;
  return zones.some((z) => isPointInPolygon(point, z.location?.coordinates));
}

function toOid(id) {
  if (!id) return null;
  const s = String(id);
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

export function buildRiderMongoQuery(filters = {}, extra = {}) {
  const query = { role: "delivery", ...extra };

  if (filters.verifiedOnly === true || filters.verified === true || filters.verified === "true") {
    query.isVerified = true;
  } else if (filters.verified === false || filters.verified === "false") {
    query.isVerified = false;
  }

  if (filters.currentlyOnline === true || filters.status === "online") {
    query.isOnline = true;
  } else if (filters.currentlyOnline === false || filters.status === "offline") {
    query.isOnline = false;
  }

  if (filters.minRating != null && Number(filters.minRating) > 0) {
    query.averageRating = { ...(query.averageRating || {}), $gte: Number(filters.minRating) };
  }
  if (filters.maxRating != null && Number(filters.maxRating) > 0) {
    query.averageRating = { ...(query.averageRating || {}), $lte: Number(filters.maxRating) };
  }

  if (filters.joiningFrom) {
    query.createdAt = { ...(query.createdAt || {}), $gte: new Date(filters.joiningFrom) };
  }
  if (filters.joiningTo) {
    const to = new Date(filters.joiningTo);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      query.createdAt = { ...(query.createdAt || {}), $lte: to };
    }
  }

  const search = String(filters.search || "").trim();
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  return query;
}

export async function loadZonesByIds(zoneIds) {
  const ids = (zoneIds || []).map(toOid).filter(Boolean);
  if (!ids.length) return [];
  return Zone.find({ _id: { $in: ids }, isActive: true }).lean();
}

export async function attachZonesAndCounts(riders, zones) {
  const ids = riders.map((r) => r._id);
  const deliveryCounts = ids.length
    ? await Order.aggregate([
        { $match: { deliveryBoy: { $in: ids }, status: "delivered" } },
        { $group: { _id: "$deliveryBoy", count: { $sum: 1 } } },
      ])
    : [];
  const countByPartner = new Map(deliveryCounts.map((d) => [String(d._id), d.count]));
  const allZones = zones?.length
    ? zones
    : await Zone.find({ isActive: true }).select("name location").lean();

  return riders.map((rider) => {
    const point = riderCoords(rider);
    const matchedZone = point
      ? allZones.find((z) => isPointInPolygon(point, z.location?.coordinates))
      : null;
    return {
      ...rider,
      totalDeliveries: countByPartner.get(String(rider._id)) || 0,
      zoneName: matchedZone ? matchedZone.name : "No Zone",
      zoneId: matchedZone ? String(matchedZone._id) : null,
    };
  });
}

export async function findEligiblePartners({ filters = {}, page = 1, limit = 25, idsOnly = false }) {
  const query = buildRiderMongoQuery(filters);
  const rawZoneIds = filters.zoneIds || (filters.zone && filters.zone !== "all" ? [filters.zone] : []);
  const zoneIds = Array.isArray(rawZoneIds) ? rawZoneIds : [rawZoneIds];
  const zones = await loadZonesByIds(zoneIds);

  let riders = await Delivery.find(query)
    .select(
      "name phone vehicleType profileImage isVerified isOnline averageRating totalRatings createdAt location",
    )
    .sort({ createdAt: -1 })
    .lean();

  if (zones.length) {
    riders = riders.filter((r) => riderMatchesZone(r, zones));
  }

  const withMeta = await attachZonesAndCounts(riders, null);
  const minOrders = filters.minLifetimeOrders != null ? Number(filters.minLifetimeOrders) : 0;
  const filtered =
    minOrders > 0
      ? withMeta.filter((r) => (r.totalDeliveries || 0) >= minOrders)
      : withMeta;

  const total = filtered.length;
  if (idsOnly) {
    return { items: filtered.map((r) => r._id), total };
  }

  const skip = (page - 1) * limit;
  return {
    items: filtered.slice(skip, skip + limit),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function isRiderEligibleForCampaign(campaign, rider, { lifetimeOrders, assignedIds } = {}) {
  if (!rider) return false;

  const conditions = campaign.conditions || {};
  if (conditions.requireVerifiedAtPayout !== false && !rider.isVerified) {
    return false;
  }

  if (campaign.audienceType === "specific") {
    const idSet = assignedIds instanceof Set ? assignedIds : null;
    if (idSet) return idSet.has(String(rider._id));
    const row = await IncentiveAssignment.exists({
      campaignId: campaign._id,
      deliveryId: rider._id,
    });
    return Boolean(row);
  }

  if (campaign.audienceType === "all") {
    const filters = campaign.filters || {};
    if (filters.verifiedOnly !== false && !rider.isVerified) return false;
    return true;
  }

  const filters = campaign.filters || {};
  if (filters.verifiedOnly !== false && !rider.isVerified) return false;
  if (filters.currentlyOnline === true && !rider.isOnline) return false;
  if (filters.currentlyOnline === false && rider.isOnline) return false;
  if (filters.minRating != null && Number(rider.averageRating || 0) < Number(filters.minRating)) {
    return false;
  }
  if (filters.maxRating != null && Number(rider.averageRating || 0) > Number(filters.maxRating)) {
    return false;
  }
  if (filters.joiningFrom && new Date(rider.createdAt) < new Date(filters.joiningFrom)) {
    return false;
  }
  if (filters.joiningTo) {
    const to = new Date(filters.joiningTo);
    to.setHours(23, 59, 59, 999);
    if (new Date(rider.createdAt) > to) return false;
  }
  if (filters.minLifetimeOrders != null) {
    const count =
      lifetimeOrders != null
        ? lifetimeOrders
        : await Order.countDocuments({ deliveryBoy: rider._id, status: "delivered" });
    if (count < Number(filters.minLifetimeOrders)) return false;
  }
  if (Array.isArray(filters.zoneIds) && filters.zoneIds.length) {
    const zones = await loadZonesByIds(filters.zoneIds);
    if (!riderMatchesZone(rider, zones)) return false;
  }

  return true;
}
