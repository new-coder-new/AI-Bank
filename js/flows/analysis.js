// ==========================================================================
//  经典脚本模块（TypeScript 源码，noCheck 转译）
//  编译产物：js/flows/analysis.js
//  说明：本层为「全局函数 + 动态状态」结构，采用 noCheck 转译；
//        对外符号统一在 types/global.d.ts 声明。
// ==========================================================================
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
// 账单分析：消费统计 + 账单报告合并，内容以可视化为主（环形图 / 占比条 / 近 7 日趋势）
function showBillOverview() {
    const u = mockData.userProfile;
    const now = new Date();
    const monthLabel = now.getFullYear() + '年' + (now.getMonth() + 1) + '月';
    const txns = u.recentTxns || [];
    // —— 收支 ——
    const totalIncome = txns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const netFlow = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? (netFlow / totalIncome) * 100 : 0;
    // —— 支出分类 ——
    const expenseMap = {};
    txns.filter((t) => t.type === 'expense').forEach((t) => {
        expenseMap[t.channel] = (expenseMap[t.channel] || 0) + t.amount;
    });
    const expenseList = Object.entries(expenseMap)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);
    window.billExpenseData = expenseList;
    // —— 近 7 日支出趋势 ——
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const value = txns.filter((t) => t.type === 'expense' && String(t.date || '').slice(0, 10) === key)
            .reduce((s, t) => s + t.amount, 0);
        days.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), value: value });
    }
    // 近 7 日没有支出时，退化为「最近 7 笔支出」，避免图表全空
    let trendTitle = '近 7 日支出趋势';
    let trendData = days;
    const sum7 = days.reduce((s, d) => s + d.value, 0);
    if (sum7 <= 0) {
        const recentExpense = txns.filter((t) => t.type === 'expense').slice(0, 7).reverse();
        if (recentExpense.length) {
            trendTitle = '最近 7 笔支出';
            trendData = recentExpense.map((t, i) => {
                const d = String(t.date || '').slice(5, 10).replace('-', '/');
                return { label: d || ('第' + (i + 1) + '笔'), value: Number(t.amount) || 0 };
            });
        }
    }
    window.billTrendData = trendData;
    // —— 资产（两列，移动端不挤） ——
    const cash = Number(u.debitCard && u.debitCard.balance) || 0;
    const frozen = Number(u.debitCard && u.debitCard.frozen) || 0;
    const holdingsTotal = (u.holdings || []).reduce((s, h) => s + (Number(h.amount) || 0), 0);
    const totalAssets = Math.max(0, cash - frozen) + holdingsTotal;
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
                <div class="report-title">账单分析</div>
                <div class="report-sub">${monthLabel} · 收支结构 / 支出构成 / 近 7 日趋势</div>
              </div>
            </div>

            <div class="report-summary cols-2">
              <div><span>总收入</span><b class="income">+${reportMoney(totalIncome)}</b></div>
              <div><span>总支出</span><b class="expense">-${reportMoney(totalExpense)}</b></div>
            </div>

            <div class="report-panel" style="margin-top:8px;">
              <div class="report-panel-title">支出构成</div>
              <div class="bill-donut-wrap">
                <div class="report-donut"><canvas id="billPieChart"></canvas></div>
                <div class="report-legend bill-legend-right" id="billPieLegend"></div>
              </div>
            </div>

            <div class="report-panel" style="margin-top:8px;">
              <div class="report-panel-title">${trendTitle}</div>
              <div class="bill-trend"><canvas id="billTrendChart"></canvas></div>
            </div>

            <div class="report-panel" style="margin-top:12px;">
              <div class="report-panel-title">资产概览</div>
              <div class="report-summary cols-2">
                <div><span>总资产</span><b>${reportMoney(totalAssets)}</b></div>
                <div><span>理财持仓</span><b>${reportMoney(holdingsTotal)}</b></div>
              </div>
              <div class="report-row"><span>冻结金额</span><b>${reportMoney(frozen)}</b></div>
            </div>

            <div class="report-ai-line"><span class="report-ai-tag">AI 建议</span><span>${reportEsc(advice)}</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
    appendMessage(html);
    setTimeout(() => {
        drawReportDonut({ canvasId: 'billPieChart', legendId: 'billPieLegend', data: expenseList, centerLabel: '总支出', size: 200 });
        drawBillTrendChart({ canvasId: 'billTrendChart', data: trendData });
    }, 60);
    scrollToBottom();
}
// 兼容旧入口名
// 最近支出曲线：平滑折线 + 渐变填充 + 数据点（canvas 自适应宽度）
function drawBillTrendChart(opts) {
    var o = opts || {};
    var canvas = document.getElementById(o.canvasId);
    if (!canvas || !canvas.parentElement)
        return;
    var data = (o.data || []).filter(function (d) { return isFinite(Number(d.value)); });
    if (!data.length)
        return;
    var boxW = canvas.parentElement.getBoundingClientRect().width || 320;
    var w = Math.max(220, Math.round(boxW));
    var h = Math.round(o.height || 150);
    var dpr = window.devicePixelRatio || 1;
    const __cv1 = canvas;
    __cv1.width = w * dpr;
    __cv1.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    if (!ctx)
        return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var padL = 10, padR = 10, padT = 20, padB = 24;
    var innerW = w - padL - padR;
    var innerH = h - padT - padB;
    var max = Math.max.apply(null, data.map(function (d) { return Number(d.value) || 0; }).concat([1]));
    var pts = data.map(function (d, i) {
        var v = Number(d.value) || 0;
        return {
            x: data.length === 1 ? padL + innerW / 2 : padL + (innerW * i) / (data.length - 1),
            y: padT + innerH - (v / max) * innerH,
            v: v,
            label: d.label || ''
        };
    });
    // 网格线
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 2; g++) {
        var gy = padT + (innerH * g) / 2;
        ctx.beginPath();
        ctx.moveTo(padL, gy);
        ctx.lineTo(w - padR, gy);
        ctx.stroke();
    }
    // 平滑曲线（三次贝塞尔控制点取相邻中点的 x）
    function tracePath() {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 0; i < pts.length - 1; i++) {
            var p0 = pts[i], p1 = pts[i + 1];
            var mx = (p0.x + p1.x) / 2;
            ctx.bezierCurveTo(mx, p0.y, mx, p1.y, p1.x, p1.y);
        }
    }
    // 渐变填充
    var grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, 'rgba(11,79,156,0.20)');
    grad.addColorStop(1, 'rgba(11,79,156,0.01)');
    tracePath();
    ctx.lineTo(pts[pts.length - 1].x, h - padB);
    ctx.lineTo(pts[0].x, h - padB);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // 曲线
    tracePath();
    ctx.strokeStyle = '#0B4F9C';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    // 数据点 + 数值 + 横轴标签
    var font = '10px system-ui, -apple-system, "PingFang SC", sans-serif';
    pts.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = '#0B4F9C';
        ctx.lineWidth = 2;
        ctx.stroke();
        var nearLeft = p.x < padL + 16;
        var nearRight = p.x > w - padR - 16;
        var align = nearLeft ? 'left' : (nearRight ? 'right' : 'center');
        var tx = nearLeft ? padL : (nearRight ? w - padR : p.x);
        if (p.v > 0) {
            ctx.fillStyle = '#0F172A';
            ctx.font = '600 ' + font;
            ctx.textAlign = align;
            ctx.fillText(String(Math.round(p.v)), tx, Math.max(11, p.y - 8));
        }
        ctx.fillStyle = '#94A3B8';
        ctx.font = font;
        ctx.textAlign = align;
        ctx.fillText(p.label, tx, h - 7);
    });
}
// 通用环形图绘制：支出构成 / 收入构成共用（canvasId、legendId、data、centerLabel 可配）
function drawReportDonut(opts) {
    const o = opts || {};
    const canvas = document.getElementById(o.canvasId || 'pieChart');
    if (!canvas)
        return;
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return;
    if (!ctx)
        return;
    const rawData = Array.isArray(o.data) ? o.data : (window.billExpenseData || mockData.bills.expense);
    const data = rawData.map((d, i) => ({ ...d, color: d.color || reportColor(i) }));
    const total = data.reduce((s, d) => s + d.value, 0);
    // 环心金额：默认取各部分合计，也可由调用方显式指定（如「本月收入」口径）
    const centerVal = (o.centerValue != null) ? Number(o.centerValue) : total;
    const size = Number(o.size) || 180;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const __cv2 = canvas;
    __cv2.width = Math.round(size * dpr);
    __cv2.height = Math.round(size * dpr);
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
    }
    else {
        let startAngle = -Math.PI / 2;
        data.forEach((d) => {
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
        legend.innerHTML = data.slice(0, 6).map((d) => {
            const pct = total > 0 ? (d.value / total * 100).toFixed(1) : '0.0';
            const val = (o.legendFormat === 'money') ? reportMoney(d.value) : pct + '%';
            return '<div class="report-legend-item"><span class="report-dot" style="background:' + d.color + ';"></span><span>' +
                reportEsc(d.label) + '</span><b>' + val + '</b></div>';
        }).join('');
    }
}
// ========== 异常交易识别与预警 ==========
function detectAbnormalTxns() {
    const txns = mockData.userProfile.recentTxns;
    const abnormal = [];
    txns.forEach((t) => {
        if (t.abnormal) {
            abnormal.push(t);
        }
        else {
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
// 主菜单里的异常交易提示：只给条数与结论，详情点按钮再看
function showAbnormalAlert() {
    const abnormal = detectAbnormalTxns();
    const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <div class="data-card">
            <div class="data-card-title">异常交易明细</div>
            ${abnormal.map((t) => `
              <div class="data-row abnormal-row">
                <span class="data-label" style="flex:1;">
                  <div style="font-size:12px;color:#333;font-weight:500;">${t.desc}<span class="abnormal-tag">${t.abnormalReason}</span></div>
                  <div style="font-size:10px;color:#999;margin-top:2px;">${t.time} · ${t.channel}</div>
                </span>
                <span class="data-value expense" style="font-weight:700;">-¥${t.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
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
// 财务报告底部的一行 AI 建议：只保留「储蓄率判断 + 结余去向」，保证单行可读
