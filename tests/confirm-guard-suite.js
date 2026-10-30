// 确认卡守卫测试：停留在最后一步确认卡时，未识别的输入统一回「请完成上述操作。」
// 用法：node tests/confirm-guard-suite.js
const fs = require('fs');

const path = require('path');
const RULES_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'flows', 'guide-rules.js'), 'utf8');
const AI_SRC = fs.readFileSync(path.join(__dirname, "..", "js", "flows", "guide-ai.js"), "utf8");
const src = RULES_SRC + '\n' + AI_SRC + '\n' + fs.readFileSync(path.join(__dirname, '..', 'js', 'flows', 'guide.js'), 'utf8');

const logs = [];
const calls = [];

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
    { name: '张三', phone: '138****1234', phoneFull: '13812341234', account: '6222 **** **** 1234', bank: '工商银行' },
    { name: '李四', phone: '139****5678', phoneFull: '13956785678', account: '6225 **** **** 5678', bank: '招商银行' }
  ],
  products: [{ id: 'p1', name: '稳健增利90天', risk: 'R2', minAmount: 1000 }],
  subscriptions: [{ id: 1, name: '某易云 VIP', price: 25, cycle: '/月', autoRenew: true }],
  userProfile: {
    debitCard: { number: '6222 0236 0201 8888 666', available: 998000, balance: 1000000 },
    creditCard: { effectiveLimit: 90000, used: 23650, available: 66350 },
    creditCards: [{ id: 'CARD-MAIN', cardType: '白金信用卡', tail: '6789', limit: 90000, used: 23650 }],
    holdings: [], birthdayContacts: [], manualReviews: [], flowerOrders: [],
    txnLimit: { single: 50000, daily: 100000, night: 'block', overseas: 'block' }
  }
};

// 运行环境 stub：guide.js 依赖 config.js 里的全局状态
currentModule = 'chat';
GUIDE_WRAPUP = null;
GUIDE_FLOWER = null;
GUIDE_HOLDING = null;
GUIDE_SUB = null;
GUIDE_WEALTH = null;
GUIDE_TRANSFER = null;
GUIDE_AA = null;
GUIDE_CARD_APPLY = null;
GUIDE_CARD_LIMIT = null;
GUIDE_TXN_LIMIT = null;
GUIDE_CARD_LOST = null;
guideActiveFlowLabel = () => '';
guideModuleWrapUp = () => {};
guideOpenModuleMenu = () => {};
guideExitSilently = () => {};
guideModuleLabel = (k) => k;

appendMessage = (h) => logs.push(String(h));
scrollToBottom = () => {};
escapeHtml = (s) => String(s == null ? '' : s);
guideMessage = (i) => i;
guideBackToMenu = () => calls.push('menu');
renderServiceWelcome = () => calls.push('welcome');
saveUserData = () => {};
addTransaction = () => true;
verifyAmountRisk = async () => ({ ok: true });
submitManualReview = () => ({ id: 'r1' });
submitCardApplyReview = () => ({ id: 'r2' });
showSecurityVerification = () => calls.push('security');
showBillOverview = () => calls.push('bill');
showAbnormalAlert = () => calls.push('alert');
showAbnormalSummary = () => calls.push('abnormalSummary');
startRiskAssessment = () => calls.push('risk');
showCardMyCards = () => calls.push('cards');
showBirthdayReminder = () => calls.push('birthday');
showHoldings = () => calls.push('holdings');
cardServiceCards = () => mockData.userProfile.creditCards;
cardLimitData = () => ({ effectiveLimit: 90000, used: 23650, available: 66350 });
cardLimitMinimum = () => 23650;
txnLimitData = () => mockData.userProfile.txnLimit;

eval(src + '\n;global.__g = { guideHandleText, guideResetAllSessions, guideAwaitingFinalAction };');

const guardText = '请完成上述操作。';
const lastLogs = () => logs.join(' ');

async function run(text) {
  logs.length = 0;
  await __g.guideHandleText(text);
  await new Promise((r) => setTimeout(r, 40));
  return { text, logs: lastLogs() };
}

const pad = (s, n) => { s = String(s); const w = [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 2 : 1), 0); return s + ' '.repeat(Math.max(0, n - w)); };

