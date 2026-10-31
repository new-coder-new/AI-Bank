// ==========================================================================
//  AI Banking Agent · 金融风险识别层（TypeScript 源码）
//  编译产物：js/agent/riskdetect.js（经典脚本，无 import/export）
//  识别：高杠杆 / 信用资金投资 / 过度负债 / 集中度 / 异常通道 / 资金压力
//  处置三段式：① 说明危害 ② 拒绝执行 ③ 给替代建议
// ==========================================================================

// —— 运行时由其它脚本提供的全局 ——
declare var mockData: any;
declare var AGENT_MEMORY: any;
declare function agentParseAmount(text: string): number;
declare function agentSessionSnapshot(): any;
declare function agentMonthSummary(): any;
declare function agentFmt(v: any): string;
declare function agentFmtInt(v: any): string;
declare function agentSessionAnalysis(kind: string, summary: string, extra?: any): void;
declare function agentSessionDemand(type: string, text: string): void;
declare function saveAgentMemory(): void;
declare function registerAgentTool(name: string, def: any): void;

interface RiskHit {
  code: string;
  level: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  harm: string;
  evidence: string;
  alternative: string[];
}

interface RiskDetectResult {
  hits: RiskHit[];
  level: string;
  blocked: boolean;
  top: RiskHit | null;
}

var RISK_SEVERITY: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

// ------------------------------ 0. 识别规则 ------------------------------
function riskDetectCreditToInvest(text: string): RiskHit | null {
  var credit = /(信用卡|信用额度|额度|花呗|借呗|白条|消费贷|信用贷)/.test(text);
  var monetize = /(套现|套出来|刷出来|取出来|提现|全部刷|刷光|刷满|TX)/.test(text);
  var invest = /(炒股|股票|基金|理财|投资|买股|买入|申购|打新|币|虚拟货币|加密)/.test(text);
  if (credit && invest && (monetize || /投资|炒股/.test(text))) {
    return {
      code: 'credit_to_invest', level: 'critical',
      title: '信用资金投资（套现投资）',
      harm: '信用卡套现属于违规用卡行为，且用借来的钱投资会同时叠加「利息成本 + 投资亏损」双重风险；一旦投资回撤，你需要在还款日前用自有资金补上，极易形成债务螺旋。',
      evidence: '识别到「信用额度/信用卡」与「套现/提现」及「投资/炒股」的组合表述',
      alternative: [
        '改用自有可投资资金，并按你的风险等级（' + ((AGENT_MEMORY && AGENT_MEMORY.profile.riskLevel) || '稳健型') + '）做风险匹配的投资',
        '如需放大收益，优先考虑定投方式，用时间摊薄波动，而不是加杠杆',
        '先补足 3~6 个月应急金，再谈权益类投资'
      ]
    };
  }
  return null;
}

function riskDetectHighLeverage(text: string): RiskHit | null {
  var borrow = /(借钱|贷款|借一笔|借款|融资|配资|杠杆|加杠杆|抵押|网贷)/.test(text);
  var invest = /(炒股|股票|基金|投资|买币|虚拟货币|加密货币|期货|合约|炒币)/.test(text);
  if (borrow && invest) {
    return {
      code: 'high_leverage', level: 'high',
      title: '高杠杆投资（借钱投资）',
      harm: '借入资金通常有固定还款义务，而投资收益并不确定；杠杆会等比例放大亏损，行情不利时可能出现"投资亏损 + 月供压力"同时发生。',
      evidence: '识别到「借款/贷款/杠杆」与「投资/炒股」的组合表述',
      alternative: [
        '用自有闲置资金投资，避免债务与投资叠加',
        '若资金不足，先通过储蓄计划积累本金（可按月结余的 40% 定投）',
        '了解清楚可投资金额后再决定配置比例'
      ]
    };
  }
  return null;
}

