/**
 * release-expired-seller-holds.js
 *
 * One-off catch-up for delivered orders whose seller payout is still on HOLD even though the
 * return window has expired (i.e. what returnWindowReleaseJob should have done but didn't,
 * typically because no process with the scheduler role was running).
 *
 * It applies the SAME filter as the job (status delivered, returnStatus "none", window expired,
 * sellerPayout HOLD) and releases each order via the existing processPayout(), so wallet
 * balances, the order's settlementStatus, and the audit log are updated exactly as normal.
 * Orders in any return flow (returnStatus != "none") are deliberately skipped.
 *
 * Dry-run by default (read-only). Pass --apply to actually release.
 *
 * Usage:
 *   node scripts/release-expired-seller-holds.js            # dry run, lists what would be released
 *   node scripts/release-expired-seller-holds.js --apply    # performs the release
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../app/dbConfig/dbConfig.js";
import Order from "../app/models/order.js";
import Payout from "../app/models/payout.js";
import { processPayout } from "../app/services/finance/payoutService.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  await connectDB();

  const now = new Date();
  const candidates = await Order.find({
    status: "delivered",
    returnStatus: "none",
    returnWindowExpiresAt: { $lte: now },
    "settlementStatus.sellerPayout": "HOLD",
  })
    .select("_id orderId seller returnWindowExpiresAt paymentBreakdown.sellerPayoutTotal")
    .sort({ returnWindowExpiresAt: 1 })
    .lean();

  console.log(`${APPLY ? "APPLY" : "DRY RUN"}: ${candidates.length} order(s) on HOLD with an expired return window.\n`);

  let released = 0;
  let skipped = 0;
  let failed = 0;
  let totalAmount = 0;

  for (const order of candidates) {
    const payout = await Payout.findOne({
      payoutType: "SELLER",
      relatedOrderIds: order._id,
      status: { $in: ["PENDING", "PROCESSING"] },
    })
      .select("_id amount status")
      .lean();

    if (!payout) {
      skipped++;
      console.log(`SKIP  ${order.orderId}  no PENDING/PROCESSING seller payout found`);
      continue;
    }

    if (!APPLY) {
      released++;
      totalAmount += payout.amount;
      console.log(`WOULD RELEASE  ${order.orderId}  seller=${order.seller}  amount=${payout.amount}`);
      continue;
    }

    try {
      await processPayout(payout._id, { remarks: "Catch-up release of expired return-window hold" });
      released++;
      totalAmount += payout.amount;
      console.log(`RELEASED  ${order.orderId}  amount=${payout.amount}`);
    } catch (err) {
      failed++;
      console.error(`FAILED  ${order.orderId}  payout=${payout._id}  ${err.message}`);
    }
  }

  console.log(
    `\nSummary: ${APPLY ? "released" : "would release"}=${released} (₹${totalAmount.toFixed(2)}), skipped=${skipped}, failed=${failed}`,
  );
  if (!APPLY) console.log("Re-run with --apply to perform the release.");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
