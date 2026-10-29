// 目录规范化：node tests/reorg.js [--write]
// 1) js 拆分为 core / agent / flows；2) 文档归入 docs/
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
process.chdir(root);
const write = process.argv.includes('--write');

const MAP = {
  core: ['icons.js', 'config.local.js', 'config.js', 'api.js', 'visualization.js', 'storage.js', 'intent.js', 'voice.js', 'ui.js', 'config.local.example.js'],
  agent: ['ai.js', 'agent.js', 'profile.js', 'decision.js', 'riskdetect.js', 'planner.js', 'display.js', 'agentsvc.js', 'context.js', 'kb.js', 'scenario.js', 'insights.js', 'agent-llm.js'],
  flows: ['security.js', 'transfer.js', 'wealth.js', 'card.js', 'subscription.js', 'budget.js', 'userinfo.js', 'analysis.js', 'flower.js', 'cardlimit.js', 'cardservice.js', 'chat.js', 'guide.js']
};

const fileToDir = {};
for (const [dir, files] of Object.entries(MAP)) for (const f of files) fileToDir[f] = dir;

// 校验：js 下每个文件都被分类
const existing = fs.readdirSync('js').filter(f => f.endsWith('.js'));
const missing = existing.filter(f => !fileToDir[f]);
if (missing.length) { console.error('未分类文件:', missing.join(', ')); process.exit(1); }

for (const dir of Object.keys(MAP)) if (!fs.existsSync(path.join('js', dir))) { if (write) fs.mkdirSync(path.join('js', dir)); console.log('mkdir js/' + dir); }
if (!fs.existsSync('docs')) { if (write) fs.mkdirSync('docs'); console.log('mkdir docs'); }

// 移动文件
for (const [f, dir] of Object.entries(fileToDir)) {
  const from = path.join('js', f);
  const to = path.join('js', dir, f);
  if (!fs.existsSync(from)) continue;
  if (write) {
    try {
      execSync(`git mv "${from}" "${to}"`, { stdio: 'pipe' });
    } catch (e) {
      // 被 git 忽略的文件（config.local.js）不能 git mv，直接移动
      try { execSync(`git rm --cached -q "${from}"`, { stdio: 'pipe' }); } catch (_) {}
      fs.renameSync(from, to);
    }
  }
  console.log(`mv ${from} → ${to}`);
}

// 文档归入 docs/
const DOC_MOVES = [
  ['二级模块与示例.txt', 'docs/二级模块与示例.txt'],
  ['代码冗余检查报告.md', 'docs/代码冗余检查报告.md'],
  ['tests/测试用例.md', 'docs/测试用例.md']
];
for (const [from, to] of DOC_MOVES) {
  if (!fs.existsSync(from)) continue;
  if (write) execSync(`git mv "${from}" "${to}"`);
  console.log(`mv ${from} → ${to}`);
}

// index.html / README / server / tests 里的路径
const replaceIn = (file, pairs) => {
  if (!fs.existsSync(file)) return;
  let text = fs.readFileSync(file, 'utf8');
  const before = text;
  for (const [a, b] of pairs) text = text.split(a).join(b);
  if (text !== before) {
    if (write) fs.writeFileSync(file, text, 'utf8');
    console.log('updated ' + file);
  }
};

const jsPairs = Object.entries(fileToDir).map(([f, dir]) => ['js/' + f, 'js/' + dir + '/' + f]);
replaceIn('index.html', jsPairs.concat([['?v=20261031f', '?v=20261031g']]));
replaceIn('README.md', jsPairs);
replaceIn('server/index.js', [
  ["path.join(STATIC_ROOT, 'js', 'config.local.js')", "path.join(STATIC_ROOT, 'js', 'core', 'config.local.js')"],
  ["'/js/config.local.js'", "'/js/core/config.local.js'"]
]);
replaceIn('.gitignore', [['js/config.local.js', 'js/core/config.local.js']]);
replaceIn('.dockerignore', [['js/config.local.js', 'js/core/config.local.js']]);

// 测试脚本里的引用
const suites = fs.readdirSync('tests').filter(f => f.endsWith('.js'));
for (const s of suites) {
  const p = path.join('tests', s);
  let text = fs.readFileSync(p, 'utf8');
  const before = text;
  text = text.split("'..', 'js', 'flows', 'guide.js'").join("'..', 'js', 'flows', 'guide.js'");
  text = text.split("'..', 'js', 'core', 'config.local.js'").join("'..', 'js', 'core', 'config.local.js'");
  text = text.split("path.join(root, 'js')").join("path.join(root, 'js')");
  if (text !== before) { if (write) fs.writeFileSync(p, text, 'utf8'); console.log('updated tests/' + s); }
}
console.log(write ? '\n已执行' : '\n试运行（加 --write 生效）');
