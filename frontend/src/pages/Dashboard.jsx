import { useEffect, useState } from 'react';
import api from '../services/api';
import Calendar from '../components/Calendar';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import PageHeader from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/authContext';
import { compareApiDates, formatDateTime } from '../utils/date';
import { FileText, Facebook, Cpu, Users } from 'lucide-react';

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
          { key: 'posts', promise: api.get('/posts', { params: { limit: 500 } }) },
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

        const postsPayload = getData(0, 'bài viết');
        const postsList = Array.isArray(postsPayload) ? postsPayload : (postsPayload?.items || []);
        const pagesData = getData(1, 'fanpage');
        const providersData = getData(2, 'provider');
        const usersData = isSuperAdmin ? getData(3, 'người dùng') : null;

        setPosts(postsList);
        const byStatus = postsList.reduce((acc, p) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        }, {});

        setStats({
          posts: postsPayload?.total ?? postsList.length,
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
          <Button type="button" onClick={() => setReloadKey((k) => k + 1)}>
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        title="Bảng tin"
        description={
          isSuperAdmin
            ? 'Tổng quan toàn bộ hệ thống AutoPost.'
            : 'Tổng quan fanpage và bài viết được gán cho bạn.'
        }
        actions={
          <Button onClick={() => navigate('/generate')}>
            Tạo bài mới
          </Button>
        }
      />

      {loadError && (
        <div className="card modal-alert modal-alert--error" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0 }}>{loadError}</p>
          <Button variant="secondary" size="sm" style={{ marginTop: 8 }} onClick={() => setReloadKey((k) => k + 1)}>
            Tải lại
          </Button>
        </div>
      )}

      <div className="dashboard-grid">
        <StatCard icon={<FileText size={20} />} iconTone="blue" label="Bài viết" value={stats.posts} />
        <StatCard icon={<Facebook size={20} />} iconTone="green" label="Fanpage" value={stats.pages} />
        <StatCard icon={<Cpu size={20} />} iconTone="amber" label="AI Provider" value={stats.providers} />
        {isSuperAdmin && (
          <StatCard icon={<Users size={20} />} iconTone="slate" label="Người dùng" value={stats.users} />
        )}
      </div>

      <div className="dashboard-split">
        <div className="card">
          <h3>Trạng thái bài viết</h3>
          <div className="status-chips">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <button key={status} type="button" className="status-chip" onClick={() => navigate(`/posts?status=${status}`)}>
                <Badge status={status} /> {count}
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
        <h3>Lịch đăng sắp tới</h3>
        {filterDate && <small>Lọc: {filterDate.split('-').reverse().join('/')}</small>}
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
                  <td><Badge status={post.status} /></td>
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
