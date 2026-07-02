/* global GF, XLSX */

const state = {
  posts: [],
  groups: [],
  customGroupSets: [],
  assignPostIds: new Set(),
  assignGroupIds: new Set(),
  editingQueuePostId: null,
  editingMediaSnapshot: null,
  groupsSubTab: 'fb',
  groupsSyncing: false,
  groupsDeepSyncing: false,
  radarGroupIds: new Set(),
  comments: [],
  commentDrafts: {},
  profiles: null,
  activeActorId: null,
  manualMediaList: [],
  inlineGroupPickerPostId: null,
  manualGroupIds: new Set(),
  manualGroupSearch: '',
  manualGroupPickerOpen: false,
  aiProviders: [],
  localSkills: [],
  localProviders: [],
  editingSkillId: null,
  groupFilterPrivacy: 'all',
  groupFilterApproval: 'all',
  groupFilterRole: 'all',
  editingCustomSetId: null,
  postingPostId: null,
  postingProgress: { done: 0, total: 0 },
  postSearch: '',
  postFilterGroup: 'all',
  postFilterImage: 'all',
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function gfRuntimeAlive() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function gfIsContextInvalidated(err) {
  return /extension context invalidated|context invalidated/i.test(String(err?.message || err || ''));
}

function showContextInvalidBanner() {
  if (document.getElementById('gf-invalid-banner')) return;
  const el = document.createElement('div');
  el.id = 'gf-invalid-banner';
  el.className = 'gf-invalid-banner';
  el.innerHTML = `
    <strong>GroupFlow cần làm mới</strong>
    <p>Extension vừa được reload hoặc cập nhật. Panel cũ không còn kết nối.</p>
    <p><b>Cách sửa:</b> F5 trang web này → bấm icon GroupFlow lại.<br>Hoặc bấm <b>✕ Đóng</b> rồi mở panel lại.</p>
    <button type="button" class="btn sm" id="gf-invalid-close">✕ Đóng panel</button>
  `;
  document.body.prepend(el);
  el.querySelector('#gf-invalid-close')?.addEventListener('click', () => {
    try {
      window.parent.postMessage({ type: 'GF_PANEL_CLOSE' }, '*');
    } catch { /* ignore */ }
  });
}

function getPostImagesLocal(post) {
  if (GF.postMedia?.getPostImages) return GF.postMedia.getPostImages(post);
  if (post?.images?.length) return post.images;
  if (post?.imageBase64) {
    return [{ base64: post.imageBase64, mime: post.mediaMime || 'image/png' }];
  }
  return [];
}

function capturePostMediaSnapshot(post) {
  if (!post) return null;
  const imgs = getPostImagesLocal(post);
  return {
    imageBase64: post.imageBase64 || imgs[0]?.base64 || null,
    images: imgs.length ? imgs.map((img) => ({ ...img })) : null,
    videoBase64: post.videoBase64 || null,
    mediaType: post.mediaType || null,
    mediaMime: post.mediaMime || null,
    imageStatus: post.imageStatus || null,
  };
}

function restorePostMediaFromSnapshot(post, snapshot, { force = false } = {}) {
  if (!snapshot) return post;
  if (!force && postHasMedia(post)) return post;
  if (snapshot.videoBase64) {
    post.videoBase64 = snapshot.videoBase64;
    post.mediaType = snapshot.mediaType || 'video';
    post.mediaMime = snapshot.mediaMime || 'video/mp4';
    post.imageStatus = snapshot.imageStatus || 'ready';
    return post;
  }
  if (snapshot.images?.length) {
    post.images = snapshot.images.map((img) => ({ ...img }));
    post.imageBase64 = snapshot.imageBase64 || post.images[0]?.base64 || null;
    post.mediaType = 'image';
    post.mediaMime = snapshot.mediaMime || post.images[0]?.mime || 'image/png';
    post.imageStatus = snapshot.imageStatus || 'ready';
    return post;
  }
  if (snapshot.imageBase64) {
    post.imageBase64 = snapshot.imageBase64;
    post.mediaType = snapshot.mediaType || 'image';
    post.mediaMime = snapshot.mediaMime || 'image/png';
    post.imageStatus = snapshot.imageStatus || 'ready';
  }
  return post;
}

function mapPostsFromQueue(queue, legacyGroupIds = []) {
  return (queue || []).map((p) => {
    const post = { ...p };
    if (!Array.isArray(post.groupIds)) {
      post.groupIds = legacyGroupIds.length ? [...legacyGroupIds] : [];
    }
    if (post.autoGenerateImage === undefined) post.autoGenerateImage = true;
    post.selected = post.selected === true;
    if (post.ngay_dang && post.gio_dang) post.selected = false;
    return post;
  });
}

function showToast(message, type = 'success', durationMs = 5000) {
  let el = document.getElementById('gf-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gf-toast';
    el.className = 'gf-toast hidden';
    document.body.appendChild(el);
  }
  el.className = `gf-toast gf-toast-${type}`;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add('hidden'), durationMs);
}

function showPostResultToast(summary, fallback = {}) {
  const ok = summary?.okCount ?? fallback.okCount ?? 0;
  const fail = summary?.failCount ?? fallback.failCount ?? 0;
  const total = summary?.total ?? fallback.total ?? 0;
  if (total > 0 && ok >= total) {
    showToast(`Đăng thành công ${ok}/${total} nhóm! Mở bài / comment ngay trên card ✓ Đã đăng`, 'success', 7000);
  } else if (ok > 0) {
    showToast(`Xong ${ok}/${total} nhóm OK${fail ? `, ${fail} lỗi` : ''} — xem Log → Lịch sử`, 'warn', 7000);
  } else if (fail > 0) {
    showToast(`Đăng thất bại ${fail}/${total || fail} nhóm — xem Log → Lịch sử`, 'error', 7000);
  } else {
    showToast('Hoàn thành — xem Log → Lịch sử', 'info');
  }
}

function postStatusTag(p) {
  if (p.postStatus === 'posted') return '<span class="tag ready post-status-tag">✓ Đã đăng</span>';
  if (p.postStatus === 'pending_approval') return '<span class="tag pending post-status-tag">Chờ duyệt</span>';
  if (p.postStatus === 'partial') return '<span class="tag pending post-status-tag">Đăng một phần</span>';
  if (p.postStatus === 'failed') return '<span class="tag error post-status-tag">Lỗi đăng</span>';
  return '';
}

const QUEUE_STATUS_LABELS = {
  queue: 'Chờ đăng',
  posted: 'Đã đăng',
  pending_approval: 'Chờ duyệt',
  partial: 'Đăng một phần',
  failed: 'Lỗi đăng',
};

function getCheckedPosts() {
  return state.posts.filter((p) => p.selected === true);
}

function updatePostsBulkBar() {
  const count = getCheckedPosts().length;
  const bar = $('#postsBulkBar');
  const countEl = $('#postsBulkCount');
  const selectAll = $('#selectAllPosts');
  const wrap = $('#selectAllPostsWrap');
  if (countEl) countEl.textContent = String(count);
  bar?.classList.toggle('hidden', !count);
  wrap?.classList.toggle('hidden', !state.posts.length);
  if (selectAll && state.posts.length) {
    selectAll.checked = state.posts.length > 0 && state.posts.every((p) => p.selected === true);
    selectAll.indeterminate = count > 0 && count < state.posts.length;
  } else if (selectAll) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  }
}

async function bulkDeletePosts() {
  const selected = getCheckedPosts();
  if (!selected.length) return;
  if (!window.confirm(`Xóa ${selected.length} bài khỏi danh sách?`)) return;
  const ids = new Set(selected.map((p) => p.id));
  for (const id of ids) {
    if (state.editingQueuePostId === id) clearComposerEditMode();
    state.assignPostIds.delete(id);
    await GF.postMediaStore?.delete(id);
  }
  state.posts = state.posts.filter((p) => !ids.has(p.id));
  await savePosts();
  renderPosts();
  renderGroupsTab();
  showToast(`Đã xóa ${ids.size} bài`, 'info');
}

async function bulkSetPostStatus(status) {
  const selected = getCheckedPosts();
  if (!selected.length || !status) return;
  for (const p of selected) {
    if (status === 'queue') {
      delete p.postStatus;
      delete p.lastPostedAt;
      delete p.postedGroups;
    } else {
      p.postStatus = status;
    }
  }
  await savePosts();
  $('#postsBulkStatus').value = '';
  renderPosts();
  showToast(`Đã đổi ${selected.length} bài → ${QUEUE_STATUS_LABELS[status] || status}`, 'success');
}

