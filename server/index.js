// ==========================================================================
//  模拟银行核心系统 · HTTP API 服务（零依赖，纯 Node http 模块）
//  前端通过 fetch 调用这里，所有金融数据读写都在此统一处理，
//  保证"数据准确、可溯源、操作真实生效"。
// ==========================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { buildDB, fmtDate, fmtDateTime, now } = require('./db');

let DB = buildDB();
const PORT = process.env.PORT || 8787;
const HOST = '0.0.0.0';

// 前端静态资源根目录（单端口部署：由本服务同时提供 API 与静态文件）
const STATIC_ROOT = path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

// 提供静态文件（目录穿越防护）
function serveStatic(req, res) {
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(STATIC_ROOT, pathname));
  if (!filePath.startsWith(STATIC_ROOT)) { // 防目录穿越
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('404 Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

// 密钥配置下发：js/config.local.js 存在于本机时原样返回（已 git 忽略，不入库）；
// 文件不存在时回落到环境变量 DEEPSEEK_API_KEY / SILICONFLOW_API_KEY，
// 保证部署环境不用提交 Key，同时避免浏览器控制台出现 404。
function serveKeyConfig(res) {
  const localFile = path.join(STATIC_ROOT, 'js', 'config.local.js');
  const envBody = 'window.__BANK_KEYS__ = ' + JSON.stringify({
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
    siliconflowApiKey: process.env.SILICONFLOW_API_KEY || ''
  }) + ';\n';
  fs.readFile(localFile, 'utf8', (err, code) => {
    res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
    res.end((!err && code) ? code : envBody);
  });
}

// ------------------------------ 工具 ------------------------------
function sendJSON(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { resolve({}); }
    });
  });
}

// 账单汇总
function monthSummary() {
  const b = DB.bills;
  const income = (b.income || []).reduce((s, x) => s + (x.value || 0), 0);
  const expense = (b.expense || []).reduce((s, x) => s + (x.value || 0), 0);
  return { month: b.month, income, expense, balance: income - expense, categories: b.expense };
}

// 预算状态
function budgetStatus() {
  const bud = DB.userProfile.budgets || {};
  const m = monthSummary();
  const monthLimit = bud.month || 0;
  const used = m.expense;
  const remain = monthLimit - used;
  const d = now();
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - d.getDate();
  const dailyRate = d.getDate() > 0 ? used / d.getDate() : 0;
  const canLast = remain <= 0 ? 0 : (dailyRate > 0 ? Math.floor(remain / dailyRate) : 999);
  return { monthLimit, used, remain, daysLeft, dailyRate, canLast, overspent: remain < 0, usedRatio: monthLimit > 0 ? used / monthLimit : 0 };
}

// 会话快照（供决策/规划模块）
function sessionSnapshot() {
  const m = monthSummary();
  const bud = budgetStatus();
  const d = DB.userProfile.debitCard;
  const c = DB.userProfile.creditCard;
  const holdings = (DB.userProfile.holdings || []).reduce((s, h) => s + (h.amount || 0) + (h.profit || 0), 0);
  return {
    available: d.available, balance: d.balance, frozen: d.frozen,
    income: m.income, expense: m.expense, surplus: m.balance,
    savingsRate: m.income > 0 ? m.balance / m.income : 0,
    budgetLimit: bud.monthLimit, budgetUsed: bud.used, budgetRemain: bud.remain,
    cardLimit: c.limit, cardUsed: c.used, cardAvailable: c.available,
    cardUtil: c.limit ? c.used / c.limit : 0,
    holdingsValue: holdings
  };
}

