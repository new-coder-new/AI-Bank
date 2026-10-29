// ========== 数据持久化存储 ==========
const STORAGE_KEY = 'financeAssistantData_v1';

function saveUserData() {
  try {
    const data = {
      userProfile: mockData.userProfile,
      subscriptions: mockData.subscriptions,
      // 联系人：只有拿到数组时才写入，避免某次流程里 contacts 还没初始化就把本地数据清空
      contacts: Array.isArray(mockData.contacts) ? mockData.contacts : undefined,
      bills: mockData.bills,
      investmentPlans: mockData.investmentPlans,
      cardFrozen: cardFrozen,
      savedAt: new Date().toISOString()
    };
    Object.keys(data).forEach(function (k) { if (data[k] === undefined) delete data[k]; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // 同时上报服务端（鲜花订单 / 定时转账 / 预算），换设备、清缓存可恢复
    if (typeof apiPersistClientState === 'function') apiPersistClientState();
  } catch (e) {
    console.warn('保存数据失败:', e);
  }
}

// 单条订阅补默认值：旧数据缺 chargeInDays 时按周期推算，
// 不再因为一条缺字段就丢弃整份订阅清单。
function normalizeStoredSubscription(sub) {
  if (!sub || !sub.name) return null;
  const out = Object.assign({}, sub);
  if (typeof out.chargeInDays !== 'number') {
    let date = null;
    const raw = out.nextChargeDate || out.chargeDate || '';
    if (raw) {
      const d = new Date(String(raw).slice(0, 10) + 'T00:00:00');
      if (!isNaN(d.getTime())) date = d;
    }
    if (!date) {
      date = new Date();
      if (out.cycle === '/季') date.setMonth(date.getMonth() + 3);
      else if (out.cycle === '/年') date.setFullYear(date.getFullYear() + 1);
      else date.setMonth(date.getMonth() + 1);
    }
    out.chargeInDays = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
    out.chargeDate = out.chargeDate || (date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'));
  }
  if (!out.cycleLabel) out.cycleLabel = out.cycle === '/季' ? '连续包季' : (out.cycle === '/年' ? '连续包年' : '连续包月');
  if (!out.usage) out.usage = '中';
  return out;
}

function loadUserData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (data.userProfile) {
        // 预算数据兼容性处理：旧格式转换为多周期格式
        if (data.userProfile.budgets) {
          const b = data.userProfile.budgets;
          if (Array.isArray(b)) {
            // 最旧的数组格式
            const totalLimit = b.reduce((s, item) => s + (item.limit || 0), 0);
            data.userProfile.budgets = { month: totalLimit };
          } else if (typeof b === 'object' && b.period && b.totalLimit !== undefined) {
            // 单周期格式 {period: 'month', totalLimit: 3000}
            const period = b.period || 'month';
            data.userProfile.budgets = {};
            data.userProfile.budgets[period] = b.totalLimit || 0;
          }
          // 已经是多周期格式 {day: 100, week: 500, ...} 则保持不变
        }
        // 确保预算数据存在
        if (!data.userProfile.budgets) {
          data.userProfile.budgets = mockData.userProfile.budgets;
        }
        // 信用卡额度三字段兼容补全（C2 修复）：旧数据缺申请/审批/生效额度时，从 limit 推导
        if (data.userProfile.creditCard) {
          var cc = data.userProfile.creditCard;
          if (cc.effectiveLimit == null) cc.effectiveLimit = cc.limit != null ? cc.limit : 90000;
          if (cc.limit == null) cc.limit = cc.effectiveLimit;
          if (cc.appliedLimit == null) cc.appliedLimit = cc.effectiveLimit;
          if (cc.approvedLimit == null) cc.approvedLimit = cc.effectiveLimit;
          if (cc.available == null) cc.available = cc.limit - (cc.used || 0);
        }
        mockData.userProfile = data.userProfile;
        // 恢复上次理财风险测评结果
        if (data.userProfile.riskProfile) riskProfile = data.userProfile.riskProfile;
      }
      if (Array.isArray(data.subscriptions)) {
        // 逐条补默认值；只有整份数据完全无效时才回退初始数据
        const normalized = data.subscriptions.map(normalizeStoredSubscription).filter(Boolean);
        if (normalized.length || data.subscriptions.length === 0) {
          mockData.subscriptions = normalized;
          window.__LOCAL_SUBS_LOADED = true;
        }
      }
      if (Array.isArray(data.contacts)) {
        mockData.contacts = data.contacts;
        window.__LOCAL_CONTACTS_LOADED = true;
      }
      if (data.bills && Array.isArray(data.bills.expense)) {
        mockData.bills = data.bills;
        window.__LOCAL_BILLS_LOADED = true;
      }
      if (Array.isArray(data.investmentPlans)) {
        mockData.investmentPlans = data.investmentPlans;
        window.__LOCAL_PLANS_LOADED = true;
      }
      if (typeof data.cardFrozen === 'boolean') cardFrozen = data.cardFrozen;
      window.__LOCAL_STATE_LOADED = true;
      return true;
    }
  } catch (e) {
    console.warn('加载数据失败:', e);
  }
  return false;
}

