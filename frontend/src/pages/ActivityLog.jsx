import { useEffect, useState } from 'react';
import api from '../services/api';

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/activity')
      .then((response) => setLogs(response.data))
      .catch((err) => {
        console.error(err);
        setError(err.response?.data?.error || 'Unable to load activity logs');
      });
  }, []);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Activity Log</h1>
          <p>Recent user actions and system events.</p>
        </div>
      </div>
      <div className="card">
        {error && <div className="form-error">{error}</div>}
        {!error && logs.length === 0 && <p>No activity logs available.</p>}
        {logs.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td>{log.user_id || 'System'}</td>
                  <td>{log.action}</td>
                  <td>{log.target_type || 'N/A'}{log.target_id ? ` #${log.target_id}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
