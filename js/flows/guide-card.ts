// ==========================================================================
//  卡片模块引导：申请 / 挂失 / 调额 / 限额的槽位与确认
//  源码：js/flows/guide-card.ts　→　编译：build/js/flows/guide-card.js（经典脚本，无 import/export）
//  对外入口：guideCardApplyTypesText / guideCardApplyPurposesText / guideStartCardApply / guideCardApplyParse 等
//  类型：tsc 严格模式检查；对外符号统一在 types/global.d.ts 声明
// ==========================================================================
// 引导层：卡片管理（原 guide 单体拆分模块）


function guideCardApplyTypesText() { return CARD_APPLY_TYPES.join('、'); }
function guideCardApplyPurposesText() { return CARD_APPLY_PURPOSES.join('、'); }

function guideStartCardApply() {
  guideResetAllSessions();
  GUIDE_CARD_APPLY = { stage: 'slots', cardType: null, limit: 0, purpose: null };
  currentModule = 'card';
  appendMessage(guideMessage(
    '<p>请告诉我你想办理的信用卡类型和期望额度。</p>' +
    '<p class="guide-tip">可选卡种：' + guideCardApplyTypesText() + '</p>'
  ));
  scrollToBottom();
}

// 从一句话里抽卡种 / 额度 / 用途；同时返回无法识别的卡种词（如「钻石卡」）
function guideCardApplyParse(text: any) {
  var raw = String(text || '');
  var t = raw;

  var cardType = CARD_APPLY_TYPES.filter(function (n: any) { return t.indexOf(n) !== -1; })[0] || null;
  if (!cardType) {
    if (/白金/.test(t)) cardType = '白金信用卡';
    else if (/标准金卡|金卡/.test(t)) cardType = '标准金卡';
    else if (/旅行卡|旅游卡|旅行信用/.test(t)) cardType = '旅行信用卡';
    else if (/青年卡|青年信用/.test(t)) cardType = '青年卡';
  }

  // 无法识别的卡种：形如「XX卡」，去掉「申请/办理/一张」等词后仍不是合法卡种
  var unknownType = null;
  var cleaned = t.replace(/申请|办理|办|开|一张|我想|我要|想要|的/g, ' ');
  var tokens = (cleaned.match(/[\u4e00-\u9fa5]{1,6}卡/g) || []);
  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];
    if (tok === '信用卡') continue;
    // 「办张卡 / 办个卡 / 办款卡」这类量词+卡不是卡种，别误判为「不支持的卡种」
    if (/^[张个款种这那的每]?卡$/.test(tok)) continue;
    if (/^(一张|两张|几张)/.test(tok)) continue;
    var ok = CARD_APPLY_TYPES.some(function (n: any) { return n.indexOf(tok) !== -1 || tok.indexOf(n) !== -1; });
    if (!ok) { unknownType = tok; break; }
  }

  // 用途：先剔除已识别的卡种，避免「旅行信用卡」里的「旅行」被当成用途
  var t2 = t;
  CARD_APPLY_TYPES.forEach(function (n: any) { t2 = t2.split(n).join(' '); });
  var purpose = CARD_APPLY_PURPOSES.filter(function (n: any) { return t2.indexOf(n) !== -1; })[0] || null;
  if (!purpose) {
    if (/差旅|出差|旅行|旅游/.test(t2)) purpose = '出行差旅';
    else if (/消费|日常刷卡|买菜/.test(t2)) purpose = '日常消费';
    else if (/教育|培训|学费|课程/.test(t2)) purpose = '教育培训';
    else if (/购物|大额|买大件|家电/.test(t2)) purpose = '大额购物';
    else if (/其他|其它/.test(t2)) purpose = '其他';
  }

  // 额度
  var limit = 0;
  var m = t.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (m) {
    limit = parseFloat(m[1]);
    if (m[2]) limit *= 10000;
  }

  return { cardType: cardType, limit: limit, purpose: purpose, unknownType: unknownType };
}

// 第一段只收集「卡种 + 期望额度」，用途在第二段单独问
function guideCardApplyMissingPrompt(s: any) {
  var missType = !s.cardType;
  var missLimit = !(Number(s.limit) > 0);
  if (missType && missLimit) return '请告诉我你想办理的信用卡类型和期望额度。';
  if (missType) return '请选择信用卡类型。';
  return '请问你的期望额度是多少元？';
}

function guideCardApplyMoney(v: any) {
  return Number(v || 0).toLocaleString('zh-CN');
}

