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

// 账单分析底部的一行 AI 建议：按本月收支与支出结构给一句可执行建议
function billAnalysisAdvice(totalIncome, totalExpense, expenseList) {
  const net = totalIncome - totalExpense;
  const rate = totalIncome > 0 ? net / totalIncome * 100 : 0;
  const top = (expenseList || [])[0];
  const topPct = (top && totalExpense > 0) ? top.value / totalExpense * 100 : 0;
  if (totalIncome <= 0) {
    return '本月暂无收入记录，先核对流水是否同步完整，再判断收支是否健康。';
  }
  if (net < 0) {
    return '本月支出比收入多 ' + reportInt(Math.abs(net)) + '，优先压缩「' + (top ? top.label : '非必要消费') + '」，避免动用储蓄补缺口。';
  }
  if (topPct >= 45) {
    return '支出集中在「' + top.label + '」（占 ' + topPct.toFixed(1) + '%），本月结余 ' + reportInt(net) + '，可把其中 30% 转入货币基金降低单一支出波动。';
  }
  if (rate >= 30) {
    return '储蓄率 ' + rate.toFixed(1) + '% 表现良好，结余 ' + reportInt(net) + ' 建议按 5:3:2 分配到货币基金、稳健理财与应急金。';
  }
  return '储蓄率 ' + rate.toFixed(1) + '%，结余 ' + reportInt(net) + '；建议先补足 3 个月应急金，再考虑长期理财。';
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
  let incomeList = Object.entries(incomeMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  // 动态流水没有收入记录时回落到静态月度账单，保证收入构成饼图不空转
  if (!incomeList.length) {
    incomeList = (mockData.bills.income || []).map(i => ({ label: i.label, value: i.value }));
  }
  const now = new Date();
  const monthLabel = now.getFullYear() + '年' + (now.getMonth() + 1) + '月';
  window.billExpenseData = expenseList;
  window.billIncomeData = incomeList;

  const totalIncome = incomeList.reduce((s, i) => s + i.value, 0);
  const totalExpense = expenseList.reduce((s, i) => s + i.value, 0);

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
            <div class="report-summary cols-2">
              <div><span>总收入</span><b class="income">+${reportMoney(totalIncome)}</b></div>
              <div><span>总支出</span><b class="expense">-${reportMoney(totalExpense)}</b></div>
            </div>
            <div class="report-chart-grid cols-2">
              <div class="report-panel">
                <div class="report-panel-title">支出构成</div>
                <div class="report-donut"><canvas id="pieChart"></canvas></div>
                <div class="report-legend" id="pieLegend"></div>
              </div>
              <div class="report-panel">
                <div class="report-panel-title">收入构成</div>
                <div class="report-donut"><canvas id="incomePieChart"></canvas></div>
                <div class="report-legend" id="incomePieLegend"></div>
              </div>
            </div>
            <div class="report-ai-line"><span class="report-ai-tag">AI 建议</span><span>${reportEsc(billAnalysisAdvice(totalIncome, totalExpense, expenseList))}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  setTimeout(() => {
    drawReportDonut({ canvasId: 'pieChart', legendId: 'pieLegend', data: expenseList, centerLabel: '总支出' });
    drawReportDonut({ canvasId: 'incomePieChart', legendId: 'incomePieLegend', data: incomeList, centerLabel: '总收入' });
  }, 60);
  scrollToBottom();
}

// 财务总览：消费统计 + 账单报告合并成一个页面，内分「资产概览」「账单明细」两个区域
function showFinancialOverview() {
  const u = mockData.userProfile;
  const now = new Date();
  const monthLabel = now.getFullYear() + '年' + (now.getMonth() + 1) + '月';
  const txns = u.recentTxns || [];

  // —— 账单明细：本月收支 ——
  const totalIncome = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netFlow = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (netFlow / totalIncome) * 100 : 0;

  const expenseMap = {};
  txns.filter(t => t.type === 'expense').forEach(t => {
    expenseMap[t.channel] = (expenseMap[t.channel] || 0) + t.amount;
  });
  const expenseList = Object.entries(expenseMap)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const topExpense = expenseList.slice(0, 4);

  // —— 资产概览 ——
  const cash = Number(u.debitCard && u.debitCard.balance) || 0;
  const frozen = Number(u.debitCard && u.debitCard.frozen) || 0;
  const holdingsTotal = (u.holdings || []).reduce((s, h) => s + (Number(h.amount) || 0), 0);
  const credit = u.creditCard || {};
  const creditLimit = Number(credit.effectiveLimit || credit.limit || 0);
  const creditUsed = Number(credit.used || 0);
  const creditAvail = creditLimit ? Math.max(0, creditLimit - creditUsed) : 0;
  const totalAssets = Math.max(0, cash - frozen) + holdingsTotal;

  const recentRows = txns.slice(0, 5).map(t => {
    const sign = t.type === 'income' ? '+' : '-';
    const cls = t.type === 'income' ? 'income' : 'expense';
    return '<div class="report-row"><span>' + reportEsc(t.channel || t.desc || '交易') + '　' + reportEsc(t.date || '') + '</span>' +
      '<b class="' + cls + '">' + sign + reportMoney(t.amount) + '</b></div>';
  }).join('');

  const topRows = topExpense.length ? topExpense.map(x => {
    const pct = totalExpense > 0 ? Math.round((x.value / totalExpense) * 100) : 0;
    return '<div class="report-row"><span>' + reportEsc(x.label) + '</span><b>' + reportMoney(x.value) + '　' + pct + '%</b></div>';
  }).join('') : '<div class="report-empty">本月暂无支出记录</div>';

  const advice = billAnalysisAdvice(totalIncome, totalExpense, expenseList);

  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <div class="report-page">
            <div class="report-head">
              <div>
                <div class="report-title">财务总览</div>
                <div class="report-sub">${monthLabel} · 资产概览与账单明细</div>
              </div>
            </div>

            <div class="report-panel" style="margin-top:12px;">
              <div class="report-panel-title">资产概览</div>
              <div class="report-summary">
                <div><span>总资产</span><b>${reportMoney(totalAssets)}</b></div>
                <div><span>储蓄卡可用</span><b>${reportMoney(Math.max(0, cash - frozen))}</b></div>
                <div><span>理财持仓</span><b>${reportMoney(holdingsTotal)}</b></div>
              </div>
              <div class="report-row"><span>冻结金额</span><b>${reportMoney(frozen)}</b></div>
              <div class="report-row"><span>信用卡可用额度</span><b>${creditLimit ? reportMoney(creditAvail) + ' / ' + reportMoney(creditLimit) : '暂无信用卡'}</b></div>
            </div>

            <div class="report-panel" style="margin-top:12px;">
              <div class="report-panel-title">账单明细</div>
              <div class="report-summary">
                <div><span>总收入</span><b class="income">+${reportMoney(totalIncome)}</b></div>
                <div><span>总支出</span><b class="expense">-${reportMoney(totalExpense)}</b></div>
                <div><span>结余</span><b class="${netFlow >= 0 ? 'income' : 'expense'}">${netFlow >= 0 ? '+' : '-'}${reportMoney(Math.abs(netFlow))}</b></div>
              </div>
              <div class="report-row"><span>储蓄率</span><b>${savingsRate.toFixed(1)}%</b></div>
              <div class="report-panel-title" style="margin-top:12px;">支出分类</div>
              ${topRows}
              <div class="report-panel-title" style="margin-top:12px;">最近交易</div>
              ${recentRows || '<div class="report-empty">暂无交易记录</div>'}
            </div>

            <div class="report-ai-line"><span class="report-ai-tag">AI 建议</span><span>${reportEsc(advice)}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}
// 通用环形图绘制：支出构成 / 收入构成共用（canvasId、legendId、data、centerLabel 可配）
function drawReportDonut(opts) {
  const o = opts || {};
  const canvas = document.getElementById(o.canvasId || 'pieChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rawData = Array.isArray(o.data) ? o.data : (window.billExpenseData || mockData.bills.expense);
  const data = rawData.map((d, i) => ({ ...d, color: d.color || reportColor(i) }));
  const total = data.reduce((s, d) => s + d.value, 0);
  // 环心金额：默认取各部分合计，也可由调用方显式指定（如「本月收入」口径）
  const centerVal = (o.centerValue != null) ? Number(o.centerValue) : total;
  const size = 180;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2, r = 68, innerR = 43;
  // 深色模式下环心与分隔线跟随卡片底色，避免白心/白缝
  const dark = document.body.classList.contains('dark-mode');
  const ink = dark ? '#E6EDF7' : '#16202E';
  const hole = dark ? '#172335' : '#FFFFFF';
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
      ctx.strokeStyle = hole;
      ctx.lineWidth = 2;
      ctx.stroke();
      startAngle += sliceAngle;
    });
  }
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = hole;
  ctx.fill();

  const compact = centerVal >= 10000 ? (centerVal / 10000).toFixed(1) + '万' : Math.round(centerVal).toLocaleString('zh-CN');
  ctx.fillStyle = ink;
  ctx.font = '600 13px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('¥' + compact, cx, cy + 2);
  ctx.fillStyle = '#8A97A8';
  ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(o.centerLabel || '总支出', cx, cy + 18);

  const legend = document.getElementById(o.legendId || 'pieLegend');
  if (legend) {
    legend.innerHTML = data.slice(0, 6).map(d => {
      const pct = total > 0 ? (d.value / total * 100).toFixed(1) : '0.0';
      const val = (o.legendFormat === 'money') ? reportMoney(d.value) : pct + '%';
      return '<div class="report-legend-item"><span class="report-dot" style="background:' + d.color + ';"></span><span>' +
        reportEsc(d.label) + '</span><b>' + val + '</b></div>';
    }).join('');
  }
}

