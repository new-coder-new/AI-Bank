// ==========================================================================
//  经典脚本模块（TypeScript 源码，noCheck 转译）
//  编译产物：js/flows/budget.js
//  说明：本层为「全局函数 + 动态状态」结构，采用 noCheck 转译；
//        对外符号统一在 types/global.d.ts 声明。
// ==========================================================================

// ========== 预算管理（多周期同时生效版） ==========
const PERIOD_LABELS = { day: '每日', week: '每周', month: '每月', year: '每年' };
const PERIOD_ORDER = ['day', 'week', 'month', 'year'];

// 计算某周期的已使用金额
function calcPeriodUsed(period) {
  const txns = mockData.userProfile.recentTxns || [];
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const localDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  let totalUsed = 0;

  if (period === 'day') {
    totalUsed = txns.filter(t => t.type === 'expense' && t.time.startsWith(localDate)).reduce((s, t) => s + t.amount, 0);
  } else if (period === 'week') {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    totalUsed = txns.filter(t => t.type === 'expense' && new Date(t.time) >= weekStart).reduce((s, t) => s + t.amount, 0);
  } else if (period === 'month') {
    // 月度口径与服务端/账单分析保持一致：用账单分类合计，而不是最近 50 条流水
    const bills = mockData.bills && mockData.bills.expense;
    if (Array.isArray(bills)) {
      totalUsed = bills.reduce((s, x) => s + (Number(x.value) || 0), 0);
    } else {
      const monthStart = now.getFullYear() + '-' + pad(now.getMonth() + 1);
      totalUsed = txns.filter(t => t.type === 'expense' && t.time.startsWith(monthStart)).reduce((s, t) => s + t.amount, 0);
    }
  } else if (period === 'year') {
    // 年度 = 历史月份（排除本月，避免与 bills 重复）+ 本月账单
    const currentMonthLabel = now.getFullYear() + '年' + (now.getMonth() + 1) + '月';
    const history = Array.isArray(mockData.monthlyHistory) ? mockData.monthlyHistory : [];
    totalUsed = history
      .filter(m => m && m.month !== currentMonthLabel)
      .reduce((s, m) => s + (Number(m.expense) || 0), 0);
    const bills = mockData.bills && mockData.bills.expense;
    if (Array.isArray(bills)) totalUsed += bills.reduce((s, x) => s + (Number(x.value) || 0), 0);
  }
  return totalUsed;
}

