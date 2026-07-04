import express from 'express';
import { google } from 'googleapis';
import { query } from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { resetDriveClient } from '../services/googleDriveService.js';
import { loadAppSettings, getCachedSetting } from '../services/appSettingsService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

const SCOPES = ['https://www.googleapis.com/auth/drive'];

// state tạm lưu trong RAM (kèm redirectUri đã dùng lúc tạo auth URL, vì Google bắt buộc
// redirect_uri ở bước đổi code phải khớp y hệt bước tạo auth URL), timeout 10 phút.
const pendingStates = new Map();

function buildRedirectUri(req) {
  return `${req.protocol}://${req.get('host')}/api/drive/callback`;
}

function getOAuth2Client(redirectUri) {
  const clientId = getCachedSetting('google_drive_client_id')?.trim();
  const clientSecret = getCachedSetting('google_drive_client_secret')?.trim();
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// GET /api/drive/auth — yêu cầu super_admin đăng nhập, trả về auth URL
router.get('/auth', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const redirectUri = buildRedirectUri(req);
  const oAuth2Client = getOAuth2Client(redirectUri);
  if (!oAuth2Client) {
    return res.status(400).json({
      error: 'Chưa lưu Client ID và Client Secret — vào Cài đặt → Google Drive → điền và bấm Lưu trước',
    });
  }

  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  pendingStates.set(state, { ts: Date.now(), redirectUri });

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });

  res.json({ auth_url: authUrl, redirect_uri: redirectUri });
}));

// GET /api/drive/callback — Google redirect về đây sau khi user authorize
router.get('/callback', asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;
  const settingsUrl = `${req.protocol}://${req.get('host')}/settings`;
  const fail = (message) => res.redirect(`${settingsUrl}?driveAuth=error&message=${encodeURIComponent(message)}`);

  if (error) return fail(`Lỗi OAuth2: ${error}`);

  const pending = state ? pendingStates.get(state) : null;
  if (!pending) return fail('State không hợp lệ hoặc đã hết hạn, thử lại.');
  pendingStates.delete(state);
  if (Date.now() - pending.ts > 10 * 60 * 1000) return fail('Link đã hết hạn (10 phút), tạo link mới.');

  if (!code) return fail('Không nhận được code từ Google.');

  const oAuth2Client = getOAuth2Client(pending.redirectUri);
  if (!oAuth2Client) return fail('Client ID/Secret đã bị xoá khỏi DB trong lúc chờ.');

  const { tokens } = await oAuth2Client.getToken(code);
  const refreshToken = tokens.refresh_token;

  if (!refreshToken) {
    return fail(
      'Google không trả về refresh_token — vào myaccount.google.com/permissions thu hồi quyền ứng dụng rồi thử lại.'
    );
  }

  await query(
    'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
    ['google_drive_refresh_token', refreshToken]
  );

  await loadAppSettings();
  resetDriveClient();

  return res.redirect(`${settingsUrl}?driveAuth=success`);
}));

export default router;
