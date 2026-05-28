import mongoose from "mongoose";
import * as logger from "./logger.js";

/**
 * Database Index Manager Service
 * 
 * Manages database indexes for optimal query performance across all collections.
 * Provides functions to create, verify, analyze, and monitor indexes.
 */

/**
 * Index definitions for all collections
 * Each entry specifies the collection name and its required indexes
 */
const INDEX_DEFINITIONS = {
  // Only define indexes here that are NOT already in the model schemas
  // or that need specific centralized management.
  
  products: [
    // These are managed here to ensure background: true and specific naming
    { keys: { status: 1, categoryId: 1, createdAt: -1 }, options: { name: "idx_status_category_created", background: true } },
    { keys: { status: 1, sellerId: 1, createdAt: -1 }, options: { name: "idx_status_seller_created", background: true } },
  ],
  
  orders: [
    // These are already in Order.js, keeping only if we want explicit background creation
    { keys: { customer: 1, createdAt: -1, status: 1 }, options: { name: "idx_customer_created_status", background: true } },
    { keys: { seller: 1, status: 1, createdAt: -1 }, options: { name: "idx_seller_status_created", background: true } },
    { keys: { seller: 1, workflowStatus: 1, createdAt: -1 }, options: { name: "idx_seller_workflow_created", background: true } },

    // P6.1 — backs OrderReturnService + admin/seller returns list page.
    // Filter shape: { seller: <id>, returnStatus: { $ne: "none" }, returnRequestedAt: { $gte, $lte } }
    { keys: { seller: 1, returnStatus: 1, returnRequestedAt: -1 }, options: { name: "idx_seller_returnStatus_requestedAt", background: true } },

    // P6.1 — backs fetchAvailableOrdersForDelivery return-pickup branch.
    // Filter shape: { returnStatus: { $in }, returnDeliveryBoy: <id>, skippedBy: { $nin } }
    { keys: { returnStatus: 1, returnDeliveryBoy: 1, createdAt: -1 }, options: { name: "idx_returnStatus_deliveryBoy_created", background: true, sparse: true } },

    // P6.1 — backs delivery-partner COD cash summary.
    // Filter shape: { deliveryBoy: <id>, paymentMode: "COD", status: { $ne: "cancelled" } }
    { keys: { deliveryBoy: 1, paymentMode: 1, createdAt: -1 }, options: { name: "idx_deliveryBoy_paymentMode_created", background: true } },
  ],
  
  transactions: [
    { keys: { userId: 1, createdAt: -1, type: 1 }, options: { name: "idx_user_created_type", background: true } },
    { keys: { userId: 1, status: 1, createdAt: -1 }, options: { name: "idx_user_status_created", background: true } },

    // P6.1 — backs DeliveryEarningsService.getDeliveryStats / getDeliveryEarnings.
    // Filter shape: { user: <id>, userModel: "Delivery", status: "Settled", createdAt: { $gte } }
    { keys: { user: 1, userModel: 1, status: 1, createdAt: -1 }, options: { name: "idx_user_userModel_status_created", background: true } },
  ],
  
  notifications: [
    { keys: { recipient: 1, createdAt: -1 }, options: { name: "idx_recipient_created", background: true } },

    // P6.1 Part 3 — backs unread-count badge query.
    // Filter shape: { recipient, read: false }
    { keys: { recipient: 1, read: 1, createdAt: -1 }, options: { name: "idx_recipient_read_created", background: true } },

    // P6.1 Part 3 — backs notification cleanup job (delete >30d, by type).
    { keys: { type: 1, createdAt: -1 }, options: { name: "idx_type_created", background: true } },
  ],

  // P6.1 Part 3 — sellers collection (verification + nearby lookup).
  sellers: [
    // Backs admin verification / pending-sellers list.
    { keys: { isVerified: 1, isActive: 1, createdAt: -1 }, options: { name: "idx_isVerified_isActive_created", background: true } },
    // Backs seller-by-email auth lookup.
    { keys: { email: 1 }, options: { name: "idx_email", background: true, sparse: true } },
    // Backs seller-by-phone OTP signup lookup.
    { keys: { phone: 1 }, options: { name: "idx_phone", background: true, sparse: true } },
  ],

  // P6.1 Part 3 — customers / users collection (auth + addresses).
  customers: [
    { keys: { phone: 1 }, options: { name: "idx_phone", background: true, sparse: true } },
    { keys: { email: 1 }, options: { name: "idx_email", background: true, sparse: true } },
    { keys: { createdAt: -1 }, options: { name: "idx_created", background: true } },
  ],

  // P6.1 Part 3 — delivery partners collection.
  deliveries: [
    { keys: { phone: 1 }, options: { name: "idx_phone", background: true, sparse: true } },
    { keys: { isOnline: 1, isVerified: 1, isActive: 1 }, options: { name: "idx_online_verified_active", background: true } },
  ],

  // P6.1 Part 3 — wishlist lookup is always per-customer.
  wishlists: [
    { keys: { customerId: 1 }, options: { name: "idx_customerId", background: true } },
    { keys: { customerId: 1, "items.productId": 1 }, options: { name: "idx_customerId_itemsProductId", background: true } },
  ],

  // P6.1 Part 3 — cart lookup is always per-customer.
  carts: [
    { keys: { customerId: 1 }, options: { name: "idx_customerId_unique", background: true, unique: true } },
  ],

  // P6.1 Part 3 — withdrawals admin queue + per-user history.
  withdrawals: [
    { keys: { status: 1, createdAt: -1 }, options: { name: "idx_status_created", background: true } },
    { keys: { user: 1, userModel: 1, createdAt: -1 }, options: { name: "idx_user_userModel_created", background: true } },
  ],

  // P6.1 Part 3 — support tickets admin queue.
  tickets: [
    { keys: { status: 1, priority: 1, createdAt: -1 }, options: { name: "idx_status_priority_created", background: true } },
    { keys: { userId: 1, status: 1, createdAt: -1 }, options: { name: "idx_userId_status_created", background: true } },
  ],

  // P6.1 Part 3 — finance ledger lookups (already common but explicit).
  ledgerentries: [
    { keys: { orderId: 1, actorType: 1, createdAt: -1 }, options: { name: "idx_orderId_actorType_created", background: true } },
    { keys: { ownerType: 1, ownerId: 1, createdAt: -1 }, options: { name: "idx_ownerType_ownerId_created", background: true } },
  ],

  // P6.1 Part 3 — webhook idempotency lookup.
  paymentwebhookevents: [
    { keys: { eventId: 1 }, options: { name: "idx_eventId_unique", background: true, unique: true } },
    { keys: { gatewayName: 1, createdAt: -1 }, options: { name: "idx_gatewayName_created", background: true } },
  ],

  payments: [
    // P6.1 — backs paymentService.verifyPhonePePaymentStatus + webhook lookup.
    // Filter shape: { gatewayOrderId: <merchantOrderId> }
    { keys: { gatewayOrderId: 1 }, options: { name: "idx_gatewayOrderId", background: true, unique: false } },
    // Aggregations like `Payment.countDocuments({ order, customer })`.
    { keys: { order: 1, customer: 1, createdAt: -1 }, options: { name: "idx_order_customer_created", background: true } },
  ],

  orderotps: [
    // P6.1 — backs OrderReturnService.getReturnDetails active-OTP lookup.
    // Filter shape: { orderId, type, consumedAt: null, expiresAt: { $gt } }
    { keys: { orderId: 1, type: 1, expiresAt: -1 }, options: { name: "idx_orderId_type_expiresAt", background: true } },
  ],

  deliveryassignments: [
    // P6.1 — backs orderWorkflowService delivery broadcast lifecycle queries.
    { keys: { orderId: 1, status: 1, attempt: -1 }, options: { name: "idx_orderId_status_attempt", background: true } },
  ],
};

