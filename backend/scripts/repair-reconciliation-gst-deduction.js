/**
 * Repairs the 2026-11-25 reconciliation regression that subtracted commission GST
 * from frozen historical sellerPayoutTotal values.
 *
 * Dry run: node scripts/repair-reconciliation-gst-deduction.js
 * Apply:   node scripts/repair-reconciliation-gst-deduction.js --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../app/dbConfig/dbConfig.js";
import Order from "../app/models/order.js";
import Seller from "../app/models/seller.js";

const APPLY = process.argv.includes("--apply");
const REPAIR_ID = "restore-frozen-seller-payout-2026-11-25-v1";
const DEPLOYED_AT = new Date("2026-11-25T05:30:00.000Z"); // 11:00 IST

await connectDB();

// The faulty branch only touched already-delivered historical orders, populated a
// previously-empty commissionGstAmount, and updated the order after deployment.
const candidateMatch = {
  deliveredAt: { $lt: DEPLOYED_AT },
  updatedAt: { $gte: DEPLOYED_AT },
  "financeFlags.sellerSettlementCredited": true,
  "paymentBreakdown.commissionGstAmount": { $gt: 0 },
  "paymentBreakdown.sellerPayoutTotal": { $gte: 0 },
};

const candidates = await Order.find(candidateMatch)
  .select("_id orderId seller deliveredAt updatedAt paymentBreakdown.sellerPayoutTotal paymentBreakdown.commissionGstAmount")
  .sort({ updatedAt: 1 })
  .lean();

const bySeller = new Map();
for (const order of candidates) {
  const key = String(order.seller || "NO_SELLER");
  const row = bySeller.get(key) || { count: 0, current: 0, gst: 0 };
  row.count += 1;
  row.current += Number(order.paymentBreakdown?.sellerPayoutTotal || 0);
  row.gst += Number(order.paymentBreakdown?.commissionGstAmount || 0);
  bySeller.set(key, row);
}

const sellerIds = [...bySeller.keys()].filter((id) => mongoose.Types.ObjectId.isValid(id));
const sellers = await Seller.find({ _id: { $in: sellerIds } }).select("shopName name").lean();
const sellerNames = new Map(sellers.map((seller) => [String(seller._id), seller.shopName || seller.name]));
const summary = [...bySeller.entries()].map(([sellerId, row]) => ({
  sellerId,
  seller: sellerNames.get(sellerId) || "Unknown",
  count: row.count,
  current: Math.round(row.current * 100) / 100,
  restore: Math.round(row.gst * 100) / 100,
  repaired: Math.round((row.current + row.gst) * 100) / 100,
})).sort((a, b) => b.restore - a.restore);

console.log(JSON.stringify({
  mode: APPLY ? "APPLY" : "DRY_RUN",
  repairId: REPAIR_ID,
  candidateCount: candidates.length,
  firstUpdatedAt: candidates[0]?.updatedAt || null,
  lastUpdatedAt: candidates.at(-1)?.updatedAt || null,
  totalToRestore: Math.round(summary.reduce((sum, row) => sum + row.restore, 0) * 100) / 100,
  sellers: summary,
}, null, 2));

if (!APPLY) {
  await mongoose.disconnect();
  process.exit(0);
}

const backupCollection = mongoose.connection.collection("settlementRepairBackups");
const existing = await backupCollection.countDocuments({ repairId: REPAIR_ID });
if (existing > 0) throw new Error(`Repair ${REPAIR_ID} was already applied; refusing to run twice.`);

const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    await backupCollection.insertMany(candidates.map((order) => ({
      repairId: REPAIR_ID,
      orderId: order._id,
      orderNumber: order.orderId,
      seller: order.seller,
      sellerPayoutTotalBefore: order.paymentBreakdown.sellerPayoutTotal,
      commissionGstAmount: order.paymentBreakdown.commissionGstAmount,
      orderUpdatedAtBefore: order.updatedAt,
      backedUpAt: new Date(),
    })), { session });

    const result = await Order.bulkWrite(candidates.map((order) => {
      const before = Number(order.paymentBreakdown.sellerPayoutTotal || 0);
      const gst = Number(order.paymentBreakdown.commissionGstAmount || 0);
      const restored = Math.round((before + gst + Number.EPSILON) * 100) / 100;
      return { updateOne: {
        filter: {
          _id: order._id,
          "paymentBreakdown.sellerPayoutTotal": order.paymentBreakdown.sellerPayoutTotal,
          "paymentBreakdown.commissionGstAmount": order.paymentBreakdown.commissionGstAmount,
        },
        update: { $set: { "paymentBreakdown.sellerPayoutTotal": restored } },
      } };
    }), { session, ordered: true });
    if (result.modifiedCount !== candidates.length) {
      throw new Error(`Concurrent change detected: expected ${candidates.length} updates, applied ${result.modifiedCount}`);
    }
  });
} finally {
  await session.endSession();
}

const repaired = await Order.find({ _id: { $in: candidates.map((order) => order._id) } })
  .select("_id paymentBreakdown.sellerPayoutTotal").lean();
const actualById = new Map(repaired.map((order) => [String(order._id), order.paymentBreakdown.sellerPayoutTotal]));
const mismatches = candidates.filter((order) => {
  const expected = Math.round((Number(order.paymentBreakdown.sellerPayoutTotal) + Number(order.paymentBreakdown.commissionGstAmount) + Number.EPSILON) * 100) / 100;
  return actualById.get(String(order._id)) !== expected;
});
console.log(JSON.stringify({ applied: true, repairedCount: candidates.length, verificationMismatches: mismatches.length }));
await mongoose.disconnect();
