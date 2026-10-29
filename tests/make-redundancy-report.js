// 生成冗余检查报告：node tests/make-redundancy-report.js
const { loadAll, readCss, JS_FILES, rel, ROOT, path, fs } = require('./_scan-utils');
const all = loadAll();
const html = all.find((f) => f.name === 'index.html').code;
const css = readCss();

const defs = [];
for (const f of all) {
  const re = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(f.code))) defs.push({ name: m[1], file: f.name });
}
const seen = new Set();
const uniq = defs.filter((d) => (seen.has(d.name) ? false : seen.add(d.name)));
const refs = (name) => {
  let n = 0;
  const re = new RegExp('(^|[^\\w$.])' + name.replace(/[$]/g, '\\$') + '\\b', 'g');
  for (const f of all) { const h = f.code.match(re); if (h) n += h.length; }
  return n;
};
const counts = uniq.map((d) => ({ ...d, refs: refs(d.name) }));
const dead = counts.filter((x) => x.refs <= 1);
const once = counts.filter((x) => x.refs === 2);

const byFile = (arr) => {
  const g = {};
  for (const x of arr) (g[x.file] = g[x.file] || []).push(x);
  return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
};

const codeText = all.map((f) => f.code).join('\n');
const cls = new Set();
{
  const re = /\.([A-Za-z][\w-]{2,})/g;
  let m; while ((m = re.exec(css))) cls.add(m[1]);
}
const unusedCls = [...cls].filter((c) => !new RegExp('(^|[^\\w-])' + c + '\\b').test(codeText));
let unusedBytes = 0;
for (const r of css.split('}')) {
  const sel = r.split('{')[0] || '';
  if (!sel.includes('.')) continue;
  const names = [...sel.matchAll(/\.([A-Za-z][\w-]{2,})/g)].map((m) => m[1]);
  if (names.length && names.every((n) => unusedCls.includes(n))) unusedBytes += Buffer.byteLength(r) + 1;
}

const nameFile = {};
for (const d of defs) (nameFile[d.name] = nameFile[d.name] || []).push(d.file);
const dupes = Object.entries(nameFile).filter(([, v]) => v.length > 1);

const md = [];
md.push('# 代码冗余检查报告');
md.push('');
md.push(`生成时间：${new Date().toLocaleString('zh-CN')}`);
md.push('');
md.push('## 一、总体情况');
md.push('');
md.push('| 指标 | 数值 |');
md.push('|---|---|');
md.push(`| JS 文件 | ${JS_FILES.length} 个，合计 ${(all.filter((f) => f.name !== 'index.html').reduce((a, b) => a + Buffer.byteLength(b.code), 0) / 1024).toFixed(0)} KB |`);
md.push(`| CSS | ${(Buffer.byteLength(css) / 1024).toFixed(1)} KB |`);
md.push(`| 函数总数 | ${uniq.length} 个 |`);
md.push(`| 完全未被引用 | **${dead.length} 个** |`);
md.push(`| 仅 1 处引用（内部自用） | ${once.length} 个 |`);
md.push(`| CSS 未使用类 | ${unusedCls.length} 个，相关规则约 ${(unusedBytes / 1024).toFixed(1)} KB |`);
md.push(`| 重名函数 | ${dupes.length} 组 |`);
md.push('');
md.push('## 二、完全未引用的函数');
md.push('');
if (!dead.length) md.push('（无）');
for (const [file, arr] of byFile(dead)) {
  md.push(`- **${file}**：` + arr.map((x) => '`' + x.name + '`').join('、'));
}
md.push('');
md.push('## 三、只被本函数内部引用的函数');
md.push('');
for (const [file, arr] of byFile(once)) {
  md.push(`- **${file}**（${arr.length}）：` + arr.map((x) => x.name).join('、'));
}
md.push('');
md.push('## 四、CSS 未使用类');
md.push('');
md.push(unusedCls.length ? unusedCls.map((c) => '`.' + c + '`').join('、') : '（无）');
md.push('');
md.push('## 五、重名函数');
md.push('');
md.push(dupes.length ? dupes.map(([n, v]) => `- \`${n}\`：${v.join(' / ')}`).join('\n') : '（无）');
md.push('');
md.push('## 六、工具脚本');
md.push('');
md.push('- `node tests/deadcode-scan.js` 未引用函数');
md.push('- `node tests/redundancy-scan.js` 未引入文件 / 重名函数 / CSS 冗余');
md.push('- `node tests/cleanup-deadcode.js --write` 删除未引用函数');
md.push('- `node tests/cleanup-css.js --write` 删除未使用 CSS');
md.push('- `node tests/restore-css.js --write` 找回误删且仍在使用的规则');
md.push('- `node tests/make-redundancy-report.js` 重新生成本报告');

const outFile = path.join(ROOT, 'docs', '代码冗余检查报告.md');
fs.writeFileSync(outFile, md.join('\n'), 'utf8');
console.log('report written: docs/代码冗余检查报告.md');
console.log('dead:', dead.length, 'once:', once.length, 'unusedCss:', unusedCls.length, 'dupes:', dupes.length);
