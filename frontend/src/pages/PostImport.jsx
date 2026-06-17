import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import api from '../services/api';
import PostImportForm from '../components/PostImportForm';
import { useToast } from '../context/ToastContext';

export default function PostImport() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [pages, setPages] = useState([]);

  const initialPageId = searchParams.get('page') || '';

  useEffect(() => {
    api.get('/pages').then((r) => setPages(r.data)).catch(console.error);
  }, []);

  const handleClose = () => navigate('/posts');

  const handleImported = (result) => {
    const parts = [`Đã import ${result.created_count} bài`];
    if (result.scheduled_count) parts.push(`${result.scheduled_count} đã lên lịch`);
    if (result.auto_generate_image_count) parts.push(`${result.auto_generate_image_count} sẽ tự xuất ảnh khi đăng`);
    if (result.errors?.length) parts.push(`${result.errors.length} dòng lỗi import`);
    showToast(parts.join(' — '), 'success');
    navigate('/posts');
  };

  const handleError = (message) => {
    if (message) showToast(message, 'error');
  };

  return (
    <div className="page-shell post-import-page">
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
          <h1>Import Excel</h1>
          <p>Tải file mẫu → chọn fanpage → upload để tạo bài và lên lịch.</p>
        </div>
      </div>

      <div className="card post-import-card">
        <PostImportForm
          pages={pages}
          initialPageId={initialPageId}
          onImported={handleImported}
          onError={handleError}
          footer={({ handleSubmit, saving, canSubmit, rowCount }) => (
            <div className="post-editor-page-footer">
              <button type="button" className="btn btn-secondary" onClick={handleClose}>Huỷ</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {saving ? 'Đang import...' : `Import ${rowCount} bài`}
              </button>
            </div>
          )}
        />
      </div>
    </div>
  );
}
