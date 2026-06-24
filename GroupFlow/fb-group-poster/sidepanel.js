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
  radarGroupIds: new Set(),
  comments: [],
  commentDrafts: {},
  profiles: null,
  activeActorId: null,
  manualMedia: null,
  inlineGroupPickerPostId: null,
  manualGroupIds: new Set(),
  aiProviders: [],
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function showTab(name) {
  $$('.tab-panel').forEach((p) => p.classList.remove('active'));
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $(`#tab-${name}`)?.classList.add('active');
  if (name === 'groups') {
    renderGroupsTab();
    syncGroupsFromFb(false);
  }
}

function gotoGroupsTab(postId) {
  if (postId) {
    state.assignPostIds = new Set([postId]);
  }
  showTab('groups');
  $$('#tabBar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'groups'));
}

async function loadState() {
  const d = await chrome.storage.local.get([
    'postQueue', 'extractedGroups', 'selectedGroupIds', 'fbUser',
    'activityHistory', 'activityUpcoming', 'radarLeads',
    'fbProfiles', 'activeActorId', 'radarGroupIds', 'customGroupSets', 'groupsSyncedAt',
  ]);
  const legacyGroupIds = d.selectedGroupIds || [];
    state.posts = (d.postQueue || []).map((p) => {
    const post = { ...p };
    if (!Array.isArray(post.groupIds)) {
      post.groupIds = legacyGroupIds.length ? [...legacyGroupIds] : [];
    }
    if (post.autoGenerateImage === undefined) post.autoGenerateImage = true;
    return post;
  });
  state.groups = d.extractedGroups || [];
  state.customGroupSets = await GF.groupSets.getAll();
  state.radarGroupIds = new Set(d.radarGroupIds || []);
  state.profiles = d.fbProfiles || null;
  state.activeActorId = d.activeActorId || d.fbUser?.id || null;
  updateGroupsTabBadge();
  renderPosts();
  renderGroupsTab();
  updateProfileHeader(d.fbUser, d.fbProfiles);
  renderActivity(d.activityUpcoming || [], d.activityHistory || []);
  renderLeads(d.radarLeads || []);
  syncGroupsFromFb(true);
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
    const res = await chrome.runtime.sendMessage({ type: 'GF_GET_FB_PROFILES' });
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
    const res = await chrome.runtime.sendMessage({ type: 'GF_GET_FB_USER' });
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
  const menu = $('#profileMenu');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GF_SWITCH_ACTOR', actorId });
    if (res?.error) throw new Error(res.error);
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
  } catch (e) {
    alert(e.message);
  }
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

function renderManualMediaPreview() {
  const box = $('#manualMediaPreview');
  const label = $('#manualMediaLabel');
  const m = state.manualMedia;
  if (!box) return;
  if (!m) {
    box.classList.add('hidden');
    box.innerHTML = '';
    if (label) label.textContent = 'Chọn ảnh hoặc video';
    return;
  }
  box.classList.remove('hidden');
  const preview = m.type === 'video'
    ? `<video src="data:${m.mime};base64,${m.base64}" muted></video>`
    : `<img src="data:${m.mime};base64,${m.base64}" alt="" />`;
  box.innerHTML = `
    ${preview}
    <div class="media-preview-info">
      <strong>${esc(m.name)}</strong>
      ${m.type === 'video' ? 'Video · Chế độ Cổ điển' : 'Ảnh'}
    </div>
    <button type="button" class="btn-clear-media" id="btnClearManualMedia">Xóa</button>
  `;
  if (label) label.textContent = m.name;
  $('#btnClearManualMedia')?.addEventListener('click', clearManualMedia);
}

function clearManualMedia() {
  state.manualMedia = null;
  const input = $('#manualMedia');
  if (input) input.value = '';
  renderManualMediaPreview();
}

async function onManualMediaPick(file) {
  if (!file) return;
  const isVideo = file.type.startsWith('video/');
  const isImage = file.type.startsWith('image/');
  if (!isVideo && !isImage) return alert('Chỉ hỗ trợ ảnh (jpg, png, webp) hoặc video (mp4, mov, webm)');
  const limit = isVideo ? MEDIA_LIMITS.video : MEDIA_LIMITS.image;
  if (file.size > limit) {
    return alert(isVideo ? 'Video tối đa 15MB' : 'Ảnh tối đa 8MB');
  }
  const base64 = await readFileAsBase64(file);
  state.manualMedia = {
    type: isVideo ? 'video' : 'image',
    base64,
    mime: file.type || (isVideo ? 'video/mp4' : 'image/png'),
    name: file.name,
  };
  renderManualMediaPreview();
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

async function syncGroupsFromFb(silent = true) {
  if (state.groupsSyncing) return;
  state.groupsSyncing = true;
  const status = $('#groupsSyncStatus');
  if (status && !silent) status.textContent = 'Đang quét nhóm từ Facebook…';
  try {
    const hasCache = state.groups.length > 0;
    let res = await chrome.runtime.sendMessage({
      type: 'GF_SYNC_GROUPS',
      force: !silent,
      passive: true,
    });
    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message);
    }
    if (res?.error?.includes('không hỗ trợ') && res.error.includes('GF_SYNC_GROUPS')) {
      res = await chrome.runtime.sendMessage({ type: 'GF_EXTRACT_GROUPS' });
    }
    if (res?.error && !res?.groups?.length) {
      throw new Error(res.error);
    }
    if (res?.groups?.length) {
      state.groups = res.groups;
      await chrome.storage.local.set({ extractedGroups: res.groups });
    }
    if (status) {
      const n = state.groups.length;
      status.textContent = n
        ? `${n} nhóm — GraphQL nền (không mở Facebook)`
        : 'Cần từng đăng nhập FB trên Chrome — bấm ↻ để tải lại';
    }
    renderGroupsTab();
    renderManualGroupPicker();
  } catch (e) {
    if (status) status.textContent = `Lỗi đồng bộ: ${e.message}`;
  } finally {
    state.groupsSyncing = false;
  }
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

function aiReady(settings) {
  if (!settings) return false;
  if (settings.textProviderId || settings.imageProviderId) {
    return Boolean(settings.tidienApiKey || settings.tidienToken);
  }
  return Boolean(settings.routerApiKey);
}

function aiTextReady(settings) {
  if (settings?.textProviderId) return Boolean(settings.tidienApiKey || settings.tidienToken);
  return Boolean(settings?.routerApiKey);
}

function aiImageReady(settings) {
  if (settings?.imageProviderId) return Boolean(settings.tidienApiKey || settings.tidienToken);
  return Boolean(settings?.routerApiKey);
}

function providerOptionLabel(p) {
  return `${p.name}${p.model ? ` (${p.model})` : ''}`;
}

function fillProviderSelect(selectEl, providers, type, selectedId) {
  if (!selectEl) return;
  const list = providers.filter((p) => p.type === type && p.is_active);
  selectEl.innerHTML = '<option value="">— Chưa chọn —</option>'
    + list.map((p) => `<option value="${p.id}">${esc(providerOptionLabel(p))}</option>`).join('');
  if (selectedId) selectEl.value = String(selectedId);
}

async function loadProviderSelects() {
  const s = await GF.storage.getSettings();
  const textHint = $('#textProviderHint');
  const imageHint = $('#imageProviderHint');
  try {
    state.aiProviders = await GF.aiApi.listProviders();
    fillProviderSelect($('#textProviderId'), state.aiProviders, 'text', s.textProviderId);
    fillProviderSelect($('#imageProviderId'), state.aiProviders, 'image', s.imageProviderId);
    if (textHint) {
      textHint.textContent = state.aiProviders.some((p) => p.type === 'text')
        ? 'Dùng cho AI rewrite, comment chéo'
        : 'Chưa có text provider trên website — tạo tại Providers';
    }
    if (imageHint) {
      imageHint.textContent = state.aiProviders.some((p) => p.type === 'image')
        ? 'Dùng cho xuất ảnh AI khi đăng / Generate'
        : 'Chưa có image provider trên website — tạo tại Providers';
    }
  } catch (e) {
    fillProviderSelect($('#textProviderId'), [], 'text', s.textProviderId);
    fillProviderSelect($('#imageProviderId'), [], 'image', s.imageProviderId);
    if (textHint) textHint.textContent = e.message;
    if (imageHint) imageHint.textContent = e.message;
  }
}

function renderManualGroupPicker() {
  const box = $('#manualGroupPicker');
  if (!box) return;
  if (!state.groups.length) {
    box.innerHTML = '<p class="hint">Chưa có nhóm — mở tab Nhóm để sync FB hoặc thêm sau khi tạo bài.</p>';
    return;
  }
  const max = getMaxGroupsPerPost();
  box.innerHTML = state.groups.slice(0, 80).map((g) => `
    <label class="check-row inline-group-item">
      <input type="checkbox" data-manual-group="${g.id}" ${state.manualGroupIds.has(String(g.id)) ? 'checked' : ''} />
      <span>${esc(g.name || `Group ${g.id}`)}</span>
    </label>
  `).join('');
  box.querySelectorAll('[data-manual-group]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = String(cb.dataset.manualGroup);
      if (cb.checked) {
        if (state.manualGroupIds.size >= max) {
          cb.checked = false;
          return alert(`Tối đa ${max} nhóm / bài`);
        }
        state.manualGroupIds.add(id);
      } else {
        state.manualGroupIds.delete(id);
      }
    });
  });
}

