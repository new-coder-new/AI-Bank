// ==========================================================================
//  经典脚本模块（TypeScript 源码，noCheck 转译）
//  编译产物：js/core/visualization.js
//  说明：本层为「全局函数 + 动态状态」结构，采用 noCheck 转译；
//        对外符号统一在 types/global.d.ts 声明。
// ==========================================================================

// ==========================================================================
//  AI Banking Agent · 数据可视化层（Visualization）
//  纯 Canvas 实现，零依赖。补齐队友版只有"基础饼图/柱图"的短板，
//  提供更专业、更有"分析感"的可视化：
//   ① 近三月收支趋势图（含环比标注）
//   ② 资产结构环形图（现金/理财/定期/基金/房产）
//   ③ 现金流瀑布图（收入 → 各类支出 → 结余）
//  数据优先取后端（window.__API_*），降级用前端 mockData。
// ==========================================================================

// ------------------------------ 工具 ------------------------------
function vizGetHistory() {
  // 优先后端近三月数据
  if (window.__API_MONTHLY_HISTORY && window.__API_MONTHLY_HISTORY.length) {
    return window.__API_MONTHLY_HISTORY;
  }
  // 降级：用当前账单造一份近似趋势
  var b = mockData.bills;
  var income = (b.income || []).reduce(function (s, x) { return s + x.value; }, 0);
  var expense = (b.expense || []).reduce(function (s, x) { return s + x.value; }, 0);
  var now = new Date();
  var out = [];
  for (var i = 2; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      month: d.getFullYear() + '年' + (d.getMonth() + 1) + '月',
      income: Math.round(income * (1 - i * 0.03)),
      expense: Math.round(expense * (1 - i * 0.02))
    });
  }
  return out;
}

function vizGetAssets() {
  var u = mockData.userProfile || {};
  var d = u.debitCard || {};
  var holdings = (u.holdings || []).reduce(function (s, h) { return s + (h.amount || 0) + (h.profit || 0); }, 0);
  return [
    { label: '现金/活期', value: Math.round(d.balance || 0), color: '#22c55e' },
    { label: '理财持仓', value: Math.round(holdings), color: '#0B4F9C' },
    { label: '定期存款', value: 100000, color: '#3b82f6' },
    { label: '基金', value: 45511, color: '#f59e0b' },
    { label: '房产', value: 600000, color: '#ef4444' }
  ];
}

function vizCanvas(id, w, h) {
  var c = document.getElementById(id);
  if (!c) return null;
  c.width = w; c.height = h;
  var ctx = c.getContext('2d');
  return ctx || null;
}