function formatPostedAt(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

async function gfSendMessage(msg) {
  if (!gfRuntimeAlive()) {
    showContextInvalidBanner();
    throw new Error('Extension đã reload — F5 trang rồi mở panel lại');
  }
  try {
    return await chrome.runtime.sendMessage(msg);
  } catch (e) {
    if (gfIsContextInvalidated(e)) {
      showContextInvalidBanner();
      throw new Error('Extension đã reload — F5 trang rồi mở panel lại');
    }
    throw e;
  }
}

function showTab(name) {
  $$('.tab-panel').forEach((p) => p.classList.remove('active'));
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $(`#tab-${name}`)?.classList.add('active');
  document.body.classList.remove(
    'gf-tab-create', 'gf-tab-groups', 'gf-tab-comment', 'gf-tab-radar',
    'gf-tab-activity', 'gf-tab-help', 'gf-tab-skills', 'gf-tab-settings',
  );
  document.body.classList.add(`gf-tab-${name}`);
  if (name === 'groups') {
    renderGroupsTab();
  }
  if (name === 'create') {
    updatePostingConfigSummary();
  }
  if (name === 'skills') {
    loadLocalSkillSelects();
    renderLocalSkillList();
  }
  if (name === 'settings') {
    showSettingsPane('settings-posting');
  }
  if (name === 'activity') {
    chrome.storage.local.get('activityHistory').then((d) => {
      refreshActivityFromStorage({ preferHistory: hasRecentHistory(d.activityHistory || []) });
    });
    refreshJournalFromStorage();
  }
}

function gotoGroupsTab(postId) {
  if (postId) {
    state.assignPostIds = new Set([postId]);
  }
  showTab('groups');
  $$('#tabBar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'groups'));
}

function schedulePassiveGroupSync({ quick = false } = {}) {
  syncGroupsFromFb({ silent: true, quick }).catch(() => {});
}

async function loadState() {
  const d = await chrome.storage.local.get([
    'postQueue', 'extractedGroups', 'selectedGroupIds', 'fbUser',
    'activityHistory', 'activityUpcoming', 'radarLeads',
    'fbProfiles', 'activeActorId', 'radarGroupIds', 'customGroupSets', 'groupsSyncedAt',
  ]);
  const legacyGroupIds = d.selectedGroupIds || [];
  state.posts = mapPostsFromQueue(d.postQueue, legacyGroupIds);
  migrateLegacyMediaOnce().catch(() => {});
  hydrateCachedMediaInPosts().then(() => scheduleRenderPosts()).catch(() => {});
  state.groups = d.extractedGroups || [];
  state.customGroupSets = await GF.groupSets.getAll();
  state.radarGroupIds = new Set(d.radarGroupIds || []);
  state.profiles = d.fbProfiles || null;
  state.activeActorId = d.activeActorId || d.fbUser?.id || null;
  updateGroupsTabBadge();
  renderPosts();
  renderGroupsTab();
  updateProfileHeader(d.fbUser, d.fbProfiles);
  await refreshActivityFromStorage({
    preferHistory: hasRecentHistory(d.activityHistory || []),
  });
  await refreshJournalFromStorage();
  renderLeads(d.radarLeads || []);
  await loadPostedPostsForComment();
  const syncedAt = Number(d.groupsSyncedAt || 0);
  const GROUP_SYNC_STALE_MS = 5 * 60 * 1000;
  const needGroupSync = !state.groups.length
    || !syncedAt
    || (Date.now() - syncedAt > GROUP_SYNC_STALE_MS);
  if (needGroupSync) {
    schedulePassiveGroupSync({ quick: true });
  } else {
    updateGroupsSyncStatus(false);
  }
  gfSendMessage({ type: 'GF_RECONCILE_SCHEDULES' }).catch(() => {});
}

function profileInitial(name) {
  const ch = (name || '?').trim().charAt(0);
  return ch ? ch.toUpperCase() : '?';
}

function renderAvatarEl(el, profile) {
  if (!el || !profile) return;
  el.classList.toggle('page', profile.type === 'page');
  if (profile.picture) {
    el.innerHTML = `<img src="${escAttr(profile.picture)}" alt="" />`;
  } else {
    el.textContent = profileInitial(profile.name);
  }
}

function updateProfileHeader(user, profiles) {
  const nameEl = $('#fbUserName');
  const typeEl = $('#fbUserType');
  const avatarEl = $('#profileAvatar');
  const active = profiles?.active || user;

  if (active?.name) {
    nameEl.textContent = active.name;
    typeEl.textContent = active.type === 'page' ? 'Fanpage' : 'Cá nhân';
    renderAvatarEl(avatarEl, active);
  } else {
    nameEl.textContent = 'Chưa kết nối FB';
    typeEl.textContent = '';
    if (avatarEl) {
      avatarEl.classList.remove('page');
      avatarEl.textContent = '?';
    }
  }

  if (profiles) renderProfileMenu(profiles);
}

function renderProfileMenu(profiles) {
  const box = $('#profileList');
  if (!box) return;
  const { personal, pages, activeId } = profiles;
  if (!personal?.id) {
    box.innerHTML = '<div class="profile-empty">Mở facebook.com và đăng nhập</div>';
    return;
  }

  const items = [
    { ...personal, type: 'user' },
    ...pages,
  ];

  box.innerHTML = items.map((p) => `
    <button type="button" class="profile-option ${String(p.id) === String(activeId) ? 'active' : ''}" data-actor-id="${esc(p.id)}">
      <span class="profile-avatar ${p.type === 'page' ? 'page' : ''}" data-av="${esc(p.id)}">${profileInitial(p.name)}</span>
      <span class="profile-option-info">
        <span class="profile-option-name">${esc(p.name)}</span>
        <span class="profile-option-sub">${p.type === 'page' ? 'Fanpage' : 'Tài khoản cá nhân'}</span>
      </span>
    </button>
  `).join('');

  items.forEach((p) => {
    const av = box.querySelector(`[data-av="${p.id}"]`);
    renderAvatarEl(av, p);
  });

  box.querySelectorAll('[data-actor-id]').forEach((btn) => {
    btn.addEventListener('click', () => switchActor(btn.dataset.actorId));
  });
}

async function refreshProfiles(silent = false) {
  const btn = $('#btnRefreshProfiles');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '…';
  }
  try {
    const res = await gfSendMessage({ type: 'GF_GET_FB_PROFILES' });
    if (res?.profiles) {
      state.profiles = res.profiles;
      state.activeActorId = res.profiles.activeId;
      await chrome.storage.local.set({
        fbProfiles: res.profiles,
        fbUser: res.profiles.active,
        activeActorId: res.profiles.activeId,
      });
      updateProfileHeader(res.profiles.active, res.profiles);
    } else if (res?.error && !silent) {
      const err = String(res.error).toLowerCase();
      if (!err.includes('unknown')) {
        alert(res.error);
      }
    }
  } catch (e) {
    if (!silent) {
      console.warn('[GroupFlow] refreshProfiles:', e.message);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Làm mới';
    }
  }
}

async function fallbackFbUser() {
  try {
    const res = await gfSendMessage({ type: 'GF_GET_FB_USER' });
    if (res?.user) {
      updateProfileHeader(res.user, null);
      await chrome.storage.local.set({ fbUser: res.user, activeActorId: res.user.id });
      return;
    }
  } catch { /* SW chưa sẵn sàng */ }
  try {
    const c = await chrome.cookies.get({ url: 'https://www.facebook.com', name: 'c_user' });
    if (c?.value) {
      const user = { id: c.value, name: `FB #${c.value.slice(-4)}`, type: 'personal' };
      updateProfileHeader(user, null);
      await chrome.storage.local.set({ fbUser: user, activeActorId: user.id });
    }
  } catch { /* tab FB chưa mở */ }
}

async function switchActor(actorId) {
  if (!actorId) return;
  const prevActor = state.activeActorId;
  const menu = $('#profileMenu');
  try {
    const res = await gfSendMessage({ type: 'GF_SWITCH_ACTOR', actorId });
    if (res?.error) throw new Error(res.error);
    if (prevActor && prevActor !== actorId) await persistGroupsForActor(prevActor);
    state.activeActorId = actorId;
    if (state.profiles) {
      const isPersonal = String(actorId) === String(state.profiles.personal?.id);
      state.profiles.activeId = actorId;
      state.profiles.active = isPersonal
        ? { ...state.profiles.personal, type: 'user' }
        : state.profiles.pages.find((p) => String(p.id) === String(actorId))
          || { id: actorId, name: res.user?.name || 'Fanpage', type: 'page' };
    }
    await chrome.storage.local.set({
      activeActorId: actorId,
      fbUser: res.user || state.profiles?.active,
      fbProfiles: state.profiles,
    });
    updateProfileHeader(res.user || state.profiles?.active, state.profiles);
    menu?.classList.add('hidden');
    await loadGroupsForActor(actorId);
    await syncGroupsFromFb({ silent: false, quick: true });
  } catch (e) {
    alert(e.message);
  }
}

async function persistGroupsForActor(actorId) {
  if (!actorId || !state.groups?.length) return;
  const d = await chrome.storage.local.get('groupsByActor');
  const map = d.groupsByActor || {};
  map[String(actorId)] = { groups: state.groups, syncedAt: Date.now() };
  await chrome.storage.local.set({ groupsByActor: map });
}

async function loadGroupsForActor(actorId) {
  const d = await chrome.storage.local.get('groupsByActor');
  const cached = d.groupsByActor?.[String(actorId)];
  state.groups = cached?.groups || [];
  await chrome.storage.local.set({ extractedGroups: state.groups });
  renderGroupsTab();
  if (state.manualGroupPickerOpen) renderManualGroupPicker();
}

function emptyState(icon, text) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><p>${text}</p></div>`;
}

function imageTag(status, mediaType) {
  if (mediaType === 'video') {
    const labels = { ready: 'Video sẵn sàng', pending: 'Chờ video', error: 'Lỗi video' };
    const s = status || 'ready';
    return `<span class="tag ${s === 'error' ? 'error' : 'ready'}">${labels[s] || 'Video'}</span>`;
  }
  const s = status || 'pending';
  const labels = { ready: 'Ảnh sẵn sàng', pending: 'Chờ ảnh', generating: 'Đang tạo…', error: 'Lỗi ảnh' };
  return `<span class="tag ${s === 'ready' ? 'ready' : s === 'error' ? 'error' : 'pending'}">${labels[s] || s}</span>`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = String(dataUrl).split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Đọc file thất bại'));
    reader.readAsDataURL(file);
  });
}

const MEDIA_LIMITS = { image: 8 * 1024 * 1024, video: 15 * 1024 * 1024 };
const MAX_MANUAL_IMAGES = 10;

function manualMediaId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function updateManualMediaCountBadge() {
  const badge = $('#manualMediaCount');
  const n = state.manualMediaList.length;
  if (!badge) return;
  badge.textContent = String(n);
  badge.classList.toggle('hidden', !n);
}

function renderManualMediaPreview() {
  const box = $('#manualMediaPreview');
  const label = $('#manualMediaLabel');
  const list = state.manualMediaList;
  updateManualMediaCountBadge();
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '';
    box.classList.add('empty');
    if (label) label.textContent = 'Ảnh ≤8MB · tối đa 10 ảnh · Video ≤15MB (1 file) · hoặc prompt AI bên dưới';
    return;
  }
  box.classList.remove('empty');
  const video = list.find((m) => m.type === 'video');
  if (label) {
    label.textContent = video
      ? `${video.name} · Video · Chế độ Cổ điển`
      : `${list.length} ảnh đã chọn`;
  }
  box.innerHTML = list.map((m) => {
    const src = `data:${m.mime};base64,${m.base64}`;
    const inner = m.type === 'video'
      ? `<video src="${src}" muted></video>`
      : `<img src="${src}" alt="" />`;
    return `
      <div class="gf-media-thumb" data-media-id="${escAttr(m.id)}">
        ${inner}
        <button type="button" class="gf-media-thumb-remove" data-remove-media="${escAttr(m.id)}" title="Xóa">×</button>
      </div>
    `;
  }).join('');
  box.querySelectorAll('[data-remove-media]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeManualMediaItem(btn.dataset.removeMedia);
    });
  });
}

function removeManualMediaItem(id) {
  state.manualMediaList = state.manualMediaList.filter((m) => m.id !== id);
  renderManualMediaPreview();
  scheduleManualDraftSave();
}

function clearManualMedia() {
  state.manualMediaList = [];
  const input = $('#manualMedia');
  if (input) input.value = '';
  renderManualMediaPreview();
}

async function onManualMediaPick(fileList) {
  const files = [...(fileList || [])].filter(Boolean);
  if (!files.length) return;

  for (const file of files) {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      alert('Chỉ hỗ trợ ảnh (jpg, png, webp) hoặc video (mp4, mov, webm)');
      return;
    }

    if (isVideo) {
      if (state.manualMediaList.length) {
        alert('Video chỉ đính 1 file — xóa ảnh trước khi thêm video');
        return;
      }
      const limit = MEDIA_LIMITS.video;
      if (file.size > limit) return alert('Video tối đa 15MB');
      const base64 = await readFileAsBase64(file);
      state.manualMediaList = [{
        id: manualMediaId(),
        type: 'video',
        base64,
        mime: file.type || 'video/mp4',
        name: file.name,
      }];
      break;
    }

    if (state.manualMediaList.some((m) => m.type === 'video')) {
      alert('Đã có video — không thêm ảnh');
      return;
    }
    if (state.manualMediaList.length >= MAX_MANUAL_IMAGES) {
      alert(`Tối đa ${MAX_MANUAL_IMAGES} ảnh mỗi bài`);
      break;
    }
    if (file.size > MEDIA_LIMITS.image) {
      alert(`Ảnh ${file.name} vượt 8MB — bỏ qua`);
      continue;
    }
    const base64 = await readFileAsBase64(file);
    state.manualMediaList.push({
      id: manualMediaId(),
      type: 'image',
      base64,
      mime: file.type || 'image/png',
      name: file.name,
    });
  }
  renderManualMediaPreview();
  scheduleManualDraftSave();
}

function isColoredBackground(hex) {
  const PF = GF.postFormat;
  if (PF?.isColored) return PF.isColored(hex);
  return Boolean(hex && String(hex).toLowerCase() !== '#18191a');
}

function clearManualMediaForColoredPost({ silent = false } = {}) {
  if (!state.manualMediaList.length && !$('#manualPrompt')?.value?.trim()) return false;
  clearManualMedia();
  if ($('#manualPrompt')) $('#manualPrompt').value = '';
  if ($('#manualAutoImage')) $('#manualAutoImage').checked = false;
  if (!silent) {
    showToast('Nền màu chỉ dùng bài text — đã bỏ media / tắt tự xuất ảnh', 'info', 5000);
  }
  return true;
}

function applyManualMediaToPost(post) {
  if (isColoredBackground(post.backgroundColor)) return post;
  const items = state.manualMediaList.filter((m) => m?.base64);
  if (!items.length) return post;
  const video = items.find((m) => m.type === 'video');
  if (video) {
    post.mediaType = 'video';
    post.videoBase64 = video.base64;
    post.mediaMime = video.mime;
    post.imageStatus = 'ready';
    post.images = null;
    post.imageBase64 = null;
    return post;
  }
  post.images = items.map((m) => ({
    base64: m.base64,
    mime: m.mime,
    name: m.name,
  }));
  post.mediaType = 'image';
  post.imageBase64 = post.images[0].base64;
  post.mediaMime = post.images[0].mime;
  post.imageStatus = 'ready';
  return post;
}

function groupInitial(name) {
  const ch = (name || '?').trim().charAt(0);
  return ch ? ch.toUpperCase() : '?';
}

function ensurePostGroups(post) {
  if (!post) return post;
  if (!Array.isArray(post.groupIds)) post.groupIds = [];
  return post;
}

function getMaxGroupsPerPost() {
  return Number($('#maxGroups')?.value) || 10;
}

function updateGroupsTabBadge() {
  const missing = state.posts.filter((p) => p.selected === true && !ensurePostGroups(p).groupIds.length).length;
  const badge = $('#groupsTabBadge');
  if (badge) badge.textContent = missing ? String(missing) : '';
}

async function syncGroupsFromFb({ silent = true, deep = false, quick = false } = {}) {
  const syncingKey = deep ? 'groupsDeepSyncing' : 'groupsSyncing';
  if (state[syncingKey]) return;
  state[syncingKey] = true;
  const status = $('#groupsSyncStatus');
  const prevCount = state.groups.length;
  if (status) {
    if (deep && !silent) {
      status.textContent = prevCount
        ? `${prevCount} nhóm — đang quét tab joins (Shift+↻)…`
        : 'Đang quét tab joins Facebook…';
    } else if (quick && !silent) {
      status.textContent = 'Đang đọc nhóm (GraphQL nền)…';
    } else if (!silent) {
      status.textContent = 'Đang đồng bộ nhóm…';
    } else if (!prevCount) {
      status.textContent = 'Đang tải nhóm (GraphQL nền)…';
    }
  }
  try {
    let res = await gfSendMessage({
      type: 'GF_SYNC_GROUPS',
      force: deep || quick,
      passive: !deep,
      deep,
      enrich: false,
    });
    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message);
    }
    if (res?.error?.includes('không hỗ trợ') && res.error.includes('GF_SYNC_GROUPS')) {
      res = await gfSendMessage({ type: 'GF_EXTRACT_GROUPS' });
    }
    applySyncedGroups(res?.groups, prevCount);
    if (!state.groups.length && res?.error) {
      throw new Error(res.error);
    }
    updateGroupsSyncStatus(deep);
    renderGroupsTab();
    if (state.manualGroupPickerOpen) renderManualGroupPicker();
  } catch (e) {
    if (status && !prevCount) status.textContent = `Lỗi đồng bộ: ${e.message}`;
    else if (status && prevCount) {
      status.textContent = `${prevCount} nhóm — lỗi cập nhật: ${e.message}`;
    }
  } finally {
    state[syncingKey] = false;
  }
}

function applySyncedGroups(groups, prevCount = 0) {
  if (!groups?.length) return;
  const merged = new Map(state.groups.map((g) => [String(g.id), g]));
  groups.forEach((g) => merged.set(String(g.id), g));
  const next = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  if (next.length < prevCount && prevCount > 0) return;
  state.groups = next;
  chrome.storage.local.set({ extractedGroups: next });
  persistGroupsForActor(state.activeActorId || state.profiles?.activeId);
}

function updateGroupsSyncStatus(deep = false) {
  const status = $('#groupsSyncStatus');
  if (!status) return;
  const n = state.groups.length;
  if (deep) {
    status.textContent = n
      ? `${n} nhóm — đã quét joins (↻ = GraphQL nền)`
      : 'Cần đăng nhập FB trên Chrome — bấm ↻';
  } else {
    status.textContent = n
      ? `${n} nhóm (GraphQL nền)${needsDeepSyncHint(n)}`
      : 'Chưa có nhóm — đăng nhập FB trên Chrome rồi bấm ↻';
  }
}

function needsDeepSyncHint(n) {
  return n > 0 && n < 25 ? ' — Shift+↻ nếu thiếu nhóm' : '';
}

function ensureComposerInit(maxTries = 20) {
  let tries = 0;
  const tick = () => {
    tries += 1;
    GF.composer?.init();
    if (GF.composer?._ready) {
      setupManualDraftPersistence();
      return;
    }
    if (tries >= maxTries) return;
    setTimeout(tick, 200);
  };
  tick();
}

function waitComposerReady(maxMs = 4500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      GF.composer?.init();
      if (GF.composer?._ready) {
        setupManualDraftPersistence();
        resolve(true);
        return;
      }
      if (Date.now() - start >= maxMs) {
        resolve(false);
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

const MANUAL_DRAFT_KEY = 'gfManualDraft';
const MANUAL_DRAFT_MEDIA_ID = '__gfManualDraft__';
let manualDraftBound = false;
let manualDraftSaveTimer = null;

async function loadManualDraft() {
  const d = await chrome.storage.local.get(MANUAL_DRAFT_KEY);
  return d[MANUAL_DRAFT_KEY] || null;
}

async function saveManualDraft(draft) {
  await chrome.storage.local.set({ [MANUAL_DRAFT_KEY]: draft });
}

function scheduleManualDraftSave() {
  updateBatchFooter();
  if (manualDraftSaveTimer) clearTimeout(manualDraftSaveTimer);
  manualDraftSaveTimer = setTimeout(async () => {
    try {
      const C = GF.composer;
      if (!C?._ready || state.editingQueuePostId) return;
      const vars = {};
      const deltas = C.getVariationDeltas?.() || {};
      (C.VAR_KEYS || ['A', 'B', 'C', 'D']).forEach((k) => {
        const t = C.getVariationTexts?.()[k];
        if (t) vars[k] = t;
      });
      const draft = {
        vars,
        deltas,
        activeVar: C.activeVar || 'A',
        backgroundColor: C.backgroundColor || '#18191A',
        groupIds: [...state.manualGroupIds],
        prompt: $('#manualPrompt')?.value.trim() || '',
        firstComment: $('#manualFirstComment')?.value.trim() || '',
        firstCommentEnabled: $('#manualFirstCommentOn')?.checked === true,
        autoGenerateImage: $('#manualAutoImage')?.checked !== false,
        updatedAt: Date.now(),
      };
      await saveManualDraft(draft);
      const PMS = GF.postMediaStore;
      if (PMS && manualMediaHasPayload()) {
        const stub = { id: MANUAL_DRAFT_MEDIA_ID };
        applyManualMediaToPost(stub);
        await PMS.save(MANUAL_DRAFT_MEDIA_ID, stub);
      } else if (PMS) {
        await PMS.delete(MANUAL_DRAFT_MEDIA_ID);
      }
    } catch { /* ignore */ }
  }, 450);
}

async function clearManualDraft() {
  await chrome.storage.local.remove(MANUAL_DRAFT_KEY);
  await GF.postMediaStore?.delete(MANUAL_DRAFT_MEDIA_ID);
}

async function restoreManualDraftMedia() {
  const PMS = GF.postMediaStore;
  if (!PMS) return;
  const stub = { id: MANUAL_DRAFT_MEDIA_ID };
  await PMS.hydratePost(stub);
  if (!postHasMedia(stub)) return;
  state.manualMediaList = [];
  if (stub.mediaType === 'video' && stub.videoBase64) {
    state.manualMediaList = [{
      id: manualMediaId(),
      type: 'video',
      base64: stub.videoBase64,
      mime: stub.mediaMime || 'video/mp4',
      name: 'video',
    }];
  } else {
    const imgs = getPostImagesLocal(stub);
    state.manualMediaList = imgs.map((img, i) => ({
      id: manualMediaId(),
      type: 'image',
      base64: img.base64,
      mime: img.mime || 'image/png',
      name: img.name || `image-${i + 1}`,
    }));
  }
  renderManualMediaPreview();
}

async function restoreManualDraftIfAny() {
  const C = GF.composer;
  if (!C?._ready || state.editingQueuePostId) return;
  const draft = await loadManualDraft();
  if (!draft?.vars && !draft?.deltas) return;

  const current = C.getVariationTexts?.() || {};
  const hasAny = Object.values(current).some((t) => String(t || '').trim());
  if (hasAny) return;

  try {
    if (draft.deltas && Object.keys(draft.deltas).length) {
      C.setVariationDeltas(draft.deltas);
    } else {
      Object.entries(draft.vars).forEach(([k, text]) => {
        const ed = C.editors?.[k];
        if (!ed) return;
        ed.setText(String(text || ''));
      });
    }
    if (draft.backgroundColor) C.setBackground?.(draft.backgroundColor);
    if (draft.activeVar) C.setVariation?.(draft.activeVar);
    if (draft.groupIds?.length) {
      state.manualGroupIds = new Set(draft.groupIds.map(String));
      updateManualGroupSummary();
      renderManualGroupListOnly();
    }
    if ($('#manualPrompt') && draft.prompt != null) $('#manualPrompt').value = draft.prompt;
    if ($('#manualFirstComment') && draft.firstComment != null) {
      $('#manualFirstComment').value = draft.firstComment;
    }
    if (draft.firstCommentEnabled != null) syncFirstCommentChipUI(draft.firstCommentEnabled);
    if ($('#manualAutoImage') && draft.autoGenerateImage != null) {
      $('#manualAutoImage').checked = draft.autoGenerateImage;
    }
    await restoreManualDraftMedia();
    C.updateQualityBadge?.();
  } catch { /* ignore */ }
}

function setupManualDraftPersistence() {
  const C = GF.composer;
  if (!C?._ready || manualDraftBound) return;
  manualDraftBound = true;

  try {
    (C.VAR_KEYS || ['A', 'B', 'C', 'D']).forEach((k) => {
      const ed = C.editors?.[k];
      if (!ed) return;
      ed.on('text-change', scheduleManualDraftSave);
    });
    // Save when user changes variation/background
    document.querySelectorAll('[data-var]').forEach((btn) => {
      btn.addEventListener('click', scheduleManualDraftSave);
    });
    document.querySelectorAll('[data-bg-color]').forEach((btn) => {
      btn.addEventListener('click', scheduleManualDraftSave);
    });
  } catch { /* ignore */ }

  // Restore once per load
  restoreManualDraftIfAny();
}

async function saveGroupsData() {
  await chrome.storage.local.set({
    extractedGroups: state.groups,
    customGroupSets: state.customGroupSets,
    radarGroupIds: [...state.radarGroupIds],
  });
  await savePosts();
}

function groupNameById(id) {
  return state.groups.find((g) => String(g.id) === String(id))?.name || String(id);
}

function postGroupSummary(post) {
  ensurePostGroups(post);
  const n = post.groupIds.length;
  if (!n) return 'Chưa chọn nhóm';
  if (n === 1) return groupNameById(post.groupIds[0]);
  return `${n} nhóm`;
}

function formatGroupList(groupIds) {
  if (!groupIds?.length) return 'Chưa có nhóm';
  return groupIds.map((id) => groupNameById(id)).join(', ');
}

function normalizeSearchText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupMatchesSearch(groupName, query) {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const name = normalizeSearchText(groupName);
  const tokens = q.split(' ').filter(Boolean);
  return tokens.every((t) => name.includes(t));
}

function filterGroupsBySearch(groups, query) {
  return (groups || []).filter((g) => groupMatchesSearch(g.name || `Group ${g.id}`, query));
}

function groupPrivacyLabel(privacy) {
  const p = String(privacy || '').toUpperCase();
  if (p.includes('SECRET')) return 'Kín';
  if (p.includes('CLOSED')) return 'Đóng';
  if (p.includes('OPEN') || p.includes('PUBLIC')) return 'Công khai';
  return 'Chưa rõ';
}

function groupPrivacyBucket(privacy) {
  const p = String(privacy || '').toUpperCase();
  if (p.includes('SECRET')) return 'secret';
  if (p.includes('CLOSED')) return 'closed';
  if (p.includes('OPEN') || p.includes('PUBLIC')) return 'open';
  return 'unknown';
}

function groupApprovalBucket(g) {
  const pa = g?.post_approval;
  if (pa === 'required' || g?.requires_approval === true) return 'required';
  if (pa === 'none') return 'none';
  return 'unknown';
}

function groupRoleBucket(g) {
  const r = String(g?.join_role || '').toUpperCase();
  if (r === 'OWNER' || r === 'ADMIN' || r === 'MODERATOR') return 'admin';
  if (r === 'MEMBER') return 'member';
  return 'unknown';
}

// Invite feature removed.

function groupMetaBadges(g) {
  const parts = [];
  const pl = groupPrivacyLabel(g?.privacy);
  if (g?.privacy && g.privacy !== 'UNKNOWN') {
    parts.push(`<span class="chip sm">${pl}</span>`);
  } else {
    parts.push('<span class="chip sm muted">Chưa rõ QT</span>');
  }
  const approval = groupApprovalBucket(g);
  if (approval === 'required') parts.push('<span class="chip sm warn">Có duyệt</span>');
  else if (approval === 'none') parts.push('<span class="chip sm ok">Không duyệt</span>');
  else parts.push('<span class="chip sm muted">Chưa rõ ĐB</span>');
  if (g?.meta_source === 'post_learned') parts.push('<span class="chip sm">Đã học</span>');
  if (['OWNER', 'ADMIN', 'MODERATOR'].includes(String(g?.join_role || '').toUpperCase())) parts.push('<span class="chip sm">Admin</span>');
  return parts.join(' ');
}

function filterGroupsForLibrary(groups) {
  const q = $('#groupSearch')?.value || '';
  return (groups || []).filter((g) => !q || groupMatchesSearch(g.name, q));
}

function updateGroupFilterSummary(filtered) {
  const el = $('#groupFilterSummary');
  if (!el) return;
  const total = state.groups.length;
  const n = filtered.length;
  const openN = state.groups.filter((g) => groupPrivacyBucket(g.privacy) === 'open').length;
  const secretN = state.groups.filter((g) => groupPrivacyBucket(g.privacy) === 'secret').length;
  const apprN = state.groups.filter((g) => groupApprovalBucket(g) === 'required').length;
  const freeN = state.groups.filter((g) => groupApprovalBucket(g) === 'none').length;
  const adminN = state.groups.filter((g) => groupRoleBucket(g) === 'admin').length;
  el.textContent = `Hiển thị ${n}/${total} nhóm · Công khai ${openN} · Kín ${secretN} · Admin ${adminN} · Có duyệt ${apprN} · Không duyệt ${freeN}`;
}

async function aiTextReady() {
  const { textProvider } = await GF.localProviders.getActiveProviders();
  if (textProvider) return true;
  const s = await GF.storage.getSettings();
  return Boolean(s.routerApiKey);
}

async function aiImageReady() {
  const { imageProvider } = await GF.localProviders.getActiveProviders();
  if (imageProvider) return true;
  const s = await GF.storage.getSettings();
  return Boolean(s.routerApiKey);
}

function providerOptionLabel(p) {
  return `${p.name}${p.model ? ` (${p.model})` : ''}`;
}

function fillLocalProviderSelect(selectEl, providers, type, selectedId) {
  if (!selectEl) return;
  const list = providers.filter((p) => p.type === type && p.is_active !== false);
  selectEl.innerHTML = '<option value="">— Chưa chọn —</option>'
    + list.map((p) => `<option value="${p.id}">${esc(providerOptionLabel(p))}</option>`).join('');
  if (selectedId) selectEl.value = String(selectedId);
}

async function loadLocalProviderSelects() {
  state.localProviders = await GF.localProviders.list();
  const { textProviderId, imageProviderId } = await GF.localProviders.getActiveIds();
  fillLocalProviderSelect($('#activeTextProviderId'), state.localProviders, 'text', textProviderId);
  fillLocalProviderSelect($('#activeImageProviderId'), state.localProviders, 'image', imageProviderId);
  renderLocalProviderList();
}

function resetProviderForm() {
  $('#providerFormEditId').value = '';
  $('#providerFormName').value = '';
  $('#providerFormType').value = 'text';
  $('#providerFormKind').value = 'openai';
  $('#providerFormKey').value = '';
  $('#providerFormModel').value = '';
  $('#providerFormEndpoint').value = '';
  $('#btnCancelProvider')?.classList.add('hidden');
}

function fillProviderForm(p) {
  const details = $('#providerFormName')?.closest('details');
  if (details) details.open = true;
  $('#providerFormEditId').value = p.id;
  $('#providerFormName').value = p.name || '';
  $('#providerFormType').value = p.type || 'text';
  $('#providerFormKind').value = p.provider_kind || 'openai';
  $('#providerFormKey').value = p.api_key || '';
  $('#providerFormModel').value = p.model || '';
  $('#providerFormEndpoint').value = p.api_endpoint || '';
  $('#btnCancelProvider')?.classList.remove('hidden');
}

function renderLocalProviderList() {
  const box = $('#localProviderList');
  if (!box) return;
  const list = state.localProviders || [];
  if (!list.length) {
    box.innerHTML = '<p class="hint">Chưa có provider — Import hoặc mở form thêm bên dưới.</p>';
    return;
  }
  box.innerHTML = list.map((p) => `
    <div class="provider-card">
      <div class="provider-card-head">
        <span class="provider-card-name">${esc(p.name)}</span>
        <span class="chip sm">${esc(p.type)} · ${esc(p.provider_kind || 'openai')}</span>
      </div>
      <p class="provider-card-meta">${esc(p.model || '—')}</p>
      <div class="row" style="margin-top:8px">
        <button type="button" class="btn ghost sm" data-edit-provider="${escAttr(p.id)}">Sửa</button>
        <button type="button" class="btn ghost sm" data-del-provider="${escAttr(p.id)}">Xóa</button>
      </div>
    </div>
  `).join('');
  box.querySelectorAll('[data-edit-provider]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = state.localProviders.find((x) => x.id === btn.dataset.editProvider);
      if (p) fillProviderForm(p);
    });
  });
  box.querySelectorAll('[data-del-provider]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Xóa provider này?')) return;
      await GF.localProviders.remove(btn.dataset.delProvider);
      await loadLocalProviderSelects();
    });
  });
}

async function saveProviderForm() {
  await GF.localProviders.upsert({
    id: $('#providerFormEditId')?.value || undefined,
    name: $('#providerFormName')?.value,
    type: $('#providerFormType')?.value,
    provider_kind: $('#providerFormKind')?.value,
    api_key: $('#providerFormKey')?.value,
    model: $('#providerFormModel')?.value,
    api_endpoint: $('#providerFormEndpoint')?.value,
  });
  resetProviderForm();
  await loadLocalProviderSelects();
}

async function saveActiveProviders() {
  await GF.localProviders.setActiveIds({
    textProviderId: $('#activeTextProviderId')?.value || null,
    imageProviderId: $('#activeImageProviderId')?.value || null,
  });
  alert('Đã lưu provider đang dùng');
}

function updateImageSaveModeUI(mode) {
  const m = mode || $('#imageSaveMode')?.value || 'downloads';
  $('#imageSaveDownloadsOpts')?.classList.toggle('hidden', m !== 'downloads');
  $('#imageSaveFolderOpts')?.classList.toggle('hidden', m !== 'folder');
}

function fillSkillSelect(selectEl, skills, type, selectedId) {
  if (!selectEl) return;
  const list = skills.filter((s) => (s.skill_type || 'text') === type);
  const defaultLabel = type === 'text' ? '— Mặc định —' : '— Mặc định —';
  selectEl.innerHTML = `<option value="">${defaultLabel}</option>`
    + list.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if (selectedId) selectEl.value = String(selectedId);
}

async function loadLocalSkillSelects() {
  const textSel = $('#aiTextSkill');
  const imageSel = $('#aiImageSkill');
  if (!textSel && !imageSel) return;
  try {
    state.localSkills = await GF.localSkills.list();
    fillSkillSelect(textSel, state.localSkills, 'text');
    fillSkillSelect(imageSel, state.localSkills, 'image');
  } catch (e) {
    if ($('#aiGenerateStatus')) $('#aiGenerateStatus').textContent = e.message;
  }
}

function resetSkillForm() {
  state.editingSkillId = null;
  $('#skillFormEditId').value = '';
  $('#skillFormName').value = '';
  $('#skillFormType').value = 'text';
  $('#skillFormPrompt').value = '';
  $('#btnCancelSkill')?.classList.add('hidden');
}

function fillSkillForm(skill) {
  state.editingSkillId = skill.id;
  $('#skillFormEditId').value = skill.id;
  $('#skillFormName').value = skill.name || '';
  $('#skillFormType').value = skill.skill_type || 'text';
  $('#skillFormPrompt').value = skill.system_prompt || '';
  $('#btnCancelSkill')?.classList.remove('hidden');
}

function renderLocalSkillList() {
  const box = $('#localSkillList');
  if (!box) return;
  const skills = state.localSkills || [];
  if (!skills.length) {
    box.innerHTML = '<p class="hint">Chưa có skill — import JSON hoặc tạo mới ở trên.</p>';
    return;
  }
  box.innerHTML = skills.map((s) => `
    <div class="provider-card">
      <div class="provider-card-head">
        <span class="provider-card-name">${esc(s.name)}</span>
        <span class="chip sm">${esc(s.skill_type || 'text')}</span>
      </div>
      <p class="provider-card-meta">${esc((s.system_prompt || '').slice(0, 80))}${(s.system_prompt || '').length > 80 ? '…' : ''}</p>
      <div class="row" style="margin-top:8px">
        <button type="button" class="btn ghost sm" data-edit-skill="${escAttr(s.id)}">Sửa</button>
        <button type="button" class="btn ghost sm" data-del-skill="${escAttr(s.id)}">Xóa</button>
      </div>
    </div>
  `).join('');
  box.querySelectorAll('[data-edit-skill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const skill = state.localSkills.find((x) => x.id === btn.dataset.editSkill);
      if (skill) fillSkillForm(skill);
    });
  });
  box.querySelectorAll('[data-del-skill]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Xóa skill này?')) return;
      await GF.localSkills.remove(btn.dataset.delSkill);
      await loadLocalSkillSelects();
      renderLocalSkillList();
    });
  });
}

async function saveSkillForm() {
  const name = $('#skillFormName')?.value?.trim();
  const system_prompt = $('#skillFormPrompt')?.value?.trim();
  if (!name || !system_prompt) return alert('Nhập tên và system prompt');
  await GF.localSkills.upsert({
    id: $('#skillFormEditId')?.value || undefined,
    name,
    skill_type: $('#skillFormType')?.value || 'text',
    system_prompt,
  });
  resetSkillForm();
  await loadLocalSkillSelects();
  renderLocalSkillList();
}

function updateManualGroupSummary() {
  const summary = $('#manualGroupSummary');
  const countEl = $('#manualGroupCount');
  const trigger = $('#manualGroupTrigger');
  const n = state.manualGroupIds.size;
  if (countEl) countEl.textContent = `${n} nhóm`;
  if (!summary) return;
  if (!n) {
    summary.textContent = 'Nhấp để chọn các nhóm mục tiêu cần đăng';
    trigger?.classList.remove('has-groups');
    return;
  }
  trigger?.classList.add('has-groups');
  const names = [...state.manualGroupIds]
    .map((id) => state.groups.find((g) => String(g.id) === id)?.name || id)
    .slice(0, 3);
  const more = n > 3 ? ` +${n - 3} nhóm` : '';
  summary.textContent = `${names.join(', ')}${more}`;
}

function toggleManualGroupPicker(force) {
  state.manualGroupPickerOpen = typeof force === 'boolean' ? force : !state.manualGroupPickerOpen;
  const picker = $('#manualGroupPicker');
  const trigger = $('#manualGroupTrigger');
  picker?.classList.toggle('hidden', !state.manualGroupPickerOpen);
  trigger?.classList.toggle('open', state.manualGroupPickerOpen);
  trigger?.setAttribute('aria-expanded', state.manualGroupPickerOpen ? 'true' : 'false');
  if (state.manualGroupPickerOpen) {
    renderManualGroupPicker();
    focusManualGroupSearch();
  }
}

function closeManualGroupPicker() {
  if (!state.manualGroupPickerOpen) return;
  toggleManualGroupPicker(false);
  updateManualGroupSummary();
}

const POSTING_RING_C = 276.46;

function updatePostingRing(pct) {
  const n = Math.max(0, Math.min(100, Number(pct) || 0));
  const ring = $('#postingProgressRing');
  if (ring) ring.style.strokeDashoffset = String(POSTING_RING_C * (1 - n / 100));
  const text = $('#postingProgressText');
  if (text) text.textContent = `${Math.round(n)}%`;
}

function updatePostingCount(done, total) {
  const el = $('#postingCountText');
  if (el) el.textContent = total > 0 ? `${done} / ${total}` : `${done} / ?`;
}

function applyPostingProgress(done, total) {
  if (total > 0) {
    state.postingProgress = { done: Math.max(0, done), total };
    updatePostingRing((done / total) * 100);
    updatePostingCount(done, total);
  } else if (done > 0) {
    state.postingProgress.done = done;
    updatePostingCount(done, state.postingProgress.total || 0);
  }
}

function formatPauseCountdown(sec) {
  const s = Math.max(0, Math.ceil(Number(sec) || 0));
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}:${String(r).padStart(2, '0')}` : `${m} phút`;
  }
  return `${s}s`;
}