function inlineGroupPickerHtml(post) {
  if (state.inlineGroupPickerPostId !== post.id) return '';
  const max = getMaxGroupsPerPost();
  const selected = new Set((post.groupIds || []).map(String));
  const q = (state.inlineGroupSearch || '').toLowerCase();
  const groups = state.groups.filter((g) => !q || (g.name || '').toLowerCase().includes(q));
  const items = groups.slice(0, 60).map((g) => `
    <label class="check-row inline-group-item">
      <input type="checkbox" data-inline-group="${g.id}" data-inline-post="${post.id}"
        ${selected.has(String(g.id)) ? 'checked' : ''} />
      <span>${esc(g.name || `Group ${g.id}`)}</span>
    </label>
  `).join('');
  return `
    <div class="inline-group-picker">
      <input type="search" class="inline-group-search" placeholder="Tìm nhóm…" data-inline-search="${post.id}" value="${escAttr(state.inlineGroupSearch || '')}" />
      <div class="inline-group-list scroll-sm">${items || '<p class="hint">Không có nhóm — sync tab Nhóm trước</p>'}</div>
      <div class="post-actions">
        <button type="button" class="btn primary sm" data-inline-done="${post.id}">Xong (${selected.size}/${max})</button>
        <button type="button" class="btn ghost sm" data-goto-groups-batch="${post.id}">Tab Nhóm (batch)</button>
      </div>
    </div>
  `;
}

