// ========== 理财操作（中阶：风险测评+推荐+申赎） ==========
// 风险测评有效期：1 年（到期需重新测评才能推荐/购买）
var RISK_PROFILE_VALID_MS = 365 * 24 * 60 * 60 * 1000;

function riskProfileTimestamp(profile) {
  if (!profile) return 0;
  if (profile.assessedAtTs) return Number(profile.assessedAtTs) || 0;
  if (profile.assessedAt) {
    var t = Date.parse(String(profile.assessedAt).replace(/-/g, '/'));
    if (!isNaN(t)) return t;
  }
  return 0;
}

// 有效：有测评结果，且测评时间在 1 年内（老数据没时间戳时按有效处理，避免误判）
function riskProfileValid(profile) {
  if (!profile || !profile.level) return false;
  var ts = riskProfileTimestamp(profile);
  if (!ts) return true;
  return (Date.now() - ts) < RISK_PROFILE_VALID_MS;
}

function riskProfileExpired(profile) {
  return !!profile && !!profile.level && !riskProfileValid(profile);
}

function riskProfileExpireText(profile) {
  var ts = riskProfileTimestamp(profile);
  if (!ts) return '';
  var d = new Date(ts + RISK_PROFILE_VALID_MS);
  return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
}

function showProductList() {
  // 从本地持久化恢复上次测评结果（服务端快照不会覆盖它）
  if (!riskProfile && mockData.userProfile && mockData.userProfile.riskProfile) {
    riskProfile = mockData.userProfile.riskProfile;
  }
  let productsHtml = mockData.products.map(p => {
    const isRecommended = riskProfile && p.riskLevel <= riskProfile.level;
    return `
    <div class="product-item ${isRecommended ? 'recommended' : ''}">
      <div class="product-icon" style="background:#fef3c7;">${typeof bankIcon==='function'?bankIcon('wealth',18):''}</div>
      <div class="product-info">
        <div class="product-name">${p.name}${isRecommended ? '<span class="recommend-tag">为你推荐</span>' : ''}</div>
        <div class="product-desc">${p.desc} · 起购¥${p.minAmount}</div>
        <div class="product-actions">
          <button class="btn btn-primary btn-sm" onclick="buyProduct('${p.name}', ${p.minAmount})">申购</button>
        </div>
      </div>
      <div class="product-rate">
        <div class="rate-num">${p.rate}</div>
        <div class="rate-label">${p.rateLabel}</div>
      </div>
    </div>`;
  }).join('');
  const riskTip = riskProfile
    ? (riskProfileExpired(riskProfile)
      ? `<div class="data-card" style="background:#fffbeb;border-color:#fde68a;margin-bottom:12px;">
        <div class="data-card-title">风险测评已过期</div>
        <div style="font-size:12px;color:#666;margin-bottom:8px;">测评有效期 1 年，上一份测评已于 <b>${riskProfileExpireText(riskProfile)}</b> 到期；按监管要求需重新测评后才能申购。</div>
        <button class="btn btn-primary btn-sm" onclick="startRiskAssessment(true)">重新测评</button>
       </div>`
      : `<div class="data-card" style="background:#F5F8FD;border-color:#CFDFF3;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div class="data-card-title" style="margin-bottom:0;">你的风险等级：${riskProfile.name}（${riskProfile.level}级）</div>
          <button class="btn btn-secondary btn-sm" onclick="startRiskAssessment(true)">重新测评</button>
        </div>
        <div style="font-size:12px;color:#666;margin-top:6px;">${riskProfile.desc}</div>
        ${riskProfile.assessedAt ? `<div style="font-size:11px;color:#999;margin-top:5px;">上次测评：${riskProfile.assessedAt}${riskProfileExpireText(riskProfile) ? ' · 有效期至 ' + riskProfileExpireText(riskProfile) : ''}</div>` : ''}
       </div>`)
    : `<div class="data-card" style="background:#fffbeb;border-color:#fde68a;margin-bottom:12px;">
        <div class="data-card-title">尚未进行风险测评</div>
        <div style="font-size:12px;color:#666;margin-bottom:8px;">完成风险测评后，系统将为你智能推荐匹配的理财产品</div>
        <button class="btn btn-primary btn-sm" onclick="startRiskAssessment(true)">立即测评</button>
       </div>`;
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p>以下是当前在售的 <strong>${mockData.products.length} 款</strong>理财产品：</p>
          ${riskTip}
          <div class="product-list">${productsHtml}</div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}

