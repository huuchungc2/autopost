import { useEffect, useState } from 'react';
import api from '../services/api';
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
      <div className="page-header">
        <div>
          <h1>Nhật ký hoạt động</h1>
          <p>Các thao tác gần đây của người dùng và hệ thống.</p>
        </div>
      </div>
      <div className="card">
        {error && <div className="form-error">{error}</div>}
        {!error && logs.length === 0 && <p>Chưa có nhật ký nào.</p>}
        {logs.length > 0 && (
          <table className="table">
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
