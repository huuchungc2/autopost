import express from 'express';
import { google } from 'googleapis';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { resetDriveClient } from '../services/googleDriveService.js';
import { loadAppSettings, getCachedSetting } from '../services/appSettingsService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

const REDIRECT_URI = `${(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')}/api/auth/drive/callback`;
const SCOPES = ['https://www.googleapis.com/auth/drive'];

// state tạm lưu trong RAM, timeout 10 phút
const pendingStates = new Map();

function getOAuth2Client() {
  const clientId = getCachedSetting('google_drive_client_id')?.trim();
  const clientSecret = getCachedSetting('google_drive_client_secret')?.trim();
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

// GET /api/auth/drive — yêu cầu super_admin đăng nhập, trả về auth URL
router.get('/', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const oAuth2Client = getOAuth2Client();
  if (!oAuth2Client) {
    return res.status(400).json({
      error: 'Chưa lưu Client ID và Client Secret — vào Cài đặt → Google Drive → điền và bấm Lưu trước',
    });
  }

  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  pendingStates.set(state, Date.now());

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });

  res.json({ auth_url: authUrl, redirect_uri: REDIRECT_URI });
}));

// GET /api/auth/drive/callback — Google redirect về đây sau khi user authorize
router.get('/callback', asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.send(`<h3>Lỗi OAuth2: ${error}</h3><p>Đóng tab này và thử lại.</p>`);
  }

  if (!state || !pendingStates.has(state)) {
    return res.status(400).send('<h3>State không hợp lệ hoặc đã hết hạn.</h3><p>Quay lại AutoPost và thử lại.</p>');
  }

  const ts = pendingStates.get(state);
  pendingStates.delete(state);
  if (Date.now() - ts > 10 * 60 * 1000) {
    return res.status(400).send('<h3>Link đã hết hạn (10 phút).</h3><p>Quay lại AutoPost và tạo link mới.</p>');
  }

  if (!code) {
    return res.status(400).send('<h3>Không nhận được code từ Google.</h3>');
  }

  const oAuth2Client = getOAuth2Client();
  if (!oAuth2Client) {
    return res.status(400).send('<h3>Client ID/Secret đã bị xoá khỏi DB trong lúc chờ.</h3>');
  }

  const { tokens } = await oAuth2Client.getToken(code);
  const refreshToken = tokens.refresh_token;

  if (!refreshToken) {
    return res.status(400).send(
      '<h3>Google không trả về refresh_token.</h3>'
      + '<p>Vào <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>, '
      + 'thu hồi quyền ứng dụng này, rồi thử lại (cần <code>prompt=consent</code> để lấy refresh_token mới).</p>'
    );
  }

  await query(
    'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
    ['google_drive_refresh_token', refreshToken]
  );

  await loadAppSettings();
  resetDriveClient();

  return res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head><meta charset="utf-8"><title>Google Drive — AutoPost</title>
    <style>body{font-family:sans-serif;max-width:500px;margin:60px auto;text-align:center}
    .ok{color:#16a34a;font-size:48px}.box{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:24px;margin-top:24px}</style>
    </head>
    <body>
      <div class="ok">✓</div>
      <h2>Google Drive đã kết nối!</h2>
      <div class="box">
        <p>Refresh Token đã lưu vào database.</p>
        <p>Đóng tab này và quay lại <strong>AutoPost → Cài đặt → Google Drive</strong> để kiểm tra kết nối.</p>
      </div>
    </body>
    </html>
  `);
}));

export default router;