// 点击申购按钮：弹出金额输入框
function buyProduct(name, minAmount) {
  const product = mockData.products.find(p => p.name === name);
  const popupId = 'buy-amount-popup-' + Date.now();
  const popup = document.createElement('div');
  popup.id = popupId;
  popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  popup.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;max-width:340px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
      
      <div style="font-size:16px;font-weight:600;text-align:center;margin-bottom:4px;">理财申购</div>
      <div style="font-size:12px;color:#999;text-align:center;margin-bottom:16px;">${name}</div>
      <div style="background:#f9fafb;border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#666;">风险等级</span><span style="font-weight:600;">${product?.riskLevel ? 'R' + product.riskLevel : 'R1'}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#666;">预期收益</span><span style="font-weight:600;color:#22c55e;">${product?.rate || product?.rateLabel || '2.75%'}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#666;">起购金额</span><span style="font-weight:600;">¥${minAmount || 0}</span></div>
      </div>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:13px;color:#666;margin-bottom:6px;font-weight:600;">申购金额（元）</label>
        <input type="number" id="buyAmountInput" value="${minAmount}" min="${minAmount}" step="100" style="width:100%;padding:12px;border:2px solid #e5e7eb;border-radius:10px;font-size:18px;font-weight:700;text-align:center;outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button style="flex:1;padding:6px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:6px;font-size:12px;cursor:pointer;" onclick="document.getElementById('buyAmountInput').value=${minAmount}">起购</button>
          <button style="flex:1;padding:6px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:6px;font-size:12px;cursor:pointer;" onclick="document.getElementById('buyAmountInput').value=${minAmount * 2}">双倍</button>
          <button style="flex:1;padding:6px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:6px;font-size:12px;cursor:pointer;" onclick="document.getElementById('buyAmountInput').value=${minAmount * 5}">5倍</button>
          <button style="flex:1;padding:6px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:6px;font-size:12px;cursor:pointer;" onclick="document.getElementById('buyAmountInput').value=${minAmount * 10}">10倍</button>
        </div>
      </div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;margin-bottom:16px;">
        <div style="font-size:11px;color:#92400e;">理财有风险，投资需谨慎。确认后将从可用余额扣款，T+1工作日确认份额。</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary" style="flex:1;" onclick="executeBuyProduct('${name}', parseFloat(document.getElementById('buyAmountInput').value) || ${minAmount});document.getElementById('${popupId}').remove();">确认申购</button>
        <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('${popupId}').remove();">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(popup);
}

