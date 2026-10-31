// ==========================================================================
//  AI Banking Agent · 消费决策分析层（TypeScript 源码）
//  编译产物：js/agent/decision.js（经典脚本，无 import/export）
//  输出：是否建议购买 / 是否建议分期 / 推荐期数 / 风险提示
// ==========================================================================

// —— 运行时由其它脚本提供的全局 ——
declare var AGENT_SESSION: any;
declare function agentSessionSnapshot(): any;
declare function agentMonthSummary(): any;
declare function agentBudgetStatus(): any;
declare function agentFmt(v: any, digits?: number): string;
declare function agentFmtInt(v: any, digits?: number): string;
declare function agentSessionAnalysis(kind: string, summary: string, extra?: any): void;
declare function agentSessionFact(key: string, text: string): void;
declare function agentSessionDemand(type: string, text: string): void;
declare function registerAgentTool(name: string, def: any): void;

interface InstallmentRate {
  rate: number;
  label: string;
}

/** 常见分期费率（演示口径） */
var DECISION_INSTALLMENT_RATES: Record<number, InstallmentRate> = {
  3: { rate: 0.0075, label: '3期' },
  6: { rate: 0.0070, label: '6期' },
  12: { rate: 0.0066, label: '12期' },
  24: { rate: 0.0063, label: '24期' }
};

interface PurchaseIntent {
  kind: string;
  label: string;
  necessity: string;
  note: string;
}

interface PurchaseDecision {
  amount: number;
  intent: PurchaseIntent;
  score: number;
  advice: string;
  tone: string;
  conclusion: string;
  facts: {
    available: number; income: number; surplus: number;
    incomeRatio: number; surplusRatio: number; budgetRemain: number;
    cardLimit: number; cardUsed: number; cardAvailable: number;
    cardAfterRatio: number; cashCoverable: boolean;
  };
  installment: {
    needed: boolean; advice: string; months: number;
    monthlyPay: number; feeCost: number; totalCost: number;
  };
  risks: string[];
}

/** 用户常见大额消费的"必要性/刚性"判断 */
function decisionIntentClass(text: string): PurchaseIntent {
  var t = String(text || '');
  if (/(电脑|笔记本|手机|平板|显示器|数码|相机|镜头|设备|生产力|办公)/.test(t)) {
    return { kind: 'productivity', label: '数码生产力工具', necessity: '中高', note: '属于可提升生产力/使用价值的耐用品，若能长期使用，可视为合理支出。' };
  }
  if (/(家电|冰箱|洗衣机|空调|家具|床|沙发|装修|搬)/.test(t)) {
    return { kind: 'living', label: '生活刚需大件', necessity: '高', note: '属于家庭刚需支出，优先级较高，建议优先用自有资金支付。' };
  }
  if (/(旅游|旅行|度假|演唱会|奢侈品|包|表|游戏|首饰)/.test(t)) {
    return { kind: 'leisure', label: '体验/非刚需消费', necessity: '低', note: '属于非刚需弹性消费，建议在保证储蓄计划不受影响的前提下进行。' };
  }
  return { kind: 'general', label: '一般消费', necessity: '中', note: '建议结合当前现金流与储蓄目标判断优先级。' };
}

