const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'modules');
const files = [
  'gfShared.js',
  'postMedia.js',
  'groupParse.js',
  'fbSessionBg.js',
  'postFormat.js',
  'fbPostBg.js',
  'fbCommentBg.js',
  'fbGroupsBg.js',
];

let bundle = '/* AUTO-GENERATED — chạy: node build-sw-bundle.js */\n';
for (const f of files) {
  const code = fs.readFileSync(path.join(root, f), 'utf8').trim();
  bundle += `\n// ----- ${f} -----\n(function () {\n${code}\n})();\n`;
}

const out = path.join(root, 'swBundle.js');
fs.writeFileSync(out, bundle);
console.log('OK', out, `(${bundle.length} bytes)`);
