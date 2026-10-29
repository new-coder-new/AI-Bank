// ========== 极致版：生日鲜花联动 ==========

// 生日提醒：只保留一张紧凑卡（最近生日的人 + 一键订花），完整名单在「我的-联系人」

function saveBirthdayContact() {
  const name = document.getElementById('newContactName').value.trim();
  const birthday = document.getElementById('newContactBirthday').value.trim();
  const relation = document.getElementById('newContactRelation').value;
  const flowerSelect = document.getElementById('newContactFlower');
  const flower = flowerSelect.value;
  const price = parseInt(flowerSelect.options[flowerSelect.selectedIndex].dataset.price);

  if (!name || !birthday) {
    alert('请填写姓名和生日');
    return;
  }
  if (!/^\d{2}-\d{2}$/.test(birthday)) {
    alert('生日格式不正确，请输入月-日，如：09-15');
    return;
  }
  if (!mockData.userProfile.birthdayContacts) mockData.userProfile.birthdayContacts = [];
  if (mockData.userProfile.birthdayContacts.find(c => c.name === name)) {
    alert('该联系人已存在');
    return;
  }
  mockData.userProfile.birthdayContacts.push({ name, birthday, relation, flower, price });
  if (typeof syncContactsBirthdays === 'function') syncContactsBirthdays();
  saveUserData();
  document.querySelector('div[style*=fixed]').remove();
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">已添加联系人：<strong>${name}</strong>（${relation}），生日：${birthday}，推荐鲜花：${flower}（¥${price}）</div></div></div>`);
  scrollToBottom();
}

async function orderFlowers(name, flower, price) {
  // 与转账一致的金额风险验证：T2 密码确认，T3 二次验证，T4 提交人工复核
  if (typeof verifyAmountRisk === 'function') {
    const risk = await verifyAmountRisk(price, '鲜花订购', [{ tool: 'life.orderFlower', args: { name: name, flower: flower, price: price } }]);
    if (risk && risk.pendingReview) return;
    if (!risk || !risk.ok) {
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">已取消鲜花订购，账户未发生扣款。</div></div></div>`);
      scrollToBottom();
      return;
    }
  }
  // 与一键式下单共用余额门禁：统一由 addTransaction 扣款，不能再手动 Math.max(0, ...) 绕过校验
  const okTx = addTransaction('expense', price, `鲜花订购-${name}生日-${flower}`, '鲜花订购', true);
  if (okTx === false) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>支付失败</strong><br>可用余额不足，本次鲜花订购未扣款。</div></div></div>`);
    scrollToBottom();
    return;
  }
  const u = mockData.userProfile;
  saveUserData();
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
    <p><strong>鲜花订购成功</strong></p>
    <div class="data-card">
      <div class="data-row"><span class="data-label">收件人</span><span class="data-value">${name}</span></div>
      <div class="data-row"><span class="data-label">鲜花品种</span><span class="data-value">${flower}</span></div>
      <div class="data-row"><span class="data-label">订购金额</span><span class="data-value expense" style="font-weight:700;">-¥ ${price.toFixed(2)}</span></div>
      <div class="data-row"><span class="data-label">配送时间</span><span class="data-value">${name}生日当天 上午送达</span></div>
      <div class="data-row"><span class="data-label">支付方式</span><span class="data-value">储蓄卡自动支付</span></div>
      <div class="data-row"><span class="data-label">当前余额</span><span class="data-value" style="font-weight:700;">¥ ${u.debitCard.balance.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
    </div>
  </div></div></div>`);
  scrollToBottom();
}

