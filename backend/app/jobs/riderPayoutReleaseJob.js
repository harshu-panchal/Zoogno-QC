import Payout from "../models/payout.js";
import Order from "../models/order.js";
import logger from "../services/logger.js";
import { processPayout } from "../services/finance/payoutService.js";

const DEFAULT_INTERVAL_MS = 60000;
const DEFAULT_BATCH_LIMIT = 100;

const intervalMs = () =>
  parseInt(process.env.RIDER_PAYOUT_RELEASE_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`, 10);

const autoReleaseEnabled = () =>
  String(process.env.AUTO_RELEASE_RIDER_PAYOUT || "true").toLowerCase() === "true";

/**
 * Moves rider (DELIVERY_PARTNER) payouts from the wallet's pending balance to its available
 * balance once the order is delivered.
 *
 * Rider earnings have no return-window hold, and nothing else released them: the only other
 * releaser (payoutBatchJob) is off by default and also processes SELLER payouts, which would
 * bypass the seller return-window hold, so it is deliberately not used here.
 *
 * Releasing goes through the existing processPayout(), so wallet, order status and the audit
 * log are updated exactly as for any other payout. Idempotent: only PENDING/PROCESSING payouts
 * are picked up.
 *
 * @returns {{ total: number, completed: number, failed: number, skipped: number, amount: number }}
 */
export async function releasePendingRiderPayouts({ limit = DEFAULT_BATCH_LIMIT, dryRun = false, log = true } = {}) {
  const pending = await Payout.find({
    payoutType: "DELIVERY_PARTNER",
    status: { $in: ["PENDING", "PROCESSING"] },
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .select("_id amount relatedOrderIds")
    .lean();

  const result = { total: pending.length, completed: 0, failed: 0, skipped: 0, amount: 0 };

  for (const payout of pending) {
    // Only pay out for orders that are actually delivered (never cancelled/in-flight ones).
    const notDelivered = await Order.exists({
      _id: { $in: payout.relatedOrderIds },
      status: { $ne: "delivered" },
    });
    if (notDelivered || !payout.relatedOrderIds?.length) {
      result.skipped++;
      continue;
    }
    if (dryRun) {
      result.completed++;
      result.amount += payout.amount;
      continue;
    }
    try {
      await processPayout(payout._id, { remarks: "Auto-release of rider earnings after delivery" });
      result.completed++;
      result.amount += payout.amount;
    } catch (err) {
      result.failed++;
      logger.warn("Rider payout release failed", {
        jobName: "riderPayoutReleaseJob",
        payoutId: String(payout._id),
        error: err.message,
      });
    }
  }

  if (log && (result.completed > 0 || result.failed > 0)) {
    logger.info("Rider payout release job completed", { jobName: "riderPayoutReleaseJob", ...result });
  }
  return result;
}

const handler = async () => {
  if (!autoReleaseEnabled()) return;
  try {
    await releasePendingRiderPayouts();
  } catch (err) {
    logger.error("Rider payout release job failed", {
      jobName: "riderPayoutReleaseJob",
      error: err.message,
      stack: err.stack,
    });
  }
};

export const getRiderPayoutReleaseJobHandler = () => handler;
export const getRiderPayoutReleaseJobInterval = () => intervalMs();
