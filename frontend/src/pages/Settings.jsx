import { useEffect, useState } from 'react';
import api from '../services/api';
import { formatDateTime } from '../utils/date';
import useNotifications from '../hooks/useNotifications';
import { useToast } from '../context/ToastContext';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const { notifications, refresh } = useNotifications();
  const { showToast } = useToast();

  useEffect(() => {
    api.get('/settings').then((r) => setSettings(r.data)).catch(console.error);
  }, []);

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

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Cài đặt</h1>
          <p>Cấu hình hệ thống và thông báo.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={markAllRead}>Đánh dấu tất cả đã đọc</button>
      </div>

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
            <h3>Tự động tạo bài</h3>
            <p>{settings.config.auto_generate_hour}:{String(settings.config.auto_generate_minute).padStart(2, '0')}</p>
            <small>Lịch chạy: {settings.config.scheduler_enabled ? 'Bật' : 'Tắt'}</small>
          </div>
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
                      <button type="button" className="btn-link" onClick={() => markRead(item.id)}>Đánh dấu đã đọc</button>
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
