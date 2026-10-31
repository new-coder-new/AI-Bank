// ========== 数据持久化存储（TypeScript 源码） ==========
// 编译产物：js/core/storage.js（经典脚本，无 import/export）

// —— 运行时由其它脚本提供的全局 ——
declare var mockData: any;
declare var currentModule: string;
declare function apiPersistClientState(): void;
declare function sendMessage(): void;
declare function quickAction(module: string): void;
declare function toggleAgentDrawer(): void;
declare function showSecurityVerification(purpose: string, cb: (ok: boolean) => void): void;
declare function renderTxnItem(txn: any): string;
declare function agentTotalAssets(): any;
declare var cardFrozen: boolean;
declare var riskProfile: any;
declare function renderUserInfoCards(u: any): string;
declare function renderUserInfoReviews(u: any): string;
declare function renderUserInfoTxns(u: any): string;
declare function renderUserInfoContacts(u: any): string;

const STORAGE_KEY = 'financeAssistantData_v1';

function saveUserData(): void {
  try {
    const data: any = {
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
    // 同时上报服务端（鲜花订单 / 定时转账 / 预算）
    if (typeof apiPersistClientState === 'function') apiPersistClientState();
  } catch (e) {
    console.warn('保存数据失败:', e);
  }
}

// 单条订阅补默认值：旧数据缺 chargeInDays 时按周期推算
function normalizeStoredSubscription(sub: any): any {
  if (!sub || !sub.name) return null;
  const out: any = Object.assign({}, sub);
  if (typeof out.chargeInDays !== 'number') {
    let date: Date | null = null;
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

function loadUserData(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data: any = JSON.parse(saved);
      if (data.userProfile) {
        // 预算数据兼容性处理：旧格式转换为多周期格式
        if (data.userProfile.budgets) {
          const b = data.userProfile.budgets;
          if (Array.isArray(b)) {
            const totalLimit = b.reduce((s: number, item: any) => s + (item.limit || 0), 0);
            data.userProfile.budgets = { month: totalLimit };
          } else if (typeof b === 'object' && b.period && b.totalLimit !== undefined) {
            const period = b.period || 'month';
            data.userProfile.budgets = {};
            data.userProfile.budgets[period] = b.totalLimit || 0;
          }
        }
        if (!data.userProfile.budgets) {
          data.userProfile.budgets = mockData.userProfile.budgets;
        }
        // 信用卡额度三字段兼容补全：旧数据缺申请/审批/生效额度时，从 limit 推导
        if (data.userProfile.creditCard) {
          var cc = data.userProfile.creditCard;
          if (cc.effectiveLimit == null) cc.effectiveLimit = cc.limit != null ? cc.limit : 90000;
          if (cc.limit == null) cc.limit = cc.effectiveLimit;
          if (cc.appliedLimit == null) cc.appliedLimit = cc.effectiveLimit;
          if (cc.approvedLimit == null) cc.approvedLimit = cc.effectiveLimit;
          if (cc.available == null) cc.available = cc.limit - (cc.used || 0);
        }
        mockData.userProfile = data.userProfile;
        if (data.userProfile.riskProfile) riskProfile = data.userProfile.riskProfile;
      }
      if (Array.isArray(data.subscriptions)) {
        const normalized = data.subscriptions.map(normalizeStoredSubscription).filter(Boolean);
        if (normalized.length || data.subscriptions.length === 0) {
          mockData.subscriptions = normalized;
          (window as any).__LOCAL_SUBS_LOADED = true;
        }
      }
      if (Array.isArray(data.contacts)) {
        mockData.contacts = data.contacts;
        (window as any).__LOCAL_CONTACTS_LOADED = true;
      }
      if (data.bills && Array.isArray(data.bills.expense)) {
        mockData.bills = data.bills;
        (window as any).__LOCAL_BILLS_LOADED = true;
      }
      if (Array.isArray(data.investmentPlans)) {
        mockData.investmentPlans = data.investmentPlans;
        (window as any).__LOCAL_PLANS_LOADED = true;
      }
      if (typeof data.cardFrozen === 'boolean') cardFrozen = data.cardFrozen;
      (window as any).__LOCAL_STATE_LOADED = true;
      return true;
    }
  } catch (e) {
    console.warn('加载数据失败:', e);
  }
  return false;
}

// 重置为演示数据：服务端重建种子库 + 清本地缓存，然后整页重载
function resetUserData(): void {
  if (!confirm('将清除当前演示产生的全部数据（转账 / 理财 / 订阅 / 鲜花 / 复核 / 定时任务等），恢复初始演示数据。确定继续？')) return;
  const done = function (): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { }
    location.reload();
  };
  if (typeof apiDemoReset === 'function' && typeof API !== 'undefined' && API.enabled) {
    apiDemoReset().then(function (res: any) {
      if (res && res.ok === false) { alert('重置失败：' + (res.error || '服务端返回异常')); return; }
      done();
    }).catch(function () { done(); });
  } else {
    done();
  }
}

