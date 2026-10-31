// ==========================================================================
//  AI Banking Agent · 金融场景推理层（TypeScript 源码）
//  编译产物：js/agent/scenario.js（经典脚本，无 import/export）
//  四要素：金额 / 期限 / 流动性需求 / 风险偏好 → 分层配置建议
// ==========================================================================

// —— 运行时由其它脚本提供的全局 ——
declare var AGENT_MEMORY: any;
declare function agentParseAmount(text: string): number;
declare function agentSessionSnapshot(): any;
declare function agentFmtInt(v: any, digits?: number): string;
declare function agentSessionAnalysis(kind: string, summary: string, extra?: any): void;
declare function agentSessionDemand(type: string, text: string): void;
declare function agentCtxPushTopic(type: string, summary?: string, extra?: any): any;
declare function appendMessage(html: string): void;
declare function scrollToBottom(): void;
declare function addToConversation(role: string, text: string, meta?: any): void;
declare function registerAgentTool(name: string, def: any): void;

interface Horizon {
  id: string;
  label: string;
  months: number;
  keys: string[];
}

interface Purpose {
  id: string;
  label: string;
  allowEquity: boolean | null;
}

interface RiskPref { level: string; rank: number }

interface Layer {
  name: string;
  ratio: number;
  amount: number;
  why: string;
  kbId: string;
}

interface ScenarioContext {
  amount: number;
  horizon: any;
  purpose: Purpose;
  risk: RiskPref;
  layers: Layer[];
  risks: string[];
  actions: Array<{ icon: string; text: string }>;
  footNote: string;
}

// ------------------------------ 0. 场景要素解析 ------------------------------
var SCENARIO_HORIZONS: Horizon[] = [
  { id: 'instant', label: '随时可能用', months: 0.25, keys: ['随时', '马上', '立刻', '应急', '备用金', '不确定什么时候'] },
  { id: 'short', label: '1 个月内', months: 1, keys: ['一个月内', '1个月内', '下个月要用', '这个月要用', '月底用'] },
  { id: 'mid', label: '1~3 个月', months: 3, keys: ['两三个月', '2个月', '3个月', '一个季度', '三个月'] },
  { id: 'half', label: '半年左右', months: 6, keys: ['半年', '6个月', '六个月', '半年后'] },
  { id: 'year', label: '1 年左右', months: 12, keys: ['一年', '1年', '12个月', '一年后', '一年内'] },
  { id: 'long', label: '1 年以上', months: 36, keys: ['一年以上', '两年', '2年', '三年', '3年', '长期', '五年'] }
];

function agentScenarioHorizon(text: string): Horizon | null {
  var t = String(text || '');
  for (var i = 0; i < SCENARIO_HORIZONS.length; i++) {
    var h = SCENARIO_HORIZONS[i];
    for (var j = 0; j < h.keys.length; j++) {
      if (t.indexOf(h.keys[j]) > -1) return h;
    }
  }
  return null;
}

/** 金额解析（复用 agentParseAmount；返回 0 表示未指定） */
function agentScenarioAmount(text: string): number {
  var amt = (typeof agentParseAmount === 'function') ? agentParseAmount(text) : 0;
  return amt > 0 ? amt : 0;
}

/** 风险偏好（已测评取测评，否则默认稳健） */
function agentScenarioRiskPref(): RiskPref {
  var lvl = (AGENT_MEMORY && AGENT_MEMORY.profile && AGENT_MEMORY.profile.riskLevel) || 'C2 稳健型';
  var rank = /C5|进取|激进/.test(lvl) ? 5 : /C4|成长/.test(lvl) ? 4 : /C3|平衡/.test(lvl) ? 3 : /C2|稳健/.test(lvl) ? 2 : 1;
  return { level: lvl, rank: rank };
}

/** 用途识别（决定是否允许权益类） */
function agentScenarioPurpose(text: string): Purpose {
  var t = String(text || '');
  if (/(应急|备用金|急用|看病|医疗|突发)/.test(t)) return { id: 'reserve', label: '应急备用金', allowEquity: false };
  if (/(首付|买房|购房|结婚|彩礼)/.test(t)) return { id: 'bigspend', label: '购房/婚嫁等大额支出', allowEquity: false };
  if (/(教育|学费|留学|孩子)/.test(t)) return { id: 'edu', label: '教育支出', allowEquity: false };
  if (/(养老|退休)/.test(t)) return { id: 'retire', label: '养老储备', allowEquity: true };
  if (/(增值|多赚|收益|投资|理财|保值|赚点)/.test(t)) return { id: 'growth', label: '保值增值', allowEquity: true };
  return { id: 'general', label: '一般资金安排', allowEquity: null };
}

