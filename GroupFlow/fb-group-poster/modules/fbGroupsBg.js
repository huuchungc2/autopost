/**
 * Lấy nhóm đã tham gia qua session Chrome + GraphQL nội bộ FB (giống Group Posting Pro).
 * Không mở/chuyển tab Facebook.
 */
const DOC_PINNED = '7740459739385247';
const DOC_UNPINNED = '7218669964900608';

const FB = globalThis.GF.fbGroupsBg = {
  session() {
    return globalThis.GF.fbSessionBg;
  },

  async hasFbLogin() {
    return this.session().hasFbLogin();
  },

  isLoginPage(html) {
    return this.session().isLoginPage(html);
  },

  async resolveSession() {
    return this.session().resolveSession();
  },

  async graphqlRequest(session, friendlyName, docId, variables) {
    const { json } = await this.session().graphqlRequest(session, friendlyName, docId, variables);
    return json;
  },

  collectGroupEdges(map, edges) {
    const GP = globalThis.GF.groupParse;
    (edges || []).forEach((edge) => {
      const node = edge?.node;
      const id = node?.id ? String(node.id) : '';
      const name = String(node?.name || '').trim();
      if (!id || !name) return;
      const meta = GP?.parseGroupMeta ? GP.parseGroupMeta(node, JSON.stringify(edge)) : {};
      const entry = {
        id,
        name,
        href: `https://www.facebook.com/groups/${id}/`,
        privacy: meta.privacy || 'UNKNOWN',
        join_role: meta.join_role || null,
        post_approval: meta.post_approval || 'unknown',
        requires_approval: meta.post_approval === 'required',
      };
      const existing = map.get(id);
      map.set(id, existing && GP?.mergeGroupEntry ? GP.mergeGroupEntry(existing, entry) : entry);
    });
  },

  mergeGroupLists(primary, secondary) {
    const GP = globalThis.GF.groupParse;
    const map = new Map();
    (secondary || []).forEach((g) => map.set(String(g.id), g));
    (primary || []).forEach((g) => {
      const prev = map.get(String(g.id));
      map.set(String(g.id), prev && GP?.mergeGroupEntry ? GP.mergeGroupEntry(prev, g) : g);
    });
    return [...map.values()];
  },

  needsMetaEnrich(group) {
    return group?.privacy === 'UNKNOWN'
      || group?.post_approval === 'unknown'
      || group?.post_approval == null
      || !group?.join_role
      || group?.invite_permission === 'unknown'
      || group?.invite_permission == null;
  },

  async loadDocIds() {
    const GMS = globalThis.GF?.groupMetaStore;
    return GMS ? GMS.getDocIds() : {};
  },

  async fetchGroupPageHtml(groupId, path = '') {
    const S = this.session();
    const res = await S.fetchWithRetry(`https://www.facebook.com/groups/${groupId}${path}`, {
      credentials: 'include',
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    return { html: await res.text(), ok: res.ok };
  },

  async fetchGroupMetaGraphql(groupId, session, docIds) {
    const GP = globalThis.GF.groupParse;
    const names = GP?.ABOUT_QUERY_NAMES || [];
    const varSets = [
      { groupID: String(groupId), scale: 1 },
      { group_id: String(groupId), scale: 1 },
      { id: String(groupId), scale: 1 },
      { groupID: String(groupId), inviteShortLinkKey: null, isChainingRecommendationUnit: false, scale: 1 },
    ];

    for (const name of names) {
      const docId = docIds[name];
      if (!docId) continue;
      for (const variables of varSets) {
        try {
          const json = await this.graphqlRequest(session, name, docId, variables);
          const meta = GP.parseGroupMetaFromGraphqlJson(json, groupId);
          if (meta.privacy !== 'UNKNOWN' || meta.post_approval !== 'unknown') {
            return { ...meta, meta_source: 'graphql_about' };
          }
        } catch {
          // thử biến / query khác
        }
      }
    }
    return null;
  },

  async enrichSingleGroup(g, session, docIds) {
    const GP = globalThis.GF.groupParse;
    const GMS = globalThis.GF.groupMetaStore;
    const S = this.session();
    let current = { ...g };

    const needsPrivacy = current.privacy === 'UNKNOWN';
    const needsApproval = current.post_approval === 'unknown' || current.post_approval == null;
    const needsRole = !current.join_role;
    const needsInvite = current.invite_permission === 'unknown' || current.invite_permission == null;
    if (!needsPrivacy && !needsApproval && !needsRole && !needsInvite) return current;

    const gqlMeta = await this.fetchGroupMetaGraphql(g.id, session, docIds);
    if (gqlMeta) {
      current = { ...current, ...GP.mergeGroupMeta(current, gqlMeta) };
      const doneNow = current.privacy !== 'UNKNOWN'
        && current.post_approval !== 'unknown'
        && (current.join_role || !needsRole)
        && (current.invite_permission !== 'unknown' && current.invite_permission != null || !needsInvite);
      if (doneNow) return current;
    }

    for (const path of ['/about', '/']) {
      const done = current.privacy !== 'UNKNOWN'
        && current.post_approval !== 'unknown'
        && (current.join_role || !needsRole)
        && (current.invite_permission !== 'unknown' && current.invite_permission != null || !needsInvite);
      if (done) break;
      try {
        const { html, ok } = await this.fetchGroupPageHtml(g.id, path === '/' ? '' : path);
        if (!ok || S.isLoginPage(html)) break;

        if (path === '/about' && GP?.findAboutDocIdsInHtml) {
          const discovered = GP.findAboutDocIdsInHtml(html);
          if (Object.keys(discovered).length && GMS) {
            await GMS.saveDocIds(discovered);
            Object.assign(docIds, discovered);
            const gql2 = await this.fetchGroupMetaGraphql(g.id, session, docIds);
            if (gql2) current = { ...current, ...GP.mergeGroupMeta(current, gql2) };
          }
        }

        const pageMeta = GP.parseGroupMetaFromPage(html, g.id);
        if (pageMeta.privacy !== 'UNKNOWN'
          || pageMeta.post_approval !== 'unknown'
          || pageMeta.join_role
          || (pageMeta.invite_permission && pageMeta.invite_permission !== 'unknown')) {
          current = {
            ...current,
            ...GP.mergeGroupMeta(current, { ...pageMeta, meta_source: path === '/about' ? 'about_html' : 'group_html' }),
          };
        }
      } catch {
        // thử path khác
      }
    }

    return current;
  },

  async enrichGroupsMetadata(groups, { max = 80, delayMs = 280 } = {}) {
    let docIds = await this.loadDocIds();
    let session;
    try {
      session = await this.resolveSession();
    } catch {
      return groups;
    }

    const map = new Map((groups || []).map((g) => [String(g.id), { ...g }]));
    const targets = (groups || []).filter((g) => this.needsMetaEnrich(g)).slice(0, max);

    for (const g of targets) {
      try {
        const enriched = await this.enrichSingleGroup(g, session, docIds);
        map.set(String(g.id), enriched);
      } catch {
        // skip group
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  },

  async fetchJoinedGroupsGraphqlLite() {
    const session = await this.resolveSession();
    const map = new Map();

    const pinned = await this.graphqlRequest(
      session,
      'GroupsCometPinnedGroupsDialogQuery',
      DOC_PINNED,
      { ordering: ['viewer_added'], scale: 1 },
    );
    const viewer = pinned?.data?.viewer;
    if (!viewer) throw new Error('GraphQL không trả viewer — session có thể hết hạn');

    this.collectGroupEdges(map, viewer.groups_tab?.pinned_groups?.edges);
    this.collectGroupEdges(map, viewer.groups_tab?.tab_groups_list?.edges);

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  },

  async fetchJoinedGroupsGraphql() {
    const session = await this.resolveSession();
    const map = new Map();

    const pinned = await this.graphqlRequest(
      session,
      'GroupsCometPinnedGroupsDialogQuery',
      DOC_PINNED,
      { ordering: ['viewer_added'], scale: 1 },
    );
    const viewer = pinned?.data?.viewer;
    if (!viewer) throw new Error('GraphQL không trả viewer — session có thể hết hạn');

    this.collectGroupEdges(map, viewer.groups_tab?.pinned_groups?.edges);
    const tabList = viewer.groups_tab?.tab_groups_list;
    this.collectGroupEdges(map, tabList?.edges);

    let hasNext = tabList?.page_info?.has_next_page;
    let cursor = tabList?.page_info?.end_cursor;
    let page = 1;

    while (hasNext && cursor && page < 50) {
      await new Promise((r) => setTimeout(r, 400));
      const pageRes = await this.graphqlRequest(
        session,
        'GroupsCometUnpinnedGroupsPaginationListPaginatedQuery',
        DOC_UNPINNED,
        { count: 50, cursor, ordering: ['viewer_added'], scale: 1 },
      );
      const list = pageRes?.data?.viewer?.groups_tab?.tab_groups_list;
      if (!list) break;
      this.collectGroupEdges(map, list.edges);
      hasNext = list.page_info?.has_next_page;
      cursor = list.page_info?.end_cursor;
      page += 1;
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  },

  async fetchJoinedGroupsHtmlFallback() {
    const res = await this.session().fetchWithRetry('https://www.facebook.com/groups/joins/', {
      credentials: 'include',
      redirect: 'follow',
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) throw new Error(`Facebook trả HTTP ${res.status}`);
    const html = await res.text();
    if (this.isLoginPage(html)) {
      throw new Error('Session Facebook hết hạn — mở facebook.com một lần');
    }
    const GP = globalThis.GF.groupParse;
    if (!GP) return [];
    return GP.parseJoinedGroupsFromHtml(html, { onJoinsPage: true, relaxed: true });
  },

  async fetchJoinedGroupsLite() {
    if (!(await this.hasFbLogin())) {
      return {
        groups: [],
        error: 'Chưa đăng nhập Facebook trên Chrome — từng mở FB là đủ',
      };
    }

    try {
      const groups = await this.fetchJoinedGroupsGraphqlLite();
      if (!groups.length) {
        return { groups: [], error: 'GraphQL chưa trả nhóm — bấm ↻ hoặc mở facebook.com' };
      }
      return { groups, count: groups.length };
    } catch (e) {
      return { groups: [], error: e.message };
    }
  },

  /** GraphQL đủ trang + HTML joins (SW only, không cuộn tab) — Ctrl+↻ */
  async fetchJoinedGroupsQuick() {
    if (!(await this.hasFbLogin())) {
      return {
        groups: [],
        error: 'Chưa đăng nhập Facebook trên Chrome — từng mở FB là đủ',
      };
    }

    let groups = [];
    let lastError = null;

    try {
      groups = await this.fetchJoinedGroupsGraphql();
    } catch (e) {
      lastError = e.message;
    }

    try {
      const htmlGroups = await this.fetchJoinedGroupsHtmlFallback();
      if (htmlGroups.length) {
        groups = this.mergeGroupLists(groups, htmlGroups);
      }
    } catch (e) {
      if (!groups.length) lastError = e.message;
    }

    if (!groups.length) {
      return { groups: [], error: lastError || 'Không lấy được danh sách nhóm' };
    }

    return { groups, count: groups.length };
  },

  async fetchJoinedGroups() {
    if (!(await this.hasFbLogin())) {
      return {
        groups: [],
        error: 'Chưa đăng nhập Facebook trên Chrome — từng mở FB là đủ',
      };
    }

    const quick = await this.fetchJoinedGroupsQuick();
    if (!quick.groups?.length) return quick;

    const enriched = await this.enrichGroupsMetadata(quick.groups, {
      max: Math.min(quick.groups.length, 100),
    });

    return { groups: enriched, count: enriched.length };
  },
};
