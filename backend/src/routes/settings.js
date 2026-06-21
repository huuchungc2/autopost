import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getStorageUsage } from '../services/storageService.js';
import { getMediaStorageMode, isUsingGoogleDrive } from '../services/mediaStorage.js';
import {
  getImageScheduleConfig,
  saveImageScheduleConfig,
  getImageGenerateLogs,
} from '../services/imageScheduleConfig.js';
import {
  getEnabledPageImageSchedulesForUser,
  filterPagesWithoutOwnSchedule,
  releaseInFlightImageJobsForPages,
} from '../services/pageImageSchedule.js';
import { getAssignedPageIds } from '../services/pageAccessService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicRoot = path.resolve(__dirname, '../../../public');

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const maxImagesMb = parseInt(process.env.MAX_IMAGES_MB || '500', 10);
  const maxVideosMb = parseInt(process.env.MAX_VIDEOS_MB || '5000', 10);
  const images = getStorageUsage(path.join(publicRoot, 'images'), maxImagesMb);
  const videos = getStorageUsage(path.join(publicRoot, 'videos'), maxVideosMb);
  const imageSchedule = ['super_admin', 'admin'].includes(req.user.role)
    ? await getImageScheduleConfig(req.user.id)
    : null;
  const pageImageSchedules = imageSchedule
    ? await getEnabledPageImageSchedulesForUser(req.user.id)
    : [];

  res.json({
    storage: {
      images,
      videos,
      media_mode: getMediaStorageMode(),
      images_on_drive: isUsingGoogleDrive(),
    },
    config: {
      max_images_mb: maxImagesMb,
      max_videos_mb: maxVideosMb,
      scheduler_enabled: process.env.DISABLE_SCHEDULER !== 'true',
      image_schedule: imageSchedule,
      page_image_schedules_enabled: pageImageSchedules,
    },
  });
}));

router.put('/image-schedule', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const {
    enabled,
    start_hour,
    start_minute,
    end_hour,
    end_minute,
    interval_minutes,
  } = req.body || {};

  const updated = await saveImageScheduleConfig(req.user.id, {
    enabled,
    start_hour,
    start_minute,
    end_hour,
    end_minute,
    interval_minutes,
  });

  if (enabled === false || enabled === 0 || enabled === '0') {
    const pageIds = await filterPagesWithoutOwnSchedule(await getAssignedPageIds(req.user.id));
    await releaseInFlightImageJobsForPages(pageIds);
  }

  res.json({
    message: 'Đã lưu lịch xuất ảnh (chỉ fanpage được gán cho bạn)',
    image_schedule: updated,
  });
}));

router.get('/image-schedule/logs', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  const logs = await getImageGenerateLogs(req.user.id, limit);
  res.json({ logs });
}));

export default router;
