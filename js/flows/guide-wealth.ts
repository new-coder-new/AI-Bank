// ==========================================================================
//  引导层（TypeScript 源码，noCheck 转译）
//  编译产物：js/flows/guide-wealth.js
//  说明：该层是「经典脚本 + 全局状态」结构，状态对象（GUIDE_*）随流程变化，
//        因此采用 noCheck 转译；对外入口在 types/global.d.ts 声明。
// ==========================================================================

// 引导层：理财申购 / 持仓管理（由 guide.js 拆分而来）


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
function guideWealthTerm(p: any) {
  var d = String((p && p.desc) || '');
  var m = d.match(/(\d+)\s*天/);
  if (m) return m[1] + '天';
  if (/3年期|三年/.test(d + (p && p.name ? p.name : ''))) return '3年';
  if (/灵活/.test(d)) return '灵活存取';
  if (/长期/.test(d)) return '长期';
  return '期限灵活';
}

function guideWealthRecommendations(profile: any) {
  var level = Number(profile && profile.level) || 1;
  var list = (mockData.products || []).filter(function (p: any) { return Number(p.riskLevel) <= level; });
  list.sort(function (a: any, b: any) { return parseFloat(b.rate) - parseFloat(a.rate); });
  return list.slice(0, 2);
}

// 产品固定编号：1001 起，按商品表顺序分配（编号稳定，不随排序变化）
function guideWealthProductCode(p: any) {
  var list = mockData.products || [];
  var idx = -1;
  for (var i = 0; i < list.length; i++) {
    var it = list[i];
    if (!it || !p) continue;
    if (it === p || it.name === p.name) { idx = i; break; }
  }
  return idx >= 0 ? String(1001 + idx) : '';
}

// 判断文本里的四位数是不是「产品编号」：
//   ① 明确写了「编号 / 产品编号 / 代码」 → 是
//   ② 句子里同时有两个数字（编号 + 金额） → 是
//   ③ 只有一个四位数（如「1000」「1001」） → 当金额，不当编号
function guideWealthCodeCandidate(text: any) {
  var t = String(text || '');
  // ① 明确写了「编号 / 代码」：紧跟其后的四位数才是编号（避免「买1001元 编号为1000」取错）
  var explicit = t.match(/(?:编号|产品编号|代码|code)\s*(?:为|是|[:：])?\s*(\d{3,6})/i);
  if (explicit) return { code: explicit[1], explicit: true };
  // ② 没写「编号」：必须同时出现两个数字，才把前面那个四位数当编号
  var m = t.match(/(?:^|[^\d])(10\d{2})(?![\d])/);
  if (!m) return null;
  var nums = t.match(/\d+(?:\.\d+)?/g) || [];
  if (nums.length >= 2) return { code: m[1], explicit: false };
  return null;
}

// 从文本里识别四位数产品编号（1001-1099）
function guideWealthFindByCode(text: any) {
  var cand = guideWealthCodeCandidate(text);
  if (!cand) return null;
  var list = mockData.products || [];
  var idx = Number(cand.code) - 1001;
  return list[idx] || null;
}

// 文本里写的编号（可能是写错/不存在的编号），用于给出明确提示
function guideWealthExplicitCode(text: any) {
  var cand = guideWealthCodeCandidate(text);
  return (cand && cand.explicit) ? cand.code : null;
}

function guideWealthProductLine(p: any, i: any) {
  var circled = '①②③④⑤⑥⑦⑧⑨';
  var mark = circled.charAt(i) || (i + 1);
  var code = (typeof guideWealthProductCode === 'function') ? guideWealthProductCode(p) : '';
  return '<div>' + (code ? '<span class="prod-code">' + code + '</span> ' : '') + mark + ' <b>' + guideEsc(p.name) + '</b>（R' + p.riskLevel + '，' +
    guideEsc(guideWealthTerm(p)) + '，参考' + guideEsc(p.rateLabel || '年化') + ' ' + guideEsc(p.rate) + '）</div>';
}