function resetUserData() {
  if (confirm('确定要重置所有数据吗？这将恢复到初始状态，所有操作记录将被清除。')) {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }
}

// 页面加载时恢复数据
loadUserData();

const userInput = document.getElementById('userInput');
userInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});
userInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

function switchModule(module, el) {
  // 如果当前停在"用户信息"独立页，先从独立页退回对话，否则服务卡片会渲染在隐藏的容器里
  const userInfoPage = document.getElementById('userInfoPage');
  if (userInfoPage && userInfoPage.classList.contains('show')) closeUserInfoPage();
  currentModule = module;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  // 左侧入口只是把对应服务投递到对话里，不再切换到独立页面，
  // 所以顶部不需要"返回对话"按钮；菜单打开时顺手收起。
  const drawer = document.getElementById('agentDrawer');
  if (drawer && drawer.classList.contains('show')) toggleAgentDrawer();
  quickAction(module);
}

// 抽屉里点击后先收起，再执行目标动作
function drawerGo(fn) {
  const drawer = document.getElementById('agentDrawer');
  if (drawer && drawer.classList.contains('show')) toggleAgentDrawer();
  setTimeout(function () { if (typeof fn === 'function') fn(); }, 180);
}

function showUserInfoFromTopbar() {
  currentModule = 'userinfo';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('chatContainer').style.display = 'none';
  document.getElementById('userInfoPage').classList.add('show');
  document.querySelector('.input-area').style.display = 'none';
  currentUserInfoTab = 'overview';
  document.querySelectorAll('.userinfo-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.userinfo-tab[onclick*="overview"]').classList.add('active');
  renderUserInfoPage();
}

let currentUserInfoTab = 'overview';

function closeUserInfoPage() {
  document.getElementById('userInfoPage').classList.remove('show');
  document.getElementById('chatContainer').style.display = 'flex';
  document.querySelector('.input-area').style.display = 'block';
  currentModule = 'chat';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const chatNav = document.querySelector('.nav-item[onclick*="chat"]');
  if (chatNav) chatNav.classList.add('active');
}

// 功能快捷面板
function toggleFuncPanel() {
  const overlay = document.getElementById('funcPanelOverlay');
  const panel = document.getElementById('funcPanel');
  const btn = document.getElementById('funcBtn');
  const isShow = panel.classList.contains('show');
  if (isShow) {
    overlay.classList.remove('show');
    panel.classList.remove('show');
    btn.classList.remove('active');
    // 关闭面板时收起所有大类
    document.querySelectorAll('.func-category.expanded').forEach(cat => cat.classList.remove('expanded'));
  } else {
    overlay.classList.add('show');
    panel.classList.add('show');
    btn.classList.add('active');
  }
}

