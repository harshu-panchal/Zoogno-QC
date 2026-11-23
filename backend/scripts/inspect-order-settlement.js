/**
 * inspect-order-settlement.js
 *
 * Read-only. Prints everything relevant to why a specific order's seller payout might not
 * have reached the seller's wallet: the order's status/finance flags, its admin status-override
 * history, the matching Payout record(s), and the seller's Wallet document.
 *
 * Usage: node scripts/inspect-order-settlement.js <orderId or Mongo _id>
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../app/dbConfig/dbConfig.js";
import Order from "../app/models/order.js";
import Payout from "../app/models/payout.js";
import Wallet from "../app/models/wallet.js";
import Transaction from "../app/models/transaction.js";

const ref = process.argv[2];
if (!ref) {
  console.error("Usage: node scripts/inspect-order-settlement.js <orderId or Mongo _id>");
  process.exit(1);
}

async function main() {
  await connectDB();

  const query = mongoose.Types.ObjectId.isValid(ref) ? { _id: ref } : { orderId: ref };
  const order = await Order.findOne(query).lean();
  if (!order) {
    console.log(`No order found for "${ref}"`);
    await mongoose.disconnect();
    return;
  }

  console.log("=== ORDER ===");
  console.log({
    _id: String(order._id),
    orderId: order.orderId,
    seller: order.seller ? String(order.seller) : null,
    status: order.status,
    orderStatus: order.orderStatus,
    workflowStatus: order.workflowStatus,
    paymentMode: order.paymentMode,
    deliveredAt: order.deliveredAt,
    returnStatus: order.returnStatus,
    returnWindowExpiresAt: order.returnWindowExpiresAt,
    financeFlags: order.financeFlags,
    settlementStatus: order.settlementStatus,
    sellerPayoutTotal: order.paymentBreakdown?.sellerPayoutTotal,
    grandTotal: order.paymentBreakdown?.grandTotal,
  });

  console.log("\n=== ADMIN STATUS OVERRIDES (most recent last) ===");
  console.log(JSON.stringify(order.adminStatusOverrides || [], null, 2));

  console.log("\n=== MATCHING PAYOUT(S) (payoutType SELLER, relatedOrderIds contains this order) ===");
  const payouts = await Payout.find({ payoutType: "SELLER", relatedOrderIds: order._id }).lean();
  console.log(payouts.length ? JSON.stringify(payouts, null, 2) : "None found.");

  console.log("\n=== LEGACY TRANSACTION (userModel Seller, reference = orderId) ===");
  const txn = await Transaction.findOne({ reference: order.orderId, userModel: "Seller" }).lean();
  console.log(txn ? JSON.stringify(txn, null, 2) : "None found.");

  if (order.seller) {
    console.log("\n=== SELLER WALLET ===");
    const wallet = await Wallet.findOne({ ownerType: "SELLER", ownerId: order.seller }).lean();
    console.log(wallet ? JSON.stringify(wallet, null, 2) : "None found.");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
