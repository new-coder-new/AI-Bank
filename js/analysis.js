// ========== 账单分析 ==========
function reportEsc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function reportMoney(v) {
  const n = Number(v) || 0;
  return (n < 0 ? '-' : '') + '¥' + Math.abs(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function reportInt(v) {
  return '¥' + Math.round(Number(v) || 0).toLocaleString('zh-CN');
}

function reportColor(i) {
  const colors = ['#0B4F9C', '#2F80ED', '#56CCF2', '#6FCF97', '#F2C94C', '#9B51E0', '#94A3B8', '#C08A2E'];
  return colors[i % colors.length];
}

function showBillAnalysis() {
  const u = mockData.userProfile;
  const expenseMap = {};
  const incomeMap = {};
  // 只统计当前交易流水，避免把静态月度账单和动态流水重复相加
  (u.recentTxns || []).forEach(t => {
    if (t.type === 'expense') {
      expenseMap[t.channel] = (expenseMap[t.channel] || 0) + t.amount;
    } else {
      incomeMap[t.channel] = (incomeMap[t.channel] || 0) + t.amount;
    }
  });
  const expenseList = Object.entries(expenseMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const incomeList = Object.entries(incomeMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const now = new Date();
  const monthLabel = now.getFullYear() + '年' + (now.getMonth() + 1) + '月';
  window.billExpenseData = expenseList;
  window.billIncomeData = incomeList;

  const totalIncome = incomeList.reduce((s, i) => s + i.value, 0);
  const totalExpense = expenseList.reduce((s, i) => s + i.value, 0);
  const netFlow = totalIncome - totalExpense;
  const maxExpense = expenseList.length ? expenseList[0].value : 1;
  const bars = expenseList.slice(0, 6).map((item, i) => `
    <div class="report-bar">
      <span class="report-bar-label">${reportEsc(item.label)}</span>
      <span class="report-bar-track"><i style="width:${Math.max(3, item.value / maxExpense * 100)}%;background:${reportColor(i)};"></i></span>
      <b>${reportInt(item.value)}</b>
    </div>
  `).join('');
  const expenseRows = expenseList.length
    ? expenseList.map(i => `<div class="report-row"><span>${reportEsc(i.label)}</span><b class="expense">-${reportMoney(i.value)}</b></div>`).join('')
    : '<div class="report-empty">暂无支出</div>';
  const incomeRows = incomeList.length
    ? incomeList.map(i => `<div class="report-row"><span>${reportEsc(i.label)}</span><b class="income">+${reportMoney(i.value)}</b></div>`).join('')
    : '<div class="report-empty">暂无收入</div>';

  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <div class="report-page">
            <div class="report-head">
              <div>
                <div class="report-title">账单分析</div>
                <div class="report-sub">${monthLabel} · 含动态交易记录</div>
              </div>
            </div>
            <div class="report-summary">
              <div><span>总收入</span><b class="income">+${reportMoney(totalIncome)}</b></div>
              <div><span>总支出</span><b class="expense">-${reportMoney(totalExpense)}</b></div>
              <div><span>净现金流</span><b class="${netFlow >= 0 ? 'income' : 'expense'}">${netFlow >= 0 ? '+' : ''}${reportMoney(netFlow)}</b></div>
            </div>
            <div class="report-chart-grid">
              <div class="report-panel">
                <div class="report-panel-title">支出构成</div>
                <div class="report-donut"><canvas id="pieChart"></canvas></div>
                <div class="report-legend" id="pieLegend"></div>
              </div>
              <div class="report-panel">
                <div class="report-panel-title">分类支出</div>
                <div class="report-bars">${bars || '<div class="report-empty">暂无支出</div>'}</div>
              </div>
            </div>
            <div class="report-detail-grid">
              <div class="report-panel">
                <div class="report-panel-title">支出明细</div>
                ${expenseRows}
              </div>
              <div class="report-panel">
                <div class="report-panel-title">收入明细</div>
                ${incomeRows}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  setTimeout(drawPieChart, 60);
  scrollToBottom();
}

function drawPieChart() {
  const canvas = document.getElementById('pieChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rawData = window.billExpenseData || mockData.bills.expense;
  const data = rawData.map((d, i) => ({ ...d, color: d.color || reportColor(i) }));
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 180;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2, r = 68, innerR = 43;
  if (total <= 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#E6EAF0';
    ctx.lineWidth = 18;
    ctx.stroke();
  } else {
    let startAngle = -Math.PI / 2;
    data.forEach(d => {
      const sliceAngle = (d.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
      startAngle += sliceAngle;
    });
  }
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  const compact = total >= 10000 ? (total / 10000).toFixed(1) + '万' : Math.round(total).toLocaleString('zh-CN');
  ctx.fillStyle = '#16202E';
  ctx.font = '600 13px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('¥' + compact, cx, cy + 2);
  ctx.fillStyle = '#8A97A8';
  ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('总支出', cx, cy + 18);

  const legend = document.getElementById('pieLegend');
  if (legend) {
    legend.innerHTML = data.slice(0, 6).map(d => {
      const pct = total > 0 ? (d.value / total * 100).toFixed(1) : '0.0';
      return '<div class="report-legend-item"><span class="report-dot" style="background:' + d.color + ';"></span><span>' +
        reportEsc(d.label) + '</span><b>' + pct + '%</b></div>';
    }).join('');
  }
}


// ========== 异常交易识别与预警 ==========
function detectAbnormalTxns() {
  const txns = mockData.userProfile.recentTxns;
  const abnormal = [];
  txns.forEach(t => {
    if (t.abnormal) {
      abnormal.push(t);
    } else {
      if (t.type === 'expense' && t.amount > 3000 && !t.desc.includes('房贷') && !t.desc.includes('还款')) {
        t.abnormal = true;
        t.abnormalReason = '大额消费';
        abnormal.push(t);
      }
      const hour = parseInt(t.time.split(' ')[1]?.split(':')[0]) || 0;
      if (t.type === 'expense' && hour >= 0 && hour < 5 && !t.abnormal) {
        t.abnormal = true;
        t.abnormalReason = '凌晨交易';
        abnormal.push(t);
      }
    }
  });
  return abnormal;
}

function showAbnormalAlert() {
  const abnormal = detectAbnormalTxns();
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <div class="alert-banner">
            <div class="alert-banner-icon">!</div>
            <div class="alert-banner-content">
              <div class="alert-banner-title">检测到 ${abnormal.length} 笔异常交易</div>
              <div class="alert-banner-desc">系统已自动识别大额消费、凌晨交易等风险行为</div>
            </div>
          </div>
          <div class="data-card">
            <div class="data-card-title">异常交易明细</div>
            ${abnormal.map(t => `
              <div class="data-row abnormal-row">
                <span class="data-label" style="flex:1;">
                  <div style="font-size:12px;color:#333;font-weight:500;">${t.desc}<span class="abnormal-tag">${t.abnormalReason}</span></div>
                  <div style="font-size:10px;color:#999;margin-top:2px;">${t.time} · ${t.channel}</div>
                </span>
                <span class="data-value expense" style="font-weight:700;">-¥${t.amount.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span>
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


// ========== 财务报告 ==========
function showFinanceReport() {
  const u = mockData.userProfile;
  const totalIncome = u.recentTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = u.recentTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netFlow = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? ((netFlow / totalIncome) * 100).toFixed(1) : '0.0';
  const holdings = u.holdings || [];
  const totalHoldings = holdings.reduce((s, h) => s + h.amount, 0);
  const totalProfit = holdings.reduce((s, h) => s + (h.profit || 0), 0);
  const subscriptions = mockData.subscriptions;
  const monthlySubExpense = subscriptions.reduce((s, sub) => {
    const monthly = sub.cycle === '/月' ? sub.price : sub.cycle === '/季' ? sub.price / 3 : sub.price / 12;
    return s + monthly;
  }, 0);
  const now = new Date();
  const monthLabel = now.getFullYear() + '年' + (now.getMonth() + 1) + '月';
  const advice = [
    '本月储蓄率 ' + savingsRate + '%，表现' + (savingsRate > 30 ? '优秀' : savingsRate > 10 ? '良好' : '有待提升') + '。',
    '建议将闲置资金的 ' + Math.min(30, Math.max(10, parseInt(savingsRate) / 2)) + '% 配置稳健型理财产品。',
    '订阅月均支出 ' + reportMoney(monthlySubExpense) + '，建议定期检查不必要的订阅。',
    '下月目标：将储蓄率提升至 ' + Math.min(50, parseInt(savingsRate) + 5) + '%。'
  ];
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <div class="report-page">
            <div class="report-head">
              <div>
                <div class="report-title">财务报告</div>
                <div class="report-sub">${monthLabel} · 收支与资产概览</div>
              </div>
            </div>
            <div class="report-hero">
              <div><span>本月净现金流</span><b class="${netFlow >= 0 ? 'income' : 'expense'}">${netFlow >= 0 ? '+' : ''}${reportMoney(netFlow)}</b></div>
              <div class="report-hero-side"><span>储蓄率</span><b>${savingsRate}%</b></div>
            </div>
            <div class="report-metric-grid">
              <div><span>总收入</span><b class="income">+${reportMoney(totalIncome)}</b></div>
              <div><span>总支出</span><b class="expense">-${reportMoney(totalExpense)}</b></div>
              <div><span>订阅月均</span><b class="expense">-${reportMoney(monthlySubExpense)}</b></div>
            </div>
            <div class="report-panel" style="margin-top:12px;">
              <div class="report-panel-title">资产状况</div>
              <div class="report-row"><span>储蓄卡余额</span><b>${reportMoney(u.debitCard.balance)}</b></div>
              <div class="report-row"><span>冻结金额</span><b>${reportMoney(u.debitCard.frozen)}</b></div>
              <div class="report-row"><span>理财持仓</span><b>${holdings.length} 只 · ${reportMoney(totalHoldings)}</b></div>
              <div class="report-row"><span>累计收益</span><b class="${totalProfit >= 0 ? 'income' : 'expense'}">${totalProfit >= 0 ? '+' : ''}${reportMoney(totalProfit)}</b></div>
              <div class="report-row"><span>信用卡已用</span><b>${reportInt(u.creditCard.used)} / ${reportInt(u.creditCard.limit)}</b></div>
            </div>
            <div class="report-panel" style="margin-top:12px;">
              <div class="report-panel-title">建议</div>
              <ul class="report-advice">${advice.map(x => '<li>' + x + '</li>').join('')}</ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}
