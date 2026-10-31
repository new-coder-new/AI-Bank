// 意图识别 & 字段抽取测试套件
// 用法：node tests/intent-suite.js
// 说明：直接加载引导层源码（guide-*.ts 编译产物），模拟用户多轮输入，
// 检查：① 是否路由到正确的细分模块；② 关键字段是否被抽取。
const fs = require('fs');

const path = require('path');
const loadGuideSource = require('./helpers/load-guide-src');
const src = loadGuideSource();

const calls = [];
const logs = [];

// ---------- DOM / 网络 / UI 桩 ----------
global.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', innerHTML: '', style: {}, className: '', appendChild() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [] }),
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { appendChild() {} }
};
global.window = { __pendingScheduledTransfers: {} };

mockData = {
  contacts: [
    { name: '林小雨', phone: '136****3456', phoneFull: '13634563456', account: '6228 **** **** 3456', bank: '农业银行', relation: '爱人', birthday: '2026-10-15' },
    { name: '张三', phone: '138****1234', phoneFull: '13812341234', account: '6222 **** **** 1234', bank: '工商银行' },
    { name: '李四', phone: '139****5678', phoneFull: '13956785678', account: '6225 **** **** 5678', bank: '招商银行' },
    { name: '王五', phone: '137****9012', phoneFull: '13790129012', account: '6217 **** **** 9012', bank: '建设银行' }
  ],
  products: [
    { id: 'p1', name: '稳健增利90天', risk: 'R2', days: 90, rate: 3.85, minAmount: 1000 },
    { id: 'p2', name: '天天盈货币基金', risk: 'R1', minAmount: 1 },
    { id: 'p3', name: '均衡配置混合基金', risk: 'R3', minAmount: 100 },
    { id: 'p4', name: '安享三年定期', risk: 'R1', minAmount: 50 },
    { id: 'p5', name: '成长先锋股票基金', risk: 'R4', minAmount: 1000 }
  ],
  subscriptions: [
    { id: 1, name: '某云盘超级会员', price: 20, cycle: '/月', autoRenew: true },
    { id: 2, name: '某视频平台VIP', price: 25, cycle: '/月', autoRenew: true }
  ],
  userProfile: {
    debitCard: { number: '6222 0236 0201 8888 666', available: 998000, balance: 1000000 },
    creditCard: { effectiveLimit: 90000, used: 23650, available: 66350 },
    creditCards: [
      { id: 'CARD-MAIN', cardType: '白金信用卡', tail: '6789', limit: 90000, used: 23650 },
      { id: 'CARD-2', cardType: '标准金卡', tail: '2290', limit: 50008, used: 0 }
    ],
    holdings: [
      { name: '稳健增利90天', amount: 10000, profit: 95.2, profitRate: 0.95, buyDate: '2026-08-15', status: '持有中' },
      { name: '天天盈货币基金', amount: 5000, profit: 22.15, profitRate: 0.44, buyDate: '2026-09-01', status: '持有中' }
    ],
    birthdayContacts: [
      { name: '林小雨', birthday: '10-15', relation: '爱人', flower: '向日葵', price: 168 },
      { name: '张三', birthday: '09-15', relation: '朋友', flower: '向日葵', price: 168 }
    ],
    manualReviews: [],
    flowerOrders: [],
    txnLimit: { single: 50000, daily: 100000, night: 'block', overseas: 'block' }
  }
};

appendMessage = (h) => logs.push(String(h));
scrollToBottom = () => {};
escapeHtml = (s) => String(s == null ? '' : s);
guideMessage = (i) => i;
guideLLMJson = async () => null;          // 无 Key：全部走本地规则
guideBackToMenu = () => calls.push('menu');
renderServiceWelcome = () => calls.push('welcome');
saveUserData = () => {};
addTransaction = () => true;
verifyAmountRisk = async () => ({ ok: true });
submitManualReview = () => ({ id: 'r1' });
submitCardApplyReview = () => ({ id: 'r2' });
showSecurityVerification = (title, cb) => { calls.push('security'); };
showBillOverview = () => calls.push('bill');
showAbnormalAlert = () => calls.push('alert');
showAbnormalSummary = () => calls.push('abnormalSummary');
startRiskAssessment = () => calls.push('risk');
showCardMyCards = () => calls.push('cards');
showBirthdayReminder = () => calls.push('birthday');
cardServiceCards = () => mockData.userProfile.creditCards;
cardLimitData = () => ({ effectiveLimit: 90000, used: 23650, available: 66350 });
cardLimitMinimum = () => 23650;
txnLimitData = () => mockData.userProfile.txnLimit;
showHoldings = () => calls.push('holdings');

