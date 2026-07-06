import mongoose from "mongoose";
import Transaction from "./app/models/transaction.js";
import Wallet from "./app/models/wallet.js";
import Order from "./app/models/order.js";

async function run() {
  await mongoose.connect("mongodb+srv://zoogno:zoogno123@cluster0.bj0klhd.mongodb.net/zoogno");
  
  // Find the last delivery earning transaction
  const tx = await Transaction.findOne({ type: "Delivery Earning" }).sort({ createdAt: -1 }).lean();
  console.log("Last earning tx:", JSON.stringify(tx, null, 2));

  if (tx && tx.order) {
    const order = await Order.findOne({ _id: tx.order }).lean();
    console.log("Order paymentBreakdown:", JSON.stringify(order?.paymentBreakdown, null, 2));
    console.log("Order pricing:", JSON.stringify(order?.pricing, null, 2));
  }

  process.exit(0);
}
run();
