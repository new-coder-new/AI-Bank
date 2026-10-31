// ==========================================================================
//  用户画像：客户标签、生命周期与画像分析
//  源码：js/agent/profile.ts　→　编译：build/js/agent/profile.js（经典脚本，无 import/export）
//  对外入口：profileAge / profileCareer / profileRegion / profileTierLevel 等
//  类型：tsc 严格模式检查；对外符号统一在 types/global.d.ts 声明
// ==========================================================================
//  基础属性 / 金融属性 / 行为属性 / 风险属性 → 客户标签 → 个性化推荐（必须带理由）
// ==========================================================================

// —— 运行时由其它脚本提供的全局 ——
declare var AGENT_SESSION: any;
declare var mockData: any;
declare var AGENT_MEMORY: any;
declare function initAgentMemory(): void;
declare function agentMonthSummary(): any;
declare function agentCategoryStats(): any[];
declare function agentSessionSnapshot(): any;
declare function agentTotalAssets(): any;
declare function agentFmtInt(v: any, digits?: number): string;
declare function agentSessionAnalysis(kind: string, summary: string, extra?: any): void;
declare function agentSessionFact(key: string, text: string): void;
declare function appendMessage(html: string): void;
declare function scrollToBottom(): void;
declare function addToConversation(role: string, text: string, meta?: any): void;
declare function registerAgentTool(name: string, def: any): void;

interface SpendFrequency { level: string; score: number; count: number }

interface SpendProfile {
  categories: any[];
  topCategory: string;
  topAmount: number;
  totalExpense: number;
  discretionaryRatio: number;
  rigidityRatio: number;
  label: string;
}

interface CashFlow {
  inflow: number; outflow: number; net: number;
  savingsRate: number; monthlyDebt: number; debtRatio: number;
  liquidity: number; loanRemaining: number;
}

interface RiskAttr {
  level: string; rank: number; holdingsAmount: number;
  equityRatio: number; preference: string; maxRiskHolding: number;
  liquidityNeed: string;
}

interface CustomerTag { name: string; tone: string; reason: string }

interface HealthDim { name: string; score: number; full: number; detail: string }
interface HealthResult { total: number; grade: string; dims: HealthDim[] }

interface LifeAdvice { text: string; why: string }
interface LifecycleResult { stage: string; age: number; desc: string; advices: LifeAdvice[] }

interface Recommendation { category: string; icon: string; name: string; reason: string }

interface ProfileAttr {
  age: number;
  career: string;
  region: string;
  tier: number;
  tierLabel: string;
  cashFlow: CashFlow;
  spend: SpendProfile;
  spendFreq: SpendFrequency;
  risk: RiskAttr;
  assets: any;
  tags: CustomerTag[];
  health: HealthResult;
  lifecycle: LifecycleResult;
  recommendations: Recommendation[];
  attr?: ProfileAttr;
  [key: string]: any;
}

// ------------------------------ 0. 基础属性提取 ------------------------------
function profileAge(): number {
  var u = (mockData.userProfile && mockData.userProfile.birthday) ? mockData.userProfile.birthday : '1998-03-15';
  var m = String(u).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return 28;
  var b = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var now = new Date();
  var age = now.getFullYear() - b.getFullYear();
  var md = (now.getMonth() - b.getMonth()) * 100 + (now.getDate() - b.getDate());
  if (md < 0) age--;
  return Math.max(18, age);
}

function profileCareer(city?: string): string {
  var month = agentMonthSummary();
  var income = month.income || 0;
  if (income >= 25000) return '企业中层管理';
  if (income >= 12000) return '互联网/科技行业白领';
  if (income >= 6000) return '企业职员';
  return '普通工薪族';
}

function profileRegion(): string {
  var addr = (mockData.userProfile && mockData.userProfile.address) || '广东省清远市';
  var m = String(addr).match(/([\u4e00-\u9fa5]{2,8}?省)?([\u4e00-\u9fa5]{2,8}?市)/);
  if (m && m[2]) return m[2];
  return (AGENT_MEMORY && AGENT_MEMORY.profile.city) || '未记录';
}

