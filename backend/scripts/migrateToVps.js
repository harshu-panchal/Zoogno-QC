import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import MediaMetadata from '../app/models/mediaMetadata.js';

dotenv.config();

const STORAGE_BASE_PATH = process.env.STORAGE_BASE_PATH || path.join(process.cwd(), 'storage');

/**
 * Migration script:
 * Reads existing Cloudinary image URLs from MongoDB,
 * maps them to already downloaded files (assumed to be in a flat folder for this script, 
 * or you can adjust to map to exact paths),
 * moves them into correct VPS folders,
 * and updates MongoDB URLs.
 */
async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find all media uploaded to cloudinary
    const medias = await MediaMetadata.find({ provider: 'cloudinary' });
    console.log(`Found ${medias.length} records to migrate.`);

    let successCount = 0;
    let failCount = 0;

    for (const media of medias) {
      if (!media.secureUrl) continue;
      
      try {
        // e.g. secureUrl: https://res.cloudinary.com/.../.../image/upload/v1234/folder/filename.jpg
        // Assuming downloaded files are named by their public_id or filename
        const publicId = media.publicId; // folder/filename
        const filename = path.basename(publicId) + (media.format ? `.${media.format}` : '.jpg');
        
        // --- IMPORTANT ---
        // Change `downloadedAssetsPath` to point to the actual folder where you downloaded cloudinary images
        const downloadedAssetsPath = path.join(process.cwd(), 'assets');
        const sourceFile = path.join(downloadedAssetsPath, filename);

        if (!fs.existsSync(sourceFile)) {
          console.warn(`[SKIP] File not found locally: ${sourceFile} (from ${media.secureUrl})`);
          failCount++;
          continue;
        }

        const date = media.createdAt || new Date();
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const context = media.folder || 'misc';
        
        const relativeDestDir = path.join(context, year, month);
        const destDir = path.join(STORAGE_BASE_PATH, relativeDestDir);
        
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        const destFile = path.join(destDir, filename);

        // Copy or move file
        fs.copyFileSync(sourceFile, destFile);
        
        // Update URL
        const protocol = process.env.VITE_API_URL ? 'https' : 'http'; // Adjust as needed
        const host = process.env.HOSTNAME || 'api.domain.com';
        
        // Replace backslashes with forward slashes for URL
        const newUrlPath = path.join(relativeDestDir, filename).replace(/\\/g, '/');
        const newUrl = `${protocol}://${host}/images/${newUrlPath}`;

        media.provider = 'vps';
        media.secureUrl = newUrl;
        
        await media.save();
        
        console.log(`[SUCCESS] Migrated: ${media.publicId} -> ${newUrl}`);
        successCount++;
      } catch (err) {
        console.error(`[ERROR] Failed to migrate ${media.publicId}:`, err.message);
        failCount++;
      }
    }

    console.log(`\nMigration completed. Success: ${successCount}, Failed: ${failCount}`);
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrate();