// ------------------------------ 1. 场景判断 ------------------------------
function agentIsScenarioQuery(text: string): boolean {
  var t = String(text || '');
  var hasMoney = /(\d+(?:\.\d+)?\s*(?:万|w|W|元|块))|闲钱|闲余|余钱|手上有|有一笔/.test(t);
  var hasHorizon = !!agentScenarioHorizon(t);
  var asksPlan = /(怎么安排|如何安排|怎么打理|怎么配置|应该如何|怎么办|怎么存|放哪|放哪里|怎么用|建议|划算|合适|好不好)/.test(t);
  var asksInvest = /(投资|理财|买什么|配置|增值|收益)/.test(t);
  if (hasHorizon && asksPlan && (hasMoney || asksInvest)) return true;
  if (hasMoney && /\s*闲钱|闲余|余钱/.test(t) && (asksPlan || asksInvest)) return true;
  return false;
}

// ------------------------------ 2. 配置方案生成 ------------------------------
function agentScenarioAllocate(amount: number, horizon: Horizon, purpose: Purpose, risk: RiskPref): Layer[] {
  var m = horizon.months;
  var layers: Layer[] = [];

  function pct(p: number) { return Math.round(amount * p / 100); }

  if (m <= 1) {
    layers = [
      { name: '货币基金 / 现金管理类', ratio: 70, amount: pct(70), why: '随时可取，当日或次日到账', kbId: 'money_fund' },
      { name: '活期存款', ratio: 30, amount: pct(30), why: '即时可用，应对临时支出', kbId: 'deposit_demand' }
    ];
  } else if (m <= 3) {
    layers = [
      { name: '货币基金 / 现金管理类', ratio: 60, amount: pct(60), why: '保留灵活性，兼顾收益', kbId: 'money_fund' },
      { name: '短期银行理财（R1~R2，开放式）', ratio: 40, amount: pct(40), why: '比货基收益略高，仍可较快赎回', kbId: 'bank_wmp' }
    ];
  } else if (m <= 6) {
    layers = [
      { name: '货币基金 / 现金管理类', ratio: 30, amount: pct(30), why: '留一部分随时能动', kbId: 'money_fund' },
      { name: '3~6 个月定期存款', ratio: 40, amount: pct(40), why: '期限正好匹配，收益锁定', kbId: 'deposit_time' },
      { name: '短债基金 / 固收类理财', ratio: 30, amount: pct(30), why: '波动小，收益优于定存', kbId: 'bond' }
    ];
  } else if (m <= 12) {
    layers = [
      { name: '货币基金 / 现金管理类', ratio: 20, amount: pct(20), why: '应急部分', kbId: 'money_fund' },
      { name: '1 年期定期存款', ratio: 40, amount: pct(40), why: '期限匹配，收益确定', kbId: 'deposit_time' },
      { name: '固收类理财 / 债券基金', ratio: 40, amount: pct(40), why: '增厚收益，波动可控', kbId: 'bond' }
    ];
  } else {
    var equityRatio = purpose.allowEquity === false ? 0 : (risk.rank >= 4 ? 40 : risk.rank >= 3 ? 25 : 10);
    var fixedPool = 100 - equityRatio;
    layers = [
      { name: '货币基金 / 现金管理类', ratio: Math.round(fixedPool * 0.2), amount: pct(fixedPool * 0.2), why: '流动性缓冲', kbId: 'money_fund' },
      { name: '定期存款 / 储蓄型产品', ratio: Math.round(fixedPool * 0.4), amount: pct(fixedPool * 0.4), why: '压舱石，锁定收益', kbId: 'deposit_time' },
      { name: '固收类理财 / 债券基金', ratio: Math.round(fixedPool * 0.4), amount: pct(fixedPool * 0.4), why: '稳健增厚', kbId: 'bond' }
    ];
    if (equityRatio > 0) {
      layers.push({ name: '指数基金定投（权益类）', ratio: equityRatio, amount: pct(equityRatio), why: '长期摊薄波动，博取超额收益', kbId: 'fund' });
    }
  }

  // 修正四舍五入导致的总额偏差
  var sum = layers.reduce(function (s, l) { return s + l.amount; }, 0);
  if (sum !== amount && layers.length) layers[0].amount += (amount - sum);

  return layers;
}

