// ==========================================================================
//  AI Banking Agent · 跨场景任务规划器（Planner）
//  目标：从"单任务响应"升级为"目标理解 → 任务拆解 → 分析 → 建议"。
//  示例：「我想一年存10万元，同时准备旅游和购买电脑，帮我规划。」
//  输出：月度预算 / 储蓄计划 / 消费建议 / 里程碑。
// ==========================================================================

// ------------------------------ 1. 目标解析 ------------------------------
// 从自然语言里抽出：储蓄目标金额、周期、以及并行的消费目标
function agentParseGoals(text) {
  var t = String(text || '');
  var goals = [];

  // ① 储蓄目标："一年存10万" / "存 10 万" / "攒5万"
  // 用 [^，,。;；\s] 限制中间不得跨过标点，避免把后面消费目标的金额吃进来
  var saveMatch = t.match(/(?:一年|1年|12个月|半年|6个月|两年|2年)?[^，,。;；\n]{0,8}?(?:存|攒|储蓄|积累|留下)[^，,。;；\n]{0,4}?(\d+(?:\.\d+)?)\s*(万|w|W|元|块)?/);
  if (saveMatch) {
    var sv = parseFloat(saveMatch[1]);
    if (saveMatch[2] === '万' || saveMatch[2] === 'w' || saveMatch[2] === 'W') sv *= 10000;
    var months = /半年|6个月/.test(t) ? 6 : /两年|2年|24个月/.test(t) ? 24 : 12;
    if (sv > 0) goals.push({ type: 'save', amount: sv, months: months, label: months + ' 个月内存下 ¥' + agentFmtInt(sv) });
  }

  // ② 消费目标：旅游 / 电脑 / 其他大额
  var spendPatterns = [
    { re: /(旅游|旅行|度假|出国|出境)/, label: '旅游', def: 15000 },
    { re: /(电脑|笔记本|台式|主机|显示器)/, label: '购买电脑', def: 8000 },
    { re: /(手机|换手机|新手机)/, label: '购买手机', def: 5000 },
    { re: /(装修|家装|家具)/, label: '装修/家具', def: 30000 },
    { re: /(买车|购车|首付)/, label: '购车', def: 80000 },
    { re: /(结婚|婚礼)/, label: '婚礼', def: 60000 },
    { re: /(留学|出国留学|学费|教育)/, label: '教育支出', def: 50000 }
  ];
  // 注意：p.re.source 含捕获组，直接拼进 new RegExp 会让后续组的编号整体后移，
  // 因此这里统一用命名组取值，避免"金额取到了别的捕获组"这类隐蔽 bug。
  spendPatterns.forEach(function (p) {
    if (!p.re.test(t)) return;
    var amt = p.def;

    // ① 就近取"目标词在后、金额在前"：如"买8000元的电脑""旅游预算2万"
    var before = t.match(new RegExp('(\\d+(?:\\.\\d+)?)\\s*(万|w|W)?\\s*(?:元|块|块钱)?[\\s\\S]{0,6}?' + p.re.source));
    // ② 就近取"目标词在前、金额在后"：如"电脑8000""旅游 2万"
    var after = t.match(new RegExp(p.re.source + '[\\s\\S]{0,10}?(\\d+(?:\\.\\d+)?)\\s*(万|w|W)?'));

    // 用命名取值：捕获组总数 = p.re 内部组数；before 的金额组为第 1 组，after 的金额组在最后
    function pickAmount(m, amtIdx, unitIdx) {
      if (!m) return null;
      var v = parseFloat(m[amtIdx]);
      if (!isFinite(v) || v <= 0) return null;
      if (m[unitIdx]) v *= 10000;
      return v;
    }
    // p.re 的内部捕获组个数
    var innerGroups = new RegExp(p.re.source + '|').exec('').length - 1;
    var fromBefore = pickAmount(before, 1, 2);
    var fromAfter = pickAmount(after, innerGroups + 1, innerGroups + 2);

    if (fromBefore !== null) amt = fromBefore;
    else if (fromAfter !== null) amt = fromAfter;

    goals.push({ type: 'spend', label: p.label, amount: amt });
  });

  return goals;
}

