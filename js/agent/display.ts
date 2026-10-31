// ==========================================================================
//  增强展示：健康评分、负债体检、主动提醒卡片
//  源码：js/agent/display.ts　→　编译：build/js/agent/display.js（经典脚本，无 import/export）
//  对外入口：agentHealthCardHtml / renderAgentHealth / agentDebtHealthCardHtml / renderAgentDebtHealth 等
//  类型：tsc 严格模式检查；对外符号统一在 types/global.d.ts 声明
// ==========================================================================
//  ① 财务健康评分卡 ② 生命周期分析 ③ 负债健康体检 ④ 主动提醒
// ==========================================================================

// —— 运行时由其它脚本提供的全局 ——
declare var mockData: any;
declare var AGENT_MEMORY: any;
declare function initAgentMemory(): void;
declare function agentBuildProfile(): any;
declare function profileCashFlow(): any;
declare function agentMonthSummary(): any;
declare function agentCategoryStats(): any[];
declare function agentSessionSnapshot(): any;
declare function agentFmt(v: any, digits?: number): string;
declare function agentFmtInt(v: any, digits?: number): string;
declare function appendMessage(html: string): void;
declare function scrollToBottom(): void;
declare function agentSessionAnalysis(kind: string, summary: string, extra?: any): void;
declare function addToConversation(role: string, text: string, meta?: any): void;
declare function registerAgentTool(name: string, def: any): void;

interface HealthDim { name: string; score: number; full: number; detail: string }
interface Health { total: number; grade: string; dims: HealthDim[] }
interface Lifecycle { stage: string; desc: string; advices: Array<{ text: string; why: string }> }

// ------------------------------ 1. 财务健康评分卡 ------------------------------
function agentHealthCardHtml(health: Health, lifecycle: Lifecycle): string {
  var dimRows = health.dims.map(function (d) {
    var pct = Math.round(d.score / d.full * 100);
    var color = pct >= 80 ? '#16a34a' : pct >= 55 ? '#f59e0b' : '#dc2626';
    return '<div class="health-dim">' +
      '<div class="health-dim-head"><span>' + d.name + '</span><span style="color:' + color + ';">' + d.score + '/' + d.full + '</span></div>' +
      '<div class="health-bar"><i style="width:' + pct + '%;background:' + color + ';"></i></div>' +
      '<div class="health-dim-desc">' + d.detail + '</div>' +
      '</div>';
  }).join('');

  var totalColor = health.total >= 85 ? '#16a34a' : health.total >= 70 ? '#09407F' : health.total >= 55 ? '#f59e0b' : '#dc2626';
  var lifeAdvice = lifecycle.advices.map(function (a) {
    return '<div class="health-advice"><b>' + a.text + '</b><span>' + a.why + '</span></div>';
  }).join('');

  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 财务体检</div>' +
    '<div class="msg-bubble agent-bubble">' +
    '<div class="health-head">Financial Health Score</div>' +
    '<div class="health-score-row">' +
    '<div class="health-score-main"><span class="health-score-num" style="color:' + totalColor + ';">' + health.total + '</span>' +
    '<span class="health-score-max">/100</span></div>' +
    '<div class="health-score-grade" style="color:' + totalColor + ';background:' + totalColor + '14;border-color:' + totalColor + '40;">' + health.grade + '</div>' +
    '</div>' +
    '<div class="health-dims">' + dimRows + '</div>' +
    '<div class="agent-sec-title">生命周期分析 · ' + lifecycle.stage + '</div>' +
    '<div class="health-life-desc">' + lifecycle.desc + '</div>' +
    '<div class="health-advices">' + lifeAdvice + '</div>' +
    '<div class="health-foot">需要我按其中某条建议直接办理吗？</div>' +
    '<div class="guide-tip">例如：帮我开一个自动储蓄计划</div>' +
    '</div></div></div>';
}

function renderAgentHealth(): any {
  if (!AGENT_MEMORY) initAgentMemory();
  var p = agentBuildProfile();
  appendMessage(agentHealthCardHtml(p.health, p.lifecycle));
  scrollToBottom();
  agentSessionAnalysis('health', '财务健康评分 ' + p.health.total + '/100（' + p.health.grade + '），生命周期 ' + p.lifecycle.stage);
  addToConversation('assistant', '已生成财务健康评分', null);
  return p;
}

