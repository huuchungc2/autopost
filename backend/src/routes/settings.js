import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/auth.js';
import { getStorageUsage } from '../services/storageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicRoot = path.resolve(__dirname, '../../../public');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const maxImagesMb = parseInt(process.env.MAX_IMAGES_MB || '500', 10);
  const maxVideosMb = parseInt(process.env.MAX_VIDEOS_MB || '5000', 10);
  const images = getStorageUsage(path.join(publicRoot, 'images'), maxImagesMb);
  const videos = getStorageUsage(path.join(publicRoot, 'videos'), maxVideosMb);

  res.json({
    storage: { images, videos },
    config: {
      max_images_mb: maxImagesMb,
      max_videos_mb: maxVideosMb,
      auto_generate_hour: process.env.AUTO_GENERATE_HOUR || '23',
      auto_generate_minute: process.env.AUTO_GENERATE_MINUTE || '0',
      scheduler_enabled: process.env.DISABLE_SCHEDULER !== 'true',
    },
  });
});

export default router;
