// 订阅菜单用例：口语说法必须分派到正确子流程
// 用法：node tests/sub-menu-suite.js
const fs = require('fs');
const path = require('path');
const RULES_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'flows', 'guide-rules.js'), 'utf8');
const AI_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'flows', 'guide-ai.js'), 'utf8');
const src = RULES_SRC + '\n' + AI_SRC + '\n' + fs.readFileSync(path.join(__dirname, '..', 'js', 'flows', 'guide.js'), 'utf8');

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
  subscriptions: [
    { id: 1, name: '某易云 VIP', price: 25, cycle: '/月', autoRenew: true },
    { id: 2, name: '某度网盘 VIP', price: 40, cycle: '/月', autoRenew: true }
  ],
  userProfile: {
    debitCard: { number: '6222 0236 0201 8888 666', available: 998000, balance: 1000000 },
    creditCards: [{ id: 'CARD-MAIN', cardType: '白金信用卡', tail: '6789', limit: 90000, used: 23650 }],
    holdings: [], birthdayContacts: [], manualReviews: [], flowerOrders: [],
    txnLimit: { single: 50000, daily: 100000, night: 'block', overseas: 'block' }
  }
};

const appended = [];
appendMessage = (html) => { appended.push(String(html || '')); };
scrollToBottom = () => {};
guideMessage = (html) => html;
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
guideAIFirstEnabled = () => false;
guideLLMJson = async () => null;
renderServiceWelcome = () => appended.push('welcome');

eval(src + '\n;global.__g = { guideHandleText, guideResetAllSessions, guideStartSubManage, guideOpenModuleMenu };');

const tick = (n) => new Promise((res) => { let i = 0; const go = () => (++i >= (n || 3) ? res() : setTimeout(go, 10)); setTimeout(go, 10); });
const last = () => appended.slice(-1)[0] || '';

const CASES = [
  { text: '我不想订阅某易云了', expect: (s, l) => s.mode === 'cancel' },
  { text: '某易云不要了', expect: (s) => s.mode === 'cancel' },
  { text: '退订某度网盘', expect: (s) => s.mode === 'cancel' },
  { text: '订阅某易云年卡', expect: (s) => s.mode === 'add' },
  { text: '开通某讯会员', expect: (s) => s.mode === 'add' },
  { text: '某度网盘不续费了', expect: (s) => s.mode === 'manage' },
  { text: '关闭某讯的自动续费', expect: (s) => s.mode === 'manage' },
  { text: '取消所有订阅', expect: (s) => s.mode === 'cancel-all' },
  { text: '能订哪些会员', expect: (s, l) => /可订阅的会员服务/.test(l) },
  { text: '随便说点啥', expect: (s, l) => /请选择订阅管理里的操作/.test(l) }
];

(async () => {
  let passN = 0;
  for (const c of CASES) {
    __g.guideResetAllSessions();
    appended.length = 0;
    __g.guideStartSubManage();
    await tick(1);
    let err = '';
    try { await __g.guideHandleText(c.text); await tick(4); } catch (e) { err = e.message; }
    const snap = GUIDE_SUB || {};
    const ok = !err && c.expect(snap, last());
    if (ok) passN++;
    console.log((ok ? '✅' : '❌') + ' ' + c.text + ' → mode=' + (snap.mode || 'null') + (ok ? '' : ' | ' + (err || String(last()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 60))));
  }
  console.log(`\n通过 ${passN}/${CASES.length}`);
  if (passN !== CASES.length) process.exitCode = 1;
})();
