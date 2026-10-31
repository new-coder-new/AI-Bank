// ==========================================================================
//  引导层（TypeScript 源码，noCheck 转译）
//  编译产物：js/flows/guide-sub.js
//  说明：该层是「经典脚本 + 全局状态」结构，状态对象（GUIDE_*）随流程变化，
//        因此采用 noCheck 转译；对外入口在 types/global.d.ts 声明。
// ==========================================================================

// 引导层：订阅管理（由 guide.js 拆分而来）


function guideSubActive() {
  if (!Array.isArray(mockData.subscriptions)) mockData.subscriptions = [];
  return mockData.subscriptions;
}

// 订阅名比较统一忽略空格和大小写：「某易云 VIP」与「某易云VIP」视为同一服务
function guideSubNormName(n: any) {
  return String(n == null ? '' : n).replace(/\s+/g, '').toLowerCase();
}

function guideSubCycleText(cycle: any) {
  return SUB_CYCLE_TEXT[cycle] || cycle || '';
}

function guideSubHistoryList() {
  var u = mockData.userProfile || (mockData.userProfile = {});
  if (!Array.isArray(u.subscriptionHistory)) u.subscriptionHistory = [];
  return u.subscriptionHistory;
}

function guideSubParseCycle(text: any) {
  var t = String(text || '');
  if (/按年|每年|年卡|包年|一年|\/年/.test(t)) return '/年';
  if (/按季|每季|季卡|包季|三个月|季度|\/季/.test(t)) return '/季';
  if (/按月|每月|月卡|包月|一个月|\/月/.test(t)) return '/月';
  return null;
}

// 「是 / 否」→ 开启 / 关闭；本地认不出再问模型
function guideSubYesNo(text: any) {
  var t = String(text || '').trim().replace(/[。.!！?？,，\s]/g, '');
  if (!t) return null;
  if (/(不开启|不要|不用|不需要|关闭|否|不|别)/.test(t)) return false;
  if (/(开启|打开|需要|要|是|好|可以|续费)/.test(t)) return true;
  return null;
}

// 订阅清单（只读）：展示全部可订阅会员 + 已订阅标记
function guideSubShowCatalog() {
  var active = (typeof guideSubActive === 'function') ? guideSubActive() : [];
  var activeNames = active.map(function (x: any) { return String(x.name || ''); });
  var rows = SUB_PRESETS.map(function (p: any) {
    var key = String(p.name).replace(' VIP', '').replace('VIP', '');
    var mine = activeNames.some(function (n: any) { return n.indexOf(key) !== -1; });
    return '<div class="report-row"><span>' + guideEsc(p.name) + (mine ? '（已订阅）' : '') + '</span>' +
      '<b>月 ¥' + p.prices['/月'] + ' / 季 ¥' + p.prices['/季'] + ' / 年 ¥' + p.prices['/年'] + '</b></div>';
  }).join('');
  appendMessage(guideMessage(
    '<p>可订阅的会员服务（共 ' + SUB_PRESETS.length + ' 项）</p>' +
    '<div class="report-panel"><div class="report-panel-title">可订阅会员</div>' + rows + '</div>'
  ));
  scrollToBottom();
}

function guideSubPresetRows() {
  return SUB_PRESETS.map(function (p: any) {
    return '<div class="report-row"><span>' + guideEsc(p.name) + '</span>' +
      '<b>月 ¥' + p.prices['/月'] + ' / 季 ¥' + p.prices['/季'] + ' / 年 ¥' + p.prices['/年'] + '</b></div>';
  }).join('');
}

// —— 添加订阅 ——
function guideStartSubAdd() {
  guideResetAllSessions();
  GUIDE_SUB = { mode: 'add', stage: 'slots', preset: null, cycle: null, autoRenew: null, listShown: true };
  currentModule = 'sub';
  appendMessage(guideMessage(
    '<p>可订阅的服务如下：</p>' +
    '<div class="report-panel"><div class="report-panel-title">可订阅服务</div>' + guideSubPresetRows() + '</div>' +
    '<p>请选择订阅服务与扣费周期。</p>' +
    '<p class="guide-tip">扣费周期：按月扣费 / 按季扣费 / 按年扣费</p>'
  ));
  scrollToBottom();
}

