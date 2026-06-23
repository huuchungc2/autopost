import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Skeleton from './ui/Skeleton';
import api from '../services/api';
import { formatDateTime } from '../utils/date';

export default function GroupPostDetailModal({ post, open, onClose }) {
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [tab, setTab] = useState('detail');

  useEffect(() => {
    if (!open || !post?.id) return;
    setTab('detail');
    setComments([]);
  }, [open, post?.id]);

  useEffect(() => {
    if (!open || !post?.id || tab !== 'comments') return;
    let cancelled = false;
    setCommentsLoading(true);
    api.get(`/group-posts/${post.id}/comments`)
      .then((res) => {
        if (!cancelled) setComments(res.data.data || []);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, post?.id, tab]);

  if (!post) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Chi tiết bài Group"
      subtitle={post.poster_name ? `Đăng bởi ${post.poster_name}` : undefined}
      wide
      footer={(
        <>
          {post.fb_url && (
            <Button variant="secondary" onClick={() => window.open(post.fb_url, '_blank', 'noreferrer')}>
              <ExternalLink size={16} /> Mở Facebook
            </Button>
          )}
          <Button onClick={onClose}>Đóng</Button>
        </>
      )}
    >
      <div className="toggle-row" style={{ marginBottom: 16 }}>
        <button type="button" className={`toggle${tab === 'detail' ? ' active' : ''}`} onClick={() => setTab('detail')}>
          Nội dung
        </button>
        <button type="button" className={`toggle${tab === 'comments' ? ' active' : ''}`} onClick={() => setTab('comments')}>
          Comment ({post.comment_count ?? 0})
        </button>
      </div>

      {tab === 'detail' && (
        <dl className="detail-dl">
          <dt>Thời gian đăng</dt>
          <dd>{post.posted_at ? formatDateTime(post.posted_at) : '—'}</dd>
          <dt>Group</dt>
          <dd>
            {post.group_name || '—'}
            <br /><code>{post.group_id}</code>
          </dd>
          <dt>Post ID</dt>
          <dd><code>{post.post_id}</code></dd>
          <dt>Lịch (Excel)</dt>
          <dd>{post.ngay_dang || '—'} {post.gio_dang || ''}</dd>
          <dt>Nội dung</dt>
          <dd className="detail-pre">{post.noi_dung || '—'}</dd>
          {post.prompt_anh && (
            <>
              <dt>Prompt ảnh</dt>
              <dd className="detail-pre">{post.prompt_anh}</dd>
            </>
          )}
        </dl>
      )}

      {tab === 'comments' && (
        commentsLoading ? (
          <Skeleton height={80} />
        ) : !comments.length ? (
          <p className="text-muted">Chưa có comment nào được ghi nhận từ extension.</p>
        ) : (
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Người comment</th>
                <th>FB ID</th>
                <th>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {comments.map((c) => (
                <tr key={c.id}>
                  <td>{c.commenter_name}</td>
                  <td><code>{c.commenter_fb_user_id || '—'}</code></td>
                  <td>{c.commented_at ? formatDateTime(c.commented_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </Modal>
  );
}
