/**
 * reconcile-delivered-settlements.js
 *
 * Finds orders that are marked delivered but never had settlement applied
 * (financeFlags.deliveredSettlementApplied !== true) - i.e. no seller/rider payout was ever
 * created, no GST transactions, no invoice backstop - and settles them.
 *
 * Safe to re-run: applyDeliveredSettlement -> settleDeliveredOrder checks
 * financeFlags.deliveredSettlementApplied and no-ops if it's already true, so running this
 * against an order that's already fine (or was already fixed by a previous run) does nothing.
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
import { applyDeliveredSettlement } from "../app/services/orderSettlement.js";
import { handleOnlineOrderFinance } from "../app/services/finance/orderFinanceService.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  await connectDB();
  console.log(`Connected. Mode: ${APPLY ? "APPLY (will write)" : "DRY RUN (read-only)"}`);

  const affected = await Order.find({
    $or: [{ status: "delivered" }, { workflowStatus: "DELIVERED" }],
    "financeFlags.deliveredSettlementApplied": { $ne: true },
  })
    .select("orderId seller paymentMode financeFlags paymentBreakdown.grandTotal deliveredAt status workflowStatus")
    .lean();

  console.log(`\nFound ${affected.length} delivered order(s) with no settlement applied.\n`);
  for (const o of affected) {
    console.log(
      `  ${o.orderId}  seller=${o.seller}  paymentMode=${o.paymentMode}  ` +
        `onlineCaptured=${Boolean(o.financeFlags?.onlinePaymentCaptured)}  ` +
        `grandTotal=${o.paymentBreakdown?.grandTotal ?? "?"}  deliveredAt=${o.deliveredAt?.toISOString?.() || "?"}`,
    );
  }

  if (!APPLY) {
    console.log("\nDry run only - nothing was changed. Re-run with --apply to settle these orders.");
    await mongoose.disconnect();
    return;
  }

  console.log("\nApplying settlement to each order...\n");
  let ok = 0;
  let failed = 0;
  for (const o of affected) {
    try {
      const fresh = await Order.findById(o._id);
      if (!fresh) throw new Error("order disappeared");

      // Mirror the same admin-confirms-payment behavior used for the forced-status path: an
      // order being reconciled here as "delivered" is being treated as paid, so capture it
      // first if it never was, rather than leaving settlement blocked on that forever.
      if (fresh.paymentMode === "ONLINE" && !fresh.financeFlags?.onlinePaymentCaptured) {
        await handleOnlineOrderFinance(fresh._id, {
          actorId: null,
          transactionId: "",
          metadata: { source: "RECONCILE_SCRIPT" },
        });
      }

      await applyDeliveredSettlement(fresh, fresh.orderId);
      console.log(`  OK      ${o.orderId}`);
      ok += 1;
    } catch (err) {
      console.error(`  FAILED  ${o.orderId}: ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\nDone. Settled: ${ok}  Failed: ${failed}  Total: ${affected.length}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
