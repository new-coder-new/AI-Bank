// ==========================================================================
//  经典脚本模块（TypeScript 源码，noCheck 转译）
//  编译产物：js/core/config.js
//  说明：本层为「全局函数 + 动态状态」结构，采用 noCheck 转译；
//        对外符号统一在 types/global.d.ts 声明。
// ==========================================================================

// ---------------------------------------------------------------------------
// 密钥配置：不在代码里硬编码，统一从 js/config.local.js（已 git 忽略）读取，
// 或由服务端用环境变量（DEEPSEEK_API_KEY / SILICONFLOW_API_KEY）注入同结构对象。
// 取不到 Key 时保持空字符串，各调用点自行降级（规则引擎 / 知识库 / 模拟识别）。
// 模板见 js/config.local.example.js
// ---------------------------------------------------------------------------
const BANK_KEYS = (typeof window !== 'undefined' && (window as any).__BANK_KEYS__) || {};

// 浏览器不再持有真实 Key。默认走同源代理 /api/ai/*，由 server/index.js
// 用环境变量或本机 config.local.js 里的 Key 转发；前端 Key 仅作为旧部署兜底。
/** @type {any} */
var DEEPSEEK_API_KEY: any = BANK_KEYS.deepseekApiKey || '';
/** @type {any} */
var DEEPSEEK_API_URL: any = (typeof window !== 'undefined' && (window as any).__BANK_AI_PROXY__)
  ? '/api/ai/chat'
  : 'https://api.deepseek.com/v1/chat/completions';
// 模型名：服务端会通过 (window as any).__BANK_MODEL__ 下发（如硅基流动的 Qwen 模型）；
// 直连模式（无代理）时回退到 DeepSeek。
/** @type {any} */
var MODEL_NAME: any = (typeof window !== 'undefined' && (window as any).__BANK_MODEL__) || 'deepseek-v4-flash';

// 硅基流动语音识别API
const SILICONFLOW_API_KEY = BANK_KEYS.siliconflowApiKey || '';
const SILICONFLOW_API_URL = (typeof window !== 'undefined' && (window as any).__BANK_ASR_PROXY__)
  ? '/api/ai/transcribe'
  : 'https://api.siliconflow.cn/v1/audio/transcriptions';
const VOICE_MODEL = 'XingChenAGI/XingChenASR-V3.2-Ultra';

// 是否可用：服务端代理开启时即使浏览器没有 Key 也可用
function bankHasLLMKey() {
  return !!(typeof window !== 'undefined' && (window as any).__BANK_AI_PROXY__) || !!String(DEEPSEEK_API_KEY || '').trim();
}
function bankHasASRKey() {
  return !!(typeof window !== 'undefined' && (window as any).__BANK_ASR_PROXY__) || !!String(SILICONFLOW_API_KEY || '').trim();
}

// 带超时的 fetch：网络挂起时不能把 Agent/语音永久锁在“处理中”
function bankFetch(url: string, options?: any, timeoutMs?: number): Promise<Response> {
  const ms = Number(timeoutMs) || 30000;
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) { } }, ms) : null;
  const opts = Object.assign({}, options || {});
  if (ctrl) opts.signal = ctrl.signal;
  return fetch(url, opts).finally(function () { if (timer) clearTimeout(timer); });
}

/** @type {string} */
/** @type {string} */
var currentModule = 'chat';
/** @type {any} */
var isLoading: any = false;
var cardFrozen = false;
var riskProfile: any = null;