/**
 * Create all required indexes across all collections
 * @returns {Promise<void>}
 */
export async function createAllIndexes() {
  const startTime = Date.now();
  logger.info("[DatabaseIndexManager] Starting index creation...");
  
  const results = {
    created: 0,
    existing: 0,
    failed: 0,
    errors: [],
  };
  
  try {
    for (const [collectionName, indexes] of Object.entries(INDEX_DEFINITIONS)) {
      const collection = mongoose.connection.collection(collectionName);
      
      for (const indexDef of indexes) {
        try {
          const indexName = indexDef.options?.name || Object.keys(indexDef.keys).join("_");
          
          const existingIndexes = await collection.indexes();
          const indexExists = existingIndexes.some(idx => idx.name === indexName);
          
          if (indexExists) {
            results.existing++;
            continue;
          }
          
          const options = { ...indexDef.options, background: true };
          await collection.createIndex(indexDef.keys, options);
          logger.info(`[DatabaseIndexManager] Created index "${indexName}" on ${collectionName}`);
          results.created++;
          
        } catch (error) {
          if (error.code === 85 || error.codeName === "IndexOptionsConflict") {
            results.existing++;
            continue;
          }
          
          logger.error(`[DatabaseIndexManager] Failed to create index on ${collectionName}:`, error);
          results.failed++;
          results.errors.push({
            collection: collectionName,
            index: indexDef.options?.name || "unnamed",
            error: error.message,
          });
        }
      }
    }
    
    const duration = Date.now() - startTime;
    logger.info(`[DatabaseIndexManager] Index creation completed in ${duration}ms`, {
      created: results.created,
      existing: results.existing,
      failed: results.failed,
    });
    
    if (results.failed > 0) {
      logger.warn(`[DatabaseIndexManager] ${results.failed} indexes failed to create:`, results.errors);
    }
    
  } catch (error) {
    logger.error("[DatabaseIndexManager] Fatal error during index creation:", error);
    throw error;
  }
}

