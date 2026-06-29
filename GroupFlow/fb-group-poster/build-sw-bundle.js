const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'modules');
const files = [
  'gfShared.js',
  'localProviders.js',
  'localAi.js',
  'postMedia.js',
  'postMediaStore.js',
  'groupParse.js',
  'groupMetaStore.js',
  'fbSessionBg.js',
  'fbCometTokens.js',
  'postFormat.js',
  'fbPostBg.js',
  'fbCommentBg.js',
  'fbGroupsBg.js',
];

let bundle = '/* AUTO-GENERATED — chạy: node build-sw-bundle.js */\n';
for (const f of files) {
  let code = fs.readFileSync(path.join(root, f), 'utf8').trim();
  code = code.replace(/\bwindow\.GF\b/g, 'globalThis.GF');
  if (!/^globalThis\.GF\s*=/.test(code)) {
    code = `globalThis.GF = globalThis.GF || {};\n${code}`;
  }
  bundle += `\n// ----- ${f} -----\n(function () {\n${code}\n})();\n`;
}

const out = path.join(root, 'swBundle.js');
fs.writeFileSync(out, bundle);
console.log('OK', out, `(${bundle.length} bytes)`);
