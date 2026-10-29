// ==========================================================================
//  服务向导：起始欢迎语 + 五类服务二级菜单 + 模块内上下文
//  交互约定：
//   1. 对话起始由 AI 主动列出五类服务，并给出可点击按钮；
//   2. 点击按钮或输入服务名 → 进入该服务的二级菜单（例如「转账」→ 姓名/手机号/定时/AA）；
//   3. 选定子项后进入对应流程，并把模块记在 currentModule 上：
//      后续输入优先按当前模块解析（如已进入转账，直接说「定时转账」即进入定时表单）；
//   4. 说「返回 / 菜单」回到一级菜单；「新对话」会重置模块上下文。
// ==========================================================================

var GUIDE_SERVICES = [
  {
    key: 'transfer', label: '转账', icon: 'transfer',
    aliases: ['智能转账', '转账服务'],
    prompt: '您好，请问你需要姓名转账、手机号转账、定时转账，还是AA收款？',
    subs: [
      { key: 'name', label: '姓名转账', example: '给张三转1000元', run: function () { guideStartNameTransfer(); } },
      { key: 'phone', label: '手机号转账', example: '向13800138000转500元', run: function () { guideStartPhoneTransfer(); } },
      { key: 'timed', label: '定时转账', example: '明天下午3点给张三转1000元', run: function () { guideStartTimedTransfer(); } },
      { key: 'aa', label: 'AA收款', example: '向张三和李四AA收款200元', run: function () { guideStartAATransfer(); } }
    ]
  },
  {
    key: 'bill', label: '账单分析', icon: 'bill',
    aliases: ['账单'],
    prompt: '账单分析包含收支结构、支出构成和近 7 日趋势，也可以直接看异常交易：',
    subs: [
      { key: 'overview', label: '账单分析', example: '分析一下我这个月的账单', aliases: ['财务总览', '消费统计', '账单报告', '账单'], run: function () { showBillOverview(); } },
      { key: 'abnormal', label: '异常交易', example: '看看最近的异常交易', run: function () { showAbnormalAlert(); } }
    ]
  },
  {
    key: 'card', label: '卡片管理', icon: 'card',
    aliases: ['卡片'],
    prompt: '卡片管理包含这些操作，请选择：',
    subs: [
      { key: 'apply', label: '卡片申请', example: '我想办一张标准金卡，额度5万', aliases: ['申请信用卡'], run: function () { guideStartCardApply(); } },
      { key: 'mycards', label: '我的卡片', example: '我现在有哪些卡', aliases: ['我的信用卡'], run: function () { showCardMyCards(); } },
      { key: 'limit', label: '额度调整', example: '把额度提高到80000，原因是消费需求增加', aliases: ['申请调整信用卡额度', '信用卡额度调整', '调额'], run: function () { guideStartCardLimitAdjust(); } },
      { key: 'txnlimit', label: '交易限制', example: '设置单笔限额20000，每日限额50000', run: function () { guideStartTxnLimit(); } },
      { key: 'lost', label: '卡片挂失', example: '我的卡丢了，要挂失尾号6789的卡', run: function () { guideStartCardLost(); } }
    ]
  },
  {
    key: 'wealth', label: '理财', icon: 'wealth',
    aliases: ['理财服务', '投资理财'],
    prompt: '理财服务包含这些内容，请选择：',
    subs: [
      { key: 'products', label: '产品申购', example: '申购稳健增利90天 5000元', aliases: ['产品', '申购'], run: function () { guideStartWealthPurchase(); } },
      { key: 'risk', label: '风险评估', example: '我要做风险测评', run: function () { startRiskAssessment(); } },
      { key: 'holdings', label: '持仓管理', example: '我买了哪些产品', aliases: ['持仓', '我的持仓'], run: function () { guideStartHoldings(); } }
    ]
  },
  {
    key: 'life', label: '生活订购', icon: 'bell',
    aliases: ['生活', '生活服务'],
    prompt: '生活订购包含这些服务，请选择：',
    subs: [
      { key: 'subscribe', label: '订阅管理', example: '我想要订阅某易云年卡', aliases: ['我的订阅'], run: function () { guideStartSubManage(); } },
      { key: 'birthday', label: '生日鲜花', example: '为林小雨订一束花', aliases: ['鲜花订购', '订花', '买花', '鲜花订单'], run: function () { guideStartBirthdayFlower(); } }
    ]
  }
];

function guideServiceByKey(key) {
  for (var i = 0; i < GUIDE_SERVICES.length; i++) {
    if (GUIDE_SERVICES[i].key === key) return GUIDE_SERVICES[i];
  }
  return null;
}

function guideChip(label, onclick) {
  return '<button class="guide-chip" onclick="' + onclick + '">' + label + '</button>';
}

function guideMessage(inner) {
  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">AI Bank 助手</div>' +
    '<div class="msg-bubble agent-bubble">' + inner + '</div></div></div>';
}

// 一级菜单：对话起始欢迎语
// 「账户概览」入口暂时屏蔽：需要恢复时把下面开关改成 true 即可
var GUIDE_SHOW_OVERVIEW = false;

// 统一重置所有向导会话。任何新的服务/子功能入口都先结束旧流程，
// 避免「转账会话 + 理财会话」同时存在导致输入被旧会话抢走。
function guideResetAllSessions() {
  GUIDE_TRANSFER = null;
  GUIDE_AA = null;
  GUIDE_WEALTH = null;
  GUIDE_CARD_APPLY = null;
  GUIDE_CARD_LIMIT = null;
  GUIDE_TXN_LIMIT = null;
  GUIDE_CARD_LOST = null;
  GUIDE_HOLDING = null;
  GUIDE_SUB = null;
  GUIDE_FLOWER = null;
  if (typeof window !== 'undefined') window.__pendingScheduledTransfers = {};
}

// 只读查询不应被「打开功能菜单」或「调额申请」劫持：
// 「查余额 / 查信用卡额度 / 看交易记录」交回主链路（chat/agent 的只读处理器）。
function guideIsReadOnlyQuery(text) {
  var s = String(text || '').trim();
  if (!s) return false;
  // 明确是变更类操作时不算只读查询
  if (/(调整|提升|提高|降低|申请|办理|设置|修改|取消|关闭|开启|挂失|购买|申购|赎回|提额|调高|调低|调额)/.test(s)) return false;
  // 「我要调我的信用卡额度」「把额度降一点」这类也属于变更，不能当成只读查询
  if (/额度/.test(s) && /(调|改|降|升|加|减)/.test(s)) return false;
  if (!/(余额|额度|交易记录|最近交易|流水)/.test(s)) return false;
  return /^(查|看|看看|查看|查询|显示|我的|我|帮我|麻烦|请问|还有|还剩)/.test(s) ||
    /(多少|余额|额度)/.test(s);
}

