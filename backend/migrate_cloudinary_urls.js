import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const API_URL = process.env.API_URL || process.env.VITE_API_URL || "http://localhost:5000";
const CLOUDINARY_REGEX = /https?:\/\/res\.cloudinary\.com\/[^\/]+\/(?:image|raw|video)\/upload\/(?:v\d+\/)?([^"'\s?]+)/g;

function replaceCloudinaryUrls(obj, apiUrl) {
  let modified = false;
  let updates = {};

  function traverse(current, currentPath) {
    if (current === null || current === undefined) return;

    if (typeof current === 'string') {
      if (CLOUDINARY_REGEX.test(current)) {
        // Reset lastIndex because we're reusing a global regex
        CLOUDINARY_REGEX.lastIndex = 0;
        
        const newStr = current.replace(CLOUDINARY_REGEX, (match, filepath) => {
          return `${apiUrl}/images/${filepath}`;
        });
        
        if (newStr !== current) {
          updates[currentPath] = newStr;
          modified = true;
        }
      }
    } else if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        traverse(current[i], currentPath ? `${currentPath}.${i}` : `${i}`);
      }
    } else if (typeof current === 'object' && !(current instanceof Date) && !(current instanceof mongoose.Types.ObjectId)) {
      for (const key of Object.keys(current)) {
        traverse(current[key], currentPath ? `${currentPath}.${key}` : key);
      }
    }
  }

  traverse(obj, '');
  return { modified, updates };
}

async function run() {
  console.log(`Using API_URL for replacement: ${API_URL}`);
  
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  
  let totalUpdated = 0;

  for (const col of collections) {
    const name = col.name;
    const docs = await db.collection(name).find().toArray();
    
    let colUpdated = 0;
    
    for (const doc of docs) {
      const { modified, updates } = replaceCloudinaryUrls(doc, API_URL);
      
      if (modified) {
        await db.collection(name).updateOne(
          { _id: doc._id },
          { $set: updates }
        );
        colUpdated++;
        totalUpdated++;
      }
    }
    
    if (colUpdated > 0) {
      console.log(`Updated ${colUpdated} documents in collection '${name}'`);
    }
  }
  
  console.log(`\nMigration complete. Total documents updated: ${totalUpdated}`);
  await mongoose.disconnect();
}

run().catch(console.error);
