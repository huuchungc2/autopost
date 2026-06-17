import Modal from './ui/Modal';
import PostEditorForm from './PostEditorForm';
import usePostEditor from '../hooks/usePostEditor';

export default function PostEditorModal({ open, post, pages, initialPageId, onClose, onSaved, onError }) {
  const editor = usePostEditor({
    post,
    pages,
    initialPageId,
    active: open,
    onSaved,
    onError,
    onClose,
  });

  const { isEdit, selectedPage, saving, canSave, handleSubmit } = editor;

  return (
    <Modal
      open={open}
      title={isEdit ? 'Sửa bài viết' : 'Viết bài tay'}
      subtitle={
        selectedPage
          ? `${isEdit ? 'Sửa bài' : 'Tạo bài'} cho fanpage: ${selectedPage.name}`
          : (isEdit ? 'Chỉnh nội dung, media và lịch đăng' : 'Tạo bài thủ công không qua AI')
      }
      onClose={onClose}
      wide
      size="xl"
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Huỷ</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={saving || !canSave}
          >
            {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo bài'}
          </button>
        </>
      )}
    >
      <PostEditorForm
        form={editor.form}
        pages={pages}
        isEdit={editor.isEdit}
        selectedPage={editor.selectedPage}
        activePrompt={editor.activePrompt}
        imageUploading={editor.imageUploading}
        generatingImage={editor.generatingImage}
        setField={editor.setField}
        setActivePrompt={editor.setActivePrompt}
        handleImageUpload={editor.handleImageUpload}
        handleGenerateImage={editor.handleGenerateImage}
      />
    </Modal>
  );
}
