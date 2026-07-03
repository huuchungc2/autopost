import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';

// GET /notifications giờ phân trang (trước LIMIT 50 cứng, không xem lại được thông báo cũ hơn) —
// response đổi từ mảng phẳng sang { data, pagination }. `refresh(page)` mặc định page 1 để không
// phá vỡ chỗ gọi cũ (badge chuông header — NotificationDropdown.jsx tự gọi API riêng, không dùng
// hook này, chỉ cần cập nhật đọc `res.data.data`).
export default function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (page = 1) => {
    try {
      const response = await api.get('/notifications', { params: { page, limit: 50 } });
      setNotifications(response.data.data || []);
      setPagination(response.data.pagination || { page: 1, pages: 1, total: 0 });
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // refresh() nhận `page` làm tham số — không truyền thẳng refresh cho addEventListener nữa (sẽ
    // vô tình nhận Event object làm `page` đầu tiên), bọc qua 1 hàm gọi refresh() không tham số.
    const onUpdated = () => refresh();
    refresh();
    window.addEventListener('notificationsUpdated', onUpdated);
    return () => window.removeEventListener('notificationsUpdated', onUpdated);
  }, [refresh]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return { notifications, pagination, unreadCount, loading, refresh };
}