async function guideCardApplyStep(text: any) {
  var t = String(text || '').trim();
  var s = GUIDE_CARD_APPLY;
  var plain = t.replace(/[吧呢啊呀。.!！?？\s]/g, '');

  // 确认阶段支持直接打字
  if (s.stage === 'confirm') {
    if (/^(确认|确定|提交|提交申请|是|好|好的|行|可以)$/.test(plain)) { guideCardApplySubmit(); return true; }
    if (/^(取消|不|不要|算了|退出)$/.test(plain)) { guideCardApplyCancel(); return true; }
  }

  // 第②段：卡种和额度已齐，只等「主要用途」
  if (s.stage === 'purpose') {
    var aim = guideCardApplyParse(t);
    var pickedPurpose = aim.purpose;
    if (!pickedPurpose) {
      var aiAim = await guideCardApplyAIType(t);
      if (GUIDE_CARD_APPLY !== s) return true;
      if (aiAim && aiAim.purpose && CARD_APPLY_PURPOSES.indexOf(aiAim.purpose) !== -1) pickedPurpose = aiAim.purpose;
    }
    if (pickedPurpose && CARD_APPLY_PURPOSES.indexOf(pickedPurpose) !== -1) {
      s.purpose = pickedPurpose;
      guideCardApplyConfirm();
      return true;
    }
    // 认不出用途：一直追问（带可选用途）
    if (s.cardType || Number(s.limit) > 0) {
      guideSayInvalid(guideMessage('<p>主要用途是什么？</p>' +
        '<p class="guide-tip">可选用途：' + guideCardApplyPurposesText() + '</p>'));
      return true;
    }
    s.stage = 'slots';
  }

  var parsed = guideCardApplyParse(t);

  // 本地没认出卡种/用途（如「金卡」「主要出差用」）→ 交给模型映射到可选清单
  if ((!parsed.cardType || !parsed.purpose) && !parsed.unknownType) {
    var aiCard = await guideCardApplyAIType(t);
    if (GUIDE_CARD_APPLY !== s) return true;
    if (aiCard) {
      if (!parsed.cardType && aiCard.cardType) parsed.cardType = aiCard.cardType;
      if (!parsed.purpose && aiCard.purpose &&
        /(用途|日常|消费|差旅|旅行|出差|教育|培训|购物|大额|其他)/.test(t)) parsed.purpose = aiCard.purpose;
    }
  }

  // 不认识的卡种：提示可选范围，不污染已收集字段
  if (parsed.unknownType && !parsed.cardType) {
    appendMessage(guideMessage('<p>可选卡种仅有：<b>' + guideCardApplyTypesText() + '</b>，请从中选择。</p>'));
    scrollToBottom();
    return true;
  }

  if (parsed.cardType) s.cardType = parsed.cardType;
  if (Number(parsed.limit) > 0) s.limit = parsed.limit;
  if (parsed.purpose && CARD_APPLY_PURPOSES.indexOf(parsed.purpose) !== -1) s.purpose = parsed.purpose;

  // 卡种 + 额度齐了 → 判断是否已经说了用途
  if (s.cardType && Number(s.limit) > 0) {
    if (s.purpose) { guideCardApplyConfirm(); return true; }
    s.stage = 'purpose';
    guideSayInvalid(guideMessage('<p>主要用途是什么？</p>' +
      '<p class="guide-tip">可选用途：' + guideCardApplyPurposesText() + '</p>'));
    return true;
  }

  // 还没齐 → 只问卡种和额度（用途留到下一段）
  var prompt = guideCardApplyMissingPrompt(s);
  if (Number(parsed.limit) > 0 && !parsed.cardType && /^(申请|办理|办|我要申请|我想申请|申请信用卡)/.test(t)) {
    prompt = '识别到期望额度 ' + guideCardApplyMoney(parsed.limit) + ' 元，请选择信用卡类型。';
  }
  var tipHtml = '';
  if (!s.cardType) tipHtml += '<p class="guide-tip">可选卡种：' + guideCardApplyTypesText() + '</p>';
  guideSayInvalid(guideMessage('<p>' + prompt + '</p>' + tipHtml));
  return true;
}

function guideCardApplyConfirm() {
  var s = GUIDE_CARD_APPLY;
  if (!s) return;
  s.stage = 'confirm';
  s.boxId = s.boxId || ('card-apply-confirm-' + Date.now());
  appendMessage(guideMessage(
    '<div id="' + s.boxId + '">' +
    '<p>已整理你的申请信息</p>' +
    '<div class="data-card"><div class="data-card-title">申请信息</div>' +
    '<div class="data-row"><span class="data-label">卡种</span><span class="data-value">' + guideEsc(s.cardType) + '</span></div>' +
    '<div class="data-row"><span class="data-label">期望额度</span><span class="data-value">' + guideCardApplyMoney(s.limit) + ' 元</span></div>' +
    '<div class="data-row"><span class="data-label">主要用途</span><span class="data-value">' + guideEsc(s.purpose) + '</span></div>' +
    '</div>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideCardApplySubmit()">提交申请</button>' +
    '<button class="guide-chip" onclick="guideCardApplyCancel()">取消</button>' +
    '</div>' +
    '</div>'
  ));
  scrollToBottom();
}