/** 场景风险提示 */
function agentScenarioRisks(amount: number, horizon: Horizon, purpose: Purpose, risk: RiskPref, layers: Layer[]): string[] {
  var risks: string[] = [];
  var snap = agentSessionSnapshot();

  if (amount >= snap.available * 0.8 && snap.available > 0) {
    risks.push('这笔钱占你可动用余额的 ' + Math.round(amount / snap.available * 100) + '%，全部投出去会削弱应急能力，建议至少留 3~6 个月生活费在活期/货基。');
  }
  if (horizon.months <= 3 && layers.some(function (l) { return /权益|指数|股票/.test(l.name); })) {
    risks.push('期限在 3 个月以内，不应配置权益类资产 —— 短期波动可能让你在需要用钱时被迫亏损卖出。');
  }
  if (purpose.allowEquity === false && risk.rank >= 4) {
    risks.push('你的风险偏好偏进取，但这笔钱的用途（' + purpose.label + '）容错率低，建议按用途而非偏好来定配置。');
  }
  if (horizon.months >= 36 && layers.every(function (l) { return !/权益|指数/.test(l.name); })) {
    risks.push('期限 1 年以上却全配固收，长期可能跑不赢通胀，可考虑用不超过 20% 的仓位做指数定投。');
  }
  return risks;
}

// ------------------------------ 3. 渲染 ------------------------------
function agentScenarioCardHtml(ctx: ScenarioContext): string {
  var lay = ctx.layers;
  var bars = lay.map(function (l) {
    return '<div class="sc-layer">' +
      '<div class="sc-layer-head"><span class="sc-layer-name">' + l.name + '</span>' +
      '<span class="sc-layer-amt">¥' + agentFmtInt(l.amount) + '<b>' + l.ratio + '%</b></span></div>' +
      '<div class="sc-layer-bar"><i style="width:' + l.ratio + '%;"></i></div>' +
      '<div class="sc-layer-why">' + l.why + '</div>' +
      '</div>';
  }).join('');

  var riskHtml = ctx.risks.length
    ? '<div class="agent-sec-title">需要注意</div><div class="sc-risks">' +
      ctx.risks.map(function (r) { return '<div class="sc-risk">· ' + r + '</div>'; }).join('') + '</div>'
    : '';

  var actions = ctx.actions.length
    ? '<div class="agent-sec-title">可以直接落地的动作</div><div class="sc-actions">' +
      ctx.actions.map(function (a) { return '<div class="sc-action"><span class="sc-action-ico">' + a.icon + '</span><span>' + a.text + '</span></div>'; }).join('') + '</div>'
    : '';

  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 资金安排建议</div>' +
    '<div class="msg-bubble agent-bubble">' +
    '<div class="sc-head">我按"这笔钱什么时候用"来安排</div>' +
    '<div class="agent-sec-title">① 我理解的你的情况</div>' +
    '<div class="sc-facts">' +
    '<div class="sc-fact"><span>资金金额</span><b>¥' + agentFmtInt(ctx.amount) + '</b></div>' +
    '<div class="sc-fact"><span>使用期限</span><b>' + ctx.horizon.label + '</b></div>' +
    '<div class="sc-fact"><span>资金用途</span><b>' + ctx.purpose.label + '</b></div>' +
    '<div class="sc-fact"><span>你的风险偏好</span><b>' + ctx.risk.level + '</b></div>' +
    '</div>' +
    '<div class="agent-sec-title">② 配置建议</div>' +
    '<div class="sc-layers">' + bars + '</div>' +
    '<div class="agent-sec-title">③ 为什么这样分</div>' +
    '<div class="sc-reason">核心原则是<b>期限匹配</b>：' + ctx.horizon.label + '要用的钱，就只放' + (ctx.horizon.months <= 6 ? '与期限相当的稳健工具，不碰权益类' : '期限相当的产品，并在长期部分适度加入权益') +
    '。在你能承受的波动范围内，兼顾收益与随时可用。</div>' +
    riskHtml + actions +
    '<div class="sc-foot">' + ctx.footNote + '</div>' +
    '</div></div></div>';
}

