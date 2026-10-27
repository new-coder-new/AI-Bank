// ========== 智能转账（中阶：姓名/手机号/定时/AA） ==========
// 统一写入转账记录，供「转账记录查询 / 撤销」使用。
// 说明：转出成功后必须调用它，否则智能助手/Agent 转出的账在记录查询里会"查不到"。
// 返回写入的记录对象；若已存在同 id 则跳过（防重复）。
function registerTransferRecord(payee, amount, channel, account) {
  if (!mockData.userProfile.transferHistory) mockData.userProfile.transferHistory = [];
  const history = mockData.userProfile.transferHistory;
  const amt = Number(amount) || 0;
  if (amt <= 0) return null;
  const contact = (mockData.contacts || []).find(c => c.name === payee);
  const record = {
    id: Math.max(0, ...history.map(t => Number(t.id) || 0)) + 1,
    payee: payee || '未知收款人',
    account: account || (contact && contact.account) || '**** **** **** ****',
    amount: amt,
    time: new Date().toLocaleString('zh-CN'),
    status: '已完成',
    channel: channel || '智能转账'
  };
  history.unshift(record);
  return record;
}

function localDateValue(d) {
  const t = d || new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}

function localTimeValue(d) {
  const t = d || new Date();
  return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
}

// 当天日期时，把可选时间的下限同步到当前时间，避免创建"过去时间"的任务
function syncScheduledTimeMin() {
  const dateEl = document.getElementById('transferDate');
  const timeEl = document.getElementById('transferTime');
  if (!dateEl || !timeEl) return;
  if (dateEl.value === localDateValue(new Date())) {
    timeEl.min = localTimeValue(new Date(Date.now() + 5 * 60 * 1000));
  } else {
    timeEl.removeAttribute('min');
  }
}

function showTransferForm() {
  const contactOptions = mockData.contacts.map(c =>
    `<option value="${c.name}">${c.name}（${c.phone}）</option>`
  ).join('');  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p>请选择转账方式并填写信息：</p>
          <div style="background:#F2F6FC;border:1px solid #CFDFF3;border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:12px;color:#09407F;">
            即时转账按金额分级确认；定时转账创建时需短信验证码，到期自动执行，执行前可随时取消。
          </div>
          <div class="transfer-form">
            <div class="tabs">
              <div class="tab active" onclick="switchTransferTab(this,'name')">按姓名</div>
              <div class="tab" onclick="switchTransferTab(this,'phone')">手机号</div>
              <div class="tab" onclick="switchTransferTab(this,'bank')">银行卡号</div>
              <div class="tab" onclick="switchTransferTab(this,'timed')">定时转账</div>
              <div class="tab" onclick="switchTransferTab(this,'aa')">AA收款</div>
            </div>
            <div id="transferContent">
              <div class="form-group">
                <label class="form-label" style="display:flex;justify-content:space-between;align-items:center;">收款人 <button class="btn btn-primary btn-sm" onclick="goToContactsTab()" style="padding:2px 8px;font-size:11px;">管理</button></label>
                <select class="form-select" id="transferContact">${contactOptions}</select>
              </div>
              <div class="form-group">
                <label class="form-label">转账金额（元）</label>
                <input type="number" class="form-input" id="transferAmount" placeholder="请输入金额" min="0.01" step="0.01" oninput="renderTransferTierHint()">
                <div id="transferTierHint" style="display:none;margin-top:6px;font-size:12px;line-height:1.6;"></div>
              </div>
              <div class="form-group">
                <label class="form-label">备注（选填）</label>
                <input type="text" class="form-input" id="transferRemark" placeholder="转账备注">
              </div>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" onclick="confirmTransfer(this)">确认转账</button>
              <button class="btn btn-secondary" onclick="cancelTransfer()">取消</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}

// 打开 AA 表单并预填总金额/活动名称（语音 AA 复用，避免只按人数瞎猜参与人）
function openAAForm(prefillTotal, prefillName) {
  showTransferForm();
  setTimeout(function () {
    const forms = document.querySelectorAll('.transfer-form');
    const form = forms[forms.length - 1];
    if (!form) return;
    const aaTab = Array.from(form.querySelectorAll('.tab')).find(t => t.textContent.includes('AA'));
    if (aaTab) switchTransferTab(aaTab, 'aa');
    const totalInput = form.querySelector('#aaTotal');
    if (totalInput && prefillTotal) totalInput.value = prefillTotal;
    const nameInput = form.querySelector('#aaName');
    if (nameInput && prefillName) nameInput.value = prefillName;
    updateAADetail();
    form.scrollIntoView({ block: 'center' });
  }, 80);
}

// 表单内实时提示当前金额将落入哪个风控档位（金额档，未叠加可疑度）
function renderTransferTierHint() {
  const el = document.getElementById('transferTierHint');
  const input = document.getElementById('transferAmount');
  if (!el || !input) return;
  const amount = parseFloat(input.value) || 0;
  if (amount <= 0 || typeof agentAmountTier !== 'function') { el.style.display = 'none'; return; }
  const key = agentAmountTier(amount);
  const t = AGENT_TRANSFER_TIERS[key];
  const badge = agentTierBadge({ rank: t.rank });
  el.style.display = 'block';
  el.style.color = badge.color;
  el.innerHTML = '当前金额将适用 <b>' + t.name + '</b> 档' +
    (t.needVerify ? '：需要输入二次验证码后才可执行。' : (t.needConfirm ? '：需要确认后执行。' : '：可直接执行。'));
}