/**
 * Verify index existence and performance
 * @returns {Promise<Object>} Index health report
 */
export async function verifyIndexes() {
  logger.info("[DatabaseIndexManager] Verifying indexes...");
  
  const report = {
    collections: {},
    summary: {
      totalExpected: 0,
      totalExisting: 0,
      missing: [],
      healthy: true,
    },
  };
  
  try {
    for (const [collectionName, expectedIndexes] of Object.entries(INDEX_DEFINITIONS)) {
      const collection = mongoose.connection.collection(collectionName);
      const existingIndexes = await collection.indexes();
      
      const collectionReport = {
        expected: expectedIndexes.length,
        existing: existingIndexes.length,
        missing: [],
        extra: [],
      };
      
      // Check for missing indexes
      for (const indexDef of expectedIndexes) {
        const indexName = indexDef.options?.name || Object.keys(indexDef.keys).join("_");
        const exists = existingIndexes.some(idx => idx.name === indexName);
        
        if (!exists) {
          collectionReport.missing.push(indexName);
          report.summary.missing.push({ collection: collectionName, index: indexName });
          report.summary.healthy = false;
        }
      }
      
      report.collections[collectionName] = collectionReport;
      report.summary.totalExpected += expectedIndexes.length;
      report.summary.totalExisting += existingIndexes.length;
    }
    
    if (report.summary.healthy) {
      logger.info("[DatabaseIndexManager] All indexes verified successfully");
    } else {
      logger.warn("[DatabaseIndexManager] Missing indexes detected:", report.summary.missing);
    }
    
    return report;
    
  } catch (error) {
    logger.error("[DatabaseIndexManager] Error verifying indexes:", error);
    throw error;
  }
}

/**
 * Analyze slow queries and suggest indexes
 * @param {number} thresholdMs - Slow query threshold in milliseconds (default: 100ms)
 * @returns {Promise<Array>} Array of index suggestions
 */
