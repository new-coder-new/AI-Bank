// 删除未使用的 CSS 规则：node tests/cleanup-css.js [--write]
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const cssPath = path.join(root, 'css', 'style.css');
const jsDir = path.join(root, 'js');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const code = jsFiles.map(f => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n') + html;

const css = fs.readFileSync(cssPath, 'utf8');
const write = process.argv.includes('--write');

// 1) 收集所有「代码里出现过」的类名
const used = new Set();
{
  const re = /\.([A-Za-z][\w-]{2,})/g;   // 只挑长度>=3，避免误伤 .a / .b
  // 类名也可能出现在 class="a b c" 里而不带点
  const re2 = /class="([^"]+)"/g;
  let m;
  while ((m = re2.exec(code))) m[1].split(/\s+/).forEach(c => { if (c) used.add(c); });
  // JS 里拼 class 字符串（classList.add('x') / className = 'x'）
  const re3 = /(?:classList\.(?:add|remove|toggle)\(|className\s*=\s*)'([^']+)'/g;
  while ((m = re3.exec(code))) m[1].split(/\s+/).forEach(c => { if (c) used.add(c); });
  // 动态拼接：'xxx-' + n 这类前缀，把该前缀下所有样式视为在用
}
// 2) 从 CSS 中出现的类名反推：只保留「样式里有、代码里也有」的
const cssClasses = new Set();
{
  const re = /\.([A-Za-z][\w-]{2,})/g;
  let m; while ((m = re.exec(css))) cssClasses.add(m[1]);
}
const liveClasses = new Set([...cssClasses].filter(c => used.has(c)));
const deadClasses = new Set([...cssClasses].filter(c => !used.has(c)));
console.log('CSS 类:', cssClasses.size, '在用:', liveClasses.size, '未用:', deadClasses.size);

const CONTEXT = new Set(['dark-mode', 'msg-bubble', 'agent-bubble', 'message', 'user', 'ai']);
function selectorAlive(sel) {
  const classes = [...sel.matchAll(/\.([A-Za-z][\w-]{2,})/g)].map(m => m[1]);
  if (!classes.length) return true;                     // 纯标签/属性选择器，保留
  if (classes.some(c => liveClasses.has(c))) return true;
  // .dark-mode .xxx：只要 .xxx 都没用就删
  if (classes.every(c => CONTEXT.has(c) || deadClasses.has(c))) return false;
  return true;
}

// 3) 解析 CSS（支持 @media 嵌套），过滤选择器
function filterRules(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const brace = text.indexOf('{', i);
    if (brace === -1) { out += text.slice(i); break; }
    const head = text.slice(i, brace);
    // 找匹配的右花括号
    let depth = 0, end = -1;
    for (let j = brace; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end === -1) { out += text.slice(i); break; }
    const body = text.slice(brace + 1, end);
    const isAt = /^\s*@/.test(head);
    if (isAt) {
      // @media / @supports：递归过滤内部；@keyframes 等原样保留
      if (/@(media|supports)/.test(head)) {
        const inner = filterRules(body);
        if (inner.trim()) out += head + '{' + inner + '}';
      } else {
        out += text.slice(i, end + 1);
      }
    } else {
      const selectors = head.split(',').map(s => s.trim()).filter(Boolean);
      const alive = selectors.filter(selectorAlive);
      if (alive.length) {
        out += alive.join(', ') + '{' + body + '}';
      }
    }
    i = end + 1;
  }
  return out;
}

const cleaned = filterRules(css)
  .replace(/\n{3,}/g, '\n\n')
  .replace(/[ \t]+\n/g, '\n');

console.log('原始:', (Buffer.byteLength(css) / 1024).toFixed(1), 'KB →', (Buffer.byteLength(cleaned) / 1024).toFixed(1), 'KB');
if (write) {
  fs.writeFileSync(cssPath, cleaned, 'utf8');
  console.log('已写入 css/style.css');
} else {
  console.log('（试运行，加 --write 生效）');
}
