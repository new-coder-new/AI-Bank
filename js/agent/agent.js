// ==========================================================================
//  AI Banking Agent · 智能层（核心）
//  链路：自然语言 → 自主规划 → 调用工具 → 风险判断 → 必要确认 → 持续记忆
// ==========================================================================

// ------------------------------ 0. 基础工具 ------------------------------
function agentSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function agentFmt(n, digits) {
  var d = (typeof digits === 'number') ? digits : 2;
  return Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function agentFmtInt(n) {
  return Math.round(Number(n || 0)).toLocaleString('zh-CN');
}

// ------------------------------ 1. 长期记忆与用户画像 ------------------------------
var AGENT_MEMORY_KEY = 'agent_memory_v2';
var AGENT_MEMORY = null;

function agentMmdd(offsetDays) {
  var d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function agentDateStr(offsetDays) {
  var d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function agentMonthLabel() {
  var d = new Date();
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
}

function buildDefaultAgentMemory() {
  return {
    createdAt: new Date().toISOString(),
    profile: {
      name: '小陈',
      city: '清远',
      riskPreference: '稳健型',
      riskLevel: 'C2 稳健型',
      monthlyAvgExpense: 7520,
      confirmThreshold: 500,
      verifyThreshold: 5000,   // 金额达到此值必须二次验证
      loanQuota: 200000,       // 预授信可借额度
      loanRate: 3.45           // 消费贷参考年化利率（%）
    },
    family: [
      { name: '林小雨', relation: '爱人', birthdayOffset: 3, favoriteFlower: '向日葵', cakeSize: '6寸', avoid: ['香菜'] },
      { name: '陈爸爸', relation: '父亲', birthdayOffset: 58, favoriteFlower: '兰花', cakeSize: '', avoid: [] },
      { name: '陈妈妈', relation: '母亲', birthdayOffset: 121, favoriteFlower: '康乃馨', cakeSize: '', avoid: [] }
    ],
    goals: [
      { id: 'g1', name: '年度旅行基金', target: 20000, saved: 17700, deadline: agentDateStr(75) }
    ],
    preferences: {
      transferChannel: '手机银行',
      notifyStyle: '主动提醒'
    },
    habits: {
      frequentPayees: ['张三', '李四', '王五'],
      commute: '自驾',
      coffee: '每周 3 杯'
    },
    events: [
      { id: 'e1', type: 'birthday', target: '林小雨', date: agentMmdd(3), status: 'pending' }
    ],
    notes: [
      { at: new Date().toISOString(), text: '生日这类事件不要只提醒，要直接给出可执行方案' }
    ]
  };
}

function loadAgentMemory() {
  try {
    var raw = localStorage.getItem(AGENT_MEMORY_KEY);
    var mem = raw ? JSON.parse(raw) : null;
    // 旧记忆里的确认阈值是 5000，与实际 T2 阈值 500 不一致，读取时迁移
    if (mem && mem.profile && mem.profile.confirmThreshold === 5000) {
      mem.profile.confirmThreshold = 500;
    }
    return mem;
  } catch (e) { return null; }
}
function saveAgentMemory() {
  try { localStorage.setItem(AGENT_MEMORY_KEY, JSON.stringify(AGENT_MEMORY)); } catch (e) { }
}

function initAgentMemory() {
  AGENT_MEMORY = loadAgentMemory();
  if (!AGENT_MEMORY) {
    AGENT_MEMORY = buildDefaultAgentMemory();
    saveAgentMemory();
  }
  // 家人生日始终相对"今天"重算，保证演示数据常新
  (AGENT_MEMORY.family || []).forEach(function (f) {
    if (typeof f.birthdayOffset === 'number') f.birthday = agentMmdd(f.birthdayOffset);
  });
  // 把画像里的家人并入既有生日联系人数据，让旧模块也能用
  if (!mockData.userProfile.birthdayContacts) mockData.userProfile.birthdayContacts = [];
  AGENT_MEMORY.family.forEach(function (f) {
    if (!mockData.userProfile.birthdayContacts.some(function (c) { return c.name === f.name; })) {
      mockData.userProfile.birthdayContacts.push({
        name: f.name, birthday: f.birthday, relation: f.relation,
        flower: f.favoriteFlower || '向日葵', price: 168
      });
    }
  });
  // 让演示数据始终对齐"当期"
  if (typeof agentReanchorDates === 'function') agentReanchorDates();
  return AGENT_MEMORY;
}

function agentDaysUntil(birthdayStr) {
  if (!birthdayStr) return 999;
  var p = String(birthdayStr).split('-');
  var mm = Number(p[0]), dd = Number(p[1]);
  if (!mm || !dd) return 999;
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var target = new Date(now.getFullYear(), mm - 1, dd);
  if (target < today) target = new Date(now.getFullYear() + 1, mm - 1, dd);
  return Math.round((target - today) / 86400000);
}

// 用自然语言指代家人：爱人 / 老婆 / 老公 / 妻子
function agentResolvePerson(text) {
  if (!AGENT_MEMORY) return null;
  var map = [
    { re: /爱人|老婆|妻子|太太|夫人|老公|丈夫/, rel: '爱人' },
    { re: /爸爸|父亲|爸/, rel: '父亲' },
    { re: /妈妈|母亲|妈/, rel: '母亲' }
  ];
  for (var i = 0; i < map.length; i++) {
    if (map[i].re.test(text)) {
      var found = AGENT_MEMORY.family.filter(function (f) { return f.relation === map[i].rel; })[0];
      if (found) return found;
    }
  }
  var direct = AGENT_MEMORY.family.filter(function (f) { return text.indexOf(f.name) > -1; })[0];
  return direct || null;
}

// ------------------------------ 1b. 会话级上下文记忆（Conversation Memory） ------------------------------
// 与 AGENT_MEMORY（跨会话长期画像）不同：这里保存"本次对话"里已经得出过的结论，
// 让用户连续追问时不必重新描述背景。例如"分析我的财务情况" → "那我能买3000的手机吗"，
// 第二次提问应直接复用第一次的收支/结余/风险结论，而不是当作全新问题。
var AGENT_SESSION = {
  facts: [],        // 本会话已查证的事实（来自工具真实结果）
  analyses: [],     // 本会话已产出的分析结论
  demands: [],      // 本会话用户表达过的需求
  lastFocus: null,  // 最近一次被讨论的对象（如"财务情况""3000元手机"）
  history: [],      // v7 历史问答（供上下文引用）
  topics: [],       // v7 话题栈（供指代消解）
  turns: 0,         // v7 已进行的对话轮数
  lastTopic: null,  // v7 最近话题
  startedAt: Date.now()
};
var AGENT_SESSION_MAX = 12;

function agentSessionReset() {
  AGENT_SESSION = {
    facts: [], analyses: [], demands: [], lastFocus: null, startedAt: Date.now(),
    // v7 对话上下文：历史问答 + 话题栈（供指代消解）
    history: [], topics: [], turns: 0, lastTopic: null
  };
}

function agentSessionPush(bucket, item) {
  var list = AGENT_SESSION[bucket];
  if (!list || !item) return;
  // 去重：同 key 只保留最新
  var idx = -1;
  for (var i = 0; i < list.length; i++) {
    if (list[i].key && item.key && list[i].key === item.key) { idx = i; break; }
  }
  if (idx > -1) list.splice(idx, 1);
  list.unshift(Object.assign({ at: Date.now() }, item));
  if (list.length > AGENT_SESSION_MAX) list.length = AGENT_SESSION_MAX;
}

// 记住一条查证事实，如 { key:'balance', text:'可用余额 ¥998,000.00' }
function agentSessionFact(key, text) {
  if (!text) return;
  agentSessionPush('facts', { key: key, text: text });
}
// 记住一条分析结论，如 { key:'health', text:'本月结余 ¥3,478，储蓄率 22%' }
function agentSessionAnalysis(key, text, extra) {
  if (!text) return;
  agentSessionPush('analyses', Object.assign({ key: key, text: text }, extra || {}));
}
// 记住用户需求，如 { key:'goal', text:'想在一年内存 10 万元' }
function agentSessionDemand(key, text) {
  if (!text) return;
  agentSessionPush('demands', { key: key, text: text });
}

// 把本会话关键数字固化成结构化快照，供决策/规划模块直接引用
function agentSessionSnapshot() {
  var month = agentMonthSummary();
  var budget = agentBudgetStatus();
  var card = (mockData.userProfile && mockData.userProfile.creditCard) || {};
  var debit = (mockData.userProfile && mockData.userProfile.debitCard) || {};
  return {
    available: Number(debit.available) || 0,
    balance: Number(debit.balance) || 0,
    income: month.income,
    expense: month.expense,
    surplus: month.balance,
    savingsRate: month.income > 0 ? (month.balance / month.income) : 0,
    budgetLimit: budget.monthLimit,
    budgetUsed: budget.used,
    budgetRemain: budget.remain,
    cardLimit: Number(card.limit) || 0,
    cardUsed: Number(card.used) || 0,
    cardAvailable: Number(card.available) || 0,
    cardUtil: card.limit ? (card.used / card.limit) : 0,
    riskLevel: (AGENT_MEMORY && AGENT_MEMORY.profile.riskLevel) || '未评估'
  };
}

// 生成注入提示词的"本会话已掌握的信息"文本块
function agentSessionContextText(maxItems) {
  var n = maxItems || 5;
  var parts = [];
  if (AGENT_SESSION.facts.length) {
    parts.push('已查证事实：' + AGENT_SESSION.facts.slice(0, n).map(function (x) { return x.text; }).join('；'));
  }
  if (AGENT_SESSION.analyses.length) {
    parts.push('已得出分析：' + AGENT_SESSION.analyses.slice(0, n).map(function (x) { return x.text; }).join('；'));
  }
  if (AGENT_SESSION.demands.length) {
    parts.push('用户已表达需求：' + AGENT_SESSION.demands.slice(0, n).map(function (x) { return x.text; }).join('；'));
  }
  if (!parts.length) return '';
  return parts.join('\n');
}

// 会话是否已有"财务全景"结论（用于判断追问能否免重述）
// ------------------------------ 2. 数据快照 ------------------------------
function agentMonthSummary() {
  var b = mockData.bills || { income: [], expense: [] };
  var income = (b.income || []).reduce(function (s, x) { return s + (x.value || 0); }, 0);
  var expense = (b.expense || []).reduce(function (s, x) { return s + (x.value || 0); }, 0);
  return { income: income, expense: expense, balance: income - expense, categories: b.expense || [], label: agentMonthLabel() };
}

function agentTotalAssets() {
  var u = mockData.userProfile || {};
  var d = u.debitCard || {};
  var holdings = (u.holdings || []).reduce(function (s, h) { return s + (h.amount || 0) + (h.profit || 0); }, 0);
  // 数据真实化：定期/基金/房产从后端资产结构读取（后端为唯一数据源），
  // 后端不可用时降级为演示默认值，保证离线也能跑。
  var fixed = 100000, fund = 45511, property = 600000;
  if (window.__API_ASSETS) {
    fixed = window.__API_ASSETS.fixed || fixed;
    fund = window.__API_ASSETS.fund || fund;
    property = window.__API_ASSETS.property || property;
  }
  return {
    cash: d.balance || 0,
    holdings: holdings,
    fixed: fixed,
    fund: fund,
    property: property,
    total: (d.balance || 0) + holdings + fixed + fund + property
  };
}

function agentCategoryStats() {
  var list = (mockData.bills && mockData.bills.expense) ? mockData.bills.expense.slice() : [];
  return list.sort(function (a, b) { return b.value - a.value; });
}

// 归因时排除刚性支出（房租水电等不随消费习惯波动）
function agentGrowthCategories(n) {
  var fixed = ['房租水电', '房贷', '生活缴费', '保险'];
  var cats = agentCategoryStats().filter(function (c) { return fixed.indexOf(c.label) === -1; });
  return cats.slice(0, n || 2);
}

function agentAbnormalTxns() {
  var txns = (mockData.userProfile && mockData.userProfile.recentTxns) ? mockData.userProfile.recentTxns : [];
  return txns.filter(function (t) { return t.abnormal; });
}

function agentUpcomingSubscriptions(withinDays) {
  var limit = withinDays || 7;
  var subs = mockData.subscriptions || [];
  var now = new Date();
  var t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return subs.map(function (s) {
    var d;
    if (s.chargeDate) {
      var p = String(s.chargeDate).split('-').map(Number);
      d = new Date(p[0], p[1] - 1, p[2]);
    } else if (s.chargeDay) {
      d = new Date(t0.getFullYear(), t0.getMonth(), s.chargeDay);
      if (d < t0) d = new Date(t0.getFullYear(), t0.getMonth() + 1, s.chargeDay);
    } else {
      d = new Date(t0.getTime() + 30 * 86400000);
    }
    return { sub: s, inDays: Math.round((d - t0) / 86400000) };
  }).filter(function (x) { return x.inDays >= 0 && x.inDays <= limit; })
    .sort(function (a, b) { return a.inDays - b.inDays; });
}

function agentBudgetStatus() {
  var u = mockData.userProfile || {};
  var bud = u.budgets || {};
  var monthLimit = bud.month || 0;
  var used = agentMonthSummary().expense;
  var remain = monthLimit - used;
  var now = new Date();
  var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  var daysLeft = daysInMonth - now.getDate();
  var dailyRate = now.getDate() > 0 ? used / now.getDate() : 0;
  var canLast = remain <= 0 ? 0 : (dailyRate > 0 ? Math.floor(remain / dailyRate) : 999);
  return {
    monthLimit: monthLimit, used: used, remain: remain, daysLeft: daysLeft,
    dailyRate: dailyRate, canLast: canLast, overspent: remain < 0,
    usedRatio: monthLimit > 0 ? used / monthLimit : 0
  };
}

function agentBudgetSummaryText(s) {
  if (s.overspent) {
    return '月度预算 ¥' + agentFmtInt(s.monthLimit) + '，已用 ¥' + agentFmtInt(s.used) +
      '，已超出 ¥' + agentFmtInt(Math.abs(s.remain)) + '（本月还剩 ' + s.daysLeft + ' 天）';
  }
  return '月度预算 ¥' + agentFmtInt(s.monthLimit) + '，已用 ¥' + agentFmtInt(s.used) +
    '，剩余 ¥' + agentFmtInt(s.remain) + '（按当前速度可维持 ' + s.canLast + ' 天，本月还剩 ' + s.daysLeft + ' 天）';
}

function agentTravelBudget() {
  var goals = (AGENT_MEMORY && AGENT_MEMORY.goals) ? AGENT_MEMORY.goals : [];
  var g = goals[0];
  if (!g) return { name: '旅行预算', remain: 2300, days: 18 };
  var remain = Math.max(0, (g.target || 0) - (g.saved || 0));
  var dailyRate = agentBudgetStatus().dailyRate || 0;
  // 旅行基金按专门额度消耗，速率低于日常总支出
  var burn = Math.max(1, dailyRate * 0.15);
  var days = Math.max(1, Math.round(remain / burn));
  return { name: g.name, saved: g.saved, target: g.target, remain: remain, days: days };
}

// ------------------------------ 3. 工具注册表 ------------------------------
var AGENT_TOOL_REGISTRY = {};

function registerAgentTool(name, def) {
  AGENT_TOOL_REGISTRY[name] = Object.assign({ name: name, risk: 'low' }, def);
}
function getAgentTool(name) { return AGENT_TOOL_REGISTRY[name]; }

// 把工具结果落进会话记忆：只记住"能改变判断"的关键事实，避免上下文被噪音塞满
var AGENT_TOOL_MEMORY_HINT = {
  'account.balance': 'balance',
  'bill.monthSummary': 'month',
  'budget.status': 'budget',
  'card.overview': 'card',
  'bill.detectAbnormal': 'abnormal',
  'subscription.list': 'subscription',
  'account.profile': 'profile'
};

function agentRememberToolResult(name, res) {
  if (!res || res.ok === false || !res.summary) return;
  var key = AGENT_TOOL_MEMORY_HINT[name];
  if (key) agentSessionFact(key, res.summary);
}

async function callAgentTool(name, args) {
  var tool = getAgentTool(name);
  if (!tool) return { ok: false, tool: name, summary: '未找到工具：' + name };
  try {
    var out = await tool.run(args || {});
    var res = Object.assign({ ok: true, tool: name, risk: tool.risk }, out || {});
    if (typeof agentRememberToolResult === 'function') agentRememberToolResult(name, res);
    return res;
  } catch (e) {
    return { ok: false, tool: name, summary: '执行失败：' + ((e && e.message) ? e.message : String(e)) };
  }
}

// —— 账户类 ——
registerAgentTool('account.balance', {
  label: '查询账户余额', risk: 'low',
  run: function () {
    var d = mockData.userProfile.debitCard;
    return {
      summary: '可用余额 ¥' + agentFmt(d.available) + '，其中冻结 ¥' + agentFmt(d.frozen),
      data: d
    };
  }
});

registerAgentTool('account.profile', {
  label: '读取用户画像', risk: 'low',
  run: function () {
    var m = AGENT_MEMORY;
    return {
      summary: '客户 ' + m.profile.name + ' · ' + m.profile.riskLevel + ' · 家庭 ' + m.family.length + ' 位成员已建档',
      data: m.profile
    };
  }
});

registerAgentTool('account.transactions', {
  label: '查询交易明细', risk: 'low',
  run: function (args) {
    var list = (mockData.userProfile.recentTxns || []);
    var type = args && args.type;
    if (type) list = list.filter(function (t) { return t.type === type; });
    return { summary: '命中 ' + list.length + ' 笔交易记录', data: list.slice(0, 10) };
  }
});

// —— 账单类 ——
registerAgentTool('account.financeOverview', {
  label: '生成财务全景分析', risk: 'low',
  run: function () {
    var month = agentMonthSummary();
    var assets = agentTotalAssets();
    var budget = agentBudgetStatus();
    var snap = agentSessionSnapshot();
    var cats = agentCategoryStats();
    var top = cats.slice(0, 3);
    var rate = month.income > 0 ? (month.balance / month.income * 100) : 0;

    // 结论写进会话记忆：让后续追问（"那我能买XX吗"）能直接复用，不必重述
    agentSessionFact('balance', '可用余额 ¥' + agentFmt(snap.available) + '，活期余额 ¥' + agentFmt(snap.balance));
    agentSessionFact('month', '本月收入 ¥' + agentFmtInt(month.income) + '，支出 ¥' + agentFmtInt(month.expense) + '，结余 ¥' + agentFmtInt(month.balance));
    agentSessionFact('budget', agentBudgetSummaryText(budget));
    agentSessionAnalysis('finance', '收入 ¥' + agentFmtInt(month.income) + ' / 支出 ¥' + agentFmtInt(month.expense) +
      ' / 月结余 ¥' + agentFmtInt(month.balance) + '（储蓄率 ' + rate.toFixed(0) + '%）',
      { surplus: month.balance, income: month.income, expense: month.expense, savingsRate: rate / 100 });
    agentSessionAnalysis('assets', '总资产 ¥' + agentFmtInt(assets.total) + '（现金 ¥' + agentFmtInt(assets.cash) + ' + 理财持仓 ¥' + agentFmtInt(assets.holdings) + ' + 其他 ¥' + agentFmtInt(assets.fixed + assets.fund + assets.property) + '）');
    AGENT_SESSION.lastFocus = '财务情况';

    return {
      summary: '收入 ¥' + agentFmtInt(month.income) + '，支出 ¥' + agentFmtInt(month.expense) +
        '，月结余 ¥' + agentFmtInt(month.balance) + '（储蓄率 ' + rate.toFixed(0) + '%）；总资产 ¥' + agentFmtInt(assets.total) +
        '；风险等级 ' + (AGENT_MEMORY ? AGENT_MEMORY.profile.riskLevel : '未评估'),
      data: {
        income: month.income, expense: month.expense, surplus: month.balance, savingsRate: rate / 100,
        assets: assets, budget: budget, topCategories: top, riskLevel: snap.riskLevel
      }
    };
  }
});

registerAgentTool('bill.monthSummary', {
  label: '汇总本月账单', risk: 'low',
  run: function () {
    var m = agentMonthSummary();
    return {
      summary: '本月收入 ¥' + agentFmtInt(m.income) + '，支出 ¥' + agentFmtInt(m.expense) + '，结余 ¥' + agentFmtInt(m.balance),
      data: m
    };
  }
});

registerAgentTool('bill.categoryStats', {
  label: '消费分类统计', risk: 'low',
  run: function () {
    var cats = agentCategoryStats();
    var top = cats.slice(0, 3).map(function (c) { return c.label + ' ¥' + agentFmtInt(c.value); }).join('、');
    return { summary: '支出前三：' + top, data: cats };
  }
});

registerAgentTool('bill.detectAbnormal', {
  label: '检测异常交易', risk: 'low',
  run: function () {
    var a = agentAbnormalTxns();
    if (!a.length) return { summary: '未发现异常交易', data: [] };
    var reasons = a.map(function (t) { return t.abnormalReason; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    return {
      summary: '发现 ' + a.length + ' 笔可疑交易，涉及金额 ¥' + agentFmtInt(a.reduce(function (s, t) { return s + t.amount; }, 0)) + '（' + reasons.join('、') + '）',
      data: a
    };
  }
});

registerAgentTool('bill.trend', {
  label: '对比历史支出趋势', risk: 'low',
  run: function () {
    var cur = agentMonthSummary().expense;
    var base = (AGENT_MEMORY && AGENT_MEMORY.profile.monthlyAvgExpense) || 7000;
    var pct = base > 0 ? Math.round((cur - base) / base * 100) : 0;
    var top2 = agentGrowthCategories(2).map(function (c) { return c.label; }).join('和');
    var dir = pct >= 0 ? '↑' : '↓';
    return {
      summary: '本月支出较近 3 个月均值 ' + dir + Math.abs(pct) + '%，主要增加于' + top2,
      data: { current: cur, baseline: base, pct: pct, topCategories: agentGrowthCategories(2) }
    };
  }
});

// —— 订阅类 ——
registerAgentTool('subscription.list', {
  label: '读取订阅清单', risk: 'low',
  run: function () {
    var subs = mockData.subscriptions || [];
    var total = subs.reduce(function (s, x) { return s + (x.price || 0); }, 0);
    return { summary: '在订 ' + subs.length + ' 项，月均支出约 ¥' + agentFmtInt(total), data: subs };
  }
});

registerAgentTool('subscription.scan', {
  label: '扫描扣费与使用率', risk: 'low',
  run: function () {
    var up = agentUpcomingSubscriptions(7);
    var idle = (mockData.subscriptions || []).filter(function (s) { return s.usage === '低'; });
    var parts = [];
    if (up.length) parts.push(up[0].sub.name + ' ' + up[0].inDays + ' 天后扣费 ¥' + agentFmtInt(up[0].sub.price));
    if (idle.length) parts.push('其中 ' + idle.length + ' 项近 3 个月使用频率较低');
    return {
      summary: parts.length ? parts.join('；') : '近期无扣费',
      data: { upcoming: up, idle: idle }
    };
  }
});

registerAgentTool('subscription.cancel', {
  label: '取消订阅', risk: 'medium',
  run: function (args) {
    var subs = mockData.subscriptions || [];
    var idx = -1;
    if (args && args.id != null) idx = subs.findIndex(function (s) { return s.id === args.id; });
    if (idx < 0 && args && args.name) {
      idx = subs.findIndex(function (s) { return s.name.indexOf(args.name) > -1 || args.name.indexOf(s.name) > -1; });
    }
    if (idx > -1) {
      var removed = subs.splice(idx, 1)[0];
      saveUserData();
      if (typeof apiSubscriptionCancel === 'function') apiSubscriptionCancel(removed.id);
      return { summary: '已取消「' + removed.name + '」，预计每月节省 ¥' + agentFmtInt(removed.price), data: removed };
    }
    return { ok: false, summary: '未找到要取消的订阅' };
  }
});

// —— 转账类（含风控）——
registerAgentTool('transfer.resolvePayee', {
  label: '识别收款人账户', risk: 'low',
  run: function (args) {
    var name = (args && args.payee) || '';
    var contacts = mockData.contacts || [];
    var c = contacts.filter(function (x) { return x.name === name; })[0];
    if (c) return { summary: '已匹配联系人 ' + name + '（' + c.bank + ' ' + c.account + '）', data: c, matched: true };
    return { summary: '收款人「' + name + '」不在通讯录中，将按新联系人处理', data: null, matched: false };
  }
});

registerAgentTool('transfer.execute', {
  label: '执行转账', risk: 'high',
  run: function (args) {
    var payee = String(args.payee || '').trim();
    var amount = Number(args.amount) || 0;
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, summary: '转账金额无效，未执行任何操作' };
    if (!payee) return { ok: false, summary: '缺少收款人，未执行转账' };
    // 与规则层保持一致：姓名/智能转账只允许通讯录联系人；
    // 手机号/银行卡/批量/定时等渠道有各自的身份核验路径。
    var ch = args.channel || '智能转账';
    var nameChannels = { '网银转账': 1, '智能转账': 1, '姓名转账': 1 };
    if (nameChannels[ch]) {
      var known = (mockData.contacts || []).some(function (c) { return c.name === payee; });
      if (!known) return { ok: false, summary: '收款人「' + payee + '」不在通讯录，姓名转账已拒绝' };
    }

    // 余额门禁：工具层再校验一次。工具有多个调用入口（Function Calling / 规则层 / 计划执行器），
    // 不能只靠 UI 拦截，否则新增入口就会漏。
    var avail = Number(mockData.userProfile.debitCard.available);
    if (avail < amount) {
      return {
        ok: false,
        summary: '余额不足，已拒绝转账。可用 ¥' + agentFmt(avail) + '，需要 ¥' + agentFmt(amount) +
          '，缺口 ¥' + agentFmt(amount - avail),
        data: { available: avail, amount: amount, shortage: amount - avail }
      };
    }

    var phoneArg = String(args.phone || '').trim();
    var txDesc = '转账给' + payee + (phoneArg ? '（' + phoneArg + '）' : '') + (args.remark ? '（' + args.remark + '）' : '');
    var recorded = addTransaction('expense', amount, txDesc, args.channel || '智能转账', true);
    if (recorded === false) {
      return { ok: false, summary: '扣款未成功（可用余额不足），账户未发生变动' };
    }
    // 写入转账记录：让「转账记录查询 / 撤销」能看到智能助手转出的账，否则只有 recentTxns 有记录
    registerTransferRecord(payee, amount, args.channel || '智能转账', phoneArg);
    if (typeof addRecentAction === 'function') addRecentAction('transfer', { payee: payee, amount: amount });
    saveUserData();
    // 数据真实化：同步到后端模拟银行核心（后端不可用时自动降级为纯本地）
    if (typeof apiTransfer === 'function') apiTransfer(payee, amount);
    return {
      summary: '已完成转账：' + payee + ' ¥' + agentFmt(amount) + '，当前余额 ¥' + agentFmt(mockData.userProfile.debitCard.balance),
      data: { payee: payee, amount: amount }
    };
  }
});

// —— 卡片类 ——
registerAgentTool('card.overview', {
  label: '读取卡片状态', risk: 'low',
  run: function () {
    var c = mockData.userProfile.creditCard;
    var util = c.limit ? Math.round(c.used / c.limit * 100) : 0;
    return {
      summary: '信用卡额度使用率 ' + util + '%，可用 ¥' + agentFmtInt(c.available) + '，本期账单 ¥' + agentFmt(c.currentBill) + '，每月 ' + (c.dueDay || 5) + ' 日到期',
      data: c
    };
  }
});

registerAgentTool('card.freeze', {
  label: '挂失信用卡', risk: 'high',
  run: function (args) {
    var c = mockData.userProfile.creditCard;
    if (c.isFrozen) return { summary: '信用卡已处于挂失状态，无需重复操作', data: c };
    c.isFrozen = true;
    c.status = '已挂失';
    if (typeof cardFrozen !== 'undefined') cardFrozen = true;
    saveUserData();
    return {
      summary: '信用卡已挂失' + (args && args.reason ? '（原因：' + args.reason + '）' : '') + '，新卡将在 3 个工作日内寄出，卡内额度已冻结',
      data: c
    };
  }
});

registerAgentTool('card.unfreeze', {
  label: '解除挂失', risk: 'medium',
  run: function () {
    var c = mockData.userProfile.creditCard;
    if (!c.isFrozen) return { summary: '当前卡片处于正常状态，无需解挂', data: c };
    c.isFrozen = false;
    c.status = '正常';
    if (typeof cardFrozen !== 'undefined') cardFrozen = false;
    saveUserData();
    return { summary: '已解除挂失，信用卡恢复正常使用，可用额度 ¥' + agentFmtInt(c.available), data: c };
  }
});

// —— 理财类 ——
registerAgentTool('wealth.list', {
  label: '读取理财产品库', risk: 'low',
  run: function () {
    return { summary: '产品库共 ' + (mockData.products || []).length + ' 只产品', data: mockData.products || [] };
  }
});

registerAgentTool('wealth.recommend', {
  label: '生成目标化配置方案', risk: 'low',
  run: function (args) {
    var amount = Number(args.amount) || 0;
    var horizon = args.horizon || 12;
    var riskPref = args.riskPref || '稳健';
    var products = mockData.products || [];
    var maxRisk = /稳健|保守|低风险/.test(riskPref) ? 2 : (/进取|高/.test(riskPref) ? 4 : 3);

    var defs = [
      { name: '保守配置', desc: '全额货币基金，随时可取', legs: [['天天盈货币基金', 100]] },
      { name: '稳健配置', desc: '固收打底 + 货币增强', legs: [['稳健增利90天', 60], ['天天盈货币基金', 40]] },
      { name: '均衡配置', desc: '固收为主 + 少量权益', legs: [['稳健增利90天', 50], ['天天盈货币基金', 30], ['均衡配置混合基金', 20]] }
    ];

    var picked = defs.map(function (pl) {
      var legs = [];
      pl.legs.forEach(function (pair) {
        var prod = products.filter(function (p) { return p.name === pair[0]; })[0];
        if (!prod) return;
        var amt = Math.round(amount * pair[1] / 100);
        var rateNum = parseFloat(String(prod.rate).replace('%', '')) || 2;
        legs.push({ name: prod.name, amount: amt, rate: prod.rate, rateLabel: prod.rateLabel, riskLevel: prod.riskLevel, estReturn: amt * rateNum / 100 });
      });
      var est = legs.reduce(function (s, l) { return s + l.estReturn; }, 0);
      var maxLevel = legs.reduce(function (m, l) { return Math.max(m, l.riskLevel || 0); }, 0);
      return {
        name: pl.name, desc: pl.desc, legs: legs, estReturn: est,
        estRate: amount > 0 ? (est / amount * 100) : 0,
        maxRiskLevel: maxLevel,
        withinPreference: maxLevel <= maxRisk
      };
    });

    var eligible = picked.filter(function (p) { return p.withinPreference; });
    if (!eligible.length) eligible = picked;
    eligible.sort(function (a, b) { return b.estRate - a.estRate; });
    var best = eligible[0];
    picked.forEach(function (p) { p.recommended = (p.name === best.name); });

    return {
      summary: '已按 ' + horizon + ' 个月期限 × ' + riskPref + ' 偏好，生成 3 套方案，推荐「' + best.name + '」预计年化 ' + best.estRate.toFixed(2) + '%',
      data: { plans: picked, recommended: best.name, amount: amount, horizon: horizon, riskPref: riskPref, maxRisk: maxRisk }
    };
  }
});

registerAgentTool('wealth.buy', {
  label: '申购理财产品', risk: 'high',
  run: function (args) {
    var name = args.product, amount = Number(args.amount) || 0;
    var prod = (mockData.products || []).filter(function (p) { return p.name === name; })[0];
    if (!prod) return { ok: false, summary: '未找到产品：' + name };
    if (amount < (prod.minAmount || 0)) return { ok: false, summary: '低于起购金额 ¥' + agentFmtInt(prod.minAmount) };
    // 余额门禁 + 扣款只由 addTransaction 统一完成（以前这里手动减一次、addTransaction 再减一次，会重复扣款）
    var d = mockData.userProfile.debitCard;
    if (d.available < amount) return { ok: false, summary: '可用余额不足：需要 ¥' + agentFmtInt(amount) + '，可用 ¥' + agentFmt(d.available) };
    var recorded = addTransaction('expense', amount, '申购' + name, '理财账户', true);
    if (recorded === false) return { ok: false, summary: '扣款未成功（可用余额不足），未生成持仓' };
    if (!mockData.userProfile.holdings) mockData.userProfile.holdings = [];
    var exist = mockData.userProfile.holdings.filter(function (h) { return h.name === name; })[0];
    if (exist) {
      exist.amount += amount;
      exist.cost += amount;
      exist.riskLevel = prod.riskLevel;
    } else {
      mockData.userProfile.holdings.push({
        name: name, icon: prod.icon, amount: amount, cost: amount,
        profit: 0, profitRate: 0, buyDate: agentDateStr(0), status: '持有中',
        riskLevel: prod.riskLevel
      });
    }
    saveUserData();
    // 数据真实化：同步后端
    if (typeof apiWealthBuy === 'function') apiWealthBuy(name, amount);
    return { summary: '已申购 ' + name + ' ¥' + agentFmtInt(amount) + '（' + prod.rateLabel + ' ' + prod.rate + '），当前余额 ¥' + agentFmt(d.balance), data: { name: name, amount: amount } };
  }
});

registerAgentTool('wealth.redeem', {
  label: '赎回理财产品', risk: 'high',
  run: function (args) {
    var holdings = mockData.userProfile.holdings || [];
    var name = args && args.product;
    var h = name ? holdings.filter(function (x) { return x.name === name || x.name.indexOf(name) > -1; })[0] : holdings.filter(function (x) { return x.status === '持有中'; })[0];
    if (!h) return { ok: false, summary: '未找到可赎回的持仓' + (name ? '：' + name : '') };
    // 封闭期校验：90 天/3 年产品未到期不能赎回
    var prodDef = (mockData.products || []).filter(function (p) { return p.name === h.name; })[0] || {};
    var closedDays = Number(prodDef.closedDays) || 0;
    if (closedDays > 0 && h.buyDate) {
      var buyTs = new Date(String(h.buyDate) + 'T00:00:00').getTime();
      var heldDays = isNaN(buyTs) ? closedDays : Math.floor((Date.now() - buyTs) / 86400000);
      if (heldDays < closedDays) {
        return { ok: false, summary: '「' + h.name + '」封闭期未满（已持有 ' + heldDays + ' 天 / 需 ' + closedDays + ' 天），暂不可赎回' };
      }
    }
    var amount = (args && args.amount != null) ? Number(args.amount) : h.amount;
    if (!(amount > 0)) return { ok: false, summary: '赎回金额无效' };
    if (amount > h.amount) amount = h.amount;
    // 按比例结算累计收益：全额赎回时收益必须兑付，不能凭空消失
    var ratio = amount / h.amount;
    var profitPart = Math.round(((Number(h.profit) || 0) * ratio) * 100) / 100;
    h.amount = Math.round((h.amount - amount) * 100) / 100;
    h.cost = Math.max(0, Math.round(((Number(h.cost) || 0) - amount) * 100) / 100);
    h.profit = Math.round(((Number(h.profit) || 0) - profitPart) * 100) / 100;
    h.profitRate = h.cost > 0 ? Math.round((h.profit / h.cost) * 10000) / 100 : 0;
    if (h.amount <= 0) {
      h.status = '已赎回';
      mockData.userProfile.holdings = holdings.filter(function (x) { return x !== h; });
    }
    // 用 addTransaction 统一回补本地余额（本金 + 已实现收益）
    var credited = Math.round((amount + profitPart) * 100) / 100;
    addTransaction('income', credited, '赎回' + h.name + (profitPart ? '（含收益 ¥' + profitPart + '）' : ''), '理财账户', true);
    saveUserData();
    // 数据真实化：同步后端（赎回资金回补余额）
    if (typeof apiWealthRedeem === 'function') apiWealthRedeem(h.name, amount);
    return {
      summary: '已赎回「' + h.name + '」本金 ¥' + agentFmtInt(amount) + (profitPart ? ' + 收益 ¥' + agentFmt(profitPart) : '') +
        '，到账 ¥' + agentFmt(credited) + '，剩余持仓 ¥' + agentFmtInt(h.amount),
      data: { name: h.name, amount: amount, profit: profitPart, credited: credited, remain: h.amount }
    };
  }
});

// —— 借款类（仅在用户主动询问资金缺口方案时使用）——
registerAgentTool('loan.inquiry', {
  label: '查询可借额度与利率', risk: 'low',
  run: function (args) {
    var need = Number(args && args.amount) || 0;
    var u = mockData.userProfile || {};
    var quota = u.loanQuota || 200000;
    var rate = u.loanRate || 3.45;
    var canBorrow = Math.min(quota, Math.max(need, 0) || quota);
    var monthly = rate / 100 / 12;
    var months = 12;
    var repay = canBorrow > 0
      ? canBorrow * monthly * Math.pow(1 + monthly, months) / (Math.pow(1 + monthly, months) - 1)
      : 0;
    return {
      summary: '预授信额度 ¥' + agentFmtInt(quota) + '，年化利率约 ' + rate + '%。' +
        (need > 0 ? '若借 ¥' + agentFmtInt(canBorrow) + ' 分 12 期，每月约需还款 ¥' + agentFmtInt(repay) + '。' : ''),
      data: { quota: quota, rate: rate, canBorrow: canBorrow, months: months, monthlyRepay: repay }
    };
  }
});

// —— 预算类 ——
registerAgentTool('budget.status', {
  label: '检查预算执行情况', risk: 'low',
  run: function () {
    var s = agentBudgetStatus();
    return { summary: agentBudgetSummaryText(s), data: s };
  }
});

registerAgentTool('budget.set', {
  label: '设置预算', risk: 'medium',
  run: function (args) {
    var amount = Number(args.amount) || 0;
    var period = args.period || 'month';
    var u = mockData.userProfile;
    if (!u.budgets || typeof u.budgets !== 'object') u.budgets = {};
    u.budgets[period] = amount;
    saveUserData();
    // 数据真实化：同步后端
    if (typeof apiBudgetSet === 'function') apiBudgetSet(amount, period);
    var label = { day: '每日', week: '每周', month: '每月', year: '每年' }[period] || '每月';
    return { summary: '已设置' + label + '预算 ¥' + agentFmtInt(amount), data: { amount: amount, period: period } };
  }
});

registerAgentTool('budget.createFund', {
  label: '创建专项预算账户', risk: 'medium',
  run: function (args) {
    var u = mockData.userProfile;
    var amount = Number(args.amount) || 0;
    if (!(amount > 0)) return { ok: false, summary: '专项预算金额无效' };
    var d = u.debitCard;
    if ((Number(d.available) || 0) < amount) return { ok: false, summary: '可用余额不足，无法创建专项预算' };
    if (!u.funds) u.funds = [];
    // 真正冻结：可用余额减少、冻结金额增加；到期由 releaseLockedFunds() 解冻
    d.available = Math.round(((Number(d.available) || 0) - amount) * 100) / 100;
    d.frozen = Math.round(((Number(d.frozen) || 0) + amount) * 100) / 100;
    var fund = {
      name: args.name || '专项预算', amount: amount,
      deadline: args.deadline || agentDateStr(30),
      frozen: true, status: '进行中', createdAt: agentDateStr(0),
      freezeId: 'FZ' + Date.now()
    };
    if (!d.frozenItems) d.frozenItems = [];
    d.frozenItems.push({
      id: fund.freezeId, type: '专项预算', reason: '专项预算-' + fund.name,
      amount: amount, freezeDate: agentDateStr(0), releaseDate: fund.deadline, status: '冻结中'
    });
    u.funds.push(fund);
    if (AGENT_MEMORY) {
      AGENT_MEMORY.goals.push({ id: 'g' + Date.now(), name: fund.name, target: fund.amount, saved: 0, deadline: fund.deadline });
      saveAgentMemory();
    }
    saveUserData();
    return { summary: '已创建「' + fund.name + '」专项预算 ¥' + agentFmtInt(amount) + '，资金已冻结，到期自动解冻', data: fund };
  }
});

// —— 生活场景 / 跨场景联动 ——
registerAgentTool('life.scanBirthdays', {
  label: '扫描联系人生日', risk: 'low',
  run: function (args) {
    var within = (args && args.withinDays) || 15;
    var family = (AGENT_MEMORY && AGENT_MEMORY.family) ? AGENT_MEMORY.family : [];
    var hits = family.map(function (f) {
      return { person: f, days: agentDaysUntil(f.birthday) };
    }).filter(function (x) { return x.days <= within; }).sort(function (a, b) { return a.days - b.days; });
    if (!hits.length) return { summary: within + ' 天内没有生日', data: [] };
    var h = hits[0];
    return {
      summary: '检测到 ' + h.person.relation + h.person.name + ' 的生日在 ' + h.days + ' 天后（' + h.person.birthday + '）',
      data: h
    };
  }
});

registerAgentTool('life.reserveDeposit', {
  label: '锁定活期资金', risk: 'medium',
  run: function (args) {
    var amount = Number(args.amount) || 0;
    if (!(amount > 0)) return { ok: false, summary: '锁定金额无效' };
    var u = mockData.userProfile;
    var d = u.debitCard;
    if ((Number(d.available) || 0) < amount) return { ok: false, summary: '可用余额不足，无法锁定资金' };
    if (!u.lockedFunds) u.lockedFunds = [];
    // 真正冻结可用余额，到期由 releaseLockedFunds() 自动解冻
    d.available = Math.round(((Number(d.available) || 0) - amount) * 100) / 100;
    d.frozen = Math.round(((Number(d.frozen) || 0) + amount) * 100) / 100;
    var freezeId = 'FZ' + Date.now();
    var releaseDate = args.date || agentDateStr(3);
    if (!d.frozenItems) d.frozenItems = [];
    d.frozenItems.push({
      id: freezeId, type: '预留锁定', reason: args.purpose || '生日预留',
      amount: amount, freezeDate: agentDateStr(0), releaseDate: releaseDate, status: '冻结中'
    });
    u.lockedFunds.push({
      purpose: args.purpose || '生日预留', amount: amount,
      freezeDate: agentDateStr(0), releaseDate: releaseDate,
      autoTransfer: !!args.autoTransfer, frozen: true, status: '已锁定', freezeId: freezeId
    });
    saveUserData();
    return {
      summary: '已锁定 ¥' + agentFmtInt(amount) + ' 活期（可用余额已减少），' + (args.date || '') + ' 到期后自动解冻',
      data: u.lockedFunds[u.lockedFunds.length - 1]
    };
  }
});

// 到期解冻专项预算/预留资金（页面加载和每 30 秒执行一次）
function releaseLockedFunds() {
  var u = mockData.userProfile;
  if (!u) return;
  var today = agentDateStr(0);
  var d = u.debitCard || {};
  var changed = false;
  function release(item, dateKey) {
    if (!item || item.frozen !== true || item.status === '已解冻') return;
    var date = item[dateKey];
    if (!date || String(date) > today) return;
    var amt = Number(item.amount) || 0;
    if (!(amt > 0)) return;
    d.available = Math.round(((Number(d.available) || 0) + amt) * 100) / 100;
    d.frozen = Math.max(0, Math.round(((Number(d.frozen) || 0) - amt) * 100) / 100);
    item.status = '已解冻';
    item.releasedAt = new Date().toLocaleString('zh-CN');
    if (Array.isArray(d.frozenItems) && item.freezeId) {
      var fi = d.frozenItems.filter(function (x) { return x.id === item.freezeId; })[0];
      if (fi) { fi.status = '已解冻'; fi.releasedAt = item.releasedAt; }
    }
    changed = true;
  }
  (u.lockedFunds || []).forEach(function (f) { release(f, 'releaseDate'); });
  (u.funds || []).forEach(function (f) { release(f, 'deadline'); });
  if (changed) {
    saveUserData();
    if (typeof showToast === 'function') showToast('有预留/专项资金到期，已自动解冻', 2600);
  }
}

registerAgentTool('life.orderFlower', {
  label: '预订鲜花', risk: 'medium',
  run: function (args) {
    // 0/负数/非数字一律回落到标准价，避免“免费送”或负金额抵档位
    var price = Number(args.price);
    if (!Number.isFinite(price) || price <= 0) price = 168;
    if (price > 100000) return { ok: false, summary: '鲜花金额异常，未执行' };
    var okTx = addTransaction('expense', price, '生日鲜花-' + (args.name || '') + '(' + (args.flower || '向日葵') + ')', '生活服务', true);
    if (okTx === false) return { ok: false, summary: '可用余额不足，鲜花预订未完成，账户未扣款' };
    // 与向导下单共用同一份订单列表，避免 Agent 订的花在“鲜花订单”里看不到
    var u = mockData.userProfile;
    if (!Array.isArray(u.flowerOrders)) u.flowerOrders = [];
    u.flowerOrders.unshift({
      id: 'F' + Date.now(),
      recipient: args.name || '联系人',
      phone: '',
      address: '',
      bouquet: args.flower || '向日葵',
      price: price,
      date: args.deliverDate || agentDateStr(3),
      slot: 'morning',
      card: '',
      payMethod: '储蓄卡',
      paid: true,
      paidAmount: price,
      status: '待配送',
      createdAt: new Date().toLocaleString('zh-CN')
    });
    saveUserData();
    return {
      summary: '已预订 ' + (args.flower || '向日葵') + ' ¥' + agentFmtInt(price) + '，' + (args.deliverDate || '') + ' 上午送达',
      data: args
    };
  }
});

registerAgentTool('life.orderCake', {
  label: '预订蛋糕', risk: 'medium',
  run: function (args) {
    var price = Number(args.price);
    if (!Number.isFinite(price) || price <= 0) price = 238;
    if (price > 100000) return { ok: false, summary: '蛋糕金额异常，未执行' };
    var okTx = addTransaction('expense', price, '生日蛋糕-' + (args.name || ''), '生活服务', true);
    if (okTx === false) return { ok: false, summary: '可用余额不足，蛋糕预订未完成，账户未扣款' };
    saveUserData();
    return { summary: '已预订 ' + (args.size || '6寸') + ' 蛋糕 ¥' + agentFmtInt(price) + '，' + (args.deliverDate || '') + ' 送达', data: args };
  }
});

registerAgentTool('life.setReminder', {
  label: '设置提醒与祝福', risk: 'low',
  run: function (args) {
    var u = mockData.userProfile;
    if (!u.reminders) u.reminders = [];
    u.reminders.push({ title: args.title || '生日提醒', date: args.date || agentDateStr(3) });
    saveUserData();
    // 当前演示版没有系统级推送通道，不能声称已经会主动提醒
    return { summary: '已登记「' + (args.title || '生日提醒') + '」提醒（演示版不会发送系统推送）', data: args };
  }
});

registerAgentTool('life.travelPlan', {
  label: '生成出差财务计划', risk: 'low',
  run: function (args) {
    var city = args.city || '上海';
    var budget = Number(args.budget) || 5000;
    var days = Number(args.days) || 4;
    var legs = [
      { name: '往返交通（高铁二等座）', amount: Math.round(budget * 0.28) },
      { name: '住宿（' + (days - 1) + ' 晚）', amount: Math.round(budget * 0.42) },
      { name: '市内交通与餐饮', amount: Math.round(budget * 0.22) },
      { name: '机动备用金', amount: budget - Math.round(budget * 0.28) - Math.round(budget * 0.42) - Math.round(budget * 0.22) }
    ];
    return {
      summary: '已按 ' + city + ' ' + days + ' 天行程拆解 ¥' + agentFmtInt(budget) + ' 预算：' + legs.map(function (l) { return l.name + ' ¥' + agentFmtInt(l.amount); }).join('，'),
      data: { city: city, budget: budget, days: days, legs: legs }
    };
  }
});

// ------------------------------ 4. 主动风险干预引擎 ------------------------------
// ---- 余额门禁（交易前第一道防线）----
// 传入本次全部支出动作，校验可用余额是否足够。不足时返回缺口，由调用方渲染「超支方案卡」。
function agentCheckBalance(actions) {
  var list = Array.isArray(actions) ? actions : [actions || {}];
  var need = list.reduce(function (s, a) { return s + (Number(a && a.amount) || 0); }, 0);
  var u = mockData.userProfile || {};
  var card = u.debitCard || {};
  var avail = Number(card.available) || 0;
  var locked = (u.lockedFunds || []).reduce(function (s, f) { return s + (Number(f.amount) || 0); }, 0);

  return {
    need: need,
    available: avail,
    locked: locked,
    // 真实可用 = 可用余额（lockedFunds 是专款专用，已从可用中预留，此处仅用于说明）
    enough: avail >= need,
    shortage: Math.max(0, need - avail),
    // 建议的「改为上限金额」：取可用余额与需要金额的较小值
    capAmount: Math.min(need, avail)
  };
}

function agentAssessTransferRisk(payee, amount) {
  var reasons = [];
  var score = 0;
  var contacts = mockData.contacts || [];
  var known = contacts.some(function (c) { return c.name === payee; });
  var history = (mockData.userProfile && mockData.userProfile.transferHistory) ? mockData.userProfile.transferHistory : [];
  var paidBefore = history.some(function (t) { return t.payee === payee; });
  var avg = history.length ? history.reduce(function (s, t) { return s + t.amount; }, 0) / history.length : 0;
  var ratio = avg > 0 ? amount / avg : 0;

  if (!known) { score += 40; reasons.push({ label: '收款人为新联系人', detail: '「' + payee + '」不在常用联系人中' }); }
  if (!paidBefore) { score += 22; reasons.push({ label: '该联系人首次交易', detail: '历史无成功转账记录' }); }
  if (ratio >= 3) {
    score += Math.min(28, Math.round((ratio - 2) * 5));
    reasons.push({ label: '金额高于历史平均转账 ' + ratio.toFixed(1) + ' 倍', detail: '历史平均单笔 ¥' + agentFmtInt(avg) });
  }
  if (amount >= 50000) { score += 20; reasons.push({ label: '单笔金额达到大额标准', detail: '¥50,000 及以上需人工复核' }); }
  else if (amount >= 20000) { score += 10; reasons.push({ label: '单笔金额较大', detail: '超过 ¥20,000' }); }
  var h = new Date().getHours();
  if (h >= 0 && h < 6) { score += 15; reasons.push({ label: '凌晨时段交易', detail: '非惯常交易时段（00:00-06:00）' }); }

  score = Math.min(99, score);
  var level = score >= 60 ? 'high' : (score >= 30 ? 'medium' : 'low');
  return {
    score: score, level: level, reasons: reasons, known: known, paidBefore: paidBefore,
    ratio: ratio, avg: avg,
    needConfirm: level !== 'low',
    needVerify: level === 'high'
  };
}

function agentRiskBadge(level) {
  if (level === 'high') return { text: '高风险', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
  if (level === 'medium') return { text: '中风险', color: '#b45309', bg: '#fffbeb', border: '#fde68a' };
  return { text: '低风险', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' };
}

// ---- 转账金额分级确认 ----
// 档位定义：金额决定「下限档」，可疑度决定「附加档」，最终取更严者，确保两者都不漏。
var AGENT_TRANSFER_TIERS = {
  T1: { rank: 1, name: '免确认', needConfirm: false, needVerify: false, needManual: false },
  T2: { rank: 2, name: '密码确认', needConfirm: true, needVerify: false, needManual: false },
  T3: { rank: 3, name: '二次验证', needConfirm: true, needVerify: true, needManual: false },
  T4: { rank: 4, name: '人工复核', needConfirm: true, needVerify: true, needManual: true }
};

// 演示环境固定验证码，真实场景应由短信/OTP 下发
var AGENT_DEMO_OTP = '123456';

function agentAmountTier(amount) {
  var a = Number(amount) || 0;
  if (a >= 50000) return 'T4';
  if (a >= 5000) return 'T3';
  if (a >= 500) return 'T2';
  return 'T1';
}

// 可疑度 → 最低档位：高风险至少 T3，中风险至少 T2
function agentRiskTier(risk) {
  if (!risk) return 'T1';
  if (risk.level === 'high') return 'T3';
  if (risk.level === 'medium') return 'T2';
  return 'T1';
}

// 最终档位 = max(金额档, 可疑度档)
function agentTransferTier(amount, risk) {
  var byAmount = agentAmountTier(amount);
  var byRisk = agentRiskTier(risk);
  var key = AGENT_TRANSFER_TIERS[byAmount].rank >= AGENT_TRANSFER_TIERS[byRisk].rank ? byAmount : byRisk;
  var tier = AGENT_TRANSFER_TIERS[key];
  return {
    key: key,
    name: tier.name,
    rank: tier.rank,
    needConfirm: tier.needConfirm,
    needVerify: tier.needVerify,
    needManual: tier.needManual,
    byAmount: byAmount,
    byRisk: byRisk,
    // 金额未达验证线但被可疑度抬高时，注明原因
    escalatedByRisk: AGENT_TRANSFER_TIERS[byRisk].rank > AGENT_TRANSFER_TIERS[byAmount].rank
  };
}

function agentTierBadge(tier) {
  if (tier.rank >= 4) return { text: '人工复核', color: '#991b1b', bg: '#fee2e2', border: '#fecaca' };
  if (tier.rank === 3) return { text: '二次验证', color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' };
  if (tier.rank === 2) return { text: '密码确认', color: '#b45309', bg: '#fffbeb', border: '#fde68a' };
  return { text: '免确认', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' };
}

// ------------------------------ 5. 计划执行器 + 可视化 ------------------------------
// 转账完成卡：金额 / 收款方 / 余额 + 一句说明（确认即完成，无额外按钮、不用绿色底）
function agentTransferDoneCardHtml(amount, payee, balance) {
  var esc = (typeof escapeHtml === 'function') ? escapeHtml : function (x) { return String(x); };
  var amt = agentFmt(amount);
  var bal = agentFmt(balance);
  function row(label, value) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;font-size:13px;border-bottom:1px solid #f1f3f6;">' +
      '<span style="color:#6b7280;">' + label + '</span>' +
      '<b style="color:#111827;font-weight:600;">' + value + '</b></div>';
  }
  return '<div style="margin-top:14px;border:1px solid #e5e9f0;background:#fff;border-radius:12px;padding:14px 16px;">' +
    '<div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:6px;">转账已完成</div>' +
    row('金额', amt + ' 元') +
    row('收款方', esc(payee)) +
    row('余额', bal + ' 元') +
    '<div style="font-size:12px;color:#6b7280;line-height:1.6;margin-top:10px;">资金已入账，请注意核对收款方信息。</div>' +
    '</div>';
}
// 只保留一句「正在为你处理…」，执行步骤（逻辑链）不再展示给用户
function agentPlanShell(id, plan) {
  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手</div><div class="msg-bubble agent-bubble">' +
    '<div class="agent-plan-head" id="' + id + '-head"><span class="agent-plan-dot"></span>' + plan.title + '</div>' +
    '<div id="' + id + '-footer"></div>' +
    '</div></div></div>';
}

function agentSetStep(id, i, state, desc) {
  var icon = document.getElementById(id + '-i' + i);
  var descEl = document.getElementById(id + '-d' + i);
  if (icon) {
    icon.className = 'agent-step-icon ' + (state === 'done' ? 'done' : state === 'fail' ? 'fail' : state === 'pending' ? 'pending' : 'running');
    icon.textContent = state === 'done' ? '✓' : state === 'fail' ? '!' : String(i + 1);
  }
  if (descEl && desc) descEl.textContent = desc;
}

async function runAgentPlan(plan) {
  var id = 'agentplan-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  appendMessage(agentPlanShell(id, plan));
  scrollToBottom();
  await agentSleep(120);

  var results = [];
  for (var i = 0; i < plan.steps.length; i++) {
    var step = plan.steps[i];
    agentSetStep(id, i, 'running');
    scrollToBottom();
    await agentSleep(step.delay || 120);
    var res = { ok: true, summary: '' };
    if (step.tool) res = await callAgentTool(step.tool, step.args || {});
    else if (typeof step.run === 'function') res = await step.run();
    results.push(res);
    agentSetStep(id, i, res.ok === false ? 'fail' : 'done', res.summary || '完成');
    scrollToBottom();
    await agentSleep(60);
  }

  if (plan.confirm) {
    agentRenderPlanConfirm(id, plan, results);
  } else if (plan.after) {
    plan.after(id, results);
  }
  return { id: id, results: results };
}

function agentPlanActionAmount(a) {
  if (Number(a && a.amount)) return Number(a.amount);
  var ar = (a && a.args) || {};
  if (a && (a.tool === 'life.orderFlower' || a.tool === 'life.orderCake')) return Number(ar.price) || 0;
  return Number(ar.amount) || 0;
}

function agentRenderPlanConfirm(id, plan, results) {
  var footer = document.getElementById(id + '-footer');
  if (!footer) return;
  // 只剩确认卡：处理中的状态行隐藏掉，避免用户看到内部流程
  var head = document.getElementById(id + '-head');
  if (head) head.style.display = 'none';
  var actions = plan.confirm.actions || [];
  var actionRows = actions.map(function (a, i) {
    return '<div class="agent-confirm-row" id="' + id + '-a' + i + '">' +
      '<span class="agent-confirm-idx">' + (i + 1) + '</span>' +
      '<span class="agent-confirm-text">' + ((typeof escapeHtml === 'function') ? escapeHtml(a.label) : a.label) + '</span>' +
      '<span class="agent-confirm-tag">待确认</span>' +
      '</div>';
  }).join('');
  var total = actions.reduce(function (s, a) { return s + agentPlanActionAmount(a); }, 0);

  // 扣款类动作统一按金额分级；不再只对转账生效
  var debitActions = actions.filter(function (a) {
    return ['transfer.execute', 'wealth.buy', 'life.orderFlower', 'life.orderCake'].indexOf(a.tool) > -1;
  });
  var transferAction = actions.filter(function (a) { return a.tool === 'transfer.execute'; })[0];
  var tier = null, tierBadge = null;
  if (debitActions.length) {
    var tierAmount = debitActions.reduce(function (s, a) { return s + agentPlanActionAmount(a); }, 0);
    var riskOfAction = (transferAction && transferAction.risk) || (plan.confirm.risk) || null;
    tier = agentTransferTier(tierAmount, riskOfAction);
    tierBadge = agentTierBadge(tier);
  }

  var verifyHtml = '';
  if (tier && tier.needVerify) {
    verifyHtml =
      '<div class="agent-verify-box" id="' + id + '-verify">' +
      '<div class="agent-verify-title">' + (tier.needManual ? '大额交易，请输入验证码，通过后提交人工复核' : '请输入二次验证码') + '</div>' +
      '<div class="agent-verify-hint">验证码已发送至尾号 **** 的手机（演示验证码：' + AGENT_DEMO_OTP + '）</div>' +
      '<input class="agent-verify-input" id="' + id + '-otp" type="text" inputmode="numeric" maxlength="6" placeholder="请输入 6 位验证码" autocomplete="off">' +
      '<div class="agent-verify-err" id="' + id + '-otp-err"></div>' +
      '</div>';
  }

  footer.innerHTML =
    '<div class="agent-confirm-card">' +
    '<div class="agent-confirm-title">' + (plan.confirm.title || '等待你确认后执行') + '</div>' +
    (tier
      ? '<div class="agent-tier-row">' +
        '<span class="agent-tier-badge" style="color:' + tierBadge.color + ';background:' + tierBadge.bg + ';border-color:' + tierBadge.border + ';">' + tierBadge.text + '</span>' +
        '</div>'
      : '') +
    actionRows +
    (total > 0 ? '<div class="agent-confirm-total"><span>合计金额</span><span>¥' + agentFmtInt(total) + '</span></div>' : '') +
    verifyHtml +
    '<div class="agent-confirm-actions">' +
    '<button class="btn btn-primary btn-sm" onclick="agentApprovePlan(\'' + id + '\')">' +
    (tier && tier.needVerify ? '验证并执行' : (plan.confirm.okLabel || '确认执行')) + '</button>' +
    '<button class="btn btn-secondary btn-sm" onclick="agentRejectPlan(\'' + id + '\')">暂不执行</button>' +
    '</div></div>';

  AGENT_PENDING_PLANS[id] = { plan: plan, results: results, status: 'pending', tier: tier };
  scrollToBottom();
}

var AGENT_PENDING_PLANS = {};

async function agentApprovePlan(id) {
  var rec = AGENT_PENDING_PLANS[id];
  if (!rec || rec.status !== 'pending') return;

  // —— T2 密码确认：金额达到 ¥500–4,999 时先完成一次安全验证 ——
  if (rec.tier && rec.tier.key === 'T2' && typeof showSecurityVerification === 'function') {
    var t2ok = await new Promise(function (resolve) {
      showSecurityVerification('密码确认（' + agentFmt(rec.plan && rec.plan.confirm && rec.plan.confirm.actions ? rec.plan.confirm.actions.reduce(function (s, a) { return s + agentPlanActionAmount(a); }, 0) : 0) + '）', function (ok) { resolve(!!ok); });
    });
    if (!t2ok) return;
  }

  // —— 二次验证闸门：验证码不通过则绝不执行，也不改变状态，用户可重新输入 ——
  if (rec.tier && rec.tier.needVerify) {
    var input = document.getElementById(id + '-otp');
    var errEl = document.getElementById(id + '-otp-err');
    var got = input ? String(input.value || '').trim() : '';
    if (!got) {
      if (errEl) errEl.textContent = '请输入验证码后再继续';
      if (input) input.focus();
      return;
    }
    if (got !== AGENT_DEMO_OTP) {
      if (errEl) errEl.textContent = '验证码不正确，请重新输入（本次未执行任何操作）';
      if (input) { input.value = ''; input.focus(); }
      if (typeof showToast === 'function') showToast('验证失败，转账未执行', 2200);
      return;
    }
    if (input) input.disabled = true;
    if (errEl) { errEl.textContent = '验证通过'; errEl.className = 'agent-verify-err ok'; }
  }

  // —— T4：验证通过后只提交人工复核，不执行任何扣款 ——
  if (rec.tier && rec.tier.needManual) {
    var planActions = (rec.plan.confirm && rec.plan.confirm.actions) || [];
    var reviewTotal = planActions.reduce(function (s, a) { return s + agentPlanActionAmount(a); }, 0);
    submitManualReview({
      amount: reviewTotal,
      purpose: rec.plan.subtitle || rec.plan.title || '大额交易',
      source: 'Agent',
      items: planActions.map(function (a) { return a.label; }),
      actions: planActions.map(function (a) { return { tool: a.tool, args: a.args || {} }; }),
      tier: rec.tier
    });
    rec.status = 'pending_review';
    var t4Amount = planActions.reduce(function (s, a) { return s + agentPlanActionAmount(a); }, 0);
    var reviewFooter = document.getElementById(id + '-footer');
    if (reviewFooter) {
      reviewFooter.innerHTML = '<div class="agent-result-card">' +
        '<div class="agent-result-title" style="color:#B54708;">已提交人工复核</div>' +
        '<div class="agent-result-desc">本次操作未扣款。人工复核通过后才会执行。</div>' +
        '<div class="agent-result-foot"><button class="ui-link" onclick="showManualReviews()">查看复核</button></div>' +
        '</div>';
    }
    planActions.forEach(function (a, i) {
      var row = document.getElementById(id + '-a' + i);
      if (!row) return;
      var tag = row.querySelector('.agent-confirm-tag');
      if (tag) { tag.textContent = '待复核'; tag.className = 'agent-confirm-tag'; }
    });
    if (typeof showToast === 'function') showToast('已提交人工复核，本次未扣款', 2800);
    scrollToBottom();
    return;
  }

  rec.status = 'running';
  var plan = rec.plan;
  var actions = plan.confirm.actions || [];

  // —— 余额门禁：执行前最后校验一次，不足则中止并转向超支方案 ——
  var check = agentCheckBalance(actions);
  if (!check.enough) {
    rec.status = 'pending';
    if (typeof showToast === 'function') showToast('余额不足，转账已中止', 2600);
    appendMessage(agentShortageCardHtml(check, actions[0] && actions[0].args ? actions[0].args.payee : '收款人'));
    scrollToBottom();
    return;
  }

  var footer = document.getElementById(id + '-footer');
  if (footer) footer.innerHTML = '<div class="agent-confirm-card agent-confirm-running">正在执行 ' + actions.length + ' 项操作…</div>';

  var logs = [];
  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];
    var row = document.getElementById(id + '-a' + i);
    if (row) {
      var tag = row.querySelector('.agent-confirm-tag');
      if (tag) { tag.textContent = '执行中'; tag.className = 'agent-confirm-tag running'; }
    }
    await agentSleep(360);
    var res = await callAgentTool(a.tool, a.args || {});
    logs.push({ label: a.label, ok: res.ok !== false, summary: res.summary });
    if (row) {
      var tag2 = row.querySelector('.agent-confirm-tag');
      if (tag2) { tag2.textContent = res.ok === false ? '失败' : '已完成'; tag2.className = 'agent-confirm-tag ' + (res.ok === false ? 'fail' : 'done'); }
    }
    scrollToBottom();
  }
  rec.status = 'done';

  AGENT_MEMORY.notes.unshift({ at: new Date().toISOString(), text: '已执行：' + plan.title });
  saveAgentMemory();

  var failedLogs = logs.filter(function (l) { return !l.ok; }).length;
  var totalAmount = (plan.confirm.actions || []).reduce(function (s, a) { return s + agentPlanActionAmount(a); }, 0);
  var resultClass = failedLogs ? 'failed' : 'success';
  var resultBadge = failedLogs ? '部分失败' : '已完成';
  var footer2 = document.getElementById(id + '-footer');
  var isTransferPlan = (plan.confirm.actions || []).some(function (a) { return a.tool === 'transfer.execute'; });
  if (footer2 && isTransferPlan && !failedLogs) {
    var doneAct = (plan.confirm.actions || [])[0] || {};
    var donePayee = (doneAct.args && doneAct.args.payee) || '';
    var doneBalance = Number((mockData.userProfile && mockData.userProfile.debitCard && mockData.userProfile.debitCard.available) || 0);
    footer2.innerHTML = agentTransferDoneCardHtml(totalAmount, donePayee, doneBalance);
  } else if (footer2) {
    footer2.innerHTML = '<div class="agent-result-card">' +
      '<div class="agent-result-title">' + (plan.confirm.doneTitle || '已按方案执行完成') + '</div>' +
      logs.map(function (l) {
        return '<div class="agent-result-row"><span class="agent-result-name">' + l.label + '</span><span class="agent-result-state ' + (l.ok ? 'ok' : 'bad') + '">' + (l.ok ? '已完成' : '失败') + '</span></div>' +
          (l.summary ? '<div class="agent-result-desc">' + l.summary + '</div>' : '');
      }).join('') +
      '<div class="agent-result-foot"><button class="ui-link" onclick="goToTxnsTab()">查看交易记录</button></div>' +
      (plan.confirm.footnote ? '<div class="agent-result-foot">' + plan.confirm.footnote + '</div>' : '') +
      '</div>';
  }
  if (typeof renderAgentMemoryBox === 'function') renderAgentMemoryBox();
  addToConversation('assistant', '执行「' + plan.title + '」', null);
  scrollToBottom();
}

// 暂不执行 = 直接取消：不记档案、不留待续方案
function agentRejectPlan(id) {
  var rec = AGENT_PENDING_PLANS[id];
  if (!rec) return;
  rec.status = 'cancelled';
  var footer = document.getElementById(id + '-footer');
  if (footer) {
    footer.innerHTML = '<div class="agent-reject-card">已取消，本次未发生任何交易。</div>';
  }
  scrollToBottom();
}

// ------------------------------ 6. Agent 主入口 ------------------------------
// 返回 true 表示本层已处理，false 表示交回原有流程
async function agentHandle(text) {
  if (!AGENT_MEMORY) initAgentMemory();

  // 6.0-pre0 信用卡额度/调额/纯数学计算：确定性前置（兜底，正常情况下 chat.js 已先接管）
  if (typeof agentCardLimitPrehandler === 'function') {
    try {
      if (agentCardLimitPrehandler(text)) return true;
    } catch (e) { /* 忽略，继续走原路由 */ }
  }

  // 6.0-pre1 冻结资金与联系人（A/B 组修复，兜底层）
  if (typeof agentFrozenPrehandler === 'function') {
    try {
      if (agentFrozenPrehandler(text)) return true;
    } catch (e) { /* 忽略 */ }
  }
  if (typeof agentContactPrehandler === 'function') {
    try {
      if (agentContactPrehandler(text)) return true;
    } catch (e) { /* 忽略 */ }
  }

  // 6.0-pre 跨场景目标规划必须早于风险拦截：
  // 「我想一年存10万元，同时准备旅游和购买电脑」里的 10 万是**目标**，
  // 若先跑资金压力检测会被误判成"一笔 10 万支出"而被拦截。
  if (typeof agentParseGoals === 'function' && agentIsComplexGoal(text)) {
    var plannedPre = renderAgentPlanGoals(text);
    if (plannedPre) return true;
  }

  // 6.0-pre2 资金场景推理（"我有5万闲钱，半年后要用，怎么安排"）
  // 同上：5 万是**待配置资金**而非支出，必须早于资金压力检测，
  // 否则会被当成一笔 5 万支出直接拦截。这是咨询题，不是提款题。
  if (typeof agentIsScenarioQuery === 'function' && agentIsScenarioQuery(text)) {
    try {
      if (await agentScenarioAdvice(text)) return true;
    } catch (e) { /* 忽略，继续走原路由 */ }
  }

  // 6.0 高危金融行为识别与拦截（必须早于任何"执行型"分支）
  // 例如「我要套信用卡5万元炒股」——先识别 → 拒绝执行 → 给替代建议。
  // 例外：咨询型问句（问"怎么安排/配置"）里的金额是待配置资金，不是支出，跳过拦截。
  if (typeof agentRiskDetect === 'function' && !agentIsGoalStatement(text) && !agentIsConsultativeQuery(text)) {
    var det = agentRiskDetect(text);
    if (det.blocked && !agentIsRiskQuery(text)) {
      appendMessage(agentRiskBlockCardHtml(det));
      scrollToBottom();
      if (typeof agentRememberRiskBlock === 'function') agentRememberRiskBlock(det);
      addToConversation('assistant', '已拦截高危行为：' + det.top.title, null);
      return true;
    }
  }

  // 6.1 目标型场景（Agent 自主规划多个动作）
  if (typeof agentMatchScenario === 'function') {
    var key = agentMatchScenario(text);
    if (key) {
      await agentRunScenario(key, text);
      return true;
    }
  }

  // 6.1b 指代消解：先于所有业务分支。
  // 因为「这个情况需要调整吗」这类句子本身不含业务关键词，
  // 一旦被下游的宽松正则碰到就会误解；必须在这里把代词换成具体话题。
  if (typeof agentCtxHandle === 'function' && agentCtxHasReference(text)) {
    try {
      var ctxHandled = await agentCtxHandle(text);
      if (ctxHandled) return true;
    } catch (e) { /* 消解失败不阻塞，继续走原路由 */ }
  }

  // 6.1c 金融知识问答（RAG 检索 → 结合用户数据）
  if (typeof agentKBHandle === 'function' && agentKBIsKnowledgeQuery(text)) {
    try {
      if (agentKBHandle(text)) return true;
    } catch (e) { /* 检索异常交给下游 */ }
  }

  // 6.1d（已上移至 6.0-pre2）资金场景推理

  // 6.2 消费决策分析：买不买 / 要不要分期（先分析，不直接生成方案）
  if (typeof agentPurchaseDecision === 'function' && agentIsPurchaseDecision(text)) {
    var amt = agentParseAmount(text);
    if (amt > 0) {
      appendMessage(decisionCardHtml(agentPurchaseDecision(amt, { text: text })));
      scrollToBottom();
      var dd = agentPurchaseDecision(amt, { text: text });
      agentSessionAnalysis('decision', '对 ¥' + agentFmtInt(amt) + ' 的' + dd.intent.label + '：' + dd.advice, { amount: amt, tone: dd.tone });
      agentSessionDemand('purchase', '考虑购买：' + text);
      AGENT_SESSION.lastFocus = '消费决策';
      addToConversation('assistant', '已输出消费决策分析', null);
      return true;
    }
  }

  // 6.25 用户画像 / 财务体检
  if (typeof agentBuildProfile === 'function' && agentIsProfileRequest(text)) {
    // 负债健康体检：明确问负债/月供/债务风险时，走只读负债分析（而非通用健康评分）
    if (/负债|月供|债务|偿债|房贷.*压力|压力.*房贷/.test(text) && typeof renderAgentDebtHealth === 'function') {
      renderAgentDebtHealth();
      if (typeof agentCtxPushTopic === 'function') {
        agentCtxPushTopic('health', '负债健康：月供收入比 ' + (profileCashFlow().debtRatio * 100).toFixed(1) + '%');
      }
    } else if (/健康|体检|评分|打分/.test(text)) {
      renderAgentHealth();
      if (typeof agentCtxPushTopic === 'function') {
        var hp = agentBuildProfile();
        agentCtxPushTopic('health', '财务健康评分 ' + hp.health.total + '/100（' + hp.health.grade + '）');
      }
    } else {
      renderAgentProfile();
      if (typeof agentCtxPushTopic === 'function') {
        var pp = agentBuildProfile();
        agentCtxPushTopic('profile', '客户标签：' + pp.tags.map(function (x) { return x.name; }).join('、'));
      }
    }
    return true;
  }

  // 6.3 转账：走完整 Agent 链路 + 主动风险干预
  //（多步指令交给原有复杂指令流程处理，避免只执行第一步）
  if (/(转|汇款|打款|付款)/.test(text) && /\d/.test(text)
    && !/(订阅|理财|基金|预算|机票)/.test(text)
    && !/(然后|接着|之后|同时|并且|再查|再看)/.test(text)) {
    var parsed = agentParseTransfer(text);
    if (parsed && parsed.amount > 0) {
      await agentTransferFlow(parsed.payee, parsed.amount, text);
      return true;
    }
  }

  // 6.4 生日/家人相关意图（即使没提"安排"）
  if (typeof agentResolvePerson === 'function' && /生日|鲜花|蛋糕|礼物/.test(text)) {
    if (agentResolvePerson(text) || /生日/.test(text)) {
      await agentRunScenario('birthday', text);
      return true;
    }
  }

  // 6.5 消费结构分析（低优先级兜底）。
  // 目的是：无论走不走模型，只要用户问消费结构，就一定会**注册话题**，
  // 这样他接下来的"这个情况需要调整吗"才有指代对象。
  if (typeof agentCtxPushTopic === 'function' && agentIsSpendingQuery(text)) {
    if (agentSpendingAnalysis(text)) return true;
  }

  return false;
}

// 是否在问"消费结构/花销构成"（且不是在问某笔具体购买决策）
function agentIsSpendingQuery(text) {
  var t = String(text || '');
  var asksSpending = /(消费|花销|花钱|支出|开销|花费)/.test(t);
  var asksStructure = /(哪一类|哪个类别|什么类别|最高|最多|占比|结构|构成|分布|排行|排名|统计|分析|情况|看看|看看我)/.test(t);
  // 排除：某笔具体购买决策（"买8000元电脑建议分期吗"）
  var isPurchase = /(买|购|入手|分期)/.test(t) && /\d/.test(t);
  // 排除：转账/套现类
  var isTransfer = /(转|汇款|打款)/.test(t);
  return asksSpending && asksStructure && !isPurchase && !isTransfer;
}

// 消费结构分析（规则层），产出后注册 spending 话题
function agentSpendingAnalysis(text) {
  var cats = agentCategoryStats();
  if (!cats.length) return false;
  var month = agentMonthSummary();
  var total = month.expense || cats.reduce(function (s, c) { return s + (c.value || 0); }, 0);
  var top = cats[0];

  var rows = cats.slice(0, 6).map(function (c, i) {
    var pct = total > 0 ? Math.round(c.value / total * 100) : 0;
    return '<div class="ctx-cat-row"><span class="ctx-cat-name">' + (i === 0 ? '🏆 ' : '') + c.label + '</span>' +
      '<span class="ctx-cat-bar"><i style="width:' + Math.min(100, pct) + '%;background:' + (i === 0 ? '#b45309' : '#09407F') + ';"></i></span>' +
      '<span class="ctx-cat-pct">' + pct + '% · ¥' + agentFmtInt(c.value) + '</span></div>';
  }).join('');

  var html = '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 消费结构分析</div>' +
    '<div class="msg-bubble agent-bubble">' +
    '<div class="ctx-head">你最近一个月的消费结构</div>' +
    '<div class="ctx-cats">' + rows + '</div>' +
    '<div class="ctx-verdict">· 支出最高的类别是 <b>' + top.label + '</b>，占比 ' +
    (total > 0 ? Math.round(top.value / total * 100) : 0) + '%（¥' + agentFmtInt(top.value) + '），本月总支出 ¥' + agentFmtInt(total) + '。</div>' +
    '<div class="ctx-foot">想深入的话可以直接问我「这个情况需要调整吗」，我会接着这份分析往下说。</div>' +
    '</div></div></div>';

  appendMessage(html);
  scrollToBottom();

  // 注册话题 —— 这是"这个情况"能被消解的关键
  agentCtxPushTopic('spending', top.label + '占比最高（' + (total > 0 ? Math.round(top.value / total * 100) : 0) + '%），月支出 ¥' + agentFmtInt(total), {
    extra: { total: total, topLabel: top.label }
  });
  agentSessionAnalysis('spending', '消费结构：' + cats.slice(0, 3).map(function (c) {
    return c.label + ' ' + (total > 0 ? Math.round(c.value / total * 100) : 0) + '%';
  }).join('、'));
  AGENT_SESSION.lastFocus = '消费结构';
  addToConversation('assistant', '已输出消费结构分析', null);
  return true;
}

// 是否为"咨询风险"而非"真的要做"——用户只是问风险知识时不应被拦截卡打断
function agentIsRiskQuery(text) {
  return /(风险|危不危险|有什么风险|合规吗|可以吗|合法吗|允许吗|建议吗|该不该|要不要|是否合适|有没有问题)/.test(text)
    && !/(我要|我想|帮我|给我|直接|现在就|立刻|马上)/.test(text);
}

// 目标型语句（储蓄/长期规划）不是"一笔支出"，不能触发资金压力类拦截。
// 例如「我想一年存10万元，同时准备旅游和购买电脑」里的 10 万是目标，不是本次扣款。
function agentIsGoalStatement(text) {
  var t = String(text || '');
  var goalWord = /(存|攒|储蓄|积累|规划|计划|目标|准备|打算)/.test(t);
  var horizon = /(一年|1年|两年|2年|半年|12个月|24个月|6个月|每月|月度|长期|未来)/.test(t);
  // 必须同时是"目标/长期"表述，且没有明确的"现在就要花掉"的动作
  var immediate = /(现在就|立刻|马上|立即|今天要|现在要|帮我转|给我转|下单)/.test(t);
  return goalWord && horizon && !immediate;
}

// 咨询型问句：问的是"这笔钱该怎么安排/配置"（资产配置咨询），
// 而不是"我现在要花掉这笔钱"。这类句子里的金额是**待配置资金**，不是**支出**，
// 若先跑资金压力检测，会被误判成"一笔 5 万支出"并被风险拦截。
function agentIsConsultativeQuery(text) {
  var t = String(text || '');
  if (!t) return false;
  // 有"闲钱/闲置/结余/这笔钱"等"待配置资金"信号
  var idleMoney = /(闲钱|闲置|闲余|闲散|结余|余钱|这笔钱|这笔资金|手头有|手上有|有\s*\d+(\.\d+)?\s*(万|w|W|元|块)[^，,。;；]{0,4}(闲|余|不用|暂时不))/i.test(t);
  // 在问"怎么安排/配置/打理/放哪"，且不是"现在就花/转"
  var asking = /(怎么安排|如何安排|怎么配置|如何配置|怎么打理|如何打理|放哪|放哪里|怎么放|如何规划|怎么处理|怎么存|如何存|怎么分配|怎么投资|配置建议|安排建议)/.test(t);
  var immediate = /(现在就|立刻|马上|立即|今天要|现在要|帮我转|给我转|帮我买|下单|付款|支付)/.test(t);
  // 期限/用途信号，进一步确认是在做资金安排
  var horizon = /(半年|一年|1年|两年|2年|三个月|3个月|6个月|12个月|一个月|长期|短期|未来|到期|要用|需要用到)/.test(t);
  return ((idleMoney && asking) || (asking && horizon && !immediate)) && !immediate;
}

// 复杂目标：含"同时/并且/还有"等并列，或同时出现储蓄目标与消费目标
function agentIsComplexGoal(text) {
  var t = String(text || '');
  var hasSave = /(存|攒|储蓄|积累)[^，,。;；]{0,6}(\d+(?:\.\d+)?)\s*(万|w|W|元|块)/.test(t);
  var hasSpend = /(旅游|旅行|度假|电脑|笔记本|手机|装修|买车|购车|婚礼|留学|学费|教育)/.test(t);
  var hasParallel = /(同时|并且|还有|另外|以及|顺便|而且)/.test(t);
  var planning = /(规划|计划|安排|怎么|帮我|如何|方案)/.test(t);
  return planning && ((hasSave && hasSpend) || (hasSave && hasParallel) || (hasSpend && hasParallel));
}

// 消费决策：问"买X，建议分期吗 / 该不该买 / 划算吗"
function agentIsPurchaseDecision(text) {
  var t = String(text || '');
  var hasAmount = /\d/.test(t);
  var purchase = /(买|购|入手|换|要|想买|想换|下单|购入)/.test(t);
  var ask = /(建议|要不要|该不该|划算|值不值|分期|可以吗|能买|负担得起|承受|合适吗|推荐吗)/.test(t);
  var isWealth = /(理财|基金|股票|投资|申购|赎回|定投)/.test(t);
  return hasAmount && purchase && ask && !isWealth;
}

// 用户画像 / 财务体检请求
function agentIsProfileRequest(text) {
  var t = String(text || '');
  if (/(健康|体检|评分|打分|财务分)/.test(t) && !/(课程|体检套餐|体检中心|医院|公司体检)/.test(t)) return true;
  // 负债/月供风险体检：问负债压力/月供占比/债务健康时，也走只读体检分析
  if (/(负债|月供|债务|偿债|欠款|借款压力)/.test(t) && /(风险|压力|大不大|高不高|健康|体检|怎么样|多少|占比|分析|看看|情况)/.test(t)) return true;
  return /(用户画像|客户画像|我的画像|分析我|了解我|我是哪类|什么类型.*客户|我的标签|适合我的.*服务|推荐.*适合我|根据我的情况|参考我)/.test(t);
}

function agentParseTransfer(text) {
  var contacts = mockData.contacts || [];
  var payee = null;
  for (var i = 0; i < contacts.length; i++) {
    if (text.indexOf(contacts[i].name) > -1) { payee = contacts[i].name; break; }
  }
  if (!payee) {
    var m = text.match(/(?:给|向|转给|转)([\u4e00-\u9fa5A-Za-z]{2,6})(?:转|打|汇|付|钱|\s|$)/);
    if (m) payee = m[1];
  }
  var am = text.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?\s*(?:元|块|块钱)?/);
  var amount = 0;
  if (am) {
    amount = parseFloat(am[1]);
    if (am[2]) amount *= 10000;
  }
  // 手机号转账
  var phone = text.match(/1\d{10}/);
  if (!payee && phone) payee = phone[0].slice(0, 3) + '****' + phone[0].slice(7);
  if (!payee || !amount) return null;
  return { payee: payee, amount: amount, phone: phone ? phone[0] : null };
}

async function agentTransferFlow(payee, amount, rawText, channel, opts) {
  var ch = channel || '智能转账';
  var o = opts || {};

  // 姓名转账只允许转给通讯录里的联系人；手机号转账、银行卡转账不走这条限制
  var NAME_CHANNELS = { '网银转账': 1, '智能转账': 1, '姓名转账': 1 };
  if (NAME_CHANNELS[ch]) {
    var contacts = mockData.contacts || [];
    var known = contacts.some(function (c) { return c.name === payee; });
    if (!known) {
      var names = contacts.map(function (c) { return c.name; }).join('、');
      appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手</div><div class="msg-bubble agent-bubble">' +
        '<div class="agent-result-card">' +
        '<div class="agent-result-title" style="color:#B54708;">该收款人不在通讯录</div>' +
        '<div class="agent-result-desc">姓名转账只支持通讯录里的联系人：' + (names || '暂无联系人') +
        '。如需转给新收款人，请先在「联系人」中新增，或改用手机号转账。</div>' +
        '<div class="agent-result-foot"><button class="ui-link" onclick="goToContactsTab()">去联系人</button></div>' +
        '</div></div></div></div>');
      scrollToBottom();
      return { handled: true, executed: false, reason: 'unknownPayee' };
    }
  }
  // —— 余额门禁优先于一切：余额不足时不出现「确认转账」按钮，避免用户误以为可以转 ——
  var check = agentCheckBalance([{ amount: amount }]);
  var risk = agentAssessTransferRisk(payee, amount);

  if (!check.enough) {
    appendMessage(agentShortageCardHtml(check, payee));
    scrollToBottom();
    return { handled: true, executed: false, tier: null, reason: 'shortage' };
  }

  var tier = agentTransferTier(amount, risk);
  var phone = o.phone ? String(o.phone).trim() : '';

  var plan = {
    title: '正在为你处理转账',
    subtitle: '目标：向 ' + ((typeof escapeHtml === 'function') ? escapeHtml(payee) : payee) + (phone ? '（' + ((typeof escapeHtml === 'function') ? escapeHtml(phone) : phone) + '）' : '') + ' 转账 ¥' + agentFmt(amount),
    steps: [
      { label: '理解你的指令', run: function () { return { summary: '意图：转账 / 收款人 ' + payee + ' / 金额 ¥' + agentFmt(amount) }; } },
      { label: '获取收款人账户', tool: 'transfer.resolvePayee', args: { payee: payee } },
      { label: '校验转账金额', run: function () {
          return { summary: '金额 ¥' + agentFmt(amount) + '，档位 ' + agentTierBadge(tier).text +
            (tier.needVerify ? '，需二次验证' : '') };
        } },
      { label: '查询账户可用余额', tool: 'account.balance' },
      { label: '执行风险检查', run: function () { return agentRiskStep(payee, amount); } },
      { label: '判断是否需要二次确认', run: function () {
          var extra = tier.needManual ? '（大额交易，将转人工复核）' : '';
          return { summary: tier.needConfirm
            ? ('需要' + tier.name + '（' + agentRiskBadge(risk.level).text + '，风险分 ' + risk.score + '）' + extra)
            : '金额较小且风险可控，无需额外确认' };
        } }
    ],
    confirm: {
      title: '请确认本次转账',
      doneTitle: '转账已完成',
      okLabel: o.okLabel || '',
      footnote: '该笔交易已记入你的常用收款人，下次同类转账将自动降低风险等级。',
      risk: risk,
      actions: [
        { label: '转账给 ' + ((typeof escapeHtml === 'function') ? escapeHtml(payee) : payee) + (phone ? '（' + ((typeof escapeHtml === 'function') ? escapeHtml(phone) : phone) + '）' : '') + ' ¥' + agentFmt(amount) + (o.remark ? ' · 备注：' + ((typeof escapeHtml === 'function') ? escapeHtml(o.remark) : o.remark) : ''), tool: 'transfer.execute',
          args: { payee: payee, amount: amount, channel: ch, remark: o.remark || '', phone: phone }, amount: amount, risk: risk }
      ]
    },
    after: null
  };

  // 高风险或高金额时把结论前置成一张卡片
  if (risk.reasons.length || tier.rank >= 3) {
    appendMessage(agentRiskCardHtml(payee, amount, risk, tier));
    scrollToBottom();
    await agentSleep(200);
  }

  // T1 免确认：直接执行，但结果仍用卡片呈现，不再用一段纯文字替代
  // forceConfirm=true 时（服务向导的多轮转账）即使是 T1 也先出确认卡
  if (!tier.needConfirm && !o.forceConfirm) {
    var res = await callAgentTool('transfer.execute', { payee: payee, amount: amount, channel: ch, remark: o.remark || '', phone: phone });
    if (res && res.ok === false) {
      appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手</div><div class="msg-bubble agent-bubble">' +
        '<div class="agent-result-card"><div class="agent-result-title" style="color:#B42318;">转账未完成</div>' +
        '<div class="agent-result-desc">' + (res.summary || '转账执行失败，请稍后重试。') + '</div>' +
        '</div></div></div></div>');
      scrollToBottom();
      return { handled: true, executed: false, tier: tier, result: res };
    }
    var available = Number(mockData.userProfile.debitCard.available) || 0;
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
      '<div class="msg-name">智能金融助手</div><div class="msg-bubble agent-bubble">' +
      agentTransferDoneCardHtml(amount, payee, available) +
      '</div></div></div>');
    scrollToBottom();
    return { handled: true, executed: true, tier: tier, result: res };
  }

  var planRun = await runAgentPlan(plan);
  return { handled: true, executed: false, tier: tier, pending: true, planId: planRun && planRun.id };
}

function agentRiskStep(payee, amount) {
  var r = agentAssessTransferRisk(payee, amount);
  if (!r.reasons.length) return { summary: '未命中风险规则' };
  return { summary: '命中 ' + r.reasons.length + ' 条风险规则：' + r.reasons.map(function (x) { return x.label; }).join('；'), data: r };
}

function agentRiskCardHtml(payee, amount, risk, tier) {
  var badge = agentRiskBadge(risk.level);
  var esc = (typeof escapeHtml === 'function') ? escapeHtml : function (x) { return String(x); };
  var reasons = (risk.reasons || []).map(function (r) { return r.label; });

  // 风险一句话：新联系人 + 首次交易合并成「首次向该联系人转账」
  var riskText = '未命中风险规则';
  if (reasons.length === 1 && reasons[0] === '该联系人首次交易') riskText = '首次向该联系人转账';
  else if (!risk.known && reasons.indexOf('该联系人首次交易') !== -1) riskText = '首次向该联系人转账';
  else if (reasons.length) riskText = reasons.join('；');

  // 提示：按档位给出下一步
  var tipText = '请确认后继续。';
  if (tier && tier.needManual) tipText = '需提交人工复核，通过后才会执行';
  else if ((tier && tier.needVerify) || risk.needVerify) tipText = '请输入短信验证码完成二次验证';

  function line(label, value) {
    return '<div style="font-size:13px;color:#374151;line-height:1.9;">' + label +
      '：<b style="font-weight:600;color:#111827;">' + value + '</b></div>';
  }

  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手</div>' +
    '<div class="msg-bubble agent-bubble">' +
    '<div style="border:1px solid #f1d9d9;background:#fff;border-radius:12px;padding:14px 16px;">' +
    '<div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:6px;">主动风险干预' +
    '<span style="color:#d1d5db;font-weight:400;">｜</span>' +
    '<span style="color:' + badge.color + ';">' + badge.text + ' ' + risk.score + '/100</span></div>' +
    line('收款人', esc(payee) + (risk.known ? '' : '（新联系人）')) +
    line('金额', '¥' + agentFmt(amount)) +
    line('风险', esc(riskText)) +
    line('提示', esc(tipText)) +
    '</div>' +
    '</div></div></div>';
}
// ---- 超支方案卡：余额不足时给出可执行的选择，而不是只报错 ----
// 排序原则：优先「不借钱」方案（改金额 / 分批），贷款类放在后面，除非用户主动要。
function agentShortageCardHtml(check, payee) {
  var cap = agentFmt(check.capAmount);
  var safeName = String(payee || '').replace(/[\\'"<>&]/g, '');
  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 资金不足提醒</div>' +
    '<div class="msg-bubble agent-bubble">' +
    '<div class="agent-shortage-head">本次转账无法完成</div>' +
    '<div class="agent-shortage-rows">' +
    '<div class="agent-shortage-row"><span>可用余额</span><span>¥' + agentFmt(check.available) + '</span></div>' +
    '<div class="agent-shortage-row"><span>本次需要</span><span>¥' + agentFmt(check.need) + '</span></div>' +
    '<div class="agent-shortage-row shortage"><span>资金缺口</span><span>-¥' + agentFmt(check.shortage) + '</span></div>' +
    '</div>' +
    '<div class="agent-shortage-note">为保护你的账户，系统已在交易前拦截，<b>余额不会被扣成负数</b>。</div>' +
    '<div class="agent-followup">' +
    '<span class="agent-followup-label">可以这样解决：</span>' +
    '<div class="agent-followup-line">① 改为转账上限金额 ¥' + cap + '</div>' +
    '<div class="agent-followup-line">② 自己调整金额（直接告诉我数字）</div>' +
    '<div class="agent-followup-line">③ 拆成多笔分批转账</div>' +
    '<div class="agent-followup-line">④ 了解可借额度与利率</div>' +
    '<div class="agent-followup-line">⑤ 用信用卡支付</div>' +
    '</div>' +
    '</div></div></div>';
}

// 记录上一次资金不足的上下文，供「调整金额」等后续追问使用
var AGENT_SHORTAGE_CTX = null;

function agentReply(text) {
  appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手</div><div class="msg-bubble">' + text + '</div></div></div>');
  scrollToBottom();
}

async function agentShortageFix(kind, capAmount, payee) {
  var check = agentCheckBalance([{ amount: capAmount || 0 }]);

  if (kind === 'cap') {
    agentReply('好的，我把金额改为可用上限 <b>¥' + agentFmt(capAmount) + '</b>，重新为你发起转账。');
    await agentSleep(300);
    if (typeof enhancedSendMessage === 'function') {
      await agentTransferFlow(payee, Number(capAmount), '给' + payee + '转' + capAmount);
    }
    return;
  }

  if (kind === 'adjust') {
    AGENT_SHORTAGE_CTX = { payee: payee, available: check.available };
    agentReply('你的可用余额是 <b>¥' + agentFmt(check.available) + '</b>。<br>' +
      '直接告诉我你想转多少，例如「转 2000」。<br><br>' +
      '提醒：超出可用余额的部分，银行系统不会执行，账户也不会被扣成负数。');
    return;
  }

  if (kind === 'split') {
    var per = Math.floor(check.available / 2);
    agentReply('分批转账需要确认收款方是否接受。<br><br>' +
      '按你当前可用余额，可分 <b>2 笔</b> 各约 <b>¥' + agentFmt(per) + '</b> 转出，' +
      '剩余部分待资金到账后继续。<br><br>' +
      '⚠️ 分批会影响到账时效，如果对方有付款截止时间，请确认是否来得及。');
    return;
  }

  if (kind === 'loan') {
    var loan = await callAgentTool('loan.inquiry', { amount: check.shortage });
    agentReply('关于缺口 <b>¥' + agentFmt(check.shortage) + '</b>，可考虑的借款方式：<br><br>' +
      (loan.summary || '暂未查询到可用额度') + '<br><br>' +
      '<b>需要提醒你</b>：为了转账去借款会放大风险——' +
      '贷款会产生利息，且通常约定资金不得用于投资或转贷。' +
      '如果不是必须，更建议优先考虑「降低金额」或「分批转账」。');
    if (AGENT_MEMORY) {
      AGENT_MEMORY.notes.unshift({ at: new Date().toISOString(), text: '用户咨询了资金缺口方案（缺口 ¥' + agentFmt(check.shortage) + '）' });
      saveAgentMemory();
    }
    return;
  }

  if (kind === 'card') {
    var ov = await callAgentTool('card.overview', {});
    agentReply('信用卡可用于本次支付，但请了解这属于<b>透支</b>行为：<br><br>' +
      (ov.summary || '') + '<br><br>' +
      '超过可用余额的部分会占用信用额度，并按日计息（通常在免息期外收取）。' +
      '建议确认能在还款日前还清，再决定是否使用。');
    return;
  }
}

// ------------------------------ 7. 抽屉 / 记忆面板 ------------------------------
function toggleAgentDrawer() {
  var d = document.getElementById('agentDrawer');
  var o = document.getElementById('agentDrawerOverlay');
  if (!d) return;
  var show = !d.classList.contains('show');
  d.classList.toggle('show', show);
  if (o) o.classList.toggle('show', show);
  if (show) renderAgentMemoryBox();
}

function renderAgentMemoryBox() {
  var box = document.getElementById('agentMemoryBox');
  if (!box || !AGENT_MEMORY) return;
  var m = AGENT_MEMORY;
  var familyChips = m.family.map(function (f) {
    return '<span class="agent-chip">' + f.relation + ' · ' + f.name + '</span>';
  }).join('');
  var lastNote = m.notes[0] ? m.notes[0].text : '暂无';
  box.innerHTML =
    '<div class="agent-memory-label">已记住的家庭成员</div>' +
    '<div class="agent-chip-wrap">' + familyChips + '</div>' +
    '<div class="agent-memory-label">风险偏好</div>' +
    '<div class="agent-chip-wrap"><span class="agent-chip">' + m.profile.riskLevel + '</span></div>' +
    '<div class="agent-memory-label">最近一条记忆</div>' +
    '<div class="agent-memory-note">' + lastNote + '</div>';
}

// 页面初始化
document.addEventListener('DOMContentLoaded', function () {
  initAgentMemory();
  if (typeof initAgentProactive === 'function') initAgentProactive();
});
