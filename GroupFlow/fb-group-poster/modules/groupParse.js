/**
 * Parse danh sách nhóm đã tham gia từ HTML/GraphQL FB — chạy được cả service worker lẫn content script.
 */
const GP = globalThis.GF.groupParse = {
  decodeFbStr(s) {
    return String(s || '')
      .replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  },

  isGenericGroupName(name) {
    return /^(group|nhóm|groups|facebook|xem thêm|see more)$/i.test(String(name || '').trim());
  },

  isFallbackGroupName(name) {
    return /^Group \d{5,}$/.test(String(name || '').trim());
  },

  isJoinedGroupChunk(chunk, { onJoinsPage = true } = {}) {
    const c = String(chunk).slice(0, 2500);
    if (/viewer_join_state":"NOT_MEMBER"|"is_viewer_member":false|GROUP_SUGGESTION|SUGGESTED_GROUP|recommended_groups|GroupsCometDiscover/i.test(c)) {
      return /viewer_join_state":"(?:MEMBER|ADMIN)"|"is_viewer_member":true/i.test(c);
    }
    if (/viewer_join_state":"(?:MEMBER|ADMIN)"|"is_viewer_member":true|has_membership":true/i.test(c)) {
      return true;
    }
    if (onJoinsPage) {
      return !/pending_invite|GROUP_INVITE|SUGGESTED|recommended/i.test(c);
    }
    return false;
  },

  upsert(map, id, name) {
    if (!id || !/^\d{5,}$/.test(String(id))) return;
    const n = String(name || '').trim();
    if (!n || n.length < 2 || this.isGenericGroupName(n)) return;
    const gid = String(id);
    const entry = {
      id: gid,
      name: n,
      href: `https://www.facebook.com/groups/${gid}/`,
    };
    const existing = map.get(gid);
    if (!existing) {
      map.set(gid, entry);
      return;
    }
    if (this.isFallbackGroupName(existing.name) && !this.isFallbackGroupName(n)) {
      existing.name = n;
    } else if (!this.isFallbackGroupName(n) && n.length > existing.name.length) {
      existing.name = n;
    }
  },

  parseJoinedGroupsFromHtml(html, { onJoinsPage = true } = {}) {
    const map = new Map();
    if (!html || html.length < 200) return [];

    const joinedOnly = true;
    const typeNames = ['"__typename":"Group"', '"__typename":"XFBGroup"'];
    typeNames.forEach((marker) => {
      const chunks = html.split(marker);
      for (let i = 1; i < chunks.length; i += 1) {
        const chunk = chunks[i].slice(0, 1400);
        if (joinedOnly && !this.isJoinedGroupChunk(chunk, { onJoinsPage })) continue;
        const idM = chunk.match(/"id":"(\d+)"/);
        const nameM = chunk.match(/"name":"((?:[^"\\]|\\.)*)"/);
        if (idM && nameM) this.upsert(map, idM[1], this.decodeFbStr(nameM[1]));
      }
    });

    const urlNameRe = /"url":"https?:\\\/\\\/(?:www\.)?facebook\.com\\\/groups\\\/(\d+)[^"]*"[\s\S]{0,500}?"name":"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = urlNameRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, m.index - 400), m.index + 600);
      if (joinedOnly && !this.isJoinedGroupChunk(slice, { onJoinsPage })) continue;
      this.upsert(map, m[1], this.decodeFbStr(m[2]));
    }

    const nameUrlRe = /"name":"((?:[^"\\]|\\.)*)"[\s\S]{0,500}?"url":"https?:\\\/\\\/(?:www\.)?facebook\.com\\\/groups\\\/(\d+)/g;
    while ((m = nameUrlRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, m.index - 400), m.index + 600);
      if (joinedOnly && !this.isJoinedGroupChunk(slice, { onJoinsPage })) continue;
      this.upsert(map, m[2], this.decodeFbStr(m[1]));
    }

    const nodeRe = /"node"\s*:\s*\{[^}]*"__typename":"(?:Group|XFBGroup)"[^}]*"id":"(\d+)"[^}]*"name":"((?:[^"\\]|\\.)*)"/g;
    let nm;
    while ((nm = nodeRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, nm.index - 400), nm.index + 600);
      if (joinedOnly && !this.isJoinedGroupChunk(slice, { onJoinsPage })) continue;
      this.upsert(map, nm[1], this.decodeFbStr(nm[2]));
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  },

  parseJoinedGroupsFromText(text, { onJoinsPage = true } = {}) {
    if (!text || text.length < 80) return [];
    if (!/GroupsCometJoins|GroupsCometYourGroups|groups_tab_list|joined.*groups|your_groups|__typename":"Group"/i.test(text)) {
      return [];
    }
    return this.parseJoinedGroupsFromHtml(text, { onJoinsPage });
  },
};
