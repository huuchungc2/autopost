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
  radarLeads: [],
  postScheduleMap: {},
  leadFilterStatus: 'all',
  comments: [],
  commentDrafts: {},
  commentSubTab: 'mine',
  commentFilterPerson: 'all',
  commentPersonOptions: [],
  commentFilterTemplate: 'all',
  commentFilterSchedule: 'all',
  commentFilterStatus: 'all',
  commentEditorOpenId: null,
  commentScheduleOpenId: null,
  commentScheduleMap: {},
  commentedRecords: {},
  postAccessCache: {},
  serverMyPostsIndex: new Map(),
  postsPage: 0,
  commentsPage: 0,
  historyPage: 0,
  _lastActivityUpcoming: [],
  _lastActivityHistory: [],
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
  postFilterCategory: 'all',
  postFilterStatus: 'all',
  commentFilterCategory: 'all',
  categories: [],
  composeCategoryIds: new Set(),
  inlineCategoryPickerPostId: null,
  postedGroupsOpenIds: new Set(),
  commentFilterApproval: 'all',
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// v1.0.185 — throttle tối thiểu giữa 2 lần gọi THẬT tới /api/user-sync/my-posts|cross-posts. Trước
// bản này 2 endpoint được gọi lại từ ~5 điểm khác nhau (mở panel, mở tab Comment, sau khi đăng bài,
// sau khi comment, bấm Làm mới) không hề có throttle — user bấm qua lại vài giây 1 lần vẫn kích
// hoạt full request mỗi lần. Không áp dụng khi `force: true` (bấm nút Làm mới tay).
const USER_SYNC_MIN_INTERVAL_MS = 30_000;

// Merge theo `id` (upsert) — KHÔNG ghi đè toàn bộ cache như trước. Bài đã có trong cache giữ
// nguyên trừ khi server trả bản mới hơn (đơn giản hoá: coi incoming luôn mới hơn vì chỉ có trong
// `rows` khi `updated_at` > cursor đã gửi).
function mergeUserPostsById(existing, incoming) {
  const byId = new Map((existing || []).map((p) => [String(p.id), p]));
  for (const row of incoming || []) byId.set(String(row.id), row);
  return [...byId.values()];
}

// ── Ngành nghề (category) — LỌC/NHÓM bài theo ngành ở tab Tạo bài VÀ tab Comment (để lên lịch seeding
// dễ hơn). Danh mục dùng CHUNG toàn hệ thống: admin quản lý trên website (routes/groupCategories.js),
// extension KÉO VỀ (GET /api/user-sync/categories) — read-only, chỉ hiển thị + cache. Mỗi bài postQueue
// mang MẢNG `categories` = [id ngành] (1 bài thuộc nhiều ngành); bài đã đăng đồng bộ tập ngành lên server
// (user_post_categories) → lọc chạy cả trên nhiều máy lẫn tab Đồng đội.
const GF_CATEGORIES_CACHE_KEY = 'gf_categories_cache';

// Chuẩn hoá tập ngành của 1 item về mảng id dạng chuỗi. postQueue giữ `categories` (mảng); item
// server/cross giữ `category_ids` (chuỗi CSV "3,7" từ GROUP_CONCAT) → parse ra mảng.
function itemCategoryIds(item) {
  if (Array.isArray(item?.categories)) return item.categories.map(String).filter(Boolean);
  if (item?.category_ids != null && item.category_ids !== '') {
    return String(item.category_ids).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

async function loadCategories() {
  const cached = await chrome.storage.local.get(GF_CATEGORIES_CACHE_KEY);
  if (Array.isArray(cached[GF_CATEGORIES_CACHE_KEY])) {
    state.categories = cached[GF_CATEGORIES_CACHE_KEY];
  }
  // Kéo mới từ server (danh mục chung do admin quản lý ở website). Lỗi mạng/chưa kích hoạt → giữ cache.
  try {
    const { licenseKey } = await chrome.storage.local.get('licenseKey');
    if (!licenseKey) return state.categories;
    const base = await getUserSyncBase();
    const res = await fetch(`${base}/api/user-sync/categories`, {
      headers: { Authorization: `Bearer ${licenseKey}` },
    });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows)) {
        state.categories = rows.map((r) => ({ id: String(r.id), name: r.name }));
        await chrome.storage.local.set({ [GF_CATEGORIES_CACHE_KEY]: state.categories });
      }
    }
  } catch { /* giữ cache */ }
  return state.categories;
}

function categoryNameById(id) {
  if (id == null || id === '') return '';
  return state.categories.find((c) => String(c.id) === String(id))?.name || '';
}

// Khớp danh sách TÊN ngành (từ cột Excel / draft) sang id ngành trong danh mục (không phân biệt hoa
// thường). Tên lạ (không có trong danh mục) bị bỏ qua → coi như chưa gán ngành đó.
function resolveCategoryNamesToIds(names) {
  const byName = new Map(state.categories.map((c) => [String(c.name).toLowerCase(), String(c.id)]));
  return [...new Set((names || []).map((n) => byName.get(String(n).trim().toLowerCase())).filter(Boolean))];
}

// Tag ngành (nhiều) cho card — mỗi ngành 1 chip nhỏ; bỏ id "mồ côi" (ngành đã bị admin xoá).
function categoryTagsHtml(item) {
  return itemCategoryIds(item)
    .map((id) => categoryNameById(id))
    .filter(Boolean)
    .map((name) => `<span class="tag gf-cat-tag">🏷 ${esc(name)}</span>`)
    .join('');
}

// Panel gán ngành inline trên card bài (Tạo bài) — dùng được cả TRƯỚC lẫn SAU khi đăng. Chips multi-
// toggle, click là gán/gỡ ngay. Bài đã đăng đổi ngành → tự đồng bộ tập ngành lên server (xem
// syncPostCategoryToServer). Chỉ mở cho đúng 1 card 1 lúc (state.inlineCategoryPickerPostId).
function inlineCategoryPickerHtml(p) {
  if (state.inlineCategoryPickerPostId !== p.id) return '';
  if (!state.categories.length) {
    return '<div class="inline-cat-picker"><p class="hint">Chưa có ngành — admin thêm ở website (menu Group → Ngành nghề).</p></div>';
  }
  const sel = new Set(itemCategoryIds(p));
  const chips = state.categories.map((c) => {
    const on = sel.has(String(c.id));
    return `<button type="button" class="gf-cat-chip ${on ? 'active' : ''}" data-card-cat="${esc(String(c.id))}" data-card-cat-post="${p.id}">${esc(c.name)}</button>`;
  }).join('');
  return `<div class="inline-cat-picker"><p class="hint">Chọn 1 hoặc nhiều ngành cho bài này:</p><div class="gf-cat-chip-row">${chips}</div></div>`;
}

// Đổ options cho các select LỌC: tab Tạo bài (#postFilterCategory) + tab Comment (#commentFilterCategory).
function renderCategoryOptions() {
  const opts = state.categories
    .map((c) => `<option value="${esc(String(c.id))}">${esc(c.name)}</option>`)
    .join('');
  for (const [sel, stateKey] of [['#postFilterCategory', 'postFilterCategory'], ['#commentFilterCategory', 'commentFilterCategory']]) {
    const el = $(sel);
    if (!el) continue;
    const cur = state[stateKey];
    el.innerHTML = `<option value="all">Ngành: Tất cả</option><option value="none">Chưa gán ngành</option>${opts}`;
    el.value = cur === 'none' || state.categories.some((c) => String(c.id) === String(cur)) ? cur : 'all';
    state[stateKey] = el.value;
  }
  // Ô "Gán ngành" hàng loạt trên thanh chọn — chỉ danh mục thật, không có Tất cả/Chưa gán.
  const bulk = $('#postsBulkCategory');
  if (bulk) {
    const cur = bulk.value;
    bulk.innerHTML = `<option value="">— Gán ngành —</option>${opts}`;
    if (cur && state.categories.some((c) => String(c.id) === String(cur))) bulk.value = cur;
  }
  renderComposeCategoryChips();
}

// Gán 1 ngành cho TẤT CẢ bài đang chọn (thêm vào tập ngành, không ghi đè ngành khác). Bài đã đăng thì
// đồng bộ tập ngành mới lên server.
async function applyBulkCategory() {
  const sel = $('#postsBulkCategory');
  const catId = String(sel?.value || '');
  if (!catId) { showToast('Chọn ngành cần gán', 'warn'); return; }
  const checked = getCheckedPosts();
  if (!checked.length) { showToast('Chưa chọn bài nào', 'warn'); return; }
  let applied = 0;
  for (const p of checked) {
    const set = new Set(itemCategoryIds(p));
    if (!set.has(catId)) { set.add(catId); p.categories = [...set]; applied++; }
  }
  await savePosts();
  renderPosts();
  checked.forEach((p) => { if (p.postStatus === 'posted') syncPostCategoryToServer(p).catch(() => {}); });
  const name = categoryNameById(catId);
  showToast(applied ? `Đã gán ngành "${name}" cho ${applied} bài` : `Các bài đã có ngành "${name}"`, 'success');
}

// Chips multi-toggle chọn ngành khi SOẠN bài (tập chọn giữ trong state.composeCategoryIds).
function renderComposeCategoryChips() {
  const box = $('#manualCategoryChips');
  if (!box) return;
  if (!state.categories.length) {
    box.innerHTML = '<span class="hint">Chưa có ngành — admin thêm ở website.</span>';
    return;
  }
  box.innerHTML = state.categories.map((c) => {
    const on = state.composeCategoryIds.has(String(c.id));
    return `<button type="button" class="gf-cat-chip ${on ? 'active' : ''}" data-compose-cat="${esc(String(c.id))}">${esc(c.name)}</button>`;
  }).join('');
}

