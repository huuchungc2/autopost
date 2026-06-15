import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../services/authContext';
import { useToast } from '../context/ToastContext';

const initialForm = {
  name: '',
  type: 'text',
  api_key: '',
  model: '',
  is_active: true,
};

export default function Providers() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const { showToast } = useToast();

  const loadProviders = async () => {
    try {
      const response = await api.get('/providers');
      setProviders(response.data);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load providers', 'error');
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      if (editingId) {
        await api.put(`/providers/${editingId}`, form);
        showToast('Provider updated', 'success');
      } else {
        if (!form.api_key) {
          showToast('API key is required for new provider', 'error');
          return;
        }
        await api.post('/providers', form);
        showToast('Provider created', 'success');
      }
      resetForm();
      loadProviders();
    } catch (err) {
      showToast(err.response?.data?.error || 'Unable to save provider', 'error');
    }
  };

  const handleEdit = (provider) => {
    setEditingId(provider.id);
    setForm({
      name: provider.name || '',
      type: provider.type || 'text',
      api_key: '',
      model: provider.model || '',
      is_active: !!provider.is_active,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this provider?')) return;
    try {
      await api.delete(`/providers/${id}`);
      showToast('Provider deleted', 'success');
      loadProviders();
    } catch (err) {
      showToast(err.response?.data?.error || 'Unable to delete provider', 'error');
    }
  };

  const handleTest = async (id) => {
    try {
      const response = await api.post(`/providers/${id}/test`);
      showToast(response.data.sample || 'Provider OK', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Test failed', 'error');
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>AI Providers</h1>
          <p>
            {isSuperAdmin
              ? 'Quản lý tất cả provider. Super admin có thể gán provider cho admin ở mục Users.'
              : 'Chỉ hiển thị provider được gán hoặc do bạn tạo. Dùng khi cấu hình page.'}
          </p>
        </div>
      </div>

      <div className="card form-card">
        <h2>{editingId ? 'Edit Provider' : 'New Provider'}</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>Name<input value={form.name} onChange={(e) => handleChange('name', e.target.value)} required /></label>
          <label>
            Type
            <select value={form.type} onChange={(e) => handleChange('type', e.target.value)}>
              <option value="text">Text</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
          </label>
          <label>
            API key
            <input value={form.api_key} onChange={(e) => handleChange('api_key', e.target.value)} placeholder={editingId ? 'Leave blank to keep existing key' : ''} {...(editingId ? {} : { required: true })} />
          </label>
          <label>Model<input value={form.model} onChange={(e) => handleChange('model', e.target.value)} placeholder="gpt-4o-mini, dall-e-3..." /></label>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.is_active} onChange={(e) => handleChange('is_active', e.target.checked)} /> Active
          </label>
        </form>
        <div className="header-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>{editingId ? 'Update' : 'Create'}</button>
          {editingId && <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>}
        </div>
      </div>

      <div className="card table-wrapper" style={{ marginTop: 24 }}>
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Model</th><th>Active</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.id}>
                <td>{provider.name}</td>
                <td>{provider.type}</td>
                <td>{provider.model || '-'}</td>
                <td>{provider.is_active ? 'Yes' : 'No'}</td>
                <td>
                  <button type="button" className="btn-link" onClick={() => handleTest(provider.id)}>Test</button>
                  <button type="button" className="btn-link" onClick={() => handleEdit(provider)}>Edit</button>
                  <button type="button" className="btn-link" onClick={() => handleDelete(provider.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {!providers.length && (
              <tr><td colSpan={5}>Chưa có provider. Tạo mới hoặc nhờ super admin gán.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