function riskDetectOverDebt(text: string, amount?: number): RiskHit | null {
  var amt = Number(amount) || agentParseAmount(text) || 0;
  if (amt <= 0) return null;
  var paydown = /(还|还款|还清|提前还|结清)/.test(text);
  if (paydown) return null;   // 还款是正向行为，不拦

  var snap = agentSessionSnapshot();
  var month = agentMonthSummary();
  var income = month.income || 0;
  var loan = (mockData.userProfile && mockData.userProfile.loan) || {};
  var monthlyDebt = (loan.monthlyPayment || 0) + (snap.cardUsed > 0 ? snap.cardUsed * 0.1 : 0);
  var newRatio = income > 0 ? (monthlyDebt + amt * 0.1) / income : 98;
  var borrowIntent = /(贷款|借款|分期|借|透支|刷卡|花呗|借呗|信用)/.test(text);

  if (borrowIntent && newRatio >= 0.5) {
    return {
      code: 'over_debt', level: 'high',
      title: '过度负债风险',
      harm: '加上这笔负债后，你的月度偿债支出将超过收入的 50%，安全线通常在 40% 以内。负债率过高会显著削弱抗风险能力，一旦收入波动就容易逾期。',
      evidence: '当前月供占收入约 ' + (income > 0 ? ((monthlyDebt / income) * 100).toFixed(0) : '—') +
        '%，新增后约 ' + ((newRatio) * 100).toFixed(0) + '%',
      alternative: [
        '优先用可用余额（当前 ¥' + agentFmt(snap.available) + '）直接支付，避免新增负债',
        '若金额较大，改为分 2~3 个月分批支出，摊薄现金流压力',
        '确有需要时先做债务置换，用低息负债替换高息负债'
      ]
    };
  }
  return null;
}

function riskDetectAllIn(text: string): RiskHit | null {
  var allIn = /(全部|所有|全都|全仓|梭哈|一把|满仓|清仓买入)/.test(text);
  var invest = /(投资|理财|买入|申购|买|炒|基金|股票|币)/.test(text);
  if (allIn && invest) {
    return {
      code: 'concentration', level: 'medium',
      title: '资产集中度过高',
      harm: '把全部资金投入单一标的会失去分散化保护，任一判断失误都可能造成难以承受的损失。',
      evidence: '识别到「全部/全仓/梭哈」等集中投入表述',
      alternative: [
        '采用组合配置，单一产品不超过可投资金的 40%',
        '保留一部分货币基金作为流动性缓冲',
        '分批建仓而非一次性投入'
      ]
    };
  }
  return null;
}

function riskDetectFundPressure(text: string, amount?: number): RiskHit | null {
  var snap = agentSessionSnapshot();
  var amt = Number(amount) || agentParseAmount(text) || 0;
  if (amt <= 0) return null;

  // 转账有自己的「余额门禁」链路，这条规则只负责非转账类的高水位支出预警
  var isTransfer = /(转账|汇款|打款|转给|给\S{0,6}转|向\S{0,6}转|转\S{0,4}(?:元|块|万)|付款给|给\S{0,6}打款)/.test(text);
  if (isTransfer) return null;

  var outflow = amt;
  var ratio = snap.available > 0 ? outflow / snap.available : 99;
  if (snap.available <= 0 || ratio >= 0.85) {
    return {
      code: 'fund_pressure', level: 'high',
      title: '资金压力预警',
      harm: '这笔支出将占到你可用余额的 ' + Math.min(999, Math.round(ratio * 100)) +
        '%，完成后几乎没有流动性缓冲，遇到突发支出将只能依赖信用卡或借款。',
      evidence: '可用余额 ¥' + agentFmt(snap.available) + '，本次支出约 ¥' + agentFmt(amt),
      alternative: [
        '降低支出金额，至少保留一个月生活费的流动性（约 ¥' + agentFmtInt(snap.expense) + '）',
        '拆分到两个月分批支出',
        '确认未来 30 天没有其他大额固定支出后再执行'
      ]
    };
  }
  return null;
}

function riskDetectAbnormalChannel(text: string): RiskHit | null {
  if (/(刷单|返利|跑分|代收|代付|走账|过账|帮人转)/.test(text)) {
    return {
      code: 'fraud_channel', level: 'critical',
      title: '疑似涉诈/违规资金通道',
      harm: '为他人代收代付、刷单返利是典型的涉诈资金通道特征，可能导致账户被冻结并承担法律责任。',
      evidence: '识别到「刷单/返利/跑分/代收代付」等高风险表述',
      alternative: [
        '不要为任何人代收代付不明来源资金',
        '如已发生，建议立即联系银行客服核查账户状态',
        '遇到"返利/刷单"话术请直接忽略并举报'
      ]
    };
  }
  return null;
}

