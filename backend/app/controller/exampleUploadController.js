import express from 'express';
import { uploadToVPS } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Example usage of the uploadToVPS middleware
// We set 'menu' as the context, which dictates the folder structure and resize dimensions
router.post('/upload-menu-item', uploadToVPS('menu'), (req, res) => {
  try {
    if (!req.file || !req.vpsUpload) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // req.vpsUpload contains: { url, localPath, filename, context }
    const { url, filename } = req.vpsUpload;

    // TODO: Save the URL to your database model
    // const menuItem = await Menu.create({ name: 'Pizza', imageUrl: url });

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully to VPS',
      data: {
        url: url,
        filename: filename
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

export default router;
