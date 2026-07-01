import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { mediaSrc } from '../utils/mediaUrl';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';

function parseSeoMeta(post) {
  try {
    return typeof post.seo_meta === 'string' ? JSON.parse(post.seo_meta) : (post.seo_meta || {});
  } catch {
    return {};
  }
}

const STATUS_LABEL = {
  draft: 'Nháp',
  pending_approval: 'Chờ duyệt',
  published: 'Đã publish',
  failed: 'Lỗi',
};

export default function WebsiteBlogPosts() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [websites, setWebsites] = useState([]);
  const [websiteId, setWebsiteId] = useState('');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/websites').then((r) => setWebsites(r.data)).catch(console.error);
  }, []);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const params = { platform: 'website', sort: 'created_at', order: 'desc', limit: 100 };
      if (websiteId) params.website_id = websiteId;
      const response = await api.get('/posts', { params });
      setPosts(response.data.items || []);
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được danh sách bài', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPosts(); }, [websiteId]);

  const handleDelete = async (id) => {
    if (!window.confirm('Xoá bài blog này?')) return;
    try {
      await api.delete(`/posts/${id}`);
      showToast('Đã xoá bài', 'success');
      loadPosts();
    } catch (err) {
      showToast(err.response?.data?.error || 'Không xoá được', 'error');
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Bài Website Blog"
        description="Bài blog SEO đã tạo cho website (generate qua UI hoặc import Excel) — sửa nội dung, generate ảnh, publish lên website."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" variant="secondary" onClick={() => navigate('/posts/import-website-blog')}>
              Import Excel
            </Button>
            <Button type="button" onClick={() => navigate('/generate?tab=website')}>
              Tạo bài mới
            </Button>
          </div>
        }
      />

      <div className="card form-card" style={{ marginBottom: 16 }}>
        <label style={{ maxWidth: 320 }}>
          Lọc theo website
          <select value={websiteId} onChange={(e) => setWebsiteId(e.target.value)}>
            <option value="">Tất cả website</option>
            {websites.map((w) => (
              <option key={w.id} value={String(w.id)}>{w.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="card table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Ảnh</th>
              <th>Tiêu đề</th>
              <th>Website</th>
              <th>Trạng thái</th>
              <th>Publish</th>
              <th>Ngày tạo</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7}>Đang tải...</td></tr>
            )}
            {!loading && !posts.length && (
              <tr><td colSpan={7}>Chưa có bài nào — bấm "Tạo bài mới" hoặc import Excel.</td></tr>
            )}
            {posts.map((post) => {
              const seoMeta = parseSeoMeta(post);
              return (
                <tr key={post.id}>
                  <td>
                    {post.image_url ? (
                      <img
                        src={mediaSrc(post.image_url)}
                        alt=""
                        style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }}
                      />
                    ) : (
                      <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>Chưa có</span>
                    )}
                  </td>
                  <td>{seoMeta.title || <span className="text-muted">(chưa có tiêu đề)</span>}</td>
                  <td>{post.website_name || '-'}</td>
                  <td>
                    <span className="badge badge-default">{STATUS_LABEL[post.status] || post.status}</span>
                  </td>
                  <td>
                    {post.website_post_url ? (
                      <a href={post.website_post_url} target="_blank" rel="noreferrer">Xem bài</a>
                    ) : (
                      <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>Chưa publish</span>
                    )}
                  </td>
                  <td>{post.created_at ? new Date(post.created_at).toLocaleString('vi-VN') : '-'}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/website-posts/${post.id}/edit`)}>
                        Sửa
                      </Button>
                      <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(post.id)}>
                        Xoá
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