async function guideCardApplySubmit() {
  var s = GUIDE_CARD_APPLY;
  if (!s || s.stage !== 'confirm') return;
  if (Number(s.limit) < 5000 || Number(s.limit) > 200000) {
    appendMessage(guideMessage('<p>期望额度需在 ¥5,000 - ¥200,000 之间，请重新告诉我期望额度。</p>'));
    scrollToBottom();
    s.stage = 'slots';
    s.limit = 0;
    return;
  }

  // —— 服务端权威：后端在线时由服务端建档并发起复核 ——
  if (typeof API !== 'undefined' && API.live && typeof apiCardApply === 'function') {
    var srvApply = null;
    try { srvApply = await apiCardApply(s.cardType, s.limit, s.purpose); } catch (e: any) { srvApply = null; }
    if (srvApply && srvApply.ok) {
      if (Array.isArray(srvApply.applications)) mockData.userProfile.cardApplications = srvApply.applications;
      saveUserData();
      guideConfirmCardDone(s.boxId, '已提交审核');
      GUIDE_CARD_APPLY = null;
      if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('card'); }, 400);
      appendMessage(guideMessage(
        '<p>信用卡申请已提交，状态为<b>审核中</b>，已进入「复核审批」队列。审批通过后会核发新卡，可在申请记录里查看进度。</p>' +
        '<div class="guide-chips">' +
        '<button class="guide-chip" onclick="guideCardApplyRecords()">查看申请记录</button>' +
        '<button class="guide-chip" onclick="guideStartCardApply()">再申请一张</button>' +
        '</div>'
      ));
      scrollToBottom();
      return;
    }
    if (srvApply && srvApply.error) {
      appendMessage(guideMessage('<p>申请未提交：' + guideEsc(srvApply.error) + '</p>'));
      scrollToBottom();
      return;
    }
  }

  var list = (typeof cardApplyList === 'function') ? cardApplyList() : (mockData.userProfile.cardApplications = mockData.userProfile.cardApplications || []);
  var at = new Date().toLocaleDateString('zh-CN');
  var record = { cardType: s.cardType, limit: s.limit, purpose: s.purpose, status: '审核中', appliedAt: at };
  list.push(record);
  saveUserData();
  guideConfirmCardDone(s.boxId, '已提交审核');
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('card'); }, 400);
  GUIDE_CARD_APPLY = null;

  // 申请同时进入「复核审批」队列；审批通过后才会核发新卡
  var review = (typeof submitCardApplyReview === 'function')
    ? submitCardApplyReview(record.cardType, record.limit, record.purpose)
    : null;

  appendMessage(guideMessage(
    '<p>信用卡申请已提交，状态为<b>审核中</b>' + ((review as any) ? '，已进入「复核审批」队列' : '') +
    '。审批通过后会核发新卡，可在申请记录里查看进度。</p>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideCardApplyRecords()">查看申请记录</button>' +
    '<button class="guide-chip" onclick="guideStartCardApply()">再申请一张</button>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideCardApplyCancel() {
  var boxId = GUIDE_CARD_APPLY && GUIDE_CARD_APPLY.boxId;
  GUIDE_CARD_APPLY = null;
  if (!guideConfirmCardCollapse(boxId, '已取消卡片申请，未提交任何资料。')) {
    appendMessage(guideMessage('<p>已取消卡片申请，未提交任何资料。</p>'));
  }
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('card'); }, 400);
  scrollToBottom();
}

// 申请记录：只展示 卡种・用途 / 状态・日期，最新置顶
function guideCardApplyRecords() {
  var list = (typeof cardApplyList === 'function') ? cardApplyList() : [];
  var rows = list.length
    ? list.slice().reverse().map(function (a: any) {
      return '<div class="report-row"><span>' + guideEsc(a.cardType) + '・' + guideEsc(a.purpose) + '</span>' +
        '<b>' + guideEsc(a.status) + '・' + guideEsc(a.appliedAt) + '</b></div>';
    }).join('')
    : '<div class="report-empty">暂无申请记录</div>';
  appendMessage(guideMessage(
    '<p>卡片申请记录（共 ' + list.length + ' 条，最新置顶）：</p>' +
    '<div class="report-panel" style="margin-top:6px;">' +
    '<div class="report-panel-title">申请记录</div>' + rows + '</div>'
  ));
  scrollToBottom();
}