/** GPP `.LoadingDiv` — full overlay, không chồng form tạo bài */
function showPostingUI(clearLog = true, hint = '') {
  closeManualGroupPicker();
  $('#postingOverlay')?.classList.remove('hidden');
  document.body.classList.add('gf-posting-active');
  if (clearLog) {
    const log = $('#progressLog');
    if (log) log.innerHTML = '';
    updatePostingRing(0);
    updatePostingCount(0, 0);
    const status = $('#postingStatus');
    if (status) status.textContent = hint || 'Đang chuẩn bị engine…';
  } else if (hint) {
    const status = $('#postingStatus');
    if (status) status.textContent = hint;
  }
}

function hidePostingUI() {
  state.postingPostId = null;
  state.postingProgress = { done: 0, total: 0 };
  $('#postingOverlay')?.classList.add('hidden');
  document.body.classList.remove('gf-posting-active');
  renderPosts();
}

const SECURITY_HINTS = {
  fast: 'Nhanh: ~1–2 phút/nhóm — chỉ khi ít nhóm.',
  balanced: 'Cân bằng: ~3–5 phút/nhóm — khuyên dùng.',
  safe: 'An toàn: ~7–10 phút/nhóm — tài khoản mới / nhiều nhóm.',
};

function updateManualSecurityUI(level) {
  updateSecurityUI(level);
}

function pickMediaFields(post) {
  return {
    imageBase64: post.imageBase64,
    videoBase64: post.videoBase64,
    images: post.images,
    mediaType: post.mediaType,
    mediaMime: post.mediaMime,
    imageStatus: post.imageStatus,
  };
}

function pickTextFields(post) {
  return {
    variationDeltas: post.variationDeltas,
    variations: post.variations,
    noi_dung: post.noi_dung,
  };
}

function mergePostsFromStorage(incoming) {
  const prev = new Map(state.posts.map((p) => [p.id, p]));
  state.posts = (incoming || []).map((p) => {
    const old = prev.get(p.id);
    if (!old) return p;
    let merged = p;
    if (postHasMedia(old) && !postHasMedia(p)) {
      merged = { ...merged, ...pickMediaFields(old), mediaCached: p.mediaCached ?? old.mediaCached };
    } else if (old.mediaCached && !p.mediaCached && !postHasMedia(p)) {
      merged = { ...merged, mediaCached: true };
    }
    const oldDeltas = old.variationDeltas && Object.keys(old.variationDeltas).length;
    const newDeltas = merged.variationDeltas && Object.keys(merged.variationDeltas).length;
    if (oldDeltas && !newDeltas) {
      merged = { ...merged, ...pickTextFields(old) };
    } else if (!merged.noi_dung && old.noi_dung) {
      merged = { ...merged, noi_dung: old.noi_dung, variations: old.variations };
    }
    return merged;
  });
  hydrateCachedMediaInPosts().then(() => scheduleRenderPosts()).catch(() => {});
}

async function hydrateCachedMediaInPosts() {
  if (!GF.postMediaStore) return;
  try {
    const sess = await chrome.storage.session.get('gfPostingActive');
    if (sess.gfPostingActive) return false;
  } catch { /* ignore */ }
  let changed = false;
  for (const p of state.posts) {
    if ((p.mediaCached || p.mediaType === 'image' || p.mediaType === 'video') && !postHasMedia(p)) {
      await GF.postMediaStore.hydratePost(p);
      if (postHasMedia(p)) changed = true;
    }
  }
  return changed;
}

let mediaMigrateDone = false;
async function migrateLegacyMediaOnce() {
  if (mediaMigrateDone || !GF.postMediaStore) return;
  const legacy = state.posts.filter((p) => GF.postMediaStore.hasPayload(p));
  if (!legacy.length) {
    mediaMigrateDone = true;
    return;
  }
  await GF.postMediaStore.persistAll(legacy);
  await savePostsQuiet();
  mediaMigrateDone = true;
}

async function hydratePostsForJob(posts) {
  if (!GF.postMediaStore) return posts;
  await Promise.all(posts.map(async (p) => {
    if ((p.mediaCached || p.mediaType) && !postHasMedia(p)) {
      await GF.postMediaStore.hydratePost(p);
    }
  }));
  return posts;
}

let renderPostsTimer = null;

function scheduleRenderPosts() {
  clearTimeout(renderPostsTimer);
  renderPostsTimer = setTimeout(() => renderPosts(), 48);
}

/** Luôn Cổ điển — không còn chế độ Nhanh trên UI */
function applyPostModeFromSettings() {
  /* giữ API cũ, không còn radio postMode */
}

function rememberPostModePreference() {
  if (!gfRuntimeAlive()) return;
  GF.storage.saveSettings({ postMode: 'classic' }).catch((e) => {
    if (gfIsContextInvalidated(e)) showContextInvalidBanner();
  });
}

function updateManualPostModeUI() {
  /* no-op */
}

function readManualPostSettings() {
  return {
    postMode: 'classic',
    classicTextMode: getSelectedClassicTextMode(),
    securityLevel: document.querySelector('input[name="securityLevel"]:checked')?.value || 'balanced',
    avoidNight: $('#avoidNight')?.checked !== false,
    delayOnFail: false,
    firstComment: $('#manualFirstComment')?.value.trim() || '',
    firstCommentEnabled: $('#manualFirstCommentOn')?.checked === true,
  };
}

function applyManualAutomationToPost(post) {
  Object.assign(post, readManualPostSettings());
  return post;
}

function ensurePostAutomation(post, settings = {}) {
  if (!post.postMode) post.postMode = 'classic';
  if (!post.classicTextMode) {
    post.classicTextMode = settings.classicTextMode === 'paste' ? 'paste' : 'hybrid';
  }
  if (!post.securityLevel) post.securityLevel = settings.securityLevel || 'balanced';
  if (post.avoidNight === undefined) post.avoidNight = settings.avoidNight !== false;
  if (post.delayOnFail === undefined) post.delayOnFail = false;
  return post;
}

function initManualPostSettingsForm(settings) {
  const s = settings || {};
  updateSecurityUI(s.securityLevel || 'balanced');
  syncFirstCommentChipUI(false);
}

function syncFirstCommentChipUI(forceOn) {
  const on = typeof forceOn === 'boolean'
    ? forceOn
    : ($('#manualFirstCommentOn')?.checked === true);
  if ($('#manualFirstCommentOn')) $('#manualFirstCommentOn').checked = on;
  $('#btnChipFirstComment')?.setAttribute('aria-pressed', on ? 'true' : 'false');
  $('#manualCommentPanel')?.classList.toggle('hidden', !on);
}

function toggleFirstCommentChip() {
  syncFirstCommentChipUI($('#btnChipFirstComment')?.getAttribute('aria-pressed') !== 'true');
  updatePostingConfigSummary();
}

function insertCommentSpintax() {
  const ta = $('#manualFirstComment');
  if (!ta) return;
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? start;
  const snippet = '{câu 1|câu 2}';
  ta.value = ta.value.slice(0, start) + snippet + ta.value.slice(end);
  ta.focus();
  ta.selectionStart = start + 1;
  ta.selectionEnd = start + 6;
  syncFirstCommentChipUI(true);
}

function buildComposePreviewHtml() {
  ensureComposerInit();
  const text = GF.composer?.getPrimaryText() || '';
  const settings = readManualPostSettings();
  const modeLabel = { fast: 'Nhanh', classic: 'Cổ điển' }[settings.postMode] || settings.postMode;
  const secLabel = { fast: 'Giãn nhanh', balanced: 'Cân bằng', safe: 'An toàn' }[settings.securityLevel] || settings.securityLevel;
  const groups = [...state.manualGroupIds].map((id) => {
    const g = state.groups.find((x) => String(x.id) === String(id));
    return g?.name || id;
  });
  const mediaCount = state.manualMediaList.length;
  const commentOn = settings.firstCommentEnabled;
  const comment = settings.firstComment || '';
  return `
    <div class="gf-preview-meta">
      <span class="tag web">${esc(modeLabel)}</span>
      <span class="tag">${esc(secLabel)}</span>
      ${commentOn ? '<span class="tag ready">1st comment</span>' : ''}
      ${mediaCount ? `<span class="tag">${mediaCount} media</span>` : ''}
    </div>
    <p class="gf-preview-post">${esc(text || '—')}</p>
    <p class="gf-preview-groups"><strong>Nhóm:</strong> ${esc(groups.length ? groups.join(', ') : 'Chưa chọn')}</p>
    ${commentOn && comment ? `<p class="hint">Comment: ${esc(comment.slice(0, 160))}</p>` : ''}
  `;
}

function showComposePreview() {
  const body = $('#composePreviewBody');
  if (!body) return;
  body.innerHTML = buildComposePreviewHtml();
  $('#composePreviewModal')?.classList.remove('hidden');
}

function closeComposePreview() {
  $('#composePreviewModal')?.classList.add('hidden');
}

async function saveComposePostToQueue({ selectOnly = false } = {}) {
  ensureComposerInit();
  if (state.editingQueuePostId) {
    const post = state.posts.find((p) => p.id === state.editingQueuePostId);
    if (!post) {
      clearComposerEditMode();
      throw new Error('Bài đang sửa không còn trong queue');
    }
    applyComposerToQueuePost(post);
    if (selectOnly) {
      state.posts.forEach((p) => { p.selected = p.id === post.id; });
    }
    await savePosts();
    renderPosts();
    rememberPostModePreference();
    return post;
  }

  const text = GF.composer?.getPrimaryText() || '';
  const variations = GF.composer?.getVariationsArray() || [];
  if (!text) throw new Error('Nhập nội dung bài');

  const bg = GF.composer?.backgroundColor || '#18191A';
  const colored = isColoredBackground(bg);
  if (colored) clearManualMediaForColoredPost({ silent: true });

  const post = {
    id: `manual-${Date.now()}`,
    source: 'manual',
    noi_dung: text,
    variations: variations.length > 1 ? variations : [],
    variationDeltas: GF.composer?.getVariationDeltas() || {},
    prompt_anh: colored ? '' : ($('#manualPrompt')?.value.trim() || ''),
    autoGenerateImage: colored ? false : $('#manualAutoImage')?.checked,
    anh_ngay_dang: '',
    anh_gio_dang: '',
    ngay_dang: '',
    gio_dang: '',
    campaignName: '',
    campaignId: '',
    backgroundColor: bg,
    firstComment: $('#manualFirstComment')?.value.trim() || '',
    firstCommentEnabled: $('#manualFirstCommentOn')?.checked === true,
    groupIds: [...state.manualGroupIds].slice(0, getMaxGroupsPerPost()),
    selected: false,
  };

  resolvePostMediaOnSave(post);
  if (!colored && manualMediaHasPayload() && !postHasMedia(post)) {
    throw new Error('Không lưu được ảnh — thử ảnh nhỏ hơn hoặc reload extension');
  }
  if (!postHasMedia(post) && !colored && post.prompt_anh) {
    post.imageStatus = 'pending';
  }
  applyManualAutomationToPost(post);

  state.posts.push(post);
  state.assignPostIds.add(post.id);
  if (selectOnly) {
    state.posts.forEach((p) => { p.selected = p.id === post.id; });
  }
  await savePosts();
  renderPosts();
  rememberPostModePreference();
  return post;
}

async function resetComposeFormAfterSave() {
  GF.composer?.clearAll();
  $('#manualPrompt').value = '';
  $('#manualFirstComment').value = '';
  syncFirstCommentChipUI(false);
  if ($('#editScheduleDate')) $('#editScheduleDate').value = '';
  if ($('#editScheduleTime')) $('#editScheduleTime').value = '';
  clearManualMedia();
  await clearManualDraft();
  initManualPostSettingsForm(await GF.storage.getSettings());
  state.manualGroupIds = new Set();
  toggleManualGroupPicker(false);
  updateManualGroupSummary();
  updateComposeFooterHint();
}

async function finishComposeEditSave(message = 'Đã cập nhật bài') {
  clearComposerEditMode();
  await resetComposeFormAfterSave();
  showToast(message, 'success');
}

