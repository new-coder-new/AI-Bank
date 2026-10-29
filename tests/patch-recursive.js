// 把 tests 里的扁平 js 目录扫描改为递归：node tests/patch-recursive.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const files = ['cleanup-css.js', 'cleanup-deadcode.js', 'deadcode-scan.js', 'make-redundancy-report.js', 'redundancy-scan.js', 'restore-css.js'];
const helper = `
function listJsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJsFiles(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
`;

for (const f of files) {
  const p = path.join('tests', f);
  let code = fs.readFileSync(p, 'utf8');
  const before = code;
  if (!code.includes('function listJsFiles')) code = code.replace(/^(const fs = require\('fs'\);)/m, '$1' + helper);
  code = code.replace(/const jsFiles = fs\.readdirSync\(jsDir\)\.filter\(f => f\.endsWith\('\.js'\)\);/g,
    "const jsFiles = listJsFiles(jsDir);");
  code = code.replace(/const jsFiles = fs\.readdirSync\(path\.join\(root, 'js'\)\)\.filter\(f => f\.endsWith\('\.js'\)\);/g,
    "const jsFiles = listJsFiles(path.join(root, 'js'));");
  code = code.replace(/const jsFiles = fs\.readdirSync\('js'\)\.filter\(f => f\.endsWith\('\.js'\)\);/g,
    "const jsFiles = listJsFiles('js');");
  // 文件路径：原来 f 是文件名，现在 f 可能是相对路径（保持拼接可用）
  code = code.replace(/jsFiles\.map\(f => fs\.readFileSync\(path\.join\(jsDir, f\), 'utf8'\)\)/g,
    "jsFiles.map(f => ({ name: path.relative(root, f).split(path.sep).join('/'), code: fs.readFileSync(f, 'utf8') }))");
  code = code.replace(/jsFiles\.map\(f => fs\.readFileSync\(path\.join\(jsDir, f\), 'utf8'\)\)\.join\('\\n'\)/g,
    "jsFiles.map(f => fs.readFileSync(f, 'utf8')).join('\\n')");
  code = code.replace(/jsFiles\.map\(f => fs\.readFileSync\(path\.join\('js', f\), 'utf8'\)\)/g,
    "jsFiles.map(f => fs.readFileSync(f, 'utf8'))");
  if (code !== before) { fs.writeFileSync(p, code, 'utf8'); console.log('patched tests/' + f); }
}
