importScripts('modules/swBundle.js');

console.info('[GroupFlow] SW v1.0.9 ready');

const GF_BRIDGE_VERSION = 5;

const GF_BG = {
  running: false,
  commentRunning: false,
  stopRequested: false,

  async injectFbBridge(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['selectors.js', 'modules/fbGraphApi.js', 'modules/fbActor.js', 'content.js'],
    });
  },

  async ensureFbBridge(tabId, attempts = 12) {
    for (let i = 0; i < attempts; i += 1) {
      try {
        const res = await chrome.tabs.sendMessage(tabId, { type: 'GF_PING' });
        if (res?.ok && (res.v || 0) >= GF_BRIDGE_VERSION) return true;
        await this.injectFbBridge(tabId);
      } catch {
        try {
          await this.injectFbBridge(tabId);
        } catch {
          /* tab chưa sẵn sàng */
        }
        await this.delay(400 + i * 300);
      }
    }
    return false;
  },

  async findJoinsTab() {
    const tabs = await chrome.tabs.query({
      url: ['https://www.facebook.com/*', 'https://facebook.com/*', 'https://m.facebook.com/*'],
    });
    return tabs.find((t) => t.url?.includes('/groups/joins')) || null;
  },

  async getFbUserFromCookie() {
    try {
      const c = await chrome.cookies.get({ url: 'https://www.facebook.com', name: 'c_user' });
      return c?.value ? { id: c.value } : null;
    } catch {
      return null;
    }
  },

  async getFbUserBg() {
    const cookie = await this.getFbUserFromCookie();
    if (!cookie?.id) return null;
    const S = globalThis.GF?.fbSessionBg;
    if (S) {
      try {
        const session = await S.resolveSession();
        const id = session.actorId || session.uid || cookie.id;
        return { id, name: `Facebook (${id})`, type: session.actingId ? 'page' : 'personal' };
      } catch {
        /* cookie có nhưng session chưa đủ — vẫn hiện id */
      }
    }
    return { id: cookie.id, name: `FB #${String(cookie.id).slice(-4)}`, type: 'personal' };
  },

  async getFbTab({ createIfMissing = true } = {}) {
    const tabs = await chrome.tabs.query({
      url: ['https://www.facebook.com/*', 'https://facebook.com/*', 'https://m.facebook.com/*'],
    });
    if (tabs[0]) return tabs[0];
    if (!createIfMissing) return null;
    const tab = await chrome.tabs.create({ url: 'https://www.facebook.com/groups/joins/', active: false });
    await this.waitForTabLoad(tab.id);
    await this.ensureFbBridge(tab.id);
    return tab;
  },

  async waitForTabLoad(tabId, timeout = 20000) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.status === 'complete') return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, timeout);
      const listener = (id, info) => {
        if (id === tabId && info.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  },

  isFallbackGroupName(name) {
    return /^Group \d{5,}$/.test(String(name || '').trim());
  },

  groupsNeedFullResync(groups) {
    if (!groups.length) return true;
    const fallback = groups.filter((g) => /^Group \d{5,}$/.test(String(g.name || '').trim())).length;
    return fallback / groups.length > 0.5;
  },

  cacheLooksBloated(groups) {
    return groups.length > 50;
  },

  async fetchGroupsFromSession() {
    try {
      const FB = globalThis.GF?.fbGroupsBg;
      if (!FB) return { groups: [] };
      return await FB.fetchJoinedGroups();
    } catch (e) {
      return { groups: [], error: e.message };
    }
  },

  async prefetchGroups() {
    const res = await this.fetchGroupsFromSession();
    if (res.groups?.length) {
      await chrome.storage.local.set({
        extractedGroups: res.groups,
        groupsSyncedAt: Date.now(),
      });
    }
    return res;
  },

  async passiveExtractFromJoinsTabs() {
    const tabs = await chrome.tabs.query({
      url: ['https://www.facebook.com/*', 'https://facebook.com/*', 'https://m.facebook.com/*'],
    });
    const merged = new Map();
    for (const tab of tabs) {
      if (!tab.url?.includes('/groups/joins')) continue;
      try {
        const ready = await this.ensureFbBridge(tab.id, 3);
        if (!ready) continue;
        const res = await chrome.tabs.sendMessage(tab.id, { type: 'GF_EXTRACT_GROUPS_QUICK' });
        (res?.groups || []).forEach((g) => merged.set(String(g.id), g));
      } catch { /* tab chưa sẵn sàng */ }
    }
    return [...merged.values()];
  },

  mergeGroupNames(freshGroups, cached) {
    const cacheNames = new Map((cached || []).map((g) => [String(g.id), g.name]));
    return freshGroups.map((g) => {
      const id = String(g.id);
      let name = g.name;
      const cachedName = cacheNames.get(id);
      if (cachedName && !this.isFallbackGroupName(cachedName) && this.isFallbackGroupName(name)) {
        name = cachedName;
      }
      return { ...g, id, name };
    });
  },

  async syncGroups({ forceRefresh = false, passive = true } = {}) {
    const cached = (await chrome.storage.local.get('extractedGroups')).extractedGroups || [];
    let merged = new Map();
    let lastError;

    const session = await this.fetchGroupsFromSession();
    (session.groups || []).forEach((g) => merged.set(String(g.id), g));
    if (!merged.size) lastError = session.error;

    if (!merged.size) {
      const quick = await this.passiveExtractFromJoinsTabs();
      quick.forEach((g) => merged.set(String(g.id), g));
    }

    if (!passive && forceRefresh && !merged.size) {
      const full = await this.extractGroupsFromFb({ navigate: false, deep: false });
      lastError = full.error;
      (full.groups || []).forEach((g) => merged.set(String(g.id), g));
    } else if (!merged.size && cached.length && !this.groupsNeedFullResync(cached) && !this.cacheLooksBloated(cached)) {
      cached.forEach((g) => merged.set(String(g.id), g));
    }

    const groups = this.mergeGroupNames([...merged.values()], cached)
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    if (groups.length) {
      await chrome.storage.local.set({ extractedGroups: groups, groupsSyncedAt: Date.now() });
    }
    return {
      groups,
      count: groups.length,
      error: groups.length ? undefined : (lastError || 'Đăng nhập Facebook trên Chrome rồi bấm ↻'),
    };
  },

  async extractGroupsFromFb({ navigate = false, deep = false } = {}) {
    const session = await this.fetchGroupsFromSession();
    if (session.groups?.length && !deep) {
      return { groups: session.groups, count: session.groups.length };
    }

    let tab = await this.findJoinsTab();
    const merged = new Map();
    let lastError;

    if (!tab && navigate) {
      const any = await this.getFbTab({ createIfMissing: true });
      if (any) {
        await chrome.tabs.update(any.id, { url: 'https://www.facebook.com/groups/joins/', active: false });
        await this.waitForTabLoad(any.id);
        await this.delay(2000);
        tab = await chrome.tabs.get(any.id);
      }
    }

    if (!tab) {
      return {
        groups: [],
        count: 0,
        error: 'Mở facebook.com/groups/joins trong tab Facebook — extension chỉ đọc trang đó, không tự chuyển tab',
      };
    }

    const ready = await this.ensureFbBridge(tab.id, 4);
    if (!ready) {
      lastError = 'Tab Facebook chưa sẵn sàng — F5 trang joins rồi thử lại';
    } else {
      try {
        const res = await chrome.tabs.sendMessage(tab.id, {
          type: 'GF_EXTRACT_GROUPS',
          deep: Boolean(deep),
        });
        (res?.groups || []).forEach((g) => merged.set(String(g.id), g));
      } catch (e) {
        lastError = e.message;
        console.warn('Extract groups failed', e.message);
      }
    }

    const groups = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return {
      groups,
      count: groups.length,
      error: groups.length ? undefined : lastError,
    };
  },

  async sendToFb(type, payload = {}) {
    const tab = await this.getFbTab();
    const ready = await this.ensureFbBridge(tab.id);
    if (!ready) {
      throw new Error('Không kết nối tab Facebook — mở facebook.com, F5 trang, rồi thử lại');
    }
    return chrome.tabs.sendMessage(tab.id, { type, ...payload });
  },

  delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  },

  async getSecurityDelays() {
    const s = await chrome.storage.local.get('securityLevel');
    const map = {
      fast: { betweenGroups: [60, 120], betweenPosts: 180, betweenComments: [90, 180] },
      balanced: { betweenGroups: [180, 300], betweenPosts: 420, betweenComments: [180, 300] },
      safe: { betweenGroups: [420, 600], betweenPosts: 900, betweenComments: [300, 600] },
    };
    return map[s.securityLevel] || map.balanced;
  },

  randBetween([a, b]) {
    return a + Math.floor(Math.random() * (b - a + 1));
  },

  async appendHistory(entry) {
    const d = await chrome.storage.local.get('activityHistory');
    const list = d.activityHistory || [];
    list.unshift({ ...entry, at: new Date().toISOString() });
    await chrome.storage.local.set({ activityHistory: list.slice(0, 300) });
  },

  async getMediaSettings() {
    const s = await chrome.storage.local.get([
      'routerApiKey', 'tidienBaseUrl', 'tidienToken', 'tidienApiKey', 'imageProviderId',
    ]);
    return {
      routerApiKey: s.routerApiKey || '',
      tidienBaseUrl: s.tidienBaseUrl || 'https://tidien.xyz',
      tidienToken: s.tidienToken || '',
      tidienApiKey: s.tidienApiKey || '',
      imageProviderId: s.imageProviderId ? Number(s.imageProviderId) : null,
    };
  },

  async runImageGenerate(payload) {
    let post = payload?.posts?.[0];
    if (!post) return;
    const d = await chrome.storage.local.get('postQueue');
    const fresh = (d.postQueue || []).find((p) => p.id === post.id);
    if (fresh) post = fresh;
    const PM = globalThis.GF?.postMedia;
    if (!PM) throw new Error('Thiếu module postMedia');
    chrome.runtime.sendMessage({
      type: 'GF_PROGRESS',
      data: {
        phase: 'generating',
        post: post.noi_dung?.slice(0, 40) || '',
        snippet: 'Đang xuất ảnh AI…',
      },
    }).catch(() => {});
    const settings = await this.getMediaSettings();
    await PM.ensurePostMedia(post, settings);
    await this.appendHistory({
      type: 'image',
      ok: true,
      snippet: post.noi_dung?.slice(0, 80) || '',
      post_id: post.id,
    });
  },

  async tickGroupImageSchedule() {
    const cfg = await chrome.storage.local.get([
      'groupImageScheduleEnabled',
      'groupImageScheduleStart',
      'groupImageScheduleEnd',
      'groupImageScheduleInterval',
      'groupImageScheduleLastRun',
      'postQueue',
      'routerApiKey',
      'tidienBaseUrl',
      'tidienToken',
      'tidienApiKey',
      'imageProviderId',
    ]);
    if (!cfg.groupImageScheduleEnabled) return;

    const hour = new Date().getHours();
    const start = Number(cfg.groupImageScheduleStart ?? 1);
    const end = Number(cfg.groupImageScheduleEnd ?? 5);
    if (hour < start || hour >= end) return;

    const intervalMs = (Number(cfg.groupImageScheduleInterval) || 10) * 60 * 1000;
    if (cfg.groupImageScheduleLastRun && Date.now() - cfg.groupImageScheduleLastRun < intervalMs) return;

    const PM = globalThis.GF?.postMedia;
    if (!PM) return;
    const candidate = (cfg.postQueue || []).find((p) => PM.needsImageGeneration(p));
    if (!candidate) return;

    try {
      await PM.ensurePostMedia(candidate, {
        routerApiKey: cfg.routerApiKey,
        tidienBaseUrl: cfg.tidienBaseUrl || 'https://tidien.xyz',
        tidienToken: cfg.tidienToken || '',
        tidienApiKey: cfg.tidienApiKey || '',
        imageProviderId: cfg.imageProviderId ? Number(cfg.imageProviderId) : null,
      });
      await chrome.storage.local.set({ groupImageScheduleLastRun: Date.now() });
      await this.appendHistory({
        type: 'image',
        ok: true,
        snippet: candidate.noi_dung?.slice(0, 80) || '',
        post_id: candidate.id,
      });
    } catch (e) {
      console.warn('[GroupFlow] image schedule:', e.message);
      await this.appendHistory({
        type: 'image',
        ok: false,
        snippet: candidate.noi_dung?.slice(0, 80) || '',
        error: e.message,
      });
    }
  },

  resolvePostGroups(post, job, groupsMap) {
    const ids = post.groupIds || job.groupIds || [];
    return ids.map((id) => groupsMap.get(String(id))).filter(Boolean);
  },

  canPostInBackground(post, postMode) {
    if (postMode === 'classic') return false;
    if (post.videoBase64 || post.mediaType === 'video') return false;
    return Boolean(globalThis.GF?.fbPostBg);
  },

  async postGroupItem(payload) {
    const postMode = payload.postMode || 'fast';
    if (this.canPostInBackground(payload, postMode)) {
      try {
        return await globalThis.GF.fbPostBg.postToGroup({
          groupId: payload.groupId,
          text: payload.text,
          imageBase64: payload.imageBase64,
          mediaMime: payload.mediaMime,
          actorId: payload.actorId,
          backgroundColor: payload.backgroundColor,
        });
      } catch (e) {
        if (postMode === 'fast') throw e;
      }
    }
    return this.sendToFb('GF_POST', payload);
  },

  spinText(text) {
    if (!text || !String(text).includes('{')) return text;
    return String(text).replace(/\{([^{}]+)\}/g, (_, o) => {
      const p = o.split('|').map((s) => s.trim()).filter(Boolean);
      return p[Math.floor(Math.random() * p.length)] || '';
    });
  },

  async maybeFirstComment(post, res, group, settings, job) {
    if (!post?.firstCommentEnabled) return;
    const raw = String(post.firstComment || '').trim();
    if (!raw) return;
    const postId = res?.postId;
    if (!postId || !/^\d+$/.test(String(postId))) return;
    const comment = this.spinText(raw);
    try {
      await this.commentOnPostBgOrClassic({
        group_id: group.id,
        post_id: postId,
        comment,
        actorId: job.actorId || settings.activeActorId,
      }, settings);
      await this.appendHistory({
        type: 'first_comment',
        ok: true,
        group_id: group.id,
        group_name: group.name,
        post_id: postId,
        snippet: comment.slice(0, 80),
      });
    } catch (e) {
      await this.appendHistory({
        type: 'first_comment',
        ok: false,
        group_id: group.id,
        group_name: group.name,
        post_id: postId,
        snippet: comment.slice(0, 80),
        error: e.message,
      });
    }
  },

  async runPostMatrix(job) {
    if (this.running) throw new Error('Đang chạy job khác');
    this.running = true;
    this.stopRequested = false;
    const delays = await this.getSecurityDelays();
    const settings = await chrome.storage.local.get(['fbLang', 'fbUser', 'extractedGroups', 'postMode', 'activeActorId']);
    const groupsMap = new Map((settings.extractedGroups || []).map((g) => [String(g.id), g]));
    let total = 0;
    job.posts.forEach((post) => {
      total += this.resolvePostGroups(post, job, groupsMap).length;
    });
    let done = 0;
    const PM = globalThis.GF?.postMedia;
    const mediaSettings = await this.getMediaSettings();

    try {
      for (let pi = 0; pi < job.posts.length; pi += 1) {
        if (this.stopRequested) break;
        let post = job.posts[pi];
        const queueData = await chrome.storage.local.get('postQueue');
        const freshPost = (queueData.postQueue || []).find((p) => p.id === post.id);
        if (freshPost) {
          post = { ...freshPost, groupIds: post.groupIds?.length ? post.groupIds : freshPost.groupIds };
          job.posts[pi] = post;
        }

        if (PM?.needsImageGeneration(post)) {
          chrome.runtime.sendMessage({
            type: 'GF_PROGRESS',
            data: {
              phase: 'generating',
              done,
              total,
              post: post.noi_dung?.slice(0, 40) || '',
              snippet: 'Xuất ảnh trước khi đăng…',
            },
          }).catch(() => {});
          post = await PM.ensurePostMedia(post, mediaSettings);
          job.posts[pi] = post;
        }

        const groups = this.resolvePostGroups(post, job, groupsMap);
        for (let gi = 0; gi < groups.length; gi += 1) {
          if (this.stopRequested) break;
          const group = groups[gi];
          let text = post.noi_dung;
          if (post.variations?.length) {
            text = post.variations[gi % post.variations.length];
          }
          if (text.includes('{')) {
            text = text.replace(/\{([^{}]+)\}/g, (_, o) => {
              const p = o.split('|').map((s) => s.trim()).filter(Boolean);
              return p[Math.floor(Math.random() * p.length)] || '';
            });
          }

          chrome.runtime.sendMessage({
            type: 'GF_PROGRESS',
            data: { phase: 'posting', done, total, group: group.name, post: text.slice(0, 40) },
          }).catch(() => {});

          const postMode = job.postMode || settings.postMode || 'fast';
          let res;
          try {
            res = await this.postGroupItem({
              groupId: group.id,
              text,
              imageBase64: post.imageBase64,
              videoBase64: post.videoBase64,
              mediaType: post.mediaType,
              mediaMime: post.mediaMime,
              lang: settings.fbLang || 'vi',
              postMode,
              actorId: job.actorId || settings.activeActorId,
              backgroundColor: post.backgroundColor,
            });
          } catch (e) {
            const rateLimited = /giới hạn tạm thời|rate limit|action_blocked/i.test(e.message || '');
            if (rateLimited) {
              done += 1;
              await this.appendHistory({
                type: 'post',
                ok: false,
                group_id: group.id,
                group_name: group.name,
                snippet: text.slice(0, 80),
                error: e.message,
              });
              this.stopRequested = true;
              break;
            }
            if (postMode === 'fast') {
              try {
                res = await this.sendToFb('GF_POST', {
                  groupId: group.id,
                  text,
                  imageBase64: post.imageBase64,
                  videoBase64: post.videoBase64,
                  mediaType: post.mediaType,
                  mediaMime: post.mediaMime,
                  lang: settings.fbLang || 'vi',
                  postMode: 'classic',
                  actorId: job.actorId || settings.activeActorId,
                });
              } catch (e2) {
                done += 1;
                await this.appendHistory({
                  type: 'post',
                  ok: false,
                  group_id: group.id,
                  group_name: group.name,
                  snippet: text.slice(0, 80),
                  error: e2.message,
                });
                continue;
              }
            } else {
              done += 1;
              await this.appendHistory({
                type: 'post',
                ok: false,
                group_id: group.id,
                group_name: group.name,
                snippet: text.slice(0, 80),
                error: e.message,
              });
              continue;
            }
          }

          done += 1;
          let fbUser = settings.fbUser || await this.getFbUserFromCookie();
          if (!fbUser) {
            try {
              fbUser = (await this.sendToFb('GF_GET_FB_USER')).user;
            } catch { /* ignore */ }
          }
          const postedOk = Boolean(res.postId && res.postId !== 'pending') || res.status === 'pending_approval';

          if (res.postId && res.postId !== 'pending' && job.sync) {
            try {
              const base = (await chrome.storage.local.get('tidienBaseUrl')).tidienBaseUrl || 'https://tidien.xyz';
              const key = await chrome.storage.local.get(['tidienApiKey', 'tidienToken']);
              const token = key.tidienApiKey || key.tidienToken;
              await fetch(`${base.replace(/\/$/, '')}/api/group-posts/sync`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  group_id: group.id,
                  group_name: group.name,
                  post_id: res.postId,
                  noi_dung: text,
                  prompt_anh: post.prompt_anh || '',
                  ngay_dang: post.ngay_dang,
                  gio_dang: post.gio_dang,
                  posted_at: new Date().toISOString(),
                  posted_by: fbUser?.id,
                }),
              });
            } catch (e) {
              console.warn('Sync failed', e);
            }
          }

          await this.appendHistory({
            type: 'post',
            ok: postedOk,
            group_id: group.id,
            group_name: group.name,
            post_id: res.postId,
            snippet: text.slice(0, 80),
            error: res.error || res.warning,
            mode: res.mode,
            status: res.status,
          });

          if (postedOk) {
            await this.maybeFirstComment(post, res, group, settings, job);
          }

          if (gi < groups.length - 1) {
            await this.delay(this.randBetween(delays.betweenGroups) * 1000);
          }
        }
        if (pi < job.posts.length - 1) {
          await this.delay(this.randBetween([delays.betweenPosts, delays.betweenPosts + 60]) * 1000);
        }
      }
    } finally {
      this.running = false;
      chrome.runtime.sendMessage({ type: 'GF_PROGRESS', data: { phase: 'done', done, total } }).catch(() => {});
    }
  },

  async commentOnPostBgOrClassic(job, settings) {
    const FC = globalThis.GF?.fbCommentBg;
    const validPostId = job.post_id && /^\d+$/.test(String(job.post_id));
    if (FC && validPostId) {
      try {
        return await FC.commentOnPost({
          groupId: job.group_id,
          postId: job.post_id,
          text: job.comment,
          actorId: job.actorId || settings.activeActorId,
        });
      } catch (e) {
        const noDomFallback = /không tồn tại|chờ admin|bị xóa|pending|không hợp lệ|không thể comment|không xác nhận/i
          .test(e.message || '');
        if (noDomFallback) throw e;
        console.warn('[GroupFlow] comment bg failed, fallback DOM:', e.message);
      }
    }
    await this.sendToFb('GF_COMMENT', {
      groupId: job.group_id,
      postId: job.post_id,
      text: job.comment,
      lang: settings.fbLang || 'vi',
      actorId: job.actorId || settings.activeActorId,
    });
    return { ok: true, mode: 'classic' };
  },

  async runCommentBatch(jobs, actorId) {
    if (this.commentRunning) throw new Error('Đang chạy batch comment khác');
    if (!jobs?.length) return { ok: true, done: 0 };
    this.commentRunning = true;
    const delays = await this.getSecurityDelays();
    const settings = await chrome.storage.local.get(['activeActorId']);
    const resolvedActor = actorId || settings.activeActorId;
    let done = 0;
    try {
      for (let i = 0; i < jobs.length; i += 1) {
        if (this.stopRequested) break;
        const job = { ...jobs[i], actorId: jobs[i].actorId || resolvedActor };
        chrome.runtime.sendMessage({
          type: 'GF_PROGRESS',
          data: {
            phase: 'commenting',
            done,
            total: jobs.length,
            snippet: job.comment?.slice(0, 50) || '',
          },
        }).catch(() => {});
        await this.runComment(job);
        done += 1;
        if (i < jobs.length - 1 && !this.stopRequested) {
          const waitSec = this.randBetween(delays.betweenComments);
          chrome.runtime.sendMessage({
            type: 'GF_PROGRESS',
            data: {
              phase: 'comment_wait',
              done,
              total: jobs.length,
              snippet: `Chờ ${waitSec}s trước comment tiếp…`,
            },
          }).catch(() => {});
          await this.delay(waitSec * 1000);
        }
      }
    } finally {
      this.commentRunning = false;
      chrome.runtime.sendMessage({
        type: 'GF_PROGRESS',
        data: { phase: 'done', done, total: jobs.length },
      }).catch(() => {});
    }
    return { ok: true, done };
  },

  async runComment(job) {
    const settings = await chrome.storage.local.get(['fbLang', 'fbUser', 'activeActorId']);
    let res;
    try {
      res = await this.commentOnPostBgOrClassic(job, settings);
    } catch (e) {
      await this.appendHistory({
        type: 'comment',
        ok: false,
        group_id: job.group_id,
        post_id: job.post_id,
        snippet: job.comment?.slice(0, 80),
        error: e.message,
      });
      throw e;
    }

    const fbUser = settings.fbUser || await this.getFbUserFromCookie();
    const base = (await chrome.storage.local.get('tidienBaseUrl')).tidienBaseUrl || 'https://tidien.xyz';
    const key = await chrome.storage.local.get(['tidienApiKey', 'tidienToken']);
    const token = key.tidienApiKey || key.tidienToken;
    await fetch(`${base.replace(/\/$/, '')}/api/group-posts/${job.record_id}/commented`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commenter_fb_user_id: fbUser?.id }),
    });
    await this.appendHistory({
      type: 'comment',
      ok: true,
      group_id: job.group_id,
      post_id: job.post_id,
      comment_id: res.commentId,
      snippet: job.comment?.slice(0, 80),
      error: res.warning,
      mode: res.mode,
    });
  },

  async runRadarScan() {
    const cfg = await chrome.storage.local.get([
      'radarActive', 'radarKeywords', 'radarGroupIds', 'radarPush', 'radarLeads', 'extractedGroups',
    ]);
    if (!cfg.radarActive) return;
    const groups = (cfg.extractedGroups || []).filter((g) => (cfg.radarGroupIds || []).includes(g.id));
    let leads = cfg.radarLeads || [];

    for (const group of groups) {
      const tab = await this.getFbTab();
      await chrome.tabs.update(tab.id, { url: `https://www.facebook.com/groups/${group.id}` });
      await this.delay(3500);
      const res = await chrome.tabs.sendMessage(tab.id, {
        type: 'GF_SCAN_FEED',
        keywordsText: cfg.radarKeywords,
      });
      if (res?.leads?.length) {
        leads = [...res.leads.map((l) => ({ ...l, group_name: group.name })), ...leads].slice(0, 500);
        if (cfg.radarPush) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            title: 'GroupFlow — Lead mới',
            message: res.leads[0].snippet?.slice(0, 120) || 'Có lead mới',
          });
        }
      }
    }
    await chrome.storage.local.set({ radarLeads: leads });
    chrome.runtime.sendMessage({ type: 'GF_RADAR_UPDATED' }).catch(() => {});
  },
};

