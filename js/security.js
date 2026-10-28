// ========== 通用安全验证弹窗 ==========
// 验证状态
let securityVerifyCallback = null;
let securityVerifyPurpose = '';
let smsCodeSent = false;
let smsCountdown = 0;

// 显示安全验证弹窗
function showSecurityVerification(purpose, callback) {
  securityVerifyCallback = callback;
  securityVerifyPurpose = purpose;
  smsCodeSent = false;
  smsCountdown = 0;

  const popupId = 'security-verify-' + Date.now();
  const popup = document.createElement('div');
  popup.id = popupId;
  popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;';
  popup.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;max-width:340px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-size:40px;margin-bottom:8px;"></div>
        <div style="font-size:16px;font-weight:700;color:#1a1a1a;">安全验证</div>
        <div style="font-size:13px;color:#999;margin-top:4px;">${purpose}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button onclick="showPasswordVerify('${popupId}')" style="display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;cursor:pointer;transition:all 0.2s;">
          <span style="font-size:24px;"></span>
          <div style="text-align:left;flex:1;">
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;">交易密码</div>
            <div style="font-size:11px;color:#999;">输入6位交易密码</div>
          </div>
          <span style="color:#ccc;font-size:18px;">›</span>
        </button>
        <button onclick="showSmsVerify('${popupId}')" style="display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;cursor:pointer;transition:all 0.2s;">
          <span style="font-size:24px;"></span>
          <div style="text-align:left;flex:1;">
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;">短信验证</div>
            <div style="font-size:11px;color:#999;">发送验证码到 138****6688</div>
          </div>
          <span style="color:#ccc;font-size:18px;">›</span>
        </button>
        <button onclick="showFingerprintVerify('${popupId}')" style="display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;cursor:pointer;transition:all 0.2s;">
          <span style="font-size:24px;"></span>
          <div style="text-align:left;flex:1;">
            <div style="font-size:14px;font-weight:600;color:#1a1a1a;">指纹验证</div>
            <div style="font-size:11px;color:#999;">使用指纹快速验证</div>
          </div>
          <span style="color:#ccc;font-size:18px;">›</span>
        </button>
      </div>
      <button onclick="closeSecurityVerify('${popupId}', false)" style="width:100%;margin-top:16px;padding:10px;border:none;background:#f3f4f6;color:#666;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">取消</button>
    </div>
  `;
  document.body.appendChild(popup);
}

// 密码验证
function showPasswordVerify(popupId) {
  const popup = document.getElementById(popupId);
  if (!popup) return;
  popup.querySelector('div > div').innerHTML = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:40px;margin-bottom:8px;"></div>
      <div style="font-size:16px;font-weight:700;color:#1a1a1a;">输入交易密码</div>
      <div style="font-size:13px;color:#999;margin-top:4px;">${securityVerifyPurpose}</div>
    </div>
    <div style="display:flex;justify-content:center;gap:8px;margin-bottom:20px;" id="passwordDots">
      ${[1,2,3,4,5,6].map(i => `<div style="width:36px;height:44px;border:2px solid #e5e7eb;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#1a1a1a;" id="pwd-dot-${i}"></div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">
      ${[1,2,3,4,5,6,7,8,9].map(n => `<button onclick="inputPassword('${n}','${popupId}')" style="padding:14px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;font-size:18px;font-weight:600;cursor:pointer;">${n}</button>`).join('')}
      <button onclick="clearPassword('${popupId}')" style="padding:14px;border:1px solid #e5e7eb;border-radius:8px;background:#f3f4f6;font-size:14px;font-weight:600;cursor:pointer;">清除</button>
      <button onclick="inputPassword('0','${popupId}')" style="padding:14px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;font-size:18px;font-weight:600;cursor:pointer;">0</button>
      <button onclick="deletePassword('${popupId}')" style="padding:14px;border:1px solid #e5e7eb;border-radius:8px;background:#f3f4f6;font-size:14px;font-weight:600;cursor:pointer;">⌫</button>
    </div>
    <div id="passwordError" style="color:#ef4444;font-size:12px;text-align:center;margin-bottom:10px;display:none;">密码错误，请重试（演示密码：123456）</div>
    <button onclick="closeSecurityVerify('${popupId}', false)" style="width:100%;padding:10px;border:none;background:#f3f4f6;color:#666;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">取消</button>
  `;
  window.currentPasswordInput = '';
}

// 输入密码
function inputPassword(num, popupId) {
  if (window.currentPasswordInput.length >= 6) return;
  window.currentPasswordInput += num;
  document.getElementById('pwd-dot-' + window.currentPasswordInput.length).textContent = '•';
  if (window.currentPasswordInput.length === 6) {
    setTimeout(() => {
      if (window.currentPasswordInput === '123456') {
        closeSecurityVerify(popupId, true);
      } else {
        document.getElementById('passwordError').style.display = 'block';
        setTimeout(() => clearPassword(popupId), 500);
      }
    }, 300);
  }
}

// 清除密码
function clearPassword(popupId) {
  window.currentPasswordInput = '';
  for (let i = 1; i <= 6; i++) {
    document.getElementById('pwd-dot-' + i).textContent = '';
  }
  document.getElementById('passwordError').style.display = 'none';
}

// 删除密码
function deletePassword(popupId) {
  if (window.currentPasswordInput.length === 0) return;
  document.getElementById('pwd-dot-' + window.currentPasswordInput.length).textContent = '';
  window.currentPasswordInput = window.currentPasswordInput.slice(0, -1);
}

// 短信验证
function showSmsVerify(popupId) {
  const popup = document.getElementById(popupId);
  if (!popup) return;
  smsCodeSent = true;
  popup.querySelector('div > div').innerHTML = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:40px;margin-bottom:8px;"></div>
      <div style="font-size:16px;font-weight:700;color:#1a1a1a;">短信验证码</div>
      <div style="font-size:13px;color:#999;margin-top:4px;">验证码已发送至 138****6688</div>
    </div>
    <div style="display:flex;justify-content:center;gap:8px;margin-bottom:16px;">
      ${[1,2,3,4,5,6].map(i => `<input type="text" maxlength="1" style="width:36px;height:44px;border:2px solid #e5e7eb;border-radius:8px;text-align:center;font-size:20px;font-weight:700;outline:none;" id="sms-code-${i}" oninput="handleSmsInput(${i},'${popupId}')">`).join('')}
    </div>
    <div style="text-align:center;margin-bottom:16px;">
      <button id="smsResendBtn" onclick="resendSmsCode('${popupId}')" style="background:none;border:none;color:#0B4F9C;font-size:13px;cursor:pointer;font-weight:600;" disabled>重新发送 (60s)</button>
    </div>
    <div id="smsError" style="color:#ef4444;font-size:12px;text-align:center;margin-bottom:10px;display:none;">验证码错误，请重试（演示验证码：123456）</div>
    <button onclick="closeSecurityVerify('${popupId}', false)" style="width:100%;padding:10px;border:none;background:#f3f4f6;color:#666;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">取消</button>
  `;
  document.getElementById('sms-code-1').focus();
  startSmsCountdown();
}

