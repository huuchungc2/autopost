import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { authenticateExtension } from '../middleware/extensionAuth.js';
import { authenticateUser, signToken } from '../services/authService.js';
import {
  getOrCreateExtensionKey,
  getExtensionKeyInfo,
  regenerateExtensionKey,
  updateExtensionFbProfile,
  syncGroupPost,
  getExtensionSyncStatus,
  listPublishedGroupPosts,
  listGroupPostComments,
  getGroupPostsStats,
  deleteGroupPosts,
  createGroupPostDrafts,
  listGroupPostDrafts,
  pullDraftsForExtension,
  updateGroupPostDraft,
  repullGroupPostDraft,
  deleteGroupPostDraft,
} from '../services/groupPostService.js';
import {
  extensionGenerateImage,
  extensionGeneratePost,
  extensionGenerateText,
  listExtensionAiProviders,
} from '../services/groupPostAiService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

/** Extension login — trả JWT + API key */
router.post('/login', asyncHandler(async (req, res) => {
  const login = req.body.login || req.body.email || req.body.username;
  const { password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'Email/username và mật khẩu là bắt buộc' });
  }
  const user = await authenticateUser(login, password);
  if (!user) {
    return res.status(401).json({ error: 'Sai email/username hoặc mật khẩu' });
  }
  const ext = await getOrCreateExtensionKey(user.id);
  const token = signToken(user);
  res.json({
    token,
    api_key: ext.api_key,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    fb_user_id: ext.fb_user_id,
    fb_user_name: ext.fb_user_name,
  });
}));

router.get('/me', authenticateExtension, asyncHandler(async (req, res) => {
  const ext = req.extension || await getOrCreateExtensionKey(req.user.id);
  res.json({
    user: req.user,
    auth_mode: req.authMode,
    api_key: ext?.api_key,
    fb_user_id: ext?.fb_user_id,
    fb_user_name: ext?.fb_user_name,
  });
}));

router.post('/extension-key', authenticate, asyncHandler(async (req, res) => {
  const apiKey = await regenerateExtensionKey(req.user.id);
  res.json({ api_key: apiKey });
}));

/** Website: xem extension key + FB profile đã map */
router.get('/extension-key', authenticate, asyncHandler(async (req, res) => {
  let info = await getExtensionKeyInfo(req.user.id);
  if (!info) {
    await getOrCreateExtensionKey(req.user.id);
    info = await getExtensionKeyInfo(req.user.id);
  }
  res.json(info);
}));

router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  const stats = await getGroupPostsStats(req.user.id);
  res.json(stats);
}));

router.put('/fb-profile', authenticateExtension, asyncHandler(async (req, res) => {
  const { fb_user_id, fb_user_name } = req.body;
  const profile = await updateExtensionFbProfile(req.user.id, { fb_user_id, fb_user_name });
  res.json(profile);
}));

/** Extension: danh sách AI provider user được dùng (giống fanpage) */
router.get('/ai-providers', authenticateExtension, asyncHandler(async (req, res) => {
  const providers = await listExtensionAiProviders(req.user);
  res.json(providers);
}));

/** Extension: xuất ảnh qua image provider đã chọn */
router.post('/ai/image', authenticateExtension, asyncHandler(async (req, res) => {
  const prompt = String(req.body.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'Thiếu prompt' });
  const providerId = req.body.provider_id || req.body.image_provider_id;
  const result = await extensionGenerateImage(req.user, prompt, providerId);
  res.json(result);
}));

/** Extension: viết lại / comment qua text provider đã chọn */
router.post('/ai/text', authenticateExtension, asyncHandler(async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Thiếu text' });
  const out = await extensionGenerateText(req.user, {
    task: req.body.task || 'rewrite',
    text,
    mode: req.body.mode,
    provider_id: req.body.provider_id || req.body.text_provider_id,
  });
  res.json({ text: out });
}));

/** Extension: viết bài từ chủ đề + prompt skill local — giống POST /posts/generate (không lưu DB) */
router.post('/ai/generate', authenticateExtension, asyncHandler(async (req, res) => {
  const result = await extensionGeneratePost(req.user, {
    topic: req.body.topic,
    prompt: req.body.prompt,
    text_system_prompt: req.body.text_system_prompt,
    image_system_prompt: req.body.image_system_prompt,
    text_provider_id: req.body.text_provider_id || req.body.provider_id,
    image_provider_id: req.body.image_provider_id,
    media_type: req.body.media_type,
  });
  res.json(result);
}));

