import { query } from '../db.js';
import { resetDriveClient } from './googleDriveService.js';

const KEYS = {
  MEDIA_STORAGE: 'media_storage',
  GOOGLE_DRIVE_FOLDER_ID: 'google_drive_folder_id',
  GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: 'google_drive_service_account_json',
  COMPOSIO_API_KEY: 'composio_api_key',
  COMPOSIO_FACEBOOK_AUTH_CONFIG_ID: 'composio_facebook_auth_config_id',
  COMPOSIO_DEFAULT_USER_ID: 'composio_default_user_id',
  COMPOSIO_DEFAULT_CONNECTED_ACCOUNT_ID: 'composio_default_connected_account_id',
  COMPOSIO_FACEBOOK_TOOLKIT_VERSION: 'composio_facebook_toolkit_version',
  COMPOSIO_AUTO_FALLBACK: 'composio_auto_fallback',
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

export function getEffectiveDriveCredentials() {
  const fromDb = getCachedSetting(KEYS.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON);
  const raw = fromDb?.trim() || process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.error('Google Drive service account JSON is not valid');
    return null;
  }
}

export function isDriveConfiguredFromSettings() {
  return !!(getEffectiveDriveCredentials() && getEffectiveDriveFolderId());
}

function maskServiceAccount(json) {
  if (!json) return null;
  try {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    return {
      client_email: parsed.client_email || null,
      project_id: parsed.project_id || null,
    };
  } catch {
    return { client_email: null, project_id: null };
  }
}

export function getMediaStorageStatus() {
  const credentials = getEffectiveDriveCredentials();
  const folderId = getEffectiveDriveFolderId();
  const mode = getEffectiveMediaStorage();
  const driveReady = !!(credentials && folderId);
  const resolvedMode = mode === 'google_drive' || (!mode && driveReady)
    ? (driveReady ? 'google_drive' : 'local')
    : (mode || 'local');

  return {
    media_storage: resolvedMode === 'google_drive' ? 'google_drive' : 'local',
    drive_configured: driveReady,
    folder_id: folderId || null,
    folder_id_source: getCachedSetting(KEYS.GOOGLE_DRIVE_FOLDER_ID)?.trim()
      ? 'database'
      : (process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() ? 'env' : null),
    service_account: maskServiceAccount(credentials),
    credentials_source: getCachedSetting(KEYS.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON)?.trim()
      ? 'database'
      : (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim() ? 'env' : null),
    has_stored_credentials: !!getCachedSetting(KEYS.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON)?.trim(),
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

  if (updates.google_drive_service_account_json !== undefined) {
    const raw = String(updates.google_drive_service_account_json || '').trim();
    if (raw) {
      try {
        JSON.parse(raw);
      } catch {
        const error = new Error('Service account JSON không hợp lệ');
        error.status = 400;
        throw error;
      }
    }
    entries.push([KEYS.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON, raw]);
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
  const fromDb = getCachedSetting(KEYS.COMPOSIO_API_KEY)?.trim();
  if (fromDb) return fromDb;
  return process.env.COMPOSIO_API_KEY?.trim() || '';
}

export function getEffectiveComposioAuthConfigId() {
  const fromDb = getCachedSetting(KEYS.COMPOSIO_FACEBOOK_AUTH_CONFIG_ID)?.trim();
  if (fromDb) return fromDb;
  return process.env.COMPOSIO_FACEBOOK_AUTH_CONFIG_ID?.trim() || '';
}

export function getEffectiveComposioUserId() {
  const fromDb = getCachedSetting(KEYS.COMPOSIO_DEFAULT_USER_ID)?.trim();
  if (fromDb) return fromDb;
  return process.env.COMPOSIO_DEFAULT_USER_ID?.trim() || '';
}

export function getEffectiveComposioConnectedAccountId() {
  const fromDb = getCachedSetting(KEYS.COMPOSIO_DEFAULT_CONNECTED_ACCOUNT_ID)?.trim();
  if (fromDb) return fromDb;
  return process.env.COMPOSIO_DEFAULT_CONNECTED_ACCOUNT_ID?.trim() || '';
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
    api_key_source: getCachedSetting(KEYS.COMPOSIO_API_KEY)?.trim()
      ? 'database'
      : (process.env.COMPOSIO_API_KEY?.trim() ? 'env' : null),
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

/** Khởi động: điền từng trường Composio từ .env nếu DB chưa có (UI đọc DB + env fallback). */
export async function seedComposioFromEnvIfEmpty() {
  const updates = {};
  if (!getCachedSetting(KEYS.COMPOSIO_API_KEY)?.trim() && process.env.COMPOSIO_API_KEY?.trim()) {
    updates.composio_api_key = process.env.COMPOSIO_API_KEY;
  }
  if (!getCachedSetting(KEYS.COMPOSIO_FACEBOOK_AUTH_CONFIG_ID)?.trim() && process.env.COMPOSIO_FACEBOOK_AUTH_CONFIG_ID?.trim()) {
    updates.composio_facebook_auth_config_id = process.env.COMPOSIO_FACEBOOK_AUTH_CONFIG_ID;
  }
  if (!getCachedSetting(KEYS.COMPOSIO_DEFAULT_USER_ID)?.trim() && process.env.COMPOSIO_DEFAULT_USER_ID?.trim()) {
    updates.composio_default_user_id = process.env.COMPOSIO_DEFAULT_USER_ID;
  }
  if (!getCachedSetting(KEYS.COMPOSIO_DEFAULT_CONNECTED_ACCOUNT_ID)?.trim() && process.env.COMPOSIO_DEFAULT_CONNECTED_ACCOUNT_ID?.trim()) {
    updates.composio_default_connected_account_id = process.env.COMPOSIO_DEFAULT_CONNECTED_ACCOUNT_ID;
  }
  if (!getCachedSetting(KEYS.COMPOSIO_FACEBOOK_TOOLKIT_VERSION)?.trim() && process.env.COMPOSIO_FACEBOOK_TOOLKIT_VERSION?.trim()) {
    updates.composio_facebook_toolkit_version = process.env.COMPOSIO_FACEBOOK_TOOLKIT_VERSION;
  }
  if (!getCachedSetting(KEYS.COMPOSIO_AUTO_FALLBACK)?.trim() && process.env.COMPOSIO_AUTO_FALLBACK !== undefined) {
    updates.composio_auto_fallback = process.env.COMPOSIO_AUTO_FALLBACK !== 'false';
  }
  if (Object.keys(updates).length === 0) return;
  await saveComposioSettings(updates);
}
