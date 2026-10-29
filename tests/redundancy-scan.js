// 冗余资源扫描：node tests/redundancy-scan.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const jsDir = path.join(root, 'js');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));

// 1) 未被 index.html 引入的 JS
const notIncluded = jsFiles.filter(f => !new RegExp('js/' + f.replace('.', '\\.')).test(html));
console.log('=== 未被 index.html 引入的 JS ===');
console.log(notIncluded.length ? notIncluded.map(f => '  js/' + f).join('\n') : '（无）');

// 2) 重名函数（同名定义在多处，后加载的会覆盖前面的）
const defs = {};
for (const f of jsFiles) {
  const code = fs.readFileSync(path.join(jsDir, f), 'utf8');
  const re = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(code))) (defs[m[1]] = defs[m[1]] || []).push(f);
}
const dupes = Object.entries(defs).filter(([, files]) => files.length > 1);
console.log('\n=== 同名函数重复定义 ===');
console.log(dupes.length ? dupes.map(([n, fs_]) => `  ${n}  ← ${fs_.join(', ')}`).join('\n') : '（无）');

// 3) CSS 未使用类（按块大小估算体积）
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const codeText = jsFiles.map(f => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n') + html;
const cls = new Set();
{
  const re = /\.([A-Za-z][\w-]{2,})/g;
  let m;
  while ((m = re.exec(css))) cls.add(m[1]);
}
const unused = [...cls].filter(c => !new RegExp('(^|[^\\w-])' + c + '\\b').test(codeText));
// 估算这些类所在规则总字节
let unusedBytes = 0;
{
  const rules = css.split('}');
  for (const r of rules) {
    const sel = r.split('{')[0] || '';
    if (!sel.includes('.')) continue;
    const names = [...sel.matchAll(/\.([A-Za-z][\w-]{2,})/g)].map(m => m[1]);
    if (names.length && names.every(n => unused.includes(n))) unusedBytes += Buffer.byteLength(r) + 1;
  }
}
console.log('\n=== CSS 未使用类 ===');
console.log(`共 ${unused.length} 个，相关规则约 ${(unusedBytes / 1024).toFixed(1)} KB / 文件 ${(Buffer.byteLength(css) / 1024).toFixed(1)} KB`);
console.log('  ' + unused.join(', '));

// 4) 大文件与重复注释段
console.log('\n=== 体积 ===');
jsFiles.map(f => ({ f: 'js/' + f, kb: Buffer.byteLength(fs.readFileSync(path.join(jsDir, f), 'utf8')) / 1024 }))
  .concat([{ f: 'css/style.css', kb: Buffer.byteLength(css) / 1024 }, { f: 'index.html', kb: Buffer.byteLength(html) / 1024 }, { f: 'README.md', kb: Buffer.byteLength(fs.readFileSync(path.join(root, 'README.md'), 'utf8')) / 1024 }])
  .sort((a, b) => b.kb - a.kb).slice(0, 10)
  .forEach(x => console.log(`  ${x.f}  ${x.kb.toFixed(1)} KB`));
