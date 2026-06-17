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
    setForm((prev) => {
      if (prev.page_id) return prev;
      return { ...prev, page_id: resolveDefaultPageId() };
    });
  }, [active, post?.id, pages, initialPageId]);

  const selectedPage = pages.find((p) => String(p.id) === String(form.page_id));

  const activePrompt = form.media_type === 'video' ? form.video_prompt : form.image_prompt;

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const setActivePrompt = (value) => {
    if (form.media_type === 'video') {
      setField('video_prompt', value);
    } else {
      setField('image_prompt', value);
    }
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
      const response = await api.post(`/posts/${post.id}/generate-image`, { prompt });
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
      const payload = {
        page_id: Number(form.page_id),
        topic: form.topic,
        content: form.content,
        media_type: form.media_type,
        image_url: form.media_type === 'image' ? form.image_url || null : null,
        image_prompt: form.image_prompt?.trim() || null,
        video_prompt: form.video_prompt?.trim() || null,
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
