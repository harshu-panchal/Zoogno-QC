// One-off: point the stored payment gateway setting at Razorpay (replaces the legacy "cashfree" value).
// Usage: node fix_settings.js   (reads MONGO_URI from .env)
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const result = await mongoose.connection
      .collection("settings")
      .updateMany({}, { $set: { paymentGateway: "razorpay" } });
    console.log("Updated Settings in DB:", result.modifiedCount);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
    process.exit();
  }
})();