/** 客户等级文本 → 数值权重 */
function profileTierLevel(): number {
  var lv = (mockData.userProfile && mockData.userProfile.level) || '';
  if (/钻石|私人银行/.test(lv)) return 4;
  if (/白金/.test(lv)) return 3;
  if (/金/.test(lv)) return 2;
  return 1;
}

// ------------------------------ 1. 消费行为分析 ------------------------------
function profileSpendFrequency(): SpendFrequency {
  var txns = (mockData.userProfile && mockData.userProfile.recentTxns) || [];
  var expenseCount = txns.filter(function (t: any) { return t.type === 'expense'; }).length;
  if (expenseCount >= 20) return { level: '高频', score: 3, count: expenseCount };
  if (expenseCount >= 10) return { level: '中频', score: 2, count: expenseCount };
  return { level: '低频', score: 1, count: expenseCount };
}

function profileSpendProfile(): SpendProfile {
  var cats = agentCategoryStats();
  var totalExpense = cats.reduce(function (s, c) { return s + (c.value || 0); }, 0);
  var top = cats[0] || { label: '日常消费', value: 0 };
  var discretionary = ['餐饮美食', '购物消费', '娱乐休闲', '交通出行'];
  var discSum = cats.filter(function (c) { return discretionary.indexOf(c.label) > -1; })
    .reduce(function (s, c) { return s + (c.value || 0); }, 0);
  var rigidity = totalExpense > 0 ? (1 - discSum / totalExpense) : 0;
  return {
    categories: cats,
    topCategory: top.label,
    topAmount: top.value,
    totalExpense: totalExpense,
    discretionaryRatio: totalExpense > 0 ? discSum / totalExpense : 0,
    rigidityRatio: rigidity,
    label: discSum / Math.max(1, totalExpense) > 0.55 ? '弹性消费主导型' : '刚性支出主导型'
  };
}

function profileCashFlow(): CashFlow {
  var month = agentMonthSummary();
  var snap = agentSessionSnapshot();
  var loan = (mockData.userProfile && mockData.userProfile.loan) || {};
  var debtRatio = month.income > 0 ? ((loan.monthlyPayment || 0) + (snap.cardUsed * 0.1)) / month.income : 0;
  return {
    inflow: month.income,
    outflow: month.expense,
    net: month.balance,
    savingsRate: month.income > 0 ? month.balance / month.income : 0,
    monthlyDebt: loan.monthlyPayment || 0,
    debtRatio: debtRatio,
    liquidity: snap.available,
    loanRemaining: loan.remaining || 0
  };
}

// ------------------------------ 2. 风险与投资偏好 ------------------------------
function profileRiskAttr(): RiskAttr {
  var p = (AGENT_MEMORY && AGENT_MEMORY.profile) || {};
  var level = p.riskLevel || 'C2 稳健型';
  var rank = /C5|进取|激进/.test(level) ? 5 : /C4|成长/.test(level) ? 4 : /C3|平衡/.test(level) ? 3 : /C2|稳健/.test(level) ? 2 : 1;
  var holdings = (mockData.userProfile && mockData.userProfile.holdings) || [];
  var totalHold = holdings.reduce(function (s: number, h: any) { return s + (h.amount || 0); }, 0);
  var maxRiskHolding = holdings.reduce(function (m: number, h: any) { return Math.max(m, h.riskLevel || 0); }, 0);
  var equityAmount = 0;
  holdings.forEach(function (h: any) {
    if ((h.riskLevel || 0) >= 3) equityAmount += (h.amount || 0);
  });
  var equityRatio = totalHold > 0 ? equityAmount / totalHold : 0;
  var pref = equityRatio > 0.4 ? '偏权益' : equityRatio > 0.15 ? '稳健偏均衡' : '偏固收/现金管理';
  return {
    level: level, rank: rank,
    holdingsAmount: totalHold,
    equityRatio: equityRatio,
    preference: pref,
    maxRiskHolding: maxRiskHolding,
    liquidityNeed: profileCashFlow().net < 2000 ? '高' : '中'
  };
}

