// 删除未引用函数：node tests/cleanup-deadcode.js [--write]
const { loadAll } = require('./_scan-utils');
const fs = require('fs');
const all = loadAll();
const write = process.argv.includes('--write');

const defs = {};
for (const f of all) {
  const re = /(?:^|\n)[ \t]*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(f.code))) (defs[f.name] = defs[f.name] || []).push(m[1]);
}
const names = new Set();
Object.values(defs).forEach((a) => a.forEach((n) => names.add(n)));
const refs = {};
for (const n of names) {
  let c = 0;
  const re = new RegExp('(^|[^\\w$.])' + n.replace(/[$]/g, '\\$') + '\\b', 'g');
  for (const f of all) { const h = f.code.match(re); if (h) c += h.length; }
  refs[n] = c;
}
const dead = new Set([...names].filter((n) => refs[n] <= 1));
console.log('未引用函数:', dead.size);
console.log([...dead].sort().join(', '));

function removeFunction(code, name) {
  const re = new RegExp('(^|\\n)([ \\t]*)((?:async\\s+)?function\\s+' + name.replace(/[$]/g, '\\$') + '\\s*\\()');
  const m = re.exec(code);
  if (!m) return { code, removed: false };
  const start = m.index + (m[1] === '\n' ? 1 : 0);
  const i = code.indexOf('{', m.index);
  if (i === -1) return { code, removed: false };
  let depth = 0, end = -1;
  for (let j = i; j < code.length; j++) {
    if (code[j] === '{') depth++;
    else if (code[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  if (end === -1) return { code, removed: false };
  let cutEnd = end + 1;
  while (code[cutEnd] === ' ' || code[cutEnd] === '\t') cutEnd++;
  if (code[cutEnd] === '\n') cutEnd++;
  return { code: code.slice(0, start) + code.slice(cutEnd), removed: true };
}

let total = 0;
for (const f of all) {
  if (f.name === 'index.html') continue;
  const list = (defs[f.name] || []).filter((n) => dead.has(n));
  if (!list.length) continue;
  let code = f.code;
  const removed = [];
  for (const n of list) { const r = removeFunction(code, n); if (r.removed) { code = r.code; removed.push(n); } }
  if (!removed.length) continue;
  code = code.replace(/\n{3,}/g, '\n\n');
  if (write) fs.writeFileSync(f.path, code, 'utf8');
  total += removed.length;
  console.log(`${f.name}: ${removed.join(', ')}`);
}
console.log('合计:', total, write ? '（已写入）' : '（试运行，加 --write 生效）');