// 对话一键设置预算：自动解析金额和周期
function smartBudgetSet(text) {
  let amount = 0;
  let period = null;

  // 解析周期
  if (/每日|每天|日预算|按天/.test(text)) period = 'day';
  else if (/每周|每星期|周预算|按周/.test(text)) period = 'week';
  else if (/每年|年度|年预算|按年/.test(text)) period = 'year';
  else if (/每月|月度|月预算|按月|这个月|本月/.test(text)) period = 'month';

  // 解析金额：支持千分位与万/亿/千单位（「2万」不能只取 2）
  const normalized = String(text || '').replace(/,/g, '');
  const amountMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(亿|万|w|W|千|k|K)?/);
  if (amountMatch) {
    amount = parseFloat(amountMatch[1]);
    const unit = amountMatch[2];
    if (unit === '亿') amount *= 100000000;
    else if (unit === '万' || unit === 'w' || unit === 'W') amount *= 10000;
    else if (unit === '千' || unit === 'k' || unit === 'K') amount *= 1000;
  }

  // 中文数字
  if (!(amount > 0)) {
    const cnMatch = text.match(/([一二两三四五六七八九十百千万]+)\s*[元块]?/);
    if (cnMatch) {
      let cn = cnMatch[1];
      if (cn.includes('万')) amount = parseFloat(cn.replace('万', '')) * 10000;
      else if (cn.includes('千')) amount = parseFloat(cn.replace('千', '')) * 1000;
      else if (cn.includes('百')) amount = parseFloat(cn.replace('百', '')) * 100;
    }
  }

  if (amount > 0 && period) {
    const periodLabel = PERIOD_LABELS[period] || '每月';
    // 与一键式对话的 budget.set 工具保持一致：先确认，再写入并同步后端
    if (!confirm(`将${periodLabel}预算设置为 ¥${amount.toLocaleString()}？`)) return;
    // 确保 budgets 对象存在
    if (!mockData.userProfile.budgets || typeof mockData.userProfile.budgets !== 'object') {
      mockData.userProfile.budgets = {};
    }
    // 设置对应周期的预算（不影响其他周期）
    mockData.userProfile.budgets[period] = amount;
    saveUserData();
    if (typeof apiBudgetSet === 'function') apiBudgetSet(amount, period);
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
      <p><strong>${periodLabel}预算已设置</strong></p>
      <div class="data-card" style="background:linear-gradient(135deg,#f0fdf4,#ecfdf5);border-color:#bbf7d0;">
        <div class="data-row"><span class="data-label">预算周期</span><span class="data-value" style="font-weight:600;">${periodLabel}</span></div>
        <div class="data-row"><span class="data-label">预算金额</span><span class="data-value" style="font-weight:700;font-size:16px;color:#22c55e;">¥${amount.toLocaleString()}</span></div>
      </div>
    </div></div></div>`);
    scrollToBottom();
  } else if (!period) {
    // 没指定周期，弹出设置表单
    showBudgetSetting();
  } else {
    // 没解析到金额，弹出设置表单并预填周期
    showBudgetSetting(period);
  }
}

function showBudget() {
  const budgets = mockData.userProfile.budgets || {};
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p><strong>预算管理</strong></p>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-size:13px;color:#666;">日/周/月/年预算同时生效</span>
            <button class="btn btn-primary btn-sm" onclick="showBudgetSetting()">修改预算</button>
          </div>
          ${PERIOD_ORDER.map(period => {
            const limit = budgets[period] || 0;
            if (limit <= 0) return '';
            const used = calcPeriodUsed(period);
            const remaining = limit - used;
            const over = used > limit;
            const percent = limit > 0 ? (used / limit * 100) : 0;
            const statusColor = over ? '#ef4444' : percent >= 70 ? '#f59e0b' : '#22c55e';
            const statusText = over ? '已超支' : used >= limit ? '已达预算' : percent >= 90 ? '即将超支' : percent >= 70 ? '注意控制' : '正常';
            const remainingText = over ? `超出 ¥${(used - limit).toLocaleString()}` : `剩余 ¥${Math.max(remaining, 0).toLocaleString()}`;
            return `
              <div style="background:#fafbfc;border:1px solid #f0f0f0;border-radius:10px;padding:12px;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                  <span style="font-size:13px;font-weight:600;color:#333;">${PERIOD_LABELS[period]}预算</span>
                  <span style="font-size:11px;color:${statusColor};font-weight:600;">${statusText}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                  <span style="color:#666;">已用 <strong style="color:${over ? '#ef4444' : '#333'};">¥${used.toLocaleString()}</strong></span>
                  <span style="color:#666;">预算 ¥${limit.toLocaleString()}</span>
                </div>
                <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin:6px 0;">
                  <div style="height:100%;width:${Math.min(percent, 100)}%;background:${statusColor};border-radius:3px;transition:width 0.3s;"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:11px;">
                  <span style="color:${over ? '#ef4444' : '#22c55e'};">${remainingText}</span>
                  <span style="color:#999;">${percent.toFixed(1)}%</span>
                </div>
              </div>
            `;
          }).join('')}
          ${PERIOD_ORDER.every(p => !budgets[p] || budgets[p] <= 0) ? '<div style="text-align:center;padding:20px;color:#999;font-size:13px;">暂无预算设置，点击"修改预算"或直接说"设置每月预算3000元"</div>' : ''}
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}

function showBudgetSetting(prefillPeriod) {
  const budgets = mockData.userProfile.budgets || {};
  const formDiv = document.createElement('div');
  formDiv.id = 'budgetSettingPopup';
  formDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;';
  formDiv.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
      <div style="font-size:16px;font-weight:600;text-align:center;margin-bottom:6px;">设置预算</div>
      <p style="font-size:12px;color:#666;text-align:center;margin-bottom:16px;">日/周/月/年预算可同时设置，独立生效；留空表示不设置。</p>
      
      ${PERIOD_ORDER.map(period => `
        <div style="margin-bottom:12px;">
          <label style="display:block;font-size:12px;color:#666;margin-bottom:6px;font-weight:600;">${PERIOD_LABELS[period]}预算（元）</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:16px;color:#666;">¥</span>
            <input type="number" id="budget-${period}" value="${budgets[period] || ''}" min="0" placeholder="不设置请留空" style="flex:1;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;font-weight:600;width:100%;">
          </div>
        </div>
      `).join('')}
      
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary" style="flex:1;" onclick="saveBudgetSetting()">保存预算</button>
        <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('budgetSettingPopup').remove()">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(formDiv);
}

function saveBudgetSetting() {
  if (!mockData.userProfile.budgets || typeof mockData.userProfile.budgets !== 'object') {
    mockData.userProfile.budgets = {};
  }
  const budgets = mockData.userProfile.budgets;
  const setPeriods = [];
  
  PERIOD_ORDER.forEach(period => {
    const input = document.getElementById('budget-' + period);
    if (input) {
      const val = parseFloat(input.value) || 0;
      if (val > 0) {
        budgets[period] = val;
        setPeriods.push(PERIOD_LABELS[period]);
      } else {
        delete budgets[period];
      }
    }
  });
  
  saveUserData();
  // 同步后端，避免刷新后被服务端默认预算覆盖
  if (typeof apiBudgetSet === 'function') {
    PERIOD_ORDER.forEach(period => {
      if (budgets[period] > 0) apiBudgetSet(budgets[period], period);
    });
  }
  const popup = document.getElementById('budgetSettingPopup');
  if (popup) popup.remove();
  
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">预算已保存。<br>已设置：<strong>${setPeriods.length > 0 ? setPeriods.join('、') : '无'}</strong></div></div></div>`);
  scrollToBottom();
}