async function guideSubAddStep(text: any) {
  var t = String(text || '').trim();
  var s = GUIDE_SUB;
  var svc = guideSubFindService(t);
  var cycle = guideSubParseCycle(t);

  if (!svc || !cycle) {
    var ai = await guideSubAIExtract(t);
    if (GUIDE_SUB !== s) return true;
    if (ai) {
      if (!svc && ai.preset) svc = { kind: 'preset', preset: ai.preset, name: ai.preset.name };
      if (!cycle && ai.cycle) cycle = ai.cycle;
    }
  }

  if (svc && svc.kind === 'preset') s.preset = svc.preset;
  if (svc && svc.kind === 'active') {
    appendMessage(guideMessage('<p>「' + guideEsc(svc.name) + '」已在订阅列表中，无需重复添加。</p>'));
    scrollToBottom();
    return true;
  }
  if (cycle) s.cycle = cycle;

  if (s.preset && s.cycle) {
    s.stage = 'autoRenew';
    appendMessage(guideMessage('<p>是否开启自动续费？</p><div class="guide-chips">' +
      '<button class="guide-chip" onclick="guideSubAddRenewChoice(true)">是</button>' +
      '<button class="guide-chip" onclick="guideSubAddRenewChoice(false)">否</button>' +
      '</div>'));
    scrollToBottom();
    return true;
  }
  if (s.preset) {
    appendMessage(guideMessage('<p>请选择扣费周期。</p><p class="guide-tip">按月扣费 / 按季扣费 / 按年扣费</p>'));
    scrollToBottom();
    return true;
  }
  if (s.cycle) {
    appendMessage(guideMessage('<p>请选择需要添加的订阅服务。</p>' +
      '<div class="report-panel"><div class="report-panel-title">可订阅服务</div>' + guideSubPresetRows() + '</div>'));
    scrollToBottom();
    return true;
  }
  // 认不出用户说的服务时也要有回应：不再静默
  if (s.listShown) s.listShown = false;
  guideSayInvalid(guideMessage('<p>没听懂你想订哪一项，请从下面选择（可同时说周期）。</p>' +
    '<div class="report-panel"><div class="report-panel-title">可订阅服务</div>' + guideSubPresetRows() + '</div>'));
  return true;
}

function guideSubAddRenewChoice(yes: any) {
  var s = GUIDE_SUB;
  if (!s || s.mode !== 'add') return;
  s.autoRenew = yes;
  guideSubAddConfirm();
}

function guideSubAddConfirm() {
  var s = GUIDE_SUB;
  if (!s || !s.preset || !s.cycle) return;
  s.stage = 'confirm';
  s.boxId = s.boxId || ('sub-add-confirm-' + Date.now());
  var price = s.preset.prices[s.cycle];
  appendMessage(guideMessage(
    '<div id="' + s.boxId + '">' +
    '<div class="data-card"><div class="data-card-title">确认新增订阅</div>' +
    '<div class="data-row"><span class="data-label">订阅服务</span><span class="data-value">' + guideEsc(s.preset.name) + '</span></div>' +
    '<div class="data-row"><span class="data-label">扣费周期</span><span class="data-value">' + guideSubCycleText(s.cycle) + '</span></div>' +
    '<div class="data-row"><span class="data-label">自动续费</span><span class="data-value">' + (s.autoRenew ? '开启' : '关闭') + '</span></div>' +
    '<div class="data-row"><span class="data-label">首次扣费</span><span class="data-value expense">¥ ' + price.toFixed(2) + '</span></div>' +
    '</div>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideSubAddSubmit()">确认添加</button>' +
    '<button class="guide-chip" onclick="guideSubCancelOp()">取消</button>' +
    '</div>' +
    '</div>'
  ));
  scrollToBottom();
}

