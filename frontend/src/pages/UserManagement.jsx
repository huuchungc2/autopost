import { useEffect, useState } from 'react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

const initialForm = {
  name: '',
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
  const { showToast } = useToast();

  const loadUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (err) {
      console.error(err);
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
    setForm((prev) => ({
      ...prev,
      page_ids: prev.page_ids.includes(pageId)
        ? prev.page_ids.filter((id) => id !== pageId)
        : [...prev.page_ids, pageId],
    }));
  };

  const toggleProvider = (providerId) => {
    setForm((prev) => ({
      ...prev,
      provider_ids: prev.provider_ids.includes(providerId)
        ? prev.provider_ids.filter((id) => id !== providerId)
        : [...prev.provider_ids, providerId],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        name: form.name,
        email: form.email,
        role: form.role,
        is_active: form.is_active,
        page_ids: form.role === 'super_admin' ? [] : form.page_ids,
        provider_ids: form.role === 'super_admin' ? [] : form.provider_ids,
      };
      if (editingId) {
        await api.put(`/users/${editingId}`, payload);
        showToast('User updated', 'success');
      } else {
        await api.post('/users', { ...payload, password: form.password });
        showToast('User created', 'success');
      }
      resetForm();
      loadUsers();
    } catch (err) {
      showToast(err.response?.data?.error || 'Unable to save user', 'error');
    }
  };

  const handleEdit = async (user) => {
    setEditingId(user.id);
    let pageIds = [];
    let providerIds = [];
    if (user.role !== 'super_admin') {
      try {
        const pagesRes = await api.get(`/users/${user.id}/pages`);
        pageIds = pagesRes.data.map((p) => p.id);
      } catch {
        pageIds = [];
      }
      try {
        const providersRes = await api.get(`/users/${user.id}/providers`);
        providerIds = providersRes.data.map((p) => p.id);
      } catch {
        providerIds = [];
      }
    }
    setForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'editor',
      is_active: !!user.is_active,
      page_ids: pageIds,
      provider_ids: providerIds,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      showToast('User deleted', 'success');
      loadUsers();
    } catch (err) {
      showToast(err.response?.data?.error || 'Unable to delete user', 'error');
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>User Management</h1>
          <p>Super admin gán page và AI provider cho từng admin.</p>
        </div>
      </div>

      <div className="card form-card">
        <h2>{editingId ? 'Edit User' : 'New User'}</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>Name<input value={form.name} onChange={(e) => handleChange('name', e.target.value)} required /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} required /></label>
          <label>
            Password
            <input type="password" value={form.password} onChange={(e) => handleChange('password', e.target.value)} placeholder={editingId ? 'Leave blank to keep' : ''} {...(editingId ? {} : { required: true })} />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(e) => handleChange('role', e.target.value)}>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.is_active} onChange={(e) => handleChange('is_active', e.target.checked)} /> Active
          </label>
        </form>

        {form.role !== 'super_admin' && (
          <>
            <div className="page-assign-block">
              <h3>Gán fanpage</h3>
              <div className="page-assign-grid">
                {allPages.map((page) => (
                  <label key={page.id} className="checkbox-label page-assign-item">
                    <input type="checkbox" checked={form.page_ids.includes(page.id)} onChange={() => togglePage(page.id)} />
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
                    <input type="checkbox" checked={form.provider_ids.includes(provider.id)} onChange={() => toggleProvider(provider.id)} />
                    {provider.name} <small>({provider.type})</small>
                  </label>
                ))}
                {!allProviders.length && <p>Chưa có provider. Tạo ở mục Providers trước.</p>}
              </div>
            </div>
          </>
        )}

        <div className="header-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>{editingId ? 'Update' : 'Create'}</button>
          {editingId && <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>}
        </div>
      </div>

      <div className="card table-wrapper" style={{ marginTop: 24 }}>
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.is_active ? 'Yes' : 'No'}</td>
                <td>
                  <button type="button" className="btn-link" onClick={() => handleEdit(user)}>Edit</button>
                  <button type="button" className="btn-link" onClick={() => handleDelete(user.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
