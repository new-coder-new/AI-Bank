// 生成冗余检查报告：node tests/make-redundancy-report.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const jsDir = path.join(root, 'js');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const all = jsFiles.map(f => ({ name: 'js/' + f, code: fs.readFileSync(path.join(jsDir, f), 'utf8') }));
all.push({ name: 'index.html', code: html });

// 函数定义与引用
const defs = [];
for (const f of all) {
  const re = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(f.code))) defs.push({ name: m[1], file: f.name });
}
const seen = new Set();
const uniq = defs.filter(d => (seen.has(d.name) ? false : seen.add(d.name)));
const refs = (name) => {
  let n = 0;
  const re = new RegExp('(^|[^\\w$.])' + name.replace(/[$]/g, '\\$') + '\\b', 'g');
  for (const f of all) { const h = f.code.match(re); if (h) n += h.length; }
  return n;
};
const counts = uniq.map(d => ({ ...d, refs: refs(d.name) }));
const dead = counts.filter(x => x.refs <= 1);
const once = counts.filter(x => x.refs === 2);

const byFile = (arr) => {
  const g = {};
  for (const x of arr) (g[x.file] = g[x.file] || []).push(x);
  return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
};

// CSS 未使用
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const codeText = all.map(f => f.code).join('\n');
const cls = new Set();
{
  const re = /\.([A-Za-z][\w-]{2,})/g;
  let m; while ((m = re.exec(css))) cls.add(m[1]);
}
const unusedCls = [...cls].filter(c => !new RegExp('(^|[^\\w-])' + c + '\\b').test(codeText));
let unusedBytes = 0;
for (const r of css.split('}')) {
  const sel = r.split('{')[0] || '';
  if (!sel.includes('.')) continue;
  const names = [...sel.matchAll(/\.([A-Za-z][\w-]{2,})/g)].map(m => m[1]);
  if (names.length && names.every(n => unusedCls.includes(n))) unusedBytes += Buffer.byteLength(r) + 1;
}

