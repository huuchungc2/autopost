import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const PLAN_LABEL = { free: 'Miễn phí', pro: 'Pro', enterprise: 'Enterprise' };
const KEY_STATUS_COLOR = { active: '#15803d', expired: '#b91c1c', suspended: '#b45309' };
const KEY_STATUS_BG = { active: '#f0fdf4', expired: '#fef2f2', suspended: '#fff7ed' };
const KEY_STATUS_LABEL = { active: '✅ Đang hoạt động', expired: '❌ Hết hạn', suspended: '⚠ Bị khóa' };

function fmtDate(v) { return v ? new Date(v).toLocaleDateString('vi') : '—'; }
function fmtDatetime(v) { return v ? new Date(v).toLocaleString('vi') : '—'; }

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('user_token')}` };
}

export default function UserDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('overview');
  const [copied, setCopied] = useState(false);

  // profile edit state
  const [editName, setEditName] = useState('');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('user_token');
    if (!token) { navigate('/user/login'); return; }
    api.get('/user-auth/me', { headers: authHeaders() })
      .then((res) => {
        setData(res.data);
        setEditName(res.data.user.name || '');
      })
      .catch(() => { localStorage.removeItem('user_token'); navigate('/user/login'); });
  }, [navigate]);

  const loadDetail = () => {
    if (detail) return;
    api.get('/user-auth/me/detail', { headers: authHeaders() })
      .then((r) => setDetail(r.data))
      .catch(() => {});
  };

  useEffect(() => {
    if (tab === 'groups' || tab === 'posts') loadDetail();
  }, [tab]);

  const handleCopy = (key) => {
    navigator.clipboard.writeText(key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSaveProfile = async () => {
    setSaving(true); setSaveMsg('');
    try {
      await api.patch('/user-auth/me', { name: editName, current_password: curPw || undefined, new_password: newPw || undefined }, { headers: authHeaders() });
      setSaveMsg('Đã lưu');
      setCurPw(''); setNewPw('');
      const res = await api.get('/user-auth/me', { headers: authHeaders() });
      setData(res.data);
    } catch (e) {
      setSaveMsg(e.response?.data?.error || 'Lỗi lưu');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
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
  const stats = data.stats || {};

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '24px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Header card */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e4e4e7', padding: '20px 24px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>GF</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{data.user.name || 'GroupFlow User'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.user.email}</div>
            </div>
          </div>
          <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #e4e4e7', borderRadius: 8, cursor: 'pointer', color: '#888', fontSize: 13, padding: '6px 12px' }}>
            Đăng xuất
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            ['Nhóm đang dùng', stats.group_count || 0, '#2563eb'],
            ['Bài đã đăng', stats.post_count || 0, '#7c3aed'],
            ['Đăng ký', fmtDate(data.user.created_at), '#0369a1'],
          ].map(([label, val, color]) => (
            <div key={label} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e4e7', padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* License key card */}
        {key && (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e4e4e7', overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ background: KEY_STATUS_BG[key.status] || '#f8f9fa', padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: KEY_STATUS_COLOR[key.status] || '#555' }}>
                {KEY_STATUS_LABEL[key.status] || key.status}
              </span>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 12 }}>
                <span>Gói: <strong>{PLAN_LABEL[key.plan] || key.plan}</strong></span>
                <span>{key.expires_at ? `Hết hạn: ${fmtDate(key.expires_at)}` : 'Không hết hạn'}</span>
              </div>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>License Key của bạn</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <code style={{ flex: 1, background: '#f8fafc', border: '1px solid #e4e4e7', borderRadius: 8, padding: '10px 12px', fontSize: 12, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  {key.key_value}
                </code>
                <button onClick={() => handleCopy(key.key_value)} style={{ padding: '10px 16px', background: copied ? '#15803d' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {copied ? '✓ Đã copy' : 'Copy'}
                </button>
              </div>
              {key.last_validated_at && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Lần cuối kích hoạt: {fmtDatetime(key.last_validated_at)}</div>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #e4e4e7' }}>
            {[['overview', 'Tổng quan'], ['groups', 'Nhóm'], ['posts', 'Bài đăng'], ['account', 'Tài khoản']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)} style={{
                flex: 1, padding: '12px 8px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === k ? 600 : 400,
                color: tab === k ? '#2563eb' : 'var(--text-secondary)',
                borderBottom: tab === k ? '2px solid #2563eb' : '2px solid transparent',
                marginBottom: -1,
              }}>{label}</button>
            ))}
          </div>

          <div style={{ padding: '20px 20px' }}>

            {/* Tab: Tổng quan */}
            {tab === 'overview' && (
              <div>
                {stats.last_post_at && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                    Bài đăng gần nhất: <strong>{fmtDatetime(stats.last_post_at)}</strong>
                  </p>
                )}
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
            )}

            {/* Tab: Nhóm */}
            {tab === 'groups' && (
              <div>
                {!detail ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Đang tải…</p>
                ) : !detail.groups.length ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Chưa có nhóm nào. Dùng extension đăng bài vào nhóm để thấy ở đây.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        <th style={{ textAlign: 'left', paddingBottom: 8, fontWeight: 500 }}>Tên nhóm</th>
                        <th style={{ textAlign: 'center', paddingBottom: 8, fontWeight: 500 }}>Bài đăng</th>
                        <th style={{ textAlign: 'right', paddingBottom: 8, fontWeight: 500 }}>Lần cuối đăng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.groups.map((g) => (
                        <tr key={g.group_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 0' }}>
                            <div style={{ fontWeight: 500 }}>{g.group_name || '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{g.group_id}</div>
                          </td>
                          <td style={{ textAlign: 'center', color: '#2563eb', fontWeight: 600 }}>{g.post_count}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>{fmtDate(g.last_posted_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab: Bài đăng */}
            {tab === 'posts' && (
              <div>
                {!detail ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Đang tải…</p>
                ) : !detail.posts.length ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Chưa có bài nào được đồng bộ.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {detail.posts.map((p) => (
                      <div key={p.id} style={{ border: '1px solid #e4e4e7', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{p.group_name || p.group_id}</div>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 20,
                            background: p.needs_comment ? '#fff7ed' : '#f0fdf4',
                            color: p.needs_comment ? '#b45309' : '#15803d',
                          }}>
                            {p.needs_comment ? 'Chờ comment' : 'Đã comment'}
                          </span>
                        </div>
                        {p.noi_dung && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {p.noi_dung}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 12 }}>
                          <span>Post ID: {p.post_id}</span>
                          <span>{fmtDatetime(p.posted_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Tài khoản */}
            {tab === 'account' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Tên hiển thị</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nhập tên của bạn"
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e4e4e7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Email</label>
                  <input value={data.user.email} disabled style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e4e4e7', borderRadius: 8, fontSize: 14, background: '#f8fafc', color: '#888', boxSizing: 'border-box' }} />
                </div>
                <hr style={{ border: 'none', borderTop: '1px solid #e4e4e7', margin: '4px 0' }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Đổi mật khẩu</div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Mật khẩu hiện tại</label>
                  <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="Để trống nếu không đổi mật khẩu" style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e4e4e7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Mật khẩu mới</label>
                  <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Tối thiểu 6 ký tự" style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e4e4e7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={handleSaveProfile} disabled={saving} style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
                  </button>
                  {saveMsg && <span style={{ fontSize: 13, color: saveMsg === 'Đã lưu' ? '#15803d' : '#b91c1c' }}>{saveMsg}</span>}
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
