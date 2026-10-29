// 恢复被误删的 CSS 规则：对比 HEAD 版本，把仍在代码里使用的类规则补回来
const { loadAll, readCss, ROOT, path, fs } = require('./_scan-utils');
const { execSync } = require('child_process');
process.chdir(ROOT);

const all = loadAll();
const code = all.map((f) => f.code).join('\n');
const newCss = readCss();
let oldCss = '';
try {
  oldCss = execSync('git show HEAD:css/style.css', { maxBuffer: 20 * 1024 * 1024 }).toString('utf8');
} catch (e) {
  console.log('无法读取 HEAD 版本 CSS：' + e.message);
  process.exit(0);
}

function blocks(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const brace = text.indexOf('{', i);
    if (brace === -1) break;
    let depth = 0, end = -1;
    for (let j = brace; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end === -1) break;
    out.push({ selector: text.slice(i, brace).trim(), raw: text.slice(i, end + 1) });
    i = end + 1;
  }
  return out;
}

const missing = [];
for (const b of blocks(oldCss)) {
  if (/^\s*@/.test(b.selector)) continue;
  const classes = [...b.selector.matchAll(/\.([A-Za-z][\w-]{2,})/g)].map((m) => m[1]);
  if (!classes.length) continue;
  for (const c of classes) {
    if (new RegExp('\\.' + c + '\\b').test(newCss)) continue;
    if (new RegExp('(^|[^\\w-])' + c + '\\b').test(code)) { missing.push({ cls: c, raw: b.raw }); break; }
  }
}
console.log('需恢复的规则:', missing.length);
missing.forEach((m) => console.log('  .' + m.cls));

if (missing.length && process.argv.includes('--write')) {
  const add = '\n/* ---------- 恢复：仍在使用但被误删的规则 ---------- */\n' + missing.map((m) => m.raw.trim()).join('\n') + '\n';
  fs.writeFileSync(path.join(ROOT, 'css', 'style.css'), newCss.replace(/\s*$/, '\n') + add, 'utf8');
  console.log('已追加到 css/style.css');
}