// 追加交易流水（实时影响今日收支）
function addTxn(type, amount, desc, channel, abnormal) {
  const d = DB.userProfile.debitCard;
  const txn = { type, amount, desc, time: fmtDateTime(now()), channel: channel || '智能转账' };
  if (abnormal) { txn.abnormal = true; txn.abnormalReason = abnormal; }
  DB.userProfile.recentTxns.unshift(txn);
  DB.userProfile.recentTxns = DB.userProfile.recentTxns.slice(0, 50);
  if (type === 'income') d.todayIncome += amount; else d.todayExpense += amount;
  // 同步账单分类（近似归入"其他支出/收入"）
  const target = type === 'income' ? DB.bills.income : DB.bills.expense;
  const cat = target.find((x) => x.label === (type === 'income' ? '其他收入' : '其他支出'));
  if (cat) cat.value = Math.round((cat.value + amount) * 100) / 100;
  return txn;
}

// ------------------------------ 财务健康评分（四维） ------------------------------
function healthScore() {
  const s = sessionSnapshot();
  const loan = DB.userProfile.loan;
  const monthlyDebt = (loan.monthlyPayment || 0) + (DB.userProfile.creditCard.used || 0) * 0.1;

  // 1) 储蓄能力（目标：储蓄率 20% 以上满分）
  const saveScore = Math.max(0, Math.min(100, Math.round(s.savingsRate * 100 * 2.5)));

  // 2) 消费稳定性（预算使用率越贴近预算越健康）
  const bud = budgetStatus();
  let consumeScore = 100;
  if (bud.usedRatio > 1.2) consumeScore = 30;
  else if (bud.usedRatio > 1) consumeScore = 50;
  else if (bud.usedRatio > 0.9) consumeScore = 70;
  else if (bud.usedRatio > 0.7) consumeScore = 85;
  else if (bud.usedRatio > 0.4) consumeScore = 95;
  else consumeScore = 80; // 过低也提示预算可能偏高

  // 3) 负债压力（月供占收入 <40% 为安全）
  const debtRatio = s.income > 0 ? monthlyDebt / s.income : 1;
  let debtScore = Math.max(0, Math.min(100, Math.round((0.55 - debtRatio) * 200)));
  if (debtRatio > 0.55) debtScore = 20;

  // 4) 风险水平（信用卡使用率 + 应急金）
  const emer = s.available >= s.expense * 3;
  let riskScore = 100;
  if (s.cardUtil > 0.7) riskScore -= 30;
  if (!emer) riskScore -= 35;
  if (s.budgetRemain < 0) riskScore -= 25;
  riskScore = Math.max(10, riskScore);

  const total = Math.round((saveScore * 0.3 + consumeScore * 0.2 + debtScore * 0.25 + riskScore * 0.25));
  let grade, gradeColor, gradeNote;
  if (total >= 80) { grade = '优秀'; gradeColor = '#16a34a'; gradeNote = '财务状态健康，建议保持节奏并考虑增值配置。'; }
  else if (total >= 65) { grade = '良好'; gradeColor = '#2563eb'; gradeNote = '整体稳健，个别维度可优化。'; }
  else if (total >= 50) { grade = '一般'; gradeColor = '#d97706'; gradeNote = '存在需要关注的风险点，建议针对性改善。'; }
  else { grade = '需警惕'; gradeColor = '#dc2626'; gradeNote = '财务压力较大，建议尽快调整支出与负债结构。'; }

  return {
    total, grade, gradeColor, gradeNote,
    dimensions: {
      saving: { label: '储蓄能力', score: saveScore, detail: `月储蓄率 ${(s.savingsRate * 100).toFixed(0)}%` },
      consume: { label: '消费稳定性', score: consumeScore, detail: `预算使用率 ${(bud.usedRatio * 100).toFixed(0)}%` },
      debt: { label: '负债压力', score: debtScore, detail: `月供占收入 ${(debtRatio * 100).toFixed(0)}%` },
      risk: { label: '风险水平', score: riskScore, detail: `信用卡使用率 ${(s.cardUtil * 100).toFixed(0)}%` }
    }
  };
}

