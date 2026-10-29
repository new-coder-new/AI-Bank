// 死代码扫描：node tests/deadcode-scan.js
const { loadAll } = require('./_scan-utils');
const all = loadAll();

const defs = [];
for (const f of all) {
  const re = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(f.code))) defs.push({ name: m[1], file: f.name });
}
const seen = new Set();
const uniq = defs.filter((d) => (seen.has(d.name) ? false : seen.add(d.name)));
const refsOf = (name) => {
  let n = 0;
  const re = new RegExp('(^|[^\\w$.])' + name.replace(/[$]/g, '\\$') + '\\b', 'g');
  for (const f of all) { const h = f.code.match(re); if (h) n += h.length; }
  return n;
};
const counts = uniq.map((d) => ({ ...d, refs: refsOf(d.name) }));
const dead = counts.filter((x) => x.refs <= 1);
const once = counts.filter((x) => x.refs === 2);

console.log('=== 完全未被引用的函数 ===');
console.log(dead.length ? dead.map((d) => `  ${d.file}  ${d.name}`).join('\n') : '（无）');
console.log('\n=== 只被引用 1 次的函数 ===');
once.slice(0, 80).forEach((d) => console.log(`  ${d.file}  ${d.name}`));
console.log(`共 ${once.length} 个`);