function guideCardLimitState() {
  var s = GUIDE_CARD_LIMIT;
  // 选中的不是主卡时，按该卡自身的额度与已用计算
  if (s && s.card && s.card.id !== 'CARD-MAIN') {
    var usedOther = Number(s.card.used) || 0;
    return { current: Number(s.card.limit) || 0, used: usedOther, min: usedOther };
  }
  var d = (typeof cardLimitData === 'function') ? cardLimitData() : {};
  return {
    current: Number((d as any).effectiveLimit) || 0,
    used: Number((d as any).used) || 0,
    min: (typeof cardLimitMinimum === 'function') ? Number(cardLimitMinimum()) : Number((d as any).used) || 0
  };
}

// 当前可选的信用卡列表（含主卡与已核发的新卡）
function guideCardLimitCards() {
  if (typeof cardServiceCards === 'function') {
    try { return cardServiceCards() || []; } catch (e: any) { return []; }
  }
  return [];
}

function guideCardLabel(card: any) {
  if (!card) return '信用卡';
  return String(card.cardType || '信用卡') + '（尾号 ' + String(card.tail || '----') + '）';
}

function guideCardLimitPickCardHtml(cards: any) {
  var rows = cards.map(function (c: any, i: any) {
    return '<div class="report-row"><span>' + (i + 1) + '. ' + guideEsc(c.cardType || '信用卡') +
      '　尾号 ' + guideEsc(c.tail || '----') + '</span><b>¥' + Number(c.limit || 0).toLocaleString('zh-CN') + '</b></div>';
  }).join('');
  return '<p>你有 ' + cards.length + ' 张信用卡，想调整哪一张的额度？</p>' +
    '<div class="report-panel" style="margin-top:8px;"><div class="report-panel-title">我的信用卡</div>' + rows + '</div>' +
    '<p class="guide-tip">回复卡片尾号（如 6789）或卡种（白金 / 金卡）即可。</p>';
}

// 选卡后进入额度收集
function guideCardLimitPickCard(cardId: any) {
  var s = GUIDE_CARD_LIMIT;
  if (!s || !Array.isArray(s.cards)) return;
  var card = s.cards.filter(function (c: any) { return c.id === cardId; })[0];
  if (!card) return;
  s.card = card;
  s.stage = 'slots';
  var st = guideCardLimitState();
  appendMessage(guideMessage(
    '<p>正在调整「<b>' + guideEsc(guideCardLabel(card)) + '</b>」的额度。</p>' +
    '<p>请告诉我想要调整到的目标额度。</p>' +
    '<p class="guide-tip">当前额度 ¥' + st.current.toLocaleString('zh-CN') +
      (Number(st.min) > 0 ? '，最低可调至 ¥' + st.min.toLocaleString('zh-CN') + '（已用额度）' : '') + '</p>'
  ));
  scrollToBottom();
}

function guideStartCardLimitAdjust() {
  guideResetAllSessions();
  currentModule = 'card';
  var cards = guideCardLimitCards();
  if (cards.length > 1) {
    GUIDE_CARD_LIMIT = { stage: 'pickCard', limit: 0, reason: null, cards: cards, listShown: true };
    appendMessage(guideMessage(guideCardLimitPickCardHtml(cards)));
    scrollToBottom();
    return;
  }
  GUIDE_CARD_LIMIT = { stage: 'slots', limit: 0, reason: null, cards: cards, card: cards[0] || null };
  var st = guideCardLimitState();
  appendMessage(guideMessage(
    (cards[0] ? '<p>正在调整「<b>' + guideEsc(guideCardLabel(cards[0])) + '</b>」的额度。</p>' : '') +
    '<p>请告诉我想要调整到的目标额度，以及调整原因。</p>' +
    '<p class="guide-tip">可选原因：' + CARD_LIMIT_REASONS.join('、') + '</p>' +
    (st.current ? '<p class="guide-tip">当前额度 ¥' + st.current.toLocaleString('zh-CN') +
      (st.min > 0 ? '，最低可调至 ¥' + st.min.toLocaleString('zh-CN') + '（已用额度）' : '') + '</p>' : '')
  ));
  scrollToBottom();
}

function guideCardLimitParse(text: any) {
  var t = String(text || '');
  var limit = 0;
  var m = t.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (m) {
    limit = parseFloat(m[1]);
    if (m[2]) limit *= 10000;
  }

  var reason = CARD_LIMIT_REASONS.filter(function (n: any) { return t.indexOf(n) !== -1; })[0] || null;
  if (!reason) {
    if (/消费.*(增加|需求)|需求.*增加/.test(t)) reason = '消费需求增加';
    else if (/收入.*(提升|增加|提高)|涨薪|加薪/.test(t)) reason = '收入提升';
    else if (/信用.*(良好|好)|记录良好/.test(t)) reason = '信用记录良好';
    else if (/主动.*(降低|降)|降低额度|降额/.test(t)) reason = '主动降低额度';
    else if (/长期不用|不用了|闲置|很少用/.test(t)) reason = '长期不用';
    else if (/风险.*(控制|管理)|控制风险/.test(t)) reason = '风险控制';
    else if (/其他|其它/.test(t)) reason = '其他';
  }
  return { limit: limit, reason: reason };
}