/** @type {any} */
var mockData: any = {
  contacts: [
    { name: '张三', phone: '138****1234', phoneFull: '13812341234', account: '6222 **** **** 1234', bank: '工商银行' },
    { name: '李四', phone: '139****5678', phoneFull: '13956785678', account: '6225 **** **** 5678', bank: '招商银行' },
    { name: '王五', phone: '137****9012', phoneFull: '13790129012', account: '6217 **** **** 9012', bank: '建设银行' },
      { name: '陈爸爸', phone: '135****2233', phoneFull: '13522332233', account: '6228 **** **** 2233', bank: '工商银行', relation: '父亲', birthday: '2027-06-05' },
      { name: '陈妈妈', phone: '135****4455', phoneFull: '13544554455', account: '6228 **** **** 4455', bank: '工商银行', relation: '母亲', birthday: '2027-05-08' },
  ],
  bills: {
    month: '2026年9月',
    income: [
      { label: '工资收入', value: 15000, color: '#22c55e' },
      { label: '理财收益', value: 328.5, color: '#14b8a6' },
      { label: '其他收入', value: 200, color: '#84cc16' },
    ],
    expense: [
      { label: '餐饮美食', value: 2350, color: '#ef4444' },
      { label: '交通出行', value: 680, color: '#f97316' },
      { label: '购物消费', value: 1890, color: '#eab308' },
      { label: '房租水电', value: 3500, color: '#0B4F9C' },
      { label: '娱乐休闲', value: 520, color: '#06b6d4' },
      { label: '其他支出', value: 310, color: '#6b7280' },
    ]
  },
  products: [
    { icon: '📈', name: '稳健增利90天', desc: '中低风险 · 固定收益 · 90天', rate: '3.85%', rateLabel: '近7日年化', riskLevel: 2, minAmount: 1000, closedDays: 90 },
    { icon: '🏦', name: '天天盈货币基金', desc: '低风险 · 灵活存取 · T+1到账', rate: '2.15%', rateLabel: '7日年化', riskLevel: 1, minAmount: 1, closedDays: 0 },
    { icon: '📊', name: '均衡配置混合基金', desc: '中风险 · 股债平衡 · 长期持有', rate: '5.62%', rateLabel: '近一年收益', riskLevel: 3, minAmount: 100, closedDays: 0 },
    { icon: '🔒', name: '安享三年定期', desc: '低风险 · 保本保息 · 3年期', rate: '2.75%', rateLabel: '年利率', riskLevel: 1, minAmount: 50, closedDays: 1095 },
    { icon: '🚀', name: '成长先锋股票基金', desc: '中高风险 · 偏股型 · 波动较大', rate: '12.35%', rateLabel: '近一年收益', riskLevel: 4, minAmount: 1000, closedDays: 0 },
  ],
  card: {
    type: '白金信用卡',
    number: '6228 **** **** 6789',
    totalLimit: 90000,
    usedLimit: 23650,
    availableLimit: 66350,
    billAmount: 8420.50,
    dueDate: '2026-09-25',
  },
  subscriptions: [
    { id: 1, icon: '🏋️', name: '某健身APP会员', detail: '连续包月 · 下次扣款', price: 128, cycle: '/月', cycleLabel: '连续包月', chargeInDays: 3, usage: '低' },
    { id: 2, icon: '🎬', name: '某视频平台VIP', detail: '连续包月 · 下次扣款', price: 25, cycle: '/月', cycleLabel: '连续包月', chargeInDays: 9, usage: '高' },
    { id: 3, icon: '📚', name: '某阅读APP会员', detail: '连续包月 · 下次扣款', price: 15, cycle: '/月', cycleLabel: '连续包月', chargeInDays: 7, usage: '低' },
    { id: 4, icon: '☁️', name: '某云盘超级会员', detail: '连续包月 · 下次扣款', price: 30, cycle: '/月', cycleLabel: '连续包月', chargeInDays: 13, usage: '低' },
    { id: 5, icon: '🎵', name: '某音乐平台会员', detail: '连续包季 · 下次扣款', price: 45, cycle: '/季', cycleLabel: '连续包季', chargeInDays: 16, usage: '中' }
  ],
  userProfile: {
    name: '小陈',
    gender: '男',
    idCard: '441802199803152817',
    birthday: '1998-03-15',
    phone: '138****6688',
    email: 'chenyuanhui@example.com',
    address: '广东省清远市清城区某某街道某某小区3栋502室',
    level: '白金客户（VIP3）',
    openDate: '2019-06-18',
    manager: '李经理（工号 A10086）',
    debitCard: {
      number: '6222 0236 0201 8888 666',
      bank: '中国工商银行',
      branch: '清远分行营业部',
      status: '正常',
      balance: 1000000.00,
      available: 998000.00,
      frozen: 2000.00,
      todayIncome: 15000.00,
      todayExpense: 3280.50,
    },
    creditCards: [
      { id: 'CARD-MAIN', cardType: '白金信用卡', tail: '6789', limit: 90000, used: 23650, purpose: '日常消费', status: '已发卡', issuedAt: '开户即持有' },
      { id: 'CARD-2', cardType: '标准金卡', tail: '2290', limit: 50008, used: 0, purpose: '日常消费', status: '已发卡', issuedAt: '2026-10-28 19:59:13' }
    ],
    creditCard: {
      number: '6228 4801 2345 6789',
      level: '白金信用卡',
      // 额度字段分层（C2 要求区分申请/审批/生效额度，均来自实际业务数据）
      appliedLimit: null,      // 申请额度：当前无进行中的调额申请（提交申请后才有值）
      approvedLimit: 90000,    // 审批额度：银行风控审批通过的最高额度
      effectiveLimit: 90000,   // 生效额度：当前实际生效的额度（审批通过即生效，与 limit 一致）
      limit: 90000,            // 当前生效总额度（历史兼容字段，等价 effectiveLimit）
      approvedAt: '2025-11-18 14:20:00', // 审批通过时间
      used: 23650.00,          // 已用额度
      available: 66350.00,     // 可用额度 = 生效额度 - 已用额度
      billDay: 15,
      dueDay: 5,
      currentBill: 8420.50,
      minPayment: 842.05,
      // 数据更新时间戳：用于 C4/C5 判断额度数据是否最新、刷新后是否一致
      limitUpdatedAt: '2026-09-20 10:30:00'
    },recentTxns: [
      { type: 'income', amount: 15000.00, desc: '工资收入（某某科技有限公司）', time: '2026-09-14 09:00:12', channel: '企业网银代发' },
      { type: 'expense', amount: 3500.00, desc: '房贷月供扣款', time: '2026-09-14 08:30:00', channel: '自动扣款' },
      { type: 'expense', amount: 268.50, desc: '消费-某某超市（清远万达店）', time: '2026-09-13 19:25:33', channel: '微信支付' },
      { type: 'expense', amount: 128.00, desc: '消费-某某餐厅（聚餐）', time: '2026-09-13 12:15:08', channel: '支付宝' },
      { type: 'expense', amount: 50.00, desc: '话费充值（中国移动）', time: '2026-09-12 10:05:21', channel: '手机银行' },
      { type: 'expense', amount: 4800.00, desc: '消费-某某数码城（购买电子产品）', time: '2026-09-11 23:45:18', channel: '刷卡消费', abnormal: true, abnormalReason: '大额消费+凌晨交易' },
      { type: 'expense', amount: 200.00, desc: '消费-某某便利店', time: '2026-09-10 02:15:33', channel: '微信支付', abnormal: true, abnormalReason: '凌晨交易' },
      { type: 'expense', amount: 1500.00, desc: '转账给-未知账户', time: '2026-09-09 14:30:00', channel: '网银转账', abnormal: true, abnormalReason: '非常用收款人' },
    ],
    holdings: [
      { name: '稳健增利90天', icon: '📈', amount: 10000, cost: 10000, profit: 95.20, profitRate: 0.95, buyDate: '2026-08-15', status: '持有中', riskLevel: 2 },
      { name: '天天盈货币基金', icon: '🏦', amount: 5000, cost: 5000, profit: 22.15, profitRate: 0.44, buyDate: '2026-09-01', status: '持有中', riskLevel: 1 },
      { name: '均衡配置混合基金', icon: '📊', amount: 8000, cost: 8000, profit: -156.80, profitRate: -1.96, buyDate: '2026-07-20', status: '持有中', riskLevel: 3 },
    ],
    budgets: {
      day: 480,
      week: 3000,
      month: 12000,
      year: 144000
    },
    transferHistory: [
      { id: 1, payee: '张三', account: '6222 **** **** 1234', amount: 2000, time: '2026-09-10 14:30:00', status: '已完成', channel: '姓名转账' },
      { id: 2, payee: '李四', account: '6225 **** **** 5678', amount: 500, time: '2026-09-08 09:15:00', status: '已完成', channel: '手机号转账' },
      { id: 3, payee: '王五', account: '6217 **** **** 9012', amount: 1500, time: '2026-09-05 16:45:00', status: '已完成', channel: '姓名转账' },
    ],
    birthdayContacts: [
      { name: '张三', birthday: '09-15', relation: '朋友', flower: '向日葵', price: 168 },
      { name: '李四', birthday: '09-20', relation: '同事', flower: '康乃馨', price: 128 },
      { name: '王五', birthday: '10-01', relation: '家人', flower: '玫瑰', price: 299 },
      { name: '陈爸爸', birthday: '06-05', relation: '父亲', flower: '百合', price: 199 },
      { name: '陈妈妈', birthday: '05-08', relation: '母亲', flower: '康乃馨', price: 128 },
    ]
  }
};

