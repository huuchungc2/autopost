import { useEffect, useMemo, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import {
  DEFAULT_DAILY_SLOTS,
  buildBulkSchedulePlan,
  describeBulkPlan,
  getDefaultStartDate,
} from '../utils/bulkScheduleAssign';
import { parseImportExcel, downloadImportTemplate } from '../utils/postImportExport';
import api from '../services/api';

export default function PostImportForm({
  pages = [],
  initialPageId = '',
  onImported,
  onError,
  footer = null,
}) {
  const [pageId, setPageId] = useState(initialPageId);
  const [importFile, setImportFile] = useState(null);
  const [importRows, setImportRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [parseErrors, setParseErrors] = useState([]);
  const [autoSchedule, setAutoSchedule] = useState(false);
  const [autoGenerateImages, setAutoGenerateImages] = useState(true);
  const [saveImageLocal, setSaveImageLocal] = useState(true);
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [times, setTimes] = useState([...DEFAULT_DAILY_SLOTS]);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (initialPageId && pages.some((p) => String(p.id) === String(initialPageId))) {
      setPageId(String(initialPageId));
    }
  }, [initialPageId, pages]);

  const parsed = useMemo(() => ({ rows: importRows, errors: parseErrors }), [importRows, parseErrors]);

  const rowsWithoutDate = useMemo(
    () => parsed.rows.filter((r) => !r.ngay_dang?.trim()),
    [parsed.rows]
  );

  const rowsWithPrompt = useMemo(
    () => parsed.rows.filter((r) => String(r.prompt_anh || r.prompt || '').trim()),
    [parsed.rows]
  );

  const plan = useMemo(() => {
    if (!autoSchedule || !rowsWithoutDate.length) return [];
    return buildBulkSchedulePlan(rowsWithoutDate.length, startDate, times);
  }, [autoSchedule, rowsWithoutDate.length, startDate, times]);

  const selectedPage = pages.find((p) => String(p.id) === String(pageId));

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadImportTemplate(api);
    } catch (err) {
      onError?.(err.response?.data?.error || 'Tải file mẫu thất bại');
    } finally {
      setDownloading(false);
    }
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseImportExcel(reader.result);
      setImportRows(result.rows);
      setParseErrors(result.errors);
    };
    reader.onerror = () => setParseErrors(['Không đọc được file']);
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const handleSubmit = async () => {
    if (!pageId) {
      onError?.('Chọn fanpage trước khi import');
      return;
    }
    if (!importFile || !parsed.rows.length) return;

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('page_id', String(pageId));
      formData.append('file', importFile);
      if (autoSchedule && rowsWithoutDate.length) {
        formData.append('auto_schedule', JSON.stringify({
          start_date: startDate,
          times: times.filter(Boolean),
        }));
      }
      if (parsed.rows.length) {
        formData.append('auto_generate_images', autoGenerateImages ? '1' : '0');
        formData.append('save_image_local', saveImageLocal ? '1' : '0');
      }
      const response = await api.post('/posts/import', formData);
      onImported?.(response.data);
    } catch (err) {
      const data = err.response?.data;
      const serverErrors = data?.errors?.map((e) => `Dòng ${e.line}: ${e.error}`) || [];
      const message = serverErrors.length ? serverErrors : [data?.error || 'Import thất bại'];
      setParseErrors(Array.isArray(message) ? message : [message]);
      onError?.(Array.isArray(message) ? message[0] : message);
    } finally {
      setSaving(false);
    }
  };

  const summary = autoSchedule && rowsWithoutDate.length
    ? describeBulkPlan(rowsWithoutDate.length, times)
    : null;

  const canSubmit = Boolean(pageId && importFile && parsed.rows.length && !saving);

  const defaultFooter = (
    <>
      <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
        {saving ? 'Đang import...' : `Import ${parsed.rows.length} bài`}
      </button>
    </>
  );

  return (
    <>
      <div className="modal-form bulk-schedule-form post-import-form">
        <label>
          Fanpage import vào
          <select value={pageId} onChange={(e) => setPageId(e.target.value)} required>
            <option value="">Chọn fanpage</option>
            {pages.map((page) => (
              <option key={page.id} value={String(page.id)}>{page.name}</option>
            ))}
          </select>
          {selectedPage ? (
            <span className="field-hint">Tất cả dòng trong file sẽ tạo bài cho <strong>{selectedPage.name}</strong></span>
          ) : (
            <span className="field-hint field-hint--warn">Chọn fanpage trước khi import</span>
          )}
        </label>

        <div className="header-actions" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleDownloadTemplate}
            disabled={downloading}
          >
            <Download size={14} />
            {downloading ? 'Đang tải...' : 'Tải file mẫu Excel'}
          </button>
        </div>

        <p className="field-hint">
          File chỉ cần <strong>4 cột</strong>: <strong>noi_dung</strong>, <strong>prompt_anh</strong>,{' '}
          <strong>ngay_dang</strong>, <strong>gio_dang</strong>.
          Prompt ảnh dùng để AI generate ảnh lên VPS khi chưa có ảnh — có thể xuất ảnh rồi đăng theo lịch.
          Ngày/giờ để trống nếu muốn tự chia lịch bên dưới.
        </p>

        <label className="skill-file-label">
          <input
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleFile}
          />
          <Upload size={28} strokeWidth={1.5} />
          <span>{fileName ? `Đã chọn: ${fileName}` : 'Chọn file Excel đã điền'}</span>
          <small>Định dạng .xlsx — sheet Import</small>
        </label>

        {parsed.rows.length > 0 && (
          <div className="bulk-schedule-preview">
            <h4 className="modal-section-title">Xem trước ({parsed.rows.length} dòng hợp lệ)</h4>
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Dòng</th>
                  <th>Nội dung</th>
                  <th>Prompt ảnh</th>
                  <th>Lịch</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 8).map((row) => (
                  <tr key={row._line}>
                    <td>{row._line}</td>
                    <td>{(row.noi_dung || '').slice(0, 50)}…</td>
                    <td>{(row.prompt_anh || row.prompt || '—').slice(0, 40)}</td>
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

        {parsed.rows.length > 0 && (
          <>
            <label className="page-skill-option" style={{ marginTop: 16 }}>
              <input
                type="checkbox"
                checked={autoGenerateImages}
                onChange={(e) => setAutoGenerateImages(e.target.checked)}
              />
              <span>
                AI tự xuất ảnh khi đến giờ đăng
                {rowsWithPrompt.length > 0 ? (
                  <> cho <strong>{rowsWithPrompt.length}</strong> bài có prompt ảnh</>
                ) : (
                  <> (áp dụng cho các dòng có cột prompt ảnh)</>
                )}
                {' '}— cần cấu hình AI provider ảnh trên fanpage
              </span>
            </label>

            {autoGenerateImages && (
              <label className="page-skill-option" style={{ marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={saveImageLocal}
                  onChange={(e) => setSaveImageLocal(e.target.checked)}
                />
                <span>
                  Lưu ảnh AI lên VPS trước khi đăng (bỏ tick = đăng thẳng URL ảnh AI lên Facebook, không lưu server)
                </span>
              </label>
            )}
          </>
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

      {footer
        ? footer({ handleSubmit, saving, canSubmit, rowCount: parsed.rows.length })
        : defaultFooter}
    </>
  );
}