function switchTransferTab(el, type) {
  const form = el.closest('.transfer-form');
  if (!form) return;
  form.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const content = form.querySelector('#transferContent');
  if (!content) return;
  if (type === 'name') {
    const contactOptions = mockData.contacts.map(c => `<option value="${c.name}">${c.name}（${c.phone}）</option>`).join('');
    content.innerHTML = `
      <div class="form-group"><label class="form-label" style="display:flex;justify-content:space-between;align-items:center;">收款人 <button class="btn btn-primary btn-sm" onclick="goToContactsTab()" style="padding:2px 8px;font-size:11px;">管理</button></label><select class="form-select" id="transferContact">${contactOptions}</select></div>
      <div class="form-group"><label class="form-label">转账金额（元）</label><input type="number" class="form-input" id="transferAmount" placeholder="请输入金额"></div>
      <div class="form-group"><label class="form-label">备注（选填）</label><input type="text" class="form-input" id="transferRemark" placeholder="转账备注"></div>
    `;
  } else if (type === 'phone') {
    content.innerHTML = `
      <div class="form-group"><label class="form-label">收款人手机号</label><input type="tel" class="form-input" id="transferPhone" placeholder="请输入手机号" value="138****1234"></div>
      <div class="form-group"><label class="form-label">转账金额（元）</label><input type="number" class="form-input" id="transferAmount" placeholder="请输入金额"></div>
      <div class="form-group"><label class="form-label">收款人姓名（选填）</label><input type="text" class="form-input" id="transferName" placeholder="验证收款人姓名"></div>
    `;
  } else if (type === 'bank') {
    content.innerHTML = `
      <div class="form-group"><label class="form-label">收款银行卡号</label><input type="text" class="form-input" id="transferBankCard" placeholder="请输入银行卡号（16-19位）" maxlength="19" style="font-family:monospace;" oninput="this.value=this.value.replace(/\\D/g,'')" onblur="validateTransferBankCard()"></div>
      <div id="transferBankCardValid" style="display:none;padding:4px 0;color:#22c55e;font-size:12px;">卡号格式正确</div>
      <div id="transferBankCardInvalid" style="display:none;padding:4px 0;color:#ef4444;font-size:12px;">卡号格式不正确</div>
      <div class="form-group"><label class="form-label">转账金额（元）</label><input type="number" class="form-input" id="transferAmount" placeholder="请输入金额"></div>
      <div class="form-group"><label class="form-label">备注（选填）</label><input type="text" class="form-input" id="transferRemark" placeholder="转账备注"></div>
    `;
  } else if (type === 'timed') {
    const contactOptions = mockData.contacts.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    const now = new Date();
    const next = new Date(now.getTime() + 60 * 60 * 1000);
    const dateVal = localDateValue(next);
    const timeVal = localTimeValue(next);
    content.innerHTML = `
      <div class="form-row">
        <div class="form-group"><label class="form-label" style="display:flex;justify-content:space-between;align-items:center;">收款人 <button class="btn btn-primary btn-sm" onclick="goToContactsTab()" style="padding:2px 8px;font-size:11px;">管理</button></label><select class="form-select" id="transferContact">${contactOptions}</select></div>
        <div class="form-group"><label class="form-label">金额（元）</label><input type="number" class="form-input" id="transferAmount" placeholder="金额"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">执行日期</label><input type="date" class="form-input" id="transferDate" value="${dateVal}" min="${localDateValue(now)}" onchange="syncScheduledTimeMin()"></div>
        <div class="form-group"><label class="form-label">执行时间</label><input type="time" class="form-input" id="transferTime" value="${timeVal}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">重复方式</label><select class="form-select" id="transferRepeat"><option>不重复</option><option>每天</option><option>每周</option><option>每月</option></select></div>
        <div class="form-group"><label class="form-label">备注（选填）</label><input type="text" class="form-input" id="transferRemark" placeholder="转账备注"></div>
      </div>
      <div class="bank-inline-note">创建任务需完成短信验证码验证；到期自动从储蓄卡扣款，执行前可随时取消。</div>
    `;
  } else if (type === 'aa') {
    const participantOptions = (mockData.contacts || []).map(c => `
      <label class="aa-participant-row">
        <input type="checkbox" class="aa-participant" value="${c.name}" checked onchange="updateAADetail()">
        <span class="aa-participant-name">${c.name}</span>
        <span class="aa-participant-phone">${c.phone}</span>
      </label>
    `).join('');
    content.innerHTML = `
      <div class="form-group"><label class="form-label">总金额（元）</label><input type="number" class="form-input" id="aaTotal" placeholder="请输入总金额" oninput="updateAADetail()"></div>
      <div class="form-group">
        <label class="form-label" style="display:flex;justify-content:space-between;align-items:center;">参与人员 <button type="button" class="btn btn-secondary btn-sm" onclick="toggleAllAAParticipants(this)">清空</button></label>
        <div class="aa-participant-list">
          <label class="aa-participant-row aa-self">
            <input type="checkbox" checked disabled>
            <span class="aa-participant-name">我（垫付人）</span>
            <span class="aa-participant-phone">默认计入分摊</span>
          </label>
          ${participantOptions || '<div class="aa-participant-empty">暂无联系人，请先在联系人中添加</div>'}
        </div>
      </div>
      <div class="form-group"><label class="form-label">活动名称</label><input type="text" class="form-input" id="aaName" placeholder="例如：聚餐" value="聚餐"></div>
      <div id="aaDetail" class="aa-detail">请选择参与人员并输入总金额</div>
    `;
    updateAADetail();
  }
  // 按钮文案跟着业务动作走，避免"定时转账"看起来像立即转账
  const primaryBtn = form.querySelector('.form-actions .btn-primary');
  if (primaryBtn) {
    primaryBtn.textContent = type === 'timed' ? '创建定时任务' : (type === 'aa' ? '发起 AA 收款' : '确认转账');
  }
}

function updateAADetail() {
  const total = parseFloat(document.getElementById('aaTotal')?.value) || 0;
  const selected = Array.from(document.querySelectorAll('.aa-participant:checked')).map(el => el.value);
  const el = document.getElementById('aaDetail');
  if (!el) return;
  if (selected.length === 0) {
    el.innerHTML = '请选择至少一位参与人员（我默认计入分摊）';
    el.classList.add('empty');
    return;
  }
  el.classList.remove('empty');
  const splitCount = selected.length + 1;
  if (!(total > 0)) {
    el.innerHTML = `已选 <b>${splitCount}</b> 人（含我）：我、${selected.join('、')}<br>请输入总金额后计算每人应付。`;
    return;
  }
  const per = total / splitCount;
  el.innerHTML = `已选 <b>${splitCount}</b> 人（含我）：我、${selected.join('、')}<br>向 <b>${selected.length}</b> 人收款，每人应付 <b>¥${per.toFixed(2)}</b>`;
}

function toggleAllAAParticipants(btn) {
  const boxes = Array.from(document.querySelectorAll('.aa-participant'));
  if (!boxes.length) return;
  const allChecked = boxes.every(b => b.checked);
  boxes.forEach(b => { b.checked = !allChecked; });
  if (btn) btn.textContent = allChecked ? '全选' : '清空';
  updateAADetail();
}

