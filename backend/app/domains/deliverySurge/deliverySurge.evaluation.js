import mongoose from "mongoose";
import DeliverySurgeRule from "../../models/deliverySurgeRule.js";
import Transaction from "../../models/transaction.js";
import Zone from "../../models/zone.js";
import Seller from "../../models/seller.js";
import Notification from "../../models/notification.js";
import { roundCurrency } from "../../utils/money.js";
import { invalidateDeliveryCaches } from "../../services/delivery/deliveryEarningsService.js";
import { emitToDelivery } from "../../services/orderSocketEmitter.js";
import logger from "../../services/logger.js";
import { isPointInPolygon } from "../incentive/incentive.eligibility.js";
import { isWithinSchedule } from "./deliverySurge.period.js";

function toOid(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id);
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

function buildTransactionRef(surgeId, orderIdString) {
  const safeOrder = String(orderIdString || "").replace(/[^A-Za-z0-9_-]/g, "");
  return `SRG-${surgeId}-${safeOrder}`;
}

export function extractOrderPoint(order) {
  const loc = order?.address?.location;
  const lat = Number(loc?.lat);
  const lng = Number(loc?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    return [lng, lat];
  }

  const otp = order?.otpValidationLocation;
  const otpLat = Number(otp?.lat);
  const otpLng = Number(otp?.lng);
  if (Number.isFinite(otpLat) && Number.isFinite(otpLng) && !(otpLat === 0 && otpLng === 0)) {
    return [otpLng, otpLat];
  }

  return null;
}

async function resolveSellerPoint(order) {
  const sellerId = order?.seller?._id || order?.seller;
  if (!sellerId) return null;
  const seller = await Seller.findById(sellerId).select("location").lean();
  const coords = seller?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || (lng === 0 && lat === 0)) return null;
  return [lng, lat];
}

async function resolveOrderPoint(order) {
  const fromAddress = extractOrderPoint(order);
  if (fromAddress) return fromAddress;
  return resolveSellerPoint(order);
}

function emptyBreakdown(baseEarning = 0) {
  const base = roundCurrency(baseEarning);
  return {
    baseEarning: base,
    surgeCharge: 0,
    surgeItems: [],
    totalEarning: base,
  };
}

/**
 * Preview matching active delivery surges for an order (no wallet credit).
 * Used on incoming-order offers so riders see Base + Surge + Total before accept.
 */
export async function previewDeliverySurgesForOrder(order, { now = new Date() } = {}) {
  const baseEarning = roundCurrency(order?.paymentBreakdown?.riderPayoutTotal || 0);
  try {
    const matched = await matchApplicableSurges(order, { now, baseEarning });
    return {
      baseEarning: matched.baseEarning,
      surgeCharge: matched.surgeCharge,
      surgeItems: matched.surgeItems || [],
      totalEarning: matched.totalEarning,
    };
  } catch (err) {
    logger.warn("[deliverySurge] preview failed", {
      error: err?.message || err,
      orderId: order?.orderId || order?._id,
    });
    return emptyBreakdown(baseEarning);
  }
}

