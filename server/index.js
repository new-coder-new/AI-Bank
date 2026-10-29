// ==========================================================================
//  模拟银行核心系统 · HTTP API 服务（零依赖，纯 Node http 模块）
//  前端通过 fetch 调用这里，所有金融数据读写都在此统一处理，
//  保证"数据准确、可溯源、操作真实生效"。
// ==========================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildDB, fmtDate, fmtDateTime, now } = require('./db');

let DB = buildDB();
const PORT = process.env.PORT || 8787;
const HOST = '0.0.0.0';

// 前端静态资源根目录（单端口部署：由本服务同时提供 API 与静态文件）
const STATIC_ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// 密钥只在服务端使用：优先读环境变量，其次读本地 js/config.local.js。
// 浏览器永远不会拿到真实 Key；前端通过 /api/ai/* 代理调用模型与语音。
// ---------------------------------------------------------------------------
function loadLocalKeys() {
  const out = {
    deepseek: process.env.DEEPSEEK_API_KEY || '',
    siliconflow: process.env.SILICONFLOW_API_KEY || ''
  };
  try {
    const code = fs.readFileSync(path.join(STATIC_ROOT, 'js', 'core', 'config.local.js'), 'utf8');
    const pick = (name) => {
      const m = code.match(new RegExp(name + '\\s*:\\s*[\'"]([^\'"]+)[\'"]'));
      return m ? m[1] : '';
    };
    out.deepseek = out.deepseek || pick('deepseekApiKey');
    out.siliconflow = out.siliconflow || pick('siliconflowApiKey');
  } catch (e) { }
  return out;
}
const AI_KEYS = loadLocalKeys();
const DEEPSEEK_UPSTREAM = 'https://api.deepseek.com/v1/chat/completions';
const SILICONFLOW_UPSTREAM = 'https://api.siliconflow.cn/v1/audio/transcriptions';
const SILICONFLOW_CHAT_UPSTREAM = 'https://api.siliconflow.cn/v1/chat/completions';
const SILICONFLOW_CHAT_MODEL = process.env.SILICONFLOW_MODEL || 'Qwen/Qwen3-30B-A3B-Instruct-2507';
// 对话模型提供方：AI_PROVIDER=siliconflow|deepseek；默认硅基流动（有 Key 时）
const AI_PROVIDER = String(process.env.AI_PROVIDER || (AI_KEYS.siliconflow ? 'siliconflow' : 'deepseek')).toLowerCase();

// 同源会话令牌：写接口必须携带，避免任意网页直接调用转账/重置接口。
const SESSIONS = new Set();
function issueSession() {
  const token = crypto.randomBytes(24).toString('hex');
  SESSIONS.add(token);
  setTimeout(() => SESSIONS.delete(token), 12 * 3600 * 1000).unref();
  return token;
}
function hasValidSession(req) {
  const token = String(req.headers['x-bank-session'] || '');
  return !!token && SESSIONS.has(token);
}
function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // 非浏览器客户端（curl/部署探活）；没有 Cookie，风险由令牌控制
  try {
    return new URL(origin).host === req.headers.host;
  } catch (e) {
    return false;
  }
}

// 简易 AI 限流：防止代理接口被当成免费网关刷额度
const AI_RATE = new Map();
function aiRateLimited(req, bucket, max, windowMs) {
  const ip = (req.socket && req.socket.remoteAddress) || 'unknown';
  const key = bucket + ':' + ip;
  const nowTs = Date.now();
  const arr = (AI_RATE.get(key) || []).filter((t) => nowTs - t < windowMs);
  if (arr.length >= max) { AI_RATE.set(key, arr); return true; }
  arr.push(nowTs);
  AI_RATE.set(key, arr);
  return false;
}

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

// 只暴露前端运行必需的静态资源；server/、logs/、.env、README/package 等一律不可下载
function isAllowedStatic(pathname) {
  if (pathname === '/index.html' || pathname === '/favicon.ico') return true;
  if (pathname.endsWith('config.local.js')) return false;
  return /^\/(css|js|preview)\//.test(pathname);
}

