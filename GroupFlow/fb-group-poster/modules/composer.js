window.GF = window.GF || {};

GF.composer = {
  VAR_KEYS: ['A', 'B', 'C', 'D'],
  BG_COLORS: [
    { hex: '#18191A', label: 'Không nền', preset: '0' },
    { hex: '#e2013b', label: 'Đỏ', preset: '1903718606535395' },
    { hex: '#dc7a5a', label: 'Cam', preset: '303063890126415' },
    { hex: '#c600ff', label: 'Tím', preset: '1060186232989955' },
    { hex: '#0073ff', label: 'Xanh', preset: '1365883126823705' },
    { hex: '#8395d1', label: 'Lavender', preset: '6524876100975152' },
    { hex: '#33234b', label: 'Tím đậm', preset: '319468561816672' },
    { hex: '#5d6374', label: 'Xám', preset: '1227086461613922' },
  ],

  presetForColor(hex) {
    const h = String(hex || '#18191A').toLowerCase();
    const row = this.BG_COLORS.find((c) => c.hex.toLowerCase() === h);
    return row?.preset || '0';
  },

  htmlToPlain(html) {
    const el = document.createElement('div');
    el.innerHTML = html || '';
    el.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    el.querySelectorAll('p, div, li, h1, h2, h3').forEach((block, i) => {
      if (i > 0) block.insertAdjacentText('beforebegin', '\n');
    });
    return (el.textContent || '').replace(/\u00a0/g, ' ').replace(/\n+$/, '');
  },

  /** Plain text từ Quill — giữ emoji (kể cả paste dạng &lt;img alt="✅"&gt; từ FB/Zalo). */
  getEditorPlainText(ed) {
    if (!ed?.root) return '';
    try {
      const fromDom = this.extractPlainFromEditorDom(ed.root);
      if (fromDom) return fromDom;
    } catch { /* fallback */ }
    if (!ed?.getText) return '';
    return String(ed.getText())
      .replace(/\u00a0/g, ' ')
      .replace(/\n+$/, '');
  },

  extractInlinePlain(node) {
    let s = '';
    const go = (n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        s += n.textContent || '';
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      if (n.tagName === 'BR') return;
      if (n.tagName === 'IMG') {
        s += n.getAttribute('alt') || n.getAttribute('data-emoji') || n.title || '';
        return;
      }
      n.childNodes.forEach(go);
    };
    go(node);
    return s;
  },

  extractPlainFromEditorDom(root) {
    const blocks = root.querySelectorAll(':scope > *');
    if (!blocks.length) {
      return (root.textContent || '').replace(/\u00a0/g, ' ').replace(/\n+$/, '');
    }
    const lines = [];
    blocks.forEach((block) => {
      lines.push(this.extractInlinePlain(block));
    });
    // Mỗi <p> = 1 dòng (giống getText), không chèn thêm dòng trống giữa các <p> liền nhau.
    return lines.join('\n').replace(/\u00a0/g, ' ').replace(/\n+$/, '');
  },

  /** FB/Zalo copy emoji dạng img — đổi thành ký tự Unicode trong model Quill. */
  normalizeEmojiImages(ed) {
    if (!ed?.root || typeof Quill === 'undefined') return;
    const imgs = [...ed.root.querySelectorAll('img')];
    for (const img of imgs) {
      const ch = img.getAttribute('alt') || img.getAttribute('data-emoji') || img.title || '';
      if (!ch || !/\p{Extended_Pictographic}/u.test(ch)) continue;
      try {
        const blot = Quill.find(img);
        if (!blot) continue;
        const index = ed.getIndex(blot);
        ed.deleteText(index, 1, 'silent');
        ed.insertText(index, ch, 'silent');
      } catch { /* ignore */ }
    }
  },

  _scheduleEmojiNormalize(ed) {
    if (!ed) return;
    const key = ed.root?.id || 'default';
    if (!this._emojiNormTimers) this._emojiNormTimers = {};
    clearTimeout(this._emojiNormTimers[key]);
    this._emojiNormTimers[key] = setTimeout(() => {
      this.normalizeEmojiImages(ed);
      this.updateQualityBadge();
    }, 100);
  },

  onEditorCopy(ed, e) {
    const plain = this.getEditorPlainText(ed);
    if (!plain || !e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', plain);
  },

  setEditorPlainText(ed, text) {
    if (!ed) return;
    ed.setText(String(text ?? ''));
  },

  getEditorDelta(ed) {
    if (!ed?.getContents) return null;
    if (ed.getLength() <= 1) return null;
    try {
      return JSON.parse(JSON.stringify(ed.getContents()));
    } catch {
      return ed.getContents();
    }
  },

  setEditorDelta(ed, delta) {
    if (!ed) return;
    if (delta?.ops?.length) {
      ed.setContents(delta);
    } else {
      ed.setText('');
    }
  },

  getVariationDeltas() {
    const out = {};
    this.VAR_KEYS.forEach((k) => {
      const d = this.getEditorDelta(this.editors?.[k]);
      if (d) out[k] = d;
    });
    return out;
  },

  setVariationDeltas(deltas) {
    if (!deltas || typeof deltas !== 'object') return;
    this.VAR_KEYS.forEach((k) => {
      const ed = this.editors?.[k];
      if (!ed) return;
      if (deltas[k]) this.setEditorDelta(ed, deltas[k]);
      else this.setEditorPlainText(ed, '');
    });
    this.updateQualityBadge();
  },

  getVariationTexts() {
    const out = {};
    this.VAR_KEYS.forEach((k) => {
      const ed = this.editors?.[k];
      const plain = this.getEditorPlainText(ed);
      if (plain.trim()) out[k] = plain;
    });
    return out;
  },

  getPrimaryText() {
    const vars = this.getVariationTexts();
    return vars[this.activeVar] || vars.A || '';
  },

  setPrimaryText(text) {
    this.init();
    const ed = this.editors?.A;
    if (!ed) return;
    this.setEditorPlainText(ed, text);
    this.setVariation('A');
    this.updateQualityBadge();
  },

  getVariationsArray() {
    return this.VAR_KEYS.map((k) => this.getVariationTexts()[k]).filter(Boolean);
  },

  insertSpintax() {
    const ed = this.editors?.[this.activeVar];
    if (!ed) return;
    const sel = ed.getSelection(true);
    const idx = sel?.index ?? ed.getLength();
    if (sel?.length) {
      const selected = ed.getText(sel.index, sel.length).trim();
      if (selected) {
        ed.deleteText(sel.index, sel.length);
        ed.insertText(sel.index, `{${selected}|${selected} 2}`);
        return;
      }
    }
    ed.insertText(idx, '{lựa_chọn 1|lựa_chọn 2}');
  },

  wrapSpintax() {
    const ed = this.editors?.[this.activeVar];
    if (!ed) return;
    const sel = ed.getSelection(true);
    if (!sel?.length) return alert('Bôi đen đoạn cần bọc spintax');
    const selected = ed.getText(sel.index, sel.length).trim();
    if (!selected) return;
    ed.deleteText(sel.index, sel.length);
    ed.insertText(sel.index, `{${selected}}`);
  },

  scoreText(text) {
    let score = 40;
    const t = String(text || '');
    if (t.length >= 40) score += 15;
    if (t.length >= 120) score += 10;
    if (/\{[^}]+\|[^}]+\}/.test(t)) score += 15;
    if (/[\u{1F300}-\u{1FAFF}]/u.test(t)) score += 10;
    if (/https?:\/\//i.test(t)) score += 5;
    if (/\n/.test(t)) score += 5;
    return Math.min(100, score);
  },

  updateQualityBadge() {
    const badge = document.getElementById('composerQuality');
    if (!badge) return;
    const score = this.scoreText(this.getPrimaryText());
    badge.textContent = `${score}/100`;
    badge.classList.toggle('good', score >= 70);
    badge.classList.toggle('mid', score >= 45 && score < 70);
    badge.classList.toggle('low', score < 45);
  },

  setVariation(key) {
    this.activeVar = key;
    document.querySelectorAll('[data-var]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.var === key);
    });
    document.querySelectorAll('.composer-editor-pane').forEach((pane) => {
      pane.classList.toggle('hidden', pane.dataset.varPane !== key);
    });
    this.updateQualityBadge();
  },

  setBackground(hex) {
    this.backgroundColor = hex || '#18191A';
    const norm = this.backgroundColor.toLowerCase();
    document.querySelectorAll('[data-bg-color]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.bgColor?.toLowerCase() === norm);
    });
    const dot = document.getElementById('manualColorDot');
    if (dot) {
      const isDefault = norm === '#18191a';
      dot.classList.toggle('empty', isDefault);
      dot.textContent = isDefault ? '×' : '';
      dot.style.background = isDefault ? '' : this.backgroundColor;
      dot.title = isDefault ? 'Không nền' : this.backgroundColor;
    }
  },

  clearAll() {
    this.VAR_KEYS.forEach((k) => {
      const ed = this.editors?.[k];
      if (ed) ed.setText('');
    });
    this.updateQualityBadge();
  },

  init() {
    if (this._ready) return;
    const host = document.getElementById('composerEditors');
    if (!host || typeof Quill === 'undefined') return;

    this.editors = {};
    this.activeVar = 'A';
    this.backgroundColor = '#18191A';

    this.VAR_KEYS.forEach((k) => {
      const pane = document.createElement('div');
      pane.className = `composer-editor-pane${k === 'A' ? '' : ' hidden'}`;
      pane.dataset.varPane = k;
      const mount = document.createElement('div');
      mount.id = `composerQuill${k}`;
      pane.appendChild(mount);
      host.appendChild(pane);
      const ed = new Quill(`#composerQuill${k}`, {
        theme: 'snow',
        placeholder: k === 'A' ? 'Viết nội dung bài… Hỗ trợ {spintax|biến thể}' : `Biến thể ${k} (tuỳ chọn)`,
        modules: { toolbar: [['bold', 'italic'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']] },
      });
      ed.on('text-change', () => {
        this.updateQualityBadge();
        this._scheduleEmojiNormalize(ed);
      });
      ed.root.addEventListener('copy', (e) => this.onEditorCopy(ed, e));
      this.editors[k] = ed;
    });

    document.querySelectorAll('[data-var]').forEach((btn) => {
      btn.addEventListener('click', () => this.setVariation(btn.dataset.var));
    });
    document.getElementById('btnComposerSpintax')?.addEventListener('click', () => this.insertSpintax());
    document.getElementById('btnComposerWrapSpintax')?.addEventListener('click', () => this.wrapSpintax());
    document.querySelectorAll('[data-bg-color]').forEach((btn) => {
      btn.addEventListener('click', () => this.setBackground(btn.dataset.bgColor));
    });

    if (typeof EmojiButton !== 'undefined') {
      const picker = new EmojiButton({ position: 'top-end' });
      picker.on('emoji', (e) => {
        const ed = this.editors[this.activeVar];
        if (!ed) return;
        const sel = ed.getSelection(true);
        const idx = sel?.index ?? ed.getLength();
        ed.insertText(idx, e.emoji);
      });
      document.getElementById('btnComposerEmoji')?.addEventListener('click', (ev) => {
        picker.togglePicker(ev.currentTarget);
      });
    }

    this._ready = true;
    this.setBackground('#18191A');
    this.updateQualityBadge();
  },
};