console.log('[GroupFlow] service worker ready');

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'radar_scan') {
    await GF_BG.runRadarScan();
    return;
  }
  if (alarm.name.startsWith('gf_img_')) {
    const data = (await chrome.storage.local.get(`alarm_${alarm.name}`))[`alarm_${alarm.name}`];
    if (!data) return;
    if (data.kind === 'generate_image') {
      try {
        await GF_BG.runImageGenerate(data.payload);
      } catch (e) {
        console.warn('Image alarm failed:', e.message);
      }
    }
    await chrome.storage.local.remove(`alarm_${alarm.name}`);
    return;
  }
  if (alarm.name.startsWith('gf_job_') || alarm.name.startsWith('gf_cmt_')) {
    const data = (await chrome.storage.local.get(`alarm_${alarm.name}`))[`alarm_${alarm.name}`];
    if (!data) return;
    if (data.kind === 'post') await GF_BG.runPostMatrix(data.payload);
    if (data.kind === 'comment') await GF_BG.runComment(data.payload);
    await chrome.storage.local.remove(`alarm_${alarm.name}`);
    return;
  }
  if (alarm.name === 'gf_retry_missed') {
    const d = await chrome.storage.local.get('activityUpcoming');
    const now = Date.now();
    const remaining = [];
    for (const item of d.activityUpcoming || []) {
      if (item.when <= now) {
        if (item.kind === 'post') await GF_BG.runPostMatrix(item.payload);
        if (item.kind === 'generate_image') {
          try {
            await GF_BG.runImageGenerate(item.payload);
          } catch (e) {
            console.warn('Missed image job:', e.message);
          }
        }
        if (item.kind === 'comment') await GF_BG.runComment(item.payload);
      } else {
        remaining.push(item);
      }
    }
    await chrome.storage.local.set({ activityUpcoming: remaining });
    return;
  }
  if (alarm.name === 'gf_image_schedule') {
    await GF_BG.tickGroupImageSchedule();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      // Broadcast từ chính background — không phải request từ sidepanel
      if (msg.type === 'GF_PROGRESS' || msg.type === 'GF_RADAR_UPDATED') return;

      if (msg.type === 'GF_START_POST') {
        GF_BG.runPostMatrix(msg.payload);
        sendResponse({ ok: true, started: true });
        return;
      }
      if (msg.type === 'GF_STOP') {
        GF_BG.stopRequested = true;
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_EXTRACT_GROUPS') {
        const res = await GF_BG.extractGroupsFromFb({
          navigate: Boolean(msg.navigate),
          deep: Boolean(msg.deep),
        });
        sendResponse(res);
        return;
      }
      if (msg.type === 'GF_SYNC_GROUPS') {
        const res = await GF_BG.syncGroups({
          forceRefresh: Boolean(msg.force),
          passive: msg.passive !== false,
        });
        sendResponse(res);
        return;
      }
      if (msg.type === 'GF_GET_FB_USER') {
        let user = await GF_BG.getFbUserBg();
        if (!user) {
          const res = await GF_BG.sendToFb('GF_GET_FB_USER');
          user = res.user;
        }
        if (user) await chrome.storage.local.set({ fbUser: user });
        sendResponse({ user });
        return;
      }
      if (msg.type === 'GF_GET_FB_PROFILES') {
        const res = await GF_BG.sendToFb('GF_GET_FB_PROFILES');
        if (res.profiles) {
          await chrome.storage.local.set({
            fbProfiles: res.profiles,
            fbUser: res.profiles.active,
            activeActorId: res.profiles.activeId,
          });
        }
        sendResponse(res);
        return;
      }
      if (msg.type === 'GF_SWITCH_ACTOR') {
        const res = await GF_BG.sendToFb('GF_SWITCH_ACTOR', { actorId: msg.actorId });
        if (res.user) {
          await chrome.storage.local.set({
            fbUser: res.user,
            activeActorId: msg.actorId,
          });
        }
        sendResponse(res);
        return;
      }
      if (msg.type === 'GF_RUN_COMMENT') {
        await GF_BG.runComment(msg.payload);
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_RUN_COMMENT_BATCH') {
        const res = await GF_BG.runCommentBatch(msg.payload?.jobs, msg.payload?.actorId);
        sendResponse(res);
        return;
      }
      if (msg.type === 'GF_RADAR_SCAN') {
        await GF_BG.runRadarScan();
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_SCHEDULE_ALARM') {
        await chrome.alarms.clear(msg.name);
        chrome.alarms.create(msg.name, { when: msg.when });
        await chrome.storage.local.set({ [`alarm_${msg.name}`]: msg.data });
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'GF_CANCEL_ALARM') {
        await chrome.alarms.clear(msg.name);
        await chrome.storage.local.remove(`alarm_${msg.name}`);
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ error: `Loại message không hỗ trợ: ${msg.type || '?'}` });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  console.info('[GroupFlow] SW v1.0.9 installed');
  chrome.alarms.create('gf_retry_missed', { periodInMinutes: 5 });
  chrome.alarms.create('gf_image_schedule', { periodInMinutes: 1 });
  GF_BG.prefetchGroups().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('gf_image_schedule', { periodInMinutes: 1 });
  GF_BG.prefetchGroups().catch(() => {});
});