// 兼容旧调用：只重绘支出构成
function drawPieChart() {
  drawReportDonut({ canvasId: 'pieChart', legendId: 'pieLegend', data: window.billExpenseData || mockData.bills.expense, centerLabel: '总支出' });
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
  const subscriptions = mockData.subscriptions;
  const monthlySubExpense = subscriptions.reduce((s, sub) => {
    const monthly = sub.cycle === '/月' ? sub.price : sub.cycle === '/季' ? sub.price / 3 : sub.price / 12;
    return s + monthly;
  }, 0);
  const now = new Date();
  const monthLabel = now.getFullYear() + '年' + (now.getMonth() + 1) + '月';

  // 收入分配：支出 / 结余；资产构成：储蓄卡可用 / 冻结 / 理财持仓
  const cash = Number(u.debitCard.balance) || 0;
  const frozen = Number(u.debitCard.frozen) || 0;
  const flowList = [
    { label: '支出', value: totalExpense },
    { label: '结余', value: Math.max(0, netFlow) }
  ].filter(x => x.value > 0);
  const assetList = [
    { label: '储蓄卡可用', value: Math.max(0, cash - frozen) },
    { label: '冻结金额', value: frozen },
    { label: '理财持仓', value: totalHoldings }
  ].filter(x => x.value > 0);
  const totalAssets = assetList.reduce((s, x) => s + x.value, 0);

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
            <div class="report-summary">
              <div><span>总收入</span><b class="income">+${reportMoney(totalIncome)}</b></div>
              <div><span>总支出</span><b class="expense">-${reportMoney(totalExpense)}</b></div>
              <div><span>订阅月均</span><b class="expense">-${reportMoney(monthlySubExpense)}</b></div>
            </div>
            <div class="report-chart-grid cols-2">
              <div class="report-panel">
                <div class="report-panel-title">收入分配</div>
                <div class="report-donut"><canvas id="flowChart"></canvas></div>
                <div class="report-legend" id="flowLegend"></div>
              </div>
              <div class="report-panel">
                <div class="report-panel-title">资产构成</div>
                <div class="report-donut"><canvas id="assetChart"></canvas></div>
                <div class="report-legend" id="assetLegend"></div>
              </div>
            </div>
            <div class="report-ai-line"><span class="report-ai-tag">AI 建议</span><span>${reportEsc(financeReportAdvice({ savingsRate: Number(savingsRate), netFlow: netFlow }))}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  setTimeout(() => {
    drawReportDonut({ canvasId: 'flowChart', legendId: 'flowLegend', data: flowList, centerLabel: '本月收入', centerValue: totalIncome });
    drawReportDonut({ canvasId: 'assetChart', legendId: 'assetLegend', data: assetList, centerLabel: '总资产', centerValue: totalAssets, legendFormat: 'money' });
  }, 60);
  scrollToBottom();
}

// 财务报告底部的一行 AI 建议：只保留「储蓄率判断 + 结余去向」，保证单行可读
function financeReportAdvice(d) {
  const rate = Number(d && d.savingsRate) || 0;
  const net = Number(d && d.netFlow) || 0;
  const head = rate >= 30 ? '储蓄率 ' + rate.toFixed(1) + '%，收支结构健康'
    : rate >= 10 ? '储蓄率 ' + rate.toFixed(1) + '%，仍有提升空间'
    : '储蓄率 ' + rate.toFixed(1) + '%，需优先压缩非必要支出';
  const body = net > 0
    ? '，结余 ' + reportInt(net) + ' 按 5:3:2 配置货币基金/稳健理财/应急金'
    : '，本月缺口 ' + reportInt(Math.abs(net)) + '，先补足应急金';
  return head + body + '。';
}