async function startNewManualPost({ confirmIfEditing = true } = {}) {
  if (state.editingQueuePostId && confirmIfEditing) {
    const ok = window.confirm(
      'Đang sửa bài — thay đổi chưa bấm Cập nhật sẽ mất.\n\nSoạn bài mới?',
    );
    if (!ok) return;
  }
  clearComposerEditMode();
  await resetComposeFormAfterSave();
  ensureComposerInit();
  $('#manualPanel')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

function updateComposeFooterHint() {
  const tail = $('#composeFooterHintTail');
  if (!tail) return;
  tail.textContent = state.editingQueuePostId
    ? 'Đang sửa — bấm Cập nhật để ghi, hoặc Đăng ngay / nút Đăng trên card.'
    : 'Soạn xong → Thêm danh sách hoặc Đăng ngay. Đăng bài trong queue: nút Đăng trên từng card.';
}

let lastComposeEditId = null;
function syncComposeEditUI() {
  const post = state.editingQueuePostId
    ? state.posts.find((p) => p.id === state.editingQueuePostId)
    : null;
  const isEdit = Boolean(post);
  const manualPanel = $('#manualPanel');
  manualPanel?.classList.toggle('compose-mode-edit', isEdit);
  manualPanel?.classList.toggle('compose-mode-new', !isEdit);

  const banner = $('#composeEditBanner');
  if (banner) {
    banner.classList.toggle('hidden', !post);
    const textEl = $('#composeEditBannerText');
    if (textEl && post) {
      textEl.textContent = (post.noi_dung || '—').slice(0, 72);
    }
  }

  const newBtn = $('#btnComposeNew');
  if (newBtn) newBtn.classList.toggle('hidden', isEdit);

  const queueBtn = $('#btnAddManual');
  if (queueBtn) {
    queueBtn.textContent = isEdit ? 'Cập nhật' : 'Thêm danh sách';
    queueBtn.title = isEdit
      ? 'Ghi thay đổi vào bài đang sửa'
      : 'Thêm bài vào danh sách (chưa đăng)';
  }

  const editSchedule = $('#editScheduleBlock');
  if (editSchedule) editSchedule.classList.toggle('hidden', !isEdit);

  updateComposeFooterHint();
  const editId = state.editingQueuePostId;
  if (lastComposeEditId !== editId) {
    lastComposeEditId = editId;
    scheduleRenderPosts();
  }
}

function clearComposerEditMode() {
  state.editingQueuePostId = null;
  state.editingMediaSnapshot = null;
  syncComposeEditUI();
}

function loadPostTextIntoComposer(post) {
  ensureComposerInit();
  const C = GF.composer;
  if (!C?._ready) return;
  C.clearAll();
  const keys = C.VAR_KEYS || ['A', 'B', 'C', 'D'];
  if (post.variationDeltas && Object.keys(post.variationDeltas).length) {
    C.setVariationDeltas(post.variationDeltas);
  } else if (post.variations?.length > 1) {
    keys.forEach((k, i) => {
      if (post.variations[i]) C.setEditorPlainText(C.editors[k], post.variations[i]);
    });
  } else {
    C.setEditorPlainText(C.editors.A, post.noi_dung || '');
  }
  C.setVariation('A');
  C.setBackground(post.backgroundColor || '#18191A');
  C.updateQualityBadge?.();
}

function loadPostMediaIntoManual(post) {
  state.manualMediaList = [];
  if (isColoredBackground(post.backgroundColor)) {
    renderManualMediaPreview();
    return;
  }
  if (post.mediaType === 'video' && post.videoBase64) {
    state.manualMediaList = [{
      id: manualMediaId(),
      type: 'video',
      base64: post.videoBase64,
      mime: post.mediaMime || 'video/mp4',
      name: 'video',
    }];
  } else {
    const imgs = getPostImagesLocal(post);
    state.manualMediaList = imgs.map((img, i) => ({
      id: manualMediaId(),
      type: 'image',
      base64: img.base64,
      mime: img.mime || 'image/png',
      name: img.name || `image-${i + 1}`,
    }));
  }
  renderManualMediaPreview();
}

async function openQueuePostForEdit(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  if (GF.postMediaStore) await GF.postMediaStore.hydratePost(post);
  ensurePostGroups(post);
  state.editingQueuePostId = postId;
  state.editingMediaSnapshot = capturePostMediaSnapshot(post);
  post._gfMediaBackup = state.editingMediaSnapshot;
  state.inlineGroupPickerPostId = null;

  $('#srcManual')?.click();
  showTab('create');
  $$('#tabBar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'create'));

  await waitComposerReady();
  loadPostTextIntoComposer(post);
  loadPostMediaIntoManual(post);

  if ($('#manualPrompt')) $('#manualPrompt').value = post.prompt_anh || '';
  if ($('#manualAutoImage')) $('#manualAutoImage').checked = post.autoGenerateImage !== false;
  if ($('#editScheduleDate')) $('#editScheduleDate').value = post.ngay_dang || '';
  if ($('#editScheduleTime')) $('#editScheduleTime').value = post.gio_dang || '';
  if ($('#manualFirstComment')) $('#manualFirstComment').value = post.firstComment || '';
  syncFirstCommentChipUI(post.firstCommentEnabled === true);

  state.manualGroupIds = new Set((post.groupIds || []).map(String));
  updateManualGroupSummary();
  renderManualGroupListOnly();
  syncComposeEditUI();
  updateBatchFooter();
  $('#manualPanel')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

function resolvePostMediaOnSave(post) {
  const backup = state.editingMediaSnapshot || post._gfMediaBackup;
  const colored = isColoredBackground(post.backgroundColor);

  if (colored) {
    post.imageBase64 = null;
    post.videoBase64 = null;
    post.images = null;
    post.mediaType = null;
    post.mediaMime = null;
    if (post.prompt_anh) post.imageStatus = 'pending';
    else post.imageStatus = null;
    return post;
  }

  if (manualMediaHasPayload()) {
    return applyManualMediaToPost(post);
  }
  if (postHasMedia(post)) {
    return post;
  }
  if (backup) {
    return restorePostMediaFromSnapshot(post, backup, { force: true });
  }
  if (post.prompt_anh) {
    post.imageStatus = 'pending';
  }
  return post;
}

function applyComposerToQueuePost(post) {
  ensureComposerInit();
  const text = GF.composer?.getPrimaryText() || '';
  const variations = GF.composer?.getVariationsArray() || [];
  if (!text) throw new Error('Nhập nội dung bài');

  const bg = GF.composer?.backgroundColor || '#18191A';
  const colored = isColoredBackground(bg);
  if (colored && !state.editingQueuePostId) {
    clearManualMediaForColoredPost({ silent: true });
  }

  post.noi_dung = text;
  post.variations = variations.length > 1 ? variations : [];
  post.variationDeltas = GF.composer?.getVariationDeltas() || {};
  post.prompt_anh = colored ? '' : ($('#manualPrompt')?.value.trim() || '');
  post.autoGenerateImage = colored ? false : $('#manualAutoImage')?.checked;
  if (state.editingQueuePostId) {
    post.ngay_dang = $('#editScheduleDate')?.value || '';
    post.gio_dang = $('#editScheduleTime')?.value || '';
  }
  post.campaignName = post.campaignName || '';
  post.campaignId = post.campaignId || '';
  post.backgroundColor = bg;
  post.firstComment = $('#manualFirstComment')?.value.trim() || '';
  post.firstCommentEnabled = $('#manualFirstCommentOn')?.checked === true;
  post.groupIds = [...state.manualGroupIds].slice(0, getMaxGroupsPerPost());

  resolvePostMediaOnSave(post);
  if (manualMediaHasPayload() && !postHasMedia(post)) {
    throw new Error('Không ghi được ảnh vào bài — thử lại');
  }
  applyManualAutomationToPost(post);
  delete post._gfMediaBackup;
  return post;
}

function postAutomationTags(p) {
  const mode = { fast: 'Nhanh', classic: 'Cổ điển' }[p.postMode] || '';
  const sec = { fast: 'Giãn nhanh', balanced: 'Cân bằng', safe: 'An toàn' }[p.securityLevel] || '';
  const parts = [];
  if (mode) parts.push(mode);
  if (sec) parts.push(sec);
  if (p.avoidNight !== false) parts.push('Tránh đêm');
  return parts.map((t) => `<span class="tag web">${esc(t)}</span>`).join('');
}

let manualPickerEventsBound = false;

function onManualPickerSearch(e) {
  if (e.target.id !== 'manualGroupSearch') return;
  if (e.type === 'input' && e.isComposing) return;
  state.manualGroupSearch = e.target.value;
  renderManualGroupListOnly();
}

function onManualPickerChange(e) {
  const cb = e.target;
  if (!cb.matches?.('[data-manual-group]')) return;
  const box = $('#manualGroupPicker');
  const max = getMaxGroupsPerPost();
  const id = String(cb.dataset.manualGroup);
  if (cb.checked) {
    if (state.manualGroupIds.size >= max) {
      cb.checked = false;
      alert(`Tối đa ${max} nhóm / bài`);
      return;
    }
    state.manualGroupIds.add(id);
  } else {
    state.manualGroupIds.delete(id);
  }
  const badge = box?.querySelector('.manual-pick-count');
  if (badge) badge.textContent = `${state.manualGroupIds.size}/${max}`;
  updateManualGroupSummary();
  scheduleManualDraftSave();
}

function onManualPickerClick(e) {
  const clearBtn = e.target.closest('#btnManualClearGroups');
  if (clearBtn) {
    e.preventDefault();
    state.manualGroupIds = new Set();
    renderManualGroupListOnly();
    updateManualGroupSummary();
    scheduleManualDraftSave();
    return;
  }
  const setBtn = e.target.closest('[data-manual-apply-set]');
  if (setBtn) {
    e.preventDefault();
    const set = state.customGroupSets.find((s) => s.id === setBtn.dataset.manualApplySet);
    if (!set) return;
    const max = getMaxGroupsPerPost();
    state.manualGroupIds = new Set(set.groupIds.slice(0, max).map(String));
    renderManualGroupListOnly();
    updateManualGroupSummary();
    scheduleManualDraftSave();
  }
}

function ensureManualPickerShell(box) {
  if (box.querySelector('#manualGroupList')) return;

  const max = getMaxGroupsPerPost();
  const setRow = state.customGroupSets.length
    ? `<p class="hint" style="margin:8px 0 4px">Bộ custom:</p>
      <div class="manual-set-row">${state.customGroupSets.map((s) => `
        <button type="button" class="btn ghost sm" data-manual-apply-set="${escAttr(s.id)}">${esc(s.name)} (${s.groupIds.length})</button>
      `).join('')}</div>`
    : '';

  box.innerHTML = `
    <div class="manual-group-toolbar">
      <div class="search-wrap manual-search-wrap">
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input type="search" id="manualGroupSearch" class="inline-group-search" placeholder="Gõ tên nhóm (không dấu cũng được)…" autocomplete="off" spellcheck="false" />
      </div>
      <span class="tag web manual-pick-count">${state.manualGroupIds.size}/${max}</span>
      <button type="button" class="btn ghost sm" id="btnManualClearGroups" title="Bỏ chọn">×</button>
    </div>
    <p class="hint manual-search-hint" id="manualGroupSearchHint"></p>
    ${setRow}
    <div id="manualGroupList" class="inline-group-list scroll-sm manual-group-scroll"></div>
  `;

  const search = box.querySelector('#manualGroupSearch');
  if (search) search.value = state.manualGroupSearch || '';

  if (!manualPickerEventsBound) {
    manualPickerEventsBound = true;
    box.addEventListener('input', onManualPickerSearch);
    box.addEventListener('compositionend', onManualPickerSearch);
    box.addEventListener('change', onManualPickerChange);
    box.addEventListener('click', onManualPickerClick);
  }
}

function renderManualGroupListOnly() {
  const box = $('#manualGroupPicker');
  if (!box) return;
  const list = box.querySelector('#manualGroupList');
  if (!list) return;

  const filtered = filterGroupsBySearch(state.groups, state.manualGroupSearch);
  const q = (state.manualGroupSearch || '').trim();
  const hint = box.querySelector('#manualGroupSearchHint');
  if (hint) {
    hint.textContent = !q
      ? `${state.groups.length} nhóm — gõ để lọc nhanh`
      : (filtered.length ? `${filtered.length} nhóm khớp «${q}»` : `Không có nhóm khớp «${q}»`);
  }

  const max = getMaxGroupsPerPost();
  list.innerHTML = filtered.slice(0, 150).map((g) => `
    <label class="check-row inline-group-item">
      <input type="checkbox" data-manual-group="${g.id}" ${state.manualGroupIds.has(String(g.id)) ? 'checked' : ''} />
      <span>${esc(g.name || `Group ${g.id}`)} ${groupMetaBadges(g)}</span>
    </label>
  `).join('') || '<p class="hint">Không có nhóm khớp tên tìm kiếm</p>';

  const badge = box.querySelector('.manual-pick-count');
  if (badge) badge.textContent = `${state.manualGroupIds.size}/${max}`;
}

function renderManualGroupPicker() {
  const box = $('#manualGroupPicker');
  if (!box) return;
  if (!state.manualGroupPickerOpen) return;
  if (!state.groups.length) {
    manualPickerEventsBound = false;
    box.innerHTML = `
      <p class="hint">Chưa có nhóm FB — mở tab <strong>Nhóm</strong> → ↻ Làm mới, hoặc:</p>
      <button type="button" class="btn ghost sm" id="btnManualSyncGroups">Sync nhóm ngay</button>
    `;
    box.querySelector('#btnManualSyncGroups')?.addEventListener('click', () => syncGroupsFromFb());
    return;
  }

  ensureManualPickerShell(box);
  renderManualGroupListOnly();
  updateManualGroupSummary();
}

function focusManualGroupSearch() {
  requestAnimationFrame(() => {
    const inp = document.getElementById('manualGroupSearch');
    if (!inp) return;
    inp.focus({ preventScroll: true });
    const len = inp.value.length;
    inp.setSelectionRange(len, len);
  });
}

function inlineCustomSetsRowHtml(postId) {
  if (!state.customGroupSets.length) {
    return '<p class="hint inline-set-hint">Chưa có bộ custom — tab <strong>Nhóm</strong> → tick nhóm → Lưu bộ</p>';
  }
  return `
    <p class="hint inline-set-label">Bộ custom — gán nhanh:</p>
    <div class="inline-custom-set-bar">
      ${state.customGroupSets.map((s) => `
        <button type="button" class="custom-set-chip" data-inline-apply-set="${escAttr(s.id)}" data-inline-post="${escAttr(postId)}" title="${escAttr(formatGroupList(s.groupIds))}">
          <span class="custom-set-chip-name">${esc(s.name)}</span>
          <span class="custom-set-chip-count">${s.groupIds.length}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function inlineGroupPickerHtml(post, { forceShow = false } = {}) {
  if (!forceShow && state.inlineGroupPickerPostId !== post.id) return '';
  const max = getMaxGroupsPerPost();
  const selected = new Set((post.groupIds || []).map(String));
  const groups = filterGroupsBySearch(state.groups, state.inlineGroupSearch);
  const items = groups.slice(0, 120).map((g) => `
    <label class="check-row inline-group-item">
      <input type="checkbox" data-inline-group="${g.id}" data-inline-post="${post.id}"
        ${selected.has(String(g.id)) ? 'checked' : ''} />
      <span>${esc(g.name || `Group ${g.id}`)}</span>
    </label>
  `).join('');
  return `
    <div class="inline-group-picker">
      ${inlineCustomSetsRowHtml(post.id)}
      <div class="search-wrap inline-search-wrap">
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input type="search" class="inline-group-search" placeholder="Gõ tên nhóm (không dấu cũng được)…" data-inline-search="${post.id}" value="${escAttr(state.inlineGroupSearch || '')}" autocomplete="off" spellcheck="false" />
      </div>
      <p class="hint inline-search-hint" data-inline-hint="${post.id}"></p>
      <div class="inline-group-list scroll-sm" data-inline-list="${post.id}">${items || '<p class="hint">Không có nhóm — sync tab Nhóm trước</p>'}</div>
      <div class="post-actions">
        <button type="button" class="btn primary sm" data-inline-done="${post.id}">Xong (${selected.size}/${max})</button>
        <button type="button" class="btn ghost sm" data-goto-groups-batch="${post.id}">Tab Nhóm (batch)</button>
      </div>
    </div>
  `;
}

function postHasMedia(post) {
  if (post?.videoBase64) return true;
  if (post?.imageBase64) return true;
  return getPostImagesLocal(post).some((img) => img?.base64);
}

function manualMediaHasPayload() {
  return state.manualMediaList.some((m) => m?.base64);
}

// Khi chính panel này ghi postQueue, listener storage.onChanged bên dưới không cần vẽ lại
// toàn bộ danh sách bài — state.posts đã đúng và các chỗ cần cập nhật (đếm nhóm, tag...) đã
// được sửa trực tiếp tại nơi gọi. Không suppress thì mỗi lần tick 1 nhóm sẽ làm render lại
// hết danh sách, xóa mất vị trí cuộn/ô tìm kiếm đang mở trong khung chọn nhóm inline.
let suppressPostQueueRerender = false;

async function savePostsQuiet() {
  suppressPostQueueRerender = true;
  try {
    const PMS = GF.postMediaStore;
    if (!PMS) {
      await chrome.storage.local.set({ postQueue: state.posts });
      return;
    }
    await hydrateCachedMediaInPosts();
    await PMS.persistAll(state.posts);
    await chrome.storage.local.set({ postQueue: state.posts.map((p) => PMS.stripForQueue(p)) });
  } finally {
    setTimeout(() => { suppressPostQueueRerender = false; }, 200);
  }
}

async function savePosts() {
  try {
    await savePostsQuiet();
  } catch (e) {
    if (/quota|QUOTA|exceeded/i.test(e.message || '')) {
      throw new Error('Queue quá lớn — giảm số ảnh hoặc xóa bài cũ rồi lưu lại');
    }
    throw e;
  }
  updateGroupsTabBadge();
}

function updateInlineGroupSearchList(input) {
  const postId = input.dataset.inlineSearch;
  const post = state.posts.find((x) => x.id === postId);
  if (!post) return;
  const picker = input.closest('.inline-group-picker');
  const list = picker?.querySelector('[data-inline-list]') || picker?.querySelector('.inline-group-list');
  const hint = picker?.querySelector('[data-inline-hint]');
  if (!list) return;
  const selected = new Set((post.groupIds || []).map(String));
  const groups = filterGroupsBySearch(state.groups, state.inlineGroupSearch);
  const q = (state.inlineGroupSearch || '').trim();
  if (hint) {
    hint.textContent = !q
      ? `${state.groups.length} nhóm — gõ để lọc`
      : (groups.length ? `${groups.length} nhóm khớp «${q}»` : `Không có nhóm khớp «${q}»`);
  }
  list.innerHTML = groups.slice(0, 120).map((g) => `
    <label class="check-row inline-group-item">
      <input type="checkbox" data-inline-group="${g.id}" data-inline-post="${postId}"
        ${selected.has(String(g.id)) ? 'checked' : ''} />
      <span>${esc(g.name || `Group ${g.id}`)}</span>
    </label>
  `).join('') || '<p class="hint">Không tìm thấy nhóm</p>';
  bindInlineGroupChecks(list);
}

function bindInlineGroupSearchInput(input) {
  const onSearch = () => {
    state.inlineGroupSearch = input.value;
    updateInlineGroupSearchList(input);
  };
  input.addEventListener('input', (e) => {
    if (e.isComposing) return;
    onSearch();
  });
  input.addEventListener('compositionend', onSearch);
  updateInlineGroupSearchList(input);
  requestAnimationFrame(() => input.focus({ preventScroll: true }));
}

function bindInlineGroupChecks(root) {
  root.querySelectorAll('[data-inline-group]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      const post = state.posts.find((x) => x.id === cb.dataset.inlinePost);
      if (!post) return;
      ensurePostGroups(post);
      const id = String(cb.dataset.inlineGroup);
      const max = getMaxGroupsPerPost();
      if (cb.checked) {
        if (!post.groupIds.includes(id) && post.groupIds.length >= max) {
          cb.checked = false;
          return alert(`Tối đa ${max} nhóm / bài`);
        }
        if (!post.groupIds.includes(id)) post.groupIds.push(id);
      } else {
        post.groupIds = post.groupIds.filter((x) => String(x) !== id);
      }
      await savePosts();
      const doneBtn = root.querySelector(`[data-inline-done="${post.id}"]`);
      if (doneBtn) doneBtn.textContent = `Xong (${post.groupIds.length}/${max})`;
      const card = root.closest('.post-card');
      const summary = card?.querySelector('.post-meta .tag.pending, .post-meta .tag.web');
      if (summary) {
        summary.textContent = postGroupSummary(post);
        summary.className = `tag ${post.groupIds.length ? 'web' : 'pending'}`;
      }
      const editSummary = card?.querySelector('.post-edit-groups-summary');
      if (editSummary) editSummary.textContent = formatGroupList(post.groupIds);
    });
  });
}

function applyGroupsToSelectedPosts(groupIds, { replace = true } = {}) {
  const postIds = [...state.assignPostIds];
  if (!postIds.length) throw new Error('Chọn ít nhất 1 bài trong tab Nhóm');
  const ids = [...new Set(groupIds.map(String))];
  if (!ids.length) throw new Error('Chọn ít nhất 1 nhóm hoặc bộ custom');
  const max = getMaxGroupsPerPost();
  const applied = ids.slice(0, max);
  state.posts.forEach((post) => {
    if (!postIds.includes(post.id)) return;
    ensurePostGroups(post);
    post.groupIds = replace ? [...applied] : [...new Set([...post.groupIds, ...applied])].slice(0, max);
  });
}

function postPreviewThumbs(p) {
  if (p.mediaCached && !postHasMedia(p)) {
    return '<span class="thumb thumb-placeholder" title="Ảnh đã lưu">🖼</span>';
  }
  if (p.mediaType === 'video' && p.videoBase64) {
    return `<video class="thumb" src="data:${escAttr(p.mediaMime || 'video/mp4')};base64,${p.videoBase64}" muted></video>`;
  }
  const imgs = getPostImagesLocal(p);
  if (!imgs.length) return '';
  const shown = imgs.slice(0, 4).map((img) => (
    `<img class="thumb" src="data:${escAttr(img.mime || 'image/png')};base64,${img.base64}" alt="" />`
  )).join('');
  const more = imgs.length > 4 ? `<span class="thumb-more">+${imgs.length - 4}</span>` : '';
  return `${shown}${more}`;
}

function composerHasDraftText() {
  try {
    return Boolean(GF.composer?.getPrimaryText()?.trim());
  } catch {
    return false;
  }
}

function normalizeGioForTimeInput(gio) {
  const parts = String(gio || '').trim().split(':');
  if (parts.length < 2) return '';
  return `${String(Number(parts[0])).padStart(2, '0')}:${parts[1].slice(0, 2).padStart(2, '0')}`;
}

let scheduleFooterInternal = false;
let scheduleFooterSaveTimer = null;

/** Thanh dưới phản ánh lịch bài đang tick (1 bài hoặc nhiều bài cùng giờ). */
function syncQueueScheduleFooterFromSelection() {
  if (scheduleFooterInternal) return;
  const dateEl = $('#queueScheduleDate');
  const timeEl = $('#queueScheduleTime');
  if (!dateEl || !timeEl) return;

  const selected = getSelectedPosts();
  if (!selected.length) return;

  const ref = selected[0];
  const allSame = selected.every(
    (p) => p.ngay_dang === ref.ngay_dang && p.gio_dang === ref.gio_dang,
  );
  if (!allSame || !ref.ngay_dang || !ref.gio_dang) return;

  dateEl.value = ref.ngay_dang;
  timeEl.value = normalizeGioForTimeInput(ref.gio_dang);
}

function onQueueScheduleFooterChange() {
  clearTimeout(scheduleFooterSaveTimer);
  scheduleFooterSaveTimer = setTimeout(async () => {
    const { ngay_dang, gio_dang } = readQueueScheduleFields();
    if (!ngay_dang || !gio_dang) return;
    const selected = getSelectedPosts();
    if (!selected.length) return;
    scheduleFooterInternal = true;
    for (const post of selected) {
      post.ngay_dang = ngay_dang;
      post.gio_dang = gio_dang;
    }
    scheduleFooterInternal = false;
    await savePostsQuiet();
    try {
      await commitPostSchedules(selected, { toast: true });
    } catch (e) {
      showToast(e.message || 'Không hẹn được', 'error', 5000);
    }
    scheduleRenderPosts();
  }, 450);
}

function postScheduleTagHtml(p) {
  if (p.ngay_dang && p.gio_dang) {
    return `<button type="button" class="tag tag-schedule tag-clickable" data-edit-schedule="${escAttr(p.id)}" title="Bấm sửa giờ đăng">Đăng: ${esc(p.ngay_dang)} ${esc(p.gio_dang)}</button>`;
  }
  return `<button type="button" class="tag tag-schedule tag-clickable tag-pending" data-edit-schedule="${escAttr(p.id)}" title="Hẹn giờ đăng">+ Hẹn giờ</button>`;
}

async function focusPostScheduleEdit(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  state.posts.forEach((p) => { p.selected = p.id === postId; });
  await savePosts();
  syncQueueScheduleFooterFromSelection();
  if (!post.ngay_dang || !post.gio_dang) {
    initQueueScheduleDefaults();
    const footer = readQueueScheduleFields();
    if (footer.ngay_dang && footer.gio_dang) {
      post.ngay_dang = footer.ngay_dang;
      post.gio_dang = footer.gio_dang;
      await savePostsQuiet();
    }
  }
  updateBatchFooter();
  renderPosts();
  $('#batchFooterGlobal')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  window.setTimeout(() => $('#queueScheduleTime')?.focus(), 200);
}

function updateBatchFooter() {
  const selected = getSelectedPosts().length;
  const total = state.posts.length;
  const label = $('#batchFooterLabel');
  if (label) {
    if (!total) {
      label.textContent = 'Tick bài → chọn ngày/giờ → Lên lịch';
    } else if (!selected) {
      label.textContent = `${total} bài — tick để hẹn lịch · đăng ngay: nút Đăng trên từng card`;
    } else {
      label.textContent = `${selected}/${total} bài đã chọn — Lên lịch hoặc Dàn`;
    }
  }
  syncQueueScheduleFooterFromSelection();
}

function getFilteredPosts() {
  let posts = state.posts;
  const q = (state.postSearch || '').trim().toLowerCase();
  if (q) posts = posts.filter((p) => (p.noi_dung || '').toLowerCase().includes(q));
  if (state.postFilterGroup === 'has') posts = posts.filter((p) => p.groupIds?.length > 0);
  else if (state.postFilterGroup === 'none') posts = posts.filter((p) => !p.groupIds?.length);
  if (state.postFilterImage === 'has') posts = posts.filter((p) => postHasMedia(p) || p.mediaCached);
  else if (state.postFilterImage === 'none') posts = posts.filter((p) => !postHasMedia(p) && !p.mediaCached);
  return posts;
}

function renderPosts() {
  const box = $('#postList');
  const countEl = $('#postCount');
  const filtered = getFilteredPosts();
  const total = state.posts.length;
  if (countEl) {
    countEl.textContent = filtered.length < total
      ? `${filtered.length}/${total}`
      : String(total);
  }

  if (!state.posts.length) {
    box.innerHTML = emptyState('📋', 'Chưa có bài trong queue — import Excel hoặc tải từ web');
    updatePostsBulkBar();
    updateBatchFooter();
    return;
  }

  if (!filtered.length) {
    box.innerHTML = emptyState('🔍', 'Không có bài khớp bộ lọc');
    updatePostsBulkBar();
    updateBatchFooter();
    return;
  }

  box.innerHTML = filtered.map((p) => {
    ensurePostGroups(p);
    const isEditingInCompose = p.id === state.editingQueuePostId;
    const hasMedia = postHasMedia(p) || p.mediaCached;
    const noGroups = !p.groupIds.length;
    const previewMedia = hasMedia ? postPreviewThumbs(p) : '';
    const postedClass = p.postStatus === 'posted' ? 'post-published' : (p.postStatus === 'failed' ? 'post-failed' : '');
    const isPostingThis = state.postingPostId === p.id;
    return `
    <div class="list-item post-card ${noGroups ? 'post-needs-groups' : ''} ${postedClass} ${isEditingInCompose ? 'post-editing-compose' : ''} ${isPostingThis ? 'post-posting-now' : ''}">
      <div class="check-row post-preview-row">
        <input type="checkbox" data-post-id="${p.id}" ${p.selected === true ? 'checked' : ''} />
        <div class="post-preview-main">
          <div class="post-body">${esc(p.noi_dung?.slice(0, 120) || '—')}</div>
          ${previewMedia ? `<div class="post-preview-media">${previewMedia}</div>` : ''}
        </div>
      </div>
      <div class="post-meta">
        ${postStatusTag(p)}
        ${isEditingInCompose ? '<span class="tag ready">Đang sửa ↑</span>' : ''}
        <span class="tag ${p.groupIds.length ? 'web' : 'pending'}">${esc(postGroupSummary(p))}</span>
        ${p.campaignName ? `<span class="tag web">${esc(p.campaignName)}</span>` : ''}
        ${p.variations?.length > 1 ? `<span class="tag">${p.variations.length} biến thể</span>` : ''}
        ${p.backgroundColor && p.backgroundColor !== '#18191A' ? '<span class="tag">Nền màu</span>' : ''}
        ${p.firstCommentEnabled ? '<span class="tag ready">1st cmt</span>' : ''}
        ${postAutomationTags(p)}
        ${p.is_shared ? '<span class="tag">Shared</span>' : ''}
        ${imageTag(p.imageStatus, p.mediaType)}
        ${!hasMedia && p.prompt_anh && p.autoGenerateImage !== false ? '<span class="tag ready">Tự xuất ảnh</span>' : ''}
        ${!hasMedia && p.prompt_anh && p.autoGenerateImage === false ? '<span class="tag">Chỉ text</span>' : ''}
        ${p.anh_ngay_dang ? `<span class="tag">Ảnh: ${esc(p.anh_ngay_dang)} ${esc(p.anh_gio_dang || '')}</span>` : ''}
        ${postScheduleTagHtml(p)}
        ${p.lastPostedAt ? `<span class="tag ready">Lúc ${esc(formatPostedAt(p.lastPostedAt))}</span>` : ''}
      </div>
      ${renderPostedGroupsBlock(p)}
      ${inlineGroupPickerHtml(p)}
      <div class="post-actions">
        <button type="button" class="btn primary sm" data-post-now="${p.id}" ${noGroups || isPostingThis ? 'disabled' : ''} title="${noGroups ? 'Chọn nhóm trước' : 'Chỉ đăng bài này'}">${isPostingThis ? 'Đang đăng…' : 'Đăng'}</button>
        <button type="button" class="btn ghost sm accent" data-toggle-groups="${p.id}">${state.inlineGroupPickerPostId === p.id ? 'Đóng nhóm' : 'Chọn nhóm'}</button>
        <button type="button" class="btn ghost sm" data-edit-post="${p.id}">${isEditingInCompose ? 'Tiếp tục sửa ↑' : 'Sửa'}</button>
        ${!hasMedia && p.prompt_anh ? `<button type="button" class="btn ghost sm accent" data-gen="${p.id}">Xuất ảnh</button>` : ''}
        <button type="button" class="btn ghost sm" data-del-post="${p.id}">Xóa</button>
        ${postAutoImageToggleHtml(p, hasMedia)}
      </div>
    </div>
  `;
  }).join('');

  box.querySelectorAll('[data-post-id]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const post = state.posts.find((x) => x.id === cb.dataset.postId);
      if (post) post.selected = cb.checked;
      savePosts();
      updateBatchFooter();
      updatePostsBulkBar();
    });
  });
  box.querySelectorAll('[data-inline-apply-set]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await applyCustomSetToPost(btn.dataset.inlinePost, btn.dataset.inlineApplySet);
    });
  });
  box.querySelectorAll('[data-toggle-groups]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleGroups;
      state.inlineGroupPickerPostId = state.inlineGroupPickerPostId === id ? null : id;
      state.inlineGroupSearch = '';
      renderPosts();
    });
  });
  box.querySelectorAll('[data-inline-search]').forEach((input) => bindInlineGroupSearchInput(input));
  box.querySelectorAll('[data-inline-done]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.inlineGroupPickerPostId = null;
      state.inlineGroupSearch = '';
      await savePosts();
      renderPosts();
    });
  });
  box.querySelectorAll('[data-goto-groups-batch]').forEach((btn) => {
    btn.addEventListener('click', () => gotoGroupsTab(btn.dataset.gotoGroupsBatch));
  });
  bindInlineGroupChecks(box);
  bindPostedGroupActions(box);
  box.querySelectorAll('[data-edit-schedule]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      focusPostScheduleEdit(btn.dataset.editSchedule);
    });
  });
  box.querySelectorAll('[data-post-now]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      postSingleNow(btn.dataset.postNow);
    });
  });
  box.querySelectorAll('[data-auto-img]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      const post = state.posts.find((x) => x.id === cb.dataset.autoImg);
      if (!post) return;
      post.autoGenerateImage = cb.checked;
      await savePostsQuiet();
      renderPosts();
    });
  });
  box.querySelectorAll('[data-edit-post]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openQueuePostForEdit(btn.dataset.editPost);
    });
  });
  box.querySelectorAll('[data-gen]').forEach((btn) => {
    btn.addEventListener('click', () => generateOne(btn.dataset.gen));
  });
  box.querySelectorAll('[data-del-post]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delPost;
      state.posts = state.posts.filter((x) => x.id !== id);
      state.assignPostIds.delete(id);
      if (state.editingQueuePostId === id) clearComposerEditMode();
      await GF.postMediaStore?.delete(id);
      await savePosts();
      renderPosts();
      renderGroupsTab();
    });
  });
  updateBatchFooter();
  updatePostsBulkBar();
}

function renderGroupsTab() {
  renderAssignPosts();
  renderCustomSetQuickBar();
  renderGroupLibrary();
  renderCustomSets();
  syncCustomSetToolbarUI();
  const countEl = $('#groupCount');
  if (countEl) countEl.textContent = String(state.groups.length);
  const pickerCount = $('#assignPickerCount');
  if (pickerCount) pickerCount.textContent = String(state.assignGroupIds.size);
  const setCount = $('#customSetCount');
  if (setCount) setCount.textContent = String(state.customGroupSets.length);
}

function syncCustomSetToolbarUI() {
  const editing = Boolean(state.editingCustomSetId);
  $('#btnCancelEditSet')?.classList.toggle('hidden', !editing);
  const saveBtn = $('#btnSaveCustomSet');
  if (saveBtn) saveBtn.textContent = editing ? 'Cập nhật bộ' : 'Lưu bộ';
  const hint = $('#customSetHint');
  if (hint && editing) {
    const set = state.customGroupSets.find((s) => s.id === state.editingCustomSetId);
    hint.innerHTML = `Đang sửa bộ <strong>${esc(set?.name || '')}</strong> — tick/bỏ tick nhóm FB → <strong>Cập nhật bộ</strong>`;
  } else if (hint) {
    hint.innerHTML = 'Tick nhóm FB bên dưới → <strong>Lưu bộ</strong>. Bấm chip bộ → gán cho bài đã tick ở trên.';
  }
}

function renderCustomSetQuickBar() {
  const bar = $('#customSetQuickBar');
  if (!bar) return;
  if (!state.customGroupSets.length) {
    bar.innerHTML = '<span class="hint custom-set-empty">Chưa có bộ — tick nhóm FB rồi bấm Lưu bộ</span>';
    return;
  }
  bar.innerHTML = state.customGroupSets.map((set) => `
    <button type="button" class="custom-set-chip" data-apply-set="${escAttr(set.id)}" title="${escAttr(formatGroupList(set.groupIds))}">
      <span class="custom-set-chip-name">${esc(set.name)}</span>
      <span class="chip sm">${set.groupIds.length}</span>
    </button>
  `).join('');

  bar.querySelectorAll('[data-apply-set]').forEach((btn) => {
    btn.addEventListener('click', () => applyCustomSetToPosts(btn.dataset.applySet));
  });
}

async function applyCustomSetToPost(postId, setId) {
  const post = state.posts.find((p) => p.id === postId);
  const set = state.customGroupSets.find((s) => s.id === setId);
  if (!post || !set) return;
  const max = getMaxGroupsPerPost();
  ensurePostGroups(post);
  post.groupIds = set.groupIds.slice(0, max).map(String);
  await savePosts();
  state.inlineGroupPickerPostId = postId;
  renderPosts();
  showToast(`Đã gán bộ「${set.name}」→ ${post.groupIds.length} nhóm`, 'success');
}

