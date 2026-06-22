import { useState } from 'react';
import { Copy, Sparkles } from 'lucide-react';
import Button from './ui/Button';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function PostImagePromptActions({
  post,
  onGenerated,
  compact = false,
  showGenerate = true,
}) {
  const { showToast } = useToast();
  const [generating, setGenerating] = useState(false);
  const prompt = String(post?.image_prompt || '').trim();

  if (!prompt) return null;

  const needsImage = !post.image_url;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      showToast('Đã copy prompt ảnh', 'success');
    } catch {
      showToast('Không copy được — chọn và copy thủ công', 'error');
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.post(`/posts/${post.id}/generate-image`);
      showToast('Đã xuất ảnh từ prompt', 'success');
      onGenerated?.();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Xuất ảnh từ prompt thất bại';
      showToast(msg, 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={`post-prompt-actions${compact ? ' post-prompt-actions--compact' : ''}`}>
      {!compact && needsImage && (
        <p className="post-prompt-hint">Có prompt ảnh, chưa render — copy để vẽ tay hoặc dùng AI.</p>
      )}
      <div className="post-prompt-actions-row">
        <Button type="button" variant="secondary" size="sm" onClick={copyPrompt} title={prompt}>
          <Copy size={14} />
          Copy prompt
        </Button>
        {showGenerate && needsImage && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleGenerate}
            disabled={generating}
          >
            <Sparkles size={14} />
            {generating ? 'Đang xuất...' : 'AI xuất ảnh'}
          </Button>
        )}
      </div>
    </div>
  );
}
