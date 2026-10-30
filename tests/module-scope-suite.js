// 方案A：模块作用域隔离用例（进入模块后不允许跨模块直通）
// 用法：node tests/module-scope-suite.js
const fs = require('fs');
const path = require('path');
const RULES = fs.readFileSync(path.join(__dirname, '..', 'js', 'flows', 'guide-rules.js'), 'utf8');
const AI = fs.readFileSync(path.join(__dirname, '..', 'js', 'flows', 'guide-ai.js'), 'utf8');
const src = RULES + '\n' + AI + '\n' + fs.readFileSync(path.join(__dirname, '..', 'js', 'flows', 'guide.js'), 'utf8');

global.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', innerHTML: '', style: {}, className: '', appendChild() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [] }),
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { appendChild() {} }
};
global.window = { __pendingScheduledTransfers: {} };
window.__GUIDE_NO_AI__ = true;

mockData = {
  contacts: [{ name: '张三', phone: '138****1234', phoneFull: '13812341234', account: '6222 **** **** 1234' }],
  products: [{ name: '稳健增利90天', riskLevel: 2, minAmount: 1000 }],
  subscriptions: [{ id: 1, name: '某易云 VIP', price: 25, cycle: '/月', autoRenew: true }],
  userProfile: {
    debitCard: { number: '6222 0236 0201 8888 666', available: 998000, balance: 1000000 },
    creditCards: [{ id: 'CARD-MAIN', cardType: '白金信用卡', tail: '6789', limit: 90000, used: 23650 }],
    holdings: [], birthdayContacts: [], manualReviews: [], flowerOrders: [],
    txnLimit: { single: 50000, daily: 100000, night: 'block', overseas: 'block' }
  }
};

const appended = [];
appendMessage = (h) => { appended.push(String(h || '')); };
scrollToBottom = () => {};
guideMessage = (h) => h;
guideChipsDone = () => {};
guideTyping = () => {};
escapeHtml = (s) => String(s == null ? '' : s);
guideContactNames = () => '张三';
guideIsContact = (n) => n === '张三';
showBillOverview = () => appended.push('bill');
showAbnormalAlert = () => appended.push('abnormal');
showHoldings = () => appended.push('holdings');
showCardMyCards = () => appended.push('cards');
txnLimitData = () => mockData.userProfile.txnLimit;
cardServiceCards = () => (mockData.userProfile.creditCards || []).map((c) => Object.assign({}, c, { status: '正常' }));
cardServiceListHtml = () => '';
guideAIFirstEnabled = () => false;
guideLLMJson = async () => null;
renderServiceWelcome = () => appended.push('welcome');

eval(src + '\n;global.__g = { guideHandleText, guideResetAllSessions, guideOpenModuleMenu, guideMainModuleGuess, guideActiveFlowLabel };');

const tick = (n) => new Promise((res) => { let i = 0; const go = () => (++i >= (n || 3) ? res() : setTimeout(go, 10)); setTimeout(go, 10); });
const last = () => appended.slice(-1)[0] || '';
const anyFlow = () => !!(GUIDE_TRANSFER || GUIDE_AA || GUIDE_WEALTH || GUIDE_CARD_APPLY || GUIDE_CARD_LIMIT || GUIDE_TXN_LIMIT || GUIDE_CARD_LOST || GUIDE_SUB || GUIDE_FLOWER);
const flowLabel = () => __g.guideActiveFlowLabel();

const CASES = [
  // 卡片管理内
  { cur: 'card', text: '挂失尾号6789的卡', expect: (s) => s.mode === 'lost' || /确认挂失/.test(last()) },
  { cur: 'card', text: '我不想订阅某易云了', expect: () => /当前在.*卡片管理/.test(last()) && !GUIDE_SUB },
  { cur: 'card', text: '转账给张三1000元', expect: () => /当前在.*卡片管理/.test(last()) && !GUIDE_TRANSFER },
  { cur: 'card', text: '切换到订阅管理', expect: () => /订阅管理包含这些操作/.test(last()) },
  { cur: 'card', text: '查一下我的余额', expect: () => !/当前在/.test(last()) },
  // 理财内
  { cur: 'wealth', text: '有哪些理财产品', expect: () => /在售理财产品/.test(last()) },
  { cur: 'wealth', text: '挂失尾号6789的卡', expect: () => /当前在.*理财/.test(last()) && !GUIDE_CARD_LOST },
  { cur: 'wealth', text: '切换到卡片管理', expect: () => /卡片管理包含这些操作/.test(last()) },
  // 订阅内
  { cur: 'sub', text: '我想要订阅某易云年卡', expect: () => GUIDE_SUB && GUIDE_SUB.mode === 'add' },
  { cur: 'sub', text: '有哪些理财产品', expect: () => /当前在.*订阅管理/.test(last()) && !GUIDE_WEALTH },
  { cur: 'sub', text: '切换到理财', expect: () => /理财服务包含这些内容/.test(last()) },
  // 鲜花内（只读）
  { cur: 'flower', text: '转账给张三1000元', expect: () => /当前在.*生日鲜花/.test(last()) && !GUIDE_TRANSFER },
  // 主菜单不受影响
  { cur: 'chat', text: '转账给张三1000元', expect: () => /姓名转账/.test(last()) }
];

(async () => {
  let passN = 0;
  for (const c of CASES) {
    __g.guideResetAllSessions();
    appended.length = 0;
    currentModule = 'chat';
    if (c.cur !== 'chat') {
      __g.guideOpenModuleMenu(c.cur);
      currentModule = c.cur;
      appended.length = 0;
    }
    await tick(1);
    let err = '';
    try { await __g.guideHandleText(c.text); await tick(4); } catch (e) { err = e.message; }
    const ok = !err && c.expect({ mode: GUIDE_CARD_LOST && GUIDE_CARD_LOST.stage });
    if (ok) passN++;
    console.log((ok ? '✅' : '❌') + ' [' + c.cur + '] ' + c.text + (ok ? '' : '  ← ' + (err || String(last()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 70))));
  }
  console.log(`\n通过 ${passN}/${CASES.length}`);
  if (passN !== CASES.length) process.exitCode = 1;
})();