async function matchApplicableSurges(order, { now, baseEarning }) {
  const point = await resolveOrderPoint(order);
  if (!point) return emptyBreakdown(baseEarning);

  const matchedZones = await Zone.find({
    isActive: true,
    location: {
      $geoIntersects: {
        $geometry: { type: "Point", coordinates: point },
      },
    },
  })
    .select("_id name")
    .lean();

  let zones = matchedZones;
  if (!zones.length) {
    const allZones = await Zone.find({ isActive: true }).select("_id name location").lean();
    zones = allZones.filter((z) => isPointInPolygon(point, z.location?.coordinates));
  }

  if (!zones.length) return emptyBreakdown(baseEarning);

  const zoneIds = zones.map((z) => z._id);
  const zoneById = new Map(zones.map((z) => [String(z._id), z]));

  const rules = await DeliverySurgeRule.find({
    status: "active",
    zoneIds: { $in: zoneIds },
  })
    .sort({ priority: -1, createdAt: -1 })
    .lean();

  const applicable = rules.filter((rule) => isWithinSchedule(rule, now));
  if (!applicable.length) return emptyBreakdown(baseEarning);

  const surgeItems = applicable.map((rule) => {
    const matchedZoneId = (rule.zoneIds || [])
      .map(String)
      .find((id) => zoneById.has(id));
    const zone = matchedZoneId ? zoneById.get(matchedZoneId) : zones[0];
    return {
      name: rule.name,
      amount: roundCurrency(rule.amount),
      surgeRuleId: String(rule._id),
      zoneName: zone?.name || null,
      rule,
      zone,
    };
  });

  const surgeCharge = roundCurrency(
    surgeItems.reduce((sum, i) => sum + Number(i.amount || 0), 0),
  );

  return {
    baseEarning,
    surgeCharge,
    surgeItems: surgeItems.map(({ name, amount, surgeRuleId, zoneName }) => ({
      name,
      amount,
      surgeRuleId,
      zoneName,
    })),
    totalEarning: roundCurrency(baseEarning + surgeCharge),
    _matched: surgeItems,
  };
}

async function notifyRider({ deliveryId, title, message, data }) {
  try {
    await Notification.create({
      recipient: deliveryId,
      recipientModel: "Delivery",
      userId: deliveryId,
      role: "delivery",
      title,
      message,
      body: message,
      type: "alert",
      channel: "in_app",
      provider: "internal",
      data: data || {},
    });
  } catch (err) {
    logger.warn("[deliverySurge] notification insert failed", { error: err.message });
  }

  try {
    emitToDelivery(deliveryId, {
      event: data?.event || "delivery:surge:credited",
      payload: { title, message, ...(data || {}), at: new Date().toISOString() },
    });
  } catch {
    // socket optional
  }
}

async function creditSurge({ rule, deliveryId, order, orderIdString, zone, baseEarning }) {
  const amount = roundCurrency(rule.amount);
  if (amount <= 0) return null;

  const transactionRef = buildTransactionRef(rule._id, orderIdString);
  const zoneId = zone?._id || null;
  const zoneName = zone?.name || null;

  try {
    await Transaction.create({
      user: deliveryId,
      userModel: "Delivery",
      order: order._id,
      type: "Surge",
      amount,
      status: "Settled",
      reference: transactionRef,
      meta: {
        reason: rule.name,
        surgeRuleId: String(rule._id),
        surgeName: rule.name,
        zoneId: zoneId ? String(zoneId) : null,
        zoneName,
        orderId: orderIdString,
        baseEarning,
        surgeAmount: amount,
        totalEarning: roundCurrency(baseEarning + amount),
      },
    });
  } catch (err) {
    if (err?.code === 11000) {
      return { credited: false, reason: "duplicate", amount, name: rule.name, transactionRef };
    }
    throw err;
  }

  await DeliverySurgeRule.updateOne(
    { _id: rule._id },
    { $inc: { timesApplied: 1, totalPaid: amount } },
  );

  return {
    credited: true,
    amount,
    name: rule.name,
    surgeRuleId: String(rule._id),
    zoneId: zoneId ? String(zoneId) : null,
    zoneName,
    transactionRef,
  };
}

/**
 * After delivery settlement: credit all matching active zone surges (stacking).
 * Idempotent via unique Transaction.reference SRG-{surgeId}-{orderId}.
 */
