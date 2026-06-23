import { useEffect, useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import BulkScheduleForm from '../components/BulkScheduleForm';
import { useToast } from '../context/ToastContext';
import { postsListPath } from '../utils/postsListState';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';

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

  const returnToPosts = () => navigate(postsListPath(searchParams));

  useEffect(() => {
    const params = new URLSearchParams();
    if (pageFilter) params.set('page', pageFilter);
    params.set('limit', '200');
    setLoading(true);
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
      returnToPosts();
    } catch (err) {
      showToast(err.response?.data?.error || 'Lên lịch hàng loạt thất bại', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell post-editor-page">
      <PageHeader
        back={{
          onClick: returnToPosts,
          label: 'Quay lại',
          ariaLabel: 'Quay lại danh sách bài viết',
        }}
        title={(
          <>
            <CalendarClock size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Lên lịch hàng loạt
          </>
        )}
        description={(
          <>
            Chọn giờ đăng mỗi ngày — hệ thống tự chia <strong>{targetIds.length}</strong> bài theo thứ tự
          </>
        )}
      />

      {loading ? (
        <p className="text-muted">Đang tải...</p>
      ) : targetIds.length === 0 ? (
        <div className="card form-card">
          <p className="text-muted">Không có bài nào có thể lên lịch (chỉ bài nháp hoặc chờ duyệt).</p>
          <Button type="button" variant="secondary" onClick={returnToPosts}>Quay lại danh sách</Button>
        </div>
      ) : (
        <BulkScheduleForm
          postCount={targetIds.length}
          onSubmit={handleSubmit}
          onCancel={returnToPosts}
          saving={saving}
        />
      )}
    </div>
  );
}