// 载入向导层（与被测代码同处一个作用域，GUIDE_* 变量可直接读取）
// 新规则：主菜单只判一级模块并打开菜单，槽位抽取只在进入模块后发生。
// 因此本套件为「模块内行为」测试：每条用例开始前先进入对应一级模块。
eval(src + '\n;global.__g = { guideHandleText, guideResetAllSessions, guideOpenService, guideOpenModuleMenu, guideMainModuleGuess, guideIsReadOnlyQuery };');

// 等待异步步骤（AI 抽取等）落地
const tick = (n) => new Promise((res) => { let i = 0; const go = () => (++i >= (n || 3) ? res() : setTimeout(go, 10)); setTimeout(go, 10); });

// ---------- 用例 ----------
// steps: 依次发送的消息；expect: (snap) => true/false
const cases = [
  // ===== 转账 =====
  { mod: '转账/姓名转账', steps: ['给张三转1000元'], desc: '姓名+金额', expect: (s) => s.transfer && s.transfer.kind === 'name' && s.transfer.payee === '张三' && s.transfer.amount === 1000 },
  { mod: '转账/姓名转账', steps: ['给王五转账'], desc: '只有姓名，缺金额', expect: (s) => s.transfer && s.transfer.kind === 'name' && s.transfer.payee === '王五' && s.transfer.stage === 'slots' },
  { mod: '转账/姓名转账', steps: ['转账给李四 2万'], desc: '金额单位「万」', expect: (s) => s.transfer && s.transfer.payee === '李四' && s.transfer.amount === 20000 },
  { mod: '转账/手机号转账', steps: ['向13800138000转账500'], desc: '手机号+金额', expect: (s) => s.transfer && s.transfer.kind === 'phone' && s.transfer.phone === '13800138000' && s.transfer.amount === 500 },
  { mod: '转账/手机号转账', steps: ['给13912345678转2000元'], desc: '手机号口径', expect: (s) => s.transfer && s.transfer.kind === 'phone' && !!s.transfer.phone },
  { mod: '转账/定时转账', steps: ['明天下午6点转账给张三111'], desc: '相对日期+时间段', expect: (s) => s.transfer && s.transfer.kind === 'timed' && s.transfer.payee === '张三' && s.transfer.amount === 111 && !!s.transfer.date && s.transfer.time === '18:00' },
  { mod: '转账/定时转账', steps: ['下周三上午9点给李四转5000'], desc: '周几+钟点', expect: (s) => s.transfer && s.transfer.kind === 'timed' && s.transfer.payee === '李四' && s.transfer.amount === 5000 && /:/.test(String(s.transfer.time)) },
  { mod: '转账/定时转账', steps: ['定时转账'], desc: '显式选中定时转账', expect: (s) => s.transfer && s.transfer.kind === 'timed' },
  { mod: '转账/AA收款', steps: ['向张三和李四AA收款200元'], desc: '两人AA', expect: (s) => s.aa && s.aa.names && s.aa.names.length === 2 && s.aa.total === 200 },
  { mod: '转账/AA收款', steps: ['AA收款'], desc: '进AA入口', expect: (s) => !!s.aa },

  // ===== 账单 =====
  { mod: '账单/账单分析', steps: ['分析一下我这个月的账单'], desc: '账单分析', expect: (s) => s.calls.includes('bill') },
  { mod: '账单/账单分析', steps: ['看看我的收支统计'], desc: '收支统计归入账单分析', expect: (s) => s.calls.includes('bill') },
  { mod: '账单/异常交易', steps: ['查看异常交易'], desc: '异常交易明细', expect: (s) => s.calls.includes('alert') || s.calls.includes('bill') },

  // ===== 卡片 =====
  { mod: '卡片/卡片申请', steps: ['我要申请一张信用卡'], desc: '进入申请', expect: (s) => !!s.cardApply },
  { mod: '卡片/卡片申请', steps: ['我想办一张标准金卡，额度5万，日常消费'], desc: '卡种+额度+用途', expect: (s) => s.cardApply && s.cardApply.cardType && s.cardApply.limit === 50000 },
  { mod: '卡片/额度调整', steps: ['我要调我的信用卡额度'], desc: '进入调额（多卡先选卡）', expect: (s) => !!s.cardLimit },
  { mod: '卡片/额度调整', steps: ['我要调我的信用卡额度', '6789', '提高到 80000，消费需求增加'], desc: '选卡+目标额度+原因', expect: (s) => s.cardLimit && s.cardLimit.stage === 'confirm' && s.cardLimit.limit === 80000 && s.cardLimit.reason === '消费需求增加' },
  { mod: '卡片/额度调整', steps: ['我要调我的信用卡额度', '6789', '把信用卡额度调整为0元，原因收入提升'], desc: '0 元应被拦（不进入确认）', expect: (s) => s.cardLimit && s.cardLimit.stage === 'slots' },
  { mod: '卡片/交易限制', steps: ['卡片限额'], desc: '进入交易限制', expect: (s) => !!s.txn },
  { mod: '卡片/交易限制', steps: ['卡片限额', '6789', '20000, 50000'], desc: '单笔+每日', expect: (s) => s.txn && s.txn.single === 20000 && s.txn.daily === 50000 },
  { mod: '卡片/交易限制', steps: ['卡片限额', '6789', '每日20000'], desc: '只给每日限额', expect: (s) => s.txn && s.txn.daily === 20000 && s.txn.single == null },
  { mod: '卡片/卡片挂失', steps: ['卡片挂失'], desc: '进入挂失', expect: (s) => !!s.lost },
  { mod: '卡片/卡片挂失', steps: ['卡片挂失', '6789'], desc: '尾号定位到卡片', expect: (s) => s.lost && s.lost.stage === 'confirm' && s.lost.card && s.lost.card.tail === '6789' },

  // ===== 理财 =====
  { mod: '理财/产品申购', steps: ['申购稳健增利90天 5000'], desc: '产品+金额', expect: (s) => s.wealth && s.wealth.amount === 5000 },
  { mod: '理财/产品申购', steps: ['我要买5000元的天天盈货币基金'], desc: '金额在前', expect: (s) => s.wealth && s.wealth.amount === 5000 },
  { mod: '理财/风险评估', steps: ['我要做风险测评'], desc: '风险评估', expect: (s) => s.calls.includes('risk') },
  { mod: '理财/持仓管理', steps: ['我买了哪些产品'], desc: '持仓（不是推荐）', expect: (s) => s.calls.includes('holdings') },
  { mod: '理财/持仓管理', steps: ['持仓'], desc: '持仓', expect: (s) => s.calls.includes('holdings') },

  // ===== 订阅管理 =====
  { mod: '订阅/添加订阅', steps: ['我想要添加订阅'], desc: '进入添加', expect: (s) => s.sub && s.sub.mode === 'add' },
  { mod: '订阅/添加订阅', steps: ['我想要订阅某视频平台VIP年卡'], desc: '服务+周期', expect: (s) => s.sub && s.sub.mode === 'add' && s.sub.preset === '某视频平台VIP' && s.sub.cycle === '/年' },
  { mod: '订阅/取消订阅', steps: ['我不想订阅某视频平台VIP了'], desc: '点名取消', expect: (s) => s.sub && s.sub.mode === 'cancel' && s.sub.target === '某视频平台VIP' },
  { mod: '订阅/取消订阅', steps: ['取消订阅'], desc: '未点名→列表', expect: (s) => s.sub && s.sub.mode === 'cancel' },
  { mod: '订阅/自动续费管理', steps: ['某云盘超级会员年卡不续费了'], desc: '关闭某服务自动续费', expect: (s) => s.sub && s.sub.mode === 'manage' && s.sub.newAutoRenew === false },
  { mod: '订阅/自动续费管理', steps: ['某云盘超级会员年卡开一下自动续费'], desc: '开启自动续费', expect: (s) => s.sub && s.sub.mode === 'manage' && s.sub.newAutoRenew === true },
  { mod: '订阅/自动续费管理', steps: ['管理自动续费'], desc: '未点名→列表', expect: (s) => s.sub && s.sub.mode === 'manage' },

  // ===== 多轮补全 & 组合说法 =====
  { mod: '转账/多轮补全', steps: ['给张三转账', '500'], desc: '先问金额再补', expect: (s) => s.transfer && s.transfer.payee === '张三' && s.transfer.amount === 500 },
  { mod: '转账/姓名转账', steps: ['转1000给张三'], desc: '金额在前、收款人在后', expect: (s) => s.transfer && s.transfer.payee === '张三' && s.transfer.amount === 1000 },
  { mod: '转账/手机号转账', steps: ['用13800138000给李四转200'], desc: '手机号与姓名同时出现', expect: (s) => s.transfer && s.transfer.kind === 'phone' },
  { mod: '转账/定时转账', steps: ['明天下午6点转账给张三111', '不重复'], desc: '补全重复方式', expect: (s) => s.transfer && (s.transfer.repeat === '不重复') && (s.transfer.stage === 'askRemark' || s.transfer.stage === 'remark') },
  { mod: '转账/AA收款', steps: ['向张三、李四、王五AA收款300元'], desc: '三人AA', expect: (s) => s.aa && s.aa.names.length === 3 && s.aa.total === 300 },
  { mod: '转账/AA收款', steps: ['AA收款200元，张三和李四'], desc: '金额在前', expect: (s) => s.aa && s.aa.total === 200 && s.aa.names.length === 2 },
  { mod: '卡片/卡片申请', steps: ['我想办一张钻石卡'], desc: '不支持的卡种要提示可选范围', expect: (s) => !!s.cardApply },
  { mod: '卡片/卡片申请', steps: ['申请一张标准金卡'], desc: '只给卡种', expect: (s) => s.cardApply && s.cardApply.cardType === '标准金卡' },
  { mod: '理财/持仓管理', steps: ['看看我的持仓收益'], desc: '持仓口语', expect: (s) => s.calls.includes('holdings') },
  { mod: '订阅/添加订阅', steps: ['添加订阅', '某阅读APP会员', '按月'], desc: '多轮选择服务与周期', expect: (s) => s.sub && s.sub.mode === 'add' && s.sub.preset === '某阅读APP会员' && s.sub.cycle === '/月' },

  // ===== 反例：不应误路由 =====
  { mod: '反例', steps: ['今天天气怎么样'], desc: '无关内容不应进入任何业务流', expect: (s) => !s.transfer && !s.aa && !s.wealth && !s.cardApply && !s.cardLimit && !s.txn && !s.lost && !s.sub },
  { mod: '反例', steps: ['给张三转'], desc: '只有动词不应报错', expect: (s) => true }
];

