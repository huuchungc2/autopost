import { query } from '../db.js';
import { resetDriveClient } from './googleDriveService.js';

const KEYS = {
  MEDIA_STORAGE: 'media_storage',
  GOOGLE_DRIVE_FOLDER_ID: 'google_drive_folder_id',
  GOOGLE_DRIVE_CLIENT_ID: 'google_drive_client_id',
  GOOGLE_DRIVE_CLIENT_SECRET: 'google_drive_client_secret',
  GOOGLE_DRIVE_REFRESH_TOKEN: 'google_drive_refresh_token',
  COMPOSIO_API_KEY: 'composio_api_key',
  COMPOSIO_FACEBOOK_AUTH_CONFIG_ID: 'composio_facebook_auth_config_id',
  COMPOSIO_DEFAULT_USER_ID: 'composio_default_user_id',
  COMPOSIO_DEFAULT_CONNECTED_ACCOUNT_ID: 'composio_default_connected_account_id',
  COMPOSIO_FACEBOOK_TOOLKIT_VERSION: 'composio_facebook_toolkit_version',
  COMPOSIO_AUTO_FALLBACK: 'composio_auto_fallback',
  POSTS_SYNC_LOOKBACK_DAYS: 'posts_sync_lookback_days',
};

let cache = {};

export async function loadAppSettings() {
  try {
    const rows = await query('SELECT setting_key, setting_value FROM app_settings');
    cache = {};
    for (const row of rows) {
      cache[row.setting_key] = row.setting_value ?? '';
    }
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      cache = {};
      return;
    }
    throw error;
  }
}

export function getCachedSetting(key) {
  return cache[key] ?? null;
}

export function getEffectiveMediaStorage() {
  const fromDb = getCachedSetting(KEYS.MEDIA_STORAGE);
  if (fromDb === 'local' || fromDb === 'google_drive') return fromDb;
  const fromEnv = process.env.MEDIA_STORAGE || '';
  if (fromEnv === 'local' || fromEnv === 'google_drive') return fromEnv;
  return '';
}

export function getEffectiveDriveFolderId() {
  const fromDb = getCachedSetting(KEYS.GOOGLE_DRIVE_FOLDER_ID);
  if (fromDb?.trim()) return fromDb.trim();
  return process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || '';
}

