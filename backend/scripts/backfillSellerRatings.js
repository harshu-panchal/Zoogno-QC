import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function backfill() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const db = mongoose.connection.db;

  // 1. Backfill missing sellerId on reviews collection from products
  const reviewsWithoutSeller = await db.collection('reviews').find({
    $or: [{ sellerId: { $exists: false } }, { sellerId: null }]
  }).toArray();

  console.log(`Found ${reviewsWithoutSeller.length} reviews without sellerId.`);

  let updatedReviewsCount = 0;
  for (const review of reviewsWithoutSeller) {
    if (review.productId) {
      const product = await db.collection('products').findOne({ _id: new mongoose.Types.ObjectId(String(review.productId)) });
      if (product && product.sellerId) {
        await db.collection('reviews').updateOne(
          { _id: review._id },
          { $set: { sellerId: new mongoose.Types.ObjectId(String(product.sellerId)) } }
        );
        updatedReviewsCount++;
      }
    }
  }
  console.log(`Updated ${updatedReviewsCount} reviews with their correct sellerId.`);

  // 2. Aggregate approved reviews per seller and update seller ratings in sellers collection
  const sellers = await db.collection('sellers').find({}).toArray();
  console.log(`Processing ratings for ${sellers.length} sellers...`);

  for (const seller of sellers) {
    const sellerId = seller._id;

    const rows = await db.collection('reviews').aggregate([
      {
        $match: {
          sellerId: new mongoose.Types.ObjectId(String(sellerId)),
          status: 'approved',
        },
      },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 },
        },
      },
    ]).toArray();

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let weighted = 0;

    rows.forEach((row) => {
      const rating = Number(row._id);
      const count = Number(row.count || 0);
      if (breakdown[rating] !== undefined) breakdown[rating] = count;
      total += count;
      weighted += rating * count;
    });

    const average = total > 0 ? Number((weighted / total).toFixed(1)) : 0;

    await db.collection('sellers').updateOne(
      { _id: sellerId },
      {
        $set: {
          ratingAverage: average,
          ratingCount: total,
          ratingBreakdown: breakdown,
        },
      }
    );

    if (total > 0) {
      console.log(`Seller "${seller.shopName}" (${sellerId}) => Real Rating: ${average} ★ (${total} reviews)`);
    }
  }

  console.log('Seller rating backfill complete.');
  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