function confirmTransfer(btn) {
  const form = btn ? btn.closest('.transfer-form') : document.querySelector('.transfer-form');
  if (!form) return;
  const activeTab = form.querySelector('.tab.active');
  const type = activeTab ? activeTab.textContent.includes('姓名') ? 'name' : activeTab.textContent.includes('手机号') ? 'phone' : activeTab.textContent.includes('银行卡') ? 'bank' : activeTab.textContent.includes('定时') ? 'timed' : 'aa' : 'name';
  const getVal = (id) => form.querySelector('#' + id)?.value || '';
  let detailHtml = '';
  let aaRequestData = null;
  if (type === 'aa') {
    const total = parseFloat(getVal('aaTotal')) || 0;
    const collectFrom = Array.from(form.querySelectorAll('.aa-participant:checked')).map(el => el.value);
    const activity = getVal('aaName') || 'AA收款';
    if (!(total > 0)) {
      appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>请输入有效的 AA 总金额</strong></div></div></div>');
      scrollToBottom();
      return;
    }
    if (collectFrom.length === 0) {
      appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>请选择参与人员</strong><br>至少选择一位联系人；我默认计入分摊。</div></div></div>');
      scrollToBottom();
      return;
    }
    const splitCount = collectFrom.length + 1;
    const per = total / splitCount;
    aaRequestData = { total, participants: collectFrom, collectFrom, splitCount, per, activity, payer: '我' };
    detailHtml = `<div class="data-row"><span class="data-label">转账类型</span><span class="data-value">AA收款</span></div>
      <div class="data-row"><span class="data-label">活动名称</span><span class="data-value">${activity}</span></div>
      <div class="data-row"><span class="data-label">总金额</span><span class="data-value expense">¥ ${total.toFixed(2)}</span></div>
      <div class="data-row"><span class="data-label">垫付人</span><span class="data-value">我</span></div>
      <div class="data-row"><span class="data-label">参与人员</span><span class="data-value">我、${collectFrom.join('、')}</span></div>
      <div class="data-row"><span class="data-label">参与人数</span><span class="data-value">${splitCount}人（含我）</span></div>
      <div class="data-row"><span class="data-label">收款对象</span><span class="data-value">${collectFrom.length}人</span></div>
      <div class="data-row"><span class="data-label">每人应付</span><span class="data-value">¥ ${per.toFixed(2)}</span></div>
      <p style="margin-top:8px;font-size:12px;color:#999;">已向 ${collectFrom.length} 位成员发起收款，每人 ¥${per.toFixed(2)}；我作为垫付人计入分摊。</p>`;
  } else if (type === 'timed') {
    const contact = getVal('transferContact');
    const amount = parseFloat(getVal('transferAmount')) || 0;
    const date = getVal('transferDate');
    const time = getVal('transferTime') || '09:00';
    const repeat = getVal('transferRepeat') || '不重复';
    const remark = getVal('transferRemark') || '';
    const info = mockData.contacts.find(c => c.name === contact);
    const task = {
      payee: contact,
      account: info?.account || '',
      amount: amount,
      date: date,
      time: time,
      repeat: repeat,
      remark: remark,
      channel: '表单'
    };
    // 先校验：时间不合法时保留表单，让用户直接改，不要把人踢回对话
    const err = schedValidationError(task);
    if (err) {
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">⚠️ <strong>请检查定时转账信息</strong><br>${schedEsc(err)}</div></div></div>`);
      scrollToBottom();
      return;
    }
    form.closest('.message')?.remove();
    openScheduledTransferConfirm(task);
    return;
  } else if (type === 'phone') {
    const phone = getVal('transferPhone');
    const amount = getVal('transferAmount') || '0';
    const name = getVal('transferName') || '未验证';
    detailHtml = `<div class="data-row"><span class="data-label">转账类型</span><span class="data-value">手机号转账</span></div>
      <div class="data-row"><span class="data-label">收款手机号</span><span class="data-value">${phone}</span></div>
      <div class="data-row"><span class="data-label">收款人姓名</span><span class="data-value">${name}</span></div>
      <div class="data-row"><span class="data-label">转账金额</span><span class="data-value expense">¥ ${parseFloat(amount).toFixed(2)}</span></div>
      <div class="data-row"><span class="data-label">交易时间</span><span class="data-value">${new Date().toLocaleString('zh-CN')}</span></div>`;
  } else if (type === 'bank') {
    const bankcard = getVal('transferBankCard');
    const amount = getVal('transferAmount') || '0';
    const remark = getVal('transferRemark') || '无';
    const cardResult = validateBankCard(bankcard);
    const bank = cardResult.bank || '未知银行';
    const maskedCard = bankcard.length >= 8 ? bankcard.substring(0, 4) + ' **** **** ' + bankcard.substring(bankcard.length - 4) : bankcard;
    detailHtml = `<div class="data-row"><span class="data-label">转账类型</span><span class="data-value">银行卡号转账</span></div>
      <div class="data-row"><span class="data-label">收款银行</span><span class="data-value" style="font-weight:600;">${bank}</span></div>
      <div class="data-row"><span class="data-label">收款卡号</span><span class="data-value" style="font-family:monospace;">${maskedCard}</span></div>
      <div class="data-row"><span class="data-label">转账金额</span><span class="data-value expense">¥ ${parseFloat(amount).toFixed(2)}</span></div>
      <div class="data-row"><span class="data-label">备注</span><span class="data-value">${remark}</span></div>
      <div class="data-row"><span class="data-label">交易时间</span><span class="data-value">${new Date().toLocaleString('zh-CN')}</span></div>`;
  } else {
    const contact = getVal('transferContact');
    const amount = getVal('transferAmount') || '0';
    const remark = getVal('transferRemark') || '无';
    const contactInfo = mockData.contacts.find(c => c.name === contact);
    detailHtml = `<div class="data-row"><span class="data-label">收款人</span><span class="data-value">${contact}</span></div>
      <div class="data-row"><span class="data-label">收款账户</span><span class="data-value">${contactInfo?.account || '-'}</span></div>
      <div class="data-row"><span class="data-label">转账金额</span><span class="data-value expense">¥ ${parseFloat(amount).toFixed(2)}</span></div>
      <div class="data-row"><span class="data-label">备注</span><span class="data-value">${remark}</span></div>
      <div class="data-row"><span class="data-label">交易时间</span><span class="data-value">${new Date().toLocaleString('zh-CN')}</span></div>`;
  }
  // —— 立即执行的转账（姓名 / 手机号 / 银行卡）：统一改走 Agent 风控链路 ——
  // 这样金额分级、二次验证码、余额门禁三处防线都生效，不再出现"表单转账无风控"的漏洞。
  if (type === 'name' || type === 'phone' || type === 'bank') {
    const amount = parseFloat(getVal('transferAmount')) || 0;
    const contact = type === 'name'
      ? getVal('transferContact')
      : type === 'phone'
        ? (getVal('transferName') || getVal('transferPhone') || '手机号用户')
        : (validateBankCard(getVal('transferBankCard')).bank || '银行卡用户');
    if (!(amount > 0)) {
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>转账金额无效</strong><br>请输入大于 0 的转账金额。</div></div></div>`);
      scrollToBottom();
      return;
    }
    const ch = type === 'name' ? '网银转账' : type === 'phone' ? '手机号转账' : '银行卡转账';
    // 移除表单，避免重复提交；真正结果由 Agent 链路输出
    form.closest('.message')?.remove();
    if (typeof agentTransferFlow === 'function') {
      agentTransferFlow(contact, amount, '', ch);
      return;
    }
    // 降级（理论上不会走到）：无 Agent 层时至少拦住超支
    const okTx = addTransaction('expense', amount, `转账给${contact}`, ch, true);
    if (okTx === false) {
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>转账未成功</strong><br>可用余额不足，本次转账已被拦截，账户未发生变动。</div></div></div>`);
      scrollToBottom();
      return;
    }
    registerTransferRecord(contact, amount, ch);
    saveUserData();
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">✅ <strong>操作成功</strong><div class="data-card"><div class="data-card-title">交易详情</div>${detailHtml}</div></div></div></div>`);
    scrollToBottom();
    return;
  }

  // —— AA：不扣款，仅登记收款请求与参与人员 ——
  if (type === 'aa' && aaRequestData) {
    const u = mockData.userProfile;
    if (!u.aaRequests) u.aaRequests = [];
    u.aaRequests.unshift({
      id: 'aa' + Date.now(),
      activity: aaRequestData.activity,
      total: aaRequestData.total,
      payer: '我',
      participants: ['我'].concat(aaRequestData.collectFrom),
      collectFrom: aaRequestData.collectFrom,
      splitCount: aaRequestData.splitCount,
      perPerson: aaRequestData.per,
      status: '待收款',
      createdAt: new Date().toLocaleString('zh-CN')
    });
    saveUserData();
    form.closest('.message')?.remove();
  }
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p><strong>操作成功</strong></p>
          <div class="data-card"><div class="data-card-title">交易详情</div>${detailHtml}</div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}

function cancelTransfer() {
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">已取消操作。</div></div></div>`);
}


