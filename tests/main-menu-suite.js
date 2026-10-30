// 主菜单行为测试：主菜单只判一级模块并打开菜单，绝不直通、不建会话
// 用法：node tests/main-menu-suite.js
const fs = require('fs');
const path = require('path');
const RULES_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'flows', 'guide-rules.js'), 'utf8');
const AI_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'flows', 'guide-ai.js'), 'utf8');
const src = RULES_SRC + '\n' + AI_SRC + '\n' + fs.readFileSync(path.join(__dirname, '..', 'js', 'flows', 'guide.js'), 'utf8');

// ---------- 桩 ----------
global.document = {
  getElementById: () => null,
  createElement: () => ({ id: '', innerHTML: '', style: {}, className: '', appendChild() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [] }),
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { appendChild() {} }
};
global.window = { __pendingScheduledTransfers: {} };
window.__GUIDE_NO_AI__ = true;   // 不调模型，纯验证主菜单规则

mockData = {
  contacts: [
    { name: '张三', phone: '138****1234', phoneFull: '13812341234', account: '6222 **** **** 1234' },
    { name: '李四', phone: '139****5678', phoneFull: '13956785678', account: '6225 **** **** 5678' }
  ],
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
appendMessage = (html) => { appended.push(String(html || '')); };
scrollToBottom = () => {};
guideMessage = (html) => html;
guideChipsDone = () => {};
guideTyping = () => {};
escapeHtml = (s) => String(s == null ? '' : s);
guideContactNames = () => mockData.contacts.map((c) => c.name).join('、');
guideIsContact = (n) => mockData.contacts.some((c) => c.name === n);
showBillOverview = () => appended.push('bill-overview');
showAbnormalAlert = () => appended.push('abnormal');
showHoldings = () => appended.push('holdings');
showCardMyCards = () => appended.push('my-cards');
txnLimitData = () => mockData.userProfile.txnLimit;
guideAIFirstEnabled = () => false;
guideLLMJson = async () => null;
renderServiceWelcome = () => appended.push('welcome');

eval(src + '\n;global.__g = { guideHandleText, guideResetAllSessions, guideOpenService, guideMainModuleGuess, guideIsReadOnlyQuery, guideActiveFlowLabel };');

const tick = (n) => new Promise((res) => { let i = 0; const go = () => (++i >= (n || 3) ? res() : setTimeout(go, 10)); setTimeout(go, 10); });

const snapshot = () => ({
  transfer: GUIDE_TRANSFER ? GUIDE_TRANSFER.kind : null,
  aa: GUIDE_AA ? true : null,
  wealth: GUIDE_WEALTH ? true : null,
  cardApply: GUIDE_CARD_APPLY ? true : null,
  cardLimit: GUIDE_CARD_LIMIT ? true : null,
  txn: GUIDE_TXN_LIMIT ? true : null,
  lost: GUIDE_CARD_LOST ? true : null,
  sub: GUIDE_SUB ? GUIDE_SUB.mode : null,
  flow: guideActiveFlowLabel(),
  last: appended.filter((x) => !/^welcome$/.test(x)).slice(-1)[0] || ''
});

const CASES = [
  { text: '给张三转账1000元', module: 'transfer', desc: '姓名+金额也不直通' },
  { text: '转账1000给张三', module: 'transfer', desc: '金额在前也不直通' },
  { text: '转账 500', module: 'transfer', desc: '半截指令不直通' },
  { text: 'AA收款', module: 'transfer', desc: '点名子功能也不直通' },
  { text: '我想汇点钱给我妈', module: 'transfer', desc: '口语汇款' },
  { text: '打500块钱给李四', module: 'transfer', desc: '打钱口语' },
  { text: '我要转账', module: 'transfer', desc: '纯模块意图' },
  { text: '理财', module: 'wealth', desc: '模块词' },
  { text: '申购1001，5000元', module: 'wealth', desc: '产品+金额也不直通' },
  { text: '我想买点基金', module: 'wealth', desc: '买基金口语' },
  { text: '我持有多少', module: 'wealth', desc: '持仓口语' },
  { text: '帮我赎回稳健增利90天', module: 'wealth', desc: '赎回也不直通' },
  { text: '分析本月账单', module: 'bill', desc: '账单也先进菜单' },
  { text: '最近有没有异常交易', module: 'bill', desc: '异常交易' },
  { text: '我想办卡', module: 'card', desc: '办卡口语（本次 bug）' },
  { text: '我想办一张金卡', module: 'card', desc: '办卡+卡种' },
  { text: '开一张信用卡', module: 'card', desc: '开卡口语' },
  { text: '挂失尾号6789的卡', module: 'card', desc: '挂失也不直通' },
  { text: '我要申请一张信用卡', module: 'card', desc: '申请也不直通' },
  { text: '把白金卡额度提到8万', module: 'card', desc: '调额不直通' },
  { text: '设个单笔限额2万', module: 'card', desc: '限额不直通' },
  { text: '我的卡丢了', module: 'card', desc: '卡丢了' },
  { text: '订阅某易云年卡', module: 'sub', desc: '订阅进订阅管理菜单' },
  { text: '帮我退订某度网盘', module: 'sub', desc: '退订口语进订阅管理' },
  { text: '给林小雨订一束花', module: 'flower', desc: '订花进生日鲜花菜单' },
  { text: '订个生日蛋糕', module: 'flower', desc: '蛋糕进生日鲜花菜单' }
];

const NO_FLOW = ['transfer', 'aa', 'wealth', 'cardApply', 'cardLimit', 'txn', 'lost', 'sub'];

(async () => {
  const rows = [];
  for (const c of CASES) {
    __g.guideResetAllSessions();
    currentModule = 'chat';
    appended.length = 0;
    let err = '';
    try { await __g.guideHandleText(c.text); await tick(3); } catch (e) { err = e.message; }
    const snap = snapshot();
    const noFlow = NO_FLOW.every((k) => !snap[k]) || (snap.sub === 'choose' && NO_FLOW.filter((k) => k !== 'sub').every((k) => !snap[k]));
    const mod = __g.guideMainModuleGuess(c.text);
    // 已进入该模块：二级菜单（含示例行）或只读页（鲜花目前只展示订单）
    const openedMenu = /例如：/.test(snap.last) ||
      /请选择|包含这些|请告诉我你垫付|我的卡片|风险测评/.test(snap.last) ||
      (c.module === 'flower' && /鲜花订单|生日鲜花|暂未开放/.test(snap.last));
    const pass = !err && noFlow && mod === c.module && openedMenu;
    rows.push({ ...c, pass, err, snap, mod, openedMenu });
  }

  let passed = 0;
  console.log('模块 | 输入 | 说明 | 期望模块 | 结果');
  console.log('--- | --- | --- | --- | ---');
  for (const r of rows) {
    if (r.pass) passed++;
    console.log(`${r.pass ? '✅' : '❌'} | ${r.text} | ${r.desc} | ${r.module} | ${r.pass ? '只开菜单、无会话' : '异常:' + (r.err || 'flow=' + r.snap.flow + ' menu=' + r.openedMenu)}`);
  }
  console.log(`\n通过 ${passed}/${rows.length}`);
  if (passed !== rows.length) process.exitCode = 1;
})();
