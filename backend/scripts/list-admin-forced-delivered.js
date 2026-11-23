/**
 * list-admin-forced-delivered.js
 *
 * Read-only. Finds every order that has ever been force-marked "delivered" by an admin
 * (adminStatusOverrides contains an entry with toWorkflow DELIVERED), and for each prints
 * its current settlement state plus whether a seller Payout record actually exists - so we
 * can spot which ones never got settled without needing to already know the order ID.
 *
 * Usage: node scripts/list-admin-forced-delivered.js
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../app/dbConfig/dbConfig.js";
import Order from "../app/models/order.js";
import Payout from "../app/models/payout.js";

async function main() {
  await connectDB();

  const orders = await Order.find({
    "adminStatusOverrides.toWorkflow": "DELIVERED",
  })
    .select(
      "orderId seller status workflowStatus paymentMode deliveredAt financeFlags settlementStatus paymentBreakdown.sellerPayoutTotal adminStatusOverrides",
    )
    .lean();

  console.log(`Found ${orders.length} order(s) ever force-marked delivered by an admin.\n`);

  for (const o of orders) {
    const deliveredOverride = [...(o.adminStatusOverrides || [])]
      .reverse()
      .find((ov) => ov.toWorkflow === "DELIVERED");

    const payout = await Payout.findOne({ payoutType: "SELLER", relatedOrderIds: o._id })
      .select("status amount processedAt")
      .lean();

    const settled = Boolean(o.financeFlags?.deliveredSettlementApplied);
    const flag = settled && payout ? "OK" : "!! MISSING SETTLEMENT / PAYOUT";

    console.log(
      `[${flag}] ${o.orderId}\n` +
        `    seller=${o.seller}  paymentMode=${o.paymentMode}  status=${o.status}/${o.workflowStatus}\n` +
        `    deliveredSettlementApplied=${settled}  onlineCaptured=${Boolean(o.financeFlags?.onlinePaymentCaptured)}\n` +
        `    settlementStatus.sellerPayout=${o.settlementStatus?.sellerPayout}  sellerPayoutTotal=${o.paymentBreakdown?.sellerPayoutTotal}\n` +
        `    payout=${payout ? `${payout.status} amount=${payout.amount}` : "NONE FOUND"}\n` +
        `    forcedBy=${deliveredOverride?.by || "?"}  at=${deliveredOverride?.at}  reason="${deliveredOverride?.reason || ""}"\n`,
    );
  }

  const broken = [];
  for (const o of orders) {
    const payout = await Payout.findOne({ payoutType: "SELLER", relatedOrderIds: o._id }).lean();
    if (!o.financeFlags?.deliveredSettlementApplied || !payout) broken.push(o.orderId);
  }
  console.log(`\nSummary: ${orders.length} total, ${broken.length} missing settlement/payout: ${broken.join(", ") || "none"}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