async function applyCustomSetToPosts(setId) {
  const set = state.customGroupSets.find((s) => s.id === setId);
  if (!set) return;
  try {
    applyGroupsToSelectedPosts(set.groupIds);
    await saveGroupsData();
    renderPosts();
    renderGroupsTab();
    showToast(`Đã gán bộ「${set.name}」→ ${state.assignPostIds.size} bài`, 'success');
  } catch (e) {
    alert(e.message);
  }
}

function startEditCustomSet(setId) {
  const set = state.customGroupSets.find((s) => s.id === setId);
  if (!set) return;
  state.editingCustomSetId = setId;
  state.assignGroupIds = new Set(set.groupIds.map(String));
  if ($('#customSetName')) $('#customSetName').value = set.name;
  renderGroupsTab();
  $('#customSetName')?.focus();
}

function cancelEditCustomSet() {
  state.editingCustomSetId = null;
  if ($('#customSetName')) $('#customSetName').value = '';
  syncCustomSetToolbarUI();
}

function renderAssignPosts() {
  const box = $('#assignPostList');
  if (!box) return;
  const selected = state.posts.filter((p) => state.assignPostIds.has(p.id));
  const countEl = $('#assignPostCount');
  if (countEl) countEl.textContent = String(selected.length);

  if (!state.posts.length) {
    box.innerHTML = emptyState('📋', 'Chưa có bài — thêm ở tab Tạo bài');
    return;
  }

  box.innerHTML = state.posts.map((p) => {
    ensurePostGroups(p);
    const checked = state.assignPostIds.has(p.id);
    return `
    <label class="group-row assign-post-row ${checked ? 'selected' : ''}">
      <input type="checkbox" data-assign-post="${p.id}" ${checked ? 'checked' : ''} />
      <span class="group-info">
        <span class="group-name">${esc(p.noi_dung?.slice(0, 50) || '—')}</span>
        <span class="group-meta">${esc(postGroupSummary(p))}</span>
      </span>
    </label>
  `;
  }).join('');

  const allChecked = state.posts.length > 0 && state.posts.every((p) => state.assignPostIds.has(p.id));
  const selectAll = $('#selectAllAssignPosts');
  if (selectAll) selectAll.checked = allChecked;

  box.querySelectorAll('[data-assign-post]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) state.assignPostIds.add(cb.dataset.assignPost);
      else state.assignPostIds.delete(cb.dataset.assignPost);
      renderAssignPosts();
    });
  });
}

function renderGroupLibrary() {
  const box = $('#groupLibraryList');
  if (!box) return;
  const filtered = filterGroupsForLibrary(state.groups);
  const pickerIds = state.assignGroupIds;

  const emptyMsg = state.groups.length
    ? 'Không có nhóm khớp tìm kiếm'
    : 'Đang chờ đồng bộ nhóm từ Facebook…';

  box.innerHTML = filtered.length
    ? filtered.map((g) => `
    <label class="group-row ${pickerIds.has(String(g.id)) ? 'selected' : ''}">
      <input type="checkbox" data-picker-group="${g.id}" ${pickerIds.has(String(g.id)) ? 'checked' : ''} />
      <span class="group-avatar">${esc(groupInitial(g.name))}</span>
      <span class="group-info">
        <span class="group-name">${esc(g.name)}</span>
        <span class="group-meta">${groupMetaBadges(g)}</span>
      </span>
    </label>
  `).join('')
    : emptyState('◎', emptyMsg);

  const selectAll = $('#selectAllPickerGroups');
  if (selectAll) {
    selectAll.checked = filtered.length > 0 && filtered.every((g) => pickerIds.has(String(g.id)));
  }

  box.querySelectorAll('[data-picker-group]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const gid = String(cb.dataset.pickerGroup);
      if (cb.checked) state.assignGroupIds.add(gid);
      else state.assignGroupIds.delete(gid);
      renderGroupsTab();
    });
  });
}

function renderCustomSets() {
  const box = $('#customSetList');
  if (!box) return;
  if (!state.customGroupSets.length) {
    box.innerHTML = emptyState('📁', 'Chưa có bộ — tick nhóm FB rồi Lưu bộ');
    return;
  }
  box.innerHTML = state.customGroupSets.map((set) => `
    <div class="list-item custom-set-card ${state.editingCustomSetId === set.id ? 'custom-set-editing' : ''}">
      <div class="custom-set-head">
        <strong>${esc(set.name)}</strong>
        <span class="tag">${set.groupIds.length} nhóm</span>
      </div>
      <div class="hint">${esc(formatGroupList(set.groupIds))}</div>
      <div class="post-actions">
        <button type="button" class="btn primary sm" data-apply-set="${escAttr(set.id)}">Gán bài</button>
        <button type="button" class="btn ghost sm accent" data-edit-set-groups="${escAttr(set.id)}">Sửa nhóm</button>
        <button type="button" class="btn ghost sm" data-edit-set="${escAttr(set.id)}">Đổi tên</button>
        <button type="button" class="btn ghost sm" data-del-set="${escAttr(set.id)}">Xóa</button>
      </div>
    </div>
  `).join('');

  box.querySelectorAll('[data-apply-set]').forEach((btn) => {
    btn.addEventListener('click', () => applyCustomSetToPosts(btn.dataset.applySet));
  });
  box.querySelectorAll('[data-edit-set-groups]').forEach((btn) => {
    btn.addEventListener('click', () => {
      startEditCustomSet(btn.dataset.editSetGroups);
      $('#customSetDetails')?.setAttribute('open', '');
    });
  });
  box.querySelectorAll('[data-edit-set]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const set = state.customGroupSets.find((s) => s.id === btn.dataset.editSet);
      if (!set) return;
      const name = window.prompt('Tên bộ nhóm:', set.name);
      if (!name?.trim()) return;
      await GF.groupSets.update(set.id, { name: name.trim() });
      state.customGroupSets = await GF.groupSets.getAll();
      renderGroupsTab();
      showToast('Đã đổi tên bộ', 'success');
    });
  });
  box.querySelectorAll('[data-del-set]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Xóa bộ custom này?')) return;
      if (state.editingCustomSetId === btn.dataset.delSet) cancelEditCustomSet();
      state.customGroupSets = await GF.groupSets.remove(btn.dataset.delSet);
      await saveGroupsData();
      renderGroupsTab();
      showToast('Đã xóa bộ', 'info');
    });
  });
}

function switchGroupsSubTab(name) {
  state.groupsSubTab = name;
  $$('[data-groups-sub]').forEach((b) => b.classList.toggle('active', b.dataset.groupsSub === name));
  $('#groupsSubFb')?.classList.toggle('hidden', name !== 'fb');
  $('#groupsSubCustom')?.classList.toggle('hidden', name !== 'custom');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function postNeedsScheduledImage(post) {
  return GF.postMedia?.needsImageGeneration(post) ?? false;
}

async function scheduleImageAlarm(post, imageWhen, upcoming) {
  const imgAlarm = `gf_img_${post.id}_${Date.now()}`;
  const payload = { posts: [stripPostForJob(post)] };
  await gfScheduleAlarm({
    name: imgAlarm,
    when: imageWhen,
    data: { kind: 'generate_image', payload },
  });
  upcoming.push({
    id: imgAlarm,
    alarmName: imgAlarm,
    kind: 'generate_image',
    when: imageWhen,
    postId: post.id,
    snippet: post.noi_dung?.slice(0, 80) || '',
    payload,
    label: `Xuất ảnh — ${(post.noi_dung || 'bài').slice(0, 36)}…`,
  });
}

async function generateOne(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (postHasMedia(post)) return alert('Bài đã có ảnh/video — xóa media trong Sửa nếu muốn generate lại');
  if (!post?.prompt_anh) return alert('Thiếu prompt ảnh');
  const s = await GF.storage.getSettings();
  if (!(await aiImageReady())) {
    return alert('Chọn Image provider trong Cài đặt hoặc nhập 9Router API key');
  }
  try {
    post.imageStatus = 'generating';
    renderPosts();
    const img = await GF.aiApi.generateImage(post.prompt_anh);
    post.imageBase64 = img.base64;
    post.mediaType = 'image';
    post.mediaMime = img.mime || 'image/png';
    post.imageStatus = 'ready';
    await GF.imageGen.saveLocal(img.base64, `groupflow-${postId}.png`, s);
    post.imageLocal = true;
    if (s.driveJson && s.driveFolderId) {
      post.imageDriveId = await GF.googleDrive.uploadBase64(
        img.base64, img.mime, `groupflow-${postId}.png`, s.driveFolderId, s.driveJson
      );
    }
    await savePosts();
    renderPosts();
  } catch (e) {
    post.imageStatus = 'error';
    renderPosts();
    alert(e.message);
  }
}

async function generateAll() {
  for (const p of state.posts.filter((x) => x.selected === true && !x.imageBase64 && !x.videoBase64)) {
    await generateOne(p.id);
  }
}

function getSelectedPosts() {
  return state.posts.filter((p) => p.selected === true);
}

function buildPostJob(sync = true) {
  const posts = getSelectedPosts().map((p) => ensurePostGroups({ ...p }));
  if (!posts.length) throw new Error('Chọn ít nhất 1 bài (tick checkbox)');
  const missing = posts.filter((p) => !p.groupIds.length);
  if (missing.length) {
    throw new Error(`${missing.length} bài chưa có nhóm — sang tab Nhóm để gán`);
  }
  return { posts, sync };
}

function stripPostForJob(post) {
  const lite = { ...post };
  delete lite.imageBase64;
  delete lite.videoBase64;
  delete lite.images;
  delete lite._gfMediaBackup;
  return lite;
}

function buildSchedulePostPayload(posts, settings) {
  return {
    posts: posts.map((p) => stripPostForJob(ensurePostAutomation({ ...p }, settings))),
    sync: true,
    postMode: settings.postMode,
    actorId: state.activeActorId || settings.activeActorId,
  };
}

async function gfScheduleAlarm({ name, when, data }) {
  const res = await gfSendMessage({
    type: 'GF_SCHEDULE_ALARM',
    name,
    when,
    data,
  });
  if (res?.error) throw new Error(res.error);
  if (res?.ok === false) throw new Error(res.error || 'Không tạo được alarm — reload extension rồi thử lại');
  return res;
}

async function cancelPostScheduleAlarms(postId) {
  const d = await chrome.storage.local.get('activityUpcoming');
  const upcoming = d.activityUpcoming || [];
  for (const item of upcoming.filter((u) => u.kind === 'post' && u.postId === postId)) {
    const name = item.alarmName || item.id;
    if (name) await gfSendMessage({ type: 'GF_CANCEL_ALARM', name }).catch(() => {});
  }
  return upcoming.filter((u) => !(u.kind === 'post' && u.postId === postId));
}

/** Đăng ký Chrome alarm + activityUpcoming cho một bài (gọi khi đổi giờ hoặc Lên lịch). */
async function upsertSinglePostSchedule(post, settings, upcoming, seq = 0) {
  if (!post.groupIds?.length) {
    throw new Error('Chưa có nhóm — gán nhóm trước khi hẹn giờ');
  }
  const when = GF.scheduler.parseScheduleDate(post.ngay_dang, post.gio_dang);
  if (!when) throw new Error('Ngày/giờ không hợp lệ');
  if (when <= Date.now()) throw new Error('Giờ đăng phải trong tương lai');

  if (postNeedsScheduledImage(post)) {
    const imageWhen = GF.scheduler.parseScheduleDate(post.anh_ngay_dang, post.anh_gio_dang);
    if (imageWhen) {
      if (imageWhen >= when) throw new Error('Lịch xuất ảnh phải trước giờ đăng');
      if (imageWhen < Date.now()) throw new Error('Lịch xuất ảnh phải trong tương lai');
      await scheduleImageAlarm(post, imageWhen, upcoming);
    }
  }

  const alarmName = `gf_job_${post.id}_${Date.now()}_${seq}`;
  const payload = buildSchedulePostPayload([post], settings);
  await gfScheduleAlarm({
    name: alarmName,
    when,
    data: { kind: 'post', payload },
  });
  upcoming.push({
    id: alarmName,
    alarmName,
    kind: 'post',
    when,
    postId: post.id,
    snippet: post.noi_dung?.slice(0, 80) || '',
    groupIds: [...post.groupIds],
    payload,
    label: `Đăng → ${formatGroupList(post.groupIds)}`,
  });
  return alarmName;
}

async function commitPostSchedules(posts, { toast = true } = {}) {
  const settings = await GF.storage.getSettings();
  let upcoming = (await chrome.storage.local.get('activityUpcoming')).activityUpcoming || [];
  const ids = new Set(posts.map((p) => p.id));
  for (const item of upcoming.filter((u) => u.kind === 'post' && ids.has(u.postId))) {
    const name = item.alarmName || item.id;
    if (name) await gfSendMessage({ type: 'GF_CANCEL_ALARM', name }).catch(() => {});
  }
  upcoming = upcoming.filter((u) => !(u.kind === 'post' && ids.has(u.postId)));
  for (let i = 0; i < posts.length; i += 1) {
    await upsertSinglePostSchedule(posts[i], settings, upcoming, i);
  }
  await chrome.storage.local.set({ activityUpcoming: upcoming });
  if (toast) {
    const n = posts.length;
    showToast(
      n === 1 ? 'Đã hẹn đăng — extension chạy đúng giờ (giữ Chrome mở)' : `Đã hẹn ${n} bài`,
      'success',
      4500,
    );
  }
  return posts.length;
}

async function handleComposePostAction() {
  try {
    if (state.editingQueuePostId) {
      await saveComposePostToQueue({ selectOnly: true });
      const post = state.posts.find((p) => p.id === state.editingQueuePostId);
      if (!post?.groupIds?.length) throw new Error('Chọn ít nhất 1 nhóm');
      await postSingleNow(post.id);
      await finishComposeEditSave('Đã cập nhật & đăng');
      return;
    }
    if (!composerHasDraftText()) throw new Error('Soạn nội dung trước');
    const post = await saveComposePostToQueue({ selectOnly: true });
    if (!post.groupIds?.length) throw new Error('Chọn ít nhất 1 nhóm');
    await postSingleNow(post.id);
    await resetComposeFormAfterSave();
  } catch (e) {
    alert(e.message);
  }
}

/** Chỉ đăng đúng 1 bài — không lấy bài đã tick, không đăng batch. */
async function postSingleNow(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  ensurePostGroups(post);
  if (!post.groupIds?.length) {
    alert('Chưa có nhóm — bấm Chọn nhóm trên card hoặc tab Nhóm');
    return;
  }
  if (state.postingPostId) {
    alert('Đang đăng bài khác — chờ xong hoặc bấm Dừng');
    return;
  }
  try {
    const settings = await GF.storage.getSettings();
    state.postingPostId = postId;
    renderPosts();
    await panelEngineLog({
      level: 'info',
      phase: 'post-start',
      message: `Bắt đầu đăng bài → ${post.groupIds.length} nhóm (${formatGroupList(post.groupIds)})`,
    });
    await runPostJob([post], settings, { singlePostId: postId });
  } catch (e) {
    state.postingPostId = null;
    hidePostingUI();
    await panelEngineLog({
      level: 'error',
      phase: 'post-start',
      message: 'Không gửi được lệnh đăng',
      error: e.message,
    });
    alert(e.message);
  }
}

async function runPostJob(posts, settings, { singlePostId = null } = {}) {
  if (!posts?.length) throw new Error('Không có bài để đăng');
  if (singlePostId) {
    posts = posts.filter((p) => p.id === singlePostId);
    if (!posts.length) throw new Error('Không tìm thấy bài');
  }
  await hydratePostsForJob(posts);
  const prepared = posts.map((p) => ensurePostAutomation({ ...p }, settings));

  const nightSensitive = prepared.filter((p) => p.avoidNight !== false);
  if (nightSensitive.length && GF.scheduler.isNightBlocked()) {
    if (!window.confirm('Bài này bật tránh ban đêm (22:00–07:00). Vẫn đăng?')) {
      state.postingPostId = null;
      renderPosts();
      return;
    }
  }

  const payload = {
    posts: prepared.map(stripPostForJob),
    sync: true,
    actorId: state.activeActorId || settings.activeActorId,
    singlePostId: singlePostId || (prepared.length === 1 ? prepared[0].id : null),
  };
  const totalGroups = prepared.reduce((n, p) => n + (p.groupIds?.length || 0), 0) || prepared[0].groupIds?.length || 0;
  const hint = totalGroups
    ? `Bắt đầu — 0/${totalGroups} nhóm…`
    : 'Đang chuẩn bị engine…';
  try {
    await chrome.storage.session.set({ gfPanelOpen: true, gfPostingActive: true });
  } catch { /* ignore */ }
  showPostingUI(true, hint);
  if (totalGroups) applyPostingProgress(0, totalGroups);
  try {
    await gfSendMessage({ type: 'GF_START_POST', payload });
  } catch (e) {
    hidePostingUI();
    throw e;
  }
}

function postAutoImageToggleHtml(p, hasMedia) {
  if (hasMedia || !String(p.prompt_anh || '').trim()) return '';
  const checked = p.autoGenerateImage !== false;
  return `
    <label class="post-auto-img-toggle" title="Bỏ tick = đăng chữ, không gọi API xuất ảnh">
      <input type="checkbox" data-auto-img="${escAttr(p.id)}" ${checked ? 'checked' : ''} />
      <span>Tự xuất ảnh</span>
    </label>`;
}

function readQueueScheduleFields() {
  return {
    ngay_dang: $('#queueScheduleDate')?.value || '',
    gio_dang: $('#queueScheduleTime')?.value || '',
  };
}

function readEditScheduleFields() {
  return {
    ngay_dang: $('#editScheduleDate')?.value || '',
    gio_dang: $('#editScheduleTime')?.value || '',
  };
}

function initQueueScheduleDefaults() {
  const dateEl = $('#queueScheduleDate');
  const timeEl = $('#queueScheduleTime');
  if (!dateEl || !timeEl || dateEl.value) return;
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  dateEl.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  timeEl.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Gán ngay_dang/gio_dang cho bài chưa có lịch: ưu tiên ô sửa bài, rồi thanh queue.
 */
async function applyQueueScheduleToPosts(posts, { save = false, allowEditOverride = false } = {}) {
  const footer = readQueueScheduleFields();
  const missing = [];
  for (const post of posts) {
    if (allowEditOverride && state.editingQueuePostId === post.id) {
      const edit = readEditScheduleFields();
      if (edit.ngay_dang && edit.gio_dang) {
        post.ngay_dang = edit.ngay_dang;
        post.gio_dang = edit.gio_dang;
        continue;
      }
    }
    if (footer.ngay_dang && footer.gio_dang) {
      post.ngay_dang = footer.ngay_dang;
      post.gio_dang = footer.gio_dang;
    } else if (!post.ngay_dang || !post.gio_dang) {
      missing.push(post);
    }
  }
  if (missing.length) {
    throw new Error('Chọn ngày/giờ ở thanh dưới (hoặc Sửa bài để hẹn giờ riêng)');
  }
  if (save) await savePosts();
  return posts;
}

async function schedulePost() {
  try {
  let posts;
  try {
    if (!getSelectedPosts().length && composerHasDraftText()) {
      await saveComposePostToQueue({ selectOnly: true });
    }
    posts = buildPostJob(true).posts;
  } catch (e) {
    return alert(e.message);
  }

  try {
    await applyQueueScheduleToPosts(posts, {
      save: true,
      allowEditOverride: Boolean(state.editingQueuePostId),
    });
  } catch (e) {
    return alert(e.message);
  }

  for (const post of posts) {
    const postWhen = GF.scheduler.parseScheduleDate(post.ngay_dang, post.gio_dang);
    if (!postWhen || postWhen < Date.now()) {
      alert(`Bài «${(post.noi_dung || '').slice(0, 40)}…» cần ngày/giờ đăng trong tương lai.`);
      return;
    }
  }

  const scheduled = await commitPostSchedules(posts, { toast: false });
  alert(scheduled === 1 ? 'Đã lên lịch 1 bài' : `Đã lên lịch ${scheduled} bài`);
  loadState();
  } catch (e) {
    alert(e.message || 'Lên lịch thất bại');
  }
}

async function scheduleCampaign() {
  let posts;
  try {
    posts = buildPostJob(true).posts;
  } catch (e) {
    return alert(e.message);
  }
  if (posts.length < 2) return alert('Chọn ít nhất 2 bài để lên lịch dàn');

  const settings = await GF.storage.getSettings();
  const delays = await GF.scheduler.getDelays(settings.securityLevel);
  const defaultGap = Math.max(5, Math.round((delays.betweenPosts || 420) / 60));
  const gapMin = window.prompt(`Khoảng cách giữa các bài (phút):`, String(defaultGap));
  if (gapMin === null) return;
  const gapMs = Math.max(1, Number(gapMin) || defaultGap) * 60 * 1000;

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const defaultStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const startInput = window.prompt('Giờ bắt đầu dàn (YYYY-MM-DDTHH:mm):', defaultStart);
  if (!startInput) return;
  let startWhen = new Date(startInput).getTime();
  if (!Number.isFinite(startWhen) || startWhen < Date.now()) {
    return alert('Chọn thời điểm bắt đầu trong tương lai');
  }

  const upcoming = (await chrome.storage.local.get('activityUpcoming')).activityUpcoming || [];
  let scheduled = 0;
  const campaignLabel = posts[0]?.campaignName || 'Campaign';

  for (let i = 0; i < posts.length; i += 1) {
    const post = posts[i];
    if (!post.groupIds?.length) {
      alert(`Bài «${(post.noi_dung || '').slice(0, 30)}…» chưa có nhóm`);
      return;
    }
    const when = startWhen + i * gapMs;
    const d = new Date(when);
    post.ngay_dang = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    post.gio_dang = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (!post.campaignName) post.campaignName = campaignLabel;

    const alarmName = `gf_job_${post.id}_camp_${Date.now()}_${i}`;
    const payload = buildSchedulePostPayload([post], settings);
    await gfScheduleAlarm({
      name: alarmName,
      when,
      data: { kind: 'post', payload },
    });
    upcoming.push({
      id: alarmName,
      alarmName,
      kind: 'post',
      when,
      postId: post.id,
      snippet: post.noi_dung?.slice(0, 80) || '',
      groupIds: [...post.groupIds],
      payload,
      label: `Dàn ${i + 1}/${posts.length} — ${formatGroupList(post.groupIds)}`,
    });
    scheduled += 1;
  }

  await savePosts();
  await chrome.storage.local.set({ activityUpcoming: upcoming });
  alert(`Đã lên lịch dàn ${scheduled} bài — cách nhau ${gapMin} phút`);
  loadState();
}

async function cancelUpcoming(item) {
  const alarmName = item.alarmName || item.id;
  if (alarmName?.startsWith('gf_job_') || alarmName?.startsWith('gf_img_') || alarmName?.startsWith('gf_cmt_')) {
    await gfSendMessage({ type: 'GF_CANCEL_ALARM', name: alarmName });
  }
  const d = await chrome.storage.local.get('activityUpcoming');
  let upcoming = (d.activityUpcoming || []).filter((u) => u.id !== item.id);
  if (item.kind === 'post' && item.postId) {
    upcoming = upcoming.filter((u) => !(u.kind === 'generate_image' && u.postId === item.postId));
    for (const img of (d.activityUpcoming || []).filter((u) => u.kind === 'generate_image' && u.postId === item.postId)) {
      if (img.alarmName) await gfSendMessage({ type: 'GF_CANCEL_ALARM', name: img.alarmName });
    }
  }
  await chrome.storage.local.set({ activityUpcoming: upcoming });
  loadState();
}

async function rescheduleUpcoming(item) {
  const post = item.payload?.posts?.[0];
  const cur = new Date(item.when);
  const pad = (n) => String(n).padStart(2, '0');
  const defaultVal = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}T${pad(cur.getHours())}:${pad(cur.getMinutes())}`;
  const input = window.prompt('Ngày giờ mới (YYYY-MM-DDTHH:mm):', defaultVal);
  if (!input) return;
  const when = new Date(input).getTime();
  if (!Number.isFinite(when) || when < Date.now()) {
    alert('Chọn thời điểm trong tương lai');
    return;
  }
  await cancelUpcoming(item);
  const settings = await GF.storage.getSettings();
  const prefix = item.kind === 'generate_image' ? 'gf_img'
    : item.kind === 'comment' ? 'gf_cmt'
      : 'gf_job';
  const kind = item.kind === 'generate_image' ? 'generate_image'
    : item.kind === 'comment' ? 'comment'
      : 'post';
  const payload = item.payload || (kind === 'post' && post
    ? buildSchedulePostPayload([post], settings)
    : item.payload);
  const alarmName = kind === 'comment'
    ? `${prefix}_${item.recordId || item.payload?.record_id || 'cmt'}_${Date.now()}`
    : `${prefix}_${item.postId || 'post'}_${Date.now()}`;
  await gfScheduleAlarm({
    name: alarmName,
    when,
    data: { kind, payload },
  });
  const d = await chrome.storage.local.get('activityUpcoming');
  const upcoming = d.activityUpcoming || [];
  upcoming.push({
    ...item,
    id: alarmName,
    alarmName,
    kind,
    when,
    payload,
    label: kind === 'generate_image'
      ? `Xuất ảnh — ${(post?.noi_dung || 'bài').slice(0, 36)}…`
      : kind === 'comment'
        ? (item.label || `Comment → ${item.snippet?.slice(0, 40) || 'bài'}`)
        : item.label,
  });
  await chrome.storage.local.set({ activityUpcoming: upcoming });
  loadState();
}

async function loadPostedPostsForComment() {
  const d = await chrome.storage.local.get(['postQueue', 'serverMyPosts']);
  const queue = d.postQueue || [];
  const serverMyPosts = d.serverMyPosts || [];

  const localPosts = queue
    .filter((p) => p.postStatus === 'posted'
      && p.postedGroups?.some((g) => g.post_id && /^\d+$/.test(String(g.post_id))))
    .sort((a, b) => (b.lastPostedAt || '').localeCompare(a.lastPostedAt || ''))
    .map((p) => ({ ...p, _source: 'local' }));

  // Bài của mình từ server chưa có trong local queue (multi-device sync)
  const localPostIds = new Set(
    localPosts.flatMap((p) => (p.postedGroups || []).map((g) => `${g.group_id}_${g.post_id}`))
  );
  const myServerItems = serverMyPosts
    .filter((sp) => !localPostIds.has(`${sp.group_id}_${sp.post_id}`))
    .map((sp) => ({
      id: `server_${sp.id}`,
      _serverId: sp.id,
      _source: 'server',
      noi_dung: sp.noi_dung || '',
      lastPostedAt: sp.posted_at || '',
      postedGroups: [{
        group_id: sp.group_id,
        group_name: sp.group_name || sp.group_id,
        post_id: sp.post_id,
        status: 'posted',
      }],
    }));

  const crossPosts = await fetchCrossPostsFromServer();
  const crossItems = crossPosts.map((cp) => ({
    id: `cross_${cp.id}`,
    _serverId: cp.id,
    _source: 'cross',
    noi_dung: cp.noi_dung || '',
    lastPostedAt: cp.posted_at || '',
    _userLabel: cp.user_name || cp.user_email || 'User',
    postedGroups: [{
      group_id: cp.group_id,
      group_name: cp.group_name || cp.group_id,
      post_id: cp.post_id,
      status: 'posted',
    }],
  }));

  state.comments = [...localPosts, ...myServerItems, ...crossItems];
  const badge = $('#commentBadge');
  if (badge) badge.textContent = state.comments.length ? String(state.comments.length) : '';
  if ($('#tab-comment')?.classList.contains('active')) renderComments();
}

async function triggerTidienAutoSync({ silent = false, force = false, scope = 'comments' } = {}) {
  try {
    const res = await gfSendMessage({ type: 'GF_TIDIEN_SYNC', force, scope });
    if (res?.skipped === 'no_auth') {
      if (!silent) showToast('Chưa đăng nhập tidien — đăng nhập hoặc dán API key', 'warn');
      return res;
    }
    if (res?.skipped === 'disabled' && !force) return res;
    if (res?.skipped === 'throttle' && !silent) {
      showToast('Vừa sync — thử lại sau vài phút', 'info');
      return res;
    }
    await loadPostedPostsForComment();
    if (res?.draftsAdded > 0) {
      const d = await chrome.storage.local.get('postQueue');
      state.posts = mapPostsFromQueue(d.postQueue || []);
      renderPosts();
      if (!silent) showToast(`Đã tải ${res.draftsAdded} draft từ tidien`, 'info', 5000);
    }
    if (!silent && res?.postsFetched > 0) {
      const remain = Number(res.pendingPostsSync);
      const extra = Number.isFinite(remain) && remain > 0 ? ` — còn ${remain} bài trên server` : '';
      showToast(`+${res.postsFetched} bài comment mới${extra}`, 'info', 4000);
    }
    if (!silent && res?.postsPushed > 0) {
      showToast(`Đã đẩy ${res.postsPushed} bài đăng lên tidien`, 'success', 5000);
    }
    if (!silent && res?.postsPushFailed > 0) {
      showToast(`${res.postsPushFailed} bài chưa đẩy được tidien — xem Log → Nhật ký`, 'warn', 6000);
    }
    if (!silent && res?.ok && !res?.draftsAdded && !res?.postsFetched && !res?.postsPushed) {
      if (res.postsError || res.draftError) {
        showToast(`Sync lỗi: ${res.postsError || res.draftError}`, 'error', 6000);
      } else {
        showToast(
          'Pull tidien: không có draft/bài comment mới từ web. Bài bạn vừa đăng tự đẩy lên tidien (cần post_id FB + đăng nhập).',
          'info',
          7000,
        );
      }
    }
    return res;
  } catch (e) {
    if (!silent) showToast(e.message || 'Sync lỗi', 'error');
    return { ok: false, error: e.message };
  }
}

async function runTidienSyncNow() {
  const btn = $('#btnTidienSyncNow');
  if (btn?.disabled) return;
  const label = btn?.textContent || '↻ Đồng bộ ngay';
  if (btn) { btn.disabled = true; btn.textContent = 'Đang đồng bộ…'; }
  try {
    const { licenseKey } = await chrome.storage.local.get('licenseKey');
    if (!licenseKey) {
      showToast('Chưa có license key — nhập key ở màn hình kích hoạt', 'warn');
      return;
    }
    await syncLocalPostsToServer();
    await pullMyPostsFromServer();
    await loadPostedPostsForComment();
    showToast('Đồng bộ xong', 'success', 3000);
  } catch (e) {
    showToast(e.message || 'Đồng bộ lỗi', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

async function loadComments() {
  await loadPostedPostsForComment();
  if (!state.comments.length) {
    const box = $('#commentList');
    if (box) box.innerHTML = emptyState('💬', 'Chưa có bài đã đăng — đăng bài qua GroupFlow trước');
  } else {
    renderComments();
  }
  const startEl = $('#commentScheduleStart');
  if (startEl && !startEl.value) {
    const t = new Date(Date.now() + 30 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    startEl.value = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
  }
}

function renderComments() {
  const box = $('#commentList');
  if (!state.comments.length) {
    box.innerHTML = emptyState('💬', 'Chưa có bài đã đăng — đăng bài qua GroupFlow trước');
    return;
  }
  const rawTemplates = ($('#commentTemplates')?.value?.trim() || GF.commentTemplates?.DEFAULT || '').split('\n').filter((s) => s.trim());
  const tplOptions = rawTemplates.length
    ? `<option value="">📋 Chọn mẫu…</option>${rawTemplates.map((t) => `<option value="${escAttr(t)}">${esc(t.slice(0, 55))}</option>`).join('')}`
    : '';
  box.innerHTML = state.comments.map((c) => {
    const draft = state.commentDrafts[c.id] || '';
    const validGroups = (c.postedGroups || []).filter((g) => g.post_id && /^\d+$/.test(String(g.post_id)));
    const groupInfo = validGroups.length === 1
      ? esc(validGroups[0].group_name || validGroups[0].group_id)
      : `${validGroups.length} nhóm`;
    const postedAt = c.lastPostedAt ? new Date(c.lastPostedAt).toLocaleString('vi') : '';
    const crossLabel = c._source === 'cross' ? `<span class="chip sm ok" style="font-size:10px">↔ ${esc(c._userLabel || 'cross')}</span> ` : '';
    return `
    <div class="list-item">
      <label class="check-row"><input type="checkbox" data-comment-id="${escAttr(c.id)}" checked /></label>
      <div>${crossLabel}${esc(c.noi_dung?.slice(0, 70) || '—')}</div>
      <div class="hint">${groupInfo}${postedAt ? ' · ' + postedAt : ''}</div>
      <textarea data-draft="${escAttr(c.id)}" rows="2" placeholder="Spintax: {nội dung 1|nội dung 2} hoặc để trống dùng mẫu Settings">${esc(draft)}</textarea>
      <div class="row">
        ${tplOptions ? `<select data-tpl-pick="${escAttr(c.id)}" class="gf-select-sm">${tplOptions}</select>` : ''}
        <button type="button" class="btn outline sm" data-ai-comment="${escAttr(c.id)}">AI</button>
        <button type="button" class="btn primary sm" data-run-comment="${escAttr(c.id)}">▶ Chạy</button>
      </div>
    </div>`;
  }).join('');

  box.querySelectorAll('[data-draft]').forEach((ta) => {
    ta.addEventListener('input', () => { state.commentDrafts[ta.dataset.draft] = ta.value; });
  });
  box.querySelectorAll('[data-tpl-pick]').forEach((sel) => {
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      const ta = box.querySelector(`[data-draft="${escAttr(sel.dataset.tplPick)}"]`);
      if (ta) { ta.value = sel.value; state.commentDrafts[sel.dataset.tplPick] = sel.value; }
      sel.value = '';
    });
  });
  box.querySelectorAll('[data-ai-comment]').forEach((btn) => {
    btn.addEventListener('click', () => aiComment(btn.dataset.aiComment));
  });
  box.querySelectorAll('[data-run-comment]').forEach((btn) => {
    btn.addEventListener('click', () => runComment(btn.dataset.runComment));
  });
}

async function aiComment(id) {
  const c = state.comments.find((x) => x.id === id);
  if (!c) return;
  const s = await GF.storage.getSettings();
  const text = await GF.imageGen.generateComment(c.noi_dung, s.routerApiKey, s.tidienBaseUrl);
  state.commentDrafts[id] = text;
  renderComments();
}

async function runComment(id) {
  const c = state.comments.find((x) => x.id === id);
  if (!c) return;
  const settings = await GF.storage.getSettings();
  const comment = await resolveCommentForPost(state.commentDrafts[id], settings);
  if (!comment) return alert('Nhập comment, bấm AI, hoặc cấu hình mẫu trong Settings');
  if (settings.avoidNight !== false && GF.scheduler.isNightBlocked()) {
    if (!window.confirm('Đang trong khung 22:00–07:00. Vẫn comment?')) return;
  }
  const validGroups = (c.postedGroups || []).filter((g) => g.post_id && /^\d+$/.test(String(g.post_id)));
  if (!validGroups.length) return alert('Bài chưa có post_id FB hợp lệ');
  const actorId = state.activeActorId || settings.activeActorId;
  let okCount = 0;
  let lastError = '';
  for (const g of validGroups) {
    try {
      const res = await gfSendMessage({
        type: 'GF_RUN_COMMENT',
        payload: {
          post_queue_id: c.id,
          group_id: g.group_id,
          group_name: g.group_name,
          post_id: g.post_id,
          comment,
          actorId,
        },
      });
      if (res?.ok === false) {
        lastError = res.error || 'Lỗi không rõ';
      } else {
        okCount += 1;
      }
    } catch (e) {
      lastError = e.message || 'Lỗi không rõ';
    }
  }
  if (okCount > 0) {
    showToast(`Đã comment ${okCount}/${validGroups.length} bài`, okCount === validGroups.length ? 'success' : 'warn');
  } else {
    showToast(`Comment thất bại: ${lastError}`, 'error', 6000);
  }
  if (c._source === 'cross' && c._serverId) {
    markCrossPostCommented(c._serverId).catch(() => {});
  }
  await loadComments();
}

async function resolveCommentForPost(draft, settings) {
  const templates = settings?.commentTemplates || GF.commentTemplates?.DEFAULT || '';
  return GF.commentTemplates.resolve(draft, templates);
}

function fillEmptyCommentDraftsFromTemplate() {
  const templates = $('#commentTemplates')?.value?.trim()
    || GF.commentTemplates?.DEFAULT
    || '';
  let n = 0;
  for (const c of state.comments) {
    if (state.commentDrafts[c.id]?.trim()) continue;
    const preview = GF.commentTemplates.resolve('', templates);
    if (preview) {
      state.commentDrafts[c.id] = preview;
      n += 1;
    }
  }
  if (n) renderComments();
  else alert('Không có ô trống — hoặc chưa cấu hình mẫu trong Settings');
}

async function collectSelectedCommentJobs() {
  const ids = [...document.querySelectorAll('[data-comment-id]:checked')].map((el) => el.dataset.commentId);
  const settings = await GF.storage.getSettings();
  const jobs = [];
  for (const id of ids) {
    const c = state.comments.find((x) => x.id === id);
    if (!c) continue;
    const comment = await resolveCommentForPost(state.commentDrafts[id], settings);
    if (!comment) {
      alert(`Bài «${(c.noi_dung || id).toString().slice(0, 40)}»: nhập comment, bấm AI, hoặc cấu hình mẫu Settings`);
      return null;
    }
    const validGroups = (c.postedGroups || []).filter((g) => g.post_id && /^\d+$/.test(String(g.post_id)));
    for (const g of validGroups) {
      jobs.push({
        post_queue_id: c.id,
        group_id: g.group_id,
        group_name: g.group_name,
        post_id: g.post_id,
        comment,
        label: (c.noi_dung || g.group_name || 'Comment').slice(0, 60),
      });
    }
  }
  if (!jobs.length) {
    alert('Chọn ít nhất một bài có post_id hợp lệ');
    return null;
  }
  return jobs;
}

function estimateCommentBatchMinutes(jobCount, delays) {
  if (jobCount <= 1) return 0;
  const mid = (delays.betweenComments[0] + delays.betweenComments[1]) / 2;
  return Math.round((mid * (jobCount - 1)) / 60);
}

async function confirmNightAction() {
  const settings = await GF.storage.getSettings();
  if (settings.avoidNight === false) return true;
  if (!GF.scheduler.isNightBlocked()) return true;
  return window.confirm('Đang trong khung 22:00–07:00 (tránh ban đêm). Vẫn tiếp tục?');
}

async function runAllComments() {
  const jobs = await collectSelectedCommentJobs();
  if (!jobs) return;
  if (!(await confirmNightAction())) return;
  const settings = await GF.storage.getSettings();
  const delays = await GF.scheduler.getDelays(settings.securityLevel);
  const estMin = estimateCommentBatchMinutes(jobs.length, delays);
  const estNote = estMin > 0 ? ` Tổng giãn cách ~${estMin} phút.` : '';
  if (!window.confirm(`Chạy ${jobs.length} comment với delay ngẫu nhiên giữa mỗi bài?${estNote}`)) return;
  try {
    await gfSendMessage({
      type: 'GF_RUN_COMMENT_BATCH',
      payload: {
        jobs,
        actorId: state.activeActorId || settings.activeActorId,
      },
    });
    await loadComments();
  } catch (e) {
    alert(e.message);
  }
}

async function scheduleSelectedComments() {
  const jobs = await collectSelectedCommentJobs();
  if (!jobs) return;
  const input = $('#commentScheduleStart')?.value;
  if (!input) return alert('Chọn ngày giờ bắt đầu ở trên');
  const startWhen = new Date(input).getTime();
  if (!Number.isFinite(startWhen) || startWhen < Date.now()) {
    return alert('Chọn thời điểm trong tương lai');
  }
  if (GF.scheduler.isNightBlocked()) {
    const h = new Date(startWhen).getHours();
    if ((h >= 22 || h < 7) && !(await confirmNightAction())) return;
  }
  const settings = await GF.storage.getSettings();
  const delays = await GF.scheduler.getDelays(settings.securityLevel);
  const estMin = estimateCommentBatchMinutes(jobs.length, delays);
  const estNote = estMin > 0 ? ` Kết thúc ~${estMin} phút sau bài đầu.` : '';
  if (!window.confirm(`Lên lịch ${jobs.length} comment?${estNote}`)) return;

  const upcoming = (await chrome.storage.local.get('activityUpcoming')).activityUpcoming || [];
  let cursor = startWhen;
  const actorId = state.activeActorId || settings.activeActorId;

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    const alarmName = `gf_cmt_${job.post_queue_id || 'cmt'}_${job.group_id || i}_${Date.now()}_${i}`;
    const payload = { ...job, actorId };
    await gfScheduleAlarm({
      name: alarmName,
      when: cursor,
      data: { kind: 'comment', payload },
    });
    upcoming.push({
      id: alarmName,
      alarmName,
      kind: 'comment',
      when: cursor,
      recordId: job.post_queue_id,
      snippet: job.comment.slice(0, 80),
      payload,
      label: `Comment → ${job.label}`,
    });
    if (i < jobs.length - 1) {
      cursor += GF.scheduler.randBetween(delays.betweenComments) * 1000;
    }
  }

  await chrome.storage.local.set({ activityUpcoming: upcoming });
  alert(jobs.length === 1 ? 'Đã lên lịch 1 comment' : `Đã lên lịch ${jobs.length} comment (giãn cách tự động)`);
  loadState();
}

function buildHistoryPostUrl(h) {
  if (h?.url) return h.url;
  const gid = h?.group_id;
  const pid = h?.post_id;
  if (!gid) return '';
  if (pid && pid !== 'pending') {
    const s = String(pid);
    if (/^\d+$/.test(s)) {
      return `https://www.facebook.com/groups/${gid}/posts/${s}/`;
    }
  }
  if (h?.ok) return `https://www.facebook.com/groups/${gid}`;
  return '';
}

