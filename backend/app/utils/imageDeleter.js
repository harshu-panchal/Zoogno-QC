import fs from 'fs';
import path from 'path';

/**
 * Deletes an image from the VPS local storage
 * @param {String} fileUrl - The public URL of the file (e.g. https://api.domain.com/images/menu/2026/06/uuid.webp)
 * @returns {Promise<Boolean>} - True if successful, false otherwise
 */
export const deleteImage = async (fileUrl) => {
  try {
    if (!fileUrl) return false;

    // Extract the relative path from the URL
    // e.g. from https://api.domain.com/images/menu/2026/06/uuid.webp -> menu/2026/06/uuid.webp
    const match = fileUrl.match(/\/images\/(.+)$/);
    if (!match) {
      console.warn('URL does not match VPS format:', fileUrl);
      return false;
    }

    const relativePath = match[1];
    const basePath = process.env.STORAGE_BASE_PATH || path.join(process.cwd(), 'storage');
    const absolutePath = path.join(basePath, ...relativePath.split('/'));

    // Check if file exists and delete it
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error deleting image from VPS:', error);
    return false;
  }
};
