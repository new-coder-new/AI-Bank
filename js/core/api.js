// ==========================================================================
//  API 数据层（Data Access Layer）
//  目标：把前端从"读写死 mockData"升级为"读写后端模拟银行核心系统"。
//  设计：页面启动时异步从后端拉取快照，静默注入 mockData；写操作乐观更新本地
//        后 POST 后端同步。后端不可用时自动降级为纯本地 mock（离线可演示）。
// ==========================================================================

const API = {
  base: '',            // 同源部署时留空；本地联调用 'http://127.0.0.1:8787'
  enabled: false,      // 后端是否可达
  live: false,         // 是否已成功注入后端真实数据
  token: '',           // 同源会话令牌（由 /api/session 下发，写接口必须携带）
  verifyToken: '',     // 资金验证令牌（安全验证通过后换取，服务端按金额档位校验）
  verifyExp: 0,        // 验证令牌过期时间戳
  pending: [],         // 等待后端就绪期间积压的写操作
};

function bankAuthHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (API.token) h['X-Bank-Session'] = API.token;
  // 资金验证令牌：安全验证（密码/短信/指纹）通过后短时有效，服务端按档位校验
  if (API.verifyToken && API.verifyExp > Date.now()) h['X-Bank-Verify'] = API.verifyToken;
  return h;
}

// 安全验证通过后向服务端换取一次性验证令牌（供高金额资金接口使用）
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

// 可配置：默认同源（部署后前后端同域），本地调试可改
(function () {
  try {
    // 若通过 file:// 打开或本地开发，尝试连本地后端
    if (location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      API.base = 'http://127.0.0.1:8787';
    }
  } catch (e) { API.base = ''; }
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

// 后端可达性探测 + 会话令牌 + 快照注入
function apiInit() {
  apiRequest('GET', '/api/session')
    .then(function (res) {
      if (res && res.token) API.token = res.token;
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
            // 数据注入后刷新界面
            if (typeof apiRefreshUI === 'function') apiRefreshUI();
          }
        });
      }
    })
    .catch(function () {
      console.warn('[api] 后端不可达，降级为本地 mock 数据（离线模式）');
    });
}

// 把后端快照注入 mockData。
// 本地已经持久化过业务数据时采用「local-first」：资金/持仓/卡片/订阅等以本地为准，
// 服务端只补齐本地没有的字段。这样订阅首扣、鲜花、定投等未同步后端的操作不会在刷新后回滚。
function apiInjectSnapshot(snap) {
  if (!snap) return;
  var localLoaded = typeof window !== 'undefined' && window.__LOCAL_STATE_LOADED === true;
  if (snap.userProfile) {
    if (localLoaded && mockData.userProfile) {
      Object.keys(snap.userProfile).forEach(function (k) {
        if (mockData.userProfile[k] === undefined || mockData.userProfile[k] === null) {
          mockData.userProfile[k] = snap.userProfile[k];
        }
      });
    } else {
      mockData.userProfile = snap.userProfile;
    }
  }
  // 信用卡：本地已有的按 id 保留，服务端（种子）新增的补进来，
  // 避免旧 localStorage 只有一张卡时把种子里新加的卡挡住；同时修正历史 8888 尾号
  (function mergeCreditCards() {
    var snapCards = (snap.userProfile && snap.userProfile.creditCards) || null;
    var u = mockData.userProfile || (mockData.userProfile = {});
    if (!Array.isArray(snapCards) || !snapCards.length) return;
    if (!Array.isArray(u.creditCards)) {
      u.creditCards = snapCards.slice();
      return;
    }
    snapCards.forEach(function (sc) {
      var hit = u.creditCards.filter(function (lc) { return lc && sc && lc.id === sc.id; })[0];
      if (!hit) { u.creditCards.push(sc); return; }
      // 主卡尾号历史值 8888 属于旧数据，按服务端规范尾号纠正
      if (String(hit.tail) === '8888' && sc.tail && String(sc.tail) !== '8888') {
        hit.tail = sc.tail;
        if (sc.cardType) hit.cardType = sc.cardType;
      }
    });
  })();
  if (snap.bills) {
    if (!localLoaded || !window.__LOCAL_BILLS_LOADED) mockData.bills = snap.bills;
  }
  if (snap.products) mockData.products = snap.products;
  if (snap.subscriptions) {
    if (!localLoaded || !window.__LOCAL_SUBS_LOADED ||
        !Array.isArray(mockData.subscriptions) || mockData.subscriptions.length === 0) {
      mockData.subscriptions = snap.subscriptions;
    }
  }
  if (Array.isArray(snap.contacts)) {
    if (!Array.isArray(mockData.contacts)) mockData.contacts = [];
    var localHad = window.__LOCAL_CONTACTS_LOADED === true && mockData.contacts.length > 0;
    if (!localHad) {
      // 本地没有存过联系人（首次访问 / 旧版本数据 / 清过缓存）→ 直接用服务端
      mockData.contacts = snap.contacts.slice();
      window.__LOCAL_CONTACTS_LOADED = mockData.contacts.length > 0;
    } else {
      // 本地已有：做并集，本地条目优先，服务端多出来的人补进来（不再整表覆盖）
      snap.contacts.forEach(function (sc) {
        if (!sc || !sc.name) return;
        var hit = mockData.contacts.filter(function (lc) {
          return lc && (lc.name === sc.name ||
            (sc.account && lc.account && String(lc.account).replace(/\s+/g, '') === String(sc.account).replace(/\s+/g, '')));
        })[0];
        if (!hit) { mockData.contacts.push(Object.assign({}, sc)); return; }
        if (!hit.phoneFull && sc.phoneFull) hit.phoneFull = sc.phoneFull;
        if (!hit.phone && sc.phone) hit.phone = sc.phone;
        if (!hit.relation && sc.relation) hit.relation = sc.relation;
        if (!hit.birthday && sc.birthday) hit.birthday = sc.birthday;
      });
    }
  }
  // 前端业务流水：鲜花订单 / 定时转账 / 预算（本地优先，服务端补缺）
  if (snap.clientState && typeof apiMergeClientState === 'function') {
    try { apiMergeClientState(snap.clientState); } catch (e) { }
  }
  if (snap.card) {
    if (!localLoaded || !mockData.card) mockData.card = snap.card;
    else {
      Object.keys(snap.card).forEach(function (k) {
        if (mockData.card[k] === undefined || mockData.card[k] === null) mockData.card[k] = snap.card[k];
      });
    }
  }

  // 把后端计算好的健康评分/生命周期/洞察缓存到全局，供增强模块消费
  window.__API_HEALTH = snap.health || null;
  window.__API_LIFESTAGE = snap.lifeStage || null;
  window.__API_INSIGHTS = snap.insights || [];
  window.__API_SUMMARY = snap.summary || null;
  window.__API_BUDGET = snap.budget || null;
  window.__API_MONTHLY_HISTORY = snap.monthlyHistory || null;
  window.__API_FUNDS = snap.funds || null;
  window.__API_ASSETS = snap.assets || null;

  // 快照就绪后补跑一次定时任务：页面启动时后端快照可能晚于本地任务引擎，
  // 这一步保证"到期自动执行"不会因为初始化顺序被跳过。
  if (typeof runDueScheduledTransfers === 'function') {
    setTimeout(function () { runDueScheduledTransfers(); }, 300);
  }
}

