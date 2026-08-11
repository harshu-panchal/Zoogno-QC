import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Define configurations for different image contexts
const CONTEXT_CONFIG = {
  menu: { width: 800, height: 800, fit: 'inside' },
  restaurants: { width: 1200, height: 800, fit: 'cover' },
  users: { width: 400, height: 400, fit: 'cover' },
  banners: { width: 1920, height: 1080, fit: 'cover' },
  logos: { width: 500, height: 500, fit: 'contain' },
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
