import SettlementPayout, {
  SETTLEMENT_PAYOUT_STATUS,
  PAYOUT_CHANNEL,
} from "../models/settlementPayout.js";
import { fetchAndApplyTransferStatus } from "../services/finance/cashfreePayoutService.js";
import logger from "../services/logger.js";

const RECONCILE_INTERVAL_MS = () =>
  parseInt(process.env.CASHFREE_PAYOUT_RECONCILE_INTERVAL_MS || "300000", 10);

// Safety net for missed webhooks — only reconciles transfers old enough that
// a webhook should already have arrived, to avoid racing the initial
// synchronous createTransfer() response.
const MIN_AGE_MS = 2 * 60 * 1000;

const cashfreePayoutReconcileJobHandler = async () => {
  const startTime = Date.now();
  try {
    const stalePending = await SettlementPayout.find({
      payoutChannel: PAYOUT_CHANNEL.CASHFREE,
      status: { $in: [SETTLEMENT_PAYOUT_STATUS.PENDING, SETTLEMENT_PAYOUT_STATUS.PROCESSING] },
      updatedAt: { $lte: new Date(Date.now() - MIN_AGE_MS) },
    }).limit(50);

    let reconciled = 0;
    for (const payout of stalePending) {
      try {
        await fetchAndApplyTransferStatus(payout);
        reconciled += 1;
      } catch (error) {
        logger.error("cashfree_payout_reconcile_single_failed", {
          payoutId: payout.payoutId,
          error: error.message,
        });
      }
    }

    if (stalePending.length > 0) {
      logger.info("cashfree_payout_reconcile_job_completed", {
        duration: Date.now() - startTime,
        checked: stalePending.length,
        reconciled,
      });
    }
  } catch (error) {
    logger.error("cashfree_payout_reconcile_job_failed", {
      duration: Date.now() - startTime,
      error: error.message,
    });
  }
};

export const getCashfreePayoutReconcileJobHandler = () => cashfreePayoutReconcileJobHandler;
export const getCashfreePayoutReconcileJobInterval = () => RECONCILE_INTERVAL_MS();
export const isCashfreePayoutReconcileJobEnabled = () =>
  process.env.ENABLE_CASHFREE_PAYOUT_RECONCILE_JOB === "true";
