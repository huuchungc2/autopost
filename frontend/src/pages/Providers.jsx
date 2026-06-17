import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Plus } from 'lucide-react';
import api from '../services/api';
import Modal from '../components/ui/Modal';
import ProviderFamilyCard from '../components/ProviderFamilyCard';
import { useToast } from '../context/ToastContext';
import { typeLabel } from '../config/providerPresets';
import {
  PROVIDER_FAMILIES,
  groupProvidersByFamily,
  groupTemplatesByFamily,
} from '../utils/providerGroups';

function normalizeEndpointInput(raw, providerKind, type) {
  const value = (raw || '').trim();
  if (!value) return '';

  if (/\/v1\//i.test(value) || /generatecontent/i.test(value) || /\/messages\b/i.test(value)) return value;

  const base = value.replace(/\/+$/, '');
  if (providerKind === 'claude') return `${base}/v1/messages`;
  if (providerKind === 'gemini') return `${base}/v1beta/models/{model}:generateContent`;
  if (providerKind === 'ideogram') return `${base}/generate`;

  if (type === 'image') return `${base}/v1/images/generations`;
  return `${base}/v1/chat/completions`;
}

function endpointPreset(providerKind, type) {
  if (providerKind === 'claude') return 'https://api.anthropic.com/v1/messages';
  if (providerKind === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent';
  if (providerKind === 'ideogram') return 'https://api.ideogram.ai/generate';
  if (type === 'image') return 'https://api.openai.com/v1/images/generations';
  return 'https://api.openai.com/v1/chat/completions';
}

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
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState(emptyCustomForm);
  const [configSlot, setConfigSlot] = useState(null);
  const [configApiKey, setConfigApiKey] = useState('');
  const [configModel, setConfigModel] = useState('');
  const [configEndpoint, setConfigEndpoint] = useState('');
  const [configShowAdvanced, setConfigShowAdvanced] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    api_key: '', model: '', api_endpoint: '', provider_kind: '', is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const templateGroups = useMemo(() => groupTemplatesByFamily(templates), [templates]);
  const providerGroups = useMemo(() => groupProvidersByFamily(providers, templates), [providers, templates]);
  const editingProvider = providers.find((p) => p.id === editingId);
  const configTemplate = configSlot?.template;

  const loadAll = async () => {
    try {
      const [templatesRes, providersRes] = await Promise.all([
        api.get('/providers/templates'),
        api.get('/providers'),
      ]);
      setTemplates(templatesRes.data);
      setProviders(providersRes.data);
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được providers', 'error');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openConfigureSlot = ({ type, template }) => {
    if (template) {
      setConfigSlot({ type, template });
      setConfigApiKey('');
      setConfigModel('');
      setConfigEndpoint(template.api_endpoint || '');
      setConfigShowAdvanced(false);
      return;
    }
    setShowCustomForm(true);
    setCustomForm((prev) => ({
      ...emptyCustomForm,
      type,
      api_endpoint: endpointPreset('openai', type),
    }));
  };

  const closeConfigureSlot = () => {
    setConfigSlot(null);
    setConfigApiKey('');
    setConfigModel('');
    setConfigEndpoint('');
    setConfigShowAdvanced(false);
  };

  const handleSlotAdd = async () => {
    if (!configTemplate) return;
    if (!configApiKey.trim()) {
      showToast('Dán API key', 'error');
      return;
    }
    const normalizedEndpoint = normalizeEndpointInput(
      configEndpoint,
      configTemplate.provider_kind || 'openai',
      configTemplate.type || 'text'
    );
    if (!normalizedEndpoint) {
      showToast('Nhập API endpoint', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/providers', {
        template_id: configTemplate.id,
        api_key: configApiKey.trim(),
        model: configModel.trim() || undefined,
        api_endpoint: normalizedEndpoint,
        is_active: true,
      });
      showToast(`Đã thêm ${configTemplate.name}`, 'success');
      closeConfigureSlot();
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tạo được provider', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCustomAdd = async () => {
    const { name, type, provider_kind, api_endpoint, api_key, model } = customForm;
    const normalizedEndpoint = normalizeEndpointInput(api_endpoint, provider_kind, type);
    if (!name.trim() || !normalizedEndpoint || !api_key.trim()) {
      showToast('Nhập tên, API endpoint và API key', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/providers', {
        name: name.trim(),
        type,
        provider_kind,
        api_endpoint: normalizedEndpoint,
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
    const normalizedEndpoint = normalizeEndpointInput(
      editForm.api_endpoint,
      editForm.provider_kind || editingProvider.provider_kind || 'openai',
      editingProvider.type || 'text'
    );
    if (!normalizedEndpoint) {
      showToast('API endpoint không được để trống', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/providers/${editingId}`, {
        api_key: editForm.api_key || undefined,
        model: editForm.model,
        api_endpoint: normalizedEndpoint,
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
            Mỗi nhà cung cấp có <strong>2 loại</strong>: bài viết và ảnh. Cấu hình mặc định hoặc thêm nhiều bản ghi.
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
                <option value="text">Bài viết</option>
                <option value="image">Ảnh</option>
              </select>
            </label>
            <label>
              Kiểu API
              <select
                value={customForm.provider_kind}
                onChange={(e) => {
                  const nextKind = e.target.value;
                  setCustomForm((f) => ({
                    ...f,
                    provider_kind: nextKind,
                    api_endpoint: f.api_endpoint || endpointPreset(nextKind, f.type),
                  }));
                }}
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
                placeholder="Dán full endpoint hoặc chỉ base URL"
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
                placeholder="gpt-4o-mini / dall-e-3"
              />
            </label>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleCustomAdd} disabled={saving}>
            {saving ? 'Đang lưu...' : 'Thêm provider'}
          </button>
        </div>
      )}

      {!templates.length ? (
        <div className="card form-error">
          Chưa có template. Restart backend để seed template (hoặc chạy migration 002).
        </div>
      ) : (
        <div className="provider-family-grid">
          {PROVIDER_FAMILIES.map((family) => (
            <ProviderFamilyCard
              key={family.id}
              family={family}
              textTemplate={templateGroups[family.id]?.text}
              imageTemplate={templateGroups[family.id]?.image}
              textProviders={providerGroups[family.id]?.text || []}
              imageProviders={providerGroups[family.id]?.image || []}
              onConfigure={openConfigureSlot}
              onEdit={startEdit}
              onDelete={handleDelete}
              onTest={handleTest}
            />
          ))}
        </div>
      )}

      <Modal
        open={!!configSlot && !!configTemplate}
        title={configTemplate ? `Cấu hình ${configTemplate.name}` : 'Cấu hình provider'}
        subtitle={configTemplate ? `${typeLabel(configTemplate.type)} · ${configTemplate.description}` : ''}
        onClose={closeConfigureSlot}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={closeConfigureSlot}>Huỷ</button>
            <button type="button" className="btn btn-primary" onClick={handleSlotAdd} disabled={saving || !configApiKey.trim()}>
              {saving ? 'Đang lưu...' : 'Thêm provider'}
            </button>
          </>
        )}
      >
        {configTemplate && (
          <div className="modal-form">
            <label className="provider-endpoint-field">
              <span className="provider-endpoint-label">API endpoint</span>
              <input
                type="url"
                value={configEndpoint}
                onChange={(e) => setConfigEndpoint(e.target.value)}
                placeholder="Dán full endpoint hoặc chỉ base URL"
              />
              <small className="text-muted">
                Mặc định từ template. Có thể dán base URL — hệ thống tự thêm path đúng.
              </small>
            </label>

            <label className="provider-key-field">
              <span className="provider-key-label">
                <KeyRound size={16} />
                {configTemplate.key_label || 'API Key'}
              </span>
              <input
                type="password"
                value={configApiKey}
                onChange={(e) => setConfigApiKey(e.target.value)}
                placeholder={configTemplate.key_placeholder || 'Dán API key...'}
                autoComplete="off"
              />
              <small className="text-muted">{configTemplate.key_help}</small>
            </label>

            <button
              type="button"
              className="btn-link provider-advanced-toggle"
              onClick={() => setConfigShowAdvanced((v) => !v)}
            >
              {configShowAdvanced ? 'Ẩn tùy chọn model' : 'Đổi model (tuỳ chọn)'}
            </button>
            {configShowAdvanced && (
              <label>
                Model
                <input
                  value={configModel}
                  onChange={(e) => setConfigModel(e.target.value)}
                  placeholder={configTemplate.default_model}
                />
              </label>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!editingId && !!editingProvider}
        title={`Sửa ${editingProvider?.name || 'provider'}`}
        subtitle={`${typeLabel(editingProvider?.type)} · cập nhật API key, endpoint, model`}
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
                placeholder="Dán full endpoint hoặc chỉ base URL"
              />
              <small className="text-muted">
                Gợi ý: <code>{endpointPreset(editForm.provider_kind || 'openai', editingProvider.type || 'text')}</code>
              </small>
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
    </div>
  );
}
