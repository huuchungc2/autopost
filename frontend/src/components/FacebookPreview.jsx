const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:3001';

function mediaSrc(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url}`;
}

export default function FacebookPreview({ post, pageName = 'Facebook Page', avatarUrl }) {
  return (
    <div className="fb-preview">
      <div className="fb-preview-header">
        <div className="fb-preview-avatar">
          {avatarUrl ? <img src={mediaSrc(avatarUrl)} alt="" /> : pageName.charAt(0)}
        </div>
        <div>
          <div className="fb-preview-name">{pageName}</div>
          <div className="fb-preview-time">Just now · 🌐</div>
        </div>
      </div>
      <div className="fb-preview-content">{post?.content || 'Caption preview...'}</div>
      {post?.media_type === 'image' && post?.image_url && (
        <img className="fb-preview-media" src={mediaSrc(post.image_url)} alt="Post preview" />
      )}
      {post?.media_type === 'video' && (
        <div className="fb-preview-video">
          {post.video_thumb_url ? (
            <img src={mediaSrc(post.video_thumb_url)} alt="Video thumbnail" />
          ) : (
            <div className="fb-preview-video-placeholder">▶ Video</div>
          )}
        </div>
      )}
      <div className="fb-preview-actions">
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>↗ Share</span>
      </div>
    </div>
  );
}