// ------------------------------ 3. 客户标签 ------------------------------
function profileTags(attr: ProfileAttr): CustomerTag[] {
  var tags: CustomerTag[] = [];
  var age = attr.age;
  var cash = attr.cashFlow;
  var spend = attr.spend;
  var risk = attr.risk;

  if (age < 35 && cash.savingsRate >= 0.12) {
    tags.push({ name: '年轻成长型客户', tone: 'growth', reason: age + ' 岁且月储蓄率 ' + (cash.savingsRate * 100).toFixed(0) + '%，处于财富积累期' });
  }
  if (cash.savingsRate >= 0.25 && risk.rank <= 2) {
    tags.push({ name: '稳健储蓄型客户', tone: 'steady', reason: '月储蓄率 ' + (cash.savingsRate * 100).toFixed(0) + '%，风险等级 ' + risk.level });
  }
  if (spend.discretionaryRatio >= 0.55) {
    tags.push({ name: '高消费活跃客户', tone: 'active', reason: '弹性消费占比 ' + (spend.discretionaryRatio * 100).toFixed(0) + '%，' + spend.topCategory + '为主要支出' });
  }
  if (cash.debtRatio >= 0.35) {
    tags.push({ name: '负债关注型客户', tone: 'debt', reason: '月供占收入 ' + (cash.debtRatio * 100).toFixed(0) + '%，负债压力偏高' });
  }
  if (attr.assets && attr.assets.total >= 700000) {
    tags.push({ name: '高净值潜力客户', tone: 'vip', reason: '总资产 ¥' + agentFmtInt(attr.assets.total) + '，具备资产配置空间' });
  }
  if (risk.liquidityNeed === '高') {
    tags.push({ name: '流动性敏感客户', tone: 'liquid', reason: '月结余偏低，对资金灵活性要求高' });
  }
  if (!tags.length) tags.push({ name: '稳健储蓄型客户', tone: 'steady', reason: '现金流平稳，风险偏好中性偏保守' });
  return tags.slice(0, 4);
}

// ------------------------------ 4. 财务健康评分 ------------------------------
function profileHealthScore(attr?: ProfileAttr): HealthResult {
  if (!attr) attr = agentBuildProfile();
  var cash = attr.cashFlow;
  var spend = attr.spend;
  var risk = attr.risk;

  // ① 储蓄能力（25 分）
  var saveRate = Math.max(0, Math.min(1, cash.savingsRate));
  var sSave = Math.round(saveRate / 0.4 * 25);
  sSave = Math.max(0, Math.min(25, sSave));

  // ② 消费稳定性（25 分）
  var stability = 1 - Math.abs(spend.rigidityRatio - 0.45) * 1.6;
  var cardUtil = agentSessionSnapshot().cardUtil;
  stability = stability * 0.7 + (1 - Math.min(1, cardUtil / 0.6)) * 0.3;
  var sStable = Math.round(Math.max(0, Math.min(1, stability)) * 25);

  // ③ 负债压力（25 分）
  var debtScore = 1 - Math.min(1, cash.debtRatio / 0.5);
  var sDebt = Math.round(Math.max(0, debtScore) * 25);

  // ④ 风险水平（25 分）
  var riskScore = risk.rank >= 2 ? 0.85 : 0.6;
  if (risk.rank >= 4 && cash.savingsRate < 0.1) riskScore = 0.5;
  var sRisk = Math.round(riskScore * 25);

  var total = sSave + sStable + sDebt + sRisk;
  var grade = total >= 85 ? '优秀' : total >= 70 ? '良好' : total >= 55 ? '一般' : '需改善';
  return {
    total: total, grade: grade,
    dims: [
      { name: '储蓄能力', score: sSave, full: 25, detail: '月储蓄率 ' + (cash.savingsRate * 100).toFixed(0) + '%' },
      { name: '消费稳定性', score: sStable, full: 25, detail: '刚性支出占 ' + (spend.rigidityRatio * 100).toFixed(0) + '%' },
      { name: '负债压力', score: sDebt, full: 25, detail: '月供占收入 ' + (cash.debtRatio * 100).toFixed(0) + '%' },
      { name: '风险水平', score: sRisk, full: 25, detail: risk.level + ' · ' + risk.preference }
    ]
  };
}

