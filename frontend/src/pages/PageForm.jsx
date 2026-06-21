import { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../services/authContext';
import { skillTypeLabel } from '../config/vi';
import Skeleton from '../components/ui/Skeleton';
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
  avatar_url: '',
  skill_ids: [],
  text_provider_id: '',
  image_provider_id: '',
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
    api.get(`/pages/${id}`)
      .then((response) => {
        if (cancelled) return;
        const page = response.data;
        setForm({
          name: page.name || '',
          page_id: page.page_id || '',
          page_token: '',
          avatar_url: page.avatar_url || '',
          skill_ids: page.skill_ids || page.skills?.map((s) => s.id) || (page.skill_id ? [Number(page.skill_id)] : []),
          text_provider_id: page.text_provider_id ? String(page.text_provider_id) : '',
          image_provider_id: page.image_provider_id ? String(page.image_provider_id) : '',
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
      showToast('Đã nạp token hiện tại', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Không tải được token', 'error');
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

  const buildPayload = (overrides = {}) => {
    const imageSchedule = overrides.image_schedule ?? form.image_schedule;
    const payload = {
      name: form.name.trim(),
      avatar_url: form.avatar_url?.trim() || '',
      skill_ids: form.skill_ids.map(Number).filter(Boolean),
      text_provider_id: form.text_provider_id ? Number(form.text_provider_id) : null,
      image_provider_id: form.image_provider_id ? Number(form.image_provider_id) : null,
      is_active: form.is_active,
      image_schedule: imageSchedule,
    };
    if (!isEdit) {
      payload.page_id = form.page_id.trim();
      payload.page_token = form.page_token.trim();
    } else if (form.page_token?.trim()) {
      payload.page_token = form.page_token.trim();
    }
    if (isSuperAdmin) {
      payload.assign_user_ids = form.assign_user_ids.map(Number).filter(Boolean);
    }
    return payload;
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
      <div className="page-header post-editor-page-header">
        <button type="button" className="btn btn-secondary post-editor-back-btn" onClick={() => navigate('/pages')}>
          <ArrowLeft size={18} />
          Quay lại
        </button>
        <div>
          <h1>{isEdit ? 'Sửa fanpage' : 'Thêm fanpage mới'}</h1>
          <p>{isEdit ? 'Cập nhật thông tin, skill, provider và lịch xuất ảnh cho fanpage.' : 'Kết nối fanpage Facebook với token và cấu hình AI.'}</p>
        </div>
      </div>

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

          <label className="field-span-2">
            Page Access Token
            <div className="token-input-row">
              <input
                type={showEditToken ? 'text' : 'password'}
                value={form.page_token}
                onChange={(e) => handleChange('page_token', e.target.value)}
                placeholder={isEdit ? 'Để trống = giữ token cũ' : 'Dán Page Access Token'}
                required={!isEdit}
              />
              {isEdit && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowEditToken((v) => !v)}>
                    {showEditToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={loadTokenIntoForm}>
                    Nạp từ DB
                  </button>
                </>
              )}
            </div>
            <span className="field-hint">Token dùng để đăng bài lên fanpage qua Graph API.</span>
          </label>

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
              <span className="text-muted">Chưa có skill — <Link to="/skills">tạo tại Skill AI</Link></span>
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
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/pages')}>Huỷ</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo fanpage'}
          </button>
        </div>
      </form>
    </div>
  );
}
