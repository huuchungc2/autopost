import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { formatDateTime } from '../utils/date';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../services/authContext';
import { computeMaxImagesPerNight, formatScheduleTime } from '../utils/imageSchedule';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import { invalidateMediaStorageCache } from '../hooks/useMediaStorage';
import GroupExtensionSettings from '../components/GroupExtensionSettings';

const defaultScheduleForm = (schedule) => ({
  enabled: schedule?.enabled ?? false,
  start_hour: schedule?.start_hour ?? 1,
  start_minute: schedule?.start_minute ?? 0,
  end_hour: schedule?.end_hour ?? 5,
  end_minute: schedule?.end_minute ?? 0,
  interval_minutes: schedule?.interval_minutes ?? 10,
});

function timeInputValue(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseTimeInput(value) {
  const [hh, mm] = String(value || '00:00').split(':');
  return {
    hour: Math.min(23, Math.max(0, parseInt(hh, 10) || 0)),
    minute: Math.min(59, Math.max(0, parseInt(mm, 10) || 0)),
  };
}

export default function Settings() {
  // Trang gộp 5 mảng cấu hình không liên quan (tổng quan, extension/license key, Google Drive,
  // Composio, lịch xuất ảnh) thành 1 chuỗi card cuộn dài ~700 dòng — tổ chức lại thành tab để dễ
  // tìm đúng mục cần sửa thay vì cuộn qua hết mọi thứ mỗi lần.
  const [settingsTab, setSettingsTab] = useState('overview');
  const [settings, setSettings] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [imageLogs, setImageLogs] = useState([]);
  const { showToast } = useToast();
  const { user } = useAuth();
  const canEditSchedule = ['super_admin', 'admin'].includes(user?.role);
  const canEditMediaStorage = user?.role === 'super_admin';
  const [mediaForm, setMediaForm] = useState(null);
  const [mediaSaving, setMediaSaving] = useState(false);
  const [mediaTesting, setMediaTesting] = useState(false);
  const [composioForm, setComposioForm] = useState(null);
  const [composioSaving, setComposioSaving] = useState(false);
  const [composioLinking, setComposioLinking] = useState(false);

  useEffect(() => {
    api.get('/settings').then((r) => {
      setSettings(r.data);
      setScheduleForm(defaultScheduleForm(r.data?.config?.image_schedule));
      const drive = r.data?.storage?.google_drive;
      if (drive) {
        setMediaForm({
          media_storage: drive.media_storage || 'local',
          google_drive_folder_id: drive.folder_id || '',
          google_drive_client_id: '',
          google_drive_client_secret: '',
          google_drive_refresh_token: '',
        });
      }
      const composio = r.data?.config?.composio;
      if (composio) {
        setComposioForm({
          composio_api_key: '',
          composio_facebook_auth_config_id: composio.auth_config_id || '',
          composio_default_user_id: composio.default_user_id || '',
          composio_default_connected_account_id: composio.default_connected_account_id || '',
          composio_facebook_toolkit_version: composio.facebook_toolkit_version || '20260616_00',
          composio_auto_fallback: composio.auto_fallback_on_token_error !== false,
        });
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!canEditSchedule) return;
    api.get('/settings/image-schedule/logs', { params: { limit: 30 } })
      .then((r) => setImageLogs(r.data.logs || []))
      .catch(console.error);
  }, [canEditSchedule, scheduleSaving]);

  const maxPerNight = useMemo(() => {
    if (!scheduleForm) return 0;
    return computeMaxImagesPerNight(scheduleForm);
  }, [scheduleForm]);

  const handleScheduleChange = (field, value) => {
    setScheduleForm((prev) => ({ ...prev, [field]: value }));
  };

  const persistImageSchedule = async (nextForm, { toastOnSuccess = true } = {}) => {
    setScheduleSaving(true);
    try {
      const response = await api.put('/settings/image-schedule', nextForm);
      setSettings((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          image_schedule: response.data.image_schedule,
        },
      }));
      setScheduleForm(defaultScheduleForm(response.data.image_schedule));
      if (toastOnSuccess) {
        showToast(
          nextForm.enabled ? 'Đã bật lịch xuất ảnh' : 'Đã tắt lịch xuất ảnh — không tạo ảnh mới theo lịch',
          'success'
        );
      }
      return response.data.image_schedule;
    } catch (err) {
      showToast(err.response?.data?.error || 'Lưu lịch thất bại', 'error');
      throw err;
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleScheduleEnabledChange = async (checked) => {
    const nextForm = { ...scheduleForm, enabled: checked };
    setScheduleForm(nextForm);
    try {
      await persistImageSchedule(nextForm);
    } catch {
      setScheduleForm((prev) => ({ ...prev, enabled: !checked }));
    }
  };

  const handleStartTimeChange = (value) => {
    const { hour, minute } = parseTimeInput(value);
    setScheduleForm((prev) => ({ ...prev, start_hour: hour, start_minute: minute }));
  };

  const handleEndTimeChange = (value) => {
    const { hour, minute } = parseTimeInput(value);
    setScheduleForm((prev) => ({ ...prev, end_hour: hour, end_minute: minute }));
  };

  const saveImageSchedule = async () => {
    try {
      await persistImageSchedule(scheduleForm, { toastOnSuccess: false });
      showToast('Đã lưu lịch xuất ảnh', 'success');
    } catch {
      // toast shown in persistImageSchedule
    }
  };

  const imageSchedule = settings?.config?.image_schedule;
  const pageSchedulesEnabled = settings?.config?.page_image_schedules_enabled || [];
  const driveStatus = settings?.storage?.google_drive;
  const composioStatus = settings?.config?.composio;

  const canTestDrive = useMemo(() => {
    if (!mediaForm) return false;
    const folderId = mediaForm.google_drive_folder_id?.trim();
    const hasNewCredentials = !!(
      mediaForm.google_drive_client_id?.trim()
      && mediaForm.google_drive_client_secret?.trim()
      && mediaForm.google_drive_refresh_token?.trim()
    );
    const hasStored = driveStatus?.has_stored_credentials;
    return !!(folderId && (hasNewCredentials || hasStored) && !folderId.includes('@'));
  }, [mediaForm, driveStatus]);

  const hasComposioApiKey = useMemo(() => {
    if (!composioForm || !composioStatus) return false;
    return !!(composioForm.composio_api_key?.trim() || composioStatus.has_stored_api_key);
  }, [composioForm, composioStatus]);

  const composioMissingLabels = {
    composio_api_key: 'API Key',
    composio_facebook_auth_config_id: 'Auth Config ID',
    composio_default_user_id: 'User ID',
    composio_default_connected_account_id: 'Connected Account ID',
  };

  const handleMediaChange = (field, value) => {
    setMediaForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveMediaStorage = async () => {
    if (!mediaForm) return;
    setMediaSaving(true);
    try {
      const payload = {
        media_storage: mediaForm.media_storage,
        google_drive_folder_id: mediaForm.google_drive_folder_id,
      };
      if (mediaForm.google_drive_client_id?.trim()) {
        payload.google_drive_client_id = mediaForm.google_drive_client_id.trim();
      }
      if (mediaForm.google_drive_client_secret?.trim()) {
        payload.google_drive_client_secret = mediaForm.google_drive_client_secret.trim();
      }
      if (mediaForm.google_drive_refresh_token?.trim()) {
        payload.google_drive_refresh_token = mediaForm.google_drive_refresh_token.trim();
      }
      const response = await api.put('/settings/media-storage', payload);
      setSettings((prev) => ({
        ...prev,
        storage: {
          ...prev.storage,
          media_mode: response.data.media_storage.media_storage,
          images_on_drive: response.data.media_storage.media_storage === 'google_drive',
          google_drive: response.data.media_storage,
        },
      }));
      setMediaForm((prev) => ({
        ...prev,
        media_storage: response.data.media_storage.media_storage,
        google_drive_folder_id: response.data.media_storage.folder_id || '',
        google_drive_client_id: '',
        google_drive_client_secret: '',
        google_drive_refresh_token: '',
      }));
      showToast('Đã lưu cấu hình Google Drive', 'success');
      invalidateMediaStorageCache();
    } catch (err) {
      showToast(err.response?.data?.error || 'Lưu cấu hình thất bại', 'error');
    } finally {
      setMediaSaving(false);
    }
  };

  const testDriveConnection = async () => {
    setMediaTesting(true);
    try {
      const payload = {
        google_drive_folder_id: mediaForm?.google_drive_folder_id?.trim(),
      };
      if (mediaForm?.google_drive_client_id?.trim()) payload.google_drive_client_id = mediaForm.google_drive_client_id.trim();
      if (mediaForm?.google_drive_client_secret?.trim()) payload.google_drive_client_secret = mediaForm.google_drive_client_secret.trim();
      if (mediaForm?.google_drive_refresh_token?.trim()) payload.google_drive_refresh_token = mediaForm.google_drive_refresh_token.trim();
      const response = await api.post('/settings/media-storage/test', payload);
      const name = response.data?.folder?.folder_name || response.data?.folder?.folder_id;
      showToast(`Kết nối Drive OK — folder: ${name}`, 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Kiểm tra Drive thất bại', 'error');
    } finally {
      setMediaTesting(false);
    }
  };

  const handleComposioChange = (field, value) => {
    setComposioForm((prev) => ({ ...prev, [field]: value }));
  };

  // BUG NGHIÊM TRỌNG đã sửa: 3 trường auth_config_id/user_id/connected_account_id trước đây LUÔN
  // được gửi trong payload (kể cả khi rỗng) — khác hẳn composio_api_key vốn chỉ gửi khi có giá trị
  // (để "để trống = giữ nguyên"). Backend (saveComposioSettings, appSettingsService.js) coi field
  // rỗng là lệnh XOÁ hẳn key đó khỏi app_settings (DELETE). Nếu vì bất kỳ lý do gì composioForm bị
  // rỗng lúc mở trang (vd load trước khi GET /settings trả về xong, hoặc F5 giữa chừng) rồi user
  // bấm "Lưu vào database" — 3 giá trị đã lưu trước đó bị XOÁ SẠCH ngay lập tức, dù chỉ định lưu
  // composio_facebook_toolkit_version/composio_auto_fallback thôi cũng dính theo. Đây rất có thể là
  // nguyên nhân thật của "đã cấu hình rồi mà giờ báo chưa" — không phải backend quên, mà bị chính 1
  // lần Lưu trước đó xoá mất. Giờ 3 trường này chỉ gửi khi có giá trị, giống hệt composio_api_key.
  const saveComposioSettings = async () => {
    if (!composioForm) return;
    setComposioSaving(true);
    try {
      const payload = {
        composio_facebook_toolkit_version: composioForm.composio_facebook_toolkit_version,
        composio_auto_fallback: composioForm.composio_auto_fallback,
      };
      if (composioForm.composio_api_key?.trim()) {
        payload.composio_api_key = composioForm.composio_api_key.trim();
      }
      if (composioForm.composio_facebook_auth_config_id?.trim()) {
        payload.composio_facebook_auth_config_id = composioForm.composio_facebook_auth_config_id.trim();
      }
      if (composioForm.composio_default_user_id?.trim()) {
        payload.composio_default_user_id = composioForm.composio_default_user_id.trim();
      }
      if (composioForm.composio_default_connected_account_id?.trim()) {
        payload.composio_default_connected_account_id = composioForm.composio_default_connected_account_id.trim();
      }
      const response = await api.put('/settings/composio', payload);
      setSettings((prev) => ({
        ...prev,
        config: { ...prev.config, composio: response.data.composio },
      }));
      setComposioForm((prev) => ({
        ...prev,
        composio_api_key: '',
        composio_facebook_auth_config_id: response.data.composio.auth_config_id || '',
        composio_default_user_id: response.data.composio.default_user_id || '',
        composio_default_connected_account_id: response.data.composio.default_connected_account_id || '',
        composio_facebook_toolkit_version: response.data.composio.facebook_toolkit_version || prev.composio_facebook_toolkit_version,
        composio_auto_fallback: response.data.composio.auto_fallback_on_token_error !== false,
      }));
      showToast('Đã lưu cấu hình Composio', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Lưu Composio thất bại', 'error');
    } finally {
      setComposioSaving(false);
    }
  };

  const createComposioConnectLink = async () => {
    setComposioLinking(true);
    try {
      const response = await api.post('/settings/composio/connect-link', {
        composio_default_user_id: composioForm?.composio_default_user_id,
      });
      const url = response.data?.redirect_url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        showToast('Đã mở tab Composio — đăng nhập Facebook xong thì bấm «Kiểm tra kết nối»', 'success');
      }
      if (response.data?.connected_account_id) {
        handleComposioChange('composio_default_connected_account_id', response.data.connected_account_id);
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Tạo link Composio thất bại', 'error');
    } finally {
      setComposioLinking(false);
    }
  };

  const refreshComposioStatus = async () => {
    try {
      const response = await api.get('/settings/composio');
      const composio = response.data.composio;
      setSettings((prev) => ({
        ...prev,
        config: { ...prev.config, composio },
      }));
      setComposioForm((prev) => prev ? ({
        ...prev,
        composio_facebook_auth_config_id: composio.auth_config_id || '',
        composio_default_user_id: composio.default_user_id || '',
        composio_default_connected_account_id: composio.default_connected_account_id || '',
        composio_facebook_toolkit_version: composio.facebook_toolkit_version || prev.composio_facebook_toolkit_version,
        composio_auto_fallback: composio.auto_fallback_on_token_error !== false,
      }) : prev);

      if (!composio.configured) {
        const missing = (composio.missing_fields || [])
          .map((f) => composioMissingLabels[f] || f)
          .join(', ');
        showToast(missing ? `Chưa đủ cấu hình — thiếu: ${missing}` : 'Chưa đủ cấu hình Composio', 'error');
        return;
      }
      if (composio.connection?.error) {
        showToast(`Composio lỗi: ${composio.connection.error}`, 'error');
        return;
      }
      const status = composio.connection?.status;
      if (status === 'ACTIVE') {
        showToast('Kết nối Facebook: ACTIVE — sẵn sàng đồng bộ token fanpage', 'success');
      } else if (status) {
        showToast(`Kết nối Facebook: ${status} — bấm «Đăng nhập Facebook qua Composio»`, 'error');
      } else {
        showToast('Đã tải cấu hình — chưa kiểm tra được trạng thái ca_...', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được Composio', 'error');
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Cài đặt"
        description="Cấu hình hệ thống."
      />

      <div className="tabs">
        <button type="button" className={settingsTab === 'overview' ? 'tab active' : 'tab'} onClick={() => setSettingsTab('overview')}>Tổng quan</button>
        <button type="button" className={settingsTab === 'extension' ? 'tab active' : 'tab'} onClick={() => setSettingsTab('extension')}>Extension</button>
        <button type="button" className={settingsTab === 'drive' ? 'tab active' : 'tab'} onClick={() => setSettingsTab('drive')}>Lưu trữ ảnh (Drive)</button>
        <button type="button" className={settingsTab === 'composio' ? 'tab active' : 'tab'} onClick={() => setSettingsTab('composio')}>Facebook Token</button>
        <button type="button" className={settingsTab === 'schedule' ? 'tab active' : 'tab'} onClick={() => setSettingsTab('schedule')}>Lịch xuất ảnh</button>
      </div>

      {settingsTab === 'overview' && settings && (
        <div className="dashboard-grid">
          <div className="card card-stat">
            <h3>Lưu trữ ảnh</h3>
            <p>{settings.storage.images_on_drive ? 'Google Drive' : 'VPS (local)'}</p>
            <small>
              {settings.storage.images_on_drive
                ? 'Ảnh AI lưu Drive — đăng FB tải từ Drive'
                : (settings.storage.media_mode || 'local')}
            </small>
          </div>
          <div className="card card-stat">
            <h3>Lưu trữ ảnh (VPS)</h3>
            <p>{settings.storage.images.usedMb} MB ({settings.storage.images.percent}%)</p>
            <small>
              {settings.storage.images_on_drive
                ? 'Chỉ cache tạm khi đăng FB'
                : `Tối đa ${settings.config.max_images_mb} MB`}
            </small>
          </div>
          <div className="card card-stat">
            <h3>Lưu trữ video</h3>
            <p>{settings.storage.videos.usedMb} MB ({settings.storage.videos.percent}%)</p>
            <small>Tối đa {settings.config.max_videos_mb} MB</small>
          </div>
          <div className="card card-stat">
            <h3>Scheduler</h3>
            <p>{settings.config.scheduler_enabled ? 'Bật' : 'Tắt'}</p>
            <small>Cron đăng bài & xuất ảnh</small>
          </div>
          {composioStatus && (
            <div className="card card-stat">
              <h3>Composio FB</h3>
              <p>{composioStatus.configured ? 'Đã cấu hình' : 'Chưa cấu hình'}</p>
              <small>
                {composioStatus.connection?.status
                  ? `Connection: ${composioStatus.connection.status}`
                  : (composioStatus.auto_fallback_on_token_error ? 'Auto-fallback bật' : 'Auto-fallback tắt')}
              </small>
            </div>
          )}
        </div>
      )}

      {settingsTab === 'extension' && <GroupExtensionSettings />}

      {settingsTab === 'drive' && driveStatus && mediaForm && (
        <div className="card settings-media-storage">
          <div className="settings-section-header">
            <div>
              <h3>Google Drive — lưu &amp; đăng ảnh</h3>
              <p className="field-hint">
                AutoPost dùng <strong>OAuth2 User Authentication</strong> để upload ảnh lên Google Drive của bạn.
                Ảnh lưu dạng <code>gdrive://FILE_ID</code>. Khi đăng Facebook, server tải từ Drive rồi upload Graph API.
              </p>
            </div>
            <span className={`badge ${driveStatus.drive_configured ? 'badge-published' : 'badge-default'}`}>
              {driveStatus.drive_configured ? 'Drive đã cấu hình' : 'Chưa cấu hình'}
            </span>
          </div>

          <div className="settings-drive-status" style={{ marginBottom: 16 }}>
            <p className="field-hint">
              Chế độ hiện tại: <strong>{driveStatus.media_storage === 'google_drive' ? 'Google Drive' : 'VPS local'}</strong>
              {driveStatus.has_stored_credentials && driveStatus.client_id_preview && (
                <> — Client ID: <code>{driveStatus.client_id_preview}</code></>
              )}
              {driveStatus.has_stored_credentials && (
                <> (credentials: database)</>
              )}
              {driveStatus.folder_id_source && (
                <> — Folder: {driveStatus.folder_id_source}</>
              )}
            </p>
          </div>

          {canEditMediaStorage ? (
            <>
              <div className="settings-schedule-grid">
                <label>
                  Nơi lưu ảnh
                  <select
                    value={mediaForm.media_storage}
                    onChange={(e) => handleMediaChange('media_storage', e.target.value)}
                  >
                    <option value="google_drive">Google Drive (khuyến nghị)</option>
                    <option value="local">VPS local</option>
                  </select>
                </label>
                <label>
                  Google Drive Folder ID
                  <input
                    type="text"
                    placeholder="1AbCdEf... (từ URL folder, không phải email)"
                    value={mediaForm.google_drive_folder_id}
                    onChange={(e) => handleMediaChange('google_drive_folder_id', e.target.value)}
                  />
                </label>
              </div>

              <div className="settings-schedule-grid" style={{ marginTop: 12 }}>
                <label>
                  Client ID
                  <input
                    type="text"
                    placeholder={driveStatus.has_stored_credentials ? 'Để trống để giữ nguyên' : 'xxx.apps.googleusercontent.com'}
                    value={mediaForm.google_drive_client_id}
                    onChange={(e) => handleMediaChange('google_drive_client_id', e.target.value)}
                  />
                </label>
                <label>
                  Client Secret
                  <input
                    type="password"
                    placeholder={driveStatus.has_stored_credentials ? 'Để trống để giữ nguyên' : 'GOCSPX-...'}
                    value={mediaForm.google_drive_client_secret}
                    onChange={(e) => handleMediaChange('google_drive_client_secret', e.target.value)}
                  />
                </label>
              </div>
              <label style={{ display: 'block', marginTop: 12 }}>
                Refresh Token
                <input
                  type="password"
                  placeholder={driveStatus.has_stored_credentials ? 'Để trống để giữ nguyên' : '1//0g...'}
                  value={mediaForm.google_drive_refresh_token}
                  onChange={(e) => handleMediaChange('google_drive_refresh_token', e.target.value)}
                />
              </label>

              <p className="field-hint" style={{ marginTop: 8 }}>
                1) Google Cloud Console → Credentials → OAuth 2.0 Client ID (Desktop app) → copy Client ID &amp; Secret.
                2) Dùng OAuth Playground hoặc script lấy Refresh Token với scope <code>https://www.googleapis.com/auth/drive</code>.
                3) Copy Folder ID từ URL Drive (<code>drive.google.com/.../folders/<strong>ID_Ở_ĐÂY</strong></code>).
                4) Điền đủ 3 trường + Folder ID → <strong>Kiểm tra kết nối</strong> → Lưu.
                {' '}Mỗi fanpage có thể gán folder riêng tại <strong>Fanpage → Sửa</strong>.
              </p>

              <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                <Button type="button" onClick={saveMediaStorage} disabled={mediaSaving}>
                  {mediaSaving ? 'Đang lưu...' : 'Lưu cấu hình Drive'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={testDriveConnection}
                  disabled={mediaTesting || !canTestDrive}
                >
                  {mediaTesting ? 'Đang kiểm tra...' : 'Kiểm tra kết nối Drive'}
                </Button>
              </div>
              {!canTestDrive && mediaForm.media_storage === 'google_drive' && (
                <p className="field-hint field-hint--warn" style={{ marginTop: 8 }}>
                  Cần Folder ID hợp lệ + OAuth2 credentials (điền mới hoặc đã lưu trước đó).
                </p>
              )}
            </>
          ) : (
            <p className="field-hint">Chỉ super admin mới chỉnh cấu hình Google Drive.</p>
          )}
        </div>
      )}

      {settingsTab === 'composio' && composioStatus && composioForm && (
        <div className="card settings-composio">
          <div className="settings-section-header">
            <div>
              <h3>Composio — token Facebook</h3>
              <p className="field-hint">
                Cấu hình lưu <strong>database</strong>. Khi đăng bài, server đọc token từng fanpage trong DB
                (manual hoặc Composio theo <code>token_source</code>), dùng API key + ID ở đây để gọi Composio khi cần.
                Lưu xong → vào <strong>Fanpage → Đồng bộ token Composio</strong> cho từng page.
              </p>
            </div>
            <span className={`badge ${composioStatus.configured ? 'badge-published' : 'badge-default'}`}>
              {composioStatus.configured ? 'Đã cấu hình' : 'Chưa cấu hình'}
            </span>
          </div>

          {composioStatus.missing_fields?.length > 0 && !composioStatus.configured && (
            <p className="field-hint field-hint--warn" style={{ marginBottom: 12 }}>
              Thiếu: {composioStatus.missing_fields.map((f) => composioMissingLabels[f] || f).join(', ')}.
              Điền đủ rồi bấm <strong>Lưu vào database</strong>.
            </p>
          )}

          {composioStatus.api_key_preview && (
            <p className="field-hint" style={{ marginBottom: 12 }}>
              API key: <code>{composioStatus.api_key_preview}</code>
              {composioStatus.api_key_source && <> ({composioStatus.api_key_source})</>}
              {composioStatus.connection?.error && (
                <span className="field-hint field-hint--warn" style={{ display: 'block' }}>
                  Lỗi kiểm tra: {composioStatus.connection.error}
                </span>
              )}
              {composioStatus.connection?.status && (
                <> — Kết nối FB: <strong>{composioStatus.connection.status}</strong>
                  {composioStatus.connection.is_active ? ' (OK)' : ' (chưa sẵn sàng)'}
                </>
              )}
            </p>
          )}

          {canEditMediaStorage ? (
            <>
              <div className="settings-schedule-grid">
                <label>
                  Composio API Key
                  <input
                    type="password"
                    placeholder={composioStatus.has_stored_api_key ? 'Để trống = giữ key hiện tại' : 'ak_...'}
                    value={composioForm.composio_api_key}
                    onChange={(e) => handleComposioChange('composio_api_key', e.target.value)}
                  />
                </label>
                <label>
                  Auth Config ID
                  <input
                    value={composioForm.composio_facebook_auth_config_id}
                    onChange={(e) => handleComposioChange('composio_facebook_auth_config_id', e.target.value)}
                    placeholder="ac_..."
                  />
                </label>
                <label>
                  User ID
                  <input
                    value={composioForm.composio_default_user_id}
                    onChange={(e) => handleComposioChange('composio_default_user_id', e.target.value)}
                  />
                </label>
                <label>
                  Connected Account ID
                  <input
                    value={composioForm.composio_default_connected_account_id}
                    onChange={(e) => handleComposioChange('composio_default_connected_account_id', e.target.value)}
                    placeholder="ca_..."
                  />
                </label>
              </div>

              <label className="page-skill-option" style={{ marginTop: 12 }}>
                <input
                  type="checkbox"
                  checked={composioForm.composio_auto_fallback}
                  onChange={(e) => handleComposioChange('composio_auto_fallback', e.target.checked)}
                />
                <span>Tự chuyển token khi đăng lỗi (manual ↔ Composio trên từng fanpage)</span>
              </label>

              <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                <Button type="button" onClick={saveComposioSettings} disabled={composioSaving}>
                  {composioSaving ? 'Đang lưu...' : 'Lưu vào database'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={createComposioConnectLink}
                  disabled={composioLinking || !hasComposioApiKey}
                  title="Chỉ cần khi chưa có Connected Account hoặc kết nối hết hạn"
                >
                  {composioLinking ? 'Đang mở tab...' : 'Đăng nhập Facebook qua Composio'}
                </Button>
                <Button type="button" variant="secondary" onClick={refreshComposioStatus}>
                  Kiểm tra kết nối
                </Button>
              </div>
              <p className="field-hint" style={{ marginTop: 10 }}>
                <strong>Lưu vào database</strong> — ghi API key và ID; đăng bài đọc từ đây.
                {' '}<strong>Đăng nhập Facebook qua Composio</strong> — mở tab cấp quyền FB (lần đầu hoặc token hết hạn).
                {' '}<strong>Kiểm tra kết nối</strong> — hỏi Composio xem <code>ca_...</code> còn ACTIVE không.
              </p>
            </>
          ) : (
            <p className="field-hint">Chỉ super admin mới chỉnh cấu hình Composio.</p>
          )}
        </div>
      )}

      {settingsTab === 'schedule' && imageSchedule && scheduleForm && (
        <div className="card settings-image-schedule">
          <div className="settings-section-header">
            <div>
              <h3>Lịch xuất ảnh AI</h3>
              <p className="field-hint">
                Lịch riêng của bạn — chỉ xuất ảnh bài thuộc{' '}
                <strong>{imageSchedule.page_count ?? 0} fanpage được gán</strong>
                {' '}(fanpage chưa bật lịch riêng tại Fanpage → Sửa).
                Mỗi fanpage dùng AI provider ảnh của chính fanpage đó. Giờ Việt Nam ({imageSchedule.timezone}).
                {' '}Bật/tắt được lưu ngay; giờ/cách nhau cần bấm Lưu bên dưới.
              </p>
            </div>
            <label className="page-skill-option settings-toggle">
              <input
                type="checkbox"
                checked={scheduleForm.enabled}
                onChange={(e) => handleScheduleEnabledChange(e.target.checked)}
                disabled={!canEditSchedule || scheduleSaving}
              />
              <span>{scheduleForm.enabled ? 'Đang bật' : 'Đang tắt'}</span>
            </label>
          </div>

          {canEditSchedule && !scheduleForm.enabled && pageSchedulesEnabled.length > 0 && (
            <p className="field-hint field-hint--warn" style={{ marginBottom: 12 }}>
              Lịch admin đã tắt, nhưng {pageSchedulesEnabled.length} fanpage vẫn bật lịch riêng:{' '}
              {pageSchedulesEnabled.map((p) => p.name).join(', ')}. Vào Fanpage → Sửa để tắt.
            </p>
          )}

          {canEditSchedule && imageSchedule.page_count === 0 && scheduleForm.enabled && (
            <p className="field-hint field-hint--warn" style={{ marginBottom: 12 }}>
              Bạn chưa được gán fanpage nào — lịch bật cũng không chạy. Liên hệ super admin gán fanpage trước.
            </p>
          )}

          <div className="settings-schedule-grid">
            <label>
              Từ
              <input
                type="time"
                value={timeInputValue(scheduleForm.start_hour, scheduleForm.start_minute)}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                disabled={!canEditSchedule}
              />
            </label>
            <label>
              Đến (không gồm giờ kết thúc)
              <input
                type="time"
                value={timeInputValue(scheduleForm.end_hour, scheduleForm.end_minute)}
                onChange={(e) => handleEndTimeChange(e.target.value)}
                disabled={!canEditSchedule}
              />
            </label>
            <label>
              Cách nhau (phút)
              <input
                type="number"
                min={1}
                max={1440}
                value={scheduleForm.interval_minutes}
                onChange={(e) => handleScheduleChange('interval_minutes', parseInt(e.target.value, 10) || 1)}
                disabled={!canEditSchedule}
              />
            </label>
          </div>

          <div className="settings-schedule-summary">
            <strong>
              Tối đa ~{maxPerNight} ảnh/đêm
            </strong>
            <span className="field-hint">
              {formatScheduleTime(scheduleForm.start_hour, scheduleForm.start_minute)}
              {' → '}
              {formatScheduleTime(scheduleForm.end_hour, scheduleForm.end_minute)}
              , mỗi {scheduleForm.interval_minutes} phút 1 ảnh
              {scheduleForm.start_hour === 1 && scheduleForm.end_hour === 5 && scheduleForm.interval_minutes === 10
                ? ' (vd: 1:00–5:00, 10 phút = 24 ảnh)'
                : null}
            </span>
          </div>

          {canEditSchedule ? (
            <Button
              type="button"
              onClick={saveImageSchedule}
              disabled={scheduleSaving}
            >
              {scheduleSaving ? 'Đang lưu...' : 'Lưu lịch xuất ảnh'}
            </Button>
          ) : (
            <p className="field-hint">Chỉ admin mới chỉnh lịch xuất ảnh.</p>
          )}

          {canEditSchedule && imageLogs.length > 0 && (
            <div className="settings-image-logs" style={{ marginTop: 20 }}>
              <h4 className="modal-section-title">Log job xuất ảnh gần đây</h4>
              <div className="table-wrapper">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Bài</th>
                      <th>Nguồn</th>
                      <th>Trạng thái</th>
                      <th>Lỗi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imageLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDateTime(log.created_at)}</td>
                        <td>#{log.post_id} {log.topic ? `— ${log.topic.slice(0, 30)}` : ''}</td>
                        <td>{log.source}</td>
                        <td>{log.status}</td>
                        <td>{log.error_message || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
