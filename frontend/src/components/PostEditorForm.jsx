import VideoUpload from './VideoUpload';
import FacebookPreview from './FacebookPreview';
import Button from './ui/Button';
import { saveImagePersistLabel, useMediaStorage } from '../hooks/useMediaStorage';

export default function PostEditorForm({
  form,
  pages,
  isEdit,
  selectedPage,
  activePrompt,
  imageUploading,
  generatingImage,
  setField,
  setActivePrompt,
  handleImageUpload,
  handleGenerateImage,
  showPreview = true,
}) {
  const { imagesOnDrive } = useMediaStorage();

  return (
    <div className="edit-post-layout post-editor">
      <div className="modal-form post-editor-form">
        <label>
          Fanpage
          <select
            value={form.page_id}
            onChange={(e) => setField('page_id', e.target.value)}
            required
          >
            <option value="">Chọn fanpage</option>
            {pages.map((page) => (
              <option key={page.id} value={String(page.id)}>{page.name}</option>
            ))}
          </select>
          {selectedPage ? (
            <span className="field-hint">Bài sẽ lưu cho: <strong>{selectedPage.name}</strong></span>
          ) : (
            <span className="field-hint field-hint--warn">Chọn fanpage trước khi lưu</span>
          )}
        </label>

        <label>
          Ghi chú / chủ đề (nội bộ)
          <input
            value={form.topic}
            onChange={(e) => setField('topic', e.target.value)}
            placeholder="VD: Khuyến mãi Tết — chỉ để tìm bài trong hệ thống"
          />
          <span className="field-hint">Không đăng lên Facebook. Trên fanpage chỉ hiện phần <strong>Nội dung</strong> bên dưới.</span>
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
          Prompt {form.media_type === 'video' ? 'video' : 'ảnh'}
          <textarea
            rows={3}
            value={activePrompt}
            onChange={(e) => setActivePrompt(e.target.value)}
            placeholder={
              form.media_type === 'video'
                ? 'Mô tả video tiếng Anh — AI đọc prompt này khi cần xuất video'
                : 'Mô tả ảnh tiếng Anh — AI đọc prompt này khi cần xuất ảnh'
            }
          />
          <span className="field-hint">
            {form.media_type === 'video'
              ? 'Lưu mô tả video để AI render sau.'
              : 'Lưu mô tả ảnh — bấm "Xuất ảnh từ prompt" để AI vẽ ngay, hoặc tick bên dưới để tự xuất khi đăng.'}
          </span>
        </label>

        {form.image_prompt?.trim() && !form.image_url && (
          <label className="checkbox-field page-skill-option">
            <input
              type="checkbox"
              checked={form.auto_generate_image}
              onChange={(e) => setField('auto_generate_image', e.target.checked)}
            />
            <span>Tự xuất ảnh AI khi đến giờ đăng (mặc định bật)</span>
          </label>
        )}

        {form.image_prompt?.trim() && (
          <label className="checkbox-field page-skill-option">
            <input
              type="checkbox"
              checked={form.save_image_local}
              onChange={(e) => setField('save_image_local', e.target.checked)}
            />
            <span>{saveImagePersistLabel(imagesOnDrive)}</span>
          </label>
        )}

        {form.media_type !== 'video' && activePrompt?.trim() && isEdit && (
          <Button
            type="button"
            variant="secondary"
            onClick={handleGenerateImage}
            disabled={generatingImage}
          >
            {generatingImage ? 'Đang xuất ảnh...' : 'Xuất ảnh từ prompt'}
          </Button>
        )}

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
              <option value="draft">Nháp</option>
              <option value="pending_approval">Chờ duyệt</option>
            </select>
          </label>
        )}
      </div>

      {showPreview && (
        <div className="post-editor-preview">
          <h4 className="modal-section-title">Xem trước Facebook</h4>
          <FacebookPreview
            post={form}
            pageName={selectedPage?.name}
            avatarUrl={selectedPage?.avatar_url}
          />
        </div>
      )}
    </div>
  );
}
