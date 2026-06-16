import { mediaSrc } from '../utils/mediaUrl';

export default function FacebookPreview({ post, pageName = 'Fanpage', avatarUrl }) {
  return (
    <div className="fb-preview">
      <div className="fb-preview-header">
        <div className="fb-preview-avatar">
          {avatarUrl ? <img src={mediaSrc(avatarUrl)} alt="" /> : pageName.charAt(0)}
        </div>
        <div>
          <div className="fb-preview-name">{pageName}</div>
          <div className="fb-preview-time">Vừa xong · 🌐</div>
        </div>
      </div>
      <div className="fb-preview-content">{post?.content || 'Xem trước nội dung bài đăng...'}</div>
      {post?.media_type === 'image' && post?.image_url && (
        <img className="fb-preview-media" src={mediaSrc(post.image_url)} alt="Xem trước bài đăng" />
      )}
      {post?.media_type === 'video' && (
        <div className="fb-preview-video">
          {post.video_thumb_url ? (
            <img src={mediaSrc(post.video_thumb_url)} alt="Thumbnail video" />
          ) : (
            <div className="fb-preview-video-placeholder">▶ Video</div>
          )}
        </div>
      )}
      <div className="fb-preview-actions">
        <span>👍 Thích</span>
        <span>💬 Bình luận</span>
        <span>↗ Chia sẻ</span>
      </div>
    </div>
  );
}