export async function applyDeliverySurgesForOrder(order) {
  try {
    if (!order?.deliveryBoy) return emptyBreakdown(0);

    const status = String(order.status || order.workflowStatus || "").toLowerCase();
    if (status !== "delivered") return emptyBreakdown(0);

    const deliveryId = toOid(order.deliveryBoy);
    if (!deliveryId) return emptyBreakdown(0);

    const orderIdString =
      order.orderId ||
      order.displayId ||
      (order._id ? String(order._id) : null);
    if (!orderIdString) return emptyBreakdown(0);

    const baseEarning = roundCurrency(
      order.paymentBreakdown?.riderPayoutTotal || 0,
    );

    const now = order.deliveredAt ? new Date(order.deliveredAt) : new Date();
    const matched = await matchApplicableSurges(order, { now, baseEarning });
    const matchedRows = matched._matched || [];

    if (!matchedRows.length) {
      // Still surface any already-settled surge rows (idempotent re-entry)
      const existing = await Transaction.find({
        user: deliveryId,
        userModel: "Delivery",
        type: "Surge",
        order: order._id,
        status: "Settled",
      })
        .select("amount meta")
        .lean();
      if (!existing.length) {
        return {
          baseEarning: matched.baseEarning,
          surgeCharge: 0,
          surgeItems: [],
          totalEarning: matched.baseEarning,
        };
      }
      const surgeItems = existing.map((t) => ({
        name: t.meta?.surgeName || t.meta?.reason || "Surge",
        amount: roundCurrency(t.amount),
        surgeRuleId: t.meta?.surgeRuleId || null,
        zoneName: t.meta?.zoneName || null,
      }));
      const surgeCharge = roundCurrency(
        surgeItems.reduce((sum, i) => sum + Number(i.amount || 0), 0),
      );
      return {
        baseEarning,
        surgeCharge,
        surgeItems,
        totalEarning: roundCurrency(baseEarning + surgeCharge),
      };
    }

    const surgeItems = [];
    for (const row of matchedRows) {
      const credited = await creditSurge({
        rule: row.rule,
        deliveryId,
        order,
        orderIdString,
        zone: row.zone,
        baseEarning,
      });

      if (credited?.amount) {
        if (credited.credited || credited.reason === "duplicate") {
          const alreadyListed = surgeItems.some(
            (i) => i.surgeRuleId === String(row.rule._id),
          );
          if (!alreadyListed) {
            surgeItems.push({
              name: row.name,
              amount: roundCurrency(credited.amount || row.amount),
              surgeRuleId: String(row.rule._id),
              zoneName: row.zoneName || null,
            });
          }
        }
      }
    }

    if (!surgeItems.length) {
      const existing = await Transaction.find({
        user: deliveryId,
        userModel: "Delivery",
        type: "Surge",
        order: order._id,
        status: "Settled",
      })
        .select("amount meta")
        .lean();
      for (const t of existing) {
        surgeItems.push({
          name: t.meta?.surgeName || t.meta?.reason || "Surge",
          amount: roundCurrency(t.amount),
          surgeRuleId: t.meta?.surgeRuleId || null,
          zoneName: t.meta?.zoneName || null,
        });
      }
    }

    const surgeCharge = roundCurrency(
      surgeItems.reduce((sum, i) => sum + Number(i.amount || 0), 0),
    );
    const totalEarning = roundCurrency(baseEarning + surgeCharge);

    if (surgeCharge > 0) {
      await invalidateDeliveryCaches(deliveryId).catch(() => {});
      const names = surgeItems.map((i) => i.name).join(", ");
      await notifyRider({
        deliveryId,
        title: "Surge earning credited",
        message: `You earned ₹${surgeCharge} surge (${names}) on this delivery. Total ₹${totalEarning}.`,
        data: {
          event: "delivery:surge:credited",
          orderId: orderIdString,
          baseEarning,
          surgeCharge,
          surgeItems,
          totalEarning,
        },
      });
    }

    return { baseEarning, surgeCharge, surgeItems, totalEarning };
  } catch (err) {
    logger.error("[deliverySurge] applyDeliverySurgesForOrder failed", {
      error: err?.message || err,
      orderId: order?.orderId || order?._id,
    });
    const baseEarning = roundCurrency(order?.paymentBreakdown?.riderPayoutTotal || 0);
    return emptyBreakdown(baseEarning);
  }
}
