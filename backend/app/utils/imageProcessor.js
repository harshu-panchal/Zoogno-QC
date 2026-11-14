import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inFlightOnDemandVariants = new Map();

// Define configurations for different image contexts. Keys must match the
// folder names in mediaService.js's ENTITY_FOLDER_MAP ("products",
// "categories", "offers", "users", "banners", "misc") — any folder without an
// entry here silently fell through to `default` (1000x1000), which meant
// product photos (the highest-volume upload type, shown at ~150-400px in
// card/list views) were stored far larger than any current usage needs.
const CONTEXT_CONFIG = {
  menu: { width: 800, height: 800, fit: 'inside' },
  restaurants: { width: 1200, height: 800, fit: 'cover' },
  users: { width: 400, height: 400, fit: 'cover', variants: [100, 200, 400] },
  // 2x the actual w_824,h_380 crop every consumer of banner images requests
  // (ExperienceBannerCarousel.jsx, Home.jsx's hero preload) — matches that
  // ~2.17:1 aspect ratio instead of 1920x1080's 1.78:1, so nothing crops
  // differently than before, it's just ~40% fewer stored pixels than the
  // previous 1920x1080 for the same retina-sharp result.
  banners: { width: 1648, height: 760, fit: 'cover', variants: [412, 824, 1248, 1648] },
  logos: { width: 500, height: 500, fit: 'contain', variants: [100, 200, 500] },
  products: { width: 800, height: 800, fit: 'inside', variants: [100, 150, 400, 800] },
  categories: { width: 400, height: 400, fit: 'inside', variants: [100, 150, 400] },
  offers: { width: 1200, height: 800, fit: 'cover', variants: [150, 200, 400, 800, 1200] },
  // deliveryAuthController.js calls uploadToCloudinary() directly with these
  // literal folder strings (a separate, older upload path that bypasses
  // ENTITY_FOLDER_MAP entirely) rather than one of the entity names above.
  "delivery/profiles": { width: 400, height: 400, fit: 'cover' },
  "delivery/documents": { width: 1200, height: 1200, fit: 'inside' },
  default: { width: 1000, height: 1000, fit: 'inside' }
};

export function getImageContextConfig(context) {
  return CONTEXT_CONFIG[context] || CONTEXT_CONFIG.default;
}

export function getImageVariantWidths(context) {
  const config = getImageContextConfig(context);
  return [...new Set([...(config.variants || []), config.width])]
    .filter((width) => Number.isFinite(width) && width > 0 && width <= config.width)
    .sort((a, b) => a - b);
}

function variantPath(targetPath, primaryWidth, width) {
  if (width === primaryWidth) return targetPath;
  const parsed = path.parse(targetPath);
  const baseName = parsed.name.replace(/-w\d+$/, '');
  return path.join(parsed.dir, `${baseName}-w${width}${parsed.ext}`);
}

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

    const config = getImageContextConfig(context);
    const widths = getImageVariantWidths(context);
    const source = sharp(buffer).rotate();

    // Write responsive derivatives at upload time. The primary URL points at
    // the largest derivative while cards and thumbnails select a much smaller
    // sibling file, so Node/NGINX never has to resize an image per request.
    const results = await Promise.all(
      widths.map((width) => {
        const proportionalHeight = config.height
          ? Math.max(1, Math.round((config.height * width) / config.width))
          : undefined;
        return source
          .clone()
          .resize({
            width,
            height: proportionalHeight,
            fit: config.fit,
            withoutEnlargement: true,
          })
          .webp({ quality: width <= 200 ? 76 : 80 })
          .toFile(variantPath(targetPath, config.width, width));
      }),
    );

    return results[widths.indexOf(config.width)] || results.at(-1);
  } catch (error) {
    console.error('Error processing image with sharp:', error);
    throw new Error('Image processing failed');
  }
};

export async function getOrCreateImageVariant(sourcePath, width) {
  const normalizedWidth = Math.max(64, Math.min(2000, Math.round(Number(width) || 0)));
  if (!normalizedWidth) throw new Error('A valid image width is required');

  const parsed = path.parse(sourcePath);
  const sourceBaseName = parsed.name.replace(/-w\d+$/, '');
  const targetPath = path.join(parsed.dir, `${sourceBaseName}-w${normalizedWidth}.webp`);
  if (fs.existsSync(targetPath)) return targetPath;

  const key = `${sourcePath}:${normalizedWidth}`;
  const existing = inFlightOnDemandVariants.get(key);
  if (existing) return existing;

  const operation = sharp(sourcePath)
    .rotate()
    .resize({ width: normalizedWidth, withoutEnlargement: true, fit: 'inside' })
    .webp({ quality: normalizedWidth <= 200 ? 76 : 80 })
    .toFile(targetPath)
    .then(() => targetPath)
    .finally(() => inFlightOnDemandVariants.delete(key));

  inFlightOnDemandVariants.set(key, operation);
  return operation;
}
