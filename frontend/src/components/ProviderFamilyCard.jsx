import { Check, Plus } from 'lucide-react';
import { typeLabel } from '../config/providerPresets';

function ProviderSlot({
  slotLabel,
  type,
  template,
  providers,
  onConfigure,
  onEdit,
  onDelete,
  onTest,
}) {
  const hasTemplate = Boolean(template);
  const configured = providers.length > 0;

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
                <button type="button" className="btn-link" onClick={() => onEdit(provider)}>Sửa</button>
                <button type="button" className="btn-link" onClick={() => onDelete(provider.id)}>Xóa</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="provider-slot-empty">
          {hasTemplate
            ? `Chưa cấu hình ${typeLabel(type).toLowerCase()}`
            : `Chưa có template ${typeLabel(type).toLowerCase()} — dùng form tùy chỉnh`}
        </p>
      )}

      {template && (
        <p className="provider-slot-template-hint">{template.description}</p>
      )}

      <button
        type="button"
        className="btn btn-secondary btn-sm provider-slot-add"
        onClick={() => onConfigure({ type, template })}
      >
        <Plus size={14} />
        {configured ? 'Thêm nữa' : (hasTemplate ? 'Cấu hình mặc định' : 'Thêm tùy chỉnh')}
      </button>
    </div>
  );
}

export default function ProviderFamilyCard({
  family,
  textTemplate,
  imageTemplate,
  textProviders,
  imageProviders,
  onConfigure,
  onEdit,
  onDelete,
  onTest,
}) {
  const hasAny = textProviders.length > 0 || imageProviders.length > 0;

  return (
    <article className={`provider-family-card${hasAny ? ' provider-family-card--active' : ''}`}>
      <header className="provider-family-header">
        <h3>{family.label}</h3>
        <p>{family.description}</p>
      </header>
      <div className="provider-family-slots">
        <ProviderSlot
          slotLabel="Bài viết"
          type="text"
          template={textTemplate}
          providers={textProviders}
          onConfigure={onConfigure}
          onEdit={onEdit}
          onDelete={onDelete}
          onTest={onTest}
        />
        <ProviderSlot
          slotLabel="Ảnh"
          type="image"
          template={imageTemplate}
          providers={imageProviders}
          onConfigure={onConfigure}
          onEdit={onEdit}
          onDelete={onDelete}
          onTest={onTest}
        />
      </div>
    </article>
  );
}