async function guideCardLimitStep(text: any) {
  if (guideIsNegativeAmount(text)) {
    guideAsk(guideMessage('<p>目标额度需要大于 0，请重新输入。</p>' +
    '<p class="guide-tip">例如：80000</p>'));
    return true;
  }
  var t = String(text || '').trim();
  var s = GUIDE_CARD_LIMIT;
  var plain = t.replace(/[吧呢啊呀。.!！?？\s]/g, '');

  // 多卡时先选卡
  if (s.stage === 'pickCard') {
    if (/^(取消|不调了|算了|退出|返回|菜单)$/.test(plain)) {
      GUIDE_CARD_LIMIT = null;
      guideExitSilently();
      return true;
    }
    var picked = guidePickCardFromText(t, s.cards || []);
    if (picked) {
      guideCardLimitPickCard(picked.id);
      return true;
    }
    if (s.listShown) s.listShown = false;
    guideSayInvalid(guideMessage('<p>没听懂你要调整哪张卡。请回复卡片尾号（如 6789）或卡种（白金 / 金卡）。</p>'));
    return true;
  }

  // 确认阶段支持直接打字
  if (s.stage === 'confirm') {
    if (/^(确认|确定|提交|提交申请|是|好|好的|行|可以)$/.test(plain)) { guideCardLimitSubmit(); return true; }
    if (/^(取消|不|不要|算了|退出)$/.test(plain)) { guideCardLimitCancel(); return true; }
  }

  var parsed = guideCardLimitParse(t);

  // 明确说要调到 0 / 低于已用额度：直接提示，不再反复问目标额度
  var stNow = guideCardLimitState();
  var zeroText = /^\s*0\s*(元|块)?\s*$/.test(t) || /(调整|调|改|降|设|改成|改为)/.test(t);
  var explicitZero = Number(parsed.limit) === 0 && zeroText;
  if (explicitZero) {
    var zeroMsg = stNow.min > 0
      ? ('<p>目标额度不能低于已用额度 ¥' + stNow.min.toLocaleString('zh-CN') + '，请重新告诉我目标额度。</p>' +
         '<p class="guide-tip">当前额度 ¥' + stNow.current.toLocaleString('zh-CN') + '，最低可调至 ¥' + stNow.min.toLocaleString('zh-CN') + '（已用额度）。</p>')
      : ('<p>目标额度需要大于 0，请重新告诉我目标额度。</p>' +
         '<p class="guide-tip">当前额度 ¥' + stNow.current.toLocaleString('zh-CN') + '。</p>');
    appendMessage(guideMessage(zeroMsg));
    scrollToBottom();
    s.limit = 0;
    s.stage = 'slots';
    return true;
  }

  // 本地没认出原因/额度（如「最近开销大」「想提到八万」）→ 交给模型映射
  if (!parsed.reason || !(Number(parsed.limit) > 0)) {
    var aiLimit = await guideCardLimitAIReason(t);
    if (GUIDE_CARD_LIMIT !== s) return true;
    if (aiLimit) {
      if (!parsed.reason && aiLimit.reason) parsed.reason = aiLimit.reason;
      if (!(Number(parsed.limit) > 0) && aiLimit.limit > 0) parsed.limit = aiLimit.limit;
    }
  }

  if (Number(parsed.limit) > 0) s.limit = parsed.limit;
  if (parsed.reason) s.reason = parsed.reason;

  if (s.limit > 0 && s.reason) {
    guideCardLimitConfirm();
    return true;
  }
  var stPrompt = guideCardLimitState();
  var limitTip = '<p class="guide-tip">当前额度 ¥' + stPrompt.current.toLocaleString('zh-CN') +
    (Number(stPrompt.min) > 0 ? '，最低可调至 ¥' + stPrompt.min.toLocaleString('zh-CN') + '（已用额度）' : '') + '</p>';
  // 第二段：额度给了，只问原因
  if (s.limit > 0) {
    guideSayInvalid(guideMessage('<p>您的调整原因是？</p><p class="guide-tip">可选原因：' + CARD_LIMIT_REASONS.join('、') + '</p>'));
    return true;
  }
  // 第一段：只问目标额度（原因留到下一步）
  guideSayInvalid(guideMessage('<p>请告诉我想要调整到的目标额度。</p>' + limitTip));
  return true;
}