function buildPostedGroupUrl(g) {
  if (g?.url) return g.url;
  const gid = g?.group_id;
  const pid = g?.post_id;
  if (gid && pid && pid !== 'pending' && /^\d+$/.test(String(pid))) {
    return `https://www.facebook.com/permalink.php?story_fbid=${String(pid)}&id=${gid}`;
  }
  if (gid) return `https://www.facebook.com/groups/${gid}/`;
  return null;
}

function renderPostedGroupsBlock(p) {
  const groups = p.postedGroups || [];
  if (!groups.length) return '';
  const defaultCmt = String(p.firstComment || '').trim();
  const rows = groups.map((g) => {
    const url = buildPostedGroupUrl(g);
    const pending = g.post_id === 'pending' || g.status === 'pending_approval';
    const canBot = !pending && g.post_id && /^\d+$/.test(String(g.post_id));
    const linkLabel = pending ? 'Mở nhóm' : 'Mở bài';
    const cmtKey = `${p.id}:${g.group_id}`;
    const botTag = g.firstCommentOk === true
      ? '<span class="tag ready">Bot đã cmt</span>'
      : (g.firstCommentOk === false ? '<span class="tag error">Bot lỗi</span>' : '');
    return `
      <div class="posted-group-row" data-posted-group="${escAttr(cmtKey)}">
        <span class="posted-group-name">${esc(g.group_name || g.group_id)}</span>
        ${url ? `<a class="btn ghost sm" href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">${linkLabel}</a>` : ''}
        ${canBot ? `
          <input type="text" class="posted-group-cmt" data-own-cmt-input="${escAttr(cmtKey)}" placeholder="Comment bot…" value="${escAttr(defaultCmt)}" />
          <button type="button" class="btn primary sm" data-own-cmt-run="${escAttr(cmtKey)}" data-post-queue-id="${escAttr(p.id)}" data-group-id="${escAttr(g.group_id)}" data-group-name="${escAttr(g.group_name || '')}" data-post-id="${escAttr(g.post_id)}">▶ Bot</button>
        ` : ''}
        ${botTag}
      </div>
    `;
  }).join('');
  return `
    <div class="posted-groups-block">
      <p class="field-label">Bài đã đăng</p>
      <p class="hint">Mở FB comment tay, hoặc nhập text → <strong>▶ Bot</strong> (chạy nền).</p>
      ${rows}
    </div>
  `;
}

async function runOwnPostComment({ postQueueId, groupId, groupName, postId, comment }) {
  const text = String(comment || '').trim();
  if (!text) throw new Error('Nhập nội dung comment');
  if (!postId || !/^\d+$/.test(String(postId))) {
    throw new Error('Bài chờ duyệt hoặc chưa có post_id — mở nhóm trên FB comment tay');
  }
  const settings = await GF.storage.getSettings();
  await gfSendMessage({
    type: 'GF_COMMENT_OWN_POST',
    payload: {
      post_queue_id: postQueueId,
      group_id: groupId,
      group_name: groupName,
      post_id: postId,
      comment: text,
      actorId: state.activeActorId || settings.activeActorId,
    },
  });
}

function bindPostedGroupActions(root) {
  root.querySelectorAll('[data-own-cmt-run]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.ownCmtRun;
      const input = root.querySelector(`[data-own-cmt-input="${key}"]`);
      btn.disabled = true;
      try {
        await runOwnPostComment({
          postQueueId: btn.dataset.postQueueId,
          groupId: btn.dataset.groupId,
          groupName: btn.dataset.groupName,
          postId: btn.dataset.postId,
          comment: input?.value || '',
        });
        showToast('Đã gửi comment bot', 'success');
        const d = await chrome.storage.local.get('postQueue');
        state.posts = mapPostsFromQueue(d.postQueue || []);
        renderPosts();
      } catch (e) {
        alert(e.message);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function formatHistoryMode(mode) {
  const map = {
    fast: 'Nhanh',
    classic: 'Cổ điển',
    'fast-bg': 'Nhanh (nền)',
    'classic-fallback': 'Nhanh→Cổ điển',
  };
  return map[mode] || mode;
}

function formatHistoryTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  } catch {
    return '';
  }
}

function hasRecentHistory(history, maxAgeMs = 24 * 3600 * 1000) {
  const cut = Date.now() - maxAgeMs;
  return (history || []).some((h) => h.at && new Date(h.at).getTime() > cut);
}

function updateHistoryBadge(count) {
  const badge = $('#historyBadge');
  if (!badge) return;
  const n = Number(count) || 0;
  if (n > 0) {
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
}

function showActivitySubTab(sub) {
  $$('.activity-sub-tabs [data-sub]').forEach((b) => {
    b.classList.toggle('active', b.dataset.sub === sub);
  });
  $('#activityUpcoming')?.classList.toggle('hidden', sub !== 'upcoming');
  $('#activityHistory')?.classList.toggle('hidden', sub !== 'history');
  $('#activityJournal')?.classList.toggle('hidden', sub !== 'journal');
  $('#activityJournalHint')?.classList.toggle('hidden', sub !== 'journal');
}

function showActivityHistorySubTab() {
  showActivitySubTab('history');
}

function showActivityJournalSubTab() {
  showActivitySubTab('journal');
}

function updateJournalBadge(count, hasError = false) {
  const badge = $('#journalBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = String(Math.min(count, 99));
    badge.classList.remove('hidden');
    badge.classList.toggle('journal-badge-error', hasError);
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
}

function formatEngineLogTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' });
  } catch {
    return iso;
  }
}

function engineLogLevelLabel(level) {
  return { info: 'Info', warn: 'Cảnh báo', error: 'Lỗi', ok: 'OK' }[level] || level;
}

function renderEngineLog(rows) {
  const box = $('#engineLogList');
  if (!box) return;
  const list = rows || [];
  const errCount = list.filter((r) => r.level === 'error').length;
  updateJournalBadge(list.length, errCount > 0);
  box.innerHTML = list.length
    ? list.slice(0, 120).map((r) => `
    <div class="engine-log-row level-${escAttr(r.level || 'info')}">
      <div class="engine-log-meta">
        <span class="tag ${r.level === 'error' ? 'error' : r.level === 'ok' ? 'ready' : 'pending'}">${esc(engineLogLevelLabel(r.level))}</span>
        ${r.phase ? `<span class="tag">${esc(r.phase)}</span>` : ''}
        ${r.source ? `<span class="tag">${esc(r.source)}</span>` : ''}
        <span>${esc(formatEngineLogTime(r.at))}</span>
      </div>
      ${r.group ? `<div class="engine-log-msg"><strong>${esc(r.group)}</strong></div>` : ''}
      ${r.message ? `<div class="engine-log-msg">${esc(r.message)}</div>` : ''}
      ${r.error ? `<div class="engine-log-err">${esc(r.error)}</div>` : ''}
    </div>
  `).join('')
    : emptyState('▤', 'Chưa có nhật ký — bấm Đăng để ghi lại từng bước');
}

async function refreshJournalFromStorage() {
  const d = await chrome.storage.local.get('engineLog');
  renderEngineLog(d.engineLog || []);
}

async function panelEngineLog(entry) {
  try {
    await gfSendMessage({ type: 'GF_APPEND_ENGINE_LOG', entry: { ...entry, source: entry.source || 'panel' } });
  } catch { /* ignore */ }
}

function formatProgressLogLine(data) {
  const phase = data.phase || '';
  const snippet = data.snippet || '';
  const group = data.group || '';
  const error = data.error || '';
  if (!phase && !snippet && !error && !group) return '';
  if (phase === 'ok' && !error) return '';
  let cls = '';
  if (phase === 'error' || error) cls = 'log-err';
  else if (phase === 'stopped') cls = 'log-warn';
  else if (phase === 'done') cls = 'log-ok';
  const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const parts = [];
  if (group) parts.push(group);
  else if (phase) parts.push(phase);
  if (snippet && !parts.some((p) => p.includes(snippet) || snippet.includes(p))) parts.push(snippet);
  const errHtml = error ? ` — <span class="log-err">${esc(error)}</span>` : '';
  return `<div class="${cls}"><span style="opacity:.65">${esc(time)}</span> ${esc(parts.join(' · '))}${errHtml}</div>`;
}

async function refreshActivityFromStorage({ preferHistory = false, forceHistorySub = false } = {}) {
  const d = await chrome.storage.local.get(['activityUpcoming', 'activityHistory']);
  const history = d.activityHistory || [];
  const upcoming = d.activityUpcoming || [];
  renderActivity(upcoming, history);
  updateHistoryBadge(history.length);
  if (forceHistorySub || (preferHistory && history.length > 0)) {
    showActivityHistorySubTab();
  }
}

function renderActivity(upcoming, history) {
  $('#activityUpcoming').innerHTML = upcoming.length
    ? upcoming.map((u, idx) => {
      const kindLabel = u.kind === 'generate_image' ? 'Xuất ảnh' : u.kind === 'comment' ? 'Comment' : 'Đăng bài';
      return `
    <div class="list-item activity-upcoming">
      <span class="tag ${u.kind === 'generate_image' ? 'pending' : 'ready'}">${kindLabel}</span>
      <strong>${new Date(u.when).toLocaleString()}</strong>
      <div class="post-body">${esc(u.label || u.snippet || u.kind)}</div>
      <div class="hint">${esc(formatGroupList(u.groupIds || u.payload?.posts?.[0]?.groupIds))}</div>
      <div class="post-actions">
        <button type="button" class="btn ghost sm" data-reschedule="${idx}">Sửa giờ</button>
        <button type="button" class="btn ghost sm" data-cancel-upcoming="${idx}">Hủy</button>
      </div>
    </div>
  `;
    }).join('')
    : emptyState('📅', 'Không có lịch chờ');

  $('#activityUpcoming').querySelectorAll('[data-cancel-upcoming]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = upcoming[Number(btn.dataset.cancelUpcoming)];
      if (item && window.confirm('Hủy lịch đăng này?')) cancelUpcoming(item);
    });
  });
  $('#activityUpcoming').querySelectorAll('[data-reschedule]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = upcoming[Number(btn.dataset.reschedule)];
      if (item) rescheduleUpcoming(item);
    });
  });

  $('#activityHistory').innerHTML = history.length
    ? history.map((h) => {
      const link = buildHistoryPostUrl(h);
      const pending = h.post_id === 'pending' || h.status === 'pending_approval';
      const linkLabel = pending ? 'Mở nhóm (chờ duyệt)' : (h.ok ? 'Mở bài trên FB' : 'Mở nhóm');
      const time = formatHistoryTime(h.at);
      return `
    <div class="list-item history-item">
      <div class="post-meta">
        <span class="tag ${h.ok ? 'ready' : 'error'}">${h.ok ? (pending ? 'Chờ duyệt' : 'OK') : 'Lỗi'}</span>
        ${h.mode ? `<span class="tag pending">${esc(formatHistoryMode(h.mode))}</span>` : ''}
        ${time ? `<span class="tag">${esc(time)}</span>` : ''}
      </div>
      <div class="post-body">${esc(h.group_name || h.group_id)}</div>
      <p class="hint history-snippet">${esc(h.snippet || '')}</p>
      ${h.error ? `<div class="hint" style="color:${h.ok ? 'var(--warn,#b45309)' : 'var(--error)'}">${esc(h.error)}</div>` : ''}
      ${link ? `<a class="btn ghost sm history-link" href="${escAttr(link)}" target="_blank" rel="noopener noreferrer">${linkLabel}</a>` : ''}
    </div>
  `;
    }).join('')
    : emptyState('▤', 'Chưa có lịch sử');
}

function renderLeads(leads) {
  const newCount = leads.filter((l) => l.status === 'new').length;
  $('#radarBadge').textContent = newCount ? String(newCount) : '';
  $('#leadList').innerHTML = leads.length
    ? leads.slice(0, 50).map((l) => `
    <div class="list-item">
      <div class="post-meta">
        <span class="tag">${esc(l.group_name || l.group_id)}</span>
        <span class="tag pending">${esc(l.found_at || '')}</span>
      </div>
      <div class="post-body">${esc(l.snippet || '')}</div>
      ${l.post_url ? `<a href="${l.post_url}" target="_blank" rel="noopener">Mở bài</a>` : ''}
    </div>
  `).join('')
    : emptyState('◎', 'Chưa có lead — bật Radar và quét');
}

function updatePostingConfigSummary() {
  const el = $('#postingConfigSummary');
  if (!el) return;
  const textMode = getSelectedClassicTextMode();
  const sec = getSelectedSecurityLevel();
  const textLabel = textMode === 'paste' ? 'Paste cả bài' : 'Hybrid';
  const secLabel = { fast: 'Giãn nhanh', balanced: 'Cân bằng', safe: 'An toàn' }[sec] || sec;
  el.textContent = `Cổ điển · ${textLabel} · ${secLabel}`;
}

function updateClassicTextModeUI(mode) {
  const m = mode === 'paste' ? 'paste' : 'hybrid';
  document.querySelectorAll(`input[name="classicTextMode"][value="${m}"]`).forEach((r) => { r.checked = true; });
  document.querySelectorAll('.strategy-row [name="classicTextMode"]').forEach((input) => {
    input.closest('.strategy-card')?.classList.toggle('active', input.value === m);
  });
  const hint = $('#classicTextModeHint');
  if (hint) {
    hint.innerHTML = m === 'paste'
      ? '<strong>Paste cả bài</strong> — một lần clipboard vào composer FB (giữ emoji & đậm).'
      : '<strong>Hybrid</strong> — dòng emoji/<code>**đậm**</code> paste từng đoạn; chữ thuần gõ. Chỉ fallback paste cả bài nếu hybrid lỗi.';
  }
  updatePostingConfigSummary();
}

function updatePostModeUI() {
  /* Cổ điển only */
}

function readPauseSettingsFromForm() {
  const every = Math.max(1, Number($('#pauseEveryGroups')?.value) || 1);
  let min = Math.max(0, Number($('#pauseMinutesMin')?.value) || 1);
  let max = Math.max(0, Number($('#pauseMinutesMax')?.value) || 3);
  if (max < min) max = min;
  return { pauseEveryGroups: every, pauseMinutesMin: min, pauseMinutesMax: max };
}

function updatePauseSettingsHint() {
  const { pauseEveryGroups, pauseMinutesMin, pauseMinutesMax } = readPauseSettingsFromForm();
  const el = $('#pauseSettingsHint');
  if (!el) return;
  const minLabel = pauseMinutesMin === pauseMinutesMax
    ? `${pauseMinutesMin} phút`
    : `${pauseMinutesMin}–${pauseMinutesMax} phút (random)`;
  if (pauseEveryGroups === 1) {
    el.innerHTML = `Mỗi nhóm xong → nghỉ <strong>${minLabel}</strong> → nhóm tiếp. (Không dùng Nhanh/Cân bằng/An toàn giữa nhóm.)`;
  } else {
    el.innerHTML = `Cứ ${pauseEveryGroups} nhóm → nghỉ <strong>${minLabel}</strong>; giữa các nhóm con chờ theo mục Giãn cách nhanh bên dưới.`;
  }
  const secHint = $('#securityHint');
  if (secHint && pauseEveryGroups === 1) {
    secHint.innerHTML = 'Đang <strong>1 nhóm/lần nghỉ phút</strong> — mục Nhanh/Cân bằng/An toàn <strong>không áp</strong> giữa nhóm.';
  }
}

function applyPauseSettingsToForm(s = {}) {
  if ($('#pauseEveryGroups')) $('#pauseEveryGroups').value = String(s.pauseEveryGroups ?? 1);
  if ($('#pauseMinutesMin')) $('#pauseMinutesMin').value = String(s.pauseMinutesMin ?? 1);
  if ($('#pauseMinutesMax')) $('#pauseMinutesMax').value = String(s.pauseMinutesMax ?? 3);
  updatePauseSettingsHint();
}

function updateSecurityUI(level) {
  const hints = {
    fast: 'Nhanh: ~1–2 phút giữa nhóm (chỉ khi Sau mỗi ≥2 nhóm mới nghỉ phút).',
    balanced: 'Cân bằng: ~3–5 phút giữa nhóm con — khuyên dùng khi gom nhiều nhóm/lần nghỉ.',
    safe: 'An toàn: ~7–10 phút giữa nhóm con.',
  };
  const radio = document.querySelector(`input[name="securityLevel"][value="${level}"]`);
  if (radio) radio.checked = true;
  const hint = $('#securityHint');
  const every = Math.max(1, Number($('#pauseEveryGroups')?.value) || 1);
  if (hint && every === 1) {
    hint.innerHTML = 'Đang <strong>1 nhóm/lần nghỉ phút</strong> — mục Nhanh/Cân bằng/An toàn <strong>không áp</strong> giữa nhóm.';
  } else if (hint) {
    hint.textContent = hints[level] || hints.balanced;
  }
  updatePauseSettingsHint();
  updatePostingConfigSummary();
}

function getSelectedPostMode() {
  return 'classic';
}

function getSelectedClassicTextMode() {
  return document.querySelector('input[name="classicTextMode"]:checked')?.value === 'paste' ? 'paste' : 'hybrid';
}

function getSelectedSecurityLevel() {
  return document.querySelector('input[name="securityLevel"]:checked')?.value || 'balanced';
}

async function persistChoiceSettings(patch) {
  await GF.storage.saveSettings(patch);
}

function showSettingsPane(paneId) {
  const id = paneId || 'settings-posting';
  const nav = document.querySelector('.settings-nav');
  nav?.querySelectorAll('[data-settings-pane]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.settingsPane === id);
  });
  const panes = [
    'settings-posting',
    'settings-media',
    'settings-ai',
    'settings-sync',
    'settings-advanced',
  ];
  panes.forEach((pid) => {
    const el = document.getElementById(pid);
    if (!el) return;
    const show = pid === id;
    el.classList.toggle('settings-pane-hidden', !show);
    if (pid === 'settings-advanced' && show && el.tagName === 'DETAILS') {
      el.open = true;
    }
  });
  const body = document.querySelector('.settings-shell-body');
  if (body) body.scrollTop = 0;
}

function initSettingsNav() {
  const nav = document.querySelector('.settings-nav');
  if (!nav) return;

  nav.querySelectorAll('[data-settings-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      showTab(btn.dataset.settingsBack || 'create');
    });
  });

  nav.querySelectorAll('[data-settings-pane]').forEach((btn) => {
    btn.addEventListener('click', () => {
      showSettingsPane(btn.dataset.settingsPane);
    });
  });

  showSettingsPane('settings-posting');
}

async function showSyncLicenseStatus() {
  const el = $('#syncLicenseStatus');
  if (!el) return;
  const { licenseKey, licenseInfo } = await chrome.storage.local.get(['licenseKey', 'licenseInfo']);
  const keyInput = $('#licenseKeyDisplay');
  if (keyInput) keyInput.value = licenseKey || '';
  if (licenseKey && licenseInfo?.valid) {
    const plan = licenseInfo.plan ? ` · ${licenseInfo.plan}` : '';
    const email = licenseInfo.email ? ` · ${licenseInfo.email}` : '';
    el.style.background = '#f0fdf4';
    el.style.borderColor = '#86efac';
    el.style.color = '#15803d';
    el.textContent = `✅ License hợp lệ${plan}${email}`;
  } else {
    el.style.background = '#fff7ed';
    el.style.borderColor = '#fdba74';
    el.style.color = '#c2410c';
    el.textContent = '⚠ Chưa có license key — nhập key ở màn hình kích hoạt';
  }
}


async function loadSettingsForm() {
  const s = await GF.storage.getSettings();
  $('#tidienBaseUrl').value = s.tidienBaseUrl;
  $('#tidienApiKey').value = s.tidienApiKey;
  $('#routerApiKey').value = s.routerApiKey;
  $('#driveJson').value = s.driveJson;
  $('#driveFolderId').value = s.driveFolderId;
  $('#maxGroups').value = s.maxGroups;
  $('#fbLang').value = s.fbLang;
  $('#avoidNight').checked = s.avoidNight;
  updateClassicTextModeUI(s.classicTextMode);
  applyPauseSettingsToForm(s);
  if ($('#tidienAutoSyncEnabled')) $('#tidienAutoSyncEnabled').checked = s.tidienAutoSyncEnabled !== false;
  if ($('#tidienAutoSyncMinutes')) $('#tidienAutoSyncMinutes').value = String(s.tidienAutoSyncMinutes || 10);
  if ($('#commentTemplates')) {
    $('#commentTemplates').value = s.commentTemplates || GF.commentTemplates?.DEFAULT || '';
  }
  updatePostModeUI();
  updateSecurityUI(s.securityLevel);
  updatePostingConfigSummary();
  const radar = await GF.leadRadar.getConfig();
  state.radarGroupIds = new Set(radar.groupIds || []);
  $('#radarActive').checked = radar.active;
  $('#radarKeywords').value = radar.keywords;
  $('#radarInterval').value = String(radar.interval);
  $('#radarPush').checked = radar.push;
  $('#groupImageScheduleEnabled').checked = s.groupImageScheduleEnabled;
  $('#groupImageScheduleStart').value = String(s.groupImageScheduleStart);
  $('#groupImageScheduleEnd').value = String(s.groupImageScheduleEnd);
  $('#groupImageScheduleInterval').value = String(s.groupImageScheduleInterval);
  $('#imageSaveLocal').checked = s.imageSaveLocal !== false;
  $('#imageSaveSubfolder').value = s.imageSaveSubfolder || 'GroupFlow';
  $('#imageSaveMode').value = s.imageSaveMode || 'downloads';
  $('#imageSaveAskEachTime').checked = s.imageSaveAskEachTime === true;
  $('#imageSaveDirLabel').textContent = s.imageSaveDirName
    ? `📁 ${s.imageSaveDirName}`
    : 'Chưa chọn — bấm nút bên dưới';
  updateImageSaveModeUI(s.imageSaveMode);
  await loadLocalProviderSelects();
  await loadLocalSkillSelects();
  await showSyncLicenseStatus();
}

async function saveSettingsForm() {
  const securityLevel = getSelectedSecurityLevel();
  await GF.storage.saveSettings({
    tidienBaseUrl: $('#tidienBaseUrl').value.trim(),
    tidienApiKey: $('#tidienApiKey').value.trim(),
    routerApiKey: $('#routerApiKey').value.trim(),
    driveJson: $('#driveJson').value.trim(),
    driveFolderId: $('#driveFolderId').value.trim(),
    maxGroups: Number($('#maxGroups').value) || 10,
    fbLang: $('#fbLang').value,
    postMode: 'classic',
    classicTextMode: getSelectedClassicTextMode(),
    securityLevel,
    avoidNight: $('#avoidNight').checked,
    ...readPauseSettingsFromForm(),
    tidienAutoSyncEnabled: $('#tidienAutoSyncEnabled')?.checked !== false,
    tidienAutoPullDrafts: $('#tidienAutoPullDrafts')?.checked !== false,
    tidienAutoSyncMinutes: Math.max(5, Number($('#tidienAutoSyncMinutes')?.value) || 10),
    commentTemplates: $('#commentTemplates')?.value.trim() || GF.commentTemplates?.DEFAULT || '',
    groupImageScheduleEnabled: $('#groupImageScheduleEnabled').checked,
    groupImageScheduleStart: Number($('#groupImageScheduleStart').value) || 1,
    groupImageScheduleEnd: Number($('#groupImageScheduleEnd').value) || 5,
    groupImageScheduleInterval: Number($('#groupImageScheduleInterval').value) || 10,
    imageSaveLocal: $('#imageSaveLocal').checked,
    imageSaveSubfolder: $('#imageSaveSubfolder').value.trim() || 'GroupFlow',
    imageSaveMode: $('#imageSaveMode').value || 'downloads',
    imageSaveAskEachTime: $('#imageSaveAskEachTime').checked,
  });
  alert('Đã lưu');
  await gfSendMessage({ type: 'GF_TIDIEN_SYNC', force: true, scope: 'all' }).catch(() => {});
  try {
    await gfSendMessage({ type: 'GF_SCHEDULE_TIDIEN_SYNC' });
  } catch { /* ignore */ }
}

function closeSidePanel() {
  try {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'GF_PANEL_CLOSE' }, '*');
    } else {
      window.close();
    }
  } catch (e) {
    alert(e.message);
  }
}

function bindEvents() {
  initSettingsNav();
  $('#btnPopout')?.addEventListener('click', closeSidePanel);

  $$('#tabBar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      showTab(tab);
      if (tab === 'comment') loadComments();
    });
  });

  $('#manualGroupTrigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleManualGroupPicker();
  });
  $('#manualGroupSelect')?.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => closeManualGroupPicker());
  $('#btnStopPosting')?.addEventListener('click', () => {
    gfSendMessage({ type: 'GF_STOP' }).catch(() => {});
    const status = $('#postingStatus');
    if (status) status.textContent = 'Đang dừng…';
  });
  $('#btnChipFirstComment')?.addEventListener('click', toggleFirstCommentChip);
  $('#btnCommentSpintax')?.addEventListener('click', insertCommentSpintax);
  $('#btnComposePreview')?.addEventListener('click', showComposePreview);
  document.querySelectorAll('[data-close-preview]').forEach((el) => {
    el.addEventListener('click', closeComposePreview);
  });

  $('#srcExcel').addEventListener('click', () => {
    $('#srcExcel').classList.add('active');
    $('#srcManual').classList.remove('active');
    $('#srcAi').classList.remove('active');
    $('#excelPanel').classList.remove('hidden');
    $('#manualPanel').classList.add('hidden');
    $('#aiPanel').classList.add('hidden');
  });
  $('#srcManual').addEventListener('click', () => {
    $('#srcManual').classList.add('active');
    $('#srcExcel').classList.remove('active');
    $('#srcAi').classList.remove('active');
    $('#manualPanel').classList.remove('hidden');
    $('#excelPanel').classList.add('hidden');
    $('#aiPanel').classList.add('hidden');
    ensureComposerInit();
  });
  $('#srcAi').addEventListener('click', () => {
    $('#srcAi').classList.add('active');
    $('#srcManual').classList.remove('active');
    $('#srcExcel').classList.remove('active');
    $('#aiPanel').classList.remove('hidden');
    $('#manualPanel').classList.add('hidden');
    $('#excelPanel').classList.add('hidden');
    loadLocalSkillSelects();
  });

  $('#excelFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await GF.excel.parseFile(file);
      rows.forEach((r) => {
        ensurePostGroups(r);
        state.posts.push(r);
      });
      await savePosts();
      renderPosts();
    } catch (err) {
      alert(err.message);
    }
  });

  $('#btnAddManual').addEventListener('click', async () => {
    try {
      const wasEditing = Boolean(state.editingQueuePostId);
      await saveComposePostToQueue();
      if (wasEditing) {
        await finishComposeEditSave('Đã cập nhật bài');
      } else {
        showToast('Đã thêm vào danh sách', 'success');
        await resetComposeFormAfterSave();
      }
    } catch (e) {
      alert(e.message);
    }
  });

  $('#btnComposeNew')?.addEventListener('click', () => startNewManualPost());
  $('#btnCancelComposeEdit')?.addEventListener('click', () => startNewManualPost({ confirmIfEditing: false }));

  $('#manualMedia')?.addEventListener('change', async (e) => {
    try {
      await onManualMediaPick(e.target.files);
      e.target.value = '';
    } catch (err) {
      alert(err.message);
    }
  });

  $('#manualMediaDropzone')?.addEventListener('click', () => $('#manualMedia')?.click());
  $('#manualMediaDropzone')?.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  });
  $('#manualMediaDropzone')?.addEventListener('dragleave', (e) => {
    e.currentTarget.classList.remove('drag-over');
  });
  $('#manualMediaDropzone')?.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    try {
      await onManualMediaPick(e.dataTransfer?.files);
    } catch (err) {
      alert(err.message);
    }
  });

  $('#manualColorToggleBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('#manualColorPalette')?.classList.toggle('hidden');
  });
  document.addEventListener('click', () => $('#manualColorPalette')?.classList.add('hidden'));
  $('#manualColorSelector')?.addEventListener('click', (e) => e.stopPropagation());
  $('#manualColorPalette')?.querySelectorAll('[data-bg-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const hex = btn.dataset.bgColor;
      if (isColoredBackground(hex)) clearManualMediaForColoredPost();
      scheduleManualDraftSave();
    });
  });

  $('#btnGenAll').addEventListener('click', generateAll);

  $('#selectAllPosts')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    const visibleIds = new Set(getFilteredPosts().map((p) => p.id));
    state.posts.forEach((p) => {
      if (visibleIds.has(p.id)) p.selected = checked;
    });
    savePosts();
    renderPosts();
  });

  $('#btnBulkDelete')?.addEventListener('click', () => bulkDeletePosts());

  $('#postSearch')?.addEventListener('input', (e) => {
    state.postSearch = e.target.value;
    renderPosts();
  });
  $('#postFilterGroup')?.addEventListener('change', (e) => {
    state.postFilterGroup = e.target.value;
    renderPosts();
  });
  $('#postFilterImage')?.addEventListener('change', (e) => {
    state.postFilterImage = e.target.value;
    renderPosts();
  });

  $('#btnBulkStatus')?.addEventListener('click', async () => {
    const status = $('#postsBulkStatus')?.value;
    if (!status) return alert('Chọn trạng thái cần áp dụng');
    await bulkSetPostStatus(status);
  });

  $('#btnBulkClearSel')?.addEventListener('click', () => {
    state.posts.forEach((p) => { p.selected = false; });
    savePosts();
    renderPosts();
  });

  $('#btnPullWeb').addEventListener('click', async () => {
    try {
      const res = await GF.tidienSync.pullDraftsFromWebsite();
      const pulled = res.data || [];
      if (!pulled.length) {
        alert('Không có draft mới trên website');
        return;
      }
      for (const row of pulled) {
        state.posts.push({
          id: `web-${row.id}`,
          source: 'website',
          is_shared: Boolean(row.is_shared),
          draft_id: row.id,
          noi_dung: row.noi_dung,
          prompt_anh: row.prompt_anh || '',
          autoGenerateImage: row.auto_generate_image !== false && row.auto_generate_image !== 0,
          anh_ngay_dang: row.anh_ngay_dang || '',
          anh_gio_dang: row.anh_gio_dang || '',
          ngay_dang: row.ngay_dang,
          gio_dang: row.gio_dang,
          groupIds: [],
          imageStatus: 'pending',
          imageBase64: null,
          selected: false,
        });
      }
      await savePosts();
      renderPosts();
      alert(`Đã tải ${pulled.length} bài từ website`);
    } catch (e) {
      alert(e.message);
    }
  });

  $('#btnRefreshGroups')?.addEventListener('click', async (e) => {
    const btn = $('#btnRefreshGroups');
    const deep = e.shiftKey;
    if (btn) {
      btn.disabled = true;
      btn.textContent = deep ? 'Đang quét joins…' : 'Đang đọc…';
    }
    try {
      await syncGroupsFromFb({ silent: false, deep, quick: !deep });
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '↻ Làm mới';
      }
    }
  });

  $('#groupSearch')?.addEventListener('input', (e) => {
    if (e.isComposing) return;
    renderGroupLibrary();
  });
  $('#groupSearch')?.addEventListener('compositionend', () => renderGroupLibrary());

  // Invite feature removed.

  $('#selectAllPickerGroups')?.addEventListener('change', (e) => {
    const filtered = filterGroupsForLibrary(state.groups);
    if (e.target.checked) {
      filtered.forEach((g) => state.assignGroupIds.add(String(g.id)));
    } else {
      filtered.forEach((g) => state.assignGroupIds.delete(String(g.id)));
    }
    renderGroupsTab();
  });


  $('#selectAllAssignPosts')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      state.posts.forEach((p) => state.assignPostIds.add(p.id));
    } else {
      state.assignPostIds.clear();
    }
    renderAssignPosts();
  });

  $('#btnApplyGroups')?.addEventListener('click', async () => {
    try {
      applyGroupsToSelectedPosts([...state.assignGroupIds]);
      await saveGroupsData();
      renderPosts();
      renderGroupsTab();
      alert(`Đã gán ${state.assignGroupIds.size} nhóm cho ${state.assignPostIds.size} bài`);
    } catch (e) {
      alert(e.message);
    }
  });

  $('#btnClearPostGroups')?.addEventListener('click', async () => {
    const postIds = [...state.assignPostIds];
    if (!postIds.length) return alert('Chọn bài cần xóa nhóm');
    state.posts.forEach((p) => {
      if (postIds.includes(p.id)) ensurePostGroups(p).groupIds = [];
    });
    await savePosts();
    renderPosts();
    renderGroupsTab();
  });

  $('#btnSaveCustomSet')?.addEventListener('click', async () => {
    const name = $('#customSetName')?.value?.trim();
    const groupIds = [...state.assignGroupIds];
    if (!name) return alert('Nhập tên bộ nhóm');
    if (!groupIds.length) return alert('Tick ít nhất 1 nhóm FB');
    try {
      if (state.editingCustomSetId) {
        await GF.groupSets.update(state.editingCustomSetId, { name, groupIds });
        showToast(`Đã cập nhật bộ「${name}」(${groupIds.length} nhóm)`, 'success');
        cancelEditCustomSet();
      } else {
        await GF.groupSets.create(name, groupIds);
        showToast(`Đã lưu bộ「${name}」(${groupIds.length} nhóm)`, 'success');
        if ($('#customSetName')) $('#customSetName').value = '';
      }
      state.customGroupSets = await GF.groupSets.getAll();
      await saveGroupsData();
      renderGroupsTab();
    } catch (e) {
      alert(e.message);
    }
  });

  $('#btnCancelEditSet')?.addEventListener('click', () => {
    cancelEditCustomSet();
    renderGroupsTab();
  });

  $('#btnComposePostNow')?.addEventListener('click', handleComposePostAction);
  $('#queueScheduleDate')?.addEventListener('change', onQueueScheduleFooterChange);
  $('#queueScheduleTime')?.addEventListener('change', onQueueScheduleFooterChange);
  $('#queueScheduleDate')?.addEventListener('input', onQueueScheduleFooterChange);
  $('#queueScheduleTime')?.addEventListener('input', onQueueScheduleFooterChange);
  $('#btnSchedule').addEventListener('click', schedulePost);
  $('#btnScheduleCampaign').addEventListener('click', scheduleCampaign);

  $('#btnAiRewrite')?.addEventListener('click', async () => {
    const mode = $('#aiRewriteMode')?.value;
    if (!mode) return alert('Chọn kiểu AI (Hấp dẫn / Sửa lỗi / Spintax)');
    ensureComposerInit();
    const text = GF.composer?.getPrimaryText() || '';
    if (!text) return alert('Nhập nội dung trước');
    const s = await GF.storage.getSettings();
    if (!(await aiTextReady())) return alert('Chọn Text provider trong Cài đặt hoặc nhập 9Router API key');
    const btn = $('#btnAiRewrite');
    btn.disabled = true;
    btn.textContent = '…';
    try {
      const out = await GF.imageGen.rewritePost(text, s.routerApiKey, s.tidienBaseUrl, mode);
      const ed = GF.composer?.editors?.[GF.composer.activeVar];
      if (ed) ed.setText(out);
      GF.composer?.updateQualityBadge();
    } catch (e) {
      alert(e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'AI';
    }
  });
  $('#btnRefreshComments').addEventListener('click', async () => {
    await syncLocalPostsToServer().catch(() => {});
    await pullMyPostsFromServer().catch(() => {});
    await loadComments();
  });
  $('#btnFillCommentTemplates')?.addEventListener('click', () => fillEmptyCommentDraftsFromTemplate());
  $('#btnRunAllComments').addEventListener('click', () => runAllComments());
  $('#btnScheduleComments').addEventListener('click', () => scheduleSelectedComments());

  $('#btnRadarSave').addEventListener('click', async () => {
    const interval = Number($('#radarInterval').value) || 15;
    const radarIds = state.radarGroupIds.size
      ? [...state.radarGroupIds]
      : [...new Set(state.posts.flatMap((p) => p.groupIds || []))];
    await GF.leadRadar.saveConfig({
      radarActive: $('#radarActive').checked,
      radarKeywords: $('#radarKeywords').value,
      radarInterval: interval,
      radarPush: $('#radarPush').checked,
      radarGroupIds: radarIds,
    });
    state.radarGroupIds = new Set(radarIds);
    await GF.leadRadar.setAlarm($('#radarActive').checked ? interval : 0);
    alert('Đã lưu radar');
  });
  $('#btnRadarScan').addEventListener('click', () => gfSendMessage({ type: 'GF_RADAR_SCAN' }).catch(() => {}));

  $$('.activity-sub-tabs [data-sub]').forEach((btn) => {
    btn.addEventListener('click', () => {
      showActivitySubTab(btn.dataset.sub || 'upcoming');
    });
  });

  $('#btnClearEngineLog')?.addEventListener('click', async () => {
    if (!window.confirm('Xóa toàn bộ nhật ký engine?')) return;
    try {
      await gfSendMessage({ type: 'GF_CLEAR_ENGINE_LOG' });
      renderEngineLog([]);
    } catch (e) {
      alert(e.message);
    }
  });

  $('#btnTidienSyncNow')?.addEventListener('click', () => runTidienSyncNow());

  $('#btnToggleLicenseKey')?.addEventListener('click', () => {
    const input = $('#licenseKeyDisplay');
    const btn = $('#btnToggleLicenseKey');
    if (!input || !btn) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.textContent = showing ? 'Hiện' : 'Ẩn';
  });

  $('#btnLogoutLicense')?.addEventListener('click', async () => {
    if (!window.confirm('Thoát license key? Extension sẽ yêu cầu nhập lại key để dùng tiếp.')) return;
    await chrome.storage.local.remove(['licenseKey', 'licenseInfo']);
    showToast('Đã thoát license key', 'info');
    location.reload();
  });
  $('#btnSaveSettings').addEventListener('click', saveSettingsForm);
  $('#btnSaveActiveProviders')?.addEventListener('click', () => saveActiveProviders().catch((e) => alert(e.message)));
  $('#btnSaveProvider')?.addEventListener('click', () => saveProviderForm().catch((e) => alert(e.message)));
  $('#btnCancelProvider')?.addEventListener('click', resetProviderForm);
  $('#imageSaveMode')?.addEventListener('change', (e) => updateImageSaveModeUI(e.target.value));
  $('#btnPickImageFolder')?.addEventListener('click', async () => {
    try {
      const name = await GF.imageFolder.pickFolder();
      $('#imageSaveDirLabel').textContent = `📁 ${name}`;
      await GF.storage.saveSettings({ imageSaveMode: 'folder' });
      $('#imageSaveMode').value = 'folder';
      updateImageSaveModeUI('folder');
    } catch (e) {
      alert(e.message);
    }
  });
  $('#providerImportFile')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await GF.localProviders.importFromJson(text);
      await loadLocalProviderSelects();
      alert(`Đã import provider từ ${file.name}`);
    } catch (err) {
      alert(err.message);
    }
    e.target.value = '';
  });
  $('#btnExportProviders')?.addEventListener('click', async () => {
    const json = await GF.localProviders.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: 'groupflow-providers.json', saveAs: true });
    URL.revokeObjectURL(url);
  });

  $('#skillImportFile')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await GF.localSkills.importFromJson(text);
      await loadLocalSkillSelects();
      renderLocalSkillList();
      alert(`Đã import skill từ ${file.name}`);
    } catch (err) {
      alert(err.message);
    }
    e.target.value = '';
  });

  $('#btnExportSkills')?.addEventListener('click', async () => {
    const json = await GF.localSkills.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: 'groupflow-skills.json', saveAs: true });
    URL.revokeObjectURL(url);
  });

  $('#btnSaveSkill')?.addEventListener('click', () => saveSkillForm().catch((e) => alert(e.message)));
  $('#btnCancelSkill')?.addEventListener('click', resetSkillForm);

  $('#btnAiGeneratePost')?.addEventListener('click', async () => {
    const topic = $('#aiTopic')?.value?.trim();
    if (!topic) return alert('Nhập chủ đề bài viết');
    const s = await GF.storage.getSettings();
    if (!(await aiTextReady())) {
      return alert('Chọn Text provider trong Cài đặt → AI Provider local');
    }
    const status = $('#aiGenerateStatus');
    const btn = $('#btnAiGeneratePost');
    try {
      if (status) status.textContent = 'Đang viết bài…';
      if (btn) btn.disabled = true;
      const textSkill = $('#aiTextSkill')?.value
        ? state.localSkills.find((s) => String(s.id) === String($('#aiTextSkill').value))
        : null;
      const imageSkill = $('#aiImageSkill')?.value
        ? state.localSkills.find((s) => String(s.id) === String($('#aiImageSkill').value))
        : null;
      const result = await GF.aiApi.generatePost({
        topic,
        textSystemPrompt: textSkill?.system_prompt || '',
        imageSystemPrompt: imageSkill?.system_prompt || '',
        mediaType: $('#aiMediaType')?.value || 'image',
        settings: s,
      });
      $('#srcManual').click();
      GF.composer?.init();
      GF.composer?.setPrimaryText(result.content || '');
      if (result.image_prompt && $('#aiMediaType')?.value !== 'none') {
        $('#manualPrompt').value = result.image_prompt;
        $('#manualAutoImage').checked = true;
      }
      if (status) {
        status.textContent = result.parse_failed
          ? 'Đã điền nội dung (AI không trả JSON đầy đủ — kiểm tra prompt ảnh)'
          : 'Đã điền nội dung + prompt ảnh — kiểm tra và bấm Thêm vào danh sách';
      }
    } catch (e) {
      if (status) status.textContent = e.message;
      alert(e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.querySelectorAll('input[name="securityLevel"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      updateSecurityUI(radio.value);
      await persistChoiceSettings({ securityLevel: radio.value });
    });
  });

  document.querySelectorAll('input[name="classicTextMode"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      updateClassicTextModeUI(radio.value);
      await persistChoiceSettings({ classicTextMode: radio.value, postMode: 'classic' });
    });
  });

  ['pauseEveryGroups', 'pauseMinutesMin', 'pauseMinutesMax'].forEach((id) => {
    $(`#${id}`)?.addEventListener('change', async () => {
      updatePauseSettingsHint();
      await persistChoiceSettings(readPauseSettingsFromForm());
    });
    $(`#${id}`)?.addEventListener('input', () => updatePauseSettingsHint());
  });

  $('#profileTrigger')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('#profileMenu')?.classList.toggle('hidden');
    if (!$('#profileMenu')?.classList.contains('hidden') && !state.profiles) {
      refreshProfiles();
    }
  });
  $('#btnRefreshProfiles')?.addEventListener('click', (e) => {
    e.stopPropagation();
    refreshProfiles(false);
  });
  document.addEventListener('click', () => {
    $('#profileMenu')?.classList.add('hidden');
  });
  $('#profilePicker')?.addEventListener('click', (e) => e.stopPropagation());

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'GF_PROGRESS') {
      showPostingUI(false);
      const data = msg.data || {};
      const { done, total, group, phase, error, pauseRemainSec } = data;
      if (total > 0) applyPostingProgress(done ?? state.postingProgress.done, total);
      else if (typeof done === 'number' && done > 0) applyPostingProgress(done, state.postingProgress.total);
      const status = $('#postingStatus');
      const prog = state.postingProgress;
      if (phase === 'started' && status) {
        status.textContent = data.snippet || `Bắt đầu — 0/${total || prog.total} nhóm`;
      }
      if (phase === 'pause' && status) {
        const base = prog.total ? `Đã xong ${prog.done}/${prog.total} nhóm` : 'Đang nghỉ';
        status.textContent = pauseRemainSec != null
          ? `${base} — nghỉ ${formatPauseCountdown(pauseRemainSec)} rồi tiếp…`
          : (data.snippet || 'Đang nghỉ (bảo vệ tài khoản)…');
      }
      if (phase === 'ok' && status) {
        status.textContent = prog.total
          ? `Xong ${prog.done}/${prog.total}: ${group || ''}`
          : `Xong: ${group || ''}`;
      }
      if ((phase === 'classic-nav' || phase === 'classic-composer' || phase === 'classic-text' || phase === 'classic-media' || phase === 'classic-submit' || phase === 'classic-fallback') && status) {
        const prefix = prog.total ? `[${prog.done}/${prog.total}] ` : '';
        status.textContent = prefix + (data.snippet || phase);
      }
      if (phase === 'posting' && group && status) {
        status.textContent = prog.total
          ? `Đang đăng ${prog.done + 1}/${prog.total}: ${group}`
          : `Đang đăng: ${group}`;
      }
      if (phase === 'error' && group && status) {
        status.textContent = prog.total
          ? `Lỗi ${prog.done}/${prog.total}: ${group}`
          : `Lỗi: ${group}`;
        showActivityJournalSubTab();
        if ($('#tab-activity')?.classList.contains('active')) refreshJournalFromStorage();
      }
      const log = $('#progressLog');
      const logLine = formatProgressLogLine(data);
      if (log && logLine) {
        log.innerHTML += logLine;
        log.scrollTop = log.scrollHeight;
      }
      if (phase === 'stopped') {
        if (status) status.textContent = msg.data?.snippet || 'Đã dừng đăng bài';
        hidePostingUI();
        return;
      }
      if (phase === 'done') {
        const summary = msg.data?.summary;
        const ok = summary?.okCount ?? msg.data?.okCount ?? done ?? 0;
        const fail = summary?.failCount ?? msg.data?.failCount ?? 0;
        const tot = summary?.total ?? total ?? 0;
        if (status) {
          status.textContent = tot && ok >= tot
            ? `Đăng thành công ${ok}/${tot} nhóm!`
            : (ok ? `Xong ${ok}/${tot || ok} nhóm (có lỗi)` : 'Hoàn thành — xem Nhật ký / Lịch sử');
        }
        if (fail > 0) showActivityJournalSubTab();
        updatePostingRing(100);
        refreshActivityFromStorage({ forceHistorySub: true });
        chrome.storage.local.get('postQueue').then((d) => {
          state.posts = mapPostsFromQueue(d.postQueue || []);
          renderPosts();
        });
        setTimeout(async () => {
          hidePostingUI();
          showTab('create');
          await refreshActivityFromStorage();
        }, 2200);
      }
    }
    if (msg.type === 'GF_POST_MATRIX_DONE') {
      showPostResultToast(msg.data);
      chrome.storage.local.get('postQueue').then((d) => {
        state.posts = mapPostsFromQueue(d.postQueue || []);
        renderPosts();
      });
    }
    if (msg.type === 'GF_ENGINE_LOG') {
      refreshJournalFromStorage();
      if (msg.data?.entry?.level === 'error') {
        updateJournalBadge(msg.data?.total || 1, true);
      }
    }
    if (msg.type === 'GF_ACTIVITY_REFRESH') {
      const posting = document.body.classList.contains('gf-posting-active');
      refreshActivityFromStorage({ forceHistorySub: posting });
      const entry = msg.data?.entry;
      if (entry && posting) {
        const log = $('#progressLog');
        if (log) {
          const tag = entry.ok ? 'OK' : 'Lỗi';
          const link = buildHistoryPostUrl(entry);
          const linkHtml = link
            ? ` — <a href="${escAttr(link)}" target="_blank" rel="noopener noreferrer">Mở</a>`
            : '';
          log.innerHTML += `<div>${tag}: ${esc(entry.group_name || entry.group_id || '')}${linkHtml}</div>`;
          log.scrollTop = log.scrollHeight;
        }
      }
    }
    if (msg.type === 'GF_TIDIEN_SYNCED') {
      loadPostedPostsForComment();
      if (msg.data?.draftsAdded > 0) {
        chrome.storage.local.get('postQueue').then((d) => {
          state.posts = mapPostsFromQueue(d.postQueue || []);
          renderPosts();
        });
      }
    }
    if (msg.type === 'GF_GROUPS_SYNCED') {
      state.groupsDeepSyncing = false;
      if (msg.groups?.length) {
        applySyncedGroups(msg.groups, state.groups.length);
        updateGroupsSyncStatus(true);
        if (msg.expectedCount && $('#groupsSyncStatus')) {
          const n = state.groups.length;
          const exp = Number(msg.expectedCount);
          if (Number.isFinite(exp) && exp > 0 && n < exp) {
            $('#groupsSyncStatus').textContent = `${n}/${exp} nhóm — thiếu, thử Shift+↻ quét joins`;
          }
        }
        renderGroupsTab();
        if (state.manualGroupPickerOpen) renderManualGroupPicker();
      } else if (msg.error && $('#groupsSyncStatus')) {
        const n = state.groups.length;
        $('#groupsSyncStatus').textContent = n
          ? `${n} nhóm — cập nhật nền lỗi: ${msg.error}`
          : `Lỗi: ${msg.error}`;
      }
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.extractedGroups) {
      applySyncedGroups(changes.extractedGroups.newValue || [], state.groups.length);
      if ($('#tab-groups')?.classList.contains('active')) renderGroupsTab();
    }
    if (changes.activityHistory) {
      const posting = document.body.classList.contains('gf-posting-active');
      refreshActivityFromStorage({ forceHistorySub: posting });
    }
    if (changes.engineLog) {
      renderEngineLog(changes.engineLog.newValue || []);
    }
    if (changes.postQueue && !suppressPostQueueRerender) {
      mergePostsFromStorage(mapPostsFromQueue(changes.postQueue.newValue || []));
      scheduleRenderPosts();
    }
  });
}