// 执行实际的理财申购
// 与一键式对话共用 wealth.buy 工具：同一套余额门禁、扣款、持仓写入与后端同步。
async function executeBuyProduct(name, amount) {
  const product = mockData.products.find(p => p.name === name);
  if (!product) {
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ 未找到该理财产品。</div></div></div>');
    scrollToBottom();
    return;
  }
  const minAmount = product?.minAmount || 0;
  const buyAmount = Number(amount) || 0;
  if (!(buyAmount > 0) || buyAmount < minAmount) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ 申购金额不能低于起购金额 ¥${minAmount}</div></div></div>`);
    scrollToBottom();
    return;
  }

  // 风险测评是申购前置条件：未测评/已过期必须先测评；风险等级高于承受能力需二次确认
  const profile = (typeof riskProfile !== 'undefined' && riskProfile) || (mockData.userProfile && mockData.userProfile.riskProfile);
  const valid = profile && ((typeof riskProfileValid === 'function') ? riskProfileValid(profile) : !!profile.level);
  if (!valid) {
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">按监管要求，申购前需要完成风险测评。' +
      '<div class="guide-chips"><button class="guide-chip" onclick="startRiskAssessment(true)">立即测评</button></div></div></div>');
    scrollToBottom();
    return;
  }
  if (Number(product.riskLevel) > Number(profile.level)) {
    if (!confirm('该产品风险等级 R' + product.riskLevel + ' 高于你的风险承受能力 R' + profile.level + '。\n\n是否仍然申购？')) return;
  }
  if (typeof callAgentTool !== 'function') {
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">⚠️ 理财服务暂时不可用，请稍后再试。</div></div></div>');
    scrollToBottom();
    return;
  }
  // 与转账一致的金额风险验证：T2 密码确认，T3 二次验证，T4 提交人工复核
  if (typeof verifyAmountRisk === 'function') {
    const risk = await verifyAmountRisk(buyAmount, '理财申购', [{ tool: 'wealth.buy', args: { product: name, amount: buyAmount } }]);
    if (risk && risk.pendingReview) return;
    if (!risk || !risk.ok) {
      appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">已取消理财申购，账户未发生扣款。</div></div></div>');
      scrollToBottom();
      return;
    }
  }
  let res;
  try {
    res = await callAgentTool('wealth.buy', { product: name, amount: buyAmount });
  } catch (e) {
    res = { ok: false, summary: (e && e.message) || '申购失败' };
  }
  if (res.ok === false) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>申购未完成</strong><br>${escapeHtml(res.summary || '可用余额不足或产品状态异常')}<br><br>账户未发生扣款。</div></div></div>`);
    scrollToBottom();
    return;
  }
  const u = mockData.userProfile;
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
    <p><strong>申购已提交</strong></p>
    <div class="data-card">
      <div class="data-card-title">申购详情</div>
      <div class="data-row"><span class="data-label">产品名称</span><span class="data-value">${name}</span></div>
      <div class="data-row"><span class="data-label">申购金额</span><span class="data-value expense">¥ ${buyAmount.toFixed(2)}</span></div>
      <div class="data-row"><span class="data-label">扣款账户</span><span class="data-value">储蓄卡（可用余额已扣减）</span></div>
      <div class="data-row"><span class="data-label">当前可用余额</span><span class="data-value">¥ ${Number(u.debitCard.available).toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
      <div class="data-row"><span class="data-label">确认状态</span><span class="data-value" style="color:#f59e0b;">待确认（T+1工作日）</span></div>
    </div>
    <p style="margin-top:8px;font-size:12px;color:#999;">已自动加入持仓，可在「持仓管理」中查看收益。</p>
  </div></div></div>`);
  scrollToBottom();
}

// 智能购买解析：自动识别产品名称和金额，弹出确认框
function smartBuyParse(text) {
  const products = mockData.products || [];
  let matchedProduct = null;
  let amount = 0;

  // 匹配产品名称
  for (const p of products) {
    if (text.includes(p.name) || text.includes(p.name.replace(/\s/g, ''))) {
      matchedProduct = p;
      break;
    }
  }
  // 模糊匹配关键词
  if (!matchedProduct) {
    if (/安享|定期|三年|3年/.test(text)) matchedProduct = products.find(p => /安享/.test(p.name));
    else if (/稳健|债券|固收/.test(text)) matchedProduct = products.find(p => /稳健/.test(p.name));
    else if (/成长|股票|混合/.test(text)) matchedProduct = products.find(p => /成长/.test(p.name));
    else if (/货币|活期|现金/.test(text)) matchedProduct = products.find(p => /货币/.test(p.name));
    else if (/黄金|贵金属/.test(text)) matchedProduct = products.find(p => /黄金/.test(p.name));
  }

  // 匹配金额
  const amountMatch = text.match(/(\d+(\.\d+)?)\s*[元块]?/);
  if (amountMatch) amount = parseFloat(amountMatch[1]);

  // 中文数字转换
  if (amount === 0) {
    const cnNumMap = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '百': 100, '千': 1000, '万': 10000 };
    const cnMatch = text.match(/([一二两三四五六七八九十百千万]+)\s*[元块]?/);
    if (cnMatch) {
      let cn = cnMatch[1];
      if (cn.includes('万')) { amount = parseFloat(cn.replace('万', '')) * 10000; }
      else if (cn.includes('千')) { amount = parseFloat(cn.replace('千', '')) * 1000; }
      else if (cn.includes('百')) { amount = parseFloat(cn.replace('百', '')) * 100; }
    }
  }

  return { product: matchedProduct, amount };
}

function showSmartBuyConfirm(product, amount, text) {
  const buyAmount = amount >= (product.minAmount || 0) ? amount : (product.minAmount || 0);
  const confirmDiv = document.createElement('div');
  confirmDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  confirmDiv.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;max-width:340px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
      
      <div style="font-size:16px;font-weight:600;text-align:center;margin-bottom:4px;">确认理财申购</div>
      <div style="font-size:12px;color:#999;text-align:center;margin-bottom:16px;">识别自："${text}"</div>
      <div style="background:#f9fafb;border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#666;">产品名称</span><span style="font-weight:600;">${product.name}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#666;">风险等级</span><span style="font-weight:600;">${product.riskLevel ? 'R' + product.riskLevel : 'R1'}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#666;">预期收益</span><span style="font-weight:600;color:#22c55e;">${product.rate || product.rateLabel || '2.75%'}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#666;">起购金额</span><span style="font-weight:600;">¥${product.minAmount || 0}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid #e5e7eb;margin-top:4px;padding-top:8px;"><span style="color:#666;font-weight:600;">申购金额</span><span style="font-weight:700;color:#ef4444;font-size:16px;">¥${buyAmount.toFixed(2)}</span></div>
      </div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;margin-bottom:16px;">
        <div style="font-size:11px;color:#92400e;">理财有风险，投资需谨慎。确认后将从可用余额扣款，T+1工作日确认份额。</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary" style="flex:1;" onclick="executeBuyProduct('${product.name}', ${buyAmount});this.closest('div[style*=fixed]').remove();">确认申购</button>
        <button class="btn btn-secondary" style="flex:1;" onclick="this.closest('div[style*=fixed]').remove();">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmDiv);
}

function redeemProduct(name) {
  const u = mockData.userProfile;
  const holding = u.holdings?.find(h => h.name === name);
  if (!holding) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ 未找到该产品的持仓记录，无法赎回。</div></div></div>`);
    scrollToBottom();
    return;
  }
  const holdingAmount = holding.amount;
  const popupId = 'redeem-popup-' + Date.now();
  const popup = document.createElement('div');
  popup.id = popupId;
  popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  popup.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;max-width:340px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
      
      <div style="font-size:16px;font-weight:600;text-align:center;margin-bottom:4px;">理财赎回</div>
      <div style="font-size:12px;color:#999;text-align:center;margin-bottom:16px;">${name}</div>
      <div style="background:#f9fafb;border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#666;">持有金额</span><span style="font-weight:700;">¥${holdingAmount.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;"><span style="color:#666;">累计收益</span><span style="font-weight:600;color:${holding.profit >= 0 ? '#22c55e' : '#ef4444'};">${holding.profit >= 0 ? '+' : ''}¥${holding.profit.toFixed(2)}</span></div>
      </div>
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:13px;color:#666;margin-bottom:6px;font-weight:600;">赎回金额（元）</label>
        <input type="number" id="redeemAmountInput" value="${holdingAmount}" min="0.01" max="${holdingAmount}" step="0.01" style="width:100%;padding:12px;border:2px solid #e5e7eb;border-radius:10px;font-size:18px;font-weight:700;text-align:center;outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button style="flex:1;padding:6px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:6px;font-size:12px;cursor:pointer;" onclick="document.getElementById('redeemAmountInput').value=${holdingAmount}">全部赎回</button>
          <button style="flex:1;padding:6px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:6px;font-size:12px;cursor:pointer;" onclick="document.getElementById('redeemAmountInput').value=${(holdingAmount * 0.5).toFixed(2)}">赎回一半</button>
          <button style="flex:1;padding:6px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:6px;font-size:12px;cursor:pointer;" onclick="document.getElementById('redeemAmountInput').value=${(holdingAmount * 0.25).toFixed(2)}">赎回1/4</button>
        </div>
      </div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;margin-bottom:16px;">
        <div style="font-size:11px;color:#92400e;">赎回金额不能超过持有金额。赎回后资金预计T+1工作日到账。</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary" style="flex:1;" onclick="confirmRedeem('${name}', ${holdingAmount}, '${popupId}')">确认赎回</button>
        <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('${popupId}').remove();">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(popup);
}