// 写操作：乐观本地更新已在调用方完成，这里只把操作同步给后端。
// 注意：不能用后端返回的 balance 回写本地。订阅/鲜花/定投等操作并不落后端，
// 回写会把本地已经扣掉的金额“退回”，造成余额与流水不一致。
function apiPost(path, body) {
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  return apiRequest('POST', path, body);
}

// 转账预判：服务端算风险分与档位，决定需要哪些验证（不动账）
function apiTransferPrepare(payee, amount, channel) {
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  return apiRequest('POST', '/api/transfer/prepare', { payee: payee, amount: amount, channel: channel || '智能转账' });
}
// 权威转账：以服务端结果为准（成功回写余额，失败/待复核原样返回）
function apiTransferAuthoritative(payee, amount, opts) {
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  const o = opts || {};
  return apiRequest('POST', '/api/transfer', {
    payee: payee,
    amount: amount,
    channel: o.channel || '智能转账',
    phone: o.phone || '',
    idempotencyKey: o.idempotencyKey || ''
  });
}

// 转账同步
function apiTransfer(payee, amount) {
  return apiPost('/api/transfer', { payee: payee, amount: amount });
}
// 转账撤销同步（后端把钱退回，避免刷新后回滚）
function apiTransferReverse(payee, amount) {
  return apiPost('/api/transfer/reverse', { payee: payee, amount: amount });
}
// 理财申购（服务端权威）：带幂等键，重复提交只执行一次
function apiWealthBuy(product, amount, opts) {
  const o = opts || {};
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  return apiRequest('POST', '/api/wealth/buy', {
    product: product,
    amount: amount,
    idempotencyKey: o.idempotencyKey || ('B' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))
  });
}
// 理财赎回（服务端权威）：T+1 到账由服务端 pendingRedemptions 决定
function apiWealthRedeem(product, amount, opts) {
  const o = opts || {};
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  return apiRequest('POST', '/api/wealth/redeem', {
    product: product,
    amount: amount,
    idempotencyKey: o.idempotencyKey || ('R' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))
  });
}
// 鲜花下单（服务端权威）
function apiFlowerOrder(payload) {
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  return apiRequest('POST', '/api/flower/order', payload || {});
}
// 取消鲜花订单（服务端原路退款）
function apiFlowerCancel(id) {
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  return apiRequest('POST', '/api/flower/cancel', { id: id });
}
// 订阅添加（服务端扣首期）
function apiSubscriptionAdd(payload) {
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  return apiRequest('POST', '/api/subscription/add', payload || {});
}

