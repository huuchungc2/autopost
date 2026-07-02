import { useEffect, useState } from 'react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import { formatDateTime } from '../utils/date';

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/activity')
      .then((response) => setLogs(response.data))
      .catch((err) => {
        console.error(err);
        setError(err.response?.data?.error || 'Không tải được nhật ký hoạt động');
      });
  }, []);

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
      </div>
    </div>
  );
}
