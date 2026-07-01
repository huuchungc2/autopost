import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const PLAN_LABEL = { free: 'Miễn phí', pro: 'Pro', enterprise: 'Enterprise' };
const STATUS_LABEL = { active: '✅ Đang hoạt động', expired: '❌ Hết hạn', suspended: '⛔ Bị khóa' };

export default function UserDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

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

  if (!data) return <div className="login-page"><div className="login-card"><p>Đang tải...</p></div></div>;

  const key = data.keys?.[0];

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="login-brand" style={{ marginBottom: 0 }}>
            <div className="login-logo" aria-hidden>GF</div>
            <h1 style={{ margin: 0 }}>GroupFlow</h1>
          </div>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 13 }}>
            Đăng xuất
          </button>
        </div>

        <p style={{ color: '#888', marginBottom: 24 }}>
          Xin chào, <strong>{data.user.name || data.user.email}</strong>
        </p>

        {error && <div className="form-error">{error}</div>}

        {key ? (
          <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '20px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>License Key của bạn</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <code style={{ flex: 1, background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '10px 12px', fontSize: 13, letterSpacing: 1, wordBreak: 'break-all' }}>
                {key.key_value}
              </code>
              <button
                onClick={() => handleCopy(key.key_value)}
                style={{ whiteSpace: 'nowrap', padding: '10px 14px', background: copied ? '#4caf50' : '#1877f2', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                {copied ? '✓ Đã copy' : 'Copy'}
              </button>
            </div>
            <div style={{ fontSize: 13, color: '#555', display: 'flex', gap: 16 }}>
              <span>{STATUS_LABEL[key.status] || key.status}</span>
              <span>Gói: <strong>{PLAN_LABEL[key.plan] || key.plan}</strong></span>
              <span>{key.expires_at ? `Hết hạn: ${new Date(key.expires_at).toLocaleDateString('vi')}` : 'Không hết hạn'}</span>
            </div>
          </div>
        ) : (
          <p style={{ color: '#888' }}>Chưa có key — liên hệ admin</p>
        )}

        <div style={{ background: '#f0f4ff', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Hướng dẫn kích hoạt extension</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: '#444' }}>
            <li>Cài extension <strong>GroupFlow</strong> từ Chrome Web Store</li>
            <li>Mở GroupFlow → vào tab <strong>Cài đặt</strong></li>
            <li>Dán License Key vào ô <strong>"License Key"</strong></li>
            <li>Bấm <strong>Lưu</strong> → Extension sẵn sàng dùng</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
