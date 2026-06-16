import { useEffect, useState } from 'react';

import { Copy, Eye, EyeOff, Plus } from 'lucide-react';

import api from '../services/api';

import Modal from '../components/ui/Modal';

import { useToast } from '../context/ToastContext';

import { useAuth } from '../services/authContext';

import { formatDateTime } from '../utils/date';

import { WEEK_DAYS as DAYS, tokenStatusLabel, skillTypeLabel } from '../config/vi';



const initialForm = {

  name: '',

  page_id: '',

  page_token: '',

  avatar_url: '',

  skill_ids: [],

  text_provider_id: '',

  image_provider_id: '',

  is_active: true,

};



export default function Pages() {

  const { user } = useAuth();

  const isSuperAdmin = user?.role === 'super_admin';

  const canManagePages = ['super_admin', 'admin'].includes(user?.role);

  const [pages, setPages] = useState([]);

  const [skills, setSkills] = useState([]);

  const [providers, setProviders] = useState([]);

  const [form, setForm] = useState(initialForm);

  const [formModalOpen, setFormModalOpen] = useState(false);

  const [editingId, setEditingId] = useState(null);

  const [topicsPageId, setTopicsPageId] = useState(null);

  const [topicsPageName, setTopicsPageName] = useState('');

  const [topics, setTopics] = useState([]);

  const [topicForm, setTopicForm] = useState({ day_of_week: 1, topic: '', post_time: '08:00:00' });

  const [tokenModalId, setTokenModalId] = useState(null);

  const [tokenDetail, setTokenDetail] = useState(null);

  const [tokenLoading, setTokenLoading] = useState(false);

  const [showToken, setShowToken] = useState(false);

  const [showEditToken, setShowEditToken] = useState(false);

  const [newToken, setNewToken] = useState('');

  const [verifying, setVerifying] = useState(false);

  const [verifyResult, setVerifyResult] = useState(null);

  const { showToast } = useToast();



  const loadData = async () => {

    try {

      const [pagesRes, skillsRes, providersRes] = await Promise.all([

        api.get('/pages'),

        api.get('/skills'),

        api.get('/providers'),

      ]);

      setPages(pagesRes.data);

      setSkills(skillsRes.data);

      setProviders(providersRes.data);

    } catch (error) {

      console.error(error);

    }

  };



  useEffect(() => { loadData(); }, []);



  const loadTokenDetail = async (pageId) => {

    setTokenLoading(true);

    setVerifyResult(null);

    try {

      const response = await api.get(`/pages/${pageId}`);

      setTokenDetail(response.data);

    } catch (err) {

      showToast(err.response?.data?.error || 'Không tải được token', 'error');

      setTokenModalId(null);

    } finally {

      setTokenLoading(false);

    }

  };



  const openTokenModal = (pageId) => {

    setTokenModalId(pageId);

    setShowToken(false);

    setNewToken('');

    setVerifyResult(null);

    loadTokenDetail(pageId);

  };



  const closeTokenModal = () => {

    setTokenModalId(null);

    setTokenDetail(null);

    setShowToken(false);

    setNewToken('');

    setVerifyResult(null);

  };



  const copyToken = async () => {

    if (!tokenDetail?.page_token) return;

    try {

      await navigator.clipboard.writeText(tokenDetail.page_token);

      showToast('Đã copy token', 'success');

    } catch {

      showToast('Không copy được — chọn và copy thủ công', 'error');

    }

  };



  const verifyToken = async () => {

    if (!tokenModalId) return;

    setVerifying(true);

    setVerifyResult(null);

    try {

      const response = await api.post(`/pages/${tokenModalId}/verify-token`);

      setVerifyResult({ ok: true, ...response.data });

      showToast('Token hợp lệ với Facebook', 'success');

      loadData();

    } catch (err) {

      const data = err.response?.data;

      setVerifyResult({ ok: false, error: data?.error || 'Token không hợp lệ' });

      showToast(data?.error || 'Token không hợp lệ', 'error');

      loadData();

    } finally {

      setVerifying(false);

    }

  };



  const loadTopics = async (page) => {

    const response = await api.get(`/pages/${page.id}/topics`);

    setTopics(response.data);

    setTopicsPageId(page.id);

    setTopicsPageName(page.name);

  };



  const closeFormModal = () => {

    setFormModalOpen(false);

    setEditingId(null);

    setForm(initialForm);

    setShowEditToken(false);

  };



  const openCreateModal = () => {

    setEditingId(null);

    setForm(initialForm);

    setShowEditToken(false);

    setFormModalOpen(true);

  };



  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));



  const toggleSkill = (skillId) => {
    const id = Number(skillId);
    setForm((prev) => ({
      ...prev,
      skill_ids: prev.skill_ids.includes(id)
        ? prev.skill_ids.filter((x) => x !== id)
        : [...prev.skill_ids, id],
    }));
  };

  const handleSubmit = async (event) => {

    event?.preventDefault?.();

    try {

      if (editingId) {

        await api.put(`/pages/${editingId}`, form);

        showToast('Đã cập nhật fanpage', 'success');

      } else {

        await api.post('/pages', form);

        showToast('Đã thêm fanpage', 'success');

      }

      closeFormModal();

      loadData();

    } catch (err) {

      showToast(err.response?.data?.error || 'Không lưu được fanpage', 'error');

    }

  };



  const handleEdit = (page) => {

    setEditingId(page.id);

    setForm({

      name: page.name || '',

      page_id: page.page_id || '',

      page_token: '',

      avatar_url: page.avatar_url || '',

      skill_ids: page.skill_ids || page.skills?.map((s) => s.id) || (page.skill_id ? [Number(page.skill_id)] : []),

      text_provider_id: page.text_provider_id || '',

      image_provider_id: page.image_provider_id || '',

      is_active: !!page.is_active,

    });

    setShowEditToken(false);

    setFormModalOpen(true);

  };



  const loadTokenIntoForm = async () => {

    if (!editingId) return;

    try {

      const response = await api.get(`/pages/${editingId}`);

      setForm((prev) => ({ ...prev, page_token: response.data.page_token || '' }));

      setShowEditToken(true);

      showToast('Đã nạp token hiện tại', 'success');

    } catch (err) {

      showToast(err.response?.data?.error || 'Không tải được token', 'error');

    }

  };



  const handleDelete = async (id) => {

    if (!window.confirm('Xóa fanpage này?')) return;

    try {

      await api.delete(`/pages/${id}`);

      showToast('Đã xóa fanpage', 'success');

      loadData();

    } catch (err) {

      showToast(err.response?.data?.error || 'Không xóa được', 'error');

    }

  };



  const addTopic = async () => {

    if (!topicForm.topic.trim()) {

      showToast('Nhập chủ đề', 'error');

      return;

    }

    try {

      await api.post(`/pages/${topicsPageId}/topics`, topicForm);

      showToast('Đã thêm chủ đề', 'success');

      loadTopics({ id: topicsPageId, name: topicsPageName });

      setTopicForm({ day_of_week: 1, topic: '', post_time: '08:00:00' });

    } catch (err) {

      showToast(err.response?.data?.error || 'Không thêm được chủ đề', 'error');

    }

  };



  const updateToken = async () => {

    if (!newToken.trim()) {

      showToast('Nhập token mới', 'error');

      return;

    }

    try {

      await api.put(`/pages/${tokenModalId}/token`, { page_token: newToken.trim() });

      showToast('Đã cập nhật token', 'success');

      setNewToken('');

      loadTokenDetail(tokenModalId);

      loadData();

    } catch (err) {

      showToast(err.response?.data?.error || 'Cập nhật token thất bại', 'error');

    }

  };



  const getName = (id, list) => list.find((item) => item.id === id)?.name || '-';



  const selectedSkills = skills.filter((s) => form.skill_ids.includes(s.id));

  const skillsByType = {
    text: skills.filter((s) => (s.skill_type || 'text') === 'text'),
    image: skills.filter((s) => s.skill_type === 'image'),
    video: skills.filter((s) => s.skill_type === 'video'),
  };

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
                {s.prompt_preview && (
                  <small className="text-muted">{s.prompt_preview}</small>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  };



  return (

    <div className="page-shell">

      <div className="page-header">

        <div>

          <h1>Fanpage</h1>

          <p>{isSuperAdmin ? 'Quản lý tất cả fanpage.' : 'Fanpage được gán — admin có thể thêm fanpage mới.'}</p>

        </div>

        {canManagePages && (

          <div className="header-actions">

            <button type="button" className="btn btn-primary" onClick={openCreateModal}>

              <Plus size={18} />

              Thêm fanpage

            </button>

          </div>

        )}

      </div>



      <div className="card table-wrapper">

        <table className="table">

          <thead>

            <tr><th>Tên</th><th>Page ID</th><th>Token</th><th>Skill AI</th><th>Thao tác</th></tr>

          </thead>

          <tbody>

            {!pages.length && (
              <tr>
                <td colSpan={5}>
                  {isSuperAdmin
                    ? 'Chưa có fanpage nào — bấm Thêm fanpage.'
                    : canManagePages
                      ? 'Chưa có fanpage — bấm Thêm fanpage để kết nối Facebook.'
                      : 'Chưa được gán fanpage nào. Liên hệ quản trị viên.'}
                </td>
              </tr>
            )}

            {pages.map((page) => (

              <tr key={page.id}>

                <td>{page.name}</td>

                <td><code>{page.page_id}</code></td>

                <td>

                  <div className="token-cell">

                    <span className={`token-badge token-${page.token_status}`}>{tokenStatusLabel(page.token_status)}</span>

                    {page.page_token_preview && (

                      <code className="token-preview-text" title="Xem trước — bấm Token để xem đủ">

                        {page.page_token_preview}

                      </code>

                    )}

                    {page.token_expires_at && (

                      <small className="text-muted">Hết hạn: {formatDateTime(page.token_expires_at)}</small>

                    )}

                  </div>

                </td>

                <td>

                  <div className="skill-page-tags">

                    {(page.skills?.length ? page.skills : (page.skill_id ? [{ id: page.skill_id, name: getName(page.skill_id, skills) }] : [])).map((skill) => (

                      <span key={skill.id} className="skill-page-tag">{skill.name}</span>

                    ))}

                    {!page.skills?.length && !page.skill_id && (

                      <span className="text-muted">Chưa gắn</span>

                    )}

                  </div>

                </td>

                <td>

                  <button type="button" className="btn-link" onClick={() => handleEdit(page)}>Sửa</button>

                  <button type="button" className="btn-link" onClick={() => loadTopics(page)}>Chủ đề</button>

                  <button type="button" className="btn-link" onClick={() => openTokenModal(page.id)}>Token</button>

                  {canManagePages && (

                    <button type="button" className="btn-link btn-link-danger" onClick={() => handleDelete(page.id)}>Xóa</button>

                  )}

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>



      <Modal

        open={formModalOpen}

        title={editingId ? 'Sửa fanpage' : 'Thêm fanpage mới'}

        subtitle={editingId ? 'Cập nhật thông tin, skill và provider cho fanpage.' : 'Kết nối fanpage Facebook với token và cấu hình AI.'}

        onClose={closeFormModal}

        wide

        footer={(

          <>

            <button type="button" className="btn btn-secondary" onClick={closeFormModal}>Huỷ</button>

            <button type="button" className="btn btn-primary" onClick={handleSubmit}>

              {editingId ? 'Lưu thay đổi' : 'Tạo fanpage'}

            </button>

          </>

        )}

      >

        <form className="modal-form" onSubmit={handleSubmit}>

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

                disabled={!!editingId}

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

                  placeholder={editingId ? 'Để trống = giữ token cũ' : 'Dán Page Access Token'}

                  required={!editingId}

                />

                {editingId && (

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



            <div className="field-span-2">

              <span className="field-label">Skill AI (viết bài / ảnh / video)</span>

              {skills.length === 0 ? (

                <span className="text-muted">Chưa có skill — tạo tại mục Skill AI</span>

              ) : (

                <>

                  {renderSkillGroup('text', skillsByType.text)}

                  {renderSkillGroup('image', skillsByType.image)}

                  {renderSkillGroup('video', skillsByType.video)}

                </>

              )}

              {selectedSkills.length > 0 && (

                <span className="field-hint">Đã chọn {selectedSkills.length} skill: {selectedSkills.map((s) => `${s.name} (${skillTypeLabel(s.skill_type || 'text')})`).join(', ')}</span>

              )}

            </div>



            <label>

              Text Provider

              <select value={form.text_provider_id} onChange={(e) => handleChange('text_provider_id', e.target.value)}>

                <option value="">Không dùng</option>

                {providers.filter((p) => p.type === 'text').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}

              </select>

            </label>



            <label>

              Image Provider

              <select value={form.image_provider_id} onChange={(e) => handleChange('image_provider_id', e.target.value)}>

                <option value="">Không dùng</option>

                {providers.filter((p) => p.type === 'image').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}

              </select>

            </label>



            <label className="checkbox-field field-span-2">

              <input type="checkbox" checked={form.is_active} onChange={(e) => handleChange('is_active', e.target.checked)} />

              Fanpage đang hoạt động

            </label>

          </div>

        </form>

      </Modal>



      <Modal

        open={!!topicsPageId}

        title="Chủ đề tự động"

        subtitle={topicsPageName ? `Lịch nội dung cho ${topicsPageName}` : 'Thêm chủ đề theo ngày trong tuần'}

        onClose={() => { setTopicsPageId(null); setTopicsPageName(''); }}

        wide

        footer={(

          <button type="button" className="btn btn-secondary" onClick={() => { setTopicsPageId(null); setTopicsPageName(''); }}>

            Đóng

          </button>

        )}

      >

        <div className="modal-section">

          <h4 className="modal-section-title">Thêm chủ đề</h4>

          <div className="modal-form-grid">

            <label>

              Ngày

              <select value={topicForm.day_of_week} onChange={(e) => setTopicForm({ ...topicForm, day_of_week: Number(e.target.value) })}>

                {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}

              </select>

            </label>

            <label>

              Giờ đăng

              <input type="time" value={topicForm.post_time} onChange={(e) => setTopicForm({ ...topicForm, post_time: e.target.value })} />

            </label>

            <label className="field-span-2">

              Chủ đề

              <input

                value={topicForm.topic}

                onChange={(e) => setTopicForm({ ...topicForm, topic: e.target.value })}

                placeholder="Nội dung / chủ đề bài viết"

              />

            </label>

          </div>

          <button type="button" className="btn btn-primary" onClick={addTopic}>Thêm vào lịch</button>

        </div>



        <div className="modal-section">

          <h4 className="modal-section-title">Danh sách ({topics.length})</h4>

          {topics.length === 0 ? (

            <p className="text-muted" style={{ margin: 0 }}>Chưa có chủ đề nào.</p>

          ) : (

            <div className="modal-table-wrap">

              <table className="table">

                <thead><tr><th>Ngày</th><th>Chủ đề</th><th>Giờ</th><th>Bật</th></tr></thead>

                <tbody>

                  {topics.map((t) => (

                    <tr key={t.id}>

                      <td>{DAYS.find((d) => d.value === t.day_of_week)?.label}</td>

                      <td>{t.topic}</td>

                      <td>{t.post_time}</td>

                      <td>{t.is_active ? 'Có' : 'Không'}</td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          )}

        </div>

      </Modal>



      <Modal

        open={!!tokenModalId}

        title={tokenDetail ? tokenDetail.name : 'Token fanpage'}

        subtitle="Xem, copy và kiểm tra token với Facebook Graph API"

        onClose={closeTokenModal}

        wide

        footer={(

          <button type="button" className="btn btn-secondary" onClick={closeTokenModal}>Đóng</button>

        )}

      >

        {tokenLoading ? (

          <p className="text-muted" style={{ margin: 0 }}>Đang tải token...</p>

        ) : tokenDetail ? (

          <div className="token-view-panel">

            <div className="token-meta-grid">

              <div>

                <span className="token-meta-label">Page ID</span>

                <code>{tokenDetail.page_id}</code>

              </div>

              <div>

                <span className="token-meta-label">Trạng thái</span>

                <span className={`token-badge token-${tokenDetail.token_status}`}>{tokenStatusLabel(tokenDetail.token_status)}</span>

              </div>

              <div>

                <span className="token-meta-label">Hết hạn</span>

                <span>{tokenDetail.token_expires_at ? formatDateTime(tokenDetail.token_expires_at) : '—'}</span>

              </div>

            </div>



            <div className="modal-section" style={{ marginTop: 0, paddingTop: 0, border: 'none' }}>

              <h4 className="modal-section-title">Token hiện tại</h4>

              <textarea

                className="token-view-textarea"

                readOnly

                value={showToken ? (tokenDetail.page_token || '') : '••••••••••••••••••••••••••••••••'}

                rows={4}

              />

              <div className="token-view-actions">

                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowToken((v) => !v)}>

                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}

                  {showToken ? 'Ẩn' : 'Hiện'}

                </button>

                <button type="button" className="btn btn-secondary btn-sm" onClick={copyToken}>

                  <Copy size={16} /> Sao chép

                </button>

                <button type="button" className="btn btn-primary btn-sm" onClick={verifyToken} disabled={verifying}>

                  {verifying ? 'Đang kiểm tra...' : 'Kiểm tra FB'}

                </button>

              </div>

            </div>



            {verifyResult && (

              <div className={verifyResult.ok ? 'modal-alert modal-alert--success' : 'modal-alert modal-alert--error'}>

                {verifyResult.ok ? (

                  <>

                    Token hợp lệ — Facebook: <strong>{verifyResult.fb_name}</strong> (ID: {verifyResult.fb_page_id})

                    {!verifyResult.matches_configured_page && (

                      <div style={{ marginTop: 8 }}>

                        Cảnh báo: ID Facebook ({verifyResult.fb_page_id}) khác Page ID config ({tokenDetail.page_id})

                      </div>

                    )}

                  </>

                ) : (

                  verifyResult.error

                )}

              </div>

            )}



            <div className="modal-section">

              <h4 className="modal-section-title">Cập nhật token mới</h4>

              <div className="modal-form">

                <label>

                  Token mới

                  <input

                    type="text"

                    value={newToken}

                    onChange={(e) => setNewToken(e.target.value)}

                    placeholder="Dán Page Access Token mới..."

                  />

                </label>

                <button type="button" className="btn btn-primary" onClick={updateToken}>

                  Lưu token mới

                </button>

              </div>

            </div>

          </div>

        ) : null}

      </Modal>

    </div>

  );

}


