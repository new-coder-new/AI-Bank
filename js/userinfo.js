// ========== 银行用户信息查询（模拟真实用户数据） ==========
function showUserInfo() {
  const u = mockData.userProfile;
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p>以下是查询到的银行用户信息：</p>

          <!-- 客户基本信息 -->
          <div class="data-card">
            <div class="data-card-title">👤 客户基本信息</div>
            <div class="data-row"><span class="data-label">客户姓名</span><span class="data-value">${u.name}</span></div>
            <div class="data-row"><span class="data-label">性别</span><span class="data-value">${u.gender}</span></div>
            <div class="data-row"><span class="data-label">身份证号</span><span class="data-value">${u.idCard}</span></div>
            <div class="data-row"><span class="data-label">出生日期</span><span class="data-value">${u.birthday}</span></div>
            <div class="data-row"><span class="data-label">手机号码</span><span class="data-value">${u.phone}</span></div>
            <div class="data-row"><span class="data-label">电子邮箱</span><span class="data-value">${u.email}</span></div>
            <div class="data-row"><span class="data-label">联系地址</span><span class="data-value">${u.address}</span></div>
            <div class="data-row"><span class="data-label">客户等级</span><span class="data-value" style="color:#0B4F9C;font-weight:700;">${u.level}</span></div>
            <div class="data-row"><span class="data-label">开户日期</span><span class="data-value">${u.openDate}</span></div>
            <div class="data-row"><span class="data-label">客户经理</span><span class="data-value">${u.manager}</span></div>
          </div>

          <!-- 储蓄卡信息 -->
          <div class="data-card">
            <div class="data-card-title">🏦 储蓄卡（Ⅰ类账户）</div>
            <div class="data-row"><span class="data-label">卡号</span><span class="data-value">${u.debitCard.number}</span></div>
            <div class="data-row"><span class="data-label">开户银行</span><span class="data-value">${u.debitCard.bank}</span></div>
            <div class="data-row"><span class="data-label">开户网点</span><span class="data-value">${u.debitCard.branch}</span></div>
            <div class="data-row"><span class="data-label">账户状态</span><span class="data-value" style="color:#22c55e;font-weight:600;">${u.debitCard.status}</span></div>
            <div class="data-row"><span class="data-label">账户余额</span><span class="data-value" style="font-weight:700;">¥ ${u.debitCard.balance.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
            <div class="data-row"><span class="data-label">可用余额</span><span class="data-value" style="color:#22c55e;font-weight:600;">¥ ${u.debitCard.available.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
            <div class="data-row"><span class="data-label">冻结金额</span><span class="data-value" style="color:#f59e0b;">¥ ${u.debitCard.frozen.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
            <div class="data-row"><span class="data-label">今日收入</span><span class="data-value income">+¥ ${u.debitCard.todayIncome.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
            <div class="data-row"><span class="data-label">今日支出</span><span class="data-value expense">-¥ ${u.debitCard.todayExpense.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
          </div>

          <!-- 信用卡信息 -->
          <div class="data-card">
            <div class="data-card-title">💳 信用卡</div>
            <div class="data-row"><span class="data-label">卡号</span><span class="data-value">${u.creditCard.number}</span></div>
            <div class="data-row"><span class="data-label">卡片等级</span><span class="data-value">${u.creditCard.level}</span></div>
            <div class="data-row"><span class="data-label">信用额度</span><span class="data-value">¥ ${u.creditCard.limit.toLocaleString()}</span></div>
            <div class="data-row"><span class="data-label">已用额度</span><span class="data-value expense">¥ ${u.creditCard.used.toLocaleString()}</span></div>
            <div class="data-row"><span class="data-label">可用额度</span><span class="data-value" style="color:#22c55e;font-weight:600;">¥ ${u.creditCard.available.toLocaleString()}</span></div>
            <div class="data-row"><span class="data-label">账单日</span><span class="data-value">每月 ${u.creditCard.billDay} 日</span></div>
            <div class="data-row"><span class="data-label">还款日</span><span class="data-value">每月 ${u.creditCard.dueDay} 日</span></div>
            <div class="data-row"><span class="data-label">本期账单金额</span><span class="data-value expense">¥ ${u.creditCard.currentBill.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
            <div class="data-row"><span class="data-label">最低还款额</span><span class="data-value">¥ ${u.creditCard.minPayment.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
          </div>

          <!-- 贷款信息 -->
          <div class="data-card">
            <div class="data-card-title">🏠 贷款信息</div>
            <div class="data-row"><span class="data-label">贷款类型</span><span class="data-value">${u.loan.type}</span></div>
            <div class="data-row"><span class="data-label">贷款合同号</span><span class="data-value">${u.loan.contractNo}</span></div>
            <div class="data-row"><span class="data-label">贷款金额</span><span class="data-value">¥ ${u.loan.amount.toLocaleString()}</span></div>
            <div class="data-row"><span class="data-label">剩余本金</span><span class="data-value" style="font-weight:600;">¥ ${u.loan.remaining.toLocaleString()}</span></div>
            <div class="data-row"><span class="data-label">月供金额</span><span class="data-value expense">¥ ${u.loan.monthlyPayment.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
            <div class="data-row"><span class="data-label">贷款利率</span><span class="data-value">${u.loan.rate}%</span></div>
            <div class="data-row"><span class="data-label">放款日期</span><span class="data-value">${u.loan.startDate}</span></div>
            <div class="data-row"><span class="data-label">到期日期</span><span class="data-value">${u.loan.endDate}</span></div>
            <div class="data-row"><span class="data-label">还款方式</span><span class="data-value">${u.loan.repayMethod}</span></div>
            <div class="data-row"><span class="data-label">贷款状态</span><span class="data-value" style="color:#22c55e;font-weight:600;">${u.loan.status}</span></div>
          </div>

          <!-- 最近交易记录 -->
          <div class="data-card">
            <div class="data-card-title">📋 最近交易记录（近10笔）</div>
            ${u.recentTxns.map(t => `
              <div class="data-row">
                <span class="data-label" style="flex:1;">
                  <div style="font-size:12px;color:#333;font-weight:500;">${t.desc}</div>
                  <div style="font-size:10px;color:#999;margin-top:2px;">${t.time} · ${t.channel}</div>
                </span>
                <span class="data-value ${t.type === 'income' ? 'income' : 'expense'}" style="font-weight:600;">
                  ${t.type === 'income' ? '+' : '-'}¥ ${t.amount.toLocaleString('zh-CN', {minimumFractionDigits: 2})}
                </span>
              </div>
            `).join('')}
          </div>

          <p style="margin-top:10px;font-size:12px;color:#999;">以上为模拟用户数据，仅用于演示。真实环境需对接银行核心系统接口并完成身份认证。</p>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}