// ------------------------------ 1. 汇总识别 ------------------------------
function agentRiskDetect(text: string, amount?: number): RiskDetectResult {
  var t = String(text || '');
  var hits = [
    riskDetectCreditToInvest(t),
    riskDetectHighLeverage(t),
    riskDetectAbnormalChannel(t),
    riskDetectOverDebt(t, amount),
    riskDetectAllIn(t),
    riskDetectFundPressure(t, amount)
  ].filter(Boolean) as RiskHit[];

  hits.sort(function (a, b) { return (RISK_SEVERITY[b.level] || 0) - (RISK_SEVERITY[a.level] || 0); });
  var top = hits[0] || null;
  return {
    hits: hits,
    level: top ? top.level : 'low',
    blocked: !!(top && (top.level === 'critical' || top.level === 'high')),
    top: top
  };
}

// ------------------------------ 2. 处置：拒绝执行 + 替代建议 ------------------------------
function agentRiskBlockCardHtml(det: RiskDetectResult): string {
  var top = det.top as RiskHit;
  var levelBadge = top.level === 'critical'
    ? { text: '严重风险 · 已拦截', color: '#991b1b', bg: '#fee2e2', border: '#fecaca' }
    : { text: '高风险 · 已拦截', color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' };

  var others = det.hits.slice(1).map(function (h) {
    return '<div class="riskdetect-minor">· ' + h.title + '：' + h.evidence + '</div>';
  }).join('');

  var alts = top.alternative.map(function (a, i) {
    return '<div class="riskdetect-alt"><span class="riskdetect-alt-idx">' + (i + 1) + '</span><span>' + a + '</span></div>';
  }).join('');

  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 风险识别</div>' +
    '<div class="msg-bubble agent-bubble">' +
    '<div class="riskdetect-head">我识别到一个需要拦住的行为</div>' +
    '<div class="riskdetect-badge" style="color:' + levelBadge.color + ';background:' + levelBadge.bg + ';border-color:' + levelBadge.border + ';">' +
    levelBadge.text + '</div>' +
    '<div class="riskdetect-title">' + top.title + '</div>' +
    '<div class="riskdetect-harm">' + top.harm + '</div>' +
    '<div class="riskdetect-evidence">识别依据：' + top.evidence + '</div>' +
    (others ? '<div class="riskdetect-minors">' + others + '</div>' : '') +
    '<div class="riskdetect-refuse"><b>我已拒绝执行这个操作。</b>原因不是技术限制，而是这类操作一旦发生，风险由你独自承担，我不能帮你把风险转嫁给未来的自己。</div>' +
    '<div class="riskdetect-alt-title">更稳妥的替代方案：</div>' +
    '<div class="riskdetect-alts">' + alts + '</div>' +
    '<div class="riskdetect-foot">如果你只是想做风险匹配的投资，可以直接告诉我金额和期限，我按你的风险等级帮你配置。</div>' +
    '</div></div></div>';
}

/** 记住这次拦截，便于后续追问能接得住 */
function agentRememberRiskBlock(det: RiskDetectResult): void {
  if (!det || !det.top) return;
  agentSessionAnalysis('riskblock', '已拦截高危行为：' + det.top.title, { level: det.top.level });
  agentSessionDemand('risk', '用户曾提出：' + det.top.title);
  if (AGENT_MEMORY && AGENT_MEMORY.notes) {
    AGENT_MEMORY.notes.unshift({ at: new Date().toISOString(), text: '已拦截高危行为：' + det.top.title });
    if (AGENT_MEMORY.notes.length > 20) AGENT_MEMORY.notes.length = 20;
    saveAgentMemory();
  }
}

// ------------------------------ 3. 工具注册 ------------------------------
registerAgentTool('risk.detect', {
  label: '识别金融风险行为', risk: 'low',
  run: function (args: any) {
    var text = (args && args.text) || '';
    var det = agentRiskDetect(text, args && args.amount);
    if (!det.hits.length) {
      return { summary: '未识别到高危金融行为', data: { level: 'low', hits: [] } };
    }
    return {
      summary: '识别到 ' + det.hits.length + ' 项风险：' + det.hits.map(function (h) { return h.title; }).join('；') +
        (det.blocked ? '（系统将拒绝直接执行）' : ''),
      data: det
    };
  }
});
