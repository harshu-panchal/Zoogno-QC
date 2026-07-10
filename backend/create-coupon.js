import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Coupon from './app/models/coupon.js';

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/zoognu");
        console.log("Connected to MongoDB.");
        
        const validFrom = new Date();
        const validTill = new Date();
        validTill.setFullYear(validTill.getFullYear() + 1);

        const coupon = new Coupon({
            code: 'FREE300',
            title: 'Free Delivery on Orders Above ₹300',
            description: 'Get free delivery on your order when you spend ₹300 or more.',
            discountType: 'free_delivery',
            discountValue: 0,
            couponType: 'min_order_value',
            minOrderValue: 300,
            validFrom,
            validTill,
            isActive: true,
            perUserLimit: 0, 
            usageLimit: 0 
        });

        await coupon.save();
        console.log("Coupon FREE300 successfully created!");
    } catch (err) {
        console.error("Error creating coupon:", err);
    } finally {
        await mongoose.disconnect();
    }
};

run();