// ------------------------------ ① 近三月收支趋势图 ------------------------------
function vizTrendHtml() {
  return '<canvas id="vizTrend" width="320" height="180" style="width:100%;height:180px;border-radius:8px;"></canvas>';
}
function vizDrawTrend() {
  var ctx = vizCanvas('vizTrend', 320, 180);
  if (!ctx) return;
  var history = vizGetHistory();
  var w = 320, h = 180, padL = 44, padR = 12, padT = 18, padB = 28;
  var plotW = w - padL - padR, plotH = h - padT - padB;

  var max = 0;
  history.forEach(function (m) { max = Math.max(max, m.income, m.expense); });
  max = Math.ceil(max / 5000) * 5000;

  var x = function (i) { return padL + plotW * (history.length === 1 ? 0.5 : i / (history.length - 1)); };
  var y = function (v) { return padT + plotH * (1 - v / max); };

  // 网格 + Y 轴刻度
  ctx.strokeStyle = '#eef1f5'; ctx.fillStyle = '#9aa4b2'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
  for (var g = 0; g <= 4; g++) {
    var val = max * g / 4, gy = y(val);
    ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR, gy); ctx.stroke();
    ctx.fillText((val / 10000).toFixed(1) + '万', padL - 5, gy + 3);
  }

  // 折线：收入（绿）/支出（红）
  function line(vals, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    vals.forEach(function (v, i) { var px = x(i), py = y(v); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
    ctx.stroke();
    ctx.fillStyle = color;
    vals.forEach(function (v, i) { var px = x(i), py = y(v); ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill(); });
  }
  line(history.map(function (m) { return m.income; }), '#22c55e');
  line(history.map(function (m) { return m.expense; }), '#ef4444');

  // X 轴标签
  ctx.fillStyle = '#6b7280'; ctx.textAlign = 'center';
  history.forEach(function (m, i) {
    ctx.fillText(m.month.replace(/年/, '/').replace(/月/, ''), x(i), h - padB + 16);
  });

  // 图例
  ctx.textAlign = 'left'; var lx = padL, ly = 12;
  ctx.fillStyle = '#22c55e'; ctx.fillRect(lx, ly - 7, 12, 4); ctx.fillStyle = '#6b7280'; ctx.fillText('收入', lx + 16, ly - 2);
  ctx.fillStyle = '#ef4444'; ctx.fillRect(lx + 60, ly - 7, 12, 4); ctx.fillStyle = '#6b7280'; ctx.fillText('支出', lx + 76, ly - 2);
}

// ------------------------------ ② 资产结构环形图 ------------------------------
function vizAssetsHtml() {
  return '<canvas id="vizAssets" width="200" height="200" style="width:200px;height:200px;margin:0 auto;display:block;"></canvas>';
}
function vizDrawAssets() {
  var ctx = vizCanvas('vizAssets', 200, 200);
  if (!ctx) return;
  var data = vizGetAssets();
  var total = data.reduce(function (s, a) { return s + a.value; }, 0);
  if (total <= 0) return;
  var cx = 100, cy = 100, r = 70, inner = 44;
  var start = -Math.PI / 2;
  data.forEach(function (a) {
    var angle = (a.value / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath(); ctx.fillStyle = a.color; ctx.fill();
    start += angle;
  });
  // 中心挖空成环形
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  // 中心文字
  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('总资产', cx, cy - 4);
  ctx.fillStyle = '#6b7280'; ctx.font = '11px sans-serif';
  ctx.fillText('¥' + (total / 10000).toFixed(1) + '万', cx, cy + 16);
}

function vizAssetsLegendHtml() {
  var data = vizGetAssets();
  var total = data.reduce(function (s, a) { return s + a.value; }, 0);
  return '<div style="margin-top:10px;">' + data.map(function (a) {
    var pct = total > 0 ? (a.value / total * 100).toFixed(1) : '0';
    return '<div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;padding:3px 0;">' +
      '<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + a.color + ';margin-right:6px;"></span>' + a.label + '</span>' +
      '<span style="color:#6b7280;">' + pct + '%</span></div>';
  }).join('') + '</div>';
}

// ------------------------------ ③ 现金流瀑布图 ------------------------------
function vizWaterfallHtml() {
  return '<canvas id="vizWaterfall" width="320" height="200" style="width:100%;height:200px;border-radius:8px;"></canvas>';
}
function vizDrawWaterfall() {
  var ctx = vizCanvas('vizWaterfall', 320, 200);
  if (!ctx) return;
  var b = mockData.bills || {};
  var income = (b.income || []).reduce(function (s, x) { return s + x.value; }, 0);
  var expenses = (b.expense || []).slice().sort(function (a, b) { return b.value - a.value; });

  // 瀑布项：收入起点 → 各支出累减 → 结余
  var items = [{ label: '收入', value: income, color: '#22c55e' }];
  var running = income;
  expenses.forEach(function (e) { items.push({ label: e.label, value: -e.value, color: '#ef4444' }); running -= e.value; });
  items.push({ label: '结余', value: running, color: running >= 0 ? '#3b82f6' : '#ef4444' });

  var w = 320, h = 200, padL = 46, padR = 10, padT = 14, padB = 44;
  var plotW = w - padL - padR, plotH = h - padT - padB;
  var maxAbs = Math.max(income, Math.abs(Math.min(0, running)));
  expenses.forEach(function (e) { maxAbs = Math.max(maxAbs, e.value); });
  maxAbs = Math.ceil(maxAbs / 5000) * 5000;
  var zeroY = padT + plotH * (maxAbs / (maxAbs * 2)); // 零线：收入在上、支出在下
  var y = function (v) { return zeroY - (v / (maxAbs * 2)) * plotH; };

  var bw = plotW / items.length * 0.6;
  var cum = 0;
  items.forEach(function (it, i) {
    var cx = padL + plotW * (i + 0.5) / items.length;
    var top, bottom;
    if (it.value >= 0) { top = y(cum + it.value); bottom = y(cum); }
    else { top = y(cum); bottom = y(cum + it.value); }
    // 透明连接条（显示起点）
    if (i > 0) {
      ctx.fillStyle = '#eef1f5'; ctx.fillRect(cx - bw / 2, Math.min(y(cum), y(0)), bw, Math.abs(y(cum) - y(0)));
    }
    // 主体
    ctx.fillStyle = it.color;
    ctx.fillRect(cx - bw / 2, top, bw, Math.max(1, bottom - top));
    // 数值
    ctx.fillStyle = '#4b5563'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    var label = (it.value / 1000).toFixed(1) + 'k';
    ctx.fillText(label, cx, (it.value >= 0 ? top : bottom) + (it.value >= 0 ? -4 : 11));
    // X 轴标签（旋转简化：直接竖排短标签）
    ctx.fillStyle = '#6b7280';
    var lbl = it.label.length > 4 ? it.label.slice(0, 4) : it.label;
    ctx.fillText(lbl, cx, h - padB + 14);
    cum += it.value;
  });
}

// ------------------------------ 渲染入口 ------------------------------
// 渲染一张可视化卡片（供驾驶舱/账单分析/健康评分复用）
function renderVizCard(title, chartHtml, afterDraw) {
  var html = '<div class="agent-viz-card" style="margin:10px 0;">' +
    '<div class="agent-viz-title" style="font-size:13px;font-weight:700;color:#1a1a1a;margin-bottom:8px;">' + title + '</div>' +
    chartHtml +
    '</div>';
  return html;
}

// 一键渲染"财务全景可视化"（三图 + 图例）
function renderFinanceVisualization() {
  var html =
    renderVizCard('近三月收支趋势', vizTrendHtml(), vizDrawTrend) +
    renderVizCard('资产结构', '<div style="text-align:center;">' + vizAssetsHtml() + vizAssetsLegendHtml() + '</div>', vizDrawAssets) +
    renderVizCard('本月现金流瀑布', vizWaterfallHtml(), vizDrawWaterfall);

  appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 财务全景可视化</div>' +
    '<div class="msg-bubble agent-bubble">' + html + '</div></div></div>');
  scrollToBottom();
  // 延迟绘制，等 DOM 就绪
  setTimeout(function () { vizDrawTrend(); vizDrawAssets(); vizDrawWaterfall(); }, 60);
}

// 暴露给洞察/画像模块调用
window.vizDrawTrend = vizDrawTrend;
window.vizDrawAssets = vizDrawAssets;
window.vizDrawWaterfall = vizDrawWaterfall;
