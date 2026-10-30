// 分析 guide.js 顶层声明，输出名称 + 行范围（用于拆分）
const fs = require('fs');
const code = fs.readFileSync('js/flows/guide.js', 'utf8');
const lines = code.split('\n');

const items = [];
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  const mFn = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line);
  const mVar = /^(?:var|const|let)\s+([A-Za-z_$][\w$]*)\s*=/.exec(line);
  if (mFn) {
    const name = mFn[1];
    let depth = 0, j = i, started = false;
    for (; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') { depth--; }
      }
      if (started && depth === 0) break;
    }
    items.push({ kind: 'function', name, start: i + 1, end: j + 1, lines: j - i + 1 });
    i = j + 1;
    continue;
  }
  if (mVar) {
    const name = mVar[1];
    let depth = 0, j = i, ended = false;
    for (; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if ('{[('.includes(ch)) depth++;
        else if ('}])'.includes(ch)) depth--;
      }
      if (depth <= 0 && /;\s*$/.test(lines[j])) { ended = true; break; }
    }
    items.push({ kind: 'var', name, start: i + 1, end: (ended ? j : i) + 1, lines: (ended ? j : i) - i + 1 });
    i = (ended ? j : i) + 1;
    continue;
  }
  i++;
}

const total = lines.length;
const coverage = items.reduce((a, b) => a + b.lines, 0);
console.log('总行数', total, '顶层声明', items.length, '覆盖', coverage, '行');
console.log('--- 按行数排序前 25 ---');
items.slice().sort((a, b) => b.lines - a.lines).slice(0, 25)
  .forEach(x => console.log(`${String(x.lines).padStart(5)} 行  ${x.kind.padEnd(8)} ${x.name}  (${x.start}-${x.end})`));
console.log('--- 含 AI / LLM 的声明 ---');
items.filter(x => /AI|LLM|llm|Ai/i.test(x.name)).forEach(x => console.log(`${String(x.lines).padStart(5)} 行  ${x.kind.padEnd(8)} ${x.name}`));
fs.writeFileSync('data/guide-toplevel.json', JSON.stringify(items, null, 2));
console.log('\n明细已写入 data/guide-toplevel.json');