// ------------------------------ 5. 生命周期分析 ------------------------------
function profileLifecycle(attr: ProfileAttr): LifecycleResult {
  var age = attr.age;
  var savings = attr.cashFlow.savingsRate;
  var assets = attr.assets ? attr.assets.total : 0;

  var stage: string, stageDesc: string, advices: LifeAdvice[];
  if (age < 30) {
    stage = '财富积累期';
    stageDesc = '收入成长快、负担相对轻，是建立储蓄与投资习惯的黄金阶段。';
    advices = [
      { text: '建立强制储蓄：每月固定转入 ' + agentFmtInt(Math.max(1000, attr.cashFlow.net * 0.5)) + ' 元定投，优先货币基金与固收+', why: '起步阶段靠纪律而非收益' },
      { text: '配置 3~6 个月生活费的应急金（约 ¥' + agentFmtInt(attr.cashFlow.outflow * 3) + '）', why: '应对失业/突发支出，避免动用信用卡' },
      { text: '小额权益类定投（不超过可投资金 30%）', why: '年轻可承受时间波动，用长期摊销风险' }
    ];
  } else if (age < 40) {
    stage = '财富成长与负债管理期';
    stageDesc = '收入较高但房贷等刚性支出开始占主导，重点是平衡还债与增值。';
    advices = [
      { text: '优化债务结构：保持月供收入比在 40% 以内', why: '当前为 ' + (attr.cashFlow.debtRatio * 100).toFixed(0) + '%' },
      { text: '组合配置：固收打底 + 权益增厚（6:4）', why: '兼顾子女教育/换房等中期目标' },
      { text: '提高储蓄率至 25% 以上', why: '当前储蓄率 ' + (savings * 100).toFixed(0) + '%' }
    ];
  } else {
    stage = '资产配置与传承期';
    stageDesc = '资产规模较大，重点从"增值"转向"稳值 + 传递"。';
    advices = [
      { text: '降低单一资产集中度，增配低波动固收与保险', why: '控制回撤优先级高于博取高收益' },
      { text: '每年做一次资产再平衡', why: '锁定已有收益，避免风险敞口被动漂移' },
      { text: '梳理家庭保障与传承安排', why: '总资产 ¥' + agentFmtInt(assets) + ' 已具备规划意义' }
    ];
  }
  return { stage: stage, age: age, desc: stageDesc, advices: advices };
}

