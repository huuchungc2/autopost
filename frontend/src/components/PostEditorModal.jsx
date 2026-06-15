import { useEffect, useState } from 'react';
import api from '../services/api';
import VideoUpload from './VideoUpload';
import FacebookPreview from './FacebookPreview';
import Modal from './ui/Modal';
import { fromDatetimeLocalInput, toDatetimeLocalInput } from '../utils/date';

const emptyForm = {
  page_id: '',
  topic: '',
  content: '',
  media_type: 'none',
  image_url: '',
  video_url: '',
  video_thumb_url: '',
  scheduled_at: '',
  status: 'draft',
};

export default function PostEditorModal({ open, post, pages, onClose, onSaved, onError }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const isEdit = Boolean(post?.id);

  useEffect(() => {
    if (!open) return;
    if (post?.id) {
      setForm({
        page_id: String(post.page_id || ''),
        topic: post.topic || '',
        content: post.content || '',
        media_type: post.media_type || 'none',
        image_url: post.image_url || '',
        video_url: post.video_url || '',
        video_thumb_url: post.video_thumb_url || '',
        scheduled_at: toDatetimeLocalInput(post.scheduled_at),
        status: post.status || 'draft',
      });
    } else {
      setForm({
        ...emptyForm,
        page_id: pages.length ? String(pages[0].id) : '',
      });
    }
  }, [open, post, pages]);

  const selectedPage = pages.find((p) => String(p.id) === String(form.page_id));

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm((prev) => ({
        ...prev,
        media_type: 'image',
        image_url: response.data.url,
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setImageUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.page_id || !form.content.trim()) return;
    setSaving(true);
    try {
      const payload = {
        page_id: Number(form.page_id),
        topic: form.topic,
        content: form.content,
        media_type: form.media_type,
        image_url: form.media_type === 'image' ? form.image_url || null : null,
        video_url: form.media_type === 'video' ? form.video_url || null : null,
        video_thumb_url: form.media_type === 'video' ? form.video_thumb_url || null : null,
        scheduled_at: fromDatetimeLocalInput(form.scheduled_at),
        status: form.scheduled_at ? 'scheduled' : form.status,
      };

      if (isEdit) {
        await api.put(`/posts/${post.id}`, payload);
      } else {
        await api.post('/posts', payload);
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      onError?.(err.response?.data?.error || 'Không lưu được bài viết');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={isEdit ? 'Sửa bài viết' : 'Viết bài tay'}
      onClose={onClose}
      wide
    >
      <div className="edit-post-layout post-editor">
        <div className="form-card post-editor-form">
          <label>
            Fanpage
            <select
              value={form.page_id}
              onChange={(e) => setField('page_id', e.target.value)}
              disabled={isEdit}
            >
              <option value="">Chọn fanpage</option>
              {pages.map((page) => (
                <option key={page.id} value={page.id}>{page.name}</option>
              ))}
            </select>
          </label>

          <label>
            Chủ đề
            <input
              value={form.topic}
              onChange={(e) => setField('topic', e.target.value)}
              placeholder="Tiêu đề / chủ đề ngắn"
            />
          </label>

          <label>
            Nội dung
            <textarea
              rows={8}
              value={form.content}
              onChange={(e) => setField('content', e.target.value)}
              placeholder="Viết nội dung bài đăng..."
              required
            />
          </label>

          <label>
            Loại media
            <select
              value={form.media_type}
              onChange={(e) => setField('media_type', e.target.value)}
            >
              <option value="none">Không có ảnh/video</option>
              <option value="image">Ảnh</option>
              <option value="video">Video</option>
            </select>
          </label>

          {form.media_type === 'image' && (
            <>
              <label>
                URL ảnh
                <input
                  value={form.image_url}
                  onChange={(e) => setField('image_url', e.target.value)}
                  placeholder="/images/... hoặc https://"
                />
              </label>
              <label className="image-upload-label">
                <input type="file" accept="image/*" onChange={handleImageUpload} disabled={imageUploading} />
                {imageUploading ? 'Đang tải ảnh...' : 'Hoặc chọn ảnh từ máy'}
              </label>
            </>
          )}

          {form.media_type === 'video' && (
            <>
              <VideoUpload
                onUploaded={({ video_url }) => setField('video_url', video_url)}
              />
              {form.video_url && <div className="form-success">Video: {form.video_url}</div>}
              <label>
                URL thumbnail (tuỳ chọn)
                <input
                  value={form.video_thumb_url}
                  onChange={(e) => setField('video_thumb_url', e.target.value)}
                  placeholder="/images/..."
                />
              </label>
            </>
          )}

          <label>
            Lên lịch đăng
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => setField('scheduled_at', e.target.value)}
            />
          </label>

          {!form.scheduled_at && (
            <label>
              Trạng thái
              <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
                <option value="draft">Draft</option>
                <option value="pending_approval">Chờ duyệt</option>
              </select>
            </label>
          )}

          <div className="post-editor-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Huỷ</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={saving || !form.page_id || !form.content.trim()}
            >
              {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo bài'}
            </button>
          </div>
        </div>

        <div className="card post-editor-preview">
          <h3>Xem trước Facebook</h3>
          <FacebookPreview
            post={form}
            pageName={selectedPage?.name}
            avatarUrl={selectedPage?.avatar_url}
          />
        </div>
      </div>
    </Modal>
  );
}
