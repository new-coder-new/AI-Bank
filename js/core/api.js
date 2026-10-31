"use strict";
// ==========================================================================
//  API 数据层（TypeScript 源码）
//  目标：把前端从"读写死 mockData"升级为"读写后端模拟银行核心系统"。
//  设计：页面启动时异步从后端拉取快照，静默注入 mockData；写操作走服务端权威。
//  说明：本文件编译产物为 js/core/api.js（经典脚本，无 import/export）。
// ==========================================================================
var API = {
    base: '', // 同源部署时留空；本地联调改成本机地址
    enabled: false, // 后端是否可达
    live: false, // 是否已成功注入后端真实数据
    token: '', // 同源会话令牌（写接口必须携带）
    verifyToken: '', // 资金验证令牌（按金额档位校验）
    verifyExp: 0, // 验证令牌过期时间戳
    pending: [] // 等待后端就绪期间积压的写操作
};
function bankAuthHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (API.token)
        h['X-Bank-Session'] = API.token;
    if (API.verifyToken && API.verifyExp > Date.now())
        h['X-Bank-Verify'] = API.verifyToken;
    return h;
}
/** 安全验证通过后向服务端换取一次性验证令牌（供高金额资金接口使用） */
function requestFundVerify() {
    return apiRequest('POST', '/api/verify/issue', { pin: '123456' })
        .then(function (res) {
        if (res && res.ok && res.verifyToken) {
            API.verifyToken = res.verifyToken;
            API.verifyExp = Date.now() + (Number(res.expiresIn) || 300) * 1000;
        }
        return res;
    })
        .catch(function () { return null; });
}
// 同源部署默认留空；file:// 或本地调试时连本机后端
(function () {
    try {
        if (location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            API.base = 'http://127.0.0.1:8787';
        }
    }
    catch (e) {
        API.base = '';
    }
})();
function apiRequest(method, path, body) {
    return bankFetch(API.base + path, {
        method: method,
        headers: bankAuthHeaders(),
        body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
        return r.json();
    });
}
/** 后端可达性探测 + 会话令牌 + 快照注入 */
function apiInit() {
    apiRequest('GET', '/api/session')
        .then(function (res) {
        if (res && res.token)
            API.token = res.token;
    })
        .catch(function () { })
        .then(function () {
        return apiRequest('GET', '/api/health');
    })
        .then(function (res) {
        if (res && res.ok) {
            API.enabled = true;
            return apiRequest('GET', '/api/snapshot').then(function (snap) {
                if (snap && snap.userProfile) {
                    apiInjectSnapshot(snap);
                    API.live = true;
                    console.log('[api] 已连接后端模拟银行核心，数据实时同步');
                    if (typeof apiRefreshUI === 'function')
                        apiRefreshUI();
                }
            });
        }
    })
        .catch(function () {
        console.warn('[api] 后端不可达，降级为本地 mock 数据（离线模式）');
    });
}
/** 把后端快照注入 mockData：资金类字段以服务端为准，localStorage 只作缓存 */
function apiInjectSnapshot(snap) {
    if (!snap)
        return;
    var localLoaded = typeof window !== 'undefined' && window.__LOCAL_STATE_LOADED === true;
    if (snap.userProfile) {
        if (localLoaded && mockData.userProfile) {
            var AUTHORITATIVE = [
                'debitCard', 'creditCard', 'creditCards', 'holdings', 'pendingRedemptions',
                'flowerOrders', 'cardApplications', 'manualReviews', 'transferHistory',
                'recentTxns', 'txnLimit', 'budgets', 'flowerHolds', 'flowerHold'
            ];
            AUTHORITATIVE.forEach(function (k) {
                if (snap.userProfile[k] !== undefined)
                    mockData.userProfile[k] = snap.userProfile[k];
            });
            Object.keys(snap.userProfile).forEach(function (k) {
                if (AUTHORITATIVE.indexOf(k) === -1 &&
                    (mockData.userProfile[k] === undefined || mockData.userProfile[k] === null)) {
                    mockData.userProfile[k] = snap.userProfile[k];
                }
            });
        }
        else {
            mockData.userProfile = snap.userProfile;
        }
    }
    // 信用卡：按 id 合并，补齐服务端新增卡，纠正历史 8888 尾号
    (function mergeCreditCards() {
        var snapCards = (snap.userProfile && snap.userProfile.creditCards) || null;
        var u = mockData.userProfile || (mockData.userProfile = {});
        if (!Array.isArray(snapCards) || !snapCards.length)
            return;
        if (!Array.isArray(u.creditCards)) {
            u.creditCards = snapCards.slice();
            return;
        }
        snapCards.forEach(function (sc) {
            var hit = u.creditCards.filter(function (lc) { return lc && sc && lc.id === sc.id; })[0];
            if (!hit) {
                u.creditCards.push(sc);
                return;
            }
            if (String(hit.tail) === '8888' && sc.tail && String(sc.tail) !== '8888') {
                hit.tail = sc.tail;
                if (sc.cardType)
                    hit.cardType = sc.cardType;
            }
        });
    })();
    if (snap.bills) {
        if (!localLoaded || !window.__LOCAL_BILLS_LOADED)
            mockData.bills = snap.bills;
    }
    if (snap.products)
        mockData.products = snap.products;
    if (snap.subscriptions) {
        if (!localLoaded || !Array.isArray(mockData.subscriptions) || mockData.subscriptions.length === 0) {
            mockData.subscriptions = snap.subscriptions;
        }
        else {
            var srvSubs = snap.subscriptions;
            srvSubs.forEach(function (ss) {
                var hit = (mockData.subscriptions || []).filter(function (ls) {
                    return ls && (String(ls.id) === String(ss.id) || String(ls.name || '') === String(ss.name || ''));
                })[0];
                if (!hit) {
                    mockData.subscriptions.push(ss);
                    return;
                }
                ['price', 'cycle', 'autoRenew', 'chargeDate', 'lastRenewAt', 'lastRenewAmount', 'lastRenewError'].forEach(function (k) {
                    if (ss[k] !== undefined)
                        hit[k] = ss[k];
                });
            });
            mockData.subscriptions = (mockData.subscriptions || []).filter(function (ls) {
                return !ls || srvSubs.some(function (ss) {
                    return String(ss.id) === String(ls.id) || String(ss.name || '') === String(ls.name || '');
                });
            });
        }
    }
    if (Array.isArray(snap.contacts)) {
        if (!Array.isArray(mockData.contacts))
            mockData.contacts = [];
        var localHad = window.__LOCAL_CONTACTS_LOADED === true && mockData.contacts.length > 0;
        if (!localHad) {
            mockData.contacts = snap.contacts.slice();
            window.__LOCAL_CONTACTS_LOADED = mockData.contacts.length > 0;
        }
        else {
            snap.contacts.forEach(function (sc) {
                if (!sc || !sc.name)
                    return;
                var hit = mockData.contacts.filter(function (lc) {
                    return lc && (lc.name === sc.name ||
                        (sc.account && lc.account && String(lc.account).replace(/\s+/g, '') === String(sc.account).replace(/\s+/g, '')));
                })[0];
                if (!hit) {
                    mockData.contacts.push(Object.assign({}, sc));
                    return;
                }
                if (!hit.phoneFull && sc.phoneFull)
                    hit.phoneFull = sc.phoneFull;
                if (!hit.phone && sc.phone)
                    hit.phone = sc.phone;
                if (!hit.relation && sc.relation)
                    hit.relation = sc.relation;
                if (!hit.birthday && sc.birthday)
                    hit.birthday = sc.birthday;
            });
        }
    }
    if (snap.clientState && typeof apiMergeClientState === 'function') {
        try {
            apiMergeClientState(snap.clientState);
        }
        catch (e) { }
    }
    if (snap.card) {
        if (!localLoaded || !mockData.card)
            mockData.card = snap.card;
        else {
            Object.keys(snap.card).forEach(function (k) {
                if (mockData.card[k] === undefined || mockData.card[k] === null)
                    mockData.card[k] = snap.card[k];
            });
        }
    }
    // 后端计算好的健康评分/生命周期/洞察缓存到全局
    window.__API_HEALTH = snap.health || null;
    window.__API_LIFESTAGE = snap.lifeStage || null;
    window.__API_INSIGHTS = snap.insights || [];
    window.__API_SUMMARY = snap.summary || null;
    window.__API_BUDGET = snap.budget || null;
    window.__API_MONTHLY_HISTORY = snap.monthlyHistory || null;
    window.__API_FUNDS = snap.funds || null;
    window.__API_ASSETS = snap.assets || null;
    if (typeof runDueScheduledTransfers === 'function') {
        setTimeout(function () { runDueScheduledTransfers(); }, 300);
    }
}
/** 写操作：调用方已完成本地更新，这里把操作同步给后端 */
function apiPost(path, body) {
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    return apiRequest('POST', path, body);
}
/** 转账预判：服务端算风险分与档位（不动账） */
function apiTransferPrepare(payee, amount, channel) {
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    return apiRequest('POST', '/api/transfer/prepare', { payee: payee, amount: amount, channel: channel || '智能转账' });
}
/** 权威转账：以服务端结果为准 */
function apiTransferAuthoritative(payee, amount, opts) {
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    const o = opts || {};
    return apiRequest('POST', '/api/transfer', {
        payee: payee,
        amount: amount,
        channel: o.channel || '智能转账',
        phone: o.phone || '',
        idempotencyKey: o.idempotencyKey || ''
    });
}
function apiTransfer(payee, amount) {
    return apiPost('/api/transfer', { payee: payee, amount: amount });
}
function apiTransferReverse(payee, amount) {
    return apiPost('/api/transfer/reverse', { payee: payee, amount: amount });
}
function apiWealthBuy(product, amount, opts) {
    const o = opts || {};
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    return apiRequest('POST', '/api/wealth/buy', {
        product: product,
        amount: amount,
        idempotencyKey: o.idempotencyKey || ('B' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))
    });
}
function apiWealthRedeem(product, amount, opts) {
    const o = opts || {};
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    return apiRequest('POST', '/api/wealth/redeem', {
        product: product,
        amount: amount,
        idempotencyKey: o.idempotencyKey || ('R' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))
    });
}
function apiFlowerOrder(payload) {
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    return apiRequest('POST', '/api/flower/order', payload || {});
}
function apiFlowerCancel(id) {
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    return apiRequest('POST', '/api/flower/cancel', { id: id });
}
function apiSubscriptionAdd(payload) {
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    return apiRequest('POST', '/api/subscription/add', payload || {});
}
function apiCardApply(cardType, limit, purpose) {
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    return apiRequest('POST', '/api/card/apply', { cardType: cardType, limit: limit, purpose: purpose });
}
function apiCardLost(tail) {
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    return apiRequest('POST', '/api/card/lost', { tail: tail });
}
function apiReviewApprove(id) {
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    return apiRequest('POST', '/api/review/approve', { id: id });
}
function apiReviewReject(id, reason) {
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    return apiRequest('POST', '/api/review/reject', { id: id, reason: reason || '' });
}
function apiBudgetSet(amount, period) {
    return apiPost('/api/budget/set', { amount: amount, period: period || 'month' });
}
function apiSubscriptionCancel(id) {
    return apiPost('/api/subscription/cancel', { id: id });
}
function apiCardAdjust(target, reason, direction) {
    return apiPost('/api/card/adjust', { target: target, reason: reason, direction: direction });
}
function apiCardLimitApprove(target, reason, direction) {
    return apiPost('/api/card/limit/approve', { target: target, reason: reason, direction: direction });
}
// ------------------------------ 前端业务流水持久化 ------------------------------
function apiCollectClientState() {
    var u = (typeof mockData !== 'undefined' && mockData.userProfile) ? mockData.userProfile : {};
    return {
        flowerOrders: Array.isArray(u.flowerOrders) ? u.flowerOrders : [],
        scheduledTransfers: Array.isArray(u.scheduledTransfers) ? u.scheduledTransfers : [],
        budgets: (u.budgets && typeof u.budgets === 'object' && !Array.isArray(u.budgets)) ? u.budgets : {}
    };
}
var __apiClientStateTimer = null;
function apiPersistClientState() {
    if (typeof API === 'undefined' || !API.enabled)
        return;
    if (__apiClientStateTimer)
        clearTimeout(__apiClientStateTimer);
    __apiClientStateTimer = setTimeout(function () {
        __apiClientStateTimer = null;
        try {
            apiRequest('POST', '/api/clientstate', apiCollectClientState()).catch(function () { });
        }
        catch (e) { }
    }, 500);
}
/** 合并服务端流水：本地优先，服务端补缺；定时转账以服务端执行状态为准 */
function apiMergeClientState(state) {
    if (!state)
        return;
    var u = (typeof mockData !== 'undefined' && mockData.userProfile) ? mockData.userProfile : null;
    if (!u)
        return;
    var unionById = function (local, remote) {
        var arr = Array.isArray(local) ? local.slice() : [];
        (Array.isArray(remote) ? remote : []).forEach(function (r) {
            if (!r)
                return;
            var key = r.id || (r.name || '') + '|' + (r.date || r.createdAt || '');
            var hit = arr.some(function (x) {
                return x && (x.id === r.id || ((x.name || '') + '|' + (x.date || x.createdAt || '')) === key);
            });
            if (!hit)
                arr.push(r);
        });
        return arr;
    };
    u.flowerOrders = unionById(u.flowerOrders, state.flowerOrders);
    u.scheduledTransfers = unionById(u.scheduledTransfers, state.scheduledTransfers);
    (Array.isArray(state.scheduledTransfers) ? state.scheduledTransfers : []).forEach(function (r) {
        if (!r)
            return;
        var local = (u.scheduledTransfers || []).filter(function (x) { return x && x.id === r.id; })[0];
        if (!local)
            return;
        if (r.status === '已完成' || r.status === '失败') {
            local.status = r.status;
            local.executedAt = r.executedAt || local.executedAt;
            local.failReason = r.failReason || local.failReason;
        }
        if (r.lastExecutedAt)
            local.lastExecutedAt = r.lastExecutedAt;
    });
    if (state.budgets && typeof state.budgets === 'object' && Object.keys(state.budgets).length) {
        u.budgets = Object.assign({}, (u.budgets && typeof u.budgets === 'object') ? u.budgets : {}, state.budgets);
    }
}
/** 联系人整表同步 */
function apiSaveContacts(list) {
    var arr = Array.isArray(list) ? list : (mockData.contacts || []);
    if (API.enabled) {
        apiRequest('POST', '/api/contacts/save', { contacts: arr }).catch(function () { });
    }
}
/** 删除单个联系人（按姓名） */
function apiDeleteContactByName(name) {
    if (!name)
        return;
    if (API.enabled) {
        apiRequest('POST', '/api/contact/delete', { name: name }).catch(function () { });
    }
}
function apiContactAdd(name, account, bank, phone) {
    return apiPost('/api/contact/add', { name: name, account: account, bank: bank, phone: phone });
}
/** 刷新界面（数据注入后触发重渲染） */
function apiRefreshUI() {
    try {
        if (typeof renderUserInfoPage === 'function' && currentModule === 'userinfo') {
            renderUserInfoPage();
        }
    }
    catch (e) { }
}
/** 触发服务端订阅续费并合并结果（余额、下次扣费日） */
function apiSubscriptionRun() {
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    return apiRequest('GET', '/api/subscription/run').then(function (res) {
        if (!res || !res.renewed || !res.renewed.length)
            return res || { ok: true };
        return apiRequest('GET', '/api/snapshot').then(function (snap) {
            if (snap && Array.isArray(snap.subscriptions)) {
                var byId = {};
                snap.subscriptions.forEach(function (s) { if (s && s.id != null)
                    byId[s.id] = s; });
                (mockData.subscriptions || []).forEach(function (s) {
                    var srv = s && byId[s.id];
                    if (!srv)
                        return;
                    if (srv.chargeDate)
                        s.chargeDate = srv.chargeDate;
                    if (srv.lastRenewAt)
                        s.lastRenewAt = srv.lastRenewAt;
                    if (srv.lastRenewAmount)
                        s.lastRenewAmount = srv.lastRenewAmount;
                    if (srv.lastRenewError)
                        s.lastRenewError = srv.lastRenewError;
                    s.chargeDate = srv.chargeDate || s.chargeDate;
                });
            }
            if (snap && snap.userProfile && snap.userProfile.debitCard && mockData.userProfile) {
                mockData.userProfile.debitCard.available = Number(snap.userProfile.debitCard.available);
                mockData.userProfile.debitCard.balance = Number(snap.userProfile.debitCard.balance);
            }
            if (typeof saveUserData === 'function')
                saveUserData();
            if (typeof apiRefreshUI === 'function')
                apiRefreshUI();
            return res;
        });
    }).catch(function () { return { ok: false }; });
}
/** 触发服务端执行到期定时转账，并把执行结果合并回本地 */
function apiScheduledRun() {
    if (!API.enabled)
        return Promise.resolve({ ok: false, offline: true });
    return apiRequest('GET', '/api/scheduled/run').then(function (res) {
        if (res && res.ok === false)
            return res;
        return apiRequest('GET', '/api/snapshot').then(function (snap) {
            if (snap && snap.clientState) {
                try {
                    apiMergeClientState(snap.clientState);
                }
                catch (e) { }
            }
            if (snap && snap.userProfile && snap.userProfile.debitCard && mockData.userProfile) {
                if (res && res.executed > 0) {
                    mockData.userProfile.debitCard.available = Number(snap.userProfile.debitCard.available);
                    mockData.userProfile.debitCard.balance = Number(snap.userProfile.debitCard.balance);
                    if (typeof saveUserData === 'function')
                        saveUserData();
                    if (typeof apiRefreshUI === 'function')
                        apiRefreshUI();
                }
            }
            return res || { ok: true };
        });
    }).catch(function () { return { ok: false }; });
}
// 订阅续费：启动触发一次，之后每分钟巡检（服务端为准）
setTimeout(function () { if (typeof apiSubscriptionRun === 'function')
    apiSubscriptionRun(); }, 600);
setInterval(function () { if (typeof apiSubscriptionRun === 'function')
    apiSubscriptionRun(); }, 60000);
// 页面启动时自动初始化（放在 config.js 之后加载，此时 mockData 已就绪）
apiInit();