// 页面加载时恢复数据
loadUserData();

// 输入框自适应高度（元素可能不在当前页面，做空值保护）
(function bindUserInput() {
  const userInput = document.getElementById('userInput');
  if (!userInput) return;
  userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
  userInput.addEventListener('keydown', function (e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
})();

function switchModule(module: string, el?: any): void {
  const userInfoPage = document.getElementById('userInfoPage');
  if (userInfoPage && userInfoPage.classList.contains('show')) closeUserInfoPage();
  currentModule = module;
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  if (el) el.classList.add('active');
  const drawer = document.getElementById('agentDrawer');
  if (drawer && drawer.classList.contains('show')) toggleAgentDrawer();
  quickAction(module);
}

// 抽屉里点击后先收起，再执行目标动作
function drawerGo(fn: any): void {
  const drawer = document.getElementById('agentDrawer');
  if (drawer && drawer.classList.contains('show')) toggleAgentDrawer();
  setTimeout(function () { if (typeof fn === 'function') fn(); }, 180);
}

function showUserInfoFromTopbar(): void {
  currentModule = 'userinfo';
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  document.getElementById('chatContainer')!.style.display = 'none';
  document.getElementById('userInfoPage')!.classList.add('show');
  (document.querySelector('.input-area') as HTMLElement)!.style.display = 'none';
  currentUserInfoTab = 'overview';
  document.querySelectorAll('.userinfo-tab').forEach((t) => t.classList.remove('active'));
  document.querySelector('.userinfo-tab[onclick*="overview"]')!.classList.add('active');
  renderUserInfoPage();
}

let currentUserInfoTab = 'overview';

function closeUserInfoPage(): void {
  document.getElementById('userInfoPage')!.classList.remove('show');
  document.getElementById('chatContainer')!.style.display = 'flex';
  (document.querySelector('.input-area') as HTMLElement)!.style.display = 'block';
  currentModule = 'chat';
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  const chatNav = document.querySelector('.nav-item[onclick*="chat"]');
  if (chatNav) chatNav.classList.add('active');
}

function switchUserInfoTab(tab: string, el?: any): void {
  currentUserInfoTab = tab;
  document.querySelectorAll('.userinfo-tab').forEach((t) => t.classList.remove('active'));
  if (el) el.classList.add('active');
  renderUserInfoPage();
}

function renderUserInfoPage(): void {
  const content = document.getElementById('userInfoContent');
  const u = mockData.userProfile;
  if (!content) return;
  document.getElementById('uiLevel')!.textContent = u.level;
  document.getElementById('uiMeta')!.textContent = `尾号 ${String(u.phone || '').slice(-4)} · 开户于 ${u.openDate}`;

  if (currentUserInfoTab === 'overview') {
    content.innerHTML = renderUserInfoOverview(u);
  } else if (currentUserInfoTab === 'basic') {
    content.innerHTML = renderUserInfoBasic(u);
  } else if (currentUserInfoTab === 'cards') {
    content.innerHTML = renderUserInfoCards(u);
  } else if (currentUserInfoTab === 'reviews') {
    content.innerHTML = renderUserInfoReviews(u);
  } else if (currentUserInfoTab === 'txns') {
    content.innerHTML = renderUserInfoTxns(u);
  } else if (currentUserInfoTab === 'contacts') {
    content.innerHTML = renderUserInfoContacts(u);
  }
  content.scrollTop = 0;
}

function renderUserInfoOverview(u: any): string {
  const d = u.debitCard;
  let assets: any = null;
  if (typeof agentTotalAssets === 'function') {
    try { assets = agentTotalAssets(); } catch (e) { assets = null; }
  }
  const holdingsValue = assets
    ? Number(assets.holdings) || 0
    : (u.holdings || []).reduce((s: number, h: any) => s + (Number(h.amount) || 0) + (Number(h.profit) || 0), 0);
  const apiAssets: any = (window as any).__API_ASSETS || {};
  const totalAssets = assets
    ? Number(assets.total) || 0
    : Number(d.balance) + holdingsValue + Number(apiAssets.fixed || 100000) + Number(apiAssets.fund || 45511) + Number(apiAssets.property || 600000);
  const netAsset = totalAssets;
  const todayNet = d.todayIncome - d.todayExpense;
  return `
    <section class="userinfo-section ui-overview-card">
      <div class="ui-overview-top">
        <div>
          <div class="ui-label">总资产（元）</div>
          <div class="ui-asset-value">¥${totalAssets.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
        </div>
        <span class="ui-chip">含房产/理财</span>
      </div>
      <div class="ui-metric-row">
        <div><span>储蓄卡余额</span><b>¥${d.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</b></div>
        <div><span>理财持仓</span><b>¥${holdingsValue.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</b></div>
        <div><span>净资产</span><b>¥${netAsset.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</b></div>
      </div>
      <div class="ui-footnote">总资产 = 储蓄卡余额 + 理财持仓 + 定期/基金/房产。</div>
    </section>
    <section class="userinfo-section">
      <div class="ui-card-head">
        <div class="userinfo-section-title">今日收支</div>
      </div>
      <div class="ui-metric-row">
        <div><span>今日收入</span><b class="positive">+¥${d.todayIncome.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</b></div>
        <div><span>今日支出</span><b class="negative">-¥${d.todayExpense.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</b></div>
        <div><span>净收支</span><b class="${todayNet >= 0 ? 'positive' : 'negative'}">${todayNet >= 0 ? '+' : ''}¥${todayNet.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</b></div>
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

// 跳转到交易记录 Tab
function goToTxnsTab(): void {
  const tabs = document.querySelectorAll('.userinfo-tab');
  tabs.forEach((t) => t.classList.remove('active'));
  const txnsTab = Array.from(tabs).find((t) => (t.textContent || '').includes('交易记录'));
  if (txnsTab) {
    txnsTab.classList.add('active');
    currentUserInfoTab = 'txns';
    renderUserInfoPage();
  }
}

function renderUserInfoBasic(u: any): string {
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

function toggleSensitiveInfo(): void {
  if (sensitiveInfoVisible) {
    // 隐藏敏感信息不需要验证
    sensitiveInfoVisible = false;
    updateSensitiveInfoDisplay();
    return;
  }
  // 显示敏感信息需要安全验证
  showSecurityVerification('查看敏感信息', function (success) {
    if (success) {
      sensitiveInfoVisible = true;
      updateSensitiveInfoDisplay();
    }
  });
}

function updateSensitiveInfoDisplay(): void {
  const btn = document.getElementById('sensitiveToggleBtn');
  if (btn) {
    btn.textContent = sensitiveInfoVisible ? '隐藏敏感信息' : '显示敏感信息';
  }
  document.querySelectorAll('.sensitive-info').forEach((el: any) => {
    if (sensitiveInfoVisible) {
      el.textContent = el.dataset.full;
    } else {
      el.textContent = el.dataset.masked;
    }
  });
}