function postHasMedia(post) {
  return Boolean(post?.imageBase64 || post?.videoBase64);
}

async function savePosts() {
  await chrome.storage.local.set({ postQueue: state.posts });
  updateGroupsTabBadge();
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
      const summary = root.closest('.post-card')?.querySelector('.tag.pending, .tag.web');
      if (summary) {
        summary.textContent = postGroupSummary(post);
        summary.className = `tag ${post.groupIds.length ? 'web' : 'pending'}`;
      }
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
    return `
    <div class="list-item post-card ${noGroups ? 'post-needs-groups' : ''}">
      <div class="check-row">
        <input type="checkbox" data-post-id="${p.id}" ${p.selected !== false ? 'checked' : ''} />
        <div class="post-body">${esc(p.noi_dung?.slice(0, 80) || '—')}</div>
      </div>
      <div class="post-meta">
        <span class="tag ${p.groupIds.length ? 'web' : 'pending'}">${esc(postGroupSummary(p))}</span>
        ${p.campaignName ? `<span class="tag web">${esc(p.campaignName)}</span>` : ''}
        ${p.variations?.length > 1 ? `<span class="tag">${p.variations.length} biến thể</span>` : ''}
        ${p.backgroundColor && p.backgroundColor !== '#18191A' ? '<span class="tag">Nền màu</span>' : ''}
        ${p.firstCommentEnabled ? '<span class="tag ready">1st cmt</span>' : ''}
        ${p.is_shared ? '<span class="tag">Shared</span>' : ''}
        ${imageTag(p.imageStatus, p.mediaType)}
        ${!hasMedia && p.autoGenerateImage !== false && p.prompt_anh ? '<span class="tag ready">Tự xuất ảnh</span>' : ''}
        ${p.anh_ngay_dang ? `<span class="tag">Ảnh: ${esc(p.anh_ngay_dang)} ${esc(p.anh_gio_dang || '')}</span>` : ''}
        ${p.ngay_dang ? `<span class="tag">Đăng: ${esc(p.ngay_dang)} ${esc(p.gio_dang || '')}</span>` : ''}
      </div>
      ${!isEditing && p.mediaType === 'video' && p.videoBase64
    ? `<video class="thumb" src="data:${escAttr(p.mediaMime || 'video/mp4')};base64,${p.videoBase64}" muted></video>`
    : ''}
      ${!isEditing && p.imageBase64 && p.mediaType !== 'video'
    ? `<img class="thumb" src="data:${escAttr(p.mediaMime || 'image/png')};base64,${p.imageBase64}" alt="" />`
    : ''}
      ${isEditing ? `
      <div class="post-edit">
        <label class="field-label">Nội dung</label>
        <textarea rows="3" data-edit-field="noi_dung">${esc(p.noi_dung || '')}</textarea>
        ${hasMedia ? `
        <div class="post-edit-media">
          <span class="field-label">Media đính kèm</span>
          ${p.mediaType === 'video' && p.videoBase64
    ? `<video class="thumb" src="data:${escAttr(p.mediaMime || 'video/mp4')};base64,${p.videoBase64}" muted controls></video>`
    : ''}
          ${p.imageBase64 && p.mediaType !== 'video'
    ? `<img class="thumb" src="data:${escAttr(p.mediaMime || 'image/png')};base64,${p.imageBase64}" alt="" />`
    : ''}
          <button type="button" class="btn ghost sm" data-clear-media="${p.id}">Xóa media</button>
        </div>
        ` : `
        <label class="field-label">Prompt ảnh AI</label>
        <input type="text" data-edit-field="prompt_anh" value="${escAttr(p.prompt_anh || '')}" placeholder="Chỉ khi chưa có ảnh/video" />
        <label class="switch-row">
          <input type="checkbox" data-edit-bool="autoGenerateImage" ${p.autoGenerateImage !== false ? 'checked' : ''} />
          <span>Tự xuất ảnh khi đăng (nếu chưa có)</span>
        </label>
        <label class="field-label">Lịch xuất ảnh <span class="field-hint">(tuỳ chọn, trước giờ đăng)</span></label>
        <div class="row">
          <input type="date" data-edit-field="anh_ngay_dang" value="${escAttr(p.anh_ngay_dang || '')}" />
          <input type="time" data-edit-field="anh_gio_dang" value="${escAttr(p.anh_gio_dang || '')}" />
        </div>
        `}
        <label class="field-label">Lịch đăng bài</label>
        <div class="row">
          <input type="date" data-edit-field="ngay_dang" value="${escAttr(p.ngay_dang || '')}" />
          <input type="time" data-edit-field="gio_dang" value="${escAttr(p.gio_dang || '')}" />
        </div>
        <div class="post-actions">
          <button type="button" class="btn primary sm" data-save-edit="${p.id}">Lưu</button>
          <button type="button" class="btn ghost sm" data-cancel-edit="${p.id}">Đóng</button>
        </div>
      </div>
      ` : ''}
      ${inlineGroupPickerHtml(p)}
      <div class="post-actions">
        <button type="button" class="btn ghost sm accent" data-toggle-groups="${p.id}">${state.inlineGroupPickerPostId === p.id ? 'Đóng nhóm' : 'Chọn nhóm'}</button>
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
  box.querySelectorAll('[data-inline-search]').forEach((input) => {
    input.addEventListener('input', () => {
      state.inlineGroupSearch = input.value;
      const postId = input.dataset.inlineSearch;
      const post = state.posts.find((x) => x.id === postId);
      if (!post) return;
      const list = input.closest('.inline-group-picker')?.querySelector('.inline-group-list');
      if (!list) return;
      const selected = new Set((post.groupIds || []).map(String));
      const q = state.inlineGroupSearch.toLowerCase();
      const groups = state.groups.filter((g) => !q || (g.name || '').toLowerCase().includes(q));
      list.innerHTML = groups.slice(0, 60).map((g) => `
        <label class="check-row inline-group-item">
          <input type="checkbox" data-inline-group="${g.id}" data-inline-post="${postId}"
            ${selected.has(String(g.id)) ? 'checked' : ''} />
          <span>${esc(g.name || `Group ${g.id}`)}</span>
        </label>
      `).join('') || '<p class="hint">Không tìm thấy nhóm</p>';
      bindInlineGroupChecks(list);
    });
  });
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
  box.querySelectorAll('[data-edit-post]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.editPost;
      state.editingPostId = state.editingPostId === id ? null : id;
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
      await savePosts();
      renderPosts();
    });
  });
  box.querySelectorAll('[data-cancel-edit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.editingPostId = null;
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
  const q = ($('#groupSearch')?.value || '').toLowerCase();
  const filtered = state.groups.filter((g) => !q || g.name.toLowerCase().includes(q));
  const pickerIds = state.assignGroupIds;

  box.innerHTML = filtered.length
    ? filtered.map((g) => `
    <label class="group-row ${pickerIds.has(String(g.id)) ? 'selected' : ''}">
      <input type="checkbox" data-picker-group="${g.id}" ${pickerIds.has(String(g.id)) ? 'checked' : ''} />
      <span class="group-avatar">${esc(groupInitial(g.name))}</span>
      <span class="group-info">
        <span class="group-name">${esc(g.name)}</span>
      </span>
    </label>
  `).join('')
    : emptyState('◎', q ? 'Không khớp tên' : 'Đang chờ đồng bộ nhóm từ Facebook…');

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
  await chrome.runtime.sendMessage({
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
  if (!aiImageReady(s)) {
    return alert('Chọn Image provider hoặc 9Router API key trong Cài đặt');
  }
  try {
    post.imageStatus = 'generating';
    renderPosts();
    const img = await GF.imageGen.generate(post.prompt_anh, s.routerApiKey, s.tidienBaseUrl);
    post.imageBase64 = img.base64;
    post.mediaType = 'image';
    post.mediaMime = img.mime || 'image/png';
    post.imageStatus = 'ready';
    await GF.imageGen.saveLocal(img.base64, `groupflow-${postId}.png`);
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
    if (settings.avoidNight) {
      const h = new Date().getHours();
      if (h >= 22 || h < 7) {
        if (!window.confirm('Đang trong khung 22:00–07:00 (tránh ban đêm). Vẫn đăng?')) return;
      }
    }
    const payload = {
      ...buildPostJob(true),
      postMode: settings.postMode,
      actorId: state.activeActorId || settings.activeActorId,
    };
    $('#progressBox').classList.remove('hidden');
    await chrome.runtime.sendMessage({ type: 'GF_START_POST', payload });
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
    await chrome.runtime.sendMessage({
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
    await chrome.runtime.sendMessage({
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
    await chrome.runtime.sendMessage({ type: 'GF_CANCEL_ALARM', name: alarmName });
  }
  const d = await chrome.storage.local.get('activityUpcoming');
  let upcoming = (d.activityUpcoming || []).filter((u) => u.id !== item.id);
  if (item.kind === 'post' && item.postId) {
    upcoming = upcoming.filter((u) => !(u.kind === 'generate_image' && u.postId === item.postId));
    for (const img of (d.activityUpcoming || []).filter((u) => u.kind === 'generate_image' && u.postId === item.postId)) {
      if (img.alarmName) await chrome.runtime.sendMessage({ type: 'GF_CANCEL_ALARM', name: img.alarmName });
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
  await chrome.runtime.sendMessage({
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

async function loadComments() {
  try {
    const res = await GF.tidienSync.fetchPendingComments({ limit: 50 });
    state.comments = res.data || res;
    renderComments();
    $('#commentBadge').textContent = state.comments.length ? String(state.comments.length) : '';
    const startEl = $('#commentScheduleStart');
    if (startEl && !startEl.value) {
      const t = new Date(Date.now() + 30 * 60 * 1000);
      const pad = (n) => String(n).padStart(2, '0');
      startEl.value = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
    }
  } catch (e) {
    $('#commentList').innerHTML = `<p class="hint">${esc(e.message)}</p>`;
  }
}

function renderComments() {
  const box = $('#commentList');
  if (!state.comments.length) {
    box.innerHTML = emptyState('💬', 'Không có bài — đăng nhập tidien và sync trước');
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
  await chrome.runtime.sendMessage({
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
    await chrome.runtime.sendMessage({
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
    await chrome.runtime.sendMessage({
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
    ? history.map((h) => `
    <div class="list-item">
      <span class="tag ${h.ok ? 'ready' : 'error'}">${h.ok ? 'OK' : 'Lỗi'}</span>
      ${esc(h.group_name || h.group_id)} — ${esc(h.snippet || '')}
      ${h.post_id ? `<a href="https://facebook.com/groups/${h.group_id}/posts/${h.post_id}" target="_blank" rel="noopener">Mở bài</a>` : ''}
    </div>
  `).join('')
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

function updatePostModeUI(mode) {
  const radio = document.querySelector(`input[name="postMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
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
  updatePostModeUI(s.postMode);
  updateSecurityUI(s.securityLevel);
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
  await loadProviderSelects();
}

async function saveSettingsForm() {
  const postMode = getSelectedPostMode();
  const securityLevel = getSelectedSecurityLevel();
  const textProviderId = $('#textProviderId')?.value ? Number($('#textProviderId').value) : null;
  const imageProviderId = $('#imageProviderId')?.value ? Number($('#imageProviderId').value) : null;
  await GF.storage.saveSettings({
    tidienBaseUrl: $('#tidienBaseUrl').value.trim(),
    tidienApiKey: $('#tidienApiKey').value.trim(),
    textProviderId,
    imageProviderId,
    routerApiKey: $('#routerApiKey').value.trim(),
    driveJson: $('#driveJson').value.trim(),
    driveFolderId: $('#driveFolderId').value.trim(),
    maxGroups: Number($('#maxGroups').value) || 10,
    fbLang: $('#fbLang').value,
    postMode,
    securityLevel,
    avoidNight: $('#avoidNight').checked,
    groupImageScheduleEnabled: $('#groupImageScheduleEnabled').checked,
    groupImageScheduleStart: Number($('#groupImageScheduleStart').value) || 1,
    groupImageScheduleEnd: Number($('#groupImageScheduleEnd').value) || 5,
    groupImageScheduleInterval: Number($('#groupImageScheduleInterval').value) || 10,
  });
  alert('Đã lưu');
}

function bindEvents() {
  $$('#tabBar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      showTab(tab);
      if (tab === 'comment') loadComments();
    });
  });

  $('#srcExcel').addEventListener('click', () => {
    $('#srcExcel').classList.add('active');
    $('#srcManual').classList.remove('active');
    $('#excelPanel').classList.remove('hidden');
    $('#manualPanel').classList.add('hidden');
  });
  $('#srcManual').addEventListener('click', () => {
    $('#srcManual').classList.add('active');
    $('#srcExcel').classList.remove('active');
    $('#manualPanel').classList.remove('hidden');
    $('#excelPanel').classList.add('hidden');
    GF.composer?.init();
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
    GF.composer?.init();
    const text = GF.composer?.getPrimaryText() || '';
    const variations = GF.composer?.getVariationsArray() || [];
    const prompt = $('#manualPrompt').value.trim();
    if (!text) return alert('Nhập nội dung bài');

    const post = {
      id: `manual-${Date.now()}`,
      source: 'manual',
      noi_dung: text,
      variations: variations.length > 1 ? variations : [],
      prompt_anh: prompt,
      autoGenerateImage: $('#manualAutoImage').checked,
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

    if (state.manualMedia) {
      if (state.manualMedia.type === 'video') {
        post.mediaType = 'video';
        post.videoBase64 = state.manualMedia.base64;
        post.mediaMime = state.manualMedia.mime;
        post.imageStatus = 'ready';
      } else {
        post.mediaType = 'image';
        post.imageBase64 = state.manualMedia.base64;
        post.mediaMime = state.manualMedia.mime;
        post.imageStatus = 'ready';
      }
    }

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
    state.manualGroupIds = new Set();
    renderManualGroupPicker();
    await savePosts();
    renderPosts();
  });

  $('#manualMedia')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    try {
      await onManualMediaPick(file);
    } catch (err) {
      alert(err.message);
    }
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
    const deep = e.shiftKey;
    if (btn) {
      btn.disabled = true;
      btn.textContent = deep ? 'Đang scroll…' : 'Đang đọc…';
    }
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'GF_EXTRACT_GROUPS',
        deep,
        navigate: false,
      });
      if (res?.groups?.length) {
        state.groups = res.groups;
        await saveGroupsData();
        $('#groupsSyncStatus').textContent = deep
          ? `${res.groups.length} nhóm — session + scroll tab joins (Shift+↻)`
          : `${res.groups.length} nhóm — từ session Chrome`;
        renderGroupsTab();
      } else {
        alert(res?.error || 'Mở facebook.com/groups/joins trong tab FB rồi thử lại');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '↻ Làm mới';
      }
    }
  });

  $('#groupSearch')?.addEventListener('input', () => renderGroupLibrary());

  $('#selectAllPickerGroups')?.addEventListener('change', (e) => {
    const q = ($('#groupSearch')?.value || '').toLowerCase();
    const filtered = state.groups.filter((g) => !q || g.name.toLowerCase().includes(q));
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
    GF.composer?.init();
    const text = GF.composer?.getPrimaryText() || '';
    if (!text) return alert('Nhập nội dung trước');
    const s = await GF.storage.getSettings();
    if (!aiTextReady(s)) return alert('Chọn Text provider hoặc 9Router API key — mở Cài đặt');
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
  $('#btnRefreshComments').addEventListener('click', loadComments);
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
  $('#btnRadarScan').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'GF_RADAR_SCAN' }));

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
      const res = await chrome.runtime.sendMessage({ type: 'GF_GET_FB_USER' });
      if (res?.user) await GF.tidienAuth.saveFbProfile(res.user);
      alert('Đăng nhập thành công');
      await loadProviderSelects();
      loadState();
    } catch (e) {
      alert(e.message);
    }
  });
  $('#btnSaveSettings').addEventListener('click', saveSettingsForm);
  $('#btnReloadProviders')?.addEventListener('click', () => loadProviderSelects());

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
      const { done, total, group, phase } = msg.data || {};
      if (total) $('#progressFill').style.width = `${Math.round((done / total) * 100)}%`;
      if (group) {
        const log = $('#progressLog');
        log.innerHTML += `<div>${phase}: ${esc(group)}</div>`;
      }
      if (phase === 'done') loadState();
    }
    if (msg.type === 'GF_RADAR_UPDATED') {
      chrome.storage.local.get('radarLeads', (d) => renderLeads(d.radarLeads || []));
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await loadSettingsForm();
  await loadState();
  await refreshProfiles(true);
  if (!state.profiles?.personal?.id) await fallbackFbUser();
  renderManualGroupPicker();
  GF.composer?.init();
});