async function getUserSyncBase() {
  const s = await GF.storage.getSettings();
  return (s?.tidienBaseUrl || 'https://tidien.xyz').replace(/\/$/, '');
}

async function syncLocalPostsToServer() {
  const { licenseKey, postQueue } = await chrome.storage.local.get(['licenseKey', 'postQueue']);
  if (!licenseKey) return;
  const queue = postQueue || [];
  const posts = [];
  for (const item of queue) {
    if (item.postStatus !== 'posted') continue;
    for (const g of (item.postedGroups || [])) {
      if (!g.post_id || !/^\d+$/.test(String(g.post_id))) continue;
      posts.push({
        post_queue_id: item.id || '',
        group_id: String(g.group_id || ''),
        group_name: g.group_name || '',
        post_id: String(g.post_id),
        noi_dung: item.noi_dung || '',
        posted_at: g.posted_at || item.lastPostedAt || null,
      });
    }
  }
  if (!posts.length) return;
  try {
    const base = await getUserSyncBase();
    await fetch(`${base}/api/user-sync/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${licenseKey}` },
      body: JSON.stringify({ posts }),
    });
  } catch { /* best-effort */ }
}

async function pullMyPostsFromServer() {
  const { licenseKey } = await chrome.storage.local.get('licenseKey');
  if (!licenseKey) return;
  try {
    const base = await getUserSyncBase();
    const res = await fetch(`${base}/api/user-sync/my-posts?limit=200`, {
      headers: { Authorization: `Bearer ${licenseKey}` },
    });
    if (!res.ok) return;
    const serverPosts = await res.json();
    if (Array.isArray(serverPosts)) {
      await chrome.storage.local.set({ serverMyPosts: serverPosts });
    }
  } catch { /* best-effort */ }
}

