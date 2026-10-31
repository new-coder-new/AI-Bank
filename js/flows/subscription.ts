// ==========================================================================
//  经典脚本模块（TypeScript 源码，noCheck 转译）
//  编译产物：js/flows/subscription.js
//  说明：本层为「全局函数 + 动态状态」结构，采用 noCheck 转译；
//        对外符号统一在 types/global.d.ts 声明。
// ==========================================================================

declare function escapeHtml(v: any): string;
declare function agentSleep(ms: number): Promise<void>;
declare function registerAgentTool(name: string, def: any): void;
declare function showSecurityVerification(purpose: string, cb: (ok: boolean) => void): void;
declare function showToast(msg: string, ms?: number): void;
declare function agentFmt(v: any, digits?: number): string;
declare function agentFmtInt(v: any, digits?: number): string;
declare function scrollToBottom(): void;
declare function appendMessage(html: string): void;
declare function saveUserData(): void;
declare var currentModule: string;
declare var mockData: any;
declare var AGENT_SESSION: any;
declare function submitManualReview(payload: any): void;
declare function guideCardApplyEsc(v: any): string;
declare function guideStartCardApply(): void;
declare function addTransaction(type: string, amount: number, desc: string, channel?: string, deduct?: boolean): boolean | void;
declare function verifyAmountRisk(amount: number, purpose: string, actions?: any[]): Promise<any>;
declare function callAgentTool(name: string, args?: any): any;
// ========== 订阅管理（中阶新增） ==========
function showSubscribeList() {
  const totalMonthly = mockData.subscriptions.reduce((s: any, sub: any) => {
    const monthly = sub.cycle === '/月' ? sub.price : sub.cycle === '/季' ? sub.price / 3 : sub.price / 12;
    return s + monthly;
  }, 0);
  const subsHtml = mockData.subscriptions.map((sub: any) => `
    <div class="subscribe-item" id="sub-${sub.id}">
      <div class="subscribe-icon" style="background:#fef3c7;">${typeof bankIcon==='function'?bankIcon('bell',16):''}</div>
      <div class="subscribe-info">
        <div class="subscribe-name">${sub.name} ${sub.autoRenew !== false ? '<span style="display:inline-block;background:#dcfce7;color:#16a34a;font-size:10px;padding:1px 6px;border-radius:4px;margin-left:6px;">自动续费</span>' : '<span style="display:inline-block;background:#f3f4f6;color:#9ca3af;font-size:10px;padding:1px 6px;border-radius:4px;margin-left:6px;">到期取消</span>'}</div>
        <div class="subscribe-detail">${sub.detail}</div>
      </div>
      <div class="subscribe-amount">
        <div class="subscribe-price">¥ ${sub.price}</div>
        <div class="subscribe-cycle">${sub.cycle}</div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="cancelSubscribe(${sub.id}, '${sub.name}')">取消</button>
    </div>
  `).join('');
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p>您共有 <strong>${mockData.subscriptions.length} 项</strong>自动续费订阅：</p>
          <div class="data-card" style="background:#fef2f2;border-color:#fecaca;margin-bottom:12px;">
            <div class="data-card-title">订阅支出概览</div>
            <div class="data-row"><span class="data-label">订阅数量</span><span class="data-value">${mockData.subscriptions.length} 项</span></div>
            <div class="data-row"><span class="data-label">月度均摊支出</span><span class="data-value expense">¥ ${totalMonthly.toFixed(2)}/月</span></div>
            <div class="data-row"><span class="data-label">年度预计支出</span><span class="data-value expense">¥ ${(totalMonthly * 12).toFixed(2)}/年</span></div>
          </div>
          <div id="subscribeList">${subsHtml}</div>
          <div style="margin-top:12px;text-align:center;">
            <button class="btn btn-primary btn-sm" onclick="showAddSubscribeForm()">添加新订阅</button>
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
}