// 确认赎回：与一键式对话共用 wealth.redeem 工具
async function confirmRedeem(name, holdingAmount, popupId) {
  const redeemAmount = parseFloat(document.getElementById('redeemAmountInput')?.value) || 0;
  if (redeemAmount <= 0) {
    alert('赎回金额必须大于0');
    return;
  }
  if (redeemAmount > holdingAmount) {
    alert('赎回金额不能超过持有金额 ¥' + holdingAmount.toFixed(2));
    return;
  }
  if (typeof callAgentTool !== 'function') {
    alert('赎回服务暂时不可用，请稍后再试');
    return;
  }
  document.getElementById(popupId)?.remove();
  let res;
  try {
    res = await callAgentTool('wealth.redeem', { product: name, amount: redeemAmount });
  } catch (e) {
    res = { ok: false, summary: (e && e.message) || '赎回失败' };
  }
  if (res.ok === false) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>赎回未完成</strong><br>${escapeHtml(res.summary || '请检查持仓状态')}<br><br>持仓与余额均未发生变化。</div></div></div>`);
    scrollToBottom();
    return;
  }
  const holding = mockData.userProfile.holdings?.find(h => h.name === name);
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
    <p><strong>赎回已完成</strong></p>
    <div class="data-card">
      <div class="data-card-title">赎回详情</div>
      <div class="data-row"><span class="data-label">产品名称</span><span class="data-value">${name}</span></div>
      <div class="data-row"><span class="data-label">赎回金额</span><span class="data-value income" style="font-weight:700;">¥ ${redeemAmount.toFixed(2)}</span></div>
      <div class="data-row"><span class="data-label">剩余持仓</span><span class="data-value">¥ ${Math.max(0, Number(holding?.amount) || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
      <div class="data-row"><span class="data-label">到账方式</span><span class="data-value">已回到可用余额（演示环境即时到账）</span></div>
      <div class="data-row"><span class="data-label">当前可用余额</span><span class="data-value">¥ ${Number(mockData.userProfile.debitCard.available).toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
    </div>
  </div></div></div>`);
  scrollToBottom();
}


