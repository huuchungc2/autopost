import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Upload } from 'lucide-react';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import api from '../services/api';
import { parseImportExcel, downloadImportTemplate } from '../utils/postImportExport';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../services/authContext';

export default function GroupImport() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const isAdmin = ['super_admin', 'admin'].includes(user?.role);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [shared, setShared] = useState(false);

  const validRows = useMemo(
    () => rows.map(({ noi_dung, prompt_anh, ngay_dang, gio_dang }) => ({
      noi_dung,
      prompt_anh: prompt_anh || '',
      ngay_dang: ngay_dang || null,
      gio_dang: gio_dang || null,
    })),
    [rows]
  );

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseImportExcel(reader.result);
      setRows(result.rows);
      setErrors(result.errors);
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const handleSubmit = async () => {
    if (!validRows.length) {
      showToast('Không có dòng hợp lệ', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/group-posts/drafts', { rows: validRows, shared: isAdmin && shared });
      showToast(
        `Đã tạo ${res.data.created_count} draft${res.data.is_shared ? ' (chia sẻ team)' : ''} — mở extension → Tải từ website`,
        'success'
      );
      navigate('/groups/drafts');
    } catch (err) {
      showToast(err.response?.data?.error || 'Import thất bại', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        back={{ onClick: () => navigate('/groups'), label: 'Group' }}
        title="Import Group Draft"
        description="4 cột: noi_dung, prompt_anh, ngay_dang, gio_dang. Lưu draft — extension tải về, không vào job fanpage."
      />

      <div className="card group-import-onboarding" style={{ marginBottom: 16, maxWidth: 720 }}>
        <h4 style={{ marginTop: 0 }}>Luồng GroupFlow</h4>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>Import file Excel tại đây → draft lưu trên website.</li>
          <li>Mở extension Chrome → tab <strong>Tạo Bài</strong> → <strong>Tải từ website</strong>.</li>
          <li>Extension generate ảnh + đăng group local — không chạy cron fanpage.</li>
          <li>Sau đăng, metadata sync lên <strong>Group → Bài đã đăng</strong> để team comment chéo.</li>
        </ol>
        <p className="field-hint" style={{ marginBottom: 0, marginTop: 12 }}>
          Cấu hình extension: <strong>Cài đặt → GroupFlow Extension</strong> (API key, URL tidien.xyz).
        </p>
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Button variant="secondary" onClick={() => downloadImportTemplate(api)}>
            <Download size={16} /> File mẫu
          </Button>
        </div>

        <p className="field-hint">
          File cần <strong>4 cột</strong>: <strong>noi_dung</strong>, <strong>prompt_anh</strong>,{' '}
          <strong>ngay_dang</strong>, <strong>gio_dang</strong>. Prompt ảnh dùng khi extension generate — không chạy lịch ban đêm fanpage.
        </p>

        <label className="upload-zone">
          <Upload size={20} />
          <span>{fileName || 'Chọn file .xlsx / .csv'}</span>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} hidden />
        </label>

        {errors.length > 0 && (
          <ul className="error-list" style={{ color: 'var(--color-error)', fontSize: 13 }}>
            {errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}

        {validRows.length > 0 && (
          <>
            {isAdmin && (
              <label className="page-skill-option" style={{ marginTop: 16 }}>
                <input
                  type="checkbox"
                  checked={shared}
                  onChange={(e) => setShared(e.target.checked)}
                />
                <span><strong>Chia sẻ team</strong> — mọi user extension đều tải được (mỗi người tải 1 lần)</span>
              </label>
            )}
          <div className="bulk-schedule-preview" style={{ marginTop: 16 }}>
            <h4 className="modal-section-title">Xem trước ({validRows.length} dòng hợp lệ)</h4>
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nội dung</th>
                  <th>Prompt ảnh</th>
                  <th>Lịch</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((row, i) => (
                  <tr key={row._line || i}>
                    <td>{row._line || i + 1}</td>
                    <td>{(row.noi_dung || '').slice(0, 50)}{(row.noi_dung?.length > 50) ? '…' : ''}</td>
                    <td>{(row.prompt_anh || '—').slice(0, 40)}</td>
                    <td>
                      {row.ngay_dang ? `${row.ngay_dang} ${row.gio_dang || ''}`.trim() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <p className="text-muted">… và {rows.length - 10} dòng nữa</p>
            )}
          </div>
          </>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <Button onClick={handleSubmit} disabled={saving || !validRows.length}>
            <Upload size={16} /> {saving ? 'Đang lưu…' : `Lưu ${validRows.length || ''} draft`}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/groups/drafts')}>Xem drafts</Button>
        </div>
      </div>
    </div>
  );
}
