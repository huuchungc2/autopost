import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import PostImportForm from '../components/PostImportForm';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';

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
    if (result.auto_generate_image_count) parts.push(`${result.auto_generate_image_count} sẽ xuất ảnh ban khuya / khi đăng`);
    if (result.errors?.length) parts.push(`${result.errors.length} dòng lỗi import`);
    showToast(parts.join(' — '), 'success');
    navigate('/posts');
  };

  const handleError = (message) => {
    if (message) showToast(message, 'error');
  };

  return (
    <div className="page-shell post-import-page">
      <PageHeader
        back={{
          onClick: handleClose,
          label: 'Quay lại',
          ariaLabel: 'Quay lại danh sách bài viết',
        }}
        title="Import Excel"
        description="Tải file mẫu → chọn fanpage → upload để tạo bài và lên lịch."
      />

      <div className="card post-import-card">
        <PostImportForm
          pages={pages}
          initialPageId={initialPageId}
          onImported={handleImported}
          onError={handleError}
          footer={({ handleSubmit, saving, canSubmit, rowCount }) => (
            <div className="post-editor-page-footer">
              <Button type="button" variant="secondary" onClick={handleClose}>Huỷ</Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {saving ? 'Đang import...' : `Import ${rowCount} bài`}
              </Button>
            </div>
          )}
        />
      </div>
    </div>
  );
}
