// ==========================================================================
//  模拟银行核心系统 · HTTP API 服务（零依赖，纯 Node http 模块）
//  前端通过 fetch 调用这里，所有金融数据读写都在此统一处理，
//  保证"数据准确、可溯源、操作真实生效"。
// ==========================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildDB, fmtDate, fmtDateTime, now, loadDB, saveDB, dbFilePath, appendLedger, queryLedger } = require('./db');

// 有 data/db.json 就读回上次的数据，没有才用初始种子
let DB = loadDB();
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
const SESSIONS = new Map();
function issueSession(req) {
  const token = crypto.randomBytes(24).toString('hex');
  const ua = String((req && req.headers && req.headers['user-agent']) || '').slice(0, 160);
  SESSIONS.set(token, { ua: ua, exp: Date.now() + 12 * 3600 * 1000 });
  setTimeout(() => SESSIONS.delete(token), 12 * 3600 * 1000).unref();
  return token;
}
function hasValidSession(req) {
  const token = String(req.headers['x-bank-session'] || '');
  const rec = SESSIONS.get(token);
  if (!rec) return false;
  if (rec.exp < Date.now()) { SESSIONS.delete(token); return false; }
  // 令牌与签发时的浏览器 UA 绑定：令牌被拷到别处使用会失效
  const ua = String((req.headers && req.headers['user-agent']) || '').slice(0, 160);
  if (rec.ua && ua && rec.ua !== ua) return false;
  return true;
}

