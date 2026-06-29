window.GF = window.GF || {};

GF.commentTemplates = {
  DEFAULT: `{Hay quá|Đúng ý|Cảm ơn bạn chia sẻ}
{Mình cũng cần|Để lưu lại|Hữu ích thật}
{Ủng hộ bạn|Tuyệt vời|Like mạnh}
{Cảm ơn thông tin|Bổ ích quá|Hay đó bạn}`,

  pickLine(templates) {
    const raw = String(templates || '').trim() || this.DEFAULT;
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return '';
    return lines[Math.floor(Math.random() * lines.length)];
  },

  /** Ô draft có chữ → spin draft; trống → random dòng mẫu + spin. */
  resolve(draft, templates) {
    const spin = GF.spintax?.spin || ((t) => t);
    const d = String(draft || '').trim();
    if (d) return spin(d);
    const line = this.pickLine(templates);
    return line ? spin(line) : '';
  },
};
