import { useMemo, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import Button from './ui/Button';
import { parseImportExcel, downloadWebsiteImportTemplate, WEBSITE_HEADER_ALIASES } from '../utils/postImportExport';
import api from '../services/api';

export default function WebsiteImportForm({
  websites = [],
  initialWebsiteId = '',
  onImported,
  onError,
  footer = null,
}) {
  const [websiteId, setWebsiteId] = useState(initialWebsiteId);
  const [importFile, setImportFile] = useState(null);
  const [importRows, setImportRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [parseErrors, setParseErrors] = useState([]);
  const [autoGenerateImages, setAutoGenerateImages] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const parsed = useMemo(() => ({ rows: importRows, errors: parseErrors }), [importRows, parseErrors]);

  const rowsWithPrompt = useMemo(
    () => parsed.rows.filter((r) => String(r.prompt_anh || '').trim()),
    [parsed.rows]
  );

  const selectedWebsite = websites.find((w) => String(w.id) === String(websiteId));

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadWebsiteImportTemplate(api);
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
      const result = parseImportExcel(reader.result, WEBSITE_HEADER_ALIASES);
      setImportRows(result.rows);
      setParseErrors(result.errors);
    };
    reader.onerror = () => setParseErrors(['Không đọc được file']);
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const handleSubmit = async () => {
    if (!websiteId) {
      onError?.('Chọn website trước khi import');
      return;
    }
    if (!importFile || !parsed.rows.length) return;

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('website_id', String(websiteId));
      formData.append('file', importFile);
      formData.append('auto_generate_images', autoGenerateImages ? '1' : '0');
      const response = await api.post('/posts/import-website-blog', formData);
      onImported?.(response.data);
    } catch (err) {
      const data = err.response?.data;
      const serverErrors = data?.errors?.map((e) => `Dòng ${e.line}: ${e.error}`) || [];
      const message = serverErrors.length ? serverErrors : [data?.error || 'Import thất bại'];
      setParseErrors(message);
      onError?.(message[0]);
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = Boolean(websiteId && importFile && parsed.rows.length && !saving);

  const defaultFooter = (
    <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
      {saving ? 'Đang import...' : `Import ${parsed.rows.length} bài`}
    </Button>
  );

  return (
    <>
      <div className="modal-form bulk-schedule-form post-import-form">
        <label>
          Website import vào
          <select value={websiteId} onChange={(e) => setWebsiteId(e.target.value)} required>
            <option value="">Chọn website</option>
            {websites.map((website) => (
              <option key={website.id} value={String(website.id)}>{website.name}</option>
            ))}
          </select>
          {selectedWebsite ? (
            <span className="field-hint">Tất cả dòng trong file sẽ tạo bài nháp cho <strong>{selectedWebsite.name}</strong></span>
          ) : (
            <span className="field-hint field-hint--warn">Chọn website trước khi import</span>
          )}
        </label>

        <div className="header-actions" style={{ marginBottom: 16 }}>
          <Button type="button" variant="secondary" size="sm" onClick={handleDownloadTemplate} disabled={downloading}>
            <Download size={14} />
            {downloading ? 'Đang tải...' : 'Tải file mẫu Excel'}
          </Button>
        </div>

        <p className="field-hint">
          File cần <strong>6 cột</strong>: <strong>tieu_de</strong>, <strong>slug</strong>, <strong>meta_description</strong>,{' '}
          <strong>tu_khoa_chinh</strong>, <strong>noi_dung</strong>, <strong>prompt_anh</strong>.
          Mọi bài lưu nháp (status=draft), không tự đăng lên đâu cả — tự publish tay sau nếu cần.
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
                  <th>Tiêu đề</th>
                  <th>Nội dung</th>
                  <th>Prompt ảnh</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 8).map((row) => (
                  <tr key={row._line}>
                    <td>{row._line}</td>
                    <td>{(row.tieu_de || '—').slice(0, 40)}</td>
                    <td>{(row.noi_dung || '').slice(0, 50)}…</td>
                    <td>{(row.prompt_anh || '—').slice(0, 40)}</td>
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
          <label className="page-skill-option" style={{ marginTop: 16 }}>
            <input
              type="checkbox"
              checked={autoGenerateImages}
              onChange={(e) => setAutoGenerateImages(e.target.checked)}
            />
            <span>
              AI tự generate ảnh trong vài phút sau import
              {rowsWithPrompt.length > 0 ? (
                <> cho <strong>{rowsWithPrompt.length}</strong> bài có prompt ảnh</>
              ) : (
                <> (áp dụng cho các dòng có cột prompt_anh)</>
              )}
              {' '}— cần cấu hình AI provider ảnh trên website, ảnh đặt tên theo slug + convert WebP
            </span>
          </label>
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
