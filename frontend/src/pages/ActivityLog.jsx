import { useEffect, useState } from 'react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import { formatDateTime } from '../utils/date';

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [error, setError] = useState('');

  // GET /activity trước LIMIT 100 cứng, không có tham số trang — nhật ký cũ hơn 100 dòng gần nhất
  // không có cách nào xem lại. Response giờ { data, pagination } (v1.0.188).
  const load = (page = 1) => {
    api
      .get('/activity', { params: { page, limit: 50 } })
      .then((response) => {
        setLogs(response.data.data || []);
        setPagination(response.data.pagination || { page: 1, pages: 1, total: 0 });
      })
      .catch((err) => {
        console.error(err);
        setError(err.response?.data?.error || 'Không tải được nhật ký hoạt động');
      });
  };

  useEffect(() => { load(1); }, []);

  return (
    <div className="page-shell">
      <PageHeader
        title="Nhật ký hoạt động"
        description="Các thao tác gần đây của người dùng và hệ thống."
      />
      <div className="card">
        {error && <div className="form-error">{error}</div>}
        {!error && logs.length === 0 && <p>Chưa có nhật ký nào.</p>}
        {logs.length > 0 && (
          <table className="table table-responsive-cols">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người dùng</th>
                <th>Hành động</th>
                <th>Đối tượng</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>{log.user_id || 'Hệ thống'}</td>
                  <td>{log.action}</td>
                  <td>{log.target_type || '—'}{log.target_id ? ` #${log.target_id}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {pagination.pages > 1 && (
          <div className="pagination-row" style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="secondary" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>
              Trước
            </Button>
            <span>Trang {pagination.page}/{pagination.pages} ({pagination.total} dòng)</span>
            <Button variant="secondary" disabled={pagination.page >= pagination.pages} onClick={() => load(pagination.page + 1)}>
              Sau
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