// 信用卡申请（服务端建档 + 进复核）
function apiCardApply(cardType, limit, purpose) {
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  return apiRequest('POST', '/api/card/apply', { cardType: cardType, limit: limit, purpose: purpose });
}
// 信用卡挂失（服务端冻结）
function apiCardLost(tail) {
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  return apiRequest('POST', '/api/card/lost', { tail: tail });
}
// 复核审批（服务端执行，需要验证令牌）
function apiReviewApprove(id) {
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  return apiRequest('POST', '/api/review/approve', { id: id });
}
// 复核驳回
function apiReviewReject(id, reason) {
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  return apiRequest('POST', '/api/review/reject', { id: id, reason: reason || '' });
}

// 预算设置同步
function apiBudgetSet(amount, period) {
  return apiPost('/api/budget/set', { amount: amount, period: period || 'month' });
}
// 专项预算同步
// 取消订阅同步
function apiSubscriptionCancel(id) {
  return apiPost('/api/subscription/cancel', { id: id });
}
// 信用卡调额申请同步
function apiCardAdjust(target, reason, direction) {
  return apiPost('/api/card/adjust', { target: target, reason: reason, direction: direction });
}
// 复核通过后同步生效额度
function apiCardLimitApprove(target, reason, direction) {
  return apiPost('/api/card/limit/approve', { target: target, reason: reason, direction: direction });
}
// 冻结金额明细（GET，只读）
// 联系人列表（GET，只读）
// 新增联系人同步（乐观本地更新由调用方完成）
// ------------------------------ 前端业务流水持久化 ------------------------------
// 鲜花订单、定时转账、预算目前存在 userProfile 里（localStorage），
// 这里统一上报服务端，换设备 / 清缓存后能恢复。

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
  if (typeof API === 'undefined' || !API.enabled) return;
  if (__apiClientStateTimer) clearTimeout(__apiClientStateTimer);
  __apiClientStateTimer = setTimeout(function () {
    __apiClientStateTimer = null;
    try { apiRequest('POST', '/api/clientstate', apiCollectClientState()).catch(function () { }); } catch (e) { }
  }, 500);
}

// 合并服务端流水：本地有就用本地，本地缺的补进来（按 id 去重）
function apiMergeClientState(state) {
  if (!state) return;
  var u = (typeof mockData !== 'undefined' && mockData.userProfile) ? mockData.userProfile : null;
  if (!u) return;
  var unionById = function (local, remote) {
    var arr = Array.isArray(local) ? local.slice() : [];
    (Array.isArray(remote) ? remote : []).forEach(function (r) {
      if (!r) return;
      var key = r.id || (r.name || '') + '|' + (r.date || r.createdAt || '');
      var hit = arr.some(function (x) {
        return x && (x.id === r.id || ((x.name || '') + '|' + (x.date || x.createdAt || '')) === key);
      });
      if (!hit) arr.push(r);
    });
    return arr;
  };
  u.flowerOrders = unionById(u.flowerOrders, state.flowerOrders);
  u.scheduledTransfers = unionById(u.scheduledTransfers, state.scheduledTransfers);
  // 预算：服务端是持久化基准（每次本地改动都会即时上报），以服务端为准
  if (state.budgets && typeof state.budgets === 'object' && Object.keys(state.budgets).length) {
    u.budgets = Object.assign({}, (u.budgets && typeof u.budgets === 'object') ? u.budgets : {}, state.budgets);
  }
}

// 联系人整表同步（新增/编辑/删除后都调用一次，保证服务端与本地一致）
function apiSaveContacts(list) {
  var arr = Array.isArray(list) ? list : (mockData.contacts || []);
  if (API.enabled) {
    apiRequest('POST', '/api/contacts/save', { contacts: arr }).catch(function () { });
  }
}

// 删除单个联系人（按姓名，服务端同步）
function apiDeleteContactByName(name) {
  if (!name) return;
  if (API.enabled) {
    apiRequest('POST', '/api/contact/delete', { name: name }).catch(function () { });
  }
}

function apiContactAdd(name, account, bank, phone) {
  return apiPost('/api/contact/add', { name: name, account: account, bank: bank, phone: phone });
}

// 刷新界面（数据注入后触发重渲染）
function apiRefreshUI() {
  try {
    // 若用户信息页已打开则刷新
    if (typeof renderUserInfoPage === 'function' && currentModule === 'userinfo') {
      renderUserInfoPage();
    }
  } catch (e) { }
}

// 页面启动时自动初始化（放在 config.js 之后加载，此时 mockData 已就绪）
apiInit();
