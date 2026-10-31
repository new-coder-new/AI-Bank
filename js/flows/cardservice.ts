// ==========================================================================
//  信用卡服务工具：卡种校验、挂失与额度工具函数
//  源码：js/flows/cardservice.ts　→　编译：build/js/flows/cardservice.js（经典脚本，无 import/export）
//  对外入口：cardServiceMoney / cardServicePage / cardApplyList / cardServiceCards 等
//  类型：tsc 严格模式检查；对外符号统一在 types/global.d.ts 声明
// ==========================================================================
declare function escapeHtml(v: any): string;
declare function agentSleep(ms: number): Promise<void>;
declare function registerAgentTool(name: string, def: any): void;
declare function showSecurityVerification(purpose: string, cb: (ok: boolean) => void): void;
declare function showToast(msg: string, ms?: number): void;
declare function agentFmt(v: any, digits?: number): string;
declare function agentFmtInt(v: any, digits?: number): string;
declare function scrollToBottom(): void;
declare function appendMessage(html: string): void;
declare function saveUserData(): void;
declare var currentModule: string;
declare var mockData: any;
declare var AGENT_SESSION: any;
declare function guideCardApplyEsc(v: any): string;
declare function guideStartCardApply(): void;
declare function addTransaction(type: string, amount: number, desc: string, channel?: string, deduct?: boolean): boolean | void;
declare function verifyAmountRisk(amount: number, purpose: string, actions?: any[]): Promise<any>;
declare function callAgentTool(name: string, args?: any): any;
declare function submitManualReview(payload: any): void;

// ==========================================================================
//  卡片服务：卡片申请 / 交易限制 / 卡片挂失
//  入口：输入框「+」→ 全部服务 → 卡片分组
//  说明：三个视图都只做前端演示闭环，数据写入 mockData.userProfile 并本地持久化
//        （saveUserData），不新增后端接口，避免与模拟核心库产生不一致。
// ==========================================================================

