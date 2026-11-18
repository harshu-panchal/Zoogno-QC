import "dotenv/config";
import mongoose from "mongoose";
import Product from "../app/models/product.js";
import Review from "../app/models/review.js";

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!mongoUri) throw new Error("MONGODB_URI or MONGO_URI is required");

await mongoose.connect(mongoUri);
try {
  const grouped = await Review.aggregate([
    { $match: { status: "approved" } },
    { $group: { _id: { productId: "$productId", rating: "$rating" }, count: { $sum: 1 } } },
  ]);
  const summaries = new Map();
  for (const row of grouped) {
    const productId = String(row._id.productId);
    const summary = summaries.get(productId) || { count: 0, weighted: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
    const rating = Number(row._id.rating);
    const count = Number(row.count || 0);
    if (summary.breakdown[rating] !== undefined) summary.breakdown[rating] = count;
    summary.count += count;
    summary.weighted += rating * count;
    summaries.set(productId, summary);
  }

  await Product.updateMany({}, { $set: { ratingAverage: 0, ratingCount: 0, ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } });
  const operations = [...summaries.entries()].map(([productId, summary]) => ({
    updateOne: {
      filter: { _id: productId },
      update: { $set: {
        ratingAverage: Number((summary.weighted / summary.count).toFixed(2)),
        ratingCount: summary.count,
        ratingBreakdown: summary.breakdown,
      } },
    },
  }));
  if (operations.length) await Product.bulkWrite(operations, { ordered: false });
  console.log(`Backfilled review summaries for ${operations.length} products.`);
} finally {
  await mongoose.disconnect();
}
