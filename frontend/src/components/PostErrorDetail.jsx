import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import Modal from './ui/Modal';
import { postStatusLabel } from '../config/vi';

function getErrorHint(message) {
  const text = String(message || '').toLowerCase();
  if (text.includes('post is empty')) {
    return 'Điền nội dung vào ô Nội dung (không phải Chủ đề). Nếu bài có ảnh AI, xuất ảnh trước khi đăng.';
  }
  if (text.includes('token') || text.includes('oauth') || text.includes('access')) {
    return 'Token fanpage có thể hết hạn — vào Fanpage và cập nhật token.';
  }
  if (text.includes('provider') || text.includes('ảnh') || text.includes('image')) {
    return 'Kiểm tra cấu hình AI ảnh của fanpage và thử xuất ảnh thủ công trước.';
  }
  if (text.includes('permission') || text.includes('quyền')) {
    return 'Token thiếu quyền đăng bài — tạo lại token với quyền pages_manage_posts.';
  }
  return 'Sửa nội dung/ảnh nếu cần, rồi bấm Đăng lại.';
}

function resolveErrorContext(post) {
  const message = String(post?.error_message || '').trim();
  const kinds = [];
  if (post?.status === 'failed') kinds.push('Đăng bài thất bại');
  if (post?.image_job_status === 'failed') kinds.push('Xuất ảnh AI thất bại');
  const subtitle = kinds.length ? kinds.join(' · ') : 'Có lỗi liên quan bài viết';

  return {
    subtitle,
    message: message || 'Không có chi tiết lỗi được lưu. Thử đăng lại hoặc kiểm tra nội dung, ảnh và token fanpage.',
    hint: getErrorHint(message),
  };
}

export function hasPostError(post) {
  return Boolean(
    post?.error_message?.trim()
    || post?.status === 'failed'
    || post?.image_job_status === 'failed'
  );
}

export default function PostErrorDetail({ post, compact = false }) {
  const [open, setOpen] = useState(false);
  if (!hasPostError(post)) return null;

  const { subtitle, message, hint } = resolveErrorContext(post);
  const previewSource = String(post?.error_message || '').trim()
    || (post?.status === 'failed' ? 'Đăng thất bại' : 'Lỗi xử lý bài');
  const preview = previewSource.length > 120
    ? `${previewSource.slice(0, 120)}…`
    : previewSource;

  return (
    <>
      <button
        type="button"
        className={`post-error-detail${compact ? ' post-error-detail--compact' : ''}`}
        onClick={() => setOpen(true)}
        title={previewSource}
        aria-label={`Xem lỗi bài #${post.id}: ${previewSource}`}
      >
        <AlertCircle size={compact ? 16 : 14} aria-hidden />
        {!compact && (
          <>
            <span className="post-error-detail-text">{preview}</span>
            <span className="post-error-detail-link">Xem chi tiết</span>
          </>
        )}
        {compact && <span className="post-error-detail-sr">Xem lỗi</span>}
      </button>

      <Modal
        open={open}
        title={`Lỗi bài #${post.id}`}
        subtitle={subtitle}
        onClose={() => setOpen(false)}
        footer={(
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
            Đóng
          </button>
        )}
      >
        <div className="post-error-modal">
          <dl className="post-error-meta">
            <div>
              <dt>Trạng thái</dt>
              <dd>{postStatusLabel(post.status)}</dd>
            </div>
            {post.image_job_status && (
              <div>
                <dt>Job ảnh</dt>
                <dd>{post.image_job_status}</dd>
              </div>
            )}
            {post.topic && (
              <div>
                <dt>Chủ đề</dt>
                <dd>{post.topic}</dd>
              </div>
            )}
          </dl>
          <div className="post-error-message-block">
            <strong>Chi tiết lỗi</strong>
            <pre className="post-error-message">{message}</pre>
          </div>
          <p className="post-error-hint">{hint}</p>
        </div>
      </Modal>
    </>
  );
}