function cardServiceMoney(v: any) {
  return '¥' + (Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 统一的「卡片页」外壳：标题 + 副标题 + 内容
function cardServicePage(title: any, subtitle: any, body: any) {
  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手</div>' +
    '<div class="msg-bubble"><div class="report-page">' +
    '<div class="report-head"><div><div class="report-title">' + title + '</div>' +
    '<div class="report-sub">' + subtitle + '</div></div></div>' +
    body +
    '</div></div></div></div>';
}

// ------------------------------ 卡片申请 ------------------------------
function cardApplyList() {
  if (!Array.isArray(mockData.userProfile.cardApplications)) mockData.userProfile.cardApplications = [];
  return mockData.userProfile.cardApplications;
}

// 已持有的信用卡列表：首次调用时用主卡初始化
function cardServiceCards() {
  if (!Array.isArray(mockData.userProfile.creditCards)) {
    var main = mockData.userProfile.creditCard || {};
    // 尾号优先取卡片展示卡号（6228 **** **** 8888），与卡片页显示保持一致
    var displayDigits = String((mockData.card && mockData.card.number) || '').replace(/\D/g, '');
    var mainDigits = String(main.number || '').replace(/\D/g, '');
    mockData.userProfile.creditCards = [{
      id: 'CARD-MAIN',
      cardType: main.type || '白金信用卡',
      limit: Number(main.effectiveLimit || main.limit || 90000) || 90000,
      purpose: '日常消费',
      status: '已发卡',
      issuedAt: main.issuedAt || '开户即持有',
      tail: (displayDigits.slice(-4) || mainDigits.slice(-4) || '8888')
    }];
  }
  return mockData.userProfile.creditCards;
}

// 卡片申请提交后进入「复核审批」：审批通过才核发新卡
function submitCardApplyReview(cardType: any, limit: any, purpose: any) {
  if (typeof submitManualReview !== 'function') return null;
  return submitManualReview({
    amount: Number(limit) || 0,
    purpose: '信用卡申请 · ' + cardType,
    source: '卡片申请',
    items: ['卡种：' + cardType, '期望额度：¥' + (Number(limit) || 0).toLocaleString('zh-CN'), '主要用途：' + purpose],
    actions: [{ tool: 'card.applyCard', args: { cardType: cardType, limit: Number(limit) || 0, purpose: purpose } }],
    silent: true
  });
}

// 复核通过：核发新卡，并把对应申请记录置为已通过
function approveCardApplication(args: any) {
  var a = args || {};
  var cardType = a.cardType || '标准金卡';
  var limit = Number(a.limit) || 0;
  var purpose = a.purpose || '日常消费';
  var list = cardServiceCards();
  var tail = String(1000 + Math.floor(Math.random() * 9000));
  list.push({
    id: 'CARD' + Date.now(),
    cardType: cardType,
    limit: limit,
    purpose: purpose,
    status: '已发卡',
    issuedAt: new Date().toLocaleString('zh-CN'),
    tail: tail
  });

  var apps = cardApplyList();
  for (var i = apps.length - 1; i >= 0; i--) {
    if (apps[i].status === '审核中' && apps[i].cardType === cardType && Number(apps[i].limit) === limit) {
      apps[i].status = '已通过';
      apps[i].approvedAt = new Date().toLocaleString('zh-CN');
      break;
    }
  }
  saveUserData();
  return { ok: true, summary: '已核发 ' + cardType + '（额度 ¥' + limit.toLocaleString('zh-CN') + '，尾号 ' + tail + '）' };
}

// 复核拒绝：申请记录置为已拒绝
function rejectCardApplication(args: any) {
  var a = args || {};
  var cardType = a.cardType || '';
  var limit = Number(a.limit) || 0;
  var apps = cardApplyList();
  for (var i = apps.length - 1; i >= 0; i--) {
    if (apps[i].status === '审核中' && apps[i].cardType === cardType && Number(apps[i].limit) === limit) {
      apps[i].status = '已拒绝';
      apps[i].approvedAt = new Date().toLocaleString('zh-CN');
      break;
    }
  }
  saveUserData();
  return { ok: true, summary: '已拒绝 ' + cardType + ' 申请，未核发新卡' };
}

// 卡片简称：白金信用卡 → 白金（用于列表左侧小徽标）
function cardShortLabel(type: any) {
  var s = String(type || '信用卡');
  if (s.indexOf('白金') !== -1) return '白金';
  if (s.indexOf('旅行') !== -1) return '旅行';
  if (s.indexOf('青年') !== -1) return '青年';
  if (s.indexOf('金卡') !== -1) return '金卡';
  return s.slice(0, 2);
}

// 我的卡片：展示已持有卡片（申请通过后会增加）
// 卡片列表统一渲染（我的卡片 / 卡片挂失等复用同一套样式）
function cardServiceListHtml(opts: any) {
  var o = opts || {};
  var list = Array.isArray(o.list) ? o.list : cardServiceCards();
  var totalLimit = list.reduce(function (s: any, c: any) { return s + (Number(c.limit) || 0); }, 0);
  var rows = list.map(function (c: any) {
    var statusCls = c.status === '已挂失' ? 'bank-status frozen' : 'bank-status approved';
    return '<div class="bank-sched-item">' +
      '<div class="bank-sched-date" style="background:#F5F8FD;color:#09407F;"><b>' + cardShortLabel(c.cardType) + '</b><small>尾号 ' + (c.tail || '****') + '</small></div>' +
      '<div class="bank-sched-main"><b>' + (c.cardType || '信用卡') + '</b><small>' + (c.issuedAt || '') + ' · ' + (c.purpose || '') + '</small></div>' +
      '<div class="bank-sched-side"><span class="' + statusCls + '">' + (c.status || '已发卡') + '</span><b style="font-size:12px;color:#334155;">¥' + (Number(c.limit) || 0).toLocaleString('zh-CN') + '</b></div>' +
      '</div>';
  }).join('');
  return '<div class="bank-page-head"><div><div class="bank-page-title">' + (o.title || '我的卡片') + '</div>' +
    '<div class="bank-page-sub">共 ' + list.length + ' 张 · 总额度 ¥' + totalLimit.toLocaleString('zh-CN') + '</div></div>' +
    (o.hideApply ? '' : '<button class="ui-link" onclick="guideStartCardApply()">申请新卡</button>') + '</div>' +
    '<div class="bank-sched-list">' + (rows || '<div class="bank-sched-empty">暂无信用卡</div>') + '</div>';
}

function showCardMyCards() {
  appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手</div><div class="msg-bubble agent-bubble">' +
    cardServiceListHtml({}) +
    '</div></div></div>');
  scrollToBottom();
}

function showCardApplyForm() {
  const list = cardApplyList();
  const historyHtml = list.length
    ? list.slice(-3).reverse().map((a: any) =>
      '<div class="report-row"><span>' + a.cardType + ' · ' + a.purpose + '</span><b>' + a.status + ' · ' + a.appliedAt + '</b></div>'
    ).join('')
    : '<div class="report-empty">暂无申请记录</div>';

  const body =
    '<div class="data-card">' +
    '<div class="data-card-title">申请信息</div>' +
    '<div class="form-group"><label class="form-label">卡种</label>' +
    '<select class="form-select" id="applyCardType">' +
    '<option>白金信用卡</option><option>标准金卡</option><option>旅行信用卡</option><option>青年卡</option>' +
    '</select></div>' +
    '<div class="form-group"><label class="form-label">期望额度（元）</label>' +
    '<input type="number" class="form-input" id="applyCardLimit" value="50000" min="5000" step="1000" placeholder="5000 - 200000">' +
    '<div class="form-hint" id="applyCardHint"></div></div>' +
    '<div class="form-group"><label class="form-label">主要用途</label>' +
    '<select class="form-select" id="applyCardPurpose">' +
    '<option>日常消费</option><option>出行差旅</option><option>教育培训</option><option>大额购物</option><option>其他</option>' +
    '</select></div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-primary" onclick="submitCardApply()">提交申请</button>' +
    '<button class="btn btn-secondary" onclick="cardApplyCancel()">取消</button>' +
    '</div></div>' +
    '<div class="report-panel" style="margin-top:12px;">' +
    '<div class="report-panel-title">申请记录</div>' + historyHtml +
    '</div>';

  appendMessage(cardServicePage('卡片申请', '提交后进入审核，通常 1-3 个工作日出结果', body));
  scrollToBottom();
}

function cardApplyCancel() {
  agentReply('已取消卡片申请，未提交任何资料。');
}

function submitCardApply() {
  const typeEl = document.getElementById('applyCardType');
  const limitEl = document.getElementById('applyCardLimit');
  const purposeEl = document.getElementById('applyCardPurpose');
  const hint = document.getElementById('applyCardHint');
  if (!typeEl || !limitEl || !purposeEl) return;

  const cardType = (typeEl as HTMLInputElement).value;
  const want = Number((limitEl as HTMLInputElement).value) || 0;
  const purpose = (purposeEl as HTMLInputElement).value;

  if (want < 5000 || want > 200000) {
    if (hint) { hint.textContent = '期望额度需在 ¥5,000 - ¥200,000 之间'; hint.style.color = '#B42318'; }
    return;
  }
  if (hint) hint.textContent = '';

  const list = cardApplyList();
  const at = new Date().toLocaleDateString('zh-CN');
  list.push({ cardType: cardType, limit: want, purpose: purpose, status: '审核中', appliedAt: at });
  saveUserData();

  const html = '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手</div><div class="msg-bubble agent-bubble">' +
    '<div class="bank-result">' +
    '<div class="bank-result-title">卡片申请已提交</div>' +
    '<div class="bank-result-amount">¥' + agentFmtInt(want) + '</div>' +
    '<div class="bank-confirm-rows">' +
    '<div><span>卡种</span><b>' + cardType + '</b></div>' +
    '<div><span>主要用途</span><b>' + purpose + '</b></div>' +
    '<div><span>当前状态</span><b style="color:#B54708;">审核中</b></div>' +
    '<div><span>申请时间</span><b>' + at + '</b></div>' +
    '</div>' +
    '<div style="margin-top:10px;"><button class="ui-link" onclick="reapplyCard()">再申请一张</button></div>' +
    '</div></div></div></div>';
  appendMessage(html);
  scrollToBottom();
}

// 「再申请一张」：优先走对话式申请，退回原表单
function reapplyCard() {
  if (typeof guideStartCardApply === 'function') { guideStartCardApply(); return; }
  showCardApplyForm();
}

// ------------------------------ 交易限制 ------------------------------
function txnLimitDefaults() {
  return { single: 50000, daily: 100000, night: 'block', overseas: 'block' };
}

function txnLimitData() {
  if (!mockData.userProfile.txnLimit) mockData.userProfile.txnLimit = txnLimitDefaults();
  const d = mockData.userProfile.txnLimit;
  if (d.single == null) d.single = 50000;
  if (d.daily == null) d.daily = 100000;
  if (!d.night) d.night = 'block';
  if (!d.overseas) d.overseas = 'block';
  return d;
}

// 当日信用卡消费累计（演示口径：日期变化即清零）
function cardDailySpend() {
  const u = mockData.userProfile;
  // 用本地日期，避免 UTC+8 凌晨把消费记到前一天导致日限额被重置
  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  if (!u.cardDailySpend || u.cardDailySpend.date !== today) u.cardDailySpend = { date: today, amount: 0 };
  return u.cardDailySpend;
}

// 限额校验：单笔 + 日累计 + 场景（online | night | overseas），分期等消费类交易提交前调用
function cardTxnLimitCheck(amount: any, scene: any) {
  const l = txnLimitData();
  const amt = Number(amount) || 0;
  const spent = Number(cardDailySpend().amount) || 0;
  if (amt <= 0) return { ok: false, reason: '金额无效' };
  if (amt > Number(l.single)) return { ok: false, reason: '超过单笔限额 ' + cardServiceMoney(l.single) };
  if (spent + amt > Number(l.daily)) {
    return { ok: false, reason: '超过每日限额 ' + cardServiceMoney(l.daily) + '（今日已用 ' + cardServiceMoney(spent) + '）' };
  }
  if (scene === 'night' && l.night === 'block') return { ok: false, reason: '夜间交易已被禁止（23:00-06:00）' };
  if (scene === 'overseas' && l.overseas === 'block') return { ok: false, reason: '境外交易已被禁止' };
  return { ok: true, reason: '在限额内，可正常交易' };
}

// 交易成功后累计当日消费额（供每日限额判断）
function cardTxnLimitRecord(amount: any) {
  const d = cardDailySpend();
  d.amount = (Number(d.amount) || 0) + (Number(amount) || 0);
  saveUserData();
}

// 限制规则说明：把当前生效的规则、判断顺序与超限处理讲清楚

// ------------------------------ 卡片挂失 ------------------------------
