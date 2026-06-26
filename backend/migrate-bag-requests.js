import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import QRPaperBagRequest from "./app/models/qrPaperBagRequest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log("Connected to DB");

    const pendingResult = await QRPaperBagRequest.updateMany(
      { status: "pending" },
      { $set: { status: "pending_approval" } }
    );
    console.log(`Updated ${pendingResult.modifiedCount} pending -> pending_approval`);

    const approvedResult = await QRPaperBagRequest.updateMany(
      { status: "approved" },
      { $set: { status: "approved_payment_pending" } }
    );
    console.log(`Updated ${approvedResult.modifiedCount} approved -> approved_payment_pending`);

    // Optionally: if payment was completed on old approved requests, we could set them to payment_completed.
    const paidResult = await QRPaperBagRequest.updateMany(
      { status: "approved_payment_pending", paymentStatus: "completed" },
      { $set: { status: "payment_completed" } }
    );
    console.log(`Updated ${paidResult.modifiedCount} paid -> payment_completed`);

    console.log("Migration finished");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
