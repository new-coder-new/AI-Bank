// 一键跑完全部测试套件：node tests/run-all.js
// 用法：npm test（或 npm test -- --only=intent）
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SUITES = [
  'intent-suite.js',
  'main-menu-suite.js',
  'module-scope-suite.js',
  'catalog-suite.js',
  'sub-menu-suite.js',
  'confirm-guard-suite.js',
  'chip-enum-suite.js',
  'server-suite.js',
];

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1] : '';
const suites = only ? SUITES.filter((s) => s.includes(only)) : SUITES;

let failed = 0;
const results = [];

for (const suite of suites) {
  const file = path.join(__dirname, suite);
  if (!fs.existsSync(file)) {
    console.log('⚠️ 跳过（不存在）：' + suite);
    continue;
  }
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [file], { encoding: 'utf8', cwd: path.join(__dirname, '..') });
  const out = (r.stdout || '') + (r.stderr || '');
  const line = out.split('\n').filter((l) => /通过\s*\d+\/\d+|失败/.test(l)).pop() || '';
  const ok = r.status === 0 && /通过\s*\d+\/\d+/.test(out) && !/❌/.test(out);
  if (!ok) failed++;
  results.push({ suite, ok, line: line.trim().slice(0, 60), ms: Date.now() - t0 });
  console.log((ok ? '✅ ' : '❌ ') + suite.padEnd(26) + (line.trim() || '(无汇总输出)'));
}

console.log('\n' + '='.repeat(64));
console.log(results.map((r) => (r.ok ? '✅' : '❌') + ' ' + r.suite + ' ' + r.ms + 'ms').join('\n'));
console.log(failed ? ('❌ 失败套件：' + failed + ' 个') : '✅ 全部通过（' + results.length + ' 个套件）');
process.exit(failed ? 1 : 0);
