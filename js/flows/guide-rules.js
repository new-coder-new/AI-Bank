// ==========================================================================
//  服务向导 · 规则识别层（本地关键词 / 正则 / 菜单解析）
//
//  本文件**不调用任何模型**（0 次 guideLLMJson），只做零成本的本地判断：
//
//  1) 菜单与别名解析：guideResolveService / guideServiceByKey / guideSubFindService
//     —— 用户说「转账」「卡片挂失」「调额」这类词，直接命中服务与子功能。
//  2) 关键词与正则判断：guideIsXxx 系列（账单/理财/持仓/订阅/挂失/调额…）
//     —— 供 guideHandleText ⑥ 在模型判不出时兜住常见说法。
//  3) 常量表：GUIDE_SERVICES / GUIDE_HOME_ENTRIES / 关键词表 / 花束与蛋糕价格等。
//
//  与模型层的关系：意图层模型优先（guide-ai.js），模型判不出 → 回落本文件；
//  槽位层正则有把握就直接用（纯数字、尾号、联系人姓名），抽不全才交给模型。
// ==========================================================================

var GUIDE_SERVICES = [
  {
    key: 'transfer', label: '转账', icon: 'transfer',
    aliases: ['智能转账', '转账服务'],
    prompt: '您好，请问你需要姓名转账、手机号转账、定时转账，还是AA收款？',
    subs: [
      { key: 'name', label: '姓名转账', example: '给张三转账1000元', run: function () { guideStartNameTransfer(); } },
      { key: 'phone', label: '手机号转账', example: '转账给13800138000', run: function () { guideStartPhoneTransfer(); } },
      { key: 'timed', label: '定时转账', example: '明天下午3点转账给张三', run: function () { guideStartTimedTransfer(); } },
      { key: 'aa', label: 'AA收款', example: '我和张三AA，我垫了600元', run: function () { guideStartAATransfer(); } }
    ]
  },
  {
    key: 'bill', label: '账单分析', icon: 'bill',
    aliases: ['账单'],
    prompt: '账单分析包含收支结构、支出构成和近 7 日趋势，也可以直接看异常交易：',
    subs: [
      { key: 'overview', label: '账单分析', example: '分析本月账单', aliases: ['财务总览', '消费统计', '账单报告', '账单'], run: function () { showBillOverview(); } },
      { key: 'abnormal', label: '异常交易', example: '查看异常交易', run: function () { showAbnormalAlert(); } }
    ]
  },
  {
    key: 'card', label: '卡片管理', icon: 'card',
    aliases: ['卡片'],
    prompt: '卡片管理包含这些操作，请选择：',
    subs: [
      { key: 'apply', label: '卡片申请', example: '办一张金卡，额度5万', aliases: ['申请信用卡'], run: function () { guideStartCardApply(); } },
      { key: 'mycards', label: '我的卡片', example: '查看我的信用卡', aliases: ['我的信用卡'], run: function () { showCardMyCards(); } },
      { key: 'limit', label: '额度调整', example: '白金卡额度提到8万', aliases: ['申请调整信用卡额度', '信用卡额度调整', '调额'], run: function () { guideStartCardLimitAdjust(); } },
      { key: 'txnlimit', label: '交易限制', example: '6789的卡，单笔限额2万', run: function () { guideStartTxnLimit(); } },
      { key: 'lost', label: '卡片挂失', example: '挂失尾号6789的卡', run: function () { guideStartCardLost(); } }
    ]
  },
  {
    key: 'wealth', label: '理财', icon: 'wealth',
    aliases: ['理财服务', '投资理财'],
    prompt: '理财服务包含这些内容，请选择：',
    subs: [
      { key: 'products', label: '产品申购', example: '申购1001，5000元', aliases: ['产品', '申购'], run: function () { guideStartWealthPurchase(); } },
      { key: 'risk', label: '风险评估', example: '做一次风险测评', run: function () { startRiskAssessment(); } },
      { key: 'holdings', label: '持仓管理', example: '查看持仓收益', aliases: ['持仓', '我的持仓'], run: function () { guideStartHoldings(); } },
      { key: 'catalog', label: '在售产品清单', example: '有哪些理财产品', aliases: ['产品清单', '在售产品'], run: function () { guideWealthShowAllProducts(); } }
    ]
  },
  {
    key: 'life', label: '生活订购', icon: 'bell',
    aliases: ['生活', '生活服务'],
    prompt: '生活订购包含这些服务，请选择：',
    subs: [
      { key: 'subscribe', label: '订阅管理', example: '订阅某易云年卡', aliases: ['我的订阅'], run: function () { guideStartSubManage(); } },
      { key: 'birthday', label: '生日鲜花', example: '给林小雨订一束花', aliases: ['鲜花订购', '订花', '买花', '鲜花订单'], run: function () { guideStartBirthdayFlower(); } }
    ]
  }
];


