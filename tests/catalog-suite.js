// 清单查询用例：只在理财 / 订阅模块内生效
// 用法：node tests/catalog-suite.js
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
  products: [
    { name: '稳健增利90天', riskLevel: 2, minAmount: 1000, days: 90, rate: 3.85 },
    { name: '天天盈货币基金', riskLevel: 1, minAmount: 1, rate: 2.15 },
    { name: '均衡配置混合基金', riskLevel: 3, minAmount: 100, rate: 5.62 },
    { name: '安享三年定期', riskLevel: 1, minAmount: 50, rate: 2.75 },
    { name: '成长先锋股票基金', riskLevel: 4, minAmount: 1000, rate: 12.35 }
  ],
  subscriptions: [
    { id: 1, name: '某易云 VIP', price: 25, cycle: '/月', autoRenew: true }
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

eval(src + '\n;global.__g = { guideHandleText, guideResetAllSessions, guideOpenService, guideStartSubManage, guideWealthShowAllProducts, guideSubShowCatalog, guideActiveFlowLabel };');

const tick = (n) => new Promise((res) => { let i = 0; const go = () => (++i >= (n || 3) ? res() : setTimeout(go, 10)); setTimeout(go, 10); });
const last = () => appended.slice(-1)[0] || '';

const CASES = [
  // 主菜单：不出清单，只开菜单
  { name: '主菜单要理财产品清单', setup: () => { currentModule = 'chat'; }, steps: ['有哪些理财产品'], expect: (l) => /理财服务包含这些内容/.test(l) && !/在售理财产品/.test(l) },
  { name: '主菜单要会员清单', setup: () => { currentModule = 'chat'; }, steps: ['能订哪些会员'], expect: (l) => /订阅管理包含这些操作/.test(l) && !/可订阅的会员服务/.test(l) },
  // 理财内：出清单
  { name: '理财内要产品清单', setup: () => { __g.guideOpenService('wealth'); currentModule = 'wealth'; }, steps: ['有哪些理财产品'], expect: (l) => /在售理财产品（共 5 支）/.test(l) && /1001/.test(l) },
  { name: '理财内口语：能买什么基金', setup: () => { __g.guideOpenService('wealth'); currentModule = 'wealth'; }, steps: ['能买什么基金'], expect: (l) => /在售理财产品/.test(l) },
  // 订阅内：出清单
  { name: '订阅内要会员清单', setup: () => { __g.guideStartSubManage(); }, steps: ['能订哪些会员'], expect: (l) => /可订阅的会员服务（共 3 项）/.test(l) && /某易云 VIP/.test(l) && /已订阅/.test(l) },
  { name: '订阅内：有哪些会员', setup: () => { __g.guideStartSubManage(); }, steps: ['有哪些会员可以订阅'], expect: (l) => /可订阅的会员服务/.test(l) },
  // 流程中：拦截
  { name: '理财流程中要清单→拦截', setup: () => { __g.guideOpenService('wealth'); GUIDE_WEALTH = { stage: 'slots', product: null, amount: null }; currentModule = 'wealth'; }, steps: ['有哪些理财产品'], expect: (l) => /正在理财申购流程/.test(l) },
  { name: '订阅流程中要清单→拦截', setup: () => { __g.guideStartSubManage(); GUIDE_SUB = { mode: 'add', stage: 'slots', preset: null, cycle: null, autoRenew: null }; currentModule = 'life'; }, steps: ['能订哪些会员'], expect: (l) => /正在订阅管理流程/.test(l) },
  // 清单后继续说购买
  { name: '清单后直接下单', setup: () => { riskProfile = { level: 2, name: '稳健型', date: new Date().toISOString().slice(0, 10) }; __g.guideOpenService('wealth'); currentModule = 'wealth'; }, steps: ['有哪些理财产品', '1001 5000'], expect: (l) => /确认申购/.test(l) }
];

(async () => {
  let passN = 0;
  for (const c of CASES) {
    __g.guideResetAllSessions();
    appended.length = 0;
    try { c.setup(); } catch (e) { /* ignore */ }
    await tick(1);
    let err = '';
    for (const s of c.steps) {
      try { await __g.guideHandleText(s); await tick(4); } catch (e) { err = e.message; break; }
    }
    const ok = !err && c.expect(last());
    if (ok) passN++;
    console.log((ok ? '✅' : '❌') + ' ' + c.name + (ok ? '' : '  ← ' + (err || String(last()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 90))));
  }
  console.log(`\n通过 ${passN}/${CASES.length}`);
  if (passN !== CASES.length) process.exitCode = 1;
})();
