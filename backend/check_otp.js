import mongoose from "mongoose";
import OrderOtp from "./app/models/orderOtp.js";
import Order from "./app/models/order.js";

async function run() {
  await mongoose.connect("mongodb+srv://zoogno:zoogno123@cluster0.bj0klhd.mongodb.net/zoogno");
  const otps = await OrderOtp.find({ orderId: "ORD-01KWVB648Y6SDX8SKAY1BWE775", type: "return_drop" }).lean();
  console.log("OTPs found:", JSON.stringify(otps, null, 2));

  const order = await Order.findOne({ orderId: "ORD-01KWVB648Y6SDX8SKAY1BWE775" }).lean();
  console.log("Order returnStatus:", order?.returnStatus);
  process.exit(0);
}
run();
