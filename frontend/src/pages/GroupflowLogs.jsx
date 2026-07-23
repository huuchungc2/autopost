import { Fragment, useEffect, useState } from 'react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import { formatDateTime } from '../utils/date';

const LEVEL_LABEL = { error: '❌', warn: '⚠️', ok: '✅', info: 'ℹ️' };

export default function GroupflowLogs() {
  const [reports, setReports] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');

  const load = (page = 1) => {
    api
      .get('/groupflow-logs', { params: { page, limit: 30 } })
      .then((response) => {
        setReports(response.data.data || []);
        setPagination(response.data.pagination || { page: 1, pages: 1, total: 0 });
      })
      .catch((err) => {
        console.error(err);
        setError(err.response?.data?.error || 'Không tải được log GroupFlow');
      });
  };

  useEffect(() => { load(1); }, []);

  const toggleDetail = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setDetailError('');
    api
      .get(`/groupflow-logs/${id}`)
      .then((response) => setDetail(response.data))
      .catch((err) => setDetailError(err.response?.data?.error || 'Không tải được chi tiết log'));
  };

  return (
    <div className="page-shell">
      <PageHeader
        title="Log GroupFlow"
        description="Log lỗi extension gửi thủ công từ các máy (mỗi thiết bị gửi tối đa 1 lần/ngày)."
      />
      <div className="card">
        {error && <div className="form-error">{error}</div>}
        {!error && reports.length === 0 && <p>Chưa có máy nào gửi log.</p>}
        {reports.length > 0 && (
          <table className="table table-responsive-cols">
            <thead>
              <tr>
                <th>Thời gian gửi</th>
                <th>Người dùng</th>
                <th>Thiết bị</th>
                <th>Bản extension</th>
                <th>Số dòng</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td>{formatDateTime(r.created_at)}</td>
                    <td>{r.user_name || r.user_email || `#${r.user_id}`}</td>
                    <td title={r.device_id}>{r.device_label || `${r.device_id.slice(0, 8)}…`}</td>
                    <td>{r.extension_version || '—'}</td>
                    <td>{r.entry_count}</td>
                    <td>
                      <Button variant="secondary" onClick={() => toggleDetail(r.id)}>
                        {expandedId === r.id ? 'Đóng' : 'Xem'}
                      </Button>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr>
                      <td colSpan={6}>
                        {detailError && <div className="form-error">{detailError}</div>}
                        {!detailError && !detail && <p>Đang tải…</p>}
                        {detail && (
                          <div style={{ maxHeight: 420, overflowY: 'auto', fontFamily: 'monospace', fontSize: 13 }}>
                            {(detail.entries || []).map((e) => (
                              <div key={e.id} style={{ padding: '4px 0', borderBottom: '1px solid var(--border-color, #333)' }}>
                                <span>{LEVEL_LABEL[e.level] || 'ℹ️'}</span>{' '}
                                <span style={{ opacity: 0.7 }}>{formatDateTime(e.at)}</span>{' '}
                                {e.group && <strong>{e.group} · </strong>}
                                {e.message}
                                {e.error && <div style={{ color: '#e5484d' }}>{e.error}</div>}
                              </div>
                            ))}
                            {!(detail.entries || []).length && <p>Log trống.</p>}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
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
