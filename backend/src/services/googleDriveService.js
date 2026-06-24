import { google } from 'googleapis';
import { Readable } from 'stream';
import {
  getEffectiveDriveCredentials,
  getEffectiveDriveFolderId,
  isDriveConfiguredFromSettings,
} from './appSettingsService.js';

let driveClient = null;

/** Service account + folder shared cần scope drive (drive.file không đọc được folder đã share). */
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

export function resetDriveClient() {
  driveClient = null;
}

function getCredentials() {
  return getEffectiveDriveCredentials();
}

function getFolderId() {
  return getEffectiveDriveFolderId();
}

export function isGoogleDriveConfigured() {
  return isDriveConfiguredFromSettings();
}

function getDrive() {
  if (!isGoogleDriveConfigured()) {
    throw new Error('Google Drive chưa cấu hình — vào Cài đặt hoặc xem .env.example');
  }
  if (!driveClient) {
    const auth = new google.auth.GoogleAuth({
      credentials: getCredentials(),
      scopes: DRIVE_SCOPES,
    });
    driveClient = google.drive({ version: 'v3', auth });
  }
  return driveClient;
}

export async function uploadBufferToDrive(buffer, filename, mimeType, folderIdOverride = null) {
  const drive = getDrive();
  const folderId = folderIdOverride?.trim() || getFolderId();
  if (!folderId) {
    throw new Error('Google Drive chưa có Folder ID — cấu hình trong Cài đặt hoặc fanpage');
  }
  const stream = Readable.from(buffer);
  const created = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: { mimeType, body: stream },
    fields: 'id',
    supportsAllDrives: true,
  });

  const fileId = created.data.id;

  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch (error) {
    console.warn('Drive public permission failed (preview có thể lỗi):', error.message);
  }

  return fileId;
}

export async function downloadDriveFileStream(fileId) {
  const drive = getDrive();
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );
  return response.data;
}

export async function downloadDriveFileBuffer(fileId) {
  const stream = await downloadDriveFileStream(fileId);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function testDriveConnection(overrides = {}) {
  const folderId = overrides.folderId?.trim() || getFolderId();
  const credentials = overrides.credentials || getCredentials();
  if (!folderId || !credentials) {
    const error = new Error('Thiếu Folder ID hoặc Service Account JSON');
    error.status = 400;
    throw error;
  }
  if (folderId.includes('@')) {
    const error = new Error('Folder ID không phải email — copy ID từ URL folder Drive');
    error.status = 400;
    throw error;
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: DRIVE_SCOPES,
  });
  const drive = google.drive({ version: 'v3', auth });
  let folder;
  try {
    folder = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType',
      supportsAllDrives: true,
    });
  } catch (error) {
    const msg = String(error?.message || '');
    if (msg.includes('File not found') || error?.code === 404) {
      const hint = new Error(
        'Folder không truy cập được — kiểm tra Folder ID (copy từ URL, phân biệt hoa/thường) '
        + 'và Share folder với client_email trong JSON (quyền Editor). '
        + 'Nếu folder nằm trong Shared drive, thêm service account vào ổ dùng chung.'
      );
      hint.status = 400;
      throw hint;
    }
    throw error;
  }
  return {
    folder_id: folder.data.id,
    folder_name: folder.data.name,
    mime_type: folder.data.mimeType,
  };
}

export function driveFileIdFromUrl(url) {
  if (!url) return null;
  if (url.startsWith('gdrive://')) return url.slice('gdrive://'.length);
  return null;
}

export function drivePreviewUrl(fileId) {
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}
