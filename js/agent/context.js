// ==========================================================================
//  AI Banking Agent · 对话上下文与指代消解层（TypeScript 源码）
//  编译产物：js/agent/context.js（经典脚本，无 import/export）
//
//  设计要点：
//  1) 在 AGENT_SESSION 之上叠一层"话题栈"（topic stack），history 记录问答原文，topics 记录聊过什么。
//  2) 指代解析不靠猜：先找代词 → 按"最近优先 + 类型匹配"选话题 → 替换为话题描述交给原路由。
//  3) 解析结果必须可解释：返回 { resolved, topic, phrase, confidence }，低置信度时反问用户。
// ==========================================================================
// ------------------------------ 0. 上下文数据结构 ------------------------------
function agentCtxEnsure() {
    if (!AGENT_SESSION)
        return null;
    if (!AGENT_SESSION.history)
        AGENT_SESSION.history = [];
    if (!AGENT_SESSION.topics)
        AGENT_SESSION.topics = [];
    if (!AGENT_SESSION.turns)
        AGENT_SESSION.turns = 0;
    return AGENT_SESSION;
}
var AGENT_CTX_HISTORY_MAX = 10; // 保留最近 10 轮问答
var AGENT_CTX_TOPIC_MAX = 6; // 保留最近 6 个话题
var AGENT_CTX_TOPIC_TTL = 6; // 话题超过 6 轮未被提及即视为失效
// ------------------------------ 1. 话题注册 ------------------------------
var AGENT_TOPIC_LABEL = {
    spending: '消费结构分析',
    finance: '财务全景分析',
    budget: '预算执行情况',
    card: '信用卡账单与额度',
    assets: '资产与负债情况',
    purchase: '某笔消费决策',
    plan: '目标规划方案',
    profile: '用户画像分析',
    health: '财务健康评分',
    risk: '风险提示',
    knowledge: '金融知识问答',
    scenario: '资金安排建议',
    transfer: '转账事项',
    subscription: '订阅与固定支出',
    abnormal: '异常交易'
};
/** 把一个话题压栈；同 type 只保留最新，并记录"第几轮"用于时效判断 */
function agentCtxPushTopic(type, summary, extra) {
    var S = agentCtxEnsure();
    if (!S || !type)
        return null;
    var topic = Object.assign({
        type: type,
        label: AGENT_TOPIC_LABEL[type] || type,
        summary: summary || '',
        turn: S.turns,
        at: Date.now()
    }, extra || {});
    var idx = -1;
    for (var i = 0; i < S.topics.length; i++) {
        if (S.topics[i].type === type) {
            idx = i;
            break;
        }
    }
    if (idx > -1)
        S.topics.splice(idx, 1);
    S.topics.unshift(topic);
    if (S.topics.length > AGENT_CTX_TOPIC_MAX)
        S.topics.length = AGENT_CTX_TOPIC_MAX;
    S.lastTopic = topic;
    return topic;
}
/** 当前活跃话题：最近一个仍在有效期内的 */
function agentCtxLastTopic() {
    var S = agentCtxEnsure();
    if (!S || !S.topics.length)
        return null;
    var t = S.topics[0];
    if (S.turns - (t.turn || 0) > AGENT_CTX_TOPIC_TTL)
        return null;
    return t;
}
/** 按类型取话题 */
function agentCtxTopicOf(type) {
    var S = agentCtxEnsure();
    if (!S)
        return null;
    for (var i = 0; i < S.topics.length; i++) {
        if (S.topics[i].type === type)
            return S.topics[i];
    }
    return null;
}
// ------------------------------ 2. 历史问答记录 ------------------------------
function agentCtxRecordTurn(userText, agentText, topicType) {
    var S = agentCtxEnsure();
    if (!S)
        return;
    S.turns++;
    S.history.unshift({
        turn: S.turns,
        q: String(userText || '').slice(0, 200),
        a: String(agentText || '').slice(0, 240),
        topic: topicType || null,
        at: Date.now()
    });
    if (S.history.length > AGENT_CTX_HISTORY_MAX)
        S.history.length = AGENT_CTX_HISTORY_MAX;
}
/** 把最近几轮压成文本，供模型/回答引用 */
function agentCtxHistoryText(n) {
    var S = agentCtxEnsure();
    if (!S || !S.history.length)
        return '';
    var k = Math.min(n || 3, S.history.length);
    var rows = [];
    for (var i = k - 1; i >= 0; i--) {
        var h = S.history[i];
        rows.push('用户：' + h.q);
        if (h.a)
            rows.push('你：' + h.a);
    }
    return rows.join('\n');
}
// ------------------------------ 3. 指代识别 ------------------------------
var AGENT_REFERENTS = [
    { re: /(这个情况|这种情况|那种情况|这情况|该情况)/, want: ['spending', 'finance', 'budget'], desc: '你刚才问的{label}' },
    { re: /(刚才那个问题|刚刚那个问题|刚才的问题|刚说的问题|那个问题)/, want: null, desc: '你刚才问的{label}' },
    { re: /(上面的分析|刚才的分析|之前的分析|那个分析|这个分析|上面说的|刚才说的|刚说的)/, want: null, desc: '我刚才做的{label}' },
    { re: /(这个结果|这个结论|那个结论|这个数据|这些数据|这个数字)/, want: null, desc: '刚才那次的{label}' },
    { re: /(这个产品|那个产品|这款产品|那款产品|该产品|这个方案|那个方案|这个建议|那个建议|这个规划|这个计划)/, want: ['knowledge', 'scenario', 'purchase', 'plan'], desc: '我刚才提到的{label}' },
    { re: /(它|它们)/, want: null, desc: '刚才说的{label}' },
    { re: /(这种方式|那种方式|这个方法|那个方法|这个办法|这样)/, want: null, desc: '我刚才给的{label}' }
];
/** 判断一句话是否"依赖上下文" */
function agentCtxHasReference(text) {
    return agentCtxMatchReferent(text) !== null;
}
function agentCtxMatchReferent(text) {
    var t = String(text || '');
    for (var i = 0; i < AGENT_REFERENTS.length; i++) {
        var m = t.match(AGENT_REFERENTS[i].re);
        if (m)
            return { phrase: m[1], rule: AGENT_REFERENTS[i], index: i };
    }
    return null;
}
// ------------------------------ 4. 指代消解 ------------------------------
function agentResolveReference(text) {
    var S = agentCtxEnsure();
    var t = String(text || '');
    var hit = agentCtxMatchReferent(t);
    if (!hit)
        return { resolved: null, reason: 'no_referent' };
    if (!S || !S.topics.length) {
        return { resolved: null, reason: 'no_topic', phrase: hit.phrase };
    }
    var topic = null;
    if (hit.rule.want && hit.rule.want.length) {
        for (var i = 0; i < hit.rule.want.length; i++) {
            var c = agentCtxTopicOf(hit.rule.want[i]);
            if (c) {
                topic = c;
                break;
            }
        }
    }
    if (!topic)
        topic = agentCtxLastTopic();
    if (!topic)
        return { resolved: null, reason: 'topic_expired', phrase: hit.phrase };
    var desc = hit.rule.desc.replace('{label}', topic.label);
    var confidence = 'medium';
    if (hit.rule.want && hit.rule.want.indexOf(topic.type) > -1)
        confidence = 'high';
    if (hit.index >= 5)
        confidence = 'low';
    return {
        resolved: topic,
        topic: topic,
        phrase: hit.phrase,
        desc: desc,
        confidence: confidence
    };
}
// ------------------------------ 5. 上下文追问处理 ------------------------------
function agentCtxFollowUp(text, topic) {
    if (!topic)
        return false;
    var t = String(text || '');
    var asksAdjust = /(需要调整|要不要调整|该调整|怎么调整|如何调整|要改|怎么优化|如何优化|有问题吗|正常吗|合理吗|高不高|多不多|严重吗|影响)/.test(t);
    if (topic.type === 'spending')
        return agentCtxSpendingFollowUp(asksAdjust);
    if (topic.type === 'finance' || topic.type === 'health' || topic.type === 'profile')
        return agentCtxFinanceFollowUp(topic);
    if (topic.type === 'budget')
        return agentCtxBudgetFollowUp();
    if (topic.type === 'card')
        return agentCtxCardFollowUp();
    return false;
}
/** 消费结构追问：是否存在过高类别 / 是否影响储蓄 / 优化建议 */
function agentCtxSpendingFollowUp(asksAdjust) {
    var cats = agentCategoryStats();
    if (!cats.length)
        return false;
    var month = agentMonthSummary();
    var total = month.expense || cats.reduce(function (s, c) { return s + (c.value || 0); }, 0);
    var top = cats[0];
    var topShare = total > 0 ? top.value / total : 0;
    // 行业经验阈值：单一类别占比超过 35% 视为偏高
    var HIGH_SHARE = 0.35;
    var over = cats.filter(function (c) { return total > 0 && c.value / total >= HIGH_SHARE; });
    var fixed = ['房租水电', '房贷', '生活缴费', '保险'];
    var flexible = cats.filter(function (c) { return fixed.indexOf(c.label) === -1; });
    var flexibleSum = flexible.reduce(function (s, c) { return s + c.value; }, 0);
    var canCompress = Math.round(flexibleSum * 0.2);
    var surplus = month.balance || 0;
    var rate = month.income > 0 ? surplus / month.income : 0;
    var idleSubs = (mockData.subscriptions || []).filter(function (s) { return s.usage === '低'; });
    var subSave = idleSubs.reduce(function (s, x) { return s + (x.price || 0); }, 0);
    var rows = cats.slice(0, 5).map(function (c) {
        var pct = total > 0 ? Math.round(c.value / total * 100) : 0;
        var flag = pct >= Math.round(HIGH_SHARE * 100);
        return '<div class="ctx-cat-row"><span class="ctx-cat-name">' + c.label + '</span>' +
            '<span class="ctx-cat-bar"><i style="width:' + Math.min(100, pct) + '%;background:' + (flag ? '#dc2626' : '#09407F') + ';"></i></span>' +
            '<span class="ctx-cat-pct" style="color:' + (flag ? '#dc2626' : '#6b7280') + ';">' + pct + '% · ¥' + agentFmtInt(c.value) + '</span></div>';
    }).join('');
    var verdicts = [];
    if (over.length) {
        verdicts.push('<b>确实存在偏高的类别</b>：' + over.map(function (c) {
            return c.label + '占比 ' + Math.round(c.value / total * 100) + '%（高于 35% 的经验线）';
        }).join('、') + '。');
    }
    else {
        verdicts.push('各类别占比都在 35% 的经验线以内，<b>结构本身没有明显失衡</b>。');
    }
    if (rate < 0.2) {
        verdicts.push('但它正在影响你的储蓄：本月储蓄率仅 <b>' + (rate * 100).toFixed(0) + '%</b>（健康线 20%~40%），' +
            '说明支出总额偏高，而不只是某一类的问题。');
    }
    else {
        verdicts.push('对储蓄的影响可控：本月储蓄率 <b>' + (rate * 100).toFixed(0) + '%</b>，仍在健康区间。');
    }
    var advice = [];
    if (top) {
        advice.push('把「' + top.label + '」设为本月唯一重点管控项，给自己定一个上限（建议压到 ¥' + agentFmtInt(Math.round(top.value * 0.8 / 100) * 100) + '），压缩 20% 即可释放 ¥' + agentFmtInt(Math.round(top.value * 0.2)) + '。');
    }
    advice.push('弹性消费（餐饮/购物/娱乐/交通）合计 ¥' + agentFmtInt(flexibleSum) + '，整体压缩 20% 可释放约 ¥' + agentFmtInt(canCompress) + '/月。');
    if (idleSubs.length) {
        advice.push('另有 ' + idleSubs.length + ' 项低使用订阅（' + idleSubs.map(function (s) { return s.name; }).join('、') + '）可取消，月省 ¥' + agentFmtInt(subSave) + '。');
    }
    advice.push('建议把释放出来的钱在发薪日自动转入专项储蓄，避免"省下来又花掉"。');
    var html = '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · 消费结构诊断</div>' +
        '<div class="msg-bubble agent-bubble">' +
        '<div class="ctx-head">接着刚才的消费结构说 —— 要不要调整</div>' +
        '<div class="ctx-ref">我理解「这个情况」指的是：<b>你最近一个月的消费结构分析</b>（共 ¥' + agentFmtInt(total) + '，' + cats.length + ' 个类别）</div>' +
        '<div class="ctx-cats">' + rows + '</div>' +
        '<div class="agent-sec-title">① 是否存在偏高的类别</div>' +
        '<div class="ctx-verdicts">' + verdicts.map(function (v) { return '<div class="ctx-verdict">· ' + v + '</div>'; }).join('') + '</div>' +
        '<div class="agent-sec-title">② 优化建议</div>' +
        '<div class="ctx-advices">' + advice.map(function (a, i) { return '<div class="ctx-advice"><span class="ctx-advice-idx">' + (i + 1) + '</span><span>' + a + '</span></div>'; }).join('') + '</div>' +
        '<div class="ctx-foot">要我把「' + (top ? top.label : '主要支出') + '」设一个月度上限吗？设好后超支我会主动提醒你。</div>' +
        '</div></div></div>';
    appendMessage(html);
    scrollToBottom();
    agentSessionAnalysis('spending_followup', '消费结构诊断：' + (over.length ? over.map(function (c) { return c.label; }).join('、') + '占比偏高' : '结构无明显失衡') +
        '；储蓄率 ' + (rate * 100).toFixed(0) + '%；可压缩 ¥' + agentFmtInt(canCompress) + '/月');
    agentCtxPushTopic('spending', '消费结构：' + top.label + '占比最高', { extra: { total: total, topLabel: top.label } });
    addToConversation('assistant', '已输出消费结构诊断', null);
    return true;
}
/** 财务全景/健康/画像追问：给出可执行的改进项 */
function agentCtxFinanceFollowUp(topic) {
    var health = (typeof profileHealthScore === 'function') ? profileHealthScore(null) : null;
    if (!health)
        return false;
    var sorted = health.dims.slice().sort(function (a, b) { return (a.score / a.full) - (b.score / b.full); });
    var weak = sorted[0];
    var weakPct = Math.round(weak.score / weak.full * 100);
    var fixMap = {
        '储蓄能力': '把储蓄率往上提：发薪日先自动划转月结余的 40% 进专项储蓄，再安排消费。',
        '消费稳定性': '把弹性消费（餐饮/购物/娱乐）单独设月度上限，并开启超支提醒，避免月末靠信用卡兜底。',
        '负债压力': '优先置换或提前偿还高息负债，同时暂停新增分期；保持月供收入比在 40% 以内。',
        '风险水平': '让持仓风险等级与你的风险测评结果对齐，避免"保守型却在重仓权益"。'
    };
    var html = '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · 财务诊断</div>' +
        '<div class="msg-bubble agent-bubble">' +
        '<div class="ctx-head">接着说刚才的财务情况</div>' +
        '<div class="ctx-ref">我理解你指的是：<b>' + topic.label + '</b>（' + (topic.summary || '') + '）</div>' +
        '<div class="agent-sec-title">需要优先改善的一环</div>' +
        '<div class="ctx-verdict">· <b>' + weak.name + '</b> 得分 ' + weak.score + '/' + weak.full + '（' + weakPct + '%，四维中最低）—— 依据：' + weak.detail + '</div>' +
        '<div class="agent-sec-title">建议动作</div>' +
        '<div class="ctx-advices"><div class="ctx-advice"><span class="ctx-advice-idx">1</span><span>' + (fixMap[weak.name] || '针对该维度做专项优化。') + '</span></div>' +
        '<div class="ctx-advice"><span class="ctx-advice-idx">2</span><span>其他三维保持在 ' + sorted.slice(1).map(function (d) { return d.name + ' ' + d.score + '/' + d.full; }).join('、') + '，暂不需要额外动作。</span></div></div>' +
        '<div class="ctx-foot">要不要我帮你把这一项做成可执行的预算或储蓄计划？</div>' +
        '</div></div></div>';
    appendMessage(html);
    scrollToBottom();
    agentSessionAnalysis('finance_followup', '财务诊断：优先改善「' + weak.name + '」（' + weakPct + '%）');
    addToConversation('assistant', '已输出财务诊断', null);
    return true;
}
/** 预算追问 */
function agentCtxBudgetFollowUp() {
    var b = (typeof agentBudgetStatus === 'function') ? agentBudgetStatus() : null;
    if (!b)
        return false;
    var used = b.used || 0, limit = b.limit || 0;
    var pct = limit > 0 ? Math.round(used / limit * 100) : 0;
    var over = pct > 100;
    var html = '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · 预算诊断</div>' +
        '<div class="msg-bubble agent-bubble">' +
        '<div class="ctx-head">接着说刚才的预算</div>' +
        '<div class="ctx-ref">我理解你指的是：<b>本月预算执行情况</b>（已用 ¥' + agentFmtInt(used) + ' / 上限 ¥' + agentFmtInt(limit) + '，' + pct + '%）</div>' +
        '<div class="ctx-verdict">' + (over
        ? '· <b>已经超支</b>，超出 ¥' + agentFmtInt(used - limit) + '。建议立刻冻结弹性消费，把剩余天数的日均可花压到 ¥' + agentFmtInt(Math.max(50, Math.round((limit - used) / 10))) + ' 以内。'
        : '· 预算仍在可控范围（' + pct + '%）。按当前节奏，月末预计' + (pct > 85 ? '<b>逼近上限</b>，需要收一收' : '不会突破上限') + '。') + '</div>' +
        '<div class="ctx-foot">要我把预算上限或分类额度调整一下吗？</div>' +
        '</div></div></div>';
    appendMessage(html);
    scrollToBottom();
    addToConversation('assistant', '已输出预算诊断', null);
    return true;
}
/** 卡片追问 */
function agentCtxCardFollowUp() {
    var u = mockData.userProfile || {};
    var c = u.creditCard || {};
    var limit = c.limit || 0, usedAmt = c.used || c.balance || 0;
    var util = limit > 0 ? Math.round(usedAmt / limit * 100) : 0;
    var html = '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · 卡片诊断</div>' +
        '<div class="msg-bubble agent-bubble">' +
        '<div class="ctx-head">接着说刚才的卡片情况</div>' +
        '<div class="ctx-ref">我理解你指的是：<b>你的信用卡账单与额度情况</b>（已用 ¥' + agentFmtInt(usedAmt) + ' / 额度 ¥' + agentFmtInt(limit) + '，占用 ' + util + '%）</div>' +
        '<div class="ctx-verdict">' + (util >= 70
        ? '· 额度占用已达 ' + util + '%，<b>偏高</b>。占用率长期超 70% 会影响征信评分，也压缩你的应急空间。建议先还一部分把占用降到 50% 以下。'
        : '· 额度占用 ' + util + '%，处于健康水平。') + '</div>' +
        '<div class="ctx-foot">要我帮你规划一个还款节奏吗？</div>' +
        '</div></div></div>';
    appendMessage(html);
    scrollToBottom();
    addToConversation('assistant', '已输出卡片诊断', null);
    return true;
}
// ------------------------------ 6. 澄清反问 ------------------------------
function agentCtxAskClarify(phrase, candidates) {
    var opts = (candidates || []).slice(0, 3);
    var list = opts.length
        ? opts.map(function (c, i) {
            return '<div class="ctx-clarify-opt" onclick="agentCtxPickTopic(' + i + ')">' +
                '<span class="ctx-clarify-idx">' + (i + 1) + '</span><span>' + c.label + '</span>' +
                '<span class="ctx-clarify-sum">' + (c.summary || '') + '</span></div>';
        }).join('')
        : '<div class="ctx-clarify-opt"><span>你现在还没有可以让指代的对象，先问我一个具体问题吧。</span></div>';
    window.__AGENT_CLARIFY_CANDIDATES = opts;
    var html = '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · 需要确认</div>' +
        '<div class="msg-bubble agent-bubble">' +
        '<div class="ctx-head">你提到的「' + phrase + '」，我不太确定指哪个</div>' +
        '<div class="ctx-clarify-list">' + list + '</div>' +
        '<div class="ctx-foot">点一下告诉我就行。' + (opts.length ? '（默认理解为你最近聊的那件事：' + opts[0].label + '）' : '') + '</div>' +
        '</div></div></div>';
    appendMessage(html);
    scrollToBottom();
    addToConversation('assistant', '需要确认指代对象', null);
    return true;
}
/** 澄清卡里的选项点击 */
function agentCtxPickTopic(i) {
    var cands = window.__AGENT_CLARIFY_CANDIDATES || [];
    var c = cands[i];
    if (!c)
        return;
    appendMessage('<div class="message user"><div class="msg-avatar user">我</div><div class="msg-content">' +
        '<div class="msg-bubble">' + c.label + '</div></div></div>');
    scrollToBottom();
    agentCtxTopicOf(c.type);
    var S = agentCtxEnsure();
    if (S)
        S.topics.unshift(c);
    agentCtxFollowUp('需要调整吗', c);
}
// ------------------------------ 7. 主入口 ------------------------------
/** 在 agentHandle 里、风险拦截之后、业务分支之前调用；返回 true 表示已处理 */
async function agentCtxHandle(text) {
    var S = agentCtxEnsure();
    if (!S)
        return false;
    var t = String(text || '');
    if (!t)
        return false;
    if (!agentCtxHasReference(t))
        return false;
    var r = agentResolveReference(t);
    if (!r.resolved) {
        if (S.topics.length)
            return false;
        return agentCtxAskClarify(r.phrase || '它', []);
    }
    if (r.confidence === 'low' && S.topics.length >= 2) {
        var cands = S.topics.slice(0, 3);
        var second = cands[1];
        if (second && Math.abs((cands[0].turn || 0) - (second.turn || 0)) <= 1) {
            return agentCtxAskClarify(r.phrase || '它', cands);
        }
    }
    var handled = agentCtxFollowUp(t, r.topic || null);
    if (handled)
        return true;
    return false;
}