// 处理短信验证码输入
function handleSmsInput(index, popupId) {
  const input = document.getElementById('sms-code-' + index);
  if (input.value && index < 6) {
    document.getElementById('sms-code-' + (index + 1)).focus();
  }
  // 检查是否全部输入完成
  let code = '';
  for (let i = 1; i <= 6; i++) {
    code += document.getElementById('sms-code-' + i).value;
  }
  if (code.length === 6) {
    setTimeout(() => {
      if (code === '123456') {
        closeSecurityVerify(popupId, true);
      } else {
        document.getElementById('smsError').style.display = 'block';
        for (let i = 1; i <= 6; i++) {
          document.getElementById('sms-code-' + i).value = '';
        }
        document.getElementById('sms-code-1').focus();
      }
    }, 300);
  }
}

// 短信倒计时
function startSmsCountdown() {
  smsCountdown = 60;
  const btn = document.getElementById('smsResendBtn');
  if (!btn) return;
  const timer = setInterval(() => {
    smsCountdown--;
    if (smsCountdown <= 0) {
      clearInterval(timer);
      btn.textContent = '重新发送';
      btn.disabled = false;
    } else {
      btn.textContent = '重新发送 (' + smsCountdown + 's)';
    }
  }, 1000);
}

// 重新发送短信
function resendSmsCode(popupId) {
  showSmsVerify(popupId);
}

