import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/auth.js';
import { storeUploadedImage, validateImageUpload } from '../services/imageService.js';
import { isUsingGoogleDrive } from '../services/mediaStorage.js';
import { storeVideoFile, validateVideoFile } from '../services/videoService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const basePublicDir = path.resolve(__dirname, '../../../public');

const router = express.Router();
router.use(authenticate);

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(basePublicDir, 'images');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `image-${Date.now()}${ext}`);
  },
});

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(basePublicDir, 'videos', 'tmp');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `video-${Date.now()}${ext}`);
  },
});

const imageUpload = multer({
  storage: isUsingGoogleDrive() ? multer.memoryStorage() : imageStorage,
});
const videoUpload = multer({ storage: videoStorage });

router.post('/image', imageUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });
  try {
    await validateImageUpload(req.file);
    if (isUsingGoogleDrive()) {
      const url = await storeUploadedImage(req.file);
      return res.json({ url, storage: 'google_drive' });
    }
    res.json({ url: `/images/${req.file.filename}`, storage: 'local' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/video', videoUpload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Video is required' });
  try {
    validateVideoFile(req.file);
    const stored = storeVideoFile(req.file);
    res.json({ url: stored.video_url });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
