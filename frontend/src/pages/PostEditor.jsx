import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import api from '../services/api';
import PostEditorForm from '../components/PostEditorForm';
import usePostEditor from '../hooks/usePostEditor';
import Skeleton from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';

export default function PostEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isEdit = Boolean(id);
  const [pages, setPages] = useState([]);
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(isEdit);

  const initialPageId = searchParams.get('page') || '';

  useEffect(() => {
    api.get('/pages').then((r) => setPages(r.data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (!isEdit) return undefined;

    let cancelled = false;
    setLoading(true);
    api.get(`/posts/${id}`)
      .then((response) => {
        if (!cancelled) setPost(response.data);
      })
      .catch((err) => {
        if (!cancelled) {
          showToast(err.response?.data?.error || 'Không tải được bài viết', 'error');
          navigate('/posts', { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, isEdit, navigate, showToast]);

  const handleClose = () => navigate('/posts');

  const handleSaved = () => {
    showToast(isEdit ? 'Đã cập nhật bài viết' : 'Đã tạo bài viết', 'success');
  };

  const handleError = (message) => {
    showToast(message, 'error');
  };

  const editor = usePostEditor({
    post: isEdit ? post : null,
    pages,
    initialPageId,
    active: !isEdit || Boolean(post),
    onSaved: handleSaved,
    onError: handleError,
    onClose: handleClose,
  });

  const title = isEdit ? 'Sửa bài viết' : 'Viết bài tay';
  const subtitle = editor.selectedPage
    ? `${isEdit ? 'Sửa bài' : 'Tạo bài'} cho fanpage: ${editor.selectedPage.name}`
    : (isEdit ? 'Chỉnh nội dung, media và lịch đăng' : 'Tạo bài thủ công không qua AI');

  if (loading) {
    return (
      <div className="page-shell post-editor-page">
        <Skeleton lines={8} />
      </div>
    );
  }

  return (
    <div className="page-shell post-editor-page">
      <div className="page-header post-editor-page-header">
        <button
          type="button"
          className="btn btn-secondary post-editor-back-btn"
          onClick={handleClose}
          aria-label="Quay lại danh sách bài viết"
        >
          <ArrowLeft size={18} />
          Quay lại
        </button>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

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

      <div className="post-editor-page-footer">
        <button type="button" className="btn btn-secondary" onClick={handleClose}>Huỷ</button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={editor.handleSubmit}
          disabled={editor.saving || !editor.canSave}
        >
          {editor.saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo bài'}
        </button>
      </div>
    </div>
  );
}
