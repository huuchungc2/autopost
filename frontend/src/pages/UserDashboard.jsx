import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const PLAN_LABEL = { free: 'Miễn phí', pro: 'Pro', enterprise: 'Enterprise' };
const KEY_STATUS_COLOR = { active: '#15803d', expired: '#b91c1c', suspended: '#b45309' };
const KEY_STATUS_BG = { active: '#f0fdf4', expired: '#fef2f2', suspended: '#fff7ed' };
const KEY_STATUS_LABEL = { active: '✅ Đang hoạt động', expired: '❌ Hết hạn', suspended: '⚠ Bị khóa' };

function fmtDate(v) { return v ? new Date(v).toLocaleDateString('vi') : '—'; }
function fmtDatetime(v) { return v ? new Date(v).toLocaleString('vi') : '—'; }
function authHeaders() { return { Authorization: `Bearer ${localStorage.getItem('user_token')}` }; }

export default function UserDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('posts');
  const [copied, setCopied] = useState(false);
  const [editName, setEditName] = useState('');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('user_token');
    if (!token) { navigate('/user/login'); return; }
    api.get('/user-auth/me', { headers: authHeaders() })
      .then((res) => { setData(res.data); setEditName(res.data.user.name || ''); })
      .catch(() => { localStorage.removeItem('user_token'); navigate('/user/login'); });
  }, [navigate]);

  const loadDetail = () => {
    api.get('/user-auth/me/detail', { headers: authHeaders() })
      .then((r) => setDetail(r.data)).catch(() => {});
  };

  useEffect(() => {
    if (tab === 'posts' || tab === 'groups') loadDetail();
  }, [tab]);

  const handleCopy = (key) => {
    navigator.clipboard.writeText(key).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const handleSaveProfile = async () => {
    setSaving(true); setSaveMsg('');
    try {
      await api.patch('/user-auth/me',
        { name: editName, current_password: curPw || undefined, new_password: newPw || undefined },
        { headers: authHeaders() }
      );
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
    <div className="login-page"><div className="login-card"><p style={{ color: 'var(--text-secondary)' }}>Đang tải...</p></div></div>
  );

  const key = data.keys?.[0];
  const stats = data.stats || {};

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '24px 16px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Header */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e4e4e7', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>GF</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{data.user.name || 'GroupFlow User'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.user.email} · Đăng ký {fmtDate(data.user.created_at)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {key && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: KEY_STATUS_BG[key.status] || '#f8f9fa', border: `1px solid`, borderColor: key.status === 'active' ? '#86efac' : '#fca5a5', borderRadius: 8, padding: '5px 10px', fontSize: 12 }}>
                <span style={{ color: KEY_STATUS_COLOR[key.status] || '#555', fontWeight: 600 }}>{KEY_STATUS_LABEL[key.status]}</span>
                <span style={{ color: 'var(--text-secondary)' }}>· {PLAN_LABEL[key.plan] || key.plan}</span>
              </div>
            )}
            <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #e4e4e7', borderRadius: 8, cursor: 'pointer', color: '#888', fontSize: 13, padding: '6px 12px' }}>Đăng xuất</button>
          </div>
        </div>

        {/* Stats + License key row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 12 }}>
          {[
            ['Nhóm đang dùng', stats.group_count || 0, '#2563eb'],
            ['Bài đã đăng', stats.post_count || 0, '#7c3aed'],
            ['Hoạt động cuối', stats.last_post_at ? fmtDate(stats.last_post_at) : '—', '#0369a1'],
          ].map(([label, val, color]) => (
            <div key={label} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e4e7', padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
          {key && (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e4e4e7', padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>License Key</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <code style={{ flex: 1, background: '#f8fafc', border: '1px solid #e4e4e7', borderRadius: 6, padding: '7px 10px', fontSize: 11, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  {key.key_value}
                </code>
                <button onClick={() => handleCopy(key.key_value)} style={{ padding: '7px 12px', background: copied ? '#15803d' : '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>
              {key.last_validated_at && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>Kích hoạt lần cuối: {fmtDatetime(key.last_validated_at)}</div>}
            </div>
          )}
        </div>

        {/* Main content card */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e4e4e7', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #e4e4e7', padding: '0 4px' }}>
            {[['posts', 'Bài đã đăng'], ['groups', 'Nhóm'], ['guide', 'Hướng dẫn'], ['account', 'Tài khoản']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)} style={{
                padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === k ? 600 : 400,
                color: tab === k ? '#2563eb' : 'var(--text-secondary)',
                borderBottom: tab === k ? '2px solid #2563eb' : '2px solid transparent',
                marginBottom: -1,
              }}>{label}</button>
            ))}
          </div>

          <div style={{ padding: '0' }}>

            {/* Tab: Bài đã đăng — table như admin */}
            {tab === 'posts' && (
              <div>
                {!detail ? (
                  <p style={{ padding: '20px', color: 'var(--text-secondary)', fontSize: 13 }}>Đang tải…</p>
                ) : !detail.posts.length ? (
                  <p style={{ padding: '20px', color: 'var(--text-secondary)', fontSize: 13 }}>Chưa có bài nào được đồng bộ. Dùng extension đăng bài và bấm "Đồng bộ" để thấy ở đây.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e4e4e7' }}>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>Thời gian</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12 }}>Nhóm</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12 }}>Nội dung</th>
                        <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12 }}>Comment</th>
                        <th style={{ padding: '10px 16px', width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.posts.map((p) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {fmtDatetime(p.posted_at)}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{p.group_name || '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{p.group_id}</div>
                          </td>
                          <td style={{ padding: '12px 16px', maxWidth: 320 }}>
                            <div style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontSize: 13, color: '#374151' }}>
                              {p.noi_dung || '—'}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', minWidth: 24, padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                              background: p.needs_comment ? '#fff7ed' : '#f0fdf4',
                              color: p.needs_comment ? '#b45309' : '#15803d',
                            }}>
                              {p.needs_comment ? 'Chờ' : '✓'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {p.post_id && (
                              <a
                                href={`https://www.facebook.com/groups/${p.group_id}/posts/${p.post_id}`}
                                target="_blank" rel="noopener noreferrer"
                                style={{ color: '#2563eb', fontSize: 14, textDecoration: 'none' }}
                                title="Xem bài trên Facebook"
                              >↗</a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab: Nhóm */}
            {tab === 'groups' && (
              <div>
                {!detail ? (
                  <p style={{ padding: '20px', color: 'var(--text-secondary)', fontSize: 13 }}>Đang tải…</p>
                ) : !detail.groups.length ? (
                  <p style={{ padding: '20px', color: 'var(--text-secondary)', fontSize: 13 }}>Chưa có nhóm nào. Dùng extension đăng bài vào nhóm để thấy ở đây.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e4e4e7' }}>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12 }}>Tên nhóm</th>
                        <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12 }}>Bài đăng</th>
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12 }}>Lần cuối đăng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.groups.map((g) => (
                        <tr key={g.group_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 500 }}>{g.group_name || '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{g.group_id}</div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#2563eb', fontSize: 16 }}>{g.post_count}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>{fmtDatetime(g.last_posted_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab: Hướng dẫn */}
            {tab === 'guide' && (
              <div style={{ padding: '20px' }}>
                <div style={{ background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14, color: '#1e40af' }}>Kích hoạt extension</div>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 2, color: '#374151' }}>
                    <li>Cài extension <strong>GroupFlow</strong> từ Chrome Web Store</li>
                    <li>Bấm icon GroupFlow trên thanh công cụ</li>
                    <li>Màn hình kích hoạt hiện lên → dán <strong>License Key</strong> vào ô trống</li>
                    <li>Bấm <strong>"Xác thực key"</strong> → Extension sẵn sàng dùng</li>
                  </ol>
                </div>
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14, color: '#15803d' }}>Đồng bộ dữ liệu</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 2, color: '#374151' }}>
                    <li>Extension tự <strong>đẩy lên</strong> (↑) sau mỗi lần đăng bài</li>
                    <li>Extension tự <strong>kéo về</strong> (↓) bài của bạn từ server khi mở</li>
                    <li>Bấm <strong>"↻ Đồng bộ ngay"</strong> trong tab Đồng bộ để force sync</li>
                    <li>Bài từ thành viên khác sẽ xuất hiện trong tab <strong>Comment</strong></li>
                  </ul>
                </div>
              </div>
            )}

            {/* Tab: Tài khoản */}
            {tab === 'account' && (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Tên hiển thị</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nhập tên của bạn" style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e4e4e7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
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
