window.GF = window.GF || {};

GF.commentTemplates = {
  DEFAULT: `{Hay quá|Đúng ý ghê|Cảm ơn bạn chia sẻ|Thông tin hữu ích quá|Cảm ơn bạn nhé}
{Mình cũng đang cần|Để mình lưu lại|Hữu ích thật sự|Đang tìm đúng cái này|Lưu lại xem sau}
{Ủng hộ bạn|Tuyệt vời luôn|Like mạnh cho bạn|Ủng hộ nhiệt tình|Quá đỉnh}
{Cảm ơn thông tin|Bổ ích quá|Hay đó bạn ơi|Thông tin quý giá|Cảm ơn đã chia sẻ nha}
{Bài viết chất lượng|Nội dung hay quá|Đọc xong thấy hữu ích|Chia sẻ hay đó|Cảm ơn bạn đã đăng bài}
{Đúng thứ mình đang tìm|Vừa đúng ý mình luôn|Tìm được rồi nè|May quá gặp đúng bài này|Đang cần đúng cái này}
{Theo dõi bạn để cập nhật thêm|Follow trang luôn|Sẽ theo dõi thường xuyên|Lưu bài để xem lại|Đánh dấu bài này}
{Chúc bạn thuận lợi|Chúc mọi việc suôn sẻ|Chúc bạn sớm thành công|Chúc bạn nhiều may mắn|Chúc bạn thật tốt}
{Rất đáng tham khảo|Nên đọc bài này|Bạn nào cần thì xem thử|Đáng để tìm hiểu|Nên lưu lại tham khảo}
{Chia sẻ hữu ích thế này hiếm lắm|Cảm ơn bạn đã dành thời gian chia sẻ|Bài chia sẻ tâm huyết|Rất chân thành cảm ơn|Cảm ơn bạn nhiều lắm}`,

  // Default cũ (trước v1.0.182) — nếu `commentTemplates` đã lưu trong storage khớp y hệt 1 trong
  // các bản này, coi như user CHƯA từng tự sửa (chỉ đang giữ nguyên mẫu mặc định lúc lưu Cài đặt
  // lần nào đó), nên tự nâng cấp lên DEFAULT mới thay vì để mẫu cũ mắc kẹt vĩnh viễn — xem
  // migrateLegacyCommentTemplates() (sidepanel.js).
  LEGACY_DEFAULTS: [
    `{Hay quá|Đúng ý|Cảm ơn bạn chia sẻ}
{Mình cũng cần|Để lưu lại|Hữu ích thật}
{Ủng hộ bạn|Tuyệt vời|Like mạnh}
{Cảm ơn thông tin|Bổ ích quá|Hay đó bạn}`,
  ],

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
