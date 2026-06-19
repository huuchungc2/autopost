import { useMemo } from 'react';
import { computeMaxImagesPerNight, formatScheduleTime } from '../utils/imageSchedule';

function timeInputValue(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseTimeInput(value) {
  const [hh, mm] = String(value || '00:00').split(':');
  return {
    hour: Math.min(23, Math.max(0, parseInt(hh, 10) || 0)),
    minute: Math.min(59, Math.max(0, parseInt(mm, 10) || 0)),
  };
}

export default function ImageScheduleFields({
  value,
  onChange,
  disabled = false,
  hint,
  warn,
}) {
  const maxPerNight = useMemo(() => computeMaxImagesPerNight(value || {}), [value]);

  const handleStartTimeChange = (timeValue) => {
    const { hour, minute } = parseTimeInput(timeValue);
    onChange('start_hour', hour);
    onChange('start_minute', minute);
  };

  const handleEndTimeChange = (timeValue) => {
    const { hour, minute } = parseTimeInput(timeValue);
    onChange('end_hour', hour);
    onChange('end_minute', minute);
  };

  return (
    <div className="page-form-section field-span-2 settings-image-schedule">
      <div className="settings-section-header">
        <div>
          <h2 className="page-form-section-title">Lịch xuất ảnh AI (tuỳ chọn)</h2>
          <p className="field-hint">
            {hint || 'Bật để AI tự vẽ ảnh ban đêm cho bài chưa có ảnh trên fanpage này. Giờ Việt Nam.'}
          </p>
        </div>
        <label className="page-skill-option settings-toggle">
          <input
            type="checkbox"
            checked={!!value?.enabled}
            onChange={(e) => onChange('enabled', e.target.checked)}
            disabled={disabled}
          />
          <span>{value?.enabled ? 'Đang bật' : 'Đang tắt'}</span>
        </label>
      </div>

      {warn && (
        <p className="field-hint field-hint--warn" style={{ marginBottom: 12 }}>
          {warn}
        </p>
      )}

      <div className="settings-schedule-grid">
        <label>
          Từ
          <input
            type="time"
            value={timeInputValue(value?.start_hour ?? 1, value?.start_minute ?? 0)}
            onChange={(e) => handleStartTimeChange(e.target.value)}
            disabled={disabled || !value?.enabled}
          />
        </label>
        <label>
          Đến (không gồm giờ kết thúc)
          <input
            type="time"
            value={timeInputValue(value?.end_hour ?? 5, value?.end_minute ?? 0)}
            onChange={(e) => handleEndTimeChange(e.target.value)}
            disabled={disabled || !value?.enabled}
          />
        </label>
        <label>
          Cách nhau (phút)
          <input
            type="number"
            min={1}
            max={1440}
            value={value?.interval_minutes ?? 10}
            onChange={(e) => onChange('interval_minutes', parseInt(e.target.value, 10) || 1)}
            disabled={disabled || !value?.enabled}
          />
        </label>
      </div>

      <div className="settings-schedule-summary">
        <strong>Tối đa ~{maxPerNight} ảnh/đêm</strong>
        <span className="field-hint">
          {formatScheduleTime(value?.start_hour ?? 1, value?.start_minute ?? 0)}
          {' → '}
          {formatScheduleTime(value?.end_hour ?? 5, value?.end_minute ?? 0)}
          , mỗi {value?.interval_minutes ?? 10} phút 1 ảnh
        </span>
      </div>
    </div>
  );
}