export function getEffectiveDriveOAuth2Config() {
  const clientId = (getCachedSetting(KEYS.GOOGLE_DRIVE_CLIENT_ID) || '').trim();
  const clientSecret = (getCachedSetting(KEYS.GOOGLE_DRIVE_CLIENT_SECRET) || '').trim();
  const refreshToken = (getCachedSetting(KEYS.GOOGLE_DRIVE_REFRESH_TOKEN) || '').trim();
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

/**
 * Chỉ cần OAuth2 để coi là "đã cấu hình Drive" — KHÔNG bắt buộc Folder ID gốc,
 * vì folder có thể được cấu hình riêng từng fanpage (google_drive_folder_id).
 * Trước đây yêu cầu cả folder gốc khiến toàn bộ ảnh rơi về lưu local nếu admin
 * chỉ đặt folder riêng cho từng fanpage mà bỏ trống folder gốc trong Cài đặt.
 */
export function isDriveConfiguredFromSettings() {
  return !!getEffectiveDriveOAuth2Config();
}

function maskClientId(clientId) {
  if (!clientId?.trim()) return null;
  const k = clientId.trim();
  if (k.length <= 20) return k;
  return `${k.slice(0, 16)}…${k.slice(-8)}`;
}

export function getMediaStorageStatus() {
  const oauth2 = getEffectiveDriveOAuth2Config();
  const folderId = getEffectiveDriveFolderId();
  const mode = getEffectiveMediaStorage();
  // driveReady chỉ cần OAuth2 — folder gốc là fallback tuỳ chọn, mỗi fanpage
  // có thể tự cấu hình folder riêng (google_drive_folder_id) mà không cần folder gốc.
  const driveReady = !!oauth2;
  // BUG đã sửa: logic cũ `mode === 'google_drive' || (!mode && driveReady) ? (driveReady ? ... :
  // 'local') : ...` âm thầm ĐÈ lại lựa chọn 'google_drive' admin đã tường minh chọn về lại 'local'
  // nếu driveReady=false NGAY LÚC TÍNH (vd đang nhập dở từng trường Client ID/Secret/Refresh Token
  // một, hoặc lưu mode và credentials ở 2 bước khác nhau) — sau khi bấm "Lưu cấu hình Drive",
  // Settings.jsx ghi thẳng `media_storage` trả về vào state dropdown, khiến dropdown "tự nhảy" về
  // lại "VPS local" dù DB đã lưu đúng 'google_drive' — nhìn như "không lưu được chế độ Google
  // Drive". Giờ: mode đã lưu tường minh ('google_drive' hoặc 'local') luôn được tôn trọng nguyên
  // vẹn; chỉ tự đoán theo driveReady khi CHƯA từng lưu gì (cài đặt mới tinh, mode rỗng).
  const resolvedMode = (mode === 'google_drive' || mode === 'local')
    ? mode
    : (driveReady ? 'google_drive' : 'local');

  return {
    media_storage: resolvedMode,
    drive_configured: driveReady,
    folder_id: folderId || null,
    folder_id_source: getCachedSetting(KEYS.GOOGLE_DRIVE_FOLDER_ID)?.trim()
      ? 'database'
      : (process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() ? 'env' : null),
    has_stored_credentials: !!(
      getCachedSetting(KEYS.GOOGLE_DRIVE_CLIENT_ID)?.trim()
      && getCachedSetting(KEYS.GOOGLE_DRIVE_CLIENT_SECRET)?.trim()
      && getCachedSetting(KEYS.GOOGLE_DRIVE_REFRESH_TOKEN)?.trim()
    ),
    // Chỉ Client ID + Secret (chưa cần Refresh Token) — dùng để bật nút "Lấy Refresh Token"
    // trước khi refresh token tồn tại.
    has_client_credentials: !!(
      getCachedSetting(KEYS.GOOGLE_DRIVE_CLIENT_ID)?.trim()
      && getCachedSetting(KEYS.GOOGLE_DRIVE_CLIENT_SECRET)?.trim()
    ),
    client_id_preview: maskClientId(getCachedSetting(KEYS.GOOGLE_DRIVE_CLIENT_ID)),
  };
}

export async function saveMediaStorageSettings(updates = {}) {
  const entries = [];

  if (updates.media_storage === 'local' || updates.media_storage === 'google_drive') {
    entries.push([KEYS.MEDIA_STORAGE, updates.media_storage]);
  }

  if (updates.google_drive_folder_id !== undefined) {
    const folderId = String(updates.google_drive_folder_id || '').trim();
    if (folderId.includes('@')) {
      const error = new Error('Folder ID không phải email — mở folder trên Google Drive, copy ID từ URL (dạng 1AbCdEf...)');
      error.status = 400;
      throw error;
    }
    entries.push([KEYS.GOOGLE_DRIVE_FOLDER_ID, folderId]);
  }

  if (updates.google_drive_client_id !== undefined) {
    entries.push([KEYS.GOOGLE_DRIVE_CLIENT_ID, String(updates.google_drive_client_id || '').trim()]);
  }
  if (updates.google_drive_client_secret !== undefined) {
    entries.push([KEYS.GOOGLE_DRIVE_CLIENT_SECRET, String(updates.google_drive_client_secret || '').trim()]);
  }
  if (updates.google_drive_refresh_token !== undefined) {
    entries.push([KEYS.GOOGLE_DRIVE_REFRESH_TOKEN, String(updates.google_drive_refresh_token || '').trim()]);
  }

  for (const [key, value] of entries) {
    if (value === '') {
      await query('DELETE FROM app_settings WHERE setting_key = ?', [key]);
      delete cache[key];
    } else {
      await query(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, value]
      );
      cache[key] = value;
    }
  }

  resetDriveClient();
  return getMediaStorageStatus();
}

