import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const PLAN_LABEL = { free: 'Miễn phí', pro: 'Pro', enterprise: 'Enterprise' };
const KEY_STATUS_COLOR = { active: 'var(--color-success)', expired: 'var(--color-error)', suspended: 'var(--color-warning)' };
const KEY_STATUS_BG = { active: 'var(--bg-success)', expired: 'var(--bg-error)', suspended: 'var(--bg-warning)' };
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
  const [postsPage, setPostsPage] = useState(1);
  const [postsPagination, setPostsPagination] = useState({ page: 1, pages: 1, total: 0 });

  useEffect(() => {
    const token = localStorage.getItem('user_token');
    if (!token) { navigate('/user/login'); return; }
    api.get('/user-auth/me', { headers: authHeaders() })
      .then((res) => { setData(res.data); setEditName(res.data.user.name || ''); })
      .catch(() => { localStorage.removeItem('user_token'); navigate('/user/login'); });
  }, [navigate]);

  // Bài đã đăng phân trang (page/limit) — trước đây LIMIT 30 cứng, không có tham số trang, nên
  // bài cũ hơn 30 dòng gần nhất theo created_at không bao giờ xem lại được, và khi backfill/re-sync
  // khiến created_at không còn phản ánh đúng thứ tự thời gian thật thì bài mới nhất có thể bị đẩy
  // khỏi top 30 luôn. Nhóm (`groups`) giữ nguyên không phân trang — số nhóm dùng thường ít.
  const loadDetail = (page = 1) => {
    api.get('/user-auth/me/detail', { headers: authHeaders(), params: { page, limit: 30 } })
      .then((r) => {
        setDetail(r.data);
        setPostsPagination(r.data.pagination || { page: 1, pages: 1, total: 0 });
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (tab === 'posts') loadDetail(postsPage);
    else if (tab === 'groups') loadDetail(1);
  }, [tab, postsPage]);

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
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Header */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid var(--bg-border)', padding: '18px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--color-primary)', color: 'var(--text-inverse)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>GF</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{data.user.name || 'GroupFlow User'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{data.user.email} · Đăng ký {fmtDate(data.user.created_at)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {key && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap', background: KEY_STATUS_BG[key.status] || 'var(--bg-muted)', border: `1px solid`, borderColor: key.status === 'active' ? 'var(--color-success)' : 'var(--color-error)', borderRadius: 8, padding: '5px 10px', fontSize: 12 }}>
                <span style={{ color: KEY_STATUS_COLOR[key.status] || 'var(--text-secondary)', fontWeight: 600 }}>{KEY_STATUS_LABEL[key.status]}</span>
                <span style={{ color: 'var(--text-secondary)' }}>· {PLAN_LABEL[key.plan] || key.plan}</span>
              </div>
            )}
            <button onClick={handleLogout} style={{ background: 'none', border: '1px solid var(--bg-border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, padding: '6px 12px', flexShrink: 0 }}>Đăng xuất</button>
          </div>
        </div>

        {/* Stats + License key — 1 card gộp nhiều dòng cho dễ nhìn thay vì tách 4 card rời */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid var(--bg-border)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {[
              ['Nhóm đang dùng', stats.group_count || 0, 'var(--color-primary)'],
              ['Bài đã đăng', stats.post_count || 0, 'var(--color-warning)'],
              ['Hoạt động cuối', stats.last_post_at ? fmtDate(stats.last_post_at) : '—', 'var(--color-info)'],
            ].map(([label, val, color], i) => (
              <div key={label} style={{ flex: '1 1 140px', padding: '16px', textAlign: 'center', borderLeft: i > 0 ? '1px solid var(--bg-border)' : 'none' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          {key && (
            <div style={{ borderTop: '1px solid var(--bg-border)', padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>License Key</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <code style={{ flex: '1 1 220px', background: 'var(--bg-muted)', border: '1px solid var(--bg-border)', borderRadius: 6, padding: '7px 10px', fontSize: 12, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  {key.key_value}
                </code>
                <button onClick={() => handleCopy(key.key_value)} style={{ padding: '7px 16px', background: copied ? 'var(--color-success)' : 'var(--color-primary)', color: 'var(--text-inverse)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {copied ? '✓ Đã copy' : 'Copy'}
                </button>
              </div>
              {key.last_validated_at && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 }}>Kích hoạt lần cuối: {fmtDatetime(key.last_validated_at)}</div>}
            </div>
          )}
        </div>

        {/* Main content card */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid var(--bg-border)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--bg-border)', padding: '0 4px' }}>
            {[['posts', 'Bài đã đăng'], ['groups', 'Nhóm'], ['guide', 'Hướng dẫn'], ['account', 'Tài khoản']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)} style={{
                padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === k ? 600 : 400,
                color: tab === k ? 'var(--color-primary)' : 'var(--text-secondary)',
                borderBottom: tab === k ? '2px solid var(--color-primary)' : '2px solid transparent',
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
                  <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--bg-border)' }}>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>Thời gian</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12 }}>Nhóm</th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12 }}>Nội dung</th>
                        <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12 }}>Comment</th>
                        <th style={{ padding: '10px 16px', width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.posts.map((p) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--bg-border)' }}>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {fmtDatetime(p.posted_at)}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{p.group_name || '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{p.group_id}</div>
                          </td>
                          <td style={{ padding: '12px 16px', maxWidth: 320 }}>
                            <div style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontSize: 13, color: 'var(--text-secondary)' }}>
                              {p.noi_dung || '—'}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', minWidth: 24, padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                              background: p.needs_comment ? 'var(--bg-warning)' : 'var(--bg-success)',
                              color: p.needs_comment ? 'var(--color-warning)' : 'var(--color-success)',
                            }}>
                              {p.needs_comment ? 'Chờ' : '✓'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {p.post_id && (
                              <a
                                href={`https://www.facebook.com/groups/${p.group_id}/posts/${p.post_id}`}
                                target="_blank" rel="noopener noreferrer"
                                style={{ color: 'var(--color-primary)', fontSize: 14, textDecoration: 'none' }}
                                title="Xem bài trên Facebook"
                              >↗</a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
                {postsPagination.pages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '14px 16px' }}>
                    <button
                      type="button"
                      disabled={postsPagination.page <= 1}
                      onClick={() => setPostsPage(postsPagination.page - 1)}
                      style={{ padding: '6px 14px', border: '1px solid var(--bg-border)', borderRadius: 8, background: 'none', cursor: postsPagination.page <= 1 ? 'not-allowed' : 'pointer', fontSize: 13, opacity: postsPagination.page <= 1 ? 0.5 : 1 }}
                    >
                      Trước
                    </button>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Trang {postsPagination.page}/{postsPagination.pages} ({postsPagination.total} bài)</span>
                    <button
                      type="button"
                      disabled={postsPagination.page >= postsPagination.pages}
                      onClick={() => setPostsPage(postsPagination.page + 1)}
                      style={{ padding: '6px 14px', border: '1px solid var(--bg-border)', borderRadius: 8, background: 'none', cursor: postsPagination.page >= postsPagination.pages ? 'not-allowed' : 'pointer', fontSize: 13, opacity: postsPagination.page >= postsPagination.pages ? 0.5 : 1 }}
                    >
                      Sau
                    </button>
                  </div>
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
                  <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 420, borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-muted)', borderBottom: '1px solid var(--bg-border)' }}>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12 }}>Tên nhóm</th>
                        <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12 }}>Bài đăng</th>
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 12 }}>Lần cuối đăng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.groups.map((g) => (
                        <tr key={g.group_id} style={{ borderBottom: '1px solid var(--bg-border)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 500 }}>{g.group_name || '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{g.group_id}</div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--color-primary)', fontSize: 16 }}>{g.post_count}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 12 }}>{fmtDatetime(g.last_posted_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Hướng dẫn */}
            {tab === 'guide' && (
              <div style={{ padding: '20px' }}>
                <div style={{ background: 'var(--bg-info)', border: '1px solid var(--color-primary-border)', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14, color: 'var(--color-primary-hover)' }}>Kích hoạt extension</div>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 2, color: 'var(--text-secondary)' }}>
                    <li>Cài extension <strong>GroupFlow</strong> từ Chrome Web Store</li>
                    <li>Bấm icon GroupFlow trên thanh công cụ</li>
                    <li>Màn hình kích hoạt hiện lên → dán <strong>License Key</strong> vào ô trống</li>
                    <li>Bấm <strong>"Xác thực key"</strong> → Extension sẵn sàng dùng</li>
                  </ol>
                </div>
                <div style={{ background: 'var(--bg-success)', border: '1px solid var(--color-success)', borderRadius: 12, padding: '16px 18px' }}>
                  <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14, color: 'var(--color-success)' }}>Đồng bộ dữ liệu</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 2, color: 'var(--text-secondary)' }}>
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
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nhập tên của bạn" style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--bg-border)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Email</label>
                  <input value={data.user.email} disabled style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--bg-border)', borderRadius: 8, fontSize: 14, background: 'var(--bg-muted)', color: 'var(--text-tertiary)', boxSizing: 'border-box' }} />
                </div>
                <hr style={{ border: 'none', borderTop: '1px solid var(--bg-border)', margin: '4px 0' }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Đổi mật khẩu</div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Mật khẩu hiện tại</label>
                  <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="Để trống nếu không đổi mật khẩu" style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--bg-border)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Mật khẩu mới</label>
                  <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Tối thiểu 6 ký tự" style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--bg-border)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={handleSaveProfile} disabled={saving} style={{ padding: '10px 20px', background: 'var(--color-primary)', color: 'var(--text-inverse)', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
                  </button>
                  {saveMsg && <span style={{ fontSize: 13, color: saveMsg === 'Đã lưu' ? 'var(--color-success)' : 'var(--color-error)' }}>{saveMsg}</span>}
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
