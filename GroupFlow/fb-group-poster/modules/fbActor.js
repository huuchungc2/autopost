/**
 * Đọc / chuyển actor FB (cá nhân vs fanpage) qua session cookie + profile switch.
 */
window.GF = window.GF || {};

GF.fbActor = {
  decodeFbStr(s) {
    return String(s || '')
      .replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  },

  getCookie(name) {
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  },

  getPersonalId() {
    return this.getCookie('c_user');
  },

  getActingAsId() {
    return this.getCookie('i_user');
  },

  getActiveActorId() {
    return this.getActingAsId() || this.getPersonalId();
  },

  parsePagesFromHtml(html) {
    const pages = new Map();
    const add = (id, name, picture) => {
      if (!id || !/^\d{5,}$/.test(String(id))) return;
      const personalId = this.getPersonalId();
      if (personalId && String(id) === String(personalId)) return;
      const n = String(name || '').trim();
      if (!n || n.length < 2) return;
      if (!pages.has(String(id))) {
        pages.set(String(id), {
          id: String(id),
          name: n,
          type: 'page',
          picture: picture || null,
        });
      }
    };

    const chunks = html.split('"__typename":"Page"');
    for (let i = 1; i < chunks.length; i += 1) {
      const chunk = chunks[i].slice(0, 1000);
      const idM = chunk.match(/"id":"(\d+)"/);
      const nameM = chunk.match(/"name":"((?:[^"\\]|\\.)*)"/);
      const picM = chunk.match(/"profile_picture":\{"uri":"((?:[^"\\]|\\.)*)"/)
        || chunk.match(/"uri":"((?:[^"\\]|\\.)*)"/);
      if (idM && nameM) add(idM[1], this.decodeFbStr(nameM[1]), picM ? this.decodeFbStr(picM[1]) : null);
    }

    const switcherRe = /"profileSwitcherEligibleProfiles"\s*:\s*\[([\s\S]*?)\]\s*,\s*"/;
    const switcherM = html.match(switcherRe);
    if (switcherM) {
      const block = switcherM[1];
      const profileRe = /"profile"\s*:\s*\{[^}]*"id":"(\d+)"[^}]*"name":"((?:[^"\\]|\\.)*)"/g;
      let m;
      while ((m = profileRe.exec(block)) !== null) {
        add(m[1], this.decodeFbStr(m[2]));
      }
    }

    const nodeRe = /"node"\s*:\s*\{[^}]*"__typename":"Page"[^}]*"id":"(\d+)"[^}]*"name":"((?:[^"\\]|\\.)*)"/g;
    let nm;
    while ((nm = nodeRe.exec(html)) !== null) {
      add(nm[1], this.decodeFbStr(nm[2]));
    }

    return [...pages.values()];
  },

  getPersonalName(html) {
    const patterns = [
      /"USER_NAME":"((?:[^"\\]|\\.)*)"/,
      /"SHORT_NAME":"((?:[^"\\]|\\.)*)"/,
      /"NAME":"((?:[^"\\]|\\.)*)"/,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) return this.decodeFbStr(m[1]);
    }
    const menu = document.querySelector('[aria-label*="Account"], [aria-label*="Tài khoản"]');
    if (menu?.getAttribute('aria-label')) {
      return menu.getAttribute('aria-label').replace(/,.*$/, '').trim();
    }
    return document.title.split('|')[0]?.trim() || 'Tài khoản cá nhân';
  },

  getProfiles() {
    const personalId = this.getPersonalId();
    const actingId = this.getActingAsId();
    const activeId = actingId || personalId;
    const html = document.documentElement.innerHTML;
    const pages = this.parsePagesFromHtml(html);

    const personal = {
      id: personalId,
      name: personalId ? this.getPersonalName(html) : null,
      type: 'user',
      picture: null,
    };

    let active;
    if (!personalId) {
      active = null;
    } else if (!actingId || actingId === personalId) {
      active = { ...personal, type: 'user' };
    } else {
      const page = pages.find((p) => p.id === actingId);
      active = page || {
        id: actingId,
        name: this.findPageNameInHtml(html, actingId) || 'Fanpage',
        type: 'page',
        picture: null,
      };
    }

    return { personal, pages, active, activeId };
  },

  findPageNameInHtml(html, pageId) {
    const re = new RegExp(`"id":"${pageId}"[^}]{0,300}?"name":"((?:[^"\\\\]|\\\\.)*)"`);
    const m = html.match(re);
    return m ? this.decodeFbStr(m[1]) : null;
  },

  async fetchManagedPages() {
    try {
      const res = await fetch('https://www.facebook.com/pages/?category=your_pages', {
        credentials: 'include',
      });
      if (!res.ok) return [];
      const html = await res.text();
      return this.parsePagesFromHtml(html);
    } catch {
      return [];
    }
  },

  async getProfilesFull() {
    const base = this.getProfiles();
    if (!base.personal?.id) return base;

    const merged = new Map(base.pages.map((p) => [p.id, p]));
    const extra = await this.fetchManagedPages();
    extra.forEach((p) => {
      if (!merged.has(p.id)) merged.set(p.id, p);
    });

    const pages = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    let active = base.active;
    if (base.activeId && base.activeId !== base.personal.id) {
      active = pages.find((p) => p.id === base.activeId) || base.active;
    } else {
      active = { ...base.personal, type: 'user' };
    }

    return { personal: base.personal, pages, active, activeId: base.activeId };
  },

  getDtsg() {
    if (GF.fbGraphApi) return GF.fbGraphApi.getSession().fb_dtsg;
    const html = document.documentElement.innerHTML;
    return document.querySelector('input[name="fb_dtsg"]')?.value
      || html.match(/"DTSGInitialData",\{"token":"([^"]+)"/)?.[1]
      || '';
  },

  async switchActor(targetId) {
    const personalId = this.getPersonalId();
    if (!personalId) throw new Error('Chưa đăng nhập Facebook');
    const target = String(targetId);
    const current = String(this.getActiveActorId());
    if (target === current) return { ok: true, activeId: target, switched: false };

    const fb_dtsg = this.getDtsg();
    if (!fb_dtsg) throw new Error('Thiếu session FB — mở facebook.com và F5');

    const body = new URLSearchParams();
    body.set('fb_dtsg', fb_dtsg);
    body.set('target_user_id', target);
    body.set('__a', '1');
    body.set('__user', personalId);

    const res = await fetch('https://www.facebook.com/profile/switch/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      credentials: 'include',
      redirect: 'follow',
    });

    if (!res.ok && res.status !== 200) {
      throw new Error(`Chuyển profile thất bại (${res.status})`);
    }

    if (GF_CONTENT?.sleep) await GF_CONTENT.sleep(1200);
    else await new Promise((r) => setTimeout(r, 1200));

    const profiles = this.getProfiles();
    return { ok: true, activeId: profiles.activeId, switched: true, active: profiles.active };
  },

  getActiveUser() {
    const { active, personal } = this.getProfiles();
    if (!active?.id) return null;
    return {
      id: active.id,
      name: active.name,
      type: active.type,
      personalId: personal?.id || null,
      isPage: active.type === 'page',
    };
  },
};
