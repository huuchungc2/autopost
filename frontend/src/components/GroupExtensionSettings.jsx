import { useEffect, useState } from 'react';
import { Copy, RefreshCw, KeyRound } from 'lucide-react';
import api from '../services/api';
import Button from './ui/Button';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../services/authContext';
import { formatDateTime } from '../utils/date';

export default function GroupExtensionSettings() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [license, setLicense] = useState(null);
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [licenseCreating, setLicenseCreating] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  // 2026-07-13 — Tony: giới hạn số ngày (kể từ ngày đăng) GroupFlow còn đồng bộ bài viết về
  // extension (cả bài của mình lẫn đồng đội) — bài cũ hơn không tải về/không check nữa, giảm tải
  // server. Cấu hình super_admin, mặc định 60 ngày (xem appSettingsService.js).
  const [lookbackDays, setLookbackDays] = useState('');
  const [lookbackLoading, setLookbackLoading] = useState(true);
  const [lookbackSaving, setLookbackSaving] = useState(false);
  const canEditLookback = user?.role === 'super_admin';

  // Danh mục ngành nghề GroupFlow (dùng chung toàn hệ thống — extension kéo về). Admin/super_admin quản lý.
  const canManageCategories = ['super_admin', 'admin'].includes(user?.role);
  const [categories, setCategories] = useState([]);
  const [catLoading, setCatLoading] = useState(true);
  const [newCatName, setNewCatName] = useState('');
  const [catBusy, setCatBusy] = useState(false);

  // Thông báo GroupFlow (website → extension) — admin/super_admin đặt, extension hiện toast.
  const canManageAnnouncement = ['super_admin', 'admin'].includes(user?.role);
  const [ann, setAnn] = useState({ enabled: false, level: 'info', message: '', latest_version: '' });
  const [annLoading, setAnnLoading] = useState(true);
  const [annSaving, setAnnSaving] = useState(false);

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

  const loadLookback = async () => {
    if (user && user.role !== 'super_admin') { setLookbackLoading(false); return; }
    setLookbackLoading(true);
    try {
      const res = await api.get('/settings');
      setLookbackDays(String(res.data?.config?.posts_sync_lookback_days ?? 60));
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được cấu hình đồng bộ', 'error');
    } finally {
      setLookbackLoading(false);
    }
  };

  const loadCategories = async () => {
    if (user && !['super_admin', 'admin'].includes(user.role)) { setCatLoading(false); return; }
    setCatLoading(true);
    try {
      const res = await api.get('/group-categories');
      setCategories(res.data || []);
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được danh mục ngành', 'error');
    } finally {
      setCatLoading(false);
    }
  };

  const loadAnnouncement = async () => {
    if (user && !['super_admin', 'admin'].includes(user.role)) { setAnnLoading(false); return; }
    setAnnLoading(true);
    try {
      const res = await api.get('/settings');
      const a = res.data?.config?.groupflow_announcement;
      if (a) setAnn({ enabled: !!a.enabled, level: a.level || 'info', message: a.message || '', latest_version: a.latest_version || '' });
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được thông báo', 'error');
    } finally {
      setAnnLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadLicense();
    loadLookback();
    loadCategories();
    loadAnnouncement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const handleSaveAnnouncement = async () => {
    setAnnSaving(true);
    try {
      const res = await api.put('/settings/groupflow-announcement', ann);
      const a = res.data?.groupflow_announcement;
      if (a) setAnn({ enabled: !!a.enabled, level: a.level || 'info', message: a.message || '', latest_version: a.latest_version || '' });
      showToast('Đã lưu thông báo GroupFlow', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Lưu thất bại', 'error');
    } finally {
      setAnnSaving(false);
    }
  };

  const updateCatName = (id, name) => setCategories((cs) => cs.map((c) => (c.id === id ? { ...c, name } : c)));

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setCatBusy(true);
    try {
      await api.post('/group-categories', { name });
      setNewCatName('');
      await loadCategories();
      showToast('Đã thêm ngành nghề', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Thêm ngành thất bại', 'error');
    } finally {
      setCatBusy(false);
    }
  };

  const handleRenameCategory = async (id, name) => {
    if (!name.trim()) { showToast('Tên ngành không được trống', 'error'); return; }
    try {
      await api.put(`/group-categories/${id}`, { name: name.trim() });
      showToast('Đã lưu tên ngành', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Lưu thất bại', 'error');
    }
  };

  const handleDeleteCategory = async (id, name, count) => {
    const msg = count
      ? `Xóa ngành "${name}"? ${count} bài đang gán sẽ bị gỡ ngành này (không xoá bài).`
      : `Xóa ngành "${name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await api.delete(`/group-categories/${id}`);
      await loadCategories();
      showToast('Đã xóa ngành', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Xóa thất bại', 'error');
    }
  };

  const handleSaveLookback = async () => {
    const days = parseInt(lookbackDays, 10);
    if (!Number.isFinite(days) || days <= 0) {
      showToast('Số ngày phải là số nguyên dương', 'error');
      return;
    }
    setLookbackSaving(true);
    try {
      const res = await api.put('/settings/posts-sync-lookback', { days });
      setLookbackDays(String(res.data.posts_sync_lookback_days));
      showToast('Đã lưu số ngày đồng bộ', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Lưu thất bại', 'error');
    } finally {
      setLookbackSaving(false);
    }
  };

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

          <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--bg-border)' }} />

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

          {canEditLookback && (
            <>
              <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--bg-border)' }} />
              <div className="settings-groupflow-grid">
                <label>
                  Đồng bộ bài viết cũ hơn (ngày, tính từ ngày đăng)
                  {lookbackLoading ? (
                    <p className="text-muted" style={{ margin: '4px 0 0' }}>Đang tải…</p>
                  ) : (
                    <div className="input-with-actions">
                      <input
                        type="number"
                        min="1"
                        className="input"
                        style={{ maxWidth: 120 }}
                        value={lookbackDays}
                        onChange={(e) => setLookbackDays(e.target.value)}
                      />
                      <Button type="button" onClick={handleSaveLookback} disabled={lookbackSaving}>
                        {lookbackSaving ? 'Đang lưu…' : 'Lưu'}
                      </Button>
                    </div>
                  )}
                  <span className="field-hint">
                    Bài đăng cũ hơn số ngày này (kể từ ngày đăng) sẽ không tải về extension nữa (cả bài của mình lẫn đồng đội) — giảm tải server khi hệ thống tích luỹ nhiều bài. Mặc định 60 ngày.
                  </span>
                </label>
              </div>
            </>
          )}

          {canManageCategories && (
            <>
              <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--bg-border)' }} />
              <div className="settings-groupflow-grid">
                <label>
                  Danh mục ngành nghề (dùng chung — extension kéo về để gán/lọc bài)
                  {catLoading ? (
                    <p className="text-muted" style={{ margin: '4px 0 0' }}>Đang tải…</p>
                  ) : (
                    <>
                      <div className="input-with-actions" style={{ marginTop: 6 }}>
                        <input
                          type="text"
                          className="input"
                          placeholder="Tên ngành mới (VD: Nội thất)"
                          maxLength={60}
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                        />
                        <Button type="button" onClick={handleAddCategory} disabled={catBusy || !newCatName.trim()}>
                          + Thêm
                        </Button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                        {categories.length === 0 && <span className="field-hint">Chưa có ngành nào.</span>}
                        {categories.map((c) => (
                          <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              type="text"
                              className="input"
                              maxLength={60}
                              value={c.name}
                              onChange={(e) => updateCatName(c.id, e.target.value)}
                              style={{ flex: 1 }}
                            />
                            <small className="text-muted" style={{ whiteSpace: 'nowrap' }} title="Số bài đang gán ngành này">
                              {c.post_count || 0} bài
                            </small>
                            <Button type="button" variant="secondary" size="sm" onClick={() => handleRenameCategory(c.id, c.name)}>
                              Lưu
                            </Button>
                            <Button type="button" variant="secondary" size="sm" onClick={() => handleDeleteCategory(c.id, c.name, c.post_count)}>
                              Xóa
                            </Button>
                          </div>
                        ))}
                      </div>
                      <span className="field-hint">
                        Danh mục đồng nhất toàn hệ thống — mọi extension kéo về dùng chung (Cài đặt → Ngành nghề trong extension, hoặc tự động khi mở panel). 1 bài có thể thuộc nhiều ngành; lọc theo ngành ở tab Tạo bài &amp; Comment để lên lịch seeding dễ hơn. Xoá 1 ngành chỉ gỡ ngành đó khỏi bài, không xoá bài.
                      </span>
                    </>
                  )}
                </label>
              </div>
            </>
          )}

          {canManageAnnouncement && (
            <>
              <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--bg-border)' }} />
              <div className="settings-groupflow-grid">
                <label>
                  Thông báo cho extension (hiện toast trong GroupFlow)
                  {annLoading ? (
                    <p className="text-muted" style={{ margin: '4px 0 0' }}>Đang tải…</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 'normal' }}>
                        <input
                          type="checkbox"
                          checked={ann.enabled}
                          onChange={(e) => setAnn((a) => ({ ...a, enabled: e.target.checked }))}
                        />
                        Bật thông báo (extension sẽ hiện toast khi mở panel)
                      </label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <select
                          className="input"
                          style={{ maxWidth: 160 }}
                          value={ann.level}
                          onChange={(e) => setAnn((a) => ({ ...a, level: e.target.value }))}
                        >
                          <option value="info">Thông tin</option>
                          <option value="warning">Cảnh báo</option>
                          <option value="critical">Khẩn cấp</option>
                        </select>
                        <input
                          type="text"
                          className="input"
                          style={{ flex: 1, minWidth: 160 }}
                          placeholder="Bản mới nhất (VD: 1.0.280) — cảnh báo cập nhật"
                          value={ann.latest_version}
                          onChange={(e) => setAnn((a) => ({ ...a, latest_version: e.target.value }))}
                        />
                      </div>
                      <textarea
                        className="input"
                        rows={3}
                        maxLength={500}
                        placeholder="Nội dung thông báo gửi tới mọi extension (VD: Đã có bản mới, vui lòng tải lại extension)…"
                        value={ann.message}
                        onChange={(e) => setAnn((a) => ({ ...a, message: e.target.value }))}
                      />
                      <div>
                        <Button type="button" onClick={handleSaveAnnouncement} disabled={annSaving}>
                          {annSaving ? 'Đang lưu…' : 'Lưu thông báo'}
                        </Button>
                      </div>
                      <span className="field-hint">
                        Extension đọc thông báo khi mở panel (độ trễ vài phút). Chỉ hiện toast 1 lần cho mỗi lần bạn lưu. Ô "Bản mới nhất" so với version extension đang chạy — cũ hơn thì extension nhắc tải lại. Bỏ tick "Bật" để tắt thông báo.
                      </span>
                    </div>
                  )}
                </label>
              </div>
            </>
          )}

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
