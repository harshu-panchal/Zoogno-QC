import {
  sellerTimeoutQueue,
  deliveryTimeoutQueue,
  broadcastStartQueue,
  JOB_NAMES,
} from "./orderQueues.js";
import {
  processSellerTimeoutJob,
  processDeliveryTimeoutJob,
  processBroadcastStartJob,
} from "../services/orderWorkflowService.js";
import { isRedisEnabled } from "../config/redis.js";
import logger from "../services/logger.js";
import { incrementCounter, recordHistogram } from "../services/metrics.js";

export function registerOrderQueueProcessors() {
  if (!isRedisEnabled()) {
    logger.info('Redis disabled, skipping queue processor registration');
    return;
  }

  // Seller timeout queue processor
  sellerTimeoutQueue.process(JOB_NAMES.SELLER_TIMEOUT, async (job) => {
    const startTime = Date.now();
    
    try {
      logger.info('Processing seller timeout job', {
        jobId: job.id,
        jobType: JOB_NAMES.SELLER_TIMEOUT,
        orderId: job.data.orderId,
        attempt: job.attemptsMade + 1
      });
      
      await processSellerTimeoutJob(job.data);
      
      const duration = Date.now() - startTime;
      
      logger.info('Seller timeout job completed', {
        jobId: job.id,
        jobType: JOB_NAMES.SELLER_TIMEOUT,
        orderId: job.data.orderId,
        duration
      });
      
      // Collect metrics
      incrementCounter('queue_jobs_total', {
        queue: 'seller-timeout',
        status: 'completed'
      });
      recordHistogram('queue_job_duration_seconds', duration / 1000, {
        queue: 'seller-timeout'
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Seller timeout job failed', {
        jobId: job.id,
        jobType: JOB_NAMES.SELLER_TIMEOUT,
        orderId: job.data.orderId,
        attempt: job.attemptsMade + 1,
        duration,
        error: error.message,
        stack: error.stack
      });
      
      // Collect metrics
      incrementCounter('queue_jobs_total', {
        queue: 'seller-timeout',
        status: 'failed'
      });
      
      throw error; // Re-throw to let Bull handle retry
    }
  });

  // Delivery timeout queue processor
  deliveryTimeoutQueue.process(JOB_NAMES.DELIVERY_TIMEOUT, async (job) => {
    const startTime = Date.now();
    
    try {
      logger.info('Processing delivery timeout job', {
        jobId: job.id,
        jobType: JOB_NAMES.DELIVERY_TIMEOUT,
        orderId: job.data.orderId,
        attempt: job.attemptsMade + 1
      });
      
      await processDeliveryTimeoutJob(job.data);
      
      const duration = Date.now() - startTime;
      
      logger.info('Delivery timeout job completed', {
        jobId: job.id,
        jobType: JOB_NAMES.DELIVERY_TIMEOUT,
        orderId: job.data.orderId,
        duration
      });
      
      // Collect metrics
      incrementCounter('queue_jobs_total', {
        queue: 'delivery-timeout',
        status: 'completed'
      });
      recordHistogram('queue_job_duration_seconds', duration / 1000, {
        queue: 'delivery-timeout'
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Delivery timeout job failed', {
        jobId: job.id,
        jobType: JOB_NAMES.DELIVERY_TIMEOUT,
        orderId: job.data.orderId,
        attempt: job.attemptsMade + 1,
        duration,
        error: error.message,
        stack: error.stack
      });
      
      // Collect metrics
      incrementCounter('queue_jobs_total', {
        queue: 'delivery-timeout',
        status: 'failed'
      });
      
      throw error; // Re-throw to let Bull handle retry
    }
  });

  // Broadcast-start queue processor (delayed rider broadcast after prep time)
  broadcastStartQueue.process(JOB_NAMES.BROADCAST_START, async (job) => {
    const startTime = Date.now();
    try {
      logger.info('Processing broadcast-start job', {
        jobId: job.id,
        jobType: JOB_NAMES.BROADCAST_START,
        orderId: job.data.orderId,
        attempt: job.attemptsMade + 1
      });

      await processBroadcastStartJob(job.data);

      const duration = Date.now() - startTime;
      logger.info('Broadcast-start job completed', {
        jobId: job.id,
        jobType: JOB_NAMES.BROADCAST_START,
        orderId: job.data.orderId,
        duration
      });

      incrementCounter('queue_jobs_total', {
        queue: 'broadcast-start',
        status: 'completed'
      });
      recordHistogram('queue_job_duration_seconds', duration / 1000, {
        queue: 'broadcast-start'
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Broadcast-start job failed', {
        jobId: job.id,
        jobType: JOB_NAMES.BROADCAST_START,
        orderId: job.data.orderId,
        attempt: job.attemptsMade + 1,
        duration,
        error: error.message,
        stack: error.stack
      });
      incrementCounter('queue_jobs_total', {
        queue: 'broadcast-start',
        status: 'failed'
      });
      throw error;
    }
  });

  // Queue event handlers
  sellerTimeoutQueue.on("failed", (job, err) => {
    logger.error('Seller timeout queue job failed', {
      jobId: job?.id,
      jobType: JOB_NAMES.SELLER_TIMEOUT,
      orderId: job?.data?.orderId,
      error: err?.message
    });
  });
  
  deliveryTimeoutQueue.on("failed", (job, err) => {
    logger.error('Delivery timeout queue job failed', {
      jobId: job?.id,
      jobType: JOB_NAMES.DELIVERY_TIMEOUT,
      orderId: job?.data?.orderId,
      error: err?.message
    });
  });
  
  sellerTimeoutQueue.on("completed", (job) => {
    logger.debug('Seller timeout queue job completed', {
      jobId: job?.id,
      orderId: job?.data?.orderId
    });
  });
  
  deliveryTimeoutQueue.on("completed", (job) => {
    logger.debug('Delivery timeout queue job completed', {
      jobId: job?.id,
      orderId: job?.data?.orderId
    });
  });
  
  broadcastStartQueue.on("failed", (job, err) => {
    logger.error('Broadcast-start queue job failed', {
      jobId: job?.id,
      jobType: JOB_NAMES.BROADCAST_START,
      orderId: job?.data?.orderId,
      error: err?.message
    });
  });

  logger.info('Order queue processors registered', {
    queues: [JOB_NAMES.SELLER_TIMEOUT, JOB_NAMES.DELIVERY_TIMEOUT, JOB_NAMES.BROADCAST_START]
  });
}