// ========== 高阶版：转账记录查询与撤销 ==========
function showTransferHistory() {
  const history = mockData.userProfile.transferHistory || [];
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p><strong>转账记录查询</strong>（共 ${history.length} 笔）</p>
          <div class="data-card">
            ${history.map(t => `
              <div class="transfer-record-item">
                <div class="transfer-record-icon"></div>
                <div class="transfer-record-info">
                  <div class="transfer-record-name">转给 ${t.payee}</div>
                  <div class="transfer-record-meta">${t.time} · ${t.channel} · ${t.account}</div>
                </div>
                <div class="transfer-record-amount">-¥${t.amount.toLocaleString()}</div>
                <span class="transfer-record-status ${t.status === '已完成' ? 'done' : 'revoked'}">${t.status}</span>
                ${t.status === '已完成' ? `<button class="revoke-btn" onclick="revokeTransfer(${t.id})">撤销</button>` : ''}
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

function revokeTransfer(id) {
  const history = mockData.userProfile.transferHistory || [];
  const record = history.find(t => t.id === id);
  if (record && record.status === '已完成') {
    record.status = '已撤销';
    addTransaction('income', record.amount, `转账撤销-${record.payee}（原路退回）`, '转账撤销');
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
      <p><strong>转账已撤销</strong></p>
      <div class="data-card">
        <div class="data-row"><span class="data-label">收款人</span><span class="data-value">${record.payee}</span></div>
        <div class="data-row"><span class="data-label">撤销金额</span><span class="data-value income" style="font-weight:700;">+¥${record.amount.toLocaleString()}</span></div>
        <div class="data-row"><span class="data-label">退回方式</span><span class="data-value">原路退回</span></div>
        <div class="data-row"><span class="data-label">到账时间</span><span class="data-value" style="color:#22c55e;">即时到账</span></div>
      </div>
    </div></div></div>`);
    scrollToBottom();
  }
}


// ========== 功能增强：批量转账 ==========
// 批量转账选中的收款人
let batchTransferSelected = [];

// 智能解析批量转账指令：提取多个收款人和金额
function smartBatchTransferParse(text) {
  const contacts = mockData.contacts || [];
  const selectedIndexes = [];
  let amount = 0;

  // 提取金额
  const amountMatch = text.match(/(\d+(\.\d+)?)\s*[元块]?/);
  if (amountMatch) amount = parseFloat(amountMatch[1]);

  // 中文数字
  if (amount === 0) {
    const cnMatch = text.match(/([一二两三四五六七八九十百千万]+)\s*[元块]?/);
    if (cnMatch) {
      let cn = cnMatch[1];
      if (cn.includes('万')) amount = parseFloat(cn.replace('万', '')) * 10000;
      else if (cn.includes('千')) amount = parseFloat(cn.replace('千', '')) * 1000;
      else if (cn.includes('百')) amount = parseFloat(cn.replace('百', '')) * 100;
    }
  }

  // 匹配通讯录中的收款人（支持"和"、"、"分隔）
  contacts.forEach((c, idx) => {
    if (text.includes(c.name)) {
      selectedIndexes.push(idx);
    }
  });

  return { selectedIndexes, amount };
}

// 显示批量转账界面（支持预填选中的收款人和金额）
function showBatchTransfer(prefill) {
  // 先移除之前的批量转账界面，避免ID冲突
  const oldPanel = document.getElementById('batch-transfer-panel');
  if (oldPanel) oldPanel.closest('.message')?.remove();

  const contacts = mockData.contacts || [];
  
  // 预填选中的收款人和金额
  if (prefill && prefill.selectedIndexes && prefill.selectedIndexes.length > 0) {
    batchTransferSelected = [...prefill.selectedIndexes];
  } else {
    batchTransferSelected = [];
  }
  const prefillAmount = (prefill && prefill.amount > 0) ? prefill.amount : 100;
  
  const html = `
    <div class="message" id="batch-transfer-panel">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p><strong>批量转账</strong></p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px;color:#16a34a;">
            选择多个收款人，可统一设置金额或分别设置金额，一次确认批量转账。
          </div>
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:13px;font-weight:600;color:#374151;">选择收款人（已选 <span id="selectedCount">0</span> 人）</span>
              <button onclick="selectAllContacts()" style="background:none;border:none;color:#0B4F9C;font-size:12px;cursor:pointer;font-weight:600;">全选</button>
            </div>
            <div id="contactSelectList" style="max-height:200px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;padding:8px;">
              ${contacts.map((c, i) => `
                <div onclick="toggleContactSelect(${i})" id="contact-item-${i}" style="display:flex;align-items:center;padding:8px;border-radius:6px;cursor:pointer;transition:all 0.2s;">
                  <div style="width:20px;height:20px;border:2px solid #d1d5db;border-radius:4px;margin-right:10px;display:flex;align-items:center;justify-content:center;" id="contact-checkbox-${i}"></div>
                  <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#0B4F9C,#1F6FD0);color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;margin-right:10px;">${c.name.charAt(0)}</div>
                  <div style="flex:1;">
                    <div style="font-size:13px;font-weight:600;color:#1a1a1a;">${c.name}</div>
                    <div style="font-size:11px;color:#999;">${c.phone} · ${c.relation || '未设置'}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;color:#666;margin-bottom:6px;font-weight:600;">转账方式</label>
            <div style="display:flex;gap:8px;">
              <button onclick="setBatchAmountMode('uniform')" id="mode-uniform" style="flex:1;padding:10px;border:1px solid #0B4F9C;border-radius:8px;background:#F2F6FC;color:#0B4F9C;cursor:pointer;font-size:13px;font-weight:600;">统一金额</button>
              <button onclick="setBatchAmountMode('individual')" id="mode-individual" style="flex:1;padding:10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;color:#374151;cursor:pointer;font-size:13px;font-weight:600;">分别设置</button>
            </div>
          </div>
          <div id="uniformAmountSection" style="margin-bottom:12px;">
            <label style="display:block;font-size:13px;color:#666;margin-bottom:6px;font-weight:600;">每人转账金额（元）</label>
            <input type="number" id="batchUniformAmount" value="${prefillAmount}" min="0.01" step="0.01" oninput="updateBatchSummary()" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
          </div>
          <div id="individualAmountSection" style="display:none;margin-bottom:12px;">
            <div id="individualAmountList"></div>
          </div>
          <div id="batchSummary" style="background:#f9fafb;border-radius:10px;padding:12px;margin-bottom:16px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:#999;">转账人数</span><strong id="summaryCount">0 人</strong></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:#999;">转账总金额</span><strong style="color:#ef4444;font-size:16px;" id="summaryTotal">¥0.00</strong></div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-primary" style="flex:1;" onclick="confirmBatchTransfer()">确认批量转账</button>
            <button class="btn btn-secondary" style="flex:1;" onclick="appendMessage('<div class=\\'message\\'><div class=\\'msg-avatar user\\'>陈</div><div class=\\'msg-content\\'><div class=\\'msg-name\\'>小陈</div><div class=\\'msg-bubble\\'>取消批量转账</div></div></div>');scrollToBottom();">取消</button>
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
  window.batchAmountMode = 'uniform';
  
  // 渲染后自动更新汇总信息，并高亮选中的收款人
  setTimeout(() => {
    updateBatchSummary();
    // 高亮预填选中的收款人
    if (prefill && prefill.selectedIndexes && prefill.selectedIndexes.length > 0) {
      prefill.selectedIndexes.forEach(i => {
        const item = document.getElementById('contact-item-' + i);
        const checkbox = document.getElementById('contact-checkbox-' + i);
        if (item && checkbox) {
          item.style.background = '#F2F6FC';
          checkbox.style.background = '#0B4F9C';
          checkbox.style.borderColor = '#0B4F9C';
          checkbox.innerHTML = '✓';
          checkbox.style.color = 'white';
          checkbox.style.fontSize = '12px';
        }
      });
      const countEl = document.getElementById('selectedCount');
      if (countEl) countEl.textContent = prefill.selectedIndexes.length;
    }
  }, 100);
}

