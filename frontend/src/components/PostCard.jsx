import Badge from './ui/Badge';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:3001';

function mediaSrc(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url}`;
}

export default function PostCard({ post, pageName, onEdit, onPublish, onApprove, onDelete }) {
  return (
    <div className="post-card">
      <div className="post-card-media">
        {post.media_type === 'image' && post.image_url && (
          <img src={mediaSrc(post.image_url)} alt={post.topic || 'Post'} />
        )}
        {post.media_type === 'video' && (
          <div className="post-card-video">
            {post.video_thumb_url ? <img src={mediaSrc(post.video_thumb_url)} alt="" /> : '▶'}
          </div>
        )}
        {post.media_type === 'none' && <div className="post-card-empty">No media</div>}
      </div>
      <div className="post-card-body">
        <div className="post-card-meta">
          <Badge status={post.status}>{post.status}</Badge>
          <span>{pageName}</span>
        </div>
        <h4>{post.topic || `Post #${post.id}`}</h4>
        <p>{post.content?.slice(0, 120)}{post.content?.length > 120 ? '...' : ''}</p>
        {post.scheduled_at && <small>Scheduled: {new Date(post.scheduled_at).toLocaleString()}</small>}
        <div className="post-card-actions">
          <button type="button" className="btn-link" onClick={() => onEdit?.(post)}>Edit</button>
          {post.status === 'draft' && <button type="button" className="btn-link" onClick={() => onPublish?.(post.id)}>Publish</button>}
          {post.status === 'pending_approval' && <button type="button" className="btn-link" onClick={() => onApprove?.(post.id)}>Approve</button>}
          <button type="button" className="btn-link" onClick={() => onDelete?.(post.id)}>Delete</button>
        </div>
      </div>
    </div>
  );
}
