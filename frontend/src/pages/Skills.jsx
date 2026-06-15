import { useEffect, useState } from 'react';
import api from '../services/api';

const initialForm = {
  name: '',
  description: '',
  system_prompt: '',
};

export default function Skills() {
  const [skills, setSkills] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

  const loadSkills = async () => {
    try {
      const response = await api.get('/skills');
      setSkills(response.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setMessage('');
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    try {
      if (editingId) {
        await api.put(`/skills/${editingId}`, form);
        setMessage('Skill updated successfully');
      } else {
        await api.post('/skills', form);
        setMessage('Skill created successfully');
      }
      resetForm();
      loadSkills();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Unable to save skill');
    }
  };

  const handleEdit = (skill) => {
    setEditingId(skill.id);
    setForm({
      name: skill.name || '',
      description: skill.description || '',
      system_prompt: skill.system_prompt || '',
    });
    setMessage('Editing skill.');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this skill?')) return;
    try {
      await api.delete(`/skills/${id}`);
      loadSkills();
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.error || 'Unable to delete skill');
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Skills</h1>
          <p>System prompts used for AI generation.</p>
        </div>
      </div>

      <div className="card form-card">
        <h2>{editingId ? 'Edit Skill' : 'New Skill'}</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Name
            <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} required />
          </label>
          <label>
            Description
            <input value={form.description} onChange={(e) => handleChange('description', e.target.value)} />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            System prompt
            <textarea rows="4" value={form.system_prompt} onChange={(e) => handleChange('system_prompt', e.target.value)} required />
          </label>
        </form>
        <div style={{ marginTop: 16 }}>
          <button type="button" className="btn-secondary" onClick={handleSubmit}>{editingId ? 'Update Skill' : 'Create Skill'}</button>
          {editingId && <button type="button" className="btn-link" onClick={resetForm}>Cancel</button>}
        </div>
        {message && <div className={message.includes('successfully') ? 'form-success' : 'form-error'}>{message}</div>}
      </div>

      <div className="card table-wrapper" style={{ marginTop: 24 }}>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <tr key={skill.id}>
                <td>{skill.id}</td>
                <td>{skill.name}</td>
                <td>{skill.description}</td>
                <td>
                  <button type="button" className="btn-link" onClick={() => handleEdit(skill)}>Edit</button>
                  <button type="button" className="btn-link" onClick={() => handleDelete(skill.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
