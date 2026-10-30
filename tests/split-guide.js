// 拆分 guide.js → guide-rules.js（规则识别）+ guide-ai.js（模型识别）+ guide.js（流程）
// 边界策略：顶层声明起点 = 下一个顶层声明起点 - 1；用 vm.Script 逐个校验语法
// 用法：node tests/split-guide.js [--write]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const write = process.argv.includes('--write');
const FILE = path.join('js', 'flows', 'guide.js');
const lines = fs.readFileSync(FILE, 'utf8').split('\n');

const isDecl = (line) => /^(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line) || /^(?:var|const|let)\s+[A-Za-z_$][\w$]*\s*=/.test(line);
const nameOf = (line) => {
  const m = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(line) || /^(?:var|const|let)\s+([A-Za-z_$][\w$]*)\s*=/.exec(line);
  return m ? m[1] : null;
};

const starts = [];
for (let i = 0; i < lines.length; i++) if (isDecl(lines[i])) starts.push(i);

const items = starts.map((s, idx) => {
  const next = idx + 1 < starts.length ? starts[idx + 1] : lines.length;
  let head = s;
  while (head - 1 >= 0 && /^\s*\/\//.test(lines[head - 1])) head--;
  return { name: nameOf(lines[s]), start: s, head, end: next - 1 };
});

const AI_NAMES = new Set([
  'GUIDE_INTENT_MODULES',
  'guideLLMJson', 'guideAIRouteIntent', 'guideAIFirstEnabled', 'guideAIFirstSkipped',
  'guideAIIntent', 'guideAIIntentExtract', 'guideTransferAIExtract', 'guideTransferAIFallback',
  'guideAISlots', 'guideTimedAIExtract', 'guideAAAIExtract', 'guideAAAIHasMore',
  'guideCardApplyAIType', 'guideTxnLimitAIFlag', 'guideTxnLimitAILimits',
  'guideHoldingAIIntent', 'guideSubAIFlag', 'guideSubAIExtract'
]);
const RULE_NAMES = new Set([
  'GUIDE_SERVICES', 'GUIDE_SHOW_OVERVIEW', 'GUIDE_HOME_ENTRIES',
  'GUIDE_SERVICE_KEYWORDS', 'GUIDE_SUB_KEYWORDS',
  'CARD_APPLY_TYPES', 'CARD_APPLY_PURPOSES', 'CARD_LIMIT_REASONS',
  'SUB_PRESETS', 'SUB_CYCLE_TEXT', 'FLOWER_BOUQUETS', 'FLOWER_SLOTS', 'FLOWER_CANCEL_FEE', 'FLOWER_CAKES',
  'guideServiceByKey', 'guideResolveService', 'guideResolveIntent', 'guideIsMenuIntent', 'guideNormalizeText',
  'guideIsReadOnlyQuery', 'guideIsCardApplyPhrase', 'guideLooksTimedTransfer',
  'guideIsSubRenewManagePhrase', 'guideIsSubRenewOffPhrase', 'guideIsSubCancelPhrase',
  'guideIsSubAddPlain', 'guideIsSubAddPhrase', 'guideIsHoldingsQuery', 'guideIsCardListQuery',
  'guideIsCardLimitAdjustIntent', 'guideIsBillAnalysisIntent', 'guideIsFinalActionText',
  'guideIsContact', 'guideContactNames', 'guideLooksLikeNewTransfer', 'guideIsAllProductsIntent',
  'guideSubFindService'
]);

const picked = items.filter((it) => AI_NAMES.has(it.name) || RULE_NAMES.has(it.name));

const bad = [];
for (const it of picked) {
  const snippet = lines.slice(it.head, it.end + 1).join('\n');
  try { new vm.Script(snippet, { filename: it.name }); } catch (e) { bad.push(it.name + ' → ' + e.message); }
}
if (bad.length) {
  console.log('以下片段无法单独编译，已中止：');
  bad.slice(0, 12).forEach((b) => console.log('  ' + b));
  process.exit(1);
}

const aiItems = picked.filter((it) => AI_NAMES.has(it.name));
const ruleItems = picked.filter((it) => RULE_NAMES.has(it.name));

const map = new Map(picked.map((it) => [it.head, it.end]));
const remain = [];
for (let i = 0; i < lines.length; i++) {
  if (map.has(i)) { i = map.get(i); continue; }
  remain.push(lines[i]);
}
const remainCode = remain.join('\n').replace(/\n{3,}/g, '\n\n');

const block = (it) => lines.slice(it.head, it.end + 1).join('\n');
const header = (t, n) => '// ==========================================================================\n//  ' + t + '\n//  ' + n + '\n// ==========================================================================\n\n';
const rulesFile = header('服务向导 · 规则识别层（本地关键词 / 正则 / 菜单解析）', '只做不花钱的本地判断，不调用模型；模型识别在 guide-ai.js，会话流程在 guide.js。') + ruleItems.map(block).join('\n\n') + '\n';
const aiFile = header('服务向导 · 模型识别层（大模型意图路由 / 槽位抽取 / 判定）', '所有走 LLM 的识别集中在这里；规则识别在 guide-rules.js，会话流程在 guide.js。') + aiItems.map(block).join('\n\n') + '\n';

let failed = false;
[['guide.js', remainCode], ['guide-rules.js', rulesFile], ['guide-ai.js', aiFile]].forEach(([n, code]) => {
  try { new vm.Script(code, { filename: n }); console.log('✅ ' + n + ' 可编译（' + code.split('\n').length + ' 行）'); }
  catch (e) { console.log('❌ ' + n + ' 语法错误：' + e.message); failed = true; }
});
if (failed) process.exit(1);

console.log('规则项 ' + ruleItems.length + '，模型项 ' + aiItems.length);
if (write) {
  fs.writeFileSync(FILE, remainCode, 'utf8');
  fs.writeFileSync(path.join('js', 'flows', 'guide-rules.js'), rulesFile, 'utf8');
  fs.writeFileSync(path.join('js', 'flows', 'guide-ai.js'), aiFile, 'utf8');
  console.log('已写入 guide.js / guide-rules.js / guide-ai.js');
}
