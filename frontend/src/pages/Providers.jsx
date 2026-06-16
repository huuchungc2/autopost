import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, KeyRound, Plus } from 'lucide-react';
import api from '../services/api';
import Modal from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import { typeLabel } from '../config/providerPresets';

const PROVIDER_KINDS = [
  { value: 'openai', label: 'OpenAI-compatible (GPT, 9Router, OpenRouter…)' },
  { value: 'claude', label: 'Claude / Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'ideogram', label: 'Ideogram' },
];

const emptyCustomForm = {
  name: '',
  type: 'text',
  provider_kind: 'openai',
  api_endpoint: '',
  api_key: '',
  model: '',
};

export default function Providers() {
  const [templates, setTemplates] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [modelOverride, setModelOverride] = useState('');
  const [endpointOverride, setEndpointOverride] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState(emptyCustomForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    api_key: '', model: '', api_endpoint: '', provider_kind: '', is_active: true,
  });
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
        setEndpointOverride(templatesRes.data[0].api_endpoint || '');
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được providers', 'error');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selectedTemplate?.api_endpoint) {
      setEndpointOverride(selectedTemplate.api_endpoint);
    }
  }, [selectedTemplateId, selectedTemplate?.api_endpoint]);

  const resetCreateForm = () => {
    setApiKey('');
    setModelOverride('');
    setShowAdvanced(false);
    if (selectedTemplate?.api_endpoint) {
      setEndpointOverride(selectedTemplate.api_endpoint);
    }
  };

  const selectTemplate = (template) => {
    setSelectedTemplateId(template.id);
    setModelOverride('');
    setEndpointOverride(template.api_endpoint || '');
  };

  const handleQuickAdd = async () => {
    if (!selectedTemplate) {
      showToast('Chưa có template — restart backend để seed template', 'error');
      return;
    }
    if (!apiKey.trim()) {
      showToast('Dán API key vào ô trên', 'error');
      return;
    }
    if (!endpointOverride.trim()) {
      showToast('Nhập API endpoint', 'error');
      return;
    }
    const exists = providers.some(
      (p) => p.name === selectedTemplate.name && p.type === selectedTemplate.type
    );
    if (exists) {
      showToast(`Đã có "${selectedTemplate.name}" — dùng Sửa để cập nhật`, 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/providers', {
        template_id: selectedTemplate.id,
        api_key: apiKey.trim(),
        model: modelOverride.trim() || undefined,
        api_endpoint: endpointOverride.trim(),
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

  const handleCustomAdd = async () => {
    const { name, type, provider_kind, api_endpoint, api_key, model } = customForm;
    if (!name.trim() || !api_endpoint.trim() || !api_key.trim()) {
      showToast('Nhập tên, endpoint và API key', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/providers', {
        name: name.trim(),
        type,
        provider_kind,
        api_endpoint: api_endpoint.trim(),
        api_key: api_key.trim(),
        model: model.trim() || undefined,
        is_active: true,
      });
      showToast(`Đã thêm ${name.trim()}`, 'success');
      setCustomForm(emptyCustomForm);
      setShowCustomForm(false);
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tạo được provider', 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (provider) => {
    setEditingId(provider.id);
    setEditForm({
      api_key: '',
      model: provider.model || '',
      api_endpoint: provider.api_endpoint || '',
      provider_kind: provider.provider_kind || 'openai',
      is_active: !!provider.is_active,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ api_key: '', model: '', api_endpoint: '', provider_kind: '', is_active: true });
  };

  const handleUpdate = async () => {
    if (!editingProvider) return;
    if (!editForm.api_endpoint.trim()) {
      showToast('API endpoint không được để trống', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/providers/${editingId}`, {
        api_key: editForm.api_key || undefined,
        model: editForm.model,
        api_endpoint: editForm.api_endpoint.trim(),
        provider_kind: editForm.provider_kind,
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
      showToast(err.response?.data?.error || 'Thử provider thất bại — kiểm tra API key / endpoint', 'error');
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>AI Provider</h1>
          <p>
            Chọn template (OpenAI, 9Router, Claude…) → dán API key → chỉnh endpoint nếu cần.
            Gắn vào fanpage tại <Link to="/pages">Fanpage</Link>.
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowCustomForm((v) => !v)}
          >
            <Plus size={18} />
            {showCustomForm ? 'Ẩn form tùy chỉnh' : 'Provider tùy chỉnh'}
          </button>
        </div>
      </div>

      {showCustomForm && (
        <div className="card form-card" style={{ marginBottom: 24 }}>
          <h2>Thêm provider tùy chỉnh</h2>
          <p className="text-muted">Tự nhập tên, endpoint và loại — dùng cho gateway riêng hoặc API tương thích OpenAI.</p>
          <div className="modal-form-grid">
            <label>
              Tên hiển thị
              <input
                value={customForm.name}
                onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="VD: 9Router VPS"
              />
            </label>
            <label>
              Loại
              <select
                value={customForm.type}
                onChange={(e) => setCustomForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="text">Văn bản</option>
                <option value="image">Ảnh</option>
              </select>
            </label>
            <label>
              Kiểu API
              <select
                value={customForm.provider_kind}
                onChange={(e) => setCustomForm((f) => ({ ...f, provider_kind: e.target.value }))}
              >
                {PROVIDER_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </label>
            <label className="field-span-2">
              API endpoint
              <input
                value={customForm.api_endpoint}
                onChange={(e) => setCustomForm((f) => ({ ...f, api_endpoint: e.target.value }))}
                placeholder="https://your-gateway.com/v1/chat/completions"
              />
            </label>
            <label>
              API key
              <input
                type="password"
                value={customForm.api_key}
                onChange={(e) => setCustomForm((f) => ({ ...f, api_key: e.target.value }))}
                autoComplete="off"
              />
            </label>
            <label>
              Model (tuỳ chọn)
              <input
                value={customForm.model}
                onChange={(e) => setCustomForm((f) => ({ ...f, model: e.target.value }))}
                placeholder="gpt-4o-mini / cc/claude-sonnet-4-5"
              />
            </label>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleCustomAdd} disabled={saving}>
            {saving ? 'Đang lưu...' : 'Thêm provider'}
          </button>
        </div>
      )}

      <div className="card provider-quick-add">
        <h2>Thêm từ template</h2>
        <p className="text-muted provider-quick-hint">
          Chọn loại AI → chỉnh endpoint (nếu cần) → dán key → Thêm.
        </p>

        {!templates.length ? (
          <div className="form-error">
            Chưa có template. Restart backend để seed template (hoặc chạy migration 002).
          </div>
        ) : (
          <>
            <div className="provider-preset-grid">
              {templates.map((template) => {
                const configured = providers.some(
                  (p) => p.template_id === template.id || (p.name === template.name && p.type === template.type)
                );
                const active = selectedTemplateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`provider-preset-card${active ? ' active' : ''}${configured ? ' configured' : ''}`}
                    onClick={() => selectTemplate(template)}
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
                <label className="provider-endpoint-field">
                  <span className="provider-endpoint-label">API endpoint</span>
                  <input
                    type="url"
                    value={endpointOverride}
                    onChange={(e) => setEndpointOverride(e.target.value)}
                    placeholder="https://..."
                  />
                  <small className="text-muted">
                    Mặc định từ template. 9Router local: <code>http://localhost:20128/v1/chat/completions</code>
                  </small>
                </label>

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
                  disabled={saving || !apiKey.trim() || !endpointOverride.trim()}
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
        subtitle="Cập nhật API key, endpoint, model"
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
            <label>
              API endpoint
              <input
                type="url"
                value={editForm.api_endpoint}
                onChange={(e) => setEditForm((f) => ({ ...f, api_endpoint: e.target.value }))}
                placeholder="https://..."
              />
            </label>
            <label>
              Kiểu API
              <select
                value={editForm.provider_kind}
                onChange={(e) => setEditForm((f) => ({ ...f, provider_kind: e.target.value }))}
              >
                {PROVIDER_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </label>
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
        <h3 style={{ margin: '0 0 12px' }}>Provider đã cấu hình</h3>
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
                  <button type="button" className="btn-link" onClick={() => handleTest(provider.id)}>Thử</button>
                  <button type="button" className="btn-link" onClick={() => startEdit(provider)}>Sửa</button>
                  <button type="button" className="btn-link" onClick={() => handleDelete(provider.id)}>Xóa</button>
                </td>
              </tr>
            ))}
            {!providers.length && (
              <tr>
                <td colSpan={6} className="text-muted">
                  Chưa có provider — chọn template hoặc thêm tùy chỉnh.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
