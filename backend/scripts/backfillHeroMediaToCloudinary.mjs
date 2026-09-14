/**
 * Migrates hero/banner video + poster images (app/models/heroConfig.js:
 * videoUrl, fallbackImageUrl) off raw VPS storage and onto Cloudinary.
 *
 * Why: VPS storage has no video transcoding and no CDN — hero videos were
 * uploaded raw (2.6-4.9MB, uncompressed) and poster images were sometimes
 * multi-MB originals, both served from a single origin with no format
 * negotiation. This is what caused the black flash on the home page banner
 * (poster + video both too slow to paint before the video's own first frame).
 *
 * Cloudinary transcodes on first delivery (cached at its CDN edge after
 * that) and negotiates MP4 vs WebM per browser via f_auto — unlike the
 * VPS image backfill, this needs no filesystem access to the production
 * server, so it can run from anywhere with the Cloudinary credentials.
 *
 * Usage:
 *   node scripts/backfillHeroMediaToCloudinary.mjs --dry-run   # report only
 *   node scripts/backfillHeroMediaToCloudinary.mjs             # apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";

const DRY_RUN = process.argv.includes("--dry-run");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALREADY_ON_CLOUDINARY_RE = /res\.cloudinary\.com/i;

const stats = { videos: { migrated: 0, skipped: 0, failed: 0, bytesBefore: 0, bytesAfter: 0 },
                images: { migrated: 0, skipped: 0, failed: 0, bytesBefore: 0, bytesAfter: 0 } };

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function migrateVideo(sourceUrl) {
  const buf = await fetchBuffer(sourceUrl);
  if (DRY_RUN) return { newUrl: sourceUrl, before: buf.length, after: null };

  const publicId = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "quick-commerce/banners", resource_type: "video" },
      (err, result) => (err ? reject(err) : resolve(result.public_id)),
    );
    stream.end(buf);
  });

  const newUrl = cloudinary.url(publicId, {
    resource_type: "video",
    secure: true,
    quality: "auto",
    fetch_format: "auto",
    width: 1280,
    crop: "limit",
  });

  // Warm the transformation now so the first real visitor doesn't pay the
  // one-time transcode cost.
  const check = await fetch(newUrl);
  const optimizedBytes = Number(check.headers.get("content-length") || 0);

  return { newUrl, before: buf.length, after: optimizedBytes };
}

async function migratePosterImage(sourceUrl) {
  const buf = await fetchBuffer(sourceUrl);
  if (DRY_RUN) return { newUrl: sourceUrl, before: buf.length, after: null };

  const publicId = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "quick-commerce/banners", resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result.public_id)),
    );
    stream.end(buf);
  });

  const newUrl = cloudinary.url(publicId, {
    resource_type: "image",
    secure: true,
    quality: "auto",
    fetch_format: "auto",
    width: 1200,
    crop: "limit",
  });

  const check = await fetch(newUrl);
  const optimizedBytes = Number(check.headers.get("content-length") || 0);

  return { newUrl, before: buf.length, after: optimizedBytes };
}

async function main() {
  console.log(`Starting hero media backfill${DRY_RUN ? " (DRY RUN)" : ""}...`);
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.db.collection("heroconfigs");

  const docs = await col.find({
    $or: [
      { videoUrl: { $exists: true, $ne: null, $ne: "" } },
      { fallbackImageUrl: { $exists: true, $ne: null, $ne: "" } },
    ],
  }).toArray();

  for (const doc of docs) {
    const update = {};

    if (doc.videoUrl && !ALREADY_ON_CLOUDINARY_RE.test(doc.videoUrl)) {
      try {
        const { newUrl, before, after } = await migrateVideo(doc.videoUrl);
        stats.videos.migrated += 1;
        stats.videos.bytesBefore += before;
        if (after != null) stats.videos.bytesAfter += after;
        console.log(`${DRY_RUN ? "[dry-run] would migrate" : "migrated"} heroconfigs/${doc._id} videoUrl: ${before}B${after != null ? ` -> ${after}B` : ""}`);
        if (!DRY_RUN) update.videoUrl = newUrl;
      } catch (err) {
        stats.videos.failed += 1;
        console.log(`FAILED heroconfigs/${doc._id} videoUrl: ${err.message}`);
      }
    } else if (doc.videoUrl) {
      stats.videos.skipped += 1;
    }

    if (doc.fallbackImageUrl && !ALREADY_ON_CLOUDINARY_RE.test(doc.fallbackImageUrl)) {
      try {
        const { newUrl, before, after } = await migratePosterImage(doc.fallbackImageUrl);
        stats.images.migrated += 1;
        stats.images.bytesBefore += before;
        if (after != null) stats.images.bytesAfter += after;
        console.log(`${DRY_RUN ? "[dry-run] would migrate" : "migrated"} heroconfigs/${doc._id} fallbackImageUrl: ${before}B${after != null ? ` -> ${after}B` : ""}`);
        if (!DRY_RUN) update.fallbackImageUrl = newUrl;
      } catch (err) {
        stats.images.failed += 1;
        console.log(`FAILED heroconfigs/${doc._id} fallbackImageUrl: ${err.message}`);
      }
    } else if (doc.fallbackImageUrl) {
      stats.images.skipped += 1;
    }

    if (!DRY_RUN && Object.keys(update).length > 0) {
      await col.updateOne({ _id: doc._id }, { $set: update });
    }
  }

  console.log("\n=== Summary ===");
  console.log("Videos:", stats.videos);
  console.log("Poster images:", stats.images);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
