import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Define configurations for different image contexts. Keys must match the
// folder names in mediaService.js's ENTITY_FOLDER_MAP ("products",
// "categories", "offers", "users", "banners", "misc") — any folder without an
// entry here silently fell through to `default` (1000x1000), which meant
// product photos (the highest-volume upload type, shown at ~150-400px in
// card/list views) were stored far larger than any current usage needs.
const CONTEXT_CONFIG = {
  menu: { width: 800, height: 800, fit: 'inside' },
  restaurants: { width: 1200, height: 800, fit: 'cover' },
  users: { width: 400, height: 400, fit: 'cover' },
  // 2x the actual w_824,h_380 crop every consumer of banner images requests
  // (ExperienceBannerCarousel.jsx, Home.jsx's hero preload) — matches that
  // ~2.17:1 aspect ratio instead of 1920x1080's 1.78:1, so nothing crops
  // differently than before, it's just ~40% fewer stored pixels than the
  // previous 1920x1080 for the same retina-sharp result.
  banners: { width: 1648, height: 760, fit: 'cover' },
  logos: { width: 500, height: 500, fit: 'contain' },
  products: { width: 800, height: 800, fit: 'inside' },
  categories: { width: 400, height: 400, fit: 'inside' },
  offers: { width: 1200, height: 800, fit: 'cover' },
  // deliveryAuthController.js calls uploadToCloudinary() directly with these
  // literal folder strings (a separate, older upload path that bypasses
  // ENTITY_FOLDER_MAP entirely) rather than one of the entity names above.
  "delivery/profiles": { width: 400, height: 400, fit: 'cover' },
  "delivery/documents": { width: 1200, height: 1200, fit: 'inside' },
  default: { width: 1000, height: 1000, fit: 'inside' }
};

/**
 * Process and save an image buffer
 * @param {Buffer} buffer - The image buffer from multer
 * @param {String} context - The context (e.g., 'menu', 'users', etc.)
 * @param {String} targetPath - The absolute path where to save the image
 * @returns {Promise<Object>} - Information about the processed image
 */
export const processAndSaveImage = async (buffer, context, targetPath) => {
  try {
    // Ensure the directory exists
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const config = CONTEXT_CONFIG[context] || CONTEXT_CONFIG.default;

    // Process image with sharp
    const info = await sharp(buffer)
      .resize({
        width: config.width,
        height: config.height,
        fit: config.fit,
        withoutEnlargement: true // don't upscale small images
      })
      .webp({ quality: 80 }) // convert to webp with 80% quality
      .toFile(targetPath);

    return info;
  } catch (error) {
    console.error('Error processing image with sharp:', error);
    throw new Error('Image processing failed');
  }
};
