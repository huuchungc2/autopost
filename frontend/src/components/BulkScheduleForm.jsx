import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Button from './ui/Button';
import {
  DEFAULT_DAILY_SLOTS,
  buildBulkSchedulePlan,
  describeBulkPlan,
  getDefaultStartDate,
} from '../utils/bulkScheduleAssign';

export default function BulkScheduleForm({
  postCount = 0,
  onSubmit,
  onCancel,
  saving,
}) {
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [times, setTimes] = useState([...DEFAULT_DAILY_SLOTS]);

  useEffect(() => {
    setStartDate(getDefaultStartDate());
    setTimes([...DEFAULT_DAILY_SLOTS]);
  }, [postCount]);

  const count = postCount || 0;
  const plan = useMemo(() => buildBulkSchedulePlan(count, startDate, times), [count, startDate, times]);
  const summary = describeBulkPlan(count, times);

  const updateTime = (index, value) => {
    setTimes((current) => current.map((t, i) => (i === index ? value : t)));
  };

  const addSlot = () => setTimes((current) => [...current, '12:00']);

  const removeSlot = (index) => {
    setTimes((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
  };

  const handleSubmit = () => {
    const validTimes = times.filter((t) => t);
    if (!validTimes.length) return;
    onSubmit?.({ start_date: startDate, times: validTimes });
  };

  const preview = plan.slice(0, 6);
  const previewMore = plan.length > preview.length ? plan.length - preview.length : 0;

  return (
    <div className="card form-card bulk-schedule-form">
      <p className="field-hint">
        Ví dụ: 4 khung giờ → 100 bài = 25 ngày, mỗi ngày 4 bài. Bạn <strong>chỉ cần chọn giờ</strong> + ngày bắt đầu.
      </p>

      <label>
        Ngày bắt đầu đăng
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>

      <div className="bulk-schedule-slots">
        <span className="field-label">Giờ đăng mỗi ngày ({times.filter(Boolean).length} lần/ngày)</span>
        {times.map((time, index) => (
          <div key={index} className="bulk-schedule-slot-row">
            <span className="bulk-schedule-slot-num">#{index + 1}</span>
            <input type="time" value={time} onChange={(e) => updateTime(index, e.target.value)} />
            <button
              type="button"
              className="btn-link"
              onClick={() => removeSlot(index)}
              disabled={times.length <= 1}
              aria-label="Xóa khung giờ"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={addSlot}>
          <Plus size={14} /> Thêm khung giờ
        </Button>
      </div>

      {summary && (
        <div className="form-success bulk-schedule-summary">
          <strong>{summary}</strong>
          {startDate && <span> — bắt đầu {startDate.split('-').reverse().join('/')}</span>}
        </div>
      )}

      {preview.length > 0 && (
        <div className="bulk-schedule-preview">
          <h4 className="modal-section-title">Xem trước</h4>
          <table className="table table-compact">
            <thead>
              <tr><th>Bài</th><th>Ngày</th><th>Giờ</th></tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.index}>
                  <td>#{row.index + 1}</td>
                  <td>{row.date.split('-').reverse().join('/')}</td>
                  <td>{row.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {previewMore > 0 && (
            <p className="text-muted" style={{ margin: '8px 0 0' }}>… và {previewMore} bài nữa</p>
          )}
        </div>
      )}

      <div className="post-editor-page-footer">
        <Button type="button" variant="secondary" onClick={onCancel}>Huỷ</Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !count || !times.some(Boolean)}
        >
          {saving ? 'Đang lưu...' : `Lên lịch ${count} bài`}
        </Button>
      </div>
    </div>
  );
}
