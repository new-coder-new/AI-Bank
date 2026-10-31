// ==========================================================================
//  经典脚本模块（TypeScript 源码，noCheck 转译）
//  编译产物：js/flows/cardlimit.js
//  说明：本层为「全局函数 + 动态状态」结构，采用 noCheck 转译；
//        对外符号统一在 types/global.d.ts 声明。
// ==========================================================================
// ==========================================================================
//  AI Banking Agent · 信用卡额度与调额层（Credit Card Limit）
//  目标：解决 C 组测试暴露的三类问题——
//    ① C2：区分「申请额度 / 审批额度 / 生效额度」，全部来自实际业务数据，缺则明确说「暂无数据」。
//    ② C3：正确识别「调额」意图，展示当前生效额度与目标额度，走「申请 → 确认 → 审批 → 生效」流程，
//          不把申请成功、审批通过、额度生效混为一谈，未经授权绝不直接改额度。
//    ③ C4/C5/C6：普通额度查询与纯数学计算不被隐私模块错误拦截；数据是否最新有明确依据。
// ==========================================================================
// ------------------------------ 0. 数据访问（单一数据源） ------------------------------
function cardLimitData() {
    var c = (mockData.userProfile && mockData.userProfile.creditCard) || {};
    return {
        number: c.number || '',
        level: c.level || '',
        appliedLimit: c.appliedLimit, // 申请额度
        approvedLimit: c.approvedLimit, // 审批额度
        effectiveLimit: c.effectiveLimit != null ? c.effectiveLimit : c.limit, // 生效额度
        limit: c.limit != null ? c.limit : c.effectiveLimit,
        used: Number(c.used) || 0,
        available: Number(c.available) || 0,
        currentBill: c.currentBill,
        minPayment: c.minPayment,
        billDay: c.billDay,
        dueDay: c.dueDay,
        limitUpdatedAt: c.limitUpdatedAt || null,
        approvedAt: c.approvedAt || null,
        limitApplyStatus: c.limitApplyStatus || null,
        limitApplyDirection: c.limitApplyDirection || null,
        limitApplyAt: c.limitApplyAt || null,
        limitApplyReason: c.limitApplyReason || null,
        status: c.status || '正常'
    };
}
// 额度是否「最新」：有更新时间戳，且距今在 60 天内视为最新（演示口径）
function cardLimitIsFresh() {
    var u = cardLimitData().limitUpdatedAt;
    if (!u)
        return false;
    var t = new Date(String(u).replace(/-/g, '/'));
    if (isNaN(t.getTime()))
        return false;
    var days = (Date.now() - t.getTime()) / 86400000;
    return days >= 0 && days <= 60;
}
// ------------------------------ 1. 额度详情渲染（C2/C4/C5） ------------------------------
function cardLimitDetailCard() {
    var c = cardLimitData();
    var fresh = cardLimitIsFresh();
    function valCls(v) {
        return (v == null || v === '') ? 'color:#9ca3af;' : 'color:#1a1a1a;font-weight:700;';
    }
    var appliedNote = (c.appliedLimit == null || c.appliedLimit === '')
        ? '<span style="color:#9ca3af;font-size:12px;">暂无申请记录（当前没有进行中的调额申请）</span>'
        : '¥' + agentFmtInt(c.appliedLimit) + ' <span style="font-size:11px;color:' +
            (c.limitApplyStatus === '已生效' ? '#16a34a' : c.limitApplyStatus === '已拒绝' ? '#dc2626' : '#f59e0b') + ';">' +
            (c.limitApplyStatus || '待人工复核') + '</span>' +
            (c.limitApplyDirection ? ' <span style="font-size:11px;color:#9ca3af;">' + (c.limitApplyDirection === 'up' ? '提额' : '降额') + '</span>' : '');
    var approvedNote = (c.approvedLimit == null || c.approvedLimit === '')
        ? '<span style="color:#9ca3af;">暂无审批记录</span>'
        : '¥' + agentFmtInt(c.approvedLimit) +
            (c.approvedAt ? ' <span style="font-size:11px;color:#9ca3af;">审批于 ' + c.approvedAt + '</span>' : '');
    return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · 信用卡额度</div>' +
        '<div class="msg-bubble agent-bubble">' +
        '<div class="ctx-head">你的信用卡额度分层信息</div>' +
        '<div class="data-card">' +
        '<div class="data-row"><span class="data-label"> 申请额度</span><span class="data-value" style="' + valCls(c.appliedLimit) + '">' + appliedNote + '</span></div>' +
        '<div class="data-row"><span class="data-label"> 审批额度</span><span class="data-value" style="' + valCls(c.approvedLimit) + '">' + approvedNote + '</span></div>' +
        '<div class="data-row"><span class="data-label"> 当前生效额度</span><span class="data-value" style="color:#09407F;font-weight:700;font-size:16px;">¥' + agentFmtInt(c.effectiveLimit) + '</span></div>' +
        '</div>' +
        '<div class="data-card" style="margin-top:10px;">' +
        '<div class="data-card-title"> 额度使用情况</div>' +
        '<div class="data-row"><span class="data-label">已用额度</span><span class="data-value" style="color:#ef4444;font-weight:600;">¥' + agentFmt(c.used) + '</span></div>' +
        '<div class="data-row"><span class="data-label">可用额度</span><span class="data-value" style="color:#22c55e;font-weight:600;">¥' + agentFmt(c.available) + '</span></div>' +
        '<div class="data-row"><span class="data-label">使用率</span><span class="data-value">' + (c.effectiveLimit > 0 ? (c.used / c.effectiveLimit * 100).toFixed(1) : '—') + '%</span></div>' +
        '<div class="data-row"><span class="data-label">本期账单</span><span class="data-value">¥' + agentFmt(c.currentBill) + '</span></div>' +
        '<div class="data-row"><span class="data-label">还款日</span><span class="data-value">每月 ' + (c.dueDay || '—') + ' 日</span></div>' +
        '</div>' +
        '<div style="margin-top:10px;font-size:12px;color:' + (fresh ? '#16a34a' : '#f59e0b') + ';">' +
        (fresh
            ? ' 数据为最新状态，更新时间：' + c.limitUpdatedAt
            : '️ 数据更新时间为 ' + (c.limitUpdatedAt || '未记录') + '，可能非最新，如需确认请咨询银行。') +
        '</div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;">' +
        '<button class="agent-task" onclick="cardLimitAdjustForm(' + c.effectiveLimit + ')"> 调整额度</button>' +
        '</div>' +
        '</div></div></div>';
}
// ------------------------------ 2. 调额申请流程（C3） ------------------------------
// 目标额度由用户指定，系统只做「申请 → 确认 → 审批 → 生效」状态流转，不直接改额度。
function cardLimitAdjustForm(currentLimit, presetTarget) {
    var pre = Number(presetTarget) || Number(currentLimit) || cardLimitData().effectiveLimit;
    var minLimit = cardLimitMinimum();
    // 旧表单的固定 id 会让 getElementById 读到旧值，先清掉再开新表单
    document.querySelectorAll('.card-limit-form').forEach(function (el) { var m = el.closest('.message'); if (m)
        m.remove(); });
    var html = '<div class="message card-limit-form"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · 调额申请</div>' +
        '<div class="msg-bubble agent-bubble">' +
        '<p style="margin-bottom:6px;font-weight:600;"> 信用卡额度调整申请</p>' +
        '<p style="font-size:12px;color:#999;margin-bottom:12px;">当前生效额度 <b style="color:#09407F;">¥' + agentFmtInt(currentLimit) + '</b></p>' +
        '<div class="transfer-form">' +
        '<div class="form-group"><label class="form-label">目标额度</label>' +
        '<input type="number" class="form-input" id="cardLimitTarget" value="' + pre + '" min="' + minLimit + '" oninput="updateCardLimitHint()"></div>' +
        '<div id="cardLimitHint" class="form-hint"></div>' +
        '<div class="form-group"><label class="form-label">调整原因</label>' +
        '<select class="form-select" id="cardLimitReason">' +
        '<option>消费需求增加</option><option>收入提升</option><option>信用记录良好</option><option>主动降低额度</option><option>长期不用</option><option>风险控制</option><option>其他</option>' +
        '</select></div>' +
        '<div class="form-actions">' +
        '<button class="btn btn-primary" id="cardLimitSubmitBtn" onclick="cardLimitApply()">提交复核申请</button>' +
        '<button class="btn btn-secondary" onclick="cardLimitCancel()">取消</button>' +
        '</div></div>' +
        '</div></div></div>';
    appendMessage(html);
    updateCardLimitHint();
    scrollToBottom();
}
// 最低可调额度：严格等于已用额度（信用额度不能低于已用部分，否则可用额度为负）
function cardLimitMinimum() {
    var used = Number(cardLimitData().used) || 0;
    return Math.max(0, used);
}
function updateCardLimitHint() {
    var input = document.getElementById('cardLimitTarget');
    var hint = document.getElementById('cardLimitHint');
    if (!input || !hint)
        return;
    var target = parseInt(input.value, 10) || 0;
    var cur = cardLimitData().effectiveLimit;
    var used = Number(cardLimitData().used) || 0;
    var min = cardLimitMinimum();
    var btn = document.getElementById('cardLimitSubmitBtn');
    // 目标额度与当前额度一致：不显示任何文字，直接禁用提交按钮
    if (target === cur) {
        hint.textContent = '';
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.45';
            btn.style.cursor = 'not-allowed';
        }
        return;
    }
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
    }
    if (!(target > 0)) {
        hint.textContent = '请输入目标额度';
        return;
    }
    if (target < min) {
        hint.textContent = '最低可调至 ¥' + agentFmtInt(min);
        return;
    }
    hint.textContent = (target > cur ? '提额' : '降额') + '：¥' + agentFmtInt(cur) + ' → ¥' + agentFmtInt(target) + '，调整后可用额度 ¥' + agentFmtInt(Math.max(0, target - used));
}
function cardLimitCancel() {
    // 取消必须移除表单和提交按钮，否则旧表单仍可提交
    document.querySelectorAll('.card-limit-form').forEach(function (el) { var m = el.closest('.message'); if (m)
        m.remove(); });
    agentReply('已取消调额申请，当前生效额度保持不变。');
}
// 提交调额申请：支持提额/降额，写入复核队列，审批通过后才改生效额度。
function cardLimitApply() {
    var target = parseInt((document.getElementById('cardLimitTarget')?.value) || '0', 10) || 0;
    var reason = (document.getElementById('cardLimitReason')?.value) || '未填写';
    var data = cardLimitData();
    var cur = data.effectiveLimit;
    var used = Number(data.used) || 0;
    var minLimit = cardLimitMinimum();
    if (target <= 0) {
        agentReply('请输入有效的目标额度。');
        return;
    }
    // 目标额度未变化：静默忽略（该情形下列表单的提交按钮已禁用，无文案提示）
    if (target === cur)
        return;
    if (target < minLimit) {
        agentReply('目标额度不能低于已用额度 ¥' + agentFmtInt(used) + '。');
        return;
    }
    var direction = target > cur ? 'up' : 'down';
    cardLimitSubmitReview(target, reason, cur, direction);
    // 提交成功后移除表单，只保留一张结果卡
    var formInput = document.getElementById('cardLimitTarget');
    var formMessage = formInput ? formInput.closest('.message') : null;
    if (formMessage)
        formMessage.remove();
    var directionText = target > cur ? '提额' : '降额';
    var html = '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手</div>' +
        '<div class="msg-bubble agent-bubble">' +
        '<div class="bank-result">' +
        '<div class="bank-result-title">调额申请已提交</div>' +
        '<div class="bank-result-amount">¥' + agentFmtInt(target) + '</div>' +
        '<div class="bank-confirm-rows">' +
        '<div><span>调整方向</span><b>' + directionText + '</b></div>' +
        '<div><span>当前额度</span><b>¥' + agentFmtInt(cur) + ' → ¥' + agentFmtInt(target) + '</b></div>' +
        '<div><span>申请原因</span><b>' + reason + '</b></div>' +
        '<div><span>当前状态</span><b style="color:#B54708;">待复核</b></div>' +
        '</div>' +
        '<div style="margin-top:10px;"><button class="ui-link" onclick="showManualReviews()">查看复核</button></div>' +
        '</div>' +
        '</div></div></div>';
    appendMessage(html);
    scrollToBottom();
}
// 写入复核队列（提额/降额共用）
// 多卡场景：按选中的卡提交复核（主卡沿用原逻辑，其它卡自带卡标识）
function cardLimitSubmitReviewFor(card, target, reason, current, direction) {
    if (!card || card.id === 'CARD-MAIN') {
        return cardLimitSubmitReview(target, reason, current, direction);
    }
    var cards = (mockData.userProfile && mockData.userProfile.creditCards) || [];
    var c = cards.filter(function (x) { return x.id === card.id; })[0];
    if (!c)
        return null;
    c.appliedLimit = target;
    c.limitApplyStatus = '待人工复核';
    c.limitApplyReason = reason || '未填写';
    c.limitApplyAt = new Date().toLocaleString('zh-CN');
    c.limitApplyDirection = direction;
    saveUserData();
    if (typeof submitManualReview !== 'function')
        return null;
    return submitManualReview({
        amount: target,
        purpose: '信用卡额度调整・' + (c.cardType || '信用卡') + '（尾号 ' + (c.tail || '----') + '）・' + (reason || '未填写'),
        source: 'Card',
        items: [
            '卡片：' + (c.cardType || '信用卡') + '（尾号 ' + (c.tail || '----') + '）',
            '当前额度 ¥' + agentFmtInt(current) + ' → 目标 ¥' + agentFmtInt(target),
            '原因：' + (reason || '未填写')
        ],
        actions: [{ tool: 'card.applyLimit', args: { target: target, reason: reason, direction: direction, current: current, cardId: c.id } }],
        silent: true
    });
}
function cardLimitSubmitReview(target, reason, current, direction) {
    var c = mockData.userProfile.creditCard;
    var used = Number(c.used) || 0;
    c.appliedLimit = target;
    c.limitApplyStatus = '待人工复核';
    c.limitApplyReason = reason || '未填写';
    c.limitApplyAt = new Date().toLocaleString('zh-CN');
    c.limitApplyDirection = direction;
    saveUserData();
    if (typeof apiCardAdjust === 'function')
        apiCardAdjust(target, reason, direction);
    if (typeof submitManualReview !== 'function')
        return null;
    return submitManualReview({
        amount: target,
        purpose: '信用卡额度调整・' + (reason || '未填写'),
        source: 'Card',
        items: [
            '当前额度 ¥' + agentFmtInt(current) + ' → 目标 ¥' + agentFmtInt(target),
            '已用额度 ¥' + agentFmtInt(used) + '，原因：' + reason
        ],
        actions: [{ tool: 'card.applyLimit', args: { target: target, reason: reason, direction: direction, current: current } }],
        silent: true
    });
}
// 复核通过后真正生效（由复核审批调用，不直接暴露给 LLM）
function applyCardLimitAdjustment(args) {
    var a = args || {};
    var target = Number(a.target) || 0;
    // 多卡：带 cardId 时更新对应的那张卡
    if (a.cardId && a.cardId !== 'CARD-MAIN') {
        var list = (mockData.userProfile && mockData.userProfile.creditCards) || [];
        var targetCard = list.filter(function (x) { return x.id === a.cardId; })[0];
        if (!targetCard)
            return { ok: false, summary: '未找到该信用卡' };
        var usedOther = Number(targetCard.used) || 0;
        if (target <= 0)
            return { ok: false, summary: '目标额度无效' };
        if (target < usedOther)
            return { ok: false, summary: '目标额度不能低于已用额度 ¥' + agentFmtInt(usedOther) };
        var oldOther = Number(targetCard.limit) || 0;
        targetCard.limit = target;
        targetCard.available = Math.max(0, target - usedOther);
        targetCard.limitApplyStatus = '已生效';
        targetCard.limitApplyDirection = a.direction || (target > oldOther ? 'up' : 'down');
        targetCard.limitApplyReason = a.reason || targetCard.limitApplyReason || '未填写';
        targetCard.approvedAt = new Date().toLocaleString('zh-CN');
        saveUserData();
        return {
            ok: true,
            summary: (targetCard.cardType || '信用卡') + '（尾号 ' + (targetCard.tail || '----') + '）额度已' +
                (target > oldOther ? '提高' : '降低') + '至 ¥' + agentFmtInt(target)
        };
    }
    var c = mockData.userProfile.creditCard;
    var used = Number(c.used) || 0;
    var old = c.effectiveLimit != null ? c.effectiveLimit : c.limit;
    if (target <= 0)
        return { ok: false, summary: '目标额度无效' };
    if (target < used)
        return { ok: false, summary: '目标额度不能低于已用额度 ¥' + agentFmtInt(used) };
    c.effectiveLimit = target;
    c.limit = target;
    c.approvedLimit = target;
    c.appliedLimit = target;
    c.available = Math.max(0, target - used);
    // 卡片页/兼容字段同步，避免调额后仍显示旧额度
    if (mockData.card) {
        mockData.card.totalLimit = target;
        mockData.card.availableLimit = c.available;
        mockData.card.usedLimit = used;
    }
    c.limitApplyStatus = '已生效';
    c.limitApplyDirection = a.direction || (target > old ? 'up' : 'down');
    c.limitApplyReason = a.reason || c.limitApplyReason || '未填写';
    c.approvedAt = new Date().toLocaleString('zh-CN');
    c.limitUpdatedAt = c.approvedAt;
    saveUserData();
    if (typeof apiCardLimitApprove === 'function')
        apiCardLimitApprove(target, a.reason || '', c.limitApplyDirection);
    return {
        ok: true,
        summary: '信用卡额度已' + (target > old ? '提高' : '降低') + '至 ¥' + agentFmtInt(target) + '，可用额度 ¥' + agentFmtInt(c.available)
    };
}
// ------------------------------ 3. 纯数学计算（C6） ------------------------------
// 识别「假设总额度 X，已用 Y，可用多少」这类纯算术，本地计算并列出公式，
// 明确说明是基于用户提供的假设值，不触发敏感验证。
function cardLimitMathTry(text) {
    var t = String(text || '');
    // 必须同时满足：含「假设/如果/若」等假设词 + 含「额度」 + 出现至少两个数字
    var hasHypo = /(假设|如果|假如|若|比如|举例)/.test(t);
    var hasCredit = /(信用卡|额度|信用额度|总额度|可用额度)/.test(t);
    var nums = t.match(/\d+(?:\.\d+)?/g);
    if (!hasHypo || !hasCredit || !nums || nums.length < 2)
        return null;
    // 区分「总额度」与「已用额度」（支持"万"单位）
    var total = null, used = null;
    var mTotal = t.match(/(?:总额度|信用额度|授信额度|额度为|额度是)[^\d]{0,6}(\d+(?:\.\d+)?)\s*(万|w|W)?/);
    var mUsed = t.match(/(?:已用|用了|已使用|已消费|已欠)[^\d]{0,6}(\d+(?:\.\d+)?)\s*(万|w|W)?/);
    function toVal(m) {
        if (!m)
            return null;
        var v = parseFloat(m[1]);
        if (m[2])
            v *= 10000;
        return v;
    }
    if (mTotal)
        total = toVal(mTotal);
    if (mUsed)
        used = toVal(mUsed);
    // 兜底：没匹配到关键词时，按「先出现的是总额度，后出现的是已用」处理
    if (total == null && used == null && nums.length >= 2) {
        total = parseFloat(nums[0]);
        used = parseFloat(nums[1]);
    }
    else if (total == null && used != null && nums.length >= 2) {
        total = parseFloat(nums[0]);
    }
    else if (used == null && total != null && nums.length >= 2) {
        used = parseFloat(nums[nums.length - 1]);
    }
    if (total == null || used == null)
        return null;
    var available = total - used;
    return {
        total: total, used: used, available: available,
        formula: agentFmtInt(total) + ' − ' + agentFmtInt(used) + ' = ' + agentFmtInt(available) + ' 元'
    };
}
function cardLimitMathCard(calc) {
    return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · 额度计算</div>' +
        '<div class="msg-bubble agent-bubble">' +
        '<p style="font-weight:600;margin-bottom:8px;"> 可用额度计算</p>' +
        '<div class="data-card" style="background:#F5F8FD;border-color:#CFDFF3;">' +
        '<div class="data-row"><span class="data-label">计算公式</span><span class="data-value" style="font-family:monospace;font-weight:700;">' + calc.formula + '</span></div>' +
        '<div class="data-row"><span class="data-label">假设总额度</span><span class="data-value">¥' + agentFmtInt(calc.total) + '</span></div>' +
        '<div class="data-row"><span class="data-label">假设已用额度</span><span class="data-value" style="color:#ef4444;">¥' + agentFmtInt(calc.used) + '</span></div>' +
        '<div class="data-row"><span class="data-label">可用额度</span><span class="data-value" style="color:#22c55e;font-weight:700;font-size:16px;">¥' + agentFmtInt(calc.available) + '</span></div>' +
        '</div>' +
        '<p style="margin-top:10px;font-size:12px;color:#999;">️ 以上结果基于你提供的<b>假设数值</b>计算，不代表真实账户查询结果。如需真实额度，可对我说「查询我的信用卡额度」。</p>' +
        '</div></div></div>';
}
// ------------------------------ 4. 本地前置处理器 ------------------------------
// 在 Function Calling / 规则层之前，确定性接管三类请求，避免被模型误判：
//   a) 纯数学计算（假设额度）
//   b) 明确额度查询（区分申请/审批/生效）
//   c) 调额意图
// 返回 true 表示已处理。
function agentCardLimitPrehandler(text) {
    var t = String(text || '');
    // a) 纯数学计算：优先级最高，防止被当成敏感查询拦截
    var calc = cardLimitMathTry(t);
    if (calc) {
        appendMessage(cardLimitMathCard(calc));
        scrollToBottom();
        addToConversation('assistant', '额度计算：' + calc.formula, null);
        return true;
    }
    // c) 调额意图（调/提/降 额度 + 目标数字）
    var adjustIntent = /(调额|调整额度|提高额度|提升额度|降低额度|下调额度|提额|降额|额度.*(?:调整|提高|提升|降低)|(?:调整|提高|提升|降低).*额度)/.test(t);
    if (adjustIntent) {
        var cur = cardLimitData().effectiveLimit;
        var targetMatch = t.match(/[调提降][至到为\s]*(\d+(?:\.\d+)?)/) || t.match(/(\d+(?:\.\d+)?)\s*(?:元|块|万)/);
        var target = targetMatch ? parseFloat(targetMatch[1]) : 0;
        var __m = t.match(/\d+(?:\.\d+)?\s*万?/);
        if (/万/.test(__m && __m[0] ? __m[0] : '')) {
            target = target * 10000;
        }
        var html = '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
            '<div class="msg-name">智能金融助手 · 调额申请</div>' +
            '<div class="msg-bubble agent-bubble">' +
            '<p style="margin-bottom:8px;font-weight:600;"> 已识别你的调额需求</p>' +
            '<div class="data-card">' +
            '<div class="data-row"><span class="data-label">当前生效额度</span><span class="data-value" style="font-weight:700;">¥' + agentFmtInt(cur) + '</span></div>' +
            (target > 0 ? '<div class="data-row"><span class="data-label">目标额度</span><span class="data-value" style="color:#09407F;font-weight:700;">¥' + agentFmtInt(target) + '</span></div>' : '') +
            '</div>' +
            '<p style="margin-top:10px;font-size:12px;color:#666;">调额需要经过「申请 → 风控审批 → 生效」三个环节，提交申请不代表立即生效，且未经你授权我不会直接修改额度。</p>' +
            '<div style="margin-top:12px;">' +
            '<button class="agent-task" onclick="cardLimitAdjustForm(' + cur + (target > 0 ? ',' + target : '') + ')">填写调额申请</button>' +
            '</div>' +
            '</div></div></div>';
        appendMessage(html);
        scrollToBottom();
        addToConversation('assistant', '识别到调额需求，进入调额申请流程', null);
        return true;
    }
    // b) 明确额度查询（含「申请/审批/生效/总额度/已用/可用」等关键词）
    var queryIntent = /(信用卡|信用额度)/.test(t) && /(额度|可用|已用|总额|生效|审批|申请|还剩|查询)/.test(t);
    // 排除纯账单/分期/挂失等其它卡片意图
    var isOtherCardAction = /(分期|挂失|解挂|冻结|还款|账单日|还款日)/.test(t);
    if (queryIntent && !isOtherCardAction && !adjustIntent) {
        appendMessage(cardLimitDetailCard());
        scrollToBottom();
        addToConversation('assistant', '查询信用卡额度详情', null);
        return true;
    }
    return false;
}
// ------------------------------ 5. 工具注册 ------------------------------
// card.limitDetail：只读查询申请/审批/生效额度三字段
registerAgentTool('card.limitDetail', {
    label: '查询信用卡额度详情', risk: 'low',
    run: function () {
        var c = cardLimitData();
        var fresh = cardLimitIsFresh();
        function part(v) { return (v == null || v === '') ? '暂无数据' : '¥' + agentFmtInt(v); }
        return {
            summary: '申请额度 ' + part(c.appliedLimit) +
                '；审批额度 ' + part(c.approvedLimit) +
                '；当前生效额度 ¥' + agentFmtInt(c.effectiveLimit) +
                '；已用 ¥' + agentFmtInt(c.used) +
                '；可用 ¥' + agentFmtInt(c.available) +
                '；数据' + (fresh ? '为最新（' + c.limitUpdatedAt + '）' : '更新时间 ' + (c.limitUpdatedAt || '未记录')),
            data: c
        };
    }
});
// card.adjustLimit：调额申请（medium 风险，会触发确认卡）
registerAgentTool('card.adjustLimit', {
    label: '申请调整信用卡额度', risk: 'medium',
    run: function (args) {
        var target = Number(args && args.target) || Number(args && args.amount) || 0;
        var cur = cardLimitData().effectiveLimit;
        var used = Number(cardLimitData().used) || 0;
        var minLimit = cardLimitMinimum();
        if (target <= 0) {
            return { ok: false, summary: '请提供目标额度，例如「把额度调到 100000 元」。当前生效额度 ¥' + agentFmtInt(cur) };
        }
        if (target === cur) {
            return { ok: false, summary: '目标额度未变化，已跳过提交。' };
        }
        if (target < minLimit) {
            return { ok: false, summary: '目标额度不能低于已用额度 ¥' + agentFmtInt(used) + '。' };
        }
        var direction = target > cur ? 'up' : 'down';
        var review = cardLimitSubmitReview(target, (args && args.reason) || '未填写', cur, direction);
        return {
            summary: '调额申请已提交复核：当前生效额度 ¥' + agentFmtInt(cur) + ' → 目标额度 ¥' + agentFmtInt(target) +
                '（' + (direction === 'up' ? '提额' : '降额') + '）。复核通过后额度才会生效。',
            data: { current: cur, target: target, direction: direction, status: '待人工复核', reviewId: review && review.id }
        };
    }
});
