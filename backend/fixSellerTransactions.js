import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './app/models/order.js';
import Transaction from './app/models/transaction.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/zoognu";

async function fixSellerTransactions() {
    try {
        console.log("Connecting to database...", MONGO_URI.split('@')[1] || MONGO_URI);
        await mongoose.connect(MONGO_URI);
        console.log("Connected successfully.");

        // Find all 'Order Payment' transactions for Sellers that are Pending or Settled
        const transactions = await Transaction.find({
            userModel: 'Seller',
            type: 'Order Payment'
        });

        console.log(`Found ${transactions.length} seller order payment transactions.`);
        
        let updatedCount = 0;
        let skipCount = 0;

        for (const txn of transactions) {
            if (!txn.order) {
                skipCount++;
                continue;
            }

            const order = await Order.findById(txn.order).lean();
            if (!order) {
                console.log(`Order not found for transaction ${txn._id}, skipping.`);
                skipCount++;
                continue;
            }

            const correctAmount = Number(order.paymentBreakdown?.sellerPayoutTotal || order.pricing?.sellerPayoutTotal || order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);
            
            if (txn.amount !== correctAmount) {
                console.log(`Fixing txn ${txn._id} (Order: ${order.orderId}): Amount changed from ${txn.amount} to ${correctAmount}`);
                txn.amount = correctAmount;
                await txn.save();
                updatedCount++;
            } else {
                skipCount++;
            }
        }

        console.log(`\nMigration completed!`);
        console.log(`Updated Transactions: ${updatedCount}`);
        console.log(`Skipped Transactions (already correct or missing order): ${skipCount}`);
        
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from database.");
    }
}

fixSellerTransactions();