// ---------- 执行 ----------
function snapshot() {
  return {
    transfer: GUIDE_TRANSFER && { kind: GUIDE_TRANSFER.kind, payee: GUIDE_TRANSFER.payee, phone: GUIDE_TRANSFER.phone, amount: GUIDE_TRANSFER.amount, date: GUIDE_TRANSFER.date, time: GUIDE_TRANSFER.time, repeat: GUIDE_TRANSFER.repeat, stage: GUIDE_TRANSFER.stage },
    aa: GUIDE_AA && { total: GUIDE_AA.total, names: (GUIDE_AA.participants || []).map(function (p) { return p.name; }), stage: GUIDE_AA.stage },
    wealth: GUIDE_WEALTH && { product: GUIDE_WEALTH.product && GUIDE_WEALTH.product.name, amount: GUIDE_WEALTH.amount, stage: GUIDE_WEALTH.stage },
    cardApply: GUIDE_CARD_APPLY && { cardType: GUIDE_CARD_APPLY.cardType, limit: GUIDE_CARD_APPLY.limit, purpose: GUIDE_CARD_APPLY.purpose, stage: GUIDE_CARD_APPLY.stage },
    cardLimit: GUIDE_CARD_LIMIT && { stage: GUIDE_CARD_LIMIT.stage, limit: GUIDE_CARD_LIMIT.limit, reason: GUIDE_CARD_LIMIT.reason, card: GUIDE_CARD_LIMIT.card && GUIDE_CARD_LIMIT.card.tail },
    txn: GUIDE_TXN_LIMIT && { stage: GUIDE_TXN_LIMIT.stage, single: GUIDE_TXN_LIMIT.single, daily: GUIDE_TXN_LIMIT.daily, card: GUIDE_TXN_LIMIT.card && GUIDE_TXN_LIMIT.card.tail },
    lost: GUIDE_CARD_LOST && { stage: GUIDE_CARD_LOST.stage, card: GUIDE_CARD_LOST.card },
    sub: GUIDE_SUB && { mode: GUIDE_SUB.mode, preset: GUIDE_SUB.preset && GUIDE_SUB.preset.name, cycle: GUIDE_SUB.cycle, target: GUIDE_SUB.target && GUIDE_SUB.target.name, newAutoRenew: GUIDE_SUB.newAutoRenew },
    calls: calls.slice()
  };
}