function guideCardLimitConfirm() {
  var s = GUIDE_CARD_LIMIT;
  if (!s) return;
  var st = guideCardLimitState();

  if (st.current && Number(s.limit) === st.current) {
    appendMessage(guideMessage('<p>当前额度已经是 ¥' + st.current.toLocaleString('zh-CN') + '，请输入一个不同的目标额度。</p>'));
    scrollToBottom();
    s.limit = 0;
    s.stage = 'slots';
    return;
  }
  if (Number(s.limit) < st.min) {
    appendMessage(guideMessage('<p>目标额度不能低于已用额度 ¥' + st.min.toLocaleString('zh-CN') + '，请重新告诉我目标额度。</p>'));
    scrollToBottom();
    s.limit = 0;
    s.stage = 'slots';
    return;
  }

  s.stage = 'confirm';
  s.cardBoxId = s.cardBoxId || ('card-limit-confirm-' + Date.now());
  var direction = Number(s.limit) > st.current ? '提额' : '降额';
  appendMessage(guideMessage(
    '<div id="' + s.cardBoxId + '-wrap">' +
    '<p>确认额度调整申请</p>' +
    '<div class="data-card" id="' + s.cardBoxId + '"><div class="data-card-title">申请信息</div>' +
    (s.card ? '<div class="data-row"><span class="data-label">信用卡</span><span class="data-value">' + guideEsc(guideCardLabel(s.card)) + '</span></div>' : '') +
    '<div class="data-row"><span class="data-label">目标额度</span><span class="data-value">' + Number(s.limit).toLocaleString('zh-CN') + ' 元</span></div>' +
    '<div class="data-row"><span class="data-label">调整原因</span><span class="data-value">' + guideEsc(s.reason) + '</span></div>' +
    '<div class="data-row"><span class="data-label">调整方向</span><span class="data-value">' + direction + '（当前 ¥' + st.current.toLocaleString('zh-CN') + '）</span></div>' +
    '</div>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideCardLimitSubmit()">提交申请</button>' +
    '<button class="guide-chip" onclick="guideCardLimitCancel()">取消</button>' +
    '</div>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideCardLimitSubmit() {
  var s = GUIDE_CARD_LIMIT;
  if (!s || s.stage !== 'confirm') return;
  var st = guideCardLimitState();
  var target = Number(s.limit) || 0;
  // 提交前再校验一次：不能把校验失败后残留的 0 元申请送进复核队列
  if (!(target > 0) || target < st.min || target === st.current) {
    s.limit = 0;
    s.stage = 'slots';
    appendMessage(guideMessage('<p>目标额度无效，请重新告诉我目标额度（不能低于已用额度 ¥' + st.min.toLocaleString('zh-CN') + '，且不能等于当前额度）。</p>'));
    scrollToBottom();
    return;
  }
  var direction = target > st.current ? 'up' : 'down';
  // 提交后确认卡收起按钮，补一行状态
  guideConfirmCardDone(s.cardBoxId ? (s.cardBoxId + '-wrap') : null, '已提交待复核');
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('card'); }, 400);
  GUIDE_CARD_LIMIT = null;

  if (typeof cardLimitSubmitReviewFor === 'function') {
    cardLimitSubmitReviewFor(s.card, target, s.reason, st.current, direction);
  } else if (typeof cardLimitSubmitReview === 'function') {
    cardLimitSubmitReview(target, s.reason, st.current, direction);
  }

  appendMessage(guideMessage(
    '<p>额度调整申请已提交，当前状态<b>待复核</b>，可点击入口查看复核进度。</p>' +
    '<div class="report-panel" style="margin-top:6px;">' +
    '<div class="report-panel-title">待复核</div>' +
    '<div class="report-row"><span>' + (s.card ? guideEsc(guideCardLabel(s.card)) + '・' : '') + '额度调整・' + guideEsc(s.reason) + '</span>' +
    '<b>待复核・' + new Date().toLocaleDateString('zh-CN') + '</b></div>' +
    '</div>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="showCardLimitRecords()">查看调额记录</button>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideCardLimitCancel() {
  var s = GUIDE_CARD_LIMIT;
  var wrapId = s && s.cardBoxId ? (s.cardBoxId + '-wrap') : null;
  GUIDE_CARD_LIMIT = null;
  var wrap = wrapId ? document.getElementById(wrapId) : null;
  if (wrap) {
    // 就地折叠：整块确认消息收成一行，不再追加新消息
    wrap.innerHTML = '<p>已取消额度调整申请，额度保持不变。</p>';
  } else {
    appendMessage(guideMessage('<p>已取消额度调整申请，额度保持不变。</p>'));
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('card'); }, 400);
  }
  scrollToBottom();
}

