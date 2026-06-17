import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import BulkScheduleForm from '../components/BulkScheduleForm';
import { useToast } from '../context/ToastContext';

const SCHEDULABLE = new Set(['draft', 'pending_approval']);

export default function BulkSchedule() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const idsParam = searchParams.get('ids') || '';
  const pageFilter = searchParams.get('page') || '';
  const selectedIds = useMemo(
    () => idsParam.split(',').map((id) => Number(id)).filter(Boolean),
    [idsParam]
  );

  useEffect(() => {
    const params = new URLSearchParams();
    if (pageFilter) params.set('page', pageFilter);
    params.set('limit', '200');
    api.get(`/posts?${params}`)
      .then((response) => setPosts(response.data.items || []))
      .catch((err) => showToast(err.response?.data?.error || 'Không tải được danh sách bài', 'error'))
      .finally(() => setLoading(false));
  }, [pageFilter, showToast]);

  const schedulablePosts = useMemo(
    () => posts.filter((p) => SCHEDULABLE.has(p.status)),
    [posts]
  );

  const targetIds = selectedIds.length
    ? selectedIds.filter((id) => schedulablePosts.some((p) => p.id === id))
    : schedulablePosts.map((p) => p.id);

  const handleSubmit = async ({ start_date, times }) => {
    setSaving(true);
    try {
      const payload = {
        start_date,
        times,
        page_id: pageFilter ? Number(pageFilter) : undefined,
      };
      if (selectedIds.length) payload.post_ids = targetIds;
      const response = await api.post('/posts/bulk-schedule', payload);
      showToast(
        `Đã lên lịch ${response.data.scheduled_count} bài — ${response.data.days} ngày × ${response.data.slots_per_day} bài/ngày`,
        'success'
      );
      navigate('/posts');
    } catch (err) {
      showToast(err.response?.data?.error || 'Lên lịch hàng loạt thất bại', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell post-editor-page">
      <div className="page-header post-editor-page-header">
        <button type="button" className="btn btn-secondary post-editor-back-btn" onClick={() => navigate('/posts')}>
          <ArrowLeft size={18} />
          Quay lại
        </button>
        <div>
          <h1><CalendarClock size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />Lên lịch hàng loạt</h1>
          <p>
            Chọn giờ đăng mỗi ngày — hệ thống tự chia <strong>{targetIds.length}</strong> bài theo thứ tự
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">Đang tải...</p>
      ) : targetIds.length === 0 ? (
        <div className="card form-card">
          <p className="text-muted">Không có bài nào có thể lên lịch (chỉ bài nháp hoặc chờ duyệt).</p>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/posts')}>Quay lại danh sách</button>
        </div>
      ) : (
        <BulkScheduleForm
          postCount={targetIds.length}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/posts')}
          saving={saving}
        />
      )}
    </div>
  );
}
