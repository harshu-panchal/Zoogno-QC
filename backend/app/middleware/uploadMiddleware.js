import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { processAndSaveImage } from '../utils/imageProcessor.js';
import upload from '../utils/multerConfig.js';

/**
 * Middleware to handle file uploads to VPS
 * Expects `req.file` to be populated by multer
 * @param {String} context - The context/folder name (e.g., 'menu', 'restaurants')
 */
export const uploadToVPS = (context) => async (req, res, next) => {
  if (!req.file) {
    return next(); // Proceed if no file is uploaded
  }

  try {
    const date = new Date();
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    const filename = `${uuidv4()}.webp`;
    
    // Fallback to local 'storage' folder if env var is not set
    const basePath = process.env.STORAGE_BASE_PATH || path.join(process.cwd(), 'storage');
    const relativePath = path.join(context, year, month, filename);
    const absolutePath = path.join(basePath, relativePath);

    // Process and save the image
    await processAndSaveImage(req.file.buffer, context, absolutePath);

    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:5000';
    const serverUrl = `${protocol}://${host}`;
    
    const publicUrl = `${serverUrl}/images/${relativePath.replace(/\\/g, '/')}`;

    // Attach info to req for downstream controllers
    req.vpsUpload = {
      url: publicUrl,
      localPath: absolutePath,
      filename: filename,
      context: context
    };

    next();
  } catch (error) {
    next(error);
  }
};

export { upload as multerUpload };