async function fetchCrossPostsFromServer() {
  const { licenseKey } = await chrome.storage.local.get('licenseKey');
  if (!licenseKey) return [];
  try {
    const base = await getUserSyncBase();
    const res = await fetch(`${base}/api/user-sync/cross-posts?limit=100`, {
      headers: { Authorization: `Bearer ${licenseKey}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function markCrossPostCommented(serverPostId) {
  const { licenseKey } = await chrome.storage.local.get('licenseKey');
  if (!licenseKey || !serverPostId) return;
  try {
    const base = await getUserSyncBase();
    await fetch(`${base}/api/user-sync/posts/${serverPostId}/commented`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${licenseKey}` },
    });
  } catch { /* best-effort */ }
}

function renderLicenseBadge(licenseInfo) {
  const el = $('#headerLicenseInfo');
  if (!el) return;
  if (licenseInfo?.valid) {
    const plan = licenseInfo.plan ? ` · ${licenseInfo.plan}` : '';
    const text = `${licenseInfo.email || ''}${plan}`;
    el.textContent = text;
    el.title = text;
  } else {
    el.textContent = '';
    el.title = '';
  }
}

async function checkLicenseGate() {
  const { licenseKey, licenseInfo } = await chrome.storage.local.get(['licenseKey', 'licenseInfo']);
  if (licenseKey && licenseInfo?.valid) {
    renderLicenseBadge(licenseInfo);
    $('#gf-activation-overlay')?.remove();
    return true;
  }
  const overlay = $('#gf-activation-overlay');
  if (!overlay) return true;
  const input = $('#overlayLicenseKey');
  const btn = $('#overlayValidateBtn');
  const status = $('#overlayStatus');
  if (licenseKey && input) input.value = licenseKey;
  $('#overlayCloseBtn')?.addEventListener('click', closeSidePanel);
  $('#overlayRegisterLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    const s = GF.storage.cachedSettings;
    const base = (s?.tidienBaseUrl || 'https://tidien.xyz').replace(/\/$/, '');
    chrome.tabs.create({ url: `${base}/user/register` });
  });
  $('#overlayLoginLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    const s = GF.storage.cachedSettings;
    const base = (s?.tidienBaseUrl || 'https://tidien.xyz').replace(/\/$/, '');
    chrome.tabs.create({ url: `${base}/user/login` });
  });
  btn?.addEventListener('click', async () => {
    const key = (input?.value || '').trim().toUpperCase();
    if (!key) { if (status) status.textContent = 'Nhập key trước'; return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Đang xác thực…'; }
    if (status) { status.textContent = ''; status.className = 'gf-activation-status'; }
    try {
      const s = await GF.storage.getSettings();
      const base = (s?.tidienBaseUrl || 'https://tidien.xyz').replace(/\/$/, '');
      const res = await fetch(`${base}/api/user-auth/validate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      await chrome.storage.local.set({ licenseKey: key, licenseInfo: data });
      if (data.valid) {
        renderLicenseBadge(data);
        overlay.remove();
        await finishInit();
      } else {
        if (status) { status.textContent = data.error || 'Key không hợp lệ'; status.className = 'gf-activation-status gf-activation-status--error'; }
        if (btn) { btn.disabled = false; btn.textContent = 'Xác thực key'; }
      }
    } catch {
      if (status) { status.textContent = 'Lỗi kết nối server'; status.className = 'gf-activation-status gf-activation-status--error'; }
      if (btn) { btn.disabled = false; btn.textContent = 'Xác thực key'; }
    }
  });
  return false;
}

async function finishInit() {
  bindEvents();
  initQueueScheduleDefaults();
  await loadSettingsForm();
  initManualPostSettingsForm(await GF.storage.getSettings());
  await loadState();
  await refreshProfiles(true);
  if (!state.profiles?.personal?.id) await fallbackFbUser();
  updateManualGroupSummary();
  ensureComposerInit();
  updateBatchFooter();
  try {
    const sess = await chrome.storage.session.get(['gfPostingActive']);
    if (sess.gfPostingActive) showPostingUI(false);
  } catch { /* ignore */ }
  syncLocalPostsToServer().catch(() => {});
  pullMyPostsFromServer().catch(() => {});
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!gfRuntimeAlive()) showContextInvalidBanner();
  document.body.classList.add('gf-tab-create');
  const passed = await checkLicenseGate();
  if (!passed) return;
  await finishInit();
});
