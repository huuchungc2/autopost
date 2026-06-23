/* global GF, XLSX */

const state = {
  posts: [],
  groups: [],
  selectedGroupIds: new Set(),
  comments: [],
  commentDrafts: {},
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function showTab(name) {
  $$('.tab-panel').forEach((p) => p.classList.remove('active'));
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $(`#tab-${name}`)?.classList.add('active');
}

async function loadState() {
  const d = await chrome.storage.local.get([
    'postQueue', 'extractedGroups', 'selectedGroupIds', 'fbUser',
    'activityHistory', 'activityUpcoming', 'radarLeads',
  ]);
  state.posts = d.postQueue || [];
  state.groups = d.extractedGroups || [];
  state.selectedGroupIds = new Set(d.selectedGroupIds || []);
  renderPosts();
  renderGroups();
  updateFbHeader(d.fbUser);
  renderActivity(d.activityUpcoming || [], d.activityHistory || []);
  renderLeads(d.radarLeads || []);
}

function updateFbHeader(fbUser) {
  const el = $('#fbUserLabel');
  const dot = $('#fbDot');
  if (fbUser?.name) {
    el.childNodes[0].textContent = `${fbUser.name} `;
    dot.classList.add('on');
  } else {
    el.childNodes[0].textContent = 'Chưa kết nối FB ';
    dot.classList.remove('on');
  }
}

async function savePosts() {
  await chrome.storage.local.set({ postQueue: state.posts });
}

async function saveGroupsSelection() {
  await chrome.storage.local.set({
    selectedGroupIds: [...state.selectedGroupIds],
    extractedGroups: state.groups,
  });
}

function renderPosts() {
  const box = $('#postList');
  if (!state.posts.length) {
    box.innerHTML = '<p class="hint">Chưa có bài trong queue</p>';
    return;
  }
  box.innerHTML = state.posts.map((p) => `
    <div class="list-item">
      <label class="check-row">
        <input type="checkbox" data-post-id="${p.id}" ${p.selected !== false ? 'checked' : ''} />
        <span>${esc(p.noi_dung?.slice(0, 50) || '—')}</span>
      </label>
      <div class="hint">${p.source === 'website' ? '☁️ Website' : ''}${p.is_shared ? ' · 👥 Shared' : ''} ${p.ngay_dang || '—'} ${p.gio_dang || ''} · Ảnh: ${p.imageStatus || 'pending'}</div>
      ${p.imageBase64 ? `<img class="thumb" src="data:image/png;base64,${p.imageBase64}" alt="" />` : ''}
      <div class="row">
        <button type="button" class="btn outline sm" data-gen="${p.id}">▶ Generate</button>
        <button type="button" class="btn outline sm" data-del-post="${p.id}">🗑️</button>
      </div>
    </div>
  `).join('');

  box.querySelectorAll('[data-post-id]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const post = state.posts.find((x) => x.id === cb.dataset.postId);
      if (post) post.selected = cb.checked;
      savePosts();
    });
  });
  box.querySelectorAll('[data-gen]').forEach((btn) => {
    btn.addEventListener('click', () => generateOne(btn.dataset.gen));
  });
  box.querySelectorAll('[data-del-post]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.posts = state.posts.filter((x) => x.id !== btn.dataset.delPost);
      savePosts();
      renderPosts();
    });
  });
}

