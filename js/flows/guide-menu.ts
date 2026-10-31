// ==========================================================================
//  引导层（TypeScript 源码，noCheck 转译）
//  编译产物：js/flows/guide-menu.js
//  说明：该层是「经典脚本 + 全局状态」结构，状态对象（GUIDE_*）随流程变化，
//        因此采用 noCheck 转译；对外入口在 types/global.d.ts 声明。
// ==========================================================================

// 引导层：主菜单 / 模块入口 / 意图分派（由 guide.js 拆分而来）

// ==========================================================================
//  识别顺序（务必保持）：
//    ① 意图层：模型优先 —— guide-ai.js 的 guideAIRouteIntent 先判模块，
//       模型不可用 / 判不出时，才回落到 guide-rules.js 的本地关键词与正则。
//    ② 槽位层：正则先抽能确定的（纯数字、尾号、姓名）→ 抽不全（中文数字、
//       口语长句、多槽位混说）时再交给模型抽取，避免每句话都等模型返回。
//    ③ 兜底：规则全失配 → 模型 → 仍判不出 → 统一「抱歉…」。
//  约定：guide-rules.js 不调模型；guide-ai.js 只负责调用模型；本文件只管流程与渲染。
//  交互约定：
//   1. 对话起始由 AI 主动列出五类服务，并给出可点击按钮；
//   2. 点击按钮或输入服务名 → 进入该服务的二级菜单（例如「转账」→ 姓名/手机号/定时/AA）；
//   3. 选定子项后进入对应流程，并把模块记在 currentModule 上：
//      后续输入优先按当前模块解析（如已进入转账，直接说「定时转账」即进入定时表单）；
//   4. 说「返回 / 菜单」回到一级菜单；「新对话」会重置模块上下文。
// ==========================================================================

// 点按钮后统一显示：保留问题，并在下方记录所选（例如「是否添加备注：否」）
(function bindChipRecorder() {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  if (typeof window !== 'undefined' && window.__guideChipRecorderBound) return;
  if (typeof window !== 'undefined') window.__guideChipRecorderBound = true;
  document.addEventListener('click', function (ev: any) {
    var btn = ev.target && ev.target.closest ? ev.target.closest('.guide-chip') : null;
    if (!btn) return;
    setTimeout(function () {
      try {
        var bubble = (btn as any)?.closest?.('.msg-bubble');
        if (!bubble) return;
        var chips = (btn as any)?.closest?.('.guide-chips');
        if (!chips || !chips.parentNode) return;        // 已被处理函数收起（说明已记录）
        var text = bubble.textContent || '';
        if (text.indexOf('？') === -1) return;          // 只在问句上记录
        var label = ((btn as any).textContent || '').trim();
        if (!label || label.length > 8) return;         // 只记录简短选项（是/否/确认/取消…）
        var ps = bubble.querySelectorAll('p');
        var question = '';
        for (var i = 0; i < ps.length; i++) {
          var t = (ps[i].textContent || '').trim();
          if (t && t.indexOf('？') !== -1) { question = t.replace(/[？?]$/, ''); break; }
        }
        if (!question) return;
        chips.parentNode.removeChild(chips);
        var note = document.createElement('p');
        note.className = 'guide-tip';
        note.textContent = question + '：' + label;
        bubble.appendChild(note);
      } catch (e) { /* 记录失败不影响交互 */ }
    }, 0);
  }, true);
})();

function guideChip(label: any, onclick: any) {
  return '<button class="guide-chip" onclick="' + onclick + '">' + label + '</button>';
}

function guideMessage(inner: any) {
  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">AI Bank 助手</div>' +
    '<div class="msg-bubble agent-bubble">' + inner + '</div></div></div>';
}

function guideChipsDone(boxId: any, note: any) {
  var box = boxId ? document.getElementById(boxId) : null;
  if (!box) return;
  var chips = box.querySelector('.guide-chips');
  if (chips) chips.remove();
  if (note) {
    var tip = document.createElement('div');
    tip.className = 'guide-tip';
    tip.textContent = note;
    box.appendChild(tip);
  }
}
function guideTryActionableCommand(text: any) {
  var t = String(text || '').trim();
  if (!t) return null;

  // 「给张三转1000元」里的「转」也算转账意图（无需完整的「转账」两字）
  var transferLike = /(转账|转帐|汇款|打钱|转钱|付款|转给|付给|打给)/.test(t) ||
    (/(给|向|帮|替)/.test(t) && /(转|打|汇|付)/.test(t) && /\d/.test(t));
  if (transferLike) {
    var hasPhone = /1\d{10}/.test(t);
    var kind = guideLooksTimedTransfer(t) ? 'timed' : ((/手机号|电话/.test(t) || hasPhone) ? 'phone' : 'name');
    var parsed = guideTransferParse(t, kind);
    if ((parsed as any).amount > 0 || (parsed as any).phone) {
      /** @type {any} */
      GUIDE_TRANSFER = {
        kind: kind, payee: null, phone: null, amount: null, remark: '', stage: 'slots'
      };
      if (kind === 'timed') {
        (/** @type {any} */ (GUIDE_TRANSFER)).date = null;
        (/** @type {any} */ (GUIDE_TRANSFER)).time = null;
        (/** @type {any} */ (GUIDE_TRANSFER)).repeat = '不重复';
      }
      currentModule = 'transfer';
      return guideTransferStep(t);
    }
    // 「给王五转账」这类只说了收款人、没说金额的，也要直接进姓名转账并追问金额，
    // 不能退回二级菜单让用户再选一次。
    if (kind === 'name') {
      var hitName = '';
      var names = (typeof guideContactNames === 'function') ? guideContactNames() : '';
      names.split('、').forEach(function (n: any) {
        if (n && t.indexOf(n) !== -1 && n.length > hitName.length) hitName = n;
      });
      if (hitName) {
        GUIDE_TRANSFER = { kind: 'name', payee: null, phone: null, amount: null, remark: '', stage: 'slots' };
        currentModule = 'transfer';
        return guideTransferStep(t);
      }
    }
  }

  if (/(理财|基金|产品|申购|买入|购买|买)/.test(t) &&
      !/(鲜花|花束|玫瑰|康乃馨|向日葵|百合|郁金香|蛋糕|订阅|会员)/.test(t)) {
    var product = (typeof guideWealthFindProduct === 'function') ? guideWealthFindProduct(t) : null;
    // 产品名里常带 90天/3年，先剔除再抽金额
    var amountText = product ? String(t).replace(product.name, ' ') : t;
    var wAmount = guideParseSimpleAmount(amountText);
    if (wAmount > 0) {
      if (!guideWealthValidProfile()) {
        // 仍先走风险测评，但把产品和金额暂存，测评后可继续
        GUIDE_WEALTH = { stage: 'risk', product: product, amount: wAmount };
        guideStartWealthPurchase();
        if (GUIDE_WEALTH && GUIDE_WEALTH.stage === 'risk') {
          GUIDE_WEALTH.product = product;
          GUIDE_WEALTH.amount = wAmount;
        }
        return true;
      }
      // 没说出具体产品时也保留金额，下一步只追问产品，用户不用重说金额
      GUIDE_WEALTH = { stage: 'slots', product: product, amount: wAmount };
      currentModule = 'wealth';
      return guideLockedRun(function () { return guideWealthStep(t); });
    }
  }

  return null;
}

function renderServiceWelcome() {
  var chips = GUIDE_HOME_ENTRIES.map(function (e: any) {
    return guideChip(e.label, e.action);
  }).join('');
  var overviewChip = GUIDE_SHOW_OVERVIEW
    ? '<button class="guide-chip guide-chip-ghost" onclick="guideOpenOverview()">账户概览</button>'
    : '';

  appendMessage(guideMessage(
    '<p class="welcome-title"><b>你好，我是 AI Bank 助手</b>，选择服务：</p>' +
    '<div class="guide-chips welcome-chips">' + chips + overviewChip + '</div>' +
    '<p class="welcome-hint">点击按钮，或者直接输入功能名称</p>'
  ));
  // 主菜单提醒卡：异常交易 + 生日提醒 + 情人节，合并成一张
  try {
    var reminders = guideHomeRemindersHtml();
    if (reminders) appendMessage(guideMessage(reminders));
  } catch (e) { /* 忽略提醒数据异常 */ }
  scrollToBottom();
}

// 起始页的「账户概览」入口：按需打开原来的财务驾驶舱，不占起始版面
function guideOpenOverview() {
  if (typeof renderAgentBriefing === 'function') renderAgentBriefing();
}

// 二级菜单：某一类服务的子功能

// ------------------------------ 主菜单：模块判定 ------------------------------
// 设计（硬规则）：主菜单只判断「属于哪个一级模块」，然后打开该模块的二级菜单；
//   不在主菜单抽槽位、不直通业务流。只有进入模块（currentModule ≠ chat）后才抽槽位。
//   例外：只读查询（查余额 / 查额度 / 交易记录）交回主链路，直接出结果。
// 开关：window.__GUIDE_MAIN_NO_SLOTS__ = false 可关闭该限制（恢复旧行为）。

