import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../services/api';
import { roleLabel } from '../config/vi';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../services/authContext';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';

const PLAN_LABEL = { free: 'Miễn phí', pro: 'Pro', enterprise: 'Enterprise' };
const KEY_STATUS_LABEL = { active: '✅ Active', expired: '❌ Hết hạn', suspended: '⛔ Khóa' };

function GroupFlowUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/user-auth/admin/users');
      setUsers(res.data);
    } catch {
      showToast('Không tải được danh sách GroupFlow users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const update = async (id, patch) => {
    try {
      await api.patch(`/user-auth/admin/users/${id}`, patch);
      showToast('Đã cập nhật', 'success');
      load();
    } catch {
      showToast('Lỗi cập nhật', 'error');
    }
  };

  const remove = async (id, email) => {
    if (!window.confirm(`Xóa user ${email}?`)) return;
    try {
      await api.delete(`/user-auth/admin/users/${id}`);
      showToast('Đã xóa', 'success');
      load();
    } catch {
      showToast('Lỗi xóa', 'error');
    }
  };

  if (loading) return <p style={{ padding: 16, color: 'var(--text-secondary)' }}>Đang tải…</p>;

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
        Danh sách tài khoản đăng ký dùng extension GroupFlow. Mỗi tài khoản có 1 license key.
      </p>
      <div className="card table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th><th>Tên</th><th>License Key</th>
              <th>Plan</th><th>Key status</th><th>Hết hạn</th>
              <th>Lần cuối dùng</th><th>Tài khoản</th><th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {!users.length && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>Chưa có user nào</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name || '—'}</td>
                <td><code style={{ fontSize: 11 }}>{u.key_value || '—'}</code></td>
                <td>
                  <select
                    value={u.plan || 'free'}
                    onChange={(e) => update(u.id, { plan: e.target.value })}
                    style={{ fontSize: 12, padding: '2px 4px' }}
                  >
                    <option value="free">Miễn phí</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </td>
                <td>{KEY_STATUS_LABEL[u.key_status] || u.key_status || '—'}</td>
                <td style={{ fontSize: 12 }}>{u.expires_at ? new Date(u.expires_at).toLocaleDateString('vi') : 'Vĩnh viễn'}</td>
                <td style={{ fontSize: 12 }}>{u.last_validated_at ? new Date(u.last_validated_at).toLocaleString('vi') : '—'}</td>
                <td>
                  <select
                    value={u.status}
                    onChange={(e) => update(u.id, { status: e.target.value })}
                    style={{ fontSize: 12, padding: '2px 4px' }}
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <Button
                    type="button" variant="link" style={{ fontSize: 12 }}
                    onClick={() => update(u.id, { key_status: u.key_status === 'active' ? 'suspended' : 'active' })}
                  >
                    {u.key_status === 'active' ? 'Khóa key' : 'Mở key'}
                  </Button>
                  <Button type="button" variant="link" style={{ fontSize: 12, color: 'var(--color-error)' }} onClick={() => remove(u.id, u.email)}>Xóa</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const initialForm = {
  name: '',
  username: '',
  email: '',
  password: '',
  role: 'editor',
  is_active: true,
  page_ids: [],
  provider_ids: [],
};

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [allPages, setAllPages] = useState([]);
  const [allProviders, setAllProviders] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [migrationWarning, setMigrationWarning] = useState('');
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canManageUsers = ['super_admin', 'admin'].includes(currentUser?.role);

  const loadUsers = async () => {
    try {
      const response = await api.get('/users');
      const visibleUsers = isSuperAdmin
        ? response.data
        : response.data.filter((u) => u.role !== 'super_admin');
      setUsers(visibleUsers);
      const adminWithoutPages = visibleUsers.some(
        (u) => u.role !== 'super_admin' && Number(u.assigned_page_count) === 0
      );
      if (adminWithoutPages) {
        setMigrationWarning('Có user admin/biên tập chưa được gán fanpage (cột Fanpage = 0). Tick fanpage → bấm Cập nhật.');
      } else {
        setMigrationWarning('');
      }
    } catch (err) {
      console.error(err);
      setMigrationWarning('Không tải được danh sách user — kiểm tra backend và bảng user_pages.');
    }
  };

  const loadPages = async () => {
    try {
      const response = await api.get('/pages');
      setAllPages(response.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadProviders = async () => {
    try {
      const response = await api.get('/providers');
      setAllProviders(response.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadUsers();
    loadPages();
    loadProviders();
  }, []);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const togglePage = (pageId) => {
    const id = Number(pageId);
    setForm((prev) => ({
      ...prev,
      page_ids: prev.page_ids.some((x) => Number(x) === id)
        ? prev.page_ids.filter((x) => Number(x) !== id)
        : [...prev.page_ids, id],
    }));
  };

  const toggleProvider = (providerId) => {
    const id = Number(providerId);
    setForm((prev) => ({
      ...prev,
      provider_ids: prev.provider_ids.some((x) => Number(x) === id)
        ? prev.provider_ids.filter((x) => Number(x) !== id)
        : [...prev.provider_ids, id],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        name: form.name,
        username: form.username,
        email: form.email,
        role: form.role,
        is_active: form.is_active,
        page_ids: form.role === 'super_admin' ? [] : form.page_ids.map(Number).filter(Boolean),
        provider_ids: form.role === 'super_admin' ? [] : form.provider_ids.map(Number).filter(Boolean),
      };
      if (editingId) {
        const response = await api.put(`/users/${editingId}`, payload);
        const pageCount = response.data?.assigned_page_count ?? 0;
        const savedIds = response.data?.assigned_page_ids ?? [];
        if (payload.page_ids.length > 0 && pageCount === 0) {
          showToast('Gán fanpage thất bại — restart backend hoặc chạy migration 001_user_pages.sql', 'error');
        } else if (payload.page_ids.length > 0 && pageCount !== payload.page_ids.length) {
          showToast(`Đã lưu ${pageCount}/${payload.page_ids.length} fanpage — kiểm tra ID page`, 'error');
        } else {
          showToast(`Đã cập nhật — gán ${pageCount} fanpage`, 'success');
        }
        if (savedIds.length) {
          console.info('Assigned page IDs:', savedIds);
        }
      } else {
        const response = await api.post('/users', { ...payload, password: form.password });
        const pageCount = response.data?.assigned_page_count ?? payload.page_ids.length;
        showToast(`Đã tạo user — gán ${pageCount} fanpage`, 'success');
      }
      resetForm();
      loadUsers();
    } catch (err) {
      showToast(err.response?.data?.error || 'Không lưu được user', 'error');
    }
  };

  const handleEdit = async (user) => {
    setEditingId(user.id);
    await loadPages();
    await loadProviders();
    let pageIds = [];
    let providerIds = [];
    if (user.role !== 'super_admin') {
      try {
        const pagesRes = await api.get(`/users/${user.id}/pages`);
        pageIds = pagesRes.data.map((p) => Number(p.id)).filter(Boolean);
      } catch (err) {
        pageIds = [];
        showToast(err.response?.data?.error || 'Không tải được fanpage đã gán — kiểm tra bảng user_pages', 'error');
      }
      try {
        const providersRes = await api.get(`/users/${user.id}/providers`);
        providerIds = providersRes.data.map((p) => Number(p.id)).filter(Boolean);
      } catch {
        providerIds = [];
      }
    }
    setForm({
      name: user.name || '',
      username: user.username || '',
      email: user.email || '',
      password: '',
      role: user.role || 'editor',
      is_active: !!user.is_active,
      page_ids: pageIds,
      provider_ids: providerIds,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa user này?')) return;
    try {
      await api.delete(`/users/${id}`);
      showToast('Đã xóa user', 'success');
      loadUsers();
    } catch (err) {
      showToast(err.response?.data?.error || 'Không xóa được user', 'error');
    }
  };

  const [tab, setTab] = useState('admin');

  if (!canManageUsers) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-shell">
      <PageHeader
        title="Quản lý người dùng"
        description={isSuperAdmin ? 'Super admin gán fanpage và AI provider cho admin/editor.' : 'Quản lý admin và biên tập — gán fanpage, provider.'}
      />

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--bg-border)', paddingBottom: 0 }}>
        {[['admin', 'Admin / Biên tập'], ['groupflow', 'GroupFlow Users']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === key ? 600 : 400,
              color: tab === key ? 'var(--color-primary)' : 'var(--text-secondary)',
              borderBottom: tab === key ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >{label}</button>
        ))}
      </div>

      {tab === 'groupflow' && <GroupFlowUsers />}

      {tab === 'admin' && <>
      {migrationWarning && (
        <div className="card modal-alert modal-alert--error" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0 }}>{migrationWarning}</p>
        </div>
      )}

      <div className="card form-card">
        <h2>{editingId ? 'Sửa người dùng' : 'Thêm người dùng'}</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>Tên hiển thị<input value={form.name} onChange={(e) => handleChange('name', e.target.value)} required /></label>
          <label>
            Username
            <input
              value={form.username}
              onChange={(e) => handleChange('username', e.target.value.toLowerCase())}
              required
              pattern="[a-z0-9][a-z0-9._-]{2,49}"
              placeholder="vd: admin, editor01"
              autoComplete="off"
            />
            <small className="text-muted">Dùng đăng nhập — chữ thường, số, . _ -</small>
          </label>
          <label>Email<input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} required /></label>
          <label>
            Mật khẩu
            <input type="password" value={form.password} onChange={(e) => handleChange('password', e.target.value)} placeholder={editingId ? 'Để trống nếu giữ mật khẩu cũ' : ''} {...(editingId ? {} : { required: true })} />
          </label>
          <label>
            Vai trò
            <select value={form.role} onChange={(e) => handleChange('role', e.target.value)}>
              <option value="editor">Biên tập</option>
              <option value="admin">Quản trị viên</option>
              {isSuperAdmin && <option value="super_admin">Super Admin</option>}
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.is_active} onChange={(e) => handleChange('is_active', e.target.checked)} /> Hoạt động
          </label>
        </form>

        {form.role !== 'super_admin' && (
          <>
            <div className="page-assign-block">
              <h3>Gán fanpage</h3>
              <p className="text-muted">Tick fanpage rồi bấm <strong>Cập nhật</strong> để lưu. Admin chỉ thấy fanpage đã tick ở đây hoặc khi super admin gán lúc tạo fanpage mới.</p>
              <div className="page-assign-grid">
                {allPages.map((page) => (
                  <label key={page.id} className="checkbox-label page-assign-item">
                    <input type="checkbox" checked={form.page_ids.some((id) => Number(id) === Number(page.id))} onChange={() => togglePage(page.id)} />
                    {page.name} <small>({page.page_id})</small>
                  </label>
                ))}
              </div>
            </div>
            <div className="page-assign-block">
              <h3>Gán AI provider</h3>
              <p className="text-muted">Admin dùng provider này khi cấu hình page và generate bài.</p>
              <div className="page-assign-grid">
                {allProviders.map((provider) => (
                  <label key={provider.id} className="checkbox-label page-assign-item">
                    <input type="checkbox" checked={form.provider_ids.some((id) => Number(id) === Number(provider.id))} onChange={() => toggleProvider(provider.id)} />
                    {provider.name} <small>({provider.type})</small>
                  </label>
                ))}
                {!allProviders.length && <p>Chưa có provider. Tạo ở mục AI Provider trước.</p>}
              </div>
            </div>
          </>
        )}

        <div className="header-actions" style={{ marginTop: 16 }}>
          <Button type="button" onClick={handleSubmit}>{editingId ? 'Cập nhật' : 'Tạo'}</Button>
          {editingId && <Button type="button" variant="secondary" onClick={resetForm}>Huỷ</Button>}
        </div>
      </div>

      <div className="card table-wrapper" style={{ marginTop: 24 }}>
        <table className="table">
          <thead>
            <tr><th>Tên</th><th>Username</th><th>Email</th><th>Vai trò</th><th>Fanpage</th><th>Provider</th><th>Hoạt động</th><th>Thao tác</th></tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td><code>{user.username || '—'}</code></td>
                <td>{user.email}</td>
                <td>{roleLabel(user.role)}</td>
                <td>{user.role === 'super_admin' ? 'Tất cả' : (
                  <strong style={Number(user.assigned_page_count) > 0 ? undefined : { color: 'var(--color-error)' }}>
                    {user.assigned_page_count ?? 0}
                  </strong>
                )}</td>
                <td>{user.role === 'super_admin' ? 'Tất cả' : (user.assigned_provider_count ?? '—')}</td>
                <td>{user.is_active ? 'Có' : 'Không'}</td>
                <td>
                  <Button type="button" variant="link" onClick={() => handleEdit(user)}>Sửa</Button>
                  <Button type="button" variant="link" onClick={() => handleDelete(user.id)}>Xóa</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>}
    </div>
  );
}
