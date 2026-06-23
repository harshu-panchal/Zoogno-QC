// One-off: set otpProvider = "firebase" on all existing settings docs.
// Run from backend/: node scripts/set-otp-provider-firebase.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not set");
  await mongoose.connect(uri);

  const coll = mongoose.connection.collection("settings");
  const before = await coll.find({}, { projection: { otpProvider: 1 } }).toArray();
  console.log("Before:", before.map((d) => ({ _id: d._id, otpProvider: d.otpProvider })));

  const res = await coll.updateMany({}, { $set: { otpProvider: "firebase" } });
  console.log(`Matched ${res.matchedCount}, modified ${res.modifiedCount}`);

  if (before.length === 0) {
    await coll.insertOne({ otpProvider: "firebase", createdAt: new Date() });
    console.log("No settings doc existed — inserted one with otpProvider=firebase");
  }

  const after = await coll.find({}, { projection: { otpProvider: 1 } }).toArray();
  console.log("After:", after.map((d) => ({ _id: d._id, otpProvider: d.otpProvider })));

  await mongoose.disconnect();
};

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
