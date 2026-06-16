import { useEffect, useMemo, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import Modal from './ui/Modal';
import {
  DEFAULT_DAILY_SLOTS,
  buildBulkSchedulePlan,
  describeBulkPlan,
  getDefaultStartDate,
} from '../utils/bulkScheduleAssign';
import { parseImportCsv, downloadImportTemplate } from '../utils/postImportExport';
import api from '../services/api';

export default function PostImportModal({ open, onClose, onImported, pages = [] }) {
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parseErrors, setParseErrors] = useState([]);
  const [autoSchedule, setAutoSchedule] = useState(false);
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [times, setTimes] = useState([...DEFAULT_DAILY_SLOTS]);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCsvText('');
    setFileName('');
    setParseErrors([]);
    setAutoSchedule(false);
    setStartDate(getDefaultStartDate());
    setTimes([...DEFAULT_DAILY_SLOTS]);
  }, [open]);

  const parsed = useMemo(() => {
    if (!csvText.trim()) return { rows: [], errors: [] };
    return parseImportCsv(csvText);
  }, [csvText]);

  const rowsWithoutDate = useMemo(
    () => parsed.rows.filter((r) => !r.ngay_dang?.trim()),
    [parsed.rows]
  );

  const plan = useMemo(() => {
    if (!autoSchedule || !rowsWithoutDate.length) return [];
    return buildBulkSchedulePlan(rowsWithoutDate.length, startDate, times);
  }, [autoSchedule, rowsWithoutDate.length, startDate, times]);

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadImportTemplate(api);
    } catch {
      // fallback: minimal template
      const header = 'fanpage_id,fanpage_ten,chu_de,noi_dung,loai_media,url_anh,url_video,url_thumb,ngay_dang,gio_dang';
      const hint = pages.map((p) => `${p.id}=${p.name}`).join('; ');
      const csv = `\uFEFF# Fanpage: ${hint}\r\n${header}\r\n`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mau-import-bai-viet.csv';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setCsvText(text);
      const result = parseImportCsv(text);
      setParseErrors(result.errors);
    };
    reader.onerror = () => setParseErrors(['Không đọc được file']);
    reader.readAsText(file, 'UTF-8');
    event.target.value = '';
  };

  const handleSubmit = async () => {
    if (!parsed.rows.length) return;
    setSaving(true);
    try {
      const payload = { csv: csvText };
      if (autoSchedule && rowsWithoutDate.length) {
        payload.auto_schedule = {
          start_date: startDate,
          times: times.filter(Boolean),
        };
      }
      const response = await api.post('/posts/import', payload);
      onImported?.(response.data);
      onClose?.();
    } catch (err) {
      const data = err.response?.data;
      const serverErrors = data?.errors?.map((e) => `Dòng ${e.line}: ${e.error}`) || [];
      setParseErrors(serverErrors.length ? serverErrors : [data?.error || 'Import thất bại']);
    } finally {
      setSaving(false);
    }
  };

  const summary = autoSchedule && rowsWithoutDate.length
    ? describeBulkPlan(rowsWithoutDate.length, times)
    : null;

  return (
    <Modal
      open={open}
      title="Import bài viết hàng loạt"
      subtitle="Tải file mẫu CSV → điền nội dung → upload để tạo bài và lên lịch"
      onClose={onClose}
      wide
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Huỷ</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={saving || !parsed.rows.length}
          >
            {saving ? 'Đang import...' : `Import ${parsed.rows.length} bài`}
          </button>
        </>
      )}
    >
      <div className="modal-form bulk-schedule-form">
        <div className="header-actions" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleDownloadTemplate}
            disabled={downloading}
          >
            <Download size={14} />
            {downloading ? 'Đang tải...' : 'Tải file mẫu CSV'}
          </button>
        </div>

        <p className="field-hint">
          Cột bắt buộc: <strong>fanpage_id</strong> hoặc <strong>fanpage_ten</strong>, <strong>noi_dung</strong>.
          Có thể thêm <strong>ngay_dang</strong> (YYYY-MM-DD) + <strong>gio_dang</strong> (HH:MM) từng dòng,
          hoặc bật tự lên lịch bên dưới.
        </p>

        {pages.length > 0 && (
          <div className="form-success" style={{ marginBottom: 12 }}>
            <strong>Fanpage của bạn:</strong>
            {' '}
            {pages.map((p) => `${p.id}=${p.name}`).join(' · ')}
          </div>
        )}

        <label className="skill-file-label">
          <input type="file" accept=".csv,text/csv" onChange={handleFile} />
          <Upload size={28} strokeWidth={1.5} />
          <span>{fileName ? `Đã chọn: ${fileName}` : 'Chọn file CSV đã điền'}</span>
          <small>UTF-8 — mở bằng Excel hoặc Google Sheets</small>
        </label>

        {parsed.rows.length > 0 && (
          <div className="bulk-schedule-preview">
            <h4 className="modal-section-title">Xem trước ({parsed.rows.length} dòng hợp lệ)</h4>
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Dòng</th>
                  <th>Fanpage</th>
                  <th>Chủ đề</th>
                  <th>Nội dung</th>
                  <th>Lịch</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 8).map((row) => (
                  <tr key={row._line}>
                    <td>{row._line}</td>
                    <td>{row.fanpage_ten || row.fanpage_id}</td>
                    <td>{(row.chu_de || '').slice(0, 40)}</td>
                    <td>{(row.noi_dung || '').slice(0, 50)}…</td>
                    <td>
                      {row.ngay_dang
                        ? `${row.ngay_dang} ${row.gio_dang || ''}`.trim()
                        : autoSchedule ? '(tự chia)' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.rows.length > 8 && (
              <p className="text-muted">… và {parsed.rows.length - 8} dòng nữa</p>
            )}
          </div>
        )}

        {rowsWithoutDate.length > 0 && (
          <label className="page-skill-option" style={{ marginTop: 16 }}>
            <input
              type="checkbox"
              checked={autoSchedule}
              onChange={(e) => setAutoSchedule(e.target.checked)}
            />
            <span>
              Tự lên lịch cho <strong>{rowsWithoutDate.length}</strong> bài chưa có ngày/giờ
            </span>
          </label>
        )}

        {autoSchedule && rowsWithoutDate.length > 0 && (
          <>
            <label>
              Ngày bắt đầu
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <div className="bulk-schedule-slots">
              <span className="field-label">Giờ đăng mỗi ngày</span>
              {times.map((time, index) => (
                <div key={index} className="bulk-schedule-slot-row">
                  <span className="bulk-schedule-slot-num">#{index + 1}</span>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTimes((cur) => cur.map((t, i) => (i === index ? e.target.value : t)))}
                  />
                </div>
              ))}
            </div>
            {summary && (
              <div className="form-success bulk-schedule-summary">
                <strong>{summary}</strong>
              </div>
            )}
            {plan.slice(0, 4).map((row) => (
              <small key={row.index} className="text-muted" style={{ display: 'block' }}>
                Bài chưa lịch #{row.index + 1} → {row.date} {row.time}
              </small>
            ))}
          </>
        )}

        {parseErrors.length > 0 && (
          <div className="form-error" style={{ marginTop: 12 }}>
            {parseErrors.map((err) => (
              <div key={err}>{err}</div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
