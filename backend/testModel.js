import mongoose from "mongoose";
import dotenv from "dotenv";
import BasketRequest from "./app/models/basketRequest.js";

dotenv.config();

async function test() {
    try {
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        console.log("Connected to DB");
        
        const req = new BasketRequest({
            sellerId: new mongoose.Types.ObjectId(),
            quantity: 5,
            size: "MEDIUM",
            requestNotes: "test",
            status: "pending"
        });
        
        await req.validate();
        console.log("Validation passed");
        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

test();