async function cancelSubscribe(id: any, name: any) {
  // 与一键式对话保持一致：取消订阅属于账户变更，先确认再执行
  if (!confirm('确定取消「' + name + '」的自动续费吗？\n\n取消后当前周期结束将不再扣费。')) return;
  if (typeof callAgentTool !== 'function') {
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">⚠️ 订阅服务暂时不可用，请稍后再试。</div></div></div>');
    scrollToBottom();
    return;
  }
  let res;
  try {
    res = await callAgentTool('subscription.cancel', { id: id, name: name });
  } catch (e) {
    res = { ok: false, summary: (e && (e as any).message) || '取消失败' };
  }
  if (res.ok === false) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>取消订阅失败</strong><br>${escapeHtml(res.summary || '未找到该订阅')}</div></div></div>`);
    scrollToBottom();
    return;
  }
  const el = document.getElementById('sub-' + id);
  if (el) el.style.opacity = '0.5';
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
    <p><strong>已取消订阅</strong></p>
    <div class="data-card">
      <div class="data-card-title">取消详情</div>
      <div class="data-row"><span class="data-label">订阅名称</span><span class="data-value">${name}</span></div>
      <div class="data-row"><span class="data-label">取消时间</span><span class="data-value">${new Date().toLocaleString('zh-CN')}</span></div>
      <div class="data-row"><span class="data-label">生效时间</span><span class="data-value">当前周期结束后生效</span></div>
      <div class="data-row"><span class="data-label">预计节省</span><span class="data-value income">不再自动扣费</span></div>
    </div>
  </div></div></div>`);
  setTimeout(() => { if (el) el.remove(); }, 500);
  scrollToBottom();
}


