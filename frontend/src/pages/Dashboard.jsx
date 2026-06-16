import { useEffect, useState } from 'react';
import api from '../services/api';
import Calendar from '../components/Calendar';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/authContext';
import { compareApiDates, formatDateTime } from '../utils/date';

const STATUS_LABELS = {
  draft: 'Nháp',
  pending_approval: 'Chờ duyệt',
  scheduled: 'Đã lên lịch',
  published: 'Đã đăng',
  failed: 'Lỗi',
};

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [stats, setStats] = useState(null);
  const [posts, setPosts] = useState([]);
  const [filterDate, setFilterDate] = useState('');
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading || !user) return;

    async function load() {
      setLoadError('');
      try {
        const requests = [
          { key: 'posts', promise: api.get('/posts') },
          { key: 'pages', promise: api.get('/pages') },
          { key: 'providers', promise: api.get('/providers') },
        ];
        if (isSuperAdmin) {
          requests.push({ key: 'users', promise: api.get('/users') });
        }

        const results = await Promise.allSettled(requests.map((item) => item.promise));
        const errors = [];

        const getData = (index, label) => {
          const result = results[index];
          if (result.status === 'fulfilled') return result.value.data;
          errors.push(label);
          return [];
        };

        const postsData = getData(0, 'bài viết');
        const pagesData = getData(1, 'fanpage');
        const providersData = getData(2, 'provider');
        const usersData = isSuperAdmin ? getData(3, 'người dùng') : null;

        setPosts(Array.isArray(postsData) ? postsData : []);
        const byStatus = (Array.isArray(postsData) ? postsData : []).reduce((acc, p) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        }, {});

        setStats({
          posts: Array.isArray(postsData) ? postsData.length : 0,
          pages: Array.isArray(pagesData) ? pagesData.length : 0,
          providers: Array.isArray(providersData) ? providersData.length : 0,
          users: isSuperAdmin && Array.isArray(usersData) ? usersData.length : null,
          byStatus,
        });

        if (errors.length) {
          setLoadError(`Không tải được: ${errors.join(', ')}. Các số liệu còn lại vẫn hiển thị bên dưới.`);
        }
      } catch (error) {
        console.error(error);
        setLoadError(error.response?.data?.error || 'Không tải được bảng tin');
      }
    }

    load();
  }, [user, authLoading, isSuperAdmin, reloadKey]);

  const upcoming = posts
    .filter((p) => p.scheduled_at && p.status === 'scheduled')
    .sort((a, b) => compareApiDates(a.scheduled_at, b.scheduled_at))
    .slice(0, 5);

  if (authLoading || (!stats && !loadError)) {
    return (
      <div className="page-shell">
        <Skeleton lines={4} />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="page-shell">
        <div className="card">
          <p className="form-error">{loadError || 'Không tải được bảng tin'}</p>
          <button type="button" className="btn btn-primary" onClick={() => setReloadKey((k) => k + 1)}>
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Bảng tin</h1>
          <p>
            {isSuperAdmin
              ? 'Tổng quan toàn bộ hệ thống AutoPost.'
              : 'Tổng quan fanpage và bài viết được gán cho bạn.'}
          </p>
        </div>
      </div>

      {loadError && (
        <div className="card modal-alert modal-alert--error" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0 }}>{loadError}</p>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setReloadKey((k) => k + 1)}>
            Tải lại
          </button>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="card card-stat"><h3>Bài viết</h3><p>{stats.posts}</p></div>
        <div className="card card-stat"><h3>Fanpage</h3><p>{stats.pages}</p></div>
        <div className="card card-stat"><h3>AI Provider</h3><p>{stats.providers}</p></div>
        {isSuperAdmin && (
          <div className="card card-stat"><h3>Người dùng</h3><p>{stats.users}</p></div>
        )}
      </div>

      <div className="dashboard-split">
        <div className="card">
          <h3>Trạng thái bài viết</h3>
          <div className="status-chips">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <button key={status} type="button" className="status-chip" onClick={() => navigate(`/posts?status=${status}`)}>
                <Badge status={status}>{statusLabel(status)}</Badge> {count}
              </button>
            ))}
            {!Object.keys(stats.byStatus).length && (
              <p className="text-muted" style={{ margin: 0 }}>Chưa có bài viết nào.</p>
            )}
          </div>
        </div>
        <Calendar
          posts={posts}
          selectedDate={filterDate}
          onSelectDate={(date) => { setFilterDate(date); navigate(`/posts?date=${date}`); }}
        />
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="page-header" style={{ padding: 0, marginBottom: 16 }}>
          <h3>Lịch đăng sắp tới</h3>
          {filterDate && <small>Lọc: {filterDate.split('-').reverse().join('/')}</small>}
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>ID</th><th>Chủ đề</th><th>Trạng thái</th><th>Thời gian</th></tr>
            </thead>
            <tbody>
              {upcoming.map((post) => (
                <tr key={post.id}>
                  <td>{post.id}</td>
                  <td>{post.topic || '—'}</td>
                  <td><Badge status={post.status}>{statusLabel(post.status)}</Badge></td>
                  <td>{formatDateTime(post.scheduled_at)}</td>
                </tr>
              ))}
              {!upcoming.length && (
                <tr><td colSpan={4}>Không có bài đã lên lịch</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
