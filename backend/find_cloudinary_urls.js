import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  
  for (const col of collections) {
    const name = col.name;
    const docs = await db.collection(name).find().limit(500).toArray();
    let found = false;
    for (const doc of docs) {
      const jsonStr = JSON.stringify(doc);
      if (jsonStr.includes('cloudinary.com')) {
        console.log(`\nFound in collection: ${name}`);
        console.log(jsonStr.substring(0, 500) + '...');
        // Extract the cloudinary URLs
        const regex = /https?:\/\/res\.cloudinary\.com\/[^"']+/g;
        const matches = jsonStr.match(regex);
        if (matches) {
          console.log("URLs:", matches);
        }
        found = true;
        break;
      }
    }
  }
  await mongoose.disconnect();
}

run().catch(console.error);
