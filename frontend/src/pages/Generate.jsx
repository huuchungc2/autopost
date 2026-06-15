import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { fromDatetimeLocalInput } from '../utils/date';
import api from '../services/api';
import VideoUpload from '../components/VideoUpload';
import FacebookPreview from '../components/FacebookPreview';
import { useToast } from '../context/ToastContext';

export default function Generate() {
  const navigate = useNavigate();
  const [pages, setPages] = useState([]);
  const [tab, setTab] = useState('text');
  const [pageId, setPageId] = useState('');
  const [topic, setTopic] = useState('');
  const [caption, setCaption] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    api.get('/pages').then((response) => {
      setPages(response.data);
      if (response.data.length) setPageId(String(response.data[0].id));
    }).catch(console.error);
  }, []);

  const selectedPage = pages.find((p) => String(p.id) === String(pageId));

  const skillReady = selectedPage?.skill_id && selectedPage?.skill_name;
  const hasTextProvider = !!selectedPage?.text_provider_id;

  const handleGenerateText = async () => {
    setIsLoading(true);
    try {
      const response = await api.post('/posts/generate', {
        page_id: Number(pageId),
        topic,
        scheduled_at: fromDatetimeLocalInput(scheduledAt),
      });
      setPreview(response.data);
      showToast(`Generated post #${response.data.id}`, 'success');
      setTopic('');
      setScheduledAt('');
    } catch (error) {
      showToast(error.response?.data?.error || 'Generate failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!videoUrl) {
      showToast('Upload a video first', 'error');
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.post('/posts/generate-video', {
        page_id: Number(pageId),
        caption,
        video_url: videoUrl,
        scheduled_at: fromDatetimeLocalInput(scheduledAt),
      });
      setPreview({ ...response.data, content: caption, media_type: 'video', video_url: videoUrl });
      showToast(`Video post #${response.data.id} created`, 'success');
      setCaption('');
      setVideoUrl('');
      setScheduledAt('');
    } catch (error) {
      showToast(error.response?.data?.error || 'Video post failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1>Generate Post</h1>
          <p>Tạo bài bằng AI, upload video, hoặc viết tay.</p>
        </div>
      </div>

      <div className="tabs">
        <button type="button" className={tab === 'text' ? 'tab active' : 'tab'} onClick={() => setTab('text')}>AI Text + Image</button>
        <button type="button" className={tab === 'video' ? 'tab active' : 'tab'} onClick={() => setTab('video')}>Video</button>
        <button type="button" className={tab === 'manual' ? 'tab active' : 'tab'} onClick={() => setTab('manual')}>Viết tay</button>
      </div>

      {tab === 'manual' ? (
        <div className="card manual-post-cta">
          <h3>Viết bài thủ công</h3>
          <p>Tự nhập nội dung, chọn ảnh/video, lên lịch hoặc lưu draft — không qua AI.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/posts?action=create')}>
            Mở trình viết bài
          </button>
        </div>
      ) : (
      <div className="generate-layout">
        <div className="card form-card">
          <label>
            Fanpage
            <select value={pageId} onChange={(e) => setPageId(e.target.value)}>
              {pages.map((page) => (
                <option key={page.id} value={page.id}>{page.name}</option>
              ))}
            </select>
          </label>

          {tab === 'text' && selectedPage && (
            <div className={`skill-config-panel${skillReady ? '' : ' skill-config-panel--warn'}`}>
              <div className="skill-config-row">
                <span className="skill-config-label">Skill AI</span>
                <span className="skill-config-value">
                  {skillReady ? selectedPage.skill_name : 'Chưa gắn — vào Pages chọn Skill'}
                </span>
              </div>
              {skillReady && selectedPage.skill_prompt_preview && (
                <p className="skill-config-preview">{selectedPage.skill_prompt_preview}{selectedPage.skill_prompt_length > 200 ? '…' : ''}</p>
              )}
              {!hasTextProvider && (
                <p className="skill-config-warn">Chưa gắn Text provider — AI có thể chỉ trả nội dung mẫu.</p>
              )}
              {!skillReady && (
                <Link to="/pages" className="btn-link">Gắn skill tại Pages →</Link>
              )}
            </div>
          )}

          {tab === 'text' ? (
            <>
              <label>Topic<input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Enter topic" /></label>
              <label>Scheduled<input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></label>
              <button type="button" className="btn btn-primary" onClick={handleGenerateText} disabled={isLoading || !topic || !pageId}>
                {isLoading ? 'Generating...' : 'Generate'}
              </button>
            </>
          ) : (
            <>
              <label>Caption<textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Video caption" /></label>
              <VideoUpload onUploaded={({ video_url }) => setVideoUrl(video_url)} />
              {videoUrl && <div className="form-success">Uploaded: {videoUrl}</div>}
              <label>Scheduled<input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></label>
              <button type="button" className="btn btn-primary" onClick={handleGenerateVideo} disabled={isLoading || !pageId}>
                {isLoading ? 'Saving...' : 'Create video post'}
              </button>
            </>
          )}
        </div>

        <div className="card">
          <h3>Preview</h3>
          <FacebookPreview
            post={preview || { content: tab === 'video' ? caption : `Topic: ${topic}`, media_type: tab, video_url: videoUrl, image_url: preview?.image_url }}
            pageName={selectedPage?.name}
            avatarUrl={selectedPage?.avatar_url}
          />
        </div>
      </div>
      )}
    </div>
  );
}