// 主菜单的一句话属于哪个一级模块（纯规则，不调模型）
// 注意：这里是「宽进」——只要看得出属于哪个一级模块就返回，绝不在这里抽槽位。
function guideMainModuleGuess(text: any) {
  var t = String(text || '');
  if (!t) return '';
  // 一级模块与首页入口保持一致：订阅管理、生日鲜花各自独立（不再有「生活订购」这一层）
  if (/(鲜花|花束|花|蛋糕|生日礼物|生日|送花|订花)/.test(t)) return 'flower';
  if (/(订阅|会员|续费|自动续费|退订|网盘|VIP|vip|年卡|月卡|季卡)/.test(t)) return 'sub';
  if (/(理财|基金|申购|赎回|持仓|持有|风险测评|风险评估|投资|收益|产品)/.test(t)) return 'wealth';
  if (/(账单|流水|收支|消费统计|异常交易|消费记录|交易记录)/.test(t)) return 'bill';
  // 卡片模块：单个「卡」字也算（办卡 / 我的卡 / 卡丢了）
  if (/(卡|挂失|解挂|额度|限额|提额|调额|冻结|解冻)/.test(t)) return 'card';
  // 转账：书面 + 口语（转/打/汇/付 + 给某人）
  if (/(转账|转帐|汇款|汇钱|汇点钱|打钱|打款|转钱|付款|付给|转给|AA|aa|汇|打给|寄钱)/.test(t)) return 'transfer';
  if (/(给|向|帮|替)[^。！？]{0,12}(转|汇|打|付|还)/.test(t)) return 'transfer';
  if (/(打|汇|转|付)[^。！？]{0,10}(钱|款|给|元|块)/.test(t)) return 'transfer';
  return '';
}

// 这句话是否已经把该模块的必需槽位说全（确定性判断，不做抽取）

// 句子是否已经点名了某个二级功能（「定时转账」「卡片限额」「AA收款」…）
function guideExplicitSubCommand(text: any) {
  var t = String(text || '');
  if (/(姓名转账|手机号转账|定时转账|AA收款|aa收款|我的卡片|额度调整|调额|提额|交易限制|限额|每日|单笔|卡片挂失|挂失|解挂|卡片申请|申请信用卡)/.test(t)) return true;
  if (/(申请|办|新办|开通).{0,4}卡/.test(t)) return true;        // 「我要申请一张信用卡」
  if (/额度/.test(t) && /(调|提|改|升|降)/.test(t)) return true;   // 「我要调我的信用卡额度」
  if (/(产品申购|申购|赎回|持仓|风险评估|风险测评)/.test(t)) return true;
  if (/(订阅|续费|会员|鲜花|花束|蛋糕)/.test(t)) return true;
  return false;
}

// 句子是否带了任何「业务实体」（金额、手机号、联系人、产品、卡片、时间）
function guideHasBusinessEntity(text: any) {
  var t = String(text || '');
  if (/1\d{10}/.test(t)) return true;
  if (/\d/.test(t)) return true;                                  // 任意数字（金额/尾号/数量）
  if (/(今天|明天|后天|下周|周[一二三四五六日天]|星期[一二三四五六日天]|上午|下午|晚上|早上|中午|\d+点)/.test(t)) return true;
  if (typeof guideContactNames === 'function') {
    var hit = guideContactNames().split('、').some(function (n: any) { return n && t.indexOf(n) !== -1; });
    if (hit) return true;
  }
  if (typeof guideWealthFindProduct === 'function' && guideWealthFindProduct(t)) return true;
  if (/(某视频平台VIP|某阅读APP会员|某云盘超级会员|某健身|某视频|某阅读|某音乐)/.test(t)) return true;
  if (/(白金|金卡|标准金卡|青年卡|旅行卡)/.test(t)) return true;
  return false;
}

function guideSlotsComplete(module: any, text: any) {
  var t = String(text || '');
  var hasAmount = /(\d+(?:\.\d+)?)\s*(元|块|万|w|W|千|k|K)?/.test(t) && !/^\s*$/.test(t);
  var hasPhone = /1\d{10}/.test(t);
  var hasName = (typeof guideContactNames === 'function') &&
    guideContactNames().split('、').some(function (n: any) { return n && t.indexOf(n) !== -1; });
  var hasTime = (typeof guideLooksTimedTransfer === 'function') && guideLooksTimedTransfer(t);
  var hasCard = /(\d{4})/.test(t.replace(/\D/g, '').length >= 4 ? t : '') || /(白金|金卡|标准金卡|青年卡|旅行卡)/.test(t);
  var hasProduct = (typeof guideWealthFindProduct === 'function') && !!guideWealthFindProduct(t);

  if (module === 'transfer') {
    if (/(AA|aa|分摊|平摊)/.test(t)) return hasAmount && hasName;
    if (hasTime) return hasAmount && (hasName || hasPhone);
    return hasAmount && (hasName || hasPhone);
  }
  if (module === 'wealth') return hasAmount && hasProduct;
  if (module === 'card') {
    if (/(限额|每日|单笔)/.test(t)) return hasCard && /\d{3,}/.test(t);
    if (/(额度|提额|调额)/.test(t)) return hasCard && /\d{3,}/.test(t);
    if (/(挂失)/.test(t)) return hasCard;
    if (/(申请|办|新办)/.test(t)) return /(白金|金卡|青年卡|旅行卡)/.test(t) && /\d{3,}/.test(t);
    return false;
  }
  if (module === 'life') {
    if (/(鲜花|花束|蛋糕|花)/.test(t)) return hasName;
    return /(某视频平台VIP|某阅读APP会员|某云盘超级会员|某健身|某视频|某阅读|某音乐|会员|VIP|年卡|月卡|季卡)/.test(t);
  }
  // 账单分析类都是只读，直接放行
  return true;
}

// 打开某个一级模块的二级菜单（不抽槽位、不建业务会话）

// 业务完成后的衔接：总结一句 → 提示还能继续 → 回到当前模块二级菜单（不弹首页卡）
function guideModuleWrapUp(module: any, summary: any) {
  try {
    var mod = module || (currentModule !== 'chat' ? currentModule : '');
    if (!mod) return;
    guideResetAllSessions();
    currentModule = mod;
    GUIDE_WRAPUP = { module: mod };
    if (summary) appendMessage(guideMessage('<p>' + summary + '</p>'));
    appendMessage(guideMessage(
      '<p>还需要办理其他' + guideModuleLabel(mod) + '业务吗？</p>' +
      '<p class="guide-tip">如无需办理，请回复「退出」。</p>'
    ));
  } catch (e) { /* 衔接失败不影响已完成的操作 */ }
}

function guideOpenModuleMenu(key: any) {
  if (key === 'sub') { guideStartSubManage(); return; }
  if (key === 'flower') { guideStartBirthdayFlower(); return; }
  guideOpenService(key);
}

// 是否是「切换到 XX」这类命令，返回目标模块 key
function guideSwitchModuleTarget(text: any) {
  var t = String(text || '').trim();
  if (!/^(切换|切换到|切换至|切到|转到|换到|去|改到)/.test(t)) return '';
  return guideMainModuleGuess(t) || '';
}

function guideOpenService(key: any) {
  if (typeof guideActiveFlowLabel === 'function' && guideActiveFlowLabel()) {
    guideFlowLockedNotice();
    return;
  }
  var s = guideServiceByKey(key);
  if (!s) return;
  guideResetAllSessions();
  currentModule = s.key;
  // 二级菜单不再提供按钮：列出「功能名：示例说法」，用户直接说话进入
  var rows = s.subs.map(function (sub: any) {
    return '<div class="guide-row"><div class="guide-row-title">' + sub.label + '</div>' +
      (sub.example ? '<div class="guide-row-example">例如：' + sub.example + '</div>' : '') + '</div>';
  }).join('');

  appendMessage(guideMessage(
    '<p>' + s.prompt.replace(/[，,]?\s*请选择[:：]?$/, '') + '</p>' +
    '<div class="guide-rows">' + rows + '</div>' +
    '<p class="guide-tip">直接说出你的需求即可（照示例说也行）。</p>'
  ));
  scrollToBottom();
}

// 进入某个子功能：执行对应流程，并保持模块上下文
function guidePickSub(serviceKey: any, subKey: any) {
  if (typeof guideActiveFlowLabel === 'function' && guideActiveFlowLabel()) {
    guideFlowLockedNotice();
    return;
  }
  var s = guideServiceByKey(serviceKey);
  if (!s) return;
  var sub = s.subs.filter(function (x: any) { return x.key === subKey; })[0];
  if (!sub) return;
  guideResetAllSessions();
  currentModule = s.key;
  try {
    sub.run();
  } catch (e) {
    console.warn('子功能执行失败:', subKey, e);
  }
}

function guideBackToMenu() {
  guideAbortPendingPlans();
  guideResetAllSessions();
  currentModule = 'chat';
  renderServiceWelcome();
}

// 静默退出：清理本轮会话但不展示首页卡片（用户说「退出」时用）
function guideExitSilently() {
  guideAbortPendingPlans();
  var exitMod = currentModule;
  guideResetAllSessions();
  currentModule = 'chat';
  // 在某个模块流程里退出：先问「还需要办理其他 XX 业务吗？」（与办完的衔接一致）
  if (exitMod && exitMod !== 'chat' && typeof guideModuleWrapUp === 'function') {
    guideModuleWrapUp(exitMod);
    return;
  }
  appendMessage(guideMessage('<p>已退出当前流程。</p>'));
  scrollToBottom();
}