// ------------------------------ 6. 个性化服务推荐 ------------------------------
function profileRecommendations(attr: ProfileAttr): Recommendation[] {
  var risk = attr.risk;
  var cash = attr.cashFlow;
  var spend = attr.spend;
  var recs: Recommendation[] = [];

  if (risk.rank <= 2) {
    recs.push({
      category: '理财产品', icon: '📈', name: '稳健增利90天',
      reason: '由于你的风险等级为 ' + risk.level + '、可投资金以中短期为主、流动性需求 ' + risk.liquidityNeed +
        '，因此推荐低风险固收类产品打底，兼顾收益与可赎回性。'
    });
  } else {
    recs.push({
      category: '理财产品', icon: '📊', name: '均衡配置混合基金',
      reason: '由于你的风险等级为 ' + risk.level + '、偏好「' + risk.preference + '」，因此推荐固收+权益的均衡配置，在不显著放大回撤的前提下增厚收益。'
    });
  }

  if (spend.discretionaryRatio >= 0.5) {
    recs.push({
      category: '信用卡权益', icon: '💳', name: '餐饮/购物返现权益包',
      reason: '由于你的「' + spend.topCategory + '」支出占比最高（弹性消费 ' + (spend.discretionaryRatio * 100).toFixed(0) +
        '%），因此推荐开通该品类返现权益，与实际消费结构匹配，可直接降低月支出。'
    });
  } else {
    recs.push({
      category: '信用卡权益', icon: '💳', name: '免年费 + 分期优惠权益',
      reason: '由于你的刚性支出占比高（' + (spend.rigidityRatio * 100).toFixed(0) + '%）、现金流偏紧，因此推荐免年费权益并保留分期优惠，降低固定成本。'
    });
  }

  recs.push({
    category: '储蓄计划', icon: '🎯', name: '月结余自动定存计划',
    reason: '由于你每月可结余约 ¥' + agentFmtInt(Math.max(0, cash.net)) + '（储蓄率 ' + (cash.savingsRate * 100).toFixed(0) +
      '%），因此建议在发薪日自动划转 ' + Math.round(Math.max(0, cash.net) * 0.4 / 100) * 100 +
      ' 元进专项储蓄，把"剩下才存"改成"先存后花"。'
  });

  if (spend.discretionaryRatio >= 0.5) {
    recs.push({
      category: '消费管理', icon: '📊', name: '弹性消费预算管控',
      reason: '由于你的弹性消费占比达 ' + (spend.discretionaryRatio * 100).toFixed(0) + '%、且「' + spend.topCategory +
        '」为最大支出项，因此建议为该品类单独设置月度上限并开启超支提醒。'
    });
  } else {
    recs.push({
      category: '消费管理', icon: '📊', name: '固定支出优化方案',
      reason: '由于刚性支出占 ' + (spend.rigidityRatio * 100).toFixed(0) + '%、压缩空间有限，因此建议从订阅与账单分期结构入手，释放月度现金流。'
    });
  }

  if (cash.debtRatio >= 0.35) {
    recs.push({
      category: '负债优化', icon: '🏦', name: '债务结构优化建议',
      reason: '由于月供占收入已达 ' + (cash.debtRatio * 100).toFixed(0) + '%、负债压力偏高，因此建议优先置换高息负债，控制新增分期，避免信用资金用于投资。'
    });
  }
  return recs;
}

// ------------------------------ 7. 汇总画像 ------------------------------
function agentBuildProfile(): ProfileAttr {
  if (!AGENT_MEMORY) initAgentMemory();
  var region = profileRegion();
  var cash = profileCashFlow();
  var spend = profileSpendProfile();
  var risk = profileRiskAttr();
  var assets = agentTotalAssets();

  var attr: ProfileAttr = {
    age: profileAge(),
    career: profileCareer(region),
    region: region,
    tier: profileTierLevel(),
    tierLabel: (mockData.userProfile && mockData.userProfile.level) || '普通客户',
    cashFlow: cash,
    spend: spend,
    spendFreq: profileSpendFrequency(),
    risk: risk,
    assets: assets,
    tags: [], health: { total: 0, grade: '', dims: [] }, lifecycle: { stage: '', age: 0, desc: '', advices: [] },
    recommendations: []
  };
  attr.tags = profileTags(attr);
  attr.health = profileHealthScore(attr);
  attr.lifecycle = profileLifecycle(attr);
  attr.recommendations = profileRecommendations(attr);
  attr.attr = attr;   // 自引用：便于外部把整个 attr 回传给评分/生命周期函数
  return attr;
}

// ------------------------------ 8. 渲染 ------------------------------
function profileTagChip(tag: CustomerTag): string {
  var tones: Record<string, string[]> = {
    growth: ['#09407F', '#F2F6FC', '#C2D6EE'],
    steady: ['#0369a1', '#f0f9ff', '#bae6fd'],
    active: ['#b45309', '#fffbeb', '#fde68a'],
    debt: ['#b91c1c', '#fef2f2', '#fecaca'],
    vip: ['#a16207', '#fefce8', '#fde68a'],
    liquid: ['#0f766e', '#f0fdfa', '#99f6e4']
  };
  var c = tones[tag.tone] || tones.steady;
  return '<span class="profile-tag" style="color:' + c[0] + ';background:' + c[1] + ';border-color:' + c[2] + ';">' + tag.name + '</span>';
}