function renderGroups() {
  $('#groupCount').textContent = state.groups.length;
  const q = ($('#groupSearch').value || '').toLowerCase();
  const settings = { maxGroups: Number($('#maxGroups')?.value) || 10 };
  const filtered = state.groups.filter((g) => !q || g.name.toLowerCase().includes(q));

  $('#groupList').innerHTML = filtered.map((g) => `
    <label class="check-row list-item ${state.selectedGroupIds.has(g.id) ? 'selected' : ''}">
      <input type="checkbox" data-group-id="${g.id}" ${state.selectedGroupIds.has(g.id) ? 'checked' : ''} />
      <span>${esc(g.name)}</span>
    </label>
  `).join('');

  $('#selectAllGroups').checked = filtered.length > 0 && filtered.every((g) => state.selectedGroupIds.has(g.id));

  $('#groupList').querySelectorAll('[data-group-id]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (state.selectedGroupIds.size >= settings.maxGroups) {
          cb.checked = false;
          alert(`Tối đa ${settings.maxGroups} group/lần`);
          return;
        }
        state.selectedGroupIds.add(cb.dataset.groupId);
      } else {
        state.selectedGroupIds.delete(cb.dataset.groupId);
      }
      saveGroupsSelection();
      renderGroups();
    });
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function generateOne(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post?.prompt_anh) return alert('Thiếu prompt ảnh');
  const s = await GF.storage.getSettings();
  if (!s.routerApiKey) return alert('Thiếu 9Router API key trong Cài đặt');
  try {
    post.imageStatus = 'generating';
    renderPosts();
    const img = await GF.imageGen.generate(post.prompt_anh, s.routerApiKey, s.tidienBaseUrl);
    post.imageBase64 = img.base64;
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
  for (const p of state.posts.filter((x) => x.selected !== false && !x.imageBase64)) {
    await generateOne(p.id);
  }
}

function getSelectedPosts() {
  return state.posts.filter((p) => p.selected !== false);
}

function buildPostJob(sync = true) {
  const posts = getSelectedPosts();
  const groupIds = [...state.selectedGroupIds];
  if (!posts.length || !groupIds.length) throw new Error('Chọn ít nhất 1 bài và 1 group');
  return { posts, groupIds, sync };
}

async function startPostNow() {
  try {
    const payload = buildPostJob(true);
    $('#progressBox').classList.remove('hidden');
    await chrome.runtime.sendMessage({ type: 'GF_START_POST', payload });
  } catch (e) {
    alert(e.message);
  }
}

async function schedulePost() {
  const payload = buildPostJob(true);
  const when = GF.scheduler.parseScheduleDate(
    $('#manualDate')?.value || payload.posts[0]?.ngay_dang,
    $('#manualTime')?.value || payload.posts[0]?.gio_dang
  );
  if (!when || when < Date.now()) return alert('Chọn ngày giờ hợp lệ trong tương lai');
  const name = `gf_job_${Date.now()}`;
  await chrome.runtime.sendMessage({
    type: 'GF_SCHEDULE_ALARM',
    name,
    when,
    data: { kind: 'post', payload },
  });
  const upcoming = (await chrome.storage.local.get('activityUpcoming')).activityUpcoming || [];
  upcoming.push({ kind: 'post', when, payload, label: 'Đăng bài đã lên lịch' });
  await chrome.storage.local.set({ activityUpcoming: upcoming });
  alert('Đã lên lịch');
  loadState();
}

async function loadComments() {
  try {
    const res = await GF.tidienSync.fetchPendingComments({ limit: 50 });
    state.comments = res.data || res;
    renderComments();
    $('#commentBadge').textContent = state.comments.length ? String(state.comments.length) : '';
  } catch (e) {
    $('#commentList').innerHTML = `<p class="hint">${esc(e.message)}</p>`;
  }
}