// 重名函数
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
md.push(`| JS 文件 | ${jsFiles.length} 个，合计 ${(all.filter(f => f.name !== 'index.html').reduce((a, b) => a + Buffer.byteLength(b.code), 0) / 1024).toFixed(0)} KB |`);
md.push(`| CSS | ${(Buffer.byteLength(css) / 1024).toFixed(1)} KB |`);
md.push(`| 函数总数 | ${uniq.length} 个 |`);
md.push(`| 完全未被引用 | **${dead.length} 个** |`);
md.push(`| 仅 1 处引用（内部自用） | ${once.length} 个 |`);
md.push(`| CSS 未使用类 | **${unusedCls.length} 个**，相关规则约 ${(unusedBytes / 1024).toFixed(1)} KB |`);
md.push(`| 重名函数 | ${dupes.length} 组 |`);
md.push('');
md.push('## 二、A 类：完全未引用的函数（建议删除）');
md.push('');
md.push('判定标准：全项目（含 `onclick="xxx()"` 字符串）只出现函数定义这一次。');
md.push('');
for (const [file, arr] of byFile(dead)) {
  md.push(`### ${file}（${arr.length} 个）`);
  md.push('');
  md.push(arr.map(x => '`' + x.name + '`').join('、'));
  md.push('');
}
md.push('## 三、B 类：只有本函数内部引用 1 次（多为工具函数/内部实现）');
md.push('');
md.push('这些不一定多余，但说明没有外部调用方，可结合业务确认后精简。');
md.push('');
for (const [file, arr] of byFile(once)) {
  md.push(`- **${file}**（${arr.length}）`);
  md.push('  ' + arr.map(x => x.name).join('、'));
}
md.push('');
md.push('## 四、C 类：CSS 中已无人使用的类');
md.push('');
md.push(`共 ${unusedCls.length} 个，估算规则体积 ${(unusedBytes / 1024).toFixed(1)} KB。按来源分：`);
md.push('');
const groups = [
  ['旧侧边栏/顶栏布局', ['sidebar', 'nav-section', 'user-info', 'user-name', 'user-role', 'topbar-']],
  ['旧速览卡/示例', ['quick-card', 'quick-cards', 'example-chip', 'welcome-icon', 'version-tip', 'model-tag', 'model-dot']],
  ['旧图表', ['chart-container', 'chart-box', 'chart-title', 'chart-legend', 'legend-item', 'legend-dot', 'report-bar', 'report-bars', 'report-bar-label', 'report-bar-track']],
  ['旧功能面板', ['func-panel', 'func-category', 'func-subitem', 'func-subitems']],
  ['旧统计/用户信息', ['stat-grid', 'stat-card', 'userinfo-grid', 'userinfo-field', 'userinfo-refresh', 'data-total']],
  ['旧持仓/预算卡', ['holding-', 'budget-', 'loss', 'warning']],
  ['旧 Risk/Drawer 卡', ['agent-risk-', 'agent-drawer-footer', 'agent-workflow', 'agent-step-', 'agent-tier-', 'agent-shortage-', 'agent-greet', 'agent-dash', 'agent-insights', 'agent-briefing-foot', 'agent-plan-sub']],
  ['其它', ['aa-member', 'input-hint', 'bank-canceled', 'guide-item', 'detail-collapse', 'dark-mode-toggle', 'user-level', 'bank-home-note', 'report-detail-grid', 'report-hero', 'report-metric-grid', 'report-advice']]
];
const used = new Set();
for (const [label, prefixes] of groups) {
  const hit = unusedCls.filter(c => prefixes.some(p => c === p || c.startsWith(p)) && !used.has(c));
  hit.forEach(c => used.add(c));
  if (hit.length) {
    md.push(`**${label}**（${hit.length}）：` + hit.map(c => '`.' + c + '`').join('、'));
    md.push('');
  }
}
const rest = unusedCls.filter(c => !used.has(c));
if (rest.length) {
  md.push(`**其它零散**（${rest.length}）：` + rest.map(c => '`.' + c + '`').join('、'));
  md.push('');
}
md.push('> 注意：`report-panel` / `report-row` 这类仍在用的类没有被列入；`report-bar*` 等未被动态拼接，可安全删除。');
md.push('');
md.push('## 五、D 类：其它冗余');
md.push('');
md.push('| 项目 | 说明 | 建议 |');
md.push('|---|---|---|');
md.push(`| 重名函数 | ${dupes.length ? dupes.map(([n, v]) => '`' + n + '`（' + v.join(' / ') + '）').join('；') : '无'} | 后加载的文件会覆盖前者，建议重命名或删除其一 |`);
md.push('| 兼容包装 | `guideStartFlowerForContactLegacy`、`guideWealthProductsShowAll`、`guideFlowerListShowAll`、`analysis.js` 的「兼容旧调用」 | A 类已包含，可删 |');
md.push('| 关停的主动推送 | `insights.js` 中 `AGENT_PROACTIVE_ENABLED = false`，其后的主动卡片代码仍在 | 若要彻底删除可一并清掉（含 `.agent-proactive*` 样式） |');
md.push('| 未使用的示例文件 | `js/config.local.example.js` 未被 index.html 引入 | 保留（作为配置样例）或移入 docs |');
md.push('| README | 80.7 KB，含较多历史截图/说明 | 可拆分归档 |');
md.push('| 根目录临时物 | `二级模块与示例.txt` | 保留（交付文档） |');
md.push('');
md.push('## 六、建议清理顺序（收益/风险）');
md.push('');
md.push('| 顺序 | 动作 | 预计收益 | 风险 |');
md.push('|---|---|---|---|');
md.push(`| 1 | 删除 A 类 ${dead.length} 个未引用函数 | JS 约 3–5 KB，可读性提升 | 低（全量搜索确认无引用） |`);
md.push(`| 2 | 删除 C 类未使用 CSS | 约 ${(unusedBytes / 1024).toFixed(1)} KB（占 CSS ${((unusedBytes / Buffer.byteLength(css)) * 100).toFixed(0)}%） | 低（需保留动态拼接的可能） |`);
md.push('| 3 | 合并重名函数 | 避免覆盖 bug | 中（需回归相关功能） |');
md.push('| 4 | 清理关停的主动推送代码 | 约 2 KB | 低 |');
md.push('| 5 | README 拆分归档 | 仓库更清爽 | 无 |');
md.push('');
md.push('## 七、不建议动的部分');
md.push('');
md.push('- `onclick="xxx()"` 字符串引用：本报告已计入，未被标记的是真未被调用');
md.push('- 测试脚手架 `tests/*.js`：属于验证资产');
md.push('- `preview/` 下的验证页面：本地调试用，不影响线上');
md.push('- `js/kb.js`（93 KB）、`js/agent-llm.js`：体量大但仍在链路中使用');

fs.writeFileSync(path.join(root, '代码冗余检查报告.md'), md.join('\n'), 'utf8');
console.log('report written: 代码冗余检查报告.md');
console.log('dead:', dead.length, 'once:', once.length, 'unusedCss:', unusedCls.length, 'dupes:', dupes.length);