async function guideSubAddSubmit() {
  var s = GUIDE_SUB;
  if (!s || s.stage !== 'confirm') return;
  var preset = s.preset;
  var cycle = s.cycle;
  var autoRenew = s.autoRenew === true;
  var price = preset.prices[cycle];
  var boxId = s.boxId;

  // 重复检测：已有有效订阅时提示，不再重复添加
  var dup = guideSubActive().filter(function (x: any) { return guideSubNormName(x.name) === guideSubNormName(preset.name); })[0];
  if (dup) {
    appendMessage(guideMessage('<p>「<b>' + guideEsc(preset.name) + '</b>」已有有效订阅（' +
      guideSubCycleText(dup.cycle) + '，自动续费' + (dup.autoRenew !== false ? '开启' : '关闭') + '），无需重复添加。</p>'));
    scrollToBottom();
    GUIDE_SUB = null;
    return;
  }

  GUIDE_SUB = null;
  if (typeof verifyAmountRisk === 'function') {
    var risk = await verifyAmountRisk(price, '订阅首次扣费');
    if (risk && risk.pendingReview) return;
    if (!risk || !risk.ok) {
      appendMessage(guideMessage('<p>已取消订阅，账户未发生扣款。</p>'));
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('sub'); }, 400);
      scrollToBottom();
      return;
    }
  }
  var cycleText = cycle === '/月' ? '包月' : cycle === '/季' ? '包季' : '包年';

  // —— 服务端权威：后端在线时由服务端扣首期并落订阅 ——
  if (typeof API !== 'undefined' && API.live && typeof apiSubscriptionAdd === 'function') {
    var srvSub = null;
    try {
      srvSub = await apiSubscriptionAdd({ name: preset.name, cycle: cycle, price: price, autoRenew: autoRenew });
    } catch (e) { srvSub = null; }
    if (srvSub && srvSub.ok) {
      if (Array.isArray(srvSub.subscriptions)) mockData.subscriptions = srvSub.subscriptions;
      mockData.userProfile.debitCard.balance = Number(srvSub.balance);
      mockData.userProfile.debitCard.available = Number(srvSub.available);
      saveUserData();
      guideConfirmCardDone(boxId, '已添加');
      GUIDE_SUB = null;
      if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('sub'); }, 400);
      appendMessage(guideMessage(
        '<p>' + guideEsc(preset.name) + ' 添加成功，扣费周期' + guideSubCycleText(cycle) + '，自动续费' + (autoRenew ? '已开启' : '已关闭') + '。</p>' +
        '<div class="guide-chips"><button class="guide-chip" onclick="guideStartSubManage()">查看订阅管理</button></div>'
      ));
      scrollToBottom();
      return;
    }
    if (srvSub && srvSub.error) {
      GUIDE_SUB = null;
      appendMessage(guideMessage('<p>订阅未开通：' + guideEsc(srvSub.error) + '</p>'));
      scrollToBottom();
      if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('sub'); }, 400);
      return;
    }
    // 服务端不可用 → 本地逻辑
  }

  var okTx = (typeof addTransaction === 'function')
    ? addTransaction('expense', price, '订阅扣费-' + preset.name + '(' + cycleText + ')', '订阅扣费', true)
    : true;
  if (okTx === false) {
    appendMessage(guideMessage('<p>❌ 订阅未开通：可用余额不足，首次扣费失败。</p>'));
    scrollToBottom();
    return;
  }

  var nextDate = new Date();
  if (cycle === '/月') nextDate.setMonth(nextDate.getMonth() + 1);
  else if (cycle === '/季') nextDate.setMonth(nextDate.getMonth() + 3);
  else nextDate.setFullYear(nextDate.getFullYear() + 1);
  // 用本地日期，避免 UTC+8 凌晨 toISOString() 少一天
  var nextDateStr = guideDateStr(nextDate);
  var chargeInDays = Math.max(1, Math.ceil((nextDate.getTime() - Date.now()) / 86400000));
  var ids = guideSubActive().map(function (x: any) { return Number(x.id) || 0; });
  ids.push(0);
  var newId = Math.max.apply(null, ids) + 1;

  guideSubActive().push({
    id: newId,
    icon: '',
    name: preset.name.replace(/\s+/g, ''),
    detail: '连续' + cycleText + ' · ' + (autoRenew ? '自动续费' : '到期取消') + ' · 下次扣款' + nextDateStr,
    price: price,
    cycle: cycle,
    cycleLabel: '连续' + cycleText,
    autoRenew: autoRenew,
    chargeInDays: chargeInDays,
    chargeDate: nextDateStr,
    usage: '中'
  });
  saveUserData();

  guideConfirmCardDone(boxId, '已添加');
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('sub'); }, 400);
  appendMessage(guideMessage(
    '<p>' + guideEsc(preset.name) + ' 添加成功，扣费周期' + guideSubCycleText(cycle) + '，自动续费' + (autoRenew ? '已开启' : '已关闭') + '。</p>' +
    '<div class="guide-chips"><button class="guide-chip" onclick="guideStartSubManage()">查看订阅管理</button></div>'
  ));
  scrollToBottom();
}

