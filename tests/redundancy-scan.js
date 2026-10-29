// 冗余资源扫描：node tests/redundancy-scan.js
const { loadAll, readCss, JS_FILES, rel, ROOT, path, fs } = require('./_scan-utils');
const all = loadAll();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const notIncluded = JS_FILES.filter((p) => !html.includes(rel(p)));
console.log('=== 未被 index.html 引入的 JS ===');
console.log(notIncluded.length ? notIncluded.map((p) => '  ' + rel(p)).join('\n') : '（无）');

const defs = {};
for (const f of JS_FILES) {
  const code = fs.readFileSync(f, 'utf8');
  const re = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(code))) (defs[m[1]] = defs[m[1]] || []).push(rel(f));
}
const dupes = Object.entries(defs).filter(([, v]) => v.length > 1);
console.log('\n=== 同名函数重复定义 ===');
console.log(dupes.length ? dupes.map(([n, v]) => `  ${n}  ← ${v.join(', ')}`).join('\n') : '（无）');

const css = readCss();
const codeText = all.map((f) => f.code).join('\n');
const cls = new Set();
{
  const re = /\.([A-Za-z][\w-]{2,})/g;
  let m; while ((m = re.exec(css))) cls.add(m[1]);
}
const unused = [...cls].filter((c) => !new RegExp('(^|[^\\w-])' + c + '\\b').test(codeText));
let unusedBytes = 0;
for (const r of css.split('}')) {
  const sel = r.split('{')[0] || '';
  if (!sel.includes('.')) continue;
  const names = [...sel.matchAll(/\.([A-Za-z][\w-]{2,})/g)].map((m) => m[1]);
  if (names.length && names.every((n) => unused.includes(n))) unusedBytes += Buffer.byteLength(r) + 1;
}
console.log('\n=== CSS 未使用类 ===');
console.log(`共 ${unused.length} 个，相关规则约 ${(unusedBytes / 1024).toFixed(1)} KB / 文件 ${(Buffer.byteLength(css) / 1024).toFixed(1)} KB`);
if (unused.length) console.log('  ' + unused.join(', '));

console.log('\n=== 体积 ===');
all.map((f) => ({ f: f.name, kb: Buffer.byteLength(f.code) / 1024 }))
  .concat([{ f: 'css/style.css', kb: Buffer.byteLength(css) / 1024 }, { f: 'README.md', kb: Buffer.byteLength(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')) / 1024 }])
  .sort((a, b) => b.kb - a.kb).slice(0, 10)
  .forEach((x) => console.log(`  ${x.f}  ${x.kb.toFixed(1)} KB`));
