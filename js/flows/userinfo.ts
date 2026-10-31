// ==========================================================================
//  经典脚本模块（TypeScript 源码，noCheck 转译）
//  编译产物：js/flows/userinfo.js
//  说明：本层为「全局函数 + 动态状态」结构，采用 noCheck 转译；
//        对外符号统一在 types/global.d.ts 声明。
// ==========================================================================

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

          <!-- 信用卡信息（与「卡片管理」同源：u.creditCards） -->
          <div class="data-card">
            <div class="data-card-title">💳 信用卡</div>
            ${(() => {
              const cards = Array.isArray(u.creditCards) ? u.creditCards : [];
              if (!cards.length) return '<div class="data-row"><span class="data-label">信用卡</span><span class="data-value">暂无</span></div>';
              const totalLimit = cards.reduce((s, x) => s + (Number(x.limit) || 0), 0);
              const totalUsed = cards.reduce((s, x) => s + (Number(x.used) || 0), 0);
              return cards.map(card => {
                const limit = Number(card.limit) || 0;
                const used = Number(card.used) || 0;
                return '<div class="data-row"><span class="data-label">' + card.cardType + '（尾号 ' + card.tail + '）</span>' +
                  '<span class="data-value">额度 ¥' + limit.toLocaleString('zh-CN') + ' · 已用 ¥' + used.toLocaleString('zh-CN') + ' · 可用 ¥' + (limit - used).toLocaleString('zh-CN') + '</span></div>';
              }).join('') +
                '<div class="data-row"><span class="data-label">合计</span><span class="data-value"><b>额度 ¥' + totalLimit.toLocaleString('zh-CN') + ' · 已用 ¥' + totalUsed.toLocaleString('zh-CN') + ' · 可用 ¥' + (totalLimit - totalUsed).toLocaleString('zh-CN') + '</b></span></div>';
            })()}
          </div>

          <!-- 贷款模块已下线 -->

          <!-- 复核审批 -->
          ${(() => {
            const list = (u.manualReviews || []);
            const pending = list.filter(r => r.status === '待人工复核').length;
            return '<div class="data-card">' +
              '<div class="data-card-title">🛡️ 复核审批</div>' +
              '<div class="data-row"><span class="data-label">待审批</span><span class="data-value" style="color:#B45309;font-weight:600;">' + pending + ' 笔</span></div>' +
              '<div class="data-row"><span class="data-label">累计申请</span><span class="data-value">' + list.length + ' 笔</span></div>' +
              (list.length ? '' : '<div class="data-row"><span class="data-label">说明</span><span class="data-value" style="font-weight:400;">大额转账（≥ ¥50,000）、信用卡申请、额度调整会进入人工复核</span></div>') +
              '<div style="margin-top:8px;"><button class="ui-link" onclick="showUserInfoFromTopbar(); switchUserInfoTab(&quot;reviews&quot;, null);">查看/处理复核</button></div>' +
              '</div>';
          })()}


          

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

