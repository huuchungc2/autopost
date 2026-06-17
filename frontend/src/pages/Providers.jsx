import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../services/api';
import ProviderFamilyCard from '../components/ProviderFamilyCard';
import { ProviderSetupPanel } from '../components/ProviderSetupPanel';
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

const emptyAddForm = (template) => ({
  api_key: '',
  endpoint: template?.api_endpoint || '',
  model: '',
});

export default function Providers() {
  const [templates, setTemplates] = useState([]);
  const [providers, setProviders] = useState([]);
  const [panel, setPanel] = useState(null);
  const [addForm, setAddForm] = useState(emptyAddForm(null));
  const [editForm, setEditForm] = useState({
    api_key: '', model: '', api_endpoint: '', provider_kind: '', is_active: true,
  });
  const [customForm, setCustomForm] = useState(emptyCustomForm);
  const [saving, setSaving] = useState(false);
  const panelRef = useRef(null);
  const { showToast } = useToast();

  const templateGroups = useMemo(() => groupTemplatesByFamily(templates), [templates]);
  const providerGroups = useMemo(() => groupProvidersByFamily(providers, templates), [providers, templates]);

  const activePanelKey = panel?.family?.id && panel?.slotType
    ? `${panel.family.id}:${panel.slotType}`
    : null;

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

  const scrollToPanel = () => {
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const closePanel = () => {
    setPanel(null);
    setAddForm(emptyAddForm(null));
    setEditForm({ api_key: '', model: '', api_endpoint: '', provider_kind: '', is_active: true });
    setCustomForm(emptyCustomForm);
  };

  const openAddPanel = ({ family, slotLabel, slotType, template }) => {
    setPanel({ mode: 'add', family, slotLabel, slotType, template });
    setAddForm(emptyAddForm(template));
    scrollToPanel();
  };

  const openEditPanel = ({ family, slotLabel, slotType, template, provider }) => {
    setPanel({ mode: 'edit', family, slotLabel, slotType, template, provider });
    setEditForm({
      api_key: '',
      model: provider.model || '',
      api_endpoint: provider.api_endpoint || '',
      provider_kind: provider.provider_kind || 'openai',
      is_active: !!provider.is_active,
    });
    scrollToPanel();
  };

  const openCustomPanel = () => {
    setPanel({ mode: 'custom' });
    setCustomForm(emptyCustomForm);
    scrollToPanel();
  };

  const handleSlotAdd = async () => {
    const template = panel?.template;
    if (!template) return;
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
      closePanel();
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
      closePanel();
      loadAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tạo được provider', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    const provider = panel?.provider;
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
      await api.put(`/providers/${provider.id}`, {
        api_key: editForm.api_key || undefined,
        model: editForm.model,
        api_endpoint: normalizedEndpoint,
        provider_kind: editForm.provider_kind,
        is_active: editForm.is_active,
      });
      showToast('Đã cập nhật provider', 'success');
      closePanel();
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
      if (panel?.provider?.id === id) closePanel();
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

  const panelTitle = panel?.mode === 'custom'
    ? 'Thêm provider tùy chỉnh'
    : panel?.mode === 'edit'
      ? `Sửa ${panel.provider?.name || 'provider'}`
      : panel
        ? `Cấu hình ${panel.family?.label} · ${panel.slotLabel}`
        : '';

  const panelSubtitle = panel?.mode === 'add'
    ? 'Dán API key — endpoint và model đã điền sẵn từ template'
    : panel?.mode === 'edit'
      ? 'Để trống API key nếu giữ key cũ'
      : panel?.mode === 'custom'
        ? 'Gateway riêng hoặc API tương thích OpenAI'
        : '';

  return (
    <div className="page-shell providers-page">
      <div className="page-header">
        <div>
          <h1>AI Provider</h1>
          <p>Thêm API key cho từng nhà cung cấp — form nhập liệu hiện ở <strong>khung phía dưới</strong> khi bấm Cấu hình.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-secondary" onClick={openCustomPanel}>
            <Plus size={18} />
            Provider tùy chỉnh
          </button>
        </div>
      </div>

      <div className="provider-flow-card card">
        <h2 className="provider-flow-title">Luồng sử dụng</h2>
        <ol className="provider-flow-steps">
          <li>
            <strong>Bước 1 — Tạo provider</strong>
            <span>Bấm <em>Cấu hình</em> trên thẻ nhà cung cấp → dán API key ở khung bên dưới → Lưu.</span>
          </li>
          <li>
            <strong>Bước 2 — Gắn vào fanpage</strong>
            <span>Vào <Link to="/pages">Fanpage</Link> → Sửa fanpage → chọn <em>Skill AI</em> + <em>Text/Image Provider</em> → Lưu.</span>
          </li>
        </ol>
      </div>

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
              activePanelKey={activePanelKey}
              onOpenAdd={openAddPanel}
              onOpenEdit={openEditPanel}
              onDelete={handleDelete}
              onTest={handleTest}
            />
          ))}
        </div>
      )}

      <div ref={panelRef}>
        {panel?.mode === 'add' && (
          <ProviderSetupPanel
            title={panelTitle}
            subtitle={panelSubtitle}
            template={panel.template}
            endpoint={addForm.endpoint}
            onEndpointChange={(v) => setAddForm((f) => ({ ...f, endpoint: v }))}
            apiKey={addForm.api_key}
            onApiKeyChange={(v) => setAddForm((f) => ({ ...f, api_key: v }))}
            model={addForm.model}
            onModelChange={(v) => setAddForm((f) => ({ ...f, model: v }))}
            saving={saving}
            onSave={handleSlotAdd}
            onClose={closePanel}
            saveLabel="Lưu cấu hình"
            requireApiKey
          />
        )}

        {panel?.mode === 'edit' && (
          <ProviderSetupPanel
            title={panelTitle}
            subtitle={panelSubtitle}
            template={panel.template}
            endpoint={editForm.api_endpoint}
            onEndpointChange={(v) => setEditForm((f) => ({ ...f, api_endpoint: v }))}
            apiKey={editForm.api_key}
            onApiKeyChange={(v) => setEditForm((f) => ({ ...f, api_key: v }))}
            model={editForm.model}
            onModelChange={(v) => setEditForm((f) => ({ ...f, model: v }))}
            providerKind={editForm.provider_kind}
            onProviderKindChange={(v) => setEditForm((f) => ({ ...f, provider_kind: v }))}
            providerKinds={PROVIDER_KINDS}
            isActive={editForm.is_active}
            onIsActiveChange={(v) => setEditForm((f) => ({ ...f, is_active: v }))}
            showActiveToggle
            saving={saving}
            onSave={handleUpdate}
            onClose={closePanel}
            saveLabel="Lưu thay đổi"
            requireApiKey={false}
          />
        )}

        {panel?.mode === 'custom' && (
          <ProviderSetupPanel
            title={panelTitle}
            subtitle={panelSubtitle}
            endpoint={customForm.api_endpoint}
            onEndpointChange={(v) => setCustomForm((f) => ({ ...f, api_endpoint: v }))}
            apiKey={customForm.api_key}
            onApiKeyChange={(v) => setCustomForm((f) => ({ ...f, api_key: v }))}
            model={customForm.model}
            onModelChange={(v) => setCustomForm((f) => ({ ...f, model: v }))}
            saving={saving}
            onSave={handleCustomAdd}
            onClose={closePanel}
            saveLabel="Thêm provider"
            requireApiKey
            customFields={(
              <div className="provider-setup-form modal-form-grid" style={{ marginBottom: 8 }}>
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
                <label className="field-span-2">
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
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