// ------------------------------ 1.5 负债健康分析（只读体检，非拦截） ------------------------------
function agentDebtHealthCardHtml(): string {
  var month = agentMonthSummary();
  var loan = (mockData.userProfile && mockData.userProfile.loan) || {};
  var card = (mockData.userProfile && mockData.userProfile.creditCard) || {};

  var income = month.income || 0;
  var mortgage = loan.monthlyPayment || 0;
  var cardDebt = (Number(card.used) || 0) * 0.1;
  var totalDebt = mortgage + cardDebt;
  var ratio = income > 0 ? totalDebt / income : 0;

  var levelLabel = ratio >= 0.5 ? '高风险' : ratio >= 0.4 ? '偏高（需关注）' : '健康';
  var levelColor = ratio >= 0.5 ? '#dc2626' : ratio >= 0.4 ? '#f59e0b' : '#16a34a';

  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 负债健康体检</div>' +
    '<div class="msg-bubble agent-bubble">' +
    '<div class="ctx-head">你的负债健康分析（只读，不涉及任何交易）</div>' +
    '<div style="margin:8px 0;padding:10px 14px;border-radius:8px;background:' + levelColor + '14;border:1px solid ' + levelColor + '40;color:' + levelColor + ';font-weight:700;">' +
    '负债水位：' + levelLabel + ' · 月供收入比 ' + (ratio * 100).toFixed(1) + '%</div>' +
    '<div class="data-card">' +
    '<div class="data-card-title">🧮 计算公式与结构</div>' +
    '<div class="data-row"><span class="data-label">月收入</span><span class="data-value">¥' + agentFmt(income) + '</span></div>' +
    '<div class="data-row"><span class="data-label">房贷月供</span><span class="data-value">¥' + agentFmt(mortgage) + '</span></div>' +
    '<div class="data-row"><span class="data-label">信用卡最低还款</span><span class="data-value">¥' + agentFmt(cardDebt) + '（已用 ¥' + agentFmtInt(card.used) + ' × 10%）</span></div>' +
    '<div class="data-row"><span class="data-label">月度偿债合计</span><span class="data-value" style="font-weight:700;">¥' + agentFmt(totalDebt) + '</span></div>' +
    '<div class="data-row"><span class="data-label">月供收入比公式</span><span class="data-value" style="font-family:monospace;">' +
    agentFmtInt(totalDebt) + ' ÷ ' + agentFmtInt(income) + ' = ' + (ratio * 100).toFixed(1) + '%</span></div>' +
    '<div class="data-row"><span class="data-label">安全线</span><span class="data-value">≤ 40%</span></div>' +
    '</div>' +
    '<div style="margin-top:10px;font-size:12px;color:#666;">' +
    (ratio >= 0.5 ? '⚠️ 月供收入比已超过 50%，属高负债预警，建议优先置换高息负债、暂停新增分期。' :
      ratio >= 0.4 ? '⚠️ 月供收入比在 40%~50% 警戒区，建议控制新增负债，逐步降低至 40% 以内。' :
        '✅ 负债结构健康，月供收入比在安全线以内。') +
    '</div>' +
    '</div></div></div>';
}

function renderAgentDebtHealth(): void {
  if (!AGENT_MEMORY) initAgentMemory();
  appendMessage(agentDebtHealthCardHtml());
  scrollToBottom();
  var cash = profileCashFlow();
  agentSessionAnalysis('debt', '负债健康：月供收入比 ' + (cash.debtRatio * 100).toFixed(1) + '%');
  addToConversation('assistant', '已生成负债健康分析', null);
}

// ------------------------------ 2. 主动提醒（同比/环比异动） ------------------------------
interface CategoryAlert {
  priority: number;
  tone: string;
  title: string;
  detail: string;
  action: string;
  actionLabel: string;
  adjustAmount?: number;
}

