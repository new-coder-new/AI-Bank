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
      {
        key: 'name', label: '姓名转账',
        run: function () { guideStartNameTransfer(); }
      },
      {
        key: 'phone', label: '手机号转账',
        run: function () { guideStartPhoneTransfer(); }
      },
      { key: 'timed', label: '定时转账', run: function () { guideStartTimedTransfer(); } },
      { key: 'aa', label: 'AA收款', run: function () { showTransferForm('aa'); } }
    ]
  },
  {
    key: 'bill', label: '账单分析', icon: 'bill',
    aliases: ['账单'],
    prompt: '账单分析可以帮你看这些，请选择：',
    subs: [
      { key: 'stat', label: '消费统计', run: function () { showBillAnalysis(); } },
      { key: 'report', label: '账单报告', run: function () { showFinanceReport(); } },
      { key: 'abnormal', label: '异常交易', run: function () { showAbnormalAlert(); } }
    ]
  },
  {
    key: 'card', label: '卡片管理', icon: 'card',
    aliases: ['卡片'],
    prompt: '卡片管理包含这些操作，请选择：',
    subs: [
      { key: 'apply', label: '卡片申请', run: function () { showCardApplyForm(); } },
      {
        key: 'limit', label: '额度调整',
        run: function () { appendMessage(cardLimitDetailCard()); scrollToBottom(); }
      },
      { key: 'txnlimit', label: '交易限制', run: function () { showTxnLimitSettings(); } },
      { key: 'lost', label: '卡片挂失', run: function () { showCardFreezePanel(); } }
    ]
  },
  {
    key: 'wealth', label: '理财', icon: 'wealth',
    aliases: ['理财服务', '投资理财'],
    prompt: '理财服务包含这些内容，请选择：',
    subs: [
      { key: 'products', label: '产品申购', aliases: ['产品', '申购'], run: function () { showProductList(); } },
      { key: 'risk', label: '风险评估', run: function () { startRiskAssessment(); } },
      { key: 'holdings', label: '我的持仓', aliases: ['持仓'], run: function () { showHoldings(); } }
    ]
  },
  {
    key: 'life', label: '生活订购', icon: 'bell',
    aliases: ['生活', '生活服务'],
    prompt: '生活订购包含这些服务，请选择：',
    subs: [
      { key: 'subscribe', label: '订阅管理', run: function () { showSubscribeList(); } },
      { key: 'birthday', label: '生日鲜花', run: function () { showBirthdayReminder(); } }
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

function renderServiceWelcome() {
  var list = GUIDE_SERVICES.map(function (s) {
    return '<div class="guide-item">🔹 ' + s.label + '</div>';
  }).join('');
  var chips = GUIDE_SERVICES.map(function (s) {
    return guideChip(s.label, "guideOpenService('" + s.key + "')");
  }).join('');
  var overviewChip = GUIDE_SHOW_OVERVIEW
    ? '<button class="guide-chip guide-chip-ghost" onclick="guideOpenOverview()">账户概览</button>'
    : '';

  appendMessage(guideMessage(
    '<p><b>你好，我是 AI Bank 助手</b><br>我可以为你提供这些服务：</p>' +
    '<div class="guide-list">' + list + '</div>' +
    '<p class="guide-tip">你可以直接点击按钮，或者输入对应的功能名称。</p>' +
    '<div class="guide-chips">' + chips + overviewChip + '</div>'
  ));
  scrollToBottom();
}

// 起始页的「账户概览」入口：按需打开原来的财务驾驶舱，不占起始版面
function guideOpenOverview() {
  if (typeof renderAgentBriefing === 'function') renderAgentBriefing();
}

// 二级菜单：某一类服务的子功能
function guideOpenService(key) {
  var s = guideServiceByKey(key);
  if (!s) return;
  currentModule = s.key;
  var chips = s.subs.map(function (sub) {
    return guideChip(sub.label, "guidePickSub('" + s.key + "','" + sub.key + "')");
  }).join('');

  appendMessage(guideMessage(
    '<p>' + s.prompt + '</p>' +
    '<div class="guide-chips">' + chips + '</div>' +
    '<p class="guide-tip">你可以直接点击按钮，或者输入对应的功能名称。</p>'
  ));
  scrollToBottom();
}

// 进入某个子功能：执行对应流程，并保持模块上下文
function guidePickSub(serviceKey, subKey) {
  var s = guideServiceByKey(serviceKey);
  if (!s) return;
  var sub = s.subs.filter(function (x) { return x.key === subKey; })[0];
  if (!sub) return;
  currentModule = s.key;
  try {
    sub.run();
  } catch (e) {
    console.warn('子功能执行失败:', subKey, e);
  }
}

function guideBackToMenu() {
  currentModule = 'chat';
  renderServiceWelcome();
}

// 文本解析：服务名 / 子功能名 / 返回菜单，命中则接管，返回 true
function guideHandleText(text) {
  var t = String(text || '').trim().replace(/[。.!！?？,，\s]+$/g, '');
  if (!t) return false;

  // 姓名转账多轮收集进行中：这一步的输入一律按「收款人 / 金额」解析
  if (GUIDE_TRANSFER) return guideTransferStep(t);

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

  // 去掉口语前缀，便于识别「我要转账」「帮我转账」
  var bare = t.replace(/^(我要|我想|我想用|帮我|我要用|使用)/, '');

  // 先按当前模块的子功能匹配（模块内上下文，支持别名：产品 ↔ 产品申购、持仓 ↔ 我的持仓）
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

  // 再按一级服务名匹配
  var svc = guideResolveService(bare);
  if (svc) {
    guideOpenService(svc.key);
    return true;
  }

  return false;
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
  GUIDE_TRANSFER = { kind: 'name', payee: null, phone: null, amount: null, remark: '', stage: 'slots' };
  currentModule = 'transfer';
  appendMessage(guideMessage(
    '<p>请问收款人和转账金额是多少？</p>' +
    '<p class="guide-tip">可以分开说，也可以一次说，例如「张三转 100」</p>'
  ));
  scrollToBottom();
}

function guideStartPhoneTransfer() {
  GUIDE_TRANSFER = { kind: 'phone', payee: null, phone: null, amount: null, remark: '', stage: 'slots' };
  currentModule = 'transfer';
  appendMessage(guideMessage(
    '<p>请问收款手机号和转账金额是多少？</p>' +
    '<p class="guide-tip">例如：13800138000 100</p>'
  ));
  scrollToBottom();
}

function guideStartTimedTransfer() {
  GUIDE_TRANSFER = {
    kind: 'timed', payee: null, phone: null, amount: null,
    date: null, time: null, repeat: '不重复', remark: '', stage: 'slots'
  };
  currentModule = 'transfer';
  appendMessage(guideMessage(
    '<p>请问收款人、转账金额和执行时间是多少，是否重复（每天/每周/每月/每年）？</p>' +
    '<p class="guide-tip">例如：明天 09:00 给张三转 1000，每月重复</p>'
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
  var y = now.getFullYear();
  var m = month ? Number(month) : (now.getMonth() + 1);
  var d = new Date(y, m - 1, Number(day));
  if (!month && d.getTime() < now.getTime()) d = new Date(y, m, Number(day));
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
      if ((zh[1] === '下午' || zh[1] === '晚上') && h < 12) h += 12;
      if (zh[1] === '中午' && h < 11) h += 12;
      out.time = guidePad2(h) + ':' + (zh[3] ? '30' : '00');
      t = t.replace(zh[0], ' ');
    }
  }

  // 只有时间段、没有具体钟点（如「明天下午」）→ 记下 period，稍后追问「下午几点」
  if (!out.time) {
    var pd = t.match(/(凌晨|早上|上午|中午|下午|晚上)/);
    if (pd) {
      out.period = pd[1];
      t = t.replace(pd[0], ' ');
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
    if (md) {
      out.date = guideMonthDayDate(md[1], md[2]);
      t = t.replace(md[0], ' ');
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
  var m = t.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (m) {
    amount = parseFloat(m[1]);
    if (m[2]) amount = amount * 10000;
    t = t.replace(m[0], ' ');
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
  return (mockData.contacts || []).map(function (c) { return c.name; }).join('、') || '暂无联系人';
}

function guideUnknownPayeeNotice(name) {
  var n = (typeof escapeHtml === 'function') ? escapeHtml(name) : name;
  appendMessage(guideMessage(
    '<p>「<b>' + n + '</b>」不在通讯录里。姓名转账只支持通讯录联系人：' + guideContactNames() + '。</p>' +
    '<p class="guide-tip">可以改用手机号转账，或先在「联系人」中新增后再试。</p>'
  ));
  scrollToBottom();
}

function guideTransferStep(text) {
  var t = String(text || '').trim();
  if (/^(取消|不转了|算了|退出|返回|菜单)$/.test(t)) {
    GUIDE_TRANSFER = null;
    guideBackToMenu();
    return true;
  }

  var bare = t.replace(/^(我要|我想|我想用|帮我|我要用|使用)/, '');

  // 会话中说出服务名（如直接打字「转账」「账单分析」）→ 退出收集，进入该服务二级菜单
  var svc = guideResolveService(bare);
  if (svc) {
    GUIDE_TRANSFER = null;
    guideOpenService(svc.key);
    return true;
  }

  // 说出转账模块内的其它子功能（手机号转账 / 定时转账 / AA收款 / 姓名转账）→ 直接切换过去
  var transferSvc = guideServiceByKey('transfer');
  var subHit = transferSvc && transferSvc.subs.filter(function (x) {
    return x.label === bare || (x.aliases || []).indexOf(bare) !== -1;
  })[0];
  if (subHit) {
    GUIDE_TRANSFER = null;
    guidePickSub('transfer', subHit.key);
    return true;
  }

  // 明显是别的业务 / 闲聊：不拦截，交回主链路作答（会话保留，下一句继续收槽位）
  if (/(余额|账单|理财|基金|持仓|订阅|信用卡|额度|挂失|预算|鲜花|生日|安全|你好|您好|谢谢|再见|能做什么|怎么用|什么意思|为什么)/.test(t)) {
    return false;
  }

  if (!GUIDE_TRANSFER) {
    GUIDE_TRANSFER = { kind: 'name', payee: null, phone: null, amount: null, remark: '', stage: 'slots' };
  }
  var s = GUIDE_TRANSFER;

  // ① 等备注内容：这一句就是备注
  if (s.stage === 'remark') {
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

  // ③ 问备注阶段：识别「要 / 不要」，其它输入直接当备注内容
  if (s.stage === 'askRemark') {
    if (/^(需要|要|好的|好|是|加|添加|备注|加个备注|写备注|要备注)$/.test(bare)) {
      s.stage = 'remark';
      appendMessage(guideMessage('<p>请输入备注内容</p><p class="guide-tip">例如：房租 / 还款 / AA</p>'));
      scrollToBottom();
      return true;
    }
    if (/^(不用|不需要|不要|否|跳过|没有|不用了|不写|不加)$/.test(bare)) {
      s.remark = '';
      guideCommitTransfer();
      return true;
    }
    s.remark = t;
    guideCommitTransfer();
    return true;
  }

  // ④ 收槽位阶段
  var parsed = guideTransferParse(t, s.kind);

  // 姓名 / 定时转账：非通讯录姓名直接提示，不进入槽位
  if ((s.kind === 'name' || s.kind === 'timed') && !parsed.payee && parsed.unknownName) {
    guideUnknownPayeeNotice(parsed.unknownName);
    return true;
  }

  if (parsed.phone) s.phone = parsed.phone;
  if (parsed.payee) s.payee = parsed.payee;
  if (parsed.amount != null && parsed.amount > 0) s.amount = parsed.amount;
  if (s.kind === 'timed') {
    if (parsed.date) s.date = parsed.date;
    if (parsed.time) s.time = parsed.time;
    if (parsed.repeat) s.repeat = parsed.repeat;
    if (parsed.period) s.period = parsed.period;
    // 先前只说了「下午 / 晚上」这段，这次只补钟点时按时间段换算（3点 → 15:00）
    if (s.time && s.period) {
      var hh = parseInt(String(s.time).slice(0, 2), 10);
      if ((s.period === '下午' || s.period === '晚上') && hh < 12) {
        s.time = guidePad2(hh + 12) + String(s.time).slice(2);
      } else if (s.period === '中午' && hh < 11) {
        s.time = guidePad2(hh + 12) + String(s.time).slice(2);
      }
    }
  }

  var hasTarget = s.kind === 'phone' ? !!s.phone : !!s.payee;
  if (hasTarget && s.amount > 0) {
    if (s.kind === 'timed') {
      // 只说了「明天下午」这类模糊时间 → 追问具体钟点，而不是默默按 09:00 处理
      if (s.date && !s.time && s.period) {
        appendMessage(guideMessage(guidePeriodQuestion(s.period, s.date)));
        scrollToBottom();
      } else if (s.date) {
        if (!s.time) s.time = '09:00';   // 只给了日期时默认 09:00
        guideTransferAskRemark();
      } else {
        appendMessage(guideMessage('<p>请问什么时候执行？</p><p class="guide-tip">例如：明天 09:00 / 10月30日 下午3点 / 每月1号 09:00</p>'));
        scrollToBottom();
      }
    } else if (s.kind === 'phone') {
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

  // 缺什么问什么（按姓名 / 手机号 / 定时分别追问）
  if (s.kind === 'phone') {
    if (s.phone) { appendMessage(guideMessage('<p>麻烦告诉我转账金额</p>')); scrollToBottom(); return true; }
    if (s.amount > 0) { appendMessage(guideMessage('<p>请问收款手机号是多少？</p>')); scrollToBottom(); return true; }
    appendMessage(guideMessage('<p>请问收款手机号和转账金额是多少？</p>'));
    scrollToBottom();
    return true;
  }
  if (s.kind === 'timed' && s.payee && s.amount > 0 && !s.date) {
    appendMessage(guideMessage('<p>请问什么时候执行？</p><p class="guide-tip">例如：明天 09:00 / 10月30日 下午3点 / 每月1号 09:00</p>'));
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
    '<p class="guide-tip">例如：李雷（填写后按姓名核验，仍可正常转账）</p>'
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
function guideTransferAskRemark() {
  var s = GUIDE_TRANSFER;
  if (!s) return;
  s.stage = 'askRemark';
  var target = guideTransferTargetLabel();
  var name = (typeof escapeHtml === 'function') ? escapeHtml(target) : target;
  var when = (s.kind === 'timed')
    ? ('于 <b>' + s.date + ' ' + (s.time || '09:00') + '</b> ')
    : '';
  var repeatText = (s.kind === 'timed' && s.repeat && s.repeat !== '不重复') ? '（' + s.repeat + '）' : '';
  appendMessage(guideMessage(
    '<p>已记录：' + when + '向 <b>' + name + '</b> 转账 <b>' + guidePlainMoney(s.amount) + ' 元</b>' + repeatText + '。</p>' +
    '<p>需要添加备注吗？</p>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideTransferRemarkChoice(true)">添加备注</button>' +
    '<button class="guide-chip" onclick="guideTransferRemarkChoice(false)">不用了</button>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideTransferRemarkChoice(need) {
  var s = GUIDE_TRANSFER;
  if (!s) return;
  if (need) {
    s.stage = 'remark';
    appendMessage(guideMessage('<p>请输入备注内容</p><p class="guide-tip">例如：房租 / 还款 / AA</p>'));
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
    appendMessage(guideMessage('<p>⚠️ ' + ((typeof escapeHtml === 'function') ? escapeHtml(err) : err) + '</p>' +
      '<p class="guide-tip">请重新告诉我执行时间，例如「明天 09:00」。</p>'));
    scrollToBottom();
    s.stage = 'slots';
    s.date = null;
    s.time = null;
    return;
  }

  GUIDE_TRANSFER = null;
  currentModule = 'transfer';
  var repeatText = task.repeat !== '不重复' ? '（' + task.repeat + '）' : '';
  var remarkText = task.remark ? '，备注：<b>' + ((typeof escapeHtml === 'function') ? escapeHtml(task.remark) : task.remark) + '</b>' : '';
  appendMessage(guideMessage(
    '<p>确认于 <b>' + task.date + ' ' + task.time + '</b> 向 <b>' + task.payee + '</b> 转账 <b>' +
    guidePlainMoney(s.amount) + ' 元</b>' + repeatText + remarkText + '，请确认</p>'
  ));
  scrollToBottom();
  if (typeof openScheduledTransferConfirm === 'function') openScheduledTransferConfirm(task);
}

// ------------------------------ AI 兜底 ------------------------------
// 本地正则只能认「张三 100」这类规整输入；遇到「帮我转一百块给张三」「就打给老王吧，两百」
// 这类说法，交给模型抽槽位；无 Key / 请求失败时降级为示例引导，不阻塞对话。
async function guideTransferAIExtract(text, session) {
  if (typeof bankHasLLMKey === 'function' && !bankHasLLMKey()) return null;
  if (typeof DEEPSEEK_API_URL === 'undefined' || !DEEPSEEK_API_URL) return null;
  var known = '已知收款人=' + (session.payee || '未知') + '；已知手机号=' + (session.phone || '未知') + '；已知金额=' + (session.amount || '未知');
  var resp = await fetch(DEEPSEEK_API_URL, {
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
      if (s.date) {
        if (!s.time) s.time = '09:00';
        guideTransferAskRemark();
      } else {
        appendMessage(guideMessage('<p>' + aiTag + '请问什么时候执行？</p><p class="guide-tip">例如：明天 09:00 / 10月30日 下午3点</p>'));
        scrollToBottom();
      }
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
    agentTransferFlow(target, s.amount, '', channel, { forceConfirm: true, okLabel: '确认转账', remark: remark });
  }
}
