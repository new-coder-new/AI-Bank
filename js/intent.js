// ==========================================================================
//  共享动作助手（Shared Action Helpers）
//  说明：本项目主对话流程走 chat.js 的 enhancedSendMessage 流水线，
//        本文件仅保留被 ai.js 等模块复用的高危操作确认、转账确认框、
//        预算预填设置三个工具函数。原「指令解析与路由引擎」已随旧流程下线。
// ==========================================================================

// 高风险操作二次确认弹窗
function showCriticalConfirm(title, message, onConfirm) {
  const popupId = 'critical-confirm-' + Date.now();
  const popup = document.createElement('div');
  popup.id = popupId;
  popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  popup.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;max-width:340px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="text-align:center;font-size:40px;margin-bottom:8px;">⚠️</div>
      <div style="font-size:16px;font-weight:600;text-align:center;margin-bottom:8px;">${title}</div>
      <div style="font-size:13px;color:#666;text-align:center;margin-bottom:20px;line-height:1.6;">${message}</div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-danger" style="flex:1;" onclick="(${onConfirm.toString()})();document.getElementById('${popupId}').remove();">确认执行</button>
        <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('${popupId}').remove();">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(popup);
}

// 从 slots 显示智能转账确认框（复用语音转账确认逻辑）
function showSmartVoiceTransferConfirmFromSlots(slots) {
  if (slots.phone) {
    showSmartVoiceTransferConfirm({
      type: 'phone',
      amount: slots.amount,
      phone: slots.phone,
      payee: slots.payee_name || ''
    }, `手机号转账 ${slots.amount}元`);
  } else if (slots.date && slots.date !== '今天') {
    showSmartVoiceTransferConfirm({
      type: 'timed',
      amount: slots.amount,
      payee: slots.payee_name,
      date: slots.date,
      time: '09:00',
      repeat: '不重复'
    }, `定时转账 ${slots.amount}元给${slots.payee_name}`);
  } else {
    showSmartVoiceTransferConfirm({
      type: 'name',
      amount: slots.amount,
      payee: slots.payee_name
    }, `转账 ${slots.amount}元给${slots.payee_name}`);
  }
}

// 从 prefill 设置预算
function smartBudgetSetFromPrefill(amount, period) {
  const periodLabels = { day: '每日', week: '每周', month: '每月', year: '每年' };
  const u = mockData.userProfile;
  if (!u.budgets || typeof u.budgets !== 'object') {
    u.budgets = { period: period, totalLimit: amount, categories: [] };
  } else {
    u.budgets.period = period;
    u.budgets.totalLimit = amount;
  }
  saveUserData();
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
    ✅ <strong>${periodLabels[period] || '每月'}预算已设置</strong><br>
    总预算：<strong>¥${amount.toLocaleString()}</strong>
  </div></div></div>`);
  scrollToBottom();
}
