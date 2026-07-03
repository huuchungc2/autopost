import { Check } from 'lucide-react';
import api from '../services/api';
import { formatDateTime } from '../utils/date';
import useNotifications from '../hooks/useNotifications';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';

export default function Notifications() {
  const { notifications, pagination, refresh } = useNotifications();
  const { showToast } = useToast();

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
      <PageHeader
        title="Thông báo"
        description="Toàn bộ thông báo hệ thống."
        actions={(
          <Button type="button" variant="secondary" onClick={markAllRead}>
            Đánh dấu tất cả đã đọc
          </Button>
        )}
      />

      <div className="card">
        <div className="table-wrapper">
          <table className="table table-responsive-cols table-responsive-cols--wide">
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
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => markRead(item.id)}
                        title="Đánh dấu đã đọc"
                      >
                        <Check size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!notifications.length && (
                <tr><td colSpan={5} className="text-muted">Chưa có thông báo nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {pagination.pages > 1 && (
          <div className="pagination-row" style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="secondary" disabled={pagination.page <= 1} onClick={() => refresh(pagination.page - 1)}>
              Trước
            </Button>
            <span>Trang {pagination.page}/{pagination.pages} ({pagination.total} thông báo)</span>
            <Button variant="secondary" disabled={pagination.page >= pagination.pages} onClick={() => refresh(pagination.page + 1)}>
              Sau
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