function profileHealthHtml(health: HealthResult): string {
  var rows = health.dims.map(function (d) {
    var pct = Math.round(d.score / d.full * 100);
    var color = pct >= 80 ? '#16a34a' : pct >= 55 ? '#f59e0b' : '#dc2626';
    return '<div class="profile-health-dim">' +
      '<div class="profile-health-dim-head"><span>' + d.name + '</span><span style="color:' + color + ';">' + d.score + '/' + d.full + '</span></div>' +
      '<div class="profile-health-bar"><i style="width:' + pct + '%;background:' + color + ';"></i></div>' +
      '<div class="profile-health-dim-desc">' + d.detail + '</div>' +
      '</div>';
  }).join('');
  var totalColor = health.total >= 85 ? '#16a34a' : health.total >= 70 ? '#09407F' : health.total >= 55 ? '#f59e0b' : '#dc2626';
  return '<div class="profile-health">' +
    '<div class="profile-health-score"><span class="profile-health-num" style="color:' + totalColor + ';">' + health.total + '</span>' +
    '<span class="profile-health-max">/100</span><span class="profile-health-grade" style="color:' + totalColor + ';">' + health.grade + '</span></div>' +
    '<div class="profile-health-dims">' + rows + '</div>' +
    '</div>';
}

function profileCardHtml(p: ProfileAttr): string {
  var tagHtml = p.tags.map(profileTagChip).join('');
  var tagRows = p.tags.map(function (t) {
    return '<div class="profile-tag-row"><span class="profile-tag-name">' + t.name + '</span><span class="profile-tag-reason">' + t.reason + '</span></div>';
  }).join('');
  var recRows = p.recommendations.map(function (r) {
    return '<div class="profile-rec">' +
      '<div class="profile-rec-head"><span class="profile-rec-icon">' + r.icon + '</span>' +
      '<span class="profile-rec-name">' + r.name + '</span>' +
      '<span class="profile-rec-cat">' + r.category + '</span></div>' +
      '<div class="profile-rec-reason">' + r.reason + '</div>' +
      '</div>';
  }).join('');
  var lifeRows = p.lifecycle.advices.map(function (a) {
    return '<div class="profile-advice"><div class="profile-advice-text">· ' + a.text + '</div>' +
      '<div class="profile-advice-why">' + a.why + '</div></div>';
  }).join('');

  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 用户画像分析</div>' +
    '<div class="msg-bubble agent-bubble">' +
    '<div class="profile-head">客户画像 · ' + (AGENT_MEMORY.profile.name || '小陈') + '</div>' +

    '<div class="agent-sec-title">基础属性</div>' +
    '<div class="profile-grid">' +
    '<div class="profile-kv"><span>年龄</span><b>' + p.age + ' 岁</b></div>' +
    '<div class="profile-kv"><span>职业</span><b>' + p.career + '</b></div>' +
    '<div class="profile-kv"><span>地区</span><b>' + p.region + '</b></div>' +
    '<div class="profile-kv"><span>客户等级</span><b>' + p.tierLabel + '</b></div>' +
    '</div>' +

    '<div class="agent-sec-title">金融属性</div>' +
    '<div class="profile-grid">' +
    '<div class="profile-kv"><span>总资产</span><b>¥' + agentFmtInt(p.assets.total) + '</b></div>' +
    '<div class="profile-kv"><span>月收入</span><b>¥' + agentFmtInt(p.cashFlow.inflow) + '</b></div>' +
    '<div class="profile-kv"><span>月结余</span><b>¥' + agentFmtInt(p.cashFlow.net) + '</b></div>' +
    '<div class="profile-kv"><span>消费能力</span><b>' + (p.spend.discretionaryRatio >= 0.5 ? '强（弹性消费高）' : '稳（刚需为主）') + '</b></div>' +
    '</div>' +

    '<div class="agent-sec-title">行为属性</div>' +
    '<div class="profile-grid">' +
    '<div class="profile-kv"><span>主要消费类别</span><b>' + p.spend.topCategory + '</b></div>' +
    '<div class="profile-kv"><span>消费频率</span><b>' + p.spendFreq.level + '</b></div>' +
    '<div class="profile-kv"><span>支出结构</span><b>' + p.spend.label + '</b></div>' +
    '<div class="profile-kv"><span>资金流动</span><b>净流入 ¥' + agentFmtInt(p.cashFlow.net) + '</b></div>' +
    '</div>' +

    '<div class="agent-sec-title">风险属性</div>' +
    '<div class="profile-grid">' +
    '<div class="profile-kv"><span>风险承受等级</span><b>' + p.risk.level + '</b></div>' +
    '<div class="profile-kv"><span>投资偏好</span><b>' + p.risk.preference + '</b></div>' +
    '<div class="profile-kv"><span>持仓规模</span><b>¥' + agentFmtInt(p.risk.holdingsAmount) + '</b></div>' +
    '<div class="profile-kv"><span>流动性需求</span><b>' + p.risk.liquidityNeed + '</b></div>' +
    '</div>' +

    '<div class="agent-sec-title">客户标签</div>' +
    '<div class="profile-tag-wrap">' + tagHtml + '</div>' +
    '<div class="profile-tag-rows">' + tagRows + '</div>' +

    '<div class="agent-sec-title">财务健康评分</div>' +
    profileHealthHtml(p.health) +

    '<div class="agent-sec-title">生命周期分析 · ' + p.lifecycle.stage + '</div>' +
    '<div class="profile-life-desc">' + p.lifecycle.desc + '</div>' +
    '<div class="profile-advices">' + lifeRows + '</div>' +

    '<div class="agent-sec-title">个性化服务推荐</div>' +
    '<div class="profile-recs">' + recRows + '</div>' +

    '<div class="profile-foot">以上推荐基于你的真实画像数据推导，每条都标注了理由。需要我针对某一项直接办理吗？</div>' +
    '</div></div></div>';
}

