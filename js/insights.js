// ==========================================================================
//  AI Banking Agent · 洞察层
//  今日财务驾驶舱 / AI 主动发现 / 主动事件推送 / 跨场景联动场景库
// ==========================================================================

// ------------------------------ 0. 日期对齐（让演示数据始终像"当期"） ------------------------------
var AGENT_SHIFT_KEY = 'agent_date_shift_v2';

function agentShiftDateStr(str, offsetDays) {
  if (!str) return str;
  var m = String(str).match(/(\d{4})-(\d{2})-(\d{2})([\s\S]*)/);
  if (!m) return str;
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + offsetDays);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + m[4];
}

function agentReanchorDates() {
  // ① 订阅扣费日始终相对"今天"重算
  (mockData.subscriptions || []).forEach(function (s) {
    if (typeof s.chargeInDays === 'number') {
      s.chargeDate = agentDateStr(s.chargeInDays);
      s.detail = (s.cycleLabel || '连续包月') + ' · 下次扣款' + s.chargeDate;
    }
  });
  // ② 账期标签跟随当前月份
  if (mockData.bills) mockData.bills.month = agentMonthLabel();

  // ③ 历史交易流水整体平移到"当期"（只按与上次运行的天数差平移，保证幂等）
  var today = new Date();
  var todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  var last = localStorage.getItem(AGENT_SHIFT_KEY);
  var lastDate = last ? new Date(last) : new Date(2026, 8, 14);
  var lastStart = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
  var delta = Math.round((todayStart - lastStart) / 86400000);
  if (delta <= 0) return;
  if (delta > 720) delta = 720;

  var p = mockData.userProfile || {};
  (p.recentTxns || []).forEach(function (t) { t.time = agentShiftDateStr(t.time, delta); });
  (p.transferHistory || []).forEach(function (t) { t.time = agentShiftDateStr(t.time, delta); });
  if (p.creditCard) p.creditCard.dueDate = agentShiftDateStr(p.creditCard.dueDate, delta);
  try { localStorage.setItem(AGENT_SHIFT_KEY, todayStart.toISOString()); } catch (e) { }
}

// ------------------------------ 1. 今日财务驾驶舱 ------------------------------
function agentDashboard() {
  var assets = agentTotalAssets();
  var month = agentMonthSummary();
  var budget = agentBudgetStatus();
  return {
    assets: assets.total,
    assetsDetail: assets,
    income: month.income,
    expense: month.expense,
    forecastBalance: month.balance,
    budget: budget
  };
}