// 生命周期阶段判断
function lifeStage() {
  const age = now().getFullYear() - 1998;
  const loan = DB.userProfile.loan;
  if (age < 30) {
    return { stage: '成长期', age, focus: '资产积累 + 能力提升', advice: '收入上升期，建议将月结余的 30%~40% 用于定投，尽早建立应急金（3~6 个月生活费）。' };
  } else if (age < 45) {
    return { stage: '稳定期', age, focus: '家庭责任 + 资产配置', advice: '家庭开支高峰期，需平衡房贷、子女教育与养老储备，建议按「短中长期」三层配置资金。' };
  } else {
    return { stage: '退休规划期', age, focus: '养老储备 + 风险收缩', advice: '逐渐降低权益类比例，向稳健型资产倾斜，确保退休后现金流稳定。' };
  }
}

// ------------------------------ 主动式洞察引擎 ------------------------------
function generateInsights() {
  const out = [];
  const s = sessionSnapshot();
  const bud = budgetStatus();

  // 1) 生日临近
  const contacts = DB.userProfile.birthdayContacts || [];
  const d = now();
  const t0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  contacts.forEach((c) => {
    if (!/^\d{2}-\d{2}$/.test(c.birthday)) return;
    const p = c.birthday.split('-').map(Number);
    let target = new Date(d.getFullYear(), p[0] - 1, p[1]);
    if (target < t0) target = new Date(d.getFullYear() + 1, p[0] - 1, p[1]);
    const days = Math.round((target - t0) / 86400000);
    if (days >= 0 && days <= 14) {
      out.push({ type: 'birthday', level: 'info', priority: days <= 3 ? 'high' : 'medium', title: `${c.relation}「${c.name}」${days} 天后生日`, detail: days === 0 ? '就是今天！' : `还有 ${days} 天，可提前锁定资金预订鲜花蛋糕。`, action: 'birthday' });
    }
  });

  // 2) 预算超支/预警
  if (bud.overspent) out.push({ type: 'budget', level: 'warn', priority: 'high', title: `月度预算已超支 ¥${Math.round(Math.abs(bud.remain))}`, detail: `已用 ¥${Math.round(bud.used)} / 预算 ¥${bud.monthLimit}，本月还剩 ${bud.daysLeft} 天。`, action: 'budget' });
  else if (bud.usedRatio > 0.8) out.push({ type: 'budget', level: 'warn', priority: 'medium', title: `预算已用 ${(bud.usedRatio * 100).toFixed(0)}%`, detail: `按当前速度还可维持 ${bud.canLast} 天，建议控制弹性消费。`, action: 'budget' });

  // 3) 异常交易
  const abnormal = (DB.userProfile.recentTxns || []).filter((t) => t.abnormal);
  if (abnormal.length) out.push({ type: 'abnormal', level: 'danger', priority: 'high', title: `检测到 ${abnormal.length} 笔异常交易`, detail: `合计 ¥${abnormal.reduce((s, t) => s + t.amount, 0).toFixed(2)}，含凌晨交易/大额/陌生收款人，建议核查。`, action: 'abnormal' });

  // 4) 订阅即将扣费
  const subs = DB.subscriptions.filter((x) => x.chargeInDays >= 0 && x.chargeInDays <= 3);
  if (subs.length) out.push({ type: 'subscription', level: 'info', priority: 'medium', title: `${subs.length} 项订阅即将自动扣费`, detail: subs.map((x) => `${x.name} ¥${x.price}（${x.chargeInDays} 天后）`).join('、'), action: 'subscribe' });

  // 5) 低使用订阅（省钱机会）
  const idleSubs = DB.subscriptions.filter((x) => x.usage === '低');
  if (idleSubs.length) {
    const save = idleSubs.reduce((s, x) => s + x.price, 0);
    out.push({ type: 'saving', level: 'info', priority: 'medium', title: `发现 ${idleSubs.length} 项低使用订阅，可月省 ¥${save}`, detail: idleSubs.map((x) => x.name).join('、'), action: 'subscribe' });
  }

  // 6) 应急金不足
  if (s.available < s.expense * 3) out.push({ type: 'emergency', level: 'warn', priority: 'medium', title: '应急金不足 3 个月', detail: `当前可用余额 ¥${Math.round(s.available)}，建议逐步补足至 ¥${Math.round(s.expense * 3)}。`, action: 'plan' });

  // 7) 信用卡使用率偏高
  if (s.cardUtil > 0.6) out.push({ type: 'card', level: 'warn', priority: 'low', title: `信用卡使用率 ${(s.cardUtil * 100).toFixed(0)}%`, detail: '超过 60% 可能影响征信评分，建议及时还款或降低使用。', action: 'card' });

  // 按优先级排序
  const rank = { high: 0, medium: 1, low: 2 };
  out.sort((a, b) => (rank[a.priority] - rank[b.priority]));
  DB.insights = out;
  return out;
}

