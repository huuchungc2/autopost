/* global GF, XLSX */

const state = {
  posts: [],
  groups: [],
  customGroupSets: [],
  assignPostIds: new Set(),
  assignGroupIds: new Set(),
  editingPostId: null,
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
  manualAdvancedOpen: false,
  manualPostSettingsOpen: false,
  aiProviders: [],
  localSkills: [],
  localProviders: [],
  editingSkillId: null,
  groupFilterPrivacy: 'all',
  groupFilterApproval: 'all',
  groupFilterRole: 'all',
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

function mapPostsFromQueue(queue, legacyGroupIds = []) {
  return (queue || []).map((p) => {
    const post = { ...p };
    if (!Array.isArray(post.groupIds)) {
      post.groupIds = legacyGroupIds.length ? [...legacyGroupIds] : [];
    }
    if (post.autoGenerateImage === undefined) post.autoGenerateImage = true;
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
  if (name === 'groups') {
    renderGroupsTab();
  }
  if (name === 'skills') {
    loadLocalSkillSelects();
    renderLocalSkillList();
  }
  if (name === 'activity') {
    chrome.storage.local.get('activityHistory').then((d) => {
      refreshActivityFromStorage({ preferHistory: hasRecentHistory(d.activityHistory || []) });
    });
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
  renderLeads(d.radarLeads || []);
  await applyTidienCommentsFromStorage();
  const syncedAt = Number(d.groupsSyncedAt || 0);
  const stale = !syncedAt || (Date.now() - syncedAt > 30 * 60 * 1000);
  const cacheEmpty = !state.groups.length;

  // Giống GPP: cache ngay, sync GraphQL 1 request nền — không chặn panel.
  if (cacheEmpty || stale) {
    schedulePassiveGroupSync();
  } else {
    updateGroupsSyncStatus(false);
  }
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
    await syncGroupsFromFb({ silent: false, deep: false });
    startBackgroundDeepSync();
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
  if (!state.manualMediaList.length) return post;
  const video = state.manualMediaList.find((m) => m.type === 'video');
  if (video) {
    post.mediaType = 'video';
    post.videoBase64 = video.base64;
    post.mediaMime = video.mime;
    post.imageStatus = 'ready';
    return post;
  }
  post.images = state.manualMediaList.map((m) => ({
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
  const missing = state.posts.filter((p) => p.selected !== false && !ensurePostGroups(p).groupIds.length).length;
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
    if (deep) {
      status.textContent = prevCount
        ? `${prevCount} nhóm — đang quét thêm từ FB…`
        : 'Đang tải danh sách nhóm từ Facebook…';
    } else if (quick && !silent) {
      status.textContent = 'Đang đọc đủ nhóm (GraphQL nền)…';
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
      ? `${n} nhóm — đã quét đủ (↻ để làm mới)`
      : 'Cần đăng nhập FB trên Chrome — bấm ↻';
  } else {
    status.textContent = n
      ? `${n} nhóm (GraphQL nền)${needsDeepSyncHint(n)}`
      : 'Chưa có nhóm — mở facebook.com hoặc bấm ↻';
  }
}

function startBackgroundDeepSync() {
  if (state.groupsDeepSyncing) return;
  state.groupsDeepSyncing = true;
  const status = $('#groupsSyncStatus');
  const prev = state.groups.length;
  if (status && prev) {
    status.textContent = `${prev} nhóm — đang quét đủ từ FB (nền)…`;
  }
  gfSendMessage({ type: 'GF_SYNC_GROUPS_BACKGROUND' }).catch(() => {
    state.groupsDeepSyncing = false;
    if (status && prev) {
      status.textContent = `${prev} nhóm — quét nền lỗi, bấm ↻ thử lại`;
    }
  });
}

function needsDeepSyncHint(n) {
  return n > 0 && n < 25 ? ' — bấm ↻ nếu thiếu nhóm' : '';
}

function ensureComposerInit(maxTries = 20) {
  let tries = 0;
  const tick = () => {
    tries += 1;
    GF.composer?.init();
    // init() sets _ready when Quill is available and mounted
    if (GF.composer?._ready) {
      setupManualDraftPersistence();
      return;
    }
    if (tries >= maxTries) return;
    setTimeout(tick, 200);
  };
  tick();
}

const MANUAL_DRAFT_KEY = 'gfManualDraft';
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
  if (manualDraftSaveTimer) clearTimeout(manualDraftSaveTimer);
  manualDraftSaveTimer = setTimeout(async () => {
    try {
      const C = GF.composer;
      if (!C?._ready) return;
      const vars = {};
      (C.VAR_KEYS || ['A', 'B', 'C', 'D']).forEach((k) => {
        const ed = C.editors?.[k];
        if (!ed) return;
        const plain = String(ed.getText() || '').replace(/\s+$/g, '');
        if (plain.trim()) vars[k] = plain;
      });
      await saveManualDraft({
        vars,
        activeVar: C.activeVar || 'A',
        backgroundColor: C.backgroundColor || '#18191A',
        updatedAt: Date.now(),
      });
    } catch { /* ignore */ }
  }, 450);
}

async function restoreManualDraftIfAny() {
  const C = GF.composer;
  if (!C?._ready) return;
  const draft = await loadManualDraft();
  if (!draft?.vars) return;

  // Only restore if user hasn't typed anything in current session
  const current = C.getVariationTexts?.() || {};
  const hasAny = Object.values(current).some((t) => String(t || '').trim());
  if (hasAny) return;

  try {
    Object.entries(draft.vars).forEach(([k, text]) => {
      const ed = C.editors?.[k];
      if (!ed) return;
      ed.setText(String(text || ''));
    });
    if (draft.backgroundColor) C.setBackground?.(draft.backgroundColor);
    if (draft.activeVar) C.setVariation?.(draft.activeVar);
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
  const privacyFilter = $('#groupFilterPrivacy')?.value || state.groupFilterPrivacy || 'all';
  const approvalFilter = $('#groupFilterApproval')?.value || state.groupFilterApproval || 'all';
  const roleFilter = $('#groupFilterRole')?.value || state.groupFilterRole || 'all';
  return (groups || []).filter((g) => {
    if (q && !groupMatchesSearch(g.name, q)) return false;
    if (privacyFilter !== 'all' && groupPrivacyBucket(g.privacy) !== privacyFilter) return false;
    if (approvalFilter !== 'all' && groupApprovalBucket(g) !== approvalFilter) return false;
    if (roleFilter !== 'all' && groupRoleBucket(g) !== roleFilter) return false;
    return true;
  });
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
    box.innerHTML = '<p class="hint">Chưa có provider — import JSON hoặc thêm ở trên.</p>';
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
  if (el && total) el.textContent = `${done} / ${total}`;
}

/** GPP `.LoadingDiv` — full overlay, không chồng form tạo bài */
function showPostingUI(clearLog = true) {
  closeManualGroupPicker();
  $('#postingOverlay')?.classList.remove('hidden');
  document.body.classList.add('gf-posting-active');
  if (clearLog) {
    const log = $('#progressLog');
    if (log) log.innerHTML = '';
    updatePostingRing(0);
    updatePostingCount(0, 0);
    const status = $('#postingStatus');
    if (status) status.textContent = 'Đang chuẩn bị engine…';
  }
}

function hidePostingUI() {
  $('#postingOverlay')?.classList.add('hidden');
  document.body.classList.remove('gf-posting-active');
}

function toggleManualAdvanced(force) {
  state.manualAdvancedOpen = typeof force === 'boolean' ? force : !state.manualAdvancedOpen;
  $('#manualAdvancedPanel')?.classList.toggle('hidden', !state.manualAdvancedOpen);
  $('#btnToggleAdvanced')?.classList.toggle('active', state.manualAdvancedOpen);
}

const SECURITY_HINTS = {
  fast: 'Nhanh: ~1–2 phút/nhóm — chỉ khi ít nhóm.',
  balanced: 'Cân bằng: ~3–5 phút/nhóm — khuyên dùng.',
  safe: 'An toàn: ~7–10 phút/nhóm — tài khoản mới / nhiều nhóm.',
};

function updateManualSecurityUI(level) {
  const radio = document.querySelector(`input[name="manualSecurityLevel"][value="${level}"]`);
  if (radio) radio.checked = true;
  document.querySelectorAll('.gf-security-pill').forEach((pill) => {
    const input = pill.querySelector('input');
    pill.classList.toggle('active', input?.checked);
  });
  const hint = $('#manualSecurityHint');
  if (hint) hint.textContent = SECURITY_HINTS[level] || SECURITY_HINTS.balanced;
}

function updateManualPostModeUI(mode) {
  const radio = document.querySelector(`input[name="manualPostMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
}

function readManualPostSettings() {
  return {
    postMode: document.querySelector('input[name="manualPostMode"]:checked')?.value || 'fast',
    securityLevel: document.querySelector('input[name="manualSecurityLevel"]:checked')?.value || 'balanced',
    avoidNight: $('#manualAvoidNight')?.checked !== false,
    pauseEvery: Math.max(1, Number($('#manualPauseEvery')?.value) || 1),
    pauseMinutes: Math.max(0, Number($('#manualPauseMinutes')?.value) || 2),
    delayOnFail: $('#manualDelayOnFail')?.checked === true,
    firstComment: $('#manualFirstComment')?.value.trim() || '',
    firstCommentEnabled: $('#manualFirstCommentOn')?.checked === true,
  };
}

function applyManualAutomationToPost(post) {
  Object.assign(post, readManualPostSettings());
  return post;
}

function ensurePostAutomation(post, settings = {}) {
  if (!post.postMode) post.postMode = settings.postMode || 'fast';
  if (!post.securityLevel) post.securityLevel = settings.securityLevel || 'balanced';
  if (post.avoidNight === undefined) post.avoidNight = settings.avoidNight !== false;
  if (!post.pauseEvery) post.pauseEvery = 1;
  if (post.pauseMinutes === undefined) post.pauseMinutes = 2;
  if (post.delayOnFail === undefined) post.delayOnFail = false;
  return post;
}

function initManualPostSettingsForm(settings) {
  const s = settings || {};
  updateManualPostModeUI(s.postMode || 'fast');
  updateManualSecurityUI(s.securityLevel || 'balanced');
  if ($('#manualAvoidNight')) $('#manualAvoidNight').checked = s.avoidNight !== false;
  if ($('#manualPauseEvery')) $('#manualPauseEvery').value = '1';
  if ($('#manualPauseMinutes')) $('#manualPauseMinutes').value = '2';
  if ($('#manualDelayOnFail')) $('#manualDelayOnFail').checked = false;
}

function toggleManualPostSettings(force) {
  state.manualPostSettingsOpen = typeof force === 'boolean' ? force : !state.manualPostSettingsOpen;
  $('#manualPostSettingsPanel')?.classList.toggle('hidden', !state.manualPostSettingsOpen);
  $('#btnTogglePostSettings')?.classList.toggle('open', state.manualPostSettingsOpen);
  $('#btnTogglePostSettings')?.setAttribute('aria-expanded', state.manualPostSettingsOpen ? 'true' : 'false');
}

function postAutomationTags(p) {
  const mode = { fast: 'Nhanh', classic: 'Cổ điển' }[p.postMode] || '';
  const sec = { fast: 'Giãn nhanh', balanced: 'Cân bằng', safe: 'An toàn' }[p.securityLevel] || '';
  const parts = [];
  if (mode) parts.push(mode);
  if (sec) parts.push(sec);
  if (p.avoidNight !== false) parts.push('Tránh đêm');
  if (Number(p.pauseEvery) > 1 || Number(p.pauseMinutes) > 2) {
    parts.push(`Nghỉ ${p.pauseEvery || 1}/${p.pauseMinutes ?? 2}p`);
  }
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
}

function onManualPickerClick(e) {
  const clearBtn = e.target.closest('#btnManualClearGroups');
  if (clearBtn) {
    e.preventDefault();
    state.manualGroupIds = new Set();
    renderManualGroupListOnly();
    updateManualGroupSummary();
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
  return Boolean(post?.imageBase64 || post?.videoBase64 || post?.images?.length);
}

async function savePosts() {
  await chrome.storage.local.set({ postQueue: state.posts });
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
  if (p.mediaType === 'video' && p.videoBase64) {
    return `<video class="thumb" src="data:${escAttr(p.mediaMime || 'video/mp4')};base64,${p.videoBase64}" muted></video>`;
  }
  const imgs = GF.postMedia?.getPostImages?.(p) || [];
  if (!imgs.length) return '';
  const shown = imgs.slice(0, 4).map((img) => (
    `<img class="thumb" src="data:${escAttr(img.mime || 'image/png')};base64,${img.base64}" alt="" />`
  )).join('');
  const more = imgs.length > 4 ? `<span class="thumb-more">+${imgs.length - 4}</span>` : '';
  return `${shown}${more}`;
}

function renderPosts() {
  const box = $('#postList');
  const countEl = $('#postCount');
  if (countEl) countEl.textContent = String(state.posts.length);

  if (!state.posts.length) {
    box.innerHTML = emptyState('📋', 'Chưa có bài trong queue — import Excel hoặc tải từ web');
    return;
  }

  box.innerHTML = state.posts.map((p) => {
    ensurePostGroups(p);
    const isEditing = p.id === state.editingPostId;
    const hasMedia = postHasMedia(p);
    const noGroups = !p.groupIds.length;
    const previewMedia = !isEditing && hasMedia ? postPreviewThumbs(p) : '';
    const postedClass = p.postStatus === 'posted' ? 'post-published' : (p.postStatus === 'failed' ? 'post-failed' : '');
    return `
    <div class="list-item post-card ${noGroups ? 'post-needs-groups' : ''} ${postedClass}">
      <div class="check-row post-preview-row">
        <input type="checkbox" data-post-id="${p.id}" ${p.selected !== false ? 'checked' : ''} />
        <div class="post-preview-main">
          <div class="post-body">${esc(p.noi_dung?.slice(0, 120) || '—')}</div>
          ${previewMedia ? `<div class="post-preview-media">${previewMedia}</div>` : ''}
        </div>
      </div>
      <div class="post-meta">
        ${postStatusTag(p)}
        <span class="tag ${p.groupIds.length ? 'web' : 'pending'}">${esc(postGroupSummary(p))}</span>
        ${p.campaignName ? `<span class="tag web">${esc(p.campaignName)}</span>` : ''}
        ${p.variations?.length > 1 ? `<span class="tag">${p.variations.length} biến thể</span>` : ''}
        ${p.backgroundColor && p.backgroundColor !== '#18191A' ? '<span class="tag">Nền màu</span>' : ''}
        ${p.firstCommentEnabled ? '<span class="tag ready">1st cmt</span>' : ''}
        ${postAutomationTags(p)}
        ${p.is_shared ? '<span class="tag">Shared</span>' : ''}
        ${imageTag(p.imageStatus, p.mediaType)}
        ${!hasMedia && p.autoGenerateImage !== false && p.prompt_anh ? '<span class="tag ready">Tự xuất ảnh</span>' : ''}
        ${p.anh_ngay_dang ? `<span class="tag">Ảnh: ${esc(p.anh_ngay_dang)} ${esc(p.anh_gio_dang || '')}</span>` : ''}
        ${p.ngay_dang ? `<span class="tag">Đăng: ${esc(p.ngay_dang)} ${esc(p.gio_dang || '')}</span>` : ''}
        ${p.lastPostedAt ? `<span class="tag ready">Lúc ${esc(formatPostedAt(p.lastPostedAt))}</span>` : ''}
      </div>
      ${renderPostedGroupsBlock(p)}
      ${isEditing ? `
      <div class="post-edit">
        <div class="post-edit-compose">
          <div class="post-edit-text">
            <label class="field-label">Nội dung</label>
            <textarea rows="5" data-edit-field="noi_dung">${esc(p.noi_dung || '')}</textarea>
          </div>
          <div class="post-edit-media-side">
            ${hasMedia ? `
            <span class="field-label">Media</span>
            ${p.mediaType === 'video' && p.videoBase64
    ? `<video class="thumb" src="data:${escAttr(p.mediaMime || 'video/mp4')};base64,${p.videoBase64}" muted controls></video>`
    : ''}
            ${p.imageBase64 && p.mediaType !== 'video'
    ? `<img class="thumb" src="data:${escAttr(p.mediaMime || 'image/png')};base64,${p.imageBase64}" alt="" />`
    : ''}
            <button type="button" class="btn ghost sm" data-clear-media="${p.id}">Xóa media</button>
            ` : `
            <span class="field-label">Prompt ảnh AI</span>
            <input type="text" data-edit-field="prompt_anh" value="${escAttr(p.prompt_anh || '')}" placeholder="Nếu chưa có ảnh/video" />
            <label class="switch-row">
              <input type="checkbox" data-edit-bool="autoGenerateImage" ${p.autoGenerateImage !== false ? 'checked' : ''} />
              <span>Tự xuất ảnh khi đăng</span>
            </label>
            <label class="field-label">Lịch xuất ảnh</label>
            <div class="row">
              <input type="date" data-edit-field="anh_ngay_dang" value="${escAttr(p.anh_ngay_dang || '')}" />
              <input type="time" data-edit-field="anh_gio_dang" value="${escAttr(p.anh_gio_dang || '')}" />
            </div>
            `}
          </div>
        </div>
        <label class="field-label">Lịch đăng bài</label>
        <div class="row">
          <input type="date" data-edit-field="ngay_dang" value="${escAttr(p.ngay_dang || '')}" />
          <input type="time" data-edit-field="gio_dang" value="${escAttr(p.gio_dang || '')}" />
        </div>
        <label class="field-label">Nhóm đăng</label>
        <p class="hint post-edit-groups-summary">${esc(formatGroupList(p.groupIds))}</p>
        ${inlineGroupPickerHtml(p, { forceShow: true })}
        <div class="post-actions">
          <button type="button" class="btn primary sm" data-save-edit="${p.id}">Lưu</button>
          <button type="button" class="btn ghost sm" data-cancel-edit="${p.id}">Đóng</button>
        </div>
      </div>
      ` : ''}
      ${!isEditing ? inlineGroupPickerHtml(p) : ''}
      <div class="post-actions">
        ${!isEditing ? `<button type="button" class="btn ghost sm accent" data-toggle-groups="${p.id}">${state.inlineGroupPickerPostId === p.id ? 'Đóng nhóm' : 'Chọn nhóm'}</button>` : ''}
        <button type="button" class="btn ghost sm" data-edit-post="${p.id}">${isEditing ? 'Đóng sửa' : 'Sửa'}</button>
        ${!hasMedia ? `<button type="button" class="btn ghost sm accent" data-gen="${p.id}">Generate</button>` : ''}
        <button type="button" class="btn ghost sm" data-del-post="${p.id}">Xóa</button>
      </div>
    </div>
  `;
  }).join('');

  box.querySelectorAll('[data-post-id]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const post = state.posts.find((x) => x.id === cb.dataset.postId);
      if (post) post.selected = cb.checked;
      savePosts();
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
  box.querySelectorAll('[data-edit-post]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.editPost;
      const opening = state.editingPostId !== id;
      state.editingPostId = opening ? id : null;
      state.inlineGroupPickerPostId = opening ? id : null;
      state.inlineGroupSearch = '';
      renderPosts();
    });
  });
  box.querySelectorAll('[data-save-edit]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const post = state.posts.find((x) => x.id === btn.dataset.saveEdit);
      const wrap = btn.closest('.post-edit');
      if (!post || !wrap) return;
      wrap.querySelectorAll('[data-edit-field]').forEach((el) => {
        post[el.dataset.editField] = el.value.trim();
      });
      wrap.querySelectorAll('[data-edit-bool]').forEach((el) => {
        post[el.dataset.editBool] = el.checked;
      });
      state.editingPostId = null;
      state.inlineGroupPickerPostId = null;
      state.inlineGroupSearch = '';
      await savePosts();
      renderPosts();
    });
  });
  box.querySelectorAll('[data-cancel-edit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.editingPostId = null;
      state.inlineGroupPickerPostId = null;
      state.inlineGroupSearch = '';
      renderPosts();
    });
  });
  box.querySelectorAll('[data-clear-media]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const post = state.posts.find((x) => x.id === btn.dataset.clearMedia);
      if (!post) return;
      post.imageBase64 = null;
      post.videoBase64 = null;
      post.mediaType = null;
      post.mediaMime = null;
      post.imageStatus = 'pending';
      await savePosts();
      renderPosts();
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
      if (state.editingPostId === id) state.editingPostId = null;
      await savePosts();
      renderPosts();
      renderGroupsTab();
    });
  });
}

function renderGroupsTab() {
  renderAssignPosts();
  renderGroupLibrary();
  renderCustomSets();
  const countEl = $('#groupCount');
  if (countEl) countEl.textContent = String(state.groups.length);
  const pickerCount = $('#assignPickerCount');
  if (pickerCount) pickerCount.textContent = String(state.assignGroupIds.size);
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
  updateGroupFilterSummary(filtered);
  const pickerIds = state.assignGroupIds;

  const emptyMsg = state.groups.length
    ? 'Không có nhóm khớp bộ lọc'
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
    box.innerHTML = emptyState('📁', 'Chưa có bộ custom — tick nhóm FB rồi「+ Tạo từ nhóm đang chọn」');
    return;
  }
  box.innerHTML = state.customGroupSets.map((set) => `
    <div class="list-item custom-set-card">
      <div class="custom-set-head">
        <strong>${esc(set.name)}</strong>
        <span class="tag">${set.groupIds.length} nhóm</span>
      </div>
      <div class="hint">${esc(formatGroupList(set.groupIds))}</div>
      <div class="post-actions">
        <button type="button" class="btn primary sm" data-apply-set="${esc(set.id)}">Gán cho bài đã chọn</button>
        <button type="button" class="btn ghost sm" data-edit-set="${esc(set.id)}">Sửa tên</button>
        <button type="button" class="btn ghost sm" data-del-set="${esc(set.id)}">Xóa</button>
      </div>
    </div>
  `).join('');

  box.querySelectorAll('[data-apply-set]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const set = state.customGroupSets.find((s) => s.id === btn.dataset.applySet);
      if (!set) return;
      try {
        applyGroupsToSelectedPosts(set.groupIds);
        await saveGroupsData();
        renderPosts();
        renderGroupsTab();
        alert(`Đã gán bộ「${set.name}」cho ${state.assignPostIds.size} bài`);
      } catch (e) {
        alert(e.message);
      }
    });
  });
  box.querySelectorAll('[data-edit-set]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const set = state.customGroupSets.find((s) => s.id === btn.dataset.editSet);
      if (!set) return;
      const name = window.prompt('Tên bộ custom:', set.name);
      if (!name?.trim()) return;
      set.name = name.trim();
      await GF.groupSets.update(set.id, { name: set.name });
      state.customGroupSets = await GF.groupSets.getAll();
      renderCustomSets();
    });
  });
  box.querySelectorAll('[data-del-set]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Xóa bộ custom này?')) return;
      state.customGroupSets = await GF.groupSets.remove(btn.dataset.delSet);
      await saveGroupsData();
      renderCustomSets();
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
  const payload = { posts: [post] };
  await gfSendMessage({
    type: 'GF_SCHEDULE_ALARM',
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
  for (const p of state.posts.filter((x) => x.selected !== false && !x.imageBase64 && !x.videoBase64)) {
    await generateOne(p.id);
  }
}

function getSelectedPosts() {
  return state.posts.filter((p) => p.selected !== false);
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

async function startPostNow() {
  try {
    const settings = await GF.storage.getSettings();
    const job = buildPostJob(true);
    job.posts = job.posts.map((p) => ensurePostAutomation(p, settings));

    const nightSensitive = job.posts.filter((p) => p.avoidNight !== false);
    if (nightSensitive.length && GF.scheduler.isNightBlocked()) {
      if (!window.confirm(`${nightSensitive.length} bài bật tránh ban đêm (22:00–07:00). Vẫn đăng?`)) return;
    }

    const payload = {
      ...job,
      actorId: state.activeActorId || settings.activeActorId,
    };
    showPostingUI();
    await gfSendMessage({ type: 'GF_START_POST', payload });
  } catch (e) {
    alert(e.message);
  }
}

async function schedulePost() {
  const settings = await GF.storage.getSettings();
  let posts;
  try {
    posts = buildPostJob(true).posts;
  } catch (e) {
    return alert(e.message);
  }

  const upcoming = (await chrome.storage.local.get('activityUpcoming')).activityUpcoming || [];
  let scheduled = 0;

  for (const post of posts) {
    const postWhen = GF.scheduler.parseScheduleDate(post.ngay_dang, post.gio_dang);
    if (!postWhen || postWhen < Date.now()) {
      alert(`Bài «${(post.noi_dung || '').slice(0, 40)}…» cần ngày/giờ đăng hợp lệ trong tương lai (Sửa bài).`);
      return;
    }

    if (postNeedsScheduledImage(post)) {
      const imageWhen = GF.scheduler.parseScheduleDate(post.anh_ngay_dang, post.anh_gio_dang);
      if (imageWhen) {
        if (imageWhen >= postWhen) {
          alert(`Bài «${(post.noi_dung || '').slice(0, 30)}…»: lịch xuất ảnh phải trước giờ đăng`);
          return;
        }
        if (imageWhen < Date.now()) {
          alert(`Bài «${(post.noi_dung || '').slice(0, 30)}…»: lịch xuất ảnh phải trong tương lai`);
          return;
        }
        await scheduleImageAlarm(post, imageWhen, upcoming);
      }
    }

    const alarmName = `gf_job_${post.id}_${Date.now()}_${scheduled}`;
    const payload = {
      posts: [post],
      sync: true,
      postMode: settings.postMode,
      actorId: state.activeActorId || settings.activeActorId,
    };
    await gfSendMessage({
      type: 'GF_SCHEDULE_ALARM',
      name: alarmName,
      when: postWhen,
      data: { kind: 'post', payload },
    });
    upcoming.push({
      id: alarmName,
      alarmName,
      kind: 'post',
      when: postWhen,
      postId: post.id,
      snippet: post.noi_dung?.slice(0, 80) || '',
      groupIds: [...post.groupIds],
      payload,
      label: `Đăng → ${formatGroupList(post.groupIds)}`,
    });
    scheduled += 1;
  }

  await chrome.storage.local.set({ activityUpcoming: upcoming });
  alert(scheduled === 1 ? 'Đã lên lịch 1 bài' : `Đã lên lịch ${scheduled} bài (mỗi bài một giờ riêng)`);
  loadState();
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
    const payload = {
      posts: [post],
      sync: true,
      postMode: settings.postMode,
      actorId: state.activeActorId || settings.activeActorId,
    };
    await gfSendMessage({
      type: 'GF_SCHEDULE_ALARM',
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
  const payload = item.payload || (kind === 'post' ? {
    posts: post ? [post] : [],
    sync: true,
    postMode: settings.postMode,
    actorId: state.activeActorId || settings.activeActorId,
  } : item.payload);
  const alarmName = kind === 'comment'
    ? `${prefix}_${item.recordId || item.payload?.record_id || 'cmt'}_${Date.now()}`
    : `${prefix}_${item.postId || 'post'}_${Date.now()}`;
  await gfSendMessage({
    type: 'GF_SCHEDULE_ALARM',
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

async function applyTidienCommentsFromStorage() {
  const d = await chrome.storage.local.get(['tidienPendingComments', 'tidienCommentsSyncedAt']);
  state.comments = d.tidienPendingComments || [];
  const badge = $('#commentBadge');
  if (badge) badge.textContent = state.comments.length ? String(state.comments.length) : '';
  if ($('#tab-comment')?.classList.contains('active')) renderComments();
}

async function triggerTidienAutoSync({ silent = false, force = false, scope = 'comments' } = {}) {
  try {
    const res = await gfSendMessage({ type: 'GF_TIDIEN_SYNC', force, scope });
    if (res?.skipped === 'no_auth' || res?.skipped === 'disabled' || res?.skipped === 'throttle') return;
    await applyTidienCommentsFromStorage();
    if (res?.draftsAdded > 0) {
      const d = await chrome.storage.local.get('postQueue');
      state.posts = mapPostsFromQueue(d.postQueue || []);
      renderPosts();
      if (!silent) showToast(`Đã tải ${res.draftsAdded} draft từ tidien`, 'info', 5000);
    }
    if (!silent && res?.postsFetched > 0) {
      const remain = Number(res.pendingPostsSync);
      const extra = Number.isFinite(remain) && remain > 0 ? ` — còn ${remain} bài trên server` : '';
      showToast(`+${res.postsFetched} bài mới${extra}`, 'info', 4000);
    }
  } catch {
    /* chưa đăng nhập tidien — bỏ qua */
  }
}

async function loadComments() {
  await applyTidienCommentsFromStorage();
  if (!state.comments.length) {
    const box = $('#commentList');
    if (box) {
      box.innerHTML = emptyState('💬', 'Chưa có bài — đăng nhập tidien trong Cài đặt; mở tab này để sync');
    }
  } else {
    renderComments();
  }
  const startEl = $('#commentScheduleStart');
  if (startEl && !startEl.value) {
    const t = new Date(Date.now() + 30 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    startEl.value = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
  }
  triggerTidienAutoSync({ silent: true });
}

function renderComments() {
  const box = $('#commentList');
  if (!state.comments.length) {
    box.innerHTML = emptyState('💬', 'Chưa có bài từ tidien — kiểm tra đăng nhập; sync thông minh ~10 phút hoặc bấm ↻');
    return;
  }
  box.innerHTML = state.comments.map((c) => {
    const draft = state.commentDrafts[c.id] || '';
    return `
    <div class="list-item">
      <label class="check-row"><input type="checkbox" data-comment-id="${c.id}" checked /></label>
      <div>${esc(c.noi_dung?.slice(0, 60) || '')}</div>
      <div class="hint">${esc(c.group_name || c.group_id || '')} · ${esc(c.poster_name || c.posted_by)} · 💬×${c.my_comment_count || 0}</div>
      <textarea data-draft="${c.id}" rows="2" placeholder="Comment AI...">${esc(draft)}</textarea>
      <div class="row">
        <button type="button" class="btn outline sm" data-ai-comment="${c.id}">AI</button>
        <button type="button" class="btn primary sm" data-run-comment="${c.id}">▶ Chạy</button>
      </div>
    </div>`;
  }).join('');

  box.querySelectorAll('[data-draft]').forEach((ta) => {
    ta.addEventListener('input', () => { state.commentDrafts[ta.dataset.draft] = ta.value; });
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
  const comment = state.commentDrafts[id];
  if (!c || !comment) return alert('Nhập hoặc generate comment trước');
  const settings = await GF.storage.getSettings();
  if (settings.avoidNight !== false && GF.scheduler.isNightBlocked()) {
    if (!window.confirm('Đang trong khung 22:00–07:00. Vẫn comment?')) return;
  }
  await gfSendMessage({
    type: 'GF_RUN_COMMENT',
    payload: {
      record_id: c.id,
      group_id: c.group_id,
      post_id: c.post_id,
      comment,
      actorId: state.activeActorId || settings.activeActorId,
    },
  });
  await loadComments();
}

function collectSelectedCommentJobs() {
  const ids = [...document.querySelectorAll('[data-comment-id]:checked')].map((el) => el.dataset.commentId);
  const jobs = [];
  for (const id of ids) {
    const c = state.comments.find((x) => x.id === id);
    const comment = (state.commentDrafts[id] || '').trim();
    if (!c) continue;
    if (!comment) {
      alert(`Bài «${(c.noi_dung || c.group_name || id).toString().slice(0, 40)}»: nhập hoặc AI comment trước`);
      return null;
    }
    jobs.push({
      record_id: c.id,
      group_id: c.group_id,
      post_id: c.post_id,
      comment,
      label: (c.noi_dung || c.group_name || 'Comment').slice(0, 60),
    });
  }
  if (!jobs.length) {
    alert('Chọn ít nhất một bài');
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
  const jobs = collectSelectedCommentJobs();
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
  const jobs = collectSelectedCommentJobs();
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
    const alarmName = `gf_cmt_${job.record_id}_${Date.now()}_${i}`;
    const payload = { ...job, actorId };
    await gfSendMessage({
      type: 'GF_SCHEDULE_ALARM',
      name: alarmName,
      when: cursor,
      data: { kind: 'comment', payload },
    });
    upcoming.push({
      id: alarmName,
      alarmName,
      kind: 'comment',
      when: cursor,
      recordId: job.record_id,
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
      return `https://www.facebook.com/groups/${gid}/permalink/${s}/`;
    }
    return `https://www.facebook.com/groups/${gid}/posts/${encodeURIComponent(s)}`;
  }
  if (h?.ok) return `https://www.facebook.com/groups/${gid}`;
  return '';
}

function buildPostedGroupUrl(g) {
  if (g?.url) return g.url;
  const gid = g?.group_id;
  const pid = g?.post_id;
  if (gid && pid && pid !== 'pending' && /^\d+$/.test(String(pid))) {
    return `https://www.facebook.com/groups/${gid}/permalink/${String(pid)}/`;
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

function showActivityHistorySubTab() {
  $$('[data-sub]').forEach((b) => {
    b.classList.toggle('active', b.dataset.sub === 'history');
  });
  $('#activityHistory')?.classList.remove('hidden');
  $('#activityUpcoming')?.classList.add('hidden');
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
      ${h.error ? `<div class="hint" style="color:var(--error)">${esc(h.error)}</div>` : ''}
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
  const mode = getSelectedPostMode();
  const sec = getSelectedSecurityLevel();
  const modeLabel = { fast: 'Nhanh', classic: 'Cổ điển' }[mode] || mode;
  const secLabel = { fast: 'Giãn nhanh', balanced: 'Cân bằng', safe: 'An toàn' }[sec] || sec;
  el.textContent = `${modeLabel} · ${secLabel}`;
}

function updatePostModeUI(mode) {
  const radio = document.querySelector(`input[name="postMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  updatePostingConfigSummary();
}

function updateSecurityUI(level) {
  const hints = {
    fast: 'Nhanh: ~1–2 phút/group, ~3 phút giữa bài, ~1.5–3 phút giữa comment.',
    balanced: 'Cân bằng: ~3–5 phút/group, ~7 phút giữa bài, ~3–5 phút giữa comment. Khuyên dùng.',
    safe: 'An toàn: ~7–10 phút/group, ~15 phút giữa bài, ~5–10 phút giữa comment.',
  };
  const radio = document.querySelector(`input[name="securityLevel"][value="${level}"]`);
  if (radio) radio.checked = true;
  const hint = $('#securityHint');
  if (hint) hint.textContent = hints[level] || hints.balanced;
  updatePostingConfigSummary();
}

function getSelectedPostMode() {
  return document.querySelector('input[name="postMode"]:checked')?.value || 'fast';
}

function getSelectedSecurityLevel() {
  return document.querySelector('input[name="securityLevel"]:checked')?.value || 'balanced';
}

async function persistChoiceSettings(patch) {
  await GF.storage.saveSettings(patch);
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
  if ($('#classicFallbackOnFastFail')) {
    $('#classicFallbackOnFastFail').checked = s.classicFallbackOnFastFail === true;
  }
  if ($('#tidienAutoSyncEnabled')) $('#tidienAutoSyncEnabled').checked = s.tidienAutoSyncEnabled !== false;
  if ($('#tidienAutoPullDrafts')) $('#tidienAutoPullDrafts').checked = s.tidienAutoPullDrafts !== false;
  if ($('#tidienAutoSyncMinutes')) $('#tidienAutoSyncMinutes').value = String(s.tidienAutoSyncMinutes || 10);
  updatePostModeUI(s.postMode);
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
}

async function saveSettingsForm() {
  const postMode = getSelectedPostMode();
  const securityLevel = getSelectedSecurityLevel();
  await GF.storage.saveSettings({
    tidienBaseUrl: $('#tidienBaseUrl').value.trim(),
    tidienApiKey: $('#tidienApiKey').value.trim(),
    routerApiKey: $('#routerApiKey').value.trim(),
    driveJson: $('#driveJson').value.trim(),
    driveFolderId: $('#driveFolderId').value.trim(),
    maxGroups: Number($('#maxGroups').value) || 10,
    fbLang: $('#fbLang').value,
    postMode,
    securityLevel,
    avoidNight: $('#avoidNight').checked,
    classicFallbackOnFastFail: $('#classicFallbackOnFastFail')?.checked === true,
    tidienAutoSyncEnabled: $('#tidienAutoSyncEnabled')?.checked !== false,
    tidienAutoPullDrafts: $('#tidienAutoPullDrafts')?.checked !== false,
    tidienAutoSyncMinutes: Math.max(5, Number($('#tidienAutoSyncMinutes')?.value) || 10),
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

function bindEvents() {
  $('#btnPopout')?.addEventListener('click', () => {
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'GF_PANEL_CLOSE' }, '*');
      } else {
        window.close();
      }
    } catch (e) {
      alert(e.message);
    }
  });

  $$('#tabBar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      showTab(tab);
      if (tab === 'comment') loadComments();
    });
  });

  $('#btnOpenPostingSettings')?.addEventListener('click', () => {
    showTab('settings');
    $$('#tabBar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'settings'));
    $('#postingStrategyCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  $('#btnToggleAdvanced')?.addEventListener('click', () => toggleManualAdvanced());
  $('#btnTogglePostSettings')?.addEventListener('click', () => toggleManualPostSettings());
  document.querySelectorAll('input[name="manualSecurityLevel"]').forEach((radio) => {
    radio.addEventListener('change', () => updateManualSecurityUI(radio.value));
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
    ensureComposerInit();
    const text = GF.composer?.getPrimaryText() || '';
    const variations = GF.composer?.getVariationsArray() || [];
    const prompt = $('#manualPrompt').value.trim();
    if (!text) return alert('Nhập nội dung bài');

    const bg = GF.composer?.backgroundColor || '#18191A';
    const colored = isColoredBackground(bg);
    if (colored) clearManualMediaForColoredPost({ silent: true });

    const post = {
      id: `manual-${Date.now()}`,
      source: 'manual',
      noi_dung: text,
      variations: variations.length > 1 ? variations : [],
      prompt_anh: colored ? '' : prompt,
      autoGenerateImage: colored ? false : $('#manualAutoImage').checked,
      anh_ngay_dang: $('#manualImageDate').value,
      anh_gio_dang: $('#manualImageTime').value,
      ngay_dang: $('#manualDate').value,
      gio_dang: $('#manualTime').value,
      campaignName: $('#manualCampaign').value.trim(),
      campaignId: $('#manualCampaign').value.trim()
        ? `camp-${$('#manualCampaign').value.trim().toLowerCase().replace(/\s+/g, '-')}`
        : '',
      backgroundColor: GF.composer?.backgroundColor || '#18191A',
      firstComment: $('#manualFirstComment').value.trim(),
      firstCommentEnabled: $('#manualFirstCommentOn').checked,
      groupIds: [...state.manualGroupIds].slice(0, getMaxGroupsPerPost()),
      imageStatus: 'pending',
      imageBase64: null,
      videoBase64: null,
      mediaType: null,
      mediaMime: null,
      selected: true,
    };

    applyManualMediaToPost(post);
    applyManualAutomationToPost(post);

    state.posts.push(post);
    state.assignPostIds.add(post.id);
    GF.composer?.clearAll();
    $('#manualPrompt').value = '';
    $('#manualCampaign').value = '';
    $('#manualFirstComment').value = '';
    $('#manualFirstCommentOn').checked = false;
    $('#manualImageDate').value = '';
    $('#manualImageTime').value = '';
    clearManualMedia();
    initManualPostSettingsForm(await GF.storage.getSettings());
    state.manualGroupIds = new Set();
    toggleManualGroupPicker(false);
    updateManualGroupSummary();
    await savePosts();
    renderPosts();
  });

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
          selected: true,
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
    const quick = e.ctrlKey;
    if (btn) {
      btn.disabled = true;
      btn.textContent = quick ? 'Đang đọc…' : 'Đang quét…';
    }
    try {
      if (quick) {
        await syncGroupsFromFb({ silent: false, quick: true });
      } else {
        startBackgroundDeepSync();
      }
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

  $('#groupFilterPrivacy')?.addEventListener('change', (e) => {
    state.groupFilterPrivacy = e.target.value;
    renderGroupLibrary();
  });
  $('#groupFilterApproval')?.addEventListener('change', (e) => {
    state.groupFilterApproval = e.target.value;
    renderGroupLibrary();
  });
  $('#groupFilterRole')?.addEventListener('change', (e) => {
    state.groupFilterRole = e.target.value;
    renderGroupLibrary();
  });
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

  $('#btnCreateCustomSet')?.addEventListener('click', async () => {
    const name = $('#customSetName')?.value?.trim();
    const groupIds = [...state.assignGroupIds];
    if (!name) return alert('Nhập tên bộ custom');
    if (!groupIds.length) return alert('Tick nhóm FB ở tab「Tất cả nhóm FB」trước');
    const set = await GF.groupSets.create(name, groupIds);
    state.customGroupSets = await GF.groupSets.getAll();
    $('#customSetName').value = '';
    await saveGroupsData();
    switchGroupsSubTab('custom');
    renderGroupsTab();
    alert(`Đã tạo bộ「${set.name}」(${set.groupIds.length} nhóm)`);
  });

  $$('[data-groups-sub]').forEach((btn) => {
    btn.addEventListener('click', () => switchGroupsSubTab(btn.dataset.groupsSub));
  });

  $('#btnPostNow').addEventListener('click', startPostNow);
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
  $('#btnRefreshComments').addEventListener('click', () => triggerTidienAutoSync({ silent: false, force: true, scope: 'all' }));
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

  $$('[data-sub]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('[data-sub]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const hist = btn.dataset.sub === 'history';
      $('#activityHistory').classList.toggle('hidden', !hist);
      $('#activityUpcoming').classList.toggle('hidden', hist);
    });
  });

  $('#btnTidienLogin').addEventListener('click', async () => {
    try {
      await GF.tidienAuth.login($('#tidienEmail').value, $('#tidienPassword').value);
      const res = await gfSendMessage({ type: 'GF_GET_FB_USER' });
      if (res?.user) await GF.tidienAuth.saveFbProfile(res.user);
      alert('Đăng nhập thành công');
      await gfSendMessage({ type: 'GF_SCHEDULE_TIDIEN_SYNC' }).catch(() => {});
      await triggerTidienAutoSync({ silent: false, force: true, scope: 'all' });
      await loadLocalProviderSelects();
      loadState();
    } catch (e) {
      alert(e.message);
    }
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

  document.querySelectorAll('input[name="postMode"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      updatePostModeUI(radio.value);
      await persistChoiceSettings({ postMode: radio.value });
    });
  });
  document.querySelectorAll('input[name="securityLevel"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      updateSecurityUI(radio.value);
      await persistChoiceSettings({ securityLevel: radio.value });
    });
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
      const { done, total, group, phase, error } = msg.data || {};
      if (total) {
        updatePostingRing((done / total) * 100);
        updatePostingCount(done, total);
      }
      const status = $('#postingStatus');
      if (phase === 'pause' && status) {
        status.textContent = msg.data?.snippet || 'Đang nghỉ (bảo vệ tài khoản)…';
      }
      if ((phase === 'classic-nav' || phase === 'classic-composer' || phase === 'classic-submit' || phase === 'classic-fallback') && status) {
        status.textContent = msg.data?.snippet || phase;
      }
      if (phase === 'posting' && group && status) {
        status.textContent = `Đang đăng: ${group}`;
      }
      if (phase === 'error' && group && status) {
        status.textContent = `Lỗi: ${group}`;
      }
      const log = $('#progressLog');
      if (group && log) {
        const errLine = error ? ` — <span style="color:var(--error)">${esc(error)}</span>` : '';
        log.innerHTML += `<div>${esc(phase || '')}: ${esc(group)}${errLine}</div>`;
        log.scrollTop = log.scrollHeight;
      }
      if (phase === 'done') {
        const summary = msg.data?.summary;
        const ok = summary?.okCount ?? msg.data?.okCount ?? done ?? 0;
        const fail = summary?.failCount ?? msg.data?.failCount ?? 0;
        const tot = summary?.total ?? total ?? 0;
        if (status) {
          status.textContent = tot && ok >= tot
            ? `Đăng thành công ${ok}/${tot} nhóm!`
            : (ok ? `Xong ${ok}/${tot || ok} nhóm (có lỗi)` : 'Hoàn thành — xem Lịch sử');
        }
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
        }, 800);
      }
    }
    if (msg.type === 'GF_POST_MATRIX_DONE') {
      showPostResultToast(msg.data);
      chrome.storage.local.get('postQueue').then((d) => {
        state.posts = mapPostsFromQueue(d.postQueue || []);
        renderPosts();
      });
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
      applyTidienCommentsFromStorage();
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
            $('#groupsSyncStatus').textContent = `${n}/${exp} nhóm — vẫn đang thiếu, bấm ↻ để quét lại`;
          }
        }
        renderGroupsTab();
        if (state.manualGroupPickerOpen) renderManualGroupPicker();
      } else if (msg.error && $('#groupsSyncStatus')) {
        const n = state.groups.length;
        $('#groupsSyncStatus').textContent = n
          ? `${n} nhóm — quét nền lỗi: ${msg.error}`
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
    if (changes.postQueue) {
      state.posts = mapPostsFromQueue(changes.postQueue.newValue || []);
      renderPosts();
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!gfRuntimeAlive()) showContextInvalidBanner();
  bindEvents();
  await loadSettingsForm();
  initManualPostSettingsForm(await GF.storage.getSettings());
  await loadState();
  await refreshProfiles(true);
  if (!state.profiles?.personal?.id) await fallbackFbUser();
  updateManualGroupSummary();
  ensureComposerInit();
});