// ========== 风险测评 ==========
const riskQuestions = [
  { q: '你的投资经验如何？', options: [{ text: '没有经验，刚开始接触', score: 1 }, { text: '有一些经验，买过货币基金', score: 2 }, { text: '经验丰富，投资过股票/基金', score: 3 }, { text: '非常专业，熟悉各类金融产品', score: 4 }] },
  { q: '你能承受的最大亏损比例是？', options: [{ text: '不能承受任何亏损', score: 1 }, { text: '5%以内', score: 2 }, { text: '5%-20%', score: 3 }, { text: '20%以上', score: 4 }] },
  { q: '你的投资期限通常是？', options: [{ text: '随时可能取出（1年内）', score: 1 }, { text: '1-3年', score: 2 }, { text: '3-5年', score: 3 }, { text: '5年以上', score: 4 }] },
  { q: '你的收入稳定性如何？', options: [{ text: '不稳定，经常波动', score: 1 }, { text: '基本稳定', score: 2 }, { text: '稳定且有增长', score: 3 }, { text: '非常稳定，高收入', score: 4 }] },
  { q: '面对投资亏损，你的反应是？', options: [{ text: '非常焦虑，立即赎回', score: 1 }, { text: '有些担心，会减少投资', score: 2 }, { text: '理性看待，继续持有', score: 3 }, { text: '视为机会，加仓买入', score: 4 }] },
];
let riskCurrentQ = 0;
let riskScores = [];

function startRiskAssessment(skipConfirm) {
  // 支持重新测评：已有结果时先提示，避免误覆盖（对话流程里 skipConfirm=true 直接开始）
  if (!riskProfile && mockData.userProfile && mockData.userProfile.riskProfile) {
    riskProfile = mockData.userProfile.riskProfile;
  }
  if (!skipConfirm && riskProfile && !confirm(`你当前的风险等级是「${riskProfile.name}（${riskProfile.level}级）」。\n\n重新测评会覆盖当前结果，是否继续？`)) return;
  riskCurrentQ = 0;
  riskScores = [];
  showRiskQuestion();
}

function showRiskQuestion() {
  const q = riskQuestions[riskCurrentQ];
  const optionsHtml = q.options.map((o, i) =>
    `<div class="risk-option" onclick="selectRiskOption(${i}, ${o.score})">${o.text}</div>`
  ).join('');
  const html = `
    <div class="message" id="riskQuestionMsg">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <div class="risk-question">
            <div style="font-size:12px;color:#999;margin-bottom:8px;">第 ${riskCurrentQ + 1}/${riskQuestions.length} 题</div>
            <div class="risk-question-title">${q.q}</div>
            <div class="risk-options">${optionsHtml}</div>
          </div>
        </div>
      </div>
    </div>
  `;
  if (riskCurrentQ === 0) appendMessage(html);
  else {
    const msg = document.getElementById('riskQuestionMsg');
    if (msg) msg.outerHTML = html;
  }
  scrollToBottom();
}

function selectRiskOption(index, score) {
  riskScores.push(score);
  riskCurrentQ++;
  if (riskCurrentQ < riskQuestions.length) {
    showRiskQuestion();
  } else {
    showRiskResult();
  }
}

