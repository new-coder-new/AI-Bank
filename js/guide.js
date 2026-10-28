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
      { key: 'aa', label: 'AA收款', run: function () { guideStartAATransfer(); } }
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
      { key: 'apply', label: '卡片申请', aliases: ['申请信用卡'], run: function () { guideStartCardApply(); } },
      { key: 'mycards', label: '我的卡片', aliases: ['我的信用卡'], run: function () { showCardMyCards(); } },
      {
        key: 'limit', label: '额度调整', aliases: ['申请调整信用卡额度', '信用卡额度调整', '调额'],
        run: function () { guideStartCardLimitAdjust(); }
      },
      { key: 'txnlimit', label: '交易限制', run: function () { guideStartTxnLimit(); } },
      { key: 'lost', label: '卡片挂失', run: function () { guideStartCardLost(); } }
    ]
  },
  {
    key: 'wealth', label: '理财', icon: 'wealth',
    aliases: ['理财服务', '投资理财'],
    prompt: '理财服务包含这些内容，请选择：',
    subs: [
      { key: 'products', label: '产品申购', aliases: ['产品', '申购'], run: function () { guideStartWealthPurchase(); } },
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

  // AA 收款多轮收集进行中
  if (GUIDE_AA) {
    if (/^(取消|不做了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_AA = null;
      guideBackToMenu();
      return true;
    }
    var aaSvc = guideResolveService(t);
    if (aaSvc) {
      GUIDE_AA = null;
      guideOpenService(aaSvc.key);
      return true;
    }
    var transferSvcAA = guideServiceByKey('transfer');
    var aaSub = transferSvcAA && transferSvcAA.subs.filter(function (x) {
      return x.label === t || (x.aliases || []).indexOf(t) !== -1;
    })[0];
    if (aaSub) {
      GUIDE_AA = null;
      guidePickSub('transfer', aaSub.key);
      return true;
    }
    return guideAAStep(t);
  }

  // 理财申购多轮收集进行中（风评 → 产品/金额 → 确认）
  if (GUIDE_WEALTH) {
    if (/^(取消|不做了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_WEALTH = null;
      guideBackToMenu();
      return true;
    }
    var wSvc = guideResolveService(t);
    if (wSvc) {
      GUIDE_WEALTH = null;
      guideOpenService(wSvc.key);
      return true;
    }
    var wealthSvc = guideServiceByKey('wealth');
    var wSub = wealthSvc && wealthSvc.subs.filter(function (x) {
      return x.label === t || (x.aliases || []).indexOf(t) !== -1;
    })[0];
    if (wSub) {
      GUIDE_WEALTH = null;
      guidePickSub('wealth', wSub.key);
      return true;
    }
    return guideWealthStep(t);
  }

  // 申请信用卡多轮收集进行中（卡种 / 额度 / 用途 → 确认）
  if (GUIDE_CARD_APPLY) {
    if (/^(取消|不办了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_CARD_APPLY = null;
      guideBackToMenu();
      return true;
    }
    var cSvc = guideResolveService(t);
    if (cSvc) {
      GUIDE_CARD_APPLY = null;
      guideOpenService(cSvc.key);
      return true;
    }
    var cardSvc = guideServiceByKey('card');
    var cSub = cardSvc && cardSvc.subs.filter(function (x) {
      return x.label === t || (x.aliases || []).indexOf(t) !== -1;
    })[0];
    if (cSub) {
      GUIDE_CARD_APPLY = null;
      guidePickSub('card', cSub.key);
      return true;
    }
    return guideCardApplyStep(t);
  }

  // 信用卡额度调整申请进行中（目标额度 + 调整原因 → 确认）
  if (GUIDE_CARD_LIMIT) {
    if (/^(取消|不调了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_CARD_LIMIT = null;
      guideBackToMenu();
      return true;
    }
    var lSvc = guideResolveService(t);
    if (lSvc) {
      GUIDE_CARD_LIMIT = null;
      guideOpenService(lSvc.key);
      return true;
    }
    var limitCardSvc = guideServiceByKey('card');
    var lSub = limitCardSvc && limitCardSvc.subs.filter(function (x) {
      return x.label === t || (x.aliases || []).indexOf(t) !== -1;
    })[0];
    if (lSub) {
      GUIDE_CARD_LIMIT = null;
      guidePickSub('card', lSub.key);
      return true;
    }
    return guideCardLimitStep(t);
  }

  // 交易限制设置进行中
  if (GUIDE_TXN_LIMIT) {
    if (/^(取消|不设了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_TXN_LIMIT = null;
      guideBackToMenu();
      return true;
    }
    return guideTxnLimitStep(t);
  }

  // 卡片挂失进行中
  if (GUIDE_CARD_LOST) {
    if (/^(取消|不挂了|算了|退出|返回|菜单)$/.test(t)) {
      GUIDE_CARD_LOST = null;
      guideBackToMenu();
      return true;
    }
    return guideCardLostStep(t);
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

  // 去掉口语前缀，便于识别「我要转账」「帮我转账」
  var bare = t.replace(/^(我要|我想|我想用|帮我|我要用|使用)/, '');

  // ① 精确匹配：当前模块的子功能（模块内上下文，支持别名：产品 ↔ 产品申购、持仓 ↔ 我的持仓）
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
    stat: ['消费统计', '消费汇总', '统计'],
    report: ['账单报告', '月报', '报告'],
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
    holdings: ['我的持仓', '持仓', '持有']
  },
  life: {
    subscribe: ['订阅管理', '订阅', '会员'],
    birthday: ['生日鲜花', '生日', '鲜花']
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
    model: (typeof DEEPSEEK_MODEL !== 'undefined' && DEEPSEEK_MODEL) ? DEEPSEEK_MODEL : 'deepseek-chat',
    temperature: 0,
    max_tokens: 80,
    messages: [
      { role: 'system', content: '你是银行 App 的意图分类器。只能从给定清单里选服务/子功能，选不出就返回空。只输出 JSON，不要解释。' },
      { role: 'user', content: '清单：\n' + catalog + '\n\n用户说：' + text + '\n\n输出 JSON：{"service":"服务key或空","sub":"子功能key或空"}' }
    ]
  };

  var resp = await fetch(DEEPSEEK_API_URL, {
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

  // 定时转账走独立的多轮流程（收款人 / 金额 / 执行时间 → 重复方式 → 确认）
  if (GUIDE_TRANSFER && GUIDE_TRANSFER.kind === 'timed') {
    return guideTimedStep(t);
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
    if (s.amount > 0) { appendMessage(guideMessage('<p>请问收款手机号是多少？</p>')); scrollToBottom(); return true; }
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
// ------------------------------ 定时转账：3 槽位 + 重复方式 ------------------------------
// 目标字段：收款人 / 金额 / 执行时间；三样齐了再问「是否重复」，最后出确认卡。
// 缺字段时按缺失组合给出不同问句，避免每次都从第一个字段重新问。

function guideTimedMissingPrompt(s) {
  var missPayee = !s.payee;
  var missAmount = !(Number(s.amount) > 0);
  var missTime = !(s.date && s.time);

  if (missPayee && missAmount && missTime) return '请问收款人、转账金额和执行时间是多少？';
  if (!missPayee && missAmount && missTime) return '麻烦告诉转账金额和执行时间是多少';
  if (missPayee && !missAmount && missTime) return '麻烦告诉收款人和执行时间是多少';
  if (missPayee && missAmount && !missTime) return '麻烦告诉收款人和转账金额是多少';
  if (missTime) return '麻烦告诉我执行时间是多少';
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

function guideTimedStep(text) {
  var t = String(text || '').trim();
  var s = GUIDE_TRANSFER;

  // 重复方式阶段：只认 不重复 / 每天 / 每周 / 每月 / 每年
  if (s.stage === 'repeat') {
    var rep = guideTimedParseRepeat(t);
    if (!rep) {
      appendMessage(guideMessage('<p>请回复：不重复 / 每天 / 每周 / 每月 / 每年</p>'));
      scrollToBottom();
      return true;
    }
    s.repeat = rep;
    guideTimedConfirm();
    return true;
  }

  // 槽位阶段
  var parsed = guideTransferParse(t, 'timed');

  if (!parsed.payee && parsed.unknownName) {
    guideUnknownPayeeNotice(parsed.unknownName);
    return true;
  }

  if (parsed.payee) s.payee = parsed.payee;
  if (parsed.amount != null && parsed.amount > 0) s.amount = parsed.amount;
  if (parsed.date) s.date = parsed.date;
  if (parsed.time) s.time = parsed.time;
  if (parsed.period) s.period = parsed.period;

  // 先只说「下午」再补「3点」→ 按时间段换算成 15:00
  if (s.time && s.period) {
    var hh = parseInt(String(s.time).slice(0, 2), 10);
    if ((s.period === '下午' || s.period === '晚上') && hh < 12) {
      s.time = guidePad2(hh + 12) + String(s.time).slice(2);
    } else if (s.period === '中午' && hh < 11) {
      s.time = guidePad2(hh + 12) + String(s.time).slice(2);
    }
  }

  // 有日期没钟点（如「明天下午」）→ 追问具体钟点
  if (s.date && !s.time && s.period) {
    appendMessage(guideMessage(guidePeriodQuestion(s.period, s.date)));
    scrollToBottom();
    return true;
  }

  if (s.payee && Number(s.amount) > 0 && s.date && s.time) {
    s.stage = 'repeat';
    appendMessage(guideMessage('<p>是否重复（每天/每周/每月/每年）？</p>'));
    scrollToBottom();
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
      // 定时转账：AI 只补齐收款人/金额，时间与重复仍按对话规则继续追问
      if (s.date && s.time) {
        s.stage = 'repeat';
        appendMessage(guideMessage('<p>' + aiTag + '是否重复（每天/每周/每月/每年）？</p>'));
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
    agentTransferFlow(target, s.amount, '', channel, { forceConfirm: true, okLabel: '确认转账', remark: remark });
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
  GUIDE_AA = { total: 0, participants: [], stage: 'slots', pendingNames: [], pickOptions: [] };
  currentModule = 'transfer';
  appendMessage(guideMessage('<p>请告诉我你垫付的总金额和除你外需要收款的参与人</p>'));
  scrollToBottom();
}

// 从一句话里抽垫付总额与名单
function guideAAParse(text) {
  var t = String(text || '');
  var total = 0;
  var m = t.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (m) {
    total = parseFloat(m[1]);
    if (m[2]) total *= 10000;
    t = t.replace(m[0], ' ');
  }
  t = t.replace(/垫付|总额|总金额|总|收款|收|元|块|钱|包括|包含|和|还有|参与人|名单|aa/gi, ' ');
  var names = t.split(/[、,，;；\s]+/)
    .map(function (x) { return x.trim().replace(/[。.！!]$/, ''); })
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
  var splitCount = s.participants.length + 1;
  var per = s.total / splitCount;
  var names = s.participants.map(function (p) { return p.name; }).join('、');
  appendMessage(guideMessage(
    '<p>确认由你先行垫付 <b>' + guidePlainMoney(s.total) + '</b> 元，本次 AA 一共 <b>' + splitCount + '</b> 人（包含你）分摊，' +
    '向 <b>' + guideAAEsc(names) + '</b> 收款，每人应付 <b>' + guidePlainMoney(per) + '</b> 元，请确认</p>' +
    '<div class="guide-chips"><button class="guide-chip" onclick="guideAASubmit()">发起AA收款</button></div>'
  ));
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
  GUIDE_AA = null;

  var rows = '<div class="bank-confirm-rows">' +
    '<div><span>垫付总额</span><b>¥' + guidePlainMoney(s.total) + '</b></div>' +
    '<div><span>参与人数</span><b>' + splitCount + ' 人（含我）</b></div>' +
    '<div><span>收款名单</span><b>' + guideAAEsc(names.join('、')) + '</b></div>' +
    '<div><span>每人应付</span><b>¥' + guidePlainMoney(per) + '</b></div>' +
    '<div><span>当前状态</span><b style="color:#B54708;">待收款</b></div>' +
    '</div>';
  appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">AI Bank 助手</div><div class="msg-bubble agent-bubble">' +
    '<div class="bank-result">' +
    '<div class="bank-result-title">已发起 AA 收款</div>' +
    '<div class="bank-result-amount">¥' + guidePlainMoney(per) + '</div>' +
    rows +
    '<div style="margin-top:10px;"><button class="ui-link" onclick="showTransferHistory()">查看记录</button></div>' +
    '</div></div></div></div>');
  scrollToBottom();
}

function guideAAStep(text) {
  var t = String(text || '').trim();
  var s = GUIDE_AA;
  if (!s) return true;

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

  // 「还有其他参与人吗」的回答
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

function guideWealthStep(text) {
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

  var parsed = guideWealthParse(t);
  if (parsed.product) s.product = parsed.product;
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
  if (Number(p.riskLevel) > Number(profile.level)) {
    appendMessage(guideMessage(
      '<p>「<b>' + guideWealthEsc(p.name) + '</b>」的风险等级是 R' + p.riskLevel + '，高于您的风险承受能力 R' + profile.level + '，暂时无法申购。</p>' +
      '<p class="guide-tip">可以看看这些适配产品：</p>' +
      '<div class="guide-list">' + guideWealthRecommendations(profile).map(guideWealthProductLine).join('') + '</div>'
    ));
    scrollToBottom();
    s.product = null;
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
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideWealthSubmit()">确认申购</button>' +
    '<button class="guide-chip" onclick="guideWealthCancel()">取消</button>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideWealthSubmit() {
  var s = GUIDE_WEALTH;
  if (!s || s.stage !== 'confirm') return;
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

function guideCardApplyStep(text) {
  var t = String(text || '').trim();
  var s = GUIDE_CARD_APPLY;
  var parsed = guideCardApplyParse(t);

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
  appendMessage(guideMessage(
    '<p>已整理你的申请信息</p>' +
    '<div class="data-card"><div class="data-card-title">申请信息</div>' +
    '<div class="data-row"><span class="data-label">卡种</span><span class="data-value">' + guideCardApplyEsc(s.cardType) + '</span></div>' +
    '<div class="data-row"><span class="data-label">期望额度</span><span class="data-value">' + guideCardApplyMoney(s.limit) + ' 元</span></div>' +
    '<div class="data-row"><span class="data-label">主要用途</span><span class="data-value">' + guideCardApplyEsc(s.purpose) + '</span></div>' +
    '</div>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideCardApplySubmit()">提交申请</button>' +
    '<button class="guide-chip" onclick="guideCardApplyCancel()">取消</button>' +
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
  GUIDE_CARD_APPLY = null;
  appendMessage(guideMessage('<p>已取消卡片申请，未提交任何资料。</p>'));
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
  var d = (typeof cardLimitData === 'function') ? cardLimitData() : {};
  return {
    current: Number(d.effectiveLimit) || 0,
    used: Number(d.used) || 0,
    min: (typeof cardLimitMinimum === 'function') ? Number(cardLimitMinimum()) : Number(d.used) || 0
  };
}

function guideStartCardLimitAdjust() {
  GUIDE_CARD_LIMIT = { stage: 'slots', limit: 0, reason: null };
  currentModule = 'card';
  var st = guideCardLimitState();
  appendMessage(guideMessage(
    '<p>请告诉我想要调整到的目标额度，以及调整原因。</p>' +
    '<p class="guide-tip">可选原因：' + CARD_LIMIT_REASONS.join('、') + '</p>' +
    (st.current ? '<p class="guide-tip">当前额度 ¥' + st.current.toLocaleString('zh-CN') + '，最低可调至 ¥' + st.min.toLocaleString('zh-CN') + '（已用额度）</p>' : '')
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

function guideCardLimitStep(text) {
  var t = String(text || '').trim();
  var s = GUIDE_CARD_LIMIT;
  var parsed = guideCardLimitParse(t);

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
    return;
  }
  if (Number(s.limit) < st.min) {
    appendMessage(guideMessage('<p>目标额度不能低于已用额度 ¥' + st.min.toLocaleString('zh-CN') + '，请重新告诉我目标额度。</p>'));
    scrollToBottom();
    s.limit = 0;
    return;
  }

  s.stage = 'confirm';
  var direction = Number(s.limit) > st.current ? '提额' : '降额';
  appendMessage(guideMessage(
    '<p>确认额度调整申请</p>' +
    '<div class="data-card"><div class="data-card-title">申请信息</div>' +
    '<div class="data-row"><span class="data-label">目标额度</span><span class="data-value">' + Number(s.limit).toLocaleString('zh-CN') + ' 元</span></div>' +
    '<div class="data-row"><span class="data-label">调整原因</span><span class="data-value">' + guideCardLimitEsc(s.reason) + '</span></div>' +
    '<div class="data-row"><span class="data-label">调整方向</span><span class="data-value">' + direction + '（当前 ¥' + st.current.toLocaleString('zh-CN') + '）</span></div>' +
    '</div>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideCardLimitSubmit()">提交申请</button>' +
    '<button class="guide-chip" onclick="guideCardLimitCancel()">取消</button>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideCardLimitSubmit() {
  var s = GUIDE_CARD_LIMIT;
  if (!s || s.stage !== 'confirm') return;
  var st = guideCardLimitState();
  var target = Number(s.limit) || 0;
  var direction = target > st.current ? 'up' : 'down';
  GUIDE_CARD_LIMIT = null;

  if (typeof cardLimitSubmitReview === 'function') {
    cardLimitSubmitReview(target, s.reason, st.current, direction);
  }

  appendMessage(guideMessage(
    '<p>额度调整申请已提交，当前状态<b>待复核</b>，可点击入口查看复核进度。</p>' +
    '<div class="report-panel" style="margin-top:6px;">' +
    '<div class="report-panel-title">待复核</div>' +
    '<div class="report-row"><span>信用卡额度调整・' + guideCardLimitEsc(s.reason) + '</span>' +
    '<b>待复核・' + new Date().toLocaleDateString('zh-CN') + '</b></div>' +
    '</div>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="showCardLimitRecords()">查看调额记录</button>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideCardLimitCancel() {
  GUIDE_CARD_LIMIT = null;
  appendMessage(guideMessage('<p>已取消额度调整申请，额度保持不变。</p>'));
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

function guideStartTxnLimit() {
  GUIDE_TXN_LIMIT = { single: null, daily: null, night: null, overseas: null, stage: 'slots', askedReuse: false, basedOnCurrent: false };
  currentModule = 'card';
  appendMessage(guideMessage(
    '<p>请设置单笔限额、日累计限额，同时选择夜间交易（23:00-06:00）、境外交易是禁止还是允许。</p>' +
    '<p class="guide-tip">例如：单笔最多 5000 元，每天最多 10000 元，禁止夜间交易和境外交易</p>'
  ));
  scrollToBottom();
}

// 当前真实生效配置（读不到就返回 null，不编造）
function guideTxnLimitCurrent() {
  var d = mockData.userProfile && mockData.userProfile.txnLimit;
  if (!d || !(Number(d.single) > 0) || !(Number(d.daily) > 0)) return null;
  return {
    single: Number(d.single),
    daily: Number(d.daily),
    night: d.night === 'allow' ? 'allow' : 'block',
    overseas: d.overseas === 'allow' ? 'allow' : 'block'
  };
}

function guideTxnLimitParse(text) {
  var t = String(text || '');
  var out = { single: null, daily: null, night: null, overseas: null, modify: false };
  out.modify = /(改成|改为|改到|调整成|调整为|调成|调到|设置为|设置成|只改|仅改)/.test(t);

  var ms = t.match(/(?:单笔|每笔|单次)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (ms) { out.single = parseFloat(ms[1]); if (ms[2]) out.single *= 10000; }
  var md = t.match(/(?:日累计|每日|每天|当日|一天|一天内)[^\d]{0,10}(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (md) { out.daily = parseFloat(md[1]); if (md[2]) out.daily *= 10000; }

  function clauseFlag(c) {
    if (/(禁止|不允许|关闭|关掉|锁定|拦截|不支持)/.test(c)) return 'block';
    if (/(允许|开启|打开|放行|可用|支持)/.test(c)) return 'allow';
    return null;
  }
  var clauses = t.split(/[。；;，,\n]/);
  clauses.forEach(function (c) {
    if (/夜间/.test(c) && !out.night) { var f = clauseFlag(c); if (f) out.night = f; }
    if (/境外|海外/.test(c) && !out.overseas) { var f2 = clauseFlag(c); if (f2) out.overseas = f2; }
  });

  return out;
}

function guideTxnLimitMissingPrompt(s) {
  var miss = [];
  if (!(Number(s.single) > 0)) miss.push('单笔限额');
  if (!(Number(s.daily) > 0)) miss.push('日累计限额');
  if (!s.night) miss.push('夜间交易');
  if (!s.overseas) miss.push('境外交易');
  if (miss.length === 4) return '请设置单笔限额、日累计限额，同时选择夜间交易（23:00-06:00）、境外交易是禁止还是允许。';
  if (miss.length === 3 && miss[0] === '日累计限额') return '还需要设置日累计限额，以及夜间交易、境外交易的权限。';
  if (miss.length === 2 && miss[0] === '夜间交易' && miss[1] === '境外交易') return '还需要选择夜间交易、境外交易是禁止还是允许。';
  return '还需要设置' + miss.join('、') + '。';
}

function guideTxnLimitStep(text) {
  var t = String(text || '').trim();
  var plain = t.replace(/[吧呢啊呀。.!！?？\s]/g, '');
  var s = GUIDE_TXN_LIMIT;

  if (s.stage === 'askReuse') {
    if (/^(是|对|可以|沿用|好的|好|行|嗯|是的|沿用当前|用当前的|保持不变)$/.test(plain)) {
      var cur0 = guideTxnLimitCurrent();
      if (cur0) {
        if (!(Number(s.single) > 0)) s.single = cur0.single;
        if (!(Number(s.daily) > 0)) s.daily = cur0.daily;
        if (!s.night) s.night = cur0.night;
        if (!s.overseas) s.overseas = cur0.overseas;
        s.basedOnCurrent = true;
      }
      guideTxnLimitConfirm();
      return true;
    }
    if (/^(不|否|不用|重新|不要|不沿用)$/.test(plain)) {
      s.stage = 'slots';
      appendMessage(guideMessage('<p>' + guideTxnLimitMissingPrompt(s) + '</p>'));
      scrollToBottom();
      return true;
    }
    s.stage = 'slots';
  }

  var p = guideTxnLimitParse(t);
  if (p.single != null) s.single = p.single;
  if (p.daily != null) s.daily = p.daily;
  if (p.night) s.night = p.night;
  if (p.overseas) s.overseas = p.overseas;

  var complete = (Number(s.single) > 0 && Number(s.daily) > 0 && s.night && s.overseas);
  if (complete) { guideTxnLimitConfirm(); return true; }

  // 局部修改（「把单笔限额改成 3000 元」）：用当前生效配置补齐其余项
  var cur = guideTxnLimitCurrent();
  if (p.modify && cur) {
    if (!(Number(s.single) > 0)) s.single = cur.single;
    if (!(Number(s.daily) > 0)) s.daily = cur.daily;
    if (!s.night) s.night = cur.night;
    if (!s.overseas) s.overseas = cur.overseas;
    s.basedOnCurrent = true;
    guideTxnLimitConfirm();
    return true;
  }

  // 只说了某个场景开关：确认是否沿用当前配置
  if (cur && !s.askedReuse && (p.night || p.overseas) && !(Number(s.single) > 0 || Number(s.daily) > 0)) {
    s.askedReuse = true;
    s.stage = 'askReuse';
    var changed = p.overseas ? '境外交易将设为' + guideTxnLimitFlagText(p.overseas) : '夜间交易将设为' + guideTxnLimitFlagText(p.night);
    var rest = p.overseas ? '其余限额、夜间交易' : '其余限额、境外交易';
    appendMessage(guideMessage(
      '<p>' + changed + '。' + rest + '是否沿用当前已生效配置？</p>' +
      '<div class="guide-chips">' +
      '<button class="guide-chip" onclick="guideTxnLimitReuse(true)">沿用当前配置</button>' +
      '<button class="guide-chip" onclick="guideTxnLimitReuse(false)">重新设置</button>' +
      '</div>'
    ));
    scrollToBottom();
    return true;
  }

  appendMessage(guideMessage('<p>' + guideTxnLimitMissingPrompt(s) + '</p>'));
  scrollToBottom();
  return true;
}

function guideTxnLimitReuse(yes) {
  var s = GUIDE_TXN_LIMIT;
  if (!s) return;
  var cur = guideTxnLimitCurrent();
  if (yes && cur) {
    if (!(Number(s.single) > 0)) s.single = cur.single;
    if (!(Number(s.daily) > 0)) s.daily = cur.daily;
    if (!s.night) s.night = cur.night;
    if (!s.overseas) s.overseas = cur.overseas;
    s.basedOnCurrent = true;
    s.stage = 'slots';
    guideTxnLimitConfirm();
    return;
  }
  s.stage = 'slots';
  appendMessage(guideMessage('<p>' + guideTxnLimitMissingPrompt(s) + '</p>'));
  scrollToBottom();
}

function guideTxnLimitConfirm() {
  var s = GUIDE_TXN_LIMIT;
  if (!s) return;

  if (Number(s.single) > Number(s.daily)) {
    appendMessage(guideMessage(
      '<p>单笔限额 ' + guideTxnLimitMo(s.single) + ' 大于日累计限额 ' + guideTxnLimitMo(s.daily) + '，请核对后重新告诉我。</p>' +
      '<p class="guide-tip">单笔限额不应超过日累计限额。</p>'
    ));
    scrollToBottom();
    s.single = null;
    s.daily = null;
    return;
  }

  s.stage = 'confirm';
  var note = s.basedOnCurrent ? '<p class="guide-tip">基于当前生效配置，仅修改你这次指定的项目。</p>' : '';
  appendMessage(guideMessage(
    '<p>确认交易限制配置</p>' +
    '<div class="data-card"><div class="data-card-title">交易限制</div>' +
    '<div class="data-row"><span class="data-label">单笔限额</span><span class="data-value">' + (Number(s.single) || 0).toLocaleString('zh-CN') + ' 元</span></div>' +
    '<div class="data-row"><span class="data-label">日累计限额</span><span class="data-value">' + (Number(s.daily) || 0).toLocaleString('zh-CN') + ' 元</span></div>' +
    '<div class="data-row"><span class="data-label">夜间交易（23:00-06:00）</span><span class="data-value">' + guideTxnLimitFlagText(s.night) + '</span></div>' +
    '<div class="data-row"><span class="data-label">境外交易</span><span class="data-value">' + guideTxnLimitFlagText(s.overseas) + '</span></div>' +
    '</div>' + note +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideTxnLimitSubmit()">确认设置</button>' +
    '<button class="guide-chip" onclick="guideTxnLimitCancel()">取消</button>' +
    '</div>'
  ));
  scrollToBottom();
}

function guideTxnLimitSubmit() {
  var s = GUIDE_TXN_LIMIT;
  if (!s || s.stage !== 'confirm') return;
  var l = (typeof txnLimitData === 'function') ? txnLimitData() : (mockData.userProfile.txnLimit = {});
  l.single = Number(s.single) || 0;
  l.daily = Number(s.daily) || 0;
  l.night = s.night === 'allow' ? 'allow' : 'block';
  l.overseas = s.overseas === 'allow' ? 'allow' : 'block';
  saveUserData();
  GUIDE_TXN_LIMIT = null;
  appendMessage(guideMessage('<p>交易限制已更新完成。</p>'));
  scrollToBottom();
}

function guideTxnLimitCancel() {
  GUIDE_TXN_LIMIT = null;
  appendMessage(guideMessage('<p>已取消修改，交易限制保持原有配置。</p>'));
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
  GUIDE_CARD_LOST = { stage: 'slots', card: null };
  currentModule = 'card';
  appendMessage(guideMessage(
    '<p>请提供需要挂失的卡片尾号。</p>' +
    '<p class="guide-tip">' + (guideCardLostTailsText() || '例如：8888') + '</p>'
  ));
  scrollToBottom();
}

function guideCardLostStep(text) {
  var t = String(text || '').trim();
  var s = GUIDE_CARD_LOST;
  var digits = t.replace(/\D/g, '');

  if (digits.length < 4) {
    appendMessage(guideMessage('<p>请提供 4 位卡片尾号。</p><p class="guide-tip">' + (guideCardLostTailsText() || '') + '</p>'));
    scrollToBottom();
    return true;
  }

  var tail = digits.slice(-4);
  var card = guideCardLostCards().filter(function (c) { return String(c.tail) === tail; })[0];
  if (!card) {
    appendMessage(guideMessage(
      '<p>未找到尾号 <b>' + guideCardLostEsc(tail) + '</b> 的卡片。</p>' +
      '<p class="guide-tip">' + (guideCardLostTailsText() || '请确认卡号尾号后再试。') + '</p>'
    ));
    scrollToBottom();
    return true;
  }

  s.card = card;
  s.tail = tail;
  s.stage = 'confirm';
  appendMessage(guideMessage(
    '<p>确认挂失尾号 <b>' + guideCardLostEsc(tail) + '</b> 的' + guideCardLostEsc(card.cardType || '信用卡') + '。</p>' +
    '<p class="guide-tip">⚠️ 挂失后卡片立即冻结、无法继续交易；如需补卡，新卡预计 3-5 个工作日寄出。</p>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideCardLostSubmit()">确认挂失</button>' +
    '<button class="guide-chip" onclick="guideCardLostCancel()">取消</button>' +
    '</div>'
  ));
  scrollToBottom();
  return true;
}

function guideCardLostSubmit() {
  var s = GUIDE_CARD_LOST;
  if (!s || s.stage !== 'confirm') return;
  var card = s.card || {};
  // 卡片状态：主卡走全局冻结标记，其余卡片标记本身状态
  if (card.id === 'CARD-MAIN') {
    cardFrozen = true;
    if (mockData.userProfile.creditCard) mockData.userProfile.creditCard.isFrozen = true;
  }
  card.status = '已挂失';
  card.frozenAt = new Date().toLocaleString('zh-CN');
  saveUserData();
  GUIDE_CARD_LOST = null;

  appendMessage(guideMessage(
    '<p>挂失办理成功，卡片状态已更新。</p>' +
    '<div class="data-card"><div class="data-card-title">挂失信息</div>' +
    '<div class="data-row"><span class="data-label">卡片</span><span class="data-value">' + guideCardLostEsc(card.cardType || '信用卡') + ' · 尾号 ' + guideCardLostEsc(card.tail || '****') + '</span></div>' +
    '<div class="data-row"><span class="data-label">当前状态</span><span class="data-value" style="color:#B42318;">已挂失</span></div>' +
    '<div class="data-row"><span class="data-label">办理时间</span><span class="data-value">' + card.frozenAt + '</span></div>' +
    '</div>' +
    '<div class="guide-chips"><button class="guide-chip" onclick="showCardMyCards()">查看我的卡片</button></div>'
  ));
  scrollToBottom();
}

function guideCardLostCancel() {
  GUIDE_CARD_LOST = null;
  appendMessage(guideMessage('<p>已取消挂失，卡片状态保持不变。</p>'));
  scrollToBottom();
}
