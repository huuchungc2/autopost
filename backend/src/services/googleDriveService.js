import { google } from 'googleapis';
import { Readable } from 'stream';

let driveClient = null;

function getCredentials() {
  const raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.error('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is not valid JSON');
    return null;
  }
}

export function isGoogleDriveConfigured() {
  return !!(getCredentials() && process.env.GOOGLE_DRIVE_FOLDER_ID);
}

function getDrive() {
  if (!isGoogleDriveConfigured()) {
    throw new Error('Google Drive chưa cấu hình — xem .env.example');
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
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
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

export function driveFileIdFromUrl(url) {
  if (!url) return null;
  if (url.startsWith('gdrive://')) return url.slice('gdrive://'.length);
  return null;
}

export function drivePreviewUrl(fileId) {
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}