function renderComments() {
  const box = $('#commentList');
  if (!state.comments.length) {
    box.innerHTML = '<p class="hint">Không có bài — đăng nhập tidien và sync bài trước</p>';
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
  await chrome.runtime.sendMessage({
    type: 'GF_RUN_COMMENT',
    payload: {
      record_id: c.id,
      group_id: c.group_id,
      post_id: c.post_id,
      comment,
    },
  });
  await loadComments();
}

function renderActivity(upcoming, history) {
  $('#activityUpcoming').innerHTML = upcoming.map((u) => `
    <div class="list-item">${new Date(u.when).toLocaleString()} — ${esc(u.label || u.kind)}</div>
  `).join('') || '<p class="hint">Không có lịch chờ</p>';

  $('#activityHistory').innerHTML = history.map((h) => `
    <div class="list-item">
      ${h.ok ? '✅' : '❌'} ${esc(h.group_name || h.group_id)} — ${esc(h.snippet || '')}
      ${h.post_id ? `<a href="https://facebook.com/groups/${h.group_id}/posts/${h.post_id}" target="_blank">🔗</a>` : ''}
    </div>
  `).join('') || '<p class="hint">Chưa có lịch sử</p>';
}

function renderLeads(leads) {
  const newCount = leads.filter((l) => l.status === 'new').length;
  $('#radarBadge').textContent = newCount ? String(newCount) : '';
  $('#leadList').innerHTML = leads.slice(0, 50).map((l) => `
    <div class="list-item">
      <div class="hint">${esc(l.group_name || l.group_id)} · ${esc(l.found_at || '')}</div>
      <div>${esc(l.snippet || '')}</div>
      ${l.post_url ? `<a href="${l.post_url}" target="_blank">Mở bài</a>` : ''}
    </div>
  `).join('') || '<p class="hint">Chưa có lead</p>';
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
  const radar = await GF.leadRadar.getConfig();
  $('#radarActive').checked = radar.active;
  $('#radarKeywords').value = radar.keywords;
  $('#radarInterval').value = String(radar.interval);
  $('#radarPush').checked = radar.push;
}

async function saveSettingsForm() {
  await GF.storage.saveSettings({
    tidienBaseUrl: $('#tidienBaseUrl').value.trim(),
    tidienApiKey: $('#tidienApiKey').value.trim(),
    routerApiKey: $('#routerApiKey').value.trim(),
    driveJson: $('#driveJson').value.trim(),
    driveFolderId: $('#driveFolderId').value.trim(),
    maxGroups: Number($('#maxGroups').value) || 10,
    fbLang: $('#fbLang').value,
  });
  alert('Đã lưu');
}

function bindEvents() {
  $$('#tabBar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      showTab(btn.dataset.tab);
      if (btn.dataset.tab === 'comment') loadComments();
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
  });

  $('#excelFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await GF.excel.parseFile(file);
      state.posts.push(...rows);
      await savePosts();
      renderPosts();
    } catch (err) {
      alert(err.message);
    }
  });

  $('#btnAddManual').addEventListener('click', async () => {
    const text = $('#manualText').value.trim();
    if (!text) return;
    state.posts.push({
      id: `manual-${Date.now()}`,
      source: 'manual',
      noi_dung: text,
      prompt_anh: '',
      ngay_dang: $('#manualDate').value,
      gio_dang: $('#manualTime').value,
      imageStatus: 'pending',
      selected: true,
    });
    $('#manualText').value = '';
    await savePosts();
    renderPosts();
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
          ngay_dang: row.ngay_dang,
          gio_dang: row.gio_dang,
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

  $('#btnExtract').addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'GF_EXTRACT_GROUPS' });
    if (res?.groups) {
      state.groups = res.groups;
      await saveGroupsSelection();
      renderGroups();
    } else {
      alert(res?.error || 'Extract thất bại — mở Facebook trước');
    }
  });
  $('#groupSearch').addEventListener('input', renderGroups);
  $('#selectAllGroups').addEventListener('change', (e) => {
    const max = Number($('#maxGroups')?.value) || 10;
    if (e.target.checked) {
      state.groups.slice(0, max).forEach((g) => state.selectedGroupIds.add(g.id));
    } else {
      state.selectedGroupIds.clear();
    }
    saveGroupsSelection();
    renderGroups();
  });

  $('#btnPostNow').addEventListener('click', startPostNow);
  $('#btnSchedule').addEventListener('click', schedulePost);
  $('#btnRefreshComments').addEventListener('click', loadComments);
  $('#btnRunAllComments').addEventListener('click', async () => {
    const ids = [...document.querySelectorAll('[data-comment-id]:checked')].map((el) => el.dataset.commentId);
    for (const id of ids) await runComment(id);
  });

  $('#btnRadarSave').addEventListener('click', async () => {
    const interval = Number($('#radarInterval').value) || 15;
    await GF.leadRadar.saveConfig({
      radarActive: $('#radarActive').checked,
      radarKeywords: $('#radarKeywords').value,
      radarInterval: interval,
      radarPush: $('#radarPush').checked,
      radarGroupIds: [...state.selectedGroupIds],
    });
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
      loadState();
    } catch (e) {
      alert(e.message);
    }
  });
  $('#btnSaveSettings').addEventListener('click', saveSettingsForm);

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
  chrome.runtime.sendMessage({ type: 'GF_GET_FB_USER' }).then((res) => {
    if (res?.user) updateFbHeader(res.user);
  });
});