// ------------------------------ 路由 ------------------------------
const routes = {
  // 健康检查
  'GET /api/health': () => ({ ok: true, service: 'bank-core', time: fmtDateTime(now()), version: DB.version }),

  // 完整快照（一次性拉取全部账户数据，减少请求次数）
  'GET /api/snapshot': () => ({
    userProfile: DB.userProfile,
    bills: DB.bills,
    monthlyHistory: DB.monthlyHistory,
    products: DB.products,
    subscriptions: DB.subscriptions,
    contacts: DB.contacts,
    card: DB.card,
    funds: DB.funds,
    assets: { fixed: 100000, fund: 45511, property: 600000 },
    summary: monthSummary(),
    budget: budgetStatus(),
    health: healthScore(),
    lifeStage: lifeStage(),
    insights: generateInsights()
  }),

  // 余额
  'GET /api/balance': () => {
    const d = DB.userProfile.debitCard;
    return { balance: d.balance, available: d.available, frozen: d.frozen };
  },

  // 账单
  'GET /api/bills': () => ({ bills: DB.bills, history: DB.monthlyHistory, summary: monthSummary() }),

  // 理财
  'GET /api/wealth': () => ({ products: DB.products, holdings: DB.userProfile.holdings }),

  // 健康评分
  'GET /api/health-score': () => ({ health: healthScore(), lifeStage: lifeStage() }),

  // 洞察
  'GET /api/insights': () => ({ insights: generateInsights() }),

  // 转账（真实扣减）
  'POST /api/transfer': async (req) => {
    const { payee, amount } = await readBody(req);
    const amt = Number(amount) || 0;
    if (amt <= 0) return { ok: false, error: '金额无效' };
    const d = DB.userProfile.debitCard;
    if (amt > d.available) return { ok: false, error: '余额不足', available: d.available };
    d.available -= amt;
    d.balance -= amt;
    addTxn('expense', amt, `转账给${payee}`, '智能转账');
    const id = Math.max(0, ...DB.userProfile.transferHistory.map((t) => t.id)) + 1;
    DB.userProfile.transferHistory.unshift({ id, payee, account: '****', amount: amt, time: fmtDateTime(now()), status: '已完成', channel: '智能转账' });
    return { ok: true, balance: d.balance, available: d.available, transferId: id };
  },

  // 理财申购（真实扣减余额，增加持仓）
  'POST /api/wealth/buy': async (req) => {
    const { product, amount } = await readBody(req);
    const amt = Number(amount) || 0;
    const p = DB.products.find((x) => x.name === product);
    if (!p) return { ok: false, error: '产品不存在' };
    if (amt < (p.minAmount || 0)) return { ok: false, error: `低于起购金额 ¥${p.minAmount}` };
    const d = DB.userProfile.debitCard;
    if (amt > d.available) return { ok: false, error: '余额不足' };
    d.available -= amt; d.balance -= amt;
    const h = DB.userProfile.holdings.find((x) => x.name === product);
    if (h) { h.amount += amt; h.cost += amt; }
    else DB.userProfile.holdings.push({ name: product, icon: p.icon, amount: amt, cost: amt, profit: 0, profitRate: 0, buyDate: fmtDate(now()), status: '持有中' });
    addTxn('expense', amt, `申购理财-${product}`, '理财申购');
    return { ok: true, balance: d.balance, available: d.available, holdings: DB.userProfile.holdings };
  },

  // 理财赎回
  'POST /api/wealth/redeem': async (req) => {
    const { product, amount } = await readBody(req);
    const h = DB.userProfile.holdings.find((x) => x.name === product);
    if (!h) return { ok: false, error: '无此持仓' };
    const amt = amount ? Number(amount) : h.amount;
    if (amt > h.amount) return { ok: false, error: '赎回金额超过持仓' };
    h.amount -= amt;
    if (h.amount <= 0) DB.userProfile.holdings = DB.userProfile.holdings.filter((x) => x.name !== product);
    const d = DB.userProfile.debitCard;
    d.balance += amt; d.available += amt;
    addTxn('income', amt, `赎回理财-${product}`, '理财赎回');
    return { ok: true, balance: d.balance, available: d.available, holdings: DB.userProfile.holdings };
  },

  // 预算设置
  'POST /api/budget/set': async (req) => {
    const { amount, period } = await readBody(req);
    const amt = Number(amount) || 0;
    if (amt <= 0 || !period) return { ok: false, error: '参数无效' };
    DB.userProfile.budgets = DB.userProfile.budgets || {};
    DB.userProfile.budgets[period] = amt;
    return { ok: true, budgets: DB.userProfile.budgets, budget: budgetStatus() };
  },

  // 创建专项预算（预留资金）
  'POST /api/fund/create': async (req) => {
    const { name, amount, deadline } = await readBody(req);
    const amt = Number(amount) || 0;
    if (amt <= 0) return { ok: false, error: '金额无效' };
    const d = DB.userProfile.debitCard;
    if (amt > d.available) return { ok: false, error: '余额不足' };
    d.available -= amt; d.frozen += amt;
    const id = Math.max(0, ...DB.funds.map((f) => f.id)) + 1;
    DB.funds.push({ id, name, amount: amt, deadline: deadline || null, createdAt: fmtDate(now()), status: '进行中' });
    addTxn('expense', amt, `专项预留-${name}`, '专项预算');
    return { ok: true, funds: DB.funds, balance: d.balance, available: d.available, frozen: d.frozen };
  },

  // 取消订阅
  'POST /api/subscription/cancel': async (req) => {
    const { id } = await readBody(req);
    const idx = DB.subscriptions.findIndex((x) => x.id === Number(id));
    if (idx < 0) return { ok: false, error: '订阅不存在' };
    const sub = DB.subscriptions[idx];
    DB.subscriptions.splice(idx, 1);
    return { ok: true, name: sub.name, subscriptions: DB.subscriptions };
  },

  // 信用卡额度详情（C2/C4：区分申请/审批/生效额度）
  'GET /api/card/limit': () => {
    const c = DB.userProfile.creditCard;
    return {
      ok: true,
      appliedLimit: c.appliedLimit,
      approvedLimit: c.approvedLimit,
      effectiveLimit: c.effectiveLimit != null ? c.effectiveLimit : c.limit,
      limit: c.limit,
      used: c.used,
      available: c.available,
      currentBill: c.currentBill,
      limitUpdatedAt: c.limitUpdatedAt || null,
      applyStatus: c.limitApplyStatus || null
    };
  },

  // 信用卡调额申请（提额/降额都只记录申请，进入复核，不直接改生效额度）
  'POST /api/card/adjust': async (req) => {
    const { target, reason, direction } = await readBody(req);
    const amt = Number(target) || 0;
    const c = DB.userProfile.creditCard;
    const cur = c.effectiveLimit != null ? c.effectiveLimit : c.limit;
    const used = Number(c.used) || 0;
    const minLimit = used; // 最低可调额度严格等于已用额度
    if (amt <= 0) return { ok: false, error: '目标额度无效' };
    if (amt === cur) return { ok: false, error: `目标额度未变化（¥${cur}）` };
    if (amt < minLimit) return { ok: false, error: `目标额度不能低于已用额度 ¥${minLimit}` };
    c.appliedLimit = amt;
    c.limitApplyStatus = '待人工复核';
    c.limitApplyReason = reason || '未填写';
    c.limitApplyDirection = amt > cur ? 'up' : 'down';
    c.limitApplyAt = fmtDateTime(now());
    return {
      ok: true,
      current: cur,
      target: amt,
      direction: c.limitApplyDirection,
      status: '待人工复核',
      note: '调额申请已进入复核审批，审批通过后才生效'
    };
  },

  // 复核通过后生效（提额/降额均支持；降额不得低于已用额度）
  'POST /api/card/limit/approve': async (req) => {
    const { target, reason, direction } = await readBody(req);
    const amt = Number(target) || 0;
    const c = DB.userProfile.creditCard;
    const used = Number(c.used) || 0;
    if (amt <= 0) return { ok: false, error: '目标额度无效' };
    if (amt < used) return { ok: false, error: '目标额度不能低于已用额度' };
    const old = c.effectiveLimit != null ? c.effectiveLimit : c.limit;
    c.effectiveLimit = amt;
    c.limit = amt;
    c.approvedLimit = amt;
    c.appliedLimit = amt;
    c.available = Math.max(0, amt - used);
    c.limitApplyStatus = '已生效';
    c.limitApplyDirection = direction || (amt > old ? 'up' : 'down');
    c.limitApplyReason = reason || c.limitApplyReason || '未填写';
    c.approvedAt = fmtDateTime(now());
    c.limitUpdatedAt = fmtDateTime(now());
    return {
      ok: true,
      current: old,
      target: amt,
      available: c.available,
      used: used,
      status: '已生效',
      direction: c.limitApplyDirection
    };
  },

  // 冻结金额明细（A组）
  'GET /api/balance/frozen': () => {
    const d = DB.userProfile.debitCard;
    const items = d.frozenItems || [];
    const sum = items.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    return {
      ok: true,
      balance: d.balance,
      available: d.available,
      frozen: d.frozen != null ? d.frozen : sum,
      frozenTotal: sum,
      items: items
    };
  },

  // 联系人列表（B2）
  'GET /api/contacts': () => ({ ok: true, contacts: DB.contacts }),

  // 新增联系人（B1：姓名 + 卡号 + 开户行，卡号重复视为已存在）
  'POST /api/contact/add': async (req) => {
    const { name, account, bank, phone } = await readBody(req);
    const nm = String(name || '').trim();
    const acc = String(account || '').replace(/\s+/g, '');
    const bk = String(bank || '').trim();
    if (!nm) return { ok: false, error: '缺少联系人姓名' };
    if (!/^\d{10,25}$/.test(acc)) return { ok: false, error: '银行卡号格式不正确（应为 10-25 位数字）' };
    const exists = DB.contacts.some((c) => c.account.replace(/\s+/g, '') === acc);
    if (exists) return { ok: false, error: `卡号 ${acc.slice(-4).padStart(acc.length, '*')} 已存在于联系人列表中，请勿重复添加` };
    const item = { name: nm, phone: phone || '', account: acc, bank: bk || '未提供开户行' };
    DB.contacts.push(item);
    return { ok: true, contact: item, total: DB.contacts.length };
  },

  // 重置数据
  'POST /api/reset': () => {
    DB = buildDB();
    return { ok: true, message: '数据已重置' };
  }
};

// ------------------------------ 服务器 ------------------------------
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { sendJSON(res, 200, {}); return; }

  const url = new URL(req.url, 'http://localhost');
  const key = `${req.method} ${url.pathname}`;
  const handler = routes[key];

  if (!handler) {
    // 密钥配置单独下发（本机文件优先，其次环境变量）
    if (url.pathname === '/js/config.local.js') { serveKeyConfig(res); return; }
    // 无匹配 API 路由时，尝试作为静态文件服务（单端口部署：前端页面/资源）
    serveStatic(req, res);
    return;
  }
  try {
    const result = await handler(req, res);
    sendJSON(res, 200, result);
  } catch (e) {
    sendJSON(res, 500, { ok: false, error: String(e && e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[bank-core] 模拟银行核心系统已启动: http://127.0.0.1:${PORT}`);
  console.log(`[bank-core] 健康检查: http://127.0.0.1:${PORT}/api/health`);
});
