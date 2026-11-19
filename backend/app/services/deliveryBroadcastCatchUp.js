/**
 * deliveryBroadcastCatchUp.js
 *
 * Problem this solves: a rider who comes online WHILE an order is being broadcast was only
 * ever reached by the next re-broadcast wave (every `rebroadcastIntervalSeconds`, possibly
 * minutes away), and the app's own "available orders" fetch ran against the rider's stale
 * stored location from their last session - so the open order never appeared.
 *
 * Fix: when a rider comes online we offer them every broadcast that is STILL OPEN, as soon as
 * their fresh location is known, using exactly the same eligibility rules as a normal
 * broadcast (online, inside the seller's zone, under the max-active-orders cap).
 *
 * The broadcast loop itself is untouched - it still stops only when a rider accepts or the
 * customer cancels (both move the order out of DELIVERY_SEARCH, so nothing here can outlive that).
 */

import mongoose from "mongoose";
import Order from "../models/order.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { isDeliveryPartnerEligibleForSeller } from "./deliveryNearbyService.js";
import { emitDeliveryBroadcastToPartner } from "./orderSocketEmitter.js";
import logger from "./logger.js";

/** The app shows one offer at a time, so a few is plenty; the rest arrive on the next wave. */
const MAX_OFFERS = 3;
/** Upper bound on open orders examined per catch-up. */
const MAX_SCAN = 50;

/**
 * Offer all still-open, eligible broadcasts to one rider (oldest first - they have waited longest).
 *
 * Skips orders that are assigned, expired, no longer in DELIVERY_SEARCH, or that this rider
 * already rejected. Safe to call repeatedly: the app de-duplicates, and notification rows are
 * refreshed rather than duplicated.
 *
 * @returns {Promise<{offered: number, orderIds: string[]}>}
 */
export async function offerOpenBroadcastsToDeliveryPartner(
  deliveryId,
  { maxOffers = MAX_OFFERS } = {},
) {
  const none = { offered: 0, orderIds: [] };
  if (!deliveryId || !mongoose.Types.ObjectId.isValid(String(deliveryId))) return none;
  const riderId = new mongoose.Types.ObjectId(String(deliveryId));

  const open = await Order.find({
    workflowVersion: { $gte: 2 },
    workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
    deliveryBoy: null,
    deliverySearchExpiresAt: { $gt: new Date() },
    skippedBy: { $nin: [riderId] },
  })
    .sort({ createdAt: 1, _id: 1 })
    .limit(MAX_SCAN)
    .populate("seller", "shopName address name location serviceRadius")
    .lean();
  if (!open.length) return none;

  // Loaded lazily: orderWorkflowService is a heavy module graph the controllers shouldn't pull in
  // just to define a route, and it imports the socket emitter (this avoids an import cycle).
  const { deliveryBroadcastPayloadFromOrder } = await import("./orderWorkflowService.js");

  const eligibleBySeller = new Map(); // one zone check per seller, not per order
  const orderIds = [];

  for (const order of open) {
    if (orderIds.length >= maxOffers) break;
    try {
      const sellerId = String(order.seller?._id ?? order.seller);
      if (!eligibleBySeller.has(sellerId)) {
        eligibleBySeller.set(sellerId, await isDeliveryPartnerEligibleForSeller(riderId, sellerId));
      }
      if (!eligibleBySeller.get(sellerId)) continue;

      const payload = await deliveryBroadcastPayloadFromOrder(order, {
        // Truthy so the app re-opens an order it may have already shown this session.
        retryAttempt: order.deliverySearchMeta?.attempt || 1,
        catchUp: true,
      });
      await emitDeliveryBroadcastToPartner(riderId, payload);
      orderIds.push(order.orderId);
    } catch (err) {
      // One bad order must not stop the rider being offered the others.
      logger.warn("Broadcast catch-up failed for an order", {
        scope: "BROADCAST_CATCHUP",
        orderId: order.orderId,
        error: err.message,
      });
    }
  }

  if (orderIds.length) {
    logger.info("Offered open broadcasts to rider who came online", {
      scope: "BROADCAST_CATCHUP",
      deliveryId: String(riderId),
      orderIds,
    });
  }
  return { offered: orderIds.length, orderIds };
}