// ------------------------------ 9. 工具注册 ------------------------------
registerAgentTool('account.profileAnalysis', {
  label: '生成用户画像分析', risk: 'low',
  run: function () {
    var p = agentBuildProfile();
    agentSessionAnalysis('profile', '客户标签：' + p.tags.map(function (t) { return t.name; }).join('、') +
      '；财务健康 ' + p.health.total + '/100（' + p.health.grade + '）；生命周期 ' + p.lifecycle.stage);
    agentSessionFact('profile', '风险等级 ' + p.risk.level + '，投资偏好 ' + p.risk.preference +
      '，月结余 ¥' + agentFmtInt(p.cashFlow.net));
    AGENT_SESSION.lastFocus = '用户画像';

    return {
      summary: '画像已生成：' + p.tags.map(function (t) { return t.name; }).join('、') +
        '；财务健康 ' + p.health.total + '/100；生命周期 ' + p.lifecycle.stage,
      data: {
        age: p.age, career: p.career, region: p.region,
        tags: p.tags, health: p.health, lifecycle: p.lifecycle,
        recommendations: p.recommendations,
        risk: p.risk, cashFlow: p.cashFlow, spend: p.spend
      }
    };
  }
});

/** 供对话入口调用：渲染画像卡 */
function renderAgentProfile(): ProfileAttr {
  if (!AGENT_MEMORY) initAgentMemory();
  var p = agentBuildProfile();
  appendMessage(profileCardHtml(p));
  scrollToBottom();
  addToConversation('assistant', '已生成用户画像分析', null);
  return p;
}
