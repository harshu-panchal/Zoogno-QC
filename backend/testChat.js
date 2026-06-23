import mongoose from "mongoose";
import OrderChat from "./app/models/orderChat.js";
import dotenv from "dotenv";

dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const chats = await OrderChat.find().lean();
  console.log("Total chats in DB:", chats.length);
  for (let c of chats) {
    console.log("Chat orderId:", c.orderId, "deliveryBoy:", c.deliveryBoy, "customer:", c.customer);
  }
  process.exit(0);
});