// 回答后把这一步的按钮收起来（保留一句已选项）
function guideChipsDone(boxId, note) {
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
// 「是否重复？」卡片（答错会再弹一次，每次都记为最新一张）
function guideTimedAskRepeat(prefix) {
  var s = GUIDE_TRANSFER;
  if (!s) return;
  s.stage = 'repeat';
  s.repeatBoxId = 'transfer-repeat-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  appendMessage(guideMessage('<div id="' + s.repeatBoxId + '"><p>' + (prefix || '') + '是否重复？</p><div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideTimedRepeatChoose(\'不重复\')">不重复</button>' +
    '<button class="guide-chip" onclick="guideTimedRepeatChoose(\'每天\')">每天</button>' +
    '<button class="guide-chip" onclick="guideTimedRepeatChoose(\'每周\')">每周</button>' +
    '<button class="guide-chip" onclick="guideTimedRepeatChoose(\'每月\')">每月</button>' +
    '<button class="guide-chip" onclick="guideTimedRepeatChoose(\'每年\')">每年</button>' +
    '</div></div>'));
  scrollToBottom();
}
// 重复方式按钮
function guideTimedRepeatChoose(repeat) {
  var s = GUIDE_TRANSFER;
  if (!s || s.stage !== 'repeat') return;
  s.repeat = repeat;
  guideChipsDone(s.repeatBoxId, '重复方式：' + repeat);
  guideTransferAskRemark();
}
// 「我要申请一张信用卡 / 办张金卡」→ 直接进卡片申请并解析卡种/额度/用途
function guideIsCardApplyPhrase(t) {
  var s = String(t || '').trim();
  if (!s) return false;
  if (/(挂失|冻结|限额|额度调整|调额|提额|解挂|注销)/.test(s)) return false;
  if (/(信用卡|白金卡|金卡|青年卡|旅行卡|新卡|卡片|钻石卡|黑卡|普通卡)/.test(s)) {
    return /(申请|办|开通|新办|再来一张|要一张|想办)/.test(s);
  }
  // 「办一张卡 / 申请张卡」这类没点卡种的说法，也进申请流程（再由可选范围兜底）
  return /(办|申请|开通|新办).{0,3}卡/.test(s);
}
// 句子里带时间/日期说法 → 视为定时转账
function guideLooksTimedTransfer(t) {
  var s = String(t || '');
  if (/(定时|预约|计划|稍后|以后|到期执行)/.test(s)) return true;
  return /(明天|今天|后天|大后天|下周|下个?周|周[一二三四五六日天]|星期[一二三四五六日天]|月底|月初|下月|每月|每周|每天|明年|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|\d{1,2}\s*[点时]|\d{1,2}\s*[:：]\s*\d{2}|上午|下午|晚上|早上|中午)/.test(s);
}
// 一句话里已经带齐金额/收款人/产品时，直接进入业务流，不再先给二级菜单。
// 这是「给张三转账1000元」被菜单吞掉的直接修复。
function guideTryActionableCommand(text) {
  var t = String(text || '').trim();
  if (!t) return null;

  // 「给张三转1000元」里的「转」也算转账意图（无需完整的「转账」两字）
  var transferLike = /(转账|转帐|汇款|打钱|转钱|付款|转给|付给|打给)/.test(t) ||
    (/(给|向|帮|替)/.test(t) && /(转|打|汇|付)/.test(t) && /\d/.test(t));
  if (transferLike) {
    var hasPhone = /1\d{10}/.test(t);
    var kind = guideLooksTimedTransfer(t) ? 'timed' : ((/手机号|电话/.test(t) || hasPhone) ? 'phone' : 'name');
    var parsed = guideTransferParse(t, kind);
    if (parsed.amount > 0 || parsed.phone) {
      GUIDE_TRANSFER = {
        kind: kind, payee: null, phone: null, amount: null, remark: '', stage: 'slots'
      };
      if (kind === 'timed') {
        GUIDE_TRANSFER.date = null;
        GUIDE_TRANSFER.time = null;
        GUIDE_TRANSFER.repeat = '不重复';
      }
      currentModule = 'transfer';
      return guideTransferStep(t);
    }
    // 「给王五转账」这类只说了收款人、没说金额的，也要直接进姓名转账并追问金额，
    // 不能退回二级菜单让用户再选一次。
    if (kind === 'name') {
      var hitName = '';
      var names = (typeof guideContactNames === 'function') ? guideContactNames() : '';
      names.split('、').forEach(function (n) {
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

// 供向导内部使用的轻量金额解析：支持千分位、亿/万/千，且跳过 11 位手机号。
function guideParseSimpleAmount(text) {
  var s = String(text || '').replace(/,/g, '');
  s = s.replace(/1\d{10}/g, ' ');
  var m = s.match(/(\d+(?:\.\d+)?)\s*(亿|万|w|W|千|k|K)?/);
  if (!m) return 0;
  var v = parseFloat(m[1]);
  if (!(v > 0)) return 0;
  var unit = m[2];
  if (unit === '亿') v *= 100000000;
  else if (unit === '万' || unit === 'w' || unit === 'W') v *= 10000;
  else if (unit === '千' || unit === 'k' || unit === 'K') v *= 1000;
  return v;
}

// 主菜单按钮：生活订购拆成「订阅管理」「生日鲜花」两个入口
var GUIDE_HOME_ENTRIES = [
  { label: '转账', action: "guideOpenService('transfer')" },
  { label: '账单分析', action: "guideOpenService('bill')" },
  { label: '卡片管理', action: "guideOpenService('card')" },
  { label: '理财', action: "guideOpenService('wealth')" },
  { label: '订阅管理', action: 'guideStartSubManage()' },
  { label: '生日鲜花', action: 'guideStartBirthdayFlower()' }
];

function renderServiceWelcome() {
  var chips = GUIDE_HOME_ENTRIES.map(function (e) {
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

// 距离某个「月-日」还有多少天（当天为 0）
function guideDaysUntilMonthDay(m, d) {
  var now = new Date();
  var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var next = new Date(now.getFullYear(), m - 1, d);
  if (next < todayMid) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next - todayMid) / 86400000);
}

// 某年某月第 n 个周日；若已过则顺延到明年
function guideNthSundayNext(month, nth) {
  function nthSunday(y) {
    var first = new Date(y, month - 1, 1);
    var offset = (7 - first.getDay()) % 7;   // 第一个周日
    return new Date(y, month - 1, 1 + offset + (nth - 1) * 7);
  }
  var now = new Date();
  var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var d = nthSunday(now.getFullYear());
  if (d < todayMid) d = nthSunday(now.getFullYear() + 1);
  var days = Math.round((d - todayMid) / 86400000);
  return {
    date: d,
    str: d.getFullYear() + '-' + guidePad2(String(d.getMonth() + 1)) + '-' + guidePad2(String(d.getDate())),
    days: days,
    text: days === 0 ? '就是今天' : '还有 ' + days + ' 天'
  };
}
// 主菜单提醒卡：一张卡里放「异常交易 / 生日 / 情人节」三类提醒
function guideHomeRemindersHtml() {
  var rows = [];

  // ① 异常交易
  var abnormal = [];
  try { abnormal = (typeof detectAbnormalTxns === 'function') ? (detectAbnormalTxns() || []) : []; } catch (e) { abnormal = []; }
  if (abnormal.length) {
    rows.push('<div class="mini-row"><div class="mini-row-main">' +
      '<div class="mini-row-title">⚠️ 检测到 ' + abnormal.length + ' 笔异常交易</div>' +
      '<div class="mini-row-sub">系统识别到可疑消费、异地交易</div></div>' +
      '<button class="mini-link" onclick="showAbnormalAlert()">查看</button></div>');
  }

  // ② 生日：7 天内全部列出；7 天内没有就展示最近的那一位
  var bdays = guideUpcomingBirthdays(7);
  if (!bdays.length) {
    var nearest = guideNearestBirthday();
    if (nearest) bdays = [nearest];
  }
  bdays.forEach(function (n) {
    var days = n.days === 0 ? '今天生日' : '还有 ' + n.days + ' 天';
    rows.push('<div class="mini-row"><div class="mini-row-main">' +
      '<div class="mini-row-title">🎂 ' + guideFlowerEsc(n.name) + (n.relation ? '（' + guideFlowerEsc(n.relation) + '）' : '') +
      '生日：' + Number(String(n.birthday).split('-')[0]) + ' 月 ' + Number(String(n.birthday).split('-')[1]) + ' 日，' + days + '</div>' +
      (n.flower ? '<div class="mini-row-sub">推荐：' + guideFlowerEsc(n.flower) + ' ¥' + n.price + '</div>' : '') +
      '</div><button class="mini-link" onclick="guideStartFlowerForContact(\'' + guideFlowerEsc(n.name) + '\')">订鲜花+蛋糕</button></div>');
  });

  // ③④⑤ 节日鲜花：只在临近（≤2 天）时才提醒，避免常年占版面
  var FEST_WARN_DAYS = 2;

  var vDays = guideDaysUntilMonthDay(2, 14);
  if (vDays <= FEST_WARN_DAYS) {
    var vText = vDays === 0 ? '今天就是情人节' : '还有 ' + vDays + ' 天';
    rows.push('<div class="mini-row"><div class="mini-row-main">' +
      '<div class="mini-row-title">💐 情人节：2 月 14 日，' + vText + '</div>' +
      '<div class="mini-row-sub">推荐：简约玫瑰 ¥299</div></div>' +
      '<button class="mini-link" onclick="guideStartValentineFlower()">订情人节鲜花</button></div>');
  }

  var momDate = guideNthSundayNext(5, 2);
  if (momDate.days <= FEST_WARN_DAYS) {
    rows.push('<div class="mini-row"><div class="mini-row-main">' +
      '<div class="mini-row-title">🌷 母亲节：' + guideFlowerDisplayDate(momDate.str) + '，' + momDate.text + '</div>' +
      '<div class="mini-row-sub">推荐：康乃馨礼盒 ¥128</div></div>' +
      '<button class="mini-link" onclick="guideStartParentsDayFlower(\'mother\')">订母亲节鲜花</button></div>');
  }

  var dadDate = guideNthSundayNext(6, 3);
  if (dadDate.days <= FEST_WARN_DAYS) {
    rows.push('<div class="mini-row"><div class="mini-row-main">' +
      '<div class="mini-row-title">🌿 父亲节：' + guideFlowerDisplayDate(dadDate.str) + '，' + dadDate.text + '</div>' +
      '<div class="mini-row-sub">推荐：百合礼盒 ¥199</div></div>' +
      '<button class="mini-link" onclick="guideStartParentsDayFlower(\'father\')">订父亲节鲜花</button></div>');
  }

  if (!rows.length) return '';
  return '<div class="mini-card home-reminders"><div class="mini-card-title">今日提醒</div>' + rows.join('') + '</div>';
}

// 最近要过生日的联系人（含距离天数）
function guideNearestBirthday() {
  if (typeof syncContactsBirthdays === 'function') syncContactsBirthdays();
  var list = (mockData.userProfile && mockData.userProfile.birthdayContacts) || [];
  var today = new Date();
  var todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  var items = list.map(function (c) {
    var parts = String(c.birthday || '').split('-').map(Number);
    var m = parts.length >= 2 ? parts[parts.length - 2] : NaN;
    var d = parts.length >= 2 ? parts[parts.length - 1] : NaN;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    var next = new Date(today.getFullYear(), m - 1, d);
    if (next < todayMid) next = new Date(today.getFullYear() + 1, m - 1, d);
    var days = Math.round((next - todayMid) / 86400000);
    return { name: c.name, relation: c.relation || '', birthday: m + '-' + d, days: days, flower: c.flower || '', price: c.price || 0, next: next };
  }).filter(Boolean).sort(function (a, b) { return a.days - b.days; });
  return items[0] || null;
}

// 7 天内要过生日的联系人（按天数升序，去重）
function guideUpcomingBirthdays(limitDays) {
  if (typeof syncContactsBirthdays === 'function') syncContactsBirthdays();
  var list = (mockData.userProfile && mockData.userProfile.birthdayContacts) || [];
  var today = new Date();
  var todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  var seen = {};
  var items = [];
  list.forEach(function (c) {
    if (!c || !c.name || seen[c.name]) return;
    var parts = String(c.birthday || '').split('-').map(Number);
    var m = parts.length >= 2 ? parts[parts.length - 2] : NaN;
    var d = parts.length >= 2 ? parts[parts.length - 1] : NaN;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return;
    var next = new Date(today.getFullYear(), m - 1, d);
    if (next < todayMid) next = new Date(today.getFullYear() + 1, m - 1, d);
    var days = Math.round((next - todayMid) / 86400000);
    seen[c.name] = true;
    items.push({ name: c.name, relation: c.relation || '', birthday: m + '-' + d, days: days, flower: c.flower || '', price: c.price || 0, next: next });
  });
  items.sort(function (a, b) { return a.days - b.days; });
  var lim = (typeof limitDays === 'number') ? limitDays : 7;
  return items.filter(function (x) { return x.days <= lim; });
}
// 主菜单生日提醒卡（紧凑一行 + 一个按钮）
function guideBirthdayCardHtml() {
  var n = guideNearestBirthday();
  if (!n) return '';
  var who = '🎂 ' + guideFlowerEsc(n.name) + (n.relation ? '（' + guideFlowerEsc(n.relation) + '）' : '');
  var days = n.days === 0 ? '今天生日' : '还有 ' + n.days + ' 天';
  var rec = n.flower ? ('推荐：' + guideFlowerEsc(n.flower) + ' ¥' + n.price) : '';
  return '<div class="mini-card birthday-mini">' +
    '<div class="mini-card-line">' + who + '生日：' + Number(String(n.birthday).split('-')[0]) + ' 月 ' + Number(String(n.birthday).split('-')[1]) + ' 日，' + days + '</div>' +
    '<div class="mini-card-line mini-card-actions">' + (rec ? '<span class="mini-card-rec">' + rec + '</span>' : '') +
    '<button class="mini-link" onclick="guideStartFlowerForContact(\'' + guideFlowerEsc(n.name) + '\')">订鲜花+蛋糕</button></div>' +
    '</div>';
}

// 情人节一键下单：优先「爱人」关系，默认玫瑰礼盒 + 2 月 14 日下午
function guideStartValentineFlower() {
  guideResetAllSessions();
  var bday = (mockData.userProfile && mockData.userProfile.birthdayContacts) || [];
  var contacts = guideFlowerContacts();
  var pick = bday.filter(function (x) { return x && x.relation === '爱人' && contacts.indexOf(x.name) !== -1; })[0];
  var name = pick ? pick.name : (contacts[0] || '');
  if (!name) {
    appendMessage(guideMessage('<p>还没有可下单的联系人，请先在「联系人」里添加收花人。</p>'));
    scrollToBottom();
    return;
  }
  guideStartFlowerPreset(name, { bouquet: '简约玫瑰', monthDay: [2, 14], slot: 'afternoon', card: '情人节快乐', note: '情人节' });
}

// 母亲节 / 父亲节下单：优先对应关系的联系人
function guideStartParentsDayFlower(kind) {
  guideResetAllSessions();
  var isMom = kind === 'mother';
  var wantRel = isMom ? '母亲' : '父亲';
  var bday = (mockData.userProfile && mockData.userProfile.birthdayContacts) || [];
  var contacts = guideFlowerContacts();
  var pick = bday.filter(function (x) { return x && x.relation === wantRel && contacts.indexOf(x.name) !== -1; })[0];
  // 关系写「家人」但名字像父母的也兜底匹配
  if (!pick) {
    pick = bday.filter(function (x) {
      if (!x || contacts.indexOf(x.name) === -1) return false;
      return isMom ? /妈|母/.test(x.name) : /爸|父/.test(x.name);
    })[0];
  }
  var name = pick ? pick.name : (contacts[0] || '');
  if (!name) {
    appendMessage(guideMessage('<p>还没有可下单的联系人，请先在「联系人」里添加收花人。</p>'));
    scrollToBottom();
    return;
  }
  var fest = guideNthSundayNext(isMom ? 5 : 6, isMom ? 2 : 3);
  guideStartFlowerPreset(name, {
    bouquet: isMom ? '康乃馨礼盒' : '百合礼盒',
    dateStr: fest.str,
    slot: 'morning',
    card: isMom ? '母亲节快乐' : '父亲节快乐',
    note: isMom ? '母亲节' : '父亲节'
  });
}
// 按联系人生成预填订单（通用）：opts.bouquet / opts.monthDay / opts.slot / opts.card / opts.note
function guideStartFlowerPreset(name, opts) {
  var o = opts || {};
  var contacts = guideFlowerContacts();
  var target = String(name || '');
  if (contacts.indexOf(target) === -1) { guideStartFlowerOrder(); return; }
  var c = (mockData.contacts || []).filter(function (x) { return x && x.name === target; })[0] || {};
  var bd = ((mockData.userProfile && mockData.userProfile.birthdayContacts) || []).filter(function (x) { return x && x.name === target; })[0] || {};
  var bouquet = o.bouquet ? guideFlowerBouquet(o.bouquet) : (bd.flower ? guideFlowerBouquet(bd.flower) : null);

  // 配送日期：优先指定「月-日」，否则用联系人生日
  var date = '';
  var md = o.monthDay || (bd.birthday ? [Number(String(bd.birthday).split('-')[0]), Number(String(bd.birthday).split('-')[1])] : null);
  if (o.dateStr) {
    date = o.dateStr;
  } else if (md && md[0] >= 1 && md[1] >= 1) {
    var now = new Date();
    var cand = new Date(now.getFullYear(), md[0] - 1, md[1]);
    var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (cand < todayMid) cand = new Date(now.getFullYear() + 1, md[0] - 1, md[1]);
    date = cand.getFullYear() + '-' + guidePad2(String(cand.getMonth() + 1)) + '-' + guidePad2(String(cand.getDate()));
  }

  GUIDE_FLOWER = {
    mode: 'order', stage: 'slots',
    order: {
      recipient: target,
      phone: c.phoneFull || c.phone || '',
      address: c.address || '清远市清城区XX小区',
      bouquet: bouquet ? bouquet.name : '',
      cake: o.cake || '无蛋糕',
      date: date,
      slot: o.slot || 'afternoon',
      card: o.card || '生日快乐',
      payMethod: '储蓄卡'
    },
    editing: null
  };
  currentModule = 'life';
  var filled = [];
  if (c.phoneFull || c.phone) filled.push('手机号 ' + (c.phoneFull || c.phone));
  filled.push('收货地址 ' + GUIDE_FLOWER.order.address);
  if (bouquet) filled.push('花束 ' + bouquet.name);
  // 已为该联系人在同一天下过单 → 直接提示，不再走确认卡
  var dupAtStart = guideFlowerDuplicate(target, date);
  if (dupAtStart) {
    GUIDE_FLOWER = null;
    guideFlowerWarnDuplicate(dupAtStart);
    return;
  }
  appendMessage(guideMessage(
    '<p>已按「' + guideFlowerEsc(target) + '」的联系人信息自动填写：' + guideFlowerEsc(filled.join('、')) + '。</p>' +
    '<p class="guide-tip">' + (o.note ? o.note + '配送日期默认 ' : '配送日期默认') + (date ? guideFlowerDisplayDate(date) : '待定') +
    '，时段 ' + guideFlowerSlot(o.slot || 'afternoon').text + '；字段可直接在卡片里修改。</p>'
  ));
  guideFlowerConfirm();
}
// 点生日提醒直接进鲜花确认（收花人/手机号/地址按联系人自动填好，可改）
function guideStartFlowerForContact(name) {
  // 生日礼：鲜花 + 蛋糕（默认 6 寸，可在卡片里改成 8 寸或不加蛋糕）
  guideStartFlowerPreset(name, { cake: '6寸水果蛋糕' });
  return;
}

function guideStartFlowerForContactLegacy(name) {
  guideResetAllSessions();
  var contacts = guideFlowerContacts();
  var target = String(name || '');
  if (contacts.indexOf(target) === -1) {
    guideStartFlowerOrder();
    return;
  }
  var c = (mockData.contacts || []).filter(function (x) { return x && x.name === target; })[0] || {};
  var bd = ((mockData.userProfile && mockData.userProfile.birthdayContacts) || []).filter(function (x) { return x && x.name === target; })[0] || {};
  var bouquet = bd.flower ? guideFlowerBouquet(bd.flower) : null;
  var n = guideNearestBirthday();
  var date = '';
  if (bd.birthday) {
    var mm = String(bd.birthday).split('-').map(Number);
    var m = mm.length >= 2 ? mm[mm.length - 2] : NaN;
    var d = mm.length >= 2 ? mm[mm.length - 1] : NaN;
    if (m >= 1 && d >= 1) {
      var now = new Date();
      var y = now.getFullYear();
      var cand = new Date(y, m - 1, d);
      var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (cand < todayMid) cand = new Date(y + 1, m - 1, d);
      date = cand.getFullYear() + '-' + guidePad2(String(cand.getMonth() + 1)) + '-' + guidePad2(String(cand.getDate()));
    }
  }
  GUIDE_FLOWER = {
    mode: 'order', stage: 'slots',
    order: {
      recipient: target,
      phone: c.phoneFull || c.phone || '',
      address: c.address || '清远市清城区XX小区',
      bouquet: bouquet ? bouquet.name : '',
      date: date,
      slot: 'afternoon',
      card: '生日快乐',
      payMethod: '储蓄卡'
    },
    editing: null
  };
  currentModule = 'life';
  var filled = [];
  if (c.phoneFull || c.phone) filled.push('手机号 ' + (c.phoneFull || c.phone));
  filled.push('收货地址 ' + GUIDE_FLOWER.order.address);
  if (bouquet) filled.push('花束 ' + bouquet.name);
  // 已为该联系人在同一天下过单 → 直接提示，不再走确认卡
  var dupAtStart = guideFlowerDuplicate(target, date);
  if (dupAtStart) {
    GUIDE_FLOWER = null;
    guideFlowerWarnDuplicate(dupAtStart);
    return;
  }
  appendMessage(guideMessage(
    '<p>已按「' + guideFlowerEsc(target) + '」的联系人信息自动填写：' + guideFlowerEsc(filled.join('、')) + '。</p>' +
    '<p class="guide-tip">配送日期默认生日当天（' + (date ? guideFlowerDisplayDate(date) : '待定') + '）下午时段；如需修改，直接回复要改的内容（如「换成百合礼盒」「改到上午」）。</p>'
  ));
  guideFlowerConfirm();
}

// 起始页的「账户概览」入口：按需打开原来的财务驾驶舱，不占起始版面
function guideOpenOverview() {
  if (typeof renderAgentBriefing === 'function') renderAgentBriefing();
}

// 二级菜单：某一类服务的子功能
function guideOpenService(key) {
  if (typeof guideActiveFlowLabel === 'function' && guideActiveFlowLabel()) {
    guideFlowLockedNotice();
    return;
  }
  var s = guideServiceByKey(key);
  if (!s) return;
  guideResetAllSessions();
  currentModule = s.key;
  // 二级菜单不再提供按钮：列出「功能名：示例说法」，用户直接说话进入
  var rows = s.subs.map(function (sub) {
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
function guidePickSub(serviceKey, subKey) {
  if (typeof guideActiveFlowLabel === 'function' && guideActiveFlowLabel()) {
    guideFlowLockedNotice();
    return;
  }
  var s = guideServiceByKey(serviceKey);
  if (!s) return;
  var sub = s.subs.filter(function (x) { return x.key === subKey; })[0];
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
  guideResetAllSessions();
  currentModule = 'chat';
  renderServiceWelcome();
}

// 当前正在进行的对话流程（没有则返回空串）——用于「流程锁」：没走完就不许换功能 / 重开一单
function guideActiveFlowLabel() {
  if (GUIDE_TRANSFER) {
    if (GUIDE_TRANSFER.kind === 'timed') return '定时转账';
    if (GUIDE_TRANSFER.kind === 'phone') return '手机号转账';
    if (GUIDE_TRANSFER.kind === 'bank') return '银行卡转账';
    return '姓名转账';
  }
  if (GUIDE_AA) return 'AA 收款';
  if (GUIDE_WEALTH) return '理财申购';
  if (GUIDE_CARD_APPLY) return '信用卡申请';
  if (GUIDE_CARD_LIMIT) return '额度调整';
  if (GUIDE_TXN_LIMIT) return '交易限制设置';
  if (GUIDE_CARD_LOST) return '卡片挂失';
  if (GUIDE_HOLDING) return '持仓管理';
  if (GUIDE_SUB) return '订阅管理';
  if (GUIDE_FLOWER) return '鲜花订购';
  return '';
}

// 流程锁提示：当前流程没走完，不允许跳去别的功能 / 重新开一单
function guideFlowLockedNotice(extra) {
  var label = guideActiveFlowLabel() || '业务';
  appendMessage(guideMessage(
    '<p>正在' + label + '流程，请先完成本轮操作。</p>' +
    (extra ? '<p class="guide-tip">' + extra + '</p>' : '') +
    '<p class="guide-tip">如需退出，请回复「取消」。</p>'
  ));
  scrollToBottom();
}

// 会话步骤统一执行：步骤返回 false（表示没接住）时不交给主链路，而是提示先完成当前流程
function guideLockedRun(fn) {
  var r = fn();
  if (r && typeof r.then === 'function') {
    return r.then(function (v) {
      if (v === false) guideFlowLockedNotice();
      return true;
    });
  }
  if (r === false || r === undefined || r === null) guideFlowLockedNotice();
  return true;
}

// 「某度网盘年卡开一下自动续费 / 关闭某讯会员自动续费」→ 直接进管理自动续费
function guideIsSubRenewManagePhrase(t) {
  var s = String(t || '').trim();
  if (!s) return false;
  if (!/续费/.test(s)) return false;
  if (!/(开一下|开启|打开|恢复|关一下|关闭|关掉|管理|设置|调整)/.test(s)) return false;
  return /(会员|vip|VIP|年卡|月卡|季卡|包年|包月|自动续费|某易云|易云|网易云|某讯|腾讯|某度|百度|网盘)/.test(s);
}
// 「某度网盘年卡不续费了」→ 关闭自动续费（订阅管理·管理自动续费）
function guideIsSubRenewOffPhrase(t) {
  var s = String(t || '').trim();
  if (!s) return false;
  if (!/续费/.test(s)) return false;
  return /(不续费|不想续费|不要续费|不打算续费|关闭续费|关掉续费|别续费|不用续费|不想再续|不自动续费|不再续费)/.test(s);
}
// 「我不想订阅某易云了 / 取消某讯会员」→ 直接进取消订阅并带上服务
function guideIsSubCancelPhrase(t) {
  var s = String(t || '').trim();
  if (!s) return false;
  if (!/(订阅|会员|vip|VIP|续费|某易云|易云|网易云|某讯|腾讯|某度|百度|网盘)/.test(s)) return false;
  return /(取消|退订|不订阅|不想订阅|不要订阅|不订了|不想要了|不想续费|不要续费|关闭续费|别订了)/.test(s);
}
// 「我想要添加订阅 / 开通个会员」这类没点名服务的说法 → 直接进添加订阅
function guideIsSubAddPlain(t) {
  var s = String(t || '').trim();
  if (!s) return false;
  if (/(取消|退订|关闭|不订|不要|不想)/.test(s)) return false;
  if (!/订阅/.test(s) && !/(开通|办理|订购).{0,3}会员/.test(s)) return false;
  return /(添加|增加|新增|加个|加一个|开通|办理|订购|订一个|订阅一个|来一个|办个|来个|想要|我想|我要)/.test(s);
}
// 「我想要订阅某易云年卡 / 订购某度网盘年卡」→ 直接进添加订阅，并把服务与周期解析出来
function guideIsSubAddPhrase(t) {
  var s = String(t || '').trim();
  if (!s) return false;
  if (/(取消|退订|关闭|停止|解约)/.test(s)) return false;
  if (!/(订阅|订购|开通|添加|买)/.test(s)) return false;
  return /(会员|vip|VIP|年卡|月卡|季卡|包年|包月|包季|某易云|易云|网易云|某讯|腾讯|某度|百度|网盘)/.test(s);
}
// 「我买了哪些产品 / 我持有几只基金」→ 看持仓管理，而不是产品推荐
function guideIsHoldingsQuery(t) {
  var s = String(t || '').trim();
  if (!s) return false;
  // 申购/买入/赎回这类是操作，不是查询
  if (/(申购|买入|追加|赎回|卖出|购买|下单)/.test(s) && !/(买了|买过|持有|哪些)/.test(s)) return false;
  if (/(持仓|持有中|我的持仓)/.test(s)) return true;
  if (/(买了|买过|买过什么|持有).{0,8}(产品|基金|理财|什么|哪些|几只|几个)/.test(s)) return true;
  if (/(我|我的).{0,6}(有哪些|有什么|买过|买了).{0,8}(产品|基金|理财)/.test(s)) return true;
  return false;
}
// 「我现在有哪些卡 / 我的卡片 / 几张卡」→ 直接列出卡片
function guideIsCardListQuery(t) {
  var s = String(t || '').trim();
  if (!/卡/.test(s)) return false;
  if (/(办|申请|挂失|冻结|解冻|注销|限额|限额|额度调整|调额|提额)/.test(s)) return false;
  return /(哪些|几张|什么|所有|全部|都有)/.test(s) && /(卡|信用卡)/.test(s) ||
    /^(我的卡片|查看卡片|看看卡片|我的信用卡|看看我的卡|查看我的卡片|查一下我的卡)$/.test(s);
}
// 「我要调我的信用卡额度 / 提额」这类说法 → 直接进入额度调整对话，而不是只展示额度信息
function guideIsCardLimitAdjustIntent(t) {
  var s = String(t || '');
  if (!/额度|提额/.test(s)) return false;
  if (!/(信用卡|卡片|卡|额度)/.test(s)) return false;
  return /(调|调整|提额|提高|提升|调高|调低|降低|增加|减少|申请调整|改)/.test(s);
}
// 「分析账单 / 看看账单 / 消费统计 / 账单报告」这类说法 → 直接弹出账单分析
function guideIsBillAnalysisIntent(t) {
  var s = String(t || '').trim();
  if (!/(账单|消费|收支|花销|流水)/.test(s)) return false;
  if (/^(账单|消费)$/.test(s)) return false;
  return /(分析|看看|看一下|看下|查看|查一下|查询|统计|报告|情况|健康|明细|画像|走势|趋势|结构)/.test(s) ||
    /^(消费统计|账单报告|账单分析|财务总览)$/.test(s);
}
// 一句话里既有转账动作又有时间说法（「明天下午5点，给张三转1000元」）→ 定时转账
function guideTimedPhraseIntent(t) {
  var s = String(t || '');
  if (!/(转给|转账|转帐|打钱|汇款|付款|转\s*\d|给.{1,6}转)/.test(s)) return false;
  return /(今天|明天|后天|大后天|下周|下个月|本周|上周|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|\d{1,2}\s*[点时]|\d{1,2}:\d{2}|上午|下午|晚上|中午|早上|凌晨|每月|每周|每天|每年)/.test(s);
}

// 一句话里出现 AA / 分摊 / 垫付 → AA 收款
function guideAAPhraseIntent(t) {
  var s = String(t || '');
  return /(aa|AA|Aa|分摊|平摊|垫付)/.test(s);
}
// 是否停在「最后一步的确认卡」上（等用户点按钮 / 填验证码）
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

// 确认卡上「允许打字」的内容：确认类 / 取消类 / 6 位验证码 / 鲜花确认卡的可改字段
function guideIsFinalActionText(text) {
  var t = String(text || '').trim();
  if (!t) return false;
  var plain = t.replace(/[吧呢啊呀。.!！?？,，\s]/g, '');
  if (/^(确认|确定|提交|提交申请|提交订单|确认执行|确认转账|确认添加|确认修改|确认设置|确认挂失|确认取消|执行|继续|是|好|好的|行|可以|ok|yes)$/i.test(plain)) return true;
  if (/^(取消|返回|退出|不|不要|算了|放弃|暂不执行|不执行)$/.test(plain)) return true;
  if (/^\d{6}$/.test(plain)) return true;   // 短信验证码
  if (/(改|换|地址|电话|手机号|花束|日期|时段|时间段|贺卡|留言|支付|信用卡|储蓄卡)/.test(t)) return true;
  return false;
}

// 打字取消「定时转账确认卡」（这类卡片由 transfer.js 管理）
function guideCancelPendingScheduled() {
  if (typeof window === 'undefined' || !window.__pendingScheduledTransfers) return false;
  var ids = Object.keys(window.__pendingScheduledTransfers);
  if (!ids.length) return false;
  ids.forEach(function (id) {
    delete window.__pendingScheduledTransfers[id];
    var card = document.getElementById(id);
    if (card) card.innerHTML = '<div class="bank-cancelled">已取消，未创建定时转账任务。</div>';
  });
  appendMessage(guideMessage('<p>已取消本次定时转账，未创建任务。</p>'));
  scrollToBottom();
  return true;
}
// 文本解析：服务名 / 子功能名 / 返回菜单，命中则接管，返回 true
function guideHandleText(text) {
  var t = String(text || '').trim().replace(/[。.!！?？,，\s]+$/g, '');
  if (!t) return false;

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

  // 流程锁预检：未完成流程里说到别的服务名，先挡下来
  if (guideActiveFlowLabel()) {
    var otherSvc = guideResolveService(t);
    if (otherSvc) {
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
      guideBackToMenu();
      return true;
    }
    if (guideResolveService(t)) { guideFlowLockedNotice(); return true; }
    if (guideServiceByKey('transfer') && guideServiceByKey('transfer').subs.some(function (x) { return x.label === t || (x.aliases || []).indexOf(t) !== -1; })) { guideFlowLockedNotice(); return true; }
    return guideLockedRun(function () { return guideAAStep(t); });
  }

  // 理财申购多轮收集进行中（风评 → 产品/金额 → 确认）
  if (GUIDE_WEALTH) {
    if (/^(取消|不做了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_WEALTH = null;
      guideBackToMenu();
      return true;
    }
    if (guideResolveService(t)) { guideFlowLockedNotice(); return true; }
    if (guideServiceByKey('wealth') && guideServiceByKey('wealth').subs.some(function (x) { return x.label === t || (x.aliases || []).indexOf(t) !== -1; })) { guideFlowLockedNotice(); return true; }
    return guideLockedRun(function () { return guideWealthStep(t); });
  }

  // 申请信用卡多轮收集进行中（卡种 / 额度 / 用途 → 确认）
  if (GUIDE_CARD_APPLY) {
    if (/^(取消|不办了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_CARD_APPLY = null;
      guideBackToMenu();
      return true;
    }
    if (guideResolveService(t)) { guideFlowLockedNotice(); return true; }
    if (guideServiceByKey('card') && guideServiceByKey('card').subs.some(function (x) { return x.label === t || (x.aliases || []).indexOf(t) !== -1; })) { guideFlowLockedNotice(); return true; }
    return guideLockedRun(function () { return guideCardApplyStep(t); });
  }

  // 信用卡额度调整申请进行中（目标额度 + 调整原因 → 确认）
  if (GUIDE_CARD_LIMIT) {
    if (/^(取消|不调了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_CARD_LIMIT = null;
      guideBackToMenu();
      return true;
    }
    if (guideResolveService(t)) { guideFlowLockedNotice(); return true; }
    if (guideServiceByKey('card') && guideServiceByKey('card').subs.some(function (x) { return x.label === t || (x.aliases || []).indexOf(t) !== -1; })) { guideFlowLockedNotice(); return true; }
    return guideLockedRun(function () { return guideCardLimitStep(t); });
  }

  // 持仓管理：追加申购 / 赎回进行中
  if (GUIDE_HOLDING) {
    // 只有「返回 / 菜单」才退出会话；「取消」交给流程本身，回「已取消，持仓保持不变。」
    if (/^(返回|菜单|返回菜单|退出)$/.test(t)) {
      GUIDE_HOLDING = null;
      guideBackToMenu();
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
      guideBackToMenu();
      return true;
    }
    return guideLockedRun(function () { return guideTxnLimitStep(t); });
  }

  // 卡片挂失进行中
  if (GUIDE_CARD_LOST) {
    if (/^(取消|不挂了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_CARD_LOST = null;
      guideBackToMenu();
      return true;
    }
    return guideLockedRun(function () { return guideCardLostStep(t); });
  }

  // 「某度网盘年卡开一下自动续费」→ 直接进管理自动续费并预选服务
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

  // 「某度网盘年卡不续费了」→ 关闭自动续费；句中指定了服务就直接出确认卡
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

  // 「我不想订阅某易云了」→ 直接进取消订阅并预选服务
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
      return guideLockedRun(function () { return guideCardApplyStep(t); });
    }
  }

  // 「我想要订阅某易云年卡」→ 直接进添加订阅并预填服务/周期
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

  // 去掉口语前缀，便于识别「我要转账」「帮我转账」
  var bare = t.replace(/^(我要|我想|我想用|帮我|我要用|使用)/, '');

  // ① 精确匹配：当前模块的子功能（模块内上下文，支持别名：产品 ↔ 产品申购、持仓 ↔ 持仓管理）
  var cur = guideServiceByKey(currentModule);
  if (cur) {
    var hitSub = cur.subs.filter(function (x) {
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
      guidePickSub(fuzzy.service.key, fuzzy.sub.key);
    } else {
      guideOpenService(fuzzy.service.key);
    }
    return true;
  }

  // ④ 明显是「想看某个功能」但本地没认出来 → AI 意图识别兜底
  if (guideIsMenuIntent(t)) {
    guideAIIntent(t);
    return true;
  }

  return false;
}

// 意图识别相关：去掉「想看 / 帮我 / 一下」等口语成分，只留下功能相关词
function guideNormalizeText(text) {
  return String(text || '').trim()
    .replace(/^(我想看一下|我想看看|我想看|我要看一下|我要看看|我要看|我想用|我要用|我想|我要|帮我|麻烦|请|看一下|看看|看下|查一下|查下|打开|进入|来一下)/, '')
    .replace(/(一下|的功能|功能|服务|模块|页面|界面|板块|吧|呢|啊|吗|，|,|。|！|!|\?|？|\s)/g, '')
    .replace(/个(?=账|账|钱|款)/g, '');   // 「转个账」→「转账」
}

// 只在「明显是打开某功能」的短句上做模糊匹配，避免劫持「给张三转100」这类业务指令
function guideIsMenuIntent(text) {
  var s = String(text || '').trim();
  if (!s) return false;
  if (/\d/.test(s)) return false;
  if (/(转账|转给|转\d)/.test(s)) return false;
  return /^(我想看|我要看|我想|我要|帮我|请|麻烦|看一下|看看|看下|查一下|查下|打开|进入|来一下|查|看)/.test(s);
}

var GUIDE_SERVICE_KEYWORDS = {
  transfer: ['转账', '汇款', '打钱', '转钱', '付款'],
  bill: ['账单', '消费', '统计', '收支', '花销', '流水'],
  card: ['卡片', '信用卡', '额度', '挂失', '办卡'],
  wealth: ['理财', '基金', '投资', '持仓', '收益', '风险评估'],
  life: ['生活', '订阅', '会员', '鲜花', '生日']
};

var GUIDE_SUB_KEYWORDS = {
  transfer: {
    name: ['姓名转账', '按姓名', '姓名'],
    phone: ['手机号转账', '手机号', '电话号'],
    timed: ['定时转账', '定时', '预约转账', '计划转账'],
    aa: ['AA收款', 'AA', '分摊', '收款']
  },
  bill: {
    overview: ['财务总览', '资产概览', '账单明细', '消费统计', '账单报告', '月报', '报告', '消费汇总', '统计'],
    abnormal: ['异常交易', '异常', '可疑交易']
  },
  card: {
    apply: ['卡片申请', '申请信用卡', '申请卡片', '办卡', '信用卡申请'],
    limit: ['额度调整', '调整额度', '调额', '额度'],
    txnlimit: ['交易限制', '交易限额', '限额'],
    lost: ['卡片挂失', '挂失', '冻结卡片']
  },
  wealth: {
    products: ['产品申购', '申购', '理财产品', '产品'],
    risk: ['风险评估', '风险测评', '测评'],
    holdings: ['持仓管理', '我的持仓', '持仓', '持有']
  },
  life: {
    subscribe: ['订阅管理', '订阅', '会员', '自动续费', '添加订阅', '取消订阅', '退订'],
    birthday: ['生日鲜花', '鲜花订购', '订花', '买花', '鲜花订单', '生日', '鲜花']
  }
};

// 关键词打分：命中子功能 → 直接进子功能；命中服务 → 进服务菜单；都没有 → null
function guideResolveIntent(text) {
  var norm = guideNormalizeText(text);
  if (!norm) return null;

  // 先看子功能关键词（长的优先，避免「额度」抢走「额度调整」）
  var best = null;
  for (var i = 0; i < GUIDE_SERVICES.length; i++) {
    var svc = GUIDE_SERVICES[i];
    var subs = GUIDE_SUB_KEYWORDS[svc.key] || {};
    for (var k in subs) {
      if (!Object.prototype.hasOwnProperty.call(subs, k)) continue;
      var words = subs[k];
      for (var w = 0; w < words.length; w++) {
        if (norm.indexOf(words[w]) !== -1) {
          var sub = svc.subs.filter(function (x) { return x.key === k; })[0];
          if (!sub) continue;
          var score = words[w].length;
          if (!best || score > best.score) best = { kind: 'sub', service: svc, sub: sub, score: score };
        }
      }
    }
  }
  if (best) return best;

  // 再看服务关键词
  for (var j = 0; j < GUIDE_SERVICES.length; j++) {
    var s2 = GUIDE_SERVICES[j];
    var kws = GUIDE_SERVICE_KEYWORDS[s2.key] || [];
    for (var m = 0; m < kws.length; m++) {
      if (norm.indexOf(kws[m]) !== -1) return { kind: 'service', service: s2 };
    }
  }
  return null;
}

// AI 意图识别兜底：本地规则没认出来时，让模型在固定清单里选一个
async function guideAIIntent(text) {
  var loadingId = 'guide-intent-' + Date.now();
  appendMessage('<div class="message" id="' + loadingId + '"><div class="msg-avatar ai">🤖</div>' +
    '<div class="msg-content"><div class="msg-name">AI Bank 助手</div>' +
    '<div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div></div></div>');
  scrollToBottom();

  var pick = null;
  try { pick = await guideAIIntentExtract(text); } catch (e) { pick = null; }
  var el = document.getElementById(loadingId);
  if (el) el.remove();

  if (pick) {
    var svc = guideServiceByKey(pick.service);
    if (svc) {
      if (pick.sub) {
        var sub = svc.subs.filter(function (x) { return x.key === pick.sub; })[0];
        if (sub) { guidePickSub(svc.key, sub.key); return; }
      }
      guideOpenService(svc.key);
      return;
    }
  }

  // 认不出就给菜单，并说明可以直接点按钮
  appendMessage(guideMessage('<p>没太听懂你想打开哪个功能。</p><p class="guide-tip">可以直接点下面的按钮，或输入功能名称，例如「账单分析」「转账」「理财」。</p>'));
  scrollToBottom();
  renderServiceWelcome();
}

async function guideAIIntentExtract(text) {
  if (typeof bankHasLLMKey === 'function' && !bankHasLLMKey()) return null;
  if (typeof DEEPSEEK_API_URL === 'undefined' || !DEEPSEEK_API_URL) return null;

  var catalog = GUIDE_SERVICES.map(function (s) {
    return s.key + '=' + s.label + '（子功能：' + s.subs.map(function (x) { return x.key + '=' + x.label; }).join('、') + '）';
  }).join('\n');

  var payload = {
    model: (typeof MODEL_NAME !== 'undefined' && MODEL_NAME) ? MODEL_NAME : 'deepseek-chat',
    temperature: 0,
    max_tokens: 80,
    messages: [
      { role: 'system', content: '你是银行 App 的意图分类器。只能从给定清单里选服务/子功能，选不出就返回空。只输出 JSON，不要解释。' },
      { role: 'user', content: '清单：\n' + catalog + '\n\n用户说：' + text + '\n\n输出 JSON：{"service":"服务key或空","sub":"子功能key或空"}' }
    ]
  };

  var resp = await bankFetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (typeof DEEPSEEK_API_KEY !== 'undefined' ? DEEPSEEK_API_KEY : '') },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) return null;
  var data = await resp.json();
  var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  var m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  var obj = null;
  try { obj = JSON.parse(m[0]); } catch (e) { return null; }
  if (!obj || !obj.service) return null;
  if (!guideServiceByKey(obj.service)) return null;
  return { service: obj.service, sub: obj.sub || '' };
}

// 按「服务名 + 别名」精确匹配一级服务（整词匹配，避免劫持自然语言指令）
function guideResolveService(name) {
  for (var i = 0; i < GUIDE_SERVICES.length; i++) {
    var s = GUIDE_SERVICES[i];
    var names = [s.label].concat(s.aliases || []);
    if (names.indexOf(name) !== -1) return s;
  }
  return null;
}

// ------------------------------ 转账槽位收集（姓名 / 手机号） ------------------------------
// 意图理解规则（每轮输入都按下面规则抽取槽位）：
//   ① 手机号：1 开头的 11 位数字串，先于金额识别，避免被当成金额；陌生号码后续会要求验证姓名；
//   ② 金额：阿拉伯数字（支持「万」），出现即视为金额；
//   ③ 收款人（仅姓名转账）：剔除金额与「给/向/转/元/块/请/我」等口语成分后，
//      优先精确匹配通讯录姓名；匹配不到但为 2-4 位中文，按自由收款人姓名处理。
// 流程：收齐槽位 → 询问是否需要备注（可选）→ 确认卡。
//   stage = 'slots'（收槽位）→ 'askRemark'（问备注）→ 'remark'（等备注内容）
var GUIDE_TRANSFER = null;

function guidePlainMoney(n) {
  var v = Number(n) || 0;
  return (Math.round(v) === v) ? String(v) : v.toFixed(2);
}

function guideStartNameTransfer() {
  guideResetAllSessions();
  GUIDE_TRANSFER = { kind: 'name', payee: null, phone: null, amount: null, remark: '', stage: 'slots' };
  currentModule = 'transfer';
  appendMessage(guideMessage(
    '<p>请问收款人和转账金额是多少？</p>' +
    '<p class="guide-tip">可以分开说，也可以一次说，例如「张三转 100」</p>'
  ));
  scrollToBottom();
}

function guideStartPhoneTransfer() {
  guideResetAllSessions();
  GUIDE_TRANSFER = { kind: 'phone', payee: null, phone: null, amount: null, remark: '', stage: 'slots' };
  currentModule = 'transfer';
  appendMessage(guideMessage(
    '<p>请问收款手机号和转账金额是多少？</p>' +
    '<p class="guide-tip">例如：13800138000 100</p>'
  ));
  scrollToBottom();
}

function guideStartTimedTransfer() {
  guideResetAllSessions();
  GUIDE_TRANSFER = {
    kind: 'timed', payee: null, phone: null, amount: null,
    date: null, time: null, repeat: '不重复', remark: '', stage: 'slots'
  };
  currentModule = 'transfer';
  appendMessage(guideMessage(
    '<p>请问收款人、转账金额和执行时间是多少？</p>' +
    '<p class="guide-tip">例如：张三，100，明天下午5点</p>'
  ));
  scrollToBottom();
}

// —— 定时转账的日期 / 时间 / 重复解析 ——
function guidePad2(n) { return (Number(n) < 10 ? '0' : '') + Number(n); }

function guideDateStr(d) {
  return d.getFullYear() + '-' + guidePad2(d.getMonth() + 1) + '-' + guidePad2(d.getDate());
}

function guideOffsetDate(days) {
  var d = new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return guideDateStr(d);
}

// month 为空表示「本月 D 号」，若已过则顺延到下月
function guideMonthDayDate(month, day) {
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

// 从一句话里抽日期 / 时间 / 重复方式，命中后从原句剔除，避免干扰金额与收款人
function guideTimedExtract(text) {
  var t = String(text || '');
  var out = { date: null, time: null, repeat: null, period: null };

  if (/每年|每年度|年度|年付/.test(t)) out.repeat = '每年';
  else if (/每个月|每月|月付/.test(t)) out.repeat = '每月';
  else if (/每个星期|每星期|每周|周付/.test(t)) out.repeat = '每周';
  else if (/每天|每日|日付/.test(t)) out.repeat = '每天';
  if (out.repeat) t = t.replace(/每年|每年度|年度|年付|每个月|每月|月付|每个星期|每星期|每周|周付|每天|每日|日付/g, ' ');

  // 时间：09:30 / 9点 / 下午3点半
  var tm = t.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (tm) {
    out.time = guidePad2(tm[1]) + ':' + guidePad2(tm[2]);
    t = t.replace(tm[0], ' ');
  } else {
    var zh = t.match(/(上午|下午|晚上|早上|中午)?\s*(\d{1,2})\s*点\s*(半)?/);
    if (zh) {
      var h = parseInt(zh[2], 10);
      out.period = zh[1] || null;
      if ((zh[1] === '下午' || zh[1] === '晚上') && h < 12) h += 12;
      if (zh[1] === '中午' && h < 11) h += 12;
      out.time = guidePad2(h) + ':' + (zh[3] ? '30' : '00');
      t = t.replace(zh[0], ' ');
    }
  }

  // 时间段：既支持「明天下午」这种只有时间段，也支持「下午 15:00」这种带钟点的说法
  if (!out.period) {
    var pd = t.match(/(凌晨|早上|上午|中午|下午|晚上)/);
    if (pd) {
      out.period = pd[1];
      if (!out.time) t = t.replace(pd[0], ' ');
    }
  }

  // 日期：YYYY-MM-DD / M月D日 / M-D / 明天 / 后天 / D号
  var ymd = t.match(/(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*[日号]?/);
  if (ymd) {
    out.date = ymd[1] + '-' + guidePad2(ymd[2]) + '-' + guidePad2(ymd[3]);
    t = t.replace(ymd[0], ' ');
  } else if (/大后天/.test(t)) {
    out.date = guideOffsetDate(3);
    t = t.replace(/大后天/g, ' ');
  } else if (/后天/.test(t)) {
    out.date = guideOffsetDate(2);
    t = t.replace(/后天/g, ' ');
  } else if (/明天|明日/.test(t)) {
    out.date = guideOffsetDate(1);
    t = t.replace(/明天|明日/g, ' ');
  } else if (/今天|今日/.test(t)) {
    out.date = guideOffsetDate(0);
    t = t.replace(/今天|今日/g, ' ');
  } else {
    var md = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
    var mdash = md ? null : t.match(/(\d{1,2})\s*[-/]\s*(\d{1,2})(?!\d)/);
    if (md && Number(md[1]) >= 1 && Number(md[1]) <= 12 && Number(md[2]) >= 1 && Number(md[2]) <= 31) {
      out.date = guideMonthDayDate(md[1], md[2]);
      t = t.replace(md[0], ' ');
    } else if (mdash && Number(mdash[1]) >= 1 && Number(mdash[1]) <= 12 && Number(mdash[2]) >= 1 && Number(mdash[2]) <= 31) {
      // 支持 10-30 / 10/30；注释里一直写着支持，之前实现漏了
      out.date = guideMonthDayDate(mdash[1], mdash[2]);
      t = t.replace(mdash[0], ' ');
    } else {
      var dd = t.match(/(\d{1,2})\s*[日号]/);
      if (dd) {
        out.date = guideMonthDayDate(null, dd[1]);
        t = t.replace(dd[0], ' ');
      }
    }
  }

  return { rest: t, date: out.date, time: out.time, repeat: out.repeat, period: out.period };
}

// 从一句话里抽收款人、手机号与金额（手机号先抽，避免 11 位数字被当成金额）
function guideTransferParse(text, kind) {
  var t = String(text || '').trim();

  var timedInfo = null;
  if (kind === 'timed') {
    timedInfo = guideTimedExtract(t);
    t = timedInfo.rest;
  }

  var phone = null;
  var pm = t.match(/1\d{10}/);
  if (pm) {
    phone = pm[0];
    t = t.replace(pm[0], ' ');
  }

  var amount = null;
  var phoneLike = '';
  // 负号开头的数字不当作金额（避免「转-100」变成 +100）
  var negativeAmount = /[-负]\s*\d/.test(t);
  // 一句话里有多个数字时取「最后一个」当金额：手机号在前、金额在后（如「1300 200」→ 200）
  var nums = [];
  var numRe = /(\d[\d,]*(?:\.\d+)?)\s*(亿|万|w|W|千|k|K)?/g;
  var nm;
  while ((nm = numRe.exec(t)) !== null) {
    nums.push({ text: nm[0], value: nm[1], unit: nm[2], prefix: t.slice(0, nm.index) });
    if (nm[0].length === 0) numRe.lastIndex += 1;
  }
  if (nums.length) {
    var looksPhone = function (v) { return /^1\d{3,10}$/.test(String(v).replace(/,/g, '')); };
    // 谁是手机号碎片：紧跟在「到 / 给 / 向 / 手机号 / 号码」后面的数字
    var fragIdx = -1;
    for (var fi = nums.length - 1; fi >= 0; fi--) {
      if (looksPhone(nums[fi].value) && /(到|给|向|手机号?|号码|电话)\s*$/.test(nums[fi].prefix || '')) { fragIdx = fi; break; }
    }
    // 没有明确前缀时：最后一个像手机号、倒数第二个不像 → 最后一个是碎片
    if (fragIdx === -1 && nums.length >= 2 &&
      looksPhone(nums[nums.length - 1].value) && !looksPhone(nums[nums.length - 2].value)) {
      fragIdx = nums.length - 1;
    }
    // 金额 = 除去碎片后的最后一个数字（「1300 200」→ 200；「转1000到1234」→ 1000）
    var amtIdx = -1;
    for (var ai = nums.length - 1; ai >= 0; ai--) {
      if (ai !== fragIdx) { amtIdx = ai; break; }
    }
    if (amtIdx === -1) amtIdx = nums.length - 1;
    var last = nums[amtIdx];
    amount = parseFloat(last.value.replace(/,/g, ''));
    if (last.unit === '亿') amount *= 100000000;
    else if (last.unit === '万' || last.unit === 'w' || last.unit === 'W') amount *= 10000;
    else if (last.unit === '千' || last.unit === 'k' || last.unit === 'K') amount *= 1000;
    if (!(amount > 0) || negativeAmount) amount = null;
    t = t.replace(last.text, ' ');
    // 剩下的数字如果像「位数不足的手机号」，记下来提示用户
    var leftovers = nums.filter(function (x, i) { return i !== amtIdx; })
      .map(function (x) { return x.value.replace(/,/g, ''); });
    var maybePhone = leftovers.filter(function (x) { return /^1\d{3,9}$/.test(x); })[0];
    if (!phone && maybePhone) phoneLike = maybePhone;
  }
  var rest = t
    .replace(/转账|转帐|转|给|向|帮|请|我|你|人民币|元|块|钱|是|吧|呢|，|,|。|、/g, '')
    .replace(/[就他她它点些啊嘛呀哈嗯]/g, '')
    .replace(/\s+/g, '');

  var payee = null;
  var unknownName = '';
  if (rest) {
    var contact = (mockData.contacts || []).filter(function (c) {
      return c.name && rest.indexOf(c.name) !== -1;
    })[0];
    if (contact) payee = contact.name;
    else if (/^[\u4e00-\u9fa5·]{2,4}$/.test(rest)) unknownName = rest;
  }
  return {
    payee: payee,
    unknownName: unknownName,
    phone: phone,
    phoneLike: phoneLike,
    amount: amount,
    date: timedInfo ? timedInfo.date : null,
    time: timedInfo ? timedInfo.time : null,
    repeat: timedInfo ? timedInfo.repeat : null,
    period: timedInfo ? timedInfo.period : null
  };
}

// 姓名转账只允许转给通讯录联系人
function guideIsContact(name) {
  return (mockData.contacts || []).some(function (c) { return c.name === name; });
}

function guideContactNames() {
  return (mockData.contacts || []).map(function (c) {
    return (typeof escapeHtml === 'function') ? escapeHtml(c.name) : c.name;
  }).join('、') || '暂无联系人';
}

function guideUnknownPayeeNotice(name) {
  var n = (typeof escapeHtml === 'function') ? escapeHtml(name) : name;
  appendMessage(guideMessage(
    '<p>「<b>' + n + '</b>」不在通讯录里。姓名转账只支持通讯录联系人：' + guideContactNames() + '。</p>' +
    '<p class="guide-tip">可以改用手机号转账，或先在「联系人」中新增后再试。</p>'
  ));
  scrollToBottom();
}

// 这句话像不像「再转一笔」的转账指令（用于流程锁：不能被当成备注吞掉）
function guideLooksLikeNewTransfer(text) {
  var t = String(text || '').trim();
  if (!t) return false;
  var hasAmount = /\d/.test(t) || /[一二三四五六七八九十百千万两]+\s*(元|块)/.test(t);
  var hasTransferWord = /(转给|转账|汇款|打钱|转\s*\d|再转|付给|给.+转)/.test(t);
  return hasAmount && hasTransferWord;
}
// 确认卡收尾工具：完成就移除按钮并补状态行；取消就把整块折叠成一行
function guideConfirmCardDone(boxId, statusText) {
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

function guideConfirmCardCollapse(boxId, text) {
  var box = boxId ? document.getElementById(boxId) : null;
  if (box) { box.innerHTML = '<p>' + text + '</p>'; return true; }
  return false;
}
// 备注阶段统一处理（即时转账 / 定时转账共用）：
// 问「是否需要添加备注？」时认「是 / 否」，其它文字直接当备注内容；等备注内容时这一句就是备注
function guideTransferHandleRemarkStage(text) {
  var s = GUIDE_TRANSFER;
  if (!s) return false;
  if (s.stage !== 'askRemark' && s.stage !== 'remark') return false;
  var raw = String(text || '').trim();
  var plain = raw.replace(/[吧呢啊呀。.!！?？,，\s]/g, '');

  // 已经在等备注内容
  if (s.stage === 'remark') {
    if (/^(不用了|不加了|不要了|取消备注|跳过)$/.test(plain)) {
      s.remark = '';
      guideCommitTransfer();
      return true;
    }
    if (guideLooksLikeNewTransfer(raw)) {
      guideFlowLockedNotice('正在等你的备注内容：请直接写备注，或回复「不用了」跳过。');
      return true;
    }
    s.remark = raw;
    guideCommitTransfer();
    return true;
  }

  // 问「是否需要添加备注？」：严格先判断是 / 否
  var yesRe = /^(需要|要|用|是|对|是的|是滴|好|好的|行|可以|加|添加|备注|加个备注|写备注|要备注|加上|yes|y|yeah|ok|okay)$/i;
  var noRe = /^(不用|不需要|不要|不|否|不是|不用了|不写|不加|跳过|没有|算了|no|n|nope)$/i;
  if (yesRe.test(plain)) {
    s.stage = 'remark';
    guideChipsDone(s.remarkBoxId, '是否添加备注：是');
    appendMessage(guideMessage('<p>请输入备注内容</p><p class="guide-tip">例如：房租 / 还款 / AA（最多 20 字）</p>'));
    scrollToBottom();
    return true;
  }
  if (noRe.test(plain)) {
    s.remark = '';
    guideChipsDone(s.remarkBoxId, '是否添加备注：否');
    guideCommitTransfer();
    return true;
  }
  if (guideLooksLikeNewTransfer(raw)) {
    guideFlowLockedNotice('当前这笔转账还没走完：请回复「是」或「否」继续。');
    return true;
  }
  // 既不是是也不是否 → 把「是否需要添加备注？」卡片再弹一次
  guideTransferAskRemark();
  return true;
}



function guideTransferStep(text) {
  var t = String(text || '').trim();
  if (/^(取消|不转了|算了|退出|返回|菜单)$/.test(t)) {
    GUIDE_TRANSFER = null;
    guideBackToMenu();
    return true;
  }

  // 备注阶段（两种转账共用）：优先按备注处理，避免「还信用卡」这类被闲聊锁拦下
  if (guideTransferHandleRemarkStage(text)) return true;

  var bare = t.replace(/^(我要|我想|我想用|帮我|我要用|使用)/, '');

  // 流程锁：转账没走完之前，说别的服务 / 子功能都要先完成这次转账
  if (guideResolveService(bare)) {
    guideFlowLockedNotice();
    return true;
  }
  var transferSvc = guideServiceByKey('transfer');
  var subHit = transferSvc && transferSvc.subs.some(function (x) {
    return x.label === bare || (x.aliases || []).indexOf(bare) !== -1;
  });
  if (subHit) {
    guideFlowLockedNotice();
    return true;
  }

  // 流程锁：别的业务 / 闲聊也不放行，避免一次转账没完成就跳走
  if (/(余额|账单|理财|基金|持仓|订阅|信用卡|额度|挂失|预算|鲜花|生日|安全|你好|您好|谢谢|再见|能做什么|怎么用|什么意思|为什么)/.test(t)) {
    guideFlowLockedNotice();
    return true;
  }

  // 定时转账走独立的多轮流程（收款人 / 金额 / 执行时间 → 重复方式 → 确认）
  if (GUIDE_TRANSFER && GUIDE_TRANSFER.kind === 'timed') {
    return guideLockedRun(function () { return guideTimedStep(t); });
  }

  if (!GUIDE_TRANSFER) {
    GUIDE_TRANSFER = { kind: 'name', payee: null, phone: null, amount: null, remark: '', stage: 'slots' };
  }
  var s = GUIDE_TRANSFER;

  // ① 等备注内容：这一句就是备注；但如果明显是「再转一笔」的指令，锁住并要求先完成
  if (s.stage === 'remark') {
    if (guideLooksLikeNewTransfer(t)) {
      guideFlowLockedNotice('正在等你的备注内容：请直接写备注，或回复「不用了」跳过。');
      return true;
    }
    s.remark = t;
    guideCommitTransfer();
    return true;
  }

  // ② 手机号转账：陌生号码需要先验证收款人姓名
  if (s.stage === 'verifyName') {
    var typed = t.replace(/[，,。.、\s]/g, '');
    if (!typed || typed.length > 20 || /^\d+$/.test(typed)) {
      appendMessage(guideMessage('<p>请填写收款人姓名（2-20 个字符，不能是纯数字）</p>'));
      scrollToBottom();
      return true;
    }
    s.payee = typed;
    guideTransferAskRemark();
    return true;
  }

  // ③ 问备注阶段：识别「是 / 否」，其它输入直接当备注内容
  if (s.stage === 'askRemark') {
    if (/^(需要|要|好的|好|是|对|是的|加|添加|备注|加个备注|写备注|要备注)$/.test(bare)) {
      s.stage = 'remark';
      appendMessage(guideMessage('<p>请输入备注内容</p><p class="guide-tip">例如：房租 / 还款 / AA（最多 20 字）</p>'));
      scrollToBottom();
      return true;
    }
    if (/^(不用|不需要|不要|不|否|不是|跳过|没有|不用了|不写|不加)$/.test(bare)) {
      s.remark = '';
      guideCommitTransfer();
      return true;
    }
    if (guideLooksLikeNewTransfer(t)) {
      guideFlowLockedNotice('当前这笔转账还没走完：请回复「是」或「否」继续。');
      return true;
    }
    s.remark = t;
    guideCommitTransfer();
    return true;
  }

  // ④ 收槽位阶段
  var parsed = guideTransferParse(t, s.kind);

  // 姓名转账：非通讯录姓名直接提示，不进入槽位
  if (s.kind === 'name' && !parsed.payee && parsed.unknownName) {
    guideUnknownPayeeNotice(parsed.unknownName);
    return true;
  }

  if (parsed.phone) s.phone = parsed.phone;
  if (parsed.payee) s.payee = parsed.payee;
  if (parsed.amount != null && parsed.amount > 0) s.amount = parsed.amount;

  var hasTarget = s.kind === 'phone' ? !!s.phone : !!s.payee;
  if (hasTarget && s.amount > 0) {
    if (s.kind === 'phone') {
      guidePhoneResolvePayee();
    } else {
      guideTransferAskRemark();
    }
    return true;
  }

  // 本地没抽全：中文数字（一百 / 一万五 / 两百块）或两个槽位都没抽到 → AI 兜底
  // 注意：单个数字字（如「张三」里的「三」）不算中文数字，避免把姓名误判为金额
  var hasCnNumber = /[一二三四五六七八九十百千万两]{2,}|[一二三四五六七八九十百千万两]+(?=\s*(?:元|块|万|千|百|钱))/.test(t);
  if ((!parsed.payee && !parsed.phone && parsed.amount == null) || hasCnNumber) {
    guideTransferAIFallback(t);
    return true;
  }

  // 缺什么问什么（姓名 / 手机号）
  if (s.kind === 'phone') {
    if (s.phone) { appendMessage(guideMessage('<p>麻烦告诉我转账金额</p>')); scrollToBottom(); return true; }
    if (s.amount > 0) {
      var phoneTip = parsed.phoneLike
        ? '<p class="guide-tip">「' + parsed.phoneLike + '」位数不足 11 位，没有当作手机号；金额已按 ' + s.amount + ' 元记录。</p>'
        : '';
      appendMessage(guideMessage('<p>请问收款手机号是多少？</p>' + phoneTip));
      scrollToBottom();
      return true;
    }
    if (parsed.phoneLike) {
      appendMessage(guideMessage('<p>请提供 11 位收款手机号和转账金额。</p>' +
        '<p class="guide-tip">「' + parsed.phoneLike + '」位数不足 11 位，没有当作手机号。</p>'));
      scrollToBottom();
      return true;
    }
    appendMessage(guideMessage('<p>请问收款手机号和转账金额是多少？</p>'));
    scrollToBottom();
    return true;
  }
  if (s.payee) {
    appendMessage(guideMessage('<p>麻烦告诉我转账金额</p>'));
    scrollToBottom();
    return true;
  }
  if (s.amount > 0) {
    appendMessage(guideMessage('<p>请问要转给谁？</p>'));
    scrollToBottom();
    return true;
  }

  // 理论上不会到这里，保底追问
  guideTransferAIFallback(t);
  return true;
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
function guideTransferTargetLabel() {
  var s = GUIDE_TRANSFER;
  if (!s) return '';
  if (s.kind === 'phone') {
    if (s.payee && s.phone) return s.payee + '（' + s.phone + '）';
    return s.payee || s.phone || '';
  }
  return s.payee || '';
}

// 时间段模糊时的追问：只说了「明天下午」就再问「下午几点」
function guidePeriodQuestion(period, date) {
  var label = { '凌晨': '凌晨', '早上': '早上', '上午': '上午', '中午': '中午', '下午': '下午', '晚上': '晚上' }[period] || period;
  return '<p>请问 ' + (date ? (date + ' ') : '') + label + '几点执行？</p>' +
    '<p class="guide-tip">例如：3点 / 15:00（只给「' + label + '」不写具体钟点没法创建定时转账）</p>';
}

// 槽位齐了：先确认一次信息，再问是否需要备注
// 问备注：只问一句「是否需要添加备注？」，不再回述「已记录：向 X 转账 Y 元」
function guideTransferAskRemark() {
  var s = GUIDE_TRANSFER;
  if (!s) return;
  s.stage = 'askRemark';
  s.remarkBoxId = 'transfer-remark-' + Date.now();
  appendMessage(guideMessage(
    '<div id="' + s.remarkBoxId + '">' +
    '<p>是否需要添加备注？</p>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideTransferRemarkChoice(true)">是</button>' +
    '<button class="guide-chip" onclick="guideTransferRemarkChoice(false)">否</button>' +
    '</div></div>'
  ));
  scrollToBottom();
}

function guideTransferRemarkChoice(need) {
  var s = GUIDE_TRANSFER;
  if (!s) return;
  if (typeof guideChipsDone === 'function') guideChipsDone(s.remarkBoxId, '是否添加备注：' + (need ? '是' : '否'));
  if (need) {
    s.stage = 'remark';
    appendMessage(guideMessage('<p>请输入备注内容</p><p class="guide-tip">例如：房租 / 还款 / AA（最多 20 字）</p>'));
    scrollToBottom();
  } else {
    s.remark = '';
    guideCommitTransfer();
  }
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

// 定时转账确认：先回述一句，再交给既有的定时转账确认卡（含短信验证码）
// ------------------------------ 定时转账：3 槽位 + 重复方式 ------------------------------
// 目标字段：收款人 / 金额 / 执行时间；三样齐了再问「是否重复」，最后出确认卡。
// 缺字段时按缺失组合给出不同问句，避免每次都从第一个字段重新问。

function guideTimedMissingPrompt(s) {
  var missPayee = !s.payee;
  var missAmount = !(Number(s.amount) > 0);
  var missDate = !s.date;
  var missTime = !s.time;

  if (missPayee && missAmount && (missDate || missTime)) return '请问收款人、转账金额和执行时间是多少？';
  if (!missPayee && missAmount && (missDate || missTime)) return '麻烦告诉转账金额和执行时间是多少';
  if (missPayee && !missAmount && (missDate || missTime)) return '麻烦告诉收款人和执行时间是多少';
  if (missPayee && missAmount) return '麻烦告诉收款人和转账金额是多少';
  // 只差日期：时间已经记下了，别再反复要时间
  if (missDate && !missTime) return '请问执行日期是哪天？（今天 / 明天 / 具体日期；时间已记为 ' + s.time + '）';
  // 只差钟点
  if (!missDate && missTime) return '请问几点执行？（例如：15:00）';
  if (missDate && missTime) return '麻烦告诉我执行时间是多少（如「明天下午5点」）';
  if (missAmount) return '麻烦告诉我转账金额是多少';
  if (missPayee) return '麻烦告诉我收款人是多少';
  return '请问收款人、转账金额和执行时间是多少？';
}

function guideTimedParseRepeat(text) {
  var s = String(text || '').trim();
  if (/^(否|不|不用|不需要|无|没有|不重复|单次|只转一次|一次)$/.test(s)) return '不重复';
  if (/每年|年度|年付/.test(s)) return '每年';
  if (/每月|月度|月付/.test(s)) return '每月';
  if (/每周|每星期|周付/.test(s)) return '每周';
  if (/每天|每日|日付/.test(s)) return '每天';
  return null;
}

function guideTimedRepeatLabel(repeat) {
  return ({ '每天': '每日循环执行', '每周': '每周循环执行', '每月': '每月循环执行', '每年': '每年循环执行' })[repeat] || '不重复';
}

// 把日期 + 时间拼成口语化文案：明天下午5点 / 10月30日上午9点
function guideTimedWhenText(date, time) {
  if (!date || !time) return '';
  var today = guideOffsetDate(0);
  var tomorrow = guideOffsetDate(1);
  var after = guideOffsetDate(2);
  var dayLabel;
  if (date === today) dayLabel = '今天';
  else if (date === tomorrow) dayLabel = '明天';
  else if (date === after) dayLabel = '后天';
  else {
    var parts = String(date).split('-');
    dayLabel = Number(parts[1]) + '月' + Number(parts[2]) + '日';
  }

  var h = parseInt(String(time).slice(0, 2), 10);
  var m = String(time).slice(3, 5);
  var clock;
  if (h < 6) clock = '凌晨' + (h === 0 ? 12 : h) + '点';
  else if (h < 12) clock = '上午' + h + '点';
  else if (h === 12) clock = '中午12点';
  else if (h < 18) clock = '下午' + (h - 12) + '点';
  else clock = '晚上' + (h - 12) + '点';
  if (m !== '00') clock += m + '分';
  return dayLabel + clock;
}

async function guideTimedStep(text) {
  var t = String(text || '').trim();
  var s = GUIDE_TRANSFER;
  if (!s) return true;
  // 备注阶段交给统一处理（是 / 否 / 直接写备注）
  if (guideTransferHandleRemarkStage(t)) return true;

  // 重复方式阶段：本地先认，认不出交给模型理解（「一直」「按月来」等）
  if (s.stage === 'repeat') {
    var rep = guideTimedParseRepeat(t);
    if (!rep) {
      var aiRep = await guideTimedAIExtract(t);
      if (GUIDE_TRANSFER !== s) return true;
      rep = aiRep && aiRep.repeat ? aiRep.repeat : null;
    }
    if (!rep) {
      guideTimedAskRepeat('');
      return true;
    }
    s.repeat = rep;
    if (typeof guideChipsDone === 'function') guideChipsDone(s.repeatBoxId, '重复方式：' + rep);
    guideTransferAskRemark();
    return true;
  }

  // 槽位阶段
  var parsed = guideTransferParse(t, 'timed');

  // 本地没抽到日期/时间/重复（如「下周三」「月底下午三点」「一直」）→ 交给模型解析
  if (!parsed.date || !parsed.time || !parsed.repeat || !parsed.period) {
    var aiTime = await guideTimedAIExtract(t);
    if (GUIDE_TRANSFER !== s) return true;
    if (aiTime) {
      // 只有这句话本身提到日期时，才采用模型补的日期；
      // 否则（如只回「3点」）模型可能把日期填成「今天」，会把上一轮已经确认的「明天」冲掉。
      var saysDate = /(今天|明天|后天|大后天|下周|下个?周|周[一二三四五六日天]|星期[一二三四五六日天]|月底|月初|下月|明年|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|\d{1,2}\s*[日号]|\d{4}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2})/.test(t);
      if (!parsed.date && aiTime.date && (saysDate || !s.date)) parsed.date = aiTime.date;
      if (!parsed.time && aiTime.time) parsed.time = aiTime.time;
      if (!parsed.period && aiTime.period) parsed.period = aiTime.period;
      if (!parsed.repeat && aiTime.repeat) parsed.repeat = aiTime.repeat;
      // 「下周三」「月底」这类时间说法会被本地误当成收款人，模型识别出时间后要撤销这个误判
      if ((aiTime.date || aiTime.time || aiTime.period) && parsed.unknownName &&
        /(周|星期|月|号|日|点|点|分|今天|明天|后天|上午|下午|晚上|中午|早上)/.test(parsed.unknownName)) {
        parsed.unknownName = '';
      }
    }
  }

  if (!parsed.payee && parsed.unknownName) {
    guideUnknownPayeeNotice(parsed.unknownName);
    return true;
  }

  if (parsed.payee) s.payee = parsed.payee;
  if (parsed.amount != null && parsed.amount > 0) s.amount = parsed.amount;
  if (parsed.date) s.date = parsed.date;
  if (parsed.time) s.time = parsed.time;
  if (parsed.period) s.period = parsed.period;

  // 先只说「下午」再补「3点」→ 按时间段换算成 15:00；
  // 如果本次已经明确说「上午9点」，parsed.period='上午' 会覆盖上一轮残留的「下午」。
  if (s.time && s.period) {
    var hh = parseInt(String(s.time).slice(0, 2), 10);
    if ((s.period === '下午' || s.period === '晚上') && hh < 12) {
      s.time = guidePad2(hh + 12) + String(s.time).slice(2);
    } else if (s.period === '中午' && hh < 11) {
      s.time = guidePad2(hh + 12) + String(s.time).slice(2);
    }
    s.period = null;
  }

  // 有日期没钟点（如「明天下午」）→ 追问具体钟点
  if (s.date && !s.time && s.period) {
    appendMessage(guideMessage(guidePeriodQuestion(s.period, s.date)));
    scrollToBottom();
    return true;
  }

  if (s.payee && Number(s.amount) > 0 && s.date && s.time) {
    guideTimedAskRepeat('');
    return true;
  }

  appendMessage(guideMessage('<p>' + guideTimedMissingPrompt(s) + '</p>'));
  scrollToBottom();
  return true;
}

function guideTimedConfirm() {
  var s = GUIDE_TRANSFER;
  if (!s) return;
  var info = (mockData.contacts || []).filter(function (c) { return c.name === s.payee; })[0];
  var task = {
    payee: s.payee,
    account: info ? (info.account || '') : '',
    amount: s.amount,
    date: s.date,
    time: s.time || '09:00',
    repeat: s.repeat || '不重复',
    remark: s.remark || '',
    channel: '对话'
  };
  var err = (typeof schedValidationError === 'function') ? schedValidationError(task) : '';
  if (err) {
    appendMessage(guideMessage('<p>⚠️ ' + ((typeof escapeHtml === 'function') ? escapeHtml(err) : err) + '</p>'));
    scrollToBottom();
    s.stage = 'slots';
    s.date = null;
    s.time = null;
    s.period = null;
    appendMessage(guideMessage('<p>' + guideTimedMissingPrompt(s) + '</p>'));
    scrollToBottom();
    return;
  }

  GUIDE_TRANSFER = null;
  currentModule = 'transfer';
  var whenText = guideTimedWhenText(task.date, task.time);
  var payee = (typeof escapeHtml === 'function') ? escapeHtml(task.payee) : task.payee;

  appendMessage(guideMessage(
    '<p>确认定时向 <b>' + payee + '</b> 转账 <b>' + guidePlainMoney(s.amount) + ' 元</b>，' +
    '执行时间：' + whenText + '，' + guideTimedRepeatLabel(task.repeat) + '，请确认</p>'
  ));
  scrollToBottom();
  if (typeof openScheduledTransferConfirm === 'function') {
    openScheduledTransferConfirm(task, { okLabel: '确认定时转账' });
  }
}

// ------------------------------ AI 兜底 ------------------------------
// 本地正则只能认「张三 100」这类规整输入；遇到「帮我转一百块给张三」「就打给老王吧，两百」
// 这类说法，交给模型抽槽位；无 Key / 请求失败时降级为示例引导，不阻塞对话。
async function guideTransferAIExtract(text, session) {
  if (typeof bankHasLLMKey === 'function' && !bankHasLLMKey()) return null;
  if (typeof DEEPSEEK_API_URL === 'undefined' || !DEEPSEEK_API_URL) return null;
  var known = '已知收款人=' + (session.payee || '未知') + '；已知手机号=' + (session.phone || '未知') + '；已知金额=' + (session.amount || '未知');
  var resp = await bankFetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + DEEPSEEK_API_KEY },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        {
          role: 'system',
          content: '你是银行转账助手的槽位抽取器。只输出 JSON，不要解释，不要 markdown。' +
            '中文数字必须转成阿拉伯数字：一百→100，一千二→1200，一万五→15000。'
        },
        {
          role: 'user',
          content: '任务：从用户最新一句话里抽取「收款人」「收款手机号」和「转账金额」。' + known + '。\n' +
            '输出格式：{"payee":"姓名，没有就空字符串","phone":"11 位手机号，没有就空字符串","amount":数字，没有就0,"reply":"仅当这句话与转账无关时，给一句 20 字内的简短回复"}\n' +
            '用户最新一句：' + text
        }
      ],
      temperature: 0,
      max_tokens: 200,
      stream: false
    })
  });
  if (!resp.ok) return null;
  var data = await resp.json();
  var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  var m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

async function guideTransferAIFallback(text) {
  var s = GUIDE_TRANSFER || (GUIDE_TRANSFER = { kind: 'name', payee: null, phone: null, amount: null, remark: '', stage: 'slots' });
  var loadingId = 'guide-ai-' + Date.now();
  appendMessage('<div class="message" id="' + loadingId + '"><div class="msg-avatar ai">🤖</div>' +
    '<div class="msg-content"><div class="msg-name">AI Bank 助手</div>' +
    '<div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div></div></div>');
  scrollToBottom();

  var parsed = null;
  try { parsed = await guideTransferAIExtract(text, s); } catch (e) { parsed = null; }
  var el = document.getElementById(loadingId);
  if (el) el.remove();
  // 异步返回时用户可能已经取消/切换到别的流程，旧结果不能再写入会话
  if (GUIDE_TRANSFER !== s) return true;

  var payee = parsed && parsed.payee ? String(parsed.payee).trim() : '';
  var phone = parsed && parsed.phone ? String(parsed.phone).trim() : '';
  var amount = parsed && parsed.amount ? Number(parsed.amount) : 0;

  // 姓名转账：模型抽出的收款人也必须在通讯录里
  if (payee && s.kind === 'name' && !guideIsContact(payee)) {
    guideUnknownPayeeNotice(payee);
    return;
  }
  if (payee) s.payee = payee;
  if (phone) s.phone = phone;
  if (amount > 0) s.amount = amount;

  var aiTag = parsed ? '<span class="guide-ai-tag">AI 理解</span> ' : '';
  var hasTarget = s.kind === 'phone' ? !!s.phone : !!s.payee;
  if (hasTarget && s.amount > 0) {
    if (s.kind === 'timed') {
      // 定时转账：AI 只补齐收款人/金额，时间与重复仍按对话规则继续追问
      if (s.date && s.time) {
        guideTimedAskRepeat(aiTag);
      } else {
        appendMessage(guideMessage('<p>' + aiTag + guideTimedMissingPrompt(s) + '</p>'));
      }
      scrollToBottom();
    } else if (s.kind === 'phone') {
      guidePhoneResolvePayee();
    } else {
      guideTransferAskRemark();
    }
    return;
  }
  if (s.kind === 'phone') {
    if (s.phone) {
      appendMessage(guideMessage('<p>' + aiTag + '麻烦告诉我转账金额</p>'));
    } else if (s.amount > 0) {
      appendMessage(guideMessage('<p>' + aiTag + '请问收款手机号是多少？</p>'));
    } else {
      var reply = parsed && parsed.reply ? String(parsed.reply) : '';
      appendMessage(guideMessage('<p>' + (reply || '没太听懂。可以直接说手机号和金额，例如「13800138000 100」。') + '</p>' +
        '<p class="guide-tip">例如：13800138000 100</p>'));
    }
  } else if (s.payee) {
    appendMessage(guideMessage('<p>' + aiTag + '麻烦告诉我转账金额</p>'));
  } else if (s.amount > 0) {
    appendMessage(guideMessage('<p>' + aiTag + '请问要转给谁？</p>'));
  } else {
    var reply2 = parsed && parsed.reply ? String(parsed.reply) : '';
    appendMessage(guideMessage('<p>' + (reply2 || '没太听懂。可以直接说收款人和金额，例如「张三 100」。') + '</p>' +
      '<p class="guide-tip">例如：张三 100 / 张三转 100 / 给李雷转 1.5 万</p>'));
  }
  scrollToBottom();
}

// 槽位 + 备注都齐了：回述一句「确认向 X 转账 N 元」并出确认卡（强制确认，T1 也先确认）
function guideTransferConfirm() {
  var s = GUIDE_TRANSFER;
  if (!s) return;
  GUIDE_TRANSFER = null;
  currentModule = 'transfer';

  var isPhone = s.kind === 'phone';
  var target = isPhone ? (s.payee || s.phone || '') : (s.payee || '');
  var channel = isPhone ? '手机号转账' : '网银转账';
  var label = s.kind === 'phone' && s.payee && s.phone ? (s.payee + '（' + s.phone + '）') : target;
  var name = (typeof escapeHtml === 'function') ? escapeHtml(label) : label;
  var remark = String(s.remark || '').trim();
  var remarkHtml = remark ? '，备注：<b>' + ((typeof escapeHtml === 'function') ? escapeHtml(remark) : remark) + '</b>' : '';

  appendMessage(guideMessage(
    '<p>确认向 <b>' + name + '</b> 转账 <b>' + guidePlainMoney(s.amount) + ' 元</b>' + remarkHtml + '，请确认</p>'
  ));
  scrollToBottom();
  if (typeof agentTransferFlow === 'function') {
    agentTransferFlow(target, s.amount, '', channel, {
      forceConfirm: true,
      okLabel: '确认转账',
      remark: remark,
      phone: s.kind === 'phone' ? (s.phone || '') : ''
    });
  }
}

// ------------------------------ AA 收款：垫付总额 + 参与人名单 ------------------------------
// 规则：发起人（当前登录用户「我」）属于参与 AA 的一员；
//       输入垫付总额 + 除我之外的参与人名单；单人应付 = 总额 ÷（名单人数 + 1）。
// 名单可以一次给多个，也可以逐个补充；每次补充后都问「还有其他参与人吗？」直到「没有」。
// 重名联系人要求用户选择（① ② …）。
var GUIDE_AA = null;

function guideAAEsc(v) {
  return (typeof escapeHtml === 'function') ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v);
}

function guideStartAATransfer() {
  guideResetAllSessions();
  GUIDE_AA = { total: 0, participants: [], stage: 'slots', pendingNames: [], pickOptions: [] };
  currentModule = 'transfer';
  appendMessage(guideMessage('<p>请告诉我你垫付的总金额和除你外需要收款的参与人</p>'));
  scrollToBottom();
}

// 从一句话里抽垫付总额与名单
function guideAAParse(text) {
  // 先剔除手机号，否则「张三 13800138000」会把 11 位号码当成垫付总额
  var t = String(text || '').replace(/1\d{10}/g, ' ');
  var total = 0;
  var m = t.match(/(\d[\d,]*(?:\.\d+)?)\s*(亿|万|w|W|千|k|K)?/);
  if (m) {
    total = parseFloat(m[1].replace(/,/g, ''));
    var unit = m[2];
    if (unit === '亿') total *= 100000000;
    else if (unit === '万' || unit === 'w' || unit === 'W') total *= 10000;
    else if (unit === '千' || unit === 'k' || unit === 'K') total *= 1000;
    if (!(total > 0)) total = 0;
    t = t.replace(m[0], ' ');
  }
  t = t.replace(/垫付|总额|总金额|总|收款|收|元|块|钱|包括|包含|还有|参与人|名单|aa/gi, ' ');
  // 「张三和李四」这种并列先转成分隔符，再清掉「向 / 给 / 帮」这类引导词
  t = t.replace(/[和与跟及]/g, '、');
  t = t.replace(/^[\s、,，;；]*(向|给|帮|让|请|找)/, '');
  var names = t.split(/[、,，;；\s]+/)
    .map(function (x) { return x.trim().replace(/^(向|给|帮|让|请|找)/, '').replace(/[。.！!]$/, ''); })
    .filter(Boolean);
  return { total: total, names: names };
}

function guideAAPushParticipant(contact) {
  var s = GUIDE_AA;
  if (!s) return;
  var exists = s.participants.some(function (p) { return p.phone === contact.phone; });
  if (!exists) s.participants.push({ name: contact.name, phone: contact.phone });
}

// 逐个解析名单：唯一命中直接加入；重名进入选择；不在通讯录则提示
// 返回 true 表示这批名单已处理完，false 表示中途被打断（等待用户选择 / 补充）
function guideAAAddNames(names) {
  var s = GUIDE_AA;
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var matches = (mockData.contacts || []).filter(function (c) { return c.name === name; });
    if (matches.length === 0) {
      appendMessage(guideMessage(
        '<p>「<b>' + guideAAEsc(name) + '</b>」不在通讯录里。AA 收款只能选择通讯录联系人：' + guideContactNames() + '。</p>' +
        '<p class="guide-tip">可以继续告诉我其他人，或回复「没有」结束名单。</p>'
      ));
      scrollToBottom();
      return false;
    }
    if (matches.length === 1) {
      guideAAPushParticipant(matches[0]);
      continue;
    }
    // 重名：让用户选择
    s.pendingNames = names.slice(i + 1);
    s.pickOptions = matches;
    s.stage = 'pick';
    guideAAPickPrompt(name, matches);
    return false;
  }
  return true;
}

function guideAAPickPrompt(name, options) {
  var circled = '①②③④⑤⑥⑦⑧⑨';
  var items = options.map(function (c, i) {
    return '<button class="guide-chip" onclick="guideAAPick(' + i + ')">' + (circled.charAt(i) || (i + 1)) + ' ' +
      guideAAEsc(c.name) + '（' + guideAAEsc(c.phone || '') + '）</button>';
  }).join('');
  appendMessage(guideMessage(
    '<p>查询到 ' + options.length + ' 位【' + guideAAEsc(name) + '】，请选择你要收款的「' + guideAAEsc(name) + '」：</p>' +
    '<div class="guide-chips">' + items + '</div>'
  ));
  scrollToBottom();
}

function guideAAPick(index) {
  var s = GUIDE_AA;
  if (!s || s.stage !== 'pick') return;
  var contact = s.pickOptions[Number(index)];
  if (!contact) return;
  guideAAPushParticipant(contact);
  var rest = s.pendingNames || [];
  s.pickOptions = [];
  s.pendingNames = [];
  s.stage = 'slots';
  if (!guideAAAddNames(rest)) return;
  guideAAMore();
}

function guideAAMore() {
  var s = GUIDE_AA;
  if (!s) return;
  s.stage = 'askMore';
  appendMessage(guideMessage('<p>还有其他参与人吗？</p>'));
  scrollToBottom();
}

// 用户回答「没有」：缺金额就补问金额，否则直接出确认
function guideAANoMore() {
  var s = GUIDE_AA;
  if (!s) return;
  if (!(Number(s.total) > 0)) {
    s.stage = 'needAmount';
    appendMessage(guideMessage('<p>麻烦告诉我你垫付的总金额</p>'));
    scrollToBottom();
    return;
  }
  if (!s.participants.length) {
    s.stage = 'slots';
    appendMessage(guideMessage('<p>麻烦告诉我除你外需要收款的参与人</p>'));
    scrollToBottom();
    return;
  }
  guideAAConfirm();
}

function guideAAConfirm() {
  var s = GUIDE_AA;
  if (!s) return;
  s.stage = 'confirm';
  s.cardId = s.cardId || ('aa-confirm-' + Date.now());
  var splitCount = s.participants.length + 1;
  var per = s.total / splitCount;
  var names = s.participants.map(function (p) { return p.name; }).join('、');
  appendMessage(guideMessage(guideAAConfirmCardHtml(s, splitCount, per, names)));
  scrollToBottom();
}

// 一张卡片承载「确认 → 已发起」，取消按钮就在卡里
function guideAAConfirmCardHtml(s, splitCount, per, names) {
  return '<div class="data-card" id="' + s.cardId + '">' +
    '<div class="data-card-title">确认发起 AA 收款</div>' +
    '<div class="data-row"><span class="data-label">垫付总额</span><span class="data-value">¥' + guidePlainMoney(s.total) + '</span></div>' +
    '<div class="data-row"><span class="data-label">参与人数</span><span class="data-value">' + splitCount + ' 人（含我）</span></div>' +
    '<div class="data-row"><span class="data-label">收款名单</span><span class="data-value">' + guideAAEsc(names) + '</span></div>' +
    '<div class="data-row"><span class="data-label">每人应付</span><span class="data-value"><b>¥' + guidePlainMoney(per) + '</b></span></div>' +
    '<div class="data-row"><span class="data-label">当前状态</span><span class="data-value">待发起</span></div>' +
    '<div class="guide-chips" style="margin-top:10px;">' +
    '<button class="guide-chip" onclick="guideAASubmit()">发起AA收款</button>' +
    '<button class="guide-chip" onclick="guideAACancel()">取消</button>' +
    '</div>' +
    '</div>';
}

function guideAAConfirmDoneHtml(s, splitCount, per, names) {
  return '<div class="data-card-title">已发起 AA 收款</div>' +
    '<div class="data-row"><span class="data-label">每人应付</span><span class="data-value"><b>¥' + guidePlainMoney(per) + '</b></span></div>' +
    '<div class="data-row"><span class="data-label">垫付总额</span><span class="data-value">¥' + guidePlainMoney(s.total) + '</span></div>' +
    '<div class="data-row"><span class="data-label">参与人数</span><span class="data-value">' + splitCount + ' 人（含我）</span></div>' +
    '<div class="data-row"><span class="data-label">收款名单</span><span class="data-value">' + guideAAEsc(names) + '</span></div>' +
    '<div class="data-row"><span class="data-label">当前状态</span><span class="data-value" style="color:#B54708;">待收款</span></div>' +
    '<div class="guide-chips" style="margin-top:10px;">' +
    '<button class="guide-chip" onclick="showTransferHistory()">查看记录</button>' +
    '</div>';
}

function guideAACancel() {
  var s = GUIDE_AA;
  if (s && s.cardId) {
    var card = document.getElementById(s.cardId);
    if (card) card.innerHTML = '<div class="data-card-title">已取消 AA 收款</div><div class="data-row"><span class="data-label">状态</span><span class="data-value">未发起任何收款</span></div>';
  } else {
    appendMessage(guideMessage('<p>已取消本次 AA 收款，未发起任何收款。</p>'));
  }
  GUIDE_AA = null;
  scrollToBottom();
}

function guideAASubmit() {
  var s = GUIDE_AA;
  if (!s || s.stage !== 'confirm') return;
  var splitCount = s.participants.length + 1;
  var per = s.total / splitCount;
  var names = s.participants.map(function (p) { return p.name; });
  var u = mockData.userProfile;
  if (!u.aaRequests) u.aaRequests = [];
  u.aaRequests.unshift({
    id: 'aa' + Date.now(),
    activity: 'AA收款',
    total: s.total,
    payer: '我',
    participants: ['我'].concat(names),
    collectFrom: names,
    splitCount: splitCount,
    perPerson: per,
    status: '待收款',
    createdAt: new Date().toLocaleString('zh-CN')
  });
  saveUserData();

  // 同一张卡片就地变成「已发起」，不再多出一个气泡
  var card = s.cardId ? document.getElementById(s.cardId) : null;
  if (card) {
    card.innerHTML = guideAAConfirmDoneHtml(s, splitCount, per, names.join('、'));
  } else {
    appendMessage(guideMessage(guideAAConfirmDoneHtml(s, splitCount, per, names.join('、'))));
  }
  GUIDE_AA = null;
  scrollToBottom();
}
async function guideAAStep(text) {
  var t = String(text || '').trim();
  var s = GUIDE_AA;
  if (!s) return true;

  if (s.stage === 'confirm') {
    var plainAA = t.replace(/[吧呢啊呀。.!！?？\s]/g, '');
    if (/^(确认|确定|发起|发起AA收款|提交|是|好|好的|行|可以)$/.test(plainAA)) { guideAASubmit(); return true; }
    if (/^(取消|不|不要|算了|退出)$/.test(plainAA)) {
      guideAACancel();
      return true;
    }
  }

  // 重名选择阶段：支持 1/2/3、①②③、手机号、或带括号的选项文本
  if (s.stage === 'pick') {
    var idx = -1;
    var m = t.match(/^([1-9])/);
    if (m) {
      idx = parseInt(m[1], 10) - 1;
    } else {
      var circled = '①②③④⑤⑥⑦⑧⑨';
      var ci = circled.indexOf(t.charAt(0));
      if (ci >= 0) idx = ci;
    }
    if (idx < 0) {
      var digitsIn = t.replace(/\D/g, '');
      if (digitsIn.length >= 4) {
        for (var i = 0; i < s.pickOptions.length; i++) {
          if (String(s.pickOptions[i].phone || '').replace(/\D/g, '').slice(-4) === digitsIn.slice(-4)) { idx = i; break; }
        }
      }
    }
    if (idx >= 0 && s.pickOptions[idx]) {
      guideAAPick(idx);
      return true;
    }
    guideAAPickPrompt(s.pickOptions[0].name, s.pickOptions);
    return true;
  }

  // 「还有其他参与人吗」的回答：本地先认常见说法，认不出交给模型判断
  if (s.stage === 'askMore' && /^(没有|没有了|没|无|否|不|不用|就这些|这些|够了|结束|是的|对)$/.test(t)) {
    if (/^(是的|对)$/.test(t)) {
      appendMessage(guideMessage('<p>请告诉我还要收谁？</p>'));
      scrollToBottom();
      return true;
    }
    guideAANoMore();
    return true;
  }

  var parsed = guideAAParse(t);

  // 本地解析出的名字必须真的在通讯录里，否则（如「就我们几个搓一顿」）交给模型理解
  var localNamesOk = parsed.names.length && parsed.names.every(function (n) {
    return (mockData.contacts || []).some(function (c) { return c.name === n; });
  });
  if (!(parsed.total > 0) && !localNamesOk) {
    var aiAA = await guideAAAIExtract(t);
    if (GUIDE_AA !== s) return true;
    if (aiAA) {
      if (aiAA.total > 0) parsed.total = aiAA.total;
      if (aiAA.names.length) parsed.names = aiAA.names;
    } else if (s.stage === 'askMore') {
      // 有「还有吗」语境但没说名单：可能是「没有了 / 就这些」这类结束语
      var aiMore = await guideAAAIHasMore(t);
      if (GUIDE_AA !== s) return true;
      if (aiMore && aiMore.more === false) { guideAANoMore(); return true; }
      if (aiMore && aiMore.names && aiMore.names.length) parsed.names = aiMore.names;
    }
  } else if (parsed.names.length && !localNamesOk && s.stage === 'askMore') {
    // 通讯录里没有的「名字」不当参与人，按「还有吗」再问一次
    var aiMore2 = await guideAAAIHasMore(t);
    if (GUIDE_AA !== s) return true;
    if (aiMore2 && aiMore2.more === false) { guideAANoMore(); return true; }
    if (aiMore2 && aiMore2.names && aiMore2.names.length) parsed.names = aiMore2.names;
  }

  if (parsed.total > 0) s.total = parsed.total;

  // 有新名单：加入后继续问「还有其他参与人吗」
  if (parsed.names.length) {
    if (!guideAAAddNames(parsed.names)) return true;
    guideAAMore();
    return true;
  }

  // 只给了金额
  if (parsed.total > 0) {
    if (s.participants.length) { guideAAConfirm(); return true; }
    s.stage = 'slots';
    appendMessage(guideMessage('<p>麻烦告诉我除你外需要收款的参与人</p>'));
    scrollToBottom();
    return true;
  }

  // 什么都没识别：按当前进度追问
  if (s.stage === 'askMore') {
    appendMessage(guideMessage('<p>还有其他参与人吗？</p><p class="guide-tip">回复「没有」继续；也可以继续补充参与人</p>'));
  } else if (!(Number(s.total) > 0) && !s.participants.length) {
    appendMessage(guideMessage('<p>请告诉我你垫付的总金额和除你外需要收款的参与人</p>'));
  } else if (!s.participants.length) {
    appendMessage(guideMessage('<p>麻烦告诉我除你外需要收款的参与人</p>'));
  } else {
    appendMessage(guideMessage('<p>麻烦告诉我你垫付的总金额</p>'));
  }
  scrollToBottom();
  return true;
}

// ------------------------------ 理财申购：风评（有效期 1 年）→ 推荐 → 产品/金额 → 确认 ------------------------------
// 规则：
//   ① 风评有效（1 年内）：先播报等级 + 推荐 2 款适配产品，再收产品与金额；
//   ② 风评缺失/过期：先要求测评，测完自动接着推荐；
//   ③ 产品与金额可一次说完，也可分开说；确认后走 wealth.buy（含金额风控）。
var GUIDE_WEALTH = null;

function guideWealthEsc(v) {
  return (typeof escapeHtml === 'function') ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v);
}

function guideWealthProfile() {
  if (typeof riskProfile !== 'undefined' && riskProfile) return riskProfile;
  if (mockData.userProfile && mockData.userProfile.riskProfile) return mockData.userProfile.riskProfile;
  return null;
}

function guideWealthValidProfile() {
  var p = guideWealthProfile();
  if (!p) return null;
  var ok = (typeof riskProfileValid === 'function') ? riskProfileValid(p) : !!p.level;
  return ok ? p : null;
}

// 从产品描述里取期限：90天 / 3年 / 灵活存取 / 长期
function guideWealthTerm(p) {
  var d = String((p && p.desc) || '');
  var m = d.match(/(\d+)\s*天/);
  if (m) return m[1] + '天';
  if (/3年期|三年/.test(d + (p && p.name ? p.name : ''))) return '3年';
  if (/灵活/.test(d)) return '灵活存取';
  if (/长期/.test(d)) return '长期';
  return '期限灵活';
}

function guideWealthRecommendations(profile) {
  var level = Number(profile && profile.level) || 1;
  var list = (mockData.products || []).filter(function (p) { return Number(p.riskLevel) <= level; });
  list.sort(function (a, b) { return parseFloat(b.rate) - parseFloat(a.rate); });
  return list.slice(0, 2);
}

function guideWealthProductLine(p, i) {
  var circled = '①②③④⑤⑥⑦⑧⑨';
  var mark = circled.charAt(i) || (i + 1);
  return '<div>' + mark + ' <b>' + guideWealthEsc(p.name) + '</b>（R' + p.riskLevel + '，' +
    guideWealthEsc(guideWealthTerm(p)) + '，参考' + guideWealthEsc(p.rateLabel || '年化') + ' ' + guideWealthEsc(p.rate) + '）</div>';
}

// 全部在售产品（带风险适配标记），供「查询所有产品」按钮与意图触发
function guideWealthShowAllProducts() {
  var profile = guideWealthValidProfile();
  var level = profile ? Number(profile.level) : 0;
  var list = mockData.products || [];
  var rows = list.map(function (p, i) {
    var fit = profile ? (Number(p.riskLevel) <= level) : false;
    var tag = profile
      ? ' <span style="font-size:11px;color:' + (fit ? '#16A34A' : '#8A97A8') + ';">' +
        (fit ? '· 适配' : '· 超出您当前 R' + level + ' 承受能力') + '</span>'
      : '';
    return guideWealthProductLine(p, i).replace('</div>', '，起购 ¥' + guidePlainMoney(p.minAmount || 0) + tag + '</div>');
  }).join('');

  appendMessage(guideMessage(
    '<p>当前在售产品共 <b>' + list.length + '</b> 款' + (profile ? '（您的风险等级：R' + level + '）' : '') + '：</p>' +
    '<div class="guide-list">' + rows + '</div>' +
    '<p class="guide-tip">告诉我产品名称和申购金额即可，例如「稳健增利90天，50000」。</p>'
  ));
  scrollToBottom();
}

// 用户说「查询所有产品 / 全部产品 / 更多产品」时的意图判断
function guideIsAllProductsIntent(text) {
  var s = String(text || '').trim();
  if (!s) return false;
  if (/(所有|全部|其它|其他|更多|在售|别的|还有).{0,4}(产品|理财|基金)/.test(s)) return true;
  if (/(产品|理财|基金).{0,3}(列表|清单|大全)/.test(s)) return true;
  return false;
}

function guideWealthProductListHtml() {
  var items = (mockData.products || []).map(function (p, i) {
    return guideWealthProductLine(p, i);
  }).join('');
  return '<div class="guide-list">' + items + '</div>';
}

function guideWealthAccountTail() {
  var n = (mockData.userProfile && mockData.userProfile.debitCard && mockData.userProfile.debitCard.number) || '';
  var digits = String(n).replace(/\D/g, '');
  return digits ? digits.slice(-4) : '****';
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

function guideWealthShowRecommendations(profile) {
  var p = profile || guideWealthValidProfile();
  if (!p) return;
  var recs = guideWealthRecommendations(p);
  var lines = recs.map(guideWealthProductLine).join('');
  appendMessage(guideMessage(
    '<p>您的风险测评结果：<b>' + guideWealthEsc(p.name) + ' R' + p.level + '</b>。结合您当前资产情况，为您推荐适配产品：</p>' +
    (lines ? '<div class="guide-list">' + lines + '</div>' : '') +
    '<p>您可以选择以上推荐产品，也可以自行指定理财产品，并告诉我申购金额</p>' +
    '<div class="guide-chips"><button class="guide-chip" onclick="guideWealthShowAllProducts()">查询所有产品</button></div>'
  ));
  scrollToBottom();
}

function guideWealthStartAssess() {
  if (!GUIDE_WEALTH) GUIDE_WEALTH = { stage: 'risk', product: null, amount: null };
  GUIDE_WEALTH.stage = 'assessing';
  if (typeof startRiskAssessment === 'function') startRiskAssessment(true);
}

function guideWealthCancelAssess() {
  GUIDE_WEALTH = null;
  appendMessage(guideMessage('<p>好的。完成风险测评后，随时可以来申购理财产品。</p>'));
  scrollToBottom();
}

// 产品名模糊匹配：整串命中优先，否则取最长公共子串（≥3 字）
function guideWealthFindProduct(text) {
  var t = String(text || '').replace(/\s/g, '');
  if (!t) return null;
  var best = null;
  var bestScore = 0;
  (mockData.products || []).forEach(function (p) {
    var name = String(p.name || '');
    if (!name) return;
    if (t.indexOf(name) !== -1) {
      if (name.length > bestScore) { best = p; bestScore = name.length; }
      return;
    }
    for (var i = 0; i < name.length; i++) {
      for (var j = i + 3; j <= name.length; j++) {
        var sub = name.slice(i, j);
        if (t.indexOf(sub) !== -1 && sub.length > bestScore) { best = p; bestScore = sub.length; }
      }
    }
  });
  return best;
}

function guideWealthParse(text) {
  var t = String(text || '');
  var product = guideWealthFindProduct(t);
  // 产品名里常带数字（90天 / 三年 / 3期），先剔除再抽金额，避免「稳健增利90天」把 90 当金额
  if (product && product.name) t = t.replace(product.name, ' ');
  t = t.replace(/\d+\s*(天|日|年|期|个月|月)/g, ' ');

  var amount = 0;
  var m = t.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (m) {
    amount = parseFloat(m[1]);
    if (m[2]) amount *= 10000;
  }
  return { product: product, amount: amount };
}

async function guideWealthStep(text) {
  var t = String(text || '').trim();
  var s = GUIDE_WEALTH;
  var plain = t.replace(/[吧呢啊呀。.!！?？\s]/g, '');

  // ① 需要先测评
  if (s.stage === 'risk') {
    if (/^(好的|好|是|行|可以|开始|测评|现在|要|开始测评)$/.test(plain)) { guideWealthStartAssess(); return true; }
    if (/^(不用|不|否|暂不|算了|以后|稍后|不需要)$/.test(plain)) { guideWealthCancelAssess(); return true; }
    s.stage = 'slots';
  }

  if (s.stage === 'assessing') {
    appendMessage(guideMessage('<p>请先完成上面的风险测评题目，选完我再帮你推荐产品。</p>'));
    scrollToBottom();
    return true;
  }

  // 想看看全部产品：直接给完整清单（不打断已收集的产品/金额）
  if (guideIsAllProductsIntent(t)) {
    guideWealthShowAllProducts();
    return true;
  }

  // 确认阶段支持直接打字
  if (s.stage === 'confirm') {
    if (/^(确认|确认申购|确定|是|好|好的|行|可以|提交|提交申请)$/.test(plain)) { guideWealthSubmit(); return true; }
    if (/^(取消|不|不要|算了|退出)$/.test(plain)) { guideWealthCancel(); return true; }
  }

  var parsed = guideWealthParse(t);

  // 本地没匹配到产品名（或没有金额）时，交给模型识别简称/口语说法
  if ((!parsed.product || !(parsed.amount > 0)) && !/^\d+(\.\d+)?\s*(万|w|W)?$/.test(plain)) {
    var aiW = await guideWealthAIProduct(t);
    if (GUIDE_WEALTH !== s) return true;
    if (aiW) {
      if (!parsed.product && aiW.product) parsed.product = aiW.product;
      if (!(parsed.amount > 0) && aiW.amount > 0) parsed.amount = aiW.amount;
    }
  }

  if (parsed.product) {
    // 换了一只产品就必须重新确认风险，不能沿用上一只的 riskOverride
    if (!s.product || s.product.name !== parsed.product.name) s.riskOverride = false;
    s.product = parsed.product;
  }
  if (parsed.amount > 0) s.amount = parsed.amount;

  if (s.product && Number(s.amount) > 0) { guideWealthConfirm(); return true; }
  if (s.product) {
    appendMessage(guideMessage('<p>麻烦告诉我您的申购金额</p>'));
    scrollToBottom();
    return true;
  }
  if (Number(s.amount) > 0) {
    appendMessage(guideMessage('<p>麻烦告诉我您想申购的理财产品</p>' + guideWealthProductListHtml()));
    scrollToBottom();
    return true;
  }

  appendMessage(guideMessage('<p>请告诉我产品名称和申购金额，例如「稳健增利90天，50000」。</p>' + guideWealthProductListHtml()));
  scrollToBottom();
  return true;
}

function guideWealthConfirm() {
  var s = GUIDE_WEALTH;
  if (!s) return;
  var profile = guideWealthValidProfile();
  if (!profile) {
    s.stage = 'risk';
    appendMessage(guideMessage(
      '<p>按照监管要求，申购前需要完成有效的风险测评（有效期 1 年）。是否现在开始测评？</p>' +
      '<div class="guide-chips">' +
      '<button class="guide-chip" onclick="guideWealthStartAssess()">开始测评</button>' +
      '<button class="guide-chip" onclick="guideWealthCancelAssess()">暂不测评</button>' +
      '</div>'
    ));
    scrollToBottom();
    return;
  }

  var p = s.product;
  if (!p) {
    s.stage = 'slots';
    appendMessage(guideMessage('<p>请告诉我您想申购的理财产品。</p>' + guideWealthProductListHtml()));
    scrollToBottom();
    return;
  }
  if (Number(p.riskLevel) > Number(profile.level) && !s.riskOverride) {
    // 风险等级高于承受能力：不直接拦截，提醒风险并让用户自行确认
    appendMessage(guideMessage(
      '<p>「<b>' + guideWealthEsc(p.name) + '</b>」的风险等级是 <b>R' + p.riskLevel + '</b>，高于您的风险承受能力 <b>R' + profile.level + '</b>（' + guideWealthEsc(profile.name) + '）。</p>' +
      '<p class="guide-tip">该产品波动可能超过您的承受范围，是否仍要申购？</p>' +
      '<div class="guide-chips">' +
      '<button class="guide-chip" onclick="guideWealthRiskProceed()">仍然申购</button>' +
      '<button class="guide-chip" onclick="guideWealthRiskCancel()">换个产品</button>' +
      '</div>'
    ));
    scrollToBottom();
    return;
  }

  var minAmount = Number(p.minAmount) || 0;
  if (Number(s.amount) < minAmount) {
    appendMessage(guideMessage('<p>申购金额不能低于起购金额 ¥' + guidePlainMoney(minAmount) + '，请重新告诉我申购金额。</p>'));
    scrollToBottom();
    s.amount = null;
    return;
  }

  var available = Number(mockData.userProfile && mockData.userProfile.debitCard && mockData.userProfile.debitCard.available) || 0;
  if (Number(s.amount) > available) {
    appendMessage(guideMessage('<p>可用余额 ¥' + guidePlainMoney(available) + ' 不足本次申购金额 ¥' + guidePlainMoney(s.amount) + '，请调整金额。</p>'));
    scrollToBottom();
    s.amount = null;
    return;
  }

  s.stage = 'confirm';
  appendMessage(guideMessage(
    '<p>确认申购【<b>' + guideWealthEsc(p.name) + '</b>】<b>' + guidePlainMoney(s.amount) + '</b> 元，默认从活期主账户（尾号' +
    guideWealthAccountTail() + '）扣款，请确认</p>' +
    (s.riskOverride ? '<p class="guide-tip">⚠️ 该产品风险等级 R' + p.riskLevel + ' 高于你的风险承受能力 R' + profile.level + '，已按你的确认继续申购。</p>' : '') +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideWealthSubmit()">确认申购</button>' +
    '<button class="guide-chip" onclick="guideWealthCancel()">取消</button>' +
    '</div>'
  ));
  scrollToBottom();
}

// 风险等级高于承受能力时：用户确认「仍然申购」后带标记继续出确认卡
function guideWealthRiskProceed() {
  var s = GUIDE_WEALTH;
  if (!s || !s.product) return;
  s.riskOverride = true;
  appendMessage(guideMessage('<p>好的，已按你的确认继续申购，请在确认卡中核对信息。</p>'));
  scrollToBottom();
  guideWealthConfirm();
}

// 选择换个产品：清空已选产品并给出适配产品
function guideWealthRiskCancel() {
  var s = GUIDE_WEALTH;
  if (!s) return;
  s.product = null;
  s.amount = null;
  s.stage = 'slots';
  s.riskOverride = false;
  var profile = guideWealthValidProfile();
  appendMessage(guideMessage(
    '<p>好的，已取消这笔申购。以下是适配你风险等级的产品：</p>' +
    (profile ? '<div class="guide-list">' + guideWealthRecommendations(profile).map(guideWealthProductLine).join('') + '</div>' : '') +
    '<p class="guide-tip">告诉我产品名称和申购金额即可。</p>'
  ));
  scrollToBottom();
}
function guideWealthSubmit() {
  var s = GUIDE_WEALTH;
  if (!s || s.stage !== 'confirm') return;
  if (!s.product) {
    s.stage = 'slots';
    appendMessage(guideMessage('<p>申购产品已失效，请重新选择产品和金额。</p>'));
    scrollToBottom();
    return;
  }
  var name = s.product.name;
  var amount = s.amount;
  GUIDE_WEALTH = null;
  if (typeof executeBuyProduct === 'function') executeBuyProduct(name, amount);
}

function guideWealthCancel() {
  GUIDE_WEALTH = null;
  appendMessage(guideMessage('<p>已取消申购，账户未发生扣款。</p>'));
  scrollToBottom();
}

// ------------------------------ 申请信用卡：卡种 / 期望额度 / 主要用途 ------------------------------
// 三个槽位可任意顺序输入，缺什么问什么；齐了出「已整理你的申请信息」确认卡，
// 提交后写入 userProfile.cardApplications（状态 审核中），申请记录只展示 卡种・用途・状态・日期。
var GUIDE_CARD_APPLY = null;

var CARD_APPLY_TYPES = ['白金信用卡', '标准金卡', '旅行信用卡', '青年卡'];
var CARD_APPLY_PURPOSES = ['日常消费', '出行差旅', '教育培训', '大额购物', '其他'];

function guideCardApplyEsc(v) {
  return (typeof escapeHtml === 'function') ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v);
}

function guideCardApplyTypesText() { return CARD_APPLY_TYPES.join('、'); }
function guideCardApplyPurposesText() { return CARD_APPLY_PURPOSES.join('、'); }

function guideStartCardApply() {
  guideResetAllSessions();
  GUIDE_CARD_APPLY = { stage: 'slots', cardType: null, limit: 0, purpose: null };
  currentModule = 'card';
  appendMessage(guideMessage(
    '<p>请告诉我你想办理的信用卡类型、期望额度，以及主要使用用途。</p>' +
    '<p class="guide-tip">可选卡种：' + guideCardApplyTypesText() + '</p>' +
    '<p class="guide-tip">可选用途：' + guideCardApplyPurposesText() + '</p>'
  ));
  scrollToBottom();
}

// 从一句话里抽卡种 / 额度 / 用途；同时返回无法识别的卡种词（如「钻石卡」）
function guideCardApplyParse(text) {
  var raw = String(text || '');
  var t = raw;

  var cardType = CARD_APPLY_TYPES.filter(function (n) { return t.indexOf(n) !== -1; })[0] || null;
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
    var ok = CARD_APPLY_TYPES.some(function (n) { return n.indexOf(tok) !== -1 || tok.indexOf(n) !== -1; });
    if (!ok) { unknownType = tok; break; }
  }

  // 用途：先剔除已识别的卡种，避免「旅行信用卡」里的「旅行」被当成用途
  var t2 = t;
  CARD_APPLY_TYPES.forEach(function (n) { t2 = t2.split(n).join(' '); });
  var purpose = CARD_APPLY_PURPOSES.filter(function (n) { return t2.indexOf(n) !== -1; })[0] || null;
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

function guideCardApplyMissingPrompt(s) {
  var missType = !s.cardType;
  var missLimit = !(Number(s.limit) > 0);
  var missPurpose = !s.purpose;
  var present = (missType ? 0 : 1) + (missLimit ? 0 : 1) + (missPurpose ? 0 : 1);

  if (present === 0) return '请告诉我你想办理的信用卡类型、期望额度，以及主要使用用途。';
  if (present === 1) {
    if (!missType) return '请问期望额度是多少？主要用途是什么？';   // 只给了卡种
    if (!missLimit) return '请选择信用卡类型以及使用用途。';        // 只给了额度
    return '请告诉我信用卡类型和期望额度。';                        // 只给了用途
  }
  if (missType) return '请选择信用卡类型。';
  if (missLimit) return '请问你的期望额度是多少元？';
  return '请问这张卡的主要用途是什么？';
}

function guideCardApplyMoney(v) {
  return Number(v || 0).toLocaleString('zh-CN');
}

async function guideCardApplyStep(text) {
  var t = String(text || '').trim();
  var s = GUIDE_CARD_APPLY;
  var plain = t.replace(/[吧呢啊呀。.!！?？\s]/g, '');

  // 确认阶段支持直接打字
  if (s.stage === 'confirm') {
    if (/^(确认|确定|提交|提交申请|是|好|好的|行|可以)$/.test(plain)) { guideCardApplySubmit(); return true; }
    if (/^(取消|不|不要|算了|退出)$/.test(plain)) { guideCardApplyCancel(); return true; }
  }

  var parsed = guideCardApplyParse(t);

  // 本地没认出卡种/用途（如「金卡」「主要出差用」）→ 交给模型映射到可选清单
  if ((!parsed.cardType || !parsed.purpose) && !parsed.unknownType) {
    var aiCard = await guideCardApplyAIType(t);
    if (GUIDE_CARD_APPLY !== s) return true;
    if (aiCard) {
      if (!parsed.cardType && aiCard.cardType) parsed.cardType = aiCard.cardType;
      if (!parsed.purpose && aiCard.purpose) parsed.purpose = aiCard.purpose;
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
  if (parsed.purpose) s.purpose = parsed.purpose;

  // 三样齐了 → 整理确认
  if (s.cardType && Number(s.limit) > 0 && s.purpose) {
    guideCardApplyConfirm();
    return true;
  }

  var prompt = guideCardApplyMissingPrompt(s);

  // 「申请 50000」这类先给额度的说法，回执里带上识别到的额度
  if (Number(parsed.limit) > 0 && !parsed.cardType && !parsed.purpose && /^(申请|办理|办|我要申请|我想申请|申请信用卡)/.test(t)) {
    prompt = '识别到期望额度 ' + guideCardApplyMoney(parsed.limit) + ' 元，请选择信用卡类型和使用用途。';
  }

  appendMessage(guideMessage('<p>' + prompt + '</p>'));
  scrollToBottom();
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
    '<div class="data-row"><span class="data-label">卡种</span><span class="data-value">' + guideCardApplyEsc(s.cardType) + '</span></div>' +
    '<div class="data-row"><span class="data-label">期望额度</span><span class="data-value">' + guideCardApplyMoney(s.limit) + ' 元</span></div>' +
    '<div class="data-row"><span class="data-label">主要用途</span><span class="data-value">' + guideCardApplyEsc(s.purpose) + '</span></div>' +
    '</div>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideCardApplySubmit()">提交申请</button>' +
    '<button class="guide-chip" onclick="guideCardApplyCancel()">取消</button>' +
    '</div>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideCardApplySubmit() {
  var s = GUIDE_CARD_APPLY;
  if (!s || s.stage !== 'confirm') return;
  if (Number(s.limit) < 5000 || Number(s.limit) > 200000) {
    appendMessage(guideMessage('<p>期望额度需在 ¥5,000 - ¥200,000 之间，请重新告诉我期望额度。</p>'));
    scrollToBottom();
    s.stage = 'slots';
    s.limit = 0;
    return;
  }

  var list = (typeof cardApplyList === 'function') ? cardApplyList() : (mockData.userProfile.cardApplications = mockData.userProfile.cardApplications || []);
  var at = new Date().toLocaleDateString('zh-CN');
  var record = { cardType: s.cardType, limit: s.limit, purpose: s.purpose, status: '审核中', appliedAt: at };
  list.push(record);
  saveUserData();
  guideConfirmCardDone(s.boxId, '已提交审核');
  GUIDE_CARD_APPLY = null;

  // 申请同时进入「复核审批」队列；审批通过后才会核发新卡
  var review = (typeof submitCardApplyReview === 'function')
    ? submitCardApplyReview(record.cardType, record.limit, record.purpose)
    : null;

  appendMessage(guideMessage(
    '<p>信用卡申请已提交，状态为<b>审核中</b>' + (review ? '，已进入「复核审批」队列' : '') +
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
  scrollToBottom();
}

// 申请记录：只展示 卡种・用途 / 状态・日期，最新置顶
function guideCardApplyRecords() {
  var list = (typeof cardApplyList === 'function') ? cardApplyList() : [];
  var rows = list.length
    ? list.slice().reverse().map(function (a) {
      return '<div class="report-row"><span>' + guideCardApplyEsc(a.cardType) + '・' + guideCardApplyEsc(a.purpose) + '</span>' +
        '<b>' + guideCardApplyEsc(a.status) + '・' + guideCardApplyEsc(a.appliedAt) + '</b></div>';
    }).join('')
    : '<div class="report-empty">暂无申请记录</div>';
  appendMessage(guideMessage(
    '<p>卡片申请记录（共 ' + list.length + ' 条，最新置顶）：</p>' +
    '<div class="report-panel" style="margin-top:6px;">' +
    '<div class="report-panel-title">申请记录</div>' + rows + '</div>'
  ));
  scrollToBottom();
}

// ------------------------------ 信用卡额度调整申请：目标额度 + 调整原因 ------------------------------
// 两个槽位可任意顺序输入；齐了出「确认额度调整申请」，提交后写入复核审批队列（待复核）。
var GUIDE_CARD_LIMIT = null;

var CARD_LIMIT_REASONS = ['消费需求增加', '收入提升', '信用记录良好', '主动降低额度', '长期不用', '风险控制', '其他'];

function guideCardLimitEsc(v) {
  return (typeof escapeHtml === 'function') ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v);
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
    current: Number(d.effectiveLimit) || 0,
    used: Number(d.used) || 0,
    min: (typeof cardLimitMinimum === 'function') ? Number(cardLimitMinimum()) : Number(d.used) || 0
  };
}

// 当前可选的信用卡列表（含主卡与已核发的新卡）
function guideCardLimitCards() {
  if (typeof cardServiceCards === 'function') {
    try { return cardServiceCards() || []; } catch (e) { return []; }
  }
  return [];
}

function guideCardLabel(card) {
  if (!card) return '信用卡';
  return String(card.cardType || '信用卡') + '（尾号 ' + String(card.tail || '----') + '）';
}

// 从一句话里认卡：尾号 4 位 / 卡种关键词 / 第 N 张
function guidePickCardFromText(text, cards) {
  var t = String(text || '');
  if (!cards || !cards.length) return null;
  var byTail = cards.filter(function (x) { return x.tail && t.indexOf(String(x.tail)) !== -1; })[0];
  if (byTail) return byTail;
  var byType = cards.filter(function (x) {
    var label = String(x.cardType || '');
    return label && (t.indexOf(label) !== -1 || (label.indexOf('白金') !== -1 && /白金/.test(t)) || (label.indexOf('金卡') !== -1 && /金卡/.test(t)));
  })[0];
  if (byType) return byType;
  var idx = t.match(/第?\s*([一二三1-3])\s*张/);
  if (idx) {
    var map = { '一': 0, '二': 1, '三': 2, '1': 0, '2': 1, '3': 2 };
    var i = map[idx[1]];
    if (cards[i]) return cards[i];
  }
  return null;
}

function guideCardLimitPickCardHtml(cards) {
  var rows = cards.map(function (c, i) {
    return '<div class="report-row"><span>' + (i + 1) + '. ' + guideCardLimitEsc(c.cardType || '信用卡') +
      '　尾号 ' + guideCardLimitEsc(c.tail || '----') + '</span><b>¥' + Number(c.limit || 0).toLocaleString('zh-CN') + '</b></div>';
  }).join('');
  var chips = cards.map(function (c) {
    return '<button class="guide-chip" onclick="guideCardLimitPickCard(\'' + c.id + '\')">' + guideCardLimitEsc(c.cardType || '信用卡') + ' ' + guideCardLimitEsc(c.tail || '') + '</button>';
  }).join('');
  return '<p>你有 ' + cards.length + ' 张信用卡，想调整哪一张的额度？</p>' +
    '<div class="report-panel" style="margin-top:8px;"><div class="report-panel-title">我的信用卡</div>' + rows + '</div>' +
    '<div class="guide-chips" style="margin-top:8px;">' + chips + '</div>';
}

// 选卡后进入额度收集
function guideCardLimitPickCard(cardId) {
  var s = GUIDE_CARD_LIMIT;
  if (!s || !Array.isArray(s.cards)) return;
  var card = s.cards.filter(function (c) { return c.id === cardId; })[0];
  if (!card) return;
  s.card = card;
  s.stage = 'slots';
  var st = guideCardLimitState();
  appendMessage(guideMessage(
    '<p>正在调整「<b>' + guideCardLimitEsc(guideCardLabel(card)) + '</b>」的额度。</p>' +
    '<p>请告诉我想要调整到的目标额度，以及调整原因。</p>' +
    '<p class="guide-tip">可选原因：' + CARD_LIMIT_REASONS.join('、') + '</p>' +
    (st.current ? '<p class="guide-tip">当前额度 ¥' + st.current.toLocaleString('zh-CN') +
      (st.min > 0 ? '，最低可调至 ¥' + st.min.toLocaleString('zh-CN') + '（已用额度）' : '') + '</p>' : '')
  ));
  scrollToBottom();
}

function guideStartCardLimitAdjust() {
  guideResetAllSessions();
  currentModule = 'card';
  var cards = guideCardLimitCards();
  if (cards.length > 1) {
    GUIDE_CARD_LIMIT = { stage: 'pickCard', limit: 0, reason: null, cards: cards };
    appendMessage(guideMessage(guideCardLimitPickCardHtml(cards)));
    scrollToBottom();
    return;
  }
  GUIDE_CARD_LIMIT = { stage: 'slots', limit: 0, reason: null, cards: cards, card: cards[0] || null };
  var st = guideCardLimitState();
  appendMessage(guideMessage(
    (cards[0] ? '<p>正在调整「<b>' + guideCardLimitEsc(guideCardLabel(cards[0])) + '</b>」的额度。</p>' : '') +
    '<p>请告诉我想要调整到的目标额度，以及调整原因。</p>' +
    '<p class="guide-tip">可选原因：' + CARD_LIMIT_REASONS.join('、') + '</p>' +
    (st.current ? '<p class="guide-tip">当前额度 ¥' + st.current.toLocaleString('zh-CN') +
      (st.min > 0 ? '，最低可调至 ¥' + st.min.toLocaleString('zh-CN') + '（已用额度）' : '') + '</p>' : '')
  ));
  scrollToBottom();
}

function guideCardLimitParse(text) {
  var t = String(text || '');
  var limit = 0;
  var m = t.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (m) {
    limit = parseFloat(m[1]);
    if (m[2]) limit *= 10000;
  }

  var reason = CARD_LIMIT_REASONS.filter(function (n) { return t.indexOf(n) !== -1; })[0] || null;
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

async function guideCardLimitStep(text) {
  var t = String(text || '').trim();
  var s = GUIDE_CARD_LIMIT;
  var plain = t.replace(/[吧呢啊呀。.!！?？\s]/g, '');

  // 多卡时先选卡
  if (s.stage === 'pickCard') {
    if (/^(取消|不调了|算了|退出|返回|菜单)$/.test(plain)) {
      GUIDE_CARD_LIMIT = null;
      guideBackToMenu();
      return true;
    }
    var picked = guidePickCardFromText(t, s.cards || []);
    if (picked) {
      guideCardLimitPickCard(picked.id);
      return true;
    }
    appendMessage(guideMessage(guideCardLimitPickCardHtml(s.cards || [])));
    scrollToBottom();
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
  if (s.limit > 0) {
    appendMessage(guideMessage('<p>请选择本次额度的调整原因。</p><p class="guide-tip">可选原因：' + CARD_LIMIT_REASONS.join('、') + '</p>'));
    scrollToBottom();
    return true;
  }
  if (s.reason) {
    appendMessage(guideMessage('<p>请问希望将额度调整到多少元？</p>'));
    scrollToBottom();
    return true;
  }

  appendMessage(guideMessage('<p>请告诉我想要调整到的目标额度，以及调整原因。</p><p class="guide-tip">可选原因：' + CARD_LIMIT_REASONS.join('、') + '</p>'));
  scrollToBottom();
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
    (s.card ? '<div class="data-row"><span class="data-label">信用卡</span><span class="data-value">' + guideCardLimitEsc(guideCardLabel(s.card)) + '</span></div>' : '') +
    '<div class="data-row"><span class="data-label">目标额度</span><span class="data-value">' + Number(s.limit).toLocaleString('zh-CN') + ' 元</span></div>' +
    '<div class="data-row"><span class="data-label">调整原因</span><span class="data-value">' + guideCardLimitEsc(s.reason) + '</span></div>' +
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
    '<div class="report-row"><span>' + (s.card ? guideCardLimitEsc(guideCardLabel(s.card)) + '・' : '') + '额度调整・' + guideCardLimitEsc(s.reason) + '</span>' +
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
  }
  scrollToBottom();
}

// 调额记录：只展示 记录标题 / 状态・日期，最新置顶
function showCardLimitRecords() {
  var list = (mockData.userProfile.manualReviews || []).filter(function (r) {
    return r && r.actions && r.actions.some(function (a) { return a.tool === 'card.applyLimit'; });
  });
  var rows = list.length
    ? list.map(function (r) {
      var st = r.status === '待人工复核' ? '待复核' : (r.status || '待复核');
      return '<div class="report-row"><span>' + guideCardLimitEsc(r.purpose) + '</span><b>' + guideCardLimitEsc(st) + '・' + guideCardLimitEsc((r.submittedAt || '').split(' ')[0]) + '</b></div>';
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

// ------------------------------ 交易限制设置：单笔 / 日累计 / 夜间 / 境外 ------------------------------
// 采集顺序严格按规则：单笔限额 → 每日限额 → 夜间交易 → 境外交易 → 汇总确认。
// 校验：金额必须 ≥0 的有效数字；单笔 > 日累计只提示核对、不自动修改；夜间/境外只接受「允许 / 禁止」。
var GUIDE_TXN_LIMIT = null;

function guideTxnLimitEsc(v) {
  return (typeof escapeHtml === 'function') ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v);
}

function guideTxnLimitMo(v) {
  return '¥' + (Number(v) || 0).toLocaleString('zh-CN');
}

function guideTxnLimitFlagText(v) {
  return v === 'allow' ? '允许' : '禁止';
}

function guideTxnLimitValue(text) {
  var m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (!m) return null;
  var v = parseFloat(m[1]);
  if (m[2]) v *= 10000;
  return v;
}

// 本地先认「允许 / 禁止」；认不出再交给 AI 理解「是/否/可以/算了」这类说法
function guideTxnLimitFlag(text) {
  var t = String(text || '').trim().replace(/[。.!！?？,，、\s]/g, '');
  if (!t) return null;
  if (/(禁止|不允许|不可以|不行|关闭|别允许|关掉)/.test(t)) return 'block';
  if (/^(允许|可以|行|好|好的|是|是的|对|嗯|ok|OK)$/.test(t)) return 'allow';
  return null;
}

// 通用 LLM JSON 调用：无 Key / 失败时返回 null，调用方降级处理
// 说明：按钮点击一律传固定枚举，不经过这里；只有「用户打字」且本地规则认不出时才调用模型。
async function guideLLMJson(system, user) {
  // 兜底开关：按钮驱动的路径可临时置为 true，杜绝任何模型调用
  if (typeof window !== 'undefined' && window.__GUIDE_NO_AI__) return null;
  if (typeof window !== 'undefined') {
    window.__GUIDE_AI_CALLS__ = (window.__GUIDE_AI_CALLS__ || 0) + 1;
  }
  if (typeof bankHasLLMKey === 'function' && !bankHasLLMKey()) return null;
  if (typeof DEEPSEEK_API_URL === 'undefined' || !DEEPSEEK_API_URL) return null;
  try {
    var resp = await bankFetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (typeof DEEPSEEK_API_KEY !== 'undefined' ? DEEPSEEK_API_KEY : '')
      },
      body: JSON.stringify({
        model: (typeof MODEL_NAME !== 'undefined' && MODEL_NAME) ? MODEL_NAME : 'deepseek-chat',
        temperature: 0,
        max_tokens: 80,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
    if (!resp.ok) return null;
    var data = await resp.json();
    var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    var m = content.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch (e) {
    return null;
  }
}

// ——————————————————————————————————————————————
// 通用 AI 槽位识别：凡是「用户没有固定回答」的输入，本地规则认不出时统一交给模型。
// 无 Key / 请求失败时一律返回 null，调用方回落到本地追问，不阻塞对话。
// ——————————————————————————————————————————————
async function guideAISlots(text, system, parse) {
  var loadId = (typeof guideTypingBubble === 'function') ? guideTypingBubble() : null;
  var obj = null;
  try { obj = await guideLLMJson(system, text); } catch (e) { obj = null; }
  var el = loadId ? document.getElementById(loadId) : null;
  if (el) el.remove();
  if (typeof parse === 'function') return parse(obj);
  return obj || null;
}

// 定时转账：日期 / 时间 / 重复方式（支持「下周三」「月底」等自由说法）
function guideTimedAIExtract(text) {
  var today = guideOffsetDate(0);
  return guideAISlots(
    text,
    '你是银行 App 的时间解析器。今天是 ' + today + '。用户在设置定时转账时间。' +
    '请把相对说法换算成具体日期（如「明天」「下周三」「月底」「10月30号」），时间用 24 小时制（「下午三点」=15:00）。' +
    '重复方式只能是 不重复/每天/每周/每月/每年。' +
    '只说时间段没说钟点（如「明天下午」）时 time 返回空、period 填 上午/下午/晚上/中午/凌晨。' +
    '只输出 JSON：{"date":"YYYY-MM-DD或空","time":"HH:MM或空","period":"或空","repeat":"不重复|每天|每周|每月|每年或空"}',
    function (o) {
      if (!o) return null;
      var date = /^\d{4}-\d{1,2}-\d{1,2}$/.test(o.date || '') ? String(o.date) : null;
      var time = /^\d{1,2}:\d{2}$/.test(o.time || '') ? guidePad2(String(o.time).split(':')[0]) + ':' + String(o.time).split(':')[1] : null;
      var period = ['凌晨', '早上', '上午', '中午', '下午', '晚上'].indexOf(o.period) !== -1 ? o.period : null;
      var repeat = ['不重复', '每天', '每周', '每月', '每年'].indexOf(o.repeat) !== -1 ? o.repeat : null;
      if (!date && !time && !period && !repeat) return null;
      return { date: date, time: time, period: period, repeat: repeat };
    }
  );
}

// AA 收款：垫付总额与参与人名单
function guideAAAIExtract(text) {
  var names = (mockData.contacts || []).map(function (c) { return c.name; }).join('、');
  return guideAISlots(
    text,
    '你是银行 App 的信息抽取器。用户在发起 AA 收款，需要「垫付总金额」和「除自己之外要收款的参与人名单」。' +
    '通讯录联系人只有：' + names + '。请只从通讯录里取名（没有就不要编）。' +
    '只输出 JSON：{"total":数字或null,"names":["姓名",…]}。',
    function (o) {
      if (!o) return null;
      var total = Number(o.total);
      var list = Array.isArray(o.names) ? o.names.filter(function (n) { return typeof n === 'string' && n; }) : [];
      if (!(total > 0)) total = null;
      if (total === null && !list.length) return null;
      return { total: total, names: list };
    }
  );
}

// AA 收款：回答「还有其他参与人吗？」——判断是否结束 + 补充名单
function guideAAAIHasMore(text) {
  var names = (mockData.contacts || []).map(function (c) { return c.name; }).join('、');
  return guideAISlots(
    text,
    '你是银行 App 的意图解析器。系统在问「还有其他参与人吗？」，用户可能回答「没有了」「就这些人」「再加个李四」。' +
    '通讯录联系人只有：' + names + '。只输出 JSON：{"more":true|false,"names":["补充的姓名",…]}。' +
    '表示结束时 more 返回 false；无法判断时 more 返回 null。',
    function (o) {
      if (!o) return null;
      var list = Array.isArray(o.names) ? o.names.filter(function (n) { return typeof n === 'string' && n; }) : [];
      var more = (o.more === true) ? true : (o.more === false ? false : null);
      if (more === null && !list.length) return null;
      return { more: more, names: list };
    }
  );
}

// 信用卡申请：卡种与主要用途
function guideCardApplyAIType(text) {
  return guideAISlots(
    text,
    '你是银行 App 的信用卡申请解析器。卡种只能是 白金信用卡/标准金卡/旅行信用卡/青年卡；' +
    '用途只能是 日常消费/出行差旅/教育培训/大额购物/其他。用户怎么说都要映射到这两个清单里。' +
    '只输出 JSON：{"cardType":"或空","purpose":"或空"}。',
    function (o) {
      if (!o) return null;
      var t = CARD_APPLY_TYPES.filter(function (n) { return o.cardType && String(o.cardType).indexOf(n) !== -1; })[0] || null;
      var p = CARD_APPLY_PURPOSES.filter(function (n) { return o.purpose && String(o.purpose).indexOf(n) !== -1; })[0] || null;
      if (!t && !p) return null;
      return { cardType: t, purpose: p };
    }
  );
}

// 额度调整：调整原因 + 目标额度
function guideCardLimitAIReason(text) {
  return guideAISlots(
    text,
    '你是银行 App 的意图解析器。用户在申请信用卡额度调整，需要识别「调整原因」，' +
    '只能从 消费需求增加/收入提升/信用记录良好/主动降低额度/长期不用/风险控制/其他 里选一个。' +
    '也请抽取目标额度（中文数字转阿拉伯数字）。只输出 JSON：{"reason":"或空","limit":数字或null}。',
    function (o) {
      if (!o) return null;
      var r = CARD_LIMIT_REASONS.indexOf(o.reason) !== -1 ? o.reason : null;
      var l = Number(o.limit);
      if (!(l > 0)) l = null;
      if (!r && l === null) return null;
      return { reason: r, limit: l };
    }
  );
}

// 理财申购：产品名与金额（支持简称、别称、口语说法）
function guideWealthAIProduct(text) {
  var list = (mockData.products || []).map(function (p) { return p.name; }).join('、');
  return guideAISlots(
    text,
    '你是银行 App 的理财申购解析器。在售产品只有：' + list + '。' +
    '用户可能用简称或口语描述，请匹配到清单里的产品名；也请抽取申购金额（中文数字转阿拉伯数字）。' +
    '只输出 JSON：{"product":"或空","amount":数字或null}。',
    function (o) {
      if (!o) return null;
      var name = o.product ? String(o.product) : '';
      var hit = (mockData.products || []).filter(function (p) { return name && (name.indexOf(p.name) !== -1 || p.name.indexOf(name) !== -1); })[0] || null;
      var amt = Number(o.amount);
      if (!(amt > 0)) amt = null;
      if (!hit && amt === null) return null;
      return { product: hit, amount: amt };
    }
  );
}

// AI 理解「允许 / 禁止」：返回 'allow' | 'block' | null
async function guideTxnLimitAIFlag(text, which) {
  var obj = await guideLLMJson(
    '你是银行 App 的选项解析器。用户在回答「是否允许' + (which === 'night' ? '夜间交易' : '境外交易') + '」，' +
    '只能输出 JSON：{"allow": true|false|null}。表示同意的说法（是/可以/行/当然/没问题/允许）→ true；' +
    '表示不同意的说法（不/否/不行/不要/禁止/关掉/不能）→ false；无法判断 → null。不要输出其它内容。',
    text
  );
  if (!obj || obj.allow === null || obj.allow === undefined) return null;
  if (obj.allow === true) return 'allow';
  if (obj.allow === false) return 'block';
  return null;
}

// AI 提取两项限额（支持中文数字）：返回 { single, daily } 或 null
async function guideTxnLimitAILimits(text) {
  var obj = await guideLLMJson(
    '你是银行 App 的数值抽取器。用户正在设置信用卡的「单笔限额」与「每日限额」。' +
    '从用户的话里抽取数字（中文数字要转成阿拉伯数字，例如「五千」=5000、「一万」=10000、「五百」=500）。' +
    '只输出 JSON：{"single": 数字或null, "daily": 数字或null}。' +
    '若用户只给了一个数字且没说属于哪一项，把它当单笔限额（single），daily 返回 null。不要输出其它内容。',
    text
  );
  if (!obj) return null;
  var single = (obj.single === null || obj.single === undefined) ? null : Number(obj.single);
  var daily = (obj.daily === null || obj.daily === undefined) ? null : Number(obj.daily);
  if (single != null && !(single >= 0)) single = null;
  if (daily != null && !(daily >= 0)) daily = null;
  if (single == null && daily == null) return null;
  return { single: single, daily: daily };
}

function guideTxnLimitNightQuestion(prefix) {
  return '<p>' + (prefix || '') + '是否允许夜间交易（23:00-06:00）？</p>';
}

// 交易限制：多卡时先选卡
function guideTxnLimitPickHtml(cards) {
  var rows = cards.map(function (c, i) {
    var right = (c.txnLimit && Number(c.txnLimit.single) > 0)
      ? ('单笔 ¥' + Number(c.txnLimit.single).toLocaleString('zh-CN'))
      : '未单独设置';
    return '<div class="report-row"><span>' + (i + 1) + '. ' + guideCardLimitEsc(c.cardType || '信用卡') +
      '　尾号 ' + guideCardLimitEsc(c.tail || '----') + '</span><b>' + right + '</b></div>';
  }).join('');
  var chips = cards.map(function (c) {
    return '<button class="guide-chip" onclick="guideTxnLimitPickCard(\'' + c.id + '\')">' + guideCardLimitEsc(c.cardType || '信用卡') + ' ' + guideCardLimitEsc(c.tail || '') + '</button>';
  }).join('');
  return '<p>你有 ' + cards.length + ' 张信用卡，要给哪一张设置交易限制？</p>' +
    '<div class="report-panel" style="margin-top:8px;"><div class="report-panel-title">我的信用卡</div>' + rows + '</div>' +
    '<div class="guide-chips" style="margin-top:8px;">' + chips + '</div>';
}

function guideTxnLimitAskLimits() {
  var s = GUIDE_TXN_LIMIT;
  if (!s) return;
  var label = s.card ? guideCardLabel(s.card) : '';
  appendMessage(guideMessage(
    (label ? '<p>正在为「<b>' + guideCardLimitEsc(label) + '</b>」设置交易限制。</p>' : '') +
    '<p>请设置单笔限额与每日限额。</p>'
  ));
  scrollToBottom();
}

function guideTxnLimitPickCard(cardId) {
  var s = GUIDE_TXN_LIMIT;
  if (!s || !Array.isArray(s.cards)) return;
  var card = s.cards.filter(function (c) { return c.id === cardId; })[0];
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
    GUIDE_TXN_LIMIT = { stage: 'pickCard', single: null, daily: null, night: null, overseas: null, cards: cards };
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

async function guideTxnLimitStep(text) {
  var t = String(text || '').trim();
  var s = GUIDE_TXN_LIMIT;
  if (!s) return true;

  // 多卡时先选卡
  if (s.stage === 'pickCard') {
    var plainPick = t.replace(/[吧呢啊呀。.!！?？\s]/g, '');
    if (/^(取消|不改了|算了|退出|返回|菜单)$/.test(plainPick)) {
      GUIDE_TXN_LIMIT = null;
      guideBackToMenu();
      return true;
    }
    var picked = guidePickCardFromText(t, s.cards || []);
    if (picked) { guideTxnLimitPickCard(picked.id); return true; }
    appendMessage(guideMessage(guideTxnLimitPickHtml(s.cards || [])));
    scrollToBottom();
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

  // ② 限额：句中带关键字的两项分别归位；只有一个裸数字时默认作为单笔限额
  var mSingle = t.match(/(?:单笔|每笔|单次)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  var mDaily = t.match(/(?:日累计|每日|每天|一天|日限额)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  var bare = guideTxnLimitValue(t);

  function guideTxnLimitToVal(m) {
    if (!m) return null;
    var v = parseFloat(m[1]);
    if (m[2]) v *= 10000;
    return v;
  }

  var rest = t;
  if (mSingle) { s.single = guideTxnLimitToVal(mSingle); rest = rest.replace(mSingle[0], ' '); }
  if (mDaily) { s.daily = guideTxnLimitToVal(mDaily); rest = rest.replace(mDaily[0], ' '); }

  // 剩下的裸数字按出现顺序处理：1 个 → 默认日累计；2 个 → 先单笔、后日累计
  var restNums = [];
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
  if ((!mSingle && !mDaily && bare == null) || hasCnNum) {
    var loadId2 = guideTypingBubble();
    var ai = null;
    try { ai = await guideTxnLimitAILimits(t); } catch (e) { ai = null; }
    if (GUIDE_TXN_LIMIT !== s) return true;
    var el2 = document.getElementById(loadId2);
    if (el2) el2.remove();
    if (ai) {
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
    appendMessage(guideMessage('<p>请输入单笔限额</p>'));
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
    appendMessage(guideMessage('<p>单笔限额不能低于 ¥1,000，请重新输入单笔限额和每日限额。</p>' +
      '<p class="guide-tip">请设置单笔限额与每日限额。</p>'));
    scrollToBottom();
    return true;
  }
  if (dailyV < singleV) {
    s.single = null;
    s.daily = null;
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
function guideTxnLimitConfirm() {
  var s = GUIDE_TXN_LIMIT;
  if (!s) return;
  s.stage = 'confirm';
  s.confirmBoxId = s.confirmBoxId || ('txn-limit-confirm-' + Date.now());
  appendMessage(guideMessage(
    '<div id="' + s.confirmBoxId + '-wrap">' +
    '<div class="data-card">' +
    (s.card ? '<div class="data-row"><span class="data-label">信用卡</span><span class="data-value">' + guideCardLimitEsc(guideCardLabel(s.card)) + '</span></div>' : '') +
    '<div class="data-row"><span class="data-label">单笔限额</span><span class="data-value">' + (Number(s.single) || 0).toLocaleString('zh-CN') + ' 元</span></div>' +
    '<div class="data-row"><span class="data-label">每日限额</span><span class="data-value">' + (Number(s.daily) || 0).toLocaleString('zh-CN') + ' 元</span></div>' +
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
    var target = cardsNow.filter(function (x) { return x.id === s.card.id; })[0];
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
  appendMessage(guideMessage('<p>' + (cardLabel ? guideCardLimitEsc(cardLabel) + ' ' : '') + '交易限制已更新完成。</p>'));
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
  }
  scrollToBottom();
}
// ------------------------------ 卡片挂失：尾号 + 二次确认（不区分临时/正式） ------------------------------
var GUIDE_CARD_LOST = null;

function guideCardLostEsc(v) {
  return (typeof escapeHtml === 'function') ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v);
}

function guideCardLostCards() {
  if (typeof cardServiceCards === 'function') return cardServiceCards();
  return [];
}

function guideCardLostTailsText() {
  var list = guideCardLostCards();
  if (!list.length) return '';
  return '你名下的卡片尾号：' + list.map(function (c) { return c.tail || '****'; }).join('、') + '。';
}

function guideStartCardLost() {
  guideResetAllSessions();
  GUIDE_CARD_LOST = { stage: 'slots', card: null };
  currentModule = 'card';
  var cards = guideCardLostCards();
  // 沿用「我的卡片」列表样式
  var listHtml = (typeof cardServiceListHtml === 'function')
    ? cardServiceListHtml({ list: cards, hideApply: true })
    : '';
  appendMessage(guideMessage(listHtml + '<p style="margin-top:10px;">请提供需要挂失的卡片尾号。</p>'));
  scrollToBottom();
}

function guideCardLostStep(text) {
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
    appendMessage(guideMessage('<p>请提供 4 位卡片尾号。</p>'));
    scrollToBottom();
    return true;
  }

  var tail = digits.slice(-4);
  var card = guideCardLostCards().filter(function (c) { return String(c.tail) === tail; })[0];
  if (!card) {
    appendMessage(guideMessage('<p>未找到尾号 <b>' + guideCardLostEsc(tail) + '</b> 的卡片，请重新输入尾号。</p>'));
    scrollToBottom();
    return true;
  }

  s.card = card;
  s.tail = tail;
  s.stage = 'confirm';
  s.confirmBoxId = 'card-lost-confirm-' + Date.now();
  appendMessage(guideMessage(
    '<div id="' + s.confirmBoxId + '">' +
    '<p>请确认挂失尾号 <b>' + guideCardLostEsc(tail) + '</b> 的信用卡。</p>' +
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
    function (ok) {
      if (!ok) {
        guideCardLostCollapse('未通过安全验证，已取消挂失，卡片状态保持不变。');
        return;
      }
      guideCardLostApply(card);
    }
  );
}

// 验证通过后真正冻结卡片并出结果卡
function guideCardLostApply(card) {
  var c = card || {};
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
    okBox.innerHTML = '<p>已确认挂失尾号 <b>' + guideCardLostEsc(c.tail || '****') + '</b> 的' + guideCardLostEsc(c.cardType || '信用卡') + '。</p>';
  }
  GUIDE_CARD_LOST = null;

  appendMessage(guideMessage(
    '<p>挂失办理成功，卡片状态已更新。</p>' +
    '<div class="data-card"><div class="data-card-title">挂失信息</div>' +
    '<div class="data-row"><span class="data-label">卡片</span><span class="data-value">' + guideCardLostEsc(c.cardType || '信用卡') + ' · 尾号 ' + guideCardLostEsc(c.tail || '****') + '</span></div>' +
    '<div class="data-row"><span class="data-label">当前状态</span><span class="data-value" style="color:#B42318;">已挂失</span></div>' +
    '<div class="data-row"><span class="data-label">办理时间</span><span class="data-value">' + c.frozenAt + '</span></div>' +
    '</div>' +
    '<div class="guide-chips"><button class="guide-chip" onclick="showCardMyCards()">查看我的卡片</button></div>'
  ));
  scrollToBottom();
}
// 取消 / 验证失败：把确认块整体折叠成一行
function guideCardLostCollapse(text) {
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
}

// ------------------------------ 持仓管理：追加申购 / 赎回（对话式） ------------------------------
// 入口：先展示持仓卡片概览，再问「需要赎回还是追加申购呢？」
var GUIDE_HOLDING = null;

function guideHoldingEsc(v) {
  return (typeof escapeHtml === 'function') ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v);
}

function guideHoldingList() {
  return (mockData.userProfile.holdings || []).filter(function (h) { return h && h.status !== '已赎回'; });
}

function guideHoldingAccountTail() {
  var n = (mockData.userProfile && mockData.userProfile.debitCard && mockData.userProfile.debitCard.number) || '';
  var d = String(n).replace(/\D/g, '');
  return d ? d.slice(-4) : '****';
}

// 在产品名里做模糊匹配（先整串，再最长公共子串 ≥3）
function guideHoldingFind(text) {
  var t = String(text || '').replace(/\s/g, '');
  if (!t) return null;
  var list = guideHoldingList();
  var best = null, bestScore = 0;
  list.forEach(function (h) {
    var name = String(h.name || '');
    if (!name) return;
    if (t.indexOf(name) !== -1) { if (name.length > bestScore) { best = h; bestScore = name.length; } return; }
    for (var i = 0; i < name.length; i++) {
      for (var j = i + 3; j <= name.length; j++) {
        var sub = name.slice(i, j);
        if (t.indexOf(sub) !== -1 && sub.length > bestScore) { best = h; bestScore = sub.length; }
      }
    }
  });
  return best;
}

function guideHoldingAmount(text) {
  var t = String(text || '');
  var p = guideHoldingFind(t);
  if (p && p.name) t = t.replace(p.name, ' ');
  t = t.replace(/\d+\s*(天|年|期|个月|月)/g, ' ');
  var m = t.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (!m) return 0;
  var v = parseFloat(m[1]);
  if (m[2]) v *= 10000;
  return v;
}

// 封闭期判断：产品名/描述里有天数或年期，且买入日 + 期限还没到
function guideHoldingTermDays(h) {
  var prod = (mockData.products || []).filter(function (p) { return p.name === h.name; })[0] || {};
  var s = String(h.name || '') + ' ' + String(prod.desc || '');
  var m = s.match(/(\d+)\s*天/);
  if (m) return Number(m[1]);
  if (/三年|3年/.test(s)) return 1095;
  if (/(\d+)\s*年/.test(s)) return Number(RegExp.$1) * 365;
  return 0;
}

function guideHoldingClosed(h) {
  var days = guideHoldingTermDays(h);
  if (!days) return false;
  var t = Date.parse(String(h.buyDate || '').replace(/-/g, '/'));
  if (isNaN(t)) return false;
  return Date.now() < (t + days * 86400000);
}

function guideStartHoldings() {
  guideResetAllSessions();
  GUIDE_HOLDING = { stage: 'choose', mode: null, product: null, amount: null, full: false, riskOverride: false };
  currentModule = 'wealth';
  showHoldings();
  appendMessage(guideMessage(
    '<p>需要赎回还是追加申购呢？</p>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideHoldingChoose(\'sub\')">追加申购</button>' +
    '<button class="guide-chip" onclick="guideHoldingChoose(\'redeem\')">赎回</button>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideHoldingChoose(mode) {
  var s = GUIDE_HOLDING;
  if (!s) return;
  if (mode === 'sub') {
    s.mode = 'sub';
    s.stage = 'subSlots';
    appendMessage(guideMessage('<p>请告诉我要追加申购的产品名称以及申购金额。</p>'));
  } else {
    s.mode = 'redeem';
    s.stage = 'redeemSlots';
    appendMessage(guideMessage('<p>您可以选择赎回全部持仓，或者指定产品并告知赎回金额（全额赎回可直接回复“全额”）。</p>'));
  }
  scrollToBottom();
}

// 「全部赎回」类说法：卖/赎/取回/提现/清仓 + 全部/所有/一键/都
function guideHoldingAllRedeemIntent(text) {
  var s = String(text || '').replace(/\s/g, '');
  if (!s) return false;
  if (!/(卖|赎|取回|提现|清仓|退出)/.test(s)) return false;
  return /(全部|所有|一键|都|清仓|全卖|全赎|整笔)/.test(s);
}
// AI 兜底：本地同义词没命中时，让模型判断是「追加申购 / 指定赎回 / 全部赎回」并抽产品与金额
async function guideHoldingAIIntent(text) {
  var loadId = (typeof guideTypingBubble === 'function') ? guideTypingBubble() : null;
  var obj = null;
  try {
    obj = await guideLLMJson(
      '你是银行 App 的意图解析器。用户在「持仓管理」页操作，可执行的动作只有三种：' +
      'sub=追加申购、redeem=赎回指定产品、redeem_all=赎回全部持仓。' +
      '请从用户这句话判断动作，并抽取产品名称与金额（中文数字转阿拉伯数字，例如「五千」=5000）。' +
      '只输出 JSON：{"action":"sub|redeem|redeem_all|null","product":"产品名或空","amount":数字或null}。' +
      '判断不出来时 action 返回 null。不要输出其它内容。',
      text
    );
  } catch (e) { obj = null; }
  var el = loadId ? document.getElementById(loadId) : null;
  if (el) el.remove();
  if (!obj || !obj.action) return null;
  return {
    action: obj.action,
    product: obj.product ? String(obj.product).trim() : '',
    amount: (obj.amount === null || obj.amount === undefined) ? 0 : Number(obj.amount)
  };
}
async function guideHoldingStep(text) {
  var t = String(text || '').trim();
  var plain = t.replace(/[。.!！?？,，、\s]/g, '');
  var s = GUIDE_HOLDING;

  // ① 选择动作
  if (s.stage === 'choose') {
    if (/追加|申购|加仓|买入/.test(t)) { guideHoldingChoose('sub'); return true; }
    if (guideHoldingAllRedeemIntent(t)) {
      s.mode = 'redeem';
      s.all = true;
      s.stage = 'redeemAllConfirm';
      guideHoldingRedeemAllConfirm();
      return true;
    }
    if (/赎回|卖出|取出|取回|提现/.test(t)) { guideHoldingChoose('redeem'); return true; }

    // 本地没命中：让模型判断动作
    var aiChoose = await guideHoldingAIIntent(t);
    if (aiChoose && aiChoose.action === 'redeem_all') {
      s.mode = 'redeem';
      s.all = true;
      s.stage = 'redeemAllConfirm';
      guideHoldingRedeemAllConfirm();
      return true;
    }
    if (aiChoose && aiChoose.action === 'redeem') { guideHoldingChoose('redeem'); return true; }
    if (aiChoose && aiChoose.action === 'sub') { guideHoldingChoose('sub'); return true; }

    appendMessage(guideMessage('<p>需要赎回还是追加申购呢？</p>'));
    scrollToBottom();
    return true;
  }

  // ② 追加申购收槽位
  if (s.stage === 'subSlots') {
    var p = guideHoldingFind(t);
    var amt = guideHoldingAmount(t);
    if (p) s.product = p;
    if (amt > 0) s.amount = amt;
    if (s.product && Number(s.amount) > 0) { guideHoldingSubConfirm(); return true; }
    if (s.product) { appendMessage(guideMessage('<p>麻烦告诉我本次追加申购的金额</p>')); scrollToBottom(); return true; }
    if (Number(s.amount) > 0) { appendMessage(guideMessage('<p>麻烦告诉我您要追加申购的产品名称</p>')); scrollToBottom(); return true; }

    var aiSub = await guideHoldingAIIntent(t);
    if (aiSub && aiSub.action === 'sub') {
      var subProd = guideHoldingFind(aiSub.product || '');
      if (subProd) s.product = subProd;
      if (aiSub.amount > 0) s.amount = aiSub.amount;
      if (s.product && Number(s.amount) > 0) { guideHoldingSubConfirm(); return true; }
      if (s.product) { appendMessage(guideMessage('<p>麻烦告诉我本次追加申购的金额</p>')); scrollToBottom(); return true; }
    }

    appendMessage(guideMessage('<p>请告诉我要追加申购的产品名称以及申购金额。</p>'));
    scrollToBottom();
    return true;
  }

  // ③ 赎回收槽位
  if (s.stage === 'redeemSlots') {
    if (guideHoldingAllRedeemIntent(t) || /^(全部|所有|一键|清仓|都卖|全卖)$/.test(plain)) {
      s.all = true;
      guideHoldingRedeemAllConfirm();
      return true;
    }
    var rp = guideHoldingFind(t);
    var ramt = guideHoldingAmount(t);
    var full = /全额|全部金额/.test(t) && !s.all;
    if (rp) s.product = rp;
    if (ramt > 0 && !full) s.amount = ramt;
    if (full) s.full = true;
    // 只说了产品：先查封闭期，封闭期内直接拒绝，不再问金额
    if (s.product && !(s.full || Number(s.amount) > 0) && guideHoldingClosed(s.product)) {
      appendMessage(guideMessage('<p>【<b>' + guideHoldingEsc(s.product.name) + '</b>】当前处于封闭期，暂不支持赎回。</p>'));
      scrollToBottom();
      s.product = null;
      s.amount = null;
      s.full = false;
      return true;
    }
    if (s.product && (s.full || Number(s.amount) > 0)) { guideHoldingRedeemConfirm(); return true; }
    if (s.product) { appendMessage(guideMessage('<p>请问您赎回多少金额？全额赎回可直接回复“全额”</p>')); scrollToBottom(); return true; }
    if (Number(s.amount) > 0) { appendMessage(guideMessage('<p>麻烦告诉我需要赎回的产品名称</p>')); scrollToBottom(); return true; }

    // 本地没命中：让模型判断动作与产品/金额
    var aiRedeem = await guideHoldingAIIntent(t);
    if (aiRedeem && aiRedeem.action === 'redeem_all') {
      s.all = true;
      guideHoldingRedeemAllConfirm();
      return true;
    }
    if (aiRedeem && aiRedeem.action === 'redeem') {
      var aiProduct = guideHoldingFind(aiRedeem.product || '') || (mockData.userProfile.holdings || []).filter(function (h) { return h.name === aiRedeem.product; })[0];
      if (aiProduct) {
        s.product = aiProduct;
        if (aiRedeem.amount > 0) s.amount = aiRedeem.amount;
        if (s.product && (s.full || Number(s.amount) > 0)) { guideHoldingRedeemConfirm(); return true; }
        appendMessage(guideMessage('<p>请问您赎回多少金额？全额赎回可直接回复“全额”</p>'));
        scrollToBottom();
        return true;
      }
    }

    appendMessage(guideMessage('<p>您可以选择赎回全部持仓，或者指定产品并告知赎回金额（全额赎回可直接回复“全额”）。</p>'));
    scrollToBottom();
    return true;
  }

  if (s.stage === 'subRisk') {
    if (/^(是|对|要|追加|仍然|确认|继续|是的)/.test(plain)) { guideHoldingSubSubmitAsRisk(); return true; }
    if (/^(不|否|不要|取消|算了)/.test(plain)) { guideHoldingCancel(); return true; }
    appendMessage(guideMessage('<p>是否仍要追加申购？请回复「追加」或「取消」。</p>'));
    scrollToBottom();
    return true;
  }

  // 确认阶段：支持直接打字「确认 / 修改 / 取消」，不必点按钮
  if (s.stage === 'subConfirm' || s.stage === 'redeemConfirm' || s.stage === 'redeemAllConfirm') {
    if (/^(确认|确定|确认申购|确认赎回|确认一键赎回|是|好|好的|行|可以|继续|提交|提交申请)$/.test(plain)) {
      if (s.stage === 'subConfirm') { guideHoldingSubSubmit(); return true; }
      if (s.stage === 'redeemConfirm') { guideHoldingRedeemSubmit(); return true; }
      guideHoldingRedeemAllSubmit();
      return true;
    }
    if (/^(修改|改一下|重填|重新填写|重新输入)$/.test(plain)) { guideHoldingModify(); return true; }
    if (/^(取消|不|不要|算了|退出)$/.test(plain)) { guideHoldingCancel(); return true; }
    appendMessage(guideMessage('<p>请点击按钮，或直接回复「确认 / 修改 / 取消」。</p>'));
    scrollToBottom();
    return true;
  }

  // 兜底
  appendMessage(guideMessage('<p>需要赎回还是追加申购呢？</p>'));
  scrollToBottom();
  return true;
}

// 追加申购确认卡（风险等级不匹配时先提醒）
function guideHoldingSubConfirm() {
  var s = GUIDE_HOLDING;
  if (!s || !s.product) return;
  var prod = (mockData.products || []).filter(function (p) { return p.name === s.product.name; })[0] || {};
  var profile = guideWealthValidProfile();
  if (profile && Number(prod.riskLevel) > Number(profile.level) && !s.riskOverride) {
    s.stage = 'subRisk';
    appendMessage(guideMessage(
      '<p>该产品风险等级 <b>R' + prod.riskLevel + '</b>，高于您 <b>R' + profile.level + ' ' + guideHoldingEsc(profile.name) + '</b>的风险承受等级，是否追加申购？</p>' +
      '<div class="guide-chips">' +
      '<button class="guide-chip" onclick="guideHoldingSubSubmitAsRisk()">仍然追加</button>' +
      '<button class="guide-chip" onclick="guideHoldingCancel()">取消</button>' +
      '</div>'
    ));
    scrollToBottom();
    return;
  }
  s.stage = 'subConfirm';
  appendMessage(guideMessage(
    '<p>确认对【<b>' + guideHoldingEsc(s.product.name) + '</b>】追加申购 <b>' + guidePlainMoney(s.amount) + '</b> 元，默认从活期主账户（尾号' +
    guideHoldingAccountTail() + '）扣款，请确认</p>' +
    (s.riskOverride ? '<p class="guide-tip">⚠️ 该产品风险等级高于你的风险承受能力，已按你的确认继续。</p>' : '') +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideHoldingSubSubmit()">确认申购</button>' +
    '<button class="guide-chip" onclick="guideHoldingModify()">修改</button>' +
    '<button class="guide-chip" onclick="guideHoldingCancel()">取消</button>' +
    '</div>'
  ));
  scrollToBottom();
}

// 风险确认后继续
function guideHoldingSubSubmitAsRisk() {
  var s = GUIDE_HOLDING;
  if (!s) return;
  s.riskOverride = true;
  s.stage = 'subSlots';
  guideHoldingSubConfirm();
}

async function guideHoldingSubSubmit() {
  var s = GUIDE_HOLDING;
  if (!s || s.stage !== 'subConfirm') return;
  var name = s.product.name;
  var amount = Number(s.amount) || 0;
  var prod = (mockData.products || []).filter(function (p) { return p.name === name; })[0] || {};
  var minAmount = Number(prod.minAmount) || 0;
  var available = Number(mockData.userProfile && mockData.userProfile.debitCard && mockData.userProfile.debitCard.available) || 0;

  if (amount < minAmount) {
    appendMessage(guideMessage('<p>追加申购金额不能低于起购金额 ¥' + guidePlainMoney(minAmount) + '，请重新告诉我金额。</p>'));
    scrollToBottom();
    s.amount = 0;
    s.stage = 'subSlots';
    return;
  }
  if (amount > available) {
    appendMessage(guideMessage('<p>可用余额 ¥' + guidePlainMoney(available) + ' 不足本次追加申购金额，请调整金额。</p>'));
    scrollToBottom();
    s.amount = 0;
    s.stage = 'subSlots';
    return;
  }

  GUIDE_HOLDING = null;
  var risk = null;
  if (typeof verifyAmountRisk === 'function') {
    risk = await verifyAmountRisk(amount, '追加申购', [{ tool: 'wealth.buy', args: { product: name, amount: amount } }]);
    if (risk && risk.pendingReview) return;
    if (!risk || !risk.ok) {
      appendMessage(guideMessage('<p>已取消本次追加申购，账户未发生扣款。</p>'));
      scrollToBottom();
      return;
    }
  }
  var res = await callAgentTool('wealth.buy', { product: name, amount: amount });
  if (res && res.ok !== false) {
    appendMessage(guideMessage('<p>追加申购提交成功。</p>'));
  } else {
    appendMessage(guideMessage('<p>追加申购失败：' + guideHoldingEsc((res && res.summary) || '业务执行异常') + '</p>'));
  }
  scrollToBottom();
}

// 赎回确认卡（先查封闭期与持有金额）
function guideHoldingRedeemConfirm() {
  var s = GUIDE_HOLDING;
  if (!s || !s.product) return;
  var h = s.product;

  if (guideHoldingClosed(h)) {
    appendMessage(guideMessage('<p>【<b>' + guideHoldingEsc(h.name) + '</b>】当前处于封闭期，暂不支持赎回。</p>'));
    scrollToBottom();
    s.product = null;
    s.amount = null;
    s.full = false;
    s.stage = 'redeemSlots';
    return;
  }

  var amount = s.full ? Number(h.amount) || 0 : Number(s.amount) || 0;
  if (amount <= 0) {
    appendMessage(guideMessage('<p>请问您赎回多少金额？全额赎回可直接回复“全额”</p>'));
    scrollToBottom();
    s.stage = 'redeemSlots';
    return;
  }
  if (amount > Number(h.amount)) {
    appendMessage(guideMessage('<p>赎回金额不能大于持有金额 ¥' + guidePlainMoney(h.amount) + '，请重新告诉我金额。</p>'));
    scrollToBottom();
    s.amount = 0;
    s.full = false;
    return;
  }

  s.stage = 'redeemConfirm';
  s.amount = amount;
  appendMessage(guideMessage(
    '<p>确认赎回【<b>' + guideHoldingEsc(h.name) + '</b>】<b>' + guidePlainMoney(amount) + '</b> 元，资金将返回活期主账户（尾号' +
    guideHoldingAccountTail() + '），请确认</p>' +
    (s.full ? '<p class="guide-tip">本次为全额赎回，赎回后该持仓清空。</p>' : '') +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideHoldingRedeemSubmit()">确认赎回</button>' +
    '<button class="guide-chip" onclick="guideHoldingModify()">修改</button>' +
    '<button class="guide-chip" onclick="guideHoldingCancel()">取消</button>' +
    '</div>'
  ));
  scrollToBottom();
}

async function guideHoldingRedeemSubmit() {
  var s = GUIDE_HOLDING;
  if (!s || s.stage !== 'redeemConfirm' || !s.product) return;
  var name = s.product.name;
  var amount = Number(s.amount) || 0;
  GUIDE_HOLDING = null;
  var res = await callAgentTool('wealth.redeem', { product: name, amount: amount });
  if (res && res.ok !== false) {
    appendMessage(guideMessage('<p>赎回提交成功，资金已回到活期主账户。</p>'));
  } else {
    appendMessage(guideMessage('<p>赎回失败：' + guideHoldingEsc((res && res.summary) || '业务执行异常') + '</p>'));
  }
  scrollToBottom();
}

// 一键赎回
function guideHoldingRedeemAllConfirm() {
  var s = GUIDE_HOLDING;
  if (!s) return;
  s.stage = 'redeemAllConfirm';
  var closedNames = guideHoldingList().filter(guideHoldingClosed).map(function (h) { return h.name; });
  appendMessage(guideMessage(
    '<p>确认一键发起全部可赎回产品的赎回申请；封闭期内产品暂不支持赎回，资金到期后返还活期主账户（尾号' +
    guideHoldingAccountTail() + '），是否继续？</p>' +
    (closedNames.length ? '<p class="guide-tip">封闭期产品：' + guideHoldingEsc(closedNames.join('、')) + '</p>' : '') +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideHoldingRedeemAllSubmit()">确认一键赎回</button>' +
    '<button class="guide-chip" onclick="guideHoldingCancel()">取消</button>' +
    '</div>'
  ));
  scrollToBottom();
}

async function guideHoldingRedeemAllSubmit() {
  var s = GUIDE_HOLDING;
  if (!s || s.stage !== 'redeemAllConfirm') return;
  var list = guideHoldingList().slice();
  var done = [], closed = [];
  GUIDE_HOLDING = null;
  for (var i = 0; i < list.length; i++) {
    var h = list[i];
    if (guideHoldingClosed(h)) { closed.push(h.name); continue; }
    var res = await callAgentTool('wealth.redeem', { product: h.name, amount: h.amount });
    if (res && res.ok !== false) done.push(h.name);
  }
  appendMessage(guideMessage(
    '<p>一键赎回指令已提交，可赎回产品受理成功，封闭期产品无法赎回。</p>' +
    (done.length ? '<p class="guide-tip">已受理：' + guideHoldingEsc(done.join('、')) + '</p>' : '') +
    (closed.length ? '<p class="guide-tip">封闭期未赎回：' + guideHoldingEsc(closed.join('、')) + '</p>' : '')
  ));
  scrollToBottom();
}

function guideHoldingModify() {
  var s = GUIDE_HOLDING;
  if (!s) return;
  if (s.mode === 'sub') {
    // 清空旧金额，避免只改产品名时用旧金额直接重新确认
    s.amount = null;
    s.riskOverride = false;
    s.stage = 'subSlots';
    appendMessage(guideMessage('<p>请重新告诉我产品名称和申购金额（当前产品：' +
      guideHoldingEsc(s.product ? s.product.name : '未选') + '）。</p>'));
  } else {
    s.amount = null;
    s.full = false;
    s.stage = 'redeemSlots';
    appendMessage(guideMessage('<p>请重新告诉我赎回的产品名称和金额（当前产品：' +
      guideHoldingEsc(s.product ? s.product.name : '未选') + '，可回复“全额”）。</p>'));
  }
  scrollToBottom();
}

function guideHoldingCancel() {
  GUIDE_HOLDING = null;
  appendMessage(guideMessage('<p>已取消，持仓保持不变。</p>'));
  scrollToBottom();
}

// ------------------------------ 订阅：添加订阅 / 订阅管理 / 取消订阅 ------------------------------
var GUIDE_SUB = null;

var SUB_PRESETS = [
  { id: 'music', name: '某易云 VIP', prices: { '/月': 25, '/季': 60, '/年': 150 } },
  { id: 'video', name: '某讯 VIP', prices: { '/月': 30, '/季': 80, '/年': 200 } },
  { id: 'cloud', name: '某度网盘 VIP', prices: { '/月': 40, '/季': 120, '/年': 300 } }
];
var SUB_CYCLE_TEXT = { '/月': '按月扣费', '/季': '按季扣费', '/年': '按年扣费' };

function guideSubEsc(v) {
  return (typeof escapeHtml === 'function') ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v);
}

function guideSubActive() {
  if (!Array.isArray(mockData.subscriptions)) mockData.subscriptions = [];
  return mockData.subscriptions;
}

// 订阅名比较统一忽略空格和大小写：「某易云 VIP」与「某易云VIP」视为同一服务
function guideSubNormName(n) {
  return String(n == null ? '' : n).replace(/\s+/g, '').toLowerCase();
}

function guideSubCycleText(cycle) {
  return SUB_CYCLE_TEXT[cycle] || cycle || '';
}

function guideSubHistoryList() {
  var u = mockData.userProfile || (mockData.userProfile = {});
  if (!Array.isArray(u.subscriptionHistory)) u.subscriptionHistory = [];
  return u.subscriptionHistory;
}

// 从一句话里识别订阅服务（预设服务 + 现有订阅名）
function guideSubFindService(text) {
  var t = String(text || '');
  if (!t) return null;
  // ① 预设服务全名
  var preset = SUB_PRESETS.filter(function (p) {
    var key = p.name.replace(' VIP', '').replace('VIP', '');
    return t.indexOf(key) !== -1;
  })[0];
  if (preset) return { kind: 'preset', preset: preset, name: preset.name.replace(/\s+/g, '') };

  // ② 现有订阅全名（优先于关键词，避免「某视频平台VIP」被当成「某讯 VIP」）
  var active = guideSubActive().filter(function (s) { return t.indexOf(s.name) !== -1; })[0];
  if (active) return { kind: 'active', sub: active, name: active.name };
  var fuzzy = guideSubActive().filter(function (s) {
    var core = String(s.name || '').replace(/VIP|会员/g, '');
    return core && t.indexOf(core) !== -1;
  })[0];
  if (fuzzy) return { kind: 'active', sub: fuzzy, name: fuzzy.name };

  // ③ 预设服务关键词（易云 / 某讯 / 网盘…）
  if (/易云|网易云|音乐/.test(t)) return { kind: 'preset', preset: SUB_PRESETS[0], name: SUB_PRESETS[0].name };
  if (/某讯|腾讯|视频/.test(t)) return { kind: 'preset', preset: SUB_PRESETS[1], name: SUB_PRESETS[1].name };
  if (/某度|百度|网盘/.test(t)) return { kind: 'preset', preset: SUB_PRESETS[2], name: SUB_PRESETS[2].name };
  return null;
}

function guideSubParseCycle(text) {
  var t = String(text || '');
  if (/按年|每年|年卡|包年|一年|\/年/.test(t)) return '/年';
  if (/按季|每季|季卡|包季|三个月|季度|\/季/.test(t)) return '/季';
  if (/按月|每月|月卡|包月|一个月|\/月/.test(t)) return '/月';
  return null;
}

// 「是 / 否」→ 开启 / 关闭；本地认不出再问模型
function guideSubYesNo(text) {
  var t = String(text || '').trim().replace(/[。.!！?？,，\s]/g, '');
  if (!t) return null;
  if (/(不开启|不要|不用|不需要|关闭|否|不|别)/.test(t)) return false;
  if (/(开启|打开|需要|要|是|好|可以|续费)/.test(t)) return true;
  return null;
}

async function guideSubAIFlag(text) {
  var got = await guideAISlots(
    text,
    '你是银行 App 的选项解析器。系统在问「是否开启自动续费」，用户可能回答是/否/开启/关闭/算了。' +
    '只输出 JSON：{"autoRenew": true|false|null}。同意→true，不同意→false，判断不出→null。',
    function (o) {
      if (!o || o.autoRenew === null || o.autoRenew === undefined) return null;
      return { autoRenew: o.autoRenew === true };
    }
  );
  return got ? got.autoRenew : null;
}

// 一句话里同时抽服务与周期（本地失败时交给模型）
async function guideSubAIExtract(text) {
  return guideAISlots(
    text,
    '你是银行 App 的订阅解析器。可订阅服务只有：某易云 VIP、某讯 VIP、某度网盘 VIP。' +
    '扣费周期只有：按月扣费(/月)、按季扣费(/季)、按年扣费(/年)。' +
    '只输出 JSON：{"service":"服务名或空","cycle":"/月|/季|/年或空"}。',
    function (o) {
      if (!o) return null;
      var svc = o.service ? String(o.service) : '';
      var preset = SUB_PRESETS.filter(function (p) {
        var key = p.name.replace(' VIP', '');
        return svc && (svc.indexOf(key) !== -1 || key.indexOf(svc.replace(/VIP/i, '').trim()) !== -1);
      })[0] || null;
      var cycle = ['/月', '/季', '/年'].indexOf(o.cycle) !== -1 ? o.cycle : null;
      if (!preset && !cycle) return null;
      return { preset: preset, cycle: cycle };
    }
  );
}

function guideSubPresetRows() {
  return SUB_PRESETS.map(function (p) {
    return '<div class="report-row"><span>' + guideSubEsc(p.name) + '</span>' +
      '<b>月 ¥' + p.prices['/月'] + ' / 季 ¥' + p.prices['/季'] + ' / 年 ¥' + p.prices['/年'] + '</b></div>';
  }).join('');
}

// —— 添加订阅 ——
function guideStartSubAdd() {
  guideResetAllSessions();
  GUIDE_SUB = { mode: 'add', stage: 'slots', preset: null, cycle: null, autoRenew: null, listShown: true };
  currentModule = 'life';
  appendMessage(guideMessage(
    '<p>可订阅的服务如下：</p>' +
    '<div class="report-panel"><div class="report-panel-title">可订阅服务</div>' + guideSubPresetRows() + '</div>' +
    '<p>请选择订阅服务与扣费周期。</p>' +
    '<p class="guide-tip">扣费周期：按月扣费 / 按季扣费 / 按年扣费</p>'
  ));
  scrollToBottom();
}

async function guideSubAddStep(text) {
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
    appendMessage(guideMessage('<p>「' + guideSubEsc(svc.name) + '」已在订阅列表中，无需重复添加。</p>'));
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
  // 入口刚展示过服务和价格（含扣费周期说明），这里不再重复一遍
  if (s.listShown) { s.listShown = false; return true; }
  appendMessage(guideMessage('<p>请选择订阅服务与扣费周期。</p>' +
    '<div class="report-panel"><div class="report-panel-title">可订阅服务</div>' + guideSubPresetRows() + '</div>'));
  scrollToBottom();
  return true;
}

function guideSubAddRenewChoice(yes) {
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
    '<div class="data-row"><span class="data-label">订阅服务</span><span class="data-value">' + guideSubEsc(s.preset.name) + '</span></div>' +
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
  var dup = guideSubActive().filter(function (x) { return guideSubNormName(x.name) === guideSubNormName(preset.name); })[0];
  if (dup) {
    appendMessage(guideMessage('<p>「<b>' + guideSubEsc(preset.name) + '</b>」已有有效订阅（' +
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
      scrollToBottom();
      return;
    }
  }
  var cycleText = cycle === '/月' ? '包月' : cycle === '/季' ? '包季' : '包年';
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
  var ids = guideSubActive().map(function (x) { return Number(x.id) || 0; });
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
  appendMessage(guideMessage(
    '<p>' + guideSubEsc(preset.name) + ' 添加成功，扣费周期' + guideSubCycleText(cycle) + '，自动续费' + (autoRenew ? '已开启' : '已关闭') + '。</p>' +
    '<div class="guide-chips"><button class="guide-chip" onclick="guideStartSubManage()">查看订阅管理</button></div>' +
    '<p class="guide-tip">本系统为模拟演示，不等同第三方平台真实会员状态。</p>'
  ));
  scrollToBottom();
}

// —— 订阅管理（自动续费）——
// 订阅管理：统一入口，先问要做什么，再分别进入添加 / 取消 / 自动续费
function guideStartSubManage() {
  guideResetAllSessions();
  GUIDE_SUB = { mode: 'choose', stage: 'choose' };
  currentModule = 'life';
  appendMessage(guideMessage(
    '<p>您想要添加订阅、取消订阅，还是管理自动续费？</p>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideSubChoose(\'add\')">添加订阅</button>' +
    '<button class="guide-chip" onclick="guideSubChoose(\'cancel\')">取消订阅</button>' +
    '<button class="guide-chip" onclick="guideSubChoose(\'renew\')">管理自动续费</button>' +
    '</div>' +
    '<p class="guide-tip">本系统为模拟演示，不等同第三方平台真实会员状态。</p>'
  ));
  scrollToBottom();
}

// 三个分支：添加（先展示可订阅产品）/ 取消（先展示现有订阅）/ 自动续费（先展示现有订阅）
function guideSubChoose(kind) {
  if (kind === 'add') { guideStartSubAdd(); return; }
  if (kind === 'cancel') { guideStartSubCancel(); return; }
  guideStartSubAutoRenew();
}

// 管理自动续费：先展示现有订阅，再问要开启/关闭哪一项
function guideStartSubAutoRenew() {
  guideResetAllSessions();
  GUIDE_SUB = { mode: 'manage', stage: 'slots', target: null, newAutoRenew: null, listShown: true };
  currentModule = 'life';
  var list = guideSubActive();
  var history = guideSubHistoryList();
  if (!list.length) {
    appendMessage(guideMessage('<p>目前没有可管理自动续费的有效订阅。</p>' +
      '<div class="guide-chips"><button class="guide-chip" onclick="guideStartSubAdd()">添加新订阅</button></div>'));
    scrollToBottom();
    return;
  }
  var rows = list.map(function (sub) {
    return '<div class="report-row"><span>' + guideSubEsc(sub.name) + '・' + guideSubCycleText(sub.cycle) + '</span>' +
      '<b>自动续费：' + (sub.autoRenew !== false ? '开启' : '关闭') + '</b></div>';
  }).join('');
  var historyHtml = history.length ? history.map(function (h) {
    return '<div class="report-row"><span>' + guideSubEsc(h.name) + '・' + guideSubCycleText(h.cycle) + '・自动续费：' + (h.autoRenew ? '开启' : '关闭') + '</span>' +
      '<b>已取消・' + guideSubEsc(h.cancelledAt) + '</b></div>';
  }).join('') : '';
  appendMessage(guideMessage(
    '<p>当前有效订阅如下：</p>' +
    '<div class="report-panel"><div class="report-panel-title">有效订阅</div>' + rows + '</div>' +
    (historyHtml ? '<div class="report-panel" style="margin-top:10px;"><div class="report-panel-title">历史记录</div>' + historyHtml + '</div>' : '') +
    '<p>需要取消或开启哪一项的自动续费？例如「关闭某讯 VIP 的自动续费」。</p>'
  ));
  scrollToBottom();
}
async function guideSubManageStep(text) {
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
  if (!target && svc) target = guideSubActive().filter(function (x) { return guideSubNormName(x.name) === guideSubNormName(svc.name); })[0] || null;
  if (target) s.target = target;
  if (want !== null) s.newAutoRenew = want;

  if (!s.target) {
    // 刚刚已经展示过订阅清单（入口那句「需要取消或开启哪一项」），这里不再重复追问
    if (s.listShown && !svc) { s.listShown = false; return true; }
    var hint = svc ? ('没有找到「' + guideSubEsc(svc.name) + '」的有效订阅。') : '';
    var names = guideSubActive().map(function (x) { return x.name; }).join('、') || '暂无订阅';
    appendMessage(guideMessage('<p>' + hint + '</p><p>请告诉我要管理哪一项订阅的自动续费。</p>' +
      '<p class="guide-tip">当前有效订阅：' + guideSubEsc(names) + '</p>'));
    scrollToBottom();
    return true;
  }
  if (s.newAutoRenew === null) {
    appendMessage(guideMessage('<p>是开启还是关闭「' + guideSubEsc(s.target.name) + '」的自动续费？</p>' +
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

function guideSubManageConfirm(want) {
  var s = GUIDE_SUB;
  if (!s || !s.target) return;
  s.newAutoRenew = want;
  s.stage = 'confirm';
  s.boxId = s.boxId || ('sub-manage-confirm-' + Date.now());
  var cur = s.target.autoRenew !== false;
  appendMessage(guideMessage(
    '<div id="' + s.boxId + '">' +
    '<div class="data-card"><div class="data-card-title">确认修改自动续费</div>' +
    '<div class="data-row"><span class="data-label">订阅服务</span><span class="data-value">' + guideSubEsc(s.target.name) + '</span></div>' +
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
  var sub = guideSubActive().filter(function (x) { return x.id === s.target.id; })[0] || s.target;
  sub.autoRenew = s.newAutoRenew === true;
  sub.detail = String(sub.detail || '').replace(/自动续费|到期取消/, sub.autoRenew ? '自动续费' : '到期取消');
  saveUserData();
  var msg = sub.name + ' 的自动续费' + (sub.autoRenew ? '已开启' : '已关闭') + '。';
  guideConfirmCardDone(s.boxId, '已修改');
  GUIDE_SUB = null;
  appendMessage(guideMessage('<p>' + guideSubEsc(msg) + '</p>' +
    (sub.autoRenew ? '' : '<p class="guide-tip">关闭自动续费后不再扣费，权益可用到本付费周期结束。</p>')));
  scrollToBottom();
}

// —— 取消订阅 ——
function guideStartSubCancel() {
  guideResetAllSessions();
  GUIDE_SUB = { mode: 'cancel', stage: 'slots', target: null };
  currentModule = 'life';
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
  var rows = list.map(function (sub) {
    return '<div class="report-row"><span>' + guideSubEsc(sub.name) + '</span><b>' +
      guideSubCycleText(sub.cycle) + '・' + (sub.autoRenew !== false ? '自动续费开启' : '自动续费关闭') + '</b></div>';
  }).join('');
  if (GUIDE_SUB && GUIDE_SUB.mode === 'cancel') GUIDE_SUB.listShown = true;
  appendMessage(guideMessage('<p>请选择你想要取消的订阅项目。</p>' +
    '<div class="report-panel"><div class="report-panel-title">有效订阅</div>' + rows + '</div>'));
  scrollToBottom();
}

async function guideSubCancelStep(text) {
  var t = String(text || '').trim();
  var s = GUIDE_SUB;
  var svc = guideSubFindService(t);
  if (!svc) {
    var ai = await guideSubAIExtract(t);
    if (GUIDE_SUB !== s) return true;
    if (ai && ai.preset) svc = { kind: 'preset', preset: ai.preset, name: ai.preset.name };
  }
  var target = svc && svc.kind === 'active' ? svc.sub : (svc ? guideSubActive().filter(function (x) { return guideSubNormName(x.name) === guideSubNormName(svc.name); })[0] : null);
  if (!target) {
    if (s.listShown && !svc) { s.listShown = false; return true; }
    var hint2 = svc ? ('没有找到「' + guideSubEsc(svc.name) + '」的有效订阅。') : '';
    var names2 = guideSubActive().map(function (x) { return x.name; }).join('、') || '暂无订阅';
    appendMessage(guideMessage('<p>' + hint2 + '</p><p>请选择你想要取消的订阅项目。</p>' +
      '<p class="guide-tip">当前有效订阅：' + guideSubEsc(names2) + '</p>'));
    scrollToBottom();
    return true;
  }
  s.target = target;
  s.stage = 'confirm';
  appendMessage(guideMessage(
    '<div class="data-card"><div class="data-card-title">确认取消订阅</div>' +
    '<div class="data-row"><span class="data-label">订阅服务</span><span class="data-value">' + guideSubEsc(target.name) + '</span></div>' +
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
  mockData.subscriptions = guideSubActive().filter(function (x) { return x.id !== target.id; });
  guideSubHistoryList().unshift({
    name: target.name,
    cycle: target.cycle,
    autoRenew: target.autoRenew !== false,
    cancelledAt: new Date().toLocaleString('zh-CN')
  });
  if (typeof apiSubscriptionCancel === 'function') apiSubscriptionCancel(target.id);
  saveUserData();
  GUIDE_SUB = null;
  appendMessage(guideMessage('<p>' + guideSubEsc(target.name) + ' 已完成取消操作。</p>' +
    '<div class="guide-chips"><button class="guide-chip" onclick="guideStartSubManage()">查看订阅总览</button></div>'));
  scrollToBottom();
}

function guideSubCancelOp() {
  var boxId = GUIDE_SUB && GUIDE_SUB.boxId;
  GUIDE_SUB = null;
  if (!guideConfirmCardCollapse(boxId, '未执行取消，订阅状态保持原样。')) {
    appendMessage(guideMessage('<p>未执行取消，订阅状态保持原样。</p>'));
  }
  scrollToBottom();
}

// 订阅会话统一入口（异步：自动续费的是/否可能要问模型）
async function guideSubSession(t) {
  var s = GUIDE_SUB;
  if (!s) return true;
  var plain = String(t || '').replace(/[吧呢啊呀。.!！?？\s]/g, '');

  // 统一入口：先选要做哪件事
  if (s.mode === 'choose') {
    if (/^(返回|菜单|返回菜单|退出|取消|不看了)$/.test(plain)) {
      GUIDE_SUB = null;
      guideBackToMenu();
      return true;
    }
    if (/(添加|新增|开通|订一个|买一个)/.test(t)) { guideSubChoose('add'); return true; }
    if (/(取消订阅|退订|终止|不要了|退掉)/.test(t)) { guideSubChoose('cancel'); return true; }
    if (/(自动续费|续费|管理|开启|关闭)/.test(t)) {
      // 「关闭某讯 VIP 的自动续费」这类直接说完整的，直接进自动续费流程
      var svcQuick = guideSubFindService(t);
      if (svcQuick) { guideStartSubAutoRenew(); return guideSubManageStep(t); }
      guideSubChoose('renew');
      return true;
    }
    guideFlowLockedNotice('请选择：添加订阅 / 取消订阅 / 管理自动续费。');
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
    guideBackToMenu();
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

// ------------------------------ 鲜花订购：下单 / 查看 / 修改 / 取消 ------------------------------
var GUIDE_FLOWER = null;

// 与生日联系人里的推荐花价保持一致，避免生日卡显示 ¥168、下单卡显示 ¥229
var FLOWER_BOUQUETS = [
  { name: '简约玫瑰', price: 299 },
  { name: '向日葵花束', price: 168 },
  { name: '混搭小花束', price: 159 },
  { name: '康乃馨礼盒', price: 128 },
  { name: '百合礼盒', price: 199 },
  { name: '郁金香花束', price: 229 }
];
var FLOWER_SLOTS = [
  { key: 'morning', label: '09:00–12:00', text: '上午9-12点' },
  { key: 'afternoon', label: '14:00–18:00', text: '下午14-18点' },
  { key: 'evening', label: '19:00–21:00', text: '晚间19-21点' }
];
var FLOWER_CANCEL_FEE = 20;
// 蛋糕加购（生日花礼一起送）
var FLOWER_CAKES = [
  { name: '无蛋糕', price: 0 },
  { name: '6寸水果蛋糕', price: 168 },
  { name: '8寸奶油蛋糕', price: 228 }
];

function guideFlowerCake(name) {
  return FLOWER_CAKES.filter(function (x) { return x.name === name; })[0] || FLOWER_CAKES[0];
}

// 订单总价 = 花束 + 蛋糕
function guideFlowerOrderTotal(o) {
  var bq = guideFlowerBouquet(o && o.bouquet);
  var ck = guideFlowerCake(o && o.cake);
  return { bouquet: bq, cake: ck, total: (bq ? bq.price : 0) + (ck ? ck.price : 0) };
}

function guideFlowerEsc(v) {
  return (typeof escapeHtml === 'function') ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v);
}

function guideFlowerDateStr(days) {
  var d = new Date();
  d.setDate(d.getDate() + (Number(days) || 0));
  return d.getFullYear() + '-' + guidePad2(d.getMonth() + 1) + '-' + guidePad2(d.getDate());
}

// 订单表：首次访问时放两条演示记录（一条待配送、一条已完成）
function guideFlowerOrders() {
  var u = mockData.userProfile || (mockData.userProfile = {});
  if (!Array.isArray(u.flowerOrders)) {
    u.flowerOrders = [
      {
        id: 'F' + Date.now() + '1', recipient: '李四', phone: '13800138000',
        address: '清远市清城区XX小区', bouquet: '简约玫瑰', price: 199,
        date: guideFlowerDateStr(4), slot: 'afternoon', card: '生日快乐',
        payMethod: '储蓄卡', status: '待配送', createdAt: new Date().toLocaleString('zh-CN')
      },
      {
        id: 'F' + Date.now() + '2', recipient: '王五', phone: '13700137000',
        address: '清远市清城区YY小区', bouquet: '康乃馨礼盒', price: 259,
        date: '2026-10-20', slot: 'morning', card: '',
        payMethod: '储蓄卡', status: '已完成', createdAt: '2026/10/18 09:00:00'
      }
    ];
  }
  return u.flowerOrders;
}

function guideFlowerSlot(slotKey) {
  return FLOWER_SLOTS.filter(function (s) { return s.key === slotKey; })[0] || FLOWER_SLOTS[0];
}

function guideFlowerBouquet(name) {
  if (!name) return null;
  return FLOWER_BOUQUETS.filter(function (b) {
    return name.indexOf(b.name) !== -1 || b.name.indexOf(name) !== -1 ||
      (name.indexOf('玫瑰') !== -1 && b.name === '简约玫瑰') ||
      (name.indexOf('向日葵') !== -1 && b.name === '向日葵花束') ||
      (name.indexOf('混搭') !== -1 && b.name === '混搭小花束') ||
      (name.indexOf('康乃馨') !== -1 && b.name === '康乃馨礼盒') ||
      (name.indexOf('百合') !== -1 && b.name === '百合礼盒') ||
      (name.indexOf('郁金香') !== -1 && b.name === '郁金香花束');
  })[0] || null;
}

function guideFlowerDisplayDate(date) {
  if (!date) return '';
  var parts = String(date).split('-');
  return Number(parts[1]) + '月' + Number(parts[2]) + '日';
}

// 距离配送开始还有多少小时
function guideFlowerHoursLeft(order) {
  var slot = guideFlowerSlot(order && order.slot);
  var start = String((order && order.date) || '') + ' ' + String(slot.label).slice(0, 5);
  var t = Date.parse(start.replace(/-/g, '/'));
  if (isNaN(t)) return 999;
  return (t - Date.now()) / 3600000;
}

// 确认卡阶段的单字段修改：地址 / 电话 / 收花人 / 花束 / 日期 / 时段 / 贺卡
function guideFlowerApplyEdit(text) {
  var s = GUIDE_FLOWER;
  if (!s || !s.order) return null;
  var o = s.order;
  var t = String(text || '').trim();
  if (!t) return null;
  var m;

  // 收货地址
  if (/(收货地址|地址)/.test(t)) {
    m = t.match(/(?:收货地址|地址)[^，,。;；]*?(?:改为|改成|换成|设为|是|为|成)\s*([^，,。;；]+)/);
    if (!m) m = t.match(/(?:收货地址|地址)\s*[:：]\s*([^，,。;；]+)/);
    if (m && m[1] && m[1].trim()) {
      o.address = m[1].trim();
      return '收货地址 ' + o.address;
    }
  }

  // 联系电话
  if (/(手机号|电话|联系方式)/.test(t)) {
    m = t.match(/(1\d{10}|1\d{2}\*{4}\d{4})/);
    if (m) { o.phone = m[1]; return '联系电话 ' + o.phone; }
  }

  // 贺卡留言
  if (/(贺卡|留言)/.test(t)) {
    m = t.match(/(?:贺卡留言|贺卡|留言)[^，,。;；]*?(?:改为|改成|换成|设为|是|为)\s*([^，,。;；]+)/);
    if (m && m[1]) { o.card = m[1].trim().slice(0, 30); return '贺卡留言 ' + o.card; }
  }

  // 花束款式
  if (/(花束|换成|改为|改成|礼盒)/.test(t)) {
    var bq = guideFlowerBouquet(t);
    if (bq) { o.bouquet = bq.name; return '花束款式 ' + bq.name; }
  }

  // 配送时段
  if (/(上午|早上)/.test(t)) { o.slot = 'morning'; return '配送时段 上午9-12点'; }
  if (/(下午)/.test(t)) { o.slot = 'afternoon'; return '配送时段 下午14-18点'; }
  if (/(晚间|晚上|傍晚)/.test(t)) { o.slot = 'evening'; return '配送时段 晚间19-21点'; }

  // 配送日期（支持「改到11月5日」「10月30号」）
  if (/(日期|改到|改成|送到)/.test(t)) {
    m = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
    if (m) {
      var y = new Date().getFullYear();
      var mm2 = Number(m[1]), dd2 = Number(m[2]);
      if (mm2 >= 1 && mm2 <= 12 && dd2 >= 1 && dd2 <= 31) {
        var cand = new Date(y, mm2 - 1, dd2);
        var todayMid2 = new Date(); todayMid2.setHours(0, 0, 0, 0);
        if (cand < todayMid2) cand = new Date(y + 1, mm2 - 1, dd2);
        o.date = cand.getFullYear() + '-' + guidePad2(String(cand.getMonth() + 1)) + '-' + guidePad2(String(cand.getDate()));
        return '配送日期 ' + guideFlowerDisplayDate(o.date);
      }
    }
  }

  return null;
}
// 从一句话里抽鲜花订单的各个字段
function guideFlowerParse(text) {
  var raw = String(text || '');
  var out = { recipient: '', phone: '', address: '', bouquet: '', date: '', slot: '', card: '', payMethod: '' };

  var pm = raw.match(/1\d{10}/);
  if (pm) out.phone = pm[0];

  if (/信用卡/.test(raw)) out.payMethod = '信用卡';
  else if (/储蓄卡|借记卡/.test(raw)) out.payMethod = '储蓄卡';

  var cm = raw.match(/(?:写贺卡|贺卡留言|贺卡|留言)\s*[:：]?\s*([^，,。；;]*)/);
  if (cm && cm[1]) out.card = cm[1].trim().slice(0, 30);

  var b = guideFlowerBouquet(raw);
  if (b) out.bouquet = b.name;

  if (/下午|14-18|14:00/.test(raw)) out.slot = 'afternoon';
  else if (/晚上|晚间|19-21|19:00/.test(raw)) out.slot = 'evening';
  else if (/上午|早上|9-12|09:00/.test(raw)) out.slot = 'morning';

  var dm = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dm) out.date = dm[1] + '-' + guidePad2(dm[2]) + '-' + guidePad2(dm[3]);
  else if (/今天|今日/.test(raw)) out.date = guideFlowerDateStr(0);
  else if (/后天/.test(raw)) out.date = guideFlowerDateStr(2);
  else if (/明天|明日/.test(raw)) out.date = guideFlowerDateStr(1);
  else {
    var md = raw.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
    if (md) out.date = guideMonthDayDate(md[1], md[2]);
  }

  // 地址：取包含行政区/街道/小区的片段
  var segs = raw.split(/[，,。；;\n]/).map(function (x) { return x.trim(); }).filter(Boolean);
  var used = [];
  segs.forEach(function (seg) {
    if (!out.phone && /1\d{10}/.test(seg)) { out.phone = seg.match(/1\d{10}/)[0]; used.push(seg); return; }
    if (!out.address && /(市|区|县|路|街|小区|号|楼|室|大道|花园|苑)/.test(seg) &&
      !/月|日|点|卡|玫瑰|向日葵|康乃馨|混搭/.test(seg)) {
      out.address = seg; used.push(seg);
    }
  });

  // 收花人：「送给 / 给 / 收花人：X」或剩下的短中文片段
  var rm = raw.match(/(?:送给|送|给|收花人|收件人)\s*[:：]?\s*([\u4e00-\u9fa5·]{2,4})/);
  if (rm) out.recipient = rm[1];
  if (!out.recipient) {
    var leftover = segs.filter(function (seg) { return used.indexOf(seg) === -1; })
      .map(function (seg) { return seg.replace(/(送给|送|给|收花人|收件人)/g, '').trim(); })
      .filter(function (seg) { return /^[\u4e00-\u9fa5·]{2,4}$/.test(seg); })[0];
    if (leftover) out.recipient = leftover;
  }

  // 剩下的短文本若不像地址/花束/时间，当作贺卡留言
  if (!out.card) {
    var maybe = segs.filter(function (seg) {
      var cleaned = seg.replace(/^(送给|送|给|收花人|收件人)\s*[:：]?\s*/, '').trim();
      if (out.recipient && cleaned === out.recipient) return false;
      if (used.indexOf(seg) !== -1) return false;
      if (/1\d{10}/.test(seg)) return false;
      if (/月|日|点|卡|玫瑰|向日葵|康乃馨|混搭/.test(seg)) return false;
      if (/^(送给|送|给|收花人|收件人)/.test(seg)) return false;
      return /^[\u4e00-\u9fa5，,！!…\s]{2,30}$/.test(seg);
    })[0];
    if (maybe) out.card = maybe.trim().slice(0, 30);
  }

  return out;
}

function guideFlowerMissingPrompt(s) {
  var miss = [];
  if (!s.recipient) miss.push('收花人');
  if (!s.phone) miss.push('手机号');
  if (!s.address) miss.push('收货地址');
  if (!s.bouquet) miss.push('花束款式');
  if (!s.date || !s.slot) miss.push('配送日期和时段');
  if (!miss.length) return '';
  return '请提供' + miss.join('、') + '。';
}

// 允许收花的人：生日联系人（为空时退回通讯录联系人）
function guideFlowerContacts() {
  var b = (mockData.userProfile && mockData.userProfile.birthdayContacts) || [];
  if (b.length) return b.map(function (x) { return x.name; });
  return (mockData.contacts || []).map(function (x) { return x.name; });
}

function guideFlowerContactsText() {
  var names = guideFlowerContacts();
  return names.length ? names.join('、') : '暂无联系人';
}

// 生日鲜花（整合鲜花订购）：先展示生日联系人与近期生日，再给出订购入口
function guideStartBirthdayFlower() {
  guideResetAllSessions();
  currentModule = 'life';
  if (typeof showBirthdayReminder === 'function') showBirthdayReminder();
  appendMessage(guideMessage(
    '<p>鲜花订购已并入这里，只能为联系人下单。</p>' +
    '<p class="guide-tip">可选收花人：' + guideFlowerContactsText() + '</p>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideStartFlowerOrder()">订购鲜花</button>' +
    '<button class="guide-chip" onclick="guideStartFlowerList()">查看鲜花订单</button>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideStartFlowerOrder(opts) {
  guideResetAllSessions();
  var pre = opts || {};
  GUIDE_FLOWER = {
    mode: 'order', stage: 'slots',
    order: {
      recipient: pre.recipient || '', phone: pre.phone || '', address: pre.address || '',
      bouquet: pre.bouquet || '', date: pre.date || '', slot: pre.slot || '',
      card: pre.card || '', payMethod: '储蓄卡'
    },
    editing: null
  };
  currentModule = 'life';
  appendMessage(guideMessage(
    '<p>请告诉我收花人、手机号、收货地址、花束款式、配送日期和配送时段。</p>' +
    '<p class="guide-tip">可选花束：' + FLOWER_BOUQUETS.map(function (b) { return b.name; }).join('、') + '</p>' +
    '<p class="guide-tip">配送时段：' + FLOWER_SLOTS.map(function (s) { return s.text; }).join('、') + '</p>' +
    '<p class="guide-tip">只能为联系人下单，可选收花人：' + guideFlowerContactsText() + '</p>' +
    '<p class="guide-tip">默认使用储蓄卡支付，可随时改成信用卡。</p>'
  ));
  scrollToBottom();
}

// 同一收花人、同一配送日已有待配送订单 → 视为重复
function guideFlowerDuplicate(recipient, date) {
  if (!recipient || !date) return null;
  var list = guideFlowerOrders().filter(function (o) {
    return o && o.status === '待配送' && o.recipient === recipient && o.date === date;
  });
  return list[0] || null;
}

// 重复下单时的统一提示
function guideFlowerWarnDuplicate(order) {
  appendMessage(guideMessage(
    '<p>「' + guideFlowerEsc(order.recipient) + '」在 ' + guideFlowerDisplayDate(order.date) + ' 已有一束待配送的鲜花（' +
    guideFlowerEsc(order.bouquet) + (order.cake && order.cake !== '无蛋糕' ? ' + ' + guideFlowerEsc(order.cake) : '') +
    '），同一人同一天不能重复下单。</p>' +
    '<p class="guide-tip">如需更换款式，请先取消原订单再重新下单。</p>' +
    '<div class="guide-chips"><button class="guide-chip" onclick="guideStartFlowerList()">查看鲜花订单</button>' +
    '<button class="guide-chip" onclick="guideFlowerCancelStart(\'' + order.id + '\')">取消原订单</button></div>'
  ));
  scrollToBottom();
}
// 确认卡：字段都可直接点开修改（下拉 / 输入框 / 日期选择）
function guideFlowerOrderCard(s) {
  var o = s.order;
  var slot = guideFlowerSlot(o.slot);
  var contacts = guideFlowerContacts();
  var recipientOpts = contacts.map(function (n) {
    return '<option value="' + guideFlowerEsc(n) + '"' + (n === o.recipient ? ' selected' : '') + '>' + guideFlowerEsc(n) + '</option>';
  }).join('');
  var bouquetOpts = FLOWER_BOUQUETS.map(function (b) {
    return '<option value="' + guideFlowerEsc(b.name) + '"' + (b.name === o.bouquet ? ' selected' : '') + '>' +
      guideFlowerEsc(b.name) + '（¥' + b.price + '）</option>';
  }).join('');
  var slotOpts = FLOWER_SLOTS.map(function (x) {
    return '<option value="' + x.key + '"' + (x.key === o.slot ? ' selected' : '') + '>' + x.text + '</option>';
  }).join('');
  var payOpts = ['储蓄卡', '信用卡'].map(function (p) {
    return '<option value="' + p + '"' + (p === (o.payMethod === '信用卡' ? '信用卡' : '储蓄卡') ? ' selected' : '') + '>' + p + '</option>';
  }).join('');
  var cakeOpts = FLOWER_CAKES.map(function (x) {
    return '<option value="' + x.name + '"' + (x.name === (o.cake || '无蛋糕') ? ' selected' : '') + '>' +
      x.name + (x.price ? '（¥' + x.price + '）' : '') + '</option>';
  }).join('');
  var dateVal = o.date || guideFlowerDateStr(0);
  var tot = guideFlowerOrderTotal(o);
  var totalText = '花束 ¥' + (tot.bouquet ? tot.bouquet.price : 0) +
    (tot.cake && tot.cake.price ? ' + 蛋糕 ¥' + tot.cake.price : '') + ' = ¥' + tot.total;
  return '<div class="data-card flower-form"><div class="data-card-title">确认鲜花订单</div>' +
    '<div class="data-row"><span class="data-label">收花人</span><span class="data-value">' +
      '<select class="flower-input" id="flRecipient">' + recipientOpts + '</select></span></div>' +
    '<div class="data-row"><span class="data-label">联系电话</span><span class="data-value">' +
      '<input class="flower-input" id="flPhone" value="' + guideFlowerEsc(o.phone) + '" placeholder="收花人手机号"></span></div>' +
    '<div class="data-row"><span class="data-label">收货地址</span><span class="data-value">' +
      '<input class="flower-input" id="flAddress" value="' + guideFlowerEsc(o.address) + '" placeholder="详细收货地址"></span></div>' +
    '<div class="data-row"><span class="data-label">花束款式</span><span class="data-value">' +
      '<select class="flower-input" id="flBouquet" onchange="guideFlowerRefreshTotal()">' + bouquetOpts + '</select></span></div>' +
    '<div class="data-row"><span class="data-label">配送日期</span><span class="data-value">' +
      '<input class="flower-input" type="date" id="flDate" value="' + guideFlowerEsc(dateVal) + '" min="' + guideFlowerDateStr(0) + '"></span></div>' +
    '<div class="data-row"><span class="data-label">配送时段</span><span class="data-value">' +
      '<select class="flower-input" id="flSlot">' + slotOpts + '</select></span></div>' +
    '<div class="data-row"><span class="data-label">贺卡留言</span><span class="data-value">' +
      '<input class="flower-input" id="flCard" maxlength="30" value="' + guideFlowerEsc(o.card || '') + '" placeholder="选填"></span></div>' +
    '<div class="data-row"><span class="data-label">蛋糕</span><span class="data-value">' +
      '<select class="flower-input" id="flCake" onchange="guideFlowerRefreshTotal()">' + cakeOpts + '</select></span></div>' +
    '<div class="data-row"><span class="data-label">支付方式</span><span class="data-value">' +
      '<select class="flower-input" id="flPay">' + payOpts + '</select></span></div>' +
    '<div class="data-row"><span class="data-label">合计</span><span class="data-value" id="flTotal" style="font-weight:600;color:#B42318;">' + totalText + '</span></div>' +
    '</div>';
}

// 花束改选后同步价格提示（当前只改显示，提交时以表单为准）
function guideFlowerFormChanged() {}

// 提交前把表单里的值同步回 order
function guideFlowerSyncForm() {
  var s = GUIDE_FLOWER;
  if (!s || !s.order) return;
  var o = s.order;
  function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : null; }
  var v;
  v = val('flRecipient'); if (v) o.recipient = v;
  v = val('flPhone'); if (v !== null) o.phone = v;
  v = val('flAddress'); if (v !== null) o.address = v;
  v = val('flBouquet'); if (v) o.bouquet = v;
  v = val('flDate'); if (v) o.date = v;
  v = val('flSlot'); if (v) o.slot = v;
  v = val('flCard'); if (v !== null) o.card = v;
  v = val('flPay'); if (v) o.payMethod = v;
  v = val('flCake'); if (v !== null) o.cake = v;
}

// 蛋糕/花束变化时刷新合计文案
function guideFlowerRefreshTotal() {
  var s = GUIDE_FLOWER;
  if (!s || !s.order) return;
  guideFlowerSyncForm();
  var el = document.getElementById('flTotal');
  if (!el) return;
  var tot = guideFlowerOrderTotal(s.order);
  el.textContent = '花束 ¥' + (tot.bouquet ? tot.bouquet.price : 0) +
    (tot.cake && tot.cake.price ? ' + 蛋糕 ¥' + tot.cake.price : '') + ' = ¥' + tot.total;
}

function guideFlowerConfirm() {
  var s = GUIDE_FLOWER;
  if (!s) return;
  // 出确认卡之前再核一次：只能为联系人下单
  if (guideFlowerContacts().indexOf(s.order.recipient) === -1) {
    appendMessage(guideMessage('<p>收花人必须是联系人，当前「' + guideFlowerEsc(s.order.recipient) + '」不在联系人里，请重新选择收花人。</p>' +
      '<p class="guide-tip">可选收花人：' + guideFlowerEsc(guideFlowerContactsText()) + '</p>'));
    scrollToBottom();
    s.order.recipient = '';
    s.stage = 'slots';
    return;
  }
  s.stage = 'confirm';
  s.boxId = s.boxId || ('flower-confirm-' + Date.now());
  appendMessage(guideMessage('<div id="' + s.boxId + '">' + guideFlowerOrderCard(s) +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideFlowerSubmit()">提交订单</button>' +
    '<button class="guide-chip" onclick="guideFlowerCancelOp()">取消</button>' +
    '</div>' +
    '</div>'));
  scrollToBottom();
}

async function guideFlowerOrderStep(text) {
  var t = String(text || '').trim();
  var s = GUIDE_FLOWER;
  var parsed = guideFlowerParse(t);
  var o = s.order;

  // 确认阶段的自由输入：先看是否要改字段，再处理支付 / 确认 / 取消
  if (s.stage === 'confirm') {
    var edited = guideFlowerApplyEdit(t);
    if (edited) {
      var oldBox = s.boxId ? document.getElementById(s.boxId) : null;
      if (oldBox) oldBox.innerHTML = '<p>已更新：' + guideFlowerEsc(edited) + '。</p>';
      s.boxId = null;
      s.stage = 'confirm';
      guideFlowerConfirm();
      return true;
    }
    if (/信用卡/.test(t)) { o.payMethod = '信用卡'; appendMessage(guideMessage('<p>已切换为信用卡支付。</p>')); guideFlowerConfirm(); return true; }
    if (/储蓄卡|借记卡/.test(t)) { o.payMethod = '储蓄卡'; appendMessage(guideMessage('<p>已切换为储蓄卡支付。</p>')); guideFlowerConfirm(); return true; }
    if (/^(确认|提交|提交订单|确定|是|好|行)$/.test(t.replace(/[吧呢啊呀。.!！?？\s]/g, ''))) { return guideFlowerSubmit(); }
    if (/^(取消|不|算了|返回)$/.test(t.replace(/[吧呢啊呀。.!！?？\s]/g, ''))) { guideFlowerCancelOp(); return true; }
  }

  if (parsed.recipient) {
    var allowed = guideFlowerContacts();
    if (allowed.indexOf(parsed.recipient) === -1) {
      appendMessage(guideMessage(
        '<p>「<b>' + guideFlowerEsc(parsed.recipient) + '</b>」不在联系人里，鲜花只能为联系人下单。</p>' +
        '<p class="guide-tip">可选收花人：' + guideFlowerEsc(guideFlowerContactsText()) + '</p>' +
        '<div class="guide-chips"><button class="guide-chip" onclick="guideStartBirthdayFlower()">查看生日联系人</button></div>'
      ));
      scrollToBottom();
      return true;
    }
    o.recipient = parsed.recipient;
  }
  if (parsed.phone) o.phone = parsed.phone;
  if (parsed.address) o.address = parsed.address;
  if (parsed.bouquet) o.bouquet = parsed.bouquet;
  if (parsed.date) o.date = parsed.date;
  if (parsed.slot) o.slot = parsed.slot;
  if (parsed.card) o.card = parsed.card;
  if (parsed.payMethod) o.payMethod = parsed.payMethod;

  if (o.recipient && o.phone && o.address && o.bouquet && o.date && o.slot) {
    guideFlowerConfirm();
    return true;
  }
  appendMessage(guideMessage('<p>' + guideFlowerMissingPrompt(o) + '</p>' +
    '<p class="guide-tip">可选花束：' + FLOWER_BOUQUETS.map(function (b) { return b.name; }).join('、') + '</p>' +
    '<p class="guide-tip">配送时段：' + FLOWER_SLOTS.map(function (x) { return x.text; }).join('、') + '</p>'));
  scrollToBottom();
  return true;
}

function guideFlowerPaySwitch() {
  var s = GUIDE_FLOWER;
  if (!s) return;
  s.order.payMethod = s.order.payMethod === '信用卡' ? '储蓄卡' : '信用卡';
  appendMessage(guideMessage('<p>已切换为' + (s.order.payMethod === '信用卡' ? '信用卡' : '储蓄卡') + '支付。</p>'));
  guideFlowerConfirm();
}

async function guideFlowerSubmit() {
  var s = GUIDE_FLOWER;
  if (!s || s.stage !== 'confirm') return true;
  guideFlowerSyncForm();
  var o = s.order;
  var tot = guideFlowerOrderTotal(o);
  var bouquet = tot.bouquet;
  var price = tot.total;
  var today = guideFlowerDateStr(0);

  if (o.date < today) {
    appendMessage(guideMessage('<p>配送日期不能早于今天（' + guideFlowerDisplayDate(today) + '），请重新告诉我配送日期。</p>'));
    scrollToBottom();
    s.order.date = '';
    s.stage = 'slots';
    return true;
  }
  if (o.card && o.card.length > 30) o.card = o.card.slice(0, 30);
  if (guideFlowerContacts().indexOf(o.recipient) === -1) {
    appendMessage(guideMessage('<p>收花人必须是联系人，当前「' + guideFlowerEsc(o.recipient) + '」不在联系人里，请重新选择收花人。</p>' +
      '<p class="guide-tip">可选收花人：' + guideFlowerEsc(guideFlowerContactsText()) + '</p>'));
    scrollToBottom();
    s.order.recipient = '';
    s.stage = 'slots';
    return true;
  }

  // 同一人同一天不允许重复下单
  var dupOrder = guideFlowerDuplicate(o.recipient, o.date);
  if (dupOrder) {
    guideConfirmCardDone(s.boxId, '未提交');
    GUIDE_FLOWER = null;
    guideFlowerWarnDuplicate(dupOrder);
    return true;
  }

  if (!(price > 0)) {
    appendMessage(guideMessage('<p>该花束没有有效价格，请重新选择款式。</p>'));
    scrollToBottom();
    s.stage = 'slots';
    return true;
  }

  var payMethod = o.payMethod === '信用卡' ? '信用卡' : '储蓄卡';
  var debit = (mockData.userProfile && mockData.userProfile.debitCard) || {};
  var available = Number(debit.available) || 0;
  var cc = (mockData.userProfile && mockData.userProfile.creditCard) || {};
  var creditAvailable = Number(cc.available) || 0;
  if (payMethod === '储蓄卡' && price > available) {
    appendMessage(guideMessage('<p>储蓄卡可用余额 ¥' + available.toLocaleString('zh-CN') + ' 不足支付本次鲜花订单（¥' + price + '），请改用信用卡支付。</p>' +
      '<div class="guide-chips"><button class="guide-chip" onclick="guideFlowerPaySwitch()">改用信用卡支付</button>' +
      '<button class="guide-chip" onclick="guideFlowerCancelOp()">取消</button></div>'));
    scrollToBottom();
    return true;
  }
  if (payMethod === '信用卡' && price > creditAvailable) {
    appendMessage(guideMessage('<p>信用卡可用额度 ¥' + creditAvailable.toLocaleString('zh-CN') + ' 不足支付本次鲜花订单（¥' + price + '），请改用储蓄卡支付。</p>' +
      '<div class="guide-chips"><button class="guide-chip" onclick="guideFlowerPaySwitch()">改用储蓄卡支付</button>' +
      '<button class="guide-chip" onclick="guideFlowerCancelOp()">取消</button></div>'));
    scrollToBottom();
    return true;
  }

  // 下单即支付：储蓄卡走统一扣款门禁，信用卡占用额度并计入本期账单
  if (payMethod === '储蓄卡') {
    var paid = addTransaction('expense', price, '鲜花订单-' + o.recipient + '(' + o.bouquet + ')', '鲜花订购', true);
    if (paid === false) {
      appendMessage(guideMessage('<p>储蓄卡可用余额不足，鲜花订单未提交，账户未扣款。</p>'));
      scrollToBottom();
      return true;
    }
  } else {
    cc.available = Math.max(0, Math.round((creditAvailable - price) * 100) / 100);
    cc.used = Math.round(((Number(cc.used) || 0) + price) * 100) / 100;
    cc.currentBill = Math.round(((Number(cc.currentBill) || 0) + price) * 100) / 100;
    cc.minPayment = Math.round(cc.currentBill * 10) / 100;
    if (mockData.card) {
      mockData.card.usedLimit = cc.used;
      mockData.card.availableLimit = cc.available;
      mockData.card.billAmount = cc.currentBill;
    }
  }

  guideConfirmCardDone(s.boxId, '已提交');
  GUIDE_FLOWER = null;
  guideFlowerOrders().unshift({
    id: 'F' + Date.now(),
    recipient: o.recipient,
    phone: o.phone,
    address: o.address,
    bouquet: o.bouquet,
    cake: o.cake || '无蛋糕',
    cakePrice: tot.cake ? tot.cake.price : 0,
    bouquetPrice: bouquet ? bouquet.price : 0,
    price: price,
    date: o.date,
    slot: o.slot,
    card: o.card || '',
    payMethod: payMethod,
    paid: true,
    paidAmount: price,
    status: '待配送',
    createdAt: new Date().toLocaleString('zh-CN')
  });
  saveUserData();
  var cakeNote = (tot.cake && tot.cake.price) ? ('（含' + tot.cake.name + ' ¥' + tot.cake.price + '）') : '';
  appendMessage(guideMessage('<p>鲜花订单提交成功，已从' + payMethod + '支付 ¥' + price + cakeNote + '，将在配送日按时派送。</p>' +
    '<div class="guide-chips"><button class="guide-chip" onclick="guideStartFlowerList()">查看鲜花订单</button></div>'));
  scrollToBottom();
  return true;
}

function guideStartFlowerList() {
  guideResetAllSessions();
  GUIDE_FLOWER = { mode: 'list', stage: 'list' };
  currentModule = 'life';
  var list = guideFlowerOrders();
  var pending = list.filter(function (x) { return x.status === '待配送'; });
  var done = list.filter(function (x) { return x.status !== '待配送'; });
  var rows = function (arr) {
    return arr.map(function (o2) {
      var slot = guideFlowerSlot(o2.slot);
      return '<div class="bank-sched-item">' +
        '<div class="bank-sched-date" style="background:#F5F8FD;color:#09407F;"><b>' + guideFlowerEsc(o2.status) + '</b><small>' + guideFlowerEsc(guideFlowerDisplayDate(o2.date)) + '</small></div>' +
        '<div class="bank-sched-main"><b>' + guideFlowerEsc(o2.bouquet) + '｜收件：' + guideFlowerEsc(o2.recipient) + '</b>' +
        '<small>' + guideFlowerDisplayDate(o2.date) + ' ' + slot.text + ' · ' + guideFlowerEsc(o2.payMethod || '储蓄卡') + '</small></div>' +
        '<div class="bank-sched-side" style="gap:8px;display:flex;">' +
        (o2.status === '待配送'
          ? '<button class="ui-link" onclick="guideFlowerCancelStart(\'' + o2.id + '\')">取消订单</button>'
          : '<button class="ui-link" style="color:#B42318;" onclick="guideFlowerDeleteOrder(\'' + o2.id + '\')">删除</button>') +
        '</div>' +
        '</div>';
    }).join('');
  };
  appendMessage(guideMessage(
    '<p>鲜花订单列表：</p>' +
    '<div class="report-panel"><div class="report-panel-title">待配送</div>' + (rows(pending) || '<div class="report-empty">暂无待配送订单</div>') + '</div>' +
    '<div class="report-panel" style="margin-top:10px;"><div class="report-panel-title">已完成</div>' + (rows(done) || '<div class="report-empty">暂无历史订单</div>') + '</div>'
  ));
  scrollToBottom();
}

// 删除一条鲜花订单记录（待配送的需先取消）
function guideFlowerDeleteOrder(orderId) {
  var list = guideFlowerOrders();
  var target = list.filter(function (x) { return x.id === orderId; })[0];
  if (!target) {
    appendMessage(guideMessage('<p>该记录不存在，可能已被删除。</p>'));
    scrollToBottom();
    return;
  }
  if (target.status === '待配送') {
    appendMessage(guideMessage('<p>待配送的订单不能直接删除，请先取消订单。</p>' +
      '<div class="guide-chips"><button class="guide-chip" onclick="guideFlowerCancelStart(\'' + orderId + '\')">取消订单</button></div>'));
    scrollToBottom();
    return;
  }
  var idx = list.indexOf(target);
  if (idx !== -1) list.splice(idx, 1);
  saveUserData();
  appendMessage(guideMessage('<p>已删除该条鲜花订单记录（' + guideFlowerEsc(target.recipient) + '・' + guideFlowerDisplayDate(target.date) + '）。</p>'));
  scrollToBottom();
  guideStartFlowerList();
}
// 修改订单：配送日前可改
function guideFlowerModifyStart(orderId) {
  var order = guideFlowerOrders().filter(function (x) { return x.id === orderId; })[0];
  if (!order) return;
  if (guideFlowerHoursLeft(order) < 0) {
    appendMessage(guideMessage('<p>该订单已过配送时间，无法修改。</p>'));
    scrollToBottom();
    return;
  }
  GUIDE_FLOWER = { mode: 'modify', stage: 'modify-slots', order: order, newBouquet: '' };
  currentModule = 'life';
  var slot = guideFlowerSlot(order.slot);
  appendMessage(guideMessage('<p>要修改「' + guideFlowerEsc(order.recipient) + '」这笔鲜花订单的什么？例如「改成向日葵花束」。</p>' +
    '<p class="guide-tip">当前：' + guideFlowerEsc(order.bouquet) + '｜' + guideFlowerDisplayDate(order.date) + ' ' + slot.text +
    '（配送前 24 小时以上可免费修改）</p>'));
  scrollToBottom();
}

function guideFlowerModifyConfirm() {
  var s = GUIDE_FLOWER;
  if (!s || !s.order) return;
  s.stage = 'modify-confirm';
  var bouquet = guideFlowerBouquet(s.newBouquet);
  s.newBouquet = bouquet ? bouquet.name : s.newBouquet;
  var oldPrice = Number(s.order.paidAmount || s.order.price) || 0;
  var newPrice = bouquet ? Number(bouquet.price) || 0 : oldPrice;
  var diff = Math.round((newPrice - oldPrice) * 100) / 100;
  appendMessage(guideMessage(
    '<div class="data-card"><div class="data-card-title">确认修改订单</div>' +
    '<div class="data-row"><span class="data-label">原款式</span><span class="data-value">' + guideFlowerEsc(s.order.bouquet) + '</span></div>' +
    '<div class="data-row"><span class="data-label">新款式</span><span class="data-value">' + guideFlowerEsc(s.newBouquet) + '（¥' + newPrice + '）</span></div>' +
    (s.order.paid === true && diff !== 0 ? '<div class="data-row"><span class="data-label">改单差价</span><span class="data-value ' + (diff > 0 ? 'expense' : 'income') + '">' + (diff > 0 ? '补 ¥' : '退 ¥') + Math.abs(diff) + '</span></div>' : '') +
    '<div class="data-row"><span class="data-label">其余信息</span><span class="data-value">保持不变</span></div>' +
    '<div class="data-row"><span class="data-label">支付方式</span><span class="data-value">' + guideFlowerEsc(s.order.payMethod || '储蓄卡') + '</span></div>' +
    '</div>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideFlowerModifySubmit()">确认修改</button>' +
    '<button class="guide-chip" onclick="guideFlowerCancelOp()">返回</button>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideFlowerModifySubmit() {
  var s = GUIDE_FLOWER;
  if (!s || s.stage !== 'modify-confirm' || !s.order) return;
  var target = guideFlowerOrders().filter(function (x) { return x.id === s.order.id; })[0];
  var bouquet = guideFlowerBouquet(s.newBouquet);
  if (target && bouquet) {
    var oldPrice = Number(target.paidAmount || target.price) || 0;
    var newPrice = Number(bouquet.price) || 0;
    var diff = Math.round((newPrice - oldPrice) * 100) / 100;
    // 已支付的订单改款式必须补差价/退差价，不能只改展示价
    if (target.paid === true && diff !== 0) {
      if (String(target.payMethod) === '信用卡') {
        var cc = mockData.userProfile.creditCard || {};
        if (diff > 0 && (Number(cc.available) || 0) < diff) {
          appendMessage(guideMessage('<p>信用卡可用额度不足以补差价 ¥' + diff + '，订单未修改。</p>'));
          scrollToBottom();
          return;
        }
        cc.available = Math.round(((Number(cc.available) || 0) - diff) * 100) / 100;
        cc.used = Math.round(((Number(cc.used) || 0) + diff) * 100) / 100;
        cc.currentBill = Math.round(((Number(cc.currentBill) || 0) + diff) * 100) / 100;
        cc.minPayment = Math.round(cc.currentBill * 10) / 100;
        if (mockData.card) {
          mockData.card.availableLimit = cc.available;
          mockData.card.usedLimit = cc.used;
          mockData.card.billAmount = cc.currentBill;
        }
      } else if (diff > 0) {
        var payDiff = addTransaction('expense', diff, '鲜花改单补差价-' + target.recipient, '鲜花订购', true);
        if (payDiff === false) {
          appendMessage(guideMessage('<p>储蓄卡可用余额不足以补差价 ¥' + diff + '，订单未修改。</p>'));
          scrollToBottom();
          return;
        }
      } else {
        addTransaction('income', -diff, '鲜花改单退款-' + target.recipient, '鲜花订购', true);
      }
      target.paidAmount = newPrice;
    }
    target.bouquet = bouquet.name;
    target.price = newPrice;
    target.updatedAt = new Date().toLocaleString('zh-CN');
    saveUserData();
  }
  GUIDE_FLOWER = null;
  appendMessage(guideMessage('<p>订单已修改：款式改为「' + guideFlowerEsc(bouquet ? bouquet.name : s.newBouquet) + '」，其余信息保持不变。</p>'));
  scrollToBottom();
}

// 取消订单：不足 24 小时收服务费
function guideFlowerCancelStart(orderId) {
  var order = guideFlowerOrders().filter(function (x) { return x.id === orderId; })[0];
  if (!order) return;
  GUIDE_FLOWER = { mode: 'cancel', stage: 'cancel-confirm', order: order, boxId: 'flower-cancel-' + Date.now() };
  currentModule = 'life';
  var slot = guideFlowerSlot(order.slot);
  var hrs = guideFlowerHoursLeft(order);
  appendMessage(guideMessage(
    '<div id="' + GUIDE_FLOWER.boxId + '-wrap">' +
    '<div class="data-card"><div class="data-card-title">确认取消这条鲜花订单</div>' +
    '<div class="data-row"><span class="data-label">收花人</span><span class="data-value">' + guideFlowerEsc(order.recipient) + '</span></div>' +
    '<div class="data-row"><span class="data-label">配送时间</span><span class="data-value">' + guideFlowerDisplayDate(order.date) + ' ' + slot.text + '</span></div>' +
    '</div>' +
    (hrs < 24 ? '<p class="guide-tip">距离配送日不足24小时，取消会收取少量服务费 ¥' + FLOWER_CANCEL_FEE + '。</p>' : '<p class="guide-tip">配送前 24 小时以上可免费取消。</p>') +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideFlowerCancelSubmit()">确认取消</button>' +
    '<button class="guide-chip" onclick="guideFlowerCancelOp()">返回</button>' +
    '</div>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideFlowerCancelSubmit() {
  var s = GUIDE_FLOWER;
  if (!s || s.stage !== 'cancel-confirm' || !s.order) return;
  var order = s.order;
  var hrs = guideFlowerHoursLeft(order);
  var target = guideFlowerOrders().filter(function (x) { return x.id === order.id; })[0];
  if (!target) {
    appendMessage(guideMessage('<p>订单不存在，可能已被取消。</p>'));
    GUIDE_FLOWER = null;
    scrollToBottom();
    return;
  }
  if (target.status === '已取消') {
    appendMessage(guideMessage('<p>该订单已经取消过，不会重复退款。</p>'));
    GUIDE_FLOWER = null;
    scrollToBottom();
    return;
  }

  var paid = target.paid === true;
  var paidAmount = Number(target.paidAmount || target.price) || 0;
  var fee = (paid && hrs < 24) ? FLOWER_CANCEL_FEE : 0;
  var refund = paid ? Math.max(0, Math.round((paidAmount - fee) * 100) / 100) : 0;

  if (paid && refund > 0) {
    if (String(target.payMethod) === '信用卡') {
      var cc = mockData.userProfile.creditCard || {};
      cc.available = Math.round(((Number(cc.available) || 0) + refund) * 100) / 100;
      cc.used = Math.max(0, Math.round(((Number(cc.used) || 0) - refund) * 100) / 100);
      cc.currentBill = Math.max(0, Math.round(((Number(cc.currentBill) || 0) - refund) * 100) / 100);
      cc.minPayment = Math.round(cc.currentBill * 10) / 100;
      if (mockData.card) {
        mockData.card.usedLimit = cc.used;
        mockData.card.availableLimit = cc.available;
        mockData.card.billAmount = cc.currentBill;
      }
    } else {
      addTransaction('income', refund, '鲜花订单退款-' + target.recipient, '鲜花订购', true);
    }
  }

  target.status = '已取消';
  target.cancelledAt = new Date().toLocaleString('zh-CN');
  target.cancelFee = fee;
  target.refundAmount = refund;
  saveUserData();
  guideConfirmCardDone(s.boxId ? (s.boxId + '-wrap') : null, '已取消');
  GUIDE_FLOWER = null;
  appendMessage(guideMessage('<p>鲜花订单已取消' +
    (paid ? '，已退回 ¥' + refund + (fee > 0 ? '（扣除配送前 24 小时内取消服务费 ¥' + fee + '）' : '') : '，该订单未支付，无需退款') +
    '。</p>'));
  scrollToBottom();
}

function guideFlowerCancelOp() {
  var boxId = GUIDE_FLOWER && GUIDE_FLOWER.boxId;
  GUIDE_FLOWER = null;
  if (!guideConfirmCardCollapse(boxId, '已取消本次操作，鲜花订单保持不变。')) {
    appendMessage(guideMessage('<p>已取消本次操作，鲜花订单保持不变。</p>'));
  }
  scrollToBottom();
}

// 鲜花会话统一入口
async function guideFlowerSession(t) {
  var s = GUIDE_FLOWER;
  if (!s) return true;
  var plain = String(t || '').replace(/[吧呢啊呀。.!！?？\s]/g, '');

  if (s.mode === 'order') {
    if (s.stage === 'confirm' && /^(取消|不|算了)$/.test(plain)) { guideFlowerCancelOp(); return true; }
    if (/^(返回|菜单|返回菜单|退出|取消|不订了|算了)$/.test(plain) && s.stage !== 'confirm') {
      GUIDE_FLOWER = null;
      guideBackToMenu();
      return true;
    }
    return guideFlowerOrderStep(t);
  }

  if (s.mode === 'modify') {
    if (/^(返回|取消|不|算了)$/.test(plain) && s.stage === 'modify-confirm') { guideFlowerCancelOp(); return true; }
    if (s.stage === 'modify-confirm' && /^(确认|确定|确认修改|是|好|行)$/.test(plain)) { guideFlowerModifySubmit(); return true; }
    if (/^(返回|菜单|退出)$/.test(plain)) { GUIDE_FLOWER = null; guideBackToMenu(); return true; }
    var b2 = guideFlowerBouquet(t);
    if (b2) { s.newBouquet = b2.name; guideFlowerModifyConfirm(); return true; }
    appendMessage(guideMessage('<p>要改成哪一款花束？可选：' + FLOWER_BOUQUETS.map(function (x) { return x.name; }).join('、') + '</p>'));
    scrollToBottom();
    return true;
  }

  if (s.mode === 'cancel') {
    if (/^(确认|确定|确认取消|是|好|行)$/.test(plain)) { guideFlowerCancelSubmit(); return true; }
    if (/^(返回|取消|不|算了)$/.test(plain)) { guideFlowerCancelOp(); return true; }
    appendMessage(guideMessage('<p>请确认是否取消这条鲜花订单：回复「确认取消」或「返回」。</p>'));
    scrollToBottom();
    return true;
  }

  if (s.mode === 'list') {
    // 列表模式必须有出口：返回/菜单/退出/取消（未指定订单）都回到一级菜单
    if (/^(返回|菜单|返回菜单|退出|取消|不看了|算了)$/.test(plain)) {
      GUIDE_FLOWER = null;
      guideBackToMenu();
      return true;
    }
    if (/修改|改一下|换款式|改款式/.test(t)) {
      var target2 = guideFlowerOrders().filter(function (x) { return x.status === '待配送' && t.indexOf(x.recipient) !== -1; })[0];
      if (target2) { guideFlowerModifyStart(target2.id); return true; }
    }
    if (/取消/.test(t)) {
      var target3 = guideFlowerOrders().filter(function (x) { return x.status === '待配送' && t.indexOf(x.recipient) !== -1; })[0];
      if (target3) { guideFlowerCancelStart(target3.id); return true; }
    }
    appendMessage(guideMessage('<p>请点订单上的【取消订单】，或告诉我「取消李四的鲜花订单」。</p>'));
    scrollToBottom();
    return true;
  }
  return true;
}
