import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = () => {
    api.get('/notifications').then((res) => setItems(res.data)).catch(() => setItems([]));
  };

  useEffect(() => {
    load();
    window.addEventListener('notificationsUpdated', load);
    return () => window.removeEventListener('notificationsUpdated', load);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const unread = items.filter((i) => !i.is_read).length;

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    load();
    window.dispatchEvent(new Event('notificationsUpdated'));
  };

  return (
    <div className="notification-dropdown" ref={ref}>
      <button type="button" className="header-icon-btn" onClick={() => setOpen(!open)}>
        🔔{unread > 0 ? ` (${unread})` : ''}
      </button>
      {open && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <strong>Notifications</strong>
            <button type="button" className="btn-link" onClick={() => { navigate('/settings'); setOpen(false); }}>View all</button>
          </div>
          {items.slice(0, 8).map((item) => (
            <div key={item.id} className={`notification-item ${item.is_read ? 'read' : ''}`}>
              <div className="notification-item-title">{item.title}</div>
              <div className="notification-item-msg">{item.message}</div>
              {!item.is_read && (
                <button type="button" className="btn-link" onClick={() => markRead(item.id)}>Mark read</button>
              )}
            </div>
          ))}
          {!items.length && <div className="notification-empty">No notifications</div>}
        </div>
      )}
    </div>
  );
}