// —— 订阅管理（自动续费）——
// 订阅管理：统一入口，先问要做什么，再分别进入添加 / 取消 / 自动续费
function guideStartSubManage() {
  guideResetAllSessions();
  GUIDE_SUB = { mode: 'choose', stage: 'choose' };
  currentModule = 'sub';
  appendMessage(guideMessage(
    '<p>订阅管理包含以下操作：</p>' +
    '<div class="guide-rows">' +
    '<div class="guide-row"><div class="guide-row-title">添加订阅</div><div class="guide-row-example">例如：我想要订阅某易云年卡</div></div>' +
    '<div class="guide-row"><div class="guide-row-title">取消订阅</div><div class="guide-row-example">例如：取消所有订阅</div></div>' +
    '<div class="guide-row"><div class="guide-row-title">管理自动续费</div><div class="guide-row-example">例如：某度网盘年卡不续费了</div></div>' +
    '<div class="guide-row"><div class="guide-row-title">可订阅会员</div><div class="guide-row-example">例如：能订哪些会员</div></div>' +
    '</div>' +
    '<p class="guide-tip">直接说出你的需求即可（照示例说也行）。</p>'
  ));
  scrollToBottom();
}

// 三个分支：添加（先展示可订阅产品）/ 取消（先展示现有订阅）/ 自动续费（先展示现有订阅）
function guideSubChoose(kind: any) {
  if (kind === 'add') { guideStartSubAdd(); return; }
  if (kind === 'cancel') { guideStartSubCancel(); return; }
  guideStartSubAutoRenew();
}

// 管理自动续费：先展示现有订阅，再问要开启/关闭哪一项
function guideStartSubAutoRenew() {
  guideResetAllSessions();
  GUIDE_SUB = { mode: 'manage', stage: 'slots', target: null, newAutoRenew: null, listShown: true };
  currentModule = 'sub';
  var list = guideSubActive();
  var history = guideSubHistoryList();
  if (!list.length) {
    appendMessage(guideMessage('<p>目前没有可管理自动续费的有效订阅。</p>' +
      '<div class="guide-chips"><button class="guide-chip" onclick="guideStartSubAdd()">添加新订阅</button></div>'));
    scrollToBottom();
    return;
  }
  var rows = list.map(function (sub: any) {
    return '<div class="report-row"><span>' + guideEsc(sub.name) + '・' + guideSubCycleText(sub.cycle) + '</span>' +
      '<b>自动续费：' + (sub.autoRenew !== false ? '开启' : '关闭') + '</b></div>';
  }).join('');
  var historyHtml = history.length ? history.map(function (h: any) {
    return '<div class="report-row"><span>' + guideEsc(h.name) + '・' + guideSubCycleText(h.cycle) + '・自动续费：' + (h.autoRenew ? '开启' : '关闭') + '</span>' +
      '<b>已取消・' + guideEsc(h.cancelledAt) + '</b></div>';
  }).join('') : '';
  appendMessage(guideMessage(
    '<p>当前有效订阅如下：</p>' +
    '<div class="report-panel"><div class="report-panel-title">有效订阅</div>' + rows + '</div>' +
    (historyHtml ? '<div class="report-panel" style="margin-top:10px;"><div class="report-panel-title">历史记录</div>' + historyHtml + '</div>' : '') +
    '<p>需要取消或开启哪一项的自动续费？例如「关闭某讯 VIP 的自动续费」。</p>'
  ));
  scrollToBottom();
}
async function guideSubManageStep(text: any) {
  var t = String(text || '').trim();
  var s = GUIDE_SUB;
  var svc = guideSubFindService(t);
  var want = /(关闭|取消续费|关掉|停止|不要|不续费|不想续费|别续费|不用续费|不再续|不自动续费)/.test(t) ? false
    : (/(开启|打开|开一下|恢复|要)/.test(t) ? true : null);

  if (!svc) {
    var ai = await guideSubAIExtract(t);
    if (GUIDE_SUB !== s) return true;
    if (ai && ai.preset) svc = { kind: 'preset', preset: ai.preset, name: ai.preset.name };
  }

  var target = svc && svc.kind === 'active' ? svc.sub : null;
  if (!target && svc) target = guideSubActive().filter(function (x: any) { return guideSubNormName(x.name) === guideSubNormName(svc.name); })[0] || null;
  if (target) s.target = target;
  if (want !== null) s.newAutoRenew = want;

  if (!s.target) {
    if (s.listShown && !svc) s.listShown = false;
    var hint = svc ? ('没有找到「' + guideEsc(svc.name) + '」的有效订阅。') : '没听懂你想管理哪一项。';
    var names = guideSubActive().map(function (x: any) { return x.name; }).join('、') || '暂无订阅';
    guideSayInvalid(guideMessage('<p>' + hint + '</p><p>请告诉我要管理哪一项订阅的自动续费。</p>' +
      '<p class="guide-tip">当前有效订阅：' + guideEsc(names) + '</p>'));
    return true;
  }
  if (s.newAutoRenew === null) {
    appendMessage(guideMessage('<p>是开启还是关闭「' + guideEsc(s.target.name) + '」的自动续费？</p>' +
      '<div class="guide-chips">' +
      '<button class="guide-chip" onclick="guideSubManageConfirm(true)">开启自动续费</button>' +
      '<button class="guide-chip" onclick="guideSubManageConfirm(false)">关闭自动续费</button>' +
      '</div>'));
    scrollToBottom();
    return true;
  }
  guideSubManageConfirm(s.newAutoRenew);
  return true;
}

