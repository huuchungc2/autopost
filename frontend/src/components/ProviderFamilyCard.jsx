import { Check, Plus, Settings2 } from 'lucide-react';

function ProviderSlot({
  slotLabel,
  template,
  providers,
  isPanelTarget,
  onOpenAdd,
  onOpenEdit,
  onDelete,
  onTest,
}) {
  const hasTemplate = Boolean(template);
  const configured = providers.length > 0;

  return (
    <div className={`provider-slot${configured ? ' provider-slot--configured' : ''}${isPanelTarget ? ' provider-slot--focus' : ''}`}>
      <div className="provider-slot-head">
        <span className="provider-slot-type">{slotLabel}</span>
        {configured && (
          <span className="provider-slot-badge" title="Đã cấu hình">
            <Check size={12} />
          </span>
        )}
      </div>

      {!hasTemplate && !configured && (
        <p className="provider-slot-empty">Chưa có template — dùng provider tùy chỉnh</p>
      )}

      {configured ? (
        <ul className="provider-slot-list">
          {providers.map((provider) => (
            <li key={provider.id} className="provider-slot-item">
              <div className="provider-slot-item-main">
                <strong>{provider.name}</strong>
                <code>{provider.model || template?.default_model || '—'}</code>
                {!provider.is_active && <span className="provider-slot-paused">Tắt</span>}
              </div>
              <div className="provider-slot-actions">
                <button type="button" className="btn-link" onClick={() => onTest(provider.id)}>Thử</button>
                <button type="button" className="btn-link" onClick={() => onOpenEdit(provider, template)}>Sửa</button>
                <button type="button" className="btn-link" onClick={() => onDelete(provider.id)}>Xóa</button>
              </div>
            </li>
          ))}
        </ul>
      ) : hasTemplate && (
        <p className="provider-slot-empty">Chưa cấu hình — bấm nút bên dưới để dán API key</p>
      )}

      {hasTemplate && (
        <button
          type="button"
          className={`btn btn-sm ${configured ? 'btn-secondary' : 'btn-primary'} provider-slot-config-btn`}
          onClick={() => onOpenAdd(template, slotLabel)}
        >
          {configured ? <><Plus size={14} /> Thêm</> : <><Settings2 size={14} /> Cấu hình</>}
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
  activePanelKey,
  onOpenAdd,
  onOpenEdit,
  onDelete,
  onTest,
}) {
  const hasAny = textProviders.length > 0 || imageProviders.length > 0;
  const panelKey = (slot) => `${family.id}:${slot}`;

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
          isPanelTarget={activePanelKey === panelKey('text')}
          onOpenAdd={(template, label) => onOpenAdd({ family, slotLabel: label, slotType: 'text', template })}
          onOpenEdit={(provider, template) => onOpenEdit({ family, slotLabel: 'Bài viết', slotType: 'text', template, provider })}
          onDelete={onDelete}
          onTest={onTest}
        />
        <ProviderSlot
          slotLabel="Ảnh"
          template={imageTemplate}
          providers={imageProviders}
          isPanelTarget={activePanelKey === panelKey('image')}
          onOpenAdd={(template, label) => onOpenAdd({ family, slotLabel: label, slotType: 'image', template })}
          onOpenEdit={(provider, template) => onOpenEdit({ family, slotLabel: 'Ảnh', slotType: 'image', template, provider })}
          onDelete={onDelete}
          onTest={onTest}
        />
      </div>
    </article>
  );
}