function agentCategoryAlerts(): CategoryAlert[] {
  var alerts: CategoryAlert[] = [];
  var cats = agentCategoryStats();
  var month = agentMonthSummary();
  var base = (AGENT_MEMORY && AGENT_MEMORY.profile.monthlyAvgExpense) || 7000;

  var ratio = base > 0 ? month.expense / base : 1;
  var categoryBaseline: Record<string, number> = {
    '餐饮美食': 2100, '交通出行': 620, '购物消费': 1500,
    '房租水电': 3500, '娱乐休闲': 480, '其他支出': 300
  };
  cats.slice(0, 4).forEach(function (c: any) {
    var bl = categoryBaseline[c.label] || Math.round(c.value / Math.max(1, ratio));
    if (bl <= 0) return;
    var pct = Math.round((c.value - bl) / bl * 100);
    if (pct >= 25) {
      alerts.push({
        priority: 55,
        tone: pct >= 40 ? 'danger' : 'warn',
        title: '本月' + c.label + '支出较同期上涨 ' + pct + '%',
        detail: '当前 ¥' + agentFmtInt(c.value) + '，参考基准 ¥' + agentFmtInt(bl) + '（+¥' + agentFmtInt(c.value - bl) + '）。',
        action: 'budgetAdjust',
        actionLabel: '调整预算',
        adjustAmount: Math.round(c.value / 100) * 100
      });
    } else if (pct <= -25) {
      alerts.push({
        priority: 30,
        tone: 'normal',
        title: '本月' + c.label + '支出较同期下降 ' + Math.abs(pct) + '%',
        detail: '当前 ¥' + agentFmtInt(c.value) + '，比基准少 ¥' + agentFmtInt(bl - c.value) + '，保持得不错。',
        action: 'billCheck',
        actionLabel: '查看账单'
      });
    }
  });

  var cash = profileCashFlow();
  if (cash.debtRatio >= 0.4) {
    alerts.push({
      priority: 60, tone: 'danger',
      title: '月供占收入已达 ' + (cash.debtRatio * 100).toFixed(0) + '%',
      detail: '月度偿债 ¥' + agentFmtInt(cash.monthlyDebt) + '，超过 40% 安全线，建议关注负债结构。',
      action: 'riskDetect', actionLabel: '体检负债风险'
    });
  }

  var snap = agentSessionSnapshot();
  if (snap.cardUtil >= 0.5) {
    alerts.push({
      priority: 45, tone: 'warn',
      title: '信用卡额度已使用 ' + (snap.cardUtil * 100).toFixed(0) + '%',
      detail: '已用 ¥' + agentFmtInt(snap.cardUsed) + ' / ¥' + agentFmtInt(snap.cardLimit) + '，使用率超过 50% 可能影响提额与征信评分。',
      action: 'cardOverview', actionLabel: '查看卡片'
    });
  }

  if (cash.savingsRate < 0.1 && cash.inflow > 0) {
    alerts.push({
      priority: 50, tone: 'warn',
      title: '本月储蓄率仅 ' + (cash.savingsRate * 100).toFixed(0) + '%',
      detail: '月结余 ¥' + agentFmtInt(cash.net) + '，低于建议的 20%。长期低储蓄率会拖慢目标达成。',
      action: 'savingsPlan', actionLabel: '制定储蓄计划'
    });
  }

  alerts.sort(function (a, b) { return b.priority - a.priority; });
  return alerts;
}

function agentAlertCardHtml(a: CategoryAlert): string {
  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 主动提醒</div>' +
    '<div class="msg-bubble agent-bubble agent-proactive">' +
    '<div class="agent-proactive-head">我主动帮你看了一眼支出结构</div>' +
    '<div class="agent-insight ' + (a.tone || '') + '">' +
    '<div class="agent-insight-idx">!</div>' +
    '<div class="agent-insight-body">' +
    '<div class="agent-insight-title">' + a.title + '</div>' +
    '<div class="agent-insight-desc">' + a.detail + '</div>' +
    '</div></div>' +
    '<div class="agent-tasks-note">如需处理，直接告诉我怎么做即可。</div>' +
    '<div class="guide-tip">例如：调整预算 / 体检负债风险</div>' +
    '</div></div></div>';
}

// ------------------------------ 3. 工具注册 ------------------------------
registerAgentTool('account.healthScore', {
  label: '生成财务健康评分', risk: 'low',
  run: function () {
    var p = agentBuildProfile();
    var h = p.health;
    agentSessionAnalysis('health', '财务健康评分 ' + h.total + '/100（' + h.grade + '）');
    return {
      summary: '财务健康评分 ' + h.total + '/100（' + h.grade + '）：' +
        h.dims.map(function (d: any) { return d.name + ' ' + d.score + '/' + d.full; }).join('，') +
        '；生命周期阶段 ' + p.lifecycle.stage,
      data: { health: h, lifecycle: p.lifecycle, tags: p.tags }
    };
  }
});