// 全部在售产品（展开版，不折叠）；「查询所有产品」意图仍可用
function guideWealthShowAllProducts() {
  var list = (typeof mockData !== 'undefined' && mockData.products) || [];
  // 默认收起：先展示推荐置顶的 3 款，其余通过「展开更多」查看
  appendMessage(guideMessage(
    '<p>在售理财产品（共 ' + list.length + ' 支）</p>' +
    guideWealthProductsHtml(guideWealthValidProfile()) +
    '<p>请告诉我产品编号和申购金额。</p>' +
    '<p class="guide-tip">例如：申购1001，1000元</p>'
  ));
  scrollToBottom();
}

function guideWealthProductListHtml() {
  var items = (mockData.products || []).map(function (p: any, i: any) {
    return guideWealthProductLine(p, i);
  }).join('');
  return '<div class="guide-list">' + items + '</div>';
}

function guideWealthAccountTail() {
  var n = (mockData.userProfile && mockData.userProfile.debitCard && mockData.userProfile.debitCard.number) || '';
  var digits = String(n).replace(/\D/g, '');
  return digits ? digits.slice(-4) : '****';
}

// 产品行：左侧风险色条 + 名称/标签，右侧起购额与推荐标记
function guideWealthProdRow(p: any, i: any, recSet: any, opts: any) {
  var o = opts || {};
  var level = Number(p.riskLevel) || 1;
  var fit = o.userLevel >= level;
  var isRec = recSet && recSet[p.name];
  var riskColor = { 1: '#16A34A', 2: '#0E7490', 3: '#B45309', 4: '#B42318', 5: '#7F1D1D' }[level] || '#64748B';
  var hidden = (o.hiddenStart != null && i >= o.hiddenStart) ? ' list-hidden' : '';
  return '<div class="prod-item' + hidden + '" style="border-left-color:' + riskColor + ';">' +
    '<div class="prod-main">' +
      '<b class="prod-name">' + (guideWealthProductCode(p) ? '<span class="prod-code">' + guideWealthProductCode(p) + '</span> ' : '') + guideEsc(p.name) + '</b>' +
      '<span class="prod-tag" style="color:' + riskColor + ';">R' + level + '</span>' +
      (isRec ? '<span class="prod-badge">推荐</span>' : '') +
      (o.userLevel ? '<span class="prod-fit" style="color:' + (fit ? '#16A34A' : '#94A3B8') + ';">' + (fit ? '适配' : '超出承受力') + '</span>' : '') +
      '<div class="prod-sub">' + guideEsc(guideWealthTerm(p)) + ' · 参考' + guideEsc(p.rateLabel || '年化') + ' ' + guideEsc(p.rate) + '</div>' +
    '</div>' +
    '<div class="prod-side">起购 ¥' + guidePlainMoney(p.minAmount || 0) + '</div>' +
    '</div>';
}

// 一张卡展示产品：推荐置顶，默认只显示 3 款，其余折叠
function guideWealthProductsHtml(profile: any, opts: any) {
  var o = opts || {};
  var p = profile || guideWealthValidProfile();
  var level = p ? Number(p.level) || 0 : 0;
  var all = (mockData.products || []).slice();
  var recs = p ? guideWealthRecommendations(p) : [];
  var recNames: Record<string, any> = {};
  recs.forEach(function (r: any) { recNames[r.name] = true; });
  // 推荐在前（按收益率降序），其余按风险等级从低到高
  var rest = all.filter(function (x: any) { return !recNames[x.name]; })
    .sort(function (a: any, b: any) { return (Number(a.riskLevel) || 9) - (Number(b.riskLevel) || 9); });
  var ordered = recs.concat(rest);
  var boxId = o.boxId || ('wealth-products-' + Date.now());
  var shown = o.showAll ? ordered.length : Math.min(3, ordered.length);
  var rows = ordered.map(function (x: any, i: any) {
    return guideWealthProdRow(x, i, recNames, { userLevel: level, hiddenStart: shown });
  }).join('');
  var moreBtn = (ordered.length > 3)
    ? (o.showAll
        ? '<button class="card-more" onclick="guideWealthProductsToggle(\'' + boxId + '\')">收起产品列表</button>'
        : '<button class="card-more" onclick="guideWealthProductsToggle(\'' + boxId + '\')">展开更多 ' + (ordered.length - 3) + ' 款产品</button>')
    : '';
  var head = p
    ? '<p>您的风险测评结果：<b>' + guideEsc(p.name) + ' R' + p.level + '</b>，以下为在售产品（推荐置顶）：</p>'
    : '<p>当前在售产品：</p>';
  var inner = '<div class="data-card prod-card">' + head +
    '<div class="prod-list">' + rows + '</div>' + moreBtn +
    '</div>';
  window.__wealthProducts = window.__wealthProducts || {};
  window.__wealthProducts[boxId] = inner;
  if (o.innerOnly) return inner;
  return '<div id="' + boxId + '">' + inner + '</div>';
}

