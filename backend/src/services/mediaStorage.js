import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  downloadDriveFileBuffer,
  driveFileIdFromUrl,
  drivePreviewUrl,
  isGoogleDriveConfigured,
  uploadBufferToDrive,
} from './googleDriveService.js';
import { getEffectiveMediaStorage } from './appSettingsService.js';
import { getDriveFolderIdForPage } from './pageDriveService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const imagesDir = path.resolve(__dirname, '../../../public/images');
const publicRoot = path.resolve(__dirname, '../../../public');

/** local | google_drive — mặc định Drive nếu đã cấu hình */
export function getMediaStorageMode() {
  const configured = getEffectiveMediaStorage();
  if (configured === 'local') return 'local';
  if (configured === 'google_drive') return 'google_drive';
  return isGoogleDriveConfigured() ? 'google_drive' : 'local';
}

export function isUsingGoogleDrive() {
  return getMediaStorageMode() === 'google_drive';
}

function ensureImagesDir() {
  fs.mkdirSync(imagesDir, { recursive: true });
}

function saveImageBufferLocal(buffer, ext = 'png', filename = null) {
  ensureImagesDir();
  const name = filename || `generated-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(imagesDir, name), buffer);
  return `/images/${name}`;
}

/** Tên file an toàn từ slug — chỉ a-z0-9 và dấu gạch ngang, tránh path traversal. */
export function sanitizeImageFilename(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 150);
}

/**
 * Lưu ảnh — Drive nếu bật, không thì local VPS.
 * Trả về path/URL lưu trong DB (gdrive://ID hoặc /images/...).
 */
export async function storeImageBuffer(buffer, {
  ext = 'png',
  mimeType = 'image/png',
  pageId = null,
  driveFolderId = null,
  filename: filenameOverride = null,
} = {}) {
  const filename = filenameOverride ? sanitizeImageFilename(filenameOverride) : `autopost-${Date.now()}.${ext}`;

  if (isUsingGoogleDrive()) {
    const folderId = driveFolderId || await getDriveFolderIdForPage(pageId);
    const fileId = await uploadBufferToDrive(buffer, filename, mimeType, folderId);
    return `gdrive://${fileId}`;
  }

  return saveImageBufferLocal(buffer, ext, filenameOverride ? filename : null);
}

export function parseImageRef(imageUrl) {
  const driveId = driveFileIdFromUrl(imageUrl);
  if (driveId) return { type: 'gdrive', id: driveId };
  if (!imageUrl) return { type: 'none' };
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return { type: 'remote', url: imageUrl };
  }
  return { type: 'local', path: imageUrl };
}

export function resolveLocalImagePath(imageUrl) {
  if (!imageUrl || imageUrl.startsWith('http') || imageUrl.startsWith('gdrive://')) return null;
  const relative = imageUrl.replace(/^\//, '');
  const fullPath = path.join(publicRoot, relative);
  return fs.existsSync(fullPath) ? fullPath : null;
}

/** Stream hoặc path local để đăng Facebook — không cần lưu lâu trên VPS. */
export async function resolveImageForPublish(imageUrl) {
  const ref = parseImageRef(imageUrl);

  if (ref.type === 'gdrive') {
    const buffer = await downloadDriveFileBuffer(ref.id);
    return { buffer, filename: `drive-${ref.id}.jpg`, mimeType: 'image/jpeg' };
  }

  if (ref.type === 'local') {
    const localPath = resolveLocalImagePath(imageUrl);
    if (localPath) return { localPath };
  }

  if (ref.type === 'remote') {
    return { remoteUrl: ref.url };
  }

  if (ref.type === 'local' && imageUrl) {
    return { remoteUrl: `${process.env.PUBLIC_BASE_URL || 'http://localhost:3001'}${imageUrl}` };
  }

  return null;
}

export function resolveImagePreviewUrl(imageUrl) {
  const ref = parseImageRef(imageUrl);
  if (ref.type === 'gdrive') return drivePreviewUrl(ref.id);
  if (ref.type === 'remote') return ref.url;
  if (ref.type === 'local' && imageUrl) {
    const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
    return imageUrl.startsWith('http') ? imageUrl : `${base}${imageUrl}`;
  }
  return null;
}