function guideServiceByKey(key) {
  for (var i = 0; i < GUIDE_SERVICES.length; i++) {
    if (GUIDE_SERVICES[i].key === key) return GUIDE_SERVICES[i];
  }
  return null;
}


// 一级菜单：对话起始欢迎语
// 「账户概览」入口暂时屏蔽：需要恢复时把下面开关改成 true 即可
var GUIDE_SHOW_OVERVIEW = false;

// 统一重置所有向导会话。任何新的服务/子功能入口都先结束旧流程，
// 避免「转账会话 + 理财会话」同时存在导致输入被旧会话抢走。

// 只读查询不应被「打开功能菜单」或「调额申请」劫持：
// 「查余额 / 查信用卡额度 / 看交易记录」交回主链路（chat/agent 的只读处理器）。
function guideIsReadOnlyQuery(text) {
  var s = String(text || '').trim();
  if (!s) return false;
  // 明确是变更类操作时不算只读查询
  if (/(调整|提升|提高|降低|申请|办理|设置|修改|取消|关闭|开启|挂失|购买|申购|赎回|提额|调高|调低|调额|提到|调到|改到|改成|升到|升至|降到|降至|变成|涨到)/.test(s)) return false;
  // 「我要调我的信用卡额度」「把额度降一点」这类也属于变更，不能当成只读查询
  if (/额度/.test(s) && /(调|改|降|升|加|减)/.test(s)) return false;
  if (!/(余额|额度|交易记录|最近交易|流水)/.test(s)) return false;
  return /^(查|看|看看|查看|查询|显示|我的|我|帮我|麻烦|请问|还有|还剩)/.test(s) ||
    /(多少|余额|额度)/.test(s);
}

// 回答后把这一步的按钮收起来（保留一句已选项）

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

// 句子里带时间/日期说法 → 视为定时转账
function guideLooksTimedTransfer(t) {
  var s = String(t || '');
  if (/(定时|预约|计划|稍后|以后|到期执行)/.test(s)) return true;
  return /(明天|今天|后天|大后天|下周|下个?周|周[一二三四五六日天]|星期[一二三四五六日天]|月底|月初|下月|每月|每周|每天|明年|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|\d{1,2}\s*[点时]|\d{1,2}\s*[:：]\s*\d{2}|上午|下午|晚上|早上|中午)/.test(s);
}
// 一句话里已经带齐金额/收款人/产品时，直接进入业务流，不再先给二级菜单。
// 这是「给张三转账1000元」被菜单吞掉的直接修复。

// 主菜单按钮：生活订购拆成「订阅管理」「生日鲜花」两个入口
var GUIDE_HOME_ENTRIES = [
  { label: '转账', action: "guideOpenService('transfer')" },
  { label: '账单分析', action: "guideOpenService('bill')" },
  { label: '卡片管理', action: "guideOpenService('card')" },
  { label: '理财', action: "guideOpenService('wealth')" },
  { label: '订阅管理', action: 'guideStartSubManage()' },
  { label: '生日鲜花', action: 'guideStartBirthdayFlower()' }
];


// 「某度网盘年卡开一下自动续费 / 关闭某讯会员自动续费」→ 直接进管理自动续费
function guideIsSubRenewManagePhrase(t) {
  var s = String(t || '').trim();
  if (!s) return false;
  if (!/续费/.test(s)) return false;
  if (!/(开一下|开启|打开|恢复|关一下|关闭|关掉|管理|设置|调整)/.test(s)) return false;
  return /(会员|vip|VIP|年卡|月卡|季卡|包年|包月|自动续费|某易云|易云|网易云|某讯|腾讯|某度|百度|网盘)/.test(s);
}
// 「某度网盘年卡不续费了」→ 关闭自动续费（订阅管理·管理自动续费）

// 「某度网盘年卡不续费了」→ 关闭自动续费（订阅管理·管理自动续费）
function guideIsSubRenewOffPhrase(t) {
  var s = String(t || '').trim();
  if (!s) return false;
  if (!/续费/.test(s)) return false;
  return /(不续费|不想续费|不要续费|不打算续费|关闭续费|关掉续费|别续费|不用续费|不想再续|不自动续费|不再续费)/.test(s);
}
// 「我不想订阅某易云了 / 取消某讯会员」→ 直接进取消订阅并带上服务