function guideSubManageConfirm(want: any) {
  var s = GUIDE_SUB;
  if (!s || !s.target) return;
  s.newAutoRenew = want;
  s.stage = 'confirm';
  s.boxId = s.boxId || ('sub-manage-confirm-' + Date.now());
  var cur = s.target.autoRenew !== false;
  appendMessage(guideMessage(
    '<div id="' + s.boxId + '">' +
    '<div class="data-card"><div class="data-card-title">确认修改自动续费</div>' +
    '<div class="data-row"><span class="data-label">订阅服务</span><span class="data-value">' + guideEsc(s.target.name) + '</span></div>' +
    '<div class="data-row"><span class="data-label">当前自动续费</span><span class="data-value">' + (cur ? '开启' : '关闭') + '</span></div>' +
    '<div class="data-row"><span class="data-label">修改后自动续费</span><span class="data-value">' + (want ? '开启' : '关闭') + '</span></div>' +
    '</div>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideSubManageSubmit()">确认修改</button>' +
    '<button class="guide-chip" onclick="guideSubCancelOp()">取消</button>' +
    '</div>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideSubManageSubmit() {
  var s = GUIDE_SUB;
  if (!s || s.stage !== 'confirm' || !s.target) return;
  var sub = guideSubActive().filter(function (x: any) { return x.id === s.target.id; })[0] || s.target;
  sub.autoRenew = s.newAutoRenew === true;
  sub.detail = String(sub.detail || '').replace(/自动续费|到期取消/, sub.autoRenew ? '自动续费' : '到期取消');
  saveUserData();
  var msg = sub.name + ' 的自动续费' + (sub.autoRenew ? '已开启' : '已关闭') + '。';
  guideConfirmCardDone(s.boxId, '已修改');
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('sub'); }, 400);
  GUIDE_SUB = null;
  appendMessage(guideMessage('<p>' + guideEsc(msg) + '</p>' +
    (sub.autoRenew ? '' : '<p class="guide-tip">关闭自动续费后不再扣费，权益可用到本付费周期结束。</p>')));
  scrollToBottom();
}

