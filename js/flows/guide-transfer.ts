// ==========================================================================
//  引导层（TypeScript 源码，noCheck 转译）
//  编译产物：js/flows/guide-transfer.js
//  说明：该层是「经典脚本 + 全局状态」结构，状态对象（GUIDE_*）随流程变化，
//        因此采用 noCheck 转译；对外入口在 types/global.d.ts 声明。
// ==========================================================================

// 引导层：转账 / AA / 定时转账（由 guide.js 拆分而来）

// 「是否重复？」卡片（答错会再弹一次，每次都记为最新一张）
function guideTimedAskRepeat(prefix: any) {
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
function guideTimedRepeatChoose(repeat: any) {
  var s = GUIDE_TRANSFER;
  if (!s || s.stage !== 'repeat') return;
  s.repeat = repeat;
  guideChipsDone(s.repeatBoxId, '重复方式：' + repeat);
  guideTransferAskRemark();
}

// 供向导内部使用的轻量金额解析：支持千分位、亿/万/千，且跳过 11 位手机号。
function guideParseSimpleAmount(text: any) {
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

function guideTimedPhraseIntent(t: any) {
  var s = String(t || '');
  if (!/(转给|转账|转帐|打钱|汇款|付款|转\s*\d|给.{1,6}转)/.test(s)) return false;
  return /(今天|明天|后天|大后天|下周|下个月|本周|上周|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}\s*月\s*\d{1,2}\s*[日号]|\d{1,2}\s*[点时]|\d{1,2}:\d{2}|上午|下午|晚上|中午|早上|凌晨|每月|每周|每天|每年)/.test(s);
}

// 一句话里出现 AA / 分摊 / 垫付 → AA 收款
function guideAAPhraseIntent(t: any) {
  var s = String(t || '');
  return /(aa|AA|Aa|分摊|平摊|垫付)/.test(s);
}

function guideStartNameTransfer() {
  guideResetAllSessions();
  GUIDE_TRANSFER = { kind: 'name', payee: null, phone: null, amount: null, remark: '', stage: 'slots' };
  currentModule = 'transfer';
  appendMessage(guideMessage(
    '<p>请问收款人和转账金额是多少？</p>' +
    '<p class="guide-tip">例如：给张三转账1000元</p>'
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
  GUIDE_TRANSFER = ({
    kind: 'timed', payee: null, phone: null, amount: null,
    date: null, time: null, repeat: '不重复', remark: '', stage: 'slots'
  }) as any;
  currentModule = 'transfer';
  appendMessage(guideMessage(
    '<p>请问收款人、转账金额和执行时间是多少？</p>' +
    '<p class="guide-tip">例如：张三，100，明天下午5点</p>'
  ));
  scrollToBottom();
}

// 从一句话里抽日期 / 时间 / 重复方式，命中后从原句剔除，避免干扰金额与收款人
function guideTimedExtract(text: any) {
  var t = String(text || '');
  var out: any = { date: null, time: null, repeat: null, period: null };

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
function guideTransferParse(text: any, kind: any) {
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
  var nums: any[] = [];
  var numRe = /(\d[\d,]*(?:\.\d+)?)\s*(亿|千万|百万|万|w|W|千|k|K)?/g;
  var nm;
  while ((nm = numRe.exec(t)) !== null) {
    nums.push({ text: nm[0], value: nm[1], unit: nm[2], prefix: t.slice(0, nm.index) });
    if (nm[0].length === 0) numRe.lastIndex += 1;
  }
  if (nums.length) {
    var looksPhone = function (v: any) { return /^1\d{3,10}$/.test(String(v).replace(/,/g, '')); };
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
    else if (last.unit === '千万') amount *= 10000000;
    else if (last.unit === '百万') amount *= 1000000;
    else if (last.unit === '万' || last.unit === 'w' || last.unit === 'W') amount *= 10000;
    else if (last.unit === '千' || last.unit === 'k' || last.unit === 'K') amount *= 1000;
    if (!(amount > 0) || negativeAmount) amount = null;
    t = t.replace(last.text, ' ');
    // 剩下的数字如果像「位数不足的手机号」，记下来提示用户
    var leftovers = nums.filter(function (x: any, i: any) { return i !== amtIdx; })
      .map(function (x: any) { return x.value.replace(/,/g, ''); });
    var maybePhone = leftovers.filter(function (x: any) { return /^1\d{3,9}$/.test(x); })[0];
    if (!phone && maybePhone) phoneLike = maybePhone;
  }
  var rest = t
    .replace(/转账|转帐|转|给|向|帮|请|我|你|人民币|元|块|钱|是|吧|呢|，|,|。|、/g, '')
    .replace(/[就他她它点些啊嘛呀哈嗯]/g, '')
    .replace(/\s+/g, '');

  var payee = null;
  var unknownName = '';
  if (rest) {
    var contact = (mockData.contacts || []).filter(function (c: any) {
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
// 备注阶段统一处理（即时转账 / 定时转账共用）：
// 问「是否需要添加备注？」时认「是 / 否」，其它文字直接当备注内容；等备注内容时这一句就是备注
function guideTransferHandleRemarkStage(text: any) {
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

function guideTransferStep(text: any) {
  var t = String(text || '').trim();
  if (/^(取消|不转了|算了|退出|返回|菜单)$/.test(t)) {
    GUIDE_TRANSFER = null;
    guideExitSilently();
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
  var subHit = transferSvc && transferSvc.subs.some(function (x: any) {
    return x.label === bare || (x.aliases || []).indexOf(bare) !== -1;
  }) as any;
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

  // 已有收款人、只缺金额时：完全不像金额的输入（如「哈哈哈」）直接重复问金额，
  // 不再走模型 / 陌生姓名提示，保证连续追问一致
  if (s.kind !== 'timed' && (s.payee || s.phone) && !(Number(s.amount) > 0) && !(Number((parsed as any).amount) > 0)) {
    var amountish = /\d/.test(t) || /[一二三四五六七八九十百千万两]/.test(t) || /(元|块|万|千)/.test(t);
    if (!amountish) {
      guideSayInvalid(guideMessage('<p>麻烦告诉我转账金额</p>'));
      return true;
    }
  }

  // 姓名转账：非通讯录姓名直接提示，不进入槽位
  if (s.kind === 'name' && !parsed.payee && parsed.unknownName) {
    guideUnknownPayeeNotice(parsed.unknownName, t);
    return true;
  }

  if (parsed.phone) s.phone = parsed.phone;
  if (parsed.payee) s.payee = parsed.payee;
  if ((parsed as any).amount != null && (parsed as any).amount > 0) s.amount = (parsed as any).amount;

  var hasTarget = s.kind === 'phone' ? !!s.phone : !!s.payee;
  if (hasTarget && s.amount > 0) {
    if (s.kind === 'phone') {
      guidePhoneResolvePayee();
    } else {
      guideTransferAskRemark();
    }
    return true;
  }

  // 负数金额或只写了负号：直接给明确提示，不再交给模型（避免反复追问同一句）
  if (/^\s*[-−负]/.test(t) && /\d/.test(t) && !((parsed as any).amount > 0)) {
    guideAsk(guideMessage('<p>转账金额需要大于 0，请重新输入。</p>' +
    '<p class="guide-tip">例如：1000</p>'));
    return true;
  }

  // 槽位层·模型补位：纯数字 / 尾号 / 联系人姓名这类「正则可以确定」的输入不会走到这里；
  // 只有中文数字（一百 / 一万五 / 两百块）、口语长句、多槽位混说时才调用模型抽取。
  // 注意：单个数字字（如「张三」里的「三」）不算中文数字，避免把姓名误判为金额
  var hasCnNumber = /[一二三四五六七八九十百千万两]{2,}|[一二三四五六七八九十百千万两]+(?=\s*(?:元|块|万|千|百|钱))/.test(t);
  if ((!parsed.payee && !parsed.phone && (parsed as any).amount == null) || hasCnNumber) {
    guideTransferAIFallback(t);
    return true;
  }

  // 缺什么问什么（姓名 / 手机号）
  if (s.kind === 'phone') {
    if (s.phone) { guideAsk(guideMessage('<p>麻烦告诉我转账金额</p>')); return true; }
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
    if (/^[-−]?\s*负?\s*\d/.test(t) && /^[-−]|负/.test(t)) {
      guideAsk(guideMessage('<p>转账金额需要大于 0，请重新输入。</p>' +
    '<p class="guide-tip">例如：1000</p>'));
    } else {
      guideAsk(guideMessage('<p>麻烦告诉我转账金额</p>'));
    }
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

// 槽位齐了：先确认一次信息，再问是否需要备注
// 问备注：只问一句「是否需要添加备注？」，不再回述「已记录：向 X 转账 Y 元」
function guideTransferAskRemark() {
  var s = GUIDE_TRANSFER;
  if (!s) return;
  s.stage = 'askRemark';
  s.remarkBoxId = 'transfer-remark-' + Date.now();
  guideAsk(guideMessage(
    '<div id="' + s.remarkBoxId + '">' +
    '<p>是否需要添加备注？</p>' +
    '<div class="guide-chips">' +
    '<button class="guide-chip" onclick="guideTransferRemarkChoice(true)">是</button>' +
    '<button class="guide-chip" onclick="guideTransferRemarkChoice(false)">否</button>' +
    '</div></div>'
  ));
}

function guideTransferRemarkChoice(need: any) {
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

// 定时转账确认：先回述一句，再交给既有的定时转账确认卡（含短信验证码）
// ------------------------------ 定时转账：3 槽位 + 重复方式 ------------------------------
// 目标字段：收款人 / 金额 / 执行时间；三样齐了再问「是否重复」，最后出确认卡。
// 缺字段时按缺失组合给出不同问句，避免每次都从第一个字段重新问。

function guideTimedMissingPrompt(s: any) {
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
  if (!missDate && missTime) return '请问几点执行？';
  if (missDate && missTime) return '麻烦告诉我执行时间是多少（如「明天下午5点」）';
  if (missAmount) return '麻烦告诉我转账金额是多少';
  if (missPayee) return '麻烦告诉我收款人是多少';
  return '请问收款人、转账金额和执行时间是多少？';
}

function guideTimedParseRepeat(text: any) {
  var s = String(text || '').trim();
  if (/^(否|不|不用|不需要|无|没有|不重复|单次|只转一次|一次)$/.test(s)) return '不重复';
  if (/每年|年度|年付/.test(s)) return '每年';
  if (/每月|月度|月付/.test(s)) return '每月';
  if (/每周|每星期|周付/.test(s)) return '每周';
  if (/每天|每日|日付/.test(s)) return '每天';
  return null;
}

function guideTimedRepeatLabel(repeat: any) {
  return ({ '每天': '每日循环执行', '每周': '每周循环执行', '每月': '每月循环执行', '每年': '每年循环执行' } as Record<string, string>)[repeat] || '不重复';
}

// 把日期 + 时间拼成口语化文案：明天下午5点 / 10月30日上午9点
function guideTimedWhenText(date: any, time: any) {
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

async function guideTimedStep(text: any) {
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
      // 只有原句提到时间说法，才接受模型给的时段/时间；否则「明天赚点钱」会被模型脑补成「明天下午」
      var saysTimeWord = /(上午|下午|晚上|早上|中午|凌晨|\d{1,2}\s*[点时]|\d{1,2}\s*[:：]\s*\d{2}|半)/.test(t);
      if (!parsed.date && aiTime.date && (saysDate || !s.date)) parsed.date = aiTime.date;
      if (!parsed.time && aiTime.time && (saysTimeWord || !s.time)) parsed.time = aiTime.time;
      if (!parsed.period && aiTime.period && saysTimeWord) parsed.period = aiTime.period;
      if (!parsed.repeat && aiTime.repeat) parsed.repeat = aiTime.repeat;
      // 「下周三」「月底」这类时间说法会被本地误当成收款人，模型识别出时间后要撤销这个误判
      if ((aiTime.date || aiTime.time || aiTime.period) && parsed.unknownName &&
        /(周|星期|月|号|日|点|点|分|今天|明天|后天|上午|下午|晚上|中午|早上)/.test(parsed.unknownName)) {
        parsed.unknownName = '';
      }
    }
  }

  if (!parsed.payee && parsed.unknownName) {
    guideUnknownPayeeNotice(parsed.unknownName, t);
    return true;
  }

  if (parsed.payee) s.payee = parsed.payee;
  if ((parsed as any).amount != null && (parsed as any).amount > 0) s.amount = (parsed as any).amount;
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

  appendMessage(guideMessage('<p>' + guideTimedMissingPrompt(s) + '</p>' +
    (/请问几点执行/.test(guideTimedMissingPrompt(s)) ? '<p class="guide-tip">例如：15:00</p>' : '')));
  scrollToBottom();
  return true;
}

function guideTimedConfirm() {
  var s = GUIDE_TRANSFER;
  if (!s) return;
  var info = (mockData.contacts || []).filter(function (c: any) { return c.name === s.payee; })[0];
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
    appendMessage(guideMessage('<p>' + guideTimedMissingPrompt(s) + '</p>' +
    (/请问几点执行/.test(guideTimedMissingPrompt(s)) ? '<p class="guide-tip">例如：15:00</p>' : '')));
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

function guideStartAATransfer() {
  guideResetAllSessions();
  GUIDE_AA = { total: 0, participants: [], stage: 'slots', pendingNames: [], pickOptions: [] };
  currentModule = 'transfer';
  appendMessage(guideMessage('<p>请告诉我你垫付的总金额和除你外需要收款的参与人。</p>' +
    '<p class="guide-tip">例如：1000元 张三和李四</p>'));
  scrollToBottom();
}

// 从一句话里抽垫付总额与名单
function guideAAParse(text: any) {
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
  // 去掉「垫付 / 垫了 / 我垫 / 一共」这类描述，避免被当成参与人名字
  t = t.replace(/我?垫付|我垫了|我垫|垫了|垫|先付了|先付|付了/g, ' ');
  t = t.replace(/垫付|总额|总金额|总|收款|收|元|块|钱|包括|包含|还有|参与人|名单|aa|一共|总共|一起/gi, ' ');
  // 「张三和李四」这种并列先转成分隔符，再清掉「向 / 给 / 帮」这类引导词
  t = t.replace(/[和与跟及]/g, '、');
  t = t.replace(/^[\s、,，;；]*(向|给|帮|让|请|找)/, '');
  var names = t.split(/[、,，;；\s]+/)
    .map(function (x: any) { return x.trim().replace(/^(向|给|帮|让|请|找)/, '').replace(/[。.！!]$/, ''); })
    .filter(Boolean)
    // 发起人本人不算参与人：「我和张三」「我、李四」
    .filter(function (n: any) { return !/^(我|本人|自己|咱们|我们|咱|俺)$/.test(n); })
    .map(function (n: any) { return n.replace(/^(我和|我跟|我与|我、|本人和|自己和)/, '').trim(); })
    .filter(Boolean);
  return { total: total, names: names };
}

function guideAAPushParticipant(contact: any) {
  var s = GUIDE_AA;
  if (!s) return;
  var exists = s.participants.some(function (p: any) { return p.phone === contact.phone; });
  if (!exists) s.participants.push({ name: contact.name, phone: contact.phone });
}

// 逐个解析名单：唯一命中直接加入；重名进入选择；不在通讯录则提示
// 返回 true 表示这批名单已处理完，false 表示中途被打断（等待用户选择 / 补充）
function guideAAAddNames(names: any) {
  var s = GUIDE_AA;
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var matches = (mockData.contacts || []).filter(function (c: any) { return c.name === name; });
    if (matches.length === 0) {
      s.stage = 'askMore';   // 关键：进入「还要加人吗」，接下来回「没有了」才能结束名单
      guideSayInvalid(guideMessage(
        '<p>「<b>' + guideEsc(name) + '</b>」不在通讯录里。AA 收款只能选择通讯录联系人：' + guideContactNames() + '。</p>' +
        '<p class="guide-tip">可以继续告诉我其他人，或回复「没有」结束名单。</p>'
      ));
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

function guideAAPickPrompt(name: any, options: any) {
  var circled = '①②③④⑤⑥⑦⑧⑨';
  var items = options.map(function (c: any, i: any) {
    return '<button class="guide-chip" onclick="guideAAPick(' + i + ')">' + (circled.charAt(i) || (i + 1)) + ' ' +
      guideEsc(c.name) + '（' + guideEsc(c.phone || '') + '）</button>';
  }).join('');
  appendMessage(guideMessage(
    '<p>查询到 ' + options.length + ' 位【' + guideEsc(name) + '】，请选择你要收款的「' + guideEsc(name) + '」：</p>' +
    '<div class="guide-chips">' + items + '</div>'
  ));
  scrollToBottom();
}

function guideAAPick(index: any) {
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
    guideSayInvalid(guideMessage('<p>AA 收款至少要有一位参与人，请从通讯录里选：' + guideContactNames() + '。</p>' +
      '<p class="guide-tip">例如：1000元 张三和李四</p>'));
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
  var names = s.participants.map(function (p: any) { return p.name; }).join('、');
  appendMessage(guideMessage(guideAAConfirmCardHtml(s, splitCount, per, names)));
  scrollToBottom();
}

// 一张卡片承载「确认 → 已发起」，取消按钮就在卡里
function guideAAConfirmCardHtml(s: any, splitCount: any, per: any, names: any) {
  return '<div class="data-card" id="' + s.cardId + '">' +
    '<div class="data-card-title">确认发起 AA 收款</div>' +
    '<div class="data-row"><span class="data-label">垫付总额</span><span class="data-value">¥' + guidePlainMoney(s.total) + '</span></div>' +
    '<div class="data-row"><span class="data-label">参与人数</span><span class="data-value">' + splitCount + ' 人（含我）</span></div>' +
    '<div class="data-row"><span class="data-label">收款名单</span><span class="data-value">' + guideEsc(names) + '</span></div>' +
    '<div class="data-row"><span class="data-label">每人应付</span><span class="data-value"><b>¥' + guidePlainMoney(per) + '</b></span></div>' +
    '<div class="data-row"><span class="data-label">当前状态</span><span class="data-value">待发起</span></div>' +
    '<div class="guide-chips" style="margin-top:10px;">' +
    '<button class="guide-chip" onclick="guideAASubmit()">发起AA收款</button>' +
    '<button class="guide-chip" onclick="guideAACancel()">取消</button>' +
    '</div>' +
    '</div>';
}

function guideAAConfirmDoneHtml(s: any, splitCount: any, per: any, names: any) {
  return '<div class="data-card-title">已发起 AA 收款</div>' +
    '<div class="data-row"><span class="data-label">每人应付</span><span class="data-value"><b>¥' + guidePlainMoney(per) + '</b></span></div>' +
    '<div class="data-row"><span class="data-label">垫付总额</span><span class="data-value">¥' + guidePlainMoney(s.total) + '</span></div>' +
    '<div class="data-row"><span class="data-label">参与人数</span><span class="data-value">' + splitCount + ' 人（含我）</span></div>' +
    '<div class="data-row"><span class="data-label">收款名单</span><span class="data-value">' + guideEsc(names) + '</span></div>' +
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

  if (typeof guideModuleWrapUp === 'function') setTimeout(function () { guideModuleWrapUp('transfer'); }, 400);
}

function guideAASubmit() {
  var s = GUIDE_AA;
  if (!s || s.stage !== 'confirm') return;
  var splitCount = s.participants.length + 1;
  var per = s.total / splitCount;
  var names = s.participants.map(function (p: any) { return p.name; });
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
async function guideAAStep(text: any) {
  if (guideIsNegativeAmount(text)) {
    guideAsk(guideMessage('<p>垫付金额需要大于 0，请重新输入。</p>' +
    '<p class="guide-tip">例如：600</p>'));
    return true;
  }
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

  // 「还有其他参与人吗」的回答：常见说法直接结束名单（含「没有了 / 就这些 / 不用了」）
  var noMoreRe = /^(没有|没有了|没了|没|无|否|不|不用|不用了|不加了|不找了|就这些|这些|就他们|就我俩|够了|结束|名单结束|ok|OK|好的|嗯|是的|对)$/;
  if (noMoreRe.test(t) && (s.stage === 'askMore' || s.participants.length > 0)) {
    if (/^(是的|对|好的|ok|OK|嗯)$/.test(t) && s.stage === 'askMore' && !s.participants.length) {
      guideAsk(guideMessage('<p>请告诉我还要收谁？</p>'));
      return true;
    }
    guideAANoMore();
    return true;
  }

  var parsed = guideAAParse(t);

  // 本地解析出的名字必须真的在通讯录里，否则（如「就我们几个搓一顿」）交给模型理解
  var localNamesOk = parsed.names.length && parsed.names.every(function (n: any) {
    return (mockData.contacts || []).some(function (c: any) { return c.name === n; });
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
    // 与入口首句保持一致（含示例）
    appendMessage(guideMessage('<p>请告诉我你垫付的总金额和除你外需要收款的参与人。</p>' +
      '<p class="guide-tip">例如：1000元 张三和李四</p>'));
  } else if (!s.participants.length) {
    appendMessage(guideMessage('<p>麻烦告诉我除你外需要收款的参与人</p>'));
  } else {
    appendMessage(guideMessage('<p>麻烦告诉我你垫付的总金额</p>'));
  }
  scrollToBottom();
  return true;
}
