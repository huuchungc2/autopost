import { google } from 'googleapis';
import { Readable } from 'stream';
import {
  getEffectiveDriveOAuth2Config,
  getEffectiveDriveFolderId,
  isDriveConfiguredFromSettings,
} from './appSettingsService.js';

let driveClient = null;

export function resetDriveClient() {
  driveClient = null;
}

function getOAuth2Config() {
  return getEffectiveDriveOAuth2Config();
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
    const { clientId, clientSecret, refreshToken } = getOAuth2Config();
    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oAuth2Client.setCredentials({ refresh_token: refreshToken });
    driveClient = google.drive({ version: 'v3', auth: oAuth2Client });
  }
  return driveClient;
}

export async function uploadBufferToDrive(buffer, filename, mimeType, folderIdOverride = null) {
  const drive = getDrive();
  // Có folder (riêng fanpage hoặc gốc Cài đặt) → BẮT BUỘC đúng folder đó, verify bên dưới.
  // Không có folder nào → fallback hợp lệ là root "Drive của tôi", không coi là lỗi.
  const folderId = folderIdOverride?.trim() || getFolderId() || null;
  const stream = Readable.from(buffer);
  const created = await drive.files.create({
    requestBody: {
      name: filename,
      ...(folderId ? { parents: [folderId] } : {}),
    },
    media: { mimeType, body: stream },
    fields: 'id,parents',
    supportsAllDrives: true,
  });

  const fileId = created.data.id;

  // Drive API đôi khi tạo file thành công nhưng ÂM THẦM bỏ qua `parents` (không báo lỗi) —
  // ví dụ khi folderId trỏ tới 1 resource không phải folder, hoặc tài khoản OAuth không có
  // quyền ghi vào đúng folder đó — file rơi thẳng vào gốc My Drive. Gắn lại parent tường minh
  // và xác nhận chắc chắn thay vì tin tưởng mù quáng response của bước create.
  const actualParents = created.data.parents || [];
  if (folderId && !actualParents.includes(folderId)) {
    console.warn(
      `Drive: file ${fileId} không nằm trong folder yêu cầu (${folderId}) — actual parents: ${actualParents.join(', ') || '(rỗng/root)'}. Đang sửa lại...`
    );
    try {
      const fixed = await drive.files.update({
        fileId,
        addParents: folderId,
        removeParents: actualParents.join(',') || undefined,
        fields: 'id,parents',
        supportsAllDrives: true,
      });
      if (!(fixed.data.parents || []).includes(folderId)) {
        throw new Error(`Không thể gắn file vào folder ${folderId} — kiểm tra quyền ghi (Editor) của tài khoản Google trên folder này.`);
      }
    } catch (fixError) {
      const err = new Error(
        `Ảnh đã tạo trên Drive nhưng KHÔNG vào đúng folder ${folderId} (rơi vào My Drive gốc) — `
        + `kiểm tra: (1) Folder ID đúng là 1 folder chứ không phải file, (2) tài khoản Google OAuth2 có quyền Editor trên folder đó. Chi tiết: ${fixError.message}`
      );
      err.status = 400;
      throw err;
    }
  }

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
  const oauth2Config = overrides.oauth2Config || getOAuth2Config();
  if (!folderId || !oauth2Config) {
    const error = new Error('Thiếu Folder ID hoặc OAuth2 credentials (Client ID, Client Secret, Refresh Token)');
    error.status = 400;
    throw error;
  }
  if (folderId.includes('@')) {
    const error = new Error('Folder ID không phải email — copy ID từ URL folder Drive');
    error.status = 400;
    throw error;
  }

  const { clientId, clientSecret, refreshToken } = oauth2Config;
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
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
        + 'và đảm bảo tài khoản Google đã cấp quyền OAuth2 có thể truy cập folder này.'
      );
      hint.status = 400;
      throw hint;
    }
    throw error;
  }
  if (folder.data.mimeType !== 'application/vnd.google-apps.folder') {
    const error = new Error(
      `ID này không phải folder (là "${folder.data.name}", mimeType: ${folder.data.mimeType}) — `
      + 'copy ID từ URL của folder trên Drive (drive.google.com/drive/folders/<ID>), không phải link 1 file.'
    );
    error.status = 400;
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
