import { useEffect, useState } from 'react';
import api from '../services/api';
import Calendar from '../components/Calendar';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import Button from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/authContext';
import { compareApiDates, formatDateTime, parseApiDate } from '../utils/date';
import { ArrowRight, Radio } from 'lucide-react';

function formatCountdown(dateValue) {
  const target = parseApiDate(dateValue);
  if (!target) return '';
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return 'đang xử lý';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `còn ${mins} phút`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `còn ${hours} giờ ${mins % 60 ? (mins % 60) + ' phút' : ''}`.trim();
  const days = Math.floor(hours / 24);
  return `còn ${days} ngày`;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [stats, setStats] = useState(null);
  const [posts, setPosts] = useState([]);
  const [pages, setPages] = useState([]);
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
          { key: 'groupStats', promise: api.get('/group-posts/stats') },
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
        const groupStats = results[3].status === 'fulfilled' ? results[3].value.data : null;
        const usersData = isSuperAdmin ? getData(4, 'người dùng') : null;

        setPosts(postsList);
        setPages(Array.isArray(pagesData) ? pagesData : []);
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
          group: groupStats,
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

  const pageNameById = pages.reduce((acc, p) => {
    acc[p.id] = p.name;
    return acc;
  }, {});
  const nextDispatch = upcoming[0];

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
      <div className="dispatch-hero">
        <span className="dispatch-hero-eyebrow">
          <Radio size={13} /> Bài kế tiếp sẽ tự động đăng
        </span>
        {nextDispatch ? (
          <div className="dispatch-hero-body">
            <div className="dispatch-hero-next">
              <span className="dispatch-next-countdown">{formatCountdown(nextDispatch.scheduled_at)}</span>
              <div className="dispatch-next-meta">
                <span className="dispatch-next-topic">{nextDispatch.topic || 'Bài chưa đặt tiêu đề'}</span>
                <span className="dispatch-next-time">{formatDateTime(nextDispatch.scheduled_at)}</span>
                {pageNameById[nextDispatch.page_id] && (
                  <span className="dispatch-next-channel">→ {pageNameById[nextDispatch.page_id]}</span>
                )}
              </div>
            </div>
            <div className="dispatch-hero-side">
              <span className="dispatch-hero-sub">{stats.pages} fanpage · {stats.posts} bài trong hệ thống</span>
              <div className="dispatch-hero-actions">
                <button type="button" className="dispatch-next-link" onClick={() => navigate('/posts?status=scheduled')}>
                  Xem tất cả lịch <ArrowRight size={14} />
                </button>
                <Button onClick={() => navigate('/generate')}>Tạo bài mới</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="dispatch-hero-body">
            <div className="dispatch-hero-next">
              <span className="dispatch-next-topic dispatch-next-topic--empty">Chưa có bài nào chờ lịch</span>
            </div>
            <div className="dispatch-hero-side">
              <span className="dispatch-hero-sub">{stats.pages} fanpage · {stats.posts} bài trong hệ thống</span>
              <div className="dispatch-hero-actions">
                <Button onClick={() => navigate('/generate')}>Tạo bài đầu tiên</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {loadError && (
        <div className="card modal-alert modal-alert--error" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0 }}>{loadError}</p>
          <Button variant="secondary" size="sm" style={{ marginTop: 8 }} onClick={() => setReloadKey((k) => k + 1)}>
            Tải lại
          </Button>
        </div>
      )}

      <div className="dispatch-ledger">
        <div className="dispatch-ledger-item dispatch-ledger-item--blue">
          <span className="dispatch-ledger-value">{stats.posts}</span>
          <span className="dispatch-ledger-label">Bài viết</span>
        </div>
        <div className="dispatch-ledger-item dispatch-ledger-item--green">
          <span className="dispatch-ledger-value">{stats.pages}</span>
          <span className="dispatch-ledger-label">Fanpage</span>
        </div>
        <div className="dispatch-ledger-item dispatch-ledger-item--slate">
          <span className="dispatch-ledger-value">{stats.group?.total_posts ?? '—'}</span>
          <span className="dispatch-ledger-label">Group đã đăng</span>
        </div>
        <div className="dispatch-ledger-item dispatch-ledger-item--amber">
          <span className="dispatch-ledger-value">{stats.providers}</span>
          <span className="dispatch-ledger-label">AI Provider</span>
        </div>
        {isSuperAdmin && (
          <div className="dispatch-ledger-item dispatch-ledger-item--slate">
            <span className="dispatch-ledger-value">{stats.users}</span>
            <span className="dispatch-ledger-label">Người dùng</span>
          </div>
        )}
      </div>

      {stats.group && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0 }}>GroupFlow</h3>
            <Button variant="secondary" size="sm" onClick={() => navigate('/groups')}>Xem bài đã đăng</Button>
          </div>
          <div className="status-chips" style={{ marginTop: 12 }}>
            <button type="button" className="status-chip" onClick={() => navigate('/groups')}>
              <Badge>7 ngày</Badge> {stats.group.posts_last_7_days} bài
            </button>
            <button type="button" className="status-chip" onClick={() => navigate('/groups')}>
              <Badge>Comment</Badge> {stats.group.total_comments}
            </button>
            <button type="button" className="status-chip" onClick={() => navigate('/groups/drafts')}>
              <Badge>Chờ tải</Badge> {stats.group.my_pending_drafts}
            </button>
            <button type="button" className="status-chip" onClick={() => navigate('/groups/drafts')}>
              <Badge>Shared</Badge> {stats.group.shared_drafts_total ?? 0} draft team
            </button>
          </div>
        </div>
      )}

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