// ------------------------------ 1. 核心分析 ------------------------------
function agentPurchaseDecision(amount: number, opts?: { text?: string; months?: number }): PurchaseDecision {
  var amt = Number(amount) || 0;
  var o = opts || {};
  var text = o.text || '';
  var snap = agentSessionSnapshot();
  var month = agentMonthSummary();
  var budget = agentBudgetStatus();
  var intent = decisionIntentClass(text);

  var income = month.income || 0;
  var surplus = month.balance || 0;

  var incomeRatio = income > 0 ? amt / income : 99;
  var surplusRatio = surplus > 0 ? amt / surplus : 99;
  var cashCover = snap.available > 0 ? Math.min(1, snap.available / amt) : 0;
  var cashCoverable = snap.available >= amt;
  var cardAfter = snap.cardLimit > 0 ? (snap.cardUsed + amt) / snap.cardLimit : 0;

  var buyScore = 0;
  if (cashCoverable) buyScore += 40;
  else buyScore += Math.round(cashCover * 25);
  if (incomeRatio <= 0.3) buyScore += 25; else if (incomeRatio <= 0.5) buyScore += 15; else if (incomeRatio <= 0.8) buyScore += 5;
  if (surplusRatio <= 1) buyScore += 25; else if (surplusRatio <= 2) buyScore += 12;
  if (budget.remain > amt) buyScore += 10; else if (budget.remain > 0) buyScore += 4;
  buyScore = Math.max(0, Math.min(100, buyScore));

  var buyAdvice: string, buyTone: string;
  if (buyScore >= 70) { buyAdvice = '建议购买'; buyTone = 'go'; }
  else if (buyScore >= 45) { buyAdvice = '可以购买，但建议调整付款方式'; buyTone = 'caution'; }
  else { buyAdvice = '建议暂缓购买'; buyTone = 'hold'; }

  var needInstallment = !cashCoverable || snap.available - amt < month.expense * 0.5 || incomeRatio > 0.5;
  var installmentAdvice: string, months = 0, monthlyPay = 0, totalCost = 0, feeCost = 0;

  if (needInstallment && snap.cardAvailable >= amt) {
    var cap = Math.max(300, Math.min(surplus * 0.35, income * 0.15));
    var candidates = [3, 6, 12, 24];
    for (var i = 0; i < candidates.length; i++) {
      var m = candidates[i];
      var pay = amt / m;
      if (pay <= cap) { months = m; break; }
    }
    if (!months) months = 24;
    var r = DECISION_INSTALLMENT_RATES[months] || DECISION_INSTALLMENT_RATES[12];
    monthlyPay = amt / months;
    feeCost = amt * r.rate * months;
    totalCost = amt + feeCost;
    installmentAdvice = '建议分期 ' + months + ' 期';
  } else if (needInstallment && snap.cardAvailable < amt) {
    installmentAdvice = '不建议分期（信用额度不足）';
  } else {
    installmentAdvice = '无需分期，建议一次性支付';
  }

  var risks: string[] = [];
  if (!cashCoverable) risks.push('可用余额 ¥' + agentFmt(snap.available) + ' 不足以覆盖本次支出，直接支付会击穿余额（系统会拦截）。');
  if (cardAfter > 0.6) risks.push('若使用信用卡，额度使用率将升至 ' + (cardAfter * 100).toFixed(0) + '%，超过 60% 会影响征信评分与后续提额。');
  if (incomeRatio > 0.5) risks.push('该支出占月收入 ' + (incomeRatio * 100).toFixed(0) + '%，超过 50% 属于大额消费，会明显压缩当月现金流。');
  if (surplusRatio > 1) risks.push('该支出相当于 ' + surplusRatio.toFixed(1) + ' 个月的结余，会直接挤占储蓄目标。');
  if (!risks.length) risks.push('当前现金流可覆盖，暂无显著风险；仍建议保留 3 个月生活费作为应急金。');

  var conclusion = '';
  if (buyTone === 'go') {
    conclusion = '根据你当前的月结余情况，购买 ¥' + agentFmtInt(amt) + ' 的' + intent.label + '不会影响正常储蓄计划。';
  } else if (buyTone === 'caution') {
    conclusion = '可以购买，但一次性支付会明显压缩本月现金流，建议用分期或调低金额来平滑支出。';
  } else {
    conclusion = '建议延迟购买：目前可支配资金不足以在不影响储蓄的前提下覆盖这笔支出。';
  }

  return {
    amount: amt,
    intent: intent,
    score: buyScore,
    advice: buyAdvice,
    tone: buyTone,
    conclusion: conclusion,
    facts: {
      available: snap.available,
      income: income,
      surplus: surplus,
      incomeRatio: incomeRatio,
      surplusRatio: surplusRatio,
      budgetRemain: budget.remain,
      cardLimit: snap.cardLimit,
      cardUsed: snap.cardUsed,
      cardAvailable: snap.cardAvailable,
      cardAfterRatio: cardAfter,
      cashCoverable: cashCoverable
    },
    installment: {
      needed: needInstallment,
      advice: installmentAdvice,
      months: months,
      monthlyPay: monthlyPay,
      feeCost: feeCost,
      totalCost: totalCost
    },
    risks: risks
  };
}

