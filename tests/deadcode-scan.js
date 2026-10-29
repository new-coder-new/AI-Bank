// 死代码扫描：node tests/deadcode-scan.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const jsFiles = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'));
const htmlFiles = ['index.html'];
const all = [];
for (const f of jsFiles) all.push({ name: 'js/' + f, code: fs.readFileSync(path.join(root, 'js', f), 'utf8') });
for (const f of htmlFiles) all.push({ name: f, code: fs.readFileSync(path.join(root, f), 'utf8') });

// 1) 函数定义 vs 引用
const defs = [];
for (const f of all) {
  const re = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(f.code))) defs.push({ name: m[1], file: f.name });
}
// 同名只保留首次
const seen = new Set();
const uniq = defs.filter(d => (seen.has(d.name) ? false : seen.add(d.name)));

const refsOf = (name) => {
  let n = 0;
  const re = new RegExp('(^|[^\\w$.])' + name.replace(/[$]/g, '\\$') + '\\b', 'g');
  for (const f of all) {
    const hits = f.code.match(re);
    if (hits) n += hits.length;
  }
  return n;
};

const deadFns = [];
for (const d of uniq) {
  const total = refsOf(d.name);
  // 定义本身算 1 次
  if (total <= 1) deadFns.push({ name: d.name, file: d.file, refs: total });
}
// 只被自己内部递归/trace 的，也算可疑（refs<=2）
const lowFns = uniq
  .map(d => ({ name: d.name, file: d.file, refs: refsOf(d.name) }))
  .filter(x => x.refs === 2)
  .sort((a, b) => a.name.localeCompare(b.name));

// 2) CSS 类未被引用
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const classes = new Set();
{
  const re = /\.([A-Za-z][\w-]{2,})/g;
  let m;
  while ((m = re.exec(css))) classes.add(m[1]);
}
const usageText = all.map(f => f.code).join('\n');
const unusedClasses = [];
for (const c of classes) {
  const re = new RegExp('(^|[^\\w-])' + c + '\\b');
  if (!re.test(usageText)) unusedClasses.push(c);
}

// 3) 文件体积
const sizes = all.map(f => ({ file: f.name, kb: (Buffer.byteLength(f.code) / 1024).toFixed(1) }))
  .concat([{ file: 'css/style.css', kb: (Buffer.byteLength(css) / 1024).toFixed(1) }]);

// 4) 疑似遗留：带 Legacy / ShowAll 包装 / 未启用的开关
const legacy = [];
for (const f of all) {
  const lines = f.code.split('\n');
  lines.forEach((line, i) => {
    if (/Legacy|_deprecated|已废弃|兼容旧调用|TODO|FIXME/.test(line)) legacy.push({ file: f.name, line: i + 1, text: line.trim().slice(0, 100) });
  });
}

console.log('=== 完全未被引用的函数（定义 1 次、无其他引用）===');
if (!deadFns.length) console.log('（无）');
deadFns.forEach(d => console.log(`  ${d.file}  ${d.name}`));

console.log('\n=== 只被引用 1 次的函数（疑似仅自用/无外部调用）===');
if (!lowFns.length) console.log('（无）');
lowFns.forEach(d => console.log(`  ${d.file}  ${d.name}`));

console.log('\n=== CSS 中定义但代码里未使用的类（前 60）===');
console.log(unusedClasses.slice(0, 60).join(', ') || '（无）');
console.log(`共 ${unusedClasses.length} 个`);

console.log('\n=== 疑似遗留标记 ===');
legacy.forEach(l => console.log(`  ${l.file}:${l.line}  ${l.text}`));

console.log('\n=== 文件体积（KB）===');
sizes.sort((a, b) => parseFloat(b.kb) - parseFloat(a.kb)).slice(0, 8).forEach(s => console.log(`  ${s.file}  ${s.kb}`));
