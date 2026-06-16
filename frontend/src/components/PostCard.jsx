import Badge from './ui/Badge';
import { formatDateTime } from '../utils/date';
import { mediaSrc } from '../utils/mediaUrl';

export default function PostCard({ post, pageName, onEdit, onPublish, onApprove, onDelete }) {
  return (
    <div className="post-card">
      <div className="post-card-media">
        {post.media_type === 'image' && post.image_url && (
          <img src={mediaSrc(post.image_url)} alt={post.topic || 'Bài viết'} />
        )}
        {post.media_type === 'video' && (
          <div className="post-card-video">
            {post.video_thumb_url ? <img src={mediaSrc(post.video_thumb_url)} alt="" /> : '▶'}
          </div>
        )}
        {post.media_type === 'none' && <div className="post-card-empty">Không media</div>}
      </div>
      <div className="post-card-body">
        <div className="post-card-meta">
          <Badge status={post.status} />
          <span>{pageName}</span>
        </div>
        <h4>{post.topic || `Bài #${post.id}`}</h4>
        <p>{post.content?.slice(0, 120)}{post.content?.length > 120 ? '...' : ''}</p>
        {post.scheduled_at && <small>Lên lịch: {formatDateTime(post.scheduled_at)}</small>}
        <div className="post-card-actions">
          <button type="button" className="btn-link" onClick={() => onEdit?.(post)}>Sửa</button>
          {post.status === 'draft' && <button type="button" className="btn-link" onClick={() => onPublish?.(post.id)}>Đăng</button>}
          {post.status === 'pending_approval' && <button type="button" className="btn-link" onClick={() => onApprove?.(post.id)}>Duyệt</button>}
          <button type="button" className="btn-link" onClick={() => onDelete?.(post.id)}>Xóa</button>
        </div>
      </div>
    </div>
  );
}
