import { useEffect, useState } from 'react';
import { Copy, RefreshCw, KeyRound } from 'lucide-react';
import api from '../services/api';
import Button from './ui/Button';
import { useToast } from '../context/ToastContext';
import { formatDateTime } from '../utils/date';

export default function GroupExtensionSettings() {
  const { showToast } = useToast();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [license, setLicense] = useState(null);
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [licenseCreating, setLicenseCreating] = useState(false);
  const [showLicense, setShowLicense] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/group-posts/extension-key');
      setInfo(res.data);
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được thông tin extension', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadLicense = async () => {
    setLicenseLoading(true);
    try {
      const res = await api.get('/auth/my-license');
      setLicense(res.data);
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được license key', 'error');
    } finally {
      setLicenseLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadLicense();
  }, []);

  const handleCreateLicense = async () => {
    setLicenseCreating(true);
    try {
      const res = await api.post('/auth/my-license');
      setLicense(res.data);
      setShowLicense(true);
      showToast('Đã tạo license key', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Tạo license key thất bại', 'error');
    } finally {
      setLicenseCreating(false);
    }
  };

  const handleCopyLicense = async () => {
    if (!license?.key_value) return;
    try {
      await navigator.clipboard.writeText(license.key_value);
      showToast('Đã copy license key', 'success');
    } catch {
      showToast('Không copy được — chọn và copy thủ công', 'error');
    }
  };

  const handleCopy = async () => {
    if (!info?.api_key) return;
    try {
      await navigator.clipboard.writeText(info.api_key);
      showToast('Đã copy API key', 'success');
    } catch {
      showToast('Không copy được — chọn và copy thủ công', 'error');
    }
  };

  const handleRegenerate = async () => {
    if (!window.confirm('Tạo lại API key? Extension đang dùng key cũ sẽ mất kết nối cho đến khi đăng nhập lại.')) {
      return;
    }
    setRegenerating(true);
    try {
      const res = await api.post('/group-posts/extension-key');
      setInfo((prev) => ({
        ...prev,
        api_key: res.data.api_key,
        api_key_preview: res.data.api_key?.length > 12
          ? `${res.data.api_key.slice(0, 8)}…${res.data.api_key.slice(-4)}`
          : res.data.api_key,
      }));
      setShowKey(true);
      showToast('Đã tạo API key mới — cập nhật extension hoặc đăng nhập lại', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Tạo key thất bại', 'error');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="card settings-groupflow" style={{ marginTop: 24 }}>
      <div className="settings-section-header">
        <div>
          <h3><KeyRound size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />GroupFlow Extension</h3>
          <p className="field-hint">
            Chrome extension đăng FB Group. Website chỉ lưu draft + metadata — không chạy job fanpage.
            Extension gọi <code>{'{url}'}/api/group-posts/...</code> với API key hoặc đăng nhập email.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">Đang tải…</p>
      ) : (
        <>
          <div className="settings-groupflow-grid">
            <label>
              API key extension
              <div className="input-with-actions">
                <input
                  type={showKey ? 'text' : 'password'}
                  readOnly
                  value={info?.api_key || ''}
                  className="input mono"
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? 'Ẩn' : 'Hiện'}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleCopy} disabled={!info?.api_key}>
                  <Copy size={14} />
                </Button>
              </div>
              <span className="field-hint">Preview: {info?.api_key_preview || '—'}</span>
            </label>

            <div className="settings-groupflow-meta">
              <div>
                <strong>FB đã map</strong>
                <p>{info?.fb_user_name || '—'}</p>
                {info?.fb_user_id && <small className="text-muted">ID: {info.fb_user_id}</small>}
              </div>
              <div>
                <strong>Cập nhật</strong>
                <p>{info?.updated_at ? formatDateTime(info.updated_at) : '—'}</p>
              </div>
            </div>
          </div>

          <div className="header-actions" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
            <Button type="button" variant="secondary" onClick={handleRegenerate} disabled={regenerating}>
              <RefreshCw size={14} />
              {regenerating ? 'Đang tạo…' : 'Tạo lại API key'}
            </Button>
          </div>

          <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--border, #e4e4e7)' }} />

          <div className="settings-groupflow-grid">
            <label>
              License key của tôi (cách khác để dùng extension — thay cho API key ở trên)
              {licenseLoading ? (
                <p className="text-muted" style={{ margin: '4px 0 0' }}>Đang tải…</p>
              ) : license ? (
                <div className="input-with-actions">
                  <input
                    type={showLicense ? 'text' : 'password'}
                    readOnly
                    value={license.key_value || ''}
                    className="input mono"
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowLicense((v) => !v)}>
                    {showLicense ? 'Ẩn' : 'Hiện'}
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={handleCopyLicense}>
                    <Copy size={14} />
                  </Button>
                </div>
              ) : (
                <div style={{ marginTop: 6 }}>
                  <Button type="button" variant="secondary" size="sm" onClick={handleCreateLicense} disabled={licenseCreating}>
                    {licenseCreating ? 'Đang tạo…' : 'Tạo license key'}
                  </Button>
                </div>
              )}
            </label>
          </div>

          <ol className="field-hint" style={{ marginTop: 16, paddingLeft: 20 }}>
            <li>Cài extension từ thư mục <code>GroupFlow/fb-group-poster/</code> (Chrome → Extensions → Load unpacked).</li>
            <li>Settings extension: URL <strong>https://tidien.xyz</strong> (hoặc domain staging).</li>
            <li>Đăng nhập email tidien <em>hoặc</em> dán API key ở trên.</li>
            <li>Import draft tại <strong>Group → Import</strong>, rồi extension → <strong>Tải từ website</strong>.</li>
          </ol>
        </>
      )}
    </div>
  );
}
