/**
 * Parse danh sách nhóm đã tham gia từ HTML/GraphQL FB — chạy được cả service worker lẫn content script.
 */
const GP = globalThis.GF.groupParse = {
  ABOUT_QUERY_NAMES: [
    'GroupsCometAboutQuery',
    'CometGroupAboutRootQuery',
    'GroupsCometGroupAboutContainerQuery',
    'GroupsCometAboutTabQuery',
    'GroupsCometGroupAboutRootQuery',
    'useGroupsCometAboutQuery',
  ],

  findDocIdsInHtml(html, names) {
    const out = {};
    const h = String(html || '');
    (names || []).forEach((name) => {
      const patterns = [
        new RegExp(`"fb_api_req_friendly_name":"${name}"[\\s\\S]{0,900}?"doc_id":"(\\d+)"`),
        new RegExp(`"doc_id":"(\\d+)"[\\s\\S]{0,900}?"fb_api_req_friendly_name":"${name}"`),
      ];
      for (const re of patterns) {
        const m = h.match(re);
        if (m) {
          out[name] = m[1];
          break;
        }
      }
    });
    return out;
  },

  findAboutDocIdsInHtml(html) {
    const found = this.findDocIdsInHtml(html, this.ABOUT_QUERY_NAMES);
    const h = String(html || '');
    const re = /"fb_api_req_friendly_name":"([^"]*About[^"]*)"[\s\S]{0,900}?"doc_id":"(\d+)"/g;
    let m;
    while ((m = re.exec(h)) !== null) {
      found[m[1]] = m[2];
    }
    return found;
  },

  parseVietnameseLabels(text) {
    const t = String(text || '');
    let privacy = 'UNKNOWN';
    if (/Nh[oô]m\s+k[ií]n|nhom\s+kin|GROUP_PRIVACY_SECRET/i.test(t)) privacy = 'SECRET';
    else if (/Nh[oô]m\s+[đd][óo]ng|nhom\s+dong|GROUP_PRIVACY_CLOSED/i.test(t)) privacy = 'CLOSED';
    else if (/Nh[oô]m\s+c[oô]ng\s+khai|nhom\s+cong\s+khai|GROUP_PRIVACY_OPEN/i.test(t)) privacy = 'OPEN';

    let post_approval = 'unknown';
    if (/if_viewer_can_post_without_admin_approval":true/i.test(t)) post_approval = 'none';
    else if (/if_viewer_can_post_without_admin_approval":false/i.test(t)) post_approval = 'required';
    else if (/kh[oô]ng\s+cần\s+phê\s+duyệt|khong\s+can\s+phe\s+duyet|đăng\s+ngay|dang\s+ngay/i.test(t)) post_approval = 'none';
    else if (/chờ\s+phê\s+duyệt|cho\s+phe\s+duyet|chờ\s+duyệt|bài\s+viết.*phê\s+duyệt/i.test(t)) post_approval = 'required';

    return {
      privacy,
      post_approval,
      requires_approval: post_approval === 'required',
    };
  },

  normalizeInvitePermission(node, raw) {
    const text = String(raw || '');
    const v = node?.viewer_can_invite_to_group
      ?? node?.can_viewer_invite_to_group
      ?? node?.if_viewer_can_invite_to_group
      ?? node?.viewer_can_invite
      ?? node?.can_invite
      ?? node?.can_invite_friends
      ?? node?.group_invite_permission;

    if (v === true) return 'can';
    if (v === false) return 'cannot';

    // GraphQL-ish booleans
    if (/"(?:viewer_can_invite_to_group|can_viewer_invite_to_group|if_viewer_can_invite_to_group|viewer_can_invite|can_invite_friends)"\s*:\s*true/i.test(text)) {
      return 'can';
    }
    if (/"(?:viewer_can_invite_to_group|can_viewer_invite_to_group|if_viewer_can_invite_to_group|viewer_can_invite|can_invite_friends)"\s*:\s*false/i.test(text)) {
      return 'cannot';
    }

    // UI text heuristics (vi/en)
    const hasInvite = /(Mời\s+bạn|Mời\s+bè|Mời\s+thành\s+viên|Invite\s+friends|Invite\s+people|Invite\s+members)/i.test(text);
    const blocked = /(Bạn\s+không\s+thể\s+mời|không\s+thể\s+mời|Only\s+admins?\s+can\s+invite|You\s+can't\s+invite|invite\s+disabled)/i.test(text);
    if (hasInvite && !blocked) return 'can';
    if (blocked) return 'cannot';
    return 'unknown';
  },

  normalizeJoinRole(node, raw) {
    const text = String(raw || '');

    const explicit = node?.viewer_join_state
      || node?.viewer_join_state_v2
      || node?.viewer_group_role
      || node?.viewer_role;
    if (explicit) return String(explicit).toUpperCase();

    // Common boolean flags used across various group payloads.
    const isOwner = node?.viewer_is_owner === true || /"viewer_is_owner"\s*:\s*true/i.test(text);
    const isAdmin = node?.viewer_is_admin === true
      || node?.viewer_is_group_admin === true
      || node?.can_viewer_manage_group === true
      || /"(viewer_is_admin|viewer_is_group_admin|can_viewer_manage_group)"\s*:\s*true/i.test(text);
    const isMod = node?.viewer_is_moderator === true
      || node?.viewer_is_group_moderator === true
      || /"(viewer_is_moderator|viewer_is_group_moderator)"\s*:\s*true/i.test(text);

    if (isOwner) return 'OWNER';
    if (isAdmin) return 'ADMIN';
    if (isMod) return 'MODERATOR';

    // Enum-like strings
    if (/"admin_type"\s*:\s*"(OWNER|ADMIN|MODERATOR)"/i.test(text)) {
      return text.match(/"admin_type"\s*:\s*"(OWNER|ADMIN|MODERATOR)"/i)?.[1]?.toUpperCase() || null;
    }
    if (/"viewer_join_state"\s*:\s*"(OWNER|ADMIN|MODERATOR|MEMBER)"/i.test(text)) {
      return text.match(/"viewer_join_state"\s*:\s*"(OWNER|ADMIN|MODERATOR|MEMBER)"/i)?.[1]?.toUpperCase() || null;
    }
    if (/"role"\s*:\s*"(OWNER|ADMIN|MODERATOR|MEMBER)"/i.test(text)) {
      return text.match(/"role"\s*:\s*"(OWNER|ADMIN|MODERATOR|MEMBER)"/i)?.[1]?.toUpperCase() || null;
    }

    // Fallback: if payload contains admin tools keywords, don't guess Admin (too risky) — return null.
    return null;
  },

  parseGroupMetaFromGraphqlJson(json, groupId) {
    const targetId = String(groupId);
    let best = { privacy: 'UNKNOWN', post_approval: 'unknown', requires_approval: false };
    const seen = new Set();

    const walk = (node, depth) => {
      if (!node || depth > 24 || typeof node !== 'object') return;
      if (seen.has(node)) return;
      if (Array.isArray(node)) {
        node.forEach((n) => walk(n, depth + 1));
        return;
      }
      seen.add(node);

      const nodeId = node.id || node.group_id || node.groupID;
      const hasMeta = node.privacy_info
        || node.if_viewer_can_post_without_admin_approval != null
        || node.viewer_can_post_without_admin_approval != null
        || node.viewer_join_state != null
        || node.viewer_is_admin != null
        || node.viewer_is_moderator != null
        || node.can_viewer_manage_group != null
        || node.group_privacy
        || node.privacy;

      if (hasMeta && (!nodeId || String(nodeId) === targetId)) {
        const meta = this.parseGroupMeta(node, JSON.stringify(node));
        best = this.mergeGroupMeta(best, meta);
      }

      Object.values(node).forEach((v) => walk(v, depth + 1));
    };

    walk(json, 0);
    return best;
  },

  scanHtmlForGroupMeta(html, groupId) {
    const id = String(groupId);
    const markers = [`"id":"${id}"`, `"group_id":"${id}"`, `/groups/${id}/`, `/groups/${id}"`];
    let best = { privacy: 'UNKNOWN', post_approval: 'unknown', requires_approval: false };

    for (const marker of markers) {
      let from = 0;
      while (from < html.length) {
        const idx = html.indexOf(marker, from);
        if (idx < 0) break;
        const chunk = html.slice(Math.max(0, idx - 4000), idx + 10000);
        best = this.mergeGroupMeta(best, this.parseVietnameseLabels(chunk));
        best = this.mergeGroupMeta(best, this.parseGroupMeta(null, chunk));
        from = idx + marker.length;
        if (best.privacy !== 'UNKNOWN' && best.post_approval !== 'unknown') break;
      }
      if (best.privacy !== 'UNKNOWN' && best.post_approval !== 'unknown') break;
    }

    const privRe = /"privacy_info"\s*:\s*\{[\s\S]{0,800}?\}/g;
    let m;
    while ((m = privRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, m.index - 1200), m.index + 2500);
      if (!slice.includes(id) && !slice.includes(`/groups/${id}`)) continue;
      best = this.mergeGroupMeta(best, this.parseGroupMeta(null, slice));
    }

    return best;
  },

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

  isJoinedGroupChunk(chunk, { onJoinsPage = true, relaxed = false } = {}) {
    const c = String(chunk).slice(0, 2500);
    if (relaxed && onJoinsPage) {
      if (/viewer_join_state":"NOT_MEMBER"|"is_viewer_member":false/i.test(c)
        && !/viewer_join_state":"(?:MEMBER|ADMIN)"|"is_viewer_member":true/i.test(c)) {
        return false;
      }
      if (/GROUP_SUGGESTION|SUGGESTED_GROUP|recommended_groups|GroupsCometDiscover/i.test(c)) {
        return false;
      }
      return true;
    }
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

  normalizePrivacy(node, raw) {
    const title = String(node?.privacy_info?.title || node?.privacy_info?.subtitle || '').toUpperCase();
    const value = String(
      node?.privacy_info?.value
      || node?.visibility
      || node?.group_privacy
      || node?.privacy
      || '',
    ).toUpperCase();
    const text = `${title} ${value} ${raw}`.toUpperCase();

    if (/SECRET|NH[OÔ]M_K[IÍ]N|NHOM_KIN|PRIVATE_GROUP|GROUP_PRIVACY_SECRET|"SECRET"/.test(text)) {
      return 'SECRET';
    }
    if (/CLOSED|NH[OÔ]M_[ĐD][ÓO]NG|NHOM_DONG|"CLOSED"/.test(text)) {
      return 'CLOSED';
    }
    if (/OPEN|PUBLIC|NH[OÔ]M_C[OÔ]NG_KHAI|NHOM_CONG_KHAI|"OPEN"/.test(text)) {
      return 'OPEN';
    }
    return 'UNKNOWN';
  },

  normalizePostApproval(node, raw) {
    const text = String(raw || '');
    const canPostDirect = node?.if_viewer_can_post_without_admin_approval === true
      || node?.viewer_can_post_without_admin_approval === true
      || /if_viewer_can_post_without_admin_approval":true/i.test(text)
      || /viewer_can_post_without_admin_approval":true/i.test(text)
      || /can_post_without_admin_approval":true/i.test(text);

    const mustApprove = node?.if_viewer_can_post_without_admin_approval === false
      || node?.viewer_can_post_without_admin_approval === false
      || node?.post_permissions?.requires_admin_approval === true
      || node?.admin_approval_required === true
      || /if_viewer_can_post_without_admin_approval":false/i.test(text)
      || /requires_admin_approval":true/i.test(text)
      || /post_requires_admin_approval":true/i.test(text)
      || /approve_all_member_posts":true/i.test(text);

    if (canPostDirect && !mustApprove) return 'none';
    if (mustApprove) return 'required';
    // Soft heuristics (avoid false positives from unrelated "pending_*" blobs)
    if (/(pending_posts|pending_content|posts_must_be_approved)/i.test(text)
      && !/(without\s+admin\s+approval|kh[oô]ng\s+cần\s+phê\s+duyệt|khong\s+can\s+phe\s+duyet)/i.test(text)) {
      return 'required';
    }
    if (/phê duyệt|phe duyet|chờ duyệt|cho duyet|admin approval|pending approval/i.test(text)
      && !/không cần phê duyệt|khong can phe duyet|without admin approval/i.test(text)) {
      return 'required';
    }
    if (/đăng ngay|dang ngay|post without|without approval/i.test(text)) return 'none';
    return 'unknown';
  },

  parseGroupMeta(node, chunkText) {
    const raw = chunkText || JSON.stringify(node || {});
    const privacy = this.normalizePrivacy(node, raw);
    const post_approval = this.normalizePostApproval(node, raw);
    const invite_permission = this.normalizeInvitePermission(node, raw);
    const joinRole = this.normalizeJoinRole(node, raw);
    return {
      privacy,
      join_role: joinRole,
      post_approval,
      requires_approval: post_approval === 'required',
      invite_permission,
    };
  },

  parseGroupMetaFromPage(html, groupId) {
    let best = this.scanHtmlForGroupMeta(html, groupId);
    if (best.privacy === 'UNKNOWN' && best.post_approval === 'unknown') {
      best = this.mergeGroupMeta(best, this.parseVietnameseLabels(String(html).slice(0, 500000)));
    }
    return best;
  },

  mergeGroupMeta(base = {}, incoming = {}) {
    const out = { ...base, ...incoming };
    if (base.privacy && base.privacy !== 'UNKNOWN' && incoming.privacy === 'UNKNOWN') {
      out.privacy = base.privacy;
    }
    if (base.post_approval && base.post_approval !== 'unknown' && incoming.post_approval === 'unknown') {
      out.post_approval = base.post_approval;
      out.requires_approval = base.post_approval === 'required';
    }
    if (incoming.privacy && incoming.privacy !== 'UNKNOWN') out.privacy = incoming.privacy;
    if (incoming.post_approval && incoming.post_approval !== 'unknown') {
      out.post_approval = incoming.post_approval;
      out.requires_approval = incoming.post_approval === 'required';
    }
    if (incoming.invite_permission && incoming.invite_permission !== 'unknown') {
      out.invite_permission = incoming.invite_permission;
    } else if (base.invite_permission && base.invite_permission !== 'unknown' && incoming.invite_permission === 'unknown') {
      out.invite_permission = base.invite_permission;
    }
    if (incoming.join_role) out.join_role = incoming.join_role;
    if (base.meta_source === 'post_learned' && base.post_approval && base.post_approval !== 'unknown' && incoming.post_approval === 'unknown') {
      out.post_approval = base.post_approval;
      out.requires_approval = base.requires_approval;
      out.meta_source = base.meta_source;
    }
    return out;
  },

  mergeGroupEntry(a, b) {
    if (!a) return b;
    if (!b) return a;
    const merged = {
      ...a,
      ...b,
      name: (!this.isFallbackGroupName(b.name) && this.isFallbackGroupName(a.name)) ? b.name : a.name,
      ...this.mergeGroupMeta(a, b),
    };
    if (a.meta_source === 'post_learned' && b.post_approval === 'unknown') {
      merged.post_approval = a.post_approval;
      merged.requires_approval = a.requires_approval;
      merged.meta_source = a.meta_source;
      merged.meta_learned_at = a.meta_learned_at || b.meta_learned_at;
    }
    return merged;
  },

  upsert(map, id, name, meta = {}) {
    if (!id || !/^\d{5,}$/.test(String(id))) return;
    const n = String(name || '').trim();
    if (!n || n.length < 2 || this.isGenericGroupName(n)) return;
    const gid = String(id);
    const entry = {
      id: gid,
      name: n,
      href: `https://www.facebook.com/groups/${gid}/`,
      privacy: meta.privacy || 'UNKNOWN',
      join_role: meta.join_role || null,
      post_approval: meta.post_approval || 'unknown',
      requires_approval: meta.post_approval === 'required' || Boolean(meta.requires_approval),
      invite_permission: meta.invite_permission || 'unknown',
    };
    const existing = map.get(gid);
    if (!existing) {
      map.set(gid, entry);
      return;
    }
    const merged = this.mergeGroupEntry(existing, entry);
    if (!this.isFallbackGroupName(n) && (this.isFallbackGroupName(existing.name) || n.length > existing.name.length)) {
      merged.name = n;
    }
    map.set(gid, merged);
  },

  parseJoinedGroupsFromHtml(html, { onJoinsPage = true, relaxed = false } = {}) {
    const map = new Map();
    if (!html || html.length < 200) return [];

    const joinedOnly = true;
    const chunkOpts = { onJoinsPage, relaxed };
    const typeNames = ['"__typename":"Group"', '"__typename":"XFBGroup"'];
    typeNames.forEach((marker) => {
      const chunks = html.split(marker);
      for (let i = 1; i < chunks.length; i += 1) {
        const chunk = chunks[i].slice(0, 2800);
        if (joinedOnly && !this.isJoinedGroupChunk(chunk, chunkOpts)) continue;
        const idM = chunk.match(/"id":"(\d+)"/);
        const nameM = chunk.match(/"name":"((?:[^"\\]|\\.)*)"/);
        if (idM && nameM) {
          const meta = this.parseGroupMeta(null, chunk);
          this.upsert(map, idM[1], this.decodeFbStr(nameM[1]), meta);
        }
      }
    });

    const urlNameRe = /"url":"https?:\\\/\\\/(?:www\.)?facebook\.com\\\/groups\\\/(\d+)[^"]*"[\s\S]{0,500}?"name":"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = urlNameRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, m.index - 400), m.index + 600);
      if (joinedOnly && !this.isJoinedGroupChunk(slice, chunkOpts)) continue;
      this.upsert(map, m[1], this.decodeFbStr(m[2]), this.parseGroupMeta(null, slice));
    }

    const nameUrlRe = /"name":"((?:[^"\\]|\\.)*)"[\s\S]{0,500}?"url":"https?:\\\/\\\/(?:www\.)?facebook\.com\\\/groups\\\/(\d+)/g;
    while ((m = nameUrlRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, m.index - 400), m.index + 600);
      if (joinedOnly && !this.isJoinedGroupChunk(slice, chunkOpts)) continue;
      this.upsert(map, m[2], this.decodeFbStr(m[1]), this.parseGroupMeta(null, slice));
    }

    const nodeRe = /"node"\s*:\s*\{[^}]*"__typename":"(?:Group|XFBGroup)"[^}]*"id":"(\d+)"[^}]*"name":"((?:[^"\\]|\\.)*)"/g;
    let nm;
    while ((nm = nodeRe.exec(html)) !== null) {
      const slice = html.slice(Math.max(0, nm.index - 400), nm.index + 600);
      if (joinedOnly && !this.isJoinedGroupChunk(slice, chunkOpts)) continue;
      this.upsert(map, nm[1], this.decodeFbStr(nm[2]), this.parseGroupMeta(null, slice));
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
