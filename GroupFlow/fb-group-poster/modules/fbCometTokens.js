/**
 * Token Comet (__dyn, __csr, …) — khớp GPP worker (BitSet compressor).
 * FB upload ảnh hay trả「Rất tiếc, đã xảy ra lỗi」nếu thiếu các param này.
 */
globalThis.GF = globalThis.GF || {};

class BitSetCompressor {
  constructor() {
    this.bits = [];
  }

  update(indices) {
    let max = -1;
    for (const i of indices) {
      if (i > max) max = i;
    }
    if (max >= this.bits.length) {
      const next = new Array(max + 1).fill(0);
      for (let t = 0; t < this.bits.length; t += 1) next[t] = this.bits[t];
      this.bits = next;
    }
    for (const i of indices) this.bits[i] = 1;
    return this;
  }

  compress() {
    if (!this.bits.length) return '';
    let out = '';
    let run = 1;
    let cur = this.bits[0];
    out += cur.toString();
    for (let i = 1; i < this.bits.length; i += 1) {
      if (this.bits[i] === cur) {
        run += 1;
      } else {
        const bin = run.toString(2);
        out += '0'.repeat(bin.length - 1) + bin;
        cur = this.bits[i];
        run = 1;
      }
    }
    const tail = run.toString(2);
    out += '0'.repeat(tail.length - 1) + tail;
    while (out.length % 6 !== 0) out += '0';
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';
    let encoded = '';
    for (let i = 0; i < out.length; i += 6) {
      encoded += alphabet[parseInt(out.slice(i, i + 6), 2)];
    }
    return encoded;
  }
}

function pickRandomIndices(poolSize, count) {
  return Array.from({ length: poolSize }, (_, i) => i)
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
}

function buildDynLike(poolSize, minPick, maxPick) {
  try {
    const c = new BitSetCompressor();
    const n = Math.floor(Math.random() * (maxPick - minPick)) + minPick;
    return c.update(pickRandomIndices(poolSize, n)).compress();
  } catch {
    return '';
  }
}

function buildHsdpHblp(poolSize) {
  try {
    const c = new BitSetCompressor();
    const n = Math.floor(Math.random() * (0.15 * poolSize)) + Math.floor(0.3 * poolSize);
    return c.update(pickRandomIndices(poolSize, n)).compress();
  } catch {
    return '';
  }
}

globalThis.GF.fbCometTokens = {
  buildDyn() {
    return buildDynLike(1600, 500, 700);
  },
  buildCsr() {
    return buildDynLike(1800, 500, 700);
  },
  buildHsdp() {
    return buildHsdpHblp(1800);
  },
  buildHblp() {
    return buildHsdpHblp(1400);
  },

  parseFromHtml(html) {
    const h = String(html || '');
    const pick = (key) => {
      const m = h.match(new RegExp(`"${key}":"([^"]+)"`))
        || h.match(new RegExp(`${key}=([^&"']+)`));
      return m?.[1] || null;
    };
    return {
      __dyn: pick('__dyn'),
      __csr: pick('__csr'),
      __hs: h.match(/"haste_session":"([^"]+)"/)?.[1] || null,
    };
  },

  // __dyn/__csr là bitset mã hoá CHÍNH XÁC module JS/CSS trang đang tải — không đoán/sinh ngẫu
  // nhiên được, Facebook coi giá trị sai/ngẫu nhiên là dấu hiệu bot rõ ràng (lỗi 1357004 chung
  // chung). Ưu tiên giá trị THẬT bắt được từ chính request trang Facebook tự gửi lúc user browse
  // bình thường (content.js/pageNetworkHook.js → gf_comet_tokens), rồi mới tới giá trị parse từ
  // HTML lúc warmup, ngẫu nhiên chỉ còn là phao cứu sinh cuối cùng khi chưa bắt được lần nào.
  async applyToSearchParams(params, session, htmlTokens) {
    const parsed = htmlTokens || {};
    const CT = globalThis.GF.fbCometTokens;
    const stored = (await chrome.storage.local.get('gf_comet_tokens').catch(() => ({}))).gf_comet_tokens || {};
    params.set('__dyn', stored.dyn || parsed.__dyn || CT.buildDyn());
    params.set('__csr', stored.csr || parsed.__csr || CT.buildCsr());
    params.set('__hsdp', CT.buildHsdp());
    params.set('__hblp', CT.buildHblp());
    params.set('__hs', parsed.__hs || session.hs || '20160.HYP:comet_pkg.2.1...1');
    if (!params.get('__rev')) params.set('__rev', session.rev || '1007600000');
    return params;
  },
};
