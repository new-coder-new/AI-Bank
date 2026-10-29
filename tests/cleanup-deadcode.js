// 删除 A 类死函数：node tests/cleanup-deadcode.js [--write]
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const jsDir = path.join(root, 'js');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const write = process.argv.includes('--write');

const all = jsFiles.map(f => ({ name: f, code: fs.readFileSync(path.join(jsDir, f), 'utf8') }));
all.push({ name: 'index.html', code: html });

// 1) 统计引用
const defsByFile = {};
for (const f of all) {
  const re = /(?:^|\n)[ \t]*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(f.code))) (defsByFile[f.name] = defsByFile[f.name] || []).push(m[1]);
}
const allNames = new Set();
Object.values(defsByFile).forEach(arr => arr.forEach(n => allNames.add(n)));
const refs = {};
for (const n of allNames) {
  let c = 0;
  const re = new RegExp('(^|[^\\w$.])' + n.replace(/[$]/g, '\\$') + '\\b', 'g');
  for (const f of all) { const h = f.code.match(re); if (h) c += h.length; }
  refs[n] = c;
}
const dead = new Set([...allNames].filter(n => refs[n] <= 1));
console.log('待删除函数:', dead.size);
console.log([...dead].sort().join(', '));

// 2) 逐文件按花括号配对删除
function removeFunction(code, name) {
  const re = new RegExp('(^|\\n)([ \\t]*)((?:async\\s+)?function\\s+' + name.replace(/[$]/g, '\\$') + '\\s*\\()');
  const m = re.exec(code);
  if (!m) return { code, removed: false };
  let start = m.index + (m[1] === '\n' ? 1 : 0);
  // 若上方紧邻一行注释（含该函数名或「兼容旧调用」），一并删掉
  let headStart = start;
  const before = code.slice(0, start).split('\n');
  for (let i = before.length - 1; i >= 0; i--) {
    const line = before[i].trim();
    if (!line) continue;
    if (line.startsWith('//') && (line.includes(name) || line.includes('兼容旧调用'))) {
      headStart = code.slice(0, start).lastIndexOf('\n', code.slice(0, start).lastIndexOf('\n')) + 1;
      const linesBefore = code.slice(0, headStart).split('\n');
      const prev = linesBefore[linesBefore.length - 2] || '';
      if (prev.trim().startsWith('//')) headStart = code.slice(0, headStart - 1).lastIndexOf('\n') + 1;
    }
    break;
  }
  // 从函数体首个 { 开始配对
  let i = code.indexOf('{', m.index);
  if (i === -1) return { code, removed: false };
  let depth = 0;
  let end = -1;
  for (let j = i; j < code.length; j++) {
    const ch = code[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  if (end === -1) return { code, removed: false };
  let cutEnd = end + 1;
  while (code[cutEnd] === ' ' || code[cutEnd] === '\t') cutEnd++;
  if (code[cutEnd] === '\n') cutEnd++;
  // 去掉函数后残留的连续空行
  return { code: code.slice(0, Math.min(headStart, start)) + code.slice(cutEnd), removed: true };
}

let totalRemoved = 0;
for (const f of jsFiles) {
  const file = path.join(jsDir, f);
  let code = fs.readFileSync(file, 'utf8');
  const names = (defsByFile[f] || []).filter(n => dead.has(n));
  if (!names.length) continue;
  let removed = [];
  for (const n of names) {
    const r = removeFunction(code, n);
    if (r.removed) { code = r.code; removed.push(n); }
  }
  if (!removed.length) continue;
  code = code.replace(/\n{3,}/g, '\n\n');
  if (write) fs.writeFileSync(file, code, 'utf8');
  totalRemoved += removed.length;
  console.log(`${f}: 删除 ${removed.length} 个 → ${removed.join(', ')}`);
}
console.log('合计删除:', totalRemoved, write ? '（已写入）' : '（试运行，加 --write 生效）');
