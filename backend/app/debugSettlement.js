import mongoose from 'mongoose';
import Order from './models/order.js';
import { applyDeliveredSettlement } from './services/orderSettlement.js';

async function run() {
  const uri = 'mongodb+srv://zoogno:zoogno123@cluster0.bj0klhd.mongodb.net/zoogno';
  try {
    await mongoose.connect(uri);
    console.log('Connected to DB');
    const order = await Order.findOne({ orderId: 'ORD-01KX5WP6AZ4W6ZPWMP5Z78QNZP' });
    if (!order) {
        console.log('Order not found');
        return;
    }
    console.log('Found order:', order._id);
    
    console.log('Running applyDeliveredSettlement...');
    await applyDeliveredSettlement(order, order.orderId);
    console.log('Success!');
    
  } catch (err) {
    console.error('Error during settlement:', err);
  } finally {
    await mongoose.disconnect();
  }
}
run();
