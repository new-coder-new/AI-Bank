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
  pending: [],         // 等待后端就绪期间积压的写操作
};

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
  return fetch(API.base + path, {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  }).then(function (r) { return r.json(); });
}

// 后端可达性探测 + 快照注入
function apiInit() {
  apiRequest('GET', '/api/health').then(function (res) {
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
  }).catch(function () {
    console.warn('[api] 后端不可达，降级为本地 mock 数据（离线模式）');
  });
}

// 把后端快照注入 mockData（保持前端代码零改动）
function apiInjectSnapshot(snap) {
  if (!snap) return;
  // 注入账户核心数据
  if (snap.userProfile) {
    // 以下字段是「前端本地资产」，后端核心不持有，快照覆盖时必须原样保留，
    // 否则刷新页面后这些数据会凭空消失（定时任务、风评、复核、AA、卡片、申请记录、交易限制）。
    var localProfile = mockData.userProfile || {};
    var localKeep = {};
    ['scheduledTransfers', 'riskProfile', 'manualReviews', 'aaRequests',
      'creditCards', 'cardApplications', 'txnLimit'].forEach(function (k) {
      if (localProfile[k] != null) localKeep[k] = localProfile[k];
    });
    var localCreditCard = localProfile.creditCard ? JSON.parse(JSON.stringify(localProfile.creditCard)) : null;

    mockData.userProfile = snap.userProfile;

    Object.keys(localKeep).forEach(function (k) { mockData.userProfile[k] = localKeep[k]; });

    // 主卡的额度调整/挂失状态同样是本地产生的，不能被快照里的旧值覆盖
    if (localCreditCard && mockData.userProfile.creditCard) {
      ['effectiveLimit', 'approvedLimit', 'appliedLimit', 'available', 'isFrozen',
        'limitApplyStatus', 'limitApplyReason', 'limitApplyAt', 'limitApplyDirection',
        'approvedAt', 'limitUpdatedAt'].forEach(function (k) {
        if (localCreditCard[k] != null) mockData.userProfile.creditCard[k] = localCreditCard[k];
      });
    }
  }
  if (snap.bills) mockData.bills = snap.bills;
  if (snap.products) mockData.products = snap.products;
  if (snap.subscriptions) mockData.subscriptions = snap.subscriptions;
  if (snap.contacts) mockData.contacts = snap.contacts;
  if (snap.card) mockData.card = snap.card;

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

// 写操作：乐观本地更新已在调用方完成，这里负责同步后端
function apiPost(path, body) {
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  return apiRequest('POST', path, body).then(function (res) {
    // 后端返回最新状态时，可选回写（这里仅回写关键余额）
    if (res && res.ok && typeof res.balance === 'number') {
      mockData.userProfile.debitCard.balance = res.balance;
      mockData.userProfile.debitCard.available = res.available;
    }
    return res;
  });
}

// 转账同步
function apiTransfer(payee, amount) {
  return apiPost('/api/transfer', { payee: payee, amount: amount });
}
// 理财申购同步
function apiWealthBuy(product, amount) {
  return apiPost('/api/wealth/buy', { product: product, amount: amount });
}
// 理财赎回同步
function apiWealthRedeem(product, amount) {
  return apiPost('/api/wealth/redeem', { product: product, amount: amount });
}
// 预算设置同步
function apiBudgetSet(amount, period) {
  return apiPost('/api/budget/set', { amount: amount, period: period || 'month' });
}
// 专项预算同步
function apiFundCreate(name, amount, deadline) {
  return apiPost('/api/fund/create', { name: name, amount: amount, deadline: deadline });
}
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
function apiFrozenDetail() {
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true });
  return apiRequest('GET', '/api/balance/frozen');
}
// 联系人列表（GET，只读）
function apiContactList() {
  if (!API.enabled) return Promise.resolve({ ok: false, offline: true, contacts: mockData.contacts || [] });
  return apiRequest('GET', '/api/contacts');
}
// 新增联系人同步（乐观本地更新由调用方完成）
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
