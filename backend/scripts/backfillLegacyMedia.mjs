/**
 * Backfill legacy (pre-VPS-pipeline) product/category/banner/seller images:
 * fetches each legacy image, resizes + re-encodes it with the same
 * sharp/webp pipeline new uploads already use (see app/utils/imageProcessor.js),
 * saves it to VPS storage, and updates the DB record to point at the new file.
 *
 * Run this ON THE VPS itself (same host that serves STORAGE_BASE_PATH), from
 * the backend/ project directory, so node_modules (sharp, mongoose) and the
 * .env (MONGO_URI, STORAGE_BASE_PATH) are the real production ones:
 *
 *   node scripts/backfillLegacyMedia.mjs --dry-run   # report only, no writes
 *   node scripts/backfillLegacyMedia.mjs             # apply for real
 *   node scripts/backfillLegacyMedia.mjs --limit=20  # process at most 20 docs (testing)
 *
 * Safe to re-run: it only touches documents whose image URL does NOT already
 * match the new dated pipeline path (".../<folder>/<year>/<month>/<uuid>.webp"),
 * so already-migrated docs are skipped automatically.
 */
import "dotenv/config";
import mongoose from "mongoose";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import crypto from "crypto";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
const CONCURRENCY = 4;

const ALREADY_MIGRATED_RE = /\/\d{4}\/\d{2}\/[^/]+\.webp$/i;

// Mirrors app/utils/imageProcessor.js CONTEXT_CONFIG so backfilled images end
// up the same size/format as current uploads for the same context.
const CONTEXT_CONFIG = {
  products: { width: 800, height: 800, fit: "inside" },
  categories: { width: 400, height: 400, fit: "inside" },
  banners: { width: 1648, height: 760, fit: "cover" },
  users: { width: 400, height: 400, fit: "cover" },
};

function getBaseUrl() {
  let baseUrl = process.env.API_BASE_URL || process.env.APP_URL || process.env.FRONTEND_URL || "";
  if (!baseUrl) {
    let host = process.env.HOSTNAME || "localhost:5000";
    if (host === "localhost" && process.env.PORT) host = `localhost:${process.env.PORT}`;
    baseUrl = `http://${host}`;
  }
  return baseUrl;
}

function getStorageBasePath() {
  return process.env.STORAGE_BASE_PATH || path.join(process.cwd(), "storage");
}

const stats = {
  scanned: 0,
  alreadyMigrated: 0,
  fetchFailed: 0,
  processed: 0,
  bytesBefore: 0,
  bytesAfter: 0,
  failures: [],
};

