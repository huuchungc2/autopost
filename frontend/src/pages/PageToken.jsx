import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Eye, EyeOff } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { formatDateTime } from '../utils/date';
import { tokenStatusLabel } from '../config/vi';
import Skeleton from '../components/ui/Skeleton';

export default function PageToken() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tokenDetail, setTokenDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const loadTokenDetail = async () => {
    const response = await api.get(`/pages/${id}`);
    setTokenDetail(response.data);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadTokenDetail()
      .catch((err) => {
        if (!cancelled) {
          showToast(err.response?.data?.error || 'Không tải được token', 'error');
          navigate('/pages', { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, navigate, showToast]);

  const copyToken = async () => {
    if (!tokenDetail?.page_token) return;
    try {
      await navigator.clipboard.writeText(tokenDetail.page_token);
      showToast('Đã copy token', 'success');
    } catch {
      showToast('Không copy được — chọn và copy thủ công', 'error');
    }
  };

  const verifyToken = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const response = await api.post(`/pages/${id}/verify-token`);
      setVerifyResult({ ok: true, ...response.data });
      showToast('Token hợp lệ với Facebook', 'success');
    } catch (err) {
      const data = err.response?.data;
      setVerifyResult({ ok: false, error: data?.error || 'Token không hợp lệ' });
      showToast(data?.error || 'Token không hợp lệ', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const updateToken = async () => {
    if (!newToken.trim()) {
      showToast('Nhập token mới', 'error');
      return;
    }
    try {
      await api.put(`/pages/${id}/token`, { page_token: newToken.trim() });
      showToast('Đã cập nhật token', 'success');
      setNewToken('');
      await loadTokenDetail();
    } catch (err) {
      showToast(err.response?.data?.error || 'Cập nhật token thất bại', 'error');
    }
  };

  if (loading) {
    return (
      <div className="page-shell post-editor-page">
        <Skeleton lines={6} />
      </div>
    );
  }

  return (
    <div className="page-shell post-editor-page">
      <div className="page-header post-editor-page-header">
        <button type="button" className="btn btn-secondary post-editor-back-btn" onClick={() => navigate('/pages')}>
          <ArrowLeft size={18} />
          Quay lại
        </button>
        <div>
          <h1>{tokenDetail?.name || 'Token fanpage'}</h1>
          <p>Xem, copy và kiểm tra token với Facebook Graph API</p>
        </div>
      </div>

      {tokenDetail && (
        <div className="card form-card token-view-panel">
          <div className="token-meta-grid">
            <div>
              <span className="token-meta-label">Page ID</span>
              <code>{tokenDetail.page_id}</code>
            </div>
            <div>
              <span className="token-meta-label">Trạng thái</span>
              <span className={`token-badge token-${tokenDetail.token_status}`}>
                {tokenStatusLabel(tokenDetail.token_status)}
              </span>
            </div>
            <div>
              <span className="token-meta-label">Hết hạn</span>
              <span>{tokenDetail.token_expires_at ? formatDateTime(tokenDetail.token_expires_at) : '—'}</span>
            </div>
          </div>

          <div className="modal-section" style={{ marginTop: 0, paddingTop: 0, border: 'none' }}>
            <h4 className="modal-section-title">Token hiện tại</h4>
            <textarea
              className="token-view-textarea"
              readOnly
              value={showToken ? (tokenDetail.page_token || '') : '••••••••••••••••••••••••••••••••'}
              rows={4}
            />
            <div className="token-view-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowToken((v) => !v)}>
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                {showToken ? 'Ẩn' : 'Hiện'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={copyToken}>
                <Copy size={16} /> Sao chép
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={verifyToken} disabled={verifying}>
                {verifying ? 'Đang kiểm tra...' : 'Kiểm tra FB'}
              </button>
            </div>
          </div>

          {verifyResult && (
            <div className={verifyResult.ok ? 'modal-alert modal-alert--success' : 'modal-alert modal-alert--error'}>
              {verifyResult.ok ? (
                <>
                  Token hợp lệ — Facebook: <strong>{verifyResult.fb_name}</strong> (ID: {verifyResult.fb_page_id})
                  {!verifyResult.matches_configured_page && (
                    <div style={{ marginTop: 8 }}>
                      Cảnh báo: ID Facebook ({verifyResult.fb_page_id}) khác Page ID config ({tokenDetail.page_id})
                    </div>
                  )}
                </>
              ) : (
                verifyResult.error
              )}
            </div>
          )}

          <div className="modal-section">
            <h4 className="modal-section-title">Cập nhật token mới</h4>
            <div className="modal-form">
              <label>
                Token mới
                <input
                  type="text"
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  placeholder="Dán Page Access Token mới..."
                />
              </label>
              <button type="button" className="btn btn-primary" onClick={updateToken}>
                Lưu token mới
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
