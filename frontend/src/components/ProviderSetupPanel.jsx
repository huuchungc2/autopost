import { KeyRound, X } from 'lucide-react';

export function ProviderSetupPanel({
  title,
  subtitle,
  template,
  endpoint,
  onEndpointChange,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  showModel = false,
  onToggleModel,
  providerKind,
  onProviderKindChange,
  providerKinds,
  isActive,
  onIsActiveChange,
  showActiveToggle = false,
  customFields = null,
  saving,
  onSave,
  onClose,
  saveLabel = 'Lưu cấu hình',
  requireApiKey = true,
}) {
  return (
    <section id="provider-setup-panel" className="provider-setup-panel">
      <div className="provider-setup-panel-inner card">
        <header className="provider-setup-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} aria-label="Đóng">
            <X size={16} />
            Đóng
          </button>
        </header>

        {template && (
          <div className="provider-setup-preset">
            <span className="provider-setup-preset-label">Template</span>
            <strong>{template.name}</strong>
            <code>{template.default_model}</code>
            {template.description && <p className="text-muted">{template.description}</p>}
          </div>
        )}

        {customFields}

        <div className="provider-setup-form modal-form-grid">
          <label className="field-span-2 provider-endpoint-field">
            <span className="provider-endpoint-label">API endpoint</span>
            <input
              type="url"
              value={endpoint}
              onChange={(e) => onEndpointChange(e.target.value)}
              placeholder="Endpoint mặc định từ template — có thể dán base URL"
            />
            <small className="text-muted">Có thể dán base URL — hệ thống tự thêm path đúng loại API.</small>
          </label>

          <label className="field-span-2 provider-key-field">
            <span className="provider-key-label">
              <KeyRound size={16} />
              {template?.key_label || 'API Key'}
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={template?.key_placeholder || 'Dán API key...'}
              autoComplete="off"
            />
            {template?.key_help && <small className="text-muted">{template.key_help}</small>}
          </label>

          {showActiveToggle && onProviderKindChange && providerKinds && (
            <label>
              Kiểu API
              <select value={providerKind} onChange={(e) => onProviderKindChange(e.target.value)}>
                {providerKinds.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </label>
          )}

          <label>
            Model {onToggleModel ? '(tuỳ chọn)' : ''}
            <input
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={template?.default_model || 'gpt-4o-mini / dall-e-3'}
            />
          </label>

          {onToggleModel && (
            <div className="field-span-2">
              <button type="button" className="btn-link provider-advanced-toggle" onClick={onToggleModel}>
                {showModel ? 'Ẩn gợi ý model' : 'Xem model mặc định template'}
              </button>
            </div>
          )}

          {showActiveToggle && onIsActiveChange && (
            <label className="checkbox-field field-span-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => onIsActiveChange(e.target.checked)}
              />
              Provider đang bật
            </label>
          )}
        </div>

        <div className="provider-setup-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Huỷ</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSave}
            disabled={saving || (requireApiKey && !apiKey.trim())}
          >
            {saving ? 'Đang lưu...' : saveLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