// —— 取消订阅 ——
function guideStartSubCancel() {
  guideResetAllSessions();
  GUIDE_SUB = { mode: 'cancel', stage: 'slots', target: null };
  currentModule = 'sub';
  var list = guideSubActive();
  if (!list.length) {
    appendMessage(guideMessage('<p>当前没有可取消的有效订阅。</p>' +
      '<div class="guide-chips">' +
      '<button class="guide-chip" onclick="guideStartSubManage()">查看总订阅情况</button>' +
      '<button class="guide-chip" onclick="guideStartSubAdd()">添加新订阅</button>' +
      '</div>'));
    scrollToBottom();
    return;
  }
  var rows = list.map(function (sub: any) {
    return '<div class="report-row"><span>' + guideEsc(sub.name) + '</span><b>' +
      guideSubCycleText(sub.cycle) + '・' + (sub.autoRenew !== false ? '自动续费开启' : '自动续费关闭') + '</b></div>';
  }).join('');
  if (GUIDE_SUB && GUIDE_SUB.mode === 'cancel') /** @type {any} */ (GUIDE_SUB).listShown = true;
  guideAsk(guideMessage('<p>请选择你想要取消的订阅项目。</p>' +
    '<div class="report-panel"><div class="report-panel-title">有效订阅</div>' + rows + '</div>'));
  scrollToBottom();
}

async function guideSubCancelStep(text: any) {
  var t = String(text || '').trim();
  var s = GUIDE_SUB;
  var svc = guideSubFindService(t);
  if (!svc) {
    var ai = await guideSubAIExtract(t);
    if (GUIDE_SUB !== s) return true;
    if (ai && ai.preset) svc = { kind: 'preset', preset: ai.preset, name: ai.preset.name };
  }
  var target = svc && svc.kind === 'active' ? svc.sub : (svc ? guideSubActive().filter(function (x: any) { return guideSubNormName(x.name) === guideSubNormName(svc.name); })[0] : null);
  if (!target) {
    // 用户说了与订阅无关的话：每句都要给回应，不能静默
    if (s.listShown && !svc) s.listShown = false;
    var hint2 = svc ? ('没有找到「' + guideEsc(svc.name) + '」的有效订阅。') : '没听懂你想取消哪一项。';
    var names2 = guideSubActive().map(function (x: any) { return x.name; }).join('、') || '暂无订阅';
    guideSayInvalid(guideMessage('<p>' + hint2 + '</p><p>请选择你想要取消的订阅项目。</p>' +
      '<p class="guide-tip">当前有效订阅：' + guideEsc(names2) + '</p>'));
    return true;
  }
  s.target = target;
  s.stage = 'confirm';
  appendMessage(guideMessage(
    '<div class="data-card"><div class="data-card-title">确认取消订阅</div>' +
    '<div class="data-row"><span class="data-label">订阅服务</span><span class="data-value">' + guideEsc(target.name) + '</span></div>' +
    '<div class="data-row"><span class="data-label">当前扣费周期</span><span class="data-value">' + guideSubCycleText(target.cycle) + '</span></div>' +
    '<div class="data-row"><span class="data-label">自动续费状态</span><span class="data-value">' + (target.autoRenew !== false ? '开启' : '关闭') + '</span></div>' +
    '<div class="data-row"><span class="data-label">操作</span><span class="data-value">取消订阅</span></div>' +
    '</div>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideSubCancelSubmit()">确认取消</button>' +
    '<button class="guide-chip" onclick="guideSubCancelOp()">返回</button>' +
    '</div>'
  ));
  scrollToBottom();
  return true;
}

function guideSubCancelSubmit() {
  var s = GUIDE_SUB;
  if (!s || s.stage !== 'confirm' || !s.target) return;
  var target = s.target;
  mockData.subscriptions = guideSubActive().filter(function (x: any) { return x.id !== target.id; });
  guideSubHistoryList().unshift({
    name: target.name,
    cycle: target.cycle,
    autoRenew: target.autoRenew !== false,
    cancelledAt: new Date().toLocaleString('zh-CN')
  });
  if (typeof apiSubscriptionCancel === 'function') apiSubscriptionCancel(target.id);
  saveUserData();
  GUIDE_SUB = null;
  appendMessage(guideMessage('<p>' + guideEsc(target.name) + ' 已完成取消操作。</p>' +
    '<div class="guide-chips"><button class="guide-chip" onclick="guideStartSubManage()">查看订阅总览</button></div>'));
  scrollToBottom();
}

