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
        run: function () { showTransferForm('smart'); }
      },
      {
        key: 'phone', label: '手机号转账',
        run: function () {
          showTransferForm('smart');
          var forms = document.querySelectorAll('.transfer-form');
          var form = forms[forms.length - 1];
          if (!form) return;
          var tab = Array.prototype.filter.call(form.querySelectorAll('.tab'), function (t) {
            return t.textContent.indexOf('手机号') !== -1;
          })[0];
          if (tab) switchTransferTab(tab, 'phone');
        }
      },
      { key: 'timed', label: '定时转账', run: function () { showTransferForm('timed'); } },
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
      { key: 'products', label: '产品', run: function () { showProductList(); } },
      { key: 'risk', label: '风险评估', run: function () { startRiskAssessment(); } },
      { key: 'holdings', label: '持仓', run: function () { showHoldings(); } }
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
    '<div class="guide-foot"><button class="ui-link" onclick="guideBackToMenu()">返回服务菜单</button></div>'
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

  // 先按当前模块的子功能匹配（模块内上下文）
  var cur = guideServiceByKey(currentModule);
  if (cur) {
    var hitSub = cur.subs.filter(function (x) { return x.label === bare; })[0];
    if (hitSub) {
      guidePickSub(cur.key, hitSub.key);
      return true;
    }
  }

  // 再按一级服务名匹配
  for (var i = 0; i < GUIDE_SERVICES.length; i++) {
    var s = GUIDE_SERVICES[i];
    var names = [s.label].concat(s.aliases || []);
    for (var j = 0; j < names.length; j++) {
      if (bare === names[j]) {
        guideOpenService(s.key);
        return true;
      }
    }
  }

  return false;
}