// ------------------------------ 4. 主入口 ------------------------------
async function agentScenarioAdvice(text: string, opts?: { fromKB?: boolean }): Promise<boolean> {
  opts = opts || {};
  var t = String(text || '');

  var amount = agentScenarioAmount(t);
  var horizon = agentScenarioHorizon(t);
  var purpose = agentScenarioPurpose(t);
  var risk = agentScenarioRiskPref();
  var snap = agentSessionSnapshot();

  var amountFromBalance = false;
  if (amount <= 0) {
    if (snap.available > 0) { amount = Math.round(snap.available); amountFromBalance = true; }
    else return false;
  }

  // 期限未指定 → 反问（最关键的一维，不能猜）
  if (!horizon) {
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
      '<div class="msg-name">智能金融助手 · 需要确认</div>' +
      '<div class="msg-bubble agent-bubble">' +
      '<div class="sc-head">安排之前，我需要先确认这笔钱什么时候用</div>' +
      '<div class="sc-reason">资金<b>期限</b>是决定配置的第一要素：同样是 ¥' + agentFmtInt(amount) +
      '，随时要用和一年不用，该放的工具完全不同。</div>' +
      '<div class="kb-hook-quick">' +
      '<span class="kb-quick" onclick="agentKBQuickAsk(\'有' + agentFmtInt(amount) + '元，1个月内可能要用\')">1 个月内可能要用</span>' +
      '<span class="kb-quick" onclick="agentKBQuickAsk(\'有' + agentFmtInt(amount) + '元，半年内不用\')">半年内不用</span>' +
      '<span class="kb-quick" onclick="agentKBQuickAsk(\'有' + agentFmtInt(amount) + '元，一年以上不用\')">一年以上不用</span>' +
      '</div>' +
      '</div></div></div>');
    scrollToBottom();
    addToConversation('assistant', '需要确认资金期限', null);
    return true;
  }

  var layers = agentScenarioAllocate(amount, horizon, purpose, risk);
  var risks = agentScenarioRisks(amount, horizon, purpose, risk, layers);

  var actions: Array<{ icon: string; text: string }> = [
    { icon: '🎯', text: '把 ¥' + agentFmtInt(layers[0].amount) + ' 转到货币基金（随时可取）' },
    { icon: '🔒', text: '把 ¥' + agentFmtInt(layers.slice(1).reduce(function (s, l) { return s + l.amount; }, 0)) + ' 配置到与期限匹配的稳健产品' }
  ];
  if (amountFromBalance) {
    actions.unshift({ icon: '💡', text: '你没说具体金额，我先按你可用余额 ¥' + agentFmtInt(snap.available) + ' 来算，金额不对可以直接告诉我' });
  }

  appendMessage(agentScenarioCardHtml({
    amount: amount, horizon: horizon, purpose: purpose, risk: risk,
    layers: layers, risks: risks, actions: actions,
    footNote: opts.fromKB
      ? '如果你想按这个方案执行，告诉我金额，我可以帮你生成对应的转账或申购计划。'
      : '要不要我按这个方案生成一份执行计划？确认后我可以帮你逐步落地。'
  }));
  scrollToBottom();

  agentSessionAnalysis('scenario', '资金安排：¥' + agentFmtInt(amount) + '，期限 ' + horizon.label + '，用途 ' + purpose.label +
    '，建议 ' + layers.map(function (l) { return l.name + ' ' + l.ratio + '%'; }).join(' / '));
  agentSessionDemand('horizon', '资金期限：' + horizon.label);
  agentCtxPushTopic('scenario', '资金安排：¥' + agentFmtInt(amount) + ' / ' + horizon.label);
  addToConversation('assistant', '已输出资金安排建议', null);
  return true;
}

// ------------------------------ 5. 工具注册 ------------------------------
registerAgentTool('scenario.allocate', {
  label: '生成资金安排建议', risk: 'low',
  run: function (args: any) {
    var t = (args && args.text) || '';
    var amount = agentScenarioAmount(t);
    var horizon = agentScenarioHorizon(t);
    if (!horizon) return { ok: false, summary: '需要先知道这笔钱多久不用，才能给出配置建议' };
    var purpose = agentScenarioPurpose(t);
    var risk = agentScenarioRiskPref();
    var layers = agentScenarioAllocate(amount, horizon, purpose, risk);
    return {
      summary: '按期限 ' + horizon.label + '、用途 ' + purpose.label + '、风险偏好 ' + risk.level +
        ' 给出配置：' + layers.map(function (l) { return l.name + ' ' + l.ratio + '%'; }).join(' / '),
      data: { amount: amount, horizon: horizon.label, purpose: purpose.label, risk: risk.level, layers: layers }
    };
  }
});
