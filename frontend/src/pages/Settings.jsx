import { useEffect, useState } from 'react';
import api from '../services/api';
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
      showToast('All notifications marked read', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed', 'error');
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
          <h1>Settings</h1>
          <p>System configuration and notifications.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={markAllRead}>Mark all read</button>
      </div>

      {settings && (
        <div className="dashboard-grid">
          <div className="card card-stat">
            <h3>Image storage</h3>
            <p>{settings.storage.images.usedMb} MB ({settings.storage.images.percent}%)</p>
            <small>Max {settings.config.max_images_mb} MB</small>
          </div>
          <div className="card card-stat">
            <h3>Video storage</h3>
            <p>{settings.storage.videos.usedMb} MB ({settings.storage.videos.percent}%)</p>
            <small>Max {settings.config.max_videos_mb} MB</small>
          </div>
          <div className="card card-stat">
            <h3>Auto generate</h3>
            <p>{settings.config.auto_generate_hour}:{settings.config.auto_generate_minute}</p>
            <small>Scheduler {settings.config.scheduler_enabled ? 'ON' : 'OFF'}</small>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 24 }}>
        <h3>Notifications</h3>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Title</th><th>Message</th><th>Action</th></tr>
            </thead>
            <tbody>
              {notifications.map((item) => (
                <tr key={item.id} className={item.is_read ? 'row-read' : ''}>
                  <td>{new Date(item.created_at).toLocaleString()}</td>
                  <td>{item.type}</td>
                  <td>{item.title}</td>
                  <td>{item.message}</td>
                  <td>
                    {!item.is_read && (
                      <button type="button" className="btn-link" onClick={() => markRead(item.id)}>Mark read</button>
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
