// ==========================================================================
//  引导层（TypeScript 源码，noCheck 转译）
//  编译产物：js/flows/guide-ai.js
//  说明：该层是「经典脚本 + 全局状态」结构，状态对象（GUIDE_*）随流程变化，
//        因此采用 noCheck 转译；对外入口在 types/global.d.ts 声明。
// ==========================================================================
// ==========================================================================
//  服务向导 · 模型识别层（大模型意图路由 / 槽位抽取 / 判定）
//
//  本文件是**唯一**调用大模型的地方（guideLLMJson）。调用时机分两种：
//
//  A. 意图路由（模型优先）
//     guideAIRouteIntent —— guideHandleText ③ 调用：用户没在进行中的流程时，
//     先把整句话交给模型判断属于哪个模块（转账/卡片/理财/订阅/…）。
//     模型不可用、超时、返回 none → 返回 false，继续走 guide-rules.js 的本地规则。
//
//  B. 槽位补位（正则有把握时不调用）
//     guideTransferAIExtract / guideTimedAIExtract / guideAAAIExtract /
//     guideCardApplyAIType / guideTxnLimitAILimits / guideSubAIExtract /
//     guideHoldingAIIntent / guideAISlots
//     —— 只有本地正则抽不出（中文数字、口语长句、多槽位混说）时才调用，
//        避免每补一个金额都等模型 1–2 秒。
//
//  约定：本文件不做流程控制、不渲染卡片；规则识别在 guide-rules.js；流程在 guide.js。
// ==========================================================================
// 意图路由表：模块 key → 进入该模块的处理函数（供 guideAIRouteIntent 命中后调用）
var GUIDE_INTENT_MODULES = {
    'transfer.name': function (t) { GUIDE_TRANSFER = { kind: 'name', payee: null, phone: null, amount: null, remark: '', stage: 'slots' }; guideTransferStep(t); },
    'transfer.phone': function (t) { GUIDE_TRANSFER = { kind: 'phone', payee: null, phone: null, amount: null, remark: '', stage: 'slots' }; guideTransferStep(t); },
    'transfer.timed': function (t) { GUIDE_TRANSFER = { kind: 'timed', payee: null, phone: null, amount: null, remark: '', stage: 'slots', date: null, time: null, repeat: '不重复' }; guideTransferStep(t); },
    'transfer.aa': function (t) { GUIDE_AA = { total: 0, participants: [], stage: 'slots', pendingNames: [], pickOptions: [] }; guideAAStep(t); },
    'bill.analysis': function () { if (typeof showBillOverview === 'function')
        showBillOverview(); },
    'bill.abnormal': function () { if (typeof showAbnormalAlert === 'function')
        showAbnormalAlert(); },
    'card.apply': function (t) {
        guideStartCardApply();
        if (/(白金|金卡|旅行|青年|\d|消费|差旅|教育|购物)/.test(String(t || '')))
            guideCardApplyStep(t);
    },
    'card.limit': function (t) {
        guideStartCardLimitAdjust();
        if (/(额度|调到|提到|提高|降低|调高|调低|调整|原因)/.test(String(t || '')))
            guideCardLimitStep(t);
    },
    'card.txn': function (t) {
        guideStartTxnLimit();
        if (/\d/.test(String(t || '')))
            guideTxnLimitStep(t);
    },
    'card.lost': function () { guideStartCardLost(); },
    'wealth.buy': function (t) {
        guideStartWealthPurchase();
        if (typeof guideWealthFindProduct === 'function' && guideWealthFindProduct(t))
            guideWealthStep(t);
    },
    'wealth.risk': function () { if (typeof startRiskAssessment === 'function')
        startRiskAssessment(); },
    'wealth.holding': function () { guideStartHoldings(); },
    'sub.add': function (t) {
        GUIDE_SUB = { mode: 'add', stage: 'slots', preset: null, cycle: null, autoRenew: null, listShown: true };
        guideStartSubAdd();
        if (typeof guideSubFindService === 'function' && guideSubFindService(t))
            guideSubAddStep(t);
    },
    'sub.cancel': function (t) {
        GUIDE_SUB = { mode: 'cancel', stage: 'slots', target: null };
        guideStartSubCancel();
        if (typeof guideSubFindService === 'function' && guideSubFindService(t))
            guideSubCancelStep(t);
    },
    'sub.cancel-all': function () { guideSubCancelAllStart(); },
    'sub.renew': function (t) {
        GUIDE_SUB = { mode: 'manage', stage: 'slots', target: null, newAutoRenew: null };
        guideStartSubAutoRenew();
        if (typeof guideSubFindService === 'function' && guideSubFindService(t))
            guideSubManageStep(t);
    }
};
async function guideAIRouteIntent(text) {
    if (typeof bankHasLLMKey === 'function' && !bankHasLLMKey())
        return false;
    var t0 = String(text || '');
    // ① 只读查询 / 卡片列表 / 持仓查询：交给规则层与主链路，不进模型（省额度也更快）
    if (typeof guideIsReadOnlyQuery === 'function' && guideIsReadOnlyQuery(t0))
        return false;
    if (typeof guideIsCardListQuery === 'function' && guideIsCardListQuery(t0))
        return false;
    if (typeof guideIsHoldingsQuery === 'function' && guideIsHoldingsQuery(t0))
        return false;
    // ② 确定性高的说法：规则直接给出模块，不调模型
    var ruleModule = '';
    if (/(取消|退订|不要了|终止|解约)/.test(t0) && /(订阅|会员|VIP|网盘|年卡|月卡)/.test(t0)) {
        // 取消类必须先判，否则「取消订阅」里的「订」会被误判成添加
        ruleModule = /(所有|全部|都)/.test(t0) ? 'sub.cancel-all' : 'sub.cancel';
    }
    else if (/(自动续费|续费|不续费)/.test(t0) && /(订阅|会员|网盘|VIP|开|关|关掉|管理)/.test(t0)) {
        ruleModule = 'sub.renew';
    }
    else if (/(持仓|持有|买了哪些|买过哪些|有哪些产品|我的产品|收益情况)/.test(t0)) {
        ruleModule = 'wealth.holding';
    }
    else if (/(流水|账单|收支|消费统计|支出结构|花销)/.test(t0)) {
        ruleModule = 'bill.analysis';
    }
    else if (/(异常|可疑).{0,4}(交易|消费|记录)/.test(t0)) {
        ruleModule = 'bill.abnormal';
    }
    else if (/(AA|aa|分摊|平摊|各付|一人|每人)/.test(t0) && /(收|转|付|分摊|平摊)/.test(t0)) {
        ruleModule = 'transfer.aa';
    }
    else if (/1\d{10}/.test(t0) && /(转|汇|打款|付款)/.test(t0)) {
        ruleModule = 'transfer.phone';
    }
    else if (/(风险测评|风险评估|测评|风险等级)/.test(t0)) {
        ruleModule = 'wealth.risk';
    }
    else if (/(订阅|会员|年卡|月卡)/.test(t0) && /(订|开通|想要|添加|买)/.test(t0)) {
        ruleModule = 'sub.add';
    }
    var obj = ruleModule ? { module: ruleModule } : null;
    if (!obj)
        try {
            obj = await guideLLMJson('你是银行 App 的意图路由器。把用户的话归到唯一模块，模块枚举：' +
                Object.keys(GUIDE_INTENT_MODULES).join('、') + '、none。' +
                '只输出 JSON：{"module":"模块名"}。判断不出就返回 none。' +
                '区分要点：card.limit 是调整信用卡总额度（提额、降额、把额度调到 X）；' +
                'card.txn 是交易限额（单笔限额、每日/每天限额、消费上限、一天只能用多少、限额是多少、怎么被限制了）。' +
                '只要在说「一天/每天/单笔/日限/上限/限额/被限制」，一律 card.txn，不是 card.limit。' +
                '说「取消所有订阅 / 全部退订 / 都取消」时用 sub.cancel-all，只取消某一个时才用 sub.cancel。' +
                '只要句子里出现时间说法（明天/后天/下周三/下午三点/过两天/每个月/定时/预约），一律 transfer.timed，不是 transfer.name。' +
                '只读查询（查余额/查额度/我现在有哪些卡/交易记录/我买了哪些产品/持仓收益）不是办理业务，返回 none。' +
                '出现 11 位手机号且要转账，用 transfer.phone；出现 AA / 分摊 / 平摊 / 各付 / 一人，用 transfer.aa。' +
                '说「异常交易 / 可疑交易」用 bill.abnormal；说账单、流水、收支、消费统计用 bill.analysis。' +
                '说「自动续费 / 续费 / 不续费」用 sub.renew；说「订 / 开通 / 订阅会员」用 sub.add。' +
                '说「持仓 / 持有 / 买了哪些产品 / 收益情况」用 wealth.holding。', text);
        }
        catch (e) {
            obj = null;
        }
    if (!obj || !obj.module || obj.module === 'none')
        return false;
    // 关键词纠偏：说「限额/每日/单笔/上限/被限制」而没说「提额/额度调整」时，强制归到交易限制
    var t0 = String(text || '');
    if (/(一天|每天|每日|单笔|日限|限额|上限|限制)/.test(t0) && !/(额度调整|提额|提升额度|降低额度|调额|把额度)/.test(t0)) {
        if (obj.module === 'card.limit')
            obj.module = 'card.txn';
    }
    // 时间说法优先：模型若判成即时转账，但句子里有「明天下午 / 下周三」这类时间 → 改判定时转账
    if (obj.module === 'transfer.name' && typeof guideLooksTimedTransfer === 'function' && guideLooksTimedTransfer(t0)) {
        obj.module = 'transfer.timed';
    }
    // 「取消所有订阅 / 全部退订」一律走一键全取消，别进单个取消流程
    if (/^sub\./.test(obj.module) && /(所有|全部|都)/.test(t0) && /(取消|退订|不要|解约)/.test(t0)) {
        obj.module = 'sub.cancel-all';
    }
    var fn = GUIDE_INTENT_MODULES[obj.module];
    if (!fn)
        return false;
    try {
        guideResetAllSessions();
        await fn(text);
    }
    catch (e) {
        return false;
    }
    return true;
}
// 是否停在「最后一步的确认卡」上（等用户点按钮 / 填验证码）
// AI 优先开关：有模型 Key 时，先让模型判断意图，规则做兜底
function guideAIFirstEnabled() {
    if (typeof window !== 'undefined' && window.__GUIDE_AI_FIRST__ === false)
        return false;
    return (typeof bankHasLLMKey === 'function') && bankHasLLMKey();
}
// 这些说法交给规则（菜单名 / 返回 / 数字补充 / 闲聊），不必花模型额度
// 这些说法交给规则（菜单名 / 返回 / 数字补充 / 闲聊），不必花模型额度
function guideAIFirstSkipped(t) {
    var s = String(t || '').trim();
    if (!s)
        return true;
    if (/^(返回|返回菜单|服务菜单|主菜单|菜单|首页|服务列表|取消|退出|算了)$/.test(s))
        return true;
    if (/^\d+(\.\d+)?$/.test(s))
        return true;
    if (/^(你好|您好|hi|hello|在吗|谢谢|多谢|再见|拜拜)[!！。.~～]*$/i.test(s))
        return true;
    if (typeof guideResolveService === 'function' && guideResolveService(s))
        return true;
    // 子功能名（如「姓名转账」「卡片挂失」）走规则菜单
    var svc = GUIDE_SERVICES.filter(function (x) {
        return x.subs.some(function (sub) {
            return sub.label === s || (sub.aliases || []).indexOf(s) !== -1;
        });
    })[0];
    if (svc)
        return true;
    return false;
}
// 去掉「AI 理解」等标签后再输出，并避免连续重复同一句追问
// 模型识别（规则失配后的补充路径）：本地规则没认出来时，让模型在固定清单里选一个
async function guideAIIntent(text) {
    var loadingId = 'guide-intent-' + Date.now();
    appendMessage('<div class="message" id="' + loadingId + '"><div class="msg-avatar ai">🤖</div>' +
        '<div class="msg-content"><div class="msg-name">AI Bank 助手</div>' +
        '<div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div></div></div>');
    scrollToBottom();
    var pick = null;
    try {
        pick = await guideAIIntentExtract(text);
    }
    catch (e) {
        pick = null;
    }
    var el = document.getElementById(loadingId);
    if (el)
        el.remove();
    if (pick) {
        var svc = guideServiceByKey(pick.service);
        if (svc) {
            if (pick.sub) {
                var sub = svc.subs.filter(function (x) { return x.key === pick.sub; })[0];
                if (sub) {
                    guidePickSub(svc.key, sub.key);
                    return;
                }
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
    if (typeof bankHasLLMKey === 'function' && !bankHasLLMKey())
        return null;
    if (typeof DEEPSEEK_API_URL === 'undefined' || !DEEPSEEK_API_URL)
        return null;
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
    if (!resp.ok)
        return null;
    var data = await resp.json();
    var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    var m = content.match(/\{[\s\S]*\}/);
    if (!m)
        return null;
    var obj = null;
    try {
        obj = JSON.parse(m[0]);
    }
    catch (e) {
        return null;
    }
    if (!obj || !obj.service)
        return null;
    if (!guideServiceByKey(obj.service))
        return null;
    return { service: obj.service, sub: obj.sub || '' };
}
// 按「服务名 + 别名」精确匹配一级服务（整词匹配，避免劫持自然语言指令）
// ------------------------------ 模型槽位抽取（正则抽不全时补位） ------------------------------
// 本地正则只能认「张三 100」这类规整输入；遇到「帮我转一百块给张三」「就打给老王吧，两百」
// 这类说法，交给模型抽槽位；无 Key / 请求失败时降级为示例引导，不阻塞对话。
async function guideTransferAIExtract(text, session) {
    if (typeof bankHasLLMKey === 'function' && !bankHasLLMKey())
        return null;
    if (typeof DEEPSEEK_API_URL === 'undefined' || !DEEPSEEK_API_URL)
        return null;
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
    if (!resp.ok)
        return null;
    var data = await resp.json();
    var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    var m = content.match(/\{[\s\S]*\}/);
    if (!m)
        return null;
    try {
        return JSON.parse(m[0]);
    }
    catch (e) {
        return null;
    }
}
async function guideTransferAIFallback(text) {
    var s = GUIDE_TRANSFER || (GUIDE_TRANSFER = { kind: 'name', payee: null, phone: null, amount: null, remark: '', stage: 'slots' });
    var loadingId = 'guide-ai-' + Date.now();
    appendMessage('<div class="message" id="' + loadingId + '"><div class="msg-avatar ai">🤖</div>' +
        '<div class="msg-content"><div class="msg-name">AI Bank 助手</div>' +
        '<div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div></div></div>');
    scrollToBottom();
    var parsed = null;
    try {
        parsed = await guideTransferAIExtract(text, s);
    }
    catch (e) {
        parsed = null;
    }
    var el = document.getElementById(loadingId);
    if (el)
        el.remove();
    // 异步返回时用户可能已经取消/切换到别的流程，旧结果不能再写入会话
    if (GUIDE_TRANSFER !== s)
        return true;
    var payee = parsed && parsed.payee ? String(parsed.payee).trim() : '';
    var phone = parsed && parsed.phone ? String(parsed.phone).trim() : '';
    var amount = parsed && parsed.amount ? Number(parsed.amount) : 0;
    // 姓名转账：模型抽出的收款人也必须在通讯录里
    if (payee && s.kind === 'name' && !guideIsContact(payee)) {
        guideUnknownPayeeNotice(payee);
        return;
    }
    if (payee)
        s.payee = payee;
    if (phone)
        s.phone = phone;
    if (amount > 0)
        s.amount = amount;
    var aiTag = '';
    if (!(amount > 0) && /[-−负]/.test(String(text || '')) && /\d/.test(String(text || ''))) {
        guideAsk(guideMessage('<p>转账金额需要大于 0，请重新输入（例如「1000」）。</p>'));
        return true;
    }
    var hasTarget = s.kind === 'phone' ? !!s.phone : !!s.payee;
    if (hasTarget && s.amount > 0) {
        if (s.kind === 'timed') {
            // 定时转账：AI 只补齐收款人/金额，时间与重复仍按对话规则继续追问
            if (s.date && s.time) {
                guideTimedAskRepeat(aiTag);
            }
            else {
                appendMessage(guideMessage('<p>' + aiTag + guideTimedMissingPrompt(s) + '</p>'));
            }
            scrollToBottom();
        }
        else if (s.kind === 'phone') {
            guidePhoneResolvePayee();
        }
        else {
            guideTransferAskRemark();
        }
        return;
    }
    if (s.kind === 'phone') {
        if (s.phone) {
            guideAsk(guideMessage('<p>麻烦告诉我转账金额</p>'));
        }
        else if (s.amount > 0) {
            guideAsk(guideMessage('<p>请问收款手机号是多少？</p>'));
        }
        else {
            var reply = parsed && parsed.reply ? String(parsed.reply) : '';
            appendMessage(guideMessage('<p>' + (reply || '没太听懂。可以直接说手机号和金额，例如「13800138000 100」。') + '</p>' +
                '<p class="guide-tip">例如：13800138000 100</p>'));
        }
    }
    else if (s.payee) {
        guideAsk(guideMessage('<p>麻烦告诉我转账金额</p>'));
    }
    else if (s.amount > 0) {
        guideAsk(guideMessage('<p>请问要转给谁？</p>'));
    }
    else {
        var reply2 = parsed && parsed.reply ? String(parsed.reply) : '';
        appendMessage(guideMessage('<p>' + (reply2 || '没太听懂。可以直接说收款人和金额，例如「张三 100」。') + '</p>' +
            '<p class="guide-tip">例如：张三 100 / 张三转 100 / 给李雷转 1.5 万</p>'));
    }
    scrollToBottom();
}
// 槽位 + 备注都齐了：回述一句「确认向 X 转账 N 元」并出确认卡（强制确认，T1 也先确认）
// 通用 LLM JSON 调用：无 Key / 失败时返回 null，调用方降级处理
// 说明：按钮点击一律传固定枚举，不经过这里；只有「用户打字」且本地规则认不出时才调用模型。
async function guideLLMJson(system, user) {
    // 兜底开关：按钮驱动的路径可临时置为 true，杜绝任何模型调用
    if (typeof window !== 'undefined' && window.__GUIDE_NO_AI__)
        return null;
    if (typeof window !== 'undefined') {
        window.__GUIDE_AI_CALLS__ = (window.__GUIDE_AI_CALLS__ || 0) + 1;
    }
    if (typeof bankHasLLMKey === 'function' && !bankHasLLMKey())
        return null;
    if (typeof DEEPSEEK_API_URL === 'undefined' || !DEEPSEEK_API_URL)
        return null;
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
        if (!resp.ok)
            return null;
        var data = await resp.json();
        var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        var m = content.match(/\{[\s\S]*\}/);
        if (!m)
            return null;
        return JSON.parse(m[0]);
    }
    catch (e) {
        return null;
    }
}
// ——————————————————————————————————————————————
// 通用 AI 槽位识别：凡是「用户没有固定回答」的输入，本地规则认不出时统一交给模型。
// 无 Key / 请求失败时一律返回 null，调用方回落到本地追问，不阻塞对话。
// ——————————————————————————————————————————————
// ——————————————————————————————————————————————
// 通用 AI 槽位识别：凡是「用户没有固定回答」的输入，本地规则认不出时统一交给模型。
// 无 Key / 请求失败时一律返回 null，调用方回落到本地追问，不阻塞对话。
// ——————————————————————————————————————————————
async function guideAISlots(text, system, parse) {
    var loadId = (typeof guideTypingBubble === 'function') ? guideTypingBubble() : null;
    var obj = null;
    try {
        obj = await guideLLMJson(system, text);
    }
    catch (e) {
        obj = null;
    }
    var el = loadId ? document.getElementById(loadId) : null;
    if (el)
        el.remove();
    if (typeof parse === 'function')
        return parse(obj);
    return obj || null;
}
// 定时转账：日期 / 时间 / 重复方式（支持「下周三」「月底」等自由说法）
// 定时转账：日期 / 时间 / 重复方式（支持「下周三」「月底」等自由说法）
function guideTimedAIExtract(text) {
    var today = guideOffsetDate(0);
    return guideAISlots(text, '你是银行 App 的时间解析器。今天是 ' + today + '。用户在设置定时转账时间。' +
        '请把相对说法换算成具体日期（如「明天」「下周三」「月底」「10月30号」），时间用 24 小时制（「下午三点」=15:00）。' +
        '重复方式只能是 不重复/每天/每周/每月/每年。' +
        '只说时间段没说钟点（如「明天下午」）时 time 返回空、period 填 上午/下午/晚上/中午/凌晨。' +
        '只输出 JSON：{"date":"YYYY-MM-DD或空","time":"HH:MM或空","period":"或空","repeat":"不重复|每天|每周|每月|每年或空"}', function (o) {
        if (!o)
            return null;
        var date = /^\d{4}-\d{1,2}-\d{1,2}$/.test(o.date || '') ? String(o.date) : null;
        var time = /^\d{1,2}:\d{2}$/.test(o.time || '') ? guidePad2(String(o.time).split(':')[0]) + ':' + String(o.time).split(':')[1] : null;
        var period = ['凌晨', '早上', '上午', '中午', '下午', '晚上'].indexOf(o.period) !== -1 ? o.period : null;
        var repeat = ['不重复', '每天', '每周', '每月', '每年'].indexOf(o.repeat) !== -1 ? o.repeat : null;
        if (!date && !time && !period && !repeat)
            return null;
        return { date: date, time: time, period: period, repeat: repeat };
    });
}
// AA 收款：垫付总额与参与人名单
// AA 收款：垫付总额与参与人名单
function guideAAAIExtract(text) {
    var names = (mockData.contacts || []).map(function (c) { return c.name; }).join('、');
    return guideAISlots(text, '你是银行 App 的信息抽取器。用户在发起 AA 收款，需要「垫付总金额」和「除自己之外要收款的参与人名单」。' +
        '通讯录联系人只有：' + names + '。请只从通讯录里取名（没有就不要编）。' +
        '只输出 JSON：{"total":数字或null,"names":["姓名",…]}。', function (o) {
        if (!o)
            return null;
        var total = Number(o.total);
        var list = Array.isArray(o.names) ? o.names.filter(function (n) { return typeof n === 'string' && n; }) : [];
        if (!(total > 0))
            total = null;
        if (total === null && !list.length)
            return null;
        return { total: total, names: list };
    });
}
// AA 收款：回答「还有其他参与人吗？」——判断是否结束 + 补充名单
// AA 收款：回答「还有其他参与人吗？」——判断是否结束 + 补充名单
function guideAAAIHasMore(text) {
    var names = (mockData.contacts || []).map(function (c) { return c.name; }).join('、');
    return guideAISlots(text, '你是银行 App 的意图解析器。系统在问「还有其他参与人吗？」，用户可能回答「没有了」「就这些人」「再加个李四」。' +
        '通讯录联系人只有：' + names + '。只输出 JSON：{"more":true|false,"names":["补充的姓名",…]}。' +
        '表示结束时 more 返回 false；无法判断时 more 返回 null。', function (o) {
        if (!o)
            return null;
        var list = Array.isArray(o.names) ? o.names.filter(function (n) { return typeof n === 'string' && n; }) : [];
        var more = (o.more === true) ? true : (o.more === false ? false : null);
        if (more === null && !list.length)
            return null;
        return { more: more, names: list };
    });
}
// 信用卡申请：卡种与主要用途
// 信用卡申请：卡种与主要用途
function guideCardApplyAIType(text) {
    return guideAISlots(text, '你是银行 App 的信用卡申请解析器。卡种只能是 白金信用卡/标准金卡/旅行信用卡/青年卡；' +
        '用途只能是 日常消费/出行差旅/教育培训/大额购物/其他。用户怎么说都要映射到这两个清单里。' +
        '只输出 JSON：{"cardType":"或空","purpose":"或空"}。', function (o) {
        if (!o)
            return null;
        var t = CARD_APPLY_TYPES.filter(function (n) { return o.cardType && String(o.cardType).indexOf(n) !== -1; })[0] || null;
        var p = CARD_APPLY_PURPOSES.filter(function (n) { return o.purpose && String(o.purpose).indexOf(n) !== -1; })[0] || null;
        if (!t && !p)
            return null;
        return { cardType: t, purpose: p };
    });
}
// 额度调整：调整原因 + 目标额度
// AI 理解「允许 / 禁止」：返回 'allow' | 'block' | null
async function guideTxnLimitAIFlag(text, which) {
    var obj = await guideLLMJson('你是银行 App 的选项解析器。用户在回答「是否允许' + (which === 'night' ? '夜间交易' : '境外交易') + '」，' +
        '只能输出 JSON：{"allow": true|false|null}。表示同意的说法（是/可以/行/当然/没问题/允许）→ true；' +
        '表示不同意的说法（不/否/不行/不要/禁止/关掉/不能）→ false；无法判断 → null。不要输出其它内容。', text);
    if (!obj || obj.allow === null || obj.allow === undefined)
        return null;
    if (obj.allow === true)
        return 'allow';
    if (obj.allow === false)
        return 'block';
    return null;
}
// AI 提取两项限额（支持中文数字）：返回 { single, daily } 或 null
// AI 提取两项限额（支持中文数字）：返回 { single, daily } 或 null
async function guideTxnLimitAILimits(text) {
    var obj = await guideLLMJson('你是银行 App 的限额解析器。用户正在设置信用卡的「单笔限额」(single) 与「每日限额」(daily)。' +
        '请输出 JSON：{"single":数字或null,"daily":数字或null,"keepSingle":true/false,"keepDaily":true/false}。' +
        '规则：' +
        '1) 中文数字转阿拉伯数字（「五千」=5000、「一万」=10000）。' +
        '2) 用户明确说某一项「不变 / 不改变 / 不改 / 保持原样 / 照旧 / 维持」，该项数字给 null，并把它对应的 keep 设为 true。' +
        '3) 只说了一个数字且没说属于哪一项时，当作单笔限额（single），daily 给 null。' +
        '4) 两个数字按出现顺序，先单笔、后每日。只输出 JSON，不要其它内容。', text);
    if (!obj)
        return null;
    var single = (obj.single === null || obj.single === undefined) ? null : Number(obj.single);
    var daily = (obj.daily === null || obj.daily === undefined) ? null : Number(obj.daily);
    if (single != null && !(single >= 0))
        single = null;
    if (daily != null && !(daily >= 0))
        daily = null;
    var keepSingle = !!obj.keepSingle;
    var keepDaily = !!obj.keepDaily;
    if (single == null && daily == null && !keepSingle && !keepDaily)
        return null;
    return { single: single, daily: daily, keepSingle: keepSingle, keepDaily: keepDaily };
}
// 模型槽位抽取：本地同义词没命中时，让模型判断是「追加申购 / 指定赎回 / 全部赎回」并抽产品与金额
async function guideHoldingAIIntent(text) {
    var loadId = (typeof guideTypingBubble === 'function') ? guideTypingBubble() : null;
    var obj = null;
    try {
        obj = await guideLLMJson('你是银行 App 的意图解析器。用户在「持仓管理」页操作，可执行的动作只有三种：' +
            'sub=追加申购、redeem=赎回指定产品、redeem_all=赎回全部持仓。' +
            '请从用户这句话判断动作，并抽取产品名称与金额（中文数字转阿拉伯数字，例如「五千」=5000）。' +
            '只输出 JSON：{"action":"sub|redeem|redeem_all|null","product":"产品名或空","amount":数字或null}。' +
            '判断不出来时 action 返回 null。不要输出其它内容。', text);
    }
    catch (e) {
        obj = null;
    }
    var el = loadId ? document.getElementById(loadId) : null;
    if (el)
        el.remove();
    if (!obj || !obj.action)
        return null;
    return {
        action: obj.action,
        product: obj.product ? String(obj.product).trim() : '',
        amount: (obj.amount === null || obj.amount === undefined) ? 0 : Number(obj.amount)
    };
}
async function guideSubAIFlag(text) {
    var got = await guideAISlots(text, '你是银行 App 的选项解析器。系统在问「是否开启自动续费」，用户可能回答是/否/开启/关闭/算了。' +
        '只输出 JSON：{"autoRenew": true|false|null}。同意→true，不同意→false，判断不出→null。', function (o) {
        if (!o || o.autoRenew === null || o.autoRenew === undefined)
            return null;
        return { autoRenew: o.autoRenew === true };
    });
    return got ? got.autoRenew : null;
}
// 一句话里同时抽服务与周期（本地失败时交给模型）
// 一句话里同时抽服务与周期（本地失败时交给模型）
async function guideSubAIExtract(text) {
    return guideAISlots(text, '你是银行 App 的订阅解析器。可订阅服务只有：某易云 VIP、某讯 VIP、某度网盘 VIP。' +
        '扣费周期只有：按月扣费(/月)、按季扣费(/季)、按年扣费(/年)。' +
        '只输出 JSON：{"service":"服务名或空","cycle":"/月|/季|/年或空"}。', function (o) {
        if (!o)
            return null;
        var svc = o.service ? String(o.service) : '';
        var preset = SUB_PRESETS.filter(function (p) {
            var key = p.name.replace(' VIP', '');
            return svc && (svc.indexOf(key) !== -1 || key.indexOf(svc.replace(/VIP/i, '').trim()) !== -1);
        })[0] || null;
        var cycle = ['/月', '/季', '/年'].indexOf(o.cycle) !== -1 ? o.cycle : null;
        if (!preset && !cycle)
            return null;
        return { preset: preset, cycle: cycle };
    });
}
