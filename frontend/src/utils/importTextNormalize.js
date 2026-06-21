/**
 * @see backend/src/utils/importTextNormalize.js
 */

const PUA_TO_EMOJI = new Map([
  [0xf190, '📌'],
  [0xf085, '✅'],
  [0xf075, '✔'],
  [0xf690, '🚐'],
  [0xf691, '🚑'],
  [0xf692, '🚒'],
  [0xf693, '🚓'],
  [0xf694, '🚔'],
  [0xf695, '🚕'],
  [0xf696, '🚖'],
  [0xf697, '🚗'],
  [0xf698, '🚘'],
  [0xf699, '🚙'],
  [0xf69a, '🚚'],
  [0xf69b, '🚛'],
  [0xf69c, '🚜'],
  [0xf4f7, '📲'],
  [0xf4ac, '💬'],
  [0xf310, '🌐'],
  [0xf1d8, '✈'],
  [0xf004, '❤'],
  [0xf086, '💬'],
]);

function replacePrivateUseSymbols(text) {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code >= 0xf000 && code <= 0xf8ff) {
      out += PUA_TO_EMOJI.get(code) || char;
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