function showRiskResult() {
  const total = riskScores.reduce((a, b) => a + b, 0);
  const avg = total / riskScores.length;
  let level, name, desc, color;
  if (avg <= 1.5) { level = 1; name = '保守型'; desc = '追求本金安全，适合低风险产品如货币基金、定期存款'; color = '#22c55e'; }
  else if (avg <= 2.5) { level = 2; name = '稳健型'; desc = '追求稳定收益，可承受小幅波动，适合中低风险理财产品'; color = '#84cc16'; }
  else if (avg <= 3.5) { level = 3; name = '平衡型'; desc = '追求收益与风险平衡，可承受中等波动，适合混合型基金'; color = '#f59e0b'; }
  else { level = 4; name = '进取型'; desc = '追求高收益，可承受较大波动，适合股票型、成长型基金'; color = '#ef4444'; }
  const assessedAt = new Date().toLocaleString('zh-CN');
  riskProfile = { level, name, desc, color, assessedAt, assessedAtTs: Date.now() };
  // 持久化测评结果，刷新页面后仍保留；重新测评会覆盖旧结果
  mockData.userProfile.riskProfile = riskProfile;
  saveUserData();
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <div class="risk-result">
            <div style="font-size:14px;color:#666;">风险测评完成</div>
            <div class="risk-level" style="color:${color};">${name}</div>
            <div style="font-size:13px;color:#999;margin-bottom:10px;">风险等级：${level}级 / 共4级</div>
            <div class="risk-desc">${desc}</div>
            <div style="font-size:11px;color:#aaa;margin-top:8px;">测评时间：${assessedAt}</div>
            <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" onclick="showProductList()">查看推荐产品</button>
              <button class="btn btn-secondary btn-sm" onclick="(typeof guideWealthShowAllProducts==='function')?guideWealthShowAllProducts():showProductList()">查询所有产品</button>
              <button class="btn btn-secondary btn-sm" onclick="startRiskAssessment()">重新测评</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();

  // 对话式申购：测评是从「理财申购」里发起的，测完接着原流程；
  // 如果用户一句话里已经带了产品+金额（如「买稳健增利90天 5000」），直接继续，不用重说。
  if (typeof GUIDE_WEALTH !== 'undefined' && GUIDE_WEALTH && GUIDE_WEALTH.stage === 'assessing') {
    GUIDE_WEALTH.stage = 'slots';
    var pendingProduct = GUIDE_WEALTH.product;
    var pendingAmount = GUIDE_WEALTH.amount;
    setTimeout(function () {
      if (pendingAmount && typeof guideWealthStep === 'function') {
        // 有金额没产品：保留金额，只追问产品
        if (!pendingProduct) GUIDE_WEALTH.product = null;
        guideWealthStep(String(pendingAmount));
      } else if (typeof guideWealthShowRecommendations === 'function') {
        guideWealthShowRecommendations(riskProfile);
      }
    }, 300);
  }
}


