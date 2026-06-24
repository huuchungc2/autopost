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
    (edges || []).forEach((edge) => {
      const node = edge?.node;
      const id = node?.id ? String(node.id) : '';
      const name = String(node?.name || '').trim();
      if (!id || !name || map.has(id)) return;
      map.set(id, {
        id,
        name,
        href: `https://www.facebook.com/groups/${id}/`,
      });
    });
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
    return GP.parseJoinedGroupsFromHtml(html, { onJoinsPage: true });
  },

  async fetchJoinedGroups() {
    if (!(await this.hasFbLogin())) {
      return {
        groups: [],
        error: 'Chưa đăng nhập Facebook trên Chrome — từng mở FB là đủ',
      };
    }

    try {
      const groups = await this.fetchJoinedGroupsGraphql();
      if (groups.length) return { groups, count: groups.length };
    } catch (e) {
      try {
        const groups = await this.fetchJoinedGroupsHtmlFallback();
        if (groups.length) return { groups, count: groups.length, via: 'html' };
        return { groups: [], error: e.message };
      } catch (e2) {
        return { groups: [], error: e.message || e2.message };
      }
    }

    try {
      const groups = await this.fetchJoinedGroupsHtmlFallback();
      return { groups, count: groups.length, via: 'html' };
    } catch (e) {
      return { groups: [], error: e.message };
    }
  },
};