// ------------------------------ 2. 渲染 ------------------------------
function decisionCardHtml(d: PurchaseDecision): string {
  var toneColor = d.tone === 'go' ? ['#15803d', '#f0fdf4', '#bbf7d0']
    : d.tone === 'caution' ? ['#b45309', '#fffbeb', '#fde68a']
      : ['#b91c1c', '#fef2f2', '#fecaca'];

  var f = d.facts;
  var rows =
    '<div class="decision-row"><span>消费项目</span><span>' + d.intent.label + '（必要度 ' + d.intent.necessity + '）</span></div>' +
    '<div class="decision-row"><span>本次金额</span><span>¥' + agentFmt(d.amount) + '</span></div>' +
    '<div class="decision-row"><span>可用余额</span><span>¥' + agentFmt(f.available) + '</span></div>' +
    '<div class="decision-row"><span>月收入 / 月结余</span><span>¥' + agentFmtInt(f.income) + ' / ¥' + agentFmtInt(f.surplus) + '</span></div>' +
    '<div class="decision-row"><span>占月收入</span><span>' + (f.incomeRatio * 100).toFixed(0) + '%</span></div>' +
    '<div class="decision-row"><span>信用卡额度</span><span>已用 ¥' + agentFmtInt(f.cardUsed) + ' / 总额 ¥' + agentFmtInt(f.cardLimit) + '（' + (f.cardUsed / Math.max(1, f.cardLimit) * 100).toFixed(0) + '%）</span></div>';

  var instHtml = '';
  if (d.installment.needed && d.installment.months > 0) {
    instHtml =
      '<div class="decision-inst">' +
      '<div class="decision-inst-head">' + d.installment.advice + '</div>' +
      '<div class="decision-inst-rows">' +
      '<div class="decision-row"><span>每期月供</span><span>¥' + agentFmt(d.installment.monthlyPay) + ' × ' + d.installment.months + ' 期</span></div>' +
      '<div class="decision-row"><span>手续费合计</span><span>约 ¥' + agentFmt(d.installment.feeCost) + '</span></div>' +
      '<div class="decision-row"><span>还款总额</span><span>约 ¥' + agentFmt(d.installment.totalCost) + '</span></div>' +
      '</div></div>';
  } else {
    instHtml = '<div class="decision-inst"><div class="decision-inst-head">' + d.installment.advice + '</div>' +
      '<div class="decision-inst-note">一次性支付不会挤压你的现金流，分期反而额外产生手续费。</div></div>';
  }

  var riskHtml = d.risks.map(function (r) {
    return '<div class="decision-risk"><span class="decision-risk-dot"></span>' + r + '</div>';
  }).join('');

  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 消费决策分析</div>' +
    '<div class="msg-bubble agent-bubble">' +
    '<div class="decision-head">这笔消费，我替你算过了</div>' +
    '<div class="decision-verdict" style="color:' + toneColor[0] + ';background:' + toneColor[1] + ';border-color:' + toneColor[2] + ';">' +
    '<span class="decision-verdict-advice">' + d.advice + '</span>' +
    '<span class="decision-verdict-score">决策评分 ' + d.score + '/100</span>' +
    '</div>' +
    '<div class="decision-conclusion">' + d.conclusion + '</div>' +
    '<div class="decision-rows">' + rows + '</div>' +
    instHtml +
    '<div class="decision-risk-title">风险提示</div>' +
    '<div class="decision-risks">' + riskHtml + '</div>' +
    '</div></div></div>';
}

// ------------------------------ 3. 工具注册 ------------------------------
registerAgentTool('decision.purchaseAdvice', {
  label: '分析购买可行性', risk: 'low',
  run: function (args: any) {
    var amount = Number(args && args.amount) || 0;
    if (amount <= 0) return { ok: false, summary: '请提供具体的消费金额，例如「我想买 8000 元的电脑」' };
    var text = (args && args.text) || (args && args.item) || '';
    var d = agentPurchaseDecision(amount, { text: text });

    agentSessionAnalysis('decision', '对 ¥' + agentFmtInt(amount) + ' 的' + d.intent.label + '：' + d.advice +
      (d.installment.needed ? '，' + d.installment.advice : '，无需分期'), { amount: amount, tone: d.tone });
    agentSessionFact('decisionAmount', '本次评估消费金额 ¥' + agentFmtInt(amount));
    if (text) agentSessionDemand('purchase', '考虑购买：' + text);
    AGENT_SESSION.lastFocus = '消费决策';

    return {
      summary: d.advice + '（评分 ' + d.score + '/100）。' + d.conclusion +
        (d.installment.needed ? ' ' + d.installment.advice + '，月供约 ¥' + agentFmt(d.installment.monthlyPay) + '。' : ' ' + d.installment.advice + '。'),
      data: d
    };
  }
});

registerAgentTool('decision.installmentAdvice', {
  label: '评估分期方案', risk: 'low',
  run: function (args: any) {
    var amount = Number(args && args.amount) || 0;
    if (amount <= 0) return { ok: false, summary: '请提供需要分期的金额' };
    var d = agentPurchaseDecision(amount, { text: (args && args.text) || '' });
    var plans = [3, 6, 12, 24].map(function (m) {
      var r = DECISION_INSTALLMENT_RATES[m];
      var fee = amount * r.rate * m;
      return { months: m, monthlyPay: amount / m, fee: fee, total: amount + fee };
    });
    agentSessionAnalysis('installment', '对 ¥' + agentFmtInt(amount) + ' 的分期方案：' + d.installment.advice +
      (d.installment.months ? '（月供 ¥' + agentFmt(d.installment.monthlyPay) + '）' : ''));
    return {
      summary: d.installment.advice + (d.installment.months ? '：月供 ¥' + agentFmt(d.installment.monthlyPay) +
        ' × ' + d.installment.months + ' 期，手续费约 ¥' + agentFmt(d.installment.feeCost) : '') +
        '。' + d.conclusion,
      data: { decision: d, plans: plans }
    };
  }
});
