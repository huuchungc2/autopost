import { useEffect, useState } from 'react';
import api from '../services/api';
import Modal from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../services/authContext';

const initialForm = {
  name: '',
  page_id: '',
  page_token: '',
  avatar_url: '',
  skill_id: '',
  text_provider_id: '',
  image_provider_id: '',
  is_active: true,
};

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export default function Pages() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [pages, setPages] = useState([]);
  const [skills, setSkills] = useState([]);
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [topicsPageId, setTopicsPageId] = useState(null);
  const [topics, setTopics] = useState([]);
  const [topicForm, setTopicForm] = useState({ day_of_week: 1, topic: '', post_time: '08:00:00' });
  const [tokenModal, setTokenModal] = useState(null);
  const [newToken, setNewToken] = useState('');
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

  const loadTopics = async (pageId) => {
    const response = await api.get(`/pages/${pageId}/topics`);
    setTopics(response.data);
    setTopicsPageId(pageId);
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const handleChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      if (editingId) {
        await api.put(`/pages/${editingId}`, form);
        showToast('Page updated', 'success');
      } else {
        await api.post('/pages', form);
        showToast('Page created', 'success');
      }
      resetForm();
      loadData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Unable to save page', 'error');
    }
  };

  const handleEdit = (page) => {
    setEditingId(page.id);
    setForm({
      name: page.name || '',
      page_id: page.page_id || '',
      page_token: '',
      avatar_url: page.avatar_url || '',
      skill_id: page.skill_id || '',
      text_provider_id: page.text_provider_id || '',
      image_provider_id: page.image_provider_id || '',
      is_active: !!page.is_active,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this page?')) return;
    try {
      await api.delete(`/pages/${id}`);
      showToast('Page deleted', 'success');
      loadData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Unable to delete page', 'error');
    }
  };

  const addTopic = async () => {
    try {
      await api.post(`/pages/${topicsPageId}/topics`, topicForm);
      showToast('Topic added', 'success');
      loadTopics(topicsPageId);
      setTopicForm({ day_of_week: 1, topic: '', post_time: '08:00:00' });
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add topic', 'error');
    }
  };

  const updateToken = async () => {
    try {
      await api.put(`/pages/${tokenModal}/token`, { page_token: newToken });
      showToast('Token updated', 'success');
      setTokenModal(null);
      setNewToken('');
      loadData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Token update failed', 'error');
    }
  };

  const getName = (id, list) => list.find((item) => item.id === id)?.name || '-';

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Facebook Pages</h1>
          <p>{isSuperAdmin ? 'Quản lý tất cả fanpage.' : 'Chỉ hiển thị page được gán cho bạn.'}</p>
        </div>
      </div>

      {(isSuperAdmin || editingId) && (
      <div className="card form-card">
        <h2>{editingId ? 'Edit Page' : 'New Page'}</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>Name<input value={form.name} onChange={(e) => handleChange('name', e.target.value)} required /></label>
          <label>Page ID<input value={form.page_id} onChange={(e) => handleChange('page_id', e.target.value)} required disabled={!!editingId} /></label>
          <label>
            Page Token
            <input value={form.page_token} onChange={(e) => handleChange('page_token', e.target.value)} placeholder={editingId ? 'Leave blank to keep' : ''} required={!editingId} />
          </label>
          <label>Avatar URL<input value={form.avatar_url} onChange={(e) => handleChange('avatar_url', e.target.value)} /></label>
          <label>
            Skill
            <select value={form.skill_id} onChange={(e) => handleChange('skill_id', e.target.value)}>
              <option value="">None</option>
              {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>
            Text Provider
            <select value={form.text_provider_id} onChange={(e) => handleChange('text_provider_id', e.target.value)}>
              <option value="">None</option>
              {providers.filter((p) => p.type === 'text').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>
            Image Provider
            <select value={form.image_provider_id} onChange={(e) => handleChange('image_provider_id', e.target.value)}>
              <option value="">None</option>
              {providers.filter((p) => p.type === 'image').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.is_active} onChange={(e) => handleChange('is_active', e.target.checked)} /> Active
          </label>
        </form>
        <div className="header-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>{editingId ? 'Update' : 'Create'}</button>
          {editingId && <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>}
        </div>
      </div>
      )}

      <div className="card table-wrapper" style={{ marginTop: 24 }}>
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Page ID</th><th>Token</th><th>Skill</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id}>
                <td>{page.name}</td>
                <td>{page.page_id}</td>
                <td><span className={`token-badge token-${page.token_status}`}>{page.token_status}</span></td>
                <td>{getName(page.skill_id, skills)}</td>
                <td>
                  <button type="button" className="btn-link" onClick={() => handleEdit(page)}>Edit</button>
                  <button type="button" className="btn-link" onClick={() => loadTopics(page.id)}>Topics</button>
                  <button type="button" className="btn-link" onClick={() => setTokenModal(page.id)}>Token</button>
                  <button type="button" className="btn-link" onClick={() => handleDelete(page.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!topicsPageId} title="Content Topics" onClose={() => setTopicsPageId(null)} wide>
        <div className="form-grid">
          <label>
            Day
            <select value={topicForm.day_of_week} onChange={(e) => setTopicForm({ ...topicForm, day_of_week: Number(e.target.value) })}>
              {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>
          <label>Topic<input value={topicForm.topic} onChange={(e) => setTopicForm({ ...topicForm, topic: e.target.value })} /></label>
          <label>Time<input type="time" value={topicForm.post_time} onChange={(e) => setTopicForm({ ...topicForm, post_time: e.target.value })} /></label>
        </div>
        <button type="button" className="btn btn-primary" onClick={addTopic} style={{ marginTop: 12 }}>Add topic</button>
        <div className="table-wrapper" style={{ marginTop: 16 }}>
          <table className="table">
            <thead><tr><th>Day</th><th>Topic</th><th>Time</th><th>Active</th></tr></thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.id}>
                  <td>{DAYS.find((d) => d.value === t.day_of_week)?.label}</td>
                  <td>{t.topic}</td>
                  <td>{t.post_time}</td>
                  <td>{t.is_active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal open={!!tokenModal} title="Update Page Token" onClose={() => setTokenModal(null)}>
        <label>New token<input value={newToken} onChange={(e) => setNewToken(e.target.value)} /></label>
        <button type="button" className="btn btn-primary" onClick={updateToken} style={{ marginTop: 12 }}>Save token</button>
      </Modal>
    </div>
  );
}