// ========== 高阶版：添加新订阅 ==========
function showAddSubscribeForm(prefill: any) {
  const presetSubs = [
    { id: 'music', name: '某易云VIP', icon: '', prices: { '/月': 25, '/季': 60, '/年': 150 } },
    { id: 'video', name: '某讯VIP', icon: '', prices: { '/月': 30, '/季': 80, '/年': 200 } },
    { id: 'cloud', name: '某度网盘VIP', icon: '', prices: { '/月': 40, '/季': 120, '/年': 300 } },
  ];
  // 平台映射
  const platformMap = { '某易云': 'music', '易云': 'music', '音乐': 'music', '某讯': 'video', '讯': 'video', '视频': 'video', '某度': 'cloud', '度': 'cloud', '网盘': 'cloud' };
  // 周期映射
  const periodMap = { '月卡': '/月', '月': '/月', '每月': '/月', '季卡': '/季', '季': '/季', '每季': '/季', '年卡': '/年', '年': '/年', '每年': '/年' };

  let prefillPlatform = '';
  let prefillPeriod = '/月';
  if (prefill) {
    if (prefill.platform) {
      for (const [key, val] of Object.entries(platformMap)) {
        if (prefill.platform.includes(key)) {
          prefillPlatform = val;
          break;
        }
      }
    }
    if (prefill.period) {
      for (const [key, val] of Object.entries(periodMap)) {
        if (prefill.period.includes(key)) {
          prefillPeriod = val;
          break;
        }
      }
    }
  }

  const formId = 'sub-form-' + Date.now();
  const html = `
    <div class="message">
      <div class="msg-avatar ai">🤖</div>
      <div class="msg-content">
        <div class="msg-name">智能金融助手</div>
        <div class="msg-bubble">
          <p><strong>添加新订阅</strong>${prefillPlatform ? ' <span style="color:#0B4F9C;font-size:12px;">（已预填）</span>' : ''}</p>
          <div class="data-card" id="${formId}">
            <div class="form-group">
              <label class="form-label">选择订阅服务</label>
              <select class="form-select" id="newSubPreset" onchange="updateSubPrice(this)">
                <option value="">-- 请选择 --</option>
                ${presetSubs.map((s: any) => `<option value="${s.id}" ${prefillPlatform === s.id ? 'selected' : ''} data-icon="${s.icon}" data-name="${s.name}" data-month="${s.prices['/月']}" data-season="${s.prices['/季']}" data-year="${s.prices['/年']}">${s.icon} ${s.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">扣费周期</label>
              <select class="form-select" id="newSubCycle" onchange="updateSubPrice(this)">
                <option value="/月" ${prefillPeriod === '/月' ? 'selected' : ''}>按月扣费</option>
                <option value="/季" ${prefillPeriod === '/季' ? 'selected' : ''}>按季扣费</option>
                <option value="/年" ${prefillPeriod === '/年' ? 'selected' : ''}>按年扣费</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">订阅价格</label>
              <div id="subPriceDisplay" style="padding:8px 12px;background:#f5f7fa;border-radius:8px;font-size:14px;font-weight:600;color:#0B4F9C;">请先选择订阅服务</div>
            </div>
            <div class="form-group">
              <label class="form-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" id="newSubAutoRenew" checked style="width:16px;height:16px;accent-color:#0B4F9C;">
                <span>开启自动续费（到期自动扣费）</span>
              </label>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" onclick="confirmAddSubscribe(this)">确认添加</button>
              <button class="btn btn-secondary" onclick="appendMessage('<div class=\\'message\\'><div class=\\'msg-avatar ai\\'>🤖</div><div class=\\'msg-content\\'><div class=\\'msg-name\\'>智能金融助手</div><div class=\\'msg-bubble\\'>已取消添加。</div></div></div>');scrollToBottom();">取消</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  appendMessage(html);
  scrollToBottom();
  // 预填后自动更新价格显示
  if (prefillPlatform) {
    setTimeout(() => {
      const form = document.getElementById(formId);
      if (form) {
        const preset = form.querySelector('#newSubPreset');
        if (preset) updateSubPrice(preset);
      }
    }, 100);
  }
}

function updateSubPrice(el: any) {
  const form = el ? el.closest('.data-card') : document.querySelector('.data-card');
  if (!form) return;
  const preset = form.querySelector('#newSubPreset');
  const cycle = form.querySelector('#newSubCycle');
  const display = form.querySelector('#subPriceDisplay');
  if (!preset || !cycle || !display) return;
  if (!preset.value) {
    display.textContent = '请先选择订阅服务';
    display.style.color = '#999';
    return;
  }
  const option = preset.options[preset.selectedIndex];
  const priceKey = cycle.value === '/月' ? 'month' : cycle.value === '/季' ? 'season' : 'year';
  const price = option.getAttribute('data-' + priceKey);
  display.textContent = `¥ ${price}.00 ${cycle.value}`;
  display.style.color = '#0B4F9C';
}

async function confirmAddSubscribe(btn: any) {
  // 防重复提交：处理中禁用按钮，避免连续点击重复首扣
  if (btn && btn.dataset.busy === '1') return;
  if (btn) { btn.dataset.busy = '1'; btn.disabled = true; }
  const form = btn ? btn.closest('.data-card') : document.querySelector('.data-card');
  if (!form) { if (btn) { btn.dataset.busy = ''; btn.disabled = false; } return; }
  const preset = form.querySelector('#newSubPreset');
  const cycle = form.querySelector('#newSubCycle')?.value || '/月';
  const autoRenew = form.querySelector('#newSubAutoRenew')?.checked !== false;
  if (!preset || !preset.value) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble" style="color:#ef4444;">⚠️ 请选择订阅服务。</div></div></div>`);
    scrollToBottom();
    return;
  }
  const option = preset.options[preset.selectedIndex];
  const name = option.getAttribute('data-name');
  const icon = option.getAttribute('data-icon');
  const priceKey = cycle === '/月' ? 'month' : cycle === '/季' ? 'season' : 'year';
  const price = parseFloat(option.getAttribute('data-' + priceKey)) || 0;
  if (price <= 0) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble" style="color:#ef4444;">⚠️ 订阅价格无效，请重新选择。</div></div></div>`);
    scrollToBottom();
    return;
  }
  // 同名订阅（忽略空格）视为已存在，避免重复扣首月
  const nameKey = String(name || '').replace(/\s+/g, '').toLowerCase();
  const dup = mockData.subscriptions.some((s: any) => String(s.name || '').replace(/\s+/g, '').toLowerCase() === nameKey);
  if (dup) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">「${name}」已在订阅列表中，无需重复添加。</div></div></div>`);
    scrollToBottom();
    if (btn) { btn.dataset.busy = ''; btn.disabled = false; }
    return;
  }
  const newId = Math.max(0, ...mockData.subscriptions.map((s: any) => s.id)) + 1;
  const nextDate = new Date();
  if (cycle === '/月') nextDate.setMonth(nextDate.getMonth() + 1);
  else if (cycle === '/季') nextDate.setMonth(nextDate.getMonth() + 3);
  else nextDate.setFullYear(nextDate.getFullYear() + 1);
  const nextDateStr = nextDate.getFullYear() + '-' + String(nextDate.getMonth() + 1).padStart(2, '0') + '-' + String(nextDate.getDate()).padStart(2, '0');
  const chargeInDays = Math.max(1, Math.ceil((nextDate.getTime() - Date.now()) / 86400000));
  const cycleText = cycle === '/月' ? '包月' : cycle === '/季' ? '包季' : '包年';
  // 与转账一致的金额风险验证：T2 密码确认，T3 二次验证，T4 提交人工复核
  if (typeof verifyAmountRisk === 'function') {
    const risk = await verifyAmountRisk(price, '订阅首次扣费');
    if (risk && risk.pendingReview) return;
    if (!risk || !risk.ok) {
      appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">已取消订阅，账户未发生扣款。</div></div></div>');
      scrollToBottom();
      return;
    }
  }
  // 统一扣款门禁：先扣费成功再写入订阅，避免余额不足时仍然订阅成功
  const okTx = addTransaction('expense', price, `订阅扣费-${name}(${cycleText})`, '订阅扣费', true);
  if (okTx === false) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>订阅未开通</strong><br>可用余额不足，首次扣费失败，未写入订阅列表。</div></div></div>`);
    scrollToBottom();
    return;
  }
  mockData.subscriptions.push({
    id: newId,
    icon: icon,
    name: name,
    detail: `连续${cycleText} · ${autoRenew ? '自动续费' : '到期取消'} · 下次扣款${nextDateStr}`,
    price: price,
    cycle: cycle,
    cycleLabel: '连续' + cycleText,
    autoRenew: autoRenew,
    chargeInDays: chargeInDays,
    chargeDate: nextDateStr,
    usage: '中'
  });
  const u = mockData.userProfile;
  saveUserData();
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
    <p><strong>订阅添加成功，已完成首次扣费</strong></p>
    <div class="data-card">
      <div class="data-row"><span class="data-label">订阅名称</span><span class="data-value">${icon} ${name}</span></div>
      <div class="data-row"><span class="data-label">订阅价格</span><span class="data-value expense">¥ ${price.toFixed(2)}${cycle}</span></div>
      <div class="data-row"><span class="data-label">自动续费</span><span class="data-value" style="color:${autoRenew ? '#22c55e' : '#999'};font-weight:600;">${autoRenew ? '已开启' : '已关闭'}</span></div>
      <div class="data-row"><span class="data-label">本次扣费</span><span class="data-value expense" style="font-weight:700;">-¥ ${price.toFixed(2)}</span></div>
      <div class="data-row"><span class="data-label">扣费后余额</span><span class="data-value" style="font-weight:700;">¥ ${u.debitCard.balance.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
      <div class="data-row"><span class="data-label">下次扣款</span><span class="data-value">${nextDateStr}</span></div>
      <div class="data-row"><span class="data-label">当前订阅总数</span><span class="data-value" style="font-weight:700;">${mockData.subscriptions.length} 项</span></div>
    </div>
  </div></div></div>`);
  scrollToBottom();
}

