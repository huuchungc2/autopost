import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import { useToast } from '../context/ToastContext';

// Quản lý danh mục ngành nghề GroupFlow (dùng chung toàn hệ thống — extension kéo về). Admin/super_admin.
export default function GroupCategories() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/group-categories');
      setCategories(res.data || []);
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được danh mục ngành', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const updateName = (id, name) => setCategories((cs) => cs.map((c) => (c.id === id ? { ...c, name } : c)));

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.post('/group-categories', { name });
      setNewName('');
      await load();
      showToast('Đã thêm ngành nghề', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Thêm ngành thất bại', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (id, name) => {
    if (!name.trim()) { showToast('Tên ngành không được trống', 'error'); return; }
    try {
      await api.put(`/group-categories/${id}`, { name: name.trim() });
      showToast('Đã lưu tên ngành', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Lưu thất bại', 'error');
    }
  };

  const handleDelete = async (id, name, count) => {
    const msg = count
      ? `Xóa ngành "${name}"? ${count} bài đang gán sẽ bị gỡ ngành này (không xoá bài).`
      : `Xóa ngành "${name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await api.delete(`/group-categories/${id}`);
      await load();
      showToast('Đã xóa ngành', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Xóa thất bại', 'error');
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        back={{ onClick: () => navigate('/groups'), label: 'Group' }}
        title="Ngành nghề GroupFlow"
        description="Danh mục ngành dùng CHUNG toàn hệ thống — extension kéo về để gán/lọc bài. 1 bài thuộc nhiều ngành; lọc theo ngành ở tab Tạo bài & Comment."
      />

      <div className="card" style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            className="input"
            style={{ flex: 1 }}
            placeholder="Tên ngành mới (VD: Nội thất)"
            maxLength={60}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          />
          <Button type="button" onClick={handleAdd} disabled={busy || !newName.trim()}>+ Thêm</Button>
        </div>

        {loading ? (
          <p className="text-muted">Đang tải…</p>
        ) : categories.length === 0 ? (
          <p className="field-hint">Chưa có ngành nào — thêm ở ô trên.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {categories.map((c) => (
              <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  className="input"
                  maxLength={60}
                  value={c.name}
                  onChange={(e) => updateName(c.id, e.target.value)}
                  style={{ flex: 1 }}
                />
                <small className="text-muted" style={{ whiteSpace: 'nowrap' }} title="Số bài đang gán ngành này">
                  {c.post_count || 0} bài
                </small>
                <Button type="button" variant="secondary" size="sm" onClick={() => handleRename(c.id, c.name)}>Lưu</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => handleDelete(c.id, c.name, c.post_count)}>Xóa</Button>
              </div>
            ))}
          </div>
        )}

        <p className="field-hint" style={{ marginTop: 16 }}>
          Xoá 1 ngành chỉ gỡ ngành đó khỏi các bài đang gán, không xoá bài. Trong extension, danh mục tự đồng bộ khi mở panel (hoặc bấm "↻ Tải lại" ở Cài đặt → Ngành nghề của extension).
        </p>
      </div>
    </div>
  );
}