// ========== 基础工具函数 ==========
function appendMessage(html: string): void {
  const chatInner = document.getElementById('chatInner');
  if (!chatInner) return;
  // 同一句追问不重复刷屏：如果这条消息是提问、且和上一条 AI 消息一字不差，就不再追加
  try {
    var raw = String(html || '');
    var isAsk = /[？?]/.test(raw) || /麻烦告诉我|请问|请提供|请回复|请选择|请输入/.test(raw);
    // 每轮用户输入的第一条消息允许重复（否则连两次同样的错误提示会被吞掉不出声）
    var freshTurn = (typeof window !== 'undefined' && (window as any).__DEDUPE_BREAK__);
    if (freshTurn) (window as any).__DEDUPE_BREAK__ = false;
    if (isAsk && !freshTurn && location.hash !== '#nodup') {
      var prev = chatInner.querySelectorAll('.message:not(.user) .msg-bubble');
      if (prev.length) {
        var probe = document.createElement('div');
        probe.innerHTML = raw;
        var inner = probe.querySelector('.msg-bubble') || probe;
        var nextText = String(inner.textContent || '').replace(/\s+/g, '');
        var lastText = String(prev[prev.length - 1].textContent || '').replace(/\s+/g, '');
        if (nextText && nextText === lastText) return;
      }
    }
  } catch (e) { /* 去重失败不影响正常输出 */ }
  const div = document.createElement('div');
  div.innerHTML = html;
  var first = div.firstElementChild;
  if (first) chatInner.appendChild(first);
}
function scrollToBottom() {
  const container = document.getElementById('chatContainer');
  if (!container) return;
  setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
}
function scrollToTop() {
  const container = document.getElementById('chatContainer');
  if (!container) return;
  setTimeout(() => { container.scrollTop = 0; }, 80);
}
function escapeHtml(text: any): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
function escapeAttr(text: any): string {
  return escapeHtml(String(text == null ? '' : text)).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function formatAiText(text: any): string {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/(?:^|\n)\s*[-•]\s+/g, '<br>• ');
  return html;
}

