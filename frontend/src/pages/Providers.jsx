import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../services/api';
import ProviderFamilyCard from '../components/ProviderFamilyCard';
import { useToast } from '../context/ToastContext';
import {
  PROVIDER_FAMILIES,
  groupProvidersByFamily,
  groupTemplatesByFamily,
} from '../utils/providerGroups';

function normalizeEndpointInput(raw, providerKind, type) {
  const value = (raw || '').trim();
  if (!value) return '';

  if (/\/v1\//i.test(value) || /generatecontent/i.test(value) || /\/messages\b/i.test(value) || /:predict\b/i.test(value)) return value;

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
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    api_key: '', model: '', api_endpoint: '', provider_kind: '', is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const templateGroups = useMemo(() => groupTemplatesByFamily(templates), [templates]);
  const providerGroups = useMemo(() => groupProvidersByFamily(providers, templates), [providers, templates]);

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

  const handleFormChange = (mode, field, value) => {
    if (mode === 'edit') {
      setEditForm((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleSlotAdd = async (template, addForm) => {
    if (!addForm.api_key?.trim()) {
      showToast('Dán API key', 'error');
      return;
    }
    const normalizedEndpoint = normalizeEndpointInput(
      addForm.endpoint,
      template.provider_kind || 'openai',
      template.type || 'text'
    );
    if (!normalizedEndpoint) {
      showToast('Nhập API endpoint', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/providers', {
        template_id: template.id,
        api_key: addForm.api_key.trim(),
        model: addForm.model?.trim() || undefined,
        api_endpoint: normalizedEndpoint,
        is_active: true,
      });
      showToast(`Đã thêm ${template.name}`, 'success');
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

  const handleUpdate = async (providerId) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;
    const normalizedEndpoint = normalizeEndpointInput(
      editForm.api_endpoint,
      editForm.provider_kind || provider.provider_kind || 'openai',
      provider.type || 'text'
    );
    if (!normalizedEndpoint) {
      showToast('API endpoint không được để trống', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/providers/${providerId}`, {
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
            Mỗi nhà cung cấp có <strong>Bài viết</strong> và <strong>Ảnh</strong> — cấu hình sẵn endpoint/model,
            chỉ cần dán API key ngay trên thẻ (không popup). Gắn fanpage tại <Link to="/pages">Fanpage</Link>.
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
          <div className="modal-form-grid">
            <label>
              Tên hiển thị
              <input
                value={customForm.name}
                onChange={(e) => setCustomForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="VD: Gateway riêng"
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
              editingId={editingId}
              editForm={editForm}
              onStartEdit={startEdit}
              onCancelEdit={cancelEdit}
              onSubmitEdit={handleUpdate}
              onSubmitAdd={handleSlotAdd}
              onAddFormChange={handleFormChange}
              onDelete={handleDelete}
              onTest={handleTest}
              providerKinds={PROVIDER_KINDS}
              saving={saving}
            />
          ))}
        </div>
      )}
    </div>
  );
}
