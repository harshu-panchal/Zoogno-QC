import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Order from './app/models/order.js';

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(async () => {
    console.log('Connected to DB');
    const orders = await Order.find({ orderId: { $in: ['ORD-100302', 'ORD-100303'] } });
    
    for (const order of orders) {
        order.status = 'confirmed';
        order.orderStatus = 'confirmed';
        await order.save();
        console.log(`Updated ${order.orderId} to ACCEPTED`);
    }
    process.exit(0);
})
.catch(err => { console.error(err); process.exit(1); });
