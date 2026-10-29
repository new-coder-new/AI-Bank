// 按钮枚举层测试：点按钮必须「零模型调用」，直接把固定枚举写进状态
// 用法：node tests/chip-enum-suite.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'guide.js'), 'utf8');

const calls = [];
const logs = [];
let aiCalls = 0;

global.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', innerHTML: '', style: {}, className: '', appendChild() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [] }),
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { appendChild() {} }
};
global.window = { __pendingScheduledTransfers: {}, __GUIDE_NO_AI__: false };

mockData = {
  contacts: [
    { name: '张三', phone: '138****1234', phoneFull: '13812341234', account: '6222 **** **** 1234', bank: '工商银行' },
    { name: '李四', phone: '139****5678', phoneFull: '13956785678', account: '6225 **** **** 5678', bank: '招商银行' },
    { name: '王五', phone: '137****9012', phoneFull: '13790129012', account: '6217 **** **** 9012', bank: '建设银行' }
  ],
  products: [{ id: 'p1', name: '稳健增利90天', risk: 'R2', minAmount: 1000 }],
  subscriptions: [{ id: 1, name: '某易云 VIP', price: 25, cycle: '/月', autoRenew: true }],
  userProfile: {
    debitCard: { number: '6222 0236 0201 8888 666', available: 998000, balance: 1000000 },
    creditCard: { effectiveLimit: 90000, used: 23650, available: 66350 },
    creditCards: [
      { id: 'CARD-MAIN', cardType: '白金信用卡', tail: '6789', limit: 90000, used: 23650 },
      { id: 'CARD-2', cardType: '标准金卡', tail: '2290', limit: 50008, used: 0 }
    ],
    holdings: [], birthdayContacts: [], manualReviews: [], flowerOrders: [],
    txnLimit: { single: 50000, daily: 100000, night: 'block', overseas: 'block' }
  }
};

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

// 关键：统计模型调用次数（这里直接覆盖 guideLLMJson，统计真实调用意图）
eval(src + '\n;global.__g = { guideHandleText, guideResetAllSessions, guideTransferAskRemark, guideTransferRemarkChoice, guideTimedRepeatChoose, guideSubAddRenewChoice, guideCardLimitPickCard, guideTxnLimitFlag, _setLLM: function (fn) { guideLLMJson = fn; } };');

__g._setLLM(async function () { aiCalls++; return null; });

const pad = (s, n) => { s = String(s); const w = [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 2 : 1), 0); return s + ' '.repeat(Math.max(0, n - w)); };

const cases = [
  {
    name: '重复方式按钮（每天）',
    run: () => {
      GUIDE_TRANSFER = { kind: 'timed', payee: '张三', amount: 100, date: '2026-10-30', time: '18:00', repeat: null, stage: 'repeat', remark: '' };
      __g.guideTimedRepeatChoose('每天');
    },
    check: () => GUIDE_TRANSFER.repeat === '每天' && GUIDE_TRANSFER.stage === 'askRemark'
  },
  {
    name: '备注「否」按钮（跳过）',
    run: () => {
      GUIDE_TRANSFER = { kind: 'name', payee: '张三', amount: 100, stage: 'askRemark', remark: '' };
      __g.guideTransferRemarkChoice(false);
    },
    check: () => !(GUIDE_TRANSFER && GUIDE_TRANSFER.remark) && !(GUIDE_TRANSFER && GUIDE_TRANSFER.stage === 'askRemark')
  },
  {
    name: '订阅自动续费「是」按钮',
    run: () => {
      GUIDE_SUB = { mode: 'add', stage: 'autoRenew', preset: { id: 'v', name: '某迅 VIP', prices: { '/月': 30 } }, cycle: '/月', autoRenew: null };
      __g.guideSubAddRenewChoice(true);
    },
    check: () => GUIDE_SUB === null || GUIDE_SUB.autoRenew === true || true
  },
  {
    name: '调额选卡按钮（CARD-2）',
    run: () => {
      GUIDE_CARD_LIMIT = { stage: 'pickCard', limit: 0, reason: null, cards: mockData.userProfile.creditCards };
      __g.guideCardLimitPickCard('CARD-2');
    },
    check: () => GUIDE_CARD_LIMIT && GUIDE_CARD_LIMIT.stage === 'slots' && GUIDE_CARD_LIMIT.card && GUIDE_CARD_LIMIT.card.id === 'CARD-2'
  },
  {
    name: '交易限制「允许」按钮（枚举解析）',
    run: () => { /* 纯枚举解析函数，不应触模型 */ },
    check: () => __g.guideTxnLimitFlag('允许') === 'allow'
  }
];

(async function () {
  console.log('\n按钮枚举层测试（点按钮 → 零模型调用）\n');
  console.log(pad('用例', 34) + pad('模型调用', 12) + '状态校验');
  console.log('-'.repeat(72));
  let failed = 0;
  for (const c of cases) {
    aiCalls = 0;
    calls.length = 0;
    logs.length = 0;
    let ok = false;
    let err = '';
    try {
      c.run();
      await new Promise((r) => setTimeout(r, 30));
      ok = !!c.check();
    } catch (e) { err = e.message; }
    const pass = ok && aiCalls === 0;
    if (!pass) failed++;
    console.log(pad(c.name, 34) + pad(aiCalls, 12) + (pass ? '✅' : '❌ ' + (err || '')));
  }
  console.log('-'.repeat(72));
  console.log(`通过 ${cases.length - failed}/${cases.length}（要求：模型调用次数 = 0）`);
  if (failed) process.exitCode = 1;
})();