// 「我不想订阅某易云了 / 取消某讯会员」→ 直接进取消订阅并带上服务
function guideIsSubCancelPhrase(t) {
  var s = String(t || '').trim();
  if (!s) return false;
  if (!/(订阅|会员|vip|VIP|续费|某易云|易云|网易云|某讯|腾讯|某度|百度|网盘)/.test(s)) return false;
  return /(取消|退订|不订阅|不想订阅|不要订阅|不订了|不想要了|不想续费|不要续费|关闭续费|别订了)/.test(s);
}
// 「我想要添加订阅 / 开通个会员」这类没点名服务的说法 → 直接进添加订阅

// 「我想要添加订阅 / 开通个会员」这类没点名服务的说法 → 直接进添加订阅
function guideIsSubAddPlain(t) {
  var s = String(t || '').trim();
  if (!s) return false;
  if (/(取消|退订|关闭|不订|不要|不想)/.test(s)) return false;
  if (!/订阅/.test(s) && !/(开通|办理|订购).{0,3}会员/.test(s)) return false;
  return /(添加|增加|新增|加个|加一个|开通|办理|订购|订一个|订阅一个|来一个|办个|来个|想要|我想|我要)/.test(s);
}
// 「我想要订阅某易云年卡 / 订购某度网盘年卡」→ 直接进添加订阅，并把服务与周期解析出来

// 「我想要订阅某易云年卡 / 订购某度网盘年卡」→ 直接进添加订阅，并把服务与周期解析出来
function guideIsSubAddPhrase(t) {
  var s = String(t || '').trim();
  if (!s) return false;
  if (/(取消|退订|关闭|停止|解约)/.test(s)) return false;
  if (!/(订阅|订购|开通|添加|买)/.test(s)) return false;
  return /(会员|vip|VIP|年卡|月卡|季卡|包年|包月|包季|某易云|易云|网易云|某讯|腾讯|某度|百度|网盘)/.test(s);
}
// 「我买了哪些产品 / 我持有几只基金」→ 看持仓管理，而不是产品推荐

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

// 「我现在有哪些卡 / 我的卡片 / 几张卡」→ 直接列出卡片
function guideIsCardListQuery(t) {
  var s = String(t || '').trim();
  if (!/卡/.test(s)) return false;
  // 变更类动作优先排除
  if (/(办|申请|挂失|冻结|解冻|注销|限额|额度调整|调额|提额|调整|修改|设置)/.test(s)) return false;
  if (/(哪些|几张|什么|所有|全部|都有)/.test(s) && /(卡|信用卡)/.test(s)) return true;
  // 「查看我的信用卡 / 看看我的卡 / 查询卡片」这类只读说法
  return /^(查看|看看|查一下|查询|显示)?(我的)?(信用卡|卡片|卡)$/.test(s) ||
    /^(查看|看看|查一下|查询|显示)(我的)?(信用卡|卡片|卡)(信息|列表)?$/.test(s);
}
// 「我要调我的信用卡额度 / 提额」这类说法 → 直接进入额度调整对话，而不是只展示额度信息

// 「我要调我的信用卡额度 / 提额」这类说法 → 直接进入额度调整对话，而不是只展示额度信息
function guideIsCardLimitAdjustIntent(t) {
  var s = String(t || '');
  if (!/额度|提额/.test(s)) return false;
  if (!/(信用卡|卡片|卡|额度)/.test(s)) return false;
  return /(调|调整|提额|提高|提升|调高|调低|降低|增加|减少|申请调整|改)/.test(s);
}
// 「分析账单 / 看看账单 / 消费统计 / 账单报告」这类说法 → 直接弹出账单分析

// 「分析账单 / 看看账单 / 消费统计 / 账单报告」这类说法 → 直接弹出账单分析
function guideIsBillAnalysisIntent(t) {
  var s = String(t || '').trim();
  if (!/(账单|消费|收支|花销|流水)/.test(s)) return false;
  if (/^(账单|消费)$/.test(s)) return false;
  return /(分析|看看|看一下|看下|查看|查一下|查询|统计|报告|情况|健康|明细|画像|走势|趋势|结构)/.test(s) ||
    /^(消费统计|账单报告|账单分析|财务总览)$/.test(s);
}
// 一句话里既有转账动作又有时间说法（「明天下午5点，给张三转1000元」）→ 定时转账

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

