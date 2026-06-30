import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import Skeleton from '../components/ui/Skeleton';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';

const initialForm = {
  name: '',
  domain: '',
  skill_id: '',
  text_provider_id: '',
  image_provider_id: '',
  publish_url: '',
  api_key: '',
  is_active: true,
};

export default function WebsiteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(initialForm);
  const [skills, setSkills] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/skills'), api.get('/providers')])
      .then(([skillsRes, providersRes]) => {
        setSkills(skillsRes.data);
        setProviders(providersRes.data);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!isEdit) {
      setLoading(false);
      setForm(initialForm);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    api.get(`/websites/${id}`)
      .then((response) => {
        if (cancelled) return;
        const website = response.data;
        setForm({
          name: website.name || '',
          domain: website.domain || '',
          skill_id: website.skill_id ? String(website.skill_id) : '',
          text_provider_id: website.text_provider_id ? String(website.text_provider_id) : '',
          image_provider_id: website.image_provider_id ? String(website.image_provider_id) : '',
          publish_url: website.publish_url || '',
          api_key: '',
          is_active: !!website.is_active,
        });
        setHasApiKey(!!website.api_key);
      })
      .catch((err) => {
        if (!cancelled) {
          showToast(err.response?.data?.error || 'Không tải được website', 'error');
          navigate('/websites', { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, isEdit, navigate, showToast]);

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        domain: form.domain?.trim() || null,
        skill_id: form.skill_id ? Number(form.skill_id) : null,
        text_provider_id: form.text_provider_id ? Number(form.text_provider_id) : null,
        image_provider_id: form.image_provider_id ? Number(form.image_provider_id) : null,
        publish_url: form.publish_url?.trim() || null,
        is_active: form.is_active,
      };
      if (form.api_key?.trim()) {
        payload.api_key = form.api_key.trim();
      }
      if (isEdit) {
        await api.put(`/websites/${id}`, payload);
        showToast('Đã cập nhật website', 'success');
      } else {
        await api.post('/websites', payload);
        showToast('Đã thêm website', 'success');
      }
      navigate('/websites');
    } catch (err) {
      showToast(err.response?.data?.error || 'Không lưu được website', 'error');
    } finally {
      setSaving(false);
    }
  };

  const textSkills = skills.filter((s) => (s.skill_type || 'text') === 'text');

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
          onClick: () => navigate('/websites'),
          label: 'Quay lại',
          ariaLabel: 'Quay lại danh sách website',
        }}
        title={isEdit ? 'Sửa website' : 'Thêm website mới'}
        description="Website blog độc lập với Fanpage Facebook — dùng để generate bài blog SEO (tab Tạo bài → Website Blog) và publish lên CMS thật."
      />

      <form className="card form-card modal-form" onSubmit={handleSubmit}>
        <div className="modal-form-grid">
          <label>
            Tên website
            <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} required placeholder="VD: zalopilot.vn" />
          </label>
          <label>
            Domain (tuỳ chọn)
            <input value={form.domain} onChange={(e) => handleChange('domain', e.target.value)} placeholder="zalopilot.vn" />
          </label>

          <div className="page-form-section field-span-2">
            <h2 className="page-form-section-title">Brand voice + AI provider</h2>
            <p className="field-hint page-form-section-hint">
              Skill quyết định văn phong khi generate bài blog. Provider tạo tại <Link to="/providers">AI Provider</Link>.
            </p>
            <label>
              Skill viết bài (brand voice)
              <select value={form.skill_id} onChange={(e) => handleChange('skill_id', e.target.value)}>
                <option value="">— Chưa chọn —</option>
                {textSkills.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
              {!textSkills.length && (
                <span className="field-hint field-hint--warn">Chưa có skill text — <Link to="/skills">tạo trước</Link></span>
              )}
            </label>
            <label style={{ marginTop: 8 }}>
              Text Provider — viết bài
              <select value={form.text_provider_id} onChange={(e) => handleChange('text_provider_id', e.target.value)}>
                <option value="">— Chưa chọn —</option>
                {providers.filter((p) => p.type === 'text' && p.is_active).map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.name}{p.model ? ` (${p.model})` : ''}</option>
                ))}
              </select>
            </label>
            <label style={{ marginTop: 8 }}>
              Image Provider — ảnh đại diện bài blog
              <select value={form.image_provider_id} onChange={(e) => handleChange('image_provider_id', e.target.value)}>
                <option value="">— Chưa chọn —</option>
                {providers.filter((p) => p.type === 'image' && p.is_active).map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.name}{p.model ? ` (${p.model})` : ''}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="page-form-section field-span-2">
            <h2 className="page-form-section-title">Publish API (tuỳ chọn)</h2>
            <p className="field-hint page-form-section-hint">
              Nhập endpoint + key do bên website cấp để bấm <strong>Publish lên website</strong> sau khi generate.
              Spec đầy đủ cho dev website: <code>docs/WEBSITE_PUBLISH_API.md</code>. Để trống nếu chỉ cần lưu nháp để copy tay.
            </p>
            <label>
              Publish URL
              <input
                value={form.publish_url}
                onChange={(e) => handleChange('publish_url', e.target.value)}
                placeholder="https://zalopilot.vn/api/autopost/posts"
              />
            </label>
            <label style={{ marginTop: 8 }}>
              API Key
              {isEdit && hasApiKey && !form.api_key?.trim() && (
                <span className="field-hint" style={{ display: 'block', marginBottom: 6 }}>
                  Đã lưu trong DB — để trống ô này sẽ giữ nguyên key cũ.
                </span>
              )}
              <input
                type="password"
                value={form.api_key}
                onChange={(e) => handleChange('api_key', e.target.value)}
                placeholder={isEdit ? 'Để trống = giữ key hiện tại' : 'Key do website cấp'}
              />
            </label>
          </div>

          <label className="checkbox-field field-span-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => handleChange('is_active', e.target.checked)} />
            Website đang hoạt động
          </label>
        </div>

        <div className="post-editor-page-footer">
          <Button type="button" variant="secondary" onClick={() => navigate('/websites')}>Huỷ</Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Tạo website'}
          </Button>
        </div>
      </form>
    </div>
  );
}