// 提供静态文件（目录穿越防护）
function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    // 畸形 % 转义不能把进程打崩
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  if (!isAllowedStatic(pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  const filePath = path.normalize(path.join(STATIC_ROOT, pathname));
  const rel = path.relative(STATIC_ROOT, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) { // 防目录穿越
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('404 Not Found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
  });
}

// 不再向浏览器下发真实 Key；只告诉前端“走服务端代理”
function serveKeyConfig(res) {
  res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
  res.end('window.__BANK_KEYS__ = {};\nwindow.__BANK_AI_PROXY__ = true;\nwindow.__BANK_ASR_PROXY__ = true;\n' +
    'window.__BANK_MODEL__ = ' + JSON.stringify(AI_PROVIDER === 'siliconflow' ? SILICONFLOW_CHAT_MODEL : (process.env.DEEPSEEK_MODEL || 'deepseek-chat')) + ';\n');
}

// ------------------------------ 工具 ------------------------------
function sendJSON(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });
  res.end(body);
}
function readBody(req, maxBytes) {
  const limit = maxBytes || 1024 * 1024;
  return new Promise((resolve) => {
    let data = '';
    let size = 0;
    let settled = false;
    req.on('data', (c) => {
      if (settled) return;
      size += c.length;
      if (size > limit) {
        settled = true;
        resolve({ __error: '请求体过大' });
        req.destroy();
        return;
      }
      data += c;
    });
    req.on('end', () => {
      if (settled) return;
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { resolve({ __error: 'JSON 格式不正确' }); }
    });
    req.on('error', () => { if (!settled) { settled = true; resolve({ __error: '读取请求失败' }); } });
  });
}
function readRawBody(req, maxBytes) {
  const limit = maxBytes || 25 * 1024 * 1024;
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on('data', (c) => {
      if (settled) return;
      size += c.length;
      if (size > limit) { settled = true; resolve(Buffer.alloc(0)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', () => { if (!settled) { settled = true; resolve(Buffer.alloc(0)); } });
  });
}

// ---------------------------------------------------------------------------
// AI 代理：浏览器只调本服务，真实 Key 留在服务端环境变量/本机文件中
// ---------------------------------------------------------------------------
async function handleAIChat(req, res) {
  if (!isSameOrigin(req)) return sendJSON(res, 403, { error: { message: 'Forbidden' } });
  if (aiRateLimited(req, 'chat', 20, 60000)) return sendJSON(res, 429, { error: { message: '请求过于频繁，请稍后再试' } });
  const useSilicon = AI_PROVIDER === 'siliconflow';
  const chatKey = useSilicon ? AI_KEYS.siliconflow : AI_KEYS.deepseek;
  if (!chatKey) {
    return sendJSON(res, 503, { error: { message: '服务端未配置 ' + (useSilicon ? 'SILICONFLOW_API_KEY' : 'DEEPSEEK_API_KEY') } });
  }
  const body = await readBody(req, 512 * 1024);
  if (body.__error) return sendJSON(res, 400, { error: { message: body.__error } });
  if (!Array.isArray(body.messages) || !body.messages.length) {
    return sendJSON(res, 400, { error: { message: 'messages 不能为空' } });
  }
  const payload = {
    model: useSilicon
      ? SILICONFLOW_CHAT_MODEL
      : (process.env.DEEPSEEK_MODEL || body.model || 'deepseek-chat'),
    messages: body.messages,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    stream: false
  };
  Object.keys(payload).forEach((k) => { if (payload[k] === undefined) delete payload[k]; });
  try {
    const upstream = await fetch(useSilicon ? SILICONFLOW_CHAT_UPSTREAM : DEEPSEEK_UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + chatKey },
      body: JSON.stringify(payload)
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(text);
  } catch (e) {
    sendJSON(res, 502, { error: { message: '模型服务不可用：' + (e && e.message || e) } });
  }
}

async function handleAITranscribe(req, res) {
  if (!isSameOrigin(req)) return sendJSON(res, 403, { error: { message: 'Forbidden' } });
  if (aiRateLimited(req, 'asr', 10, 60000)) return sendJSON(res, 429, { error: { message: '请求过于频繁，请稍后再试' } });
  if (!AI_KEYS.siliconflow) return sendJSON(res, 503, { error: { message: '服务端未配置 SILICONFLOW_API_KEY' } });
  const body = await readRawBody(req, 25 * 1024 * 1024);
  if (!body || !body.length) return sendJSON(res, 400, { error: { message: '音频内容为空或过大' } });
  const contentType = req.headers['content-type'] || 'application/octet-stream';
  try {
    const upstream = await fetch(SILICONFLOW_UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': contentType, 'Authorization': 'Bearer ' + AI_KEYS.siliconflow },
      body: body
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(text);
  } catch (e) {
    sendJSON(res, 502, { error: { message: '语音识别服务不可用：' + (e && e.message || e) } });
  }
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
    const { payee, amount, idempotencyKey } = await readBody(req);
    const amt = Math.round((Number(amount) || 0) * 100) / 100;
    const payeeName = String(payee || '').trim();
    if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: '金额无效' };
    if (!payeeName) return { ok: false, error: '缺少收款人' };
    // 幂等：同一笔提交（双击/重试）只扣一次。只在成功扣款后记录结果，
    // 避免失败请求留下“成功”占位导致重试被误判为已完成。
    const idemKey = idempotencyKey ? 'transfer:' + String(idempotencyKey) : null;
    if (idemKey) {
      DB.__idem = DB.__idem || {};
      if (DB.__idem[idemKey]) return Object.assign({}, DB.__idem[idemKey], { duplicate: true });
      // 清理 10 分钟前的幂等键
      Object.keys(DB.__idem).forEach((k) => {
        if (DB.__idem[k] && Date.now() - (DB.__idem[k].at || 0) > 600000) delete DB.__idem[k];
      });
    }
    const d = DB.userProfile.debitCard;
    if (amt > d.available) return { ok: false, error: '余额不足', available: d.available };
    d.available -= amt;
    d.balance -= amt;
    addTxn('expense', amt, `转账给${payee}`, '智能转账');
    const id = Math.max(0, ...DB.userProfile.transferHistory.map((t) => t.id)) + 1;
    DB.userProfile.transferHistory.unshift({ id, payee: payeeName, account: '****', amount: amt, time: fmtDateTime(now()), status: '已完成', channel: '智能转账' });
    const result = { ok: true, balance: d.balance, available: d.available, transferId: id };
    if (idemKey && DB.__idem) DB.__idem[idemKey] = Object.assign({ at: Date.now() }, result);
    return result;
  },

  // 撤销转账（修正收款人/撤销记录时，后端也要把钱退回，避免刷新后被扣两次）
  'POST /api/transfer/reverse': async (req) => {
    const { payee, amount } = await readBody(req);
    const amt = Math.round((Number(amount) || 0) * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: '撤销金额无效' };
    const rec = DB.userProfile.transferHistory.find((t) =>
      t.payee === String(payee || '').trim() && Number(t.amount) === amt && t.status === '已完成');
    if (!rec) return { ok: false, error: '未找到可撤销的转账记录' };
    rec.status = '已撤销';
    rec.revokedAt = fmtDateTime(now());
    const d = DB.userProfile.debitCard;
    d.balance = Math.round((d.balance + amt) * 100) / 100;
    d.available = Math.round((d.available + amt) * 100) / 100;
    addTxn('income', amt, `转账撤销-${rec.payee}（原路退回）`, '转账撤销');
    return { ok: true, balance: d.balance, available: d.available, transferId: rec.id };
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
    const prodDef = DB.products.find((x) => x.name === product) || {};
    const closedDays = Number(prodDef.closedDays) || 0;
    if (closedDays > 0 && h.buyDate) {
      const buyTs = new Date(String(h.buyDate) + 'T00:00:00').getTime();
      const heldDays = isNaN(buyTs) ? closedDays : Math.floor((Date.now() - buyTs) / 86400000);
      if (heldDays < closedDays) {
        return { ok: false, error: `封闭期未满（已持有 ${heldDays} 天 / 需 ${closedDays} 天），暂不可赎回` };
      }
    }
    // 省略 amount 表示全额赎回；显式传 0/负数/非数字一律拒绝，避免“0 元赎回全部”
    const amt = (amount === undefined || amount === null || amount === '')
      ? h.amount
      : Math.round((Number(amount) || 0) * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: '赎回金额必须大于 0' };
    if (amt > h.amount + 0.001) return { ok: false, error: '赎回金额超过持仓' };

    // 按赎回比例结算收益：全额赎回时累计收益必须兑付，不能凭空消失
    const ratio = amt / h.amount;
    const profitPart = Math.round(((Number(h.profit) || 0) * ratio) * 100) / 100;
    const remain = Math.round((h.amount - amt) * 100) / 100;
    h.amount = remain;
    h.cost = Math.max(0, Math.round(((Number(h.cost) || 0) - amt) * 100) / 100);
    h.profit = Math.round(((Number(h.profit) || 0) - profitPart) * 100) / 100;
    h.profitRate = h.cost > 0 ? Math.round((h.profit / h.cost) * 10000) / 100 : 0;
    if (remain <= 0) DB.userProfile.holdings = DB.userProfile.holdings.filter((x) => x.name !== product);

    const credited = Math.round((amt + profitPart) * 100) / 100;
    const d = DB.userProfile.debitCard;
    d.balance = Math.round((d.balance + credited) * 100) / 100;
    d.available = Math.round((d.available + credited) * 100) / 100;
    addTxn('income', credited, `赎回理财-${product}`, '理财赎回');
    return {
      ok: true, balance: d.balance, available: d.available,
      credited, profit: profitPart, remain, holdings: DB.userProfile.holdings
    };
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
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch (e) { res.writeHead(400); res.end('Bad Request'); return; }
  const pathname = url.pathname;

  // 会话令牌：前端启动时领取，写接口和快照都必须携带
  if (pathname === '/api/session') {
    if (!isSameOrigin(req)) return sendJSON(res, 403, { ok: false, error: 'Forbidden' });
    return sendJSON(res, 200, { ok: true, token: issueSession() });
  }

  // AI 代理（真实 Key 只在服务端）
  if (pathname === '/api/ai/chat') { await handleAIChat(req, res); return; }
  if (pathname === '/api/ai/transcribe') { await handleAITranscribe(req, res); return; }

  // 无真实 Key 的配置脚本
  if (pathname === '/js/core/config.local.js') { serveKeyConfig(res); return; }

  // API 统一鉴权：/api/health 保持公开，其余必须同源 + 有效会话令牌
  if (pathname.startsWith('/api/')) {
    if (pathname !== '/api/health') {
      if (!isSameOrigin(req)) return sendJSON(res, 403, { ok: false, error: 'Forbidden' });
      if (!hasValidSession(req)) return sendJSON(res, 401, { ok: false, error: '会话已失效，请刷新页面' });
    }
  }

  const key = `${req.method} ${pathname}`;
  const handler = routes[key];

  if (!handler) {
    if (pathname.startsWith('/api/')) return sendJSON(res, 404, { ok: false, error: '接口不存在' });
    // 非 API 请求作为静态文件服务（白名单）
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
