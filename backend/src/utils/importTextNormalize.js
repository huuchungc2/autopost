/**
 * Excel/Word trên Windows đôi khi lưu icon bằng Private Use Area (font Symbol)
 * thay vì emoji Unicode 4-byte. Web không có font đó → hiện ô vuông/ký tự lạ.
 *
 * Quy tắc hay gặp: emoji U+1F690 → PUA U+F690 (giữ 3 hex cuối).
 * Map tay cho ngoại lệ + thử quy tắc 0x1F000 + (pua - 0xF000).
 */
const PUA_TO_EMOJI = new Map([
  [0xf190, '📌'],
  [0xf085, '✅'],
  [0xf075, '✔'],
  [0xf004, '❤'],
  [0xf086, '💬'],
  [0xf1d8, '✈'],
]);

function puaToStandardEmoji(code) {
  if (PUA_TO_EMOJI.has(code)) return PUA_TO_EMOJI.get(code);

  const candidate = 0x1f000 + (code - 0xf000);
  if (candidate >= 0x1f300 && candidate <= 0x1faff) {
    try {
      return String.fromCodePoint(candidate);
    } catch {
      return null;
    }
  }
  return null;
}

function replacePrivateUseSymbols(text) {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code >= 0xf000 && code <= 0xf8ff) {
      out += puaToStandardEmoji(code) || char;
    } else {
      out += char;
    }
  }
  return out;
}

/** Chuẩn hoá nội dung import: PUA → emoji, bỏ replacement char từ lỗi charset cũ. */
export function normalizeImportContent(text) {
  let value = String(text ?? '');
  if (!value) return value;
  value = value.replace(/\uFFFD/g, '');
  value = replacePrivateUseSymbols(value);
  return value.normalize('NFC');
}
