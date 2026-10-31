// 源码守卫：防住「批量替换把辅助函数改成自递归」这类不易察觉的回归
// 用法：node tests/source-guard-suite.js
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log(' ✅ ' + name); }
  else { failed++; console.log(' ❌ ' + name + (extra ? ' → ' + extra : '')); }
}

function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'preview', 'data', 'logs', '.workbuddy'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

// ① 禁止自递归的 DOM 取值助手（$id(id) { return $id(id) }）
const sources = walk(ROOT, ['.ts', '.js']);
const selfRecursive = sources.filter((f) => {
  const t = fs.readFileSync(f, 'utf8');
  return /function \$id\([^)]*\)\s*\{\s*return \$id\(/.test(t);
});
ok('没有自递归的 $id 助手', selfRecursive.length === 0, selfRecursive.join(', '));

// ② index.html 引用的脚本必须存在
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const refs = Array.from(html.matchAll(/<script[^>]*src="([^"]+)"/g)).map((m) => m[1]);
// config.local.js 是本地密钥文件（git 忽略），缺失时由服务端动态注入，不算缺件
const OPTIONAL_SCRIPTS = new Set(['js/core/config.local.js']);
const missing = refs.filter((r) => !OPTIONAL_SCRIPTS.has(r) && !fs.existsSync(path.join(ROOT, r)));
ok('index.html 引用的脚本都存在（' + refs.length + ' 个）', missing.length === 0, missing.join(', '));

// ③ 每个 .ts 源都有对应的 .js 产物
const tsFiles = walk(path.join(ROOT, 'js'), ['.ts']);
const JS_ROOT = path.join(ROOT, 'js');
const BUILD_ROOT = path.join(ROOT, 'build', 'js');
const noOutput = tsFiles.filter((f) => {
  const rel = path.relative(JS_ROOT, f).replace(/\\/g, '/').replace(/\.ts$/, '.js');
  return !fs.existsSync(path.join(BUILD_ROOT, rel));
});
ok('每个 .ts 都有编译产物 .js（' + tsFiles.length + ' 个）', noOutput.length === 0, noOutput.join(', '));

// ④ 引导层入口函数在编译产物里确实存在（防止拆分/替换后丢函数）
const guideEntry = ['guideHandleText', 'guideBackToMenu', 'guideResetAllSessions'];
const guideSrc = fs.readFileSync(path.join(ROOT, 'build/js/flows/guide-menu.js'), 'utf8') +
  fs.readFileSync(path.join(ROOT, 'build/js/core/session.js'), 'utf8');
const lostEntries = guideEntry.filter((n) => !guideSrc.includes('function ' + n + '('));
ok('引导层关键入口函数存在', lostEntries.length === 0, lostEntries.join(', '));

// ⑤ 安全验证模块的关键函数存在（本次卡死回归的守卫）
const secSrc = fs.readFileSync(path.join(ROOT, 'build/js/flows/security.js'), 'utf8');
const secFns = ['showSecurityVerification', 'showPasswordVerify', 'showFingerprintVerify', 'showSmsVerify', 'showFaceVerification', 'showOtpVerification', 'closeSecurityVerify', 'showSecurityCenter'];
const lostSec = secFns.filter((n) => !secSrc.includes('function ' + n + '('));
ok('安全验证模块函数齐全（' + secFns.length + ' 个）', lostSec.length === 0, lostSec.join(', '));

// ⑥ 服务端数据路径默认是 SQLite（防止回退到 db.json）
const dbSrc = fs.readFileSync(path.join(ROOT, 'server/db.js'), 'utf8');
ok('服务端默认使用 SQLite（bank.db）', dbSrc.includes("'bank.db'") && !dbSrc.includes("BANK_DB_FILE || path.join(__dirname, '..', 'data', 'db.json')"));

console.log('\n通过 ' + passed + '/' + (passed + failed) + '，失败 ' + failed);
process.exit(failed ? 1 : 0);
