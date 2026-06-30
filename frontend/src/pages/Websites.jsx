import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../services/authContext';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';

export default function Websites() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = ['super_admin', 'admin'].includes(user?.role);
  const [websites, setWebsites] = useState([]);
  const { showToast } = useToast();

  const loadData = async () => {
    try {
      const response = await api.get('/websites');
      setWebsites(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => { if (user) loadData(); }, [user?.role]);

  const handleDelete = async (id) => {
    if (!window.confirm('Xóa website này? Bài blog đã tạo cho website này sẽ mất liên kết.')) return;
    try {
      await api.delete(`/websites/${id}`);
      showToast('Đã xóa website', 'success');
      loadData();
    } catch (err) {
      showToast(err.response?.data?.error || 'Không xóa được', 'error');
    }
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Website"
        description="Website blog độc lập với Fanpage Facebook — dùng cho tab Tạo bài → Website Blog và publish API."
        actions={
          canManage ? (
            <Button type="button" onClick={() => navigate('/websites/new')}>
              <Plus size={18} />
              Thêm website
            </Button>
          ) : null
        }
      />

      <div className="card table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Tên</th>
              <th>Domain</th>
              <th>Publish API</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {!websites.length && (
              <tr>
                <td colSpan={4}>
                  {canManage ? 'Chưa có website nào — bấm Thêm website.' : 'Chưa có website nào.'}
                </td>
              </tr>
            )}
            {websites.map((website) => (
              <tr key={website.id}>
                <td>
                  <div>{website.name}</div>
                  {!website.is_active && <div className="text-muted" style={{ marginTop: 4, fontSize: 'var(--text-xs)' }}>Đang tắt</div>}
                </td>
                <td>{website.domain || '-'}</td>
                <td>
                  {website.publish_url ? (
                    <span className="badge badge-default">Đã cấu hình</span>
                  ) : (
                    <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>Chưa cấu hình</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/websites/${website.id}/edit`)}>
                      Sửa
                    </Button>
                    {canManage && (
                      <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(website.id)}>
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