// ------------------------------ 2. 规划计算 ------------------------------
function agentBuildPlan(goals, text) {
  var month = agentMonthSummary();
  var snap = agentSessionSnapshot();
  var budget = agentBudgetStatus();

  var income = month.income || 0;
  var expense = month.expense || 0;
  var currentSurplus = month.balance || 0;

  var save = goals.filter(function (g) { return g.type === 'save'; })[0] || null;
  var spends = goals.filter(function (g) { return g.type === 'spend'; });
  var spendTotal = spends.reduce(function (s, g) { return s + g.amount; }, 0);

  // 储蓄目标所需月存额
  var needPerMonth = save && save.months > 0 ? save.amount / save.months : 0;
  var gap = needPerMonth - currentSurplus;   // 缺口>0 表示当前结余不够
  var feasible = gap <= 0;
  // 若还需覆盖消费目标，按剩余月份均摊
  var months = save ? save.months : 12;
  var spendPerMonth = months > 0 ? spendTotal / months : 0;
  var totalNeedPerMonth = needPerMonth + spendPerMonth;
  var totalGap = totalNeedPerMonth - currentSurplus;

  // 可压缩空间：弹性消费的 20% + 低使用率订阅
  var disc = agentCategoryStats().filter(function (c) {
    return ['餐饮美食', '购物消费', '娱乐休闲', '交通出行'].indexOf(c.label) > -1;
  }).reduce(function (s, c) { return s + c.value; }, 0);
  var idleSubs = (mockData.subscriptions || []).filter(function (s) { return s.usage === '低'; });
  var subSave = idleSubs.reduce(function (s, x) { return s + (x.price || 0); }, 0);
  var compressible = Math.round(disc * 0.2 + subSave);

  // 月度预算建议：收入 - 目标月存 - 消费目标月摊
  var suggestedBudget = Math.max(1000, Math.round((income - totalNeedPerMonth) / 100) * 100);

  // 里程碑：按月推进
  var milestones = [];
  var cumulative = 0;
  var stepMonths = Math.max(1, Math.round(months / 4));
  for (var m = stepMonths; m <= months; m += stepMonths) {
    cumulative = Math.round(save ? save.amount * (m / months) : 0);
    milestones.push({
      month: m,
      date: agentDateStr(m * 30),
      amount: cumulative,
      label: '第 ' + m + ' 个月：累计存下 ¥' + agentFmtInt(cumulative)
    });
  }
  if (milestones.length && milestones[milestones.length - 1].month !== months && save) {
    milestones.push({ month: months, date: agentDateStr(months * 30), amount: save.amount, label: '第 ' + months + ' 个月：达成目标 ¥' + agentFmtInt(save.amount) });
  }

  // 建议
  var advices = [];
  if (feasible) {
    advices.push('当前月结余 ¥' + agentFmtInt(currentSurplus) + ' 已能覆盖 ¥' + agentFmtInt(needPerMonth) + ' 的目标月存额，按计划执行即可。');
  } else {
    advices.push('目标月存 ¥' + agentFmtInt(needPerMonth) + ' 高于当前月结余 ¥' + agentFmtInt(currentSurplus) +
      '，每月存在 ¥' + agentFmtInt(Math.max(0, needPerMonth - currentSurplus)) + ' 缺口，需要压缩支出或延长周期。');
  }
  if (compressible > 0) {
    advices.push('可从弹性消费与闲置订阅中释放约 ¥' + agentFmtInt(compressible) + '/月（餐饮购物娱乐压缩 20% + 取消 ' + idleSubs.length + ' 项低使用订阅）。');
  }
  if (!feasible && totalGap > 0) {
    var altMonths = Math.ceil((save ? save.amount : 0) / Math.max(1, currentSurplus + compressible));
    if (altMonths > months) {
      advices.push('若维持现有节奏（含压缩后），达成储蓄目标大约需要 ' + altMonths + ' 个月；或将目标下调至 ¥' + agentFmtInt(Math.round((currentSurplus + compressible) * months / 1000) * 1000) + '。');
    }
  }
  if (spends.length) {
    advices.push('消费目标共 ¥' + agentFmtInt(spendTotal) + '（' + spends.map(function (s) { return s.label + ' ¥' + agentFmtInt(s.amount); }).join('、') +
      '），建议设为独立专项预算，避免与日常支出混用。');
  }

  return {
    goals: goals,
    save: save,
    spends: spends,
    months: months,
    income: income,
    expense: expense,
    currentSurplus: currentSurplus,
    needPerMonth: needPerMonth,
    spendPerMonth: spendPerMonth,
    totalNeedPerMonth: totalNeedPerMonth,
    feasible: feasible,
    gap: Math.max(0, gap),
    totalGap: Math.max(0, totalGap),
    compressible: compressible,
    suggestedBudget: suggestedBudget,
    milestones: milestones,
    advices: advices,
    idleSubs: idleSubs
  };
}

