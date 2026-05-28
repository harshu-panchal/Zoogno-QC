/**
 * Bull-backed implementation of `jobSchedulerPort`.
 *
 * All previously-inline calls to `sellerTimeoutQueue.add(...)` and
 * `deliveryTimeoutQueue.add(...)` live here. Domain services no longer touch
 * Bull directly.
 *
 * Behaviour is byte-identical to the inline code that used to live in
 * orderWorkflowService.js: same delays, same jobIds, same race-with-timeout
 * pattern, same warning logs with the same `scope` values.
 */

import {
  sellerTimeoutQueue,
  deliveryTimeoutQueue,
  JOB_NAMES,
} from "../../queues/orderQueues.js";
import {
  DEFAULT_SELLER_TIMEOUT_MS,
  DEFAULT_DELIVERY_TIMEOUT_MS,
} from "../../constants/orderWorkflow.js";
import logger from "../logger.js";

const BULL_ADD_TIMEOUT_MS = () =>
  parseInt(process.env.BULL_ADD_TIMEOUT_MS || "10000", 10);

function sellerJobId(orderId) {
  return `order:${orderId}:seller`;
}

function deliveryJobId(orderId, attempt) {
  return `order:${orderId}:delivery:${attempt}`;
}

async function raceWithTimeout(promise, timeoutMs, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs),
    ),
  ]);
}

async function scheduleSellerTimeout(orderId) {
  const delay = DEFAULT_SELLER_TIMEOUT_MS();
  const addPromise = sellerTimeoutQueue
    .add(
      JOB_NAMES.SELLER_TIMEOUT,
      { orderId },
      {
        delay,
        jobId: sellerJobId(orderId),
        removeOnComplete: true,
      },
    )
    .catch((err) => {
      logger.warn("scheduleSellerTimeoutJob add failed", {
        scope: "scheduleSellerTimeoutJob",
        orderId,
        error: err.message,
      });
    });
  const timeoutMs = BULL_ADD_TIMEOUT_MS();
  try {
    await raceWithTimeout(
      addPromise,
      timeoutMs,
      `seller-timeout queue add exceeded ${timeoutMs}ms`,
    );
  } catch (e) {
    logger.warn("scheduleSellerTimeoutJob timed out", {
      scope: "scheduleSellerTimeoutJob",
      orderId,
      error: e.message,
    });
  }
}

async function removeSellerTimeout(orderId) {
  const timeoutMs = BULL_ADD_TIMEOUT_MS();
  const work = (async () => {
    const job = await sellerTimeoutQueue.getJob(sellerJobId(orderId));
    if (job) await job.remove();
  })().catch((err) => {
    logger.warn("removeSellerTimeoutJob get/remove failed", {
      scope: "removeSellerTimeoutJob",
      orderId,
      error: err.message,
    });
  });
  try {
    await raceWithTimeout(
      work,
      timeoutMs,
      `remove seller job exceeded ${timeoutMs}ms`,
    );
  } catch (e) {
    logger.warn("removeSellerTimeoutJob timed out", {
      scope: "removeSellerTimeoutJob",
      orderId,
      error: e.message,
    });
  }
}

async function scheduleDeliveryTimeout(orderId, attempt = 1) {
  const delay = DEFAULT_DELIVERY_TIMEOUT_MS();
  const jobId = deliveryJobId(orderId, attempt);
  const addPromise = deliveryTimeoutQueue
    .add(
      JOB_NAMES.DELIVERY_TIMEOUT,
      { orderId, attempt },
      {
        delay,
        jobId,
        removeOnComplete: true,
      },
    )
    .catch((err) => {
      logger.warn("scheduleDeliveryTimeoutJob add failed", {
        scope: "scheduleDeliveryTimeoutJob",
        orderId,
        error: err.message,
      });
    });
  const timeoutMs = BULL_ADD_TIMEOUT_MS();
  try {
    await raceWithTimeout(
      addPromise,
      timeoutMs,
      `delivery-timeout queue add exceeded ${timeoutMs}ms`,
    );
  } catch (e) {
    logger.warn("scheduleDeliveryTimeoutJob timed out", {
      scope: "scheduleDeliveryTimeoutJob",
      orderId,
      error: e.message,
    });
  }
}

async function removeDeliveryTimeout(orderId, attempt = 1) {
  const timeoutMs = BULL_ADD_TIMEOUT_MS();
  const jobKey = deliveryJobId(orderId, attempt);
  const work = (async () => {
    const job = await deliveryTimeoutQueue.getJob(jobKey);
    if (job) await job.remove();
  })().catch((err) => {
    logger.warn("removeDeliveryTimeoutJob get/remove failed", {
      scope: "removeDeliveryTimeoutJob",
      orderId,
      error: err.message,
    });
  });
  try {
    await raceWithTimeout(
      work,
      timeoutMs,
      `remove delivery job exceeded ${timeoutMs}ms`,
    );
  } catch (e) {
    logger.warn("removeDeliveryTimeoutJob timed out", {
      scope: "removeDeliveryTimeoutJob",
      orderId,
      error: e.message,
    });
  }
}

export const bullJobScheduler = {
  scheduleSellerTimeout,
  removeSellerTimeout,
  scheduleDeliveryTimeout,
  removeDeliveryTimeout,
};

export default bullJobScheduler;
