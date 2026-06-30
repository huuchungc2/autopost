import { useEffect, useState } from 'react';

import { useNavigate, Link } from 'react-router-dom';

import { fromDatetimeLocalInput } from '../utils/date';

import api from '../services/api';

import VideoUpload from '../components/VideoUpload';

import FacebookPreview from '../components/FacebookPreview';

import { useToast } from '../context/ToastContext';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';



export default function Generate() {

  const navigate = useNavigate();

  const [pages, setPages] = useState([]);

  const [websites, setWebsites] = useState([]);

  const [tab, setTab] = useState('text');

  const [pageId, setPageId] = useState('');

  const [websiteId, setWebsiteId] = useState('');

  const [skillId, setSkillId] = useState('');

  const [mediaType, setMediaType] = useState('image');

  const [topic, setTopic] = useState('');

  const [caption, setCaption] = useState('');

  const [scheduledAt, setScheduledAt] = useState('');

  const [videoUrl, setVideoUrl] = useState('');

  const [preview, setPreview] = useState(null);

  const [researchBrief, setResearchBrief] = useState('');

  const [blogResult, setBlogResult] = useState(null);

  const [isPublishingWebsite, setIsPublishingWebsite] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  const { showToast } = useToast();



  useEffect(() => {

    api.get('/pages').then((response) => {

      setPages(response.data);

    }).catch(console.error);

    api.get('/websites').then((response) => {

      setWebsites(response.data.filter((w) => w.is_active));

    }).catch(console.error);

  }, []);



  const selectedPage = pages.find((p) => String(p.id) === String(pageId));

  const pageSkills = selectedPage?.skills || [];

  const textSkills = selectedPage?.text_skills?.length

    ? selectedPage.text_skills

    : pageSkills.filter((s) => !s.skill_type || s.skill_type === 'text');

  const imageSkills = selectedPage?.image_skills?.length

    ? selectedPage.image_skills

    : pageSkills.filter((s) => s.skill_type === 'image');

  const videoSkills = selectedPage?.video_skills?.length

    ? selectedPage.video_skills

    : pageSkills.filter((s) => s.skill_type === 'video');



  useEffect(() => {

    if (!pageId) {

      setSkillId('');

      return;

    }

    if (textSkills.length === 1) {

      setSkillId(String(textSkills[0].id));

    } else if (textSkills.length > 1) {

      setSkillId((prev) => (

        textSkills.some((s) => String(s.id) === String(prev)) ? prev : String(textSkills[0].id)

      ));

    } else {

      setSkillId('');

    }



    if (imageSkills.length && !videoSkills.length) setMediaType('image');

    else if (videoSkills.length && !imageSkills.length) setMediaType('video');

    else if (imageSkills.length) setMediaType('image');

  }, [pageId, textSkills.length, imageSkills.length, videoSkills.length]);



  const skillReady = textSkills.length > 0 || imageSkills.length > 0 || videoSkills.length > 0;

  const hasTextProvider = !!selectedPage?.text_provider_id;

  const activeSkill = textSkills.find((s) => String(s.id) === String(skillId));

  const canPickMedia = imageSkills.length > 0 && videoSkills.length > 0;



  const handleGenerateText = async () => {

    if (!pageId) {

      showToast('Chọn fanpage', 'error');

      return;

    }

    if (!skillReady) {

      showToast('Fanpage chưa gắn skill — vào Fanpage chọn skill', 'error');

      return;

    }

    setIsLoading(true);

    try {

      const payload = {

        page_id: Number(pageId),

        topic,

        scheduled_at: fromDatetimeLocalInput(scheduledAt),

        media_type: mediaType,

      };

      if (textSkills.length > 1 && skillId) {

        payload.skill_id = Number(skillId);

      } else if (textSkills.length === 1) {

        payload.skill_id = textSkills[0].id;

      }



      const response = await api.post('/posts/generate', payload);

      setPreview(response.data);

      const queuedImage = response.data.auto_generate_image && !response.data.image_url;
      showToast(
        queuedImage
          ? `Đã tạo bài #${response.data.id} — ảnh sẽ xuất theo lịch ban đêm`
          : `Đã tạo bài #${response.data.id}`,
        'success'
      );

      setTopic('');

      setScheduledAt('');

    } catch (error) {

      showToast(error.response?.data?.error || 'Tạo bài thất bại', 'error');

    } finally {

      setIsLoading(false);

    }

  };



  const handleGenerateWebsiteBlog = async () => {
    if (!websiteId) {
      showToast('Chọn website', 'error');
      return;
    }
    if (!topic) {
      showToast('Nhập chủ đề bài blog', 'error');
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.post('/posts/generate-website-blog', {
        website_id: Number(websiteId),
        topic,
        research_brief: researchBrief,
      });
      setBlogResult(response.data);
      showToast(`Đã tạo bài blog #${response.data.id} (nháp)`, 'success');
      setTopic('');
      setResearchBrief('');
    } catch (error) {
      showToast(error.response?.data?.error || 'Tạo bài blog thất bại', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublishWebsite = async () => {
    if (!blogResult?.id) return;
    setIsPublishingWebsite(true);
    try {
      const response = await api.post(`/posts/${blogResult.id}/publish-website`);
      setBlogResult((prev) => ({ ...prev, website_post_url: response.data.website_post_url, website_post_id: response.data.website_post_id }));
      showToast('Đã publish lên website', 'success');
    } catch (error) {
      showToast(error.response?.data?.error || 'Publish lên website thất bại', 'error');
    } finally {
      setIsPublishingWebsite(false);
    }
  };

  const handleGenerateVideo = async () => {

    if (!pageId) {

      showToast('Chọn fanpage', 'error');

      return;

    }

    if (!videoUrl) {

      showToast('Hãy upload video trước', 'error');

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

      showToast(`Đã tạo bài video #${response.data.id}`, 'success');

      setCaption('');

      setVideoUrl('');

      setScheduledAt('');

    } catch (error) {

      showToast(error.response?.data?.error || 'Tạo bài video thất bại', 'error');

    } finally {

      setIsLoading(false);

    }

  };



  return (

    <div className="page-shell">

      <PageHeader
        title="Tạo bài"
        description="AI: 1 lần gọi → nội dung + prompt ảnh/video theo skill fanpage."
      />



      <div className="tabs">

        <button type="button" className={tab === 'text' ? 'tab active' : 'tab'} onClick={() => setTab('text')}>AI văn bản + media</button>

        <button type="button" className={tab === 'video' ? 'tab active' : 'tab'} onClick={() => setTab('video')}>Video upload</button>

        <button type="button" className={tab === 'website' ? 'tab active' : 'tab'} onClick={() => setTab('website')}>Website Blog</button>

        <button type="button" className={tab === 'manual' ? 'tab active' : 'tab'} onClick={() => setTab('manual')}>Viết tay</button>

      </div>



      {tab === 'manual' ? (

        <div className="card manual-post-cta">

          <h3>Viết bài thủ công</h3>

          <p>Tự nhập nội dung, chọn ảnh/video, lên lịch hoặc lưu nháp — không qua AI.</p>

          <Button type="button" onClick={() => navigate('/posts/new')}>

            Mở trình viết bài

          </Button>

        </div>

      ) : (

      <div className="generate-layout">

        <div className="card form-card">

          {tab === 'website' ? (

            <label>

              Website

              <select value={websiteId} onChange={(e) => setWebsiteId(e.target.value)}>

                <option value="">— Chọn website —</option>

                {websites.map((website) => (

                  <option key={website.id} value={website.id}>{website.name}</option>

                ))}

              </select>

              {!websites.length && (

                <span className="field-hint field-hint--warn">Chưa có website nào — <Link to="/websites">tạo trước</Link></span>

              )}

            </label>

          ) : (

            <label>

              Fanpage

              <select value={pageId} onChange={(e) => setPageId(e.target.value)}>

                <option value="">— Chọn fanpage —</option>

                {pages.map((page) => (

                  <option key={page.id} value={page.id}>{page.name}</option>

                ))}

              </select>

              {selectedPage && (

                <span className="field-hint">Bài sẽ lưu cho: <strong>{selectedPage.name}</strong></span>

              )}

            </label>

          )}



          {tab === 'text' && selectedPage && (

            <div className={`skill-config-panel${skillReady ? '' : ' skill-config-panel--warn'}`}>

              <div className="skill-config-row">

                <span className="skill-config-label">Skill fanpage</span>

                <span className="skill-config-value">

                  {textSkills.length ? `${textSkills.length} viết bài` : 'mặc định'}

                  {imageSkills.length ? ` · ${imageSkills.length} ảnh` : ''}

                  {videoSkills.length ? ` · ${videoSkills.length} video` : ''}

                </span>

              </div>



              {textSkills.length > 1 && (

                <label>

                  Skill viết bài (lần này)

                  <select value={skillId} onChange={(e) => setSkillId(e.target.value)}>

                    {textSkills.map((skill) => (

                      <option key={skill.id} value={skill.id}>{skill.name}</option>

                    ))}

                  </select>

                </label>

              )}



              {canPickMedia && (

                <label>

                  Loại media AI tạo

                  <select value={mediaType} onChange={(e) => setMediaType(e.target.value)}>

                    <option value="image">Ảnh (image_prompt + DALL-E)</option>

                    <option value="video">Video (chỉ video_prompt — chưa render file)</option>

                  </select>

                </label>

              )}



              {!canPickMedia && mediaType === 'video' && videoSkills.length > 0 && (

                <p className="skill-config-hint">Chế độ video: AI sinh nội dung + video_prompt (upload video sau).</p>

              )}



              {activeSkill?.prompt_preview && (

                <p className="skill-config-preview">{activeSkill.prompt_preview}{activeSkill.prompt_length > 200 ? '…' : ''}</p>

              )}



              {!hasTextProvider && (

                <p className="skill-config-warn">Chưa gắn Text provider — AI có thể chỉ trả nội dung mẫu.</p>

              )}

              {!skillReady && (

                <Link to="/pages" className="btn-link">Gắn skill tại Fanpage →</Link>

              )}

            </div>

          )}



          {tab === 'text' && (

            <>

              <label>

                Chủ đề cho AI

                <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="VD: Lợi ích đặt xe về quê dịp Tết" />

                <span className="field-hint">AI viết bài + prompt {mediaType === 'video' ? 'video' : 'ảnh'} khớp chủ đề.</span>

              </label>

              <label>Lên lịch<input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></label>

              <Button type="button" onClick={handleGenerateText} disabled={isLoading || !topic || !pageId || !skillReady}>

                {isLoading ? 'Đang tạo...' : 'Tạo bài AI'}

              </Button>

            </>

          )}

          {tab === 'video' && (

            <>

              <label>Chú thích video<textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Nội dung mô tả video" /></label>

              <VideoUpload onUploaded={({ video_url }) => setVideoUrl(video_url)} />

              {videoUrl && <div className="form-success">Đã upload: {videoUrl}</div>}

              <label>Lên lịch<input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></label>

              <Button type="button" onClick={handleGenerateVideo} disabled={isLoading || !pageId}>

                {isLoading ? 'Đang lưu...' : 'Tạo bài video'}

              </Button>

            </>

          )}

          {tab === 'website' && (

            <>

              <p className="field-hint">Bài blog SEO cho website — độc lập với Fanpage Facebook. Lưu nháp, không tự đăng FB.</p>

              <label>

                Chủ đề bài blog

                <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="VD: Kinh nghiệm chọn xe khách Sài Gòn - Tánh Linh" />

              </label>

              <label>

                Research brief (tuỳ chọn)

                <textarea rows={4} value={researchBrief} onChange={(e) => setResearchBrief(e.target.value)} placeholder="Từ khoá, đối thủ, khoảng trống nội dung..." />

              </label>

              <Button type="button" onClick={handleGenerateWebsiteBlog} disabled={isLoading || !topic || !websiteId}>

                {isLoading ? 'Đang tạo...' : 'Tạo bài blog'}

              </Button>

              <p className="field-hint" style={{ marginTop: 16 }}>
                Có sẵn nội dung viết tay/AI ngoài (vd ChatGPT)? <Link to={websiteId ? `/posts/import-website-blog?website=${websiteId}` : '/posts/import-website-blog'}>Import Excel hàng loạt →</Link>
              </p>

            </>

          )}

        </div>



        {tab === 'website' ? (

          <div className="card">

            <h3>Kết quả bài blog</h3>

            {blogResult ? (

              <div className="blog-result">

                <p><strong>Tiêu đề:</strong> {blogResult.seo_meta?.title || '(trống)'}</p>

                <p><strong>Slug:</strong> {blogResult.seo_meta?.slug}</p>

                <p><strong>Meta description:</strong> {blogResult.seo_meta?.meta_description}</p>

                <p><strong>Từ khoá chính:</strong> {blogResult.seo_meta?.primary_keyword}</p>

                {blogResult.image_url && <p><strong>Ảnh đã tạo:</strong> {blogResult.image_url}</p>}

                {blogResult.seo_meta?.image_prompts?.length > 1 && (

                  <div>

                    <strong>Ảnh còn lại cần tạo tay (prompt):</strong>

                    <ul>{blogResult.seo_meta.image_prompts.slice(1).map((p, i) => <li key={i}>{p}</li>)}</ul>

                  </div>

                )}

                {blogResult.missing_project_fields?.length > 0 && (

                  <p className="field-hint field-hint--warn">

                    TODO — thiếu dữ liệu thật: {blogResult.missing_project_fields.join(', ')}. Vào nội dung bài kiểm tra các đoạn [CẦN BỔ SUNG: ...] và điền tay.

                  </p>

                )}

                {blogResult.parse_failed && (

                  <p className="field-hint field-hint--warn">AI không trả đúng format mong đợi — nội dung dưới đây là raw, cần kiểm tra/sửa tay.</p>

                )}

                <textarea rows={14} readOnly value={blogResult.content} />

                {blogResult.website_post_url ? (
                  <p className="field-hint">
                    Đã publish: <a href={blogResult.website_post_url} target="_blank" rel="noreferrer">{blogResult.website_post_url}</a>
                  </p>
                ) : (
                  <Button type="button" variant="secondary" onClick={handlePublishWebsite} disabled={isPublishingWebsite}>
                    {isPublishingWebsite ? 'Đang publish...' : 'Publish lên website'}
                  </Button>
                )}

                <Link to={`/website-posts/${blogResult.id}/edit`} className="btn-link">Mở bài trong trình sửa →</Link>

              </div>

            ) : (

              <p className="field-hint">Chưa có bài blog nào được tạo trong phiên này.</p>

            )}

          </div>

        ) : (

        <div className="card">

          <h3>Xem trước</h3>

          <FacebookPreview

            post={preview || { content: tab === 'video' ? caption : `Chủ đề: ${topic}`, media_type: tab, video_url: videoUrl, image_url: preview?.image_url }}

            pageName={selectedPage?.name}

            avatarUrl={selectedPage?.avatar_url}

          />

        </div>

        )}

      </div>

      )}

    </div>

  );

}