// 展开/收起功能大类

function selectFunc(type) {
  toggleFuncPanel();
  // 从全部服务里选的功能，也同步左侧菜单的选中态（没有对应入口的保持原样）
  const nav = document.querySelector('.nav-item[data-module="' + type + '"]');
  if (nav) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    nav.classList.add('active');
  }
  setTimeout(() => {
    quickAction(type);
  }, 200);
}

function switchUserInfoTab(tab, el) {
  currentUserInfoTab = tab;
  document.querySelectorAll('.userinfo-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  renderUserInfoPage();
}

function renderUserInfoPage() {
  const content = document.getElementById('userInfoContent');
  const u = mockData.userProfile;
  // 更新顶部用户信息
  document.getElementById('uiLevel').textContent = u.level;
  document.getElementById('uiMeta').textContent = `尾号 ${String(u.phone || '').slice(-4)} · 开户于 ${u.openDate}`;

  if (currentUserInfoTab === 'overview') {
    content.innerHTML = renderUserInfoOverview(u);
  } else if (currentUserInfoTab === 'basic') {
    content.innerHTML = renderUserInfoBasic(u);
  } else if (currentUserInfoTab === 'cards') {
    content.innerHTML = renderUserInfoCards(u);
  } else if (currentUserInfoTab === 'txns') {
    content.innerHTML = renderUserInfoTxns(u);
  } else if (currentUserInfoTab === 'contacts') {
    content.innerHTML = renderUserInfoContacts(u);
  }
  // 切换 Tab 后回到顶部，避免沿用上一个 Tab 的滚动位置
  content.scrollTop = 0;
}

function renderUserInfoOverview(u) {
  const d = u.debitCard;
  const l = u.loan;
  // 与首页「总资产」使用同一口径：储蓄卡余额 + 理财持仓 + 定期/基金/房产
  let assets = null;
  if (typeof agentTotalAssets === 'function') {
    try { assets = agentTotalAssets(); } catch (e) { assets = null; }
  }
  const holdingsValue = assets
    ? Number(assets.holdings) || 0
    : (u.holdings || []).reduce((s, h) => s + (Number(h.amount) || 0) + (Number(h.profit) || 0), 0);
  const apiAssets = window.__API_ASSETS || {};
  const totalAssets = assets
    ? Number(assets.total) || 0
    : Number(d.balance) + holdingsValue + Number(apiAssets.fixed || 100000) + Number(apiAssets.fund || 45511) + Number(apiAssets.property || 600000);
  const netAsset = totalAssets - (Number(l.remaining) || 0);
  const todayNet = d.todayIncome - d.todayExpense;
  return `
    <section class="userinfo-section ui-overview-card">
      <div class="ui-overview-top">
        <div>
          <div class="ui-label">总资产（元）</div>
          <div class="ui-asset-value">¥${totalAssets.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</div>
        </div>
        <span class="ui-chip">含房产/理财</span>
      </div>
      <div class="ui-metric-row">
        <div><span>储蓄卡余额</span><b>¥${d.balance.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</b></div>
        <div><span>理财持仓</span><b>¥${holdingsValue.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</b></div>
        <div><span>净资产</span><b>¥${netAsset.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</b></div>
      </div>
      <div class="ui-footnote">总资产 = 储蓄卡余额 + 理财持仓 + 定期/基金/房产；净资产已扣除贷款 ¥${Number(l.remaining).toLocaleString('zh-CN', {minimumFractionDigits: 2})}。</div>
    </section>
    <section class="userinfo-section">
      <div class="ui-card-head">
        <div class="userinfo-section-title">今日收支</div>
      </div>
      <div class="ui-metric-row">
        <div><span>今日收入</span><b class="positive">+¥${d.todayIncome.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</b></div>
        <div><span>今日支出</span><b class="negative">-¥${d.todayExpense.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</b></div>
        <div><span>净收支</span><b class="${todayNet >= 0 ? 'positive' : 'negative'}">${todayNet >= 0 ? '+' : ''}¥${todayNet.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</b></div>
      </div>
    </section>
    <section class="userinfo-section">
      <div class="ui-card-head">
        <div class="userinfo-section-title">最近交易</div>
        <button class="ui-link" onclick="goToTxnsTab()">查看全部</button>
      </div>
      <div class="txn-list">
        ${u.recentTxns.slice(0, 3).map(renderTxnItem).join('')}
      </div>
    </section>
  `;
}

// 跳转到交易记录Tab
function goToTxnsTab() {
  const tabs = document.querySelectorAll('.userinfo-tab');
  tabs.forEach(t => t.classList.remove('active'));
  const txnsTab = Array.from(tabs).find(t => t.textContent.includes('交易记录'));
  if (txnsTab) {
    txnsTab.classList.add('active');
    currentUserInfoTab = 'txns';
    renderUserInfoPage();
  }
}

function renderUserInfoBasic(u) {
  const idMasked = u.idCard.replace(/(\d{6})\d+(\d{4})/, '$1********$2');
  const phoneMasked = u.phone.replace(/(\d{3})\d+(\d{4})/, '$1****$2');
  return `
    <section class="userinfo-section">
      <div class="ui-card-head">
        <div class="userinfo-section-title">客户信息</div>
        <button class="ui-link" id="sensitiveToggleBtn" onclick="toggleSensitiveInfo()">${sensitiveInfoVisible ? '隐藏敏感信息' : '显示敏感信息'}</button>
      </div>
      <div class="ui-info-grid">
        <div class="ui-info-row"><span>客户姓名</span><b>${u.name}</b></div>
        <div class="ui-info-row"><span>性别</span><b>${u.gender}</b></div>
        <div class="ui-info-row"><span>身份证号</span><b class="sensitive-info" data-full="${u.idCard}" data-masked="${idMasked}">${sensitiveInfoVisible ? u.idCard : idMasked}</b></div>
        <div class="ui-info-row"><span>出生日期</span><b>${u.birthday}</b></div>
        <div class="ui-info-row"><span>手机号码</span><b class="sensitive-info" data-full="${u.phone}" data-masked="${phoneMasked}">${sensitiveInfoVisible ? u.phone : phoneMasked}</b></div>
        <div class="ui-info-row"><span>电子邮箱</span><b>${u.email}</b></div>
        <div class="ui-info-row full"><span>联系地址</span><b>${u.address}</b></div>
        <div class="ui-info-row"><span>客户等级</span><b>${u.level}</b></div>
        <div class="ui-info-row"><span>开户日期</span><b>${u.openDate}</b></div>
        <div class="ui-info-row"><span>客户经理</span><b>${u.manager}</b></div>
      </div>
    </section>
  `;
}

// 敏感信息显示状态
let sensitiveInfoVisible = false;

// 切换敏感信息显示
function toggleSensitiveInfo() {
  if (sensitiveInfoVisible) {
    // 隐藏敏感信息不需要验证
    sensitiveInfoVisible = false;
    updateSensitiveInfoDisplay();
    return;
  }
  // 显示敏感信息需要安全验证
  showSecurityVerification('查看敏感信息', function(success) {
    if (success) {
      sensitiveInfoVisible = true;
      updateSensitiveInfoDisplay();
    }
  });
}

// 更新敏感信息显示
function updateSensitiveInfoDisplay() {
  const btn = document.getElementById('sensitiveToggleBtn');
  if (btn) {
    btn.textContent = sensitiveInfoVisible ? '隐藏敏感信息' : '显示敏感信息';
  }
  document.querySelectorAll('.sensitive-info').forEach(el => {
    if (sensitiveInfoVisible) {
      el.textContent = el.dataset.full;
    } else {
      el.textContent = el.dataset.masked;
    }
  });
}

