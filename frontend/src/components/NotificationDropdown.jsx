import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
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
      <button
        type="button"
        className="header-icon-btn notification-trigger"
        onClick={() => setOpen(!open)}
        aria-label={`Thông báo${unread > 0 ? `, ${unread} chưa đọc` : ''}`}
      >
        <Bell size={20} strokeWidth={2} />
        {unread > 0 && <span className="notification-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <strong>Thông báo</strong>
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                navigate('/notifications');
                setOpen(false);
              }}
            >
              Xem tất cả
            </button>
          </div>
          {items.slice(0, 8).map((item) => (
            <div key={item.id} className={`notification-item ${item.is_read ? 'read' : ''}`}>
              <div className="notification-item-title">{item.title}</div>
              <div className="notification-item-msg">{item.message}</div>
              {!item.is_read && (
                <button type="button" className="btn-link" onClick={() => markRead(item.id)}>
                  Đánh dấu đã đọc
                </button>
              )}
            </div>
          ))}
          {!items.length && <div className="notification-empty">Chưa có thông báo</div>}
        </div>
      )}
    </div>
  );
}
