import logger from "../../services/logger.js";
import { reconcileRecentDeliveries } from "./incentive.evaluation.js";

const INCENTIVE_RECONCILE_INTERVAL_MS = () =>
  parseInt(process.env.INCENTIVE_RECONCILE_INTERVAL_MS || "300000", 10);

const incentiveReconcileHandler = async () => {
  const startTime = Date.now();
  try {
    const result = await reconcileRecentDeliveries({
      lookbackMs: INCENTIVE_RECONCILE_INTERVAL_MS() * 2,
    });
    const duration = Date.now() - startTime;
    if (result.expired > 0 || result.evaluated > 0) {
      logger.info("Incentive reconcile job completed", {
        jobName: "incentiveReconcileJob",
        duration,
        ...result,
      });
    }
  } catch (error) {
    logger.error("Incentive reconcile job failed", {
      jobName: "incentiveReconcileJob",
      duration: Date.now() - startTime,
      error: error.message,
      stack: error.stack,
    });
  }
};

export const getIncentiveReconcileJobHandler = () => incentiveReconcileHandler;
export const getIncentiveReconcileJobInterval = () => INCENTIVE_RECONCILE_INTERVAL_MS();