export async function analyzeSlowQueries(thresholdMs = 100) {
  logger.info(`[DatabaseIndexManager] Analyzing slow queries (threshold: ${thresholdMs}ms)...`);
  
  const suggestions = [];
  
  try {
    // Enable profiling if not already enabled
    const adminDb = mongoose.connection.db.admin();
    await mongoose.connection.db.setProfilingLevel(1, { slowms: thresholdMs });
    
    // Query system.profile collection for slow queries
    const profileCollection = mongoose.connection.db.collection("system.profile");
    const slowQueries = await profileCollection
      .find({ millis: { $gte: thresholdMs } })
      .sort({ ts: -1 })
      .limit(100)
      .toArray();
    
    // Analyze query patterns
    const queryPatterns = new Map();
    
    for (const query of slowQueries) {
      if (!query.ns || !query.command) continue;
      
      const collection = query.ns.split(".").pop();
      const operation = query.op || "unknown";
      const filter = query.command?.filter || query.command?.query || {};
      
      const pattern = {
        collection,
        operation,
        fields: Object.keys(filter),
        executionTime: query.millis,
        timestamp: query.ts,
      };
      
      const key = `${collection}:${pattern.fields.join(",")}`;
      
      if (!queryPatterns.has(key)) {
        queryPatterns.set(key, {
          ...pattern,
          count: 1,
          avgTime: query.millis,
        });
      } else {
        const existing = queryPatterns.get(key);
        existing.count++;
        existing.avgTime = (existing.avgTime * (existing.count - 1) + query.millis) / existing.count;
      }
    }
    
    // Generate suggestions
    for (const [key, pattern] of queryPatterns) {
      if (pattern.count >= 5 && pattern.avgTime >= thresholdMs) {
        suggestions.push({
          collection: pattern.collection,
          suggestedIndex: pattern.fields.reduce((acc, field) => {
            acc[field] = 1;
            return acc;
          }, {}),
          reason: `Frequent slow query (${pattern.count} occurrences, avg ${pattern.avgTime.toFixed(2)}ms)`,
          priority: pattern.avgTime > 500 ? "high" : pattern.avgTime > 200 ? "medium" : "low",
        });
      }
    }
    
    logger.info(`[DatabaseIndexManager] Found ${suggestions.length} index suggestions`);
    return suggestions;
    
  } catch (error) {
    logger.error("[DatabaseIndexManager] Error analyzing slow queries:", error);
    return suggestions;
  }
}

/**
 * Get index usage statistics for a collection
 * @param {string} collectionName - Collection name
 * @returns {Promise<Array>} Array of index statistics
 */
export async function getIndexStats(collectionName) {
  logger.info(`[DatabaseIndexManager] Getting index stats for ${collectionName}...`);
  
  try {
    const collection = mongoose.connection.collection(collectionName);
    
    // Use $indexStats aggregation to get usage statistics
    const stats = await collection.aggregate([
      { $indexStats: {} }
    ]).toArray();
    
    const formattedStats = stats.map(stat => ({
      name: stat.name,
      operations: stat.accesses?.ops || 0,
      since: stat.accesses?.since || null,
      key: stat.key,
      isUnused: (stat.accesses?.ops || 0) === 0,
    }));
    
    // Log unused indexes
    const unusedIndexes = formattedStats.filter(stat => stat.isUnused && stat.name !== "_id_");
    if (unusedIndexes.length > 0) {
      logger.warn(`[DatabaseIndexManager] Unused indexes on ${collectionName}:`, 
        unusedIndexes.map(idx => idx.name)
      );
    }
    
    return formattedStats;
    
  } catch (error) {
    logger.error(`[DatabaseIndexManager] Error getting index stats for ${collectionName}:`, error);
    throw error;
  }
}

export default {
  createAllIndexes,
  verifyIndexes,
  analyzeSlowQueries,
  getIndexStats,
};
