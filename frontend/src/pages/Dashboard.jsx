import { useEffect, useState } from 'react';
import api from '../services/api';
import Calendar from '../components/Calendar';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import { useNavigate } from 'react-router-dom';
import { compareApiDates, formatDateTime } from '../utils/date';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [posts, setPosts] = useState([]);
  const [filterDate, setFilterDate] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const [postsRes, pagesRes, providersRes, usersRes] = await Promise.all([
          api.get('/posts'),
          api.get('/pages'),
          api.get('/providers'),
          api.get('/users'),
        ]);
        setPosts(postsRes.data);
        const byStatus = postsRes.data.reduce((acc, p) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        }, {});
        setStats({
          posts: postsRes.data.length,
          pages: pagesRes.data.length,
          providers: providersRes.data.length,
          users: usersRes.data.length,
          byStatus,
        });
      } catch (error) {
        console.error(error);
      }
    }
    load();
  }, []);

  const upcoming = posts
    .filter((p) => p.scheduled_at && p.status === 'scheduled')
    .sort((a, b) => compareApiDates(a.scheduled_at, b.scheduled_at))
    .slice(0, 5);

  if (!stats) {
    return (
      <div className="page-shell">
        <Skeleton lines={4} />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of your AutoPost workspace.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card card-stat"><h3>Posts</h3><p>{stats.posts}</p></div>
        <div className="card card-stat"><h3>Pages</h3><p>{stats.pages}</p></div>
        <div className="card card-stat"><h3>Providers</h3><p>{stats.providers}</p></div>
        <div className="card card-stat"><h3>Users</h3><p>{stats.users}</p></div>
      </div>

      <div className="dashboard-split">
        <div className="card">
          <h3>Post status</h3>
          <div className="status-chips">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <button key={status} type="button" className="status-chip" onClick={() => navigate(`/posts?status=${status}`)}>
                <Badge status={status}>{status}</Badge> {count}
              </button>
            ))}
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
          <h3>Upcoming scheduled</h3>
          {filterDate && <small>Lọc: {filterDate.split('-').reverse().join('/')}</small>}
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>ID</th><th>Topic</th><th>Status</th><th>Scheduled</th></tr>
            </thead>
            <tbody>
              {upcoming.map((post) => (
                <tr key={post.id}>
                  <td>{post.id}</td>
                  <td>{post.topic}</td>
                  <td><Badge status={post.status}>{post.status}</Badge></td>
                  <td>{formatDateTime(post.scheduled_at)}</td>
                </tr>
              ))}
              {!upcoming.length && (
                <tr><td colSpan={4}>No upcoming scheduled posts</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