// 展开 / 收起产品列表（同一按钮来回切换）
function guideWealthProductsToggle(boxId: any) {
  var box = document.getElementById(boxId);
  if (!box) return;
  var expanded = box.getAttribute('data-expanded') === '1';
  var p = guideWealthValidProfile();
  box.innerHTML = guideWealthProductsHtml(p, { showAll: !expanded, boxId: boxId, innerOnly: true });
  box.setAttribute('data-expanded', expanded ? '0' : '1');
  scrollToBottom();
}

function guideWealthShowRecommendations(profile: any) {
  var p = profile || guideWealthValidProfile();
  if (!p) return;
  appendMessage(guideMessage(guideWealthProductsHtml(p, {}) +
    '<p>请告诉我产品编号和申购金额。</p>' +
    '<p class="guide-tip">例如：申购1001，1000元</p>'));
  scrollToBottom();
}

function guideWealthStartAssess() {
  if (!GUIDE_WEALTH) GUIDE_WEALTH = { stage: 'risk', product: null, amount: null };
  GUIDE_WEALTH.stage = 'assessing';
  if (typeof startRiskAssessment === 'function') startRiskAssessment(true);
}

function guideWealthCancelAssess() {
  GUIDE_WEALTH = null;
  if (!guideCollapseLatestChips('好的。完成风险测评后，随时可以来申购理财产品。')) {
    appendMessage(guideMessage('<p>好的。完成风险测评后，随时可以来申购理财产品。</p>'));
  }
  scrollToBottom();
}

