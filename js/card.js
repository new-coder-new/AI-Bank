// ========== 卡片管理（中阶：调额+挂失） ==========
function showCardLimit() {
  // 统一挂失状态：一键式对话走的是 creditCard.isFrozen，页面按钮用的是 cardFrozen
  if (mockData.userProfile.creditCard && typeof mockData.userProfile.creditCard.isFrozen === 'boolean') {
    cardFrozen = mockData.userProfile.creditCard.isFrozen;
  }
  const card = mockData.card;
  const effectiveLimit = Number(mockData.userProfile.creditCard.effectiveLimit != null
    ? mockData.userProfile.creditCard.effectiveLimit
    : mockData.userProfile.creditCard.limit) || Number(card.totalLimit) || 0;
  const usagePercent = ((card.usedLimit / card.totalLimit) * 100).toFixed(1);
  const statusHtml = cardFrozen
    ? '<span class="card-status status-frozen">已挂失</span>'
    : '<span class="card-status status-normal">正常</span>';
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p>以下是您的信用卡信息：${statusHtml}</p>
          <div class="card-visual" style="${cardFrozen ? 'opacity:0.6;filter:grayscale(0.5);' : ''}">
            <div class="card-type">${card.type}</div>
            <div class="card-number">${card.number}</div>
            <div class="card-limits">
              <div class="card-limit-item"><div class="card-limit-label">总额度</div><div class="card-limit-value">¥ ${card.totalLimit.toLocaleString()}</div></div>
              <div class="card-limit-item"><div class="card-limit-label">已使用</div><div class="card-limit-value">¥ ${card.usedLimit.toLocaleString()}</div></div>
              <div class="card-limit-item"><div class="card-limit-label">可用额度</div><div class="card-limit-value" style="color:#fbbf24;">¥ ${card.availableLimit.toLocaleString()}</div></div>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${usagePercent}%"></div></div>
          </div>
          <div class="data-card">
            <div class="data-card-title">账单信息</div>
            <div class="data-row"><span class="data-label">本期账单金额</span><span class="data-value expense">¥ ${card.billAmount.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
            <div class="data-row"><span class="data-label">最后还款日</span><span class="data-value">${card.dueDate}</span></div>
            <div class="data-row"><span class="data-label">额度使用率</span><span class="data-value">${usagePercent}%</span></div>
          </div>
          <div class="form-actions" style="margin-top:14px;">
            <button class="btn btn-primary btn-sm" onclick="cardLimitAdjustForm(${effectiveLimit})" ${cardFrozen ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>申请调额</button>
            <button class="btn ${cardFrozen ? 'btn-success' : 'btn-danger'} btn-sm" onclick="toggleFreeze()">${cardFrozen ? '解除挂失' : '立即挂失'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}

function adjustLimit() {
  // 统一走「申请 → 审批 → 生效」链路，不再直接改生效额度
  const c = mockData.userProfile.creditCard || {};
  const cur = Number(c.effectiveLimit != null ? c.effectiveLimit : c.limit) || 0;
  if (typeof cardLimitAdjustForm === 'function') cardLimitAdjustForm(cur);
}

function submitAdjustLimit() {
  // 兼容旧按钮：统一转到调额申请表单
  const c = mockData.userProfile.creditCard || {};
  const cur = Number(c.effectiveLimit != null ? c.effectiveLimit : c.limit) || 0;
  if (typeof cardLimitAdjustForm === 'function') cardLimitAdjustForm(cur);
}

async function toggleFreeze() {
  const willFreeze = !cardFrozen;
  // 与一键式对话一致：挂失/解挂都属于账户变更，先确认再执行
  if (!confirm(willFreeze
    ? '挂失后信用卡将立即冻结，无法继续交易。\n\n确定要挂失吗？'
    : '确定要解除挂失并恢复卡片使用吗？')) return;

  let res = null;
  if (typeof callAgentTool === 'function') {
    try {
      res = await callAgentTool(willFreeze ? 'card.freeze' : 'card.unfreeze', { reason: '用户操作' });
    } catch (e) {
      res = { ok: false, summary: (e && e.message) || '操作失败' };
    }
    if (res.ok === false) {
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>操作未完成</strong><br>${escapeHtml(res.summary || '请稍后再试')}</div></div></div>`);
      scrollToBottom();
      return;
    }
  }

  // 统一状态：cardFrozen（页面展示）与 creditCard.isFrozen（Agent/工具层）保持一致
  cardFrozen = willFreeze;
  mockData.userProfile.creditCard.isFrozen = willFreeze;
  mockData.userProfile.creditCard.status = willFreeze ? '已挂失' : '正常';

  if (cardFrozen) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
      <p><strong>卡片已挂失冻结</strong></p>
      <div class="data-card">
        <div class="data-card-title">挂失信息</div>
        <div class="data-row"><span class="data-label">挂失时间</span><span class="data-value">${new Date().toLocaleString('zh-CN')}</span></div>
        <div class="data-row"><span class="data-label">卡片状态</span><span class="data-value" style="color:#ef4444;font-weight:700;">已冻结，交易已停止</span></div>
        <div class="data-row"><span class="data-label">补卡方式</span><span class="data-value">将在3-5个工作日内寄送新卡</span></div>
      </div>
      <p style="margin-top:8px;font-size:12px;color:#ef4444;">挂失后卡片将无法使用，请确认卡片确实丢失。</p>
    </div></div></div>`);
  } else {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
      <p><strong>卡片已解除挂失</strong></p>
      <div class="data-card">
        <div class="data-card-title">解除信息</div>
        <div class="data-row"><span class="data-label">操作时间</span><span class="data-value">${new Date().toLocaleString('zh-CN')}</span></div>
        <div class="data-row"><span class="data-label">卡片状态</span><span class="data-value" style="color:#22c55e;font-weight:700;">已恢复正常使用</span></div>
      </div>
    </div></div></div>`);
  }
  scrollToBottom();
  saveUserData();
}


// ========== 极致版：智能调额 ==========
function showSmartLimit() {
  const u = mockData.userProfile;
  const currentLimit = u.creditCard.limit;
  const used = u.creditCard.used;
  const utilization = (used / currentLimit * 100).toFixed(1);
  // 基于消费行为计算推荐额度
  const monthlyExpense = u.recentTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const recommendedLimit = Math.round(Math.max(currentLimit * 1.2, monthlyExpense * 3) / 1000) * 1000;
  const increaseAmount = recommendedLimit - currentLimit;
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p><strong>额度建议</strong></p>
          <div class="data-card" style="background:linear-gradient(135deg,#F5F8FD,#fdf2f8);border-color:#CFDFF3;">
            <div class="data-card-title">当前额度使用情况</div>
            <div class="data-row"><span class="data-label">信用额度</span><span class="data-value" style="font-weight:700;">¥ ${currentLimit.toLocaleString()}</span></div>
            <div class="data-row"><span class="data-label">已用额度</span><span class="data-value expense">¥ ${used.toLocaleString()}</span></div>
            <div class="data-row"><span class="data-label">使用率</span><span class="data-value" style="color:${utilization > 80 ? '#ef4444' : utilization > 60 ? '#f59e0b' : '#22c55e'};font-weight:600;">${utilization}%</span></div>
          </div>
          <div class="data-card" style="margin-top:12px;background:#f0fdf4;border-color:#bbf7d0;">
            <div class="data-card-title">建议额度</div>
            <div class="data-row"><span class="data-label">推荐额度</span><span class="data-value" style="color:#22c55e;font-weight:700;font-size:18px;">¥ ${recommendedLimit.toLocaleString()}</span></div>
            <div class="data-row"><span class="data-label">提升幅度</span><span class="data-value income">+¥ ${increaseAmount.toLocaleString()} (${((increaseAmount/currentLimit)*100).toFixed(0)}%)</span></div>
            <div class="data-row"><span class="data-label">推荐理由</span><span class="data-value" style="font-size:12px;">基于您近期消费行为和良好信用记录</span></div>
            <div class="data-row"><span class="data-label">生效时间</span><span class="data-value">预计T+1工作日生效</span></div>
          </div>
          <div style="margin-top:15px;display:flex;gap:10px;">
            <button class="btn btn-primary" style="flex:1;" onclick="cardLimitAdjustForm(${currentLimit}, ${recommendedLimit})">申请调额</button>
            <button class="btn btn-secondary" style="flex:1;" onclick="appendMessage('<div class=\\'message\\'><div class=\\'msg-avatar ai\\'>🤖</div><div class=\\'msg-content\\'><div class=\\'msg-name\\'>智能金融助手</div><div class=\\'msg-bubble\\'>已取消调额申请，额度保持不变。</div></div></div>');scrollToBottom();">暂不调整</button>
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}

function confirmSmartLimit(newLimit) {
  // 兼容旧入口：不再直接改生效额度，统一打开调额申请表单
  const c = mockData.userProfile.creditCard || {};
  const cur = Number(c.effectiveLimit != null ? c.effectiveLimit : c.limit) || 0;
  if (typeof cardLimitAdjustForm === 'function') cardLimitAdjustForm(cur, Number(newLimit) || 0);
}


// ========== 功能增强：账单分期 ==========
// 分期费率表（每期费率）
const installmentRates = {
  3: 0.008,
  6: 0.007,
  9: 0.0065,
  12: 0.006,
  18: 0.0055,
  24: 0.005
};

// 显示账单分期计算器
function showInstallmentCalculator() {
  const c = mockData.userProfile.creditCard;
  const billAmount = c.currentBill || 5000;
  
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p><strong>信用卡账单分期</strong></p>
          <div style="background:linear-gradient(135deg,#0B4F9C,#1F6FD0);color:white;border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="font-size:12px;opacity:0.8;margin-bottom:4px;">本期账单金额</div>
            <div style="font-size:28px;font-weight:700;">¥${billAmount.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</div>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;color:#666;margin-bottom:6px;font-weight:600;">分期金额（元）</label>
            <input type="number" id="installAmount" value="${billAmount}" max="${billAmount}" min="100" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;" oninput="updateInstallmentPreview()">
          </div>
          <div style="margin-bottom:16px;">
            <label style="display:block;font-size:13px;color:#666;margin-bottom:6px;font-weight:600;">选择分期期数</label>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;" id="installPeriodOptions">
              ${[3,6,9,12,18,24].map((p, i) => `
                <button onclick="selectInstallPeriod(${p}, this)" class="install-period-btn" style="padding:10px;border:1px solid ${i === 3 ? '#0B4F9C' : '#e5e7eb'};border-radius:8px;background:${i === 3 ? '#F2F6FC' : '#fff'};color:${i === 3 ? '#0B4F9C' : '#374151'};cursor:pointer;font-size:13px;font-weight:600;">
                  ${p}期<br><span style="font-size:10px;font-weight:400;">费率${(installmentRates[p]*100).toFixed(2)}%</span>
                </button>
              `).join('')}
            </div>
          </div>
          <div id="installmentPreview" style="background:#f9fafb;border-radius:10px;padding:14px;margin-bottom:16px;">
            <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:10px;">分期明细</div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:12px;">
              <div><span style="color:#999;">分期金额</span><br><strong style="color:#1a1a1a;" id="previewAmount">¥${billAmount.toLocaleString()}</strong></div>
              <div><span style="color:#999;">分期期数</span><br><strong style="color:#1a1a1a;" id="previewPeriod">12期</strong></div>
              <div><span style="color:#999;">每期应还</span><br><strong style="color:#0B4F9C;" id="previewMonthly">¥436.67</strong></div>
              <div><span style="color:#999;">手续费总额</span><br><strong style="color:#ef4444;" id="previewFee">¥240.00</strong></div>
              <div><span style="color:#999;">还款总额</span><br><strong style="color:#1a1a1a;" id="previewTotal">¥5,240.00</strong></div>
              <div><span style="color:#999;">首期还款</span><br><strong style="color:#1a1a1a;" id="previewFirst">下月账单日</strong></div>
            </div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-primary" style="flex:1;" onclick="confirmInstallment()">确认分期</button>
            <button class="btn btn-secondary" style="flex:1;" onclick="appendMessage('<div class=\\'message\\'><div class=\\'msg-avatar user\\'>陈</div><div class=\\'msg-content\\'><div class=\\'msg-name\\'>小陈</div><div class=\\'msg-bubble\\'>暂不分期</div></div></div>');scrollToBottom();">暂不分期</button>
          </div>
          <p style="margin-top:10px;font-size:11px;color:#999;">账单分期成功后，本期账单只需还未分期部分，分期金额从下期开始偿还。</p>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
  window.currentInstallPeriod = 12;
  // 根据实际账单金额动态计算初始预览
  setTimeout(() => updateInstallmentPreview(), 50);
}

// 选择分期期数
function selectInstallPeriod(period, btn) {
  window.currentInstallPeriod = period;
  document.querySelectorAll('.install-period-btn').forEach(b => {
    b.style.borderColor = '#e5e7eb';
    b.style.background = '#fff';
    b.style.color = '#374151';
  });
  btn.style.borderColor = '#0B4F9C';
  btn.style.background = '#F2F6FC';
  btn.style.color = '#0B4F9C';
  updateInstallmentPreview();
}

// 更新分期预览
function updateInstallmentPreview() {
  const amount = parseFloat(document.getElementById('installAmount')?.value) || 0;
  const period = window.currentInstallPeriod || 12;
  const rate = installmentRates[period] || 0.006;
  
  const totalFee = amount * rate * period;
  const monthlyPayment = (amount + totalFee) / period;
  const totalPayment = amount + totalFee;
  
  const amountEl = document.getElementById('previewAmount');
  const periodEl = document.getElementById('previewPeriod');
  const monthlyEl = document.getElementById('previewMonthly');
  const feeEl = document.getElementById('previewFee');
  const totalEl = document.getElementById('previewTotal');
  
  if (amountEl) amountEl.textContent = '¥' + amount.toLocaleString('zh-CN', {minimumFractionDigits: 2});
  if (periodEl) periodEl.textContent = period + '期';
  if (monthlyEl) monthlyEl.textContent = '¥' + monthlyPayment.toLocaleString('zh-CN', {minimumFractionDigits: 2});
  if (feeEl) feeEl.textContent = '¥' + totalFee.toLocaleString('zh-CN', {minimumFractionDigits: 2});
  if (totalEl) totalEl.textContent = '¥' + totalPayment.toLocaleString('zh-CN', {minimumFractionDigits: 2});
}

// 确认账单分期
function confirmInstallment() {
  const amount = parseFloat(document.getElementById('installAmount')?.value) || 0;
  const period = window.currentInstallPeriod || 12;
  const rate = installmentRates[period] || 0.006;
  
  if (amount < 100) { alert('分期金额最低100元'); return; }

  // 交易限制接入：分期属于信用卡消费，超过单笔限额直接拦截
  if (typeof cardTxnLimitCheck === 'function') {
    const chk = cardTxnLimitCheck(amount, 'online');
    if (!chk.ok) {
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>分期未提交</strong><br>${chk.reason}。可在「全部服务 → 卡片 → 交易限制」中调整。</div></div></div>`);
      scrollToBottom();
      return;
    }
  }
  
  const c = mockData.userProfile.creditCard;
  const totalFee = amount * rate * period;
  const monthlyPayment = (amount + totalFee) / period;
  
  if (!c.installments) c.installments = [];
  c.installments.push({
    id: Date.now(),
    amount,
    period,
    remainingPeriods: period,
    monthlyPayment,
    totalFee,
    rate,
    createdAt: new Date().toISOString().split('T')[0],
    status: 'active'
  });
  
  c.currentBill = Math.max(0, (c.currentBill || 0) - amount);
  saveUserData();
  
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">✅ <strong>账单分期成功</strong><br>分期金额：¥${amount.toLocaleString()}<br>分期期数：${period}期<br>每期应还：¥${monthlyPayment.toFixed(2)}<br>手续费总额：¥${totalFee.toFixed(2)}<br><br>本期账单已减少¥${amount.toLocaleString()}，分期金额从下期开始偿还。</div></div></div>`);
  scrollToBottom();
}

