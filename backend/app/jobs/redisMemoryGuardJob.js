import { getRedisClient } from "../config/redis.js";
import logger from "../services/logger.js";

/**
 * Redis memory guard.
 *
 * Redis is on a small fixed-size plan with `volatile-lru` eviction, which can only evict keys
 * that have a TTL. Bull job records have none, so if jobs pile up, Redis hits maxmemory and
 * rejects every write - including the scheduler's own lock SETNX, which silently stops all
 * scheduled jobs (rider payout release, auto-cancel, ...). This job trims the stale queue
 * records before that happens.
 *
 * Only ever removes:
 *   - Bull `completed` / `failed` jobs older than STALE_MS
 *   - Bull `delayed` jobs overdue by more than STALE_MS (their order has long moved on)
 * Never touches: wait/active jobs, recent jobs, scheduler locks, OTP/idempotency keys, caches.
 *
 * Env:
 *   REDIS_MEMORY_LIMIT_MB          plan limit (default 30)
 *   REDIS_MEMORY_GUARD_THRESHOLD   fraction of the limit that triggers cleanup (default 0.7)
 *   REDIS_MEMORY_GUARD_INTERVAL_MS check interval (default 300000 = 5 min)
 *   REDIS_MEMORY_GUARD_ENABLED     "false" to disable
 */

const QUEUES = ["delivery-timeout", "broadcast-start", "seller-timeout", "notifications", "notifications-dead", "search-index"];
const STALE_MS = 24 * 60 * 60 * 1000;
const BATCH = 1000;
const MAX_BATCHES_PER_RUN = 100;

const limitBytes = () => parseFloat(process.env.REDIS_MEMORY_LIMIT_MB || "30") * 1024 * 1024;
const threshold = () => parseFloat(process.env.REDIS_MEMORY_GUARD_THRESHOLD || "0.7");

const usedMemory = async (client) => {
  const info = await client.info("memory");
  return parseInt(info.match(/used_memory:(\d+)/)?.[1] || "0", 10);
};

/** Removes stale entries from one Bull set. `score` semantics differ per set. */
async function trimSet(client, queue, set, cutoffScore) {
  const prefix = `bull:${queue}`;
  const zkey = `${prefix}:${set}`;
  let removed = 0;
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const ids = await client.zrangebyscore(zkey, 0, cutoffScore, "LIMIT", 0, BATCH);
    if (!ids.length) break;
    const p = client.pipeline();
    for (const id of ids) {
      p.zrem(zkey, id);
      p.del(`${prefix}:${id}`, `${prefix}:${id}:lock`, `${prefix}:${id}:logs`);
    }
    await p.exec();
    removed += ids.length;
  }
  return removed;
}

export async function runRedisMemoryGuard({ force = false } = {}) {
  const client = getRedisClient();
  if (!client) return { skipped: true };

  const before = await usedMemory(client);
  const ratio = before / limitBytes();
  if (!force && ratio < threshold()) return { skipped: true, ratio };

  const now = Date.now();
  const cutoffMs = now - STALE_MS;
  const removed = {};
  for (const q of QUEUES) {
    // delayed score = dueTime * 0x1000; finished sets (completed/failed) score = finish time in ms.
    const delayed = await trimSet(client, q, "delayed", cutoffMs * 4096);
    const completed = await trimSet(client, q, "completed", cutoffMs);
    const failed = await trimSet(client, q, "failed", cutoffMs);
    if (delayed || completed || failed) removed[q] = { delayed, completed, failed };
  }

  const after = await usedMemory(client);
  const level = after / limitBytes() >= 0.9 ? "error" : "warn";
  logger[level]("Redis memory guard ran", {
    jobName: "redisMemoryGuardJob",
    usedMB: +(after / 1048576).toFixed(1),
    limitMB: +(limitBytes() / 1048576).toFixed(1),
    freedMB: +((before - after) / 1048576).toFixed(1),
    removed,
  });
  return { ratio, removed, before, after };
}

const handler = async () => {
  if (String(process.env.REDIS_MEMORY_GUARD_ENABLED || "true").toLowerCase() === "false") return;
  try {
    await runRedisMemoryGuard();
  } catch (err) {
    logger.error("Redis memory guard failed", { jobName: "redisMemoryGuardJob", error: err.message });
  }
};

export const getRedisMemoryGuardJobHandler = () => handler;
export const getRedisMemoryGuardJobInterval = () =>
  parseInt(process.env.REDIS_MEMORY_GUARD_INTERVAL_MS || "300000", 10);
