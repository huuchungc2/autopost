/**
 * @see backend/src/utils/importTextNormalize.js
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

export function normalizeImportContent(text) {
  let value = String(text ?? '');
  if (!value) return value;
  value = value.replace(/\uFFFD/g, '');
  value = replacePrivateUseSymbols(value);
  return value.normalize('NFC');
}