// ------------------------------ 3. 渲染 ------------------------------
function plannerCardHtml(p) {
  var goalRows = p.goals.map(function (g) {
    return '<div class="planner-goal"><span class="planner-goal-type">' + (g.type === 'save' ? '🎯 储蓄目标' : '🛒 消费目标') + '</span>' +
      '<span class="planner-goal-label">' + (g.type === 'save' ? g.label : g.label + ' ¥' + agentFmtInt(g.amount)) + '</span></div>';
  }).join('');

  var planRows =
    '<div class="planner-row"><span>月收入</span><span>¥' + agentFmtInt(p.income) + '</span></div>' +
    '<div class="planner-row"><span>当前月均支出</span><span>¥' + agentFmtInt(p.expense) + '</span></div>' +
    '<div class="planner-row"><span>当前月结余</span><span>¥' + agentFmtInt(p.currentSurplus) + '</span></div>' +
    '<div class="planner-row"><span>目标月存额</span><span>¥' + agentFmtInt(p.needPerMonth) + '</span></div>' +
    (p.spendPerMonth > 0 ? '<div class="planner-row"><span>消费目标月摊</span><span>¥' + agentFmtInt(p.spendPerMonth) + '</span></div>' : '') +
    '<div class="planner-row ' + (p.feasible ? 'ok' : 'warn') + '"><span>建议月度预算</span><span>¥' + agentFmtInt(p.suggestedBudget) + '</span></div>';

  var mileHtml = p.milestones.map(function (m) {
    return '<div class="planner-mile"><div class="planner-mile-dot"></div>' +
      '<div class="planner-mile-body"><div class="planner-mile-label">' + m.label + '</div>' +
      '<div class="planner-mile-date">' + m.date + '</div></div></div>';
  }).join('');

  var adviceHtml = p.advices.map(function (a) {
    return '<div class="planner-advice">· ' + a + '</div>';
  }).join('');

  var feasBadge = p.feasible
    ? { text: '目标可达', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' }
    : { text: '需要调整', color: '#b45309', bg: '#fffbeb', border: '#fde68a' };

  var subTxt = p.idleSubs.length
    ? '可立即取消 ' + p.idleSubs.length + ' 项低使用订阅（' + p.idleSubs.map(function (s) { return s.name; }).join('、') + '），月省 ¥' + agentFmtInt(p.idleSubs.reduce(function (s, x) { return s + x.price; }, 0))
    : '';

  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 目标规划</div>' +
    '<div class="msg-bubble agent-bubble">' +
    '<div class="planner-head">我按你的目标做了一份规划</div>' +
    '<div class="planner-badge" style="color:' + feasBadge.color + ';background:' + feasBadge.bg + ';border-color:' + feasBadge.border + ';">' + feasBadge.text + '</div>' +

    '<div class="agent-sec-title">① 目标理解</div>' +
    '<div class="planner-goals">' + goalRows + '</div>' +

    '<div class="agent-sec-title">② 财务分析</div>' +
    '<div class="planner-rows">' + planRows + '</div>' +

    '<div class="agent-sec-title">③ 月度预算与储蓄计划</div>' +
    '<div class="planner-budget">每月将支出控制在 <b>¥' + agentFmtInt(p.suggestedBudget) + '</b> 以内，' +
    '发薪日自动划转 <b>¥' + agentFmtInt(p.needPerMonth) + '</b> 进专项储蓄账户。</div>' +

    '<div class="agent-sec-title">④ 里程碑</div>' +
    '<div class="planner-miles">' + mileHtml + '</div>' +

    '<div class="agent-sec-title">⑤ 可执行建议</div>' +
    '<div class="planner-advices">' + adviceHtml + '</div>' +

    (subTxt ? '<div class="planner-sub-note">' + subTxt + '</div>' : '') +
    '<div class="planner-foot">确认后，我可以直接为你创建专项预算账户并按月自动划转。</div>' +
    '</div></div></div>';
}

// ------------------------------ 4. 工具注册 ------------------------------
registerAgentTool('plan.goal', {
  label: '生成跨场景目标规划', risk: 'low',
  run: function (args) {
    var text = (args && args.text) || '';
    var goals = (args && args.goals) || agentParseGoals(text);
    if (!goals.length) {
      return { ok: false, summary: '没有识别到明确的目标，可以说得像「我想一年存 10 万，同时准备旅游和买电脑」这样具体一些' };
    }
    var p = agentBuildPlan(goals, text);
    agentSessionAnalysis('plan', '目标规划：' + goals.map(function (g) { return g.type === 'save' ? g.label : g.label + ' ¥' + agentFmtInt(g.amount); }).join(' + ') +
      '；' + (p.feasible ? '当前结余可覆盖' : '存在月缺口 ¥' + agentFmtInt(p.totalGap)), { feasible: p.feasible });
    goals.forEach(function (g) { agentSessionDemand(g.type === 'save' ? 'goal' : 'purchase', g.type === 'save' ? g.label : ('计划' + g.label + ' ¥' + agentFmtInt(g.amount))); });
    AGENT_SESSION.lastFocus = '目标规划';

    return {
      summary: '已生成规划：' + goals.map(function (g) { return g.type === 'save' ? g.label : g.label + ' ¥' + agentFmtInt(g.amount); }).join('、') +
        '；建议月预算 ¥' + agentFmtInt(p.suggestedBudget) + '，月存 ¥' + agentFmtInt(p.needPerMonth) +
        (p.feasible ? '，目标可达' : '，存在缺口 ¥' + agentFmtInt(p.totalGap)),
      data: p
    };
  }
});

// 供对话入口渲染
function renderAgentPlanGoals(text) {
  var goals = agentParseGoals(text);
  if (!goals.length) return null;
  var p = agentBuildPlan(goals, text);
  appendMessage(plannerCardHtml(p));
  scrollToBottom();
  // 落地选项
  var actions = [
    { label: '创建「' + (p.save ? '储蓄目标' : '专项预算') + '」¥' + agentFmtInt(p.save ? p.save.amount : p.suggestedBudget) + ' 专项账户', tool: 'budget.createFund',
      args: { name: (p.save ? p.save.label : '目标规划') + '专项预算', amount: p.save ? p.save.amount : p.suggestedBudget, deadline: agentDateStr(p.months * 30) }, amount: 0 }
  ];
  p.spends.forEach(function (s) {
    actions.push({ label: '创建「' + s.label + '」¥' + agentFmtInt(s.amount) + ' 专项预算', tool: 'budget.createFund',
      args: { name: s.label + '专项预算', amount: s.amount, deadline: agentDateStr(p.months * 30) }, amount: 0 });
  });
  if (p.idleSubs.length) {
    actions.push(/** @type {any} */ ({
      label: '取消 ' + p.idleSubs.length + ' 项低使用订阅，月省 ¥' + agentFmtInt(p.idleSubs.reduce(function (s, x) { return s + x.price; }, 0)),
      tool: 'subscription.cancel',
      args: { id: p.idleSubs[0].id }
    }));
  }
  agentRenderFollowUpsExternal(actions);
  return p;
}

// 把"可落地动作"渲染成计划卡（复用规则层确认闭环）
function agentRenderFollowUpsExternal(actions) {
  if (!actions || !actions.length) return;
  runAgentPlan({
    title: '正在把规划落地为可执行动作',
    subtitle: '你可以逐项确认，也可以先只看建议',
    steps: [
      { label: '核对规划与预算约束', run: function () { return { summary: '已校验月度预算与现金流约束' }; } },
      { label: '生成专项预算与订阅优化清单', run: function () { return { summary: '共 ' + actions.length + ' 项待确认动作' }; } }
    ],
    confirm: {
      title: '确认后我会按规划建立专项预算',
      doneTitle: '规划已落地',
      footnote: '专项预算与日常预算相互独立，目标完成后剩余额度会自动回补。',
      actions: actions
    }
  });
}
