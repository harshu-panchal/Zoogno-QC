import mongoose from "mongoose";
import dotenv from "dotenv";
import Seller from "./app/models/seller.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error("No MONGO_URI found in .env file.");
  process.exit(1);
}

const migrate = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    // Find sellers with a hyphen in sellerId
    const sellers = await Seller.find({
      sellerId: { $regex: "-" }
    });

    console.log(`Found ${sellers.length} sellers with '-' in sellerId.`);

    if (sellers.length === 0) {
      console.log("Migration completed: No sellers to update.");
      process.exit(0);
    }

    // Update each seller
    for (const seller of sellers) {
      const oldId = seller.sellerId;
      const newSellerId = oldId.replace("-", "");
      seller.sellerId = newSellerId;
      await seller.save({ validateBeforeSave: false }); 
      console.log(`Updated seller ${seller.email || seller._id}: ${oldId} -> ${newSellerId}`);
    }

    console.log("Migration completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
};

migrate();