// ========== 高阶版：持仓管理与收益分析 ==========
function showHoldings() {
  const holdings = mockData.userProfile.holdings || [];
  const totalAmount = holdings.reduce((s, h) => s + h.amount, 0);
  const totalProfit = holdings.reduce((s, h) => s + h.profit, 0);
  const totalProfitRate = totalAmount > 0 ? (totalProfit / totalAmount * 100).toFixed(2) : '0.00';
  // 对话里只做「看」：概览压缩成三行，明细不带赎回/追加申购按钮
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p><strong>持仓管理</strong><span style="font-size:12px;color:#8A97A8;margin-left:6px;">共 ${holdings.length} 只</span></p>
          <div class="data-card">
            <div class="data-row"><span class="data-label">持仓总金额</span><span class="data-value" style="font-weight:700;">¥${totalAmount.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
            <div class="data-row"><span class="data-label">累计收益</span><span class="data-value ${totalProfit >= 0 ? 'income' : 'expense'}" style="font-weight:700;">${totalProfit >= 0 ? '+' : ''}¥${totalProfit.toLocaleString('zh-CN', {minimumFractionDigits: 2})}（${totalProfit >= 0 ? '+' : ''}${totalProfitRate}%）</span></div>
          </div>
          <p style="margin-top:12px;font-size:13px;font-weight:600;color:#333;">持仓明细</p>
          ${holdings.map(h => `
            <div class="holding-card">
              <div class="holding-header">
                <div class="holding-name">${h.name}</div>
                <span class="holding-status">${h.status}</span>
              </div>
              <div class="holding-stats">
                <div class="holding-stat">
                  <div class="holding-stat-label">持有金额</div>
                  <div class="holding-stat-value">¥${h.amount.toLocaleString()}</div>
                </div>
                <div class="holding-stat">
                  <div class="holding-stat-label">累计收益</div>
                  <div class="holding-stat-value ${h.profit >= 0 ? 'profit' : 'loss'}">${h.profit >= 0 ? '+' : ''}¥${h.profit.toFixed(2)}</div>
                </div>
                <div class="holding-stat">
                  <div class="holding-stat-label">收益率</div>
                  <div class="holding-stat-value ${h.profitRate >= 0 ? 'profit' : 'loss'}">${h.profitRate >= 0 ? '+' : ''}${h.profitRate}%</div>
                </div>
              </div>
              <div style="margin-top:8px;font-size:11px;color:#999;">买入日期：${h.buyDate}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}


// ========== 功能增强：基金定投 ==========
// 初始化定投计划
function initInvestmentPlans() {
  if (!mockData.investmentPlans) {
    // 用户从未创建过计划时，不能自动生成一个 active 计划并扣款；
    // 只放一条暂停状态的演示计划，用户主动启用后才会执行。
    if (window.__LOCAL_PLANS_LOADED) {
      mockData.investmentPlans = [];
    } else {
      mockData.investmentPlans = [
        { id: 1, productName: '稳健增长混合A', amount: 500, cycle: 'monthly', day: 15, status: 'paused', createdAt: '2026-08-15', totalInvested: 0, totalShares: 0, lastExecuted: null }
      ];
    }
  }
}

// 显示定投计划列表
function showInvestmentPlans() {
  initInvestmentPlans();
  const plans = mockData.investmentPlans;
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p><strong>基金定投计划</strong></p>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="font-size:13px;color:#666;">共 ${plans.length} 个定投计划</span>
            <button class="btn btn-primary btn-sm" onclick="showCreateInvestmentPlan()">新建定投</button>
          </div>
          ${plans.length === 0 ? '<div style="text-align:center;padding:30px;color:#999;font-size:13px;">暂无定投计划，点击上方"新建定投"开始</div>' : plans.map(p => `
            <div style="background:#f9fafb;border-radius:10px;padding:14px;margin-bottom:10px;border:1px solid #e5e7eb;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div style="font-weight:600;font-size:14px;">${p.productName}</div>
                <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${p.status === 'active' ? '#dcfce7;color:#16a34a' : '#fef3c7;color:#d97706'};">${p.status === 'active' ? '定投中' : '已暂停'}</span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px;color:#666;margin-bottom:10px;">
                <div><span style="color:#999;">每期金额</span><br><strong style="color:#1a1a1a;">¥${p.amount}</strong></div>
                <div><span style="color:#999;">定投周期</span><br><strong style="color:#1a1a1a;">${p.cycle === 'weekly' ? '每周' : '每月'}${p.day}号</strong></div>
                <div><span style="color:#999;">累计投入</span><br><strong style="color:#1a1a1a;">¥${p.totalInvested}</strong></div>
              </div>
              <div style="display:flex;gap:6px;">
                ${p.status === 'active' 
                  ? `<button class="btn btn-secondary btn-sm" onclick="toggleInvestmentPlan(${p.id})" style="flex:1;font-size:12px;">暂停</button>`
                  : `<button class="btn btn-primary btn-sm" onclick="toggleInvestmentPlan(${p.id})" style="flex:1;font-size:12px;">▶ 恢复</button>`
                }
                <button class="btn btn-secondary btn-sm" onclick="deleteInvestmentPlan(${p.id})" style="flex:1;font-size:12px;background:#fef2f2;color:#ef4444;">删除</button>
              </div>
            </div>
          `).join('')}
          <p style="margin-top:10px;font-size:12px;color:#999;">基金定投：定期定额投资，平摊成本，长期持有。系统将在每期扣款日自动执行。</p>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}

// 显示创建定投计划表单
function showCreateInvestmentPlan() {
  const products = mockData.products.filter(p => p.type === 'fund' || p.name.includes('混合') || p.name.includes('股票') || p.name.includes('指数'));
  const productOptions = products.length > 0 
    ? products.map(p => `<option value="${p.name}">${p.name}（${p.rate}）</option>`).join('')
    : mockData.products.map(p => `<option value="${p.name}">${p.name}（${p.rate}）</option>`).join('');
  
  const popupId = 'create-investment-' + Date.now();
  const popup = document.createElement('div');
  popup.id = popupId;
  popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;';
  popup.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;max-width:340px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
      
      <div style="font-size:16px;font-weight:600;text-align:center;margin-bottom:16px;">新建基金定投</div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;font-weight:600;">选择基金</label>
          <select id="investProduct" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
            ${productOptions}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;font-weight:600;">每期金额（元）</label>
          <input type="number" id="investAmount" value="500" min="100" step="100" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;font-weight:600;">定投周期</label>
          <select id="investCycle" onchange="updateInvestDayOptions()" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
            <option value="weekly">每周</option>
            <option value="monthly" selected>每月</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:13px;color:#666;margin-bottom:4px;font-weight:600;">扣款日</label>
          <select id="investDay" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box;">
            ${Array.from({length: 28}, (_, i) => `<option value="${i+1}" ${i+1 === 15 ? 'selected' : ''}>每月${i+1}日</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="btn btn-primary" style="flex:1;" onclick="confirmCreateInvestment('${popupId}')">确认创建</button>
        <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('${popupId}').remove();">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(popup);
}

// 更新扣款日选项
function updateInvestDayOptions() {
  const cycle = document.getElementById('investCycle').value;
  const daySelect = document.getElementById('investDay');
  if (cycle === 'weekly') {
    daySelect.innerHTML = ['周一','周二','周三','周四','周五'].map((d, i) => `<option value="${i+1}">${d}</option>`).join('');
  } else {
    daySelect.innerHTML = Array.from({length: 28}, (_, i) => `<option value="${i+1}" ${i+1 === 15 ? 'selected' : ''}>每月${i+1}日</option>`).join('');
  }
}

// 确认创建定投计划
async function confirmCreateInvestment(popupId) {
  const productName = document.getElementById('investProduct').value;
  const amount = parseFloat(document.getElementById('investAmount').value);
  const cycle = document.getElementById('investCycle').value;
  const day = parseInt(document.getElementById('investDay').value);
  
  if (!amount || amount < 100) { alert('定投金额最低100元'); return; }

  // 定投计划会持续扣款，创建时同样按金额分级验证；T4 只提交人工复核
  if (typeof verifyAmountRisk === 'function') {
    const risk = await verifyAmountRisk(amount, '基金定投');
    if (risk && risk.pendingReview) return;
    if (!risk || !risk.ok) {
      appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">已取消创建定投计划，账户未发生扣款。</div></div></div>');
      scrollToBottom();
      return;
    }
  }

  initInvestmentPlans();
  const newPlan = {
    id: Date.now(),
    productName,
    amount,
    cycle,
    day,
    status: 'active',
    createdAt: new Date().toISOString().split('T')[0],
    totalInvested: 0,
    totalShares: 0
  };
  mockData.investmentPlans.push(newPlan);
  saveUserData();
  document.getElementById(popupId)?.remove();
  
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">✅ <strong>定投计划创建成功</strong><br>基金：${productName}<br>每期：¥${amount}<br>周期：${cycle === 'weekly' ? '每周' : '每月'}${day}号<br><br>系统将在每期扣款日自动执行申购。</div></div></div>`);
  scrollToBottom();
}

// 暂停/恢复定投计划
function toggleInvestmentPlan(id) {
  initInvestmentPlans();
  const plan = mockData.investmentPlans.find(p => p.id === id);
  if (!plan) return;
  plan.status = plan.status === 'active' ? 'paused' : 'active';
  saveUserData();
  showInvestmentPlans();
}

// 删除定投计划
function deleteInvestmentPlan(id) {
  if (!confirm('确定要删除这个定投计划吗？')) return;
  initInvestmentPlans();
  mockData.investmentPlans = mockData.investmentPlans.filter(p => p.id !== id);
  saveUserData();
  showInvestmentPlans();
}

// 检查并执行到期的定投（每次打开页面时调用）
function executeDueInvestments() {
  initInvestmentPlans();
  const now = new Date();
  const today = now.getDate();
  const dayOfWeek = now.getDay();
  
  // 本地日期，避免 UTC+8 凌晨算成前一天
  const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

  mockData.investmentPlans.forEach(plan => {
    if (plan.status !== 'active') return;
    const shouldExecute = plan.cycle === 'monthly' ? plan.day === today : plan.day === dayOfWeek;
    if (shouldExecute && plan.lastExecuted !== todayStr) {
      // 统一用 addTransaction 扣款一次；原实现先手动扣 balance、再 addTransaction 扣一次，会重复扣款
      const okTx = addTransaction('expense', plan.amount, `基金定投-${plan.productName}`, '自动定投', true);
      if (okTx === false) return;
      plan.totalInvested += plan.amount;
      plan.totalShares += plan.amount * 0.98;
      plan.lastExecuted = todayStr;
      // 定投扣款必须生成/增加对应持仓，否则钱从账户消失但资产端没有份额
      const prod = (mockData.products || []).find(p => p.name === plan.productName);
      if (prod) {
        if (!mockData.userProfile.holdings) mockData.userProfile.holdings = [];
        let h = mockData.userProfile.holdings.find(x => x.name === prod.name);
        if (h) { h.amount += plan.amount; h.cost += plan.amount; }
        else {
          mockData.userProfile.holdings.push({
            name: prod.name, icon: prod.icon, amount: plan.amount, cost: plan.amount,
            profit: 0, profitRate: 0, buyDate: todayStr, status: '持有中', riskLevel: prod.riskLevel
          });
        }
      }
    }
  });
  saveUserData();
}