// 切换联系人选中状态
function toggleContactSelect(index) {
  const idx = batchTransferSelected.indexOf(index);
  if (idx > -1) {
    batchTransferSelected.splice(idx, 1);
  } else {
    batchTransferSelected.push(index);
  }
  updateContactSelectUI();
  updateBatchSummary();
}

// 全选联系人
function selectAllContacts() {
  const contacts = mockData.contacts || [];
  if (batchTransferSelected.length === contacts.length) {
    batchTransferSelected = [];
  } else {
    batchTransferSelected = contacts.map((_, i) => i);
  }
  updateContactSelectUI();
  updateBatchSummary();
}

// 更新联系人选择UI
function updateContactSelectUI() {
  const contacts = mockData.contacts || [];
  document.getElementById('selectedCount').textContent = batchTransferSelected.length;
  contacts.forEach((_, i) => {
    const item = document.getElementById('contact-item-' + i);
    const checkbox = document.getElementById('contact-checkbox-' + i);
    if (item && checkbox) {
      if (batchTransferSelected.includes(i)) {
        item.style.background = '#F2F6FC';
        checkbox.style.background = '#0B4F9C';
        checkbox.style.borderColor = '#0B4F9C';
        checkbox.innerHTML = '✓';
        checkbox.style.color = 'white';
        checkbox.style.fontSize = '12px';
      } else {
        item.style.background = 'transparent';
        checkbox.style.background = 'transparent';
        checkbox.style.borderColor = '#d1d5db';
        checkbox.innerHTML = '';
      }
    }
  });
  if (window.batchAmountMode === 'individual') {
    updateIndividualAmountList();
  }
}

// 设置批量金额模式
function setBatchAmountMode(mode) {
  window.batchAmountMode = mode;
  const uniformBtn = document.getElementById('mode-uniform');
  const individualBtn = document.getElementById('mode-individual');
  const uniformSection = document.getElementById('uniformAmountSection');
  const individualSection = document.getElementById('individualAmountSection');
  
  if (mode === 'uniform') {
    uniformBtn.style.borderColor = '#0B4F9C';
    uniformBtn.style.background = '#F2F6FC';
    uniformBtn.style.color = '#0B4F9C';
    individualBtn.style.borderColor = '#e5e7eb';
    individualBtn.style.background = '#fff';
    individualBtn.style.color = '#374151';
    uniformSection.style.display = 'block';
    individualSection.style.display = 'none';
  } else {
    individualBtn.style.borderColor = '#0B4F9C';
    individualBtn.style.background = '#F2F6FC';
    individualBtn.style.color = '#0B4F9C';
    uniformBtn.style.borderColor = '#e5e7eb';
    uniformBtn.style.background = '#fff';
    uniformBtn.style.color = '#374151';
    uniformSection.style.display = 'none';
    individualSection.style.display = 'block';
    updateIndividualAmountList();
  }
  updateBatchSummary();
}