// Danh sách ngành trong tab Cài đặt → Ngành nghề (extension chỉ ĐỌC — quản lý ở website).
function renderCategoryManager() {
  const box = $('#categoryList');
  if (!box) return;
  if (!state.categories.length) {
    box.innerHTML = '<p class="hint">Chưa có ngành nghề nào. Admin thêm tại website: menu Group → Ngành nghề.</p>';
    return;
  }
  box.innerHTML = state.categories.map((c) => {
    const count = state.posts.filter((p) => itemCategoryIds(p).includes(String(c.id))).length;
    return `<div class="gf-cat-item"><span class="gf-cat-name-ro">${esc(c.name)}</span><span class="tag" title="Số bài trên máy này đang gán ngành">${count} bài</span></div>`;
  }).join('');
}

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
    if (!Array.isArray(post.categories)) post.categories = [];
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
    // 2026-07-15 — xoá bài mà không dọn lịch thì alarm/entry cũ vẫn bắn đúng giờ và đăng bài "ma"
    // từ payload đông lạnh (refreshScheduledPostPayload() fallback về stub khi bài không còn trong
    // queue), lịch daily cũng vậy (payload tự chứa nguyên bài). clearQueueFields: false — bài sắp
    // bị xoá khỏi state.posts ngay bên dưới, không còn field nào để dọn.
    await cancelPostScheduleAlarms(id, { clearQueueFields: false });
    await removeDailySchedulesForPost(id);
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
    'gf-tab-activity', 'gf-tab-help', 'gf-tab-settings',
  );
  document.body.classList.add(`gf-tab-${name}`);
  if (name === 'groups') {
    renderGroupsTab();
  }
  if (name === 'create') {
    updatePostingConfigSummary();
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
  if (name === 'comment') {
    // Tải lại danh sách mỗi lần chuyển vào tab Comment (không force — vẫn tôn trọng throttle 30s của
    // fetchCrossPostsFromServer/pullMyPostsFromServer) để bài mới phát sinh trong lúc panel đang mở
    // (đăng bài mới, đồng đội đăng bài...) hiện đúng. Không còn tự lên lịch gì ở đây (v1.0.202 — bỏ
    // hẳn auto-schedule, lên lịch giờ hoàn toàn do user chủ động).
    loadPostedPostsForComment();
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

// Map "group_id_post_id" -> needs_comment (0 = đã có người comment chéo, 1 = chưa) — lấy từ
// serverMyPosts (đã pull sẵn qua pullMyPostsFromServer(), không cần gọi API riêng) để hiện tag
// "Đã/Chưa comment" trên card bài Tạo bài mà không tốn thêm request.
function buildServerMyPostsIndex(list) {
  const map = new Map();
  (list || []).forEach((sp) => {
    if (sp.group_id && sp.post_id) map.set(`${sp.group_id}_${sp.post_id}`, sp.needs_comment);
  });
  return map;
}

async function loadState() {
  const d = await chrome.storage.local.get([
    'postQueue', 'extractedGroups', 'selectedGroupIds', 'fbUser',
    'activityHistory', 'activityUpcoming', 'radarLeads',
    'fbProfiles', 'activeActorId', 'radarGroupIds', 'customGroupSets', 'groupsSyncedAt',
    'serverMyPosts',
  ]);
  const legacyGroupIds = d.selectedGroupIds || [];
  state.posts = mapPostsFromQueue(d.postQueue, legacyGroupIds);
  state.serverMyPostsIndex = buildServerMyPostsIndex(d.serverMyPosts);
  migrateLegacyMediaOnce().catch(() => {});
  hydrateCachedMediaInPosts().then(() => scheduleRenderPosts()).catch(() => {});
  state.groups = d.extractedGroups || [];
  state.customGroupSets = await GF.groupSets.getAll();
  state.radarGroupIds = new Set(d.radarGroupIds || []);
  state.profiles = d.fbProfiles || null;
  state.activeActorId = d.activeActorId || d.fbUser?.id || null;
  state.postScheduleMap = await loadPostScheduleMap();
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

// Danh sách Tạo bài/Comment/Log trước đây render TOÀN BỘ mảng vào DOM 1 lần — ổn với vài chục
// bài nhưng chậm hẳn (và có nguy cơ chạm giới hạn chrome.storage.local nếu kèm ảnh) khi lên tới
// hàng trăm/nghìn. Cắt trang phía client (dữ liệu vẫn load hết vào bộ nhớ như cũ, chỉ giới hạn
// số phần tử thực sự đưa vào DOM mỗi lần) — đơn giản, không cần đổi cách load/lưu dữ liệu.
const LIST_PAGE_SIZE = 50;

function paginateList(items, page) {
  const totalPages = Math.max(1, Math.ceil(items.length / LIST_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * LIST_PAGE_SIZE;
  return {
    pageItems: items.slice(start, start + LIST_PAGE_SIZE),
    page: safePage,
    totalPages,
    total: items.length,
  };
}

function pagerHtml(key, page, totalPages) {
  if (totalPages <= 1) return '';
  return `
    <div class="list-pager" data-pager="${key}">
      <button type="button" class="btn ghost sm" data-pager-prev="${key}" ${page <= 0 ? 'disabled' : ''}>‹ Trước</button>
      <span class="hint">Trang ${page + 1}/${totalPages}</span>
      <button type="button" class="btn ghost sm" data-pager-next="${key}" ${page >= totalPages - 1 ? 'disabled' : ''}>Sau ›</button>
    </div>`;
}

function bindPagerEvents(container, onPageChange) {
  container.querySelectorAll('[data-pager-prev]').forEach((btn) => {
    btn.addEventListener('click', () => onPageChange(btn.dataset.pagerPrev, -1));
  });
  container.querySelectorAll('[data-pager-next]').forEach((btn) => {
    btn.addEventListener('click', () => onPageChange(btn.dataset.pagerNext, 1));
  });
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

const MEDIA_LIMITS = { image: 8 * 1024 * 1024, video: 30 * 1024 * 1024 };
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
    if (label) label.textContent = 'Ảnh ≤8MB · tối đa 10 ảnh · Video ≤30MB (1 file) · hoặc prompt AI bên dưới';
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
      if (file.size > limit) return alert('Video tối đa 30MB');
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
    const prevSchedule = `${post.ngay_dang || ''}|${post.gio_dang || ''}`;
    applyComposerToQueuePost(post);
    if (selectOnly) {
      state.posts.forEach((p) => { p.selected = p.id === post.id; });
    }
    await savePosts();
    // 2026-07-15 — đổi/xoá giờ hẹn ngay trong modal sửa bài trước đây CHỈ ghi 2 field lên bài:
    // alarm + entry activityUpcoming cũ vẫn giữ nguyên GIỜ CŨ với payload đông lạnh — tới giờ cũ
    // alarm vẫn bắn, và re-check hủy isUpcomingStillActive() (v1.0.261) vẫn thấy entry còn đó
    // (chưa ai dọn) nên bài vẫn đăng theo lịch user tưởng đã bỏ. Dọn lịch "1 lần" cũ mỗi khi giờ
    // hẹn thay đổi (clearQueueFields: false — 2 field VỪA mang giá trị mới, không được xoá); nếu
    // đặt giờ mới thì gọi reconcile ngay để lịch mới đăng ký liền, không đợi tick 1 phút.
    if (`${post.ngay_dang || ''}|${post.gio_dang || ''}` !== prevSchedule) {
      await cancelPostScheduleAlarms(post.id, { clearQueueFields: false });
      if (post.ngay_dang && post.gio_dang) {
        await gfSendMessage({ type: 'GF_RECONCILE_SCHEDULES' }).catch(() => {});
      }
    }
    // Sửa ngành cho bài ĐÃ đăng qua modal compose → đồng bộ tập ngành lên server (bài chưa đăng thì
    // syncLocalPostsToServer sẽ gửi kèm ở lần sync đầu sau khi đăng).
    if (post.postStatus === 'posted') syncPostCategoryToServer(post).catch(() => {});
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
    categories: [...state.composeCategoryIds],
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
  state.composeCategoryIds = new Set();
  renderComposeCategoryChips();
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
  state.composeCategoryIds = new Set(itemCategoryIds(post));
  renderComposeCategoryChips();
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
  post.categories = [...state.composeCategoryIds];
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
  const post = state.posts.find((p) => p.id === postId);
  const postGroupIds = new Set((post?.groupIds || []).map(String));
  return `
    <p class="hint inline-set-label">Bộ custom — gán nhanh:</p>
    <div class="inline-custom-set-bar">
      ${state.customGroupSets.map((s) => {
        // "applied" = mọi nhóm của bộ này đang có trong bài — cho gỡ nguyên bộ bằng 1 nút X thay vì
        // phải mò untick từng nhóm trong danh sách "24 nhóm" bên dưới.
        const applied = s.groupIds.length > 0 && s.groupIds.every((id) => postGroupIds.has(String(id)));
        return `
        <span class="custom-set-chip-wrap${applied ? ' applied' : ''}">
          <button type="button" class="custom-set-chip${applied ? ' applied' : ''}" data-inline-apply-set="${escAttr(s.id)}" data-inline-post="${escAttr(postId)}" title="${escAttr(formatGroupList(s.groupIds))}">
            <span class="custom-set-chip-name">${esc(s.name)}</span>
            <span class="custom-set-chip-count">${s.groupIds.length}</span>
          </button>
          ${applied ? `<button type="button" class="custom-set-chip-remove" data-inline-remove-set="${escAttr(s.id)}" data-inline-post="${escAttr(postId)}" title="Gỡ bộ「${escAttr(s.name)}」khỏi bài">✕</button>` : ''}
          <button type="button" class="custom-set-chip-delete" data-inline-delete-set="${escAttr(s.id)}" title="Xóa hẳn bộ「${escAttr(s.name)}」khỏi hệ thống">🗑</button>
        </span>
      `;
      }).join('')}
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
      // Nút "Xong" nằm NGOÀI list (sibling trong .inline-group-picker, không phải con của list) —
      // sau khi gõ tìm kiếm, updateInlineGroupSearchList() chỉ render lại list rồi bind lại trên
      // chính list đó, nên root.querySelector tìm trong list không bao giờ thấy nút này, khiến
      // counter "Xong (X/Y)" bị đứng nguyên giá trị cũ dù đã tick thêm nhóm. Tìm từ document thay
      // vì chỉ có đúng 1 nút data-inline-done cho post đang mở picker tại 1 thời điểm.
      const doneBtn = document.querySelector(`[data-inline-done="${post.id}"]`);
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

// "YYYY-MM-DD" + "HH:mm" (định dạng lưu nội bộ) → "HH:mm dd/mm/yyyy" (định dạng hiển thị VN).
function formatNgayGioVn(ngay, gio) {
  const m = String(ngay || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return `${ngay || ''} ${gio || ''}`.trim();
  return `${gio || ''} ${m[3]}/${m[2]}/${m[1]}`;
}

function postScheduleTagHtml(p) {
  const info = state.postScheduleMap[p.id];
  if (info?.type === 'daily') {
    return `<button type="button" class="tag tag-schedule tag-clickable" data-cancel-post-daily="${escAttr(p.id)}" title="Bấm để hủy lặp lại">🔁 ${esc(info.timeOfDay)} hàng ngày</button>`;
  }
  if (p.ngay_dang && p.gio_dang) {
    return `<button type="button" class="tag tag-schedule tag-clickable" data-edit-schedule="${escAttr(p.id)}" title="Bấm sửa giờ đăng">Đăng: ${esc(formatNgayGioVn(p.ngay_dang, p.gio_dang))}</button>`;
  }
  return `<button type="button" class="tag tag-schedule tag-clickable tag-pending" data-edit-schedule="${escAttr(p.id)}" title="Hẹn giờ đăng">+ Hẹn giờ</button>`;
}

// Map lịch đăng theo post.id (1 lần trong activityUpcoming + lặp lại hàng ngày trong
// dailyFixedSchedules) — dùng cho postScheduleTagHtml() để tag trên card phản ánh đúng cả 2 loại
// lịch, giống hệt commentScheduleMap/commentScheduleTagHtml bên tab Comment. Trước bản này, bài
// lên lịch qua "Dàn" + lặp lại hàng ngày không set ngay_dang/gio_dang nên tag vẫn hiện "+ Hẹn giờ"
// như chưa có lịch — chỉ thấy lịch thật qua 1 list riêng (đã bỏ).
async function loadPostScheduleMap() {
  const d = await chrome.storage.local.get(['activityUpcoming', 'dailyFixedSchedules']);
  const map = {};
  (d.activityUpcoming || []).forEach((u) => {
    if (u.kind !== 'post' || !u.postId) return;
    if (!map[u.postId] || (map[u.postId].type === 'once' && u.when < map[u.postId].when)) {
      map[u.postId] = { type: 'once', when: u.when, item: u };
    }
  });
  (d.dailyFixedSchedules || []).forEach((e) => {
    const postId = e.payload?.posts?.[0]?.id;
    if (e.kind !== 'post' || !postId || map[postId]?.type === 'once') return;
    map[postId] = { type: 'daily', timeOfDay: e.timeOfDay, item: e };
  });
  return map;
}

async function cancelPostDailySchedule(postId) {
  const info = state.postScheduleMap[postId];
  if (!info?.item) return;
  if (!window.confirm('Hủy lịch lặp lại hàng ngày của bài này?')) return;
  await cancelDailyFixedSchedule(info.item.id);
}

// Hủy lịch đăng HÀNG LOẠT — tick nhiều bài (dùng chung checkbox [data-post-id]/getSelectedPosts()
// với "Lên lịch đã chọn") rồi hủy lịch (1 lần hoặc lặp lại hàng ngày) của TỪNG bài đã tick đang có
// lịch. Bài đã tick nhưng chưa có lịch bị bỏ qua êm (không phải lỗi).
//
// 2026-07-10 — Tony báo bấm hủy báo "chưa có lịch nào để hủy" dù card đang hiện rõ tag "Đăng:
// ...". 2 bug thật:
// 1. Bản đầu chỉ coi có lịch khi `state.postScheduleMap[p.id]` khớp (nguồn: activityUpcoming/
//    dailyFixedSchedules) — nhưng tag "Đăng: ..." (postScheduleTagHtml()) lại đọc thẳng
//    p.ngay_dang/p.gio_dang trên post, KHÁC nguồn. 2 nguồn có thể lệch (activityUpcoming đã bị dọn
//    hoặc chưa kịp reconcile) khiến hàm coi nhầm "chưa có lịch" dù tag vẫn hiện rành rành. Giờ coi
//    `p.ngay_dang && p.gio_dang` là tín hiệu CHÍNH cho lịch "1 lần" (đúng nguồn tag đang dùng).
// 2. Chỉ xoá activityUpcoming/alarm mà GIỮ NGUYÊN ngay_dang/gio_dang trên post thì
//    `reconcileQueueSchedules()` (background.js, chạy mỗi phút qua gf_retry_missed + mỗi lúc service
//    worker khởi động) sẽ thấy post "có ngay_dang/gio_dang nhưng chưa có activityUpcoming khớp" rồi
//    TỰ TẠO LẠI lịch mới trong vòng tối đa 1 phút — hủy xong tưởng xong nhưng lịch tự mọc lại (đúng
//    hiện tượng "chưa tới lịch đã chạy, lịch vẫn còn đó" Tony báo trước đó). Giờ xoá luôn 2 field
//    này trên post + lưu lại, không chỉ dọn activityUpcoming.
async function cancelSelectedPostSchedules() {
  const selected = getSelectedPosts();
  if (!selected.length) return alert('Chọn ít nhất một bài');
  const targets = selected.filter((p) => {
    const info = state.postScheduleMap[p.id];
    return info?.type === 'daily' || (p.ngay_dang && p.gio_dang);
  });
  if (!targets.length) return alert('Các bài đã chọn chưa có lịch nào để hủy');
  if (!window.confirm(`Hủy lịch của ${targets.length} bài đã chọn?`)) return;

  const onceIds = new Set();
  for (const p of targets) {
    const info = state.postScheduleMap[p.id];
    if (info?.type === 'daily') {
      await cancelDailyFixedSchedule(info.item.id);
    } else {
      onceIds.add(p.id);
    }
  }

  if (onceIds.size) {
    // Đọc/lọc/ghi activityUpcoming đúng 1 lần cho cả batch — quét theo postId (không chỉ đúng 1
    // entry đã biết trong postScheduleMap) để dọn luôn mọi bản trùng còn sót (kể cả entry
    // "generate_image" xuất ảnh tự động gắn theo post, giống cancelUpcoming() xử lý cho 1 bài).
    const d = await chrome.storage.local.get('activityUpcoming');
    const upcoming = d.activityUpcoming || [];
    const toCancel = upcoming.filter((u) => onceIds.has(u.postId) && (u.kind === 'post' || u.kind === 'generate_image'));
    for (const item of toCancel) {
      const name = item.alarmName || item.id;
      if (name) await gfSendMessage({ type: 'GF_CANCEL_ALARM', name }).catch(() => {});
    }
    const remaining = upcoming.filter((u) => !(onceIds.has(u.postId) && (u.kind === 'post' || u.kind === 'generate_image')));
    await chrome.storage.local.set({ activityUpcoming: remaining });
    targets.forEach((p) => {
      if (!onceIds.has(p.id)) return;
      p.ngay_dang = '';
      p.gio_dang = '';
    });
    await savePosts();
  }

  await refreshPostsOnly();
  showToast(`Đã hủy lịch ${targets.length} bài`, 'success');
}

// "Đã comment" / "Chưa comment" — tra state.serverMyPostsIndex (needs_comment lấy từ
// serverMyPosts, đã pull sẵn qua pullMyPostsFromServer(), không gọi thêm request). Chỉ hiện khi
// có ít nhất 1 nhóm của bài đã đồng bộ lên server (chưa sync thì không đủ dữ liệu để khẳng định).
function commentStatusTagHtml(p) {
  if (!p.postedGroups?.length || !state.serverMyPostsIndex?.size) return '';
  const tracked = p.postedGroups
    .map((g) => state.serverMyPostsIndex.get(`${g.group_id}_${g.post_id}`))
    .filter((v) => v !== undefined);
  if (!tracked.length) return '';
  const commented = tracked.filter((v) => Number(v) === 0).length;
  if (commented === tracked.length) {
    return `<span class="tag ready">💬 Đã comment${tracked.length > 1 ? ` (${commented}/${tracked.length})` : ''}</span>`;
  }
  if (commented > 0) {
    return `<span class="tag pending">💬 ${commented}/${tracked.length} đã comment</span>`;
  }
  return `<span class="tag pending">💬 Chưa comment</span>`;
}

// Bấm tag lịch trên 1 bài → tick riêng bài đó + mở khung Lên lịch (campaignStaggerPanel, dùng
// chung với lên lịch hàng loạt) — prefill đúng giờ đang có của bài (nếu đã có), mặc định +5 phút
// nếu chưa có. Xác nhận với đúng 1 bài đã tick = hẹn giờ riêng bài đó (giãn cách không có ý nghĩa
// khi chỉ 1 bài).
async function focusPostScheduleEdit(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  state.posts.forEach((p) => { p.selected = p.id === postId; });
  await savePosts();
  updateBatchFooter();
  renderPosts();
  const panel = $('#campaignStaggerPanel');
  const startEl = $('#campaignStaggerStart');
  if (startEl) {
    startEl.value = (post.ngay_dang && post.gio_dang)
      ? `${post.ngay_dang}T${normalizeGioForTimeInput(post.gio_dang)}`
      : defaultScheduleWhenValue(5);
  }
  panel?.classList.remove('hidden');
  panel?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
}

function updateBatchFooter() {
  const selected = getSelectedPosts().length;
  const total = state.posts.length;
  const label = $('#batchFooterLabel');
  if (label) {
    if (!total) {
      label.textContent = 'Tick bài → Lên lịch';
    } else if (!selected) {
      label.textContent = `${total} bài — tick để hẹn lịch · đăng ngay: nút Đăng trên từng card`;
    } else {
      label.textContent = `${selected}/${total} bài đã chọn — Lên lịch`;
    }
  }
}

function getFilteredPosts() {
  let posts = state.posts;
  const q = (state.postSearch || '').trim().toLowerCase();
  if (q) posts = posts.filter((p) => (p.noi_dung || '').toLowerCase().includes(q));
  if (state.postFilterGroup === 'has') posts = posts.filter((p) => p.groupIds?.length > 0);
  else if (state.postFilterGroup === 'none') posts = posts.filter((p) => !p.groupIds?.length);
  if (state.postFilterImage === 'has') posts = posts.filter((p) => postHasMedia(p) || p.mediaCached);
  else if (state.postFilterImage === 'none') posts = posts.filter((p) => !postHasMedia(p) && !p.mediaCached);
  if (state.postFilterCategory === 'none') posts = posts.filter((p) => !itemCategoryIds(p).length);
  else if (state.postFilterCategory !== 'all') posts = posts.filter((p) => itemCategoryIds(p).includes(String(state.postFilterCategory)));
  // Lọc theo trạng thái đăng. Bài chưa từng đăng có thể KHÔNG có postStatus (undefined) — coi như 'queue'.
  const st = state.postFilterStatus || 'all';
  if (st === 'queue') posts = posts.filter((p) => !p.postStatus || p.postStatus === 'queue');
  else if (st !== 'all') posts = posts.filter((p) => p.postStatus === st);
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

  const { pageItems, page, totalPages } = paginateList(filtered, state.postsPage);
  state.postsPage = page;

  box.innerHTML = pageItems.map((p) => {
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
        ${categoryTagsHtml(p)}
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
        ${commentStatusTagHtml(p)}
      </div>
      ${renderPostedGroupsBlock(p)}
      ${inlineGroupPickerHtml(p)}
      ${inlineCategoryPickerHtml(p)}
      <div class="post-actions">
        <button type="button" class="btn primary sm" data-post-now="${p.id}" ${noGroups || isPostingThis ? 'disabled' : ''} title="${noGroups ? 'Chọn nhóm trước' : 'Chỉ đăng bài này'}">${isPostingThis ? 'Đang đăng…' : 'Đăng'}</button>
        <button type="button" class="btn ghost sm accent" data-toggle-groups="${p.id}">${state.inlineGroupPickerPostId === p.id ? 'Đóng nhóm' : 'Chọn nhóm'}</button>
        <button type="button" class="btn ghost sm" data-toggle-cat="${p.id}" title="Gán ngành nghề (dùng được cả sau khi đăng)">${state.inlineCategoryPickerPostId === p.id ? 'Đóng ngành' : '🏷 Ngành'}</button>
        <button type="button" class="btn ghost sm" data-edit-post="${p.id}">${isEditingInCompose ? 'Tiếp tục sửa ↑' : 'Sửa'}</button>
        ${p.prompt_anh ? `<button type="button" class="btn ghost sm" data-copy-prompt="${p.id}" title="Copy prompt ảnh" style="background: #f0f2f5;">📋</button>` : ''}
        ${!hasMedia && p.prompt_anh ? `<button type="button" class="btn ghost sm accent" data-gen="${p.id}">Xuất ảnh</button>` : ''}
        <button type="button" class="btn ghost sm" data-del-post="${p.id}">Xóa</button>
        ${postAutoImageToggleHtml(p, hasMedia)}
      </div>
    </div>
  `;
  }).join('') + pagerHtml('posts', page, totalPages);

  bindPagerEvents(box, (key, delta) => {
    if (key === 'posts') { state.postsPage += delta; renderPosts(); }
  });

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
  box.querySelectorAll('[data-inline-remove-set]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await removeCustomSetFromPost(btn.dataset.inlinePost, btn.dataset.inlineRemoveSet);
    });
  });
  box.querySelectorAll('[data-inline-delete-set]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteCustomSetFromInline(btn.dataset.inlineDeleteSet);
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
  box.querySelectorAll('[data-toggle-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleCat;
      state.inlineCategoryPickerPostId = state.inlineCategoryPickerPostId === id ? null : id;
      renderPosts();
    });
  });
  box.querySelectorAll('[data-card-cat]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const catId = String(btn.dataset.cardCat);
      const post = state.posts.find((x) => x.id === btn.dataset.cardCatPost);
      if (!post) return;
      const set = new Set(itemCategoryIds(post));
      if (set.has(catId)) set.delete(catId); else set.add(catId);
      post.categories = [...set];
      await savePosts();
      renderPosts();
      // Bài đã đăng: đẩy tập ngành mới lên server ngay để lọc chạy cả ở máy khác / tab Đồng đội.
      if (post.postStatus === 'posted') syncPostCategoryToServer(post).catch(() => {});
    });
  });
  box.querySelectorAll('[data-toggle-posted-groups]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.togglePostedGroups;
      if (state.postedGroupsOpenIds.has(id)) state.postedGroupsOpenIds.delete(id);
      else state.postedGroupsOpenIds.add(id);
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
  box.querySelectorAll('[data-copy-prompt]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const postId = btn.dataset.copyPrompt;
      const post = state.posts.find((p) => p.id === postId);
      if (post?.prompt_anh) {
        navigator.clipboard.writeText(post.prompt_anh).then(() => {
          const oldText = btn.textContent;
          btn.textContent = '✓';
          btn.style.background = '#90EE90';
          setTimeout(() => {
            btn.textContent = oldText;
            btn.style.background = '#f0f2f5';
          }, 1500);
          showToast('Đã copy prompt ảnh', 'success', 2000);
        }).catch(() => showToast('Copy thất bại', 'error', 2000));
      }
    });
  });
  bindInlineGroupChecks(box);
  bindPostedGroupActions(box);
  box.querySelectorAll('[data-edit-schedule]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      focusPostScheduleEdit(btn.dataset.editSchedule);
    });
  });
  box.querySelectorAll('[data-cancel-post-daily]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelPostDailySchedule(btn.dataset.cancelPostDaily);
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
      // 2026-07-15 — dọn lịch của bài bị xoá (xem chú thích cùng ngày ở bulkDeletePosts()).
      await cancelPostScheduleAlarms(id, { clearQueueFields: false });
      await removeDailySchedulesForPost(id);
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
  renderRadarGroupPicker();
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

// GHÉP (không THAY THẾ) nhóm của bộ vào groupIds hiện có của bài — 1 bài chọn nhiều bộ phải cộng
// dồn được (Tony: "1 bài tao chọn 1 hoặc vài custom... đổi mỗi custom lại xóa custom đã định nghĩa
// trước đó"). Trước bản này `post.groupIds = set.groupIds...` GHI ĐÈ toàn bộ — áp bộ thứ 2 xóa sạch
// nhóm của bộ thứ nhất đã gán trước đó dù người dùng không hề đụng tới bộ đó.
async function applyCustomSetToPost(postId, setId) {
  const post = state.posts.find((p) => p.id === postId);
  const set = state.customGroupSets.find((s) => s.id === setId);
  if (!post || !set) return;
  const max = getMaxGroupsPerPost();
  ensurePostGroups(post);
  const existing = post.groupIds.map(String);
  const existingIds = new Set(existing);
  const toAdd = set.groupIds.map(String).filter((id) => !existingIds.has(id));
  const room = Math.max(0, max - existing.length);
  const added = toAdd.slice(0, room);
  post.groupIds = [...existing, ...added];
  await savePosts();
  state.inlineGroupPickerPostId = postId;
  renderPosts();
  const skipped = toAdd.length - added.length;
  if (!added.length && !skipped) {
    showToast(`Bộ「${set.name}」đã có đủ trong bài`, 'info');
  } else if (skipped > 0) {
    showToast(`Đã thêm ${added.length} nhóm từ bộ「${set.name}」— bỏ qua ${skipped} vì đã đủ tối đa ${max} nhóm/bài`, 'info');
  } else {
    showToast(`Đã thêm ${added.length} nhóm từ bộ「${set.name}」→ ${post.groupIds.length}/${max} nhóm`, 'success');
  }
}

async function removeCustomSetFromPost(postId, setId) {
  const post = state.posts.find((p) => p.id === postId);
  const set = state.customGroupSets.find((s) => s.id === setId);
  if (!post || !set) return;
  ensurePostGroups(post);
  const removeIds = new Set(set.groupIds.map(String));
  post.groupIds = post.groupIds.filter((id) => !removeIds.has(String(id)));
  await savePosts();
  state.inlineGroupPickerPostId = postId;
  renderPosts();
  showToast(`Đã gỡ bộ「${set.name}」khỏi bài`, 'success');
}

// Xóa hẳn 1 bộ custom (định nghĩa dùng chung toàn hệ thống, không riêng bài nào) ngay từ khung
// Chọn nhóm trên card — trước bản này chỉ xóa được qua tab Nhóm → Bộ custom, phải chuyển tab.
// Không đụng tới post.groupIds của bất kỳ bài nào đã gán từ bộ này trước đó (chỉ xóa định nghĩa).
async function deleteCustomSetFromInline(setId) {
  const set = state.customGroupSets.find((s) => s.id === setId);
  if (!set) return;
  if (!window.confirm(`Xóa hẳn bộ「${set.name}」khỏi hệ thống? (nhóm đã gán cho bài từ trước vẫn giữ nguyên)`)) return;
  if (state.editingCustomSetId === setId) cancelEditCustomSet();
  state.customGroupSets = await GF.groupSets.remove(setId);
  await saveGroupsData();
  renderPosts();
  renderGroupsTab();
  showToast(`Đã xóa bộ「${set.name}」`, 'info');
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

async function generateOne(postId, { silent = false } = {}) {
  const post = state.posts.find((p) => p.id === postId);
  if (postHasMedia(post)) {
    if (!silent) alert('Bài đã có ảnh/video — xóa media trong Sửa nếu muốn generate lại');
    return;
  }
  if (!post?.prompt_anh) {
    if (!silent) alert('Thiếu prompt ảnh');
    return;
  }
  const s = await GF.storage.getSettings();
  if (!(await aiImageReady())) {
    if (!silent) alert('Chọn Image provider trong Cài đặt hoặc nhập 9Router API key');
    return;
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
    if (!silent) showToast('✓ Xuất ảnh thành công', 'success', 2000);
  } catch (e) {
    post.imageStatus = 'error';
    renderPosts();
    const logMsg = `❌ Xuất ảnh lỗi: "${post.noi_dung?.slice(0, 60) || 'post'}" — ${e.message}`;
    console.error('[GroupFlow] ' + logMsg);
    if (!silent) {
      alert(e.message);
    } else {
      // Auto-generate mode: ghi log, không alert, continue
      chrome.runtime.sendMessage({
        type: 'GF_ENGINE_LOG',
        data: {
          level: 'error',
          message: logMsg,
          phase: 'image-gen',
        },
      }).catch(() => {});
    }
  }
}

async function generateAll() {
  const toGenerate = state.posts.filter((x) => x.selected === true && !x.imageBase64 && !x.videoBase64);
  let success = 0;
  let failed = 0;
  for (const p of toGenerate) {
    try {
      await generateOne(p.id, { silent: true });
      if (p.imageStatus === 'ready') success += 1;
      else if (p.imageStatus === 'error') failed += 1;
    } catch (e) {
      failed += 1;
    }
  }
  // 2026-07-17 — auto-generate: skip bài fail, ghi log, tiếp tục batch
  if (success > 0 || failed > 0) {
    const msg = `Xuất ảnh: ${success} thành công${failed > 0 ? `, ${failed} bỏ qua (lỗi)` : ''}`;
    showToast(msg, failed > 0 ? 'warn' : 'success', 3000);
  }
}

function getSelectedPosts() {
  return state.posts.filter((p) => p.selected === true);
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

// 2026-07-15 — nâng cấp từ hàm cũ cùng tên (vốn KHÔNG được ai gọi, và cũng không persist kết quả
// filter) thành điểm dọn lịch "1 lần cụ thể" DÙNG CHUNG cho MỌI đường bỏ lịch của 1 bài: Hủy ở tab
// Hoạt động (cancelUpcoming), đổi/xoá giờ trong modal sửa bài (saveComposePostToQueue), xoá bài
// khỏi hàng đợi (data-del-post / bulkDeletePosts). Dọn ĐỦ CẢ 3 dấu vết:
//   1. alarm thật + payload alarm_<tên> (GF_CANCEL_ALARM) — kể cả entry 'generate_image' xuất ảnh
//      tự động gắn theo bài (giống cancelSelectedPostSchedules() đã làm);
//   2. entry trong activityUpcoming (persist lại ngay);
//   3. ngay_dang/gio_dang trên chính bài trong postQueue (trừ khi clearQueueFields: false — dùng
//      khi bài sắp bị xoá hẳn, hoặc khi 2 field VỪA được ghi giá trị mới trong modal sửa bài).
// Bước 3 chính là chỗ mọi bản vá trước (v1.0.261) còn sót: chỉ xoá alarm/entry mà giữ nguyên 2
// field này thì reconcileQueueSchedules() (background.js — chạy mỗi phút qua gf_retry_missed + mỗi
// lần service worker khởi động) thấy "bài có giờ hẹn nhưng không có lịch khớp" rồi TỰ DỰNG LẠI
// lịch — tệ nhất là giờ hẹn đã QUA thì đăng NGAY lập tức — đúng hiện tượng "tắt hết lịch vẫn chạy".
async function cancelPostScheduleAlarms(postId, { clearQueueFields = true } = {}) {
  if (!postId) return;
  const d = await chrome.storage.local.get('activityUpcoming');
  const upcoming = d.activityUpcoming || [];
  const match = (u) => u.postId === postId && (u.kind === 'post' || u.kind === 'generate_image');
  for (const item of upcoming.filter(match)) {
    const name = item.alarmName || item.id;
    if (name) await gfSendMessage({ type: 'GF_CANCEL_ALARM', name }).catch(() => {});
  }
  const remaining = upcoming.filter((u) => !match(u));
  if (remaining.length !== upcoming.length) {
    await chrome.storage.local.set({ activityUpcoming: remaining });
  }
  if (clearQueueFields) {
    const post = state.posts.find((p) => p.id === postId);
    if (post && (post.ngay_dang || post.gio_dang)) {
      post.ngay_dang = '';
      post.gio_dang = '';
      await savePosts();
    }
  }
}

// Xoá entry "lặp lại hàng ngày" gắn với 1 bài — payload của entry là bản ĐÔNG LẠNH của bài
// (buildSchedulePostPayload() lúc đặt lịch), nên bài đã xoá khỏi hàng đợi mà entry còn thì
// tickDailyFixedSchedules() (background.js) vẫn cứ đăng lại bài "ma" đó mỗi ngày từ payload cũ.
// Chỉ gọi khi XOÁ BÀI khỏi hàng đợi; hủy lịch daily chủ động vẫn đi qua cancelDailyFixedSchedule().
async function removeDailySchedulesForPost(postId) {
  if (!postId) return;
  const d = await chrome.storage.local.get('dailyFixedSchedules');
  const list = d.dailyFixedSchedules || [];
  const remaining = list.filter((e) => !(e.kind === 'post' && e.payload?.posts?.[0]?.id === postId));
  if (remaining.length !== list.length) {
    await chrome.storage.local.set({ dailyFixedSchedules: remaining });
  }
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

// "Dàn"/"Lên lịch đã chọn" không còn bắt buộc đã chọn nhóm trước — bài chưa gán nhóm vẫn lên lịch được, tới giờ
// chạy nếu vẫn chưa có nhóm thì runPostMatrix() tự bỏ qua đúng bài đó + báo lỗi trong Log (xem
// background.js), không chặn cả job.
function buildPostJobRelaxed() {
  const posts = getSelectedPosts().map((p) => ensurePostGroups({ ...p }));
  if (!posts.length) throw new Error('Chọn ít nhất 1 bài (tick checkbox)');
  return posts;
}

function toggleCampaignStaggerPanel() {
  const panel = $('#campaignStaggerPanel');
  if (!panel) return;
  const willShow = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (willShow) {
    const startEl = $('#campaignStaggerStart');
    if (startEl && !startEl.value) startEl.value = defaultScheduleWhenValue(5);
  }
}

// Refresh nhẹ sau khi lên lịch dàn — chỉ nạp lại postQueue + Activity, không kéo theo cả loadState()
// (groups, radar, comments — kéo cả fetchCrossPostsFromServer() không liên quan gì tới việc vừa
// lên lịch bài đăng).
async function refreshPostsOnly() {
  const d = await chrome.storage.local.get('postQueue');
  state.posts = mapPostsFromQueue(d.postQueue || []);
  state.postScheduleMap = await loadPostScheduleMap();
  // postQueue trong storage đã bị stripForQueue() bóc media ra khỏi payload (media thật nằm ở
  // postMediaStore) — không hydrate lại thì card render ảnh vỡ ngay sau khi vừa lên lịch xong.
  await hydrateCachedMediaInPosts();
  renderPosts();
  await refreshActivityFromStorage();
}

async function confirmCampaignStagger() {
  let posts;
  try {
    posts = buildPostJobRelaxed();
  } catch (e) {
    return alert(e.message);
  }

  const input = $('#campaignStaggerStart')?.value;
  if (!input) return alert('Chọn giờ bắt đầu');
  const startWhen = new Date(input).getTime();
  if (!Number.isFinite(startWhen) || startWhen < Date.now()) {
    return alert('Chọn thời điểm bắt đầu trong tương lai');
  }
  const gapValue = Number($('#campaignStaggerGapValue')?.value) || 0;
  const gapUnit = $('#campaignStaggerGapUnit')?.value || 'minute';
  const gapMs = staggerGapMs(gapValue, gapUnit);
  const repeatDaily = $('#campaignStaggerRepeatDaily')?.checked === true;

  const confirmMsg = repeatDaily
    ? (posts.length > 1
      ? `Lặp lại hàng ngày ${posts.length} bài, cách nhau ${gapValue} ${gapUnitLabel(gapUnit)}?`
      : 'Lặp lại hàng ngày bài này?')
    : (posts.length > 1
      ? `Lên lịch ${posts.length} bài, cách nhau ${gapValue} ${gapUnitLabel(gapUnit)}?`
      : 'Lên lịch bài này?');
  if (!window.confirm(confirmMsg)) return;

  const settings = await GF.storage.getSettings();
  const campaignLabel = posts[0]?.campaignName || 'Campaign';

  // posts[] ở đây là bản clone ({ ...p }) từ buildPostJobRelaxed(), không phải object trong
  // state.posts — set field trực tiếp lên post/entry.post không phản ánh vào state.posts nên
  // savePosts() lưu lại bản cũ (chưa có ngay_dang/gio_dang) và tag trên card vẫn hiện "+ Hẹn giờ".
  // Phải đồng bộ ngược lại state.posts theo id.
  const syncToStatePost = (id, fields) => {
    const statePost = state.posts.find((sp) => sp.id === id);
    if (statePost) Object.assign(statePost, fields);
  };

  const whens = computeStaggeredWhens(startWhen, gapMs, posts.length);

  if (repeatDaily) {
    const now = Date.now();
    const entries = posts.map((post, i) => {
      if (!post.campaignName) post.campaignName = campaignLabel;
      syncToStatePost(post.id, { campaignName: post.campaignName });
      return {
        id: `dfs_${now}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        kind: 'post',
        timeOfDay: avoidNightHHMM(timeOfDayHHMM(whens[i])),
        payload: buildSchedulePostPayload([post], settings),
        label: `${campaignLabel} ${i + 1}/${posts.length} — ${(post.noi_dung || '').slice(0, 40)}`,
        lastRunDate: null,
        createdAt: now,
      };
    });
    await addDailyFixedSchedules(entries);
  } else {
    const upcoming = (await chrome.storage.local.get('activityUpcoming')).activityUpcoming || [];
    const pad = (n) => String(n).padStart(2, '0');
    for (let i = 0; i < posts.length; i += 1) {
      const post = posts[i];
      const when = avoidNightTime(whens[i]);
      const d = new Date(when);
      post.ngay_dang = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      post.gio_dang = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      if (!post.campaignName) post.campaignName = campaignLabel;
      syncToStatePost(post.id, {
        ngay_dang: post.ngay_dang,
        gio_dang: post.gio_dang,
        campaignName: post.campaignName,
      });

      const alarmName = `gf_job_${post.id}_camp_${Date.now()}_${i}`;
      const payload = buildSchedulePostPayload([post], settings);
      await gfScheduleAlarm({ name: alarmName, when, data: { kind: 'post', payload } });
      upcoming.push({
        id: alarmName,
        alarmName,
        kind: 'post',
        when,
        postId: post.id,
        snippet: post.noi_dung?.slice(0, 80) || '',
        groupIds: [...post.groupIds],
        payload,
        label: posts.length > 1
          ? `Lịch ${i + 1}/${posts.length} — ${post.groupIds?.length ? formatGroupList(post.groupIds) : 'chưa chọn nhóm'}`
          : `Đăng → ${post.groupIds?.length ? formatGroupList(post.groupIds) : 'chưa chọn nhóm'}`,
      });
    }
    await chrome.storage.local.set({ activityUpcoming: upcoming });
  }

  await savePosts();
  $('#campaignStaggerPanel')?.classList.add('hidden');
  showToast(`Đã ${repeatDaily ? 'đặt lặp lại hàng ngày' : 'lên lịch'} ${posts.length} bài`, 'success');
  await refreshPostsOnly();
}

async function cancelUpcoming(item) {
  // 2026-07-15 — bài đăng đi qua cancelPostScheduleAlarms() để dọn LUÔN ngay_dang/gio_dang trên
  // bài trong queue: trước đây nút Hủy ở tab Hoạt động chỉ xoá entry + alarm, 2 field còn sót khiến
  // reconcileQueueSchedules() tự dựng lại lịch (hoặc đăng NGAY nếu giờ hẹn đã qua) trong ≤1 phút —
  // cùng gốc bug đã vá cho đường hủy hàng loạt ở v1.0.261 (cancelSelectedPostSchedules()) nhưng
  // đường hủy TỪNG lịch này bị bỏ sót.
  if (item.kind === 'post' && item.postId) {
    await cancelPostScheduleAlarms(item.postId);
    loadState();
    return;
  }
  const alarmName = item.alarmName || item.id;
  if (alarmName?.startsWith('gf_job_') || alarmName?.startsWith('gf_img_') || alarmName?.startsWith('gf_cmt_')) {
    await gfSendMessage({ type: 'GF_CANCEL_ALARM', name: alarmName });
  }
  const d = await chrome.storage.local.get('activityUpcoming');
  const upcoming = (d.activityUpcoming || []).filter((u) => u.id !== item.id);
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
  // 2026-07-15 — đồng bộ giờ MỚI ngược vào ngay_dang/gio_dang trên bài (cancelUpcoming() phía trên
  // vừa xoá trắng 2 field này): thiếu bước này thì tag trên card hiện "+ Hẹn giờ" như chưa có lịch
  // dù lịch mới vẫn còn, và trước bản này còn tệ hơn — 2 field giữ nguyên GIỜ CŨ, lệch hẳn với giờ
  // mới trong activityUpcoming.
  if (kind === 'post' && item.postId) {
    const statePost = state.posts.find((p) => p.id === item.postId);
    if (statePost) {
      const nd = new Date(when);
      statePost.ngay_dang = `${nd.getFullYear()}-${pad(nd.getMonth() + 1)}-${pad(nd.getDate())}`;
      statePost.gio_dang = `${pad(nd.getHours())}:${pad(nd.getMinutes())}`;
      await savePosts();
    }
  }
  loadState();
}

async function loadPostedPostsForComment({ force = false, skipUnchangedRender = false } = {}) {
  const d = await chrome.storage.local.get(['postQueue', 'serverMyPosts', 'commentedRecords', 'gf_post_access_cache']);
  const queue = d.postQueue || [];
  const serverMyPosts = d.serverMyPosts || [];
  state.commentedRecords = d.commentedRecords || {};
  // Cache check "bài có comment được không" — ghi bởi cron nền `warmPostAccessCache()`
  // (background.js) hoặc ngay lúc comment thật chạy (`getPostAccess()`, fbCommentBg.js). Đọc lại
  // mỗi lần tải list Comment để tag trạng thái + chặn nút Chạy/Lên lịch luôn dùng dữ liệu mới nhất.
  state.postAccessCache = d.gf_post_access_cache || {};

  // 2026-07-13 — Tony: bài quá N ngày (kể từ ngày post, cấu hình ở website) không nên hiện ra ở
  // CẢ 2 tab "Của tôi"/"Đồng đội" nữa — áp đồng nhất cho mọi nguồn (postQueue tự tạo cục bộ lẫn
  // serverMyPosts/crossPostsCache lấy từ server), vì "kiểm tra bài quá cũ cũng vô nghĩa" (đúng như
  // Tony chỉ ra — không có lý do gì để vẫn hiện/vẫn tự check bài mà chính sách đã coi là hết hạn).
  // Website đã ngừng TRẢ VỀ bài quá hạn qua /my-posts, /cross-posts (xem CHANGELOG) — nhưng cache
  // cục bộ merge CỘNG DỒN không tự dọn bài đã lỡ tải về trước đó, nên vẫn cần lọc lại ở đây.
  const lookbackDays = await getPostsSyncLookbackDays();

  const localPosts = queue
    .filter((p) => p.postStatus === 'posted'
      && p.postedGroups?.some((g) => g.post_id && /^\d+$/.test(String(g.post_id)))
      && isWithinPostsSyncLookback(p.lastPostedAt, lookbackDays))
    .sort((a, b) => (b.lastPostedAt || '').localeCompare(a.lastPostedAt || ''))
    .map((p) => ({ ...p, _source: 'local' }));

  // Bài của mình từ server chưa có trong local queue (multi-device sync)
  const localPostIds = new Set(
    localPosts.flatMap((p) => (p.postedGroups || []).map((g) => `${g.group_id}_${g.post_id}`))
  );
  const myServerItems = serverMyPosts
    .filter((sp) => !localPostIds.has(`${sp.group_id}_${sp.post_id}`)
      && isWithinPostsSyncLookback(sp.posted_at, lookbackDays))
    .map((sp) => ({
      id: `server_${sp.id}`,
      _serverId: sp.id,
      _source: 'server',
      noi_dung: sp.noi_dung || '',
      lastPostedAt: sp.posted_at || '',
      category_ids: sp.category_ids || null,
      postedGroups: [{
        group_id: sp.group_id,
        group_name: sp.group_name || sp.group_id,
        post_id: sp.post_id,
        status: 'posted',
      }],
    }));

  const crossPosts = await fetchCrossPostsFromServer({ force });
  const crossItems = crossPosts
    .filter((cp) => isWithinPostsSyncLookback(cp.posted_at, lookbackDays))
    .map((cp) => ({
    id: `cross_${cp.id}`,
    _serverId: cp.id,
    _source: 'cross',
    noi_dung: cp.noi_dung || '',
    lastPostedAt: cp.posted_at || '',
    _userLabel: cp.user_name || cp.user_email || 'User',
    // FB uid của tác giả (server trả `user_fb_id` — có thể null với bài cũ) — để tag tên tác giả
    // trên card + Lịch sử bấm vào mở thẳng profile Facebook.
    _userFbId: cp.user_fb_id || null,
    // Server giờ trả cả bài đã comment rồi (needs_comment=0) — giữ lại field này để hiện tag
    // "Đã comment" thay vì lọc mất khỏi danh sách như trước.
    _needsComment: cp.needs_comment !== 0,
    // v1.0.255 — BUG THẬT (Tony test 3 tài khoản, /cross-posts trả đúng 9 bài hợp lệ nhưng tab
    // Đồng đội trống trơn): v1.0.246 thêm `pending_checked_at` vào SELECT backend + bắt
    // isCommentActionable() check hạn field này cho bài cross, nhưng QUÊN chép field đó vào object
    // map ở đây — mọi bài cross đều thiếu `pending_checked_at` nên luôn bị coi "hết hạn"/"chưa xác
    // nhận", ẩn sạch 100% dù server trả về hợp lệ. Lỗi tự gây ra khi vá lỗi khác, không phải do
    // logic điều kiện phía server.
    pending_checked_at: cp.pending_checked_at || null,
    category_ids: cp.category_ids || null,
    postedGroups: [{
      group_id: cp.group_id,
      group_name: cp.group_name || cp.group_id,
      post_id: cp.post_id,
      status: 'posted',
    }],
  }));

  state.comments = [...localPosts, ...myServerItems, ...crossItems];
  await autoFillMissingCommentDrafts();
  state.commentScheduleMap = await loadCommentScheduleMap();
  populateCommentFilterPersonOptions();
  updateCommentSubTabCounts();
  updateCommentApprovalStats();
  // Badge chỉ đếm bài còn CẦN chú ý (chưa comment VÀ còn làm được — không tính bài đã biết chắc
  // chờ duyệt/đã xóa, cùng luật ẩn với isCommentActionable() dùng cho list) — áp dụng chung cho cả
  // bài của mình lẫn bài đồng đội qua isCommentDone(), không tính bài đã xong (server/postedGroups
  // đều giữ bài đã xong trong danh sách thay vì lọc mất, nên đếm hết state.comments.length sẽ sai
  // nghĩa "còn N việc").
  const badge = $('#commentBadge');
  const pendingCount = state.comments.filter((c) => !isCommentDone(c) && isCommentActionable(c)).length;
  if (badge) badge.textContent = pendingCount ? String(pendingCount) : '';
  // v1.0.277 — path check nền (storage.onChanged của gf_post_access_cache, xem schedulePostAccessRefresh)
  // truyền skipUnchangedRender: số đếm/badge ở trên ĐÃ cập nhật, nhưng nếu tập bài hiển thị không đổi
  // so với lần vẽ trước thì KHÔNG blow-away DOM list (giữ cuộn trang + con trỏ đang gõ). Các path
  // khác (mở tab, force, sau thao tác) vẫn vẽ lại bình thường.
  if ($('#tab-comment')?.classList.contains('active')) {
    const unchanged = skipUnchangedRender && lastCommentRenderSig !== null
      && commentRenderSigFrom(getFilteredComments()) === lastCommentRenderSig;
    if (!unchanged) renderComments();
  }
}

// Gom trạng thái lịch hiện có (alarm 1 lần trong activityUpcoming + lặp lại hàng ngày giờ cố
// định trong dailyFixedSchedules) thành map theo post_queue_id — để tag "🕒 Lên lịch" trên từng
// card đọc trực tiếp, không phải query storage lại mỗi lần render.
async function loadCommentScheduleMap() {
  const d = await chrome.storage.local.get(['activityUpcoming', 'dailyFixedSchedules']);
  const map = {};
  (d.activityUpcoming || []).forEach((u) => {
    if (u.kind !== 'comment' || !u.recordId) return;
    if (!map[u.recordId] || (map[u.recordId].type === 'once' && u.when < map[u.recordId].when)) {
      map[u.recordId] = { type: 'once', when: u.when, item: u };
    }
  });
  (d.dailyFixedSchedules || []).forEach((e) => {
    const postQueueId = e.payload?.post_queue_id;
    if (e.kind !== 'comment' || !postQueueId || map[postQueueId]?.type === 'once') return;
    map[postQueueId] = { type: 'daily', timeOfDay: e.timeOfDay, item: e };
  });
  return map;
}

// Hủy lịch comment (1 lần hoặc lặp lại hàng ngày) ngay trên bài — thay cho list riêng đã bỏ, giữ
// nguyên hành vi Hủy vốn có (cancelUpcoming cho 1 lần, cancelDailyFixedSchedule cho lặp lại).
async function cancelCommentSchedule(postId) {
  const info = state.commentScheduleMap[postId];
  if (!info?.item) return;
  if (!window.confirm('Hủy lịch comment bài này?')) return;
  if (info.type === 'daily') {
    await cancelDailyFixedSchedule(info.item.id);
  } else {
    await cancelUpcoming(info.item);
  }
  state.commentScheduleOpenId = null;
  await loadComments();
}

// Hủy lịch HÀNG LOẠT — tick nhiều bài (dùng chung checkbox [data-comment-id] với "Lên lịch đã
// chọn"/collectSelectedCommentJobGroups()) rồi hủy lịch (1 lần hoặc lặp lại hàng ngày) của TỪNG
// bài đã tick đang có lịch. Bài đã tick nhưng chưa có lịch bị bỏ qua êm (không phải lỗi).
async function cancelSelectedCommentSchedules() {
  const ids = [...document.querySelectorAll('[data-comment-id]:checked')].map((el) => el.dataset.commentId);
  if (!ids.length) return alert('Chọn ít nhất một bài');
  const targets = ids
    .map((id) => ({ id, info: state.commentScheduleMap[id] }))
    .filter((t) => t.info?.item);
  if (!targets.length) return alert('Các bài đã chọn chưa có lịch nào để hủy');
  if (!window.confirm(`Hủy lịch của ${targets.length} bài đã chọn?`)) return;
  for (const { info } of targets) {
    if (info.type === 'daily') await cancelDailyFixedSchedule(info.item.id);
    else await cancelUpcoming(info.item);
  }
  state.commentScheduleOpenId = null;
  await loadComments();
  showToast(`Đã hủy lịch ${targets.length} bài`, 'success');
}

// v1.0.221 — giữ ĐỒNG BỘ với PENDING_ACCESS_TTL_MS (modules/fbCommentBg.js) — sidepanel.js không
// load module đó (chỉ background/service worker mới có, xem manifest.json), nên đọc thẳng key
// `gf_post_access_cache` (chrome.storage.local, dùng chung mọi context extension) rồi tự áp lại
// đúng luật hết hạn ở đây thay vì gọi sang background hỏi.
const POST_ACCESS_PENDING_TTL_MS = 20 * 60 * 1000;
// 2026-07-15 — BỎ `CROSS_POST_CONFIRMED_TTL_MS` (hạn 6h phía client, thêm ở v1.0.246): Tony chốt
// lại rule "bài nào chủ đã check OK thì mọi người phải thấy tới khi quá N ngày" — hạn 6h khiến máy
// chủ bài tắt quá 6 tiếng là toàn bộ bài người đó biến mất khỏi tab Đồng đội của mọi người, và số
// đếm mỗi máy mỗi khác (20 vs 24) theo thời điểm sync. Vấn đề gốc mà hạn 6h từng giải quyết (bài
// TỪNG OK nhưng sau đó chuyển chờ duyệt, cache cộng dồn không tự gỡ) giờ được xử lý CHÍNH XÁC thay
// vì đoán theo tuổi: server (nhánh sync incremental của GET /cross-posts) trả cả bài
// `pending_approval = 1` như tín hiệu gỡ — fetchCrossPostsFromServer() lọc bỏ khỏi cache ngay khi
// nhận. Lưới an toàn cuối cho ca chủ bài offline chưa kịp báo: comment trúng bài xấu timeout 1 lần
// là máy này tự đánh dấu bỏ qua cục bộ (v1.0.267).

// Cache 'ok'/'deleted' coi là bền (không hết hạn); 'pending' (chờ duyệt, hoặc tín hiệu mơ hồ như
// lỗi mạng/404) tin theo nhịp backoff — quá hạn thì coi như "chưa check", không chặn gì cả.
// v1.0.289 — khớp luật backoff/bỏ-cuộc bên fbCommentBg.js (pendingRecheckDelayMs/pendingGaveUp —
// chép tay vì module chỉ bundle cho service worker): 3 lần đầu 20', lần 4-5 2h, từ lần 6 6h; quá
// 72h kể từ lần đầu pending → coi luôn là "tươi" (bài đã bỏ-cuộc auto-check, chỉ còn check tay).
const POST_ACCESS_GIVE_UP_MS = 72 * 60 * 60 * 1000;
function isPostAccessFresh(entry) {
  if (!entry) return false;
  if (entry.kind !== 'pending') return true;
  const first = entry.firstPendingAt || entry.checkedAt || 0;
  if (Date.now() - first > POST_ACCESS_GIVE_UP_MS) return true;
  const n = entry.checkCount || 1;
  const ttl = n <= 3 ? POST_ACCESS_PENDING_TTL_MS : (n <= 5 ? 2 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000);
  return Date.now() - (entry.checkedAt || 0) < ttl;
}

function isPostAccessGaveUp(entry) {
  if (!entry || entry.kind !== 'pending') return false;
  const first = entry.firstPendingAt || entry.checkedAt || 0;
  return Date.now() - first > POST_ACCESS_GIVE_UP_MS;
}

// Tách nhóm THẬT SỰ biết chắc chưa comment được (cache còn hạn + canComment:false) ra khỏi nhóm
// còn lại — nhóm CHƯA từng check (không có cache) vẫn coi là "ready", không bắt user đợi cron nền
// check xong mới được bấm ▶ Chạy/Lên lịch (đúng hành vi hiện có, chỉ chặn khi ĐÃ BIẾT CHẮC là
// không được, không suy đoán khi chưa rõ).
function splitGroupsByAccess(groups) {
  const ready = [];
  const blocked = [];
  (groups || []).forEach((g) => {
    const entry = state.postAccessCache[String(g.post_id)];
    if (isPostAccessFresh(entry) && entry.canComment === false) {
      blocked.push({ ...g, _accessReason: entry.reason || 'Bài chưa sẵn sàng' });
    } else {
      ready.push(g);
    }
  });
  return { ready, blocked };
}

// v1.0.223 — Tony: list Comment (của tôi + đồng đội) chỉ nên hiện bài CÒN LÀM ĐƯỢC GÌ đó.
// v1.0.224 — Tony làm rõ lại, CHẶT hơn bản đầu: "check được cái nào thì hiển thị cái đó thôi,
// không nên load hết" — bản v1.0.223 coi bài CHƯA từng check vẫn là "còn khả năng" nên vẫn hiện
// (gần như mọi bài, vì cron quét rất chậm — 2 bài/3 phút), khiến list nhìn như chưa lọc gì. Giờ
// ĐẢO ngược điều kiện: chỉ hiện bài đã có cache XÁC NHẬN `canComment: true` còn hạn (hoặc đã
// comment rồi) — bài chưa check/đang chờ duyệt/đã xóa đều ẩn cho tới khi có kết quả OK thật. Đánh
// đổi: ngay sau khi mở tab lần đầu, list có thể trống/ít do cron chưa kịp check — bù lại bằng
// GF_WARM_POST_ACCESS (gfSendMessage lúc mở tab Comment, xem bindEvents()) bắn 1 lượt check batch
// lớn hơn ngay lập tức thay vì chỉ trông chờ tick nền.
// v1.0.236 — bài đồng đội (`_source: 'cross'`) giờ KHÔNG tự check lại cục bộ nữa — server
// (`GET /cross-posts`, userSync.js) đã đổi sang chỉ gửi về bài mà CHÍNH CHỦ BÀI tự confirm
// `canComment:true` (đáng tin, vì Facebook luôn cho chủ bài xem thật), thay vì để mỗi máy đồng đội
// tự fetch-check bài của người khác — cách đó luôn fail-open (đoán bừa OK) với bài bị hạn chế xem,
// vì Facebook không cho non-owner thấy gì để dò. Máy đồng đội chỉ cần tin thẳng: có mặt trong
// crossPostsCache tức là đã được xác nhận. Bài CỦA CHÍNH MÌNH vẫn giữ nguyên check cục bộ (đáng tin
// vì chính là chủ bài).
// v1.0.291 — trạng thái duyệt của bài CỦA MÌNH theo cache check: 'ok' (ít nhất 1 nhóm xác nhận
// comment được) / 'pending' (chờ duyệt) / 'deleted' (đã xóa) / 'unchecked' (chưa có verdict).
// Nuôi tag trên card, 3 chip lọc stats, guard lên lịch/Chạy — thiết kế mới của Tony: hiện TẤT CẢ
// bài ở tab Của tôi kèm trạng thái, thay vì giấu bài chưa-OK như v1.0.224 (sau wipe cache
// v1.0.287 list trống trơn 28 bài, không biết bài mình đâu).
function ownPostApprovalState(c) {
  const validGroups = (c.postedGroups || []).filter((g) => g.post_id && /^\d+$/.test(String(g.post_id)));
  if (!validGroups.length) return 'unchecked';
  let sawPending = false;
  let sawDeleted = false;
  for (const g of validGroups) {
    const entry = state.postAccessCache[String(g.post_id)];
    if (entry?.kind === 'ok') return 'ok';
    if (entry?.kind === 'pending') sawPending = true;
    else if (entry?.kind === 'deleted') sawDeleted = true;
  }
  if (sawPending) return 'pending';
  if (sawDeleted) return 'deleted';
  return 'unchecked';
}

function isCommentActionable(c) {
  if (isCommentDone(c)) return true;
  if (c._source === 'cross') {
    // 2026-07-15 — bài đồng đội: chỉ cần ĐÃ ĐƯỢC CHỦ BÀI XÁC NHẬN ít nhất 1 lần
    // (`pending_checked_at` có giá trị) là comment được, KHÔNG còn xét tuổi xác nhận (hạn 6h cũ —
    // xem chú thích chỗ khai báo POST_ACCESS_PENDING_TTL_MS vì sao bỏ). Bài chuyển xấu sau khi
    // từng OK đã bị fetchCrossPostsFromServer() gỡ khỏi cache từ tín hiệu server, không tới được đây.
    return Boolean(c.pending_checked_at);
  }
  return ownPostApprovalState(c) === 'ok';
}

// Tag trạng thái "có comment được không" trên card Comment — đọc thẳng state.postAccessCache
// (ghi bởi cron nền warmPostAccessCache() hoặc lúc chạy comment thật), KHÔNG tự gọi check gì ở
// đây. Bài chưa từng check (cache trống) không hiện tag gì — tránh nhầm "chưa biết" với "đã xóa".
// v1.0.236 — bài đồng đội (isCross) luôn hiện "✓ Có thể comment" thẳng — không đọc
// state.postAccessCache (máy này không tự check bài của người khác nữa, xem isCommentActionable()),
// vì có mặt trong danh sách tức là server đã xác nhận chủ bài confirm OK rồi.
// v1.0.291 — bỏ commentAccessTagHtml(): list "Của tôi" giờ hiện TẤT CẢ bài kèm tag trạng thái đầy
// đủ (⏳/✕/❔ — dựng thẳng trong renderComments() từ ownPostApprovalState()), không còn kiểu chỉ
// gắn tag cảnh báo cho bài đã-comment-xong như thiết kế giấu-bài cũ.

// Bài đã được comment xong hay chưa — dùng chung cho tag "✓ Đã comment" và filter Bình luận, áp
// dụng cho cả bài của mình (theo firstCommentOk từng nhóm, ghi bởi markPostedGroupCommented() —
// background.js) lẫn bài đồng đội (theo needs_comment server trả về).
//
// v1.0.185 — ưu tiên state.commentedRecords (ghi cục bộ ngay khi comment lên FB thành công, xem
// markCommentDoneLocal() trong background.js) TRƯỚC 2 nguồn còn lại. Trước bản này, bài
// `_source: 'server'` (bài của mình kéo về từ thiết bị khác) không có trong postQueue cục bộ nên
// markPostedGroupCommented() luôn no-op — và bài `_source: 'cross'` chỉ tin vào PATCH best-effort
// (markCrossPostCommentedFromBg) im lặng nuốt lỗi khi fail (401 sai license key, mất mạng…). Cả 2
// trường hợp khiến isCommentDone() luôn trả false dù đã comment xong thật — mỗi lần mở/làm mới tab
// Comment, autoScheduleUnscheduledComments() lại coi là "chưa xong" rồi tự lên lịch + chạy lại,
// comment trùng lặp lên cùng 1 bài FB vô hạn lần. commentedRecords không phụ thuộc network nào nên
// luôn đúng ngay cả khi các nguồn kia fail.
function isCommentDone(c) {
  const validGroups = (c.postedGroups || []).filter((g) => g.post_id && /^\d+$/.test(String(g.post_id)));
  if (validGroups.length > 0) {
    const local = state.commentedRecords?.[c.id];
    if (local && validGroups.every((g) => local[String(g.group_id)])) return true;
  }
  if (c._source === 'cross') return c._needsComment === false;
  return validGroups.length > 0 && validGroups.every((g) => g.firstCommentOk === true);
}

// Giờ comment GẦN NHẤT (lấy mốc mới nhất trong số các nhóm của bài, nếu nhiều nhóm comment lệch
// giờ nhau) — đọc từ `state.commentedRecords` (ghi bởi markCommentDoneLocal(), background.js,
// NGAY lúc comment thành công — xem isCommentDone()). Chỉ để HIỂN THỊ cho user biết, không dùng để
// quyết định gì. Trả '' nếu chưa từng comment, hoặc record đã bị dọn khỏi cache (giữ tối đa 3000
// bài gần nhất — xem markCommentDoneLocal()) — trường hợp đó tag "✓ Đã comment" vẫn đúng nhờ
// isCommentDone() còn 2 nguồn dự phòng khác (firstCommentOk/_needsComment), chỉ riêng GIỜ cụ thể là
// mất, không có cách khôi phục lại (background không lưu giờ ở đâu khác).
function lastCommentedAtLabel(c) {
  const rec = state.commentedRecords?.[c.id];
  if (!rec) return '';
  const times = Object.values(rec).filter((t) => Number.isFinite(t));
  if (!times.length) return '';
  return formatScheduleWhen(Math.max(...times));
}

// Bài chưa có mẫu bình luận (ô draft trống) thì tự random 1 dòng từ Settings → Comment mẫu ngay
// khi tải danh sách — áp dụng cho MỌI bài (không chỉ bài sắp được auto-lên-lịch), để tag "📝 Có mẫu
// bình luận" hiện đúng ngay cả khi user chưa tự tay soạn, và user thấy trước nội dung sẽ gửi (vẫn
// sửa được — gõ đè vào ô mẫu như bình thường). state.commentDrafts không persist ra storage nên mỗi
// lần mở panel có thể random ra dòng khác nếu vẫn chưa tự sửa/lên lịch — bài đã lên lịch thì nội
// dung đã chốt cứng trong job (activityUpcoming/dailyFixedSchedules), không bị đổi bởi việc này.
async function autoFillMissingCommentDrafts() {
  const settings = await GF.storage.getSettings();
  const templates = settings.commentTemplates || GF.commentTemplates?.DEFAULT || '';
  if (!templates) return;
  state.comments.forEach((c) => {
    if (!state.commentDrafts[c.id]?.trim()) {
      // Gán nguyên DÒNG mẫu thô (cả cụm spintax {a|b|c|d|e}), KHÔNG spin sẵn thành 1 câu cố định —
      // giữ nguyên `{...}` để resolveJobComment() (background.js) tự spin MỚI mỗi lần chạy thật.
      // Trước đây dùng resolve() spin ngay lúc gán → mất hết 5 lựa chọn, bài lặp lại hàng ngày sẽ
      // luôn gửi y hệt 1 câu mãi mãi thay vì random lại mỗi lần.
      const picked = GF.commentTemplates.pickLine(templates);
      if (picked) state.commentDrafts[c.id] = picked;
    }
  });
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

async function loadComments({ force = false } = {}) {
  await loadPostedPostsForComment({ force });
  if (!state.comments.length) {
    const box = $('#commentList');
    if (box) box.innerHTML = emptyState('💬', 'Chưa có bài đã đăng — đăng bài qua GroupFlow trước');
  } else {
    renderComments();
  }
}

function defaultScheduleWhenValue(minutesFromNow = 30) {
  const t = new Date(Date.now() + minutesFromNow * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

// Khung lên lịch giãn cách dùng chung cho Tạo bài + Comment: chọn giờ bắt đầu cho mục đầu tiên +
// giãn cách (giá trị + đơn vị) — mục thứ i được gán start + i*gap. Bật "Lặp lại hàng ngày" thì
// không đặt alarm 1 lần mà ghi vào dailyFixedSchedules với timeOfDay = giờ:phút đã tính cho mục
// đó — chạy lại đúng giờ này mỗi ngày (background.js tickDailyFixedSchedules()), không còn kiểu
// "khung giờ ngẫu nhiên" cũ.
const STAGGER_UNIT_MS = { minute: 60 * 1000, hour: 60 * 60 * 1000, day: 24 * 60 * 60 * 1000 };
const STAGGER_UNIT_DEFAULT = { minute: 15, hour: 1, day: 1 };

function staggerGapMs(value, unit) {
  return Math.max(0, Number(value) || 0) * (STAGGER_UNIT_MS[unit] || STAGGER_UNIT_MS.minute);
}

// 2026-07-13 — Tony: giãn cách TUYỆT ĐỐI CỐ ĐỊNH (start + i*gap, y hệt nhau giữa mọi cặp bài
// liên tiếp) là 1 kiểu vân tay dễ bị Facebook nhận ra là bot — người thật không bao giờ đăng bài
// cách nhau đúng y 1 khoảng thời gian lặp lại nhiều lần. Random hoá KHOẢNG CÁCH GIỮA MỖI CẶP bài
// liên tiếp (không random tuyệt đối theo index, để tránh 2 bài bị đảo thứ tự) — mỗi lượt nhân
// gapMs với 1 hệ số ngẫu nhiên 0.7–1.3 lần rồi cộng dồn từ mốc bắt đầu: giữ đúng tốc độ đăng
// TRUNG BÌNH mà user chọn (vd "15 phút/bài") nhưng không còn khoảng cách y hệt nhau. Mốc đầu tiên
// (index 0) giữ nguyên đúng giờ user chọn — không jitter, vì đó là lựa chọn tường minh. gapMs=0
// (user chủ đích đăng dồn cùng lúc) thì giữ nguyên 0, không tự thêm giãn cách.
function computeStaggeredWhens(startWhen, gapMs, count) {
  const whens = [startWhen];
  for (let i = 1; i < count; i += 1) {
    // Dùng lại GF.scheduler.randBetween() (đã load sẵn cho sidepanel qua modules/scheduler.js,
    // cùng helper mà scheduleCommentJobsOnce() dùng cho betweenComments) thay vì tự viết công thức
    // random riêng — cùng 1 kiểu random cho toàn bộ sidepanel.
    const jitter = gapMs > 0 ? GF.scheduler.randBetween([Math.round(gapMs * 0.7), Math.round(gapMs * 1.3)]) : 0;
    whens.push(whens[i - 1] + jitter);
  }
  return whens;
}

function gapUnitLabel(unit) {
  return unit === 'hour' ? 'giờ' : unit === 'day' ? 'ngày' : 'phút';
}

// Đổi đơn vị (phút/giờ/ngày) thì luôn reset ô số về mặc định của đơn vị đó (15/1/1) — đổi từ
// phút sang ngày mà giữ nguyên số cũ (vd "10") rất dễ thành "10 ngày" ngoài ý muốn.
function bindGapUnitDefaultReset(unitSelector, valueSelector) {
  const unitEl = $(unitSelector);
  const valueEl = $(valueSelector);
  if (!unitEl || !valueEl) return;
  unitEl.addEventListener('change', () => {
    valueEl.value = String(STAGGER_UNIT_DEFAULT[unitEl.value] ?? 15);
  });
}

function timeOfDayHHMM(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Tránh đêm (22:00–06:59) — áp dụng CỨNG cho mọi lịch tính toán tự động (giãn cách, auto-lịch),
// không hỏi confirm như trước nữa: rơi vào khung này thì tự dời sang 07:00 — cùng ngày nếu đang
// trước 07:00 (vd 02:00 → 07:00 hôm đó), hoặc 07:00 hôm sau nếu đã qua 22:00.
function avoidNightTime(ms) {
  const d = new Date(ms);
  const h = d.getHours();
  if (h >= 22) {
    d.setDate(d.getDate() + 1);
    d.setHours(7, 0, 0, 0);
    return d.getTime();
  }
  if (h < 7) {
    d.setHours(7, 0, 0, 0);
    return d.getTime();
  }
  return ms;
}

// Bản rút gọn cho lịch lặp lại hàng ngày (chỉ có giờ:phút, không gắn ngày cụ thể).
function avoidNightHHMM(hhmm) {
  const h = Number(hhmm.split(':')[0]);
  return (h >= 22 || h < 7) ? '07:00' : hhmm;
}

async function addDailyFixedSchedules(entries) {
  if (!entries?.length) return;
  const d = await chrome.storage.local.get('dailyFixedSchedules');
  const list = d.dailyFixedSchedules || [];
  list.push(...entries);
  await chrome.storage.local.set({ dailyFixedSchedules: list });
  await refreshScheduleTags();
}

// Lịch lặp lại hàng ngày (post lẫn comment) không còn list riêng nữa — hiện ngay trên tag của
// từng bài trong danh sách tương ứng (postScheduleTagHtml / commentScheduleTagHtml), kèm nút Hủy
// ngay trên tag/panel sửa lịch của đúng bài đó (cancelPostDailySchedule / cancelCommentSchedule).
// Hàm này đồng bộ lại cả 2 map sau khi thêm/hủy 1 lịch lặp lại, dùng chung cho cả 2 tab.
async function refreshScheduleTags() {
  state.postScheduleMap = await loadPostScheduleMap();
  state.commentScheduleMap = await loadCommentScheduleMap();
  renderPosts();
  renderComments();
}

async function cancelDailyFixedSchedule(id) {
  const d = await chrome.storage.local.get('dailyFixedSchedules');
  const list = (d.dailyFixedSchedules || []).filter((s) => s.id !== id);
  await chrome.storage.local.set({ dailyFixedSchedules: list });
  await refreshScheduleTags();
}

// Format giống postScheduleTagHtml (ngay_dang + gio_dang) để tag lịch ở Comment và Tạo bài nhìn
// nhất quán: "HH:mm dd/mm/yyyy" (định dạng ngày giờ Việt Nam — Tony yêu cầu, trước đây là
// "YYYY-MM-DD HH:mm" dễ đọc nhầm ngày/tháng).
function formatScheduleWhen(ms) {
  const t = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(t.getHours())}:${pad(t.getMinutes())} ${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}`;
}

// Cùng epoch `ms` như formatScheduleWhen() (tag hiển thị) nhưng ra định dạng cho input
// datetime-local ("T" thay vì khoảng trắng) — dùng để đổ đúng GIỜ THẬT đang có vào panel sửa lịch,
// xem chú thích ở renderComments().
function scheduleWhenInputValue(ms) {
  const t = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

function commentScheduleTagHtml(c) {
  const info = state.commentScheduleMap[c.id];
  if (!info) {
    return `<button type="button" class="tag tag-schedule tag-clickable tag-pending" data-toggle-comment-schedule="${escAttr(c.id)}" title="Lên lịch comment">+ Lên lịch</button>`;
  }
  const label = info.type === 'once'
    ? `🕒 ${formatScheduleWhen(info.when)}`
    : `🔁 ${info.timeOfDay} hàng ngày`;
  return `<button type="button" class="tag tag-schedule tag-clickable" data-toggle-comment-schedule="${escAttr(c.id)}" title="Bấm sửa lịch">${esc(label)}</button>`;
}

function commentTemplateTagHtml(c, draft) {
  return draft
    ? `<button type="button" class="tag ready tag-clickable" data-toggle-comment-editor="${escAttr(c.id)}" title="Bấm sửa mẫu bình luận">📝 Có mẫu bình luận</button>`
    : `<button type="button" class="tag pending tag-clickable" data-toggle-comment-editor="${escAttr(c.id)}" title="Nhập mẫu bình luận">+ Nhập mẫu bình luận</button>`;
}

// v1.0.202 — Tony chốt tách hẳn Comment thành 2 tab con: "Của tôi" (bài chính mình) / "Đồng đội"
// (bài người khác, comment chéo) — thay vì gộp chung + filter "Người: Tất cả/Của tôi/tên" như
// trước. Sub-tab quyết định NGUỒN (state.commentSubTab, xem bindCommentSubTabs()); filter "Người"
// giờ chỉ còn ý nghĩa trong tab Đồng đội (thu hẹp xuống 1 đồng đội cụ thể), tab Của tôi không có
// filter này nữa (ẩn hẳn control, xem #commentPersonFilterWrap). 3 filter còn lại (Mẫu bình luận/
// Lịch/Bình luận) áp dụng chung cho cả 2 tab.
function getFilteredComments() {
  let list = state.comments.filter((c) => (
    state.commentSubTab === 'team' ? c._source === 'cross' : c._source !== 'cross'
  ));
  const person = state.commentFilterPerson || 'all';
  if (state.commentSubTab === 'team' && person.startsWith('user:')) {
    const name = person.slice(5);
    list = list.filter((c) => c._userLabel === name);
  }
  const tpl = state.commentFilterTemplate || 'all';
  if (tpl === 'has') list = list.filter((c) => (state.commentDrafts[c.id] || '').trim());
  else if (tpl === 'none') list = list.filter((c) => !(state.commentDrafts[c.id] || '').trim());
  const sch = state.commentFilterSchedule || 'all';
  if (sch === 'has') list = list.filter((c) => Boolean(state.commentScheduleMap[c.id]));
  else if (sch === 'none') list = list.filter((c) => !state.commentScheduleMap[c.id]);
  const status = state.commentFilterStatus || 'all';
  if (status === 'done') list = list.filter((c) => isCommentDone(c));
  else if (status === 'pending') list = list.filter((c) => !isCommentDone(c));
  const cat = state.commentFilterCategory || 'all';
  if (cat === 'none') list = list.filter((c) => !itemCategoryIds(c).length);
  else if (cat !== 'all') list = list.filter((c) => itemCategoryIds(c).includes(String(cat)));
  // v1.0.291 — Tony đổi thiết kế: tab "Của tôi" hiện TẤT CẢ bài (kể cả chưa check/chờ duyệt —
  // trước đây lọc isCommentActionable giấu sạch, sau wipe cache list trống trơn không biết bài
  // đâu), lọc theo trạng thái duyệt bằng 3 chip stats (Đã duyệt/Chưa duyệt/Chưa check — bấm để
  // lọc, bấm lại bỏ lọc). Tab Đồng đội giữ luật cũ: chỉ bài chủ đã confirm OK.
  if (state.commentSubTab === 'team') {
    list = list.filter(isCommentActionable);
  } else {
    const ap = state.commentFilterApproval || 'all';
    if (ap === 'ok') list = list.filter((c) => ownPostApprovalState(c) === 'ok');
    else if (ap === 'pending') list = list.filter((c) => ['pending', 'deleted'].includes(ownPostApprovalState(c)));
    else if (ap === 'unchecked') list = list.filter((c) => ownPostApprovalState(c) === 'unchecked');
  }
  return list;
}

// v1.0.277 — "chữ ký" tập bài đang hiển thị (id + trạng thái access + đã-comment). Dùng để BỎ QUA
// vẽ lại list khi cache access đổi nhưng tập bài hiện ra KHÔNG đổi (Tony: "chỉ đổi thông số, đừng
// vẽ lại nguyên panel") — tránh reset cuộn trang / con trỏ đang gõ. Chỉ vẽ lại khi có bài mới
// vào/rớt khỏi list (getFilteredComments đã lọc isCommentActionable) hoặc đổi tag trạng thái.
function commentRenderSigFrom(filtered) {
  return (filtered || []).map((c) => {
    const g = (c.postedGroups || [])[0];
    const entry = g ? state.postAccessCache[String(g.post_id)] : null;
    return `${c.id}:${entry?.kind || '-'}:${isCommentDone(c) ? 'd' : ''}`;
  }).join('|');
}
let lastCommentRenderSig = null;

function commentSubTabHasPersonFilter() {
  return state.commentSubTab === 'team';
}

// Chuyển tab con "Của tôi"/"Đồng đội" — ẩn/hiện control "Người" (chỉ có ý nghĩa ở tab Đồng đội) và
// render lại danh sách theo đúng nguồn đã chọn.
function setCommentSubTab(sub) {
  state.commentSubTab = sub === 'team' ? 'team' : 'mine';
  $$('.comment-sub-tabs [data-comment-sub]').forEach((b) => {
    b.classList.toggle('active', b.dataset.commentSub === state.commentSubTab);
  });
  $('#commentPersonFilterWrap')?.classList.toggle('hidden', !commentSubTabHasPersonFilter());
  // v1.0.291b — ô lọc "Duyệt:" + nút 🔍 Check chỉ có nghĩa với bài CỦA MÌNH — ẩn ở tab Đồng đội.
  $('#commentApprovalFilterWrap')?.classList.toggle('hidden', state.commentSubTab === 'team');
  $('#btnCheckNow')?.classList.toggle('hidden', state.commentSubTab === 'team');
  state.commentsPage = 0;
  renderComments();
}

function bindCommentSubTabs() {
  $$('.comment-sub-tabs [data-comment-sub]').forEach((btn) => {
    btn.addEventListener('click', () => setCommentSubTab(btn.dataset.commentSub));
  });
  $('#commentPersonFilterWrap')?.classList.toggle('hidden', !commentSubTabHasPersonFilter());
  $('#commentApprovalFilterWrap')?.classList.toggle('hidden', state.commentSubTab === 'team');
  $('#btnCheckNow')?.classList.toggle('hidden', state.commentSubTab === 'team');
}

// Danh sách tên đồng đội (kèm số bài đang có trong danh sách đã tải) cho filter "Người" ở tab Đồng
// đội — gõ được để lọc gợi ý (input + datalist, xem resolveCommentFilterPersonInput()). Không còn
// pseudo-option "Tất cả"/"Của tôi" như bản trước v1.0.202 — 2 khái niệm đó giờ là 2 tab con riêng,
// để trống ô input = xem hết đồng đội (mặc định), không cần chọn "Tất cả" nữa.
function populateCommentFilterPersonOptions() {
  const input = $('#commentFilterPerson');
  const list = $('#commentFilterPersonList');
  if (!input || !list) return;
  // Bug thật đã báo cáo: số "(N)" đếm từ TOÀN BỘ state.comments đồng bộ về, không áp `isCommentActionable()`
  // — hiện số bài SAI (gồm cả bài chưa check xong quyền comment), trong khi danh sách thật (render
  // qua getFilteredComments(), luôn lọc isCommentActionable()) chỉ hiện đúng bài đã confirm được. Áp
  // đúng cùng điều kiện ở đây để số đếm khớp với những gì thực sự hiện ra khi lọc theo người đó.
  const counts = new Map();
  state.comments.forEach((c) => {
    if (c._source === 'cross' && c._userLabel && isCommentActionable(c)) {
      counts.set(c._userLabel, (counts.get(c._userLabel) || 0) + 1);
    }
  });
  const sortedNames = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  state.commentPersonOptions = sortedNames.map((n) => ({ value: `user:${n}`, label: `${n} (${counts.get(n)})`, name: n }));
  list.innerHTML = state.commentPersonOptions.map((o) => `<option value="${escAttr(o.label)}"></option>`).join('');
  const validValues = new Set(['all', ...state.commentPersonOptions.map((o) => o.value)]);
  if (!validValues.has(state.commentFilterPerson || 'all')) state.commentFilterPerson = 'all';
  const active = state.commentPersonOptions.find((o) => o.value === state.commentFilterPerson);
  input.value = active ? active.label : '';
}

// 2026-07-13 — Tony yêu cầu: thống kê tổng số bài "Của tôi"/"Đồng đội" ngay trên 2 nút tab con,
// khớp đúng con số list thật sẽ hiện ra (cùng điều kiện isCommentActionable() với getFilteredComments()
// — gồm CẢ bài đã comment rồi, vì giờ danh sách không còn ẩn bài đã comment nữa, xem cross-posts
// backend). Giúp so sánh nhanh "tao có X bài" giữa các máy mà không cần đếm tay từng dòng.
function updateCommentSubTabCounts() {
  const mineEl = $('#commentSubMineCount');
  const teamEl = $('#commentSubTeamCount');
  if (!mineEl && !teamEl) return;
  let mine = 0;
  let team = 0;
  state.comments.forEach((c) => {
    // v1.0.291 — "Của tôi" giờ hiện TẤT CẢ bài (kể cả chưa check/chờ duyệt) nên đếm hết cho khớp
    // list; "Đồng đội" giữ luật cũ (chỉ bài chủ confirm OK — isCommentActionable).
    if (c._source === 'cross') {
      if (isCommentActionable(c)) team += 1;
    } else {
      mine += 1;
    }
  });
  if (mineEl) mineEl.textContent = mine ? `(${mine})` : '';
  if (teamEl) teamEl.textContent = team ? `(${team})` : '';
}

// v1.0.291b — Tony chốt lần 2: stats duyệt chuyển hẳn vào ô select "Duyệt:" trong thanh lọc của
// tab Của tôi (bỏ hàng chip riêng phía trên sub-tabs — trạng thái duyệt chỉ có nghĩa với bài của
// mình, nằm ngoài cả tab Đồng đội là sai chỗ). Hàm này đổ SỐ ĐẾM vào nhãn từng option
// (VD "⏳ Chưa duyệt (3)") — gọi lại mỗi khi cache check/list đổi. Đếm theo ownPostApprovalState()
// (some-ok thắng, giống filter/tag trên card — 'deleted' gộp vào nhóm Chưa duyệt).
function updateCommentApprovalStats() {
  const sel = $('#commentFilterApproval');
  if (!sel) return;
  let approved = 0;
  let pending = 0;
  let unchecked = 0;
  state.comments.forEach((c) => {
    if (c._source === 'cross') return;
    const st = ownPostApprovalState(c);
    if (st === 'ok') approved += 1;
    else if (st === 'pending' || st === 'deleted') pending += 1;
    else unchecked += 1;
  });
  const setLabel = (val, label) => {
    const opt = sel.querySelector(`option[value="${val}"]`);
    if (opt) opt.textContent = label;
  };
  setLabel('all', `Duyệt: Tất cả (${approved + pending + unchecked})`);
  setLabel('ok', `✓ Đã duyệt (${approved})`);
  setLabel('pending', `⏳ Chưa duyệt (${pending})`);
  setLabel('unchecked', `❔ Chưa check (${unchecked})`);
  sel.value = state.commentFilterApproval || 'all';
}

async function forceCheckPendingPost(btn) {
  if (btn.disabled) return;
  const postId = btn.dataset.forceCheck;
  const groupId = btn.dataset.forceCheckGroup;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Đang check…';
  try {
    // Check bằng tab thật — mất ~5-30s (mở tab nền + poll banner, xem checkPostCommentableViaTab)
    const res = await gfSendMessage({ type: 'GF_FORCE_CHECK_POST', data: { groupId, postId } });
    if (!res?.ok) throw new Error(res?.error || 'Check thất bại');
    const d = await chrome.storage.local.get('gf_post_access_cache');
    state.postAccessCache = d.gf_post_access_cache || {};
    const kind = res.entry?.kind;
    if (kind === 'ok') {
      showToast('✅ Bài đã được duyệt — đã báo server, đồng đội sẽ thấy để comment', 'success', 5000);
    } else if (kind === 'deleted') {
      showToast('✕ Bài đã bị xóa hoặc ẩn', 'warn', 5000);
    } else {
      showToast('⏳ Bài vẫn đang chờ duyệt', 'info', 4000);
    }
    updateCommentApprovalStats();
    renderComments();
    updateCommentSubTabCounts();
  } catch (e) {
    showToast(`Check thất bại: ${e.message}`, 'error', 5000);
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

// Gõ tự do vào input — khớp chính xác (không phân biệt hoa/thường) thì áp filter ngay; khớp DUY
// NHẤT 1 người theo chuỗi con (đang gõ dở) cũng áp luôn cho mượt; để trống = xem hết đồng đội; các
// trường hợp mơ hồ khác (gõ dở, chưa rõ ai) — giữ nguyên filter đang áp, không tự ý đổi bộ lọc.
function resolveCommentFilterPersonInput(raw) {
  const q = (raw || '').trim().toLowerCase();
  const options = state.commentPersonOptions || [];
  if (!q) return 'all';
  const exact = options.find((o) => o.label.toLowerCase() === q);
  if (exact) return exact.value;
  const matches = options.filter((o) => o.name.toLowerCase().includes(q));
  if (matches.length === 1) return matches[0].value;
  return null;
}

function bindCommentFilters() {
  $('#commentFilterPerson')?.addEventListener('input', (e) => {
    const resolved = resolveCommentFilterPersonInput(e.target.value);
    if (resolved === null) return;
    state.commentFilterPerson = resolved;
    state.commentsPage = 0;
    renderComments();
  });
  // v1.0.291b — ô "Duyệt:" trong thanh lọc (chỉ hiện ở tab Của tôi — xem setCommentSubTab).
  $('#commentFilterApproval')?.addEventListener('change', (e) => {
    state.commentFilterApproval = e.target.value;
    state.commentsPage = 0;
    renderComments();
  });
  $('#commentFilterTemplate')?.addEventListener('change', (e) => {
    state.commentFilterTemplate = e.target.value;
    state.commentsPage = 0;
    renderComments();
  });
  $('#commentFilterSchedule')?.addEventListener('change', (e) => {
    state.commentFilterSchedule = e.target.value;
    state.commentsPage = 0;
    renderComments();
  });
  $('#commentFilterStatus')?.addEventListener('change', (e) => {
    state.commentFilterStatus = e.target.value;
    state.commentsPage = 0;
    renderComments();
  });
}

function renderComments() {
  const box = $('#commentList');
  const filtered = getFilteredComments();
  // Lưu chữ ký của đúng những gì sắp vẽ — path check nền so lại để quyết định có cần vẽ lại không.
  lastCommentRenderSig = commentRenderSigFrom(filtered);
  if (!filtered.length) {
    // So với state.comments.length (tổng cả 2 tab) thay vì chỉ trong tab hiện tại — tab "Của tôi"
    // rỗng trong khi tab "Đồng đội" có bài (hay ngược lại) trước đây báo nhầm "Không có bài khớp bộ
    // lọc" (ngụ ý có bài nhưng bị ẩn), đúng ra phải là "chưa có bài" cho đúng tab đang xem.
    const subTabHasAny = state.comments.some((c) => (
      state.commentSubTab === 'team' ? c._source === 'cross' : c._source !== 'cross'
    ));
    box.innerHTML = emptyState('💬', subTabHasAny
      ? 'Không có bài khớp bộ lọc'
      : (state.commentSubTab === 'team' ? 'Chưa có bài của đồng đội để comment chéo' : 'Chưa có bài đã đăng — đăng bài qua GroupFlow trước'));
    return;
  }
  const rawTemplates = ($('#commentTemplates')?.value?.trim() || GF.commentTemplates?.DEFAULT || '').split('\n').filter((s) => s.trim());
  const tplOptions = rawTemplates.length
    ? `<option value="">📋 Chọn mẫu…</option>${rawTemplates.map((t) => `<option value="${escAttr(t)}">${esc(t.slice(0, 55))}</option>`).join('')}`
    : '';
  const { pageItems, page, totalPages } = paginateList(filtered, state.commentsPage);
  state.commentsPage = page;
  const defaultWhen = defaultScheduleWhenValue();

  box.innerHTML = pageItems.map((c) => {
    const draft = state.commentDrafts[c.id] || '';
    const validGroups = (c.postedGroups || []).filter((g) => g.post_id && /^\d+$/.test(String(g.post_id)));
    const groupInfo = validGroups.length === 1
      ? esc(validGroups[0].group_name || validGroups[0].group_id)
      : `${validGroups.length} nhóm`;
    const primaryUrl = validGroups.length ? buildPostedGroupUrl(validGroups[0]) : null;
    const groupLinks = validGroups.length > 1
      ? validGroups.map((g) => {
        const url = buildPostedGroupUrl(g);
        return url
          ? ` <a href="${escAttr(url)}" target="_blank" rel="noopener noreferrer" class="comment-post-link" title="Mở bài «${escAttr(g.group_name || g.group_id)}» trên Facebook">↗ ${esc((g.group_name || g.group_id).toString().slice(0, 14))}</a>`
          : '';
      }).join('')
      : '';
    // v1.0.198 — Tony tưởng đây là 1 phần của lịch lặp lại hàng ngày (nằm ngay cạnh tag "🔁 …
    // hàng ngày" nên nhìn như "chạy xong tự sửa lại lịch") — thật ra đây chỉ là NGÀY BÀI GỐC được
    // đăng lên Facebook (c.lastPostedAt), cố định từ lúc đăng bài, không đổi theo lịch comment.
    // Đổi format cho gọn (dùng chung formatScheduleWhen() — "YYYY-MM-DD HH:MM", bỏ giây) + thêm
    // tiền tố/tooltip để tách rõ khỏi tag lịch ngay cạnh nó.
    const postedAt = c.lastPostedAt ? formatScheduleWhen(new Date(c.lastPostedAt).getTime()) : '';
    // 2026-07-15 — Tony: tên tác giả phải rõ trên từng bài + "nếu biết link fb theo tên bấm vào
    // thì tốt" — có FB uid (server trả user_fb_id, có thể null với bài cũ) thì tag thành link mở
    // thẳng profile Facebook của tác giả.
    const crossLabel = c._source === 'cross'
      ? (c._userFbId
        ? `<a class="tag web" href="https://www.facebook.com/${escAttr(c._userFbId)}" target="_blank" rel="noopener noreferrer" title="Mở trang Facebook của ${escAttr(c._userLabel || '')}">👤 ${esc(c._userLabel || 'cross')}</a>`
        : `<span class="tag web" title="Tác giả bài">👤 ${esc(c._userLabel || 'cross')}</span>`)
      : '';
    // v1.0.291 — tag trạng thái duyệt cho bài CỦA MÌNH (list giờ hiện tất cả bài): bài OK không
    // tag gì (trạng thái "bình thường" — đúng ý Tony bỏ tag thừa từ v1.0.224); chưa-OK thì tag rõ
    // + nút 🔄 Check trên card. Bài pending còn hiện thêm số lần đã check / đã ngừng auto-check.
    const approvalState = c._source === 'cross' ? 'ok' : ownPostApprovalState(c);
    const firstEntry = validGroups.length ? state.postAccessCache[String(validGroups[0].post_id)] : null;
    const gaveUpLabel = approvalState === 'pending' && isPostAccessGaveUp(firstEntry)
      ? ' · ngừng check tự động' : '';
    const approvalTag = c._source === 'cross' ? '' : (
      approvalState === 'pending'
        ? `<span class="tag pending" title="Bài đang chờ admin nhóm duyệt${gaveUpLabel ? ' — đã quá 72h, chỉ còn check tay' : ''}">⏳ Chờ duyệt${firstEntry?.checkCount ? ` (${firstEntry.checkCount} lần check)` : ''}${gaveUpLabel}</span>`
        : approvalState === 'deleted'
          ? '<span class="tag error">✕ Đã xóa/ẩn</span>'
          : approvalState === 'unchecked'
            ? '<span class="tag" title="Chưa check — bấm 🔄 Check trên card hoặc nút 🔍 Check chung">❔ Chưa check</span>'
            : '');
    // Bài đã comment xong không bị lọc mất khỏi danh sách (dù của mình hay đồng đội) — chỉ gắn tag
    // để biết trạng thái, dùng chung isCommentDone() cho cả 2 nguồn.
    const lastCommentedAt = lastCommentedAtLabel(c);
    const commentedTag = isCommentDone(c)
      ? `<span class="tag ready" title="Lần comment gần nhất">✓ Đã comment${lastCommentedAt ? ` · ${esc(lastCommentedAt)}` : ''}</span>`
      : '';
    const editorOpen = state.commentEditorOpenId === c.id;
    const scheduleOpen = state.commentScheduleOpenId === c.id;
    const scheduleInfo = state.commentScheduleMap[c.id];
    const hasSchedule = Boolean(scheduleInfo);
    // BUG đã sửa: panel sửa lịch trước đây LUÔN đổ "bây giờ + 30 phút" (defaultWhen, tính chung 1
    // lần cho cả trang) vào ô giờ — kể cả khi bài ĐÃ có lịch thật (tag hiện đúng giờ đã đặt, vd
    // "🕒 18:31"), khiến bấm vào sửa lại thấy 1 giờ hoàn toàn khác không liên quan — không phải do
    // giờ lưu sai, mà do form sửa chưa từng đọc lại giờ đã lưu. Giờ ưu tiên đổ đúng giờ hiện có
    // (`scheduleInfo.when`) nếu là lịch 1 lần; lịch lặp hàng ngày thì đổ hôm nay + đúng timeOfDay.
    const editWhen = scheduleInfo?.type === 'once'
      ? scheduleWhenInputValue(scheduleInfo.when)
      : scheduleInfo?.type === 'daily'
        ? `${defaultScheduleWhenValue(0).slice(0, 10)}T${scheduleInfo.timeOfDay}`
        : defaultWhen;

    return `
    <div class="list-item post-card comment-item">
      <div class="check-row post-preview-row">
        <input type="checkbox" data-comment-id="${escAttr(c.id)}" checked />
        <div class="post-preview-main comment-post-preview" ${primaryUrl ? `data-open-comment-post="${escAttr(c.id)}" role="button" tabindex="0" title="Bấm để mở bài trên Facebook"` : ''}>
          <div class="post-body">${esc(c.noi_dung?.slice(0, 160) || '—')}</div>
        </div>
      </div>
      <div class="post-meta">
        ${crossLabel}
        ${commentedTag}
        <span class="tag">${groupInfo}</span>
        ${approvalTag}
        ${commentTemplateTagHtml(c, draft)}
        ${commentScheduleTagHtml(c)}
        ${postedAt ? `<span class="tag" title="Bài gốc đăng lên Facebook lúc này — không đổi theo lịch comment">📌 Đăng ${esc(postedAt)}</span>` : ''}
      </div>
      <div class="row post-actions comment-item-actions">
        <button type="button" class="btn primary sm" data-run-comment="${escAttr(c.id)}" ${c._source !== 'cross' && approvalState !== 'ok' && !isCommentDone(c) ? 'disabled title="Bài chưa xác nhận comment được — bấm 🔄 Check trước"' : ''}>▶ Chạy</button>
        ${c._source !== 'cross' && approvalState !== 'ok' ? `<button type="button" class="btn ghost sm" data-check-post="${escAttr(c.id)}" title="Check ngay bài này (mở tab nền ~5-30s) — OK thì báo server cho đồng đội thấy">🔄 Check</button>` : ''}
        ${primaryUrl ? `<a class="btn ghost sm" href="${escAttr(primaryUrl)}" target="_blank" rel="noopener noreferrer">Mở bài</a>` : ''}
        ${groupLinks}
      </div>
      ${!editorOpen ? '' : `
      <div class="comment-editor-panel">
        <textarea data-draft="${escAttr(c.id)}" rows="2" placeholder="Spintax: {nội dung 1|nội dung 2} — để trống cũng chạy được, tự random mẫu Settings">${esc(draft)}</textarea>
        ${tplOptions ? `<select data-tpl-pick="${escAttr(c.id)}" class="gf-select-sm">${tplOptions}</select>` : ''}
        <button type="button" class="btn primary sm" data-confirm-comment-draft="${escAttr(c.id)}" style="margin-top:8px">✓ Xong</button>
      </div>`}
      ${!scheduleOpen ? '' : `
      <div class="comment-schedule-panel">
        <input type="datetime-local" class="item-schedule-when" value="${escAttr(editWhen)}" />
        <label class="switch-row" style="margin-top:6px">
          <input type="checkbox" class="item-schedule-repeat-daily" ${scheduleInfo?.type === 'daily' ? 'checked' : ''} />
          <span>Lặp lại hàng ngày (đúng giờ này)</span>
        </label>
        <button type="button" class="btn primary sm" data-confirm-item-schedule="${escAttr(c.id)}" style="margin-top:8px">Xác nhận lên lịch</button>
        ${hasSchedule ? `<button type="button" class="btn ghost sm accent" data-cancel-comment-schedule="${escAttr(c.id)}" style="margin-top:8px">🗑 Hủy lịch</button>` : ''}
      </div>`}
    </div>`;
  }).join('') + pagerHtml('comments', page, totalPages);

  bindPagerEvents(box, (key, delta) => {
    if (key === 'comments') { state.commentsPage += delta; renderComments(); }
  });

  box.querySelectorAll('[data-open-comment-post]').forEach((el) => {
    const openIt = () => {
      const c = state.comments.find((x) => x.id === el.dataset.openCommentPost);
      const validGroups = (c?.postedGroups || []).filter((g) => g.post_id && /^\d+$/.test(String(g.post_id)));
      const url = validGroups.length ? buildPostedGroupUrl(validGroups[0]) : null;
      if (url) window.open(url, '_blank', 'noopener');
    };
    el.addEventListener('click', openIt);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openIt(); } });
  });

  box.querySelectorAll('[data-toggle-comment-editor]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleCommentEditor;
      state.commentEditorOpenId = state.commentEditorOpenId === id ? null : id;
      state.commentScheduleOpenId = null;
      renderComments();
    });
  });

  box.querySelectorAll('[data-toggle-comment-schedule]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleCommentSchedule;
      state.commentScheduleOpenId = state.commentScheduleOpenId === id ? null : id;
      state.commentEditorOpenId = null;
      renderComments();
    });
  });

  box.querySelectorAll('[data-confirm-item-schedule]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.confirmItemSchedule;
      const panel = btn.closest('.comment-schedule-panel');
      if (!panel) return;
      const repeatDaily = panel.querySelector('.item-schedule-repeat-daily')?.checked === true;
      await scheduleOneComment(id, panel.querySelector('.item-schedule-when'), repeatDaily);
    });
  });
  box.querySelectorAll('[data-cancel-comment-schedule]').forEach((btn) => {
    btn.addEventListener('click', () => cancelCommentSchedule(btn.dataset.cancelCommentSchedule));
  });

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
  // Textarea/dropdown đã tự lưu vào state.commentDrafts ngay khi gõ/chọn (oninput/onchange ở
  // trên) — nút "✓ Xong" chỉ đóng khung soạn lại để xác nhận rõ ràng cho người dùng, không có gì
  // để lưu thêm.
  box.querySelectorAll('[data-confirm-comment-draft]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.confirmCommentDraft;
      state.commentEditorOpenId = null;
      renderComments();
      showToast(state.commentDrafts[id]?.trim() ? 'Đã lưu mẫu' : 'Đã đóng — chưa nhập mẫu', 'success', 2000);
    });
  });
  box.querySelectorAll('[data-run-comment]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Đang chạy…';
      try {
        await runComment(btn.dataset.runComment);
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
  });

  // v1.0.291 — nút 🔄 Check trên card bài chưa-OK: chọn nhóm đầu tiên chưa có verdict 'ok' rồi
  // đi chung đường forceCheckPendingPost (GF_FORCE_CHECK_POST — force check + báo server).
  box.querySelectorAll('[data-check-post]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = state.comments.find((x) => x.id === btn.dataset.checkPost);
      const groups = (c?.postedGroups || []).filter((g) => g.post_id && /^\d+$/.test(String(g.post_id)));
      const target = groups.find((g) => state.postAccessCache[String(g.post_id)]?.kind !== 'ok') || groups[0];
      if (!target) return alert('Bài chưa có post_id FB hợp lệ');
      btn.dataset.forceCheck = String(target.post_id);
      btn.dataset.forceCheckGroup = String(target.group_id);
      forceCheckPendingPost(btn);
    });
  });
}

