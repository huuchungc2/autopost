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
  getMediaStorageStatus,
  saveMediaStorageSettings,
  getComposioSettingsStatus,
  saveComposioSettings,
  getEffectiveDriveCredentials,
  getEffectiveComposioApiKey,
} from '../services/appSettingsService.js';
import { testDriveConnection } from '../services/googleDriveService.js';
import {
  createComposioFacebookLink,
  getConnectedAccountStatus,
} from '../services/composioService.js';
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
  const maxImagesMb = parseInt(process.env.MAX_IMAGES_MB || '5000', 10);
  const maxVideosMb = parseInt(process.env.MAX_VIDEOS_MB || '5000', 10);
  const images = getStorageUsage(path.join(publicRoot, 'images'), maxImagesMb);
  const videos = getStorageUsage(path.join(publicRoot, 'videos'), maxVideosMb);
  const imageSchedule = ['super_admin', 'admin'].includes(req.user.role)
    ? await getImageScheduleConfig(req.user.id)
    : null;
  const pageImageSchedules = imageSchedule
    ? await getEnabledPageImageSchedulesForUser(req.user.id)
    : [];

  const composio = ['super_admin', 'admin'].includes(req.user.role)
    ? getComposioSettingsStatus()
    : null;
  let composioConnection = null;
  if (composio?.default_connected_account_id && composio.configured) {
    try {
      composioConnection = await getConnectedAccountStatus(composio.default_connected_account_id);
    } catch (error) {
      composioConnection = { error: error.message };
    }
  }
  const composioWithConnection = composio
    ? { ...composio, connection: composioConnection }
    : null;

  res.json({
    storage: {
      images,
      videos,
      media_mode: getMediaStorageMode(),
      images_on_drive: isUsingGoogleDrive(),
      google_drive: getMediaStorageStatus(),
    },
    config: {
      max_images_mb: maxImagesMb,
      max_videos_mb: maxVideosMb,
      scheduler_enabled: process.env.DISABLE_SCHEDULER !== 'true',
      image_schedule: imageSchedule,
      page_image_schedules_enabled: pageImageSchedules,
      composio: composioWithConnection,
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

router.get('/media-storage', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  res.json({ media_storage: getMediaStorageStatus() });
}));

router.put('/media-storage', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const {
    media_storage,
    google_drive_folder_id,
    google_drive_service_account_json,
  } = req.body || {};

  if (media_storage && media_storage !== 'local' && media_storage !== 'google_drive') {
    return res.status(400).json({ error: 'media_storage phải là local hoặc google_drive' });
  }

  const updated = await saveMediaStorageSettings({
    media_storage,
    google_drive_folder_id,
    google_drive_service_account_json,
  });

  res.json({
    message: 'Đã lưu cấu hình lưu trữ media',
    media_storage: updated,
  });
}));

router.post('/media-storage/test', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { google_drive_folder_id, google_drive_service_account_json } = req.body || {};
  const status = getMediaStorageStatus();

  let credentials = getEffectiveDriveCredentials();
  if (google_drive_service_account_json?.trim()) {
    try {
      credentials = JSON.parse(google_drive_service_account_json.trim());
    } catch {
      return res.status(400).json({ error: 'Service account JSON không hợp lệ' });
    }
  }

  const folderId = google_drive_folder_id?.trim() || status.folder_id;
  if (!credentials || !folderId) {
    return res.status(400).json({
      error: 'Cần Folder ID + Service Account JSON (dán JSON hoặc lưu cấu hình trước)',
    });
  }

  const result = await testDriveConnection({ folderId, credentials });
  res.json({
    message: 'Kết nối Google Drive thành công',
    folder: result,
  });
}));

router.get('/composio', requireRole('super_admin', 'admin'), asyncHandler(async (req, res) => {
  const composio = getComposioSettingsStatus();
  let connection = null;
  if (composio.default_connected_account_id && composio.configured) {
    try {
      connection = await getConnectedAccountStatus(composio.default_connected_account_id);
    } catch (error) {
      connection = { error: error.message };
    }
  }
  res.json({ composio: { ...composio, connection } });
}));

router.put('/composio', requireRole('super_admin'), asyncHandler(async (req, res) => {
  const updated = await saveComposioSettings(req.body || {});
  res.json({
    message: 'Đã lưu cấu hình Composio',
    composio: updated,
  });
}));

router.post('/composio/connect-link', requireRole('super_admin'), asyncHandler(async (req, res) => {
  if (!getEffectiveComposioApiKey()?.trim()) {
    return res.status(400).json({ error: 'Lưu Composio API key trước khi tạo link kết nối' });
  }
  const link = await createComposioFacebookLink(req.body?.composio_default_user_id);
  res.json({
    message: 'Mở link để hoàn tất kết nối Facebook trên Composio',
    ...link,
  });
}));

export default router;