/** Website: danh sách bài group đã đăng */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const filters = {
    page: req.query.page,
    limit: req.query.limit,
    group_id: req.query.group_id,
    posted_by: req.query.posted_by,
    from_date: req.query.from_date,
    to_date: req.query.to_date,
    search: req.query.search,
  };
  if (req.query.user_id && ['super_admin', 'admin'].includes(req.user.role)) {
    filters.user_id = req.query.user_id;
  }
  const result = await listPublishedGroupPosts(filters);
  res.json(result);
}));

/** Website: xoá hàng loạt bài đã đăng — checkbox chọn nhiều trên trang /groups */
router.post('/bulk-delete', authenticate, asyncHandler(async (req, res) => {
  const result = await deleteGroupPosts(req.user.id, req.user.role, req.body.post_ids);
  res.json(result);
}));

/** Website: lịch sử comment trên 1 bài */
router.get('/:id/comments', authenticate, asyncHandler(async (req, res) => {
  const result = await listGroupPostComments(req.params.id);
  res.json(result);
}));

/** Website: import draft (không vào bảng posts / không chạy job fanpage) */
router.post('/drafts', authenticate, asyncHandler(async (req, res) => {
  const isShared = req.body.shared === true && ['super_admin', 'admin'].includes(req.user.role);
  const result = await createGroupPostDrafts(
    req.user.id,
    req.body.rows || req.body,
    { isShared }
  );
  res.status(201).json(result);
}));

/** Website: xem draft */
router.get('/drafts', authenticate, asyncHandler(async (req, res) => {
  const result = await listGroupPostDrafts(req.user.id, {
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
    scope: req.query.scope,
  }, req.user.role);
  res.json(result);
}));

/** Extension: client gửi last_draft_id (ID lớn nhất đang giữ) — chỉ còn lo phần draft, phần "posts"
 * (pending_posts_sync/total_posts) đã bỏ cùng nhánh /posts/pull chết, xem getExtensionSyncStatus(). */
router.post('/sync/status', authenticateExtension, asyncHandler(async (req, res) => {
  const result = await getExtensionSyncStatus(req.user.id, {
    lastDraftId: req.body?.last_draft_id,
  });
  res.json(result);
}));

router.get('/sync/status', authenticateExtension, asyncHandler(async (req, res) => {
  const result = await getExtensionSyncStatus(req.user.id, {
    lastDraftId: req.query?.last_draft_id,
  });
  res.json(result);
}));

router.post('/drafts/pull', authenticateExtension, asyncHandler(async (req, res) => {
  const result = await pullDraftsForExtension(req.user.id, {
    limit: req.body?.limit ?? req.query?.limit,
    afterDraftId: req.body?.last_draft_id ?? req.body?.after_draft_id,
  });
  res.json(result);
}));

router.get('/drafts/pull', authenticateExtension, asyncHandler(async (req, res) => {
  const result = await pullDraftsForExtension(req.user.id, {
    limit: req.query.limit,
    afterDraftId: req.query.last_draft_id ?? req.query.after_draft_id,
  });
  res.json(result);
}));

router.patch('/drafts/:id', authenticate, asyncHandler(async (req, res) => {
  const result = await updateGroupPostDraft(req.user.id, req.user.role, req.params.id, req.body);
  res.json(result);
}));

router.post('/drafts/:id/repull', authenticate, asyncHandler(async (req, res) => {
  const result = await repullGroupPostDraft(req.user.id, req.params.id);
  res.json(result);
}));

router.delete('/drafts/:id', authenticate, asyncHandler(async (req, res) => {
  const result = await deleteGroupPostDraft(req.user.id, req.user.role, req.params.id);
  res.json(result);
}));

router.post('/sync', authenticateExtension, asyncHandler(async (req, res) => {
  const result = await syncGroupPost(req.user.id, req.body);
  res.status(result.updated ? 200 : 201).json(result);
}));

// GET /pending-comments + PATCH /:id/commented (hệ JWT cũ, group_posts/group_post_comments) đã bỏ
// hẳn — thay bằng /api/user-sync/cross-posts + /api/user-sync/posts/:id/commented (license-key,
// user_posts/user_post_comments sau khi gộp bảng). Không extension nào còn gọi 2 route này (đã xác
// nhận tidienSync.js — client cũ gọi chúng — không còn được import ở đâu từ trước bản gộp).

export default router;
