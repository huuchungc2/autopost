import 'dotenv/config';
import { query } from '../src/db.js';
import {
  loadAppSettings,
  getEffectiveDriveFolderId,
  getEffectiveMediaStorage,
} from '../src/services/appSettingsService.js';
import { getDriveFolderIdForPage } from '../src/services/pageDriveService.js';
import { getMediaStorageMode } from '../src/services/mediaStorage.js';
import { isGoogleDriveConfigured } from '../src/services/googleDriveService.js';
import { google } from 'googleapis';
import { getEffectiveDriveOAuth2Config } from '../src/services/appSettingsService.js';

await loadAppSettings();

console.log('=== Cấu hình chung ===');
console.log('media_storage (raw):', getEffectiveMediaStorage() || '(trống — tự nhận diện)');
console.log('media_storage (resolved):', getMediaStorageMode());
console.log('google drive configured (oauth2):', isGoogleDriveConfigured());
console.log('folder gốc (Cài đặt):', getEffectiveDriveFolderId() || '(trống)');
console.log('');

console.log('=== Fanpage — folder sẽ được dùng ===');
const pages = await query('SELECT id, name, google_drive_folder_id, is_active FROM fb_pages');
for (const p of pages) {
  const resolved = await getDriveFolderIdForPage(p.id);
  console.log(
    `[page ${p.id}] ${p.name} | active=${p.is_active} | folder riêng DB="${p.google_drive_folder_id || '(trống)'}" | => sẽ upload vào: ${resolved || '(KHÔNG CÓ — sẽ lỗi khi xuất ảnh)'}`
  );
}

console.log('');
console.log('=== Kiểm tra ảnh gdrive:// gần nhất — parent thật trên Drive ===');
const oauth2Config = getEffectiveDriveOAuth2Config();
if (!oauth2Config) {
  console.log('(Bỏ qua — chưa cấu hình OAuth2)');
  process.exit(0);
}
const oAuth2Client = new google.auth.OAuth2(oauth2Config.clientId, oauth2Config.clientSecret);
oAuth2Client.setCredentials({ refresh_token: oauth2Config.refreshToken });
const drive = google.drive({ version: 'v3', auth: oAuth2Client });

const recent = await query(
  `SELECT p.id AS post_id, p.page_id, p.image_url, fp.name AS page_name, fp.google_drive_folder_id AS expected_folder
   FROM posts p JOIN fb_pages fp ON fp.id = p.page_id
   WHERE p.image_url LIKE 'gdrive://%'
   ORDER BY p.id DESC LIMIT 15`
);

for (const r of recent) {
  const fileId = r.image_url.replace('gdrive://', '');
  try {
    const meta = await drive.files.get({ fileId, fields: 'id,name,parents', supportsAllDrives: true });
    const actualParent = (meta.data.parents || [])[0] || '(không có parent?)';
    const expected = r.expected_folder || getEffectiveDriveFolderId() || '(không xác định)';
    const match = actualParent === expected ? 'OK' : '*** SAI FOLDER ***';
    console.log(
      `post ${r.post_id} | page "${r.page_name}" (#${r.page_id}) | file=${meta.data.name} | parent thật=${actualParent} | mong đợi=${expected} | ${match}`
    );
  } catch (err) {
    console.log(`post ${r.post_id} | page "${r.page_name}" | fileId=${fileId} | LỖI: ${err.message}`);
  }
}

process.exit(0);