function guideCardLimitAIReason(text: any) {
  return guideAISlots(
    text,
    '你是银行 App 的意图解析器。用户在申请信用卡额度调整，需要识别「调整原因」，' +
    '只能从 消费需求增加/收入提升/信用记录良好/主动降低额度/长期不用/风险控制/其他 里选一个。' +
    '也请抽取目标额度（中文数字转阿拉伯数字）。只输出 JSON：{"reason":"或空","limit":数字或null}。',
    function (o: any) {
      if (!o) return null;
      var r = CARD_LIMIT_REASONS.indexOf(o.reason) !== -1 ? o.reason : null;
      var l = Number(o.limit);
      if (!(l > 0)) l = null as any;
      if (!r && l === null) return null;
      return { reason: r, limit: l };
    }
  );
}

function guideCardLostCards() {
  if (typeof cardServiceCards === 'function') return cardServiceCards();
  return [];
}

function guideStartCardLost(text: any) {
  guideResetAllSessions();
  GUIDE_CARD_LOST = { stage: 'slots', card: null };
  currentModule = 'card';
  // 「挂失尾号6789的卡」这类说法：直接选中对应卡片，省一步
  var tail = String(text || (typeof window !== 'undefined' ? window.__GUIDE_LAST_TEXT : '') || '').replace(/\D/g, '');
  if (tail.length >= 4) {
    var hit = guideCardLostCards().filter(function (c: any) {
      return String(c.tail || c.number || '').replace(/\D/g, '').slice(-4) === tail.slice(-4);
    })[0];
    if (hit) {
      GUIDE_CARD_LOST.card = hit;
      // 直接走一遍正常的尾号确认（会渲染「请确认挂失尾号 XXXX」的确认卡）
      return guideCardLostStep(String(hit.tail || tail));
    }
  }
  var cards = guideCardLostCards();
  // 沿用「我的卡片」列表样式
  var listHtml = (typeof cardServiceListHtml === 'function')
    ? cardServiceListHtml({ list: cards, hideApply: true })
    : '';
  appendMessage(guideMessage(listHtml + '<p style="margin-top:10px;">请提供需要挂失的卡片尾号。</p>'));
  scrollToBottom();
}

function guideCardLostStep(text: any) {
  var t = String(text || '').trim();
  var s = GUIDE_CARD_LOST;

  // 确认阶段支持直接打字
  if (s.stage === 'confirm') {
    var plainLost = t.replace(/[吧呢啊呀。.!！?？\s]/g, '');
    if (/^(确认|确定|确认挂失|挂失|是|好|好的|行|可以)$/.test(plainLost)) { guideCardLostSubmit(); return true; }
    if (/^(取消|不|不要|算了|退出)$/.test(plainLost)) { guideCardLostCancel(); return true; }
  }

  var digits = t.replace(/\D/g, '');

  if (digits.length < 4) {
    guideAsk(guideMessage('<p>请提供 4 位卡片尾号。</p>'));
    scrollToBottom();
    return true;
  }

  var tail = digits.slice(-4);
  var card = guideCardLostCards().filter(function (c: any) { return String(c.tail) === tail; })[0];
  if (!card) {
    appendMessage(guideMessage('<p>未找到尾号 <b>' + guideEsc(tail) + '</b> 的卡片，请重新输入尾号。</p>'));
    scrollToBottom();
    return true;
  }

  s.card = card;
  s.tail = tail;
  s.stage = 'confirm';
  s.confirmBoxId = 'card-lost-confirm-' + Date.now();
  appendMessage(guideMessage(
    '<div id="' + s.confirmBoxId + '">' +
    '<p>请确认挂失尾号 <b>' + guideEsc(tail) + '</b> 的信用卡。</p>' +
    '<p class="guide-tip">挂失后卡片无法使用，资金交易需等补新卡后恢复正常。</p>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideCardLostSubmit()">确认挂失</button>' +
    '<button class="guide-chip" onclick="guideCardLostCancel()">取消</button>' +
    '</div>' +
    '</div>'
  ));
  scrollToBottom();
  return true;
}

// 点击【确认挂失】：先做风险确认（交易密码 / 短信验证码 / 指纹），通过后才冻结卡片
function guideCardLostSubmit() {
  var s = GUIDE_CARD_LOST;
  if (!s || s.stage !== 'confirm') return;
  var card = s.card || {};

  if (typeof showSecurityVerification !== 'function') {
    guideCardLostApply(card);
    return;
  }

  showSecurityVerification(
    '信用卡挂失 · ' + (card.cardType || '信用卡') + ' 尾号 ' + (card.tail || '****'),
    function (ok: any) {
      if (!ok) {
        guideCardLostCollapse('未通过安全验证，已取消挂失，卡片状态保持不变。');
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('card'); }, 400);
        return;
      }
      guideCardLostApply(card);
    }
  );
}

