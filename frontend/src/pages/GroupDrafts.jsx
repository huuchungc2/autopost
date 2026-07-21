import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, Pencil, RotateCcw } from 'lucide-react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import GroupDraftEditModal from '../components/GroupDraftEditModal';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../services/authContext';
import { formatDateTime } from '../utils/date';

const STATUS_LABEL = { pending: 'Chờ tải', pulled: 'Đã tải' };

export default function GroupDrafts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = ['super_admin', 'admin'].includes(user?.role);
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [status, setStatus] = useState('pending');
  const [scope, setScope] = useState('mine');
  const [loading, setLoading] = useState(true);
  const [editDraft, setEditDraft] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [categories, setCategories] = useState([]);
  const [assignCats, setAssignCats] = useState(() => new Set());
  const { showToast } = useToast();

  useEffect(() => {
    api.get('/group-categories').then((r) => setCategories(r.data || [])).catch(() => {});
  }, []);

  const catName = (id) => categories.find((c) => String(c.id) === String(id))?.name || '';
  const draftCatNames = (csv) => String(csv || '').split(',').map((s) => s.trim()).filter(Boolean)
    .map(catName).filter(Boolean);

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/group-posts/drafts', {
        params: { status, scope, page, limit: 30 },
      });
      setData(res.data.data || []);
      setPagination(res.data.pagination || { page: 1, pages: 1, total: 0 });
      setSelected(new Set());
    } catch (err) {
      showToast(err.response?.data?.error || 'Tải drafts thất bại', 'error');
    } finally {
      setLoading(false);
    }
  };

  const deletableIds = data.filter((r) => r.can_delete).map((r) => r.id);
  const allSelected = deletableIds.length > 0 && deletableIds.every((id) => selected.has(id));
  const toggleOne = (id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAll = () => setSelected(() => (allSelected ? new Set() : new Set(deletableIds)));

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Xoá ${ids.length} draft đã chọn?`)) return;
    try {
      const res = await api.post('/group-posts/drafts/bulk-delete', { draft_ids: ids });
      showToast(`Đã xoá ${res.data.deleted} draft`, 'success');
      setSelected(new Set());
      load(pagination.page);
    } catch (err) {
      showToast(err.response?.data?.error || 'Xoá thất bại', 'error');
    }
  };

  const toggleAssignCat = (id) => setAssignCats((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const handleBulkCategory = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      const res = await api.post('/group-posts/drafts/bulk-category', {
        draft_ids: ids,
        category_ids: [...assignCats],
      });
      showToast(`Đã gán ngành cho ${res.data.updated} draft`, 'success');
      setSelected(new Set());
      setAssignCats(new Set());
      load(pagination.page);
    } catch (err) {
      showToast(err.response?.data?.error || 'Gán ngành thất bại', 'error');
    }
  };

  useEffect(() => {
    load(1);
  }, [status, scope]);

  const handleDelete = async (id) => {
    if (!window.confirm('Xoá draft này?')) return;
    try {
      await api.delete(`/group-posts/drafts/${id}`);
      showToast('Đã xoá draft', 'success');
      load(pagination.page);
    } catch (err) {
      showToast(err.response?.data?.error || 'Xoá thất bại', 'error');
    }
  };

  const handleRepull = async (id) => {
    if (!window.confirm('Cho phép extension tải lại draft này?')) return;
    try {
      await api.post(`/group-posts/drafts/${id}/repull`);
      showToast('Đã reset — extension có thể tải lại', 'success');
      load(pagination.page);
    } catch (err) {
      showToast(err.response?.data?.error || 'Re-pull thất bại', 'error');
    }
  };

  const handleSaveEdit = async (id, body) => {
    await api.patch(`/group-posts/drafts/${id}`, body);
    showToast('Đã cập nhật draft', 'success');
    load(pagination.page);
  };

  return (
    <div className="page-shell">
      <PageHeader
        back={{ onClick: () => navigate('/groups'), label: 'Bài đã đăng' }}
        title="Group — Drafts"
        description="Draft cá nhân + chia sẻ team (admin). Extension tải qua nút「Tải từ website」."
      />

      <div className="card filters-row" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {['pending', 'pulled', 'all'].map((s) => (
          <Button
            key={s}
            variant={status === s ? 'primary' : 'secondary'}
            onClick={() => setStatus(s)}
          >
            {s === 'pending' ? 'Chờ tải' : s === 'pulled' ? 'Đã tải' : 'Tất cả'}
          </Button>
        ))}
        {isAdmin && (
          <>
            <Button variant={scope === 'mine' ? 'primary' : 'secondary'} onClick={() => setScope('mine')}>
              Của tôi + shared
            </Button>
            <Button variant={scope === 'team' ? 'primary' : 'secondary'} onClick={() => setScope('team')}>
              Toàn team
            </Button>
          </>
        )}
        <Button variant="secondary" onClick={() => navigate('/groups/import')}>+ Import</Button>
        {selected.size > 0 && (
          <Button variant="destructive" onClick={handleBulkDelete}>
            <Trash2 size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Xóa đã chọn ({selected.size})
          </Button>
        )}
        <span className="text-muted" style={{ marginLeft: 'auto' }}>{pagination.total} draft</span>
      </div>

      {selected.size > 0 && categories.length > 0 && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="text-muted">Gán ngành cho {selected.size} draft đã chọn:</span>
          {categories.map((c) => {
            const on = assignCats.has(String(c.id));
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleAssignCat(String(c.id))}
                style={{
                  border: `1px solid ${on ? '#4f46e5' : 'var(--bg-border)'}`,
                  background: on ? '#4f46e5' : 'transparent',
                  color: on ? '#fff' : 'inherit',
                  borderRadius: 999, padding: '3px 12px', fontSize: 13, cursor: 'pointer',
                }}
              >
                {c.name}
              </button>
            );
          })}
          <Button onClick={handleBulkCategory} style={{ marginLeft: 'auto' }}>
            {assignCats.size ? `Gán ${assignCats.size} ngành` : 'Gỡ hết ngành'}
          </Button>
        </div>
      )}

      {loading ? (
        <p>Đang tải…</p>
      ) : !data.length ? (
        <div className="card empty-state">
          <p>Không có draft. <Link to="/groups/import">Import Excel</Link> hoặc mở extension → Tải bài từ website.</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={deletableIds.length === 0}
                    title="Chọn tất cả (bài xoá được)"
                  />
                </th>
                <th>Loại</th>
                <th>Trạng thái</th>
                <th>Người tạo</th>
                <th>Nội dung</th>
                <th>Ngành</th>
                <th>Prompt ảnh</th>
                <th>Lịch</th>
                <th>Tạo lúc</th>
                <th>Đã tải</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.can_delete && (
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleOne(row.id)}
                      />
                    )}
                  </td>
                  <td>
                    {row.is_shared ? <Badge>Shared</Badge> : <span className="text-muted">Cá nhân</span>}
                  </td>
                  <td>
                    <Badge>{STATUS_LABEL[row.status] || row.status}</Badge>
                    {row.is_shared && row.pull_count > 0 && (
                      <small className="text-muted" style={{ display: 'block' }}>{row.pull_count} người tải</small>
                    )}
                  </td>
                  <td>{row.creator_name || '—'}</td>
                  <td style={{ maxWidth: 200 }} title={row.noi_dung}>
                    {row.noi_dung?.slice(0, 60)}{(row.noi_dung?.length > 60) ? '…' : ''}
                  </td>
                  <td style={{ maxWidth: 140 }}>
                    {draftCatNames(row.category_ids).length
                      ? draftCatNames(row.category_ids).map((n) => (
                          <Badge key={n} style={{ marginRight: 4 }}>{n}</Badge>
                        ))
                      : <span className="text-muted">—</span>}
                  </td>
                  <td style={{ maxWidth: 140 }} title={row.prompt_anh}>
                    {row.prompt_anh ? `${row.prompt_anh.slice(0, 30)}…` : '—'}
                  </td>
                  <td>{row.ngay_dang || '—'} {row.gio_dang || ''}</td>
                  <td>{row.created_at ? formatDateTime(row.created_at) : '—'}</td>
                  <td>{row.pulled_at ? formatDateTime(row.pulled_at) : '—'}</td>
                  <td>
                    <div className="row-actions">
                      {row.can_edit && (
                        <button type="button" className="icon-btn" onClick={() => setEditDraft(row)} title="Sửa">
                          <Pencil size={16} />
                        </button>
                      )}
                      {row.can_repull && (
                        <button type="button" className="icon-btn" onClick={() => handleRepull(row.id)} title="Tải lại">
                          <RotateCcw size={16} />
                        </button>
                      )}
                      {row.can_delete && (
                        <button type="button" className="icon-btn" onClick={() => handleDelete(row.id)} title="Xoá">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pagination.pages > 1 && (
            <div className="pagination-row" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <Button variant="secondary" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>
                Trước
              </Button>
              <span>Trang {pagination.page}/{pagination.pages}</span>
              <Button variant="secondary" disabled={pagination.page >= pagination.pages} onClick={() => load(pagination.page + 1)}>
                Sau
              </Button>
            </div>
          )}
        </div>
      )}

      <GroupDraftEditModal
        draft={editDraft}
        open={Boolean(editDraft)}
        onClose={() => setEditDraft(null)}
        onSaved={handleSaveEdit}
      />
    </div>
  );
}