// 意图识别相关：去掉「想看 / 帮我 / 一下」等口语成分，只留下功能相关词
function guideNormalizeText(text) {
  return String(text || '').trim()
    .replace(/^(我想看一下|我想看看|我想看|我要看一下|我要看看|我要看|我想用|我要用|我想|我要|帮我|麻烦|请|看一下|看看|看下|查一下|查下|打开|进入|来一下)/, '')
    .replace(/(一下|的功能|功能|服务|模块|页面|界面|板块|吧|呢|啊|吗|，|,|。|！|!|\?|？|\s)/g, '')
    .replace(/个(?=账|账|钱|款)/g, '');   // 「转个账」→「转账」
}

// 只在「明显是打开某功能」的短句上做模糊匹配，避免劫持「给张三转100」这类业务指令

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
    lost: ['卡片挂失', '挂失', '冻结卡片', '卡丢了', '卡遗失', '卡不见了']
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

// 规则层：本地关键词/正则命中就直接接管；都失配时才由 guide-ai.js 的模型识别补位

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

// 姓名转账只允许转给通讯录联系人
function guideIsContact(name) {
  return (mockData.contacts || []).some(function (c) { return c.name === name; });
}


function guideContactNames() {
  return (mockData.contacts || []).map(function (c) {
    return (typeof escapeHtml === 'function') ? escapeHtml(c.name) : c.name;
  }).join('、') || '暂无联系人';
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

// 用户说「查询所有产品 / 全部产品 / 更多产品」时的意图判断
// 理财内：问「有哪些理财产品 / 产品清单」
function guideIsWealthCatalogQuery(text) {
  var s = String(text || '').trim();
  if (!s) return false;
  // 「我买了哪些产品 / 我的持仓 / 持有收益」属于查询自己持有的，不是看货架
  if (/(买了|买过|持有|持仓|我的产品|我的理财|收益情况)/.test(s)) return false;
  if (/(有哪些|哪些|有什么|有啥|能买|可以买|可买|买什么).{0,8}(理财|产品|基金)/.test(s)) return true;
  if (/(理财|产品|基金).{0,8}(有哪些|哪些|清单|列表|大全|目录|一览)/.test(s)) return true;
  return (typeof guideIsAllProductsIntent === 'function') && guideIsAllProductsIntent(s);
}

// 订阅内：问「能订哪些会员 / 有哪些可订阅」
function guideIsSubCatalogQuery(text) {
  var s = String(text || '').trim();
  if (!s) return false;
  if (/(有哪些|哪些|有什么|有啥|能订|可以订|可订|能开|可以开).{0,8}(会员|订阅|VIP|vip|服务)/.test(s)) return true;
  if (/(会员|订阅|VIP|vip).{0,8}(有哪些|哪些|清单|列表|大全|目录)/.test(s)) return true;
  return /(可订阅|能订阅|会员清单|订阅清单)/.test(s);
}

function guideIsAllProductsIntent(text) {
  var s = String(text || '').trim();
  if (!s) return false;
  if (/(所有|全部|其它|其他|更多|在售|别的|还有).{0,4}(产品|理财|基金)/.test(s)) return true;
  if (/(产品|理财|基金).{0,3}(列表|清单|大全)/.test(s)) return true;
  return false;
}


var CARD_APPLY_TYPES = ['白金信用卡', '标准金卡', '旅行信用卡', '青年卡'];

var CARD_APPLY_PURPOSES = ['日常消费', '出行差旅', '教育培训', '大额购物', '其他'];


var CARD_LIMIT_REASONS = ['消费需求增加', '收入提升', '信用记录良好', '主动降低额度', '长期不用', '风险控制', '其他'];


var SUB_PRESETS = [
  { id: 'music', name: '某易云 VIP', prices: { '/月': 25, '/季': 60, '/年': 150 } },
  { id: 'video', name: '某讯 VIP', prices: { '/月': 30, '/季': 80, '/年': 200 } },
  { id: 'cloud', name: '某度网盘 VIP', prices: { '/月': 40, '/季': 120, '/年': 300 } }
];

var SUB_CYCLE_TEXT = { '/月': '按月扣费', '/季': '按季扣费', '/年': '按年扣费' };


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

// 蛋糕加购（生日花礼一起送）
var FLOWER_CAKES = [
  { name: '无蛋糕', price: 0 },
  { name: '6寸水果蛋糕', price: 168 },
  { name: '8寸奶油蛋糕', price: 228 }
];

