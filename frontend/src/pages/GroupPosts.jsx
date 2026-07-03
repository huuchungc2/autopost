import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, ExternalLink, Search, Trash2 } from 'lucide-react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import GroupPostDetailModal from '../components/GroupPostDetailModal';
import { formatDateTime } from '../utils/date';
import { useAuth } from '../services/authContext';
import { useToast } from '../context/ToastContext';

export default function GroupPosts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isAdmin = ['super_admin', 'admin'].includes(user?.role);
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [userId, setUserId] = useState('');
  const [users, setUsers] = useState([]);
  const [detailPost, setDetailPost] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/users')
      .then((res) => setUsers(Array.isArray(res.data) ? res.data : []))
      .catch(() => setUsers([]));
  }, [isAdmin]);

  // Trước đây lỗi tải bị nuốt im lặng (chỉ console.error) — trang hiện y hệt "chưa có bài group
  // nào" dù thực ra request đang fail (vd backend lỗi/migration chưa chạy), không cách nào phân
  // biệt được với trường hợp thật sự trống. Giờ báo lỗi rõ qua toast.
  const load = async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 30 };
      if (search.trim()) params.search = search.trim();
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (userId && isAdmin) params.user_id = userId;
      const res = await api.get('/group-posts', { params });
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0 });
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.error || 'Không tải được danh sách bài group', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    setSelectedIds(new Set());
  }, [search, fromDate, toDate, userId, isAdmin]);

  const clearFilters = () => {
    setSearch('');
    setFromDate('');
    setToDate('');
    setUserId('');
  };

  const hasFilters = search || fromDate || toDate || userId;

  const selectedCount = selectedIds.size;
  const allOnPageSelected = data.length > 0 && data.every((p) => selectedIds.has(p.id));

  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(data.map((p) => p.id)));
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Xoá ${ids.length} bài đã chọn? Không thể hoàn tác.`)) return;
    setBulkDeleting(true);
    try {
      const res = await api.post('/group-posts/bulk-delete', { post_ids: ids });
      const skipped = res.data.errors?.length ? ` — ${res.data.errors.length} lỗi` : '';
      showToast(`Đã xoá ${res.data.deleted_count} bài${skipped}`, 'success');
      setSelectedIds(new Set());
      load(pagination.page);
    } catch (err) {
      showToast(err.response?.data?.error || 'Xoá hàng loạt thất bại', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Group — Bài đã đăng"
        description="Metadata bài đăng FB Group (extension sync lên). Không chạy job fanpage."
        actions={(
          <>
            <Button variant="secondary" onClick={() => navigate('/groups/drafts')}>Drafts chờ extension</Button>
            <Button variant="default" onClick={() => navigate('/groups/import')}>
              <Upload size={16} /> Import draft
            </Button>
          </>
        )}
      />

      <div className="card filters-row group-filters" style={{ marginBottom: 16 }}>
        <div className="group-filters-row">
          <div className="input-icon-wrap">
            <Search size={16} className="input-icon" />
            <input
              type="search"
              className="input"
              placeholder="Tìm nội dung, người đăng, group_id…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <input
            type="date"
            className="input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            title="Từ ngày"
          />
          <input
            type="date"
            className="input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            title="Đến ngày"
          />
          {isAdmin && (
            <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Tất cả người dùng</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
          {hasFilters && (
            <Button variant="secondary" size="sm" onClick={clearFilters}>Xóa lọc</Button>
          )}
          {selectedCount > 0 && (
            <Button variant="destructive" size="sm" disabled={bulkDeleting} onClick={handleBulkDelete}>
              <Trash2 size={16} /> Xoá đã chọn ({selectedCount})
            </Button>
          )}
        </div>
        <span className="text-muted">{pagination.total} bài</span>
      </div>

      {loading ? (
        <Skeleton height={120} />
      ) : !data.length ? (
        <div className="card empty-state">
          <p>Chưa có bài group nào. Extension đăng xong sẽ sync lên đây.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="data-table data-table-content-priority">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAllOnPage}
                    title="Chọn tất cả bài trên trang này"
                  />
                </th>
                <th>Thời gian</th>
                <th>Người đăng</th>
                <th>Group</th>
                <th>Nội dung</th>
                <th>Comment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.id}
                  className="clickable-row"
                  onClick={() => setDetailPost(row)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setDetailPost(row)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleSelectOne(row.id)}
                    />
                  </td>
                  <td>{row.posted_at ? formatDateTime(row.posted_at) : '—'}</td>
                  <td>{row.poster_name || row.posted_by}</td>
                  <td title={row.group_id}>
                    {row.group_name || <code>{row.group_id}</code>}
                    {row.group_name && <small className="text-muted" style={{ display: 'block' }}><code>{row.group_id}</code></small>}
                  </td>
                  <td style={{ maxWidth: 280 }}>{row.noi_dung?.slice(0, 80)}{(row.noi_dung?.length > 80) ? '…' : ''}</td>
                  <td>
                    <Badge>{row.comment_count}</Badge>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {row.fb_url && (
                      <a href={row.fb_url} target="_blank" rel="noreferrer" className="icon-link" title="Xem bài">
                        <ExternalLink size={16} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pagination.pages > 1 && (
            <div className="pagination-row" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <Button
                variant="secondary"
                disabled={pagination.page <= 1}
                onClick={() => load(pagination.page - 1)}
              >
                Trước
              </Button>
              <span>Trang {pagination.page}/{pagination.pages}</span>
              <Button
                variant="secondary"
                disabled={pagination.page >= pagination.pages}
                onClick={() => load(pagination.page + 1)}
              >
                Sau
              </Button>
            </div>
          )}
        </div>
      )}

      <GroupPostDetailModal
        post={detailPost}
        open={Boolean(detailPost)}
        onClose={() => setDetailPost(null)}
      />
    </div>
  );
}
