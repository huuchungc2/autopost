import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const PLAN_LABEL = { free: 'Miễn phí', pro: 'Pro', enterprise: 'Enterprise' };
const KEY_STATUS_COLOR = { active: '#15803d', expired: '#b91c1c', suspended: '#b45309' };
const KEY_STATUS_BG = { active: '#f0fdf4', expired: '#fef2f2', suspended: '#fff7ed' };
const KEY_STATUS_LABEL = { active: '✅ Đang hoạt động', expired: '❌ Hết hạn', suspended: '⚠ Bị khóa' };

export default function UserDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('user_token');
    if (!token) { navigate('/user/login'); return; }
    api.get('/user-auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setData(res.data))
      .catch(() => { localStorage.removeItem('user_token'); navigate('/user/login'); });
  }, [navigate]);

  const handleCopy = (key) => {
    navigator.clipboard.writeText(key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_info');
    navigate('/user/login');
  };

  if (!data) return (
    <div className="login-page">
      <div className="login-card"><p style={{ color: 'var(--text-secondary)' }}>Đang tải...</p></div>
    </div>
  );

  const key = data.keys?.[0];
  const statusColor = KEY_STATUS_COLOR[key?.status] || '#888';
  const statusBg = KEY_STATUS_BG[key?.status] || '#f8f9fa';

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 500, width: '100%' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="login-logo" aria-hidden style={{ width: 40, height: 40, borderRadius: 10, fontSize: 16 }}>GF</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>GroupFlow</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.user.email}</div>
            </div>
          </div>
          <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #e4e4e7', borderRadius: 6, cursor: 'pointer', color: '#888', fontSize: 12, padding: '5px 10px' }}>
            Đăng xuất
          </button>
        </div>

        <div style={{ fontSize: 14, marginBottom: 20, color: 'var(--text-secondary)' }}>
          Xin chào, <strong style={{ color: 'var(--text-primary)' }}>{data.user.name || data.user.email}</strong>
        </div>

        {/* License Key Card */}
        {key ? (
          <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ background: statusBg, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: statusColor }}>
                {KEY_STATUS_LABEL[key.status] || key.status}
              </span>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>Gói: <strong>{PLAN_LABEL[key.plan] || key.plan}</strong></span>
                <span>{key.expires_at ? `Hết hạn: ${new Date(key.expires_at).toLocaleDateString('vi')}` : 'Không hết hạn'}</span>
              </div>
            </div>
            <div style={{ padding: '16px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>License Key của bạn</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <code style={{
                  flex: 1, background: '#f8fafc', border: '1px solid #e4e4e7', borderRadius: 8,
                  padding: '10px 12px', fontSize: 12, letterSpacing: 0.5, wordBreak: 'break-all',
                  fontFamily: 'monospace', color: '#1e293b',
                }}>
                  {key.key_value}
                </code>
                <button
                  onClick={() => handleCopy(key.key_value)}
                  style={{
                    padding: '10px 16px', background: copied ? '#15803d' : '#2563eb',
                    color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', transition: 'background 0.2s',
                  }}
                >
                  {copied ? '✓ Đã copy' : 'Copy'}
                </button>
              </div>
              {key.last_validated_at && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
                  Lần cuối kích hoạt: {new Date(key.last_validated_at).toLocaleString('vi')}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 12, padding: '16px', marginBottom: 20, fontSize: 13, color: '#c2410c' }}>
            Chưa có license key — liên hệ admin để được cấp key.
          </div>
        )}

        {/* Activation Guide */}
        <div style={{ background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14, color: '#1e40af' }}>Hướng dẫn kích hoạt extension</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 2, color: '#374151' }}>
            <li>Cài extension <strong>GroupFlow</strong> từ Chrome Web Store</li>
            <li>Bấm icon GroupFlow trên thanh công cụ → extension mở ra</li>
            <li>Màn hình kích hoạt hiện lên — dán <strong>License Key</strong> vào ô trống</li>
            <li>Bấm <strong>"Xác thực key"</strong> → Extension sẵn sàng dùng</li>
          </ol>
        </div>

      </div>
    </div>
  );
}
