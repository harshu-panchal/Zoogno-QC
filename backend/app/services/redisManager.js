import { getRedisClient } from "../config/redis.js";
import * as logger from "./logger.js";

const DEFAULT_TTL_SECONDS = 3600; // 1 hour default TTL
const GLOBAL_PREFIX = "zoogno";
const ENV_PREFIX = process.env.NODE_ENV || "development";

/**
 * Builds a standardized Redis key
 * Format: zoogno:{env}:{domain}:{entity}:{id}
 */
export function buildKey(domain, entity, id = "") {
  if (!domain || !entity) {
    throw new Error("Domain and Entity are required for standardized Redis keys");
  }
  let key = `${GLOBAL_PREFIX}:${ENV_PREFIX}:${domain}:${entity}`;
  if (id) {
    key += `:${id}`;
  }
  return key;
}

/**
 * Safe get
 */
export async function get(key) {
  const client = getRedisClient();
  if (!client) return null;
  
  try {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error("RedisManager GET Error", { key, error: error.message });
    return null; // Graceful fallback
  }
}

/**
 * Safe set with mandatory TTL
 */
export async function set(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const client = getRedisClient();
  if (!client) return false;

  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    await client.set(key, stringValue, 'EX', ttlSeconds);
    return true;
  } catch (error) {
    logger.error("RedisManager SET Error", { key, error: error.message });
    return false;
  }
}

/**
 * Set NX with TTL (useful for locks/idempotency)
 */
export async function setNX(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const client = getRedisClient();
  if (!client) return false;

  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    // Returns "OK" if set, null if not
    const result = await client.set(key, stringValue, 'NX', 'EX', ttlSeconds);
    return result === "OK";
  } catch (error) {
    logger.error("RedisManager SETNX Error", { key, error: error.message });
    return false;
  }
}

/**
 * Delete key
 */
export async function del(key) {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.del(key);
    return true;
  } catch (error) {
    logger.error("RedisManager DEL Error", { key, error: error.message });
    return false;
  }
}

/**
 * Increment key with window (useful for rate limits/counters)
 * Note: EXPIRE refreshes the TTL on each call. If you need a sliding window without refreshing,
 * use Lua scripts or separate check.
 */
export async function incrementWithWindow(key, limit, windowSeconds) {
  const client = getRedisClient();
  if (!client) return true;

  try {
    const [count] = await Promise.all([
      client.incr(key),
      client.expire(key, windowSeconds),
    ]);
    return Number(count) <= limit;
  } catch (error) {
    logger.error("RedisManager INCR Error", { key, error: error.message });
    return true; // Fallback: allow request
  }
}

/**
 * Increment key with window and return the count
 */
export async function incrementAndGetWithWindow(key, windowSeconds) {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const [count] = await Promise.all([
      client.incr(key),
      client.expire(key, windowSeconds),
    ]);
    return Number(count);
  } catch (error) {
    logger.error("RedisManager INCR Error", { key, error: error.message });
    return null;
  }
}

/**
 * Increment only (no TTL logic handled here)
 */
export async function incr(key) {
  const client = getRedisClient();
  if (!client) return 0;

  try {
    return await client.incr(key);
  } catch (error) {
    logger.error("RedisManager INCR_RAW Error", { key, error: error.message });
    return 0;
  }
}

/**
 * Expire a key
 */
export async function expire(key, ttlSeconds) {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.expire(key, ttlSeconds);
    return true;
  } catch (error) {
    logger.error("RedisManager EXPIRE Error", { key, error: error.message });
    return false;
  }
}

/**
 * Returns a pipeline instance for bulk operations
 */
export function getPipeline() {
  const client = getRedisClient();
  if (!client) return null;
  return client.multi();
}