const cases = [
  {
    mod: 'AA 收款',
    setup: () => { GUIDE_AA = { total: 300, participants: [{ name: '张三' }, { name: '李四' }], stage: 'confirm' }; },
    expect: () => GUIDE_AA && GUIDE_AA.stage === 'confirm'
  },
  {
    mod: '额度调整',
    setup: () => { GUIDE_CARD_LIMIT = { stage: 'confirm', limit: 80000, reason: '消费需求增加', card: mockData.userProfile.creditCards[0] }; },
    expect: () => GUIDE_CARD_LIMIT && GUIDE_CARD_LIMIT.stage === 'confirm'
  },
  {
    mod: '交易限制',
    setup: () => { GUIDE_TXN_LIMIT = { stage: 'confirm', single: 20000, daily: 50000, night: 'allow', overseas: 'block' }; },
    expect: () => GUIDE_TXN_LIMIT && GUIDE_TXN_LIMIT.stage === 'confirm'
  },
  {
    mod: '卡片挂失',
    setup: () => { GUIDE_CARD_LOST = { stage: 'confirm', card: mockData.userProfile.creditCards[0], tail: '6789' }; },
    expect: () => GUIDE_CARD_LOST && GUIDE_CARD_LOST.stage === 'confirm'
  },
  {
    mod: '卡片申请',
    setup: () => { GUIDE_CARD_APPLY = { stage: 'confirm', cardType: '标准金卡', limit: 50000, purpose: '日常消费' }; },
    expect: () => GUIDE_CARD_APPLY && GUIDE_CARD_APPLY.stage === 'confirm'
  },
  {
    mod: '订阅添加',
    setup: () => { GUIDE_SUB = { mode: 'add', stage: 'confirm', preset: { name: '某易云 VIP', prices: { '/月': 25 } }, cycle: '/月', autoRenew: true }; },
    expect: () => GUIDE_SUB && GUIDE_SUB.stage === 'confirm'
  },
  {
    mod: '订阅修改',
    setup: () => { GUIDE_SUB = { mode: 'manage', stage: 'confirm', target: mockData.subscriptions[0], newAutoRenew: false }; },
    expect: () => GUIDE_SUB && GUIDE_SUB.stage === 'confirm'
  },
  {
    mod: '鲜花订单',
    setup: () => { GUIDE_FLOWER = { mode: 'order', stage: 'confirm', order: { recipient: '张三', phone: '13812341234', address: 'X', bouquet: '简约玫瑰', date: '2026-11-01', slot: 'afternoon', card: '', payMethod: '储蓄卡' } }; },
    expect: () => GUIDE_FLOWER && GUIDE_FLOWER.stage === 'confirm'
  },
  {
    mod: '定时转账确认卡',
    setup: () => { window.__pendingScheduledTransfers = { 'sched-demo-1': { payee: '张三', amount: 100, date: '2026-10-30', time: '15:00' } }; },
    expect: () => Object.keys(window.__pendingScheduledTransfers).length === 1
  },
  {
    mod: 'Agent 确认卡',
    setup: () => { AGENT_PENDING_PLANS = { 'plan-demo': { status: 'pending', plan: {}, tier: null } }; },
    expect: () => AGENT_PENDING_PLANS['plan-demo'].status === 'pending'
  }
];

(async function () {
  console.log('\n确认卡守卫测试（未点按钮就乱说 → 请完成上述操作。）\n');
  console.log(pad('模块', 20) + pad('输入', 14) + pad('回复是否正确', 14) + '状态是否保持');
  console.log('-'.repeat(76));
  let failed = 0;
  for (const c of cases) {
    __g.guideResetAllSessions();
    window.__pendingScheduledTransfers = {};
    AGENT_PENDING_PLANS = {};
    c.setup();
    const r = await run('哈哈哈随便说点什么');
    const replied = r.logs.includes(guardText);
    const kept = !!c.expect();
    const pass = replied && kept;
    if (!pass) failed++;
    console.log(pad(c.mod, 20) + pad('哈哈哈…', 14) + pad(replied ? '是' : '否', 14) + (kept ? '是' : '否') + (pass ? ' ✅' : ' ❌'));
  }

  // 反例：确认卡上的合法输入不能被拦
  __g.guideResetAllSessions();
  GUIDE_CARD_LIMIT = { stage: 'confirm', limit: 80000, reason: '消费需求增加', card: mockData.userProfile.creditCards[0] };
  const normal = await run('确认');
  const normalOk = !normal.logs.includes(guardText);
  console.log('\n反例：确认卡上说「确认」不被拦截 → ' + (normalOk ? '✅' : '❌'));
  if (!normalOk) failed++;

  console.log('-'.repeat(76));
  console.log(`通过 ${cases.length + 1 - failed}/${cases.length + 1}`);
  if (failed) process.exitCode = 1;
})();
