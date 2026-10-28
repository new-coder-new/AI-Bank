// ==========================================================================
//  卡片服务：卡片申请 / 交易限制 / 卡片挂失
//  入口：输入框「+」→ 全部服务 → 卡片分组
//  说明：三个视图都只做前端演示闭环，数据写入 mockData.userProfile 并本地持久化
//        （saveUserData），不新增后端接口，避免与模拟核心库产生不一致。
// ==========================================================================

function cardServiceCard() {
  return (mockData.userProfile && mockData.userProfile.creditCard) || {};
}

function cardServiceMoney(v) {
  return '¥' + (Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 统一的「卡片页」外壳：标题 + 副标题 + 内容
function cardServicePage(title, subtitle, body) {
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
function submitCardApplyReview(cardType, limit, purpose) {
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
function approveCardApplication(args) {
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
function rejectCardApplication(args) {
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
function cardShortLabel(type) {
  var s = String(type || '信用卡');
  if (s.indexOf('白金') !== -1) return '白金';
  if (s.indexOf('旅行') !== -1) return '旅行';
  if (s.indexOf('青年') !== -1) return '青年';
  if (s.indexOf('金卡') !== -1) return '金卡';
  return s.slice(0, 2);
}

// 我的卡片：展示已持有卡片（申请通过后会增加）
// 卡片列表统一渲染（我的卡片 / 卡片挂失等复用同一套样式）
function cardServiceListHtml(opts) {
  var o = opts || {};
  var list = Array.isArray(o.list) ? o.list : cardServiceCards();
  var totalLimit = list.reduce(function (s, c) { return s + (Number(c.limit) || 0); }, 0);
  var rows = list.map(function (c) {
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
    ? list.slice(-3).reverse().map(a =>
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

  const cardType = typeEl.value;
  const want = Number(limitEl.value) || 0;
  const purpose = purposeEl.value;

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
function cardTxnLimitCheck(amount, scene) {
  const l = txnLimitData();
  const amt = Number(amount) || 0;
  const spent = Number(cardDailySpend().amount) || 0;
  if (amt <= 0) return { ok: false, reason: '金额无效' };
  if (amt > Number(l.single)) return { ok: false, reason: '超过单笔限额 ' + cardServiceMoney(l.single) };
  if (spent + amt > Number(l.daily)) {
    return { ok: false, reason: '超过日累计限额 ' + cardServiceMoney(l.daily) + '（今日已用 ' + cardServiceMoney(spent) + '）' };
  }
  if (scene === 'night' && l.night === 'block') return { ok: false, reason: '夜间交易已被禁止（23:00-06:00）' };
  if (scene === 'overseas' && l.overseas === 'block') return { ok: false, reason: '境外交易已被禁止' };
  return { ok: true, reason: '在限额内，可正常交易' };
}

// 交易成功后累计当日消费额（供日累计限额判断）
function cardTxnLimitRecord(amount) {
  const d = cardDailySpend();
  d.amount = (Number(d.amount) || 0) + (Number(amount) || 0);
  saveUserData();
}

// 限制规则说明：把当前生效的规则、判断顺序与超限处理讲清楚
function showTxnLimitRules() {
  const l = txnLimitData();
  const spent = Number(cardDailySpend().amount) || 0;
  const body =
    '<div class="data-card">' +
    '<div class="data-card-title">当前生效的规则</div>' +
    '<div class="data-row"><span class="data-label">单笔限额</span><span class="data-value">' + cardServiceMoney(l.single) + '</span></div>' +
    '<div class="data-row"><span class="data-label">日累计限额</span><span class="data-value">' + cardServiceMoney(l.daily) + '</span></div>' +
    '<div class="data-row"><span class="data-label">今日已用</span><span class="data-value">' + cardServiceMoney(spent) + '</span></div>' +
    '<div class="data-row"><span class="data-label">夜间交易（23:00-06:00）</span><span class="data-value">' + (l.night === 'block' ? '禁止' : '允许') + '</span></div>' +
    '<div class="data-row"><span class="data-label">境外交易</span><span class="data-value">' + (l.overseas === 'block' ? '禁止' : '允许') + '</span></div>' +
    '</div>' +
    '<div class="report-panel" style="margin-top:12px;">' +
    '<div class="report-panel-title">判断顺序</div>' +
    '<div class="report-row"><span>1. 单笔金额</span><b>超过单笔限额即拦截</b></div>' +
    '<div class="report-row"><span>2. 当日累计</span><b>今日已用 + 本笔 &gt; 日累计限额即拦截</b></div>' +
    '<div class="report-row"><span>3. 交易场景</span><b>夜间 / 境外交易按开关决定放行或拦截</b></div>' +
    '</div>' +
    '<p style="margin-top:10px;font-size:11.5px;color:#8A97A8;line-height:1.7;">命中任一规则即拒绝交易，不产生扣款；可在「交易限制」中调整阈值或关闭场景开关。</p>';

  appendMessage(cardServicePage('交易限制 · 规则', '当前配置与判定顺序', body));
  scrollToBottom();
}

function showTxnLimitSettings() {
  const l = txnLimitData();
  const body =
    '<div class="data-card">' +
    '<div class="data-card-title">信用卡交易限制</div>' +
    '<div class="form-group"><label class="form-label">单笔限额（元）</label>' +
    '<input type="number" class="form-input" id="txnSingle" value="' + l.single + '" min="1000" step="1000"></div>' +
    '<div class="form-group"><label class="form-label">日累计限额（元）</label>' +
    '<input type="number" class="form-input" id="txnDaily" value="' + l.daily + '" min="1000" step="1000">' +
    '<div class="form-hint" id="txnLimitHint"></div></div>' +
    '<div class="form-group"><label class="form-label">夜间交易（23:00 - 06:00）</label>' +
    '<select class="form-select" id="txnNight"><option value="block"' + (l.night === 'block' ? ' selected' : '') + '>禁止</option>' +
    '<option value="allow"' + (l.night === 'allow' ? ' selected' : '') + '>允许</option></select></div>' +
    '<div class="form-group"><label class="form-label">境外交易</label>' +
    '<select class="form-select" id="txnOverseas"><option value="block"' + (l.overseas === 'block' ? ' selected' : '') + '>禁止</option>' +
    '<option value="allow"' + (l.overseas === 'allow' ? ' selected' : '') + '>允许</option></select></div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-primary" onclick="saveTxnLimitSettings()">保存设置</button>' +
    '<button class="btn btn-secondary" onclick="showTxnLimitRules()">查看限制规则</button>' +
    '<button class="btn btn-secondary" onclick="txnLimitCancel()">取消</button>' +
    '</div></div>' +
    '<p style="margin-top:10px;font-size:11.5px;color:#8A97A8;line-height:1.7;">限额保存后立即生效：信用卡分期等消费类交易会按单笔与日累计限额校验，超限直接拦截。</p>';

  appendMessage(cardServicePage('交易限制', '按单笔 / 日累计 / 场景控制信用卡消费', body));
  scrollToBottom();
}

function txnLimitCancel() {
  agentReply('已取消修改，交易限制保持原设置。');
}

function saveTxnLimitSettings() {
  const singleEl = document.getElementById('txnSingle');
  const dailyEl = document.getElementById('txnDaily');
  const nightEl = document.getElementById('txnNight');
  const overseasEl = document.getElementById('txnOverseas');
  const hint = document.getElementById('txnLimitHint');
  if (!singleEl || !dailyEl || !nightEl || !overseasEl) return;

  const single = Number(singleEl.value) || 0;
  const daily = Number(dailyEl.value) || 0;
  if (single < 1000) { if (hint) { hint.textContent = '单笔限额不能低于 ¥1,000'; hint.style.color = '#B42318'; } return; }
  if (daily < single) { if (hint) { hint.textContent = '日累计限额不能低于单笔限额'; hint.style.color = '#B42318'; } return; }
  if (hint) hint.textContent = '';

  const l = txnLimitData();
  l.single = single;
  l.daily = daily;
  l.night = nightEl.value;
  l.overseas = overseasEl.value;
  saveUserData();

  const html = '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手</div><div class="msg-bubble agent-bubble">' +
    '<div class="bank-result">' +
    '<div class="bank-result-title">交易限制已更新</div>' +
    '<div class="bank-result-amount">' + cardServiceMoney(single) + '</div>' +
    '<div class="bank-confirm-rows">' +
    '<div><span>单笔限额</span><b>' + cardServiceMoney(single) + '</b></div>' +
    '<div><span>日累计限额</span><b>' + cardServiceMoney(daily) + '</b></div>' +
    '<div><span>夜间交易</span><b>' + (l.night === 'block' ? '禁止' : '允许') + '</b></div>' +
    '<div><span>境外交易</span><b>' + (l.overseas === 'block' ? '禁止' : '允许') + '</b></div>' +
    '</div></div></div></div></div>';
  appendMessage(html);
  scrollToBottom();
}

// ------------------------------ 卡片挂失 ------------------------------
function showCardFreezePanel() {
  const c = cardServiceCard();
  const frozen = c.isFrozen === true || cardFrozen === true;
  const number = c.number || '6228 **** **** 8888';
  const available = c.available != null ? c.available : (c.limit || 0) - (c.used || 0);

  const body =
    '<div class="data-card">' +
    '<div class="data-row"><span class="data-label">卡号</span><span class="data-value">' + number + '</span></div>' +
    '<div class="data-row"><span class="data-label">卡片状态</span><b class="data-value" style="color:' + (frozen ? '#B42318' : '#16A34A') + ';">' + (frozen ? '已挂失' : '正常') + '</b></div>' +
    '<div class="data-row"><span class="data-label">可用额度</span><span class="data-value">' + cardServiceMoney(available) + '</span></div>' +
    '</div>' +
    '<p style="margin-top:10px;font-size:11.5px;color:#8A97A8;line-height:1.7;">挂失后卡片立即冻结、无法继续交易；找回卡片可自助解挂。挂失与解挂均会记入账户变更记录。</p>' +
    '<div class="form-actions">' +
    '<button class="btn ' + (frozen ? 'btn-primary' : 'btn-danger') + '" onclick="toggleFreeze()">' + (frozen ? '解除挂失' : '立即挂失') + '</button>' +
    '<button class="btn btn-secondary" onclick="showCardLimit()">查看卡片详情</button>' +
    '</div>';

  appendMessage(cardServicePage('卡片挂失', frozen ? '当前状态：已挂失' : '当前状态：正常使用中', body));
  scrollToBottom();
}
