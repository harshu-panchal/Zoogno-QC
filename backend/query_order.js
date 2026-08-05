import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI);

const orderSchema = new mongoose.Schema({}, { strict: false });
const Order = mongoose.model('Order', orderSchema);

async function run() {
  const order = await Order.findOne({ orderId: 'ORD-100130' }).lean();
  console.log(JSON.stringify({
    orderId: order?.orderId,
    pricing: order?.pricing,
    paymentBreakdown: order?.paymentBreakdown,
    riderEarnings: order?.riderEarnings,
    createdAt: order?.createdAt,
    distanceSnapshot: order?.distanceSnapshot
  }, null, 2));
  process.exit(0);
}
run();