// ------------------------------ 2. AI 主动发现 ------------------------------
function agentDiscoveries() {
  var list = [];
  var month = agentMonthSummary();
  var base = (AGENT_MEMORY && AGENT_MEMORY.profile.monthlyAvgExpense) || 7000;

  // ① 支出趋势
  if (base > 0 && month.expense > 0) {
    var pct = Math.round((month.expense - base) / base * 100);
    var top2 = agentGrowthCategories(2).map(function (c) { return c.label; }).join('和');
    list.push({
      priority: 30,
      title: '本月支出较过去 3 个月平均值 ' + (pct >= 0 ? '↑ ' : '↓ ') + Math.abs(pct) + '%',
      detail: '主要增加于' + (top2 || '日常消费') + '。',
      tone: pct >= 15 ? 'warn' : 'normal',
      taskKey: 'billCheck',
      taskLabel: '检查异常支出'
    });
  }

  // ② 订阅扣费前瞻
  var up = agentUpcomingSubscriptions(7);
  if (up.length) {
    var u0 = up[0];
    var idle = (mockData.subscriptions || []).filter(function (s) { return s.usage === '低'; });
    list.push({
      priority: 40,
      title: '你的「' + u0.sub.name + '」将在 ' + u0.inDays + ' 天后自动扣费',
      detail: '金额 ¥' + agentFmtInt(u0.sub.price) + (idle.length ? '；其中 ' + idle.length + ' 项近 3 个月使用频率较低。' : '。'),
      tone: 'warn',
      taskKey: 'subscribeOptimize',
      taskLabel: '优化订阅'
    });
  }

  // ③ 预算水位
  var tb = agentTravelBudget();
  if (tb && tb.remain > 0) {
    list.push({
      priority: 20,
      title: '你设置的' + tb.name + '还剩 ¥' + agentFmtInt(tb.remain),
      detail: '按当前消费速度预计可维持 ' + tb.days + ' 天。',
      tone: 'normal',
      taskKey: 'budgetPlan',
      taskLabel: '制定月底预算'
    });
  }

  // ④ 家人生日
  var family = (AGENT_MEMORY && AGENT_MEMORY.family) ? AGENT_MEMORY.family : [];
  var bd = family.map(function (f) { return { f: f, d: agentDaysUntil(f.birthday) }; })
    .filter(function (x) { return x.d <= 15; })
    .sort(function (a, b) { return a.d - b.d; })[0];
  if (bd) {
    list.push({
      priority: 60,
      title: bd.d + ' 天后是你' + bd.f.relation + bd.f.name + '的生日',
      detail: '已经为你准备好一份可一键执行的关怀方案（锁定 ¥1,000 活期 + 鲜花 + 蛋糕）。',
      tone: 'highlight',
      taskKey: 'birthday',
      taskLabel: '安排生日关怀'
    });
  }

  // ⑤ 异常交易
  var ab = agentAbnormalTxns();
  if (ab.length) {
    list.push({
      priority: 50,
      title: '检测到 ' + ab.length + ' 笔异常交易，合计 ¥' + agentFmtInt(ab.reduce(function (s, t) { return s + t.amount; }, 0)),
      detail: '涉及' + ab.map(function (t) { return t.abnormalReason; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('、') + '。',
      tone: 'danger',
      taskKey: 'abnormal',
      taskLabel: '核查异常交易'
    });
  }

  // ⑥ v6：分类同比异动（如"本月餐饮支出同比上涨 30%"）
  if (typeof agentCategoryAlerts === 'function') {
    try {
      agentCategoryAlerts().slice(0, 2).forEach(function (a) {
        list.push({
          priority: a.priority,
          title: a.title,
          detail: a.detail,
          tone: a.tone,
          taskKey: a.action === 'budgetAdjust' ? 'budgetPlan' : (a.action === 'billCheck' ? 'billCheck' : 'abnormal'),
          taskLabel: a.actionLabel || '查看'
        });
      });
    } catch (e) { /* 展示层未就绪时忽略 */ }
  }

  list.sort(function (a, b) { return b.priority - a.priority; });
  return list;
}

// ------------------------------ 3. 智能体简报（首页） ------------------------------
function agentGreeting() {
  var h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function agentMetricHtml(label, value, cls) {
  return '<div class="agent-metric"><div class="agent-metric-label">' + label + '</div>' +
    '<div class="agent-metric-value ' + (cls || '') + '">' + value + '</div></div>';
}

function bankEsc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function agentBriefingHtml() {
  var dash = agentDashboard();
  var finds = agentDiscoveries();
  var insight = finds[0] || null;
  var u = mockData.userProfile || {};
  var d = u.debitCard || {};
  var name = (AGENT_MEMORY && AGENT_MEMORY.profile.name) || u.name || '小陈';
  var cardTail = d.number ? String(d.number).replace(/\D/g, '').slice(-4) : '8888';
  var rawAssets = '¥ ' + agentFmt(dash.assets);

  var quick = [
    { icon: 'transfer', label: '转账', action: "quickAction('transfer')" },
    { icon: 'timer', label: '定时转账', action: "quickAction('scheduled')" },
    { icon: 'bill', label: '账单', action: "quickAction('bill')" },
    { icon: 'wealth', label: '理财', action: "quickAction('wealth')" },
    { icon: 'card', label: '卡片', action: "quickAction('card')" },
    { icon: 'grid', label: '全部', action: 'toggleFuncPanel()' }
  ].map(function (x) {
    return '<button class="bank-quick-item" onclick="' + x.action + '">' +
      '<span class="bank-quick-ico">' + bankIcon(x.icon, 21) + '</span>' +
      '<span>' + x.label + '</span></button>';
  }).join('');

  var txns = (u.recentTxns || []).slice(0, 3).map(function (t) {
    var income = t.type === 'income';
    return '<div class="bank-txn">' +
      '<span class="bank-txn-ico ' + (income ? 'income' : 'expense') + '">' + bankIcon(income ? 'download' : 'withdraw', 16) + '</span>' +
      '<span class="bank-txn-main"><b>' + bankEsc(t.desc) + '</b><small>' + bankEsc(t.time) + (t.channel ? ' · ' + bankEsc(t.channel) : '') + '</small></span>' +
      '<span class="bank-txn-amt ' + (income ? 'income' : 'expense') + '">' + (income ? '+' : '-') + '¥' + agentFmt(t.amount) + '</span>' +
      '</div>';
  }).join('') || '<div class="bank-empty">暂无交易记录</div>';

  var aiCard;
  if (insight) {
    aiCard = '<div class="bank-ai-card ' + (insight.tone || '') + '">' +
      '<div class="bank-ai-card-head"><span class="bank-ai-pill">AI 发现</span><span class="bank-ai-card-hint">已为你核对账户</span></div>' +
      '<div class="bank-ai-card-title">' + insight.title + '</div>' +
      '<div class="bank-ai-card-desc">' + insight.detail + '</div>' +
      '<div class="bank-ai-card-foot"><button class="bank-link" onclick="agentRunTask(\'' + insight.taskKey + '\')">' + insight.taskLabel + ' ›</button></div>' +
      '</div>';
  } else {
    aiCard = '<div class="bank-ai-card">' +
      '<div class="bank-ai-card-head"><span class="bank-ai-pill">AI 管家</span></div>' +
      '<div class="bank-ai-card-title">账户状态正常</div>' +
      '<div class="bank-ai-card-desc">本月收支平稳，暂时没有需要处理的风险。</div>' +
      '<div class="bank-ai-card-foot"><button class="bank-link" onclick="agentRunTask(\'billCheck\')">看本月账单 ›</button></div>' +
      '</div>';
  }

  return '<div class="message agent-home">' +
    '<div class="msg-content">' +
    '<div class="msg-bubble agent-bubble agent-briefing bank-home">' +

    '<div class="bank-hello">' +
      '<div>' +
        '<div class="bank-hello-title">' + agentGreeting() + '，' + bankEsc(name) + '</div>' +
        '<div class="bank-hello-sub">AI 管家已为你核对账户</div>' +
      '</div>' +
      '<span class="bank-online"><i></i>AI 在线</span>' +
    '</div>' +

    '<div class="bank-balance-card">' +
      '<div class="bank-balance-top">' +
        '<span class="bank-balance-label">总资产（元）</span>' +
        '<button class="bank-eye" onclick="toggleBankBalance(this)" aria-label="显示或隐藏金额">' + bankIcon('eye', 16) + '</button>' +
      '</div>' +
      '<div class="bank-balance-amount" data-raw="' + rawAssets + '">' + rawAssets + '</div>' +
      '<div class="bank-balance-sub">' +
        '<span>储蓄卡 <b>**** ' + cardTail + '</b></span>' +
        '<span class="bank-vip">' + bankEsc(u.level || '白金客户') + '</span>' +
      '</div>' +
      '<div class="bank-balance-stats">' +
        '<div><span>储蓄卡可用</span><b>¥' + agentFmtInt(d.available) + '</b></div>' +
        '<div><span>本月收入</span><b class="income">+¥' + agentFmtInt(dash.income) + '</b></div>' +
        '<div><span>本月支出</span><b class="expense">-¥' + agentFmtInt(dash.expense) + '</b></div>' +
      '</div>' +
    '</div>' +

    '<div class="bank-quick">' + quick + '</div>' +

    aiCard +

    '<div class="bank-section-head"><span>最近交易</span><button class="bank-link" onclick="openTxnsPage()">查看全部 ›</button></div>' +
    '<div class="bank-txn-list">' + txns + '</div>' +

    '</div></div></div>';
}

function renderAgentBriefing() {
  if (!AGENT_MEMORY) initAgentMemory();
  agentReanchorDates();
  appendMessage(agentBriefingHtml());
  // 首页是银行 App 的主页，进入时应从资产卡顶部开始看
  scrollToTop();
}

// ------------------------------ 4. 主动事件推送 ------------------------------
function agentNextProactiveEvent() {
  var finds = agentDiscoveries();
  var hit = finds.filter(function (f) { return f.priority >= 40; })[0];
  return hit || null;
}

function agentProactiveCardHtml(ev) {
  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 主动提醒</div>' +
    '<div class="msg-bubble agent-bubble agent-proactive">' +
    '<div class="agent-proactive-head">我主动帮你看了一眼账户</div>' +
    '<div class="agent-insight highlight">' +
    '<div class="agent-insight-idx">!</div>' +
    '<div class="agent-insight-body">' +
    '<div class="agent-insight-title">' + ev.title + '</div>' +
    '<div class="agent-insight-desc">' + ev.detail + '</div>' +
    '</div></div>' +
    '<div class="agent-tasks"><button class="agent-task" onclick="agentRunTask(\'' + ev.taskKey + '\')">' + ev.taskLabel + '</button>' +
    '<button class="agent-task ghost" onclick="this.closest(\'.msg-bubble\').querySelector(\'.agent-proactive-foot\').style.display=\'block\';this.style.display=\'none\';">稍后再说</button></div>' +
    '<div class="agent-proactive-foot">好的，我记下了。等你需要时直接对我说一声就行。</div>' +
    '</div></div></div>';
}

// 主动推送已关闭（演示不再在进入页面后自动弹出「我主动帮你看了一眼…」）
var AGENT_PROACTIVE_ENABLED = false;

function initAgentProactive() {
  if (!AGENT_PROACTIVE_ENABLED) return;
  // 模拟后台事件引擎：进入页面一段时间后主动推送一次
  setTimeout(function () {
    if (sessionStorage.getItem('agent_proactive_pushed')) return;
    sessionStorage.setItem('agent_proactive_pushed', '1');

    // v6：优先推送"分类同比异动"这类更有洞察力的发现
    if (typeof agentCategoryAlerts === 'function') {
      try {
        var alerts = agentCategoryAlerts();
        if (alerts.length) {
          appendMessage(agentAlertCardHtml(alerts[0]));
          if (typeof showToast === 'function') showToast('智能金融助手主动发现了一件事', 2600);
          scrollToBottom();
          return;
        }
      } catch (e) { /* 降级到原主动推送 */ }
    }

    var ev = agentNextProactiveEvent();
    if (!ev) return;
    appendMessage(agentProactiveCardHtml(ev));
    if (typeof showToast === 'function') showToast('智能金融助手主动发现了一件事', 2600);
    scrollToBottom();
  }, 12000);
}

// ------------------------------ 5. 场景匹配与执行入口 ------------------------------
function agentMatchScenario(text) {
  if (/生日|鲜花|蛋糕|礼物/.test(text) && /(安排|准备|帮我|怎么|订|买|送|关怀|规划|来了|到了)/.test(text)) return 'birthday';
  if (/出差|旅行|旅游|度假|出国/.test(text) && /(预算|安排|计划|帮我|规划|多少)/.test(text)) return 'travel';
  if (/(手上|手里|我有|我有笔|闲置)[\s\S]{0,6}\d+\s*(万|w|W)?/.test(text) && /(理财|配置|收益|风险|用|投资|稳健|基金)/.test(text)) return 'wealthGoal';
  if (/(异常|可疑)/.test(text) && /(支出|交易|消费)/.test(text)) return 'abnormal';
  if (/订阅/.test(text) && /(优化|整理|检查|取消|帮我|梳理|清理)/.test(text)) return 'subscribeOptimize';
  if (/(月底|下月|下个月|月度)[\s\S]{0,4}预算|制定[\s\S]{0,4}预算|帮我[\s\S]{0,4}预算/.test(text)) return 'budgetPlan';
  if (/(有什么要注意|要注意的|体检|整理本月账单|看看账单|账单分析|这个月花)/.test(text)) return 'billCheck';
  return null;
}

async function agentRunScenario(key, text) {
  switch (key) {
    case 'birthday': return scenarioBirthday(text);
    case 'travel': return scenarioTravel(text);
    case 'wealthGoal': return scenarioWealthGoal(text);
    case 'billCheck': return scenarioBillCheck();
    case 'subscribeOptimize': return scenarioSubscribeOptimize();
    case 'budgetPlan': return scenarioBudgetPlan();
    case 'abnormal': return scenarioAbnormal();
    default: return false;
  }
}

function agentRunTask(key) {
  // v6：画像 / 健康评分 / 主动提醒 走专门入口
  if (key === 'profile') {
    appendMessage('<div class="message user"><div class="msg-avatar user">陈</div><div class="msg-content"><div class="msg-name">小陈</div><div class="msg-bubble">分析一下我的用户画像</div></div></div>');
    scrollToBottom();
    setTimeout(function () { if (typeof renderAgentProfile === 'function') renderAgentProfile(); }, 120);
    return;
  }
  if (key === 'health') {
    appendMessage('<div class="message user"><div class="msg-avatar user">陈</div><div class="msg-content"><div class="msg-name">小陈</div><div class="msg-bubble">我的财务健康评分是多少？</div></div></div>');
    scrollToBottom();
    setTimeout(function () { if (typeof renderAgentHealth === 'function') renderAgentHealth(); }, 120);
    return;
  }
  if (key === 'viz') {
    appendMessage('<div class="message user"><div class="msg-avatar user">陈</div><div class="msg-content"><div class="msg-name">小陈</div><div class="msg-bubble">给我看看财务全景可视化</div></div></div>');
    scrollToBottom();
    setTimeout(function () { if (typeof renderFinanceVisualization === 'function') renderFinanceVisualization(); }, 120);
    return;
  }
  if (key === 'planGoal') {
    var t = '我想一年存 10 万元，同时准备旅游和购买电脑，帮我规划';
    appendMessage('<div class="message user"><div class="msg-avatar user">陈</div><div class="msg-content"><div class="msg-name">小陈</div><div class="msg-bubble">' + escapeHtml(t) + '</div></div></div>');
    scrollToBottom();
    setTimeout(function () { if (typeof renderAgentPlanGoals === 'function') renderAgentPlanGoals(t); }, 120);
    return;
  }
  var hints = {
    birthday: '帮我安排一下爱人的生日',
    travel: '我下个月准备去上海出差，预算5000元，帮我安排一下',
    wealthGoal: '我手上有10万，明年要用，不想承担太大风险',
    billCheck: '帮我看看这个月还有什么要注意的',
    subscribeOptimize: '帮我优化一下订阅',
    budgetPlan: '帮我制定月底预算',
    abnormal: '帮我核查异常交易'
  };
  var text = hints[key] || '帮我看看';
  appendMessage('<div class="message user"><div class="msg-avatar user">陈</div><div class="msg-content"><div class="msg-name">小陈</div><div class="msg-bubble">' + escapeHtml(text) + '</div></div></div>');
  scrollToBottom();
  setTimeout(function () { agentRunScenario(key, text); }, 120);
}

function agentParseAmount(text) {
  var m = String(text).match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (!m) return 0;
  var v = parseFloat(m[1]);
  if (m[2]) v *= 10000;
  return v;
}

// ------------------------------ 6. 场景实现 ------------------------------

// 6.1 生日关怀（跨场景联动的核心演示）
async function scenarioBirthday(text) {
  var person = agentResolvePerson(text) || AGENT_MEMORY.family.filter(function (f) { return f.relation === '爱人'; })[0] || AGENT_MEMORY.family[0];
  var days = agentDaysUntil(person.birthday);
  var birthdayDate = agentDateStr(days);
  var flowerDate = agentDateStr(Math.max(0, days - 2));
  var reserve = 1000;
  var flowerPrice = 168;
  var cakePrice = 238;

  var plan = {
    title: '正在为你制定生日关怀方案',
    subtitle: person.relation + ' · ' + person.name + ' · ' + (days === 0 ? '就是今天' : days + ' 天后') + '（' + birthdayDate + '）',
    steps: [
      { label: '扫描所有联系人的生日', tool: 'life.scanBirthdays', args: { withinDays: 30 } },
      { label: '查询账户可用资金', tool: 'account.balance' },
      { label: '校验当月现金流与预算', tool: 'budget.status' },
      { label: '匹配' + person.relation + '的偏好档案', run: function () {
          return { summary: '偏好：' + (person.favoriteFlower || '向日葵') + '；忌口：' + ((person.avoid || []).join('、') || '无') };
        } },
      { label: '生成本月预留与支出方案', run: function () {
          return { summary: '锁定 ¥' + agentFmtInt(reserve) + ' 活期 → ' + birthdayDate + ' 自动转出；鲜花 ' + (person.favoriteFlower || '向日葵') + ' ¥' + flowerPrice + '；蛋糕 ¥' + cakePrice };
        } },
      { label: '核对生日前 2 天的配送时间', run: function () {
          return { summary: '鲜花 ' + flowerDate + ' 上午送达，蛋糕 ' + birthdayDate + ' 上午送达' };
        } }
    ],
    confirm: {
      title: '确认后我会替你把这四件事都办了',
      doneTitle: '生日关怀方案已执行完成',
      footnote: '所有款项在 ' + birthdayDate + ' 前可随时撤销；鲜花与蛋糕如需修改规格，直接告诉我即可。',
      actions: [
        { label: '锁定 ¥' + agentFmtInt(reserve) + ' 活期，' + birthdayDate + ' 09:00 自动转出', tool: 'life.reserveDeposit', args: { amount: reserve, reason: '生日预留', purpose: person.relation + person.name + '生日', date: birthdayDate, autoTransfer: true }, amount: reserve },
        { label: '生日前 2 天（' + flowerDate + '）预订' + (person.favoriteFlower || '向日葵') + ' ¥' + flowerPrice, tool: 'life.orderFlower', args: { name: person.name, flower: person.favoriteFlower || '向日葵', price: flowerPrice, deliverDate: flowerDate }, amount: flowerPrice },
        { label: '生日当天（' + birthdayDate + '）预订蛋糕 ¥' + cakePrice, tool: 'life.orderCake', args: { name: person.name, size: person.cakeSize || '6寸', price: cakePrice, deliverDate: birthdayDate }, amount: cakePrice },
        { label: '设置生日提醒并生成祝福语草稿', tool: 'life.setReminder', args: { title: person.name + ' 生日', date: birthdayDate } }
      ]
    }
  };
  await runAgentPlan(plan);
  return true;
}

// 6.2 出差财务计划
async function scenarioTravel(text) {
  var cityMatch = String(text).match(/(?:去|到|前往)([\u4e00-\u9fa5]{2,6}?)(?:出差|开会|旅游|旅行|度假|$)/);
  var city = cityMatch ? cityMatch[1] : '上海';
  var budget = agentParseAmount(text) || 5000;
  var monthOffset = /下个月|下月/.test(text) ? 1 : 0;
  var days = 4;
  var deadline = agentDateStr(monthOffset * 30 + 7);

  var plan = {
    title: '正在为你制定出差财务计划',
    subtitle: '目的地 ' + city + ' · 预算 ¥' + agentFmtInt(budget) + ' · ' + days + ' 天行程',
    steps: [
      { label: '分析历史消费结构', tool: 'bill.categoryStats' },
      { label: '估算交通预算', tool: 'life.travelPlan', args: { city: city, budget: budget, days: days } },
      { label: '检查当前可用资金', tool: 'account.balance' },
      { label: '校验月度预算是否受影响', tool: 'budget.status' },
      { label: '制定 ¥' + agentFmtInt(budget) + ' 专项预算', run: function () {
          return { summary: '专项预算 ¥' + agentFmtInt(budget) + '，与日常月度预算互不挤占' };
        } },
      { label: '创建专项预算账户', run: function () { return { summary: '待你确认后创建' }; } }
    ],
    confirm: {
      title: '确认后我会建好专项预算并锁定备用金',
      doneTitle: '出差财务计划已落地',
      footnote: '专项账户独立记账，出差结束后剩余额度会自动回补到日常预算。',
      actions: [
        { label: '创建「' + city + '出差专项预算」¥' + agentFmtInt(budget), tool: 'budget.createFund', args: { name: city + '出差专项预算', amount: budget, deadline: deadline }, amount: budget },
        { label: '锁定 ¥' + agentFmtInt(budget) + ' 作为出差备用金', tool: 'life.reserveDeposit', args: { amount: budget, purpose: city + '出差备用金', date: deadline, autoTransfer: false }, amount: 0 }
      ]
    }
  };
  await runAgentPlan(plan);
  return true;
}

// 6.3 理财目标化（不只是产品推荐）
async function scenarioWealthGoal(text) {
  var amount = agentParseAmount(text) || 100000;
  var horizon = /明年|一年|1年|12个月/.test(text) ? 12 : (/半年|6个月/.test(text) ? 6 : 12);
  var riskPref = /不想承担|不能亏|保守|稳一点|稳健|低风险/.test(text) ? '稳健' : (/进取|高收益/.test(text) ? '进取' : '均衡');

  var plan = {
    title: '正在为你制定资金配置方案',
    subtitle: '可投 ¥' + agentFmtInt(amount) + ' · 期限 ' + horizon + ' 个月 · 偏好 ' + riskPref,
    steps: [
      { label: '理解你的目标', run: function () {
          return { summary: '金额 ¥' + agentFmtInt(amount) + '，' + horizon + ' 个月后需要动用，要求' + riskPref };
        } },
      { label: '调用用户画像与风险等级', tool: 'account.profile' },
      { label: '分析资金期限与流动性需求', run: function () {
          return { summary: '期限 ' + horizon + ' 个月 → 优先匹配 ' + (horizon >= 12 ? '1 年期以内' : '6 个月以内') + '可赎回产品' };
        } },
      { label: '分析风险承受能力', run: function () {
          return { summary: '当前评级 ' + AGENT_MEMORY.profile.riskLevel + '，与本目标的' + riskPref + '取向一致' };
        } },
      { label: '筛选适配产品池', tool: 'wealth.list' },
      { label: '计算多套方案并测算收益', tool: 'wealth.recommend', args: { amount: amount, horizon: horizon, riskPref: riskPref } },
      { label: '解释风险与赎回规则', run: function () {
          return { summary: '已标注最大回撤区间、赎回到账时间与提前赎回费用' };
        } }
    ],
    confirm: {
      title: '确认后按推荐方案下单（可只选其中一笔）',
      doneTitle: '配置方案已下单',
      footnote: '产品有风险，历史收益不代表未来表现。你可以随时对我说「赎回」来发起退出。',
      actions: [
        { label: '申购「稳健增利90天」¥' + agentFmtInt(Math.round(amount * 0.6)), tool: 'wealth.buy', args: { product: '稳健增利90天', amount: Math.round(amount * 0.6) }, amount: Math.round(amount * 0.6) },
        { label: '申购「天天盈货币基金」¥' + agentFmtInt(amount - Math.round(amount * 0.6)), tool: 'wealth.buy', args: { product: '天天盈货币基金', amount: amount - Math.round(amount * 0.6) }, amount: amount - Math.round(amount * 0.6) }
      ]
    }
  };
  await runAgentPlan(plan);
  return true;
}

// 6.4 账单体检
async function scenarioBillCheck() {
  var plan = {
    title: '正在为你做本月账单体检',
    subtitle: '只读分析，不会产生任何交易',
    steps: [
      { label: '汇总本月收支', tool: 'bill.monthSummary' },
      { label: '对比历史支出趋势', tool: 'bill.trend' },
      { label: '拆分消费分类占比', tool: 'bill.categoryStats' },
      { label: '并行检测异常交易', tool: 'bill.detectAbnormal' },
      { label: '检查预算执行水位', tool: 'budget.status' },
      { label: '生成可执行建议', run: function () {
          return { summary: '已生成 3 条可执行建议（见下方）' };
        } }
    ]
  };
  var res = await runAgentPlan(plan);
  agentRenderFollowUps(res.id, [
    { key: 'subscribeOptimize', label: '优化订阅' },
    { key: 'abnormal', label: '核查异常交易' },
    { key: 'budgetPlan', label: '制定月底预算' }
  ]);
  return true;
}

// 6.5 订阅优化
async function scenarioSubscribeOptimize() {
  var idle = (mockData.subscriptions || []).filter(function (s) { return s.usage === '低'; });
  var save = idle.reduce(function (s, x) { return s + (x.price || 0); }, 0);
  var actions = idle.map(function (s) {
    return { label: '取消「' + s.name + '」（月省 ¥' + agentFmtInt(s.price) + '）', tool: 'subscription.cancel', args: { id: s.id } };
  });

  var plan = {
    title: '正在为你优化订阅',
    subtitle: '目标：减少低使用率的自动扣费',
    steps: [
      { label: '读取全部订阅清单', tool: 'subscription.list' },
      { label: '扫描近期扣费时间点', tool: 'subscription.scan' },
      { label: '识别低使用率订阅', run: function () {
          return { summary: idle.length ? ('命中 ' + idle.length + ' 项：' + idle.map(function (s) { return s.name; }).join('、')) : '未发现低使用率订阅' };
        } },
      { label: '测算可节省金额', run: function () {
          return { summary: '每年可节省约 ¥' + agentFmtInt(save * 12) };
        } }
    ]
  };
  if (actions.length) {
    plan.confirm = {
      title: '确认后我会逐项取消（可随时恢复）',
      doneTitle: '订阅已优化',
      footnote: '取消后本计费周期仍可使用至到期日。',
      actions: actions
    };
  } else {
    plan.after = function (id) {
      agentRenderFollowUps(id, [{ key: 'billCheck', label: '体检本月账单' }]);
    };
  }
  await runAgentPlan(plan);
  return true;
}

// 6.6 月底预算
async function scenarioBudgetPlan() {
  var s = agentBudgetStatus();
  var suggest = Math.round((s.used / Math.max(1, new Date().getDate())) * 30 / 100) * 100;

  var plan = {
    title: '正在为你制定下月预算',
    subtitle: '基于本月真实消费节奏推算',
    steps: [
      { label: '汇总本月真实支出', tool: 'bill.monthSummary' },
      { label: '统计消费分类占比', tool: 'bill.categoryStats' },
      { label: '检查当前预算执行水位', tool: 'budget.status' },
      { label: '推算月底结余与下月基准', run: function () {
          return { summary: '按日均 ¥' + agentFmtInt(s.dailyRate) + ' 推算，下月预算建议 ¥' + agentFmtInt(suggest) };
        } },
      { label: '生成下月预算方案', run: function () { return { summary: '待你确认后写入' }; } }
    ],
    confirm: {
      title: '确认后写入下月预算',
      doneTitle: '预算已设定',
      footnote: '当支出接近预算 80% 时，我会主动提醒你。',
      actions: [
        { label: '设置月度预算 ¥' + agentFmtInt(suggest), tool: 'budget.set', args: { amount: suggest, period: 'month' } }
      ]
    }
  };
  await runAgentPlan(plan);
  return true;
}

// 6.7 异常交易核查
async function scenarioAbnormal() {
  var plan = {
    title: '正在核查异常交易',
    subtitle: '只读核查，不会冻结任何卡片',
    steps: [
      { label: '拉取全部交易明细', tool: 'account.transactions' },
      { label: '检测异常交易', tool: 'bill.detectAbnormal' },
      { label: '核对交易时间与渠道', run: function () {
          var a = agentAbnormalTxns();
          var channels = a.map(function (t) { return t.channel; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
          return { summary: channels.length ? ('集中在 ' + channels.join('、') + ' 渠道') : '无异常' };
        } },
      { label: '评估是否需要临时管控', tool: 'card.overview' }
    ]
  };
  var res = await runAgentPlan(plan);
  agentRenderFollowUps(res.id, [
    { key: 'billCheck', label: '继续体检账单' },
    { key: 'budgetPlan', label: '调整消费预算' }
  ]);
  return true;
}

// ------------------------------ 7. 收尾建议 ------------------------------
function agentRenderFollowUps(planId, items) {
  var id = 'follow-' + planId;
  var html = '<div class="agent-followup" id="' + id + '">' +
    '<span class="agent-followup-label">接下来我可以替你：</span>' +
    items.map(function (x) {
      return '<button class="agent-task" onclick="agentRunTask(\'' + x.key + '\')">' + x.label + '</button>';
    }).join('') +
    '</div>';
  var anchor = document.getElementById(planId + '-footer');
  if (anchor) anchor.innerHTML = html;
  scrollToBottom();
}
