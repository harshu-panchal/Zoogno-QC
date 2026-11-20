import Order from "../models/order.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { processDeliveryTimeoutJob } from "../services/orderWorkflowService.js";
import logger from "../services/logger.js";

/**
 * Guarantees the rider broadcast never stops while an order is waiting for a rider.
 *
 * The primary re-broadcast timer is a Bull job in Redis, and the generic 10s auto-cancel poller
 * also needs a Redis lock - if Redis is slow, full or unreachable, BOTH go quiet and an order
 * sits in DELIVERY_SEARCH with an expired window and no further waves. This watchdog uses
 * MongoDB only: every few seconds it finds searching orders whose accept window has lapsed
 * (or has no expiry at all) and runs the normal re-broadcast step for each.
 *
 * Safe to run alongside the Bull timer and on several instances: processDeliveryTimeoutJob
 * advances a wave with a compare-and-set, so a wave is broadcast exactly once.
 */
const INTERVAL_MS = () => parseInt(process.env.DELIVERY_REBROADCAST_WATCHDOG_MS || "5000", 10);
const STUCK_AFTER_MS = 90_000; // a sweep that has run this long is assumed hung and is abandoned

let timer = null;
let runningSince = 0;

export async function sweepDeliverySearches(now = new Date()) {
  const due = await Order.find({
    workflowVersion: { $gte: 2 },
    workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
    deliveryBoy: null,
    $or: [
      { deliverySearchExpiresAt: { $lte: now } },
      { deliverySearchExpiresAt: null },
    ],
  })
    .select("orderId deliverySearchMeta")
    .limit(200)
    .lean();

  for (const row of due) {
    try {
      await processDeliveryTimeoutJob({
        orderId: row.orderId,
        attempt: row.deliverySearchMeta?.attempt || 1,
      });
    } catch (err) {
      logger.error("delivery rebroadcast watchdog: order failed", {
        orderId: row.orderId,
        error: err.message,
      });
    }
  }
  return due.length;
}

export function startDeliveryRebroadcastWatchdog() {
  if (timer) return;
  timer = setInterval(async () => {
    if (runningSince && Date.now() - runningSince < STUCK_AFTER_MS) return;
    runningSince = Date.now();
    try {
      await sweepDeliverySearches();
    } catch (err) {
      logger.error("delivery rebroadcast watchdog: sweep failed", { error: err.message });
    } finally {
      runningSince = 0;
    }
  }, INTERVAL_MS());
  timer.unref?.();
  logger.info("Delivery rebroadcast watchdog started", { intervalMs: INTERVAL_MS() });
}

export function stopDeliveryRebroadcastWatchdog() {
  if (timer) clearInterval(timer);
  timer = null;
  runningSince = 0;
}
