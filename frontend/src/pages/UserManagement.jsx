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
const ACCOUNT_STATUS_COLOR = { active: '#15803d', suspended: '#b91c1c' };

function fmtDate(v) { return v ? new Date(v).toLocaleDateString('vi') : '—'; }
function fmtDatetime(v) { return v ? new Date(v).toLocaleString('vi') : '—'; }

function GFUserDetail({ userId, onDeviceChange }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('groups');
  const { showToast } = useToast();

  const load = () => {
    api.get(`/user-auth/admin/users/${userId}/detail`).then((r) => setData(r.data)).catch(() => {});
  };

  useEffect(load, [userId]);

  const removeDevice = async (deviceRowId) => {
    try {
      await api.delete(`/user-auth/admin/users/${userId}/devices/${deviceRowId}`);
      showToast('Đã gỡ thiết bị', 'success');
      load();
      onDeviceChange?.();
    } catch {
      showToast('Lỗi gỡ thiết bị', 'error');
    }
  };

  if (!data) return <p style={{ padding: '8px 0', color: 'var(--text-secondary)', fontSize: 13 }}>Đang tải…</p>;

  return (
    <div style={{ padding: '10px 0' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {[
          ['groups', `Nhóm (${data.groups.length})`],
          ['posts', `Bài gần đây (${data.posts.length})`],
          ['devices', `Thiết bị (${data.devices.length}/${data.deviceLimit ?? '—'})`],
        ].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{
            padding: '4px 12px', border: '1px solid', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            background: tab === k ? 'var(--color-primary)' : '#fff',
            color: tab === k ? '#fff' : 'var(--text-secondary)',
            borderColor: tab === k ? 'var(--color-primary)' : 'var(--bg-border)',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'groups' && (
        <table className="table" style={{ fontSize: 12 }}>
          <thead><tr><th>Tên nhóm</th><th>Group ID</th><th>Số bài</th><th>Lần cuối đăng</th></tr></thead>
          <tbody>
            {!data.groups.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>Chưa có nhóm nào</td></tr>}
            {data.groups.map((g) => (
              <tr key={g.group_id}>
                <td>{g.group_name || '—'}</td>
                <td><code style={{ fontSize: 11 }}>{g.group_id}</code></td>
                <td>{g.post_count}</td>
                <td>{fmtDatetime(g.last_posted_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'posts' && (
        <table className="table" style={{ fontSize: 12 }}>
          <thead><tr><th>Nhóm</th><th>Post ID</th><th>Nội dung</th><th>Đăng lúc</th><th>Comment</th></tr></thead>
          <tbody>
            {!data.posts.length && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>Chưa có bài nào</td></tr>}
            {data.posts.map((p) => (
              <tr key={p.id}>
                <td>{p.group_name || p.group_id}</td>
                <td><code style={{ fontSize: 11 }}>{p.post_id}</code></td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.noi_dung || '—'}</td>
                <td>{fmtDatetime(p.posted_at)}</td>
                <td style={{ color: p.needs_comment ? '#b45309' : '#15803d' }}>{p.needs_comment ? 'Chờ comment' : 'Đã comment'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'devices' && (
        <table className="table" style={{ fontSize: 12 }}>
          <thead><tr><th>Thiết bị</th><th>Lần đầu kích hoạt</th><th>Hoạt động lần cuối</th><th></th></tr></thead>
          <tbody>
            {!data.devices.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>Chưa có thiết bị nào kích hoạt key này</td></tr>}
            {data.devices.map((d) => (
              <tr key={d.id} style={d.stale ? { opacity: 0.55 } : undefined}>
                <td>
                  <div>{d.device_label || 'Không rõ'}{d.stale && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--color-warning)' }}>⏳ hết hạn (không tính vào giới hạn)</span>}</div>
                  <code style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{d.device_id.slice(0, 12)}…</code>
                </td>
                <td>{fmtDatetime(d.first_seen_at)}</td>
                <td>{fmtDatetime(d.last_seen_at)}</td>
                <td>
                  <Button type="button" variant="link" style={{ fontSize: 12, color: 'var(--color-error)' }} onClick={() => removeDevice(d.id)}>Gỡ</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GroupFlowUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
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
      setExpandedId(null);
      load();
    } catch {
      showToast('Lỗi xóa', 'error');
    }
  };

  const copyKey = (key) => {
    navigator.clipboard.writeText(key).then(() => showToast('Đã copy license key', 'success'));
  };

  const totalPosts = users.reduce((s, u) => s + Number(u.post_count || 0), 0);
  const activeUsers = users.filter((u) => u.status === 'active' && u.key_status === 'active').length;

  if (loading) return <p style={{ padding: 16, color: 'var(--text-secondary)' }}>Đang tải…</p>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[
          ['Tổng user', users.length, '#2563eb'],
          ['Đang active', activeUsers, '#15803d'],
          ['Tổng bài đăng', totalPosts, 'var(--color-warning)'],
        ].map(([label, val, color]) => (
          <div key={label} className="card" style={{ flex: 1, padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div className="card table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>Email / Tên</th>
              <th>Điện thoại</th>
              <th>License Key</th>
              <th>Plan</th>
              <th>Key</th>
              <th>Thiết bị</th>
              <th>Nhóm</th>
              <th>Bài đăng</th>
              <th>Hoạt động lần cuối</th>
              <th>Tài khoản</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {!users.length && (
              <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>Chưa có user nào</td></tr>
            )}
            {users.map((u) => [
              <tr key={u.id} style={{ cursor: 'pointer' }}>
                <td onClick={() => setExpandedId(expandedId === u.id ? null : u.id)} style={{ width: 24, userSelect: 'none', color: 'var(--text-secondary)' }}>
                  {expandedId === u.id ? '▾' : '▸'}
                </td>
                <td onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{u.email}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Đăng ký {fmtDate(u.created_at)}</div>
                </td>
                <td style={{ fontSize: 12 }}>{u.phone || '—'}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <code style={{ fontSize: 10 }}>{u.key_value ? u.key_value.slice(0, 16) + '…' : '—'}</code>
                    {u.key_value && (
                      <button type="button" onClick={() => copyKey(u.key_value)} title="Copy key" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--color-primary)', fontSize: 13 }}>⎘</button>
                    )}
                  </div>
                </td>
                <td>
                  <select value={u.plan || 'free'} onChange={(e) => update(u.id, { plan: e.target.value })} style={{ fontSize: 12, padding: '2px 4px' }}>
                    <option value="free">Miễn phí</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </td>
                <td style={{ fontSize: 12 }}>{KEY_STATUS_LABEL[u.key_status] || u.key_status || '—'}</td>
                <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: Number(u.device_count) >= Number(u.device_limit) ? 'var(--color-error)' : 'var(--text-secondary)' }}>
                  {u.device_count ?? 0}/{u.device_limit ?? '—'}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 600, color: Number(u.group_count) > 0 ? '#2563eb' : 'var(--text-tertiary)' }}>{u.group_count || 0}</td>
                <td style={{ textAlign: 'center', fontWeight: 600, color: Number(u.post_count) > 0 ? 'var(--color-warning)' : 'var(--text-tertiary)' }}>{u.post_count || 0}</td>
                <td style={{ fontSize: 12 }}>{fmtDatetime(u.last_post_at || u.last_validated_at)}</td>
                <td>
                  <select value={u.status} onChange={(e) => update(u.id, { status: e.target.value })} style={{ fontSize: 12, padding: '2px 4px', color: ACCOUNT_STATUS_COLOR[u.status] || undefined }}>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <Button type="button" variant="link" style={{ fontSize: 12 }} onClick={() => update(u.id, { key_status: u.key_status === 'active' ? 'suspended' : 'active' })}>
                    {u.key_status === 'active' ? 'Khóa key' : 'Mở key'}
                  </Button>
                  <Button type="button" variant="link" style={{ fontSize: 12, color: 'var(--color-error)' }} onClick={() => remove(u.id, u.email)}>Xóa</Button>
                </td>
              </tr>,
              expandedId === u.id && (
                <tr key={`${u.id}-detail`}>
                  <td></td>
                  <td colSpan={11} style={{ background: '#f8fafc', paddingTop: 0, paddingBottom: 8 }}>
                    <GFUserDetail userId={u.id} onDeviceChange={load} />
                  </td>
                </tr>
              ),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 2026-07-11 — ĐÃ THỬ thêm 1 khu tự lấy license key ở đây, nhưng phát hiện TRÙNG LẶP với tính năng
// đã có sẵn: "License key của tôi" trong trang Cài đặt (`GroupExtensionSettings.jsx`, gọi
// `/api/auth/my-license`) — mọi role (kể cả admin/super_admin) đã tự lấy được key ở đó từ trước.
// Đã xoá bỏ hẳn phần trùng lặp (component `MyGroupFlowKey` + route `GET /admin/my-key`).

const initialForm = {
  name: '',
  username: '',
  email: '',
  password: '',
  role: 'editor',
  is_active: true,
  page_ids: [],
  provider_ids: [],
  website_ids: [],
};

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [allPages, setAllPages] = useState([]);
  const [allProviders, setAllProviders] = useState([]);
  const [allWebsites, setAllWebsites] = useState([]);
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

  const loadWebsites = async () => {
    try {
      const response = await api.get('/websites');
      setAllWebsites(response.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadUsers();
    loadPages();
    loadProviders();
    loadWebsites();
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

  const toggleWebsite = (websiteId) => {
    const id = Number(websiteId);
    setForm((prev) => ({
      ...prev,
      website_ids: prev.website_ids.some((x) => Number(x) === id)
        ? prev.website_ids.filter((x) => Number(x) !== id)
        : [...prev.website_ids, id],
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
        website_ids: form.role === 'super_admin' ? [] : form.website_ids.map(Number).filter(Boolean),
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
    await loadWebsites();
    let pageIds = [];
    let providerIds = [];
    let websiteIds = [];
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
      try {
        const websitesRes = await api.get(`/users/${user.id}/websites`);
        websiteIds = websitesRes.data.map((w) => Number(w.id)).filter(Boolean);
      } catch {
        websiteIds = [];
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
      website_ids: websiteIds,
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
              <h3>Gán website (blog)</h3>
              <p className="text-muted">Tick website rồi bấm <strong>Cập nhật</strong>. User chỉ thấy/sửa bài blog của website đã tick — chưa tick website nào thì không thấy bài blog nào.</p>
              <div className="page-assign-grid">
                {allWebsites.map((website) => (
                  <label key={website.id} className="checkbox-label page-assign-item">
                    <input type="checkbox" checked={form.website_ids.some((id) => Number(id) === Number(website.id))} onChange={() => toggleWebsite(website.id)} />
                    {website.name} <small>({website.domain})</small>
                  </label>
                ))}
                {!allWebsites.length && <p>Chưa có website. Tạo ở mục Cấu hình Website trước.</p>}
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