function maskApiKey(key) {
  if (!key?.trim()) return null;
  const k = key.trim();
  if (k.length <= 10) return '••••••••';
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

function parseBoolSetting(value, defaultValue = false) {
  if (value === null || value === undefined || value === '') return defaultValue;
  const v = String(value).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function getEffectiveComposioApiKey() {
  return getCachedSetting(KEYS.COMPOSIO_API_KEY)?.trim() || '';
}

export function getEffectiveComposioAuthConfigId() {
  return getCachedSetting(KEYS.COMPOSIO_FACEBOOK_AUTH_CONFIG_ID)?.trim() || '';
}

export function getEffectiveComposioUserId() {
  return getCachedSetting(KEYS.COMPOSIO_DEFAULT_USER_ID)?.trim() || '';
}

export function getEffectiveComposioConnectedAccountId() {
  return getCachedSetting(KEYS.COMPOSIO_DEFAULT_CONNECTED_ACCOUNT_ID)?.trim() || '';
}

export function getEffectiveComposioToolkitVersion() {
  const fromDb = getCachedSetting(KEYS.COMPOSIO_FACEBOOK_TOOLKIT_VERSION);
  if (fromDb?.trim()) return fromDb.trim();
  return '20260616_00';
}

export function isComposioAutoFallbackEnabled() {
  const fromDb = getCachedSetting(KEYS.COMPOSIO_AUTO_FALLBACK);
  if (fromDb !== null && fromDb !== undefined && fromDb !== '') {
    return parseBoolSetting(fromDb, true);
  }
  return true;
}

export function isComposioConfiguredFromSettings() {
  return !!(
    getEffectiveComposioApiKey()
    && getEffectiveComposioUserId()
    && getEffectiveComposioConnectedAccountId()
  );
}

export function getComposioSettingsStatus() {
  const apiKey = getEffectiveComposioApiKey();
  const missing = [];
  if (!apiKey) missing.push('composio_api_key');
  if (!getEffectiveComposioAuthConfigId()) missing.push('composio_facebook_auth_config_id');
  if (!getEffectiveComposioUserId()) missing.push('composio_default_user_id');
  if (!getEffectiveComposioConnectedAccountId()) missing.push('composio_default_connected_account_id');

  return {
    configured: isComposioConfiguredFromSettings(),
    missing_fields: missing,
    api_key_preview: maskApiKey(apiKey),
    has_stored_api_key: !!getCachedSetting(KEYS.COMPOSIO_API_KEY)?.trim(),
    api_key_source: getCachedSetting(KEYS.COMPOSIO_API_KEY)?.trim() ? 'database' : null,
    auth_config_id: getEffectiveComposioAuthConfigId() || null,
    default_user_id: getEffectiveComposioUserId() || null,
    default_connected_account_id: getEffectiveComposioConnectedAccountId() || null,
    facebook_toolkit_version: getEffectiveComposioToolkitVersion(),
    auto_fallback_on_token_error: isComposioAutoFallbackEnabled(),
  };
}

export async function saveComposioSettings(updates = {}) {
  const entries = [];

  if (updates.composio_api_key !== undefined) {
    entries.push([KEYS.COMPOSIO_API_KEY, String(updates.composio_api_key || '').trim()]);
  }
  if (updates.composio_facebook_auth_config_id !== undefined) {
    entries.push([KEYS.COMPOSIO_FACEBOOK_AUTH_CONFIG_ID, String(updates.composio_facebook_auth_config_id || '').trim()]);
  }
  if (updates.composio_default_user_id !== undefined) {
    entries.push([KEYS.COMPOSIO_DEFAULT_USER_ID, String(updates.composio_default_user_id || '').trim()]);
  }
  if (updates.composio_default_connected_account_id !== undefined) {
    entries.push([KEYS.COMPOSIO_DEFAULT_CONNECTED_ACCOUNT_ID, String(updates.composio_default_connected_account_id || '').trim()]);
  }
  if (updates.composio_facebook_toolkit_version !== undefined) {
    entries.push([KEYS.COMPOSIO_FACEBOOK_TOOLKIT_VERSION, String(updates.composio_facebook_toolkit_version || '').trim()]);
  }
  if (updates.composio_auto_fallback !== undefined) {
    entries.push([KEYS.COMPOSIO_AUTO_FALLBACK, updates.composio_auto_fallback ? '1' : '0']);
  }

  for (const [key, value] of entries) {
    if (value === '') {
      await query('DELETE FROM app_settings WHERE setting_key = ?', [key]);
      delete cache[key];
    } else {
      await query(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, value]
      );
      cache[key] = value;
    }
  }

  return getComposioSettingsStatus();
}

// 2026-07-13 — Tony: giới hạn tự động số ngày sync bài viết cho GroupFlow (cả "của tôi" lẫn "đồng
// đội") — trước đây cross-posts hardcode cứng 30 ngày trong userSync.js (CROSS_POSTS_LOOKBACK_MS),
// còn my-posts (bài của chính mình) KHÔNG giới hạn gì cả — bài viết tồn tại càng lâu, mỗi request
// cold-start/thiết bị lâu ngày chưa mở càng phải quét nhiều hơn, tải server tăng dần vô hạn theo
// thời gian hệ thống chạy. Đưa ra Cài đặt (super_admin) thay vì hardcode để tự điều chỉnh được mà
// không cần sửa code — mặc định 60 ngày (Tony chọn).
const DEFAULT_POSTS_SYNC_LOOKBACK_DAYS = 60;

export function getEffectivePostsSyncLookbackDays() {
  const fromDb = parseInt(getCachedSetting(KEYS.POSTS_SYNC_LOOKBACK_DAYS), 10);
  return Number.isFinite(fromDb) && fromDb > 0 ? fromDb : DEFAULT_POSTS_SYNC_LOOKBACK_DAYS;
}

export async function savePostsSyncLookbackDays(days) {
  const n = parseInt(days, 10);
  if (!Number.isFinite(n) || n <= 0) {
    const error = new Error('Số ngày phải là số nguyên dương');
    error.status = 400;
    throw error;
  }
  await query(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [KEYS.POSTS_SYNC_LOOKBACK_DAYS, String(n)]
  );
  cache[KEYS.POSTS_SYNC_LOOKBACK_DAYS] = String(n);
  return n;
}
