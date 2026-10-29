// 恢复被误删的 CSS 规则：对比 HEAD 版本，把仍在代码里使用的类规则补回来
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
process.chdir(root);

const oldCss = execSync('git show HEAD:css/style.css', { maxBuffer: 20 * 1024 * 1024 }).toString('utf8');
const newCss = fs.readFileSync('css/style.css', 'utf8');
const jsFiles = fs.readdirSync('js').filter(f => f.endsWith('.js'));
const code = jsFiles.map(f => fs.readFileSync(path.join('js', f), 'utf8')).join('\n') + fs.readFileSync('index.html', 'utf8');

// 拆旧 CSS 成规则块
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
    out.push({ selector: text.slice(i, brace).trim(), body: text.slice(brace + 1, end), raw: text.slice(i, end + 1) });
    i = end + 1;
  }
  return out;
}

const oldBlocks = blocks(oldCss).filter(b => !/^\s*@/.test(b.selector));
const newCssLower = newCss;
const missing = [];
for (const b of oldBlocks) {
  const classes = [...b.selector.matchAll(/\.([A-Za-z][\w-]{2,})/g)].map(m => m[1]);
  if (!classes.length) continue;
  for (const c of classes) {
    if (new RegExp('\\.' + c + '\\b').test(newCssLower)) continue;          // 新 CSS 里还有
    const inCode = new RegExp('(^|[^\\w-])' + c + '\\b').test(code);        // 代码里还在用
    if (inCode) { missing.push({ cls: c, raw: b.raw }); break; }
  }
}
console.log('需恢复的规则:', missing.length);
missing.forEach(m => console.log('  .' + m.cls));

if (missing.length) {
  // 追加到文件末尾（选择器不变，靠后覆盖前面的）
  const add = '\n/* ---------- 恢复：仍在使用但被误删的规则 ---------- */\n' +
    missing.map(m => m.raw.trim()).join('\n') + '\n';
  fs.writeFileSync('css/style.css', newCss.replace(/\s*$/, '\n') + add, 'utf8');
  console.log('已追加到 css/style.css');
}
