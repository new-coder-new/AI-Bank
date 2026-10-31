// ==========================================================================
//  AI Banking Agent · 冻结资金与联系人服务层（TypeScript 源码）
//  编译产物：js/agent/agentsvc.js（经典脚本，无 import/export）
// ==========================================================================
// ------------------------------ 0. 数据访问 ------------------------------
function frozenDetailData() {
    var d = (mockData.userProfile && mockData.userProfile.debitCard) || {};
    var items = d.frozenItems || [];
    var sum = 0;
    for (var i = 0; i < items.length; i++)
        sum += Number(items[i].amount) || 0;
    return {
        balance: Number(d.balance) || 0,
        available: Number(d.available) || 0,
        frozen: d.frozen != null ? Number(d.frozen) : sum,
        items: items
    };
}
function contactListData() {
    return (mockData.contacts || []).slice();
}
// ------------------------------ 1. 冻结明细卡片 ------------------------------
function frozenDetailCard() {
    var f = frozenDetailData();
    var rows = '';
    if (!f.items.length) {
        rows = '<p style="color:#16a34a;font-weight:600;"> 当前账户没有任何冻结资金。</p>';
    }
    else {
        for (var i = 0; i < f.items.length; i++) {
            var it = f.items[i];
            rows += '<div class="data-card" style="margin-top:8px;background:#fffbeb;border-color:#fde68a;">' +
                '<div class="data-card-title"> ' + (it.type || '冻结资金') + ' · ' + (it.id || '') + '</div>' +
                '<div class="data-row"><span class="data-label">冻结原因</span><span class="data-value">' + (it.reason || '—') + '</span></div>' +
                '<div class="data-row"><span class="data-label">冻结金额</span><span class="data-value" style="color:#f59e0b;font-weight:700;">¥' + agentFmt(it.amount) + '</span></div>' +
                '<div class="data-row"><span class="data-label">冻结时间</span><span class="data-value">' + (it.freezeDate || '—') + '</span></div>' +
                '<div class="data-row"><span class="data-label">预计解冻日</span><span class="data-value" style="color:#09407F;font-weight:600;">' + (it.releaseDate || '—') + '</span></div>' +
                '<div class="data-row"><span class="data-label">状态</span><span class="data-value">' + (it.status || '冻结中') + '</span></div>' +
                '</div>';
        }
    }
    return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · 冻结金额明细</div>' +
        '<div class="msg-bubble agent-bubble">' +
        '<div class="ctx-head"> 账户冻结资金明细</div>' +
        '<div class="data-card">' +
        '<div class="data-row"><span class="data-label">账面余额</span><span class="data-value">¥' + agentFmt(f.balance) + '</span></div>' +
        '<div class="data-row"><span class="data-label">冻结合计</span><span class="data-value" style="color:#f59e0b;font-weight:700;">¥' + agentFmt(f.frozen) + '</span></div>' +
        '<div class="data-row"><span class="data-label">当前可用余额</span><span class="data-value" style="color:#22c55e;font-weight:700;">¥' + agentFmt(f.available) + '</span></div>' +
        '</div>' +
        rows +
        '<p style="margin-top:10px;font-size:12px;color:#999;"> 数据来自银行核心系统实时查询。预授权类冻结会在商户结算后自动解除，在途资金在到账确认后解除。</p>' +
        '</div></div></div>';
}
// ------------------------------ 2. 定向回答卡片 ------------------------------
// mode: 'when' 什么时候可用 | 'after' 解冻后可用余额 | 'why' 为什么被冻结
function frozenAnswerCard(mode) {
    var f = frozenDetailData();
    var items = f.items.slice().sort(function (a, b) {
        return String(a.releaseDate || '').localeCompare(String(b.releaseDate || ''));
    });
    if (!items.length) {
        return agentBubbleCard('冻结资金', ' 当前账户没有任何冻结资金，全部余额均可使用（可用余额 ¥' + agentFmt(f.available) + '）。');
    }
    var head = '', body = '';
    if (mode === 'when') {
        head = ' 解冻时间安排';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var days = Math.max(0, Math.ceil((Number(new Date(String(it.releaseDate).replace(/-/g, '/'))) - Number(new Date())) / 86400000));
            body += '<div class="data-row"><span class="data-label">' + (it.reason || it.type) +
                '（¥' + agentFmtInt(it.amount) + '）</span><span class="data-value" style="color:#09407F;font-weight:600;">' +
                it.releaseDate + (days === 0 ? '（今天）' : '（还有 ' + days + ' 天）') + '</span></div>';
        }
        body += '<div class="data-row"><span class="data-label">最早可用</span><span class="data-value" style="font-weight:700;">' +
            items[0].releaseDate + '，届时 ¥' + agentFmtInt(items[0].amount) + ' 自动恢复为可用余额</span></div>';
    }
    else if (mode === 'after') {
        var after = f.available + f.frozen;
        head = ' 解冻后的可用余额';
        body = '<div class="data-card" style="background:#f0fdf4;border-color:#bbf7d0;">' +
            '<div class="data-row"><span class="data-label">计算公式</span><span class="data-value" style="font-family:monospace;font-weight:700;">' +
            agentFmt(f.available) + ' + ' + agentFmt(f.frozen) + ' = ' + agentFmt(after) + ' 元</span></div>' +
            '<div class="data-row"><span class="data-label">当前可用余额</span><span class="data-value">¥' + agentFmt(f.available) + '</span></div>' +
            '<div class="data-row"><span class="data-label">冻结金额（将解冻）</span><span class="data-value" style="color:#f59e0b;">¥' + agentFmt(f.frozen) + '</span></div>' +
            '<div class="data-row"><span class="data-label">解冻后可用余额</span><span class="data-value" style="color:#22c55e;font-weight:700;font-size:16px;">¥' + agentFmt(after) + '</span></div>' +
            '</div>' +
            '<p style="margin-top:8px;font-size:12px;color:#999;">️ 账面余额不变，解冻只是把冻结部分恢复为可用；各笔资金按各自的解冻日分批到账可用。</p>';
    }
    else {
        head = ' 冻结原因说明';
        for (var j = 0; j < items.length; j++) {
            var w = items[j];
            body += '<div class="data-card" style="margin-top:8px;">' +
                '<div class="data-row"><span class="data-label">冻结金额</span><span class="data-value" style="color:#f59e0b;font-weight:700;">¥' + agentFmt(w.amount) + '</span></div>' +
                '<div class="data-row"><span class="data-label">类型</span><span class="data-value">' + (w.type || '—') + '</span></div>' +
                '<div class="data-row"><span class="data-label">原因</span><span class="data-value">' + (w.reason || '—') + '</span></div>' +
                '<div class="data-row"><span class="data-label">冻结时间</span><span class="data-value">' + (w.freezeDate || '—') + '</span></div>' +
                '<div class="data-row"><span class="data-label">预计解冻</span><span class="data-value" style="color:#09407F;font-weight:600;">' + (w.releaseDate || '—') + '</span></div>' +
                '</div>';
        }
    }
    return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · 冻结资金</div>' +
        '<div class="msg-bubble agent-bubble"><div class="ctx-head">' + head + '</div>' + body + '</div></div></div>';
}
function agentBubbleCard(title, text) {
    return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · ' + title + '</div>' +
        '<div class="msg-bubble agent-bubble">' + text + '</div></div></div>';
}
// ------------------------------ 3. 冻结前置处理器 ------------------------------
function agentFrozenPrehandler(text) {
    var t = String(text || '');
    if (!/(冻结|解冻|这笔钱)/.test(t))
        return false;
    if (/(挂失|卡片|信用卡|银行卡.*(冻结|解冻)|(冻结|解冻).*(卡|账户功能))/.test(t) && !/(冻结金额|冻结资金|这笔钱)/.test(t))
        return false;
    var q = {
        detail: /(冻结金额|冻结资金).*(明细|详情|列表|有哪些|查询|多少)|明细.*冻结|查询.*冻结/,
        when: /(什么时候|何时|哪天|哪一天|几号).*(可以用|解冻|到账|恢复)|解冻.*(时间|日期)/,
        after: /解冻.*(可用余额|余额|变成多少|多少)|可用余额.*解冻/,
        why: /为什么.*(冻结|被冻)|什么原因.*冻结|冻结.*(原因|为什么)/
    };
    var html = null;
    if (q.after.test(t))
        html = frozenAnswerCard('after');
    else if (q.when.test(t))
        html = frozenAnswerCard('when');
    else if (q.why.test(t))
        html = frozenAnswerCard('why');
    else if (q.detail.test(t))
        html = frozenDetailCard();
    else if (/冻结|解冻/.test(t) && /(这笔钱|金额|资金|余额)/.test(t))
        html = frozenDetailCard();
    if (!html)
        return false;
    appendMessage(html);
    scrollToBottom();
    addToConversation('assistant', '冻结资金查询已处理', null);
    return true;
}
// ------------------------------ 4. 联系人卡片 ------------------------------
function contactListCard() {
    var list = contactListData();
    var rows = '';
    for (var i = 0; i < list.length; i++) {
        var c = list[i];
        rows += '<div class="data-row"><span class="data-label"> ' + c.name +
            (c.bank ? '（' + c.bank + '）' : '') + '</span><span class="data-value">' + (c.account || c.phone || '—') + '</span></div>';
    }
    return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · 联系人管理</div>' +
        '<div class="msg-bubble agent-bubble">' +
        '<div class="ctx-head"> 转账联系人（共 ' + list.length + ' 位）</div>' +
        '<div class="data-card">' + (rows || '<p style="color:#999;">暂无联系人</p>') + '</div>' +
        '<p style="margin-top:10px;font-size:12px;color:#999;"> 你可以直接对我说「新增联系人，姓名叫 X，银行卡号 N，开户银行是 Y」，我会帮你添加。</p>' +
        '</div></div></div>';
}
/** 解析新增联系人话术 */
function contactParseAdd(text) {
    var t = String(text || '');
    var nameM = t.match(/姓名(?:叫|为|是)?\s*([\u4e00-\u9fa5·]{2,4})/) || t.match(/(?:联系人|叫|添加)\s*([\u4e00-\u9fa5·]{2,4})/);
    var accM = t.match(/(\d{10,25})/);
    var bankM = t.match(/(?:开户银行|开户行|银行)(?:是|为|叫)?\s*([\u4e00-\u9fa5]{2,12}银行|工商银行|农业银行|中国银行|建设银行|交通银行|招商银行|邮储银行)/);
    return { name: nameM ? nameM[1] : null, account: accM ? accM[1] : null, bank: bankM ? bankM[1] : null };
}
function contactAddForm(preset) {
    var p = preset || {};
    var html = '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · 新增联系人</div>' +
        '<div class="msg-bubble agent-bubble">' +
        '<p style="margin-bottom:8px;font-weight:600;"> 新增转账联系人</p>' +
        '<div class="transfer-form">' +
        '<div class="form-group"><label class="form-label">姓名</label>' +
        '<input type="text" class="form-input" id="ctName" value="' + (p.name || '') + '" placeholder="请输入姓名"></div>' +
        '<div class="form-group"><label class="form-label">银行卡号</label>' +
        '<input type="text" class="form-input" id="ctAccount" value="' + (p.account || '') + '" placeholder="请输入银行卡号"></div>' +
        '<div class="form-group"><label class="form-label">开户银行</label>' +
        '<input type="text" class="form-input" id="ctBank" value="' + (p.bank || '') + '" placeholder="例如：中国工商银行"></div>' +
        '<div class="form-actions">' +
        '<button class="btn btn-primary" onclick="contactAddSubmit()">确认添加</button>' +
        '<button class="btn btn-secondary" onclick="agentReply(\'已取消添加联系人。\')">取消</button>' +
        '</div></div>' +
        '<p style="margin-top:10px;font-size:12px;color:#999;"> 添加后会同步到银行核心系统，可直接用于转账。</p>' +
        '</div></div></div>';
    appendMessage(html);
    scrollToBottom();
}
/** 确认添加（表单提交） */
function contactAddSubmit() {
    var name = (document.getElementById('ctName')?.value || '').trim();
    var account = (document.getElementById('ctAccount')?.value || '').replace(/\s+/g, '');
    var bank = (document.getElementById('ctBank')?.value || '').trim();
    contactAddDo(name, account, bank);
}
/** 执行添加：本地乐观更新 + 后端同步（失败回滚） */
function contactAddDo(name, account, bank) {
    if (!name || !account) {
        agentReply('️ 姓名与银行卡号不能为空，请补充后重试。');
        return;
    }
    if (!/^\d{10,25}$/.test(account)) {
        agentReply('️ 银行卡号格式不正确（应为 10-25 位数字），请检查后重试。');
        return;
    }
    var localDup = contactListData().some(function (c) { return String(c.account || '').replace(/\s+/g, '') === account; });
    if (localDup) {
        agentReply('️ 卡号 ' + account + ' 已存在于联系人列表中，请勿重复添加。');
        return;
    }
    var item = { name: name, phone: '', account: account, bank: bank || '未提供开户行' };
    mockData.contacts = mockData.contacts || [];
    mockData.contacts.push(item);
    saveUserData();
    var okHtml = '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
        '<div class="msg-name">智能金融助手 · 新增联系人</div>' +
        '<div class="msg-bubble agent-bubble">' +
        '<p style="font-weight:600;color:#16a34a;"> 联系人添加成功</p>' +
        '<div class="data-card">' +
        '<div class="data-row"><span class="data-label">姓名</span><span class="data-value">' + name + '</span></div>' +
        '<div class="data-row"><span class="data-label">银行卡号</span><span class="data-value">' + account + '</span></div>' +
        '<div class="data-row"><span class="data-label">开户银行</span><span class="data-value">' + (bank || '未提供开户行') + '</span></div>' +
        '<div class="data-row"><span class="data-label">当前联系人总数</span><span class="data-value">' + contactListData().length + ' 位</span></div>' +
        '</div>' +
        '<p style="margin-top:8px;font-size:12px;color:#999;"> 现在可以直接对 TA 转账。</p>' +
        '<p class="guide-tip">例如：给 ' + name + ' 转账 500 元</p>' +
        '</div></div></div>';
    appendMessage(okHtml);
    scrollToBottom();
    addToConversation('assistant', '已添加联系人 ' + name, null);
    if (typeof apiContactAdd === 'function') {
        apiContactAdd(name, account, bank || '').then(function (res) {
            if (res && res.ok === false && !res.offline && res.error) {
                var idx = (mockData.contacts || []).indexOf(item);
                if (idx > -1)
                    mockData.contacts.splice(idx, 1);
                saveUserData();
                agentReply(' 银行核心系统校验未通过：' + res.error + '（本地记录已回滚）');
            }
        });
    }
}
// ------------------------------ 5. 联系人前置处理器 ------------------------------
function agentContactPrehandler(text) {
    var t = String(text || '');
    if (/(查询|查看|列出|看看|有哪些|我的|显示).*(联系人|通讯录|收款人列表)|联系人(列表|信息|记录)/.test(t) && !/(新增|添加|删除)/.test(t)) {
        appendMessage(contactListCard());
        scrollToBottom();
        addToConversation('assistant', '查询联系人列表', null);
        return true;
    }
    if (/(新增|添加|加一个|保存).*(联系人|收款人|好友)|(联系人|收款人).*?(新增|添加)/.test(t)) {
        var p = contactParseAdd(t);
        if (p.name && p.account) {
            setTimeout(function () { contactAddDo(p.name, p.account, p.bank || undefined); }, 0);
        }
        else {
            contactAddForm(p);
        }
        addToConversation('assistant', '新增联系人请求已处理', null);
        return true;
    }
    return false;
}
// ------------------------------ 6. 工具注册 ------------------------------
registerAgentTool('account.frozenDetail', {
    label: '查询冻结金额明细', risk: 'low',
    run: function () {
        var f = frozenDetailData();
        var parts = [];
        for (var i = 0; i < f.items.length; i++) {
            parts.push((f.items[i].type || '') + ' ¥' + agentFmtInt(f.items[i].amount) + '（' + (f.items[i].reason || '') + '，预计 ' + (f.items[i].releaseDate || '') + ' 解冻）');
        }
        return {
            summary: '账面余额 ¥' + agentFmt(f.balance) + '，冻结合计 ¥' + agentFmt(f.frozen) + '，可用 ¥' + agentFmt(f.available) +
                (parts.length ? '。明细：' + parts.join('；') : '。无冻结明细'),
            data: f
        };
    }
});
registerAgentTool('contact.list', {
    label: '查询转账联系人', risk: 'low',
    run: function () {
        var list = contactListData();
        var names = list.map(function (c) { return c.name + '（' + (c.bank || '') + ' ' + (c.account || '') + '）'; }).join('、');
        return { summary: '共有 ' + list.length + ' 位联系人：' + names, data: list };
    }
});
registerAgentTool('contact.add', {
    label: '新增转账联系人', risk: 'medium',
    run: function (args) {
        var name = args && (args.name || args.payee);
        var account = String((args && (args.account || args.cardNo)) || '').replace(/\s+/g, '');
        var bank = args && (args.bank || args.bankName);
        if (!name || !account)
            return { ok: false, summary: '请同时提供姓名与银行卡号，例如「新增联系人，姓名叫李明，银行卡号 6222021234567890123，开户银行是中国工商银行」' };
        if (!/^\d{10,25}$/.test(account))
            return { ok: false, summary: '银行卡号格式不正确（应为 10-25 位数字）' };
        var dup = contactListData().some(function (c) { return String(c.account || '').replace(/\s+/g, '') === account; });
        if (dup)
            return { ok: false, summary: '该卡号已存在于联系人列表中，请勿重复添加' };
        mockData.contacts = mockData.contacts || [];
        var item = { name: name, phone: '', account: account, bank: bank || '未提供开户行' };
        mockData.contacts.push(item);
        saveUserData();
        if (typeof apiContactAdd === 'function')
            apiContactAdd(name, account, bank || '');
        return { summary: '已添加联系人 ' + name + '（' + (bank || '未提供开户行') + ' ' + account + '），当前共 ' + mockData.contacts.length + ' 位', data: item };
    }
});
