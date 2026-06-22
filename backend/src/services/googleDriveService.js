import { google } from 'googleapis';
import { Readable } from 'stream';
import {
  getEffectiveDriveCredentials,
  getEffectiveDriveFolderId,
  isDriveConfiguredFromSettings,
} from './appSettingsService.js';

let driveClient = null;

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
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    driveClient = google.drive({ version: 'v3', auth });
  }
  return driveClient;
}

export async function uploadBufferToDrive(buffer, filename, mimeType) {
  const drive = getDrive();
  const stream = Readable.from(buffer);
  const created = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [getFolderId()],
    },
    media: { mimeType, body: stream },
    fields: 'id',
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
    { fileId, alt: 'media' },
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
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const drive = google.drive({ version: 'v3', auth });
  const folder = await drive.files.get({
    fileId: folderId,
    fields: 'id,name,mimeType',
  });
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
