import { useEffect, useState } from 'react';
import api from '../services/api';
import { fromDatetimeLocalInput, toDatetimeLocalInput } from '../utils/date';

const emptyForm = {
  page_id: '',
  topic: '',
  content: '',
  media_type: 'none',
  image_url: '',
  image_prompt: '',
  auto_generate_image: true,
  save_image_local: true,
  video_prompt: '',
  video_url: '',
  video_thumb_url: '',
  scheduled_at: '',
  status: 'draft',
};

export default function usePostEditor({ post, pages, initialPageId, active, onSaved, onError, onClose }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const isEdit = Boolean(post?.id);

  const resolveDefaultPageId = () => {
    if (initialPageId && pages.some((p) => String(p.id) === String(initialPageId))) {
      return String(initialPageId);
    }
    return '';
  };

  useEffect(() => {
    if (!active) return;

    if (post?.id) {
      setForm({
        page_id: String(post.page_id || ''),
        topic: post.topic || '',
        content: post.content || '',
        media_type: post.media_type || 'none',
        image_url: post.image_url || '',
        image_prompt: post.image_prompt || '',
        auto_generate_image: Boolean(post.image_prompt?.trim()) && !post.image_url
          ? (post.auto_generate_image === 0 || post.auto_generate_image === false ? false : true)
          : false,
        save_image_local: Boolean(post.image_prompt?.trim())
          ? post.save_image_local !== 0 && post.save_image_local !== false
          : true,
        video_prompt: post.video_prompt || '',
        video_url: post.video_url || '',
        video_thumb_url: post.video_thumb_url || '',
        scheduled_at: toDatetimeLocalInput(post.scheduled_at),
        status: post.status || 'draft',
      });
      return;
    }

    setForm({
      ...emptyForm,
      page_id: resolveDefaultPageId(),
    });
  }, [active, post?.id]);

  useEffect(() => {
    if (!active || post?.id || !pages.length) return;
    const defaultPageId = resolveDefaultPageId();
    if (!defaultPageId) return;
    setForm((prev) => (
      prev.page_id === defaultPageId ? prev : { ...prev, page_id: defaultPageId }
    ));
  }, [active, post?.id, pages, initialPageId]);

  const selectedPage = pages.find((p) => String(p.id) === String(form.page_id));

  const activePrompt = form.media_type === 'video' ? form.video_prompt : form.image_prompt;

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const setActivePrompt = (value) => {
    if (form.media_type === 'video') {
      setField('video_prompt', value);
      return;
    }
    setForm((prev) => {
      const trimmed = String(value || '').trim();
      return {
        ...prev,
        image_prompt: value,
        media_type: trimmed ? 'image' : prev.media_type === 'image' && !prev.image_url ? 'none' : prev.media_type,
        auto_generate_image: trimmed && !prev.image_url ? true : prev.auto_generate_image,
        save_image_local: trimmed ? true : prev.save_image_local,
      };
    });
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: form.page_id ? { page_id: form.page_id } : {},
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

  const handleGenerateImage = async () => {
    const prompt = String(activePrompt || '').trim();
    if (!prompt) {
      onError?.('Nhập prompt trước khi xuất ảnh');
      return;
    }
    if (!isEdit) {
      onError?.('Lưu bài trước, sau đó xuất ảnh từ prompt');
      return;
    }
    setGeneratingImage(true);
    try {
      const response = await api.post(`/posts/${post.id}/generate-image`, {
        prompt,
        save_image_local: form.save_image_local,
      });
      setForm((prev) => ({
        ...prev,
        media_type: 'image',
        image_url: response.data.image_url,
        image_prompt: response.data.image_prompt || prompt,
      }));
    } catch (err) {
      onError?.(err.response?.data?.error || 'Xuất ảnh từ prompt thất bại');
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.page_id || !form.content.trim()) return;
    setSaving(true);
    try {
      const hasImagePrompt = Boolean(form.image_prompt?.trim());
      const resolvedMediaType = form.media_type === 'video'
        ? 'video'
        : hasImagePrompt || form.image_url || form.media_type === 'image'
          ? 'image'
          : 'none';

      const resolveStatus = () => {
        if (form.scheduled_at) return 'scheduled';
        if (['published', 'failed'].includes(form.status)) return form.status;
        return form.status || 'draft';
      };

      const payload = {
        page_id: Number(form.page_id),
        topic: form.topic,
        content: form.content,
        media_type: resolvedMediaType,
        image_url: resolvedMediaType === 'image' ? form.image_url || null : null,
        image_prompt: form.image_prompt?.trim() || null,
        auto_generate_image: hasImagePrompt && !form.image_url
          ? Boolean(form.auto_generate_image)
          : false,
        save_image_local: hasImagePrompt
          ? Boolean(form.save_image_local)
          : true,
        video_prompt: form.video_prompt?.trim() || null,
        video_url: form.media_type === 'video' ? form.video_url || null : null,
        video_thumb_url: form.media_type === 'video' ? form.video_thumb_url || null : null,
        scheduled_at: fromDatetimeLocalInput(form.scheduled_at),
        status: resolveStatus(),
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

  const canSave = Boolean(form.page_id && form.content.trim());

  return {
    form,
    isEdit,
    selectedPage,
    activePrompt,
    saving,
    imageUploading,
    generatingImage,
    canSave,
    setField,
    setActivePrompt,
    handleImageUpload,
    handleGenerateImage,
    handleSubmit,
  };
}