// ------------------------------ 一键取消所有订阅 ------------------------------
function guideSubCancelAllStart() {
  var list = guideSubActive().slice();
  if (!list.length) {
    // 首屏数据可能还在异步加载：稍等重试一次
    GUIDE_SUB = { mode: 'choose', stage: 'choose' };
    setTimeout(function () {
      if (guideSubActive().length) { guideSubCancelAllStart(); return; }
    }, 500);
    appendMessage(guideMessage('<p>当前没有可取消的有效订阅。</p>' +
      '<div class="guide-chips"><button class="guide-chip" onclick="guideStartSubManage()">返回订阅管理</button></div>'));
    scrollToBottom();
    return;
  }
  guideResetAllSessions();
  var boxId = 'sub-cancel-all-' + Date.now();
  GUIDE_SUB = { mode: 'cancel-all', stage: 'confirm', list: list, boxId: boxId };
  var rows = list.map(function (sub: any) {
    return '<div class="report-row"><span>' + guideEsc(sub.name) + '</span><b>' +
      guideSubCycleText(sub.cycle) + '・' + (sub.autoRenew !== false ? '自动续费开启' : '自动续费关闭') + '</b></div>';
  }).join('');
  appendMessage(guideMessage(
    '<div id="' + boxId + '">' +
    '<p>确认取消全部 <b>' + list.length + '</b> 个订阅？</p>' +
    '<div class="report-panel"><div class="report-panel-title">即将取消</div>' + rows + '</div>' +
    '<p class="guide-tip">取消后立即失效，历史记录会保留。</p>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideSubCancelAllSubmit()">确认全部取消</button>' +
    '<button class="guide-chip" onclick="guideSubCancelAllOp()">取消</button>' +
    '</div></div>'
  ));
  scrollToBottom();
}

function guideSubCancelAllSubmit() {
  var s = GUIDE_SUB;
  if (!s || s.mode !== 'cancel-all' || s.stage !== 'confirm') return;
  var list = (s.list || []).slice();
  var hist = guideSubHistoryList();
  var now = new Date().toLocaleString('zh-CN');
  list.forEach(function (sub: any) {
    hist.unshift({
      name: sub.name,
      cycle: sub.cycle,
      autoRenew: sub.autoRenew !== false,
      cancelledAt: now
    });
    if (typeof apiSubscriptionCancel === 'function') apiSubscriptionCancel(sub.id);
  });
  mockData.subscriptions = [];
  saveUserData();
  GUIDE_SUB = null;
  guideConfirmCardDone(s.boxId, '已全部取消');
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('sub'); }, 400);
  appendMessage(guideMessage('<p>已取消全部 ' + list.length + ' 个订阅。</p>' +
    '<div class="guide-chips"><button class="guide-chip" onclick="guideStartSubManage()">查看订阅管理</button></div>'));
  scrollToBottom();
}

function guideSubCancelAllOp() {
  var boxId = GUIDE_SUB && GUIDE_SUB.boxId;
  GUIDE_SUB = null;
  if (!guideConfirmCardCollapse(boxId, '未执行取消，订阅状态保持原样。')) {
    appendMessage(guideMessage('<p>未执行取消，订阅状态保持原样。</p>'));
  }
  scrollToBottom();

  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('sub'); }, 400);
}
function guideSubCancelOp() {
  var boxId = GUIDE_SUB && GUIDE_SUB.boxId;
  GUIDE_SUB = null;
  if (!guideConfirmCardCollapse(boxId, '未执行取消，订阅状态保持原样。')) {
    appendMessage(guideMessage('<p>未执行取消，订阅状态保持原样。</p>'));
  }
  scrollToBottom();

  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('sub'); }, 400);
}

