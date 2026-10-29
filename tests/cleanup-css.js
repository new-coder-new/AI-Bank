// 删除未使用的 CSS 规则：node tests/cleanup-css.js [--write]
const { loadAll, readCss, ROOT, path, fs } = require('./_scan-utils');
const all = loadAll();
const cssPath = path.join(ROOT, 'css', 'style.css');
const css = readCss();
const write = process.argv.includes('--write');

// 代码里出现过的类名（class="..." / classList.*('...') / className='...'）
const used = new Set();
{
  const code = all.map((f) => f.code).join('\n');
  const re2 = /class="([^"]+)"/g;
  let m;
  while ((m = re2.exec(code))) m[1].split(/\s+/).forEach((c) => c && used.add(c));
  const re3 = /(?:classList\.(?:add|remove|toggle)\(|className\s*=\s*)'([^']+)'/g;
  while ((m = re3.exec(code))) m[1].split(/\s+/).forEach((c) => c && used.add(c));
}

const cssClasses = new Set();
{
  const re = /\.([A-Za-z][\w-]{2,})/g;
  let m; while ((m = re.exec(css))) cssClasses.add(m[1]);
}
const liveClasses = new Set([...cssClasses].filter((c) => used.has(c)));
const deadClasses = new Set([...cssClasses].filter((c) => !used.has(c)));
console.log('CSS 类:', cssClasses.size, '在用:', liveClasses.size, '未用:', deadClasses.size);

const CONTEXT = new Set(['dark-mode', 'msg-bubble', 'agent-bubble', 'message', 'user', 'ai']);
function selectorAlive(sel) {
  const classes = [...sel.matchAll(/\.([A-Za-z][\w-]{2,})/g)].map((m) => m[1]);
  if (!classes.length) return true;
  if (classes.some((c) => liveClasses.has(c))) return true;
  if (classes.every((c) => CONTEXT.has(c) || deadClasses.has(c))) return false;
  return true;
}

function filterRules(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const brace = text.indexOf('{', i);
    if (brace === -1) { out += text.slice(i); break; }
    const head = text.slice(i, brace);
    let depth = 0, end = -1;
    for (let j = brace; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end === -1) { out += text.slice(i); break; }
    const body = text.slice(brace + 1, end);
    if (/^\s*@/.test(head)) {
      if (/@(media|supports)/.test(head)) {
        const inner = filterRules(body);
        if (inner.trim()) out += head + '{' + inner + '}';
      } else {
        out += text.slice(i, end + 1);
      }
    } else {
      const selectors = head.split(',').map((s) => s.trim()).filter(Boolean);
      const alive = selectors.filter(selectorAlive);
      if (alive.length) out += alive.join(', ') + '{' + body + '}';
    }
    i = end + 1;
  }
  return out;
}

const cleaned = filterRules(css).replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');
console.log('原始:', (Buffer.byteLength(css) / 1024).toFixed(1), 'KB →', (Buffer.byteLength(cleaned) / 1024).toFixed(1), 'KB');
if (write) { fs.writeFileSync(cssPath, cleaned, 'utf8'); console.log('已写入 css/style.css'); }
else console.log('（试运行，加 --write 生效）');