// 严格同源：浏览器页面（带 Origin 或 Referer）且 host 必须一致；
// 两者都没有（curl / 匿名脚本）一律拒绝，避免匿名客户端领取令牌直接调用资金接口。
function isSameOriginStrict(req) {
  const host = String(req.headers.host || '');
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  function hostOf(u) {
    try { return new URL(u).host; } catch (e) { return ''; }
  }
  if (origin) return hostOf(origin) === host;
  if (referer) return hostOf(referer) === host;
  return false;
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
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(self), camera=()',
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
  if (!isSameOriginStrict(req)) return sendJSON(res, 403, { error: { message: 'Forbidden' } });
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
  if (!isSameOriginStrict(req)) return sendJSON(res, 403, { error: { message: 'Forbidden' } });
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


// 赎回到账结算：到达预计到账日（T+1）后把本息计入活期可用余额
function settlePendingRedemptions(db) {
  try {
    const u = db.userProfile || {};
    const list = u.pendingRedemptions || [];
    if (!list.length) return 0;
    const today = fmtDate(now());
    const d = u.debitCard || {};
    let settled = 0;
    list.forEach((r) => {
      if (!r || r.status !== '到账中') return;
      if (!r.arriveDate || String(r.arriveDate) > today) return;
      const credited = Number(r.credited) || 0;
      d.balance = Math.round(((Number(d.balance) || 0) + credited) * 100) / 100;
      d.available = Math.round(((Number(d.available) || 0) + credited) * 100) / 100;
      addTxn('income', credited, '赎回到账-' + r.product, '理财赎回');
      r.status = '已到账';
      r.settledDate = today;
      settled++;
    });
    return settled;
  } catch (e) { return 0; }
}


// 资金类接口频控（按 IP 的滑动窗口）
const FUND_RATE = new Map();

function fundRateLimited(req, bucket, max, windowMs) {
  const ip = (req.socket && req.socket.remoteAddress) || 'unknown';
  const key = bucket + ':' + ip;
  const nowTs = Date.now();
  const arr = (FUND_RATE.get(key) || []).filter((t) => nowTs - t < windowMs);
  if (arr.length >= max) { FUND_RATE.set(key, arr); return true; }
  arr.push(nowTs);
  FUND_RATE.set(key, arr);
  return false;
}

// T3 服务端验证令牌：客户端验证（密码/短信/指纹）通过后才签发，5 分钟有效、一次性

// 资金审计日志：记录每一笔关键资金动作（谁、何时、多少、来源 IP、结果）

// 卡号脱敏：保留前 4 后 4，其余用 * 代替（服务端统一处理，前端不再拿到完整卡号）
function maskCardNumber(num) {
  const digits = String(num || '').replace(/\s+/g, '');
  if (digits.length <= 8) return digits;
  return digits.slice(0, 4) + ' **** **** ' + digits.slice(-4);
}



// —— 服务端价目表（金额以此为准，前端传的 price 仅作参考被忽略）——
const SRV_FLOWER_BOUQUETS = { '简约玫瑰': 299, '向日葵花束': 168, '混搭小花束': 159, '康乃馨礼盒': 128, '百合礼盒': 199, '郁金香花束': 229 };
const SRV_FLOWER_CAKES = { '无蛋糕': 0, '6寸水果蛋糕': 168, '8寸奶油蛋糕': 228 };
const SRV_SUB_PRESETS = {
  '某易云 VIP': { '/月': 25, '/季': 60, '/年': 150 },
  '某讯 VIP': { '/月': 30, '/季': 80, '/年': 200 },
  '某度网盘 VIP': { '/月': 40, '/季': 120, '/年': 300 }
};
function srvSubNormName(s) { return String(s || '').replace(/\s/g, ''); }

// —— 服务端风控判定（前端只负责展示，不再自己判档）——
function srvAssessRisk(payee, amount) {
  const reasons = [];
  let score = 0;
  const contacts = DB.contacts || [];
  const known = contacts.some((c) => c.name === payee);
  const history = (DB.userProfile && DB.userProfile.transferHistory) || [];
  const paidBefore = history.some((t) => t.payee === payee);
  const avg = history.length ? history.reduce((s, t) => s + (Number(t.amount) || 0), 0) / history.length : 0;
  const ratio = avg > 0 ? amount / avg : 0;

  if (!known) { score += 40; reasons.push('收款人为新联系人'); }
  if (!paidBefore) { score += 22; reasons.push('该联系人首次交易'); }
  if (ratio >= 3) { score += Math.min(28, Math.round((ratio - 2) * 5)); reasons.push('金额高于历史平均 ' + ratio.toFixed(1) + ' 倍'); }
  if (amount >= 100000) { score += 55; reasons.push('单笔金额达到 T4 大额标准'); }
  else if (amount >= 10000) { score += 35; reasons.push('单笔金额达到 T3 档位'); }
  else if (amount >= 1000) { score += 15; reasons.push('单笔金额达到 T2 档位'); }
  if (ratio >= 10) { score += 10; reasons.push('金额远超历史水平'); }
  const h = new Date().getHours();
  if (h >= 0 && h < 6) { score += 15; reasons.push('凌晨时段交易'); }
  score = Math.min(99, score);
  const level = score >= 60 ? 'high' : (score >= 30 ? 'medium' : 'low');
  return { score, level, reasons, known, paidBefore, ratio };
}

function srvTier(amount, risk) {
  const a = Number(amount) || 0;
  let key = a >= 100000 ? 'T4' : (a >= 10000 ? 'T3' : (a >= 1000 ? 'T2' : 'T1'));
  // 可疑度只抬高、不降低
  const map = { low: 0, medium: 2, high: 3 };
  const rankByKey = { T1: 1, T2: 2, T3: 3, T4: 4 };
  const minRank = map[(risk && risk.level) || 'low'] || 0;
  if (rankByKey[key] < minRank) key = Object.keys(rankByKey).filter((k) => rankByKey[k] === minRank)[0] || key;
  const table = {
    T1: { name: '指纹/密码确认', needPassword: true, needOtp: false, needFace: false, needManual: false },
    T2: { name: '短信验证码', needPassword: false, needOtp: true, needFace: false, needManual: false },
    T3: { name: '短信验证码+人脸', needPassword: false, needOtp: true, needFace: true, needManual: false },
    T4: { name: '短信+人脸+人工复核', needPassword: false, needOtp: true, needFace: true, needManual: true }
  };
  return Object.assign({ key: key, rank: rankByKey[key] }, table[key]);
}

function auditLog(db, action, detail) {
  try {
    db.auditLog = db.auditLog || [];
    const ip = (detail && detail.ip) || '';
    const entry = Object.assign({ at: fmtDateTime(now()), action: action, ip: ip }, detail || {});
    db.auditLog.unshift(entry);
    if (db.auditLog.length > 500) db.auditLog.length = 500;
    // 同时落一行到 SQLite ledger，便于按时间/动作查询
    try { appendLedger(entry); } catch (e) { /* 落库失败不影响业务 */ }
  } catch (e) { /* 审计失败不影响业务 */ }
}

const VERIFY_TOKENS = new Map();
const VERIFY_TTL = 5 * 60 * 1000;
function issueVerifyToken(purpose) {
  const token = crypto.randomBytes(18).toString('hex');
  VERIFY_TOKENS.set(token, { purpose: purpose || 'fund', exp: Date.now() + VERIFY_TTL });
  return token;
}
function consumeVerifyToken(req) {
  const token = String(req.headers['x-bank-verify'] || '');
  if (!token) return false;
  const rec = VERIFY_TOKENS.get(token);
  if (!rec || rec.exp < Date.now()) { VERIFY_TOKENS.delete(token); return false; }
  VERIFY_TOKENS.delete(token);   // 一次性
  return true;
}
// 演示密码（可用环境变量覆盖）

const DEMO_PIN = process.env.BANK_DEMO_PIN || '123456';

// ------------------------------ 路由 ------------------------------
const routes = {
  // 健康检查
  'GET /api/health': () => { settlePendingRedemptions(DB); return { ok: true, service: 'bank-core', time: fmtDateTime(now()), version: DB.version }; },

  // 完整快照（一次性拉取全部账户数据，减少请求次数）
  'GET /api/snapshot': () => (settlePendingRedemptions(DB), {
    userProfile: (function () {
      // 快照脱敏：卡号不外发完整值
      const u = JSON.parse(JSON.stringify(DB.userProfile));
      if (u.debitCard && u.debitCard.number) u.debitCard.number = maskCardNumber(u.debitCard.number);
      if (u.creditCard && u.creditCard.number) u.creditCard.number = maskCardNumber(u.creditCard.number);
      (u.creditCards || []).forEach((c) => { if (c && c.number) c.number = maskCardNumber(c.number); });
      return u;
    })(),
    bills: DB.bills,
    monthlyHistory: DB.monthlyHistory,
    products: DB.products,
    subscriptions: DB.subscriptions,
    contacts: DB.contacts,
    clientState: DB.clientState,
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

  // 资金审计日志（最近 200 条）
  'GET /api/audit': () => ({ ok: true, items: (DB.auditLog || []).slice(0, 200) }),

  // 资金流水（SQLite ledger 表，最近 N 条）
  'GET /api/ledger': (req) => {
    const u = new URL(req.url, 'http://localhost');
    return { ok: true, items: queryLedger(u.searchParams.get('limit') || 50) };
  },




  // 退出登录：销毁当前会话令牌
  'POST /api/logout': (req) => {
    const token = String(req.headers['x-bank-session'] || '');
    if (token) SESSIONS.delete(token);
    return { ok: true };
  },

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
  // 资金验证令牌签发（客户端安全验证通过后调用，5 分钟有效、一次性）
  'POST /api/verify/issue': async (req) => {
    const { pin } = await readBody(req);
    if (String(pin || '') !== DEMO_PIN) return { ok: false, error: '验证失败' };
    return { ok: true, verifyToken: issueVerifyToken('fund'), expiresIn: Math.floor(VERIFY_TTL / 1000) };
  },


  // 转账预判：服务端计算风控分与档位，返回需要哪些验证（不动账）
  'POST /api/transfer/prepare': async (req) => {
    const { payee, amount, channel } = await readBody(req);
    const amt = Math.round((Number(amount) || 0) * 100) / 100;
    const payeeName = String(payee || '').trim();
    if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: '金额无效' };
    if (!payeeName) return { ok: false, error: '缺少收款人' };
    if (amt > 100000000) return { ok: false, error: '金额超出单笔上限（¥100,000,000）' };
    if (payeeName.length > 40) return { ok: false, error: '收款人名称过长' };
    const tl = DB.userProfile.txnLimit || {};
    const single = Number(tl.single) || 0;
    if (single > 0 && amt > single) return { ok: false, error: '超过单笔限额 ¥' + single };
    const d = DB.userProfile.debitCard;
    if (amt > d.available) return { ok: false, error: '余额不足', available: d.available, shortage: Math.round((amt - d.available) * 100) / 100 };
    const risk = srvAssessRisk(payeeName, amt);
    const tier = srvTier(amt, risk);
    return { ok: true, amount: amt, payee: payeeName, channel: channel || '智能转账', risk: risk, tier: tier, available: d.available };
  },

  'POST /api/transfer': async (req) => {
    const { payee, amount, idempotencyKey } = await readBody(req);
    const amt = Math.round((Number(amount) || 0) * 100) / 100;
    const payeeName = String(payee || '').trim();
    if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: '金额无效' };
    if (amt > 100000000) return { ok: false, error: '金额超出单笔上限（¥100,000,000）' };
    if (String(payee || '').length > 40) return { ok: false, error: '收款人名称过长' };
    if (!payeeName) return { ok: false, error: '缺少收款人' };
    // 交易限额（用户在卡片管理里设置的单笔/日累计限额）
    const tl = DB.userProfile.txnLimit || {};
    const singleLimit = Number(tl.single) || 0;
    const dailyLimit = Number(tl.daily) || 0;
    if (singleLimit > 0 && amt > singleLimit) {
      return { ok: false, error: '超过单笔限额 ¥' + singleLimit + '（本次 ¥' + amt + '）' };
    }
    if (dailyLimit > 0) {
      const todayStr = fmtDate(now());
      if (!DB.userProfile.transferDaily || DB.userProfile.transferDaily.date !== todayStr) {
        DB.userProfile.transferDaily = { date: todayStr, amount: 0 };
      }
      const spent = Number(DB.userProfile.transferDaily.amount) || 0;
      if (spent + amt > dailyLimit) {
        return { ok: false, error: '超过每日限额 ¥' + dailyLimit + '（今日已转 ¥' + spent + '）' };
      }
    }
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
    // 服务端独立判定：≥ ¥5,000（T3）必须携带一次性的验证令牌
    if (amt >= 1000 && !consumeVerifyToken(req)) {
      return { ok: false, error: '需要安全验证（金额达到短信验证档）' };
    }
    // ≥ ¥50,000（T4）：不直接扣款，转服务端人工复核
    if (amt >= 100000) {
      DB.userProfile.manualReviews = DB.userProfile.manualReviews || [];
      const reviewId = 'SRV' + Date.now();
      DB.userProfile.manualReviews.unshift({
        id: reviewId,
        purpose: '大额转账（' + payeeName + '）',
        amount: amt,
        status: '待人工复核',
        submittedAt: fmtDateTime(now()),
        source: 'Server',
        actions: [{ tool: 'transfer.execute', args: { payee: payeeName, amount: amt } }],
        note: '服务端拦截：大额交易需人工复核，未扣款'
      });
      auditLog(DB, 'transfer.pending_review', { amount: amt, target: payeeName, ip: (req.socket && req.socket.remoteAddress) || '', result: 'pending' });
      return { ok: false, pendingReview: true, reviewId: reviewId, error: '大额交易已提交人工复核，未扣款' };
    }
    const d = DB.userProfile.debitCard;
    if (amt > d.available) return { ok: false, error: '余额不足', available: d.available };
    d.available -= amt;
    d.balance -= amt;
    addTxn('expense', amt, `转账给${payee}`, '智能转账');
    const id = Math.max(0, ...DB.userProfile.transferHistory.map((t) => t.id)) + 1;
    DB.userProfile.transferHistory.unshift({ id, payee: payeeName, account: '****', amount: amt, time: fmtDateTime(now()), status: '已完成', channel: '智能转账' });
    if (dailyLimit > 0) {
      DB.userProfile.transferDaily.amount = Math.round(((Number(DB.userProfile.transferDaily.amount) || 0) + amt) * 100) / 100;
    }
    auditLog(DB, 'transfer.execute', { amount: amt, target: payeeName, ip: (req.socket && req.socket.remoteAddress) || '', result: 'ok' });
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
    const { product, amount, idempotencyKey } = await readBody(req);
    const amt = Number(amount) || 0;
    if (amt >= 1000 && !consumeVerifyToken(req)) return { ok: false, error: '需要安全验证（金额达到短信验证档）' };
    if (idempotencyKey) {
      DB.__idem = DB.__idem || {};
      const k = 'buy:' + String(idempotencyKey);
      if (DB.__idem[k]) return Object.assign({}, DB.__idem[k], { duplicate: true });
    }
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
    const __res = { ok: true, balance: d.balance, available: d.available, holdings: DB.userProfile.holdings };
    auditLog(DB, 'wealth.buy', { amount: amt, target: String(product || ''), ip: (req.socket && req.socket.remoteAddress) || '', result: 'ok' });
    if (idempotencyKey && DB.__idem) DB.__idem['buy:' + String(idempotencyKey)] = Object.assign({ at: Date.now() }, __res);
    return __res;
  },

  // 理财赎回
  'POST /api/wealth/redeem': async (req) => {
    const { product, amount, idempotencyKey } = await readBody(req);
    if (Number(amount) >= 1000 && !consumeVerifyToken(req)) return { ok: false, error: '需要安全验证（金额达到短信验证档）' };
    if (idempotencyKey) {
      DB.__idem = DB.__idem || {};
      const k = 'redeem:' + String(idempotencyKey);
      if (DB.__idem[k]) return Object.assign({}, DB.__idem[k], { duplicate: true });
    }
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
    // 开放式基金赎回按 T+1 到账：提交时只在途，T+1 再回到活期可用余额
    DB.userProfile.pendingRedemptions = DB.userProfile.pendingRedemptions || [];
    const arriveDate = fmtDate(new Date(Date.now() + 24 * 3600 * 1000));
    DB.userProfile.pendingRedemptions.push({
      id: 'RD' + Date.now(),
      product, principal: amt, profit: profitPart, credited,
      submitDate: fmtDate(now()), arriveDate, status: '到账中'
    });
    settlePendingRedemptions(DB);
    return {
      ok: true, balance: d.balance, available: d.available,
      credited, profit: profitPart, remain, arriveDate, pending: true,
      pendingRedemptions: DB.userProfile.pendingRedemptions,
      holdings: DB.userProfile.holdings
    };
  },


  // 鲜花下单（服务端扣款为权威：储蓄卡扣余额 / 信用卡占额度；同一人同一天禁止重复下单）
  'POST /api/flower/order': async (req) => {
    const body = await readBody(req);
    const u = DB.userProfile;
    const o = {
      recipient: String(body.recipient || '').trim(),
      phone: String(body.phone || '').trim(),
      address: String(body.address || '').trim(),
      bouquet: String(body.bouquet || '').trim(),
      cake: String(body.cake || '无蛋糕'),
      date: String(body.date || '').trim(),
      slot: String(body.slot || '').trim(),
      card: String(body.card || '').slice(0, 30),
      payMethod: body.payMethod === '信用卡' ? '信用卡' : '储蓄卡',
      price: Math.round((Number(body.price) || 0) * 100) / 100,
      cakePrice: Math.round((Number(body.cakePrice) || 0) * 100) / 100,
      bouquetPrice: Math.round((Number(body.bouquetPrice) || 0) * 100) / 100
    };
    // 金额以服务端价目表为准（不信任前端传入的 price）
    const bqPrice = SRV_FLOWER_BOUQUETS[o.bouquet];
    const cakePrice = SRV_FLOWER_CAKES[o.cake] != null ? SRV_FLOWER_CAKES[o.cake] : null;
    if (bqPrice == null) return { ok: false, error: '花束款式无效' };
    if (cakePrice == null) return { ok: false, error: '蛋糕选项无效' };
    o.bouquetPrice = bqPrice;
    o.cakePrice = cakePrice;
    o.price = Math.round((bqPrice + cakePrice) * 100) / 100;
    if (!o.recipient || !o.date || !(o.price > 0)) return { ok: false, error: '缺少收花人/日期或金额无效' };
    const contact = (DB.contacts || []).some((c) => c.name === o.recipient);
    if (!contact) return { ok: false, error: '收花人必须是联系人' };

    u.flowerOrders = u.flowerOrders || [];
    const dup = u.flowerOrders.some((x) => x && x.status === '待配送' && x.recipient === o.recipient && x.date === o.date);
    if (dup) return { ok: false, error: '同一人同一天已有待配送订单，不能重复下单' };

    const d = u.debitCard;
    const c = u.creditCard || {};
    if (o.payMethod === '储蓄卡') {
      if (o.price > Number(d.available)) return { ok: false, error: '储蓄卡可用余额不足' };
      d.available = Math.round((Number(d.available) - o.price) * 100) / 100;
      d.balance = Math.round((Number(d.balance) - o.price) * 100) / 100;
      addTxn('expense', o.price, '鲜花订单-' + o.recipient + '(' + o.bouquet + ')', '鲜花订购');
    } else {
      if (o.price > Number(c.available)) return { ok: false, error: '信用卡可用额度不足' };
      c.available = Math.round((Number(c.available) - o.price) * 100) / 100;
      c.used = Math.round(((Number(c.used) || 0) + o.price) * 100) / 100;
      c.currentBill = Math.round(((Number(c.currentBill) || 0) + o.price) * 100) / 100;
      c.minPayment = Math.round(c.currentBill * 10) / 100;
    }

    const order = Object.assign({}, o, {
      id: 'F' + Date.now(),
      paid: true,
      paidAmount: o.price,
      status: '待配送',
      createdAt: fmtDateTime(now())
    });
    u.flowerOrders.unshift(order);
    auditLog(DB, 'flower.order', { amount: o.price, target: o.recipient, ip: (req.socket && req.socket.remoteAddress) || '', result: 'ok' });
    return { ok: true, order: order, orders: u.flowerOrders, balance: d.balance, available: d.available };
  },

  // 取消鲜花订单（待配送可取消，原路退款/释放额度）
  'POST /api/flower/cancel': async (req) => {
    const { id } = await readBody(req);
    const u = DB.userProfile;
    u.flowerOrders = u.flowerOrders || [];
    const order = u.flowerOrders.find((x) => x && x.id === String(id));
    if (!order) return { ok: false, error: '订单不存在' };
    if (order.status !== '待配送') return { ok: false, error: '该订单当前状态不可取消' };
    const amount = Number(order.paidAmount || order.price) || 0;
    const d = u.debitCard;
    const c = u.creditCard || {};
    if (order.payMethod === '信用卡') {
      c.available = Math.round((Number(c.available) + amount) * 100) / 100;
      c.used = Math.max(0, Math.round(((Number(c.used) || 0) - amount) * 100) / 100);
      c.currentBill = Math.max(0, Math.round(((Number(c.currentBill) || 0) - amount) * 100) / 100);
    } else {
      d.available = Math.round((Number(d.available) + amount) * 100) / 100;
      d.balance = Math.round((Number(d.balance) + amount) * 100) / 100;
      addTxn('income', amount, '鲜花订单退款-' + order.recipient, '鲜花订购');
    }
    order.status = '已取消';
    order.cancelledAt = fmtDateTime(now());
    auditLog(DB, 'flower.cancel', { amount: amount, target: order.recipient, ip: (req.socket && req.socket.remoteAddress) || '', result: 'ok' });
    return { ok: true, orders: u.flowerOrders, balance: d.balance, available: d.available };
  },

  // 订阅添加（服务端扣首期费用为权威）
  'POST /api/subscription/add': async (req) => {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const cycle = String(body.cycle || '/月').trim();
    let price = Math.round((Number(body.price) || 0) * 100) / 100;
    const autoRenew = body.autoRenew !== false;
    if (!name) return { ok: false, error: '缺少服务名' };
    let presetPrices = null;
    Object.keys(SRV_SUB_PRESETS).forEach(function (k) {
      if (srvSubNormName(k) === srvSubNormName(name)) presetPrices = SRV_SUB_PRESETS[k];
    });
    if (presetPrices) {
      const official = presetPrices[cycle];
      if (official == null) return { ok: false, error: '扣费周期无效' };
      price = official;   // 以服务端价目表为准
    } else if (!(price > 0) || price > 10000) {
      return { ok: false, error: '价格无效' };
    }
    DB.subscriptions = DB.subscriptions || [];
    const dupSub = DB.subscriptions.some((x) => x && String(x.name || '').replace(/\s/g, '') === name.replace(/\s/g, ''));
    if (dupSub) return { ok: false, error: '已有有效订阅，无需重复添加' };
    const d = DB.userProfile.debitCard;
    if (price > Number(d.available)) return { ok: false, error: '可用余额不足，订阅未开通' };
    d.available = Math.round((Number(d.available) - price) * 100) / 100;
    d.balance = Math.round((Number(d.balance) - price) * 100) / 100;
    addTxn('expense', price, '订阅- ' + name + '（' + cycle + '）', '订阅管理');
    const sub = { id: Date.now(), name: name, cycle: cycle, price: price, autoRenew: autoRenew, createdAt: fmtDateTime(now()) };
    DB.subscriptions.push(sub);
    auditLog(DB, 'subscription.add', { amount: price, target: name, ip: (req.socket && req.socket.remoteAddress) || '', result: 'ok' });
    return { ok: true, subscription: sub, subscriptions: DB.subscriptions, balance: d.balance, available: d.available };
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
    const { name, amount, deadline, idempotencyKey } = await readBody(req);
    const amt = Number(amount) || 0;
    if (amt <= 0) return { ok: false, error: '金额无效' };
    if (idempotencyKey) {
      DB.__idem = DB.__idem || {};
      const k = 'fund:' + String(idempotencyKey);
      if (DB.__idem[k]) return Object.assign({}, DB.__idem[k], { duplicate: true });
    }
    if (amt >= 1000 && !consumeVerifyToken(req)) return { ok: false, error: '需要安全验证（金额达到短信验证档）' };
    const d = DB.userProfile.debitCard;
    if (amt > d.available) return { ok: false, error: '余额不足' };
    d.available -= amt; d.frozen += amt;
    const id = Math.max(0, ...DB.funds.map((f) => f.id)) + 1;
    DB.funds.push({ id, name, amount: amt, deadline: deadline || null, createdAt: fmtDate(now()), status: '进行中' });
    addTxn('expense', amt, `专项预留-${name}`, '专项预算');
    auditLog(DB, 'fund.create', { amount: amt, target: String(name || ''), ip: (req.socket && req.socket.remoteAddress) || '', result: 'ok' });
    const __fundRes = { ok: true, funds: DB.funds, balance: d.balance, available: d.available, frozen: d.frozen };
    if (idempotencyKey && DB.__idem) DB.__idem['fund:' + String(idempotencyKey)] = Object.assign({ at: Date.now() }, __fundRes);
    return __fundRes;
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
    const { target, reason, direction, idempotencyKey } = await readBody(req);
    if (idempotencyKey) {
      DB.__idem = DB.__idem || {};
      const k = 'limitApprove:' + String(idempotencyKey);
      if (DB.__idem[k]) return Object.assign({}, DB.__idem[k], { duplicate: true });
    }
    const amt = Number(target) || 0;
    const c = DB.userProfile.creditCard;
    const used = Number(c.used) || 0;
    // 审批会真的改额度：必须过一次安全验证，且只能审批处于「待人工复核」的申请
    if (!consumeVerifyToken(req)) return { ok: false, error: '需要安全验证（人工审核）' };
    if (c.limitApplyStatus !== '待人工复核') return { ok: false, error: '没有待复核的调额申请' };
    if (c.appliedLimit != null && Number(c.appliedLimit) !== amt) {
      return { ok: false, error: '审批额度与申请额度不一致' };
    }
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
    auditLog(DB, 'card.limit.approve', { amount: amt, target: 'creditCard', ip: (req.socket && req.socket.remoteAddress) || '', result: 'ok' });
    const __approveRes = {
      ok: true,
      current: old,
      target: amt,
      available: c.available,
      used: used,
      status: '已生效',
      direction: c.limitApplyDirection
    };
    if (idempotencyKey && DB.__idem) DB.__idem['limitApprove:' + String(idempotencyKey)] = Object.assign({ at: Date.now() }, __approveRes);
    return __approveRes;
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

  // 保存前端业务流水：鲜花订单 / 定时转账 / 预算（换设备、清缓存后可恢复）
  'POST /api/clientstate': async (req) => {
    const body = await readBody(req);
    const cur = DB.clientState || (DB.clientState = { flowerOrders: [], scheduledTransfers: [], budgets: {} });
    if (Array.isArray(body && body.flowerOrders)) cur.flowerOrders = body.flowerOrders;
    if (Array.isArray(body && body.scheduledTransfers)) cur.scheduledTransfers = body.scheduledTransfers;
    if (body && body.budgets && typeof body.budgets === 'object' && !Array.isArray(body.budgets)) cur.budgets = body.budgets;
    return { ok: true, counts: { flowerOrders: (cur.flowerOrders || []).length, scheduledTransfers: (cur.scheduledTransfers || []).length } };
  },

  // 整表保存联系人（前端增删改后同步，服务端与本地不再分叉）
  'POST /api/contacts/save': async (req) => {
    const body = await readBody(req);
    const list = Array.isArray(body && body.contacts) ? body.contacts : null;
    if (!list) return { ok: false, error: '缺少 contacts 数组' };
    DB.contacts = list.filter((c) => c && String(c.name || '').trim()).map((c) => ({
      name: String(c.name).trim(),
      phone: String(c.phone || '').trim(),
      phoneFull: String(c.phoneFull || '').trim(),
      account: String(c.account || '').replace(/\s+/g, ''),
      bank: String(c.bank || '').trim(),
      relation: String(c.relation || '').trim(),
      birthday: String(c.birthday || '').trim(),
      remark: String(c.remark || '').trim()
    }));
    return { ok: true, total: DB.contacts.length };
  },

  // 删除一位联系人（按姓名或卡号）
  'POST /api/contact/delete': async (req) => {
    const body = await readBody(req);
    const nm = String((body && body.name) || '').trim();
    const acc = String((body && body.account) || '').replace(/\s+/g, '');
    if (!nm && !acc) return { ok: false, error: '缺少姓名或卡号' };
    const before = DB.contacts.length;
    DB.contacts = DB.contacts.filter((c) => {
      if (nm && String(c.name || '').trim() === nm) return false;
      if (acc && String(c.account || '').replace(/\s+/g, '') === acc) return false;
      return true;
    });
    return { ok: true, removed: before - DB.contacts.length, total: DB.contacts.length };
  },

  // 重置数据
  'POST /api/reset': (req) => {
    const adminToken = process.env.BANK_ADMIN_TOKEN;
    if (adminToken && String(req.headers['x-bank-admin'] || '') !== adminToken) {
      return { ok: false, error: '需要管理员令牌' };
    }
    DB = buildDB();
    saveDB(DB);
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

  // 会话令牌：页面内领取（登录页已移除，改为同源页面直接发放）
  if (pathname === '/api/session') {
    if (!isSameOriginStrict(req)) return sendJSON(res, 403, { ok: false, error: 'Forbidden：会话令牌只能从页面内领取' });
    return sendJSON(res, 200, { ok: true, token: issueSession(req) });
  }

  // AI 代理（真实 Key 只在服务端）
  if (pathname === '/api/ai/chat') { await handleAIChat(req, res); return; }
  if (pathname === '/api/ai/transcribe') { await handleAITranscribe(req, res); return; }

  // 无真实 Key 的配置脚本
  if (pathname === '/js/core/config.local.js') { serveKeyConfig(res); return; }

  // API 统一鉴权：/api/health 保持公开，其余必须同源 + 有效会话令牌
  if (pathname.startsWith('/api/')) {
    if (pathname !== '/api/health') {
      if (!isSameOriginStrict(req)) return sendJSON(res, 403, { ok: false, error: 'Forbidden：非法来源' });
      if (!hasValidSession(req)) return sendJSON(res, 401, { ok: false, error: '会话已失效，请刷新页面' });
    }
  }

  const key = `${req.method} ${pathname}`;
  // 资金类写接口频控：同一 IP 每分钟最多 20 次
  const FUND_PATHS = ['/api/transfer', '/api/transfer/reverse', '/api/wealth/buy', '/api/wealth/redeem', '/api/card/'];
  if (req.method === 'POST' && FUND_PATHS.some((p) => pathname.startsWith(p))) {
    if (fundRateLimited(req, 'fund', 20, 60000)) return sendJSON(res, 429, { ok: false, error: '操作过于频繁，请稍后再试' });
  }
  const handler = routes[key];

  if (!handler) {
    if (pathname.startsWith('/api/')) return sendJSON(res, 404, { ok: false, error: '接口不存在' });
    // 非 API 请求作为静态文件服务（白名单）
    serveStatic(req, res);
    return;
  }
  try {
    const result = await handler(req, res);
    // 写接口成功后立刻持久化，重启/重新部署不丢数据
    if (req.method !== 'GET' && result && result.ok !== false) saveDB(DB);
    sendJSON(res, 200, result);
  } catch (e) {
    sendJSON(res, 500, { ok: false, error: String(e && e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log('[db] 数据文件：' + dbFilePath());
  console.log(`[bank-core] 模拟银行核心系统已启动: http://127.0.0.1:${PORT}`);
  console.log(`[bank-core] 健康检查: http://127.0.0.1:${PORT}/api/health`);
});
