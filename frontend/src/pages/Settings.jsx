import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { formatDateTime } from '../utils/date';
import useNotifications from '../hooks/useNotifications';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../services/authContext';
import { computeMaxImagesPerNight, formatScheduleTime } from '../utils/imageSchedule';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';

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
  const [settings, setSettings] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [imageLogs, setImageLogs] = useState([]);
  const { notifications, refresh } = useNotifications();
  const { showToast } = useToast();
  const { user } = useAuth();
  const canEditSchedule = ['super_admin', 'admin'].includes(user?.role);

  useEffect(() => {
    api.get('/settings').then((r) => {
      setSettings(r.data);
      setScheduleForm(defaultScheduleForm(r.data?.config?.image_schedule));
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

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      refresh();
      window.dispatchEvent(new Event('notificationsUpdated'));
      showToast('Đã đánh dấu tất cả thông báo đã đọc', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Thao tác thất bại', 'error');
    }
  };

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    refresh();
    window.dispatchEvent(new Event('notificationsUpdated'));
  };

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

  return (
    <div className="page-shell">
      <PageHeader
        title="Cài đặt"
        description="Cấu hình hệ thống và thông báo."
        actions={(
          <Button type="button" variant="secondary" onClick={markAllRead}>
            Đánh dấu tất cả đã đọc
          </Button>
        )}
      />

      {settings && (
        <div className="dashboard-grid">
          <div className="card card-stat">
            <h3>Lưu trữ ảnh</h3>
            <p>{settings.storage.images_on_drive ? 'Google Drive' : 'VPS (local)'}</p>
            <small>{settings.storage.media_mode || 'local'}</small>
          </div>
          <div className="card card-stat">
            <h3>Lưu trữ ảnh (VPS)</h3>
            <p>{settings.storage.images.usedMb} MB ({settings.storage.images.percent}%)</p>
            <small>Tối đa {settings.config.max_images_mb} MB</small>
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
        </div>
      )}

      {imageSchedule && scheduleForm && (
        <div className="card settings-image-schedule" style={{ marginTop: 24 }}>
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

      <div className="card" style={{ marginTop: 24 }}>
        <h3>Thông báo</h3>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Thời gian</th><th>Loại</th><th>Tiêu đề</th><th>Nội dung</th><th>Thao tác</th></tr>
            </thead>
            <tbody>
              {notifications.map((item) => (
                <tr key={item.id} className={item.is_read ? 'row-read' : ''}>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td>{item.type}</td>
                  <td>{item.title}</td>
                  <td>{item.message}</td>
                  <td>
                    {!item.is_read && (
                      <Button type="button" variant="link" onClick={() => markRead(item.id)}>Đánh dấu đã đọc</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