async function processOneUrl(sourceUrl, folder) {
  if (!sourceUrl || typeof sourceUrl !== "string") return null;
  if (ALREADY_MIGRATED_RE.test(sourceUrl)) {
    stats.alreadyMigrated += 1;
    return null;
  }

  stats.scanned += 1;

  let response;
  try {
    response = await fetch(sourceUrl);
  } catch (err) {
    stats.fetchFailed += 1;
    stats.failures.push({ url: sourceUrl, reason: `network error: ${err.message}` });
    return null;
  }
  if (!response.ok) {
    stats.fetchFailed += 1;
    stats.failures.push({ url: sourceUrl, reason: `HTTP ${response.status}` });
    return null;
  }

  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const config = CONTEXT_CONFIG[folder] || CONTEXT_CONFIG.products;

  let outputBuffer;
  try {
    outputBuffer = await sharp(sourceBuffer)
      .resize({ width: config.width, height: config.height, fit: config.fit, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (err) {
    stats.failures.push({ url: sourceUrl, reason: `sharp processing failed: ${err.message}` });
    return null;
  }

  stats.bytesBefore += sourceBuffer.length;
  stats.bytesAfter += outputBuffer.length;
  stats.processed += 1;

  if (DRY_RUN) {
    return { newUrl: sourceUrl, before: sourceBuffer.length, after: outputBuffer.length };
  }

  const date = new Date();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const filename = `${crypto.randomUUID()}.webp`;
  const relativePath = path.join(folder, year, month, filename);
  const absolutePath = path.join(getStorageBasePath(), relativePath);

  await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
  await fsp.writeFile(absolutePath, outputBuffer);

  const newUrl = `${getBaseUrl()}/images/${relativePath.replace(/\\/g, "/")}`;
  return { newUrl, before: sourceBuffer.length, after: outputBuffer.length };
}

async function runWithConcurrency(items, worker, concurrency) {
  const queue = [...items];
  const workers = new Array(concurrency).fill(null).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(workers);
}

async function backfillCollection({ collectionName, singleField, arrayField, folder }) {
  const db = mongoose.connection.db;
  const col = db.collection(collectionName);

  const query = {};
  const or = [];
  if (singleField) or.push({ [singleField]: { $exists: true, $ne: null, $ne: "" } });
  if (arrayField) or.push({ [arrayField]: { $exists: true, $ne: [] } });
  if (or.length) query.$or = or;

  const cursor = col.find(query).limit(LIMIT === Infinity ? 0 : LIMIT);
  const docs = await cursor.toArray();

  console.log(`\n=== ${collectionName} (${docs.length} candidate docs) ===`);

  await runWithConcurrency(
    docs,
    async (doc) => {
      const update = {};

      if (singleField && doc[singleField]) {
        const result = await processOneUrl(doc[singleField], folder);
        if (result) {
          console.log(
            `${DRY_RUN ? "[dry-run] would update" : "updated"} ${collectionName}/${doc._id} ${singleField}: ${result.before}B -> ${result.after}B`,
          );
          if (!DRY_RUN) update[singleField] = result.newUrl;
        }
      }

      if (arrayField && Array.isArray(doc[arrayField]) && doc[arrayField].length > 0) {
        const newArray = [];
        let changed = false;
        for (const url of doc[arrayField]) {
          const result = await processOneUrl(url, folder);
          if (result) {
            changed = true;
            newArray.push(DRY_RUN ? url : result.newUrl);
            console.log(
              `${DRY_RUN ? "[dry-run] would update" : "updated"} ${collectionName}/${doc._id} ${arrayField}[]: ${result.before}B -> ${result.after}B`,
            );
          } else {
            newArray.push(url);
          }
        }
        if (changed && !DRY_RUN) update[arrayField] = newArray;
      }

      if (!DRY_RUN && Object.keys(update).length > 0) {
        await col.updateOne({ _id: doc._id }, { $set: update });
      }
    },
    CONCURRENCY,
  );
}

async function main() {
  console.log(`Starting media backfill${DRY_RUN ? " (DRY RUN — no writes)" : ""}...`);
  await mongoose.connect(process.env.MONGO_URI);

  await backfillCollection({ collectionName: "products", singleField: "mainImage", arrayField: "galleryImages", folder: "products" });
  await backfillCollection({ collectionName: "categories", singleField: "image", folder: "categories" });
  await backfillCollection({ collectionName: "heroconfigs", singleField: "fallbackImageUrl", folder: "banners" });
  await backfillCollection({ collectionName: "sellers", singleField: "shopImage", folder: "users" });

  console.log("\n=== Summary ===");
  console.log(`Scanned (legacy, not yet migrated): ${stats.scanned}`);
  console.log(`Already migrated (skipped): ${stats.alreadyMigrated}`);
  console.log(`Fetch failed (broken source, left untouched): ${stats.fetchFailed}`);
  console.log(`Successfully processed: ${stats.processed}`);
  if (stats.processed > 0) {
    console.log(`Total bytes before: ${stats.bytesBefore} (${(stats.bytesBefore / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Total bytes after:  ${stats.bytesAfter} (${(stats.bytesAfter / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Reduction: ${(100 * (1 - stats.bytesAfter / stats.bytesBefore)).toFixed(1)}%`);
  }
  if (stats.failures.length > 0) {
    console.log(`\nFailures (${stats.failures.length}), left untouched in DB:`);
    stats.failures.slice(0, 50).forEach((f) => console.log(`  ${f.url} -- ${f.reason}`));
    if (stats.failures.length > 50) console.log(`  ... and ${stats.failures.length - 50} more`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
