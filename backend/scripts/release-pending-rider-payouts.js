/**
 * release-pending-rider-payouts.js
 *
 * One-off backlog release of rider payouts stuck in PENDING (wallet pendingBalance ->
 * availableBalance) via the same function the riderPayoutReleaseJob uses.
 *
 * Dry-run by default. Pass --apply to release. Optional: --limit=N (default 1000).
 *
 * Usage:
 *   node scripts/release-pending-rider-payouts.js
 *   node scripts/release-pending-rider-payouts.js --apply
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../app/dbConfig/dbConfig.js";
import { releasePendingRiderPayouts } from "../app/jobs/riderPayoutReleaseJob.js";

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 1000;

async function main() {
  await connectDB();
  const r = await releasePendingRiderPayouts({ limit, dryRun: !APPLY, log: false });
  console.log(
    `${APPLY ? "APPLIED" : "DRY RUN"}: ${APPLY ? "released" : "would release"}=${r.completed} (₹${r.amount.toFixed(2)}), skipped(not delivered)=${r.skipped}, failed=${r.failed}, scanned=${r.total}`,
  );
  if (!APPLY) console.log("Re-run with --apply to perform the release.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
