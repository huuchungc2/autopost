import { useEffect, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { ProviderInlineForm } from './ProviderInlineForm';

const emptyAddForm = (template) => ({
  api_key: '',
  endpoint: template?.api_endpoint || '',
  model: '',
  show_model: false,
});

function ProviderSlot({
  slotLabel,
  template,
  providers,
  editingId,
  editForm,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onSubmitAdd,
  onAddFormChange,
  onDelete,
  onTest,
  providerKinds,
  saving,
}) {
  const [addForm, setAddForm] = useState(() => emptyAddForm(template));
  const [showExtraAdd, setShowExtraAdd] = useState(false);

  useEffect(() => {
    setAddForm(emptyAddForm(template));
    setShowExtraAdd(false);
  }, [template?.id]);

  const hasTemplate = Boolean(template);
  const configured = providers.length > 0;
  const isAdding = hasTemplate && (providers.length === 0 || showExtraAdd);

  const handleAddField = (field, value) => {
    setAddForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className={`provider-slot${configured ? ' provider-slot--configured' : ''}`}>
      <div className="provider-slot-head">
        <span className="provider-slot-type">{slotLabel}</span>
        {configured && (
          <span className="provider-slot-badge" title="Đã cấu hình">
            <Check size={12} />
          </span>
        )}
      </div>

      {template && (
        <p className="provider-slot-template-hint">{template.description}</p>
      )}

      {configured && (
        <ul className="provider-slot-list">
          {providers.map((provider) => (
            <li key={provider.id} className="provider-slot-item">
              {editingId === provider.id ? (
                <ProviderInlineForm
                  template={template}
                  endpoint={editForm.api_endpoint}
                  onEndpointChange={(v) => onAddFormChange('edit', 'api_endpoint', v)}
                  apiKey={editForm.api_key}
                  onApiKeyChange={(v) => onAddFormChange('edit', 'api_key', v)}
                  model={editForm.model}
                  onModelChange={(v) => onAddFormChange('edit', 'model', v)}
                  showModel
                  providerKind={editForm.provider_kind}
                  onProviderKindChange={(v) => onAddFormChange('edit', 'provider_kind', v)}
                  providerKinds={providerKinds}
                  isActive={editForm.is_active}
                  onIsActiveChange={(v) => onAddFormChange('edit', 'is_active', v)}
                  showActiveToggle
                  saving={saving}
                  onSave={() => onSubmitEdit(provider.id)}
                  onCancel={onCancelEdit}
                  saveLabel="Lưu thay đổi"
                />
              ) : (
                <>
                  <div className="provider-slot-item-main">
                    <strong>{provider.name}</strong>
                    <code>{provider.model || template?.default_model || '—'}</code>
                    {!provider.is_active && <span className="provider-slot-paused">Tắt</span>}
                  </div>
                  <div className="provider-slot-actions">
                    <button type="button" className="btn-link" onClick={() => onTest(provider.id)}>Thử</button>
                    <button type="button" className="btn-link" onClick={() => onStartEdit(provider)}>Sửa</button>
                    <button type="button" className="btn-link" onClick={() => onDelete(provider.id)}>Xóa</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {!hasTemplate && !configured && (
        <p className="provider-slot-empty">Chưa có template {slotLabel.toLowerCase()} — dùng form tùy chỉnh phía trên</p>
      )}

      {isAdding && (
        <ProviderInlineForm
          template={template}
          endpoint={addForm.endpoint}
          onEndpointChange={(v) => handleAddField('endpoint', v)}
          apiKey={addForm.api_key}
          onApiKeyChange={(v) => handleAddField('api_key', v)}
          model={addForm.model}
          onModelChange={(v) => handleAddField('model', v)}
          showModel={addForm.show_model}
          onToggleModel={() => handleAddField('show_model', !addForm.show_model)}
          saving={saving}
          onSave={async () => {
            await onSubmitAdd(template, addForm);
            setAddForm(emptyAddForm(template));
            setShowExtraAdd(false);
          }}
          onCancel={configured ? () => {
            setShowExtraAdd(false);
            setAddForm(emptyAddForm(template));
          } : null}
          saveLabel={configured ? 'Thêm' : 'Lưu cấu hình'}
        />
      )}

      {hasTemplate && configured && !showExtraAdd && (
        <button
          type="button"
          className="btn btn-secondary btn-sm provider-slot-add"
          onClick={() => setShowExtraAdd(true)}
        >
          <Plus size={14} />
          Thêm nữa
        </button>
      )}
    </div>
  );
}

export default function ProviderFamilyCard({
  family,
  textTemplate,
  imageTemplate,
  textProviders,
  imageProviders,
  editingId,
  editForm,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onSubmitAdd,
  onAddFormChange,
  onDelete,
  onTest,
  providerKinds,
  saving,
}) {
  const hasAny = textProviders.length > 0 || imageProviders.length > 0;
  const slotProps = {
    editingId,
    editForm,
    onStartEdit,
    onCancelEdit,
    onSubmitEdit,
    onSubmitAdd,
    onAddFormChange,
    onDelete,
    onTest,
    providerKinds,
    saving,
  };

  return (
    <article className={`provider-family-card${hasAny ? ' provider-family-card--active' : ''}`}>
      <header className="provider-family-header">
        <h3>{family.label}</h3>
        <p>{family.description}</p>
      </header>
      <div className="provider-family-slots">
        <ProviderSlot
          slotLabel="Bài viết"
          template={textTemplate}
          providers={textProviders}
          {...slotProps}
        />
        <ProviderSlot
          slotLabel="Ảnh"
          template={imageTemplate}
          providers={imageProviders}
          {...slotProps}
        />
      </div>
    </article>
  );
}
