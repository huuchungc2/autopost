import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../services/authContext';
import { formatDateTime } from '../utils/date';
import { tokenStatusLabel } from '../config/vi';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';

export default function Pages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const canManagePages = ['super_admin', 'admin'].includes(user?.role);
  const [pages, setPages] = useState([]);
  const [skills, setSkills] = useState([]);
  const { showToast } = useToast();

  const loadData = async () => {
    try {
      const [pagesRes, skillsRes] = await Promise.all([api.get('/pages'), api.get('/skills')]);
      setPages(pagesRes.data);
      setSkills(skillsRes.data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => { if (user) loadData(); }, [user?.role]);

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

  const getName = (id, list) => list.find((item) => item.id === id)?.name || '-';

  return (
    <div className="page-shell">
      <PageHeader
        title="Fanpage"
        description={
          isSuperAdmin
            ? 'Quản lý tất cả fanpage — Sửa fanpage để bật lịch xuất ảnh và gán admin.'
            : 'Fanpage được gán — Sửa fanpage để bật lịch xuất ảnh ban đêm.'
        }
        actions={
          canManagePages ? (
            <Button type="button" onClick={() => navigate('/pages/new')}>
              <Plus size={18} />
              Thêm fanpage
            </Button>
          ) : null
        }
      />

      <div className="card table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Page ID</th>
              <th>Token</th>
              <th>Skill AI</th>
              <th>Thao tác</th>
            </tr>
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
                <td>
                  <div>{page.name}</div>
                  {!page.is_active && <div className="text-muted" style={{ marginTop: 4, fontSize: 'var(--text-xs)' }}>Đang tắt</div>}
                </td>
                <td>
                  <code>{page.page_id}</code>
                </td>
                <td>
                  <div className="token-cell">
                    <span className={`token-badge token-${page.token_status}`}>
                      {tokenStatusLabel(page.token_status)}
                    </span>
                    <span className="badge badge-default" title="Token đang dùng khi đăng bài">
                      {page.token_source === 'composio' ? 'Active: Composio' : 'Active: Manual'}
                    </span>
                    {page.page_token_preview && (
                      <div className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                        M: {tokenStatusLabel(page.manual_token_status || 'unknown')}
                        {page.manual_token_expires_at ? ` · ${formatDateTime(page.manual_token_expires_at)}` : ''}
                      </div>
                    )}
                    {(page.composio_page_token_preview || page.composio_token_status) && (
                      <div className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                        C: {tokenStatusLabel(page.composio_token_status || 'unknown')}
                        {page.composio_token_expires_at ? ` · ${formatDateTime(page.composio_token_expires_at)}` : ''}
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(page.skills?.length
                      ? page.skills
                      : (page.skill_id ? [{ id: page.skill_id, name: getName(page.skill_id, skills) }] : [])
                    ).map((skill) => (
                      <span key={skill.id} className="skill-page-tag">
                        {skill.name}
                      </span>
                    ))}
                    {!page.skills?.length && !page.skill_id && (
                      <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>Chưa gắn</span>
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/pages/${page.id}/edit`)}>
                      Sửa
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => navigate(`/pages/${page.id}/topics`)}>
                      Chủ đề
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => navigate(`/pages/${page.id}/token`)}>
                      Token
                    </Button>
                    {canManagePages && (
                      <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(page.id)}>
                        Xóa
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
