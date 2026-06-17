import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../services/authContext';
import { formatDateTime } from '../utils/date';
import { tokenStatusLabel } from '../config/vi';
import { Button } from '../components/ui/Button';

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
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Fanpage</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isSuperAdmin
              ? 'Quản lý tất cả fanpage — gán cho admin khi tạo mới / khi sửa.'
              : 'Fanpage được gán — admin có thể thêm fanpage mới.'}
          </p>
        </div>
        {canManagePages && (
          <div className="flex gap-2 flex-wrap">
            <Button type="button" onClick={() => navigate('/pages/new')} className="bg-indigo-600 hover:bg-indigo-700">
              <Plus size={18} />
              Thêm fanpage
            </Button>
          </div>
        )}
      </div>

      <div className="card p-0 overflow-hidden border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Tên</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Page ID</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Token</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Skill AI</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!pages.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-600">
                    {isSuperAdmin
                      ? 'Chưa có fanpage nào — bấm Thêm fanpage.'
                      : canManagePages
                        ? 'Chưa có fanpage — bấm Thêm fanpage để kết nối Facebook.'
                        : 'Chưa được gán fanpage nào. Liên hệ quản trị viên.'}
                  </td>
                </tr>
              )}
              {pages.map((page) => (
                <tr key={page.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{page.name}</div>
                    {!page.is_active && <div className="mt-1 text-xs text-slate-500">Đang tắt</div>}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-800">{page.page_id}</code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`token-badge token-${page.token_status}`}>
                        {tokenStatusLabel(page.token_status)}
                      </span>
                      {page.page_token_preview && (
                        <code className="text-xs text-slate-500 break-all" title="Xem trước — bấm Token để xem đủ">
                          {page.page_token_preview}
                        </code>
                      )}
                      {page.token_expires_at && (
                        <span className="text-xs text-slate-500">Hết hạn: {formatDateTime(page.token_expires_at)}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {(page.skills?.length
                        ? page.skills
                        : (page.skill_id ? [{ id: page.skill_id, name: getName(page.skill_id, skills) }] : [])
                      ).map((skill) => (
                        <span
                          key={skill.id}
                          className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 border border-indigo-100"
                        >
                          {skill.name}
                        </span>
                      ))}
                      {!page.skills?.length && !page.skill_id && (
                        <span className="text-xs text-slate-500">Chưa gắn</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
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
    </div>
  );
}
