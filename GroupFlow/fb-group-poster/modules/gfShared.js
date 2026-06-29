/** Shared GF namespace — dùng trong SW bundle (IIFE) và content script. */
globalThis.GF = globalThis.GF || {};
const GF = globalThis.GF;

GF.textFormat = {
  escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  /** Quill delta → HTML đơn giản cho paste Cổ điển (bold/italic/xuống dòng). */
  deltaToHtml(delta) {
    if (!delta?.ops?.length) return '';
    let html = '';
    let inList = false;
    const closeList = () => {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
    };
    for (const op of delta.ops) {
      if (typeof op.insert !== 'string') continue;
      let chunk = this.escapeHtml(op.insert);
      const attrs = op.attributes || {};
      if (attrs.list === 'bullet') {
        if (!inList) {
          closeList();
          html += '<ul>';
          inList = true;
        }
        chunk = chunk.replace(/\n$/, '');
        if (!chunk) continue;
        chunk = `<li>${chunk}</li>`;
      } else {
        closeList();
        if (attrs.bold && attrs.italic) chunk = `<strong><em>${chunk}</em></strong>`;
        else if (attrs.bold) chunk = `<strong>${chunk}</strong>`;
        else if (attrs.italic) chunk = `<em>${chunk}</em>`;
        chunk = chunk.replace(/\n/g, '<br>');
      }
      html += chunk;
    }
    closeList();
    return html
      .replace(/<br><\/ul>/g, '</ul>')
      .replace(/<ul><li>/g, '<ul><li>')
      .replace(/<\/li><br>/g, '</li>');
  },

  plainFromHtml(html) {
    const el = document.createElement('div');
    el.innerHTML = String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
      .replace(/<\/?p[^>]*>/gi, '');
    return (el.textContent || '').replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  },

  /** `**bold**`, `*italic*`, xuống dòng — cho nội dung lưu plain/markdown trong queue. */
  markdownToHtml(text) {
    const raw = String(text || '');
    if (!raw.trim()) return '';
    const lines = raw.split(/\r?\n/);
    const out = [];
    for (const line of lines) {
      let s = this.escapeHtml(line);
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
      // Chỉ `-` / `•` / số — giữ emoji đầu dòng (✅📦🌐) vì FB không render list HTML chuẩn
      if (/^[-•]\s/.test(line.trim()) || /^\d+\.\s/.test(line.trim())) {
        out.push(`<li>${s.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '')}</li>`);
      } else if (s) {
        out.push(s);
      } else {
        out.push('');
      }
    }
    const html = [];
    let inList = false;
    for (const chunk of out) {
      if (chunk.startsWith('<li>')) {
        if (!inList) {
          html.push('<ul>');
          inList = true;
        }
        html.push(chunk);
      } else {
        if (inList) {
          html.push('</ul>');
          inList = false;
        }
        if (chunk) html.push(chunk);
        else html.push('<br>');
      }
    }
    if (inList) html.push('</ul>');
    return html.join('<br>').replace(/(<br>)+<ul>/g, '<ul>').replace(/<\/ul>(<br>)+/g, '</ul>');
  },

  UNICODE_BOLD: {
    A: '𝗔', B: '𝗕', C: '𝗖', D: '𝗗', E: '𝗘', F: '𝗙', G: '𝗚', H: '𝗛', I: '𝗜', J: '𝗝',
    K: '𝗞', L: '𝗟', M: '𝗠', N: '𝗡', O: '𝗢', P: '𝗣', Q: '𝗤', R: '𝗥', S: '𝗦', T: '𝗧',
    U: '𝗨', V: '𝗩', W: '𝗪', X: '𝗫', Y: '𝗬', Z: '𝗭',
    a: '𝗮', b: '𝗯', c: '𝗰', d: '𝗱', e: '𝗲', f: '𝗳', g: '𝗴', h: '𝗵', i: '𝗶', j: '𝗷',
    k: '𝗸', l: '𝗹', m: '𝗺', n: '𝗻', o: '𝗼', p: '𝗽', q: '𝗾', r: '𝗿', s: '𝘀', t: '𝘁',
    u: '𝘂', v: '𝘃', w: '𝘄', x: '𝘅', y: '𝘆', z: '𝘇',
    '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵',
  },

  toUnicodeBold(inner) {
    const map = this.UNICODE_BOLD;
    return String(inner || '').split('').map((ch) => map[ch] || ch).join('');
  },

  markdownToUnicode(text) {
    return String(text || '')
      .replace(/\*\*([^*]+)\*\*/g, (_, inner) => this.toUnicodeBold(inner))
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
  },

  stripMarkdown(text) {
    return String(text || '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
  },

  hasMarkdown(text) {
    return /\*\*[^*]+\*\*|\*[^*]+\*/.test(String(text || ''));
  },

  /** Dòng cần paste: có emoji bất kỳ chỗ nào hoặc `**đậm**` — còn lại gõ. */
  lineHasEmoji(text) {
    return /\p{Extended_Pictographic}/u.test(String(text || ''));
  },

  hasAnyEmoji(text) {
    return this.lineHasEmoji(text);
  },

  needsPasteLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return false;
    if (this.hasMarkdown(trimmed)) return true;
    return this.lineHasEmoji(trimmed);
  },

  /** Gom dòng liên tiếp cùng mode paste/type cho Cổ điển hybrid. */
  splitHybridSegments(text) {
    const lines = String(text || '').split(/\r?\n/);
    const segments = [];
    let buf = [];
    let bufMode = null;

    const flush = () => {
      if (!buf.length) return;
      const joined = buf.join('\n');
      if (joined.trim()) segments.push({ mode: bufMode, text: joined });
      buf = [];
      bufMode = null;
    };

    for (const line of lines) {
      let mode;
      if (!String(line).trim()) {
        mode = bufMode || 'type';
      } else {
        mode = this.needsPasteLine(line) ? 'paste' : 'type';
      }
      if (bufMode && bufMode !== mode) flush();
      bufMode = mode;
      buf.push(line);
    }
    flush();
    return segments;
  },

  segmentPasteHtml(text) {
    return this.markdownToHtml(text);
  },

  prepareClassicPayload({ text, htmlFromDelta }) {
    const plain = String(text || '');
    const html = htmlFromDelta || this.markdownToHtml(plain);
    const unicode = this.markdownToUnicode(plain);
    const stripped = this.stripMarkdown(plain);
    return { plain, html, unicode, stripped, hasMd: this.hasMarkdown(plain) };
  },
};