// ========== 极致版：生日鲜花联动 ==========
function calcDaysUntilBirthday(birthdayStr) {
  const today = new Date();
  const parts = String(birthdayStr || '').split('-').map(Number);
  const month = parts[0], day = parts[1];
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return 999;
  // 按“天”比较：生日当天应显示 0 天，而不是滚到明年变成 365 天
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let nextBirthday = new Date(today.getFullYear(), month - 1, day);
  if (nextBirthday < todayMidnight) nextBirthday = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.round((nextBirthday - todayMidnight) / (1000 * 60 * 60 * 24));
}

function showBirthdayReminder() {
  if (typeof syncContactsBirthdays === 'function') syncContactsBirthdays();
  const contacts = mockData.userProfile.birthdayContacts || [];
  const contactsWithDays = contacts.map(c => ({ ...c, days: calcDaysUntilBirthday(c.birthday) }));
  const upcoming = contactsWithDays.filter(c => c.days <= 7);
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p><strong>生日提醒与鲜花订购</strong></p>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-size:13px;color:#666;">共 ${contactsWithDays.length} 位联系人</span>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-secondary btn-sm" onclick="goToContactsTab()" style="padding:4px 10px;font-size:12px;">管理联系人</button>
              <button class="btn btn-primary btn-sm" onclick="showAddBirthdayContactForm()">添加</button>
            </div>
          </div>
          ${upcoming.length > 0 ? `<div class="data-card" style="background:#fef2f2;border-color:#fecaca;margin-bottom:12px;">
            <div class="data-card-title">近期生日提醒（7天内）</div>
            ${upcoming.map(c => `<div class="data-row"><span class="data-label">${c.name}（${c.relation}）</span><span class="data-value" style="color:#ef4444;font-weight:600;">还有 ${c.days} 天（${c.birthday}）</span></div>`).join('')}
            <div style="margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <div style="font-size:12px;color:#B42318;">${upcoming[0].name}生日快要到啦，要不要订购鲜花？</div>
              <button class="btn btn-primary btn-sm" onclick="guideStartFlowerOrder()">去订购鲜花</button>
            </div>
          </div>` : ''}
          <div class="data-card">
            <div class="data-card-title">联系人生日列表</div>
            ${contactsWithDays.length === 0 ? '<div style="text-align:center;padding:20px;color:#999;font-size:13px;">暂无联系人，点击上方"添加联系人"按钮添加</div>' : contactsWithDays.map(c => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;">
                <div style="flex:1;">
                  <div style="font-weight:600;">${c.name} <span style="font-size:11px;color:#999;">${c.relation}</span></div>
                  <div style="font-size:12px;color:#666;">生日：${c.birthday} · 还有 ${c.days} 天 · 推荐：${c.flower}（¥${c.price}）</div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px;">
                  <button class="btn btn-primary btn-sm" onclick="guideStartFlowerOrder({ recipient: '${c.name}', bouquet: '${c.flower}' })">订鲜花</button>
                  <button class="btn btn-secondary btn-sm" onclick="deleteBirthdayContact('${c.name}')" style="padding:4px 8px;font-size:12px;">删除</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}

function showAddBirthdayContactForm() {
  const formDiv = document.createElement('div');
  formDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  formDiv.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;max-width:340px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
      
      <div style="font-size:16px;font-weight:600;text-align:center;margin-bottom:16px;">添加生日联系人</div>
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">姓名 *</label>
        <input type="text" id="newContactName" placeholder="如：小明" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">生日（月-日）*</label>
        <input type="text" id="newContactBirthday" placeholder="如：09-15" maxlength="5" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">关系</label>
        <select id="newContactRelation" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
          <option value="家人">家人</option>
          <option value="朋友">朋友</option>
          <option value="同事">同事</option>
          <option value="恋人">恋人</option>
          <option value="其他">其他</option>
        </select>
      </div>
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:12px;color:#666;margin-bottom:4px;">推荐鲜花</label>
        <select id="newContactFlower" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
          <option value="向日葵" data-price="168">向日葵（¥168）</option>
          <option value="康乃馨" data-price="128">康乃馨（¥128）</option>
          <option value="玫瑰" data-price="299">玫瑰（¥299）</option>
          <option value="百合" data-price="199">百合（¥199）</option>
          <option value="郁金香" data-price="228">郁金香（¥228）</option>
        </select>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="btn btn-primary" style="flex:1;" onclick="saveBirthdayContact()">保存</button>
        <button class="btn btn-secondary" style="flex:1;" onclick="this.closest('div[style*=fixed]').remove();">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(formDiv);
}

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

function deleteBirthdayContact(name) {
  if (!confirm(`确定要删除联系人"${name}"吗？`)) return;
  mockData.userProfile.birthdayContacts = mockData.userProfile.birthdayContacts.filter(c => c.name !== name);
  // 通讯录里同一个人只清掉生日信息，联系人本身保留
  const linked = (mockData.contacts || []).filter(c => c.name === name)[0];
  if (linked) { delete linked.birthday; if (linked.fromBirthday) { mockData.contacts = mockData.contacts.filter(c => c.name !== name); } }
  saveUserData();
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">删除 已删除联系人：<strong>${name}</strong></div></div></div>`);
  scrollToBottom();
}

function confirmFlowerOrder(name, flower, price, btn) {
  // 显示确认弹窗
  const confirmDiv = document.createElement('div');
  confirmDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  confirmDiv.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;max-width:320px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      
      <div style="font-size:16px;font-weight:600;text-align:center;margin-bottom:16px;">确认鲜花订购</div>
      <div style="background:#f9fafb;border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#666;">收件人</span><span style="font-weight:600;">${name}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#666;">鲜花品种</span><span style="font-weight:600;">${flower}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#666;">订购金额</span><span style="font-weight:700;color:#ef4444;">¥${price.toFixed(2)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#666;">配送时间</span><span style="font-weight:600;">生日当天</span></div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary" style="flex:1;" onclick="orderFlowers('${name}','${flower}',${price});this.closest('div[style*=fixed]').remove();">确认支付</button>
        <button class="btn btn-secondary" style="flex:1;" onclick="this.closest('div[style*=fixed]').remove();">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmDiv);
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