// 流程锁提示：当前流程没走完，不允许跳去别的功能 / 重新开一单
function guideFlowLockedNotice(extra: any) {
  var label = guideActiveFlowLabel() || '业务';
  appendMessage(guideMessage(
    '<p>正在' + label + '流程，请先完成本轮操作。</p>' +
    (extra ? '<p class="guide-tip">' + extra + '</p>' : '') +
    '<p class="guide-tip">如需退出，请回复「退出」。</p>'
  ));
  scrollToBottom();
}
function guideAwaitingFinalAction() {
  if (typeof AGENT_PENDING_PLANS === 'object' && AGENT_PENDING_PLANS) {
    for (var k in AGENT_PENDING_PLANS) {
      if (AGENT_PENDING_PLANS[k] && AGENT_PENDING_PLANS[k].status === 'pending') return true;
    }
  }
  if (typeof window !== 'undefined' && window.__pendingScheduledTransfers) {
    for (var c in window.__pendingScheduledTransfers) {
      if (window.__pendingScheduledTransfers[c]) return true;
    }
  }
  var list = [GUIDE_AA, GUIDE_CARD_LIMIT, GUIDE_TXN_LIMIT, GUIDE_CARD_LOST, GUIDE_CARD_APPLY, GUIDE_SUB, GUIDE_FLOWER, GUIDE_WEALTH];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    if (s && (s.stage === 'confirm' || s.stage === 'cancel-confirm')) return true;
  }
  return false;
}

function guideCancelPendingScheduled() {
  if (typeof window === 'undefined' || !window.__pendingScheduledTransfers) return false;
  var ids = Object.keys(window.__pendingScheduledTransfers);
  if (!ids.length) return false;
  ids.forEach(function (id: any) {
    delete window.__pendingScheduledTransfers[id];
    var card = document.getElementById(id);
    if (card) card.innerHTML = '<div class="bank-cancelled">已取消，未创建定时转账任务。</div>';
  });
  appendMessage(guideMessage('<p>已取消本次定时转账，未创建任务。</p>'));
  scrollToBottom();
  return true;

  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('transfer'); }, 400);
}
// 认不出的输入专用输出：跳过「同一句不重复」去重，保证每次都能看到反馈
function guideSayInvalid(html: any) {
  if (typeof window !== 'undefined') window.__DEDUPE_BREAK__ = true;
  appendMessage(html);
  scrollToBottom();
}

function guideAsk(html: any) {
  // 去重统一交给 appendMessage（按「用户轮次」判断），这里只负责输出 + 滚动
  appendMessage(html);
  scrollToBottom();
}