// 更新分别设置金额的列表
function updateIndividualAmountList() {
  const list = document.getElementById('individualAmountList');
  if (!list) return;
  const contacts = mockData.contacts || [];
  if (batchTransferSelected.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:20px;color:#999;font-size:12px;">请先选择收款人</div>';
    return;
  }
  list.innerHTML = batchTransferSelected.map(i => {
    const c = contacts[i];
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;">
        <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#0B4F9C,#1F6FD0);color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;">${c.name.charAt(0)}</div>
        <span style="flex:1;font-size:13px;font-weight:600;">${c.name}</span>
        <input type="number" id="individual-amount-${i}" value="100" min="0.01" step="0.01" style="width:100px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;box-sizing:border-box;" oninput="updateBatchSummary()">
      </div>
    `;
  }).join('');
}

// 更新批量转账汇总
function updateBatchSummary() {
  const countEl = document.getElementById('summaryCount');
  const totalEl = document.getElementById('summaryTotal');
  if (!countEl || !totalEl) return;
  
  let total = 0;
  if (window.batchAmountMode === 'uniform') {
    const amount = parseFloat(document.getElementById('batchUniformAmount')?.value) || 0;
    total = amount * batchTransferSelected.length;
  } else {
    batchTransferSelected.forEach(i => {
      const amount = parseFloat(document.getElementById('individual-amount-' + i)?.value) || 0;
      total += amount;
    });
  }
  
  countEl.textContent = batchTransferSelected.length + ' 人';
  totalEl.textContent = '¥' + total.toLocaleString('zh-CN', {minimumFractionDigits: 2});
}

// 确认批量转账
async function confirmBatchTransfer() {
  if (batchTransferSelected.length === 0) {
    alert('请至少选择一个收款人');
    return;
  }
  
  const contacts = mockData.contacts || [];
  const d = mockData.userProfile.debitCard;
  let totalAmount = 0;
  const transfers = [];
  
  if (window.batchAmountMode === 'uniform') {
    const amount = parseFloat(document.getElementById('batchUniformAmount')?.value) || 0;
    if (amount <= 0) { alert('请输入正确的转账金额'); return; }
    batchTransferSelected.forEach(i => {
      transfers.push({ name: contacts[i].name, amount });
      totalAmount += amount;
    });
  } else {
    batchTransferSelected.forEach(i => {
      const amount = parseFloat(document.getElementById('individual-amount-' + i)?.value) || 0;
      if (amount <= 0) { alert(contacts[i].name + ' 的转账金额不正确'); return; }
      transfers.push({ name: contacts[i].name, amount });
      totalAmount += amount;
    });
  }
  
  // 余额门禁：必须用「可用余额」而非账面余额（冻结资金不可动用）
  const avail = Number(d.available) || 0;
  if (totalAmount > avail) {
    alert('可用余额不足！\n当前可用余额：¥' + avail.toLocaleString() +
      (d.frozen ? '（另有 ¥' + Number(d.frozen).toLocaleString() + ' 冻结）' : '') +
      '\n本次需要：¥' + totalAmount.toLocaleString() +
      '\n缺口：¥' + (totalAmount - avail).toLocaleString() + '\n\n账户不会被扣成负数，请调整金额或分批转账。');
    return;
  }

  // 人工确认框
  const confirmText = `确认批量转账？\n\n转账人数：${transfers.length} 人\n转账总金额：¥${totalAmount.toLocaleString('zh-CN', {minimumFractionDigits: 2})}\n当前可用余额：¥${avail.toLocaleString('zh-CN', {minimumFractionDigits: 2})}\n转账后余额：¥${(avail - totalAmount).toLocaleString('zh-CN', {minimumFractionDigits: 2})}\n\n${transfers.map(t => `• ${t.name}：¥${t.amount.toLocaleString()}`).join('\n')}`;

  if (!confirm(confirmText)) return;

  // 批量转账总额同样适用金额分级：T2 密码确认，T3 二次验证，T4 提交人工复核
  if (typeof verifyAmountRisk === 'function') {
    const batchActions = transfers.map(t => ({ tool: 'transfer.execute', args: { payee: t.name, amount: t.amount, channel: '批量转账' } }));
    const risk = await verifyAmountRisk(totalAmount, '批量转账', batchActions);
    if (risk && risk.pendingReview) return;
    if (!risk || !risk.ok) {
      appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">已取消批量转账，账户未发生扣款。</div></div></div>');
      scrollToBottom();
      return;
    }
  }

  // 执行批量转账：逐笔走统一的 transfer.execute 工具，
  // 与一键式转账共用余额门禁、转账记录和后端同步，不在这里另写一套扣款逻辑。
  let succeeded = 0, failed = 0;
  for (const t of transfers) {
    let res;
    if (typeof callAgentTool === 'function') {
      try {
        res = await callAgentTool('transfer.execute', { payee: t.name, amount: t.amount, channel: '批量转账' });
      } catch (e) {
        res = { ok: false, summary: (e && e.message) || '执行失败' };
      }
    } else {
      const okTx = addTransaction('expense', t.amount, '转账给' + t.name, '批量转账', true);
      if (okTx !== false) registerTransferRecord(t.name, t.amount, '批量转账');
      res = { ok: okTx !== false };
    }
    if (res.ok === false) failed++; else succeeded++;
  }
  saveUserData();
  
  // 移除批量转账界面，避免ID冲突
  const panel = document.getElementById('batch-transfer-panel');
  if (panel) panel.remove();
  
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">${failed === 0 ? '✅ <strong>批量转账成功</strong>' : '⚠️ <strong>批量转账部分完成</strong>'}<br>转账人数：${transfers.length} 人（成功 ${succeeded} 笔${failed ? '，失败 ' + failed + ' 笔（可用余额不足）' : ''}）<br>转账总金额：¥${totalAmount.toLocaleString('zh-CN', {minimumFractionDigits: 2})}<br><br>${transfers.map(t => `• ${t.name}：¥${t.amount.toLocaleString()}`).join('<br>')}<br><br>当前可用余额：¥${Number(d.available).toLocaleString('zh-CN', {minimumFractionDigits: 2})}</div></div></div>`);
  scrollToBottom();
}


// ==========================================================================
//  定时转账：创建时验证码 → 到期自动执行 → 执行前可取消
// ==========================================================================
var SCHEDULED_DEMO_OTP = '123456';

function schedEsc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function schedMoney(v) {
  return '¥' + (Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getScheduledTransfers() {
  const u = mockData.userProfile;
  if (!Array.isArray(u.scheduledTransfers)) u.scheduledTransfers = [];
  u.scheduledTransfers.forEach(t => { t.amount = Number(t.amount) || 0; });
  return u.scheduledTransfers;
}

function scheduledDateTimeValue(task) {
  const dp = String(task.date || '').split('-');
  const tp = String(task.time || '09:00').split(':');
  if (dp.length !== 3) return null;
  const d = new Date(Number(dp[0]), Number(dp[1]) - 1, Number(dp[2]), Number(tp[0] || 0), Number(tp[1] || 0), 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

function schedMaskAccount(account) {
  const s = String(account || '');
  if (s.length < 8) return s || '储蓄卡';
  return s.slice(0, 4) + ' **** ' + s.slice(-4);
}

function schedStatusClass(status) {
  if (status === '待执行') return 'pending';
  if (status === '已完成') return 'done';
  if (status === '已取消') return 'cancelled';
  return 'failed';
}

function schedDefaultTask(task) {
  const t = Object.assign({}, task || {});
  if (!t.date || !t.time) {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    t.date = localDateValue(d);
    t.time = '09:00';
  }
  t.repeat = t.repeat || '不重复';
  t.amount = Number(t.amount) || 0;
  return t;
}

function schedValidationError(task) {
  if (!task.payee) return '请选择收款人。';
  if (!(task.amount > 0)) return '请输入大于 0 的转账金额。';
  const due = scheduledDateTimeValue(task);
  if (!due) return '执行日期或时间格式不正确。';
  if (due.getTime() <= Date.now() + 60 * 1000) return '执行时间需晚于当前时间（至少 1 分钟后）。';
  return '';
}

function openScheduledTransferConfirm(task) {
  const t = schedDefaultTask(task);
  const err = schedValidationError(t);
  if (err) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">⚠️ <strong>无法创建定时转账</strong><br>${schedEsc(err)}</div></div></div>`);
    scrollToBottom();
    return;
  }
  window.__pendingScheduledTransfer = t;
  const info = (mockData.contacts || []).find(c => c.name === t.payee);
  const account = t.account || (info && info.account) || '';
  const avail = Number(mockData.userProfile.debitCard.available) || 0;
  const shortWarn = t.amount > avail
    ? `<div class="bank-confirm-warn">当前可用余额 ${schedMoney(avail)} 不足本次金额；到期时若仍未补足，任务会执行失败且不会扣款。</div>`
    : '';
  const cardId = 'sched-confirm-' + Date.now();

  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble agent-bubble">
          <div class="bank-confirm" id="${cardId}">
            <div class="bank-confirm-kicker">定时转账</div>
            <div class="bank-confirm-title">请确认转账计划</div>
            <div class="bank-confirm-amount">${schedMoney(t.amount)}</div>
            <div class="bank-confirm-rows">
              <div><span>收款人</span><b>${schedEsc(t.payee)}</b></div>
              <div><span>收款账户</span><b>${schedEsc(schedMaskAccount(account))}</b></div>
              <div><span>执行时间</span><b>${schedEsc(t.date)} ${schedEsc(t.time)}</b></div>
              <div><span>重复方式</span><b>${schedEsc(t.repeat)}</b></div>
              <div><span>备注</span><b>${schedEsc(t.remark || '无')}</b></div>
            </div>
            <div class="bank-confirm-note">创建后<b>不会立即扣款</b>。到期时系统会自动从储蓄卡转出；执行前你可以在「定时转账」中取消。</div>
            ${shortWarn}
            <div class="bank-otp-label">短信验证码</div>
            <div class="bank-otp-row">
              <input class="bank-otp-input" id="${cardId}-otp" type="text" inputmode="numeric" maxlength="6" placeholder="请输入 6 位验证码" autocomplete="one-time-code">
              <button class="btn btn-primary" onclick="submitScheduledTransferOtp(this)">验证并创建</button>
            </div>
            <div class="bank-otp-hint">验证码已发送至 138****6688（演示验证码：${SCHEDULED_DEMO_OTP}）</div>
            <div class="bank-otp-error" id="${cardId}-err"></div>
            <button class="bank-text-btn" onclick="cancelScheduledDraft(this)">取消，不创建任务</button>
          </div>
        </div>
      </div>
    </div>`;
  appendMessage(html);
  scrollToBottom();
  setTimeout(() => {
    const input = document.getElementById(cardId + '-otp');
    if (input) input.focus();
  }, 120);
}

function submitScheduledTransferOtp(btn) {
  const card = btn.closest('.bank-confirm');
  if (!card) return;
  const input = card.querySelector('.bank-otp-input');
  const errEl = card.querySelector('.bank-otp-error');
  const code = (input && input.value ? input.value : '').replace(/\D/g, '');
  if (code !== SCHEDULED_DEMO_OTP) {
    if (errEl) errEl.textContent = '验证码不正确，请重新输入（演示验证码：' + SCHEDULED_DEMO_OTP + '）';
    if (input) { input.value = ''; input.focus(); }
    return;
  }
  const task = window.__pendingScheduledTransfer;
  if (!task) {
    if (errEl) errEl.textContent = '确认信息已失效，请重新发起。';
    return;
  }
  const recheck = schedValidationError(task);
  if (recheck) {
    if (errEl) errEl.textContent = recheck;
    return;
  }
  // T4 定时转账：验证码通过后同样只提交人工复核，不创建自动扣款任务
  const tier = typeof agentTransferTier === 'function' ? agentTransferTier(task.amount, null) : null;
  if (tier && tier.needManual) {
    submitManualReview({
      amount: task.amount,
      purpose: '定时转账 ' + task.date + ' ' + task.time + ' 转给 ' + task.payee,
      source: 'Scheduled',
      items: ['收款人：' + task.payee, '执行时间：' + task.date + ' ' + task.time, '重复方式：' + task.repeat],
      tier: tier
    });
    window.__pendingScheduledTransfer = null;
    card.classList.add('done');
    card.innerHTML = '<div class="bank-result">' +
      '<div class="bank-result-icon" style="background:#FFF7ED;color:#B54708;">' + (typeof bankIcon === 'function' ? bankIcon('clock', 22) : '⏳') + '</div>' +
      '<div class="bank-result-title">已提交人工复核</div>' +
      '<div class="bank-result-amount">' + schedMoney(task.amount) + '</div>' +
      '<div class="bank-result-note">定时转账任务未创建，账户未扣款。人工复核通过后，请重新创建定时计划。</div>' +
      '</div>';
    if (typeof showToast === 'function') showToast('已提交人工复核，定时任务未创建', 2800);
    return;
  }
  const saved = createScheduledTransferTask(task);
  window.__pendingScheduledTransfer = null;
  card.classList.add('done');
  card.innerHTML = scheduledCreatedHtml(saved);
  if (typeof showToast === 'function') showToast('定时转账任务已创建，到期自动执行');
}

function cancelScheduledDraft(btn) {
  const card = btn.closest('.bank-confirm');
  window.__pendingScheduledTransfer = null;
  if (card) card.innerHTML = '<div class="bank-cancelled">已取消，未创建定时转账任务。</div>';
}

function createScheduledTransferTask(task) {
  const list = getScheduledTransfers();
  const now = new Date();
  const record = {
    id: 'st' + Date.now() + Math.floor(Math.random() * 1000),
    payee: task.payee,
    account: task.account || '',
    amount: Number(task.amount) || 0,
    date: task.date,
    time: task.time,
    repeat: task.repeat || '不重复',
    remark: task.remark || '',
    channel: task.channel || '表单',
    status: '待执行',
    verified: true,
    createdAt: now.toLocaleString('zh-CN'),
    runCount: 0,
    lastRunAt: null,
    lastError: null
  };
  list.unshift(record);
  saveUserData();
  // 避免页面上留着旧的"暂无任务/待执行"列表，造成信息矛盾
  const staleList = document.getElementById('scheduled-list-card');
  if (staleList) staleList.remove();
  return record;
}

function scheduledCreatedHtml(task) {
  return '<div class="bank-result" id="sched-created-' + schedEsc(task.id) + '">' +
    '<div class="bank-result-icon">' + bankIcon('check', 22) + '</div>' +
    '<div class="bank-result-title">定时转账任务已创建</div>' +
    '<div class="bank-result-amount">' + schedMoney(task.amount) + '</div>' +
    '<div class="bank-confirm-rows">' +
      '<div><span>收款人</span><b>' + schedEsc(task.payee) + '</b></div>' +
      '<div><span>执行时间</span><b>' + schedEsc(task.date) + ' ' + schedEsc(task.time) + '</b></div>' +
      '<div><span>重复方式</span><b>' + schedEsc(task.repeat) + '</b></div>' +
      '<div><span>状态</span><b class="bank-green sched-created-status">待执行 · 已通过验证</b></div>' +
    '</div>' +
    '<div class="bank-result-note">到期后自动从储蓄卡扣款；执行前可在「定时转账」中取消。</div>' +
    '<div class="bank-result-actions">' +
      '<button class="btn btn-primary" onclick="showScheduledTransfers()">查看定时任务</button>' +
      '<button class="btn btn-secondary" onclick="openTimedTransferForm()">再建一笔</button>' +
    '</div>' +
  '</div>';
}

// 任务状态变化后，同步更新页面上对应的"创建成功"卡片和列表计数，避免出现
// "列表已取消、成功卡片还写着待执行" 这类自相矛盾的信息。
function updateScheduledCreatedStatus(taskId, text, cls) {
  const card = document.getElementById('sched-created-' + taskId);
  if (!card) return;
  const el = card.querySelector('.sched-created-status');
  if (el) {
    el.textContent = text;
    el.className = 'sched-created-status ' + (cls || 'bank-green');
  }
}

function refreshScheduledListCount() {
  const el = document.querySelector('#scheduled-list-card .bank-page-sub');
  if (!el) return;
  const pending = getScheduledTransfers().filter(t => t.status === '待执行').length;
  el.textContent = '共 ' + pending + ' 笔待执行';
}

function openTimedTransferForm() {
  showTransferForm();
  setTimeout(function () {
    const form = document.querySelector('.transfer-form');
    const tabs = form ? form.querySelectorAll('.tab') : [];
    if (tabs[3]) switchTransferTab(tabs[3], 'timed');
  }, 30);
}

function showScheduledTransfers() {
  if (typeof runDueScheduledTransfers === 'function') runDueScheduledTransfers({ silent: true });
  const list = getScheduledTransfers();
  const pending = list.filter(t => t.status === '待执行');
  const history = list.filter(t => t.status !== '待执行');
  const sorted = pending.slice().sort((a, b) => {
    const da = scheduledDateTimeValue(a), db = scheduledDateTimeValue(b);
    return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
  }).concat(history);

  const rows = sorted.map(t => {
    const due = scheduledDateTimeValue(t);
    const dateLabel = due ? (String(due.getMonth() + 1).padStart(2, '0') + '-' + String(due.getDate()).padStart(2, '0')) : '--';
    const timeLabel = due ? localTimeValue(due) : (t.time || '09:00');
    return '<div class="bank-sched-item" id="sched-row-' + t.id + '">' +
      '<div class="bank-sched-date"><b>' + dateLabel + '</b><small>' + timeLabel + '</small></div>' +
      '<div class="bank-sched-main"><b>转给 ' + schedEsc(t.payee) + '</b><small>' + schedMoney(t.amount) + ' · ' + schedEsc(t.repeat) + '</small></div>' +
      '<div class="bank-sched-side">' +
        '<span class="bank-status ' + schedStatusClass(t.status) + '">' + schedEsc(t.status) + '</span>' +
        (t.status === '待执行' ? '<button class="bank-sched-cancel" onclick="cancelScheduledTransferTask(\'' + t.id + '\')">取消</button>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  const empty = '<div class="bank-sched-empty">暂无定时转账任务。<br>设置一笔计划，到期自动执行，执行前可随时取消。</div>';
  const html = '<div class="message" id="scheduled-list-card"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手</div><div class="msg-bubble agent-bubble">' +
    '<div class="bank-page-head"><div><div class="bank-page-title">定时转账</div><div class="bank-page-sub">共 ' + pending.length + ' 笔待执行</div></div>' +
    '<button class="bank-link" onclick="openTimedTransferForm()">+ 新建</button></div>' +
    '<div class="bank-sched-list">' + (rows || empty) + '</div>' +
    '<div class="bank-result-note">任务创建时已通过验证码验证；到期自动从储蓄卡扣款，执行前可取消。执行失败不会产生扣款。</div>' +
    '</div></div></div>';
  const old = document.getElementById('scheduled-list-card');
  if (old) old.remove();
  appendMessage(html);
  scrollToBottom();
}

function cancelScheduledTransferTask(id) {
  const task = getScheduledTransfers().find(t => String(t.id) === String(id));
  if (!task || task.status !== '待执行') return;
  if (!confirm('确定取消这笔定时转账？\n\n收款人：' + task.payee + '\n金额：' + schedMoney(task.amount) + '\n执行时间：' + task.date + ' ' + task.time)) return;
  task.status = '已取消';
  task.cancelledAt = new Date().toLocaleString('zh-CN');
  saveUserData();
  const row = document.getElementById('sched-row-' + task.id);
  if (row) {
    const statusEl = row.querySelector('.bank-status');
    if (statusEl) { statusEl.className = 'bank-status cancelled'; statusEl.textContent = '已取消'; }
    const btn = row.querySelector('.bank-sched-cancel');
    if (btn) btn.remove();
  }
  updateScheduledCreatedStatus(task.id, '已取消', 'bank-muted');
  refreshScheduledListCount();
  if (typeof showToast === 'function') showToast('定时转账已取消');
}

// 计算下一次执行日期；不重复任务返回 null
function nextScheduledRun(date, time, repeat) {
  if (!repeat || repeat === '不重复') return null;
  const d = scheduledDateTimeValue({ date: date, time: time });
  if (!d) return null;
  let guard = 0;
  do {
    if (repeat === '每天') {
      d.setDate(d.getDate() + 1);
    } else if (repeat === '每周') {
      d.setDate(d.getDate() + 7);
    } else if (repeat === '每月') {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, lastDay));
    } else {
      return null;
    }
    guard++;
  } while (d.getTime() <= Date.now() && guard < 400);
  return { date: localDateValue(d), time: localTimeValue(d) };
}

function executeScheduledTransferTask(task) {
  const amount = Number(task.amount) || 0;
  if (!(amount > 0)) {
    task.status = '执行失败';
    task.lastError = '金额无效';
    task.lastRunAt = new Date().toLocaleString('zh-CN');
    updateScheduledCreatedStatus(task.id, '执行失败', 'bank-red');
    refreshScheduledListCount();
    return { ok: false, reason: '金额无效' };
  }
  const okTx = addTransaction('expense', amount, '定时转账给' + task.payee, '定时转账', true);
  if (okTx === false) {
    task.status = '执行失败';
    task.lastError = '可用余额不足';
    task.lastRunAt = new Date().toLocaleString('zh-CN');
    updateScheduledCreatedStatus(task.id, '执行失败', 'bank-red');
    refreshScheduledListCount();
    return { ok: false, reason: '可用余额不足' };
  }
  registerTransferRecord(task.payee, amount, '定时转账', task.account);
  // 与即时转账保持一致：同步到后端模拟银行核心，避免刷新后被服务端快照"退回"
  if (typeof apiTransfer === 'function') apiTransfer(task.payee, amount);
  task.runCount = (task.runCount || 0) + 1;
  task.lastRunAt = new Date().toLocaleString('zh-CN');
  task.lastError = null;
  const next = nextScheduledRun(task.date, task.time, task.repeat);
  if (next) {
    task.date = next.date;
    task.time = next.time;
    task.status = '待执行';
    updateScheduledCreatedStatus(task.id, '待执行 · 下次 ' + next.date + ' ' + next.time, 'bank-green');
  } else {
    task.status = '已完成';
    task.executedAt = task.lastRunAt;
    updateScheduledCreatedStatus(task.id, '已完成', 'bank-green');
  }
  refreshScheduledListCount();
  saveUserData();
  return { ok: true, next: next };
}

function scheduledRunResultHtml(results) {
  const okCount = results.filter(r => r.ok).length;
  const failCount = results.length - okCount;
  const title = failCount === 0 ? '定时转账已自动执行' : (okCount ? '定时转账部分执行成功' : '定时转账执行失败');
  const rows = results.map(r => {
    const t = r.task;
    const next = r.next ? '下次 ' + r.next.date + ' ' + r.next.time : '';
    return '<div class="bank-sched-result ' + (r.ok ? 'ok' : 'fail') + '">' +
      '<span class="bank-sched-result-ico">' + bankIcon(r.ok ? 'check' : 'close', 15) + '</span>' +
      '<span class="bank-sched-result-main"><b>转给 ' + schedEsc(t.payee) + '</b><small>' + (r.ok ? (next || '已完成') : (r.reason || '执行失败')) + '</small></span>' +
      '<span class="bank-sched-result-amt">' + schedMoney(t.amount) + '</span>' +
    '</div>';
  }).join('');
  return '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 定时任务</div><div class="msg-bubble agent-bubble">' +
    '<div class="bank-notice-head">' + title + '</div>' + rows +
    '<div class="bank-result-note">' + (failCount
      ? '失败任务未产生任何扣款，请补足可用余额后重新创建。'
      : '资金已从储蓄卡转出并记入转账记录。') + '</div>' +
    '<div class="bank-result-actions"><button class="btn btn-secondary" onclick="showScheduledTransfers()">查看定时任务</button></div>' +
    '</div></div></div>';
}

function runDueScheduledTransfers(opts) {
  if (window.__scheduledRunning) return;
  window.__scheduledRunning = true;
  try {
    const list = getScheduledTransfers();
    const now = Date.now();
    const results = [];
    list.forEach(task => {
      if (task.status !== '待执行' || task.verified !== true) return;
      const due = scheduledDateTimeValue(task);
      if (!due || due.getTime() > now) return;
      const res = executeScheduledTransferTask(task);
      results.push(Object.assign({ task: task }, res));
    });
    if (results.length) {
      saveUserData();
      if (!opts || !opts.silent) {
        const staleList = document.getElementById('scheduled-list-card');
        if (staleList) staleList.remove();
        appendMessage(scheduledRunResultHtml(results));
        scrollToBottom();
      }
      if (typeof showToast === 'function') {
        const failed = results.filter(r => !r.ok).length;
        showToast(failed ? '有定时转账执行失败，请查看' : '定时转账已自动执行');
      }
    }
  } finally {
    window.__scheduledRunning = false;
  }
}

function initScheduledTransferEngine() {
  // 稍后再跑：给 api.js 的快照注入留出时间，避免"先本地扣款、再被快照覆盖"的竞态
  setTimeout(function () { runDueScheduledTransfers(); }, 600);
  if (window.__scheduledTimer) clearInterval(window.__scheduledTimer);
  window.__scheduledTimer = setInterval(function () { runDueScheduledTransfers(); }, 30000);
}