// 指纹验证
function showFingerprintVerify(popupId) {
  const popup = document.getElementById(popupId);
  if (!popup) return;
  popup.querySelector('div > div').innerHTML = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:60px;margin-bottom:12px;animation:pulse 1.5s infinite;"></div>
      <div style="font-size:16px;font-weight:700;color:#1a1a1a;">指纹验证</div>
      <div style="font-size:13px;color:#999;margin-top:4px;">请将手指放在指纹识别区域</div>
    </div>
    <div style="background:#f9fafb;border-radius:10px;padding:16px;text-align:center;margin-bottom:16px;">
      <div style="font-size:14px;color:#666;">正在识别指纹...</div>
      <div style="margin-top:10px;height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden;">
        <div style="height:100%;background:linear-gradient(90deg,#0B4F9C,#1F6FD0);width:0%;animation:progress 2s ease-out forwards;"></div>
      </div>
    </div>
    <button onclick="closeSecurityVerify('${popupId}', false)" style="width:100%;padding:10px;border:none;background:#f3f4f6;color:#666;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">取消</button>
  `;
  // 添加动画样式
  if (!document.getElementById('fingerprint-animation')) {
    const style = document.createElement('style');
    style.id = 'fingerprint-animation';
    style.textContent = `
      @keyframes pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.8; } }
      @keyframes progress { 0% { width: 0%; } 100% { width: 100%; } }
    `;
    document.head.appendChild(style);
  }
  // 2秒后验证成功
  setTimeout(() => {
    if (document.getElementById(popupId)) {
      closeSecurityVerify(popupId, true);
    }
  }, 2200);
}

// 关闭安全验证弹窗
function closeSecurityVerify(popupId, success) {
  const popup = document.getElementById(popupId);
  if (popup) popup.remove();
  if (securityVerifyCallback) {
    securityVerifyCallback(success);
    securityVerifyCallback = null;
  }
}

function maskUserInfoCard(num) {
  const digits = String(num || '').replace(/\D/g, '');
  if (digits.length < 8) return String(num || '');
  return digits.slice(0, 4) + ' **** **** ' + digits.slice(-4);
}

function renderUserInfoCards(u) {
  const d = u.debitCard;
  const c = u.creditCard;
  const l = u.loan;
  const creditStatus = c.status || '正常';
  return `
    <section class="userinfo-section">
      <div class="ui-segmented">
        <button class="card-tab active" onclick="switchCardTab('debit', this)">储蓄卡</button>
        <button class="card-tab" onclick="switchCardTab('credit', this)">信用卡</button>
        <button class="card-tab" onclick="switchCardTab('loan', this)">贷款</button>
      </div>

      <!-- 储蓄卡 -->
      <div id="cardTab-debit" class="card-tab-content">
        <div class="ui-account-card">
          <div class="ui-account-top"><span>储蓄卡 · Ⅰ类账户</span><span>${d.status}</span></div>
          <div class="ui-account-number">${maskUserInfoCard(d.number)}</div>
          <div class="ui-account-bottom">
            <div><span>可用余额</span><strong>¥${d.available.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</strong></div>
            <div style="text-align:right;"><span>账户余额</span><strong>¥${d.balance.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</strong></div>
          </div>
        </div>
        <div class="ui-metric-row">
          <div><span>账户余额</span><b>¥${d.balance.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</b></div>
          <div><span>冻结金额</span><b>¥${d.frozen.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</b></div>
          <div><span>开户银行</span><b>${d.bank}</b></div>
        </div>
        <div class="ui-collapse" onclick="toggleDetail('debit-detail')">
          <span>账户详情</span><span class="ui-chevron" id="debit-detail-arrow">⌄</span>
        </div>
        <div id="debit-detail" class="ui-detail" style="display:none;">
          <div class="ui-info-grid">
            <div class="ui-info-row"><span>开户银行</span><b>${d.bank}</b></div>
            <div class="ui-info-row"><span>开户网点</span><b>${d.branch}</b></div>
            <div class="ui-info-row"><span>账户余额</span><b>¥${d.balance.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</b></div>
            <div class="ui-info-row"><span>冻结金额</span><b>¥${d.frozen.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</b></div>
          </div>
        </div>
      </div>

      <!-- 信用卡 -->
      <div id="cardTab-credit" class="card-tab-content" style="display:none;">
        <div class="ui-account-card credit">
          <div class="ui-account-top"><span>${c.level}</span><span>${creditStatus}</span></div>
          <div class="ui-account-number">${maskUserInfoCard(c.number)}</div>
          <div class="ui-account-bottom">
            <div><span>可用额度</span><strong>¥${c.available.toLocaleString()}</strong></div>
            <div style="text-align:right;"><span>本期账单</span><strong>¥${c.currentBill.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</strong></div>
          </div>
        </div>
        <div class="ui-metric-row">
          <div><span>已用额度</span><b>¥${c.used.toLocaleString()}</b></div>
          <div><span>信用额度</span><b>¥${c.limit.toLocaleString()}</b></div>
          <div><span>最低还款</span><b>¥${c.minPayment.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</b></div>
        </div>
        <div class="ui-collapse" onclick="toggleDetail('credit-detail')">
          <span>账单详情</span><span class="ui-chevron" id="credit-detail-arrow">⌄</span>
        </div>
        <div id="credit-detail" class="ui-detail" style="display:none;">
          <div class="ui-info-grid">
            <div class="ui-info-row"><span>账单日</span><b>每月${c.billDay}日</b></div>
            <div class="ui-info-row"><span>还款日</span><b>每月${c.dueDay}日</b></div>
            <div class="ui-info-row"><span>卡片状态</span><b>${creditStatus}</b></div>
          </div>
        </div>
      </div>

      <!-- 贷款 -->
      <div id="cardTab-loan" class="card-tab-content" style="display:none;">
        <div class="ui-account-card loan">
          <div class="ui-account-top"><span>${l.type}</span><span>${l.status}</span></div>
          <div class="ui-account-contract">${l.contractNo}</div>
          <div class="ui-account-bottom">
            <div><span>剩余本金</span><strong>¥${l.remaining.toLocaleString()}</strong></div>
            <div style="text-align:right;"><span>月供</span><strong>¥${l.monthlyPayment.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</strong></div>
          </div>
        </div>
        <div class="ui-metric-row">
          <div><span>贷款金额</span><b>¥${l.amount.toLocaleString()}</b></div>
          <div><span>贷款利率</span><b>${l.rate}%</b></div>
          <div><span>贷款状态</span><b>${l.status}</b></div>
        </div>
        <div class="ui-collapse" onclick="toggleDetail('loan-detail')">
          <span>贷款详情</span><span class="ui-chevron" id="loan-detail-arrow">⌄</span>
        </div>
        <div id="loan-detail" class="ui-detail" style="display:none;">
          <div class="ui-info-grid">
            <div class="ui-info-row"><span>放款日期</span><b>${l.startDate}</b></div>
            <div class="ui-info-row"><span>到期日期</span><b>${l.endDate}</b></div>
            <div class="ui-info-row"><span>还款方式</span><b>${l.repayMethod}</b></div>
            <div class="ui-info-row"><span>合同号</span><b>${l.contractNo}</b></div>
          </div>
        </div>
      </div>
    </section>
  `;
}

// 切换卡片Tab
function switchCardTab(type, btn) {
  document.querySelectorAll('.card-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.card-tab-content').forEach(c => c.style.display = 'none');
  const panel = document.getElementById('cardTab-' + type);
  if (panel) panel.style.display = 'block';
}

// 切换详情折叠
function toggleDetail(id) {
  const el = document.getElementById(id);
  const arrow = document.getElementById(id + '-arrow');
  if (el.style.display === 'none') {
    el.style.display = 'block';
    if (arrow) arrow.style.transform = 'rotate(180deg)';
  } else {
    el.style.display = 'none';
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  }
}

function renderUserInfoTxns(u) {
  if (!u.recentTxns || u.recentTxns.length === 0) {
    return '<div class="userinfo-empty">暂无交易记录</div>';
  }
  const dates = u.recentTxns.map(t => t.time.split(' ')[0]).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  return `
    <section class="userinfo-section">
      <div class="ui-card-head">
        <div class="userinfo-section-title">交易记录</div>
        <span class="ui-sub">共 ${u.recentTxns.length} 笔</span>
      </div>
      <div class="ui-segmented ui-segmented-filter">
        <button class="txn-filter-btn active" onclick="filterTxnsByType('all', this)">全部</button>
        <button class="txn-filter-btn" onclick="filterTxnsByType('income', this)">收入</button>
        <button class="txn-filter-btn" onclick="filterTxnsByType('expense', this)">支出</button>
      </div>
      <div class="ui-collapse" onclick="toggleTxnDateFilter()">
        <span>日期筛选</span><span class="ui-chevron" id="txnDateFilterArrow">⌄</span>
      </div>
      <div id="txnDateFilterPanel" class="ui-detail" style="display:none;">
        <div class="ui-filter-row">
          <input type="date" id="txnFilterStart" value="${minDate}" min="${minDate}" max="${maxDate}" class="ui-input">
          <span class="ui-filter-sep">至</span>
          <input type="date" id="txnFilterEnd" value="${maxDate}" min="${minDate}" max="${maxDate}" class="ui-input">
          <button onclick="filterTxnsByDate()" class="ui-btn-primary">筛选</button>
          <button onclick="resetTxnFilter()" class="ui-btn-secondary">重置</button>
        </div>
        <div id="txnFilterResult" class="ui-sub" style="margin-top:8px;"></div>
      </div>
      <div class="txn-list" id="txnListContainer">
        ${u.recentTxns.map(t => renderTxnItem(t)).join('')}
      </div>
    </section>
  `;
}

// 当前筛选类型
let currentTxnFilterType = 'all';

// 按类型筛选交易记录
function filterTxnsByType(type, btn) {
  currentTxnFilterType = type;
  document.querySelectorAll('.txn-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  applyTxnFilters();
}

// 切换日期筛选面板
function toggleTxnDateFilter() {
  const panel = document.getElementById('txnDateFilterPanel');
  const arrow = document.getElementById('txnDateFilterArrow');
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    arrow.style.transform = 'rotate(180deg)';
  } else {
    panel.style.display = 'none';
    arrow.style.transform = 'rotate(0deg)';
  }
}

// 应用所有筛选条件
function applyTxnFilters() {
  const u = mockData.userProfile;
  const container = document.getElementById('txnListContainer');
  if (!container) return;

  let filtered = u.recentTxns;

  // 类型筛选
  if (currentTxnFilterType !== 'all') {
    filtered = filtered.filter(t => t.type === currentTxnFilterType);
  }

  // 日期筛选
  const startDate = document.getElementById('txnFilterStart')?.value;
  const endDate = document.getElementById('txnFilterEnd')?.value;
  if (startDate && endDate) {
    filtered = filtered.filter(t => {
      const txnDate = t.time.split(' ')[0];
      return txnDate >= startDate && txnDate <= endDate;
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="userinfo-empty" style="padding:20px;">该筛选条件下暂无交易记录</div>';
  } else {
    container.innerHTML = filtered.map(t => renderTxnItem(t)).join('');
  }

  // 更新筛选结果统计
  const resultDiv = document.getElementById('txnFilterResult');
  if (resultDiv) {
    const income = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    resultDiv.textContent = `共${filtered.length}笔 · 收入+¥${income.toLocaleString('zh-CN', {minimumFractionDigits: 2})} · 支出-¥${expense.toLocaleString('zh-CN', {minimumFractionDigits: 2})}`;
  }
}

// 渲染单条交易记录
function renderTxnItem(t) {
  return `
    <div class="txn-item">
      <div class="txn-icon ${t.type}">${t.type === 'income' ? '+' : '−'}</div>
      <div class="txn-info">
        <div class="txn-desc">${t.desc}</div>
        <div class="txn-meta">${t.time} · ${t.channel}</div>
      </div>
      <div class="txn-amount ${t.type}">${t.type === 'income' ? '+' : '-'}¥${t.amount.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</div>
    </div>
  `;
}

// 渲染联系人管理页面
// 通讯录与生日联系人双向同步：两边任何一侧的改动都会补齐另一侧
function syncContactsBirthdays() {
  if (!Array.isArray(mockData.contacts)) mockData.contacts = [];
  var u = mockData.userProfile || (mockData.userProfile = {});
  if (!Array.isArray(u.birthdayContacts)) u.birthdayContacts = [];
  var bc = u.birthdayContacts;

  // 生日联系人 → 通讯录：缺人就补一条，已有的补齐关系与生日
  bc.forEach(function (b) {
    if (!b || !b.name) return;
    var full = /^\d{4}-/.test(String(b.birthday || '')) ? b.birthday : ('2026-' + b.birthday);
    var c = mockData.contacts.filter(function (x) { return x.name === b.name; })[0];
    if (c) {
      if (!c.relation) c.relation = b.relation || '朋友';
      if (!c.birthday) c.birthday = full;
    } else {
      mockData.contacts.push({
        name: b.name, phone: '—', account: '', bank: '',
        relation: b.relation || '朋友', birthday: full, fromBirthday: true
      });
    }
  });

  // 通讯录 → 生日联系人：有生日但生日表里没有的补进去
  mockData.contacts.forEach(function (c) {
    if (!c || !c.name || !c.birthday) return;
    if (bc.some(function (b) { return b.name === c.name; })) return;
    bc.push({
      name: c.name,
      birthday: String(c.birthday).slice(5),
      relation: c.relation || '朋友',
      flower: '康乃馨',
      price: 128
    });
  });
  return mockData.contacts;
}
function renderUserInfoContacts(u) {
  const contacts = (typeof syncContactsBirthdays === 'function') ? syncContactsBirthdays() : (mockData.contacts || []);
  return `
    <section class="userinfo-section">
      <div class="ui-card-head">
        <div>
          <div class="userinfo-section-title">联系人</div>
          <div class="ui-sub">共 ${contacts.length} 人</div>
        </div>
        <button class="ui-link" onclick="showContactForm()">添加</button>
      </div>
      ${contacts.length === 0 ? '<div class="userinfo-empty">暂无联系人，点击右上角「添加」开始添加</div>' : ''}
      <div class="ui-contact-list">
        ${contacts.map((c, i) => `
          <div class="ui-contact-row">
            <div class="ui-contact-avatar">${c.name.charAt(0)}</div>
            <div class="ui-contact-main">
              <div class="ui-contact-name">${c.name}<span class="ui-contact-rel">${c.relation || '未设置关系'}</span></div>
              <div class="ui-contact-meta">${c.phone}${c.bank ? ' · ' + c.bank : ''}${c.birthday ? ' · ' + c.birthday : ''}</div>
            </div>
            <div class="ui-contact-actions">
              <button class="ui-link" onclick="showContactForm(${i})">编辑</button>
              <button class="ui-link danger" onclick="deleteContact(${i})">删除</button>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="ui-footnote">联系人数据全局共享，转账、生日提醒等模块均可使用。</div>
    </section>
  `;
}

// 显示添加/编辑联系人表单
function showContactForm(index) {
  const contacts = mockData.contacts || [];
  const c = index !== undefined ? contacts[index] : {};
  const isEdit = index !== undefined;
  const popupId = 'contact-form-' + Date.now();
  const popup = document.createElement('div');
  popup.id = popupId;
  popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  popup.innerHTML = `
    <div style="background:white;border-radius:16px;padding:20px;max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
      <div style="font-size:16px;font-weight:600;text-align:center;margin-bottom:16px;">${isEdit ? '编辑联系人' : '添加联系人'}</div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;font-weight:600;">姓名 *</label>
          <input type="text" id="contactName" value="${c.name || ''}" placeholder="请输入姓名" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
        </div>
        <div>
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;font-weight:600;">手机号 *</label>
          <input type="tel" id="contactPhone" value="${c.phone || ''}" placeholder="请输入手机号" maxlength="11" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
        </div>
        <div>
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;font-weight:600;">银行账号</label>
          <input type="text" id="contactAccount" value="${c.account || ''}" placeholder="请输入银行账号" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;font-family:monospace;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
        </div>
        <div>
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;font-weight:600;">开户行</label>
          <input type="text" id="contactBank" value="${c.bank || ''}" placeholder="如：工商银行" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
        </div>
        <div>
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;font-weight:600;">关系</label>
          <select id="contactRelation" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;background:white;">
            <option value="">请选择关系</option>
            <option value="家人" ${c.relation === '家人' ? 'selected' : ''}>家人</option>
            <option value="朋友" ${c.relation === '朋友' ? 'selected' : ''}>朋友</option>
            <option value="同事" ${c.relation === '同事' ? 'selected' : ''}>同事</option>
            <option value="客户" ${c.relation === '客户' ? 'selected' : ''}>客户</option>
            <option value="其他" ${c.relation === '其他' ? 'selected' : ''}>其他</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;font-weight:600;">生日（选填，用于生日提醒）</label>
          <input type="date" id="contactBirthday" value="${c.birthday || ''}" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
        </div>
        <div>
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;font-weight:600;">备注</label>
          <input type="text" id="contactRemark" value="${c.remark || ''}" placeholder="选填" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="btn btn-primary" style="flex:1;" onclick="saveContact(${index !== undefined ? index : '-1'}, '${popupId}')"> 保存</button>
        <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('${popupId}').remove();">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(popup);
}

// 保存联系人
function saveContact(index, popupId) {
  const name = document.getElementById('contactName')?.value.trim();
  const phone = document.getElementById('contactPhone')?.value.trim();
  const account = document.getElementById('contactAccount')?.value.trim();
  const bank = document.getElementById('contactBank')?.value.trim();
  const relation = document.getElementById('contactRelation')?.value;
  const birthday = document.getElementById('contactBirthday')?.value;
  const remark = document.getElementById('contactRemark')?.value.trim();

  if (!name) { alert('请输入姓名'); return; }
  if (!phone) { alert('请输入手机号'); return; }
  if (phone.length !== 11) { alert('手机号应为11位'); return; }

  if (!mockData.contacts) mockData.contacts = [];
  const contact = { name, phone, account: account || '**** **** **** ****', bank, relation, birthday, remark };

  if (index >= 0) {
    mockData.contacts[index] = contact;
  } else {
    mockData.contacts.push(contact);
  }

  // 同步到鲜花模块的生日联系人（如果有生日）
  if (!mockData.userProfile.birthdayContacts) mockData.userProfile.birthdayContacts = [];
  if (birthday) {
    const existingIndex = mockData.userProfile.birthdayContacts.findIndex(c => c.name === name);
    const birthdayContact = {
      name,
      birthday: birthday.split('-').slice(1).join('-'), // 转换为 MM-DD 格式
      relation: relation || '朋友',
      flower: '康乃馨',
      price: 128
    };
    if (existingIndex >= 0) {
      mockData.userProfile.birthdayContacts[existingIndex] = birthdayContact;
    } else {
      mockData.userProfile.birthdayContacts.push(birthdayContact);
    }
  } else {
    // 如果没有生日，从生日联系人中移除
    mockData.userProfile.birthdayContacts = mockData.userProfile.birthdayContacts.filter(c => c.name !== name);
  }

  if (typeof syncContactsBirthdays === 'function') syncContactsBirthdays();
  saveUserData();
  document.getElementById(popupId)?.remove();
  renderUserInfoPage();
}

// 删除联系人
function deleteContact(index) {
  if (!confirm('确定要删除该联系人吗？')) return;
  const contact = mockData.contacts[index];
  mockData.contacts.splice(index, 1);
  // 同步从鲜花模块的生日联系人中删除
  if (mockData.userProfile.birthdayContacts && contact) {
    mockData.userProfile.birthdayContacts = mockData.userProfile.birthdayContacts.filter(c => c.name !== contact.name);
  }
  saveUserData();
  renderUserInfoPage();
}

// 跳转到联系人管理Tab
function goToContactsTab() {
  showUserInfoFromTopbar();
  setTimeout(() => {
    const tabs = document.querySelectorAll('.userinfo-tab');
    tabs.forEach(t => t.classList.remove('active'));
    const contactTab = Array.from(tabs).find(t => t.textContent.includes('联系人'));
    if (contactTab) {
      contactTab.classList.add('active');
      currentUserInfoTab = 'contacts';
      renderUserInfoPage();
    }
  }, 300);
}

// 按日期筛选交易记录
function filterTxnsByDate() {
  applyTxnFilters();
}

// 重置日期筛选
function resetTxnFilter() {
  const u = mockData.userProfile;
  const dates = u.recentTxns.map(t => t.time.split(' ')[0]).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  document.getElementById('txnFilterStart').value = minDate;
  document.getElementById('txnFilterEnd').value = maxDate;
  applyTxnFilters();
}

// 辅助函数：添加交易记录并更新余额
function addTransaction(type, amount, desc, channel, deductBalance) {
  if (deductBalance === undefined) deductBalance = true;
  const u = mockData.userProfile;

  // 最后一道防线：借记卡不允许被扣成负数（透支）。
  // 余额门禁应在前置校验拦下，此处为兜底，防止任何未走门禁的调用击穿账户。
  // 校验必须放在记账之前，否则被拒绝时会在流水里留下一条实际未发生的假记录。
  if (deductBalance && amount > 0 && type !== 'income') {
    const avail = Number(u.debitCard.available);
    if (avail < amount) {
      console.warn('[风控兜底] 可用余额不足，已拒绝扣款。可用 ¥' + avail + '，需要 ¥' + amount);
      return false;
    }
  }

  const now = new Date();
  const timeStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');
  u.recentTxns.unshift({ type, amount, desc, time: timeStr, channel });
  if (u.recentTxns.length > 50) u.recentTxns.pop();
  if (deductBalance && amount > 0) {
    if (type === 'income') {
      u.debitCard.balance += amount;
      u.debitCard.available += amount;
      u.debitCard.todayIncome += amount;
    } else {
      u.debitCard.balance -= amount;
      u.debitCard.available -= amount;
      u.debitCard.todayExpense += amount;
    }
  }
  saveUserData();
  return true;
}

function quickAction(type) {
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.style.display = 'none';
  switch(type) {
    case 'chat': break;
    case 'transfer': showTransferForm(); break;
    case 'scheduled': showScheduledTransfers(); break;
    case 'manualReviews': showManualReviews(); break;
    case 'adminReview': showAdminReviewPanel(); break;
    case 'bill': showBillAnalysis(); break;
    case 'wealth': showProductList(); break;
    case 'card': showCardLimit(); break;
    case 'subscribe': guideStartSubManage(); break;
    case 'subAdd': guideStartSubAdd(); break;
    case 'subCancel': guideStartSubCancel(); break;
    case 'flowerOrder': guideStartBirthdayFlower(); break;
    case 'userinfo': showUserInfo(); break;
    case 'risk': startRiskAssessment(); break;
    case 'abnormal': showAbnormalAlert(); break;
    case 'holdings': guideStartHoldings(); break;
    case 'transferHistory': showTransferHistory(); break;
    case 'budget': showBudget(); break;
    case 'agent': runAgentWorkflow('帮我转账100元然后查询余额'); break;
    case 'smartLimit': showSmartLimit(); break;
    case 'birthday': guideStartBirthdayFlower(); break;
    case 'report': showFinanceReport(); break;
    case 'security': showSecurityCenter(); break;
    case 'batchTransfer': showBatchTransfer(); break;
    case 'investment': showInvestmentPlans(); break;
    case 'installment': showInstallmentCalculator(); break;
    // 全部服务（+）新分组：转账 / 卡片
    case 'aa': openAAForm(); break;
    case 'transferName': guideStartNameTransfer(); break;
    case 'transferPhone': guideStartPhoneTransfer(); break;
    case 'bankTransfer': showTransferForm('bank'); break;
    case 'cardApply': guideStartCardApply(); break;
    case 'myCards': showCardMyCards(); break;
    case 'cardLimit': guideStartCardLimitAdjust(); break;
    case 'txnLimit': guideStartTxnLimit(); break;
    case 'cardLost': guideStartCardLost(); break;
  }
}

// 大额资金操作统一验证：金额达到 T2/T3/T4 时复用安全验证弹窗
// T4（≥ ¥50,000）验证通过后只提交人工复核，不立即扣款。
function manualReviewEsc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function manualReviewMoney(v) {
  return '¥' + (Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function submitManualReview(opts) {
  var o = opts || {};
  var record = {
    id: 'MR' + Date.now() + Math.floor(Math.random() * 1000),
    amount: Number(o.amount) || 0,
    purpose: o.purpose || '大额交易',
    source: o.source || 'UI',
    items: Array.isArray(o.items) ? o.items : [],
    actions: Array.isArray(o.actions) ? o.actions : [],
    status: '待人工复核',
    submittedAt: new Date().toLocaleString('zh-CN'),
    note: '未扣款；人工复核通过后才会执行'
  };
  if (!mockData.userProfile.manualReviews) mockData.userProfile.manualReviews = [];
  mockData.userProfile.manualReviews.unshift(record);
  saveUserData();
  if (!o.silent) {
    appendMessage(manualReviewCardHtml(record));
    scrollToBottom();
  }
  return record;
}

function manualReviewCardHtml(record) {
  var r = record || {};
  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手</div><div class="msg-bubble agent-bubble">' +
    '<div class="bank-result">' +
    '<div class="bank-result-title">已提交人工复核</div>' +
    '<div class="bank-result-amount">' + manualReviewMoney(r.amount) + '</div>' +
    '<div class="bank-result-note">本次操作未扣款。复核通过后才会执行。</div>' +
    '<div style="margin-top:10px;"><button class="ui-link" onclick="showManualReviews()">查看复核</button></div>' +
    '</div></div></div>';
}

function showManualReviews() {
  var list = (mockData.userProfile.manualReviews || []).slice();
  var pending = list.filter(function (r) { return r.status === '待人工复核'; }).length;
  var rows = list.map(function (r) {
    var isPending = r.status === '待人工复核';
    var statusClass = r.status === '已通过' ? 'approved' : r.status === '已拒绝' ? 'rejected' : r.status === '审批失败' ? 'failed' : 'review';
    return '<div class="bank-sched-item">' +
      '<div class="bank-sched-date" style="background:' + (isPending ? '#FFF7ED' : (r.status === '已通过' ? '#ECFDF3' : '#FEF3F2')) + ';color:' + (isPending ? '#B54708' : (r.status === '已通过' ? '#15803D' : '#B42318')) + ';"><b>' + (isPending ? '待' : (r.status === '已通过' ? '已' : '拒')) + '</b><small>' + (isPending ? '复核' : '审批') + '</small></div>' +
      '<div class="bank-sched-main"><b>' + manualReviewEsc(r.purpose) + '</b><small>' + manualReviewEsc(r.submittedAt) + '</small></div>' +
      '<div class="bank-sched-side"><span class="bank-status ' + statusClass + '">' + manualReviewEsc(r.status) + '</span><b style="font-size:12px;color:#334155;">' + manualReviewMoney(r.amount) + '</b></div>' +
      '</div>';
  }).join('');
  var empty = '<div class="bank-sched-empty">暂无人工复核申请。<br>大额交易提交后会出现在这里，复核通过前不会扣款。</div>';
  var old = document.getElementById('manual-review-list-card');
  if (old) old.remove();
  appendMessage('<div class="message" id="manual-review-list-card"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手</div><div class="msg-bubble agent-bubble">' +
    '<div class="bank-page-head"><div><div class="bank-page-title">人工复核</div><div class="bank-page-sub">待审批 ' + pending + ' 笔 · 共 ' + list.length + ' 笔</div></div>' +
    '<button class="ui-link" onclick="showAdminReviewPanel()">管理员审批</button></div>' +
    '<div class="bank-sched-list">' + (rows || empty) + '</div>' +
    '<div class="bank-result-note">复核通过后执行；在此之前不扣款。</div>' +
    '</div></div></div>');
  scrollToBottom();
}

function manualReviewActionAmount(a) {
  if (!a) return 0;
  var args = a.args || {};
  if (a.tool === 'life.orderFlower' || a.tool === 'life.orderCake') return Number(args.price) || 0;
  return Number(args.amount) || 0;
}

async function adminApproveReview(id) {
  var list = mockData.userProfile.manualReviews || [];
  var record = list.find(function (r) { return r.id === id; });
  if (!record || record.status !== '待人工复核') return;

  var actions = Array.isArray(record.actions) ? record.actions : [];
  var before = Number(mockData.userProfile.debitCard.available) || 0;

  if (actions.length === 0) {
    record.status = '已通过';
    record.reviewedAt = new Date().toLocaleString('zh-CN');
    record.note = '审批通过；该申请未绑定自动执行指令，请用户重新发起';
    saveUserData();
    showAdminReviewPanel();
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">管理员审批</div><div class="msg-bubble agent-bubble"><div class="bank-result">' +
      '<div class="bank-result-title">已通过</div>' +
      '<div class="bank-result-amount">' + manualReviewMoney(record.amount) + '</div>' +
      '<div class="bank-result-note">该申请未绑定可执行的业务指令，余额未变动，请用户重新发起。</div>' +
      '</div></div></div></div>');
    scrollToBottom();
    return;
  }

  var total = actions.reduce(function (s, a) { return s + manualReviewActionAmount(a); }, 0);
  if (total > before) {
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">管理员审批</div><div class="msg-bubble agent-bubble"><div class="bank-result"><div class="bank-result-title" style="color:#B42318;">无法通过</div><div class="bank-result-note">当前可用余额 ¥' + before.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + '，不足以执行 ¥' + total.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + '。申请仍保持待审批。</div></div></div></div></div>');
    scrollToBottom();
    return;
  }

  var failed = null;
  var summaries = [];
  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];
    try {
      var res;
      if (a.tool === 'card.applyCard' && typeof approveCardApplication === 'function') {
        res = approveCardApplication(a.args || {});
      } else if (a.tool === 'card.applyLimit' && typeof applyCardLimitAdjustment === 'function') {
        res = applyCardLimitAdjustment(a.args || {});
      } else {
        res = await callAgentTool(a.tool, a.args || {});
      }
      if (!res || res.ok === false) { failed = res || { ok: false, summary: '执行失败' }; break; }
      summaries.push(res.summary || '已完成');
    } catch (e) {
      failed = { ok: false, summary: (e && e.message) || '执行失败' };
      break;
    }
  }

  if (failed) {
    record.status = '审批失败';
    record.reviewedAt = new Date().toLocaleString('zh-CN');
    record.note = '执行失败：' + (failed.summary || '业务执行异常');
    saveUserData();
    showAdminReviewPanel();
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">管理员审批</div><div class="msg-bubble agent-bubble"><div class="bank-result"><div class="bank-result-title" style="color:#B42318;">审批执行失败</div><div class="bank-result-note">' + manualReviewEsc(failed.summary || '业务执行异常') + '</div></div></div></div></div>');
    scrollToBottom();
    return;
  }

  var isCardApply = actions.some(function (a) { return a.tool === 'card.applyCard'; });
  if (isCardApply) {
    var applyArgs = (actions.filter(function (a) { return a.tool === 'card.applyCard'; })[0] || {}).args || {};
    record.status = '已通过';
    record.reviewedAt = new Date().toLocaleString('zh-CN');
    record.note = '已通过；' + (summaries.join('；') || '已核发新卡');
    saveUserData();
    showAdminReviewPanel();
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">管理员审批</div><div class="msg-bubble agent-bubble"><div class="bank-result">' +
      '<div class="bank-result-title">信用卡已核发</div>' +
      '<div class="bank-result-amount">¥' + agentFmtInt(applyArgs.limit || 0) + '</div>' +
      '<div class="bank-confirm-rows">' +
      '<div><span>卡种</span><b>' + manualReviewEsc(applyArgs.cardType || '信用卡') + '</b></div>' +
      '<div><span>主要用途</span><b>' + manualReviewEsc(applyArgs.purpose || '日常消费') + '</b></div>' +
      '<div><span>当前状态</span><b style="color:#15803D;">已发卡</b></div>' +
      '</div>' +
      '<div style="margin-top:10px;"><button class="ui-link" onclick="showCardMyCards()">查看我的卡片</button></div>' +
      '</div></div></div></div>');
    scrollToBottom();
    return;
  }

  var isCardLimit = actions.some(function (a) { return a.tool === 'card.applyLimit'; });
  if (isCardLimit) {
    var card = mockData.userProfile.creditCard;
    record.status = '已通过';
    record.reviewedAt = new Date().toLocaleString('zh-CN');
    record.note = '已通过；信用卡额度已调整为 ¥' + agentFmtInt(card.effectiveLimit) + '，可用额度 ¥' + agentFmtInt(card.available);
    saveUserData();
    showAdminReviewPanel();
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">管理员审批</div><div class="msg-bubble agent-bubble"><div class="bank-result">' +
      '<div class="bank-result-title">额度调整已生效</div>' +
      '<div class="bank-result-amount">¥' + agentFmtInt(card.effectiveLimit) + '</div>' +
      '<div class="bank-confirm-rows"><div><span>调整方向</span><b>' + (card.limitApplyDirection === 'up' ? '提额' : '降额') + '</b></div><div><span>可用额度</span><b>¥' + agentFmtInt(card.available) + '</b></div></div>' +
      '<div style="margin-top:10px;"><button class="ui-link" onclick="showCardLimit()">查看额度</button></div>' +
      '</div></div></div></div>');
    scrollToBottom();
    return;
  }

  var after = Number(mockData.userProfile.debitCard.available) || 0;
  record.status = '已通过';
  record.reviewedAt = new Date().toLocaleString('zh-CN');
  record.note = '已通过并执行；可用余额 ¥' + before.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + ' → ¥' + after.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
  saveUserData();
  showAdminReviewPanel();
  appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">管理员审批</div><div class="msg-bubble agent-bubble"><div class="bank-result">' +
    '<div class="bank-result-title">审批通过，已执行</div>' +
    '<div class="bank-result-amount">' + manualReviewMoney(record.amount) + '</div>' +
    '<div class="bank-confirm-rows"><div><span>可用余额</span><b>¥' + before.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + ' → ¥' + after.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) + '</b></div></div>' +
    '<div class="bank-result-note">' + summaries.map(manualReviewEsc).join('；') + '</div>' +
    '<div style="margin-top:10px;"><button class="ui-link" onclick="goToTxnsTab()">查看交易记录</button></div>' +
    '</div></div></div></div>');
  scrollToBottom();
}

function adminRejectReview(id) {
  var list = mockData.userProfile.manualReviews || [];
  var record = list.find(function (r) { return r.id === id; });
  if (!record || record.status !== '待人工复核') return;
  record.status = '已拒绝';
  record.reviewedAt = new Date().toLocaleString('zh-CN');
  record.note = '管理员已拒绝，账户未扣款';
  if (record.actions && record.actions.some(function (a) { return a.tool === 'card.applyCard'; })) {
    var applyAction = record.actions.filter(function (a) { return a.tool === 'card.applyCard'; })[0] || {};
    if (typeof rejectCardApplication === 'function') rejectCardApplication(applyAction.args || {});
    record.status = '已拒绝';
    record.reviewedAt = new Date().toLocaleString('zh-CN');
    record.note = '管理员已拒绝该卡片申请，未核发新卡';
    saveUserData();
    showAdminReviewPanel();
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">管理员审批</div><div class="msg-bubble agent-bubble"><div class="bank-result">' +
      '<div class="bank-result-title" style="color:#B42318;">信用卡申请未通过</div>' +
      '<div class="bank-result-amount">¥' + agentFmtInt((applyAction.args || {}).limit || 0) + '</div>' +
      '<div class="bank-result-note">本次未核发新卡，你可调整资料后重新申请。</div>' +
      '<div style="margin-top:10px;"><button class="ui-link" onclick="guideStartCardApply()">重新申请</button></div>' +
      '</div></div></div></div>');
    scrollToBottom();
    return;
  }

  if (record.actions && record.actions.some(function (a) { return a.tool === 'card.applyLimit'; })) {
    var card = mockData.userProfile.creditCard;
    card.limitApplyStatus = '已拒绝';
    card.limitApplyRejectedAt = record.reviewedAt;
    saveUserData();
    showAdminReviewPanel();
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">管理员审批</div><div class="msg-bubble agent-bubble"><div class="bank-result">' +
      '<div class="bank-result-title" style="color:#B42318;">额度调整未通过</div>' +
      '<div class="bank-result-amount">¥' + agentFmtInt(card.effectiveLimit) + '</div>' +
      '<div class="bank-result-note">当前生效额度保持不变。</div>' +
      '<div style="margin-top:10px;"><button class="ui-link" onclick="showCardLimit()">查看额度</button></div>' +
      '</div></div></div></div>');
    scrollToBottom();
    return;
  }
  saveUserData();
  showAdminReviewPanel();
  appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">管理员审批</div><div class="msg-bubble agent-bubble"><div class="bank-result">' +
    '<div class="bank-result-title" style="color:#B42318;">已拒绝</div>' +
    '<div class="bank-result-amount">' + manualReviewMoney(record.amount) + '</div>' +
    '<div class="bank-result-note">该笔交易未执行，账户未扣款。</div>' +
    '</div></div></div></div>');
  scrollToBottom();
}

function showAdminReviewPanel() {
  var list = (mockData.userProfile.manualReviews || []).slice();
  var pending = list.filter(function (r) { return r.status === '待人工复核'; }).length;
  var available = Number(mockData.userProfile.debitCard.available) || 0;
  var creditAvailable = Number((mockData.userProfile.creditCard || {}).available) || 0;
  list.sort(function (a, b) {
    var ap = a.status === '待人工复核' ? 0 : 1;
    var bp = b.status === '待人工复核' ? 0 : 1;
    return ap - bp;
  });
  var rows = list.map(function (r) {
    var isPending = r.status === '待人工复核';
    var statusClass = r.status === '已通过' ? 'approved' : r.status === '已拒绝' ? 'rejected' : r.status === '审批失败' ? 'failed' : 'review';
    return '<div class="admin-review-row">' +
      '<div class="admin-review-main">' +
      '<div class="admin-review-title">' + manualReviewEsc(r.purpose) + '<span class="bank-status ' + statusClass + '">' + manualReviewEsc(r.status) + '</span></div>' +
      '<div class="admin-review-meta">' + manualReviewEsc(r.source || 'UI') + ' · ' + manualReviewEsc(r.submittedAt) + ' · ' + manualReviewEsc(r.id) + '</div>' +
      '<div class="admin-review-amount">' + manualReviewMoney(r.amount) + '</div>' +
      '</div>' +
      (isPending
        ? '<div class="admin-review-btns"><button class="ui-btn-primary" onclick="adminApproveReview(\'' + r.id + '\')">通过</button><button class="ui-btn-secondary" onclick="adminRejectReview(\'' + r.id + '\')">拒绝</button></div>'
        : '<div class="admin-review-btns admin-review-done">已处理</div>') +
      '</div>';
  }).join('');
  var old = document.getElementById('admin-review-panel-card');
  if (old) old.remove();
  appendMessage('<div class="message" id="admin-review-panel-card"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">管理员审批</div><div class="msg-bubble agent-bubble">' +
    '<div class="bank-page-head"><div><div class="bank-page-title">管理员审批</div><div class="bank-page-sub">待审批 ' + pending + ' 笔 · 储蓄卡可用 ' + manualReviewMoney(available) + ' · 信用卡可用 ' + manualReviewMoney(creditAvailable) + '</div></div>' +
    '<button class="ui-link" onclick="showAdminReviewPanel()">刷新</button></div>' +
    (rows || '<div class="bank-sched-empty">暂无待审批申请。</div>') +
    '<div class="bank-result-note">审批通过后执行；拒绝不扣款。</div>' +
    '</div></div></div>');
  scrollToBottom();
}


function verifyAmountRisk(amount, purpose, actions) {
  return new Promise(function (resolve) {
    var amt = Number(amount) || 0;
    if (!(amt > 0) || typeof agentTransferTier !== 'function') {
      resolve({ ok: true, tier: null, pendingReview: false });
      return;
    }
    var tier;
    try {
      tier = agentTransferTier(amt, null);
    } catch (e) {
      resolve({ ok: true, tier: null, pendingReview: false });
      return;
    }
    if (!tier || tier.rank < 2) {
      resolve({ ok: true, tier: tier, pendingReview: false });
      return;
    }
    if (typeof showSecurityVerification !== 'function') {
      resolve({ ok: false, tier: tier, pendingReview: false });
      return;
    }
    var label = tier.needManual
      ? 'T4 大额交易 · 二次验证后提交人工复核'
      : (tier.needVerify ? 'T3 大额交易 · 二次验证' : 'T2 交易 · 密码确认');
    showSecurityVerification(purpose + ' ' + manualReviewMoney(amt) + ' · ' + label, function (ok) {
      if (!ok) {
        resolve({ ok: false, tier: tier, pendingReview: false });
        return;
      }
      if (tier.needManual) {
        var review = submitManualReview({ amount: amt, purpose: purpose, source: 'UI', actions: Array.isArray(actions) ? actions : [], tier: tier });
        resolve({ ok: false, tier: tier, pendingReview: true, reviewId: review && review.id });
        return;
      }
      resolve({ ok: true, tier: tier, pendingReview: false });
    });
  });
}

// 新对话：使用应用内确认弹层，避免移动端/部分浏览器把 setTimeout 里的原生 confirm 拦截掉
function resetChat() {
  const old = document.getElementById('resetChatDialog');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'resetChatDialog';
  overlay.className = 'bank-dialog-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'resetChatDialogTitle');
  overlay.innerHTML = `
    <div class="bank-dialog">
      <div class="bank-dialog-icon" style="background:#EAF2FB;color:#0B4F9C;">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z"/></svg>
      </div>
      <div class="bank-dialog-title" id="resetChatDialogTitle">新对话</div>
      <div class="bank-dialog-desc">将清空当前对话记录，开始一个新的对话。</div>
      <div class="bank-dialog-note">已创建的定时转账任务不会被取消，账户与交易数据也不会被清除。</div>
      <div class="bank-dialog-actions">
        <button class="btn btn-secondary" onclick="closeResetChatConfirm()">取消</button>
        <button class="btn btn-primary" onclick="confirmResetChat()">开始新对话</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeResetChatConfirm();
  });
  document.body.appendChild(overlay);
  const ok = overlay.querySelector('.btn-primary');
  if (ok) setTimeout(function () { ok.focus(); }, 30);
}

function closeResetChatConfirm() {
  const el = document.getElementById('resetChatDialog');
  if (el) el.remove();
}

function confirmResetChat() {
  closeResetChatConfirm();
  performResetChat();
}

// 实际执行重置
function performResetChat() {
  const userInfoPage = document.getElementById('userInfoPage');
  if (userInfoPage && userInfoPage.classList.contains('show')) closeUserInfoPage();
  const chatInner = document.getElementById('chatInner');
  if (chatInner) {
    chatInner.innerHTML = '';
  }
  // 清空对话上下文
  conversationContext = [];
  currentDialogState = null;
  // 清空 Agent 的多轮上下文与待确认计划
  if (typeof agentLLMClearHistory === 'function') agentLLMClearHistory();
  // 清空会话级上下文记忆（画像/财务/决策/规划结论）
  if (typeof agentSessionReset === 'function') agentSessionReset();
  // 清空输入框
  const userInput = document.getElementById('userInput');
  if (userInput) userInput.value = '';
  // 重置当前模块为chat
  currentModule = 'chat';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const chatNav = document.querySelector('.nav-item[onclick*="chat"]');
  if (chatNav) chatNav.classList.add('active');
  showWelcomeMessage();
  scrollToTop();
}


// ========== 极致版：安全中心 ==========
function showSecurityCenter() {
  const u = mockData.userProfile;
  const securityScore = 85;
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p>️ <strong>安全中心</strong></p>
          <div class="data-card" style="background:linear-gradient(135deg,#11998e,#38ef7d);color:white;border:none;text-align:center;">
            <div style="font-size:13px;opacity:0.9;">安全评分</div>
            <div style="font-size:42px;font-weight:700;margin:5px 0;">${securityScore}</div>
            <div style="font-size:12px;opacity:0.9;">${securityScore >= 80 ? '安全等级：高' : securityScore >= 60 ? '安全等级：中' : '安全等级：低'}</div>
          </div>
          <div class="data-card" style="margin-top:12px;">
            <div class="data-card-title"> 验证方式</div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f0f0f0;">
              <div>
                <div style="font-weight:600;"> 交易密码</div>
                <div style="font-size:12px;color:#999;">已设置 · 6位数字密码</div>
              </div>
              <span style="color:#22c55e;font-size:12px;">已开启</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f0f0f0;">
              <div>
                <div style="font-weight:600;"> 指纹验证</div>
                <div style="font-size:12px;color:#999;">快捷支付 · 免输密码</div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="toggleFingerprint(this)">开启</button>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;">
              <div>
                <div style="font-weight:600;"> 短信验证</div>
                <div style="font-size:12px;color:#999;">大额交易 · 短信确认</div>
              </div>
              <span style="color:#22c55e;font-size:12px;">已开启</span>
            </div>
          </div>
          <div class="data-card" style="margin-top:12px;">
            <div class="data-card-title"> 登录设备管理</div>
            <div style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
              <div style="display:flex;justify-content:space-between;">
                <div><span style="font-weight:600;"> iPhone 15 Pro</span> <span style="background:#dcfce7;color:#16a34a;font-size:10px;padding:1px 6px;border-radius:4px;margin-left:6px;">当前设备</span></div>
                <div style="font-size:12px;color:#999;">刚刚在线</div>
              </div>
              <div style="font-size:12px;color:#666;margin-top:4px;">广东清远 · iOS 17.5</div>
            </div>
            <div style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
              <div style="display:flex;justify-content:space-between;">
                <div><span style="font-weight:600;"> MacBook Pro</span></div>
                <div style="font-size:12px;color:#999;">2小时前</div>
              </div>
              <div style="font-size:12px;color:#666;margin-top:4px;">广东广州 · macOS 14.0</div>
            </div>
            <div style="padding:10px 0;">
              <div style="display:flex;justify-content:space-between;">
                <div><span style="font-weight:600;"> iPad Air</span></div>
                <div style="font-size:12px;color:#999;">3天前</div>
              </div>
              <div style="font-size:12px;color:#666;margin-top:4px;">广东深圳 · iPadOS 17.4</div>
            </div>
          </div>
          <div style="margin-top:15px;">
            <button class="btn btn-danger" style="width:100%;" onclick="appendMessage('<div class=\\'message\\'><div class=\\'msg-avatar ai\\'>🤖</div><div class=\\'msg-content\\'><div class=\\'msg-name\\'>智能金融助手</div><div class=\\'msg-bubble\\'>🔒 已退出所有其他设备登录，仅保留当前设备。</div></div></div>');scrollToBottom();">🚪 退出其他设备登录</button>
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}

function toggleFingerprint(btn) {
  if (btn.textContent === '开启') {
    btn.textContent = '已开启';
    btn.style.background = '#22c55e';
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">👆 <strong>指纹验证已开启</strong><br>现在可以使用指纹快速完成支付验证，无需输入密码。</div></div></div>`);
  } else {
    btn.textContent = '开启';
    btn.style.background = '';
  }
  scrollToBottom();
}