// 文本解析：服务名 / 子功能名 / 返回菜单，命中则接管，返回 true
async function guideHandleText(text: any) {
  if (typeof window !== 'undefined') window.__GUIDE_LAST_TEXT = String(text || '');

  // 主菜单守卫（硬规则）：主菜单只识别「属于哪个一级模块」，然后打开该模块的二级菜单。
  // 一律不直通、不抽槽位；只有进入模块（currentModule 不是 chat）之后才做槽位抽取。
  // 例外：只读查询（查余额/查额度/交易记录）交回主链路，不算业务办理。
  try {
    var atMainMenu = !currentModule || currentModule === 'chat';
    var atMain = (typeof guideActiveFlowLabel === 'function') && !guideActiveFlowLabel() &&
      (typeof guideAwaitingFinalAction !== 'function' || !guideAwaitingFinalAction());
    var noSlotsAllowed = !(typeof window !== 'undefined' && window.__GUIDE_MAIN_NO_SLOTS__ === false);
    if (atMain && atMainMenu && noSlotsAllowed) {
      var guessMod = guideMainModuleGuess(text);
      var isReadOnly = (typeof guideIsReadOnlyQuery === 'function') && guideIsReadOnlyQuery(text);
      if (guessMod && !isReadOnly) {
        // 首页已把「生活订购」拆成两个独立入口：订阅管理 / 生日鲜花
        if (guessMod === 'sub') { guideStartSubManage(); return true; }
        if (guessMod === 'flower') { guideStartBirthdayFlower(); return true; }
        guideOpenService(guessMod);
        return true;
      }
    }
  } catch (e) { /* 守卫失败不影响正常流程 */ }

  // 模块作用域守卫（方案A）：已在某个一级模块内时，只处理本模块业务
  try {
    var menuCtx = !guideActiveFlowLabel() &&
      !(GUIDE_TRANSFER || GUIDE_AA || GUIDE_WEALTH || GUIDE_HOLDING || GUIDE_CARD_APPLY ||
        GUIDE_CARD_LIMIT || GUIDE_TXN_LIMIT || GUIDE_CARD_LOST ||
        (GUIDE_SUB && /^(add|cancel|manage|cancel-all)$/.test(String(GUIDE_SUB.mode || ''))) ||
        (GUIDE_FLOWER && /^(order|modify|cancel)$/.test(String(GUIDE_FLOWER.mode || ''))));
    var curMod = currentModule || 'chat';
    var qScope = String(text || '').trim();
    if (menuCtx && curMod !== 'chat' && qScope) {
      // ① 「切换到 XX」：只开对方模块菜单
      var swTarget = guideSwitchModuleTarget(qScope);
      if (swTarget) {
        if (swTarget === curMod) {
          guideOpenModuleMenu(curMod);
        } else {
          guideOpenModuleMenu(swTarget);
        }
        return true;
      }
      // ② 只读查询 / 帮助：放行
      var readonlyScope = (typeof guideIsReadOnlyQuery === 'function') && guideIsReadOnlyQuery(qScope);
      if (!readonlyScope) {
        var targetMod = guideMainModuleGuess(qScope);
        if (targetMod && targetMod !== curMod) {
          appendMessage(guideMessage(
            '<p>当前在<b>' + guideModuleLabel(curMod) + '</b>，不能直接办理' + guideModuleLabel(targetMod) + '业务。</p>' +
            '<p class="guide-tip">回复「退出」回到主菜单，或说「切换到' + guideModuleLabel(targetMod) + '」。</p>'
          ));
          scrollToBottom();
          return true;
        }
      }
    }
  } catch (e) { /* 作用域守卫失败不影响正常流程 */ }

  // 模块内清单查询：只在「理财 / 订阅管理」两个模块内生效
  try {
    var qt = String(text || '').trim();
    var wealthBusy = !!GUIDE_WEALTH;
    var subBusy = !!(GUIDE_SUB && /^(add|cancel|manage|cancel-all)$/.test(String(GUIDE_SUB.mode || '')));
    var inWealth = (currentModule === 'wealth');
    var inSub = (currentModule === 'sub' && GUIDE_SUB && String(GUIDE_SUB.mode || '') === 'choose');

    if ((wealthBusy || inWealth) && typeof guideIsWealthCatalogQuery === 'function' && guideIsWealthCatalogQuery(qt)) {
      if (wealthBusy) { guideFlowLockedNotice(); return true; }     // 流程中先完成
      guideWealthShowAllProducts();
      return true;
    }
    if ((subBusy || inSub) && typeof guideIsSubCatalogQuery === 'function' && guideIsSubCatalogQuery(qt)) {
      if (subBusy) { guideFlowLockedNotice(); return true; }
      guideSubShowCatalog();
      return true;
    }

    // 理财清单之后直接说「1001 5000」：已在模块内，立刻进入申购
    // 注意：任何进行中的会话（持仓/转账/订阅…）都要先走会话分派，
    // 否则「赎回稳健增利90天」里的“90”会被当成金额、被误判成申购。
    var anyFlowBusy = (typeof guideActiveFlowLabel === 'function') && !!guideActiveFlowLabel();
    if (inWealth && !wealthBusy && !anyFlowBusy && /\d/.test(qt) &&
        typeof guideWealthFindProduct === 'function' && guideWealthFindProduct(qt) &&
        !/(赎回|卖出|取出|取回|提现|清仓|卖)/.test(qt)) {
      guideStartWealthPurchase();
      return await guideWealthStep(qt);
    }
  } catch (e) { /* 清单查询失败不影响正常流程 */ }
  var t = String(text || '').trim().replace(/[。.!！?？,，\s]+$/g, '');
  if (!t) return false;

  // 任意进行中的流程：回复「退出」直接结束本轮
  if (/^(退出|退出流程|不办了|不做了)$/.test(t.replace(/[。.!！?？\s]/g, '')) && guideActiveFlowLabel()) {
    guideExitSilently();
    return true;
  }

  // GUIDE_WRAPUP_HANDLED：业务完成后的「还需要办理其他业务吗？」待答状态
  if (GUIDE_WRAPUP) {
    var plainWrap = t.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');   // 只保留中英文与数字，剔除各种标点
    // ① 明确不需要 → 回到主菜单卡片
    if (/^(退出|不需要|不用了|不用|不了|不用啦|算了|取消|没了|不要|否)$/.test(plainWrap)) {
      GUIDE_WRAPUP = null;
      guideAbortPendingPlans();
      guideResetAllSessions();
      currentModule = 'chat';
      renderServiceWelcome();
      scrollToBottom();
      return true;
    }
    // ② 明确需要 → 打开本模块二级菜单
    if (/^(需要|要|是|好|好的|可以|行|继续|继续办|再办一笔|再来一笔|嗯|对|ok|OK|办理|办)$/.test(plainWrap)) {
      var wrapMod = GUIDE_WRAPUP.module;
      GUIDE_WRAPUP = null;
      guideOpenModuleMenu(wrapMod);
      return true;
    }
    // ③ 其它输入：保留待答状态，按正常逻辑处理；
    //    真正的业务开始时会由 guideResetAllSessions() 清掉它
  }

  // 停在确认卡上：没点按钮又说了别的话，只提醒一句「请完成上述操作。」
  if (guideAwaitingFinalAction() && !guideIsFinalActionText(t)) {
    appendMessage(guideMessage('<p>请完成上述操作。</p>'));
    scrollToBottom();
    return true;
  }
  // 打字说「取消」也能取消定时转账确认卡
  if (typeof window !== 'undefined' && window.__pendingScheduledTransfers &&
      /^(取消|退出|算了|不创建了|放弃)$/.test(t.replace(/[。.!！?？\s]/g, ''))) {
    if (guideCancelPendingScheduled()) return true;
  }

  // ── 入口顺序（改动前先读这里）─────────────────────────────────────────
  //   ① 退出指令（任意流程中说「退出」→ 直接结束本轮，不弹首页卡）
  //   ② 确认卡守卫（停在确认卡上 → 只回「请完成上述操作。」，不调模型）
  //   ③ 意图层·模型优先：没有进行中的流程时，先让模型判断属于哪个模块；
  //      模型不可用 / 返回 none → 继续往下走本地规则（guide-rules.js）
  //   ④ 流程锁（有进行中的流程时，不允许跳到别的模块）
  //   ⑤ 进行中的流程：把这句话交给该模块的槽位采集函数
  //   ⑥ 本地规则：模块内子功能 → 一级服务名 → 模糊说法
  //   ⑦ 规则失配且像「想看某功能」→ 再交给模型识别（guideAIIntent）
  //   ⑧ 全失配 → 返回 false，由 chat.js 输出统一兜底话术
  // ─────────────────────────────────────────────────────────────────────
  // ①-预 鲜花下单（本地确定性规则）：在生日鲜花模块里，「订一束向日葵 / 给林小雨送花」
  // 这类说法直接进下单，避免被模型误判成别的业务而落到模块菜单兜底。
  if (currentModule === 'flower' && !GUIDE_FLOWER) {
    var flowerBuy = /(订|买|送|来|要|下单)/.test(t) &&
      /(鲜花|花束|花|蛋糕|玫瑰|百合|康乃馨|向日葵|郁金香|桔梗|满天星)/.test(t) &&
      !/(订单|取消|查|看|记录|多少钱|几位|生日提醒)/.test(t);
    if (flowerBuy) {
      var hitName = '';
      (typeof guideContactNames === 'function' ? guideContactNames().split('、') : []).forEach(function (nm: any) {
        if (nm && t.indexOf(nm) !== -1 && nm.length > hitName.length) hitName = nm;
      });
      if (hitName && typeof guideStartFlowerForContact === 'function') guideStartFlowerForContact(hitName);
      else if (typeof guideStartFlowerOrder === 'function') guideStartFlowerOrder();
      return true;
    }
  }

  // ① AI 优先（意图层）：没有进行中的会话时，先让模型判断模块；判不出再走规则
  //    注意：鲜花「只看订单」这类只读会话虽然不算流程锁，但也不应再走模块意图路由，
  //    否则「给我订一束玫瑰」会被模型判成订阅之类的业务。
  var hasSessionContext = guideActiveFlowLabel() ||
    !!(GUIDE_TRANSFER || GUIDE_AA || GUIDE_WEALTH || GUIDE_HOLDING || GUIDE_SUB ||
       GUIDE_CARD_APPLY || GUIDE_CARD_LIMIT || GUIDE_TXN_LIMIT || GUIDE_CARD_LOST || GUIDE_FLOWER);
  if (!hasSessionContext && guideAIFirstEnabled() && !guideAIFirstSkipped(t)) {
    try {
      if (await guideAIRouteIntent(t)) return true;
    } catch (e) { /* 模型失败 → 规则兜底 */ }
  }

  // 流程锁预检：未完成流程里说到别的服务名，先挡下来
  if (guideActiveFlowLabel()) {
    var otherSvc = guideResolveService(t);
    if (otherSvc) {
      guideFlowLockedNotice();
      return true;
    }
  }

  // 卡片类流程（交易限制 / 额度调整 / 挂失 / 申请）进行中，
  // 用户改说理财产品（编号 10xx / 产品名 / 申购、赎回等）时，先提示完成当前流程，
  // 否则「编号1001 -1000元」会被限额流程吞掉，只回一句「限额需要大于 0」。
  if ((GUIDE_TXN_LIMIT || GUIDE_CARD_LIMIT || GUIDE_CARD_LOST || GUIDE_CARD_APPLY)) {
    var saysWealthEarly = /(申购|买入|理财产品|赎回|持仓|基金|10\d{2})/.test(t) ||
      (typeof guideWealthFindProduct === 'function' && !!guideWealthFindProduct(t));
    if (saysWealthEarly) {
      guideFlowLockedNotice();
      return true;
    }
  }

  // 姓名转账多轮收集进行中：这一步的输入一律按「收款人 / 金额」解析
  if (GUIDE_TRANSFER) return guideLockedRun(function () { return guideTransferStep(t); });

  // AA 收款多轮收集进行中
  if (GUIDE_AA) {
    if (/^(取消|不做了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_AA = null;
      guideExitSilently();
      return true;
    }
    if (guideResolveService(t)) { guideFlowLockedNotice(); return true; }
    if (guideServiceByKey('transfer') && (guideServiceByKey('transfer') as any).subs.some(function (x: any) { return x.label === t || (x.aliases || []).indexOf(t) !== -1; })) { guideFlowLockedNotice(); return true; }
    return guideLockedRun(function () { return guideAAStep(t); });
  }

  // 理财申购多轮收集进行中（风评 → 产品/金额 → 确认）
  if (GUIDE_WEALTH) {
    if (/^(取消|不做了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_WEALTH = null;
      guideExitSilently();
      return true;
    }
    if (guideResolveService(t)) { guideFlowLockedNotice(); return true; }
    if (guideServiceByKey('wealth') && (guideServiceByKey('wealth') as any).subs.some(function (x: any) { return x.label === t || (x.aliases || []).indexOf(t) !== -1; })) { guideFlowLockedNotice(); return true; }
    return guideLockedRun(function () { return guideWealthStep(t); });
  }

  // 申请信用卡多轮收集进行中（卡种 / 额度 / 用途 → 确认）
  if (GUIDE_CARD_APPLY) {
    if (/^(取消|不办了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_CARD_APPLY = null;
      guideExitSilently();
      return true;
    }
    if (guideResolveService(t)) { guideFlowLockedNotice(); return true; }
    if (guideServiceByKey('card') && (guideServiceByKey('card') as any).subs.some(function (x: any) { return x.label === t || (x.aliases || []).indexOf(t) !== -1; })) { guideFlowLockedNotice(); return true; }
    return guideLockedRun(function () { return guideCardApplyStep(t); });
  }

  // 信用卡额度调整申请进行中（目标额度 + 调整原因 → 确认）
  if (GUIDE_CARD_LIMIT) {
    if (/^(取消|不调了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_CARD_LIMIT = null;
      guideExitSilently();
      return true;
    }
    if (guideResolveService(t)) { guideFlowLockedNotice(); return true; }
    if (guideServiceByKey('card') && (guideServiceByKey('card') as any).subs.some(function (x: any) { return x.label === t || (x.aliases || []).indexOf(t) !== -1; })) { guideFlowLockedNotice(); return true; }
    return guideLockedRun(function () { return guideCardLimitStep(t); });
  }

  // 持仓管理：追加申购 / 赎回进行中
  if (GUIDE_HOLDING) {
    // 只有「返回 / 菜单」才退出会话；「取消」交给流程本身，回「已取消，持仓保持不变。」
    if (/^(返回|菜单|返回菜单|退出)$/.test(t)) {
      GUIDE_HOLDING = null;
      guideExitSilently();
      return true;
    }
    return guideLockedRun(function () { return guideHoldingStep(t); });
  }

  // 订阅：添加 / 管理自动续费 / 取消 进行中
  if (GUIDE_SUB) {
    return guideLockedRun(function () { return guideSubSession(t); });
  }

  // 鲜花订购 / 订单管理进行中
  if (GUIDE_FLOWER) {
    return guideLockedRun(function () { return guideFlowerSession(t); });
  }

  // 交易限制设置进行中
  if (GUIDE_TXN_LIMIT) {
    if (/^(取消|不设了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_TXN_LIMIT = null;
      guideExitSilently();
      return true;
    }
    return guideLockedRun(function () { return guideTxnLimitStep(t); });
  }

  // 卡片挂失进行中
  if (GUIDE_CARD_LOST) {
    if (/^(取消|不挂了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_CARD_LOST = null;
      guideExitSilently();
      return true;
    }
    return guideLockedRun(function () { return guideCardLostStep(t); });
  }

  // 「某云盘超级会员年卡开一下自动续费」→ 直接进管理自动续费并预选服务
  if (guideIsSubRenewManagePhrase(t)) {
    var renewOnSvc = (typeof guideSubFindService === 'function') ? guideSubFindService(t) : null;
    if (renewOnSvc) {
      GUIDE_SUB = { mode: 'manage', stage: 'slots', target: null, newAutoRenew: null };
      return guideLockedRun(function () { return guideSubManageStep(t); });
    }
    if (typeof guideStartSubAutoRenew === 'function') {
      guideStartSubAutoRenew();
      return true;  // 清单已问过，等待用户指定服务
    }
  }

  // 「某云盘超级会员年卡不续费了」→ 关闭自动续费；句中指定了服务就直接出确认卡
  if (guideIsSubRenewOffPhrase(t)) {
    var renewSvc = (typeof guideSubFindService === 'function') ? guideSubFindService(t) : null;
    if (renewSvc) {
      GUIDE_SUB = { mode: 'manage', stage: 'slots', target: null, newAutoRenew: null };
      return guideLockedRun(function () { return guideSubManageStep(t); });
    }
    if (typeof guideStartSubAutoRenew === 'function') {
      guideStartSubAutoRenew();
      return true;  // 清单已问过，等待用户指定服务
    }
  }

  // 「我不想订阅某视频平台VIP了」→ 直接进取消订阅并预选服务
  if (guideIsSubCancelPhrase(t)) {
    var cancelSvc = (typeof guideSubFindService === 'function') ? guideSubFindService(t) : null;
    if (cancelSvc) {
      GUIDE_SUB = { mode: 'cancel', stage: 'slots', target: null };
      return guideLockedRun(function () { return guideSubCancelStep(t); });
    }
    if (typeof guideStartSubCancel === 'function') {
      guideStartSubCancel();
      return true;  // 没点名服务就不用再解析一次
    }
  }

  // 「我想要添加订阅」→ 直接进添加订阅（先展示可订阅服务）；句中没服务可解析，不必再走 step
  if (guideIsSubAddPlain(t)) {
    if (typeof guideStartSubAdd === 'function') {
      var plainSvc = (typeof guideSubFindService === 'function') ? guideSubFindService(t) : null;
      guideStartSubAdd();
      if (plainSvc) return guideLockedRun(function () { return guideSubAddStep(t); });
      return true;
    }
  }

  // 「我要申请一张信用卡」→ 直接进卡片申请并解析卡种/额度/用途
  if (guideIsCardApplyPhrase(t)) {
    if (typeof guideStartCardApply === 'function') {
      guideStartCardApply();
      // 句子里没有卡种/额度/用途时，入口提问已经够了，不再追问一遍
      if (/(白金|金卡|旅行|青年|\d|消费|差旅|教育|购物)/.test(t)) {
        return guideLockedRun(function () { return guideCardApplyStep(t); });
      }
      return true;
    }
  }

  // 「我想要订阅某视频平台VIP年卡」→ 直接进添加订阅并预填服务/周期
  if (guideIsSubAddPhrase(t)) {
    var addSvc = (typeof guideSubFindService === 'function') ? guideSubFindService(t) : null;
    var addCycle = (typeof guideSubParseCycle === 'function') ? guideSubParseCycle(t) : null;
    if (addSvc && addCycle) {
      GUIDE_SUB = { mode: 'add', stage: 'slots', preset: null, cycle: null, autoRenew: null };
      return guideLockedRun(function () { return guideSubAddStep(t); });
    }
    if (typeof guideStartSubAdd === 'function') {
      guideStartSubAdd();
      return guideLockedRun(function () { return guideSubAddStep(t); });
    }
  }

  // 「我买了哪些产品 / 持仓」→ 看持仓
  if (guideIsHoldingsQuery(t)) {
    if (typeof guideStartHoldings === 'function') { guideStartHoldings(); return true; }
  }

  // 「我现在有哪些卡」直接列卡片
  if (guideIsCardListQuery(t)) {
    if (typeof showCardMyCards === 'function') { showCardMyCards(); return true; }
  }

  // 只读查询交回主链路，避免「查余额 / 查信用卡额度」被菜单或调额流程劫持
  if (guideIsReadOnlyQuery(t)) return false;

  // 有些步骤是 async（返回 Promise），同样视为已接管，不能再让 Agent 重复处理。
  var actionable = guideTryActionableCommand(t);
  if (actionable === true) return true;
  if (actionable && typeof actionable.then === 'function') return true;

  // 空闲时（没有进行中的流程、没有待确认的卡）说「取消 / 算了」：只回一句，不再弹首页卡
  if (/^(取消|算了|不用了|不|不要|放弃)$/.test(t) && !guideActiveFlowLabel() && !guideAwaitingFinalAction()) {
    guideAsk(guideMessage('<p>当前没有进行中的操作。需要办理什么业务，直接说就行。</p>'));
    return true;
  }

  // 返回一级菜单
  if (/^(返回|返回菜单|服务菜单|主菜单|菜单|首页|服务列表)$/.test(t)) {
    guideBackToMenu();
    return true;
  }

  // 「你能做什么」类问题直接给服务菜单，不消耗模型额度
  if (/^(你能做什么|你能干啥|你会什么|你有什么功能|可以做什么|有哪些功能|有什么服务)$/.test(t)) {
    renderServiceWelcome();
    return true;
  }

  // 任何位置说「查询所有产品 / 全部产品」，直接给完整在售清单
  if (typeof guideIsAllProductsIntent === 'function' && guideIsAllProductsIntent(t)) {
    guideWealthShowAllProducts();
    return true;
  }

  // 信用卡调额意图：「我要调我的信用卡额度」→ 直接进入额度调整流程（问目标额度与原因）
  if (guideIsCardLimitAdjustIntent(t)) {
    // 已经在额度调整流程里就不再重启（否则会把已输入的额度/原因清空）
    if (GUIDE_CARD_LIMIT) {
      return guideLockedRun(function () { return guideCardLimitStep(t); });
    }
    if (typeof guideStartCardLimitAdjust === 'function') { guideStartCardLimitAdjust(); return true; }
  }

  // 账单分析意图：「分析账单」「看看我的消费」→ 直接出可视化账单分析
  if (guideIsBillAnalysisIntent(t)) {
    if (typeof showBillOverview === 'function') { showBillOverview(); return true; }
  }

  // 定时转账意图：一句话里带时间 + 转账动作，直接进定时转账多轮流程
  if (guideTimedPhraseIntent(t)) {
    GUIDE_TRANSFER = { kind: 'timed', payee: null, phone: null, amount: null, date: null, time: null, repeat: '不重复', period: null, remark: '', stage: 'slots' };
    return guideLockedRun(function () { return guideTimedStep(t); });
  }

  // AA 收款意图：一句话里带 AA / 分摊 / 垫付
  if (guideAAPhraseIntent(t)) {
    GUIDE_AA = { total: 0, participants: [], stage: 'slots', pendingNames: [], pickOptions: [] };
    return guideLockedRun(function () { return guideAAStep(t); });
  }

  // 鲜花下单意图：「给林小雨订一束花 / 订束玫瑰 / 订个蛋糕」
  // （查看订单的说法在上面已单独处理，这里只匹配下单动作）
  if (/(订|买|送|来|要).{0,8}(花|鲜花|花束|蛋糕)/.test(t) && !/(订单|取消|查|看|记录)/.test(t)) {
    var flowerName = '';
    (typeof guideContactNames === 'function' ? guideContactNames().split('、') : []).forEach(function (n: any) {
      if (n && t.indexOf(n) !== -1 && n.length > flowerName.length) flowerName = n;
    });
    if (flowerName && typeof guideStartFlowerForContact === 'function') {
      guideStartFlowerForContact(flowerName);
    } else if (typeof guideStartFlowerOrder === 'function') {
      guideStartFlowerOrder();
    }
    return true;
  }

  // 去掉口语前缀，便于识别「我要转账」「帮我转账」
  var bare = t.replace(/^(我要|我想|我想用|帮我|我要用|使用)/, '');

  // ① 精确匹配：当前模块的子功能（模块内上下文，支持别名：产品 ↔ 产品申购、持仓 ↔ 持仓管理）
  var cur = guideServiceByKey(currentModule);
  if (cur) {
    var hitSub = cur.subs.filter(function (x: any) {
      var names = [x.label].concat(x.aliases || []);
      return names.indexOf(bare) !== -1;
    })[0];
    if (hitSub) {
      guidePickSub(cur.key, hitSub.key);
      return true;
    }
  }

  // ② 精确匹配一级服务名
  var svc = guideResolveService(bare);
  if (svc) {
    guideOpenService(svc.key);
    return true;
  }

  // ③ 模糊识别：「我要看消费统计」「帮我查下账单」「看看理财」这类不精确说法
  var fuzzy = guideResolveIntent(t);
  if (fuzzy) {
    if (fuzzy.kind === 'sub') {
      guidePickSub((fuzzy.service as any).key, (fuzzy.sub as any).key);
    } else {
      guideOpenService(fuzzy.service.key);
    }
    return true;
  }

  // ④ 明显是「想看某个功能」但规则没认出来 → 再交给模型识别（规则失配后的补充）
  if (guideIsMenuIntent(t)) {
    guideAIIntent(t);
    return true;
  }

  // ⑤ 停在某个一级模块的二级菜单上乱说：按本模块提示，而不是通用「抱歉」
  if (currentModule && currentModule !== 'chat' && !guideActiveFlowLabel()) {
    var menuHint = guideModuleMenuHint(currentModule);
    if (menuHint) {
      guideSayInvalid(guideMessage(menuHint));
      return true;
    }
  }

  return false;
}

// 负数或「负」开头的金额：各模块统一拦截，避免 -1000 被当成 1000
function guideEscapeText(v: any) {
  return (typeof escapeHtml === 'function') ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v);
}

function guideIsNegativeAmount(text: any) {
  return /(^|[^\d])[-−负]\s*\d/.test(String(text || ''));
}

function guidePlainMoney(n: any) {
  var v = Number(n) || 0;
  return (Math.round(v) === v) ? String(v) : v.toFixed(2);
}

// —— 定时转账的日期 / 时间 / 重复解析 ——
function guidePad2(n: any) { return (Number(n) < 10 ? '0' : '') + Number(n); }

function guideDateStr(d: any) {
  return d.getFullYear() + '-' + guidePad2(d.getMonth() + 1) + '-' + guidePad2(d.getDate());
}

function guideOffsetDate(days: any) {
  var d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return guideDateStr(d);
}

// month 为空表示「本月 D 号」，若已过则顺延到下月
function guideMonthDayDate(month: any, day: any) {
  var now = new Date();
  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var y = now.getFullYear();
  var m = month ? Number(month) : (now.getMonth() + 1);
  var d = new Date(y, m - 1, Number(day));
  if (month) {
    // 指定了月份但日期已过 → 顺延到明年，避免「1月5日」在 10 月形成追问死循环
    if (d.getTime() < todayStart) d = new Date(y + 1, m - 1, Number(day));
  } else if (d.getTime() < todayStart) {
    d = new Date(y, m, Number(day));
  }
  return guideDateStr(d);
}

function guideUnknownPayeeNotice(name: any, sourceText: any) {
  var n = (typeof escapeHtml === 'function') ? escapeHtml(name) : name;
  var src = String(sourceText || '');
  // 句子里没有转账动词、也没有金额，说明不是在下转账指令（可能只是随口一句）
  // 这时不要把它当「收款人姓名」念出来，改成通用追问，避免出现「你个傻比 → 『个啥比』不在通讯录里」
  var likeTransfer = /(转|打款|汇款|付款|付给|给|向|帮|替)/.test(src) || /\d/.test(src);
  if (src && !likeTransfer) {
    guideAsk(guideMessage('<p>没太听懂。可以直接说收款人和金额。</p>' +
      '<p class="guide-tip">例如：张三 100 / 张三转 100 / 给李雷转 1.5 万</p>'));
    return;
  }
  guideAsk(guideMessage(
    '<p>「<b>' + n + '</b>」不在通讯录里。姓名转账只支持通讯录联系人：' + guideContactNames() + '。</p>' +
    '<p class="guide-tip">可以改用手机号转账，或先在「联系人」中新增后再试。</p>'
  ));
}

function guideConfirmCardDone(boxId: any, statusText: any) {
  var box = boxId ? document.getElementById(boxId) : null;
  if (!box) return false;
  var chips = box.querySelector('.guide-chips');
  if (chips) chips.remove();
  var card = box.querySelector('.data-card');
  if (card && statusText) {
    var row = document.createElement('div');
    row.className = 'data-row';
    row.innerHTML = '<span class="data-label">状态</span><span class="data-value" style="color:#16a34a;">' + statusText + '</span>';
    card.appendChild(row);
  }
  return true;
}

function guideConfirmCardCollapse(boxId: any, text: any) {
  var box = boxId ? document.getElementById(boxId) : null;
  if (box) { box.innerHTML = '<p>' + text + '</p>'; return true; }
  return false;
}

// 手机号转账：命中通讯录直接带出姓名；陌生号码先要求验证姓名
function guidePhoneResolvePayee() {
  var s = GUIDE_TRANSFER;
  if (!s || s.kind !== 'phone') return;
  var contact = (typeof findContactByPhone === 'function') ? findContactByPhone(s.phone) : null;
  if (contact) {
    s.payee = contact.name;
    guideTransferAskRemark();
    return;
  }
  s.stage = 'verifyName';
  appendMessage(guideMessage(
    '<p>该手机号不在通讯录中，请输入<b>收款人姓名</b>完成验证：</p>' +
    '<p class="guide-tip">例如：李雷</p>'
  ));
  scrollToBottom();
}

// 会话里展示的收款对象：手机号转账有姓名时显示「姓名（手机号）」

// 时间段模糊时的追问：只说了「明天下午」就再问「下午几点」
function guidePeriodQuestion(period: any, date: any) {
  var label = ({ '凌晨': '凌晨', '早上': '早上', '上午': '上午', '中午': '中午', '下午': '下午', '晚上': '晚上' } as Record<string, string>)[period] || period;
  return '<p>请问 ' + (date ? (date + ' ') : '') + label + '几点执行？</p>' +
    '<p class="guide-tip">例如：3点 / 15:00</p>';
}

// 按转账类型分流到「立即转账」或「定时转账」的确认流程
function guideCommitTransfer() {
  var s = GUIDE_TRANSFER;
  if (!s) return;
  if (s.kind === 'timed') {
    guideTimedConfirm();
  } else {
    guideTransferConfirm();
  }
}

function guideEsc(v: any) {
  return (typeof escapeHtml === 'function') ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v);
}

function guideStartWealthPurchase() {
  guideResetAllSessions();
  GUIDE_WEALTH = { stage: 'slots', product: null, amount: null };
  currentModule = 'wealth';

  var profile = guideWealthProfile();
  if (!profile || !guideWealthValidProfile()) {
    GUIDE_WEALTH.stage = 'risk';
    var expired = (typeof riskProfileExpired === 'function') ? riskProfileExpired(profile) : false;
    appendMessage(guideMessage(
      '<p>查询到您' + (expired ? '风险测评<b>已过期</b>（有效期 1 年）' : '尚未完成风险评估') +
      '，按照监管要求，需要先完成风险测评，才能为您推荐和购买理财产品，是否现在开始测评？</p>' +
      '<div class="guide-chips">' +
      '<button class="guide-chip" onclick="guideWealthStartAssess()">开始测评</button>' +
      '<button class="guide-chip" onclick="guideWealthCancelAssess()">暂不测评</button>' +
      '</div>'
    ));
    scrollToBottom();
    return;
  }
  guideWealthShowRecommendations(profile);
}

// 从一句话里认卡：尾号 4 位 / 卡种关键词 / 第 N 张
function guidePickCardFromText(text: any, cards: any) {
  var t = String(text || '');
  if (!cards || !cards.length) return null;
  var byTail = cards.filter(function (x: any) { return x.tail && t.indexOf(String(x.tail)) !== -1; })[0];
  if (byTail) return byTail;
  var byType = cards.filter(function (x: any) {
    var label = String(x.cardType || '');
    return label && (t.indexOf(label) !== -1 || (label.indexOf('白金') !== -1 && /白金/.test(t)) || (label.indexOf('金卡') !== -1 && /金卡/.test(t)));
  })[0];
  if (byType) return byType;
  var idx = t.match(/第?\s*([一二三1-3])\s*张/);
  if (idx) {
    var map = { '一': 0, '二': 1, '三': 2, '1': 0, '2': 1, '3': 2 };
    var i = (map as any)[idx[1]];
    if (cards[i]) return cards[i];
  }
  return null;
}

// 调额记录：只展示 记录标题 / 状态・日期，最新置顶
function showCardLimitRecords() {
  var list = (mockData.userProfile.manualReviews || []).filter(function (r: any) {
    return r && r.actions && r.actions.some(function (a: any) { return a.tool === 'card.applyLimit'; });
  });
  var rows = list.length
    ? list.map(function (r: any) {
      var st = r.status === '待人工复核' ? '待复核' : (r.status || '待复核');
      return '<div class="report-row"><span>' + guideEsc(r.purpose) + '</span><b>' + guideEsc(st) + '・' + guideEsc((r.submittedAt || '').split(' ')[0]) + '</b></div>';
    }).join('')
    : '<div class="report-empty">暂无调额记录</div>';

  var c = mockData.userProfile.creditCard || {};
  appendMessage(guideMessage(
    '<p>调额记录（共 ' + list.length + ' 条，最新置顶）：</p>' +
    '<div class="report-panel" style="margin-top:6px;">' +
    '<div class="report-panel-title">信用卡额度调整</div>' + rows + '</div>' +
    '<p class="guide-tip">当前生效额度 ¥' + (Number(c.effectiveLimit) || 0).toLocaleString('zh-CN') +
    '，可用 ¥' + (Number(c.available) || 0).toLocaleString('zh-CN') + '</p>'
  ));
  scrollToBottom();
}

function guideTxnLimitFlagText(v: any) {
  return v === 'allow' ? '允许' : '禁止';
}

function guideTxnLimitValue(text: any) {
  var m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (!m) return null;
  var v = parseFloat(m[1]);
  if (m[2]) v *= 10000;
  return v;
}

// 本地先认「允许 / 禁止」；认不出再交给 AI 理解「是/否/可以/算了」这类说法
function guideTxnLimitFlag(text: any) {
  var t = String(text || '').trim().replace(/[。.!！?？,，、\s]/g, '');
  if (!t) return null;
  if (/(禁止|不允许|不可以|不行|关闭|别允许|关掉)/.test(t)) return 'block';
  if (/^(允许|可以|行|好|好的|是|是的|对|嗯|ok|OK)$/.test(t)) return 'allow';
  return null;
}

function guideTxnLimitNightQuestion(prefix: any) {
  return '<p>' + (prefix || '') + '是否允许夜间交易（23:00-06:00）？</p>';
}

// 交易限制：多卡时先选卡
function guideTxnLimitPickHtml(cards: any) {
  var rows = cards.map(function (c: any, i: any) {
    var right = (c.txnLimit && Number(c.txnLimit.single) > 0)
      ? ('单笔 ¥' + Number(c.txnLimit.single).toLocaleString('zh-CN'))
      : '未单独设置';
    return '<div class="report-row"><span>' + (i + 1) + '. ' + guideEsc(c.cardType || '信用卡') +
      '　尾号 ' + guideEsc(c.tail || '----') + '</span><b>' + right + '</b></div>';
  }).join('');
  return '<p>你有 ' + cards.length + ' 张信用卡，要给哪一张设置交易限制？</p>' +
    '<div class="report-panel" style="margin-top:8px;"><div class="report-panel-title">我的信用卡</div>' + rows + '</div>' +
    '<p class="guide-tip">回复卡片尾号（如 6789）或卡种（白金 / 金卡）即可。</p>';
}

function guideTxnLimitAskLimits() {
  var s = GUIDE_TXN_LIMIT;
  if (!s) return;
  var label = s.card ? guideCardLabel(s.card) : '';
  guideAsk(guideMessage(
    (label ? '<p>正在为「<b>' + guideEsc(label) + '</b>」设置交易限制。</p>' : '') +
    '<p>请设置单笔限额与每日限额。</p>' +
    '<p class="guide-tip">例如：20000 50000（只改一项时，另一项说「不变」）</p>'
  ));
}

function guideTxnLimitPickCard(cardId: any) {
  var s = GUIDE_TXN_LIMIT;
  if (!s || !Array.isArray(s.cards)) return;
  var card = s.cards.filter(function (c: any) { return c.id === cardId; })[0];
  if (!card) return;
  s.card = card;
  s.stage = 'limits';
  guideTxnLimitAskLimits();
}

function guideStartTxnLimit() {
  guideResetAllSessions();
  currentModule = 'card';
  var cards = guideCardLimitCards();
  if (cards.length > 1) {
    GUIDE_TXN_LIMIT = { stage: 'pickCard', single: null, daily: null, night: null, overseas: null, cards: cards, listShown: true };
    appendMessage(guideMessage(guideTxnLimitPickHtml(cards)));
    scrollToBottom();
    return;
  }
  GUIDE_TXN_LIMIT = { stage: 'limits', single: null, daily: null, night: null, overseas: null, cards: cards, card: cards[0] || null };
  guideTxnLimitAskLimits();
}

// 等待 AI 解析时的占位气泡
function guideTypingBubble() {
  var id = 'guide-typing-' + Date.now();
  appendMessage('<div class="message" id="' + id + '"><div class="msg-avatar ai">🤖</div>' +
    '<div class="msg-content"><div class="msg-name">AI Bank 助手</div>' +
    '<div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div></div></div>');
  scrollToBottom();
  return id;
}

async function guideTxnLimitStep(text: any) {
  if (guideIsNegativeAmount(text) && !/(不变|不改变|保持原样|不改)/.test(text)) {
    guideAsk(guideMessage('<p>限额需要大于 0，请重新输入。</p>' +
    '<p class="guide-tip">例如：20000</p>'));
    return true;
  }
  var t = String(text || '').trim();
  var s = GUIDE_TXN_LIMIT;
  if (!s) return true;

  // 多卡时先选卡
  if (s.stage === 'pickCard') {
    var plainPick = t.replace(/[吧呢啊呀。.!！?？\s]/g, '');
    if (/^(取消|不改了|算了|退出|返回|菜单)$/.test(plainPick)) {
      GUIDE_TXN_LIMIT = null;
      guideExitSilently();
      return true;
    }
    var picked = guidePickCardFromText(t, s.cards || []);
    if (picked) { guideTxnLimitPickCard(picked.id); return true; }
    if (s.listShown) s.listShown = false;
    guideSayInvalid(guideMessage('<p>没听懂你要设置哪张卡。请回复卡片尾号（如 6789）或卡种（白金 / 金卡）。</p>'));
    return true;
  }

  // 确认阶段支持直接打字
  if (s.stage === 'confirm') {
    var plainConfirm = t.replace(/[吧呢啊呀。.!！?？\s]/g, '');
    if (/^(确认|确定|确认设置|提交|是|好|好的|行|可以)$/.test(plainConfirm)) { guideTxnLimitSubmit(); return true; }
    if (/^(取消|不|不要|算了|退出)$/.test(plainConfirm)) { guideTxnLimitCancel(); return true; }
  }

  // ① 夜间 / 境外：本地先认「允许 / 禁止」，认不出用 AI 理解「是 / 否 / 可以 / 算了」
  if (s.stage === 'night' || s.stage === 'overseas') {
    var which = s.stage;
    var flag = guideTxnLimitFlag(t);
    if (!flag) {
      var loadId = guideTypingBubble();
      var aiFlag = null;
      try { aiFlag = await guideTxnLimitAIFlag(t, which); } catch (e) { aiFlag = null; }
      if (GUIDE_TXN_LIMIT !== s) return true;
      var el = document.getElementById(loadId);
      if (el) el.remove();
      flag = aiFlag;
    }
    if (!flag) {
      appendMessage(guideMessage('<p>该选项仅可回复【允许】或【禁止】，请重新选择。</p>'));
      scrollToBottom();
      return true;
    }
    if (which === 'night') {
      s.night = flag;
      s.stage = 'overseas';
      appendMessage(guideMessage('<p>是否允许境外交易？</p>'));
      scrollToBottom();
      return true;
    }
    s.overseas = flag;
    guideTxnLimitConfirm();
    return true;
  }

  // ①.5 「不变 / 保持原样」：支持只改其中一项，另一项沿用当前值
  var KEEP_WORD = '(不变|不改变|不变动|不改|不修改|不用改|保持原样|保持不变|维持原样|维持不变|原样|照旧|维持|保持)';
  var KEEP_RE = new RegExp('^' + KEEP_WORD + '$');
  var KEEP_ANY = new RegExp(KEEP_WORD);
  var keepSingle = false;
  var keepDaily = false;
  if (KEEP_ANY.test(t)) {
    if (new RegExp('(单笔|每笔|单次)[^，,、/\\s]{0,6}' + KEEP_WORD).test(t)) keepSingle = true;
    if (new RegExp('(每日|日累计|每天|一天)[^，,、/\\s]{0,6}' + KEEP_WORD).test(t)) keepDaily = true;
    if (!keepSingle && !keepDaily) {
      // 位置映射：第一个片段 → 单笔，第二个片段 → 每日（如「1000，不变」）
      var parts = t.split(/[，,、\/\s]+/).filter(function (x: any) { return x; });
      var keepIdx = -1;
      for (var pi = 0; pi < parts.length; pi++) {
        if (KEEP_RE.test(parts[pi].replace(/[。.!！?？]/g, ''))) { keepIdx = pi; break; }
      }
      if (keepIdx === 0) keepSingle = true;
      else if (keepIdx === 1) keepDaily = true;
      else if (keepIdx === -1) { /* 含关键词但认不出位置，下面按数字处理 */ }
      else keepDaily = true;
      // 只出现一个「不变」且没有数字 → 两项都保持不变
      if (keepIdx === 0 && !/\d/.test(t)) { keepDaily = true; }
    }
    var cur = guideTxnLimitCurrentValues(s.card);
    if (keepSingle) { s.single = cur.single; s.keptSingle = true; }
    if (keepDaily) { s.daily = cur.daily; s.keptDaily = true; }
  }

  // ② 限额：句中带关键字的两项分别归位；只有一个裸数字时默认作为单笔限额
  var mSingle = t.match(/(?:单笔|每笔|单次)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  var mDaily = t.match(/(?:日累计|每日|每天|一天|日限额)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  var bare = guideTxnLimitValue(t);

  function guideTxnLimitToVal(m: any) {
    if (!m) return null;
    var v = parseFloat(m[1]);
    if (m[2]) v *= 10000;
    return v;
  }

  var rest = t;
  if (mSingle) { s.single = guideTxnLimitToVal(mSingle); rest = rest.replace(mSingle[0], ' '); }
  if (mDaily) { s.daily = guideTxnLimitToVal(mDaily); rest = rest.replace(mDaily[0], ' '); }

  // 剩下的裸数字按出现顺序处理：1 个 → 默认日累计；2 个 → 先单笔、后日累计
  var restNums: any[] = [];
  var reNum = /(\d+(?:\.\d+)?)\s*(万|w|W)?/g;
  var mm;
  while ((mm = reNum.exec(rest))) {
    var vNum = parseFloat(mm[1]);
    if (mm[2]) vNum *= 10000;
    restNums.push(vNum);
  }

  if (restNums.length >= 2) {
    if (s.single == null) s.single = restNums[0];
    if (s.daily == null) s.daily = restNums[1];
  } else if (restNums.length === 1) {
    // 只给一个数时先当单笔限额，再问每日限额
    var only = restNums[0];
    if (s.single == null) s.single = only;
    else s.daily = only;
  }

  // 本地没解析到数字，或句子里是中文数字（五千 / 一万 / 五百）→ 让 AI 抽取
  var hasCnNum = /[一二三四五六七八九十百千万两零]/.test(t);
  var hasKeepWord = KEEP_ANY.test(t);
  // 中文数字 / 完全没解析到 / 出现「不变·不改变·保持」这类语义 → 交给模型判断
  if ((!mSingle && !mDaily && bare == null) || hasCnNum || hasKeepWord) {
    var loadId2 = guideTypingBubble();
    var ai = null;
    try { ai = await guideTxnLimitAILimits(t); } catch (e) { ai = null; }
    if (GUIDE_TXN_LIMIT !== s) return true;
    var el2 = document.getElementById(loadId2);
    if (el2) el2.remove();
    if (ai) {
      var curAI = guideTxnLimitCurrentValues(s.card);
      if (ai.keepSingle) { s.single = curAI.single; s.keptSingle = true; }
      if (ai.keepDaily) { s.daily = curAI.daily; s.keptDaily = true; }
      // 只补本地这次没解析到的字段，避免覆盖用户刚给出的其它字段
      if (!mSingle && s.single == null && ai.single != null) s.single = ai.single;
      if (!mDaily && s.daily == null && ai.daily != null) s.daily = ai.daily;
      if (!mSingle && !mDaily && bare == null) {
        if (s.single == null && ai.single != null) s.single = ai.single;
        if (s.daily == null && ai.daily != null) s.daily = ai.daily;
      }
    }
  }

  if (s.single == null) {
    guideAsk(guideMessage('<p>请输入单笔限额</p>'));
    scrollToBottom();
    return true;
  }
  if (s.daily == null) {
    appendMessage(guideMessage('<p>单笔限额已记录 ¥' + Number(s.single).toLocaleString('zh-CN') + '，请输入每日限额（需不低于单笔）。</p>'));
    scrollToBottom();
    return true;
  }

  // 与卡片页表单保持同一套规则：单笔 ≥ ¥1,000，日累计 ≥ 单笔
  var singleV = Number(s.single);
  var dailyV = Number(s.daily);
  // 校验不通过就整组重填：清掉单笔与每日，重新问「请设置单笔限额与每日限额。」
  if (!(singleV >= 1000)) {
    s.single = null;
    s.daily = null;
    s.keptSingle = false;
    s.keptDaily = false;
    appendMessage(guideMessage('<p>单笔限额不能低于 ¥1,000，请重新输入单笔限额和每日限额。</p>' +
      '<p class="guide-tip">请设置单笔限额与每日限额。</p>'));
    scrollToBottom();
    return true;
  }
  if (dailyV < singleV) {
    s.single = null;
    s.daily = null;
    s.keptSingle = false;
    s.keptDaily = false;
    appendMessage(guideMessage('<p>每日限额不能低于单笔限额 ¥' + singleV.toLocaleString('zh-CN') + '，请重新输入单笔限额和每日限额。</p>' +
      '<p class="guide-tip">请设置单笔限额与每日限额。</p>'));
    scrollToBottom();
    return true;
  }

  s.stage = 'night';
  appendMessage(guideMessage(guideTxnLimitNightQuestion('')));
  scrollToBottom();
  return true;
}
// 当前生效的限额（用于「不变」）：优先该卡自己的设置，否则继承账户默认
function guideTxnLimitCurrentValues(card: any) {
  if (card && card.txnLimit) {
    return {
      single: Number(card.txnLimit.single) || null,
      daily: Number(card.txnLimit.daily) || null
    };
  }
  var l = (typeof txnLimitData === 'function') ? (txnLimitData() || {}) : ((mockData.userProfile && mockData.userProfile.txnLimit) || {});
  return { single: Number(l.single) || null, daily: Number(l.daily) || null };
}
function guideTxnLimitConfirm() {
  var s = GUIDE_TXN_LIMIT;
  if (!s) return;
  s.stage = 'confirm';
  s.confirmBoxId = s.confirmBoxId || ('txn-limit-confirm-' + Date.now());
  appendMessage(guideMessage(
    '<div id="' + s.confirmBoxId + '-wrap">' +
    '<div class="data-card">' +
    (s.card ? '<div class="data-row"><span class="data-label">信用卡</span><span class="data-value">' + guideEsc(guideCardLabel(s.card)) + '</span></div>' : '') +
    '<div class="data-row"><span class="data-label">单笔限额</span><span class="data-value">' + (Number(s.single) || 0).toLocaleString('zh-CN') + ' 元' + (s.keptSingle ? '<span style="color:#94A3B8;">（不变）</span>' : '') + '</span></div>' +
    '<div class="data-row"><span class="data-label">每日限额</span><span class="data-value">' + (Number(s.daily) || 0).toLocaleString('zh-CN') + ' 元' + (s.keptDaily ? '<span style="color:#94A3B8;">（不变）</span>' : '') + '</span></div>' +
    '<div class="data-row"><span class="data-label">夜间交易（23:00-06:00）</span><span class="data-value">' + guideTxnLimitFlagText(s.night) + '</span></div>' +
    '<div class="data-row"><span class="data-label">境外交易</span><span class="data-value">' + guideTxnLimitFlagText(s.overseas) + '</span></div>' +
    '</div>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideTxnLimitSubmit()">确认设置</button>' +
    '<button class="guide-chip" onclick="guideTxnLimitCancel()">取消</button>' +
    '</div>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideTxnLimitSubmit() {
  var s = GUIDE_TXN_LIMIT;
  if (!s || s.stage !== 'confirm') return;
  var singleV = Number(s.single) || 0;
  var dailyV = Number(s.daily) || 0;
  if (singleV < 1000 || dailyV < singleV) {
    appendMessage(guideMessage('<p>限额不符合规则：单笔不能低于 ¥1,000，且日累计不能低于单笔。请重新设置。</p>'));
    scrollToBottom();
    return;
  }
  var nightV = s.night === 'allow' ? 'allow' : 'block';
  var overseasV = s.overseas === 'allow' ? 'allow' : 'block';
  var cardLabel = s.card ? guideCardLabel(s.card) : '';
  var isMain = !s.card || s.card.id === 'CARD-MAIN';
  if (isMain) {
    var l = (typeof txnLimitData === 'function') ? txnLimitData() : (mockData.userProfile.txnLimit = {});
    l.single = singleV;
    l.daily = dailyV;
    l.night = nightV;
    l.overseas = overseasV;
  } else {
    // 非主卡：限额记在该卡对象上，便于后续按卡校验
    var cardsNow = guideCardLimitCards();
    var target = cardsNow.filter(function (x: any) { return x.id === s.card.id; })[0];
    if (target) {
      target.txnLimit = { single: singleV, daily: dailyV, night: nightV, overseas: overseasV };
    }
  }
  saveUserData();
  // 确认卡收起按钮，标记为已完成
  var wrapId = s.confirmBoxId ? (s.confirmBoxId + '-wrap') : null;
  var wrapEl = wrapId ? document.getElementById(wrapId) : null;
  if (wrapEl) {
    var chips = wrapEl.querySelector('.guide-chips');
    if (chips) chips.remove();
    var cardEl = wrapEl.querySelector('.data-card');
    if (cardEl) {
      var doneRow = document.createElement('div');
      doneRow.className = 'data-row';
      doneRow.innerHTML = '<span class="data-label">状态</span><span class="data-value" style="color:#16a34a;">已生效</span>';
      cardEl.appendChild(doneRow);
    }
  }
  GUIDE_TXN_LIMIT = null;
  appendMessage(guideMessage('<p>' + (cardLabel ? guideEsc(cardLabel) + ' ' : '') + '交易限制已更新完成。</p>'));
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('card'); }, 400);
  scrollToBottom();
}

function guideTxnLimitCancel() {
  var s = GUIDE_TXN_LIMIT;
  var wrapId = s && s.confirmBoxId ? (s.confirmBoxId + '-wrap') : null;
  GUIDE_TXN_LIMIT = null;
  var wrap = wrapId ? document.getElementById(wrapId) : null;
  if (wrap) {
    wrap.innerHTML = '<p>已取消修改，交易限制保持原配置。</p>';
  } else {
    appendMessage(guideMessage('<p>已取消修改，交易限制保持原配置。</p>'));
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('card'); }, 400);
  }
  scrollToBottom();
}

// 收起问句下的选项按钮，并在下方记录所选（例如「需要赎回还是追加申购呢：赎回」）

// 收起某条消息卡片里的按钮，并在同一气泡里记录一行（仿「是否添加备注」的折叠效果）

// 收起最后一条带按钮的卡片，并在卡片内记录一行（与「是否添加备注」一致）
function guideCollapseLatestChips(note: any) {
  try {
    var bubbles = document.querySelectorAll('.message:not(.user) .msg-bubble');
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      var chips = b.querySelector('.guide-chips');
      if (!chips || !chips.parentNode) continue;
      chips.parentNode.removeChild(chips);
      var p = document.createElement('p');
      p.className = 'guide-tip';
      p.textContent = note;
      b.appendChild(p);
      return true;
    }
  } catch (e) { /* 折叠失败不影响流程 */ }
  return false;
}

function guideCollapseCardNote(markerText: any, note: any) {
  try {
    var bubbles = document.querySelectorAll('.message:not(.user) .msg-bubble');
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      if ((b.textContent || '').indexOf(markerText) === -1) continue;
      var chips = b.querySelector('.guide-chips');
      if (!chips || !chips.parentNode) continue;
      chips.parentNode.removeChild(chips);
      var p = document.createElement('p');
      p.className = 'guide-tip';
      p.textContent = note;
      b.appendChild(p);
      return true;
    }
  } catch (e) { /* 折叠失败不影响流程 */ }
  return false;
}

function guideCollapseChoiceChips(questionText: any, choice: any) {
  try {
    var bubbles = document.querySelectorAll('.message:not(.user) .msg-bubble');
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      if ((b.textContent || '').indexOf(questionText) === -1) continue;
      var chips = b.querySelector('.guide-chips');
      if (!chips || !chips.parentNode) continue;
      chips.parentNode.removeChild(chips);
      var note = document.createElement('p');
      note.className = 'guide-tip';
      note.textContent = String(questionText).replace(/[？?]$/, '') + '：' + choice;
      b.appendChild(note);
      return true;
    }
  } catch (e) { /* 收起失败不影响流程 */ }
  return false;
}

var FLOWER_CAKES = [
  { name: '无蛋糕', price: 0 },
  { name: '6寸水果蛋糕', price: 168 },
  { name: '8寸奶油蛋糕', price: 228 }
];
