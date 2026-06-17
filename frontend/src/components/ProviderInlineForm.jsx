import { KeyRound } from 'lucide-react';

export function ProviderInlineForm({
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
  saving,
  onSave,
  onCancel,
  saveLabel = 'Lưu',
  cancelLabel = 'Huỷ',
}) {
  return (
    <div className="provider-inline-form">
      {template && (
        <div className="provider-inline-preset">
          <strong>{template.name}</strong>
          <code>{template.default_model}</code>
        </div>
      )}

      <label className="provider-endpoint-field">
        <span className="provider-endpoint-label">API endpoint</span>
        <input
          type="url"
          value={endpoint}
          onChange={(e) => onEndpointChange(e.target.value)}
          placeholder="Endpoint mặc định từ template"
        />
      </label>

      <label className="provider-key-field">
        <span className="provider-key-label">
          <KeyRound size={14} />
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

      {onToggleModel && (
        <button type="button" className="btn-link provider-advanced-toggle" onClick={onToggleModel}>
          {showModel ? 'Ẩn model' : 'Đổi model (tuỳ chọn)'}
        </button>
      )}

      {showModel && (
        <label>
          Model
          <input
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder={template?.default_model}
          />
        </label>
      )}

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

      {showActiveToggle && onIsActiveChange && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => onIsActiveChange(e.target.checked)}
          />
          Provider đang bật
        </label>
      )}

      <div className="provider-inline-actions">
        {onCancel && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onSave}
          disabled={saving || !apiKey.trim()}
        >
          {saving ? 'Đang lưu...' : saveLabel}
        </button>
      </div>
    </div>
  );
}