async function runComment(id) {
  const c = state.comments.find((x) => x.id === id);
  if (!c) return;
  // v1.0.291 — nút Chạy đã disabled trên card chưa-OK, guard lại đây cho chắc (đường gọi khác).
  if (c._source !== 'cross' && !isCommentDone(c) && ownPostApprovalState(c) !== 'ok') {
    return alert('Bài chưa xác nhận comment được (chưa check/chờ duyệt) — bấm 🔄 Check trên card trước');
  }
  // background.js runComment() không còn chặn "job trùng lặp" nữa ở bất kỳ đường nào (v1.0.194 —
  // đẩy bài lặp lại là mục đích chính đáng) nên bấm vào bài đã "✓ Đã comment" SẼ đăng comment thật
  // lần nữa. Xác nhận lại 1 lần ở đây chỉ để tránh đăng trùng ngoài ý muốn do bấm nhầm tay.
  if (isCommentDone(c) && !window.confirm('Bài này đã comment rồi — vẫn chạy để đẩy bài thêm 1 lần nữa?')) return;
  const settings = await GF.storage.getSettings();
  if (settings.avoidNight !== false && GF.scheduler.isNightBlocked()) {
    if (!window.confirm('Đang trong khung 22:00–07:00. Vẫn comment?')) return;
  }
  const validGroups = (c.postedGroups || []).filter((g) => g.post_id && /^\d+$/.test(String(g.post_id)));
  if (!validGroups.length) return alert('Bài chưa có post_id FB hợp lệ');
  // Chặn nhóm ĐÃ BIẾT CHẮC chưa comment được (cache còn hạn — chờ duyệt/đã xóa), khỏi tốn công mở
  // tab Cổ điển chạy rồi mới fail — nhóm chưa từng check vẫn cho qua bình thường.
  const { ready: readyGroups, blocked: blockedGroups } = splitGroupsByAccess(validGroups);
  if (blockedGroups.length) {
    showToast(`Bỏ qua ${blockedGroups.length} nhóm chưa sẵn sàng — ${blockedGroups[0]._accessReason}`, 'warn', 5000);
  }
  if (!readyGroups.length) return;
  const actorId = state.activeActorId || settings.activeActorId;
  // Gửi draft thô (có thể rỗng/còn spintax) — resolveJobComment() (background.js) tự spin +
  // fallback random mẫu Settings khi trống, không bắt buộc phải nhập mẫu trước khi Chạy nữa.
  const comment = state.commentDrafts[id] || '';
  let okCount = 0;
  let lastError = '';
  for (const g of readyGroups) {
    try {
      const res = await gfSendMessage({
        type: 'GF_RUN_COMMENT',
        payload: {
          post_queue_id: c.id,
          group_id: g.group_id,
          group_name: g.group_name,
          post_id: g.post_id,
          comment,
          crossServerId: c._source === 'cross' ? c._serverId : null,
          // Cùng cặp field tác giả như buildRawJobsForOneComment() — cho Lịch sử ghi bài của ai.
          author_name: c._source === 'cross' ? (c._userLabel || 'Đồng đội') : 'Của tôi',
          author_fb_id: c._source === 'cross' ? (c._userFbId || null) : null,
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
    showToast(`Đã comment ${okCount}/${readyGroups.length} bài`, okCount === readyGroups.length ? 'success' : 'warn');
  } else {
    showToast(`Comment thất bại: ${lastError}`, 'error', 6000);
  }
  // Đồng bộ "đã comment" giờ chạy chung trong background.js runComment() (đọc job.crossServerId
  // ở trên) — không gọi riêng ở đây nữa để tránh PATCH /commented 2 lần cho cùng 1 lượt chạy.
  await loadComments();
}

// Không resolve spintax/mẫu ở đây — mẫu không còn bắt buộc nhập trước khi Chạy/Lên lịch nữa, giữ
// nguyên draft thô (có thể rỗng), resolve/spin thật sự diễn ra lúc chạy trong resolveJobComment()
// (background.js) để mẫu random được LẠI mỗi lần chạy thay vì khoá cứng lúc lên lịch.
function buildRawJobsForOneComment(id, { alertOnEmpty = true } = {}) {
  const c = state.comments.find((x) => x.id === id);
  if (!c) return null;
  const validGroups = (c.postedGroups || []).filter((g) => g.post_id && /^\d+$/.test(String(g.post_id)));
  if (!validGroups.length) {
    if (alertOnEmpty) alert('Bài chưa có post_id FB hợp lệ');
    return null;
  }
  // v1.0.291 — Tony chốt: LÊN LỊCH chỉ nhận bài ĐÃ xác nhận comment được. Bài chưa check/chờ duyệt
  // giờ HIỆN trong list (thiết kế hiện-tất-cả) nhưng bị bỏ qua khi lên lịch — check tay bằng nút
  // 🔄 Check trên card rồi mới lên lịch. (Đảo luật cũ "nhóm chưa từng check vẫn cho lên lịch, job
  // tự check lúc chạy" — luật đó hợp với thiết kế giấu-bài, không hợp khi bài chưa check lộ ra.)
  if (c._source !== 'cross' && !isCommentDone(c) && ownPostApprovalState(c) !== 'ok') {
    if (alertOnEmpty) alert('Bài chưa xác nhận comment được (chưa check/chờ duyệt) — bấm 🔄 Check trên card trước');
    return null;
  }
  const { ready: readyGroups, blocked: blockedGroups } = splitGroupsByAccess(validGroups);
  if (!readyGroups.length) {
    if (alertOnEmpty) alert(`Bài chưa sẵn sàng để lên lịch — ${blockedGroups[0]?._accessReason || 'chưa thể comment'}`);
    return null;
  }
  return readyGroups.map((g) => ({
    post_queue_id: c.id,
    group_id: g.group_id,
    group_name: g.group_name,
    post_id: g.post_id,
    comment: state.commentDrafts[id] || '',
    crossServerId: c._source === 'cross' ? c._serverId : null,
    // 2026-07-15 — mang theo tác giả bài để Lịch sử (appendHistory, background.js) ghi rõ comment
    // này chạy vào bài CỦA AI + link FB (bài của mình ghi "Của tôi" cho đồng nhất cột tác giả).
    author_name: c._source === 'cross' ? (c._userLabel || 'Đồng đội') : 'Của tôi',
    author_fb_id: c._source === 'cross' ? (c._userFbId || null) : null,
    label: (c.noi_dung || g.group_name || 'Comment').slice(0, 60),
  }));
}

// Gom job theo TỪNG bài đã tick (giữ nguyên nhóm của cùng 1 bài đi chung 1 phần tử) — dùng cho
// giãn cách hàng loạt, mỗi bài (không phải mỗi nhóm) được gán 1 mốc thời gian riêng.
function collectSelectedCommentJobGroups() {
  const ids = [...document.querySelectorAll('[data-comment-id]:checked')].map((el) => el.dataset.commentId);
  const groups = [];
  let skipped = 0;
  for (const id of ids) {
    const jobs = buildRawJobsForOneComment(id, { alertOnEmpty: false });
    if (jobs?.length) groups.push(jobs);
    else skipped += 1;
  }
  return { groups, skipped };
}

// Đăng ký alarm gf_cmt_* cho từng job trong 1 bài (nhiều nhóm), bắt đầu từ startWhen, giãn cách
// TỰ ĐỘNG (theo Settings) chỉ giữa các NHÓM của cùng 1 bài — giãn cách GIỮA CÁC BÀI khác nhau do
// caller tự tính qua computeStaggerTimes() rồi gọi hàm này riêng cho từng bài. Mỗi mốc tính ra đều
// qua avoidNightTime() — rơi vào 22:00–07:00 thì tự dời, không đăng comment ban đêm.
async function scheduleCommentJobsOnce(jobs, startWhen) {
  const settings = await GF.storage.getSettings();
  const delays = await GF.scheduler.getDelays(settings.securityLevel);
  const upcoming = (await chrome.storage.local.get('activityUpcoming')).activityUpcoming || [];
  let cursor = avoidNightTime(startWhen);
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
      cursor = avoidNightTime(cursor + GF.scheduler.randBetween(delays.betweenComments) * 1000);
    }
  }

  await chrome.storage.local.set({ activityUpcoming: upcoming });
}

function toggleCommentSchedulePanel() {
  const panel = $('#commentStaggerPanel');
  if (!panel) return;
  const willShow = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (willShow) {
    const startEl = $('#commentScheduleStart');
    if (startEl && !startEl.value) startEl.value = defaultScheduleWhenValue(5);
  }
}

// Bulk "Lên lịch đã chọn" — giờ bắt đầu + giãn cách (giá trị + đơn vị phút/giờ/ngày) do user tự
// chọn thay vì random theo Settings; mỗi bài đã tick được gán 1 mốc riêng = start + i*gap. Bật
// "Lặp lại hàng ngày" thì KHÔNG đặt alarm 1 lần — ghi vào dailyFixedSchedules với timeOfDay lấy
// từ mốc đã tính, chạy lại đúng giờ đó mỗi ngày (background.js tickDailyFixedSchedules()).
async function scheduleSelectedComments() {
  const { groups: itemJobGroups, skipped } = collectSelectedCommentJobGroups();
  if (!itemJobGroups.length) {
    return alert(skipped
      ? `Cả ${skipped} bài đã chọn đều chưa sẵn sàng (chưa check/chờ duyệt/đã xóa) — bấm 🔄 Check trên card trước`
      : 'Chọn ít nhất một bài có post_id hợp lệ');
  }
  // v1.0.291 — báo rõ số bài bị bỏ qua (chưa check/chờ duyệt) thay vì lên lịch im lặng thiếu bài.
  if (skipped > 0) {
    showToast(`Bỏ qua ${skipped} bài chưa xác nhận comment được (chưa check/chờ duyệt)`, 'warn', 5000);
  }
  const input = $('#commentScheduleStart')?.value;
  if (!input) return alert('Chọn ngày giờ bắt đầu ở trên');
  const startWhen = new Date(input).getTime();
  if (!Number.isFinite(startWhen) || startWhen < Date.now()) {
    return alert('Chọn thời điểm trong tương lai');
  }
  const gapValue = Number($('#commentScheduleGapValue')?.value) || 0;
  const gapUnit = $('#commentScheduleGapUnit')?.value || 'minute';
  const gapMs = staggerGapMs(gapValue, gapUnit);
  const repeatDaily = $('#commentScheduleRepeatDaily')?.checked === true;
  const confirmMsg = repeatDaily
    ? `Lặp lại hàng ngày ${itemJobGroups.length} bài, cách nhau ${gapValue} ${gapUnitLabel(gapUnit)}?`
    : `Lên lịch ${itemJobGroups.length} bài, cách nhau ${gapValue} ${gapUnitLabel(gapUnit)}?`;
  if (!window.confirm(confirmMsg)) return;

  const whens = computeStaggeredWhens(startWhen, gapMs, itemJobGroups.length);

  if (repeatDaily) {
    const settings = await GF.storage.getSettings();
    const actorId = state.activeActorId || settings.activeActorId;
    const now = Date.now();
    const entries = [];
    itemJobGroups.forEach((jobs, i) => {
      const timeOfDay = avoidNightHHMM(timeOfDayHHMM(whens[i]));
      jobs.forEach((job, gi) => {
        entries.push({
          id: `dfs_${now}_${i}_${gi}_${Math.random().toString(36).slice(2, 6)}`,
          kind: 'comment',
          timeOfDay,
          payload: { ...job, actorId },
          label: `Comment → ${job.label}`,
          lastRunDate: null,
          createdAt: now,
        });
      });
    });
    await addDailyFixedSchedules(entries);
  } else {
    for (let i = 0; i < itemJobGroups.length; i += 1) {
      await scheduleCommentJobsOnce(itemJobGroups[i], whens[i]);
    }
  }
  $('#commentStaggerPanel')?.classList.add('hidden');
  const skippedNote = skipped ? ` (bỏ qua ${skipped} bài chưa sẵn sàng)` : '';
  showToast(`Đã ${repeatDaily ? 'đặt lặp lại hàng ngày' : 'lên lịch'} ${itemJobGroups.length} bài${skippedNote}`, 'success');
  await loadComments();
  await refreshActivityFromStorage();
}

// Lên lịch riêng 1 bài (nút "🕒 Lên lịch" trên từng dòng Comment) — 1 lần cụ thể hoặc lặp lại
// hàng ngày đúng giờ đã chọn, không có khái niệm giãn cách (chỉ 1 bài).
async function scheduleOneComment(id, whenInput, repeatDaily) {
  const jobs = buildRawJobsForOneComment(id);
  if (!jobs) return;
  const input = whenInput?.value;
  if (!input) return alert('Chọn ngày giờ');
  const when = new Date(input).getTime();
  if (!Number.isFinite(when) || when < Date.now()) return alert('Chọn thời điểm trong tương lai');
  if (repeatDaily) {
    const timeOfDay = avoidNightHHMM(timeOfDayHHMM(when));
    if (!window.confirm(`Lặp lại hàng ngày comment bài này lúc ${timeOfDay}?`)) return;
    const settings = await GF.storage.getSettings();
    const actorId = state.activeActorId || settings.activeActorId;
    const now = Date.now();
    const entries = jobs.map((job, gi) => ({
      id: `dfs_${now}_${gi}_${Math.random().toString(36).slice(2, 6)}`,
      kind: 'comment',
      timeOfDay,
      payload: { ...job, actorId },
      label: `Comment → ${job.label}`,
      lastRunDate: null,
      createdAt: now,
    }));
    await addDailyFixedSchedules(entries);
    showToast('Đã đặt lặp lại hàng ngày', 'success');
  } else {
    if (!window.confirm(`Lên lịch comment cho bài này (${jobs.length} nhóm)?`)) return;
    await scheduleCommentJobsOnce(jobs, when);
    showToast('Đã lên lịch', 'success');
  }
  state.commentScheduleOpenId = null;
  await loadComments();
  await refreshActivityFromStorage();
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
    return `https://www.facebook.com/groups/${gid}/posts/${String(pid)}/`;
  }
  if (gid) return `https://www.facebook.com/groups/${gid}/`;
  return null;
}

function renderPostedGroupsBlock(p) {
  const groups = p.postedGroups || [];
  if (!groups.length) return '';
  const open = state.postedGroupsOpenIds.has(p.id);
  if (!open) {
    return `
      <button type="button" class="btn ghost sm posted-groups-toggle" data-toggle-posted-groups="${escAttr(p.id)}">
        Bài đã đăng (${groups.length} nhóm) ▾
      </button>
    `;
  }
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
      <div class="posted-groups-head">
        <p class="field-label">Bài đã đăng</p>
        <button type="button" class="btn ghost sm" data-toggle-posted-groups="${escAttr(p.id)}">Thu gọn ▴</button>
      </div>
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

// 2026-07-16 — Tony: "trong menu log tao muốn có tên tác giả". Entry comment ghi từ v1.0.268 đã
// mang sẵn author_name/author_fb_id, nhưng entry CŨ hơn (và entry từ job lên lịch trước v1.0.268 —
// payload đông lạnh không có field) thì không có gì để hiện. Tra ngược theo post_id từ các cache
// đã có sẵn (crossPostsCache = bài đồng đội kèm tên/uid tác giả; postQueue/serverMyPosts = bài của
// mình) — dựng 1 lần mỗi lượt tải Log, render đọc map thay vì quét 3 mảng cho từng dòng.
async function buildActivityAuthorIndex() {
  const d = await chrome.storage.local.get(['crossPostsCache', 'postQueue', 'serverMyPosts']);
  const map = new Map();
  (d.crossPostsCache || []).forEach((cp) => {
    if (cp.post_id) map.set(String(cp.post_id), { name: cp.user_name || cp.user_email || 'Đồng đội', fbId: cp.user_fb_id || null });
  });
  // Bài của mình set SAU để thắng nếu trùng post_id (thực tế không trùng — server không trả bài
  // của chính mình trong cross-posts, chỉ là phòng hờ).
  (d.serverMyPosts || []).forEach((sp) => {
    if (sp.post_id) map.set(String(sp.post_id), { name: 'Của tôi', fbId: null });
  });
  (d.postQueue || []).forEach((p) => {
    (p.postedGroups || []).forEach((g) => {
      if (g.post_id) map.set(String(g.post_id), { name: 'Của tôi', fbId: null });
    });
  });
  return map;
}

async function refreshActivityFromStorage({ preferHistory = false, forceHistorySub = false } = {}) {
  const d = await chrome.storage.local.get(['activityUpcoming', 'activityHistory']);
  const history = d.activityHistory || [];
  const upcoming = d.activityUpcoming || [];
  state.activityAuthorIndex = await buildActivityAuthorIndex();
  renderActivity(upcoming, history);
  updateHistoryBadge(history.length);
  if (forceHistorySub || (preferHistory && history.length > 0)) {
    showActivityHistorySubTab();
  }
}

// v1.0.199 — lịch COMMENT (payload = {group_id, group_name, ...} đơn, không phải mảng groupIds như
// lịch ĐĂNG BÀI) luôn rơi vào formatGroupList(undefined) → hiện "Chưa có nhóm" dù nhóm thật đã có
// sẵn trong payload — chỉ là đọc sai field. Tách riêng nhánh comment, đọc đúng group_name/group_id.
function upcomingGroupLabel(u) {
  if (u.kind === 'comment') return u.payload?.group_name || u.payload?.group_id || 'Chưa có nhóm';
  return formatGroupList(u.groupIds || u.payload?.posts?.[0]?.groupIds);
}

function renderActivity(upcoming, history) {
  state._lastActivityUpcoming = upcoming;
  state._lastActivityHistory = history;
  $('#activityUpcoming').innerHTML = upcoming.length
    ? upcoming.map((u, idx) => {
      const kindLabel = u.kind === 'generate_image' ? 'Xuất ảnh' : u.kind === 'comment' ? 'Comment' : 'Đăng bài';
      return `
    <div class="list-item activity-upcoming">
      <span class="tag ${u.kind === 'generate_image' ? 'pending' : 'ready'}">${kindLabel}</span>
      <strong>${new Date(u.when).toLocaleString()}</strong>
      <div class="post-body">${esc(u.label || u.snippet || u.kind)}</div>
      <div class="hint">${esc(upcomingGroupLabel(u))}</div>
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

  const box = $('#activityHistory');
  if (!history.length) {
    box.innerHTML = emptyState('▤', 'Chưa có lịch sử');
    return;
  }
  const { pageItems, page, totalPages } = paginateList(history, state.historyPage);
  state.historyPage = page;

  box.innerHTML = pageItems.map((h) => {
    const link = buildHistoryPostUrl(h);
    const pending = h.post_id === 'pending' || h.status === 'pending_approval';
    const linkLabel = pending ? 'Mở nhóm (chờ duyệt)' : (h.ok ? 'Mở bài trên FB' : 'Mở nhóm');
    const time = formatHistoryTime(h.at);
    // 2026-07-15 — Tony: Lịch sử phải ghi rõ bài của AI (comment chéo chạy nhiều người dễ lẫn),
    // tên bấm được để mở profile FB nếu có author_fb_id. Entry cũ (trước v1.0.268) không mang
    // field author_* — fallback tra theo post_id từ cache bài (buildActivityAuthorIndex(), 2026-07-16)
    // nên phần lớn entry cũ vẫn hiện được tên; bài đã rơi khỏi mọi cache thì đành để trống.
    const fallbackAuthor = (!h.author_name && h.post_id) ? state.activityAuthorIndex?.get(String(h.post_id)) : null;
    const authorName = h.author_name || fallbackAuthor?.name || '';
    const authorFbId = h.author_fb_id || fallbackAuthor?.fbId || null;
    const authorTag = authorName
      ? (authorFbId
        ? `<a class="tag web" href="https://www.facebook.com/${escAttr(authorFbId)}" target="_blank" rel="noopener noreferrer" title="Mở trang Facebook của ${escAttr(authorName)}">👤 ${esc(authorName)}</a>`
        : `<span class="tag web" title="Tác giả bài">👤 ${esc(authorName)}</span>`)
      : '';
    return `
    <div class="list-item history-item">
      <div class="post-meta">
        <span class="tag ${h.ok ? 'ready' : 'error'}">${h.ok ? (pending ? 'Chờ duyệt' : 'OK') : 'Lỗi'}</span>
        ${authorTag}
        ${h.mode ? `<span class="tag pending">${esc(formatHistoryMode(h.mode))}</span>` : ''}
        ${time ? `<span class="tag">${esc(time)}</span>` : ''}
      </div>
      <div class="post-body">${esc(h.group_name || h.group_id)}</div>
      <p class="hint history-snippet">${esc(h.snippet || '')}</p>
      ${h.error ? `<div class="hint" style="color:${h.ok ? 'var(--warn,#b45309)' : 'var(--error)'}">${esc(h.error)}</div>` : ''}
      ${link ? `<a class="btn ghost sm history-link" href="${escAttr(link)}" target="_blank" rel="noopener noreferrer">${linkLabel}</a>` : ''}
    </div>
  `;
  }).join('') + pagerHtml('history', page, totalPages);

  bindPagerEvents(box, (key, delta) => {
    if (key === 'history') {
      state.historyPage += delta;
      renderActivity(state._lastActivityUpcoming, state._lastActivityHistory);
    }
  });
}

function renderLeads(leads) {
  state.radarLeads = leads || [];
  const newCount = state.radarLeads.filter((l) => l.status === 'new').length;
  const badge = $('#radarBadge');
  if (badge) badge.textContent = newCount ? String(newCount) : '';

  const q = ($('#leadSearch')?.value || '').trim().toLowerCase();
  const statusFilter = state.leadFilterStatus || 'all';
  const filtered = state.radarLeads.filter((l) => {
    if (statusFilter !== 'all' && (l.status || 'new') !== statusFilter) return false;
    if (!q) return true;
    return (l.author_name || '').toLowerCase().includes(q) || (l.snippet || '').toLowerCase().includes(q);
  });

  $('#leadList').innerHTML = filtered.length
    ? filtered.slice(0, 50).map((l) => `
    <div class="list-item ${l.status === 'seen' ? 'lead-seen' : ''}">
      <div class="post-meta">
        <span class="tag">${esc(l.group_name || l.group_id)}</span>
        ${l.author_name ? `<span class="tag">${esc(l.author_name)}</span>` : ''}
        <span class="tag pending">${esc(l.found_at || '')}</span>
        ${l.status === 'seen' ? '<span class="tag ready">Đã xem</span>' : ''}
      </div>
      <div class="post-body">${esc(l.snippet || '')}</div>
      <div class="post-actions">
        ${l.post_url ? `<a href="${escAttr(l.post_url)}" target="_blank" rel="noopener" class="btn ghost sm">Mở bài</a>` : ''}
        ${l.status !== 'seen' ? `<button type="button" class="btn ghost sm" data-lead-seen="${escAttr(l.id)}">✓ Đã xem</button>` : ''}
        <button type="button" class="btn ghost sm accent" data-lead-delete="${escAttr(l.id)}">Xóa</button>
      </div>
    </div>
  `).join('')
    : emptyState('◎', 'Chưa có lead — bật Radar và quét');

  $('#leadList').querySelectorAll('[data-lead-seen]').forEach((btn) => {
    btn.addEventListener('click', () => setLeadStatus(btn.dataset.leadSeen, 'seen'));
  });
  $('#leadList').querySelectorAll('[data-lead-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteLead(btn.dataset.leadDelete));
  });
}

async function setLeadStatus(id, status) {
  const leads = state.radarLeads.map((l) => (l.id === id ? { ...l, status } : l));
  await chrome.storage.local.set({ radarLeads: leads });
  renderLeads(leads);
}

async function deleteLead(id) {
  const leads = state.radarLeads.filter((l) => l.id !== id);
  await chrome.storage.local.set({ radarLeads: leads });
  renderLeads(leads);
}

async function clearAllLeads() {
  if (!state.radarLeads.length) return;
  if (!window.confirm(`Xóa toàn bộ ${state.radarLeads.length} lead?`)) return;
  await chrome.storage.local.set({ radarLeads: [] });
  renderLeads([]);
}

function downloadTextFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportLeadsCsv() {
  const rows = [['group_name', 'author_name', 'snippet', 'matched_keywords', 'post_url', 'found_at', 'status']];
  state.radarLeads.forEach((l) => {
    rows.push([
      l.group_name || l.group_id || '',
      l.author_name || '',
      (l.snippet || '').replace(/\n/g, ' '),
      (l.matched_keywords || []).join('|'),
      l.post_url || '',
      l.found_at || '',
      l.status || 'new',
    ]);
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadTextFile(`groupflow-leads-${Date.now()}.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
}

function exportLeadsJson() {
  downloadTextFile(`groupflow-leads-${Date.now()}.json`, JSON.stringify(state.radarLeads, null, 2), 'application/json');
}

function filterGroupsForRadar(groups) {
  const q = $('#radarGroupSearch')?.value || '';
  return (groups || []).filter((g) => !q || groupMatchesSearch(g.name, q));
}

function renderRadarGroupPicker() {
  const box = $('#radarGroupList');
  if (!box) return;
  const filtered = filterGroupsForRadar(state.groups);
  const pickerIds = state.radarGroupIds;
  const countEl = $('#radarGroupCount');
  if (countEl) countEl.textContent = String(pickerIds.size);

  box.innerHTML = filtered.length
    ? filtered.map((g) => `
    <label class="group-row ${pickerIds.has(String(g.id)) ? 'selected' : ''}">
      <input type="checkbox" data-radar-picker-group="${g.id}" ${pickerIds.has(String(g.id)) ? 'checked' : ''} />
      <span class="group-avatar">${esc(groupInitial(g.name))}</span>
      <span class="group-info">
        <span class="group-name">${esc(g.name)}</span>
      </span>
    </label>
  `).join('')
    : emptyState('◎', state.groups.length ? 'Không có nhóm khớp tìm kiếm' : 'Đang chờ đồng bộ nhóm từ Facebook…');

  const selectAll = $('#radarSelectAllGroups');
  if (selectAll) selectAll.checked = filtered.length > 0 && filtered.every((g) => pickerIds.has(String(g.id)));

  box.querySelectorAll('[data-radar-picker-group]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      const gid = String(cb.dataset.radarPickerGroup);
      if (cb.checked) state.radarGroupIds.add(gid);
      else state.radarGroupIds.delete(gid);
      await GF.leadRadar.saveConfig({ radarGroupIds: [...state.radarGroupIds] });
      renderRadarGroupPicker();
    });
  });
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
    'settings-skills',
    'settings-categories',
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
  if (id === 'settings-skills') {
    loadLocalSkillSelects();
    renderLocalSkillList();
  }
  if (id === 'settings-categories') {
    renderCategoryManager();
  }
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


// Mẫu bình luận đã lưu trong storage khớp y hệt 1 bản DEFAULT cũ (trước v1.0.182) → coi như user
// chưa từng tự sửa, tự nâng cấp lên DEFAULT mới — nếu không, mẫu cũ sẽ mắc kẹt vĩnh viễn vì
// getSettings() luôn ưu tiên giá trị đã lưu (dù đó chỉ là bản mặc định cũ được lưu tình cờ lúc bấm
// Lưu Cài đặt cho mục khác) thay vì hằng số DEFAULT mới trong code.
async function migrateLegacyCommentTemplates(saved) {
  const trimmed = String(saved || '').trim();
  if (!trimmed) return saved;
  const legacy = GF.commentTemplates?.LEGACY_DEFAULTS || [];
  if (!legacy.some((l) => l.trim() === trimmed)) return saved;
  const upgraded = GF.commentTemplates.DEFAULT;
  await GF.storage.saveSettings({ commentTemplates: upgraded });
  return upgraded;
}

async function loadSettingsForm() {
  const s = await GF.storage.getSettings();
  $('#tidienBaseUrl').value = s.tidienBaseUrl;
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
    const current = await migrateLegacyCommentTemplates(s.commentTemplates);
    $('#commentTemplates').value = current || GF.commentTemplates?.DEFAULT || '';
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
  if ($('#radarMaxGroupsPerScan')) $('#radarMaxGroupsPerScan').value = String(radar.maxGroupsPerScan);
  if ($('#radarInPage')) $('#radarInPage').checked = radar.inPage;
  renderRadarGroupPicker();
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

// Audit đồng bộ 2026-07-06 — trước đây bấm "Lưu" LUÔN bắn `GF_TIDIEN_SYNC force:true scope:'all'`
// dù đổi field hoàn toàn không liên quan (vd `maxGroups`, `avoidNight`, `imageSaveMode`...) — force
// bỏ qua hẳn cooldown 90s VÀ kích hoạt luôn vòng lặp pull draft tối đa ~40 lượt (xem
// _syncFromTidienImpl(), background.js), tốn kém hẳn so với 1 lần lưu settings bình thường. Chỉ
// force sync thật khi 1 trong các field ẢNH HƯỞNG TỚI ĐỒNG BỘ thật sự đổi so với trước.
const TIDIEN_SYNC_RELEVANT_KEYS = ['tidienBaseUrl', 'tidienAutoSyncEnabled', 'tidienAutoPullDrafts', 'tidienAutoSyncMinutes'];

async function saveSettingsForm() {
  const prev = await GF.storage.getSettings();
  const securityLevel = getSelectedSecurityLevel();
  const next = {
    tidienBaseUrl: $('#tidienBaseUrl').value.trim(),
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
  };
  await GF.storage.saveSettings(next);
  alert('Đã lưu');
  const tidienRelevantChanged = TIDIEN_SYNC_RELEVANT_KEYS.some((k) => prev[k] !== next[k]);
  if (tidienRelevantChanged) {
    await gfSendMessage({ type: 'GF_TIDIEN_SYNC', force: true, scope: 'all' }).catch(() => {});
  }
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

// Ngành nghề trong extension: danh mục do admin quản lý ở WEBSITE, extension chỉ đọc. Bind: nút tải
// lại danh mục, chips chọn ngành khi soạn, và 2 select lọc (Tạo bài + Comment).
function initCategoryUI() {
  $('#btnReloadCategories')?.addEventListener('click', async () => {
    await loadCategories();
    renderCategoryOptions();
    renderCategoryManager();
    renderPosts();
    showToast('Đã tải lại danh mục ngành từ website', 'success');
  });

  // Chips chọn ngành khi SOẠN bài (multi-toggle) — delegation vì chips render lại theo danh mục.
  $('#manualCategoryChips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-compose-cat]');
    if (!btn) return;
    const id = String(btn.dataset.composeCat);
    if (state.composeCategoryIds.has(id)) state.composeCategoryIds.delete(id);
    else state.composeCategoryIds.add(id);
    renderComposeCategoryChips();
  });

  $('#commentFilterCategory')?.addEventListener('change', (e) => {
    state.commentFilterCategory = e.target.value;
    state.commentsPage = 0;
    renderComments();
  });
}

function bindEvents() {
  initSettingsNav();
  initCategoryUI();
  $('#btnPopout')?.addEventListener('click', closeSidePanel);

  $$('#tabBar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      showTab(tab);
      if (tab === 'comment') {
        loadComments();
        // v1.0.224 — list giờ chỉ hiện bài đã check OK/đã comment (isCommentActionable()), nên tốc
        // độ hiện bài phụ thuộc trực tiếp cron nền (mặc định 3 phút/2 bài — quá chậm nếu mới mở tab
        // lần đầu, queue còn nhiều bài chưa check). Tranh thủ bắn 1 lượt check batch lớn hơn ngay
        // lúc mở tab, rồi tự tải lại list sau vài giây để thấy kết quả — không bắt user ngồi đợi
        // cron tự chạy hoặc tự bấm F5.
        gfSendMessage({ type: 'GF_WARM_POST_ACCESS' }).catch(() => {});
        setTimeout(() => {
          if ($('#tab-comment')?.classList.contains('active')) loadComments();
        }, 6000);
      }
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

  $('#btnExportExcelTemplate')?.addEventListener('click', () => {
    try {
      const buf = GF.excel.templateArrayBuffer();
      downloadTextFile('groupflow-import-template.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (err) {
      alert(err.message);
    }
  });

  $('#excelFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await GF.excel.parseFile(file);
      rows.forEach((r) => {
        ensurePostGroups(r);
        // Cột "Ngành nghề" trong file (tên) → id ngành. Thiếu/tên lạ → chưa gán.
        if (Array.isArray(r._categoryNames) && r._categoryNames.length) {
          r.categories = resolveCategoryNamesToIds(r._categoryNames);
        }
        delete r._categoryNames;
        state.posts.push(r);
      });
      await savePosts();
      renderPosts();
    } catch (err) {
      alert(err.message);
    }
  });

  $('#btnAddManual')?.addEventListener('click', async () => {
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

  $('#btnGenAll')?.addEventListener('click', generateAll);

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
    state.postsPage = 0;
    renderPosts();
  });
  $('#postFilterGroup')?.addEventListener('change', (e) => {
    state.postFilterGroup = e.target.value;
    state.postsPage = 0;
    renderPosts();
  });
  $('#postFilterImage')?.addEventListener('change', (e) => {
    state.postFilterImage = e.target.value;
    state.postsPage = 0;
    renderPosts();
  });
  $('#postFilterCategory')?.addEventListener('change', (e) => {
    state.postFilterCategory = e.target.value;
    state.postsPage = 0;
    renderPosts();
  });
  $('#postFilterStatus')?.addEventListener('change', (e) => {
    state.postFilterStatus = e.target.value;
    state.postsPage = 0;
    renderPosts();
  });

  $('#btnBulkStatus')?.addEventListener('click', async () => {
    const status = $('#postsBulkStatus')?.value;
    if (!status) return alert('Chọn trạng thái cần áp dụng');
    await bulkSetPostStatus(status);
  });
  $('#btnBulkCategory')?.addEventListener('click', () => { applyBulkCategory(); });

  $('#btnBulkClearSel')?.addEventListener('click', () => {
    state.posts.forEach((p) => { p.selected = false; });
    savePosts();
    renderPosts();
  });

  $('#btnPullWeb')?.addEventListener('click', async () => {
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
          // Ngành nghề gán từ website (CSV id ngành — cùng id server, khớp thẳng state.categories).
          categories: String(row.category_ids || '').split(',').map((s) => s.trim()).filter(Boolean),
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
  $('#btnScheduleCampaign')?.addEventListener('click', toggleCampaignStaggerPanel);
  $('#btnCancelSelectedPosts')?.addEventListener('click', () => cancelSelectedPostSchedules());
  $('#btnConfirmCampaignStagger')?.addEventListener('click', confirmCampaignStagger);
  bindGapUnitDefaultReset('#campaignStaggerGapUnit', '#campaignStaggerGapValue');
  bindGapUnitDefaultReset('#commentScheduleGapUnit', '#commentScheduleGapValue');

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
  // v1.0.275 — xóa nút "Làm mới" khỏi Comment tab (auto-sync từ storage listener)
  $('#btnCheckNow')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '🔄 Đang kiểm tra…';
    try {
      // Trigger check bài từ background service worker (cron warmPostAccessCache)
      const response = await chrome.runtime.sendMessage({
        type: 'GF_CHECK_POSTS_NOW',
        data: { batchSize: 6 }
      }).catch(() => ({}));
      // Chờ tí để check xong, rồi update UI
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadPostedPostsForComment();
    } catch (e) {
      console.error('Check posts failed:', e);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
  $('#btnScheduleComments')?.addEventListener('click', () => toggleCommentSchedulePanel());
  $('#btnCancelSelectedComments')?.addEventListener('click', () => cancelSelectedCommentSchedules());
  $('#btnConfirmCommentSchedule')?.addEventListener('click', () => scheduleSelectedComments());
  $('#commentSelectAll')?.addEventListener('change', (e) => {
    document.querySelectorAll('#commentList [data-comment-id]').forEach((cb) => { cb.checked = e.target.checked; });
  });
  bindCommentFilters();
  bindCommentSubTabs();

  $('#btnRadarSave')?.addEventListener('click', async () => {
    const interval = Number($('#radarInterval').value) || 15;
    const maxGroupsPerScan = Number($('#radarMaxGroupsPerScan')?.value) || 10;
    const radarIds = state.radarGroupIds.size
      ? [...state.radarGroupIds]
      : [...new Set(state.posts.flatMap((p) => p.groupIds || []))];
    await GF.leadRadar.saveConfig({
      radarActive: $('#radarActive').checked,
      radarKeywords: $('#radarKeywords').value,
      radarInterval: interval,
      radarPush: $('#radarPush').checked,
      radarInPage: $('#radarInPage')?.checked !== false,
      radarMaxGroupsPerScan: maxGroupsPerScan,
      radarGroupIds: radarIds,
    });
    state.radarGroupIds = new Set(radarIds);
    renderRadarGroupPicker();
    await GF.leadRadar.setAlarm($('#radarActive').checked ? interval : 0);
    alert('Đã lưu radar');
  });
  $('#radarGroupSearch')?.addEventListener('input', () => renderRadarGroupPicker());
  $('#radarSelectAllGroups')?.addEventListener('change', async (e) => {
    const filtered = filterGroupsForRadar(state.groups);
    filtered.forEach((g) => {
      if (e.target.checked) state.radarGroupIds.add(String(g.id));
      else state.radarGroupIds.delete(String(g.id));
    });
    await GF.leadRadar.saveConfig({ radarGroupIds: [...state.radarGroupIds] });
    renderRadarGroupPicker();
  });
  $('#leadSearch')?.addEventListener('input', () => renderLeads(state.radarLeads));
  $('#leadFilterStatus')?.addEventListener('change', (e) => {
    state.leadFilterStatus = e.target.value;
    renderLeads(state.radarLeads);
  });
  $('#btnLeadExportCsv')?.addEventListener('click', () => exportLeadsCsv());
  $('#btnLeadExportJson')?.addEventListener('click', () => exportLeadsJson());
  $('#btnLeadClearAll')?.addEventListener('click', () => clearAllLeads());
  $('#btnRadarScan')?.addEventListener('click', () => gfSendMessage({ type: 'GF_RADAR_SCAN' }).catch(() => {}));

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

  // 2026-07-23 — gom log lỗi từ nhiều máy về server để đọc tập trung (thay vì xin từng máy chụp
  // màn hình tab Nhật ký). Thủ công, không tự động — xem chú thích sendLogReportToServer() (background.js).
  $('#btnSendLogReport')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.textContent = 'Đang gửi…';
    try {
      const res = await gfSendMessage({ type: 'GF_SEND_LOG_REPORT' });
      if (res?.ok) {
        showToast(`Đã gửi ${res.sent} dòng log lên server`, 'success');
      } else {
        showToast(res?.error || 'Gửi log thất bại', 'error');
      }
    } catch (e) {
      showToast(e.message || 'Gửi log thất bại', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = oldLabel;
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

  // Tự gỡ thiết bị "kẹt" (vd cài lại extension mất device_id cũ) mà KHÔNG cần đổi key/mất lịch sử
  // bài đã đăng — dùng chung resetMyDevicesAndReactivate() với nút tương tự ở overlay kích hoạt
  // (checkLicenseGate()) — đây là bản dùng khi phiên HIỆN TẠI vẫn còn vào được Cài đặt (không phải
  // lúc bị chặn ngay từ đầu, trường hợp đó phải xử lý ở overlay — xem chú thích HTML).
  $('#btnResetMyDevices')?.addEventListener('click', async () => {
    const { licenseKey } = await chrome.storage.local.get('licenseKey');
    if (!licenseKey) { alert('Chưa có license key để đặt lại thiết bị'); return; }
    if (!window.confirm('Sẽ gỡ TẤT CẢ thiết bị khác đang dùng key này — chỉ máy này được dùng tiếp. Tiếp tục?')) return;
    const btn = $('#btnResetMyDevices');
    const originalText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Đang xử lý…'; }
    try {
      const result = await resetMyDevicesAndReactivate(licenseKey);
      if (!result.ok) { alert(result.error); return; }
      await showSyncLicenseStatus();
      showToast(result.validateData.valid ? 'Đã đặt lại thiết bị — máy này dùng key bình thường' : (result.validateData.error || 'Đặt lại xong nhưng kích hoạt lại thất bại'), result.validateData.valid ? 'success' : 'error');
    } catch {
      alert('Lỗi kết nối server');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText || '🔄 Đặt lại thiết bị'; }
    }
  });
  $('#btnSaveSettings')?.addEventListener('click', saveSettingsForm);
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
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
        await GF.localSkills.importFromPromptFile(text, file.name);
      } else {
        await GF.localSkills.importFromJson(text);
      }
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
      // Job đăng crash giữa chừng (vd generateImage() lỗi trước khi kịp đăng nhóm nào) — không có
      // `group` nên nhánh "phase === 'error' && group" ở trên không khớp. Không xử lý ở đây thì
      // panel "Engine đang chạy" kẹt mãi ở trạng thái cũ (vd "Đang xuất ảnh…") dù background đã
      // dừng hẳn — đúng triệu chứng "chạy mãi không biết đang chạy gì".
      if (phase === 'error' && !group) {
        if (status) status.textContent = data.snippet || 'Lỗi — xem Nhật ký / Lịch sử';
        showActivityJournalSubTab();
        refreshActivityFromStorage({ forceHistorySub: true });
        setTimeout(() => hidePostingUI(), 4000);
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
    if (msg.type === 'GF_RADAR_UPDATED') {
      chrome.storage.local.get('radarLeads').then((d) => renderLeads(d.radarLeads || []));
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
    // 2026-07-16 — Tony: "thấy nó bật lên kiểm tra nhưng phần Của tôi không lên" — cron nền check
    // xong ghi kết quả vào gf_post_access_cache nhưng panel đang mở KHÔNG vẽ lại gì (list Comment,
    // số "Của tôi (N)"/"Đồng đội (N)", badge) cho tới khi user tự bấm Làm mới/đổi tab — bài mới
    // check OK xong mà số cứ đứng nguyên. Nghe thay đổi của cache rồi nạp lại (debounce 1.5s để
    // gom nhiều lượt check sát nhau — batch mở tab Comment check 3 bài liền — thành 1 lần vẽ).
    if (changes.gf_post_access_cache) {
      schedulePostAccessRefresh();
    }
  });
}

let postAccessRefreshTimer = null;
function schedulePostAccessRefresh() {
  if (postAccessRefreshTimer) clearTimeout(postAccessRefreshTimer);
  postAccessRefreshTimer = setTimeout(() => {
    postAccessRefreshTimer = null;
    // loadPostedPostsForComment() tự cập nhật badge + số tab con, và chỉ render list khi tab
    // Comment đang mở — panel đứng ở tab khác thì chỉ số liệu đổi, không đụng DOM tab hiện tại.
    // v1.0.277 — skipUnchangedRender: nếu tập bài hiển thị không đổi (chỉ mốc thời gian check đổi,
    // không có bài mới vào/rớt) thì chỉ cập nhật số đếm, không vẽ lại list (giữ cuộn/con trỏ).
    loadPostedPostsForComment({ skipUnchangedRender: true }).catch(() => {});
  }, 1500);
}

async function getUserSyncBase() {
  const s = await GF.storage.getSettings();
  return (s?.tidienBaseUrl || 'https://tidien.xyz').replace(/\/$/, '');
}

// 2026-07-13 — Tony: bài quá N ngày (kể từ ngày post) không nên hiện trong list Comment nữa (đã
// ngừng tải về từ server, nhưng cache cục bộ merge cộng dồn không tự dọn bài đã lỡ có sẵn từ
// trước) — cần biết đúng N đang cấu hình ở website để tự lọc lại. Cache 1 giờ/lần (giá trị hiếm khi
// đổi tay); fail-open về giá trị cache cũ/mặc định 60 nếu mất mạng — không chặn hẳn danh sách chỉ
// vì không lấy được config. Giữ bản sao độc lập với `getPostsSyncLookbackDays()` (background.js) —
// 2 context khác nhau (sidepanel vs service worker), cùng pattern mirror đã dùng cho
// modules/scheduler.js.
const POSTS_SYNC_LOOKBACK_CACHE_MS = 60 * 60 * 1000;
async function getPostsSyncLookbackDays() {
  const d = await chrome.storage.local.get(['postsSyncLookbackDays', 'postsSyncLookbackFetchedAt', 'licenseKey']);
  const cached = parseInt(d.postsSyncLookbackDays, 10);
  const cachedValid = Number.isFinite(cached) && cached > 0;
  if (cachedValid && Date.now() - (d.postsSyncLookbackFetchedAt || 0) < POSTS_SYNC_LOOKBACK_CACHE_MS) {
    return cached;
  }
  if (!d.licenseKey) return cachedValid ? cached : 60;
  try {
    const base = await getUserSyncBase();
    const res = await fetch(`${base}/api/user-sync/config`, {
      headers: { Authorization: `Bearer ${d.licenseKey}` },
    });
    if (!res.ok) return cachedValid ? cached : 60;
    const data = await res.json();
    const days = parseInt(data?.posts_sync_lookback_days, 10);
    if (Number.isFinite(days) && days > 0) {
      await chrome.storage.local.set({ postsSyncLookbackDays: days, postsSyncLookbackFetchedAt: Date.now() });
      return days;
    }
    return cachedValid ? cached : 60;
  } catch {
    return cachedValid ? cached : 60;
  }
}

// So version dạng "1.0.279": trả true nếu a MỚI HƠN b.
function isVersionNewer(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Thông báo website → extension (xem appSettingsService.getEffectiveGroupflowAnnouncement + userSync
// /config). Chỉ TOAST (theo lựa chọn): (1) thông báo admin đặt — toast 1 lần cho mỗi lần admin lưu
// (so `at` với mốc đã thấy); (2) cảnh báo bản mới — toast 1 lần cho mỗi version mới. Fail êm nếu lỗi
// mạng/chưa kích hoạt — không chặn gì.
async function checkGroupflowAnnouncement() {
  const d = await chrome.storage.local.get(['licenseKey', 'gfAnnounceSeenAt', 'gfVersionNoticeShown']);
  if (!d.licenseKey) return;
  let data;
  try {
    const base = await getUserSyncBase();
    const res = await fetch(`${base}/api/user-sync/config`, {
      headers: { Authorization: `Bearer ${d.licenseKey}` },
    });
    if (!res.ok) return;
    data = await res.json();
  } catch { return; }

  const ann = data?.announcement;
  if (ann && ann.message && Number(ann.at || 0) > Number(d.gfAnnounceSeenAt || 0)) {
    const type = ann.level === 'critical' ? 'error' : (ann.level === 'warning' ? 'warn' : 'info');
    showToast(`📢 ${ann.message}`, type, ann.level === 'critical' ? 15000 : 9000);
    await chrome.storage.local.set({ gfAnnounceSeenAt: Number(ann.at || 0) });
  }

  const latest = data?.latest_version;
  if (latest) {
    const cur = chrome.runtime.getManifest().version;
    if (isVersionNewer(latest, cur) && d.gfVersionNoticeShown !== latest) {
      showToast(`⬆ Đã có bản GroupFlow mới v${latest} (đang chạy v${cur}) — tải lại extension để cập nhật`, 'warn', 12000);
      await chrome.storage.local.set({ gfVersionNoticeShown: latest });
    }
  }
}

// Không có mốc ngày (dữ liệu cũ/lỗi thiếu field) thì coi như CÒN TRONG hạn — an toàn hơn lỡ ẩn
// nhầm 1 bài hợp lệ chỉ vì thiếu field ngày.
function isWithinPostsSyncLookback(dateStr, days) {
  if (!dateStr) return true;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return true;
  return (Date.now() - t) < days * 24 * 60 * 60 * 1000;
}

// v1.0.222-ext (audit đồng bộ 2026-07-06) — hàm này chạy VÔ ĐIỀU KIỆN mỗi lần mở panel
// (finishInit()/DOMContentLoaded) và trước đây gửi lại TOÀN BỘ bài `posted` trong postQueue mỗi
// lần gọi, không chỉ bài mới — postQueue tích luỹ càng lâu càng dài, nghĩa là mảng gửi lên (và số
// query server phải chạy, xem POST /api/user-sync/posts) lớn dần vô hạn theo lịch sử, dù chỉ mở
// panel bình thường không đổi gì. `pushUnsyncedPostsFromQueue()` (background.js) đã tự đánh dấu
// `g.tidienSynced` sau khi đẩy thành công qua đường khác (POST /group-posts/sync) — dùng lại ĐÚNG
// cờ đó ở đây để 2 đường không xung đột, chỉ gửi item thật sự CHƯA sync, và tự đánh dấu sau khi
// server xác nhận nhận (res.ok) — thất bại (mất mạng, server lỗi) thì KHÔNG đánh dấu, lần mở panel
// sau tự thử lại đúng những item đó, không mất/không gửi trùng.
async function syncLocalPostsToServer() {
  const { licenseKey, postQueue, activeActorId, fbUser } = await chrome.storage.local.get([
    'licenseKey', 'postQueue', 'activeActorId', 'fbUser',
  ]);
  if (!licenseKey) return;
  const queue = postQueue || [];
  // 2026-07-15 — gửi kèm FB uid của tài khoản/Fanpage đang đăng (actor active, fallback fbUser) để
  // server nuôi cột user_posts.fb_user_id → tag tác giả trên card Comment/Lịch sử của ĐỒNG ĐỘI bấm
  // vào mở được profile FB. postQueue không lưu actor theo từng bài nên lấy actor hiện tại — sync
  // chạy ngay mỗi lần mở panel (thường liền sau khi đăng) nên sai lệch hiếm, field chỉ để hiển thị.
  const posterFbId = String(activeActorId || fbUser?.id || '') || null;
  const posts = [];
  const touched = [];
  for (const item of queue) {
    if (item.postStatus !== 'posted') continue;
    for (const g of (item.postedGroups || [])) {
      if (g.tidienSynced) continue;
      if (!g.post_id || !/^\d+$/.test(String(g.post_id))) continue;
      posts.push({
        post_queue_id: item.id || '',
        group_id: String(g.group_id || ''),
        group_name: g.group_name || '',
        post_id: String(g.post_id),
        noi_dung: item.noi_dung || '',
        posted_at: g.posted_at || item.lastPostedAt || null,
        fb_user_id: posterFbId,
        // Tập ngành nghề của bài (nhiều-nhiều) — server thay toàn bộ set trong user_post_categories.
        category_ids: itemCategoryIds(item).map(Number).filter(Boolean),
      });
      touched.push(g);
    }
  }
  if (!posts.length) return;
  try {
    const base = await getUserSyncBase();
    const res = await fetch(`${base}/api/user-sync/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${licenseKey}` },
      body: JSON.stringify({ posts }),
    });
    if (res.ok) {
      const now = new Date().toISOString();
      touched.forEach((g) => { g.tidienSynced = true; g.tidienSyncedAt = now; });
      await chrome.storage.local.set({ postQueue: queue });
    }
  } catch { /* best-effort — chưa đánh dấu synced, lần mở panel sau tự gửi lại */ }
}

// Đẩy RIÊNG tập ngành của 1 bài ĐÃ ĐĂNG lên server (khi user đổi ngành trên card sau khi đăng) — không
// gate theo tidienSynced như syncLocalPostsToServer (nhóm đã synced rồi vẫn phải cập nhật lại ngành).
async function syncPostCategoryToServer(post) {
  const { licenseKey, activeActorId, fbUser } = await chrome.storage.local.get(['licenseKey', 'activeActorId', 'fbUser']);
  if (!licenseKey || post?.postStatus !== 'posted') return;
  const posterFbId = String(activeActorId || fbUser?.id || '') || null;
  const category_ids = itemCategoryIds(post).map(Number).filter(Boolean);
  const posts = (post.postedGroups || [])
    .filter((g) => g.post_id && /^\d+$/.test(String(g.post_id)))
    .map((g) => ({
      post_queue_id: post.id || '',
      group_id: String(g.group_id || ''),
      group_name: g.group_name || '',
      post_id: String(g.post_id),
      posted_at: g.posted_at || post.lastPostedAt || null,
      fb_user_id: posterFbId,
      category_ids,
    }));
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

// Báo rõ khi kéo bài từ server thất bại — trước đây `if (!res.ok) return;` nuốt lỗi im lặng, user chỉ
// thấy danh sách TRỐNG mà không biết vì sao (đã gặp thật: thiếu bảng user_post_categories làm
// /my-posts + /cross-posts trả 500, bài cũ vẫn còn nguyên trong DB nhưng extension không hiện gì).
// Throttle 1 toast/2 phút để không spam khi server lỗi kéo dài.
let lastSyncWarnAt = 0;
function warnSyncFailed(what, status) {
  console.warn(`[GroupFlow] Sync ${what} thất bại — HTTP ${status}`);
  if (Date.now() - lastSyncWarnAt < 120000) return;
  lastSyncWarnAt = Date.now();
  showToast(`Không tải được ${what} từ server (lỗi ${status}) — bài cũ vẫn còn, thử lại sau hoặc báo admin`, 'error', 9000);
}

// v1.0.185 — cursor theo `updated_at` (`myPostsSyncMeta.cursor`) + merge-upsert vào `serverMyPosts`
// đã có, thay vì gọi `?limit=200` trần rồi GHI ĐÈ toàn bộ cache mỗi lần như trước (tải lại y hệt
// 200 bài mới nhất dù phần lớn đã tải ở lần gọi trước — xem ghi chú đầu docs/GROUPFLOW.md). Lần đầu
// (chưa có cursor) vẫn lấy đúng 200 bài mới nhất như hành vi cũ; các lần sau chỉ hỏi "cái gì ĐỔI kể
// từ cursor" — rẻ hơn nhiều cho cả client lẫn server, và bắt được cả trạng thái `needs_comment` đổi
// trên bài CŨ (điều `created_at`/không-cursor trước đây bỏ sót vĩnh viễn nếu bài rớt khỏi top-200).
// v1.0.253 — Tony hỏi đúng trọng tâm: "check 50 bài OK báo lên server rồi, giờ reload extension thì
// check lại 100 bài từ đầu à?" — Trước bản này ĐÚNG LÀ VẬY: `gf_post_access_cache` (cục bộ) là NƠI
// DUY NHẤT quyết định "của tôi" hiện được không, hoàn toàn tách biệt khỏi việc CHÍNH MÁY NÀY (hay
// máy khác) đã từng báo `pending_approval`/`pending_checked_at` lên server qua
// `reportOwnPendingApproval()` — cache cục bộ mất (reload/cài lại/bump schema như v1.0.252 vừa làm)
// thì coi như chưa từng check, phải fetch lại Facebook cho TỪNG bài một, dù server đã biết câu trả
// lời từ trước. Giờ mỗi lần đồng bộ `/my-posts` về, "gieo lại" (seed) cache cục bộ từ đúng
// `pending_approval`/`pending_checked_at` server trả — chỉ bài NÀO server thật sự CHƯA có xác nhận
// (`pending_checked_at` null, tức chưa ai check bao giờ) mới cần cron `warmPostAccessCache()` tự
// check lại từ đầu; bài đã có xác nhận thì dùng lại luôn, không phí công fetch Facebook lần nữa.
// So sánh mốc thời gian — không ghi đè nếu cache cục bộ đang có SẴN kết quả MỚI HƠN (vd vừa
// force-check tay xong ngay trước khi sync server chạy).
// v1.0.293 — v1.0.288 từng so verdict server với mốc `gf_post_access_wiped_at` (thời điểm wipe
// cache CỤC BỘ) để chặn hồi sinh verdict 'ok' sai do checker lỗi timing cũ tạo — nhưng CÀI LẠI
// extension cũng tạo mốc wipe mới (storage trống → schema mismatch → wipe ngay lần đọc đầu), làm
// MỌI verdict server (checked trước lúc cài, đương nhiên) bị từ chối sạch → Tony gỡ/cài lại là
// toàn bộ bài "Chưa check" phải duyệt lại từ đầu, phá đúng tính năng seed v1.0.253 ("check OK rồi
// thì thôi, cài lại không phải duyệt lại"). Đổi sang MỐC CỐ ĐỊNH = thời điểm deploy v1.0.287 (fix
// poll timing của checker): verdict checked TRƯỚC mốc = checker lỗi cũ tạo → bỏ qua (máy tự check
// lại 1 lần); verdict SAU mốc = checker mới, đáng tin → gieo lại thẳng. Nếu sau này checker lại
// phải sửa kiểu "mọi verdict cũ đáng ngờ" → cập nhật mốc này cùng lúc bump schema.
const TRUSTED_VERDICT_SINCE_MS = Date.parse('2026-07-21T13:00:00Z');

async function seedPostAccessCacheFromServerRows(rows) {
  const confirmed = (rows || []).filter((r) => r.post_id && r.pending_checked_at);
  if (!confirmed.length) return;
  const d = await chrome.storage.local.get(['gf_post_access_cache', 'gf_post_access_cache_schema']);
  const cache = d.gf_post_access_cache || {};
  // 4 — phải khớp POST_ACCESS_CACHE_SCHEMA (modules/fbCommentBg.js). Không import được hằng số đó ở
  // đây (module chỉ bundle cho service worker, xem chú thích recheckLicenseStillValid()) nên chép
  // lại giá trị — nhớ đổi theo nếu fbCommentBg.js bump schema lần nữa.
  const schema = 4;
  let changed = false;
  for (const r of confirmed) {
    const checkedAtMs = new Date(r.pending_checked_at).getTime();
    if (!Number.isFinite(checkedAtMs)) continue;
    // Verdict 'ok' của checker cũ (trước mốc tin cậy) → bỏ, check lại bằng checker mới; 'pending'
    // cũ vẫn seed (hướng an toàn — chỉ ẩn bài, tự hết hạn rồi re-check, không dính vĩnh viễn).
    if (!r.pending_approval && checkedAtMs < TRUSTED_VERDICT_SINCE_MS) continue;
    const existing = cache[String(r.post_id)];
    if (existing?.checkedAt && existing.checkedAt >= checkedAtMs) continue;
    cache[String(r.post_id)] = {
      canComment: !r.pending_approval,
      kind: r.pending_approval ? 'pending' : 'ok',
      reason: r.pending_approval ? 'Chờ duyệt (xác nhận qua đồng bộ)' : undefined,
      checkedAt: checkedAtMs,
    };
    changed = true;
  }
  if (changed) {
    await chrome.storage.local.set({ gf_post_access_cache: cache, gf_post_access_cache_schema: schema });
    state.postAccessCache = cache;
  }
}

async function pullMyPostsFromServer({ force = false } = {}) {
  const { licenseKey } = await chrome.storage.local.get('licenseKey');
  if (!licenseKey) return;
  const d = await chrome.storage.local.get(['serverMyPosts', 'myPostsSyncMeta']);
  const meta = d.myPostsSyncMeta || { lastAt: 0, cursor: null };
  const now = Date.now();
  if (!force && meta.lastAt && (now - meta.lastAt) < USER_SYNC_MIN_INTERVAL_MS) return;
  try {
    const base = await getUserSyncBase();
    const qs = new URLSearchParams({ limit: '200' });
    if (meta.cursor) qs.set('since', meta.cursor);
    const res = await fetch(`${base}/api/user-sync/my-posts?${qs}`, {
      headers: { Authorization: `Bearer ${licenseKey}` },
    });
    if (!res.ok) { warnSyncFailed('bài của tôi', res.status); return; }
    const rows = await res.json();
    if (!Array.isArray(rows)) return;
    const newestUpdatedAt = rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), meta.cursor || '');
    const merged = mergeUserPostsById(d.serverMyPosts, rows)
      .sort((a, b) => new Date(b.posted_at || 0) - new Date(a.posted_at || 0))
      .slice(0, 500);
    await chrome.storage.local.set({
      serverMyPosts: merged,
      myPostsSyncMeta: { lastAt: now, cursor: newestUpdatedAt || meta.cursor || null },
    });
    await seedPostAccessCacheFromServerRows(rows);
    state.serverMyPostsIndex = buildServerMyPostsIndex(merged);
    renderPosts();
  } catch { /* best-effort */ }
}

// v1.0.185 — cùng cơ chế cursor + merge-upsert như pullMyPostsFromServer(), nhưng thêm 1 điểm khác:
// trước bản này bài cross KHÔNG hề được cache ra chrome.storage.local (chỉ sống trong biến trả về,
// mất sạch giữa 2 lần gọi) — mỗi lần mở/làm mới tab Comment là fetch lại full `?limit=100` từ đầu,
// không cursor nào để hỏi "có gì mới không". Giờ cache vào `crossPostsCache`, throttle không gọi
// mạng nếu gọi lại trong vòng USER_SYNC_MIN_INTERVAL_MS (trừ `force`) — trả thẳng cache cũ, không
// còn phải chờ round-trip mỗi lần chuyển tab qua lại.
async function fetchCrossPostsFromServer({ force = false } = {}) {
  const { licenseKey } = await chrome.storage.local.get('licenseKey');
  if (!licenseKey) return [];
  const d = await chrome.storage.local.get(['crossPostsCache', 'crossPostsSyncMeta']);
  const cache = d.crossPostsCache || [];
  const meta = d.crossPostsSyncMeta || { lastAt: 0, cursor: null };
  const now = Date.now();
  if (!force && meta.lastAt && (now - meta.lastAt) < USER_SYNC_MIN_INTERVAL_MS) return cache;
  try {
    const base = await getUserSyncBase();
    const qs = new URLSearchParams({ limit: '100' });
    if (meta.cursor) qs.set('since', meta.cursor);
    const res = await fetch(`${base}/api/user-sync/cross-posts?${qs}`, {
      headers: { Authorization: `Bearer ${licenseKey}` },
    });
    if (!res.ok) { warnSyncFailed('bài đồng đội', res.status); return cache; }
    const rows = await res.json();
    if (!Array.isArray(rows)) return cache;
    const newestUpdatedAt = rows.reduce((max, r) => (r.updated_at > max ? r.updated_at : max), meta.cursor || '');
    // 2026-07-15 — server (nhánh incremental) giờ trả CẢ bài `pending_approval = 1` (bài TỪNG OK
    // nhưng chủ bài recheck thấy đã chuyển chờ duyệt/khoá) — đây là tín hiệu GỠ, không phải bài
    // mới: merge để bản ghi mới nhất thắng rồi LỌC BỎ khỏi cache. Thay cho cơ chế hạn-6h cũ
    // (CROSS_POST_CONFIRMED_TTL_MS — đã bỏ): bài đã xác nhận OK giờ hiện tới khi quá N ngày, kể cả
    // khi máy chủ bài tắt lâu (rule Tony chốt: "Lâu check OK 26 bài thì mọi người phải thấy 26 bài").
    const merged = mergeUserPostsById(cache, rows)
      .filter((r) => Number(r.pending_approval || 0) !== 1)
      .sort((a, b) => new Date(b.posted_at || 0) - new Date(a.posted_at || 0))
      .slice(0, 500);
    await chrome.storage.local.set({
      crossPostsCache: merged,
      crossPostsSyncMeta: { lastAt: now, cursor: newestUpdatedAt || meta.cursor || null },
    });
    return merged;
  } catch { return cache; }
}

// v1.0.248 — dùng chung cho nút overlay (lúc bị chặn NGAY khi kích hoạt lần đầu, thiết bị mới sinh
// ra chưa từng đăng ký) lẫn nút trong Cài đặt → Đồng bộ (lúc đã có phiên hợp lệ nhưng muốn chủ động
// dọn thiết bị cũ) — xem chú thích POST /reset-devices (userAuth.js). KHÔNG đổi key_value, KHÔNG
// đụng user_posts (bài đăng cũ khoá theo user_account_id, không liên quan gì thiết bị/key).
async function resetMyDevicesAndReactivate(key) {
  const s = await GF.storage.getSettings();
  const base = (s?.tidienBaseUrl || 'https://tidien.xyz').replace(/\/$/, '');
  const deviceId = await GF.tidienAuth.getDeviceId();
  const deviceLabel = navigator.userAgentData?.platform || navigator.platform || 'Unknown';
  const resetRes = await fetch(`${base}/api/user-auth/reset-devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, deviceId, deviceLabel }),
  });
  const resetData = await resetRes.json();
  if (!resetData.ok) return { ok: false, error: resetData.error || 'Không đặt lại được thiết bị' };
  const vRes = await fetch(`${base}/api/user-auth/validate-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, deviceId, deviceLabel }),
  });
  const validateData = await vRes.json();
  await chrome.storage.local.set({ licenseKey: key, licenseInfo: validateData });
  return { ok: true, validateData };
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
  const resetBtn = $('#overlayResetDevicesBtn');
  if (licenseKey && input) input.value = licenseKey;
  // v1.0.245 — key từng hợp lệ nhưng bị revoke qua chu kỳ nền recheckLicenseStillValid() (khoá/hết
  // hạn phía admin) — hiện sẵn đúng lý do lần mở panel này, không bắt user phải tự bấm "Xác thực
  // key" lại mới biết vì sao bị đá về màn hình kích hoạt.
  if (licenseKey && licenseInfo && licenseInfo.valid === false && status) {
    status.textContent = licenseInfo.error || 'Key không còn hợp lệ — vui lòng xác thực lại';
    status.className = 'gf-activation-status gf-activation-status--error';
  }
  $('#overlayCloseBtn')?.addEventListener('click', closeSidePanel);
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
    resetBtn?.classList.add('hidden');
    try {
      const s = await GF.storage.getSettings();
      const base = (s?.tidienBaseUrl || 'https://tidien.xyz').replace(/\/$/, '');
      const deviceId = await GF.tidienAuth.getDeviceId();
      const deviceLabel = navigator.userAgentData?.platform || navigator.platform || 'Unknown';
      const res = await fetch(`${base}/api/user-auth/validate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, deviceId, deviceLabel }),
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
        // v1.0.248 — lỗi ĐÚNG "vượt giới hạn thiết bị" (thiết bị mới kích hoạt lần đầu, ví dụ vừa
        // cài lại extension) → hiện ngay lối thoát tại overlay này, KHÔNG bắt user tự tìm đường vào
        // Cài đặt (không thể vào được — overlay đang che kín, xem chú thích HTML).
        if (data.code === 'device_limit_reached' && resetBtn) resetBtn.classList.remove('hidden');
      }
    } catch {
      if (status) { status.textContent = 'Lỗi kết nối server'; status.className = 'gf-activation-status gf-activation-status--error'; }
      if (btn) { btn.disabled = false; btn.textContent = 'Xác thực key'; }
    }
  });

  resetBtn?.addEventListener('click', async () => {
    const key = (input?.value || '').trim().toUpperCase();
    if (!key) return;
    if (!window.confirm('Sẽ gỡ TẤT CẢ thiết bị khác đang dùng key này — chỉ máy này được dùng tiếp. Không đổi key, không ảnh hưởng bài đã đăng. Tiếp tục?')) return;
    resetBtn.disabled = true;
    resetBtn.textContent = 'Đang xử lý…';
    try {
      const result = await resetMyDevicesAndReactivate(key);
      if (!result.ok) {
        if (status) { status.textContent = result.error; status.className = 'gf-activation-status gf-activation-status--error'; }
        return;
      }
      if (result.validateData.valid) {
        renderLicenseBadge(result.validateData);
        overlay.remove();
        await finishInit();
      } else if (status) {
        status.textContent = result.validateData.error || 'Đặt lại xong nhưng kích hoạt lại thất bại';
        status.className = 'gf-activation-status gf-activation-status--error';
      }
    } catch {
      if (status) { status.textContent = 'Lỗi kết nối server'; status.className = 'gf-activation-status gf-activation-status--error'; }
    } finally {
      resetBtn.disabled = false;
      resetBtn.textContent = '🔄 Đặt lại thiết bị (chỉ dùng máy này)';
    }
  });
  return false;
}

async function finishInit() {
  bindEvents();
  await loadSettingsForm();
  initManualPostSettingsForm(await GF.storage.getSettings());
  await loadCategories();
  renderCategoryOptions();
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
  checkGroupflowAnnouncement().catch(() => {});
}

// Tony: "trong extension phải ghi version chứ" — hiện số version ngay ở header (không phụ thuộc đã
// kích hoạt hay chưa — header vẫn nằm trong DOM dù overlay kích hoạt che phía trên) để biết đang
// chạy đúng bản mới nhất sau khi reload extension, không cần mở chrome://extensions để soi.
function renderExtensionVersion() {
  const el = $('#brandVersion');
  if (!el) return;
  try {
    el.textContent = `v${chrome.runtime.getManifest().version}`;
  } catch { /* context invalidated — bỏ qua, không phải lỗi cần báo */ }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!gfRuntimeAlive()) showContextInvalidBanner();
  renderExtensionVersion();
  document.body.classList.add('gf-tab-create');
  const passed = await checkLicenseGate();
  if (!passed) return;
  await finishInit();
});
