// 扫描公共工具：递归列出 js 文件并读取文本
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const JS_FILES = walk(path.join(ROOT, 'js'));
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function loadJs() {
  return JS_FILES.map((p) => ({ path: p, name: rel(p), code: fs.readFileSync(p, 'utf8') }));
}

function loadAll() {
  const all = loadJs();
  all.push({ path: path.join(ROOT, 'index.html'), name: 'index.html', code: fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') });
  return all;
}

function readCss() {
  return fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
}

module.exports = { ROOT, JS_FILES, rel, loadJs, loadAll, readCss, path, fs };