// 产品名模糊匹配：整串命中优先，否则取最长公共子串（≥3 字）
function guideWealthFindProduct(text: any) {
  var byCode = (typeof guideWealthFindByCode === 'function') ? guideWealthFindByCode(text) : null;
  if (byCode) return byCode;
  var t = String(text || '').replace(/\s/g, '');
  if (!t) return null;
  var best = null;
  var bestScore = 0;
  (mockData.products || []).forEach(function (p: any) {
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

function guideWealthParse(text: any) {
  var t = String(text || '');
  // 只有被判定为「产品编号」时才从金额里剔除；单个 1000 / 1001 仍然当金额
  var cand = (typeof guideWealthCodeCandidate === 'function') ? guideWealthCodeCandidate(t) : null;
  var product = guideWealthFindProduct(t);
  // 只有编号确实对应到产品时才把它从金额里剔除；写错编号不能吞掉金额
  if (cand && product) t = t.replace(cand.code, ' ');
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

async function guideWealthStep(text: any) {
  var t = String(text || '').trim();
  var s = GUIDE_WEALTH;
  var plain = t.replace(/[吧呢啊呀。.!！?？\s]/g, '');

  // 写了「编号X」但 X 不存在：明确告诉用户可选编号，不再继续用旧产品
  var explicitCode = (typeof guideWealthExplicitCode === 'function') ? guideWealthExplicitCode(t) : null;
  if (explicitCode && !guideWealthFindByCode(t)) {
    var allCodes = (mockData.products || []).map(function (p: any) { return guideWealthProductCode(p) + ' ' + p.name; }).join('、');
    guideAsk(guideMessage('<p>编号 ' + guideEscapeText(explicitCode) + ' 没有对应的理财产品。</p>' +
      '<p class="guide-tip">可选编号：' + guideEscapeText(allCodes) + '</p>'));
    return true;
  }

  if (guideIsNegativeAmount(t)) {
    // 句子里可能同时带了产品（编号或名称）：先认出来，负数提示才能给出准确起购额
    var negProd = (typeof guideWealthFindProduct === 'function') ? guideWealthFindProduct(t) : null;
    if (negProd && !s.product) s.product = negProd;
    var minAmt = (s.product && Number(s.product.minAmount)) || 0;
    var negTip = minAmt > 0
      ? ('申购金额不能低于起购金额 ¥' + guidePlainMoney(minAmt) + '，请重新输入。')
      : '申购金额需要大于 0，请重新输入。';
    guideAsk(guideMessage('<p>' + negTip + '</p>'));
    return true;
  }

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
    appendMessage(guideMessage('<p>请告诉我产品编号和申购金额。</p>' +
      '<p class="guide-tip">例如：申购1001，1000元</p>'));
  scrollToBottom();
  return true;
  }

  appendMessage(guideMessage('<p>请告诉我产品编号和申购金额。</p>' +
      '<p class="guide-tip">例如：申购1001，1000元</p>'));
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
    appendMessage(guideMessage('<p>请告诉我产品编号和申购金额。</p>' +
    '<p class="guide-tip">例如：申购1001，1000元</p>'
  ));
    scrollToBottom();
    return;
  }
  if (Number(p.riskLevel) > Number(profile.level) && !s.riskOverride) {
    // 风险等级高于承受能力：不直接拦截，提醒风险并让用户自行确认
    appendMessage(guideMessage(
      '<p>「<b>' + guideEsc(p.name) + '</b>」的风险等级是 <b>R' + p.riskLevel + '</b>，高于您的风险承受能力 <b>R' + profile.level + '</b>（' + guideEsc(profile.name) + '）。</p>' +
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
    '<p>确认申购【<b>' + guideEsc(p.name) + '</b>】<b>' + guidePlainMoney(s.amount) + '</b> 元，默认从活期主账户（尾号' +
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
  guideCollapseLatestChips('已换个产品。');
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
  guideCollapseCardNote('确认申购', '已确认申购。');
  if (typeof executeBuyProduct === 'function') executeBuyProduct(name, amount);
}

function guideWealthCancel() {
  GUIDE_WEALTH = null;
  if (!guideCollapseCardNote('确认申购', '已取消申购，账户未发生扣款。')) {
    appendMessage(guideMessage('<p>已取消申购，账户未发生扣款。</p>'));
  }
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('wealth'); }, 400);
  scrollToBottom();
}

// 理财申购：产品名与金额（支持简称、别称、口语说法）
function guideWealthAIProduct(text: any) {
  var list = (mockData.products || []).map(function (p: any) { return p.name; }).join('、');
  return guideAISlots(
    text,
    '你是银行 App 的理财申购解析器。在售产品只有：' + list + '。' +
    '用户可能用简称或口语描述，请匹配到清单里的产品名；也请抽取申购金额（中文数字转阿拉伯数字）。' +
    '只输出 JSON：{"product":"或空","amount":数字或null}。',
    function (o: any) {
      if (!o) return null;
      var name = o.product ? String(o.product) : '';
      var hit = (mockData.products || []).filter(function (p: any) { return name && (name.indexOf(p.name) !== -1 || p.name.indexOf(name) !== -1); })[0] || null;
      var amt = Number(o.amount);
      if (!(amt > 0)) amt = null as any;
      if (!hit && amt === null) return null;
      return { product: hit, amount: amt };
    }
  );
}

function guideHoldingList() {
  return (mockData.userProfile.holdings || []).filter(function (h: any) { return h && h.status !== '已赎回'; });
}

function guideHoldingAccountTail() {
  var n = (mockData.userProfile && mockData.userProfile.debitCard && mockData.userProfile.debitCard.number) || '';
  var d = String(n).replace(/\D/g, '');
  return d ? d.slice(-4) : '****';
}

// 在产品名里做模糊匹配（先整串，再最长公共子串 ≥3）
// 持仓对应的产品编号（与在售产品一致：按产品列表顺序 1001 起）
function guideHoldingCode(h: any) {
  try {
    var list = (mockData && mockData.products) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && h && list[i].name === h.name) return String(1001 + i);
    }
  } catch (e) { /* 忽略 */ }
  return '';
}

function guideHoldingFind(text: any) {
  var t = String(text || '').replace(/\s/g, '');
  if (!t) return null;
  var list = guideHoldingList();

  // 先按产品编号匹配（如「赎回1001」「1002 全部」）
  var byCode: any = null;
  list.forEach(function (h: any) {
    var code = guideHoldingCode(h);
    if (!code) return;
    if (t.indexOf(code) !== -1) { if (!byCode) byCode = h; }
  });
  if (byCode) return byCode;
  var best = null, bestScore = 0;
  list.forEach(function (h: any) {
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

function guideHoldingAmount(text: any) {
  var t = String(text || '');
  var p = guideHoldingFind(t);
  if (p && (p as any).name) t = t.replace((p as any).name, ' ');
  // 产品编号（1001–1005）不是金额
  t = t.replace(/\b10(0[1-9]|[1-9]\d)\b/g, ' ');
  t = t.replace(/编号|产品号|代码/g, ' ');
  t = t.replace(/\d+\s*(天|年|期|个月|月)/g, ' ');
  var m = t.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (!m) return 0;
  var v = parseFloat(m[1]);
  if (m[2]) v *= 10000;
  return v;
}

// 封闭期判断：产品名/描述里有天数或年期，且买入日 + 期限还没到
function guideHoldingTermDays(h: any) {
  var prod = (mockData.products || []).filter(function (p: any) { return p.name === h.name; })[0] || {};
  var s = String(h.name || '') + ' ' + String(prod.desc || '');
  var m = s.match(/(\d+)\s*天/);
  if (m) return Number(m[1]);
  if (/三年|3年/.test(s)) return 1095;
  if (/(\d+)\s*年/.test(s)) return Number(RegExp.$1) * 365;
  return 0;
}

function guideHoldingClosed(h: any) {
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

function guideHoldingChoose(mode: any) {
  var s = GUIDE_HOLDING;
  if (!s) return;
  guideCollapseChoiceChips('需要赎回还是追加申购呢', mode === 'sub' ? '追加申购' : '赎回');
  if (mode === 'sub') {
    s.mode = 'sub';
    s.stage = 'subSlots';
    appendMessage(guideMessage('<p>请告诉我追加申购的产品编号和申购金额。</p>' +
      '<p class="guide-tip">例如：追加1003，1000元</p>'));
  } else {
    s.mode = 'redeem';
    s.stage = 'redeemSlots';
    appendMessage(guideMessage('<p>您可选择回复“全额”赎回全部持仓，或指定产品并告知赎回金额。</p>' +
      '<p class="guide-tip">例如：全额 / 赎回1001，1000 元</p>'));
  }
  scrollToBottom();
}

// 「全部赎回」类说法：卖/赎/取回/提现/清仓 + 全部/所有/一键/都
function guideHoldingAllRedeemIntent(text: any) {
  var s = String(text || '').replace(/\s/g, '');
  if (!s) return false;
  if (!/(卖|赎|取回|提现|清仓|退出)/.test(s)) return false;
  return /(全部|所有|一键|都|清仓|全卖|全赎|整笔)/.test(s);
}
async function guideHoldingStep(text: any) {
  if (guideIsNegativeAmount(text)) {
    guideAsk(guideMessage('<p>金额需要大于 0，请重新输入。</p>'));
    return true;
  }
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
      appendMessage(guideMessage('<p>【<b>' + guideEsc(s.product.name) + '</b>】当前处于封闭期，暂不支持赎回。</p>'));
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
    if (aiRedeem && (aiRedeem as any).action === 'redeem_all') {
      s.all = true;
      guideHoldingRedeemAllConfirm();
      return true;
    }
    if (aiRedeem && (aiRedeem as any).action === 'redeem') {
      var aiProduct = guideHoldingFind((aiRedeem as any).product || '') || (mockData.userProfile.holdings || []).filter(function (h: any) { return h.name === (aiRedeem as any).product; })[0];
      if (aiProduct) {
        s.product = aiProduct;
        if ((aiRedeem as any).amount > 0) s.amount = (aiRedeem as any).amount;
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

  // 确认阶段：支持直接打字「确认 / 取消」，不必点按钮
  if (s.stage === 'subConfirm' || s.stage === 'redeemConfirm' || s.stage === 'redeemAllConfirm') {
    if (/^(确认|确定|确认申购|确认赎回|确认一键赎回|是|好|好的|行|可以|继续|提交|提交申请)$/.test(plain)) {
      if (s.stage === 'subConfirm') { guideHoldingSubSubmit(); return true; }
      if (s.stage === 'redeemConfirm') { guideHoldingRedeemSubmit(); return true; }
      guideHoldingRedeemAllSubmit();
      return true;
    }
    if (/^(修改|改一下|重填|重新填写|重新输入)$/.test(plain)) { guideHoldingModify(); return true; }
    if (/^(取消|不|不要|算了|退出)$/.test(plain)) { guideHoldingCancel(); return true; }
    appendMessage(guideMessage('<p>请点击按钮，或直接回复「确认 / 取消」。</p>'));
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
  var prod = (mockData.products || []).filter(function (p: any) { return p.name === s.product.name; })[0] || {};
  var profile = guideWealthValidProfile();
  if (profile && Number(prod.riskLevel) > Number(profile.level) && !s.riskOverride) {
    s.stage = 'subRisk';
    appendMessage(guideMessage(
      '<p>该产品风险等级 <b>R' + prod.riskLevel + '</b>，高于您 <b>R' + profile.level + ' ' + guideEsc(profile.name) + '</b>的风险承受等级，是否追加申购？</p>' +
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
    '<p>确认对【<b>' + guideEsc(s.product.name) + '</b>】追加申购 <b>' + guidePlainMoney(s.amount) + '</b> 元，默认从活期主账户（尾号' +
    guideHoldingAccountTail() + '）扣款，请确认</p>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideHoldingSubSubmit()">确认申购</button>' +
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
  // 折叠风险提醒卡里的按钮，避免确认卡上方残留可点选项
  if (!guideCollapseCardNote('是否追加申购', '已确认继续追加。')) {
    guideCollapseLatestChips('已确认继续追加。');
  }
  guideHoldingSubConfirm();
}

async function guideHoldingSubSubmit() {
  var s = GUIDE_HOLDING;
  if (!s || s.stage !== 'subConfirm') return;
  guideCollapseLatestChips('已确认申购。');
  var name = s.product.name;
  var amount = Number(s.amount) || 0;
  var prod = (mockData.products || []).filter(function (p: any) { return p.name === name; })[0] || {};
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
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('wealth'); }, 400);
      scrollToBottom();
      return;
    }
  }
  var res = await callAgentTool('wealth.buy', { product: name, amount: amount });
  if (res && res.ok !== false) {
    appendMessage(guideMessage('<p>追加申购提交成功。</p>'));
    scrollToBottom();
    if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('wealth'); }, 400);
    return;
  }
  appendMessage(guideMessage('<p>追加申购失败：' + guideEsc((res && res.summary) || '业务执行异常') + '</p>'));
  scrollToBottom();
}

// 赎回确认卡（先查封闭期与持有金额）
function guideHoldingRedeemConfirm() {
  var s = GUIDE_HOLDING;
  if (!s || !s.product) return;
  var h = s.product;

  if (guideHoldingClosed(h)) {
    appendMessage(guideMessage('<p>【<b>' + guideEsc(h.name) + '</b>】当前处于封闭期，暂不支持赎回。</p>'));
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
    '<p>确认赎回【<b>' + guideEsc(h.name) + '</b>】<b>' + guidePlainMoney(amount) + '</b> 元，资金预计 T+1 到账活期主账户（尾号' +
    guideHoldingAccountTail() + '），请确认</p>' +
    (s.full ? '<p class="guide-tip">本次为全额赎回，赎回后该持仓清空。</p>' : '') +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideHoldingRedeemSubmit()">确认赎回</button>' +
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
  guideCollapseLatestChips('已确认赎回。');
  var res = await callAgentTool('wealth.redeem', { product: name, amount: amount });
  if (res && res.ok !== false) {
    var arriveText = (res && res.data && res.data.arriveDate) ? res.data.arriveDate : 'T+1';
    appendMessage(guideMessage('<p>赎回申请已提交，资金预计 <b>' + guideEsc(arriveText) + '</b> 到账活期主账户（尾号' + guideHoldingAccountTail() + '）。</p>'));
    scrollToBottom();
    if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('wealth'); }, 400);
    return;
  } else {
    appendMessage(guideMessage('<p>赎回失败：' + guideEsc((res && res.summary) || '业务执行异常') + '</p>'));
  }
  scrollToBottom();
}

// 一键赎回
function guideHoldingRedeemAllConfirm() {
  var s = GUIDE_HOLDING;
  if (!s) return;
  s.stage = 'redeemAllConfirm';
  var closedNames = guideHoldingList().filter(guideHoldingClosed).map(function (h: any) { return h.name; });
  appendMessage(guideMessage(
    '<p>确认一键发起全部可赎回产品的赎回申请；封闭期内产品暂不支持赎回，资金到期后返还活期主账户（尾号' +
    guideHoldingAccountTail() + '），是否继续？</p>' +
    (closedNames.length ? '<p class="guide-tip">封闭期产品：' + guideEsc(closedNames.join('、')) + '</p>' : '') +
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
  guideCollapseLatestChips('已确认一键赎回。');
  for (var i = 0; i < list.length; i++) {
    var h = list[i];
    if (guideHoldingClosed(h)) { closed.push(h.name); continue; }
    var res = await callAgentTool('wealth.redeem', { product: h.name, amount: h.amount });
    if (res && res.ok !== false) done.push(h.name);
  }
  appendMessage(guideMessage(
    '<p>一键赎回申请已提交，资金预计 T+1 到账活期主账户（尾号' + guideHoldingAccountTail() + '）。</p>' +
    '<p class="guide-tip">封闭期产品暂不支持赎回。</p>' +
    (done.length ? '<p class="guide-tip">已受理：' + guideEsc(done.join('、')) + '</p>' : '') +
    (closed.length ? '<p class="guide-tip">封闭期未赎回：' + guideEsc(closed.join('、')) + '</p>' : '')
  ));
  scrollToBottom();
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('wealth'); }, 400);
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
      guideEsc(s.product ? s.product.name : '未选') + '）。</p>'));
  } else {
    s.amount = null;
    s.full = false;
    s.stage = 'redeemSlots';
    appendMessage(guideMessage('<p>请重新告诉我赎回的产品名称和金额（当前产品：' +
      guideEsc(s.product ? s.product.name : '未选') + '，可回复“全额”）。</p>'));
  }
  scrollToBottom();
}

function guideHoldingCancel() {
  GUIDE_HOLDING = null;
  if (!guideCollapseLatestChips('已取消，持仓保持不变。')) {
    appendMessage(guideMessage('<p>已取消，持仓保持不变。</p>'));
  }
  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('wealth'); }, 400);
  scrollToBottom();
}
