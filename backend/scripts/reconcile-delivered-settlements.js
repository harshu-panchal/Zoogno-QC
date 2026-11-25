/**
 * reconcile-delivered-settlements.js
 *
 * Finds delivered orders whose seller settlement is missing from the available wallet,
 * including older orders where the general delivery settlement flag was set but the seller
 * payout remained PENDING/HOLD. Returned/reversed orders are deliberately excluded.
 *
 * Safe to re-run: the payout row, deterministic ledger id and order finance flags make the
 * seller credit idempotent. Existing pending payouts are promoted instead of recreated.
 *
 * Usage:
 *   node scripts/reconcile-delivered-settlements.js            (dry run - lists affected orders only)
 *   node scripts/reconcile-delivered-settlements.js --apply    (actually settles them)
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../app/dbConfig/dbConfig.js";
import Order from "../app/models/order.js";
import { createPendingSellerPayout } from "../app/services/finance/orderFinanceService.js";

const APPLY = process.argv.includes("--apply");
const QUIET = process.argv.includes("--quiet");

async function main() {
  await connectDB();
  console.log(`Connected. Mode: ${APPLY ? "APPLY (will write)" : "DRY RUN (read-only)"}`);

  const candidateQuery = {
    $or: [{ status: "delivered" }, { workflowStatus: "DELIVERED" }],
    seller: { $ne: null },
    returnStatus: { $in: [null, "none", ""] },
    "financeFlags.sellerSettlementReversed": { $ne: true },
    $and: [
      {
        $or: [
          { "financeFlags.sellerSettlementCredited": { $ne: true } },
          { "settlementStatus.sellerPayout": { $nin: ["COMPLETED", "NOT_APPLICABLE"] } },
        ],
      },
    ],
  };

  const affected = await Order.find(candidateQuery)
    .sort({ deliveredAt: 1, createdAt: 1 })
    .select("orderId seller paymentMode financeFlags settlementStatus paymentBreakdown.sellerPayoutTotal paymentBreakdown.grandTotal deliveredAt status workflowStatus returnStatus")
    .lean();

  console.log(`\nFound ${affected.length} delivered order(s) missing a seller wallet credit.\n`);
  for (const o of affected) {
    if (QUIET) continue;
    console.log(
      `  ${o.orderId}  seller=${o.seller}  paymentMode=${o.paymentMode}  ` +
        `onlineCaptured=${Boolean(o.financeFlags?.onlinePaymentCaptured)}  ` +
        `sellerPayable=${o.paymentBreakdown?.sellerPayoutTotal ?? "?"}  ` +
        `sellerStatus=${o.settlementStatus?.sellerPayout || "?"}  ` +
        `generalSettlementApplied=${Boolean(o.financeFlags?.deliveredSettlementApplied)}  ` +
        `deliveredAt=${o.deliveredAt?.toISOString?.() || "?"}`,
    );
  }

  if (!APPLY) {
    console.log("\nDry run only - nothing was changed. Re-run with --apply to settle these orders.");
    await mongoose.disconnect();
    return;
  }

  console.log("\nApplying settlement to each order...\n");
  let credited = 0;
  let skipped = 0;
  let failed = 0;
  const repairOrder = async (o) => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const fresh = await Order.findById(o._id, null, { session });
        if (!fresh) throw new Error("order disappeared");
        if (fresh.financeFlags?.sellerSettlementReversed || ![null, undefined, "", "none"].includes(fresh.returnStatus)) {
          throw new Error("order became returned/reversed while reconciliation was running");
        }
        if (fresh.paymentMode === "ONLINE" && !fresh.financeFlags?.onlinePaymentCaptured) {
          throw new Error("online payment is not captured; left unchanged for manual review");
        }
        await createPendingSellerPayout(fresh, { session, actorId: null });
        await fresh.save({ session });
      });
      const repaired = await Order.findById(o._id)
        .select("financeFlags settlementStatus")
        .lean();
      const isCredited =
        repaired?.financeFlags?.sellerSettlementCredited === true &&
        ["COMPLETED", "NOT_APPLICABLE"].includes(repaired?.settlementStatus?.sellerPayout);
      if (isCredited) {
        if (!QUIET) console.log(`  CREDITED ${o.orderId}`);
        credited += 1;
      } else {
        if (!QUIET) console.log(`  SKIPPED  ${o.orderId} (not eligible or no payable amount)`);
        skipped += 1;
      }
    } catch (err) {
      console.error(`  FAILED  ${o.orderId}: ${err.message}`);
      failed += 1;
    } finally {
      await session.endSession();
    }
  };

  // Wallet updates for one seller must remain sequential to avoid transaction write
  // conflicts. Different seller wallets are independent and can safely be repaired in
  // parallel, which keeps a large historical backfill practical on a remote database.
  const bySeller = new Map();
  for (const order of affected) {
    const sellerKey = String(order.seller);
    if (!bySeller.has(sellerKey)) bySeller.set(sellerKey, []);
    bySeller.get(sellerKey).push(order);
  }
  await Promise.all(
    [...bySeller.values()].map(async (sellerOrders) => {
      for (const order of sellerOrders) await repairOrder(order);
    }),
  );

  const remaining = await Order.countDocuments(candidateQuery);
  console.log(
    `\nDone. Credited: ${credited}  Skipped: ${skipped}  Failed: ${failed}  ` +
      `Total: ${affected.length}  Remaining candidates: ${remaining}`,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