// 订阅会话统一入口（异步：自动续费的是/否可能要问模型）
async function guideSubSession(t: any) {
  var s = GUIDE_SUB;
  if (!s) return true;
  var plain = String(t || '').replace(/[吧呢啊呀。.!！?？\s]/g, '');

  // 统一入口：先选要做哪件事
  if (s.mode === 'choose') {
    if (/^(返回|菜单|返回菜单|退出|取消|不看了)$/.test(plain)) {
      GUIDE_SUB = null;
      guideExitSilently();
      return true;
    }
    // 一键取消全部
    if (/(所有|全部|都).{0,6}(取消|退订|不要)|(取消|退订|不要).{0,6}(所有|全部)/.test(t)) {
      guideSubCancelAllStart();
      return true;
    }
    // 自动续费类（「某度网盘不续费了」「关闭某讯的自动续费」）
    if (/(自动续费|续费|续订|开启|关闭|关掉|管理)/.test(t)) {
      // 「关闭某讯 VIP 的自动续费」这类直接说完整的，直接进自动续费流程
      var svcQuick = guideSubFindService(t);
      if (svcQuick) { guideStartSubAutoRenew(); return guideSubManageStep(t); }
      guideSubChoose('renew');
      return true;
    }
    // 取消订阅：先判取消（「退订某度网盘 / 某易云不要了 / 我不想订阅某易云了」）
    var cancelWord = /(取消|退订|退掉|退了|终止|不想|不要了|不要|不再|不用|别订|停掉|停止|不订了)/;
    var svcHint = /(订阅|会员|VIP|vip|网盘|音乐|视频|阅读|健身|某)/;
    if (cancelWord.test(t) && (svcHint.test(t) || /取消订阅|退订/.test(t))) {
      // 点名了具体服务（「我不想订阅某易云了」）→ 直接进取消流程并带入服务
      var svcCancel = (typeof guideSubFindService === 'function') ? guideSubFindService(t) : null;
      if (svcCancel) {
        guideStartSubCancel();
        return guideSubCancelStep(t);
      }
      guideSubChoose('cancel');
      return true;
    }
    // 添加订阅（泛化说法）：「我想要添加订阅 / 订个会员」
    if (/(添加|新增|开通|订一个|买一个|订个)/.test(t)) {
      guideSubChoose('add');
      return true;
    }
    // 添加订阅（点名服务）：「订阅某易云年卡 / 开通某讯会员」
    if (/(订阅|开通|订|买)/.test(t) && /(某|VIP|vip|会员|年卡|月卡|季卡|网盘|音乐|视频|阅读|健身)/.test(t)) {
      guideStartSubAdd();
      return guideSubAddStep(t);
    }
    // 停在「请选择」不算进行中流程，这里只提示怎么选，不输出流程锁文案
    appendMessage(guideMessage(
      '<p>请选择订阅管理里的操作：</p>' +
      '<p class="guide-tip">添加订阅 / 取消订阅 / 管理自动续费。</p>'
    ));
    scrollToBottom();
    return true;
  }

  // 一键取消全部：确认卡阶段
  if (s.mode === 'cancel-all' && s.stage === 'confirm') {
    if (/^(取消|不|算了|返回|不要|放弃)$/.test(plain)) { guideSubCancelAllOp(); return true; }
    if (/^(确认|确定|全部取消|确认取消|都取消|是|好|好的|行|可以)$/.test(plain)) { guideSubCancelAllSubmit(); return true; }
    return true;
  }

  // 确认卡阶段：「返回 / 取消」表示放弃本次操作，不算回菜单
  if (s.stage === 'confirm') {
    if (/^(取消|不|算了|返回|不要|放弃)$/.test(plain)) { guideSubCancelOp(); return true; }
    if (/^(确认|确定|确认添加|确认修改|确认取消|是|好|好的|行|可以)$/.test(plain)) {
      if (s.mode === 'add') return guideSubAddSubmit();
      if (s.mode === 'manage') { guideSubManageSubmit(); return true; }
      guideSubCancelSubmit();
      return true;
    }
  }

  if (/^(返回|菜单|返回菜单|退出)$/.test(plain)) {
    GUIDE_SUB = null;
    guideExitSilently();
    return true;
  }

  // 添加订阅：问「是否开启自动续费」
  if (s.mode === 'add' && s.stage === 'autoRenew') {
    var yn = guideSubYesNo(t);
    if (yn === null) yn = await guideSubAIFlag(t);
    if (GUIDE_SUB !== s) return true;
    if (yn !== null) { guideSubAddRenewChoice(yn); return true; }
    appendMessage(guideMessage('<p>是否开启自动续费？请回复「是」或「否」。</p>'));
    scrollToBottom();
    return true;
  }

  if (s.mode === 'add') return guideSubAddStep(t);
  if (s.mode === 'manage') return guideSubManageStep(t);
  return guideSubCancelStep(t);
}
