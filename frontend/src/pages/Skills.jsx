import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, FileText, PenLine } from 'lucide-react';
import api from '../services/api';

const initialForm = {
  name: '',
  description: '',
  system_prompt: '',
};

const PROMPT_FILE_MAX_BYTES = 100 * 1024;
const PROMPT_FILE_TYPES = ['.txt', '.md', '.markdown', '.json'];

function readPromptFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > PROMPT_FILE_MAX_BYTES) {
      reject(new Error('File tối đa 100KB'));
      return;
    }
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!PROMPT_FILE_TYPES.includes(ext)) {
      reject(new Error('Chỉ hỗ trợ file .txt, .md, .json'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      let content = String(reader.result || '');
      if (ext === '.json') {
        try {
          const parsed = JSON.parse(content);
          content = parsed.system_prompt || parsed.prompt || parsed.content || content;
        } catch {
          reject(new Error('File JSON không hợp lệ'));
          return;
        }
      }
      if (!content.trim()) {
        reject(new Error('File không có nội dung prompt'));
        return;
      }
      resolve(content.trim());
    };
    reader.onerror = () => reject(new Error('Không đọc được file'));
    reader.readAsText(file, 'UTF-8');
  });
}

export default function Skills() {
  const [skills, setSkills] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [promptMode, setPromptMode] = useState('type');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [message, setMessage] = useState('');
  const [loadingDetail, setLoadingDetail] = useState(false);

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
    setPromptMode('type');
    setUploadedFileName('');
    setMessage('');
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage('');
    try {
      const content = await readPromptFile(file);
      setForm((prev) => ({ ...prev, system_prompt: content }));
      setUploadedFileName(file.name);
      setPromptMode('file');
      setMessage(`Đã nạp prompt từ "${file.name}" (${content.length} ký tự)`);
    } catch (err) {
      setMessage(err.message || 'Upload thất bại');
    }
    event.target.value = '';
  };

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    setMessage('');
    if (!form.system_prompt.trim()) {
      setMessage('Cần nhập prompt hoặc upload file prompt');
      return;
    }
    try {
      if (editingId) {
        await api.put(`/skills/${editingId}`, form);
        setMessage('Đã cập nhật skill');
      } else {
        await api.post('/skills', form);
        setMessage('Đã tạo skill mới');
      }
      resetForm();
      loadSkills();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Không lưu được skill');
    }
  };

  const handleEdit = async (skill) => {
    setLoadingDetail(true);
    setMessage('');
    try {
      const response = await api.get(`/skills/${skill.id}`);
      const detail = response.data;
      setEditingId(detail.id);
      setForm({
        name: detail.name || '',
        description: detail.description || '',
        system_prompt: detail.system_prompt || '',
      });
      setPromptMode('type');
      setUploadedFileName('');
      setMessage(`Đang sửa skill — gắn ${detail.pages?.length || 0} fanpage`);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Không tải được skill');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDelete = async (skill) => {
    if (skill.pages?.length) {
      setMessage(`Không xóa được: skill đang dùng cho ${skill.pages.map((p) => p.name).join(', ')}`);
      return;
    }
    if (!window.confirm(`Xóa skill "${skill.name}"?`)) return;
    try {
      await api.delete(`/skills/${skill.id}`);
      loadSkills();
      if (editingId === skill.id) resetForm();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Không xóa được skill');
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Skills</h1>
          <p>
            System prompt cho AI — gắn vào fanpage ở <Link to="/pages">Pages</Link> để dùng khi Generate / auto đăng bài.
          </p>
        </div>
      </div>

      <div className="card form-card skill-form-card">
        <h2>{editingId ? 'Sửa Skill' : 'Tạo Skill mới'}</h2>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Tên skill
            <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} required placeholder="VD: ZaloPilot Default" />
          </label>
          <label>
            Mô tả
            <input value={form.description} onChange={(e) => handleChange('description', e.target.value)} placeholder="Ghi chú ngắn" />
          </label>
        </form>

        <div className="skill-prompt-tabs">
          <button
            type="button"
            className={`skill-prompt-tab${promptMode === 'type' ? ' active' : ''}`}
            onClick={() => setPromptMode('type')}
          >
            <PenLine size={16} />
            Nhập prompt
          </button>
          <button
            type="button"
            className={`skill-prompt-tab${promptMode === 'file' ? ' active' : ''}`}
            onClick={() => setPromptMode('file')}
          >
            <Upload size={16} />
            Upload file
          </button>
        </div>

        {promptMode === 'type' ? (
          <label className="skill-prompt-field">
            System prompt
            <textarea
              rows={8}
              value={form.system_prompt}
              onChange={(e) => handleChange('system_prompt', e.target.value)}
              placeholder="Bạn là content writer cho fanpage... Viết bài Facebook bằng tiếng Việt..."
              required
            />
            <small className="text-muted">{form.system_prompt.length} ký tự</small>
          </label>
        ) : (
          <div className="skill-file-upload">
            <label className="skill-file-label">
              <input type="file" accept=".txt,.md,.markdown,.json,text/plain" onChange={handleFileUpload} />
              <Upload size={28} strokeWidth={1.5} />
              <span>Chọn file prompt (.txt, .md, .json)</span>
              <small>Tối đa 100KB — JSON dùng key system_prompt, prompt hoặc content</small>
            </label>
            {uploadedFileName && (
              <div className="form-success">
                File: {uploadedFileName} — {form.system_prompt.length} ký tự
              </div>
            )}
            {form.system_prompt && (
              <label className="skill-prompt-field">
                Xem / chỉnh sửa nội dung đã nạp
                <textarea
                  rows={8}
                  value={form.system_prompt}
                  onChange={(e) => handleChange('system_prompt', e.target.value)}
                />
              </label>
            )}
          </div>
        )}

        <div className="header-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loadingDetail}>
            {editingId ? 'Cập nhật' : 'Tạo skill'}
          </button>
          {editingId && (
            <button type="button" className="btn btn-secondary" onClick={resetForm}>
              Huỷ
            </button>
          )}
        </div>
        {message && (
          <div className={message.includes('Đã') || message.includes('Đang') || message.includes('nạp') ? 'form-success' : 'form-error'}>
            {message}
          </div>
        )}
      </div>

      <div className="card table-wrapper" style={{ marginTop: 24 }}>
        <h3 style={{ margin: '0 0 16px' }}>Danh sách skill & fanpage đang dùng</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Skill</th>
              <th>Fanpage dùng skill này</th>
              <th>Prompt</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <tr key={skill.id}>
                <td>
                  <strong>{skill.name}</strong>
                  {skill.description && <div className="text-muted">{skill.description}</div>}
                </td>
                <td>
                  {skill.pages?.length ? (
                    <div className="skill-page-tags">
                      {skill.pages.map((page) => (
                        <Link key={page.id} to="/pages" className="skill-page-tag">
                          {page.name}
                          {!page.is_active && ' (off)'}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">Chưa gắn fanpage — vào Pages để chọn</span>
                  )}
                </td>
                <td>
                  <div className="skill-prompt-preview">
                    {skill.prompt_preview || '—'}
                    {skill.prompt_length > 120 ? '…' : ''}
                  </div>
                  <small className="text-muted">{skill.prompt_length || 0} ký tự</small>
                </td>
                <td>
                  <button type="button" className="btn-link" onClick={() => handleEdit(skill)} disabled={loadingDetail}>
                    Sửa
                  </button>
                  <button type="button" className="btn-link" onClick={() => handleDelete(skill)}>
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
            {!skills.length && (
              <tr>
                <td colSpan={4} className="text-muted">Chưa có skill — tạo mới hoặc chạy npm run seed</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card skill-usage-hint" style={{ marginTop: 16 }}>
        <h4>Cách skill được dùng khi đăng bài</h4>
        <ol>
          <li>Tạo / upload prompt ở đây</li>
          <li>Vào <Link to="/pages">Pages</Link> → chọn <strong>Skill</strong> cho từng fanpage</li>
          <li>Vào <Link to="/generate">Generate</Link> → chọn fanpage → AI dùng prompt của skill đó</li>
        </ol>
      </div>
    </div>
  );
}
