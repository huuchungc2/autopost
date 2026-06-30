import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import WebsiteImportForm from '../components/WebsiteImportForm';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';

export default function WebsiteImport() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [websites, setWebsites] = useState([]);

  const initialWebsiteId = searchParams.get('website') || '';

  useEffect(() => {
    api.get('/websites').then((r) => setWebsites(r.data.filter((w) => w.is_active))).catch(console.error);
  }, []);

  const handleClose = () => navigate('/generate');

  const handleImported = (result) => {
    const parts = [`Đã import ${result.created_count} bài nháp`];
    if (result.auto_generate_image_count) parts.push(`${result.auto_generate_image_count} sẽ tự generate ảnh trong vài phút`);
    if (result.errors?.length) parts.push(`${result.errors.length} dòng lỗi import`);
    showToast(parts.join(' — '), 'success');
    navigate('/website-posts');
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
          ariaLabel: 'Quay lại Tạo bài',
        }}
        title="Import Excel — Website Blog"
        description="Tải file mẫu → chọn website → upload để tạo nhiều bài blog nháp cùng lúc."
      />

      <div className="card post-import-card">
        <WebsiteImportForm
          websites={websites}
          initialWebsiteId={initialWebsiteId}
          onImported={handleImported}
          onError={handleError}
          footer={({ handleSubmit, saving, canSubmit, rowCount }) => (
            <div className="post-editor-page-footer">
              <Button type="button" variant="secondary" onClick={handleClose}>Huỷ</Button>
              <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
                {saving ? 'Đang import...' : `Import ${rowCount} bài`}
              </Button>
            </div>
          )}
        />
      </div>
    </div>
  );
}