// 验证通过后真正冻结卡片并出结果卡
async function guideCardLostApply(card: any) {
  var c = card || {};

  // —— 服务端权威：后端在线时由服务端冻结卡片 ——
  if (typeof API !== 'undefined' && API.live && typeof apiCardLost === 'function' && c.tail) {
    var srvLost = null;
    try { srvLost = await apiCardLost(c.tail); } catch (e: any) { srvLost = null; }
    if (srvLost && srvLost.ok) {
      if (Array.isArray(srvLost.cards)) mockData.userProfile.creditCards = srvLost.cards;
      if (mockData.userProfile.creditCard) {
        mockData.userProfile.creditCard.isFrozen = true;
        mockData.userProfile.creditCard.status = '已挂失';
      }
      saveUserData();
      var boxIdSrv = GUIDE_CARD_LOST && GUIDE_CARD_LOST.confirmBoxId;
      GUIDE_CARD_LOST = null;
      if (boxIdSrv && typeof guideCardLostCollapse === 'function') guideCardLostCollapse('信用卡已挂失，新卡将在 3 个工作日内寄出。');
      appendMessage(guideMessage('<p>信用卡已挂失（尾号 <b>' + guideEsc(c.tail) + '</b>），新卡将在 3 个工作日内寄出。</p>'));
      scrollToBottom();
      if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('card'); }, 400);
      return;
    }
    if (srvLost && srvLost.error) {
      GUIDE_CARD_LOST = null;
      appendMessage(guideMessage('<p>挂失未执行：' + guideEsc(srvLost.error) + '</p>'));
      scrollToBottom();
      return;
    }
  }
  if (c.status === '已挂失' || (c.id === 'CARD-MAIN' && (cardFrozen || (mockData.userProfile.creditCard && mockData.userProfile.creditCard.isFrozen)))) {
    GUIDE_CARD_LOST = null;
    appendMessage(guideMessage('<p>该卡片已经是挂失状态，无需重复挂失。</p>'));
    scrollToBottom();
    return;
  }
  // 卡片状态：主卡走全局冻结标记，其余卡片标记本身状态
  if (c.id === 'CARD-MAIN') {
    cardFrozen = true;
    if (mockData.userProfile.creditCard) {
      mockData.userProfile.creditCard.isFrozen = true;
      mockData.userProfile.creditCard.status = '已挂失';
    }
  }
  c.status = '已挂失';
  c.frozenAt = new Date().toLocaleString('zh-CN');
  saveUserData();
  // 成功：确认块收起成一行，避免按钮残留
  var okBoxId = GUIDE_CARD_LOST && GUIDE_CARD_LOST.confirmBoxId;
  var okBox = okBoxId ? document.getElementById(okBoxId) : null;
  if (okBox) {
    okBox.innerHTML = '<p>已确认挂失尾号 <b>' + guideEsc(c.tail || '****') + '</b> 的' + guideEsc(c.cardType || '信用卡') + '。</p>';
  }
  GUIDE_CARD_LOST = null;

  appendMessage(guideMessage(
    '<p>挂失办理成功，卡片状态已更新。</p>' +
    '<div class="data-card"><div class="data-card-title">挂失信息</div>' +
    '<div class="data-row"><span class="data-label">卡片</span><span class="data-value">' + guideEsc(c.cardType || '信用卡') + ' · 尾号 ' + guideEsc(c.tail || '****') + '</span></div>' +
    '<div class="data-row"><span class="data-label">当前状态</span><span class="data-value" style="color:#B42318;">已挂失</span></div>' +
    '<div class="data-row"><span class="data-label">办理时间</span><span class="data-value">' + c.frozenAt + '</span></div>' +
    '</div>' +
    '<div class="guide-chips"><button class="guide-chip" onclick="showCardMyCards()">查看我的卡片</button></div>'
  ));
  scrollToBottom();
}
// 取消 / 验证失败：把确认块整体折叠成一行
function guideCardLostCollapse(text: any) {
  var s = GUIDE_CARD_LOST;
  var boxId = s && s.confirmBoxId;
  var box = boxId ? document.getElementById(boxId) : null;
  GUIDE_CARD_LOST = null;
  if (box) {
    box.innerHTML = '<p>' + text + '</p>';
  } else {
    appendMessage(guideMessage('<p>' + text + '</p>'));
  }
  scrollToBottom();
}

function guideCardLostCancel() {
  guideCardLostCollapse('已取消挂失，卡片状态保持不变。');
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('card'); }, 400);
}