(async function () {
  const rows = [];
  for (const c of cases) {
    __g.guideResetAllSessions();
    calls.length = 0;
    logs.length = 0;
    // 主菜单 → 进入一级模块（新规则：主菜单不做直通）
    const firstStep = c.steps[0] || '';
    const mod = __g.guideMainModuleGuess(firstStep);
    if (mod && !(__g.guideIsReadOnlyQuery && __g.guideIsReadOnlyQuery(firstStep))) {
      __g.guideOpenModuleMenu(mod);
      currentModule = mod;
      await tick(1);
    }
    for (const step of c.steps) {
      try { await __g.guideHandleText(step); await tick(4); } catch (e) { rows.push({ ...c, pass: false, err: e.message, snap: snapshot() }); break; }
    }
    const snap = snapshot();
    let pass = false;
    try { pass = !!c.expect(snap); } catch (e) { pass = false; }
    rows.push({ ...c, pass, snap });
  }

  // --md：输出 Markdown 表格，便于生成测试报告
  if (process.argv.includes('--md')) {
    const passed = rows.filter((r) => r.pass).length;
    console.log('| 模块 | 用户输入 | 校验点 | 结果 |');
    console.log('| --- | --- | --- | --- |');
    rows.forEach((r) => {
      console.log('| ' + r.mod + ' | ' + r.steps.join(' → ').replace(/\|/g, '\\|') + ' | ' + r.desc + ' | ' + (r.pass ? '通过' : '失败') + ' |');
    });
    console.log('\n合计：' + passed + '/' + rows.length + ' 通过');
    return;
  }

  const pad = (s, n) => { s = String(s); const w = [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 2 : 1), 0); return s + ' '.repeat(Math.max(0, n - w)); };
  console.log('\n模块'.padEnd(2) + pad('模块', 22) + pad('用例', 40) + pad('预期', 26) + '结果');
  console.log('-'.repeat(110));
  rows.forEach((r) => {
    console.log(pad(r.mod, 22) + pad(r.steps[r.steps.length - 1], 40) + pad(r.desc, 26) + (r.pass ? '✅' : '❌'));
  });
  const passed = rows.filter((r) => r.pass).length;
  console.log('-'.repeat(110));
  console.log(`通过 ${passed}/${rows.length}，失败 ${rows.length - passed}`);

  const failed = rows.filter((r) => !r.pass);
  if (failed.length) {
    console.log('\n失败明细：');
    failed.forEach((r) => {
      console.log(`- [${r.mod}] ${r.steps.join(' → ')}（${r.desc}）`);
      console.log('  实际状态: ' + JSON.stringify(r.snap));
      if (r.err) console.log('  异常: ' + r.err);
    });
    process.exitCode = 1;
  }
})();
