import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, KeyRound } from 'lucide-react';
import api from '../services/api';
import Modal from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import { typeLabel } from '../config/providerPresets';

export default function Providers() {
  const [templates, setTemplates] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [modelOverride, setModelOverride] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ api_key: '', model: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];
  const editingProvider = providers.find((p) => p.id === editingId);

  const loadAll = async () => {
    try {
      const [templatesRes, providersRes] = await Promise.all([
        api.get('/providers/templates'),
        api.get('/providers'),
      ]);
      setTemplates(templatesRes.data);
      setProviders(providersRes.data);
      if (!selectedTemplateId && templatesRes.data.length) {
        setSelectedTemplateId(templatesRes.data[0].id);
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được providers', 'error');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const resetCreateForm = () => {
    setApiKey('');
    setModelOverride('');
    setShowAdvanced(false);
  };

  const handleQuickAdd = async () => {
    if (!selectedTemplate) {
      showToast('Chưa có template — chạy migration DB và restart backend', 'error');
      return;
    }
    if (!apiKey.trim()) {
      showToast('Dán API key vào ô trên', 'error');
      return;
    }
    const exists = providers.some(
      (p) => p.name === selectedTemplate.name && p.type === selectedTemplate.type
    );
    if (exists) {
      showToast(`Đã có "${selectedTemplate.name}" — dùng Sửa để đổi key`, 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/providers', {
        template_id: selectedTemplate.id,
        api_key: apiKey.trim(),
        model: modelOverride.trim() || undefined,
        is_active: true,
      });
      showToast(`Đã thêm ${selectedTemplate.name}`, 'success');
      resetCreateForm();
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tạo được provider', 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (provider) => {
    setEditingId(provider.id);
    setEditForm({ api_key: '', model: provider.model || '', is_active: !!provider.is_active });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ api_key: '', model: '', is_active: true });
  };

  const handleUpdate = async () => {
    if (!editingProvider) return;
    setSaving(true);
    try {
      await api.put(`/providers/${editingId}`, {
        api_key: editForm.api_key || undefined,
        model: editForm.model,
        is_active: editForm.is_active,
      });
      showToast('Đã cập nhật provider', 'success');
      cancelEdit();
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Không cập nhật được', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa provider này?')) return;
    try {
      await api.delete(`/providers/${id}`);
      showToast('Đã xóa', 'success');
      if (editingId === id) cancelEdit();
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Không xóa được', 'error');
    }
  };

  const handleTest = async (id) => {
    try {
      const response = await api.post(`/providers/${id}/test`);
      const sample = response.data.sample || response.data.message || 'OK';
      showToast(typeof sample === 'string' ? sample.slice(0, 120) : 'Test thành công', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Test thất bại — kiểm tra API key', 'error');
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>AI Providers</h1>
          <p>
            Template lưu trong DB (endpoint, model mặc định) — bạn chỉ dán API key.
            Gắn vào fanpage tại <Link to="/pages">Pages</Link>.
          </p>
        </div>
      </div>

      <div className="card provider-quick-add">
        <h2>Thêm provider — chỉ cần API key</h2>
        <p className="text-muted provider-quick-hint">
          Chọn loại AI → dán key → Thêm. Endpoint &amp; model lấy từ database.
        </p>

        {!templates.length ? (
          <div className="form-error">
            Chưa có template trong DB. Chạy <code>backend/migrations/002_provider_templates.sql</code> rồi restart backend.
          </div>
        ) : (
          <>
            <div className="provider-preset-grid">
              {templates.map((template) => {
                const configured = providers.some((p) => p.template_id === template.id || (p.name === template.name && p.type === template.type));
                const active = selectedTemplateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`provider-preset-card${active ? ' active' : ''}${configured ? ' configured' : ''}`}
                    onClick={() => {
                      setSelectedTemplateId(template.id);
                      setModelOverride('');
                    }}
                  >
                    {configured && (
                      <span className="provider-preset-badge" title="Đã cấu hình">
                        <Check size={12} />
                      </span>
                    )}
                    <span className="provider-preset-type">{typeLabel(template.type)}</span>
                    <strong>{template.name}</strong>
                    <span className="provider-preset-desc">{template.description}</span>
                    <code className="provider-preset-model">{template.default_model}</code>
                  </button>
                );
              })}
            </div>

            {selectedTemplate && (
              <div className="provider-selected-detail">
                <div className="provider-endpoint-box">
                  <span className="provider-endpoint-label">API endpoint (lưu DB)</span>
                  <code>{selectedTemplate.api_endpoint}</code>
                </div>

                <label className="provider-key-field">
                  <span className="provider-key-label">
                    <KeyRound size={16} />
                    {selectedTemplate.key_label || 'API Key'}
                  </span>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={selectedTemplate.key_placeholder || 'Dán API key...'}
                    autoComplete="off"
                  />
                  <small className="text-muted">{selectedTemplate.key_help}</small>
                </label>

                <button
                  type="button"
                  className="btn-link provider-advanced-toggle"
                  onClick={() => setShowAdvanced((v) => !v)}
                >
                  {showAdvanced ? 'Ẩn tùy chọn model' : 'Đổi model (tuỳ chọn)'}
                </button>
                {showAdvanced && (
                  <label>
                    Model
                    <input
                      value={modelOverride}
                      onChange={(e) => setModelOverride(e.target.value)}
                      placeholder={selectedTemplate.default_model}
                    />
                  </label>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleQuickAdd}
                  disabled={saving || !apiKey.trim()}
                >
                  {saving ? 'Đang lưu...' : `Thêm ${selectedTemplate.name}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Modal
        open={!!editingId && !!editingProvider}
        title={`Sửa ${editingProvider?.name || 'provider'}`}
        subtitle="Đổi API key hoặc model — endpoint lấy từ template trong DB"
        onClose={cancelEdit}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={cancelEdit}>Huỷ</button>
            <button type="button" className="btn btn-primary" onClick={handleUpdate} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </>
        )}
      >
        {editingProvider && (
          <div className="modal-form">
            <div className="provider-endpoint-box">
              <span className="provider-endpoint-label">Endpoint (DB)</span>
              <code>{editingProvider.api_endpoint || '—'}</code>
            </div>
            <label>
              API key mới
              <input
                type="password"
                value={editForm.api_key}
                onChange={(e) => setEditForm((f) => ({ ...f, api_key: e.target.value }))}
                placeholder="Để trống nếu giữ key cũ"
                autoComplete="off"
              />
            </label>
            <label>
              Model
              <input
                value={editForm.model}
                onChange={(e) => setEditForm((f) => ({ ...f, model: e.target.value }))}
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={editForm.is_active}
                onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Provider đang bật
            </label>
          </div>
        )}
      </Modal>

      <div className="card table-wrapper" style={{ marginTop: 24 }}>
        <h3 style={{ margin: '0 0 12px' }}>Provider đã cấu hình (key trong DB)</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Loại</th>
              <th>Model</th>
              <th>Endpoint</th>
              <th>Bật</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.id}>
                <td><strong>{provider.name}</strong></td>
                <td>{typeLabel(provider.type)}</td>
                <td><code>{provider.model || '—'}</code></td>
                <td className="provider-endpoint-cell">
                  <code>{provider.api_endpoint || '—'}</code>
                </td>
                <td>{provider.is_active ? 'Có' : 'Không'}</td>
                <td>
                  <button type="button" className="btn-link" onClick={() => handleTest(provider.id)}>Test</button>
                  <button type="button" className="btn-link" onClick={() => startEdit(provider)}>Sửa key</button>
                  <button type="button" className="btn-link" onClick={() => handleDelete(provider.id)}>Xóa</button>
                </td>
              </tr>
            ))}
            {!providers.length && (
              <tr>
                <td colSpan={6} className="text-muted">
                  Chưa có provider — chọn template và dán API key.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
