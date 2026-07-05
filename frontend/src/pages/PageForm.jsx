import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../services/authContext';
import { skillTypeLabel, tokenStatusLabel } from '../config/vi';
import Skeleton from '../components/ui/Skeleton';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import ImageScheduleFields from '../components/ImageScheduleFields';

const defaultImageSchedule = () => ({
  enabled: false,
  start_hour: 1,
  start_minute: 0,
  end_hour: 5,
  end_minute: 0,
  interval_minutes: 10,
});

const initialForm = {
  name: '',
  page_id: '',
  page_token: '',
  composio_page_token: '',
  composio_user_id: '',
  composio_connected_account_id: '',
  token_source: 'manual',
  composio_synced: false,
  avatar_url: '',
  skill_ids: [],
  text_provider_id: '',
  image_provider_id: '',
  google_drive_folder_id: '',
  is_active: true,
  assign_user_ids: [],
  image_schedule: defaultImageSchedule(),
};

export default function PageForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const isEdit = Boolean(id);

  const [form, setForm] = useState(initialForm);
  const [skills, setSkills] = useState([]);
  const [providers, setProviders] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [showEditToken, setShowEditToken] = useState(false);
  const [showComposioToken, setShowComposioToken] = useState(false);
  const [composioConfig, setComposioConfig] = useState(null);
  const [composioSyncing, setComposioSyncing] = useState(false);
  const [hasComposioToken, setHasComposioToken] = useState(false);
  const [composioTokenPreview, setComposioTokenPreview] = useState('');
  const [hasManualToken, setHasManualToken] = useState(false);
  const [manualTokenPreview, setManualTokenPreview] = useState('');
  const [tokenHealth, setTokenHealth] = useState(null);
  const [showComposioOverrides, setShowComposioOverrides] = useState(false);
  const [driveTesting, setDriveTesting] = useState(false);

  const applyComposioDefaults = (prev, defaults) => ({
    ...prev,
    composio_user_id: prev.composio_user_id || defaults?.default_user_id || '',
    composio_connected_account_id: prev.composio_connected_account_id || defaults?.default_connected_account_id || '',
  });

  useEffect(() => {
    api.get('/pages/composio/config')
      .then((r) => {
        setComposioConfig(r.data);
        setForm((prev) => applyComposioDefaults(prev, r.data));
      })
      .catch(() => setComposioConfig({ configured: false }));
  }, []);

  useEffect(() => {
    const requests = [api.get('/skills'), api.get('/providers')];
    if (isSuperAdmin) requests.push(api.get('/users'));
    Promise.all(requests)
      .then(([skillsRes, providersRes, usersRes]) => {
        setSkills(skillsRes.data);
        setProviders(providersRes.data);
        if (usersRes?.data) {
          setAssignableUsers(
            usersRes.data.filter((u) => u.is_active && ['admin', 'editor'].includes(u.role))
          );
        }
      })
      .catch(console.error);
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isEdit) {
      setLoading(false);
      setForm(initialForm);
    }
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    setLoading(true);
    setForm(initialForm);
    Promise.all([api.get(`/pages/${id}`), api.get('/pages/composio/config')])
      .then(([pageRes, composioRes]) => {
        if (cancelled) return;
        const page = pageRes.data;
        const defaults = composioRes.data;
        setComposioConfig(defaults);
        const pageUserId = page.composio_user_id || '';
        const pageAccountId = page.composio_connected_account_id || '';
        const usesOverrides = !!(pageUserId && pageUserId !== (defaults?.default_user_id || ''))
          || !!(pageAccountId && pageAccountId !== (defaults?.default_connected_account_id || ''));
        setShowComposioOverrides(usesOverrides);
        setForm({
          name: page.name || '',
          page_id: page.page_id || '',
          page_token: '',
          composio_page_token: '',
          composio_user_id: pageUserId || defaults?.default_user_id || '',
          composio_connected_account_id: pageAccountId || defaults?.default_connected_account_id || '',
          token_source: page.token_source || 'manual',
          composio_synced: !!page.composio_page_token,
          avatar_url: page.avatar_url || '',
          skill_ids: page.skill_ids || page.skills?.map((s) => s.id) || (page.skill_id ? [Number(page.skill_id)] : []),
          text_provider_id: page.text_provider_id ? String(page.text_provider_id) : '',
          image_provider_id: page.image_provider_id ? String(page.image_provider_id) : '',
          google_drive_folder_id: page.google_drive_folder_id || '',
          is_active: !!page.is_active,
          assign_user_ids: Array.isArray(page.assigned_user_ids)
            ? page.assigned_user_ids.map(Number).filter(Boolean)
            : [],
          image_schedule: page.image_schedule
            ? {
              enabled: !!page.image_schedule.enabled,
              start_hour: page.image_schedule.start_hour ?? 1,
              start_minute: page.image_schedule.start_minute ?? 0,
              end_hour: page.image_schedule.end_hour ?? 5,
              end_minute: page.image_schedule.end_minute ?? 0,
              interval_minutes: page.image_schedule.interval_minutes ?? 10,
            }
            : defaultImageSchedule(),
        });
        setHasComposioToken(!!page.composio_page_token);
        setComposioTokenPreview(page.composio_page_token_preview || '');
        setHasManualToken(!!page.page_token);
        setManualTokenPreview(page.page_token_preview || '');
        setTokenHealth({
          manual_token_status: page.manual_token_status,
          manual_token_expires_at: page.manual_token_expires_at,
          composio_token_status: page.composio_token_status,
          composio_token_expires_at: page.composio_token_expires_at,
        });
      })
      .catch((err) => {
        if (!cancelled) {
          showToast(err.response?.data?.error || 'Không tải được fanpage', 'error');
          navigate('/pages', { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, isEdit, navigate, showToast]);

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const toggleSkill = (skillId) => {
    const sid = Number(skillId);
    setForm((prev) => ({
      ...prev,
      skill_ids: prev.skill_ids.includes(sid)
        ? prev.skill_ids.filter((x) => x !== sid)
        : [...prev.skill_ids, sid],
    }));
  };

  const toggleAssignUser = (userId) => {
    const uid = Number(userId);
    setForm((prev) => ({
      ...prev,
      assign_user_ids: prev.assign_user_ids.includes(uid)
        ? prev.assign_user_ids.filter((x) => x !== uid)
        : [...prev.assign_user_ids, uid],
    }));
  };

  const loadTokenIntoForm = async () => {
    if (!isEdit) return;
    try {
      const response = await api.get(`/pages/${id}`);
      setForm((prev) => ({ ...prev, page_token: response.data.page_token || '' }));
      setShowEditToken(true);
      showToast('Đã nạp token thủ công', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được token', 'error');
    }
  };

  const loadComposioTokenIntoForm = async () => {
    if (!isEdit) return;
    try {
      const response = await api.get(`/pages/${id}`);
      const token = response.data.composio_page_token || '';
      setForm((prev) => ({ ...prev, composio_page_token: token }));
      setHasComposioToken(!!token);
      setShowComposioToken(!!token);
      showToast(token ? 'Đã nạp token Composio' : 'Fanpage chưa có token Composio — bấm Đồng bộ', token ? 'success' : 'error');
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được token Composio', 'error');
    }
  };

  const handleScheduleChange = async (field, value) => {
    const nextSchedule = { ...form.image_schedule, [field]: value };
    setForm((prev) => ({
      ...prev,
      image_schedule: nextSchedule,
    }));

    if (field === 'enabled' && isEdit) {
      try {
        await api.put(`/pages/${id}`, buildPayload({ image_schedule: nextSchedule }));
        showToast(
          value ? 'Đã bật lịch xuất ảnh fanpage' : 'Đã tắt lịch xuất ảnh fanpage',
          'success'
        );
      } catch (err) {
        setForm((prev) => ({
          ...prev,
          image_schedule: { ...prev.image_schedule, enabled: !value },
        }));
        showToast(err.response?.data?.error || 'Không lưu được lịch fanpage', 'error');
      }
    }
  };

  const previewComposioSync = async () => {
    if (!form.page_id?.trim()) {
      showToast('Nhập Page ID trước', 'error');
      return;
    }
    setComposioSyncing(true);
    try {
      const response = await api.post('/pages/composio/preview-sync', {
        page_id: form.page_id.trim(),
        composio_user_id: form.composio_user_id?.trim() || undefined,
        composio_connected_account_id: form.composio_connected_account_id?.trim() || undefined,
      });
      setForm((prev) => ({
        ...prev,
        name: prev.name || response.data.page_name || prev.name,
        avatar_url: prev.avatar_url || response.data.avatar_url || prev.avatar_url,
        composio_user_id: response.data.composio_user_id || prev.composio_user_id,
        composio_connected_account_id: response.data.composio_connected_account_id || prev.composio_connected_account_id,
        composio_page_token: response.data.composio_page_token || '',
        composio_synced: true,
      }));
      setHasComposioToken(true);
      setComposioTokenPreview(response.data.token_preview || '');
      setShowComposioToken(!!response.data.composio_page_token);
      showToast(`Composio OK — ${response.data.page_name || response.data.page_id}`, 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Không lấy được token từ Composio', 'error');
    } finally {
      setComposioSyncing(false);
    }
  };

  const syncComposioOnPage = async () => {
    if (!isEdit) return previewComposioSync();
    setComposioSyncing(true);
    try {
      const response = await api.post(`/pages/${id}/composio/sync`);
      const fullToken = response.data.composio_page_token || '';
      setHasComposioToken(!!fullToken);
      setComposioTokenPreview(response.data.composio_page_token_preview || '');
      setForm((prev) => ({
        ...prev,
        composio_page_token: fullToken,
        composio_synced: true,
        token_source: response.data.token_source || prev.token_source,
      }));
      setShowComposioToken(!!fullToken);
      if (response.data.composio_token_status) {
        setTokenHealth((prev) => ({
          ...prev,
          composio_token_status: response.data.composio_token_status,
          composio_token_expires_at: response.data.composio_token_expires_at,
        }));
      }
      showToast(fullToken ? 'Đã đồng bộ và hiển thị token Composio' : 'Đã đồng bộ token Composio', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Đồng bộ Composio thất bại', 'error');
    } finally {
      setComposioSyncing(false);
    }
  };

  const buildPayload = (overrides = {}) => {
    const imageSchedule = overrides.image_schedule ?? form.image_schedule;
    const useOverrides = showComposioOverrides;
    const payload = {
      name: form.name.trim(),
      avatar_url: form.avatar_url?.trim() || '',
      skill_ids: form.skill_ids.map(Number).filter(Boolean),
      text_provider_id: form.text_provider_id ? Number(form.text_provider_id) : null,
      image_provider_id: form.image_provider_id ? Number(form.image_provider_id) : null,
      google_drive_folder_id: form.google_drive_folder_id?.trim() || null,
      is_active: form.is_active,
      image_schedule: imageSchedule,
      token_source: form.token_source,
      sync_composio: !isEdit && form.composio_synced,
    };
    if (useOverrides) {
      payload.composio_user_id = form.composio_user_id?.trim() || undefined;
      payload.composio_connected_account_id = form.composio_connected_account_id?.trim() || undefined;
    }
    if (!isEdit) {
      payload.page_id = form.page_id.trim();
    }
    if (form.page_token?.trim()) {
      payload.page_token = form.page_token.trim();
    }
    if (isSuperAdmin) {
      payload.assign_user_ids = form.assign_user_ids.map(Number).filter(Boolean);
    }
    return payload;
  };

  const testDriveFolder = async () => {
    const folderId = form.google_drive_folder_id?.trim();
    if (!folderId) {
      showToast('Nhập Folder ID trước — hoặc để trống để dùng folder gốc trong Cài đặt', 'error');
      return;
    }
    setDriveTesting(true);
    try {
      if (isEdit) {
        const response = await api.post(`/pages/${id}/drive-folder/test`, {
          google_drive_folder_id: folderId,
        });
        const name = response.data?.folder?.folder_name || folderId;
        showToast(`Folder OK: ${name}`, 'success');
      } else {
        const response = await api.post('/settings/media-storage/test', {
          google_drive_folder_id: folderId,
        });
        const name = response.data?.folder?.folder_name || folderId;
        showToast(`Folder OK: ${name}`, 'success');
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Kiểm tra folder thất bại', 'error');
    } finally {
      setDriveTesting(false);
    }
  };

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    setSaving(true);
    try {
      const payload = buildPayload();
      if (isEdit) {
        await api.put(`/pages/${id}`, payload);
        showToast('Đã cập nhật fanpage', 'success');
      } else {
        await api.post('/pages', payload);
        showToast('Đã thêm fanpage', 'success');
      }
      navigate('/pages');
    } catch (err) {
      showToast(err.response?.data?.error || 'Không lưu được fanpage', 'error');
    } finally {
      setSaving(false);
    }
  };

  const skillsByType = {
    text: skills.filter((s) => (s.skill_type || 'text') === 'text'),
    image: skills.filter((s) => s.skill_type === 'image'),
    video: skills.filter((s) => s.skill_type === 'video'),
  };

  const selectedSkills = skills.filter((s) => form.skill_ids.includes(s.id));

  const renderSkillGroup = (type, list) => {
    if (!list.length) return null;
    return (
      <div key={type} className="page-skill-group">
        <span className="field-label">{skillTypeLabel(type)}</span>
        <div className="page-skill-picker">
          {list.map((s) => (
            <label key={s.id} className="page-skill-option">
              <input
                type="checkbox"
                checked={form.skill_ids.includes(s.id)}
                onChange={() => toggleSkill(s.id)}
              />
              <span>
                <strong>{s.name}</strong>
                {s.prompt_preview && <small className="text-muted">{s.prompt_preview}</small>}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="page-shell post-editor-page">
        <Skeleton lines={8} />
      </div>
    );
  }

  return (
    <div className="page-shell post-editor-page">
      <PageHeader
        back={{
          onClick: () => navigate('/pages'),
          label: 'Quay lại',
          ariaLabel: 'Quay lại danh sách fanpage',
        }}
        title={isEdit ? 'Sửa fanpage' : 'Thêm fanpage mới'}
        description={isEdit ? 'Cập nhật thông tin, skill, provider và lịch xuất ảnh cho fanpage.' : 'Kết nối fanpage Facebook với token và cấu hình AI.'}
      />

      <form className="card form-card modal-form" onSubmit={handleSubmit}>
        <div className="modal-form-grid">
          <label>
            Tên hiển thị
            <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} required placeholder="VD: Cộng đồng ABC" />
          </label>
          <label>
            Page ID
            <input
              value={form.page_id}
              onChange={(e) => handleChange('page_id', e.target.value)}
              required
              disabled={isEdit}
              placeholder="ID số từ Facebook"
            />
          </label>

          <div className="field-span-2 page-form-section">
            <h2 className="page-form-section-title">Kết nối Facebook — 2 token</h2>
            <p className="field-hint" style={{ marginBottom: 12 }}>
              Mỗi fanpage lưu <strong>2 token riêng</strong> trong database (<code>fb_pages</code>):
              {' '}<code>page_token</code> (thủ công) và <code>composio_page_token</code> (từ Composio).
              Đồng bộ Composio chỉ ghi vào <code>composio_page_token</code> — không đè token thủ công.
            </p>
            {form.token_source && (
              <p className="field-hint" style={{ marginBottom: 12 }}>
                Token đang dùng khi đăng bài:{' '}
                <strong>{form.token_source === 'composio' ? 'Composio' : 'Thủ công'}</strong>
                {form.token_source === 'manual' && hasComposioToken && (
                  <> — đổi sang Composio ở ô «Ưu tiên đăng bài» bên dưới</>
                )}
              </p>
            )}
            {tokenHealth && (
              <p className="field-hint" style={{ marginBottom: 12 }}>
                Manual: {tokenStatusLabel(tokenHealth.manual_token_status || 'unknown')}
                {tokenHealth.manual_token_expires_at ? ` · ${new Date(tokenHealth.manual_token_expires_at).toLocaleString('vi-VN')}` : ''}
                {' · '}
                Composio: {tokenStatusLabel(tokenHealth.composio_token_status || 'unknown')}
                {tokenHealth.composio_token_expires_at ? ` · ${new Date(tokenHealth.composio_token_expires_at).toLocaleString('vi-VN')}` : ''}
              </p>
            )}

            <label className="field-span-2">
              Page Access Token (thủ công) — cột <code>page_token</code>
              {(hasManualToken || manualTokenPreview) && !form.page_token?.trim() && (
                <span className="field-hint" style={{ display: 'block', marginBottom: 6 }}>
                  Đã lưu trong DB — bấm <strong>Nạp từ DB</strong> để xem đủ token.
                </span>
              )}
              <div className="token-input-row">
                <input
                  type={showEditToken ? 'text' : 'password'}
                  value={form.page_token}
                  onChange={(e) => handleChange('page_token', e.target.value)}
                  placeholder={isEdit ? 'Để trống = giữ token thủ công hiện tại' : 'Dán token Graph API (tuỳ chọn nếu có Composio)'}
                />
                {isEdit && (
                  <>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowEditToken((v) => !v)}>
                      {showEditToken ? <EyeOff size={16} /> : <Eye size={16} />}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={loadTokenIntoForm}>
                      Nạp từ DB
                    </Button>
                  </>
                )}
              </div>
            </label>

            <label className="field-span-2" style={{ marginTop: 8 }}>
              Page Access Token (Composio) — cột <code>composio_page_token</code>
              {(hasComposioToken || composioTokenPreview) && !form.composio_page_token?.trim() && (
                <span className="field-hint" style={{ display: 'block', marginBottom: 6, marginTop: 6 }}>
                  Đã lưu trong DB — bấm <strong>Nạp từ DB</strong> để xem đủ token (giống token thủ công).
                </span>
              )}
              {!hasComposioToken && !composioTokenPreview && (
                <span className="field-hint field-hint--warn" style={{ display: 'block', marginBottom: 6, marginTop: 6 }}>
                  Chưa có — bấm <strong>Đồng bộ token Composio</strong> bên dưới.
                </span>
              )}
              <div className="token-input-row">
                <input
                  type={showComposioToken ? 'text' : 'password'}
                  readOnly
                  value={form.composio_page_token}
                  placeholder={isEdit ? 'Nạp từ DB hoặc Đồng bộ để xem token' : 'Đồng bộ Composio để lấy token'}
                />
                {isEdit && (
                  <>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowComposioToken((v) => !v)}>
                      {showComposioToken ? <EyeOff size={16} /> : <Eye size={16} />}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={loadComposioTokenIntoForm}>
                      Nạp từ DB
                    </Button>
                  </>
                )}
              </div>
            </label>

            <div className="page-form-section" style={{ marginTop: 16 }}>
              <h3 className="page-form-section-title" style={{ fontSize: 'var(--text-sm)' }}>Token Composio</h3>
              {!composioConfig?.configured ? (
                <p className="field-hint field-hint--warn">
                  Chưa cấu hình Composio — vào <Link to="/settings">Cài đặt → Composio</Link> → Lưu vào database
                </p>
              ) : (
                <p className="field-hint" style={{ marginBottom: 8 }}>
                  Dùng cấu hình chung từ <strong>Cài đặt</strong>
                  {composioConfig.default_user_id && (
                    <> — User: <code>{composioConfig.default_user_id}</code></>
                  )}
                  {composioConfig.default_connected_account_id && (
                    <> · Account: <code>{composioConfig.default_connected_account_id}</code></>
                  )}
                  {composioConfig.connection?.status && (
                    <> · FB: <strong>{composioConfig.connection.status}</strong></>
                  )}
                </p>
              )}
              {(hasComposioToken || composioTokenPreview) ? null : composioConfig?.configured && (
                <p className="field-hint field-hint--warn" style={{ marginBottom: 8 }}>
                  Chưa có token Composio cho fanpage này — bấm Đồng bộ bên dưới.
                </p>
              )}
              <label className="page-skill-option" style={{ marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={showComposioOverrides}
                  onChange={(e) => setShowComposioOverrides(e.target.checked)}
                />
                <span>Tuỳ chỉnh User ID / Connected Account (khác Cài đặt)</span>
              </label>
              {showComposioOverrides && (
                <div className="settings-schedule-grid">
                  <label>
                    Composio User ID
                    <input
                      value={form.composio_user_id}
                      onChange={(e) => handleChange('composio_user_id', e.target.value)}
                      placeholder={composioConfig?.default_user_id || 'pg-test-...'}
                    />
                  </label>
                  <label>
                    Connected Account ID
                    <input
                      value={form.composio_connected_account_id}
                      onChange={(e) => handleChange('composio_connected_account_id', e.target.value)}
                      placeholder={composioConfig?.default_connected_account_id || 'ca_...'}
                    />
                  </label>
                </div>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={syncComposioOnPage}
                disabled={composioSyncing || !composioConfig?.configured}
                style={{ marginTop: 8 }}
              >
                {composioSyncing ? 'Đang đồng bộ...' : (isEdit ? 'Đồng bộ token Composio' : 'Kiểm tra + lấy token Composio')}
              </Button>
            </div>

            <label style={{ marginTop: 16 }}>
              Ưu tiên đăng bài bằng
              <select value={form.token_source} onChange={(e) => handleChange('token_source', e.target.value)}>
                <option value="manual">Token thủ công</option>
                <option value="composio">Token Composio</option>
              </select>
              <span className="field-hint">Tự đổi khi token active lỗi lúc đăng bài.</span>
            </label>
          </div>

          <label className="field-span-2">
            Avatar URL
            <input value={form.avatar_url} onChange={(e) => handleChange('avatar_url', e.target.value)} placeholder="https://..." />
          </label>

          <div className="page-form-section field-span-2">
            <h2 className="page-form-section-title">Cấu hình AI</h2>
            <p className="field-hint page-form-section-hint">
              <strong>Bước 1:</strong> Tạo provider tại mục{' '}
              <Link to="/providers">AI Provider</Link>
              {' '}(bấm Cấu hình → dán API key).
              {' '}<strong>Bước 2:</strong> Tick skill + chọn provider bên dưới rồi Lưu fanpage.
            </p>
          </div>

          <div className="field-span-2 page-ai-config-block">
            <span className="field-label">Skill AI — prompt viết bài / mô tả ảnh</span>
            <p className="field-hint">Skill quyết định phong cách nội dung khi AI generate. Có thể chọn nhiều loại.</p>
            {skills.length === 0 ? (
              <span className="text-muted">Chưa có skill — <Link to="/settings?tab=skills">tạo tại Skill AI</Link></span>
            ) : (
              <>
                {renderSkillGroup('text', skillsByType.text)}
                {renderSkillGroup('image', skillsByType.image)}
                {renderSkillGroup('video', skillsByType.video)}
              </>
            )}
            {selectedSkills.length > 0 && (
              <span className="field-hint">
                Đã chọn {selectedSkills.length}: {selectedSkills.map((s) => `${s.name} (${skillTypeLabel(s.skill_type || 'text')})`).join(', ')}
              </span>
            )}
          </div>

          <div className="page-ai-config-block">
            <label>
              Text Provider — viết bài
              <select value={form.text_provider_id} onChange={(e) => handleChange('text_provider_id', e.target.value)}>
                <option value="">— Chưa chọn —</option>
                {providers.filter((p) => p.type === 'text' && p.is_active).map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.name}{p.model ? ` (${p.model})` : ''}</option>
                ))}
              </select>
            </label>
            {!providers.some((p) => p.type === 'text') && (
              <span className="field-hint field-hint--warn">Chưa có text provider — <Link to="/providers">tạo trước</Link></span>
            )}
          </div>

          <div className="page-ai-config-block">
            <label>
              Image Provider — xuất ảnh AI
              <select value={form.image_provider_id} onChange={(e) => handleChange('image_provider_id', e.target.value)}>
                <option value="">— Chưa chọn —</option>
                {providers.filter((p) => p.type === 'image' && p.is_active).map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.name}{p.model ? ` (${p.model})` : ''}</option>
                ))}
              </select>
            </label>
            {!providers.some((p) => p.type === 'image') && (
              <span className="field-hint field-hint--warn">Chưa có image provider — <Link to="/providers">tạo trước</Link></span>
            )}
          </div>

          <div className="page-form-section field-span-2">
            <h2 className="page-form-section-title">Google Drive — folder ảnh riêng</h2>
            <p className="field-hint page-form-section-hint">
              Mỗi fanpage có thể có folder Drive riêng — ảnh AI và upload sẽ vào folder này thay vì folder gốc trong{' '}
              <Link to="/settings">Cài đặt</Link>.
              Tạo subfolder trên Drive → Share với service account (Editor) → copy Folder ID từ URL.
            </p>
            <label>
              Google Drive Folder ID (tuỳ chọn)
              <input
                value={form.google_drive_folder_id}
                onChange={(e) => handleChange('google_drive_folder_id', e.target.value)}
                placeholder="Để trống = dùng folder gốc trong Cài đặt"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={testDriveFolder}
              disabled={driveTesting || !form.google_drive_folder_id?.trim()}
              style={{ marginTop: 8 }}
            >
              {driveTesting ? 'Đang kiểm tra...' : 'Kiểm tra folder Drive'}
            </Button>
          </div>

          <ImageScheduleFields
            value={form.image_schedule}
            onChange={handleScheduleChange}
            warn={
              form.image_schedule?.enabled && !form.image_provider_id
                ? 'Cần chọn Image Provider phía trên — nếu không job xuất ảnh sẽ lỗi.'
                : null
            }
          />

          <label className="checkbox-field field-span-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => handleChange('is_active', e.target.checked)} />
            Fanpage đang hoạt động
          </label>

          {isSuperAdmin && (
            <div className="field-span-2">
              <span className="field-label">Gán cho admin/biên tập</span>
              <p className="field-hint">Chọn user sẽ thấy và quản lý fanpage này (ngoài lịch xuất ảnh riêng ở trên).</p>
              {assignableUsers.length > 0 ? (
                <div className="page-assign-grid">
                  {assignableUsers.map((u) => (
                    <label key={u.id} className="checkbox-label page-assign-item">
                      <input
                        type="checkbox"
                        checked={form.assign_user_ids.includes(Number(u.id))}
                        onChange={() => toggleAssignUser(u.id)}
                      />
                      {u.name} <small>({u.role})</small>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="field-hint field-hint--warn">
                  Chưa có admin/biên tập — tạo user tại <Link to="/users">Người dùng</Link> trước.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="post-editor-page-footer">
          <Button type="button" variant="secondary" onClick={() => navigate('/pages')}>Huỷ</Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo fanpage'}
          </Button>
        </div>
      </form>
    </div>
  );
}
