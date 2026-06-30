import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { mediaSrc } from '../utils/mediaUrl';
import Skeleton from '../components/ui/Skeleton';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';

function parseSeoMeta(post) {
  try {
    return typeof post.seo_meta === 'string' ? JSON.parse(post.seo_meta) : (post.seo_meta || {});
  } catch {
    return {};
  }
}

export default function WebsiteBlogPostEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);

  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [primaryKeyword, setPrimaryKeyword] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');

  const loadPost = () => {
    setLoading(true);
    api.get(`/posts/${id}`)
      .then((response) => {
        const data = response.data;
        setPost(data);
        setContent(data.content || '');
        const seoMeta = parseSeoMeta(data);
        setTitle(seoMeta.title || '');
        setSlug(seoMeta.slug || '');
        setMetaDescription(seoMeta.meta_description || '');
        setPrimaryKeyword(seoMeta.primary_keyword || '');
        setImagePrompt(data.image_prompt || '');
      })
      .catch((err) => {
        showToast(err.response?.data?.error || 'Không tải được bài viết', 'error');
        navigate('/website-posts', { replace: true });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPost(); }, [id]);

  const handleSave = async () => {
    if (!content.trim()) {
      showToast('Nội dung không được để trống', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/posts/${id}`, {
        content,
        status: post.status,
        seo_meta: {
          title,
          slug,
          meta_description: metaDescription,
          primary_keyword: primaryKeyword,
        },
      });
      showToast('Đã lưu bài', 'success');
      loadPost();
    } catch (err) {
      showToast(err.response?.data?.error || 'Lưu thất bại', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) {
      showToast('Nhập mô tả ảnh trước', 'error');
      return;
    }
    setGeneratingImage(true);
    try {
      const response = await api.post(`/posts/${id}/generate-website-image`, { prompt: imagePrompt });
      showToast(response.data.message || 'Đã generate ảnh', 'success');
      loadPost();
    } catch (err) {
      showToast(err.response?.data?.error || 'Generate ảnh thất bại', 'error');
    } finally {
      setGeneratingImage(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const response = await api.post(`/posts/${id}/publish-website`);
      showToast('Đã publish lên website', 'success');
      setPost((prev) => ({ ...prev, website_post_url: response.data.website_post_url, website_post_id: response.data.website_post_id }));
    } catch (err) {
      showToast(err.response?.data?.error || 'Publish lên website thất bại', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Xoá bài blog này?')) return;
    try {
      await api.delete(`/posts/${id}`);
      showToast('Đã xoá bài', 'success');
      navigate('/website-posts');
    } catch (err) {
      showToast(err.response?.data?.error || 'Không xoá được', 'error');
    }
  };

  if (loading) {
    return (
      <div className="page-shell post-editor-page">
        <Skeleton lines={10} />
      </div>
    );
  }

  return (
    <div className="page-shell post-editor-page">
      <PageHeader
        back={{
          onClick: () => navigate('/website-posts'),
          label: 'Quay lại',
          ariaLabel: 'Quay lại danh sách bài Website Blog',
        }}
        title="Sửa bài Website Blog"
        description={post?.website_name ? `Website: ${post.website_name}` : ''}
      />

      <div className="card form-card modal-form">
        <div className="modal-form-grid">
          <label>
            Tiêu đề
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Slug
            <input value={slug} onChange={(e) => setSlug(e.target.value)} />
          </label>
          <label className="field-span-2">
            Meta description
            <textarea rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
          </label>
          <label>
            Từ khoá chính
            <input value={primaryKeyword} onChange={(e) => setPrimaryKeyword(e.target.value)} />
          </label>

          <label className="field-span-2">
            Nội dung
            <textarea rows={16} value={content} onChange={(e) => setContent(e.target.value)} />
          </label>

          <div className="page-form-section field-span-2">
            <h2 className="page-form-section-title">Ảnh đại diện</h2>
            {post?.image_url ? (
              <img
                src={mediaSrc(post.image_url)}
                alt=""
                style={{ maxWidth: 240, borderRadius: 8, marginBottom: 12, display: 'block' }}
              />
            ) : (
              <p className="field-hint">Chưa có ảnh.</p>
            )}
            <label>
              Prompt ảnh (tiếng Anh)
              <input value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="A photo of..." />
            </label>
            <Button type="button" variant="secondary" onClick={handleGenerateImage} disabled={generatingImage} style={{ marginTop: 8 }}>
              {generatingImage ? 'Đang generate...' : post?.image_url ? 'Generate lại ảnh' : 'Generate ảnh'}
            </Button>
          </div>

          <div className="page-form-section field-span-2">
            <h2 className="page-form-section-title">Publish</h2>
            {post?.website_post_url ? (
              <p className="field-hint">
                Đã publish: <a href={post.website_post_url} target="_blank" rel="noreferrer">{post.website_post_url}</a>
              </p>
            ) : (
              <Button type="button" variant="secondary" onClick={handlePublish} disabled={publishing}>
                {publishing ? 'Đang publish...' : 'Publish lên website'}
              </Button>
            )}
          </div>
        </div>

        <div className="post-editor-page-footer">
          <Button type="button" variant="destructive" onClick={handleDelete}>Xoá bài</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/website-posts')}>Huỷ</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </div>
      </div>
    </div>
  );
}
