// ========== 智能客服增强：多轮对话 + 复杂指令 ==========
// 对话上下文（存储最近10轮对话）
let conversationContext = [];
// 当前对话状态（用于多轮补全）
let currentDialogState = null;
// 最近执行的操作记录（用于指代理解）
let recentActions = [];

// 添加对话到上下文
function addToConversation(role, content, action) {
  conversationContext.push({
    role,
    content,
    action: action || null,
    timestamp: new Date().toISOString()
  });
  // 只保留最近20条
  if (conversationContext.length > 20) {
    conversationContext = conversationContext.slice(-20);
  }
}

// 添加最近操作记录
function addRecentAction(type, data) {
  recentActions.unshift({
    type,
    data,
    timestamp: new Date().toISOString()
  });
  if (recentActions.length > 10) {
    recentActions = recentActions.slice(0, 10);
  }
}

// 复杂指令拆解
function parseComplexCommand(text) {
  const commands = [];
  const lowerText = text.toLowerCase();
  
  // 检测多步骤连接词
  const connectors = ['然后', '接着', '之后', '再', '同时', '并且'];
  
  // 先按常见连接词拆分
  let parts = [text];
  
  // 检测"先...再..."模式
  const firstThenMatch = text.match(/先(.+?)(?:再|然后|接着)(.+)/);
  if (firstThenMatch) {
    parts = [firstThenMatch[1].trim(), firstThenMatch[2].trim()];
  }
  
  // 检测"转...给...，然后查..."模式
  const transferThenQuery = text.match(/(?:转|转账)(.+?)(?:给|到)(.+?)[，,。；;](.+)/);
  if (transferThenQuery && !firstThenMatch) {
    parts = [
      `转${transferThenQuery[1]}给${transferThenQuery[2]}`,
      transferThenQuery[3].trim()
    ];
  }
  
  // 检测多笔转账模式："给XX转A，给YY转B" 或 "给XX转A，给YY转B"
  // 按逗号/分号拆分，且每个部分都包含"转"和收款人
  if (parts.length === 1 && /[，,；;]/.test(text)) {
    const rawParts = text.split(/[，,；;]/).map(p => p.trim()).filter(p => p);
    // 检查是否每个部分都包含转账关键词
    const allTransfers = rawParts.every(p => /(转|打|汇|付|转账|汇款)/.test(p));
    if (allTransfers && rawParts.length >= 2) {
      parts = rawParts;
    }
  }
  
  // 对每个部分识别意图
  parts.forEach(part => {
    const intent = identifyIntent(part);
    if (intent) {
      commands.push({
        text: part.trim(),
        intent: intent.intent,
        slots: intent.slots,
        confidence: intent.confidence
      });
    }
  });
  
  return commands;
}

// 识别单条指令的意图
function identifyIntent(text) {
  const lowerText = text.toLowerCase();
  
  // 批量转账（优先于普通转账判断）
  // 支持：批量转账/多人转账/给XX和YY都转/给XX、YY各转/给XX和YY分别转/给XX、YY每人转
  if (/(批量转账|多人转账|批量汇款|一起转|分别转|给多人|和.*都转|和.*各转|、.*各转|、.*都转|每人转|分别转账|一起转账)/.test(text)) {
    return {
      intent: 'batch_transfer',
      slots: {},
      confidence: 0.95
    };
  }
  
  // 检测多个收款人模式：给XX和YY转/给XX、YY转（有两个及以上收款人）
  if (/给[^，。,.\s]+[和、][^，。,.\s]+(?:转|打|汇|付)/.test(text)) {
    return {
      intent: 'batch_transfer',
      slots: {},
      confidence: 0.85
    };
  }
  
  // 基金定投（优先于普通理财判断）
  if (/(定投|定期投资|自动申购|每月.*买|每周.*买|基金定投)/.test(text)) {
    return {
      intent: 'investment_plan',
      slots: {},
      confidence: 0.95
    };
  }
  
  // 账单分期（优先于普通信用卡判断）
  if (/(分期|账单分期|信用卡分期|还款分期|分.*期还)/.test(text)) {
    return {
      intent: 'installment',
      slots: {},
      confidence: 0.95
    };
  }
  
  // 转账意图
  // 护栏：联系人管理话术（新增/添加/删除联系人）绝不能识别为转账
  if (/(转|转账|汇款|打款|转钱)/.test(text) &&
      !/(新增|添加|删除|加一个|保存).*(联系人|收款人)|(联系人|收款人).*(新增|添加|删除)/.test(text)) {
    const amount = extractAmount(text);
    const payee = extractPayee(text);
    return {
      intent: 'transfer',
      slots: { amount, payee },
      confidence: amount && payee ? 0.9 : 0.7
    };
  }
  
  // 查询余额
  if (/(余额|多少钱|账户|存款|资产)/.test(text)) {
    return {
      intent: 'query_balance',
      slots: {},
      confidence: 0.95
    };
  }
  
  // 查询交易记录
  if (/(交易|记录|流水|账单|明细)/.test(text)) {
    return {
      intent: 'query_transactions',
      slots: {},
      confidence: 0.9
    };
  }
  
  // 理财相关
  if (/(理财|基金|产品|申购|购买|投资)/.test(text)) {
    const amount = extractAmount(text);
    const product = extractProduct(text);
    return {
      intent: 'wealth',
      slots: { amount, product },
      confidence: 0.85
    };
  }
  
  // 订阅相关
  if (/(订阅|会员|vip|开通|续费)/.test(text)) {
    return {
      intent: 'subscribe',
      slots: {},
      confidence: 0.85
    };
  }
  
  // 信用卡相关
  if (/(信用卡|额度|账单|还款)/.test(text)) {
    return {
      intent: 'credit_card',
      slots: {},
      confidence: 0.85
    };
  }
  
  // 预算相关
  if (/(预算|消费|支出|花费)/.test(text)) {
    return {
      intent: 'budget',
      slots: {},
      confidence: 0.8
    };
  }
  
  return null;
}

// 提取金额
function extractAmount(text) {
  // 匹配数字+元
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:元|块|块钱|rmb|¥)?/);
  if (match) return parseFloat(match[1]);
  
  // 匹配中文数字
  const cnNumbers = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '百': 100, '千': 1000, '万': 10000 };
  const cnMatch = text.match(/([一二两三四五六七八九十百千万]+)\s*(?:元|块)/);
  if (cnMatch) {
    // 简单的中文数字转换（只处理常见的）
    let num = 0;
    const cn = cnMatch[1];
    if (cn.includes('百')) {
      const parts = cn.split('百');
      num += (cnNumbers[parts[0]] || 1) * 100;
      if (parts[1] && parts[1] !== '') {
        if (parts[1].includes('十')) {
          const t = parts[1].split('十');
          num += (cnNumbers[t[0]] || 1) * 10;
          if (t[1]) num += cnNumbers[t[1]] || 0;
        } else {
          num += cnNumbers[parts[1]] || 0;
        }
      }
    } else if (cn.includes('十')) {
      const parts = cn.split('十');
      num += (cnNumbers[parts[0]] || 1) * 10;
      if (parts[1]) num += cnNumbers[parts[1]] || 0;
    } else {
      num = cnNumbers[cn] || 0;
    }
    return num;
  }
  
  return null;
}

// 提取收款人
function extractPayee(text) {
  const contacts = mockData.contacts || [];
  for (const c of contacts) {
    if (text.includes(c.name)) return c.name;
  }
  // 匹配"给XXX"或"转XXX"
  const match = text.match(/(?:给|转|到)([\u4e00-\u9fa5]{2,4})/);
  // 护栏："账联系人/转账"等系统词不是收款人
  if (match && !/(联系人|客服|系统|银行)$/.test(match[1])) return match[1];
  return null;
}

// 提取理财产品
function extractProduct(text) {
  const products = mockData.products || [];
  for (const p of products) {
    if (text.includes(p.name)) return p.name;
  }
  return null;
}

// 指代理解
function resolveReference(text) {
  const result = {
    isReference: false,
    referenceType: null,
    targetAction: null,
    correction: null
  };
  
  // 检测"刚才/刚刚/上一笔/那笔"等指代
  if (/(刚才|刚刚|上一笔|那笔|刚才那|刚刚那|之前那)/.test(text)) {
    result.isReference = true;
    result.referenceType = 'recent_action';
    
    // 找到最近的相关操作
    if (recentActions.length > 0) {
      result.targetAction = recentActions[0];
    }
  }
  
  // 检测"不是XX，是XX"修正模式
  const correctionMatch = text.match(/不是(.+?)(?:，|,)?是(.+)/);
  if (correctionMatch) {
    result.isReference = true;
    result.referenceType = 'correction';
    result.correction = {
      oldValue: correctionMatch[1].trim(),
      newValue: correctionMatch[2].trim()
    };
    
    // 找到最近的操作进行修正
    if (recentActions.length > 0) {
      result.targetAction = recentActions[0];
    }
  }
  
  // 检测"多少/多少钱/查一下/看看"对最近操作的查询
  if (/(多少|多少钱|查一下|看看|怎么样|成功了吗)/.test(text) && conversationContext.length > 0) {
    const lastUserMsg = [...conversationContext].reverse().find(m => m.role === 'user');
    if (lastUserMsg && /(转|转账|买|购|支付)/.test(lastUserMsg.content)) {
      result.isReference = true;
      result.referenceType = 'query_recent';
      if (recentActions.length > 0) {
        result.targetAction = recentActions[0];
      }
    }
  }
  
  return result;
}

// 执行复杂指令（多步骤）
async function executeComplexCommands(commands) {
  if (commands.length === 0) return;
  
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">🤖 <strong>检测到${commands.length}个连续指令，将依次执行：</strong><br>${commands.map((c, i) => `${i+1}. ${c.text}`).join('<br>')}<br><br>⏳ 正在执行第1个指令...</div></div></div>`);
  scrollToBottom();
  
  let cancelled = false;
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    
    // 执行指令，等待返回结果
    const result = await executeSingleCommand(cmd);

    // 资金操作会先出确认卡：必须等用户确认后再继续下一步，
    // 否则会出现"转账还没确认，后面的查询/申购已经执行"的错序。
    if (result && result.pending) {
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">⏸️ <strong>第${i+1}个指令需要你确认</strong><br>请先在上方确认卡完成操作；确认后我会继续执行剩余 ${commands.length - i - 1} 个步骤。</div></div></div>`);
      scrollToBottom();
      const ok = await waitForPendingPlan(result.planId);
      const planRec = (typeof AGENT_PENDING_PLANS !== 'undefined') ? AGENT_PENDING_PLANS[result.planId] : null;
      if (planRec && planRec.status === 'pending_review') {
        appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">⏳ 第${i+1}个指令已提交人工复核，未扣款；后续 ${commands.length - i - 1} 个步骤已暂停，待复核完成后再继续。</div></div></div>`);
        scrollToBottom();
        break;
      }
      if (!ok) {
        appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">⚠️ 第${i+1}个指令未确认，后续 ${commands.length - i - 1} 个步骤已停止执行。</div></div></div>`);
        scrollToBottom();
        break;
      }
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">✅ 第${i+1}个指令已确认执行，继续后续步骤。</div></div></div>`);
      scrollToBottom();
    }

    // 如果用户取消了，停止后续步骤
    if (result && result.cancelled) {
      cancelled = true;
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">⚠️ 第${i+1}个指令已取消，后续${commands.length - i}个指令已停止执行。</div></div></div>`);
      scrollToBottom();
      break;
    }
    
    // 如果不是最后一个，提示继续
    if (i < commands.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 800));
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">✅ 第${i+1}个指令执行完成，继续执行第${i+2}个：<strong>${commands[i+1].text}</strong></div></div></div>`);
      scrollToBottom();
    }
  }
  
  if (!cancelled) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">🎉 <strong>全部${commands.length}个指令执行完成！</strong><br><br>你可以继续对我说其他指令，或者问我刚才执行的结果。</div></div></div>`);
    scrollToBottom();
  }
}

// 统一的转账执行入口：引导式对话、旧规则层、复杂指令兜底都必须走这里。
// 它复用一键式对话的 Agent 风控链路，保证"补全信息后"和"一句话直接转"的执行完全一致。
async function runUnifiedTransfer(payee, amount, rawText, channel) {
  const amt = Number(amount) || 0;
  if (!payee || !(amt > 0)) {
    appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">⚠️ <strong>转账信息还不完整</strong><br>请补充收款人和大于 0 的转账金额。</div></div></div>');
    scrollToBottom();
    return { success: false, pending: false };
  }
  if (typeof agentTransferFlow === 'function') {
    return await agentTransferFlow(payee, amt, rawText || '', channel || '智能转账');
  }
  // 极端降级：Agent 层未就绪时，打开表单让用户确认，绝不直接扣款
  showTransferForm();
  return { success: false, pending: false, fallback: true };
}

// 等待 Agent 确认卡被用户处理：确认执行 → true，取消/拒绝/超时 → false
function waitForPendingPlan(planId, timeoutMs) {
  return new Promise(resolve => {
    if (!planId) { resolve(false); return; }
    const start = Date.now();
    const timer = setInterval(() => {
      const rec = (typeof AGENT_PENDING_PLANS !== 'undefined') ? AGENT_PENDING_PLANS[planId] : null;
      if (!rec) { clearInterval(timer); resolve(false); return; }
      if (rec.status === 'done') { clearInterval(timer); resolve(true); return; }
      if (rec.status === 'rejected' || rec.status === 'failed' || rec.status === 'pending_review') { clearInterval(timer); resolve(false); return; }
      if (Date.now() - start > (timeoutMs || 120000)) { clearInterval(timer); resolve(false); }
    }, 400);
  });
}

// 执行单条指令
async function executeSingleCommand(cmd) {
  return new Promise(resolve => {
    switch (cmd.intent) {
      case 'batch_transfer':
        // 智能解析批量转账指令，自动选中收款人并预填金额
        const batchResult = smartBatchTransferParse(cmd.text);
        if (batchResult.selectedIndexes.length > 0 || batchResult.amount > 0) {
          showBatchTransfer({ selectedIndexes: batchResult.selectedIndexes, amount: batchResult.amount });
          if (batchResult.selectedIndexes.length > 0 && batchResult.amount > 0) {
            const names = batchResult.selectedIndexes.map(i => mockData.contacts[i]?.name).join('、');
            appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">已为你智能识别批量转账：<br>• 收款人：<strong>${names}</strong><br>• 每人金额：<strong>¥${batchResult.amount.toLocaleString()}</strong><br><br>请在下方批量转账界面确认或修改，确认后执行。</div></div></div>`);
            scrollToBottom();
          }
        } else {
          showBatchTransfer();
        }
        addRecentAction('batch_transfer', {});
        break;
        
      case 'investment_plan':
        showInvestmentPlans();
        addRecentAction('investment_plan', {});
        break;
        
      case 'installment':
        showInstallmentCalculator();
        addRecentAction('installment', {});
        break;
        
      case 'transfer':
        // 护栏：新增/管理联系人的话术绝不能被当成转账（避免"账联系人"被误提取为收款人）
        if (/(新增|添加|加一个|保存).*(联系人|收款人)|(联系人|收款人).*(新增|添加|删除)/.test(cmd.text || '')) {
          if (typeof agentContactPrehandler === 'function' && agentContactPrehandler(cmd.text)) {
            break;
          }
        }
        if (cmd.slots.amount && cmd.slots.payee) {
          // 所有转账都走同一套 Agent 风控/确认链路：
          // 余额门禁 → 风险分级 → 确认卡 → T2 密码 / T3-T4 验证码 → 执行 → 后端同步
          runUnifiedTransfer(cmd.slots.payee, cmd.slots.amount, cmd.text, '智能转账')
            .then(res => resolve(res || { success: true }))
            .catch(() => resolve({ success: false }));
          return;
        }
        // 信息不全，打开转账表单
        showTransferForm();
        break;
        
      case 'query_balance':
        const d = mockData.userProfile.debitCard;
        appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">💰 <strong>账户余额查询</strong><br>储蓄卡余额：¥${d.balance.toLocaleString('zh-CN', {minimumFractionDigits: 2})}<br>可用余额：¥${d.available.toLocaleString('zh-CN', {minimumFractionDigits: 2})}<br>冻结金额：¥${d.frozen.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</div></div></div>`);
        addRecentAction('query_balance', { balance: d.balance });
        break;
        
      case 'query_transactions':
        showUserInfoFromTopbar();
        setTimeout(() => {
          const tabs = document.querySelectorAll('.userinfo-tab');
          tabs.forEach(t => t.classList.remove('active'));
          const txnsTab = Array.from(tabs).find(t => t.textContent.includes('交易记录'));
          if (txnsTab) {
            txnsTab.classList.add('active');
            currentUserInfoTab = 'txns';
            renderUserInfoPage();
          }
        }, 300);
        break;
        
      case 'wealth':
        // 区分购买理财和查看理财
        if (/购买|申购|买入|买.*元|买.*块|定投|理财.*买/.test(cmd.text)) {
          const result = smartBuyParse(cmd.text);
          if (result.product && result.amount > 0) {
            showSmartBuyConfirm(result.product, result.amount, cmd.text);
          } else if (result.product) {
            // 匹配到产品但没金额，打开申购页预填产品
            showProductList();
            appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">已为你匹配到 <strong>${result.product.name}</strong>，请在上方产品列表中点击"申购"并输入金额。</div></div></div>`);
            scrollToBottom();
          } else {
            showProductList();
          }
        } else {
          showProductList();
        }
        break;
        
      case 'subscribe':
        // 区分添加订阅和查看订阅
        if (/订阅|开通|续费|添加订阅|购买.*vip|购买.*VIP|开通会员/.test(cmd.text)) {
          // 解析平台和周期
          let platform = '';
          let period = '';
          if (/某易云|易云|音乐|网易云/.test(cmd.text)) platform = '某易云';
          else if (/某讯|讯|视频|腾讯/.test(cmd.text)) platform = '某讯';
          else if (/某度|度|网盘|百度/.test(cmd.text)) platform = '某度';
          
          if (/年卡|每年|年/.test(cmd.text)) period = '年卡';
          else if (/季卡|每季|季/.test(cmd.text)) period = '季卡';
          else if (/月卡|每月|月/.test(cmd.text)) period = '月卡';
          
          showAddSubscribeForm({ platform: platform, period: period });
        } else {
          showSubscribeList();
        }
        break;
        
      case 'credit_card':
        showCardLimit();
        break;
        
      case 'budget':
        // 区分设置预算和查看预算
        if (/设置|设定|改为|改成|调整|修改预算|设为|定个|定一个/.test(cmd.text)) {
          smartBudgetSet(cmd.text);
        } else {
          showBudget();
        }
        break;
        
      default:
        // 未知意图，交给AI处理
        callAIResponse(cmd.text);
        break;
    }
    
    saveUserData();
    scrollToBottom();
    setTimeout(resolve, 500);
  });
}

// 处理指代引用
async function handleReference(ref, text) {
  if (!ref.isReference || !ref.targetAction) return false;
  
  const action = ref.targetAction;
  
  switch (ref.referenceType) {
    case 'recent_action':
    case 'query_recent':
      // 查询最近操作的结果
      if (action.type === 'transfer') {
        appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">📋 <strong>刚才的转账详情：</strong><br>收款人：${action.data.payee}<br>金额：¥${action.data.amount.toLocaleString()}<br>状态：✅ 已成功<br>时间：${new Date(action.timestamp).toLocaleString('zh-CN')}</div></div></div>`);
      } else if (action.type === 'query_balance') {
        appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">💰 <strong>刚才查询的余额：</strong>¥${action.data.balance.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</div></div></div>`);
      } else {
        appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">📋 <strong>最近的操作：</strong><br>${action.type}<br>${JSON.stringify(action.data)}</div></div></div>`);
      }
      return true;
      
    case 'correction':
      // 修正最近操作
      if (action.type === 'transfer' && ref.correction) {
        const oldPayee = ref.correction.oldValue;
        const newPayee = ref.correction.newValue;
        
        // 检查新收款人是否存在
        const newContact = mockData.contacts.find(c => c.name === newPayee);
        if (!newContact) {
          appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ 未找到收款人"${newPayee}"，无法修正。请先在联系人中添加。</div></div></div>`);
          return true;
        }
        
        // 弹确认框，用户确认后才执行修正
        return new Promise(resolve => {
          const confirmId = 'correct-confirm-' + Date.now();
          const confirmPopup = document.createElement('div');
          confirmPopup.id = confirmId;
          confirmPopup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;';
          confirmPopup.innerHTML = `
            <div style="background:white;border-radius:16px;padding:24px;max-width:340px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
              <div style="text-align:center;margin-bottom:16px;">
                <div style="font-size:40px;margin-bottom:8px;">⚠️</div>
                <div style="font-size:16px;font-weight:700;color:#1a1a1a;">确认修正转账</div>
              </div>
              <div style="background:#f9fafb;border-radius:10px;padding:14px;margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;padding:6px 0;"><span style="color:#999;font-size:13px;">原收款人</span><span style="font-weight:600;font-size:14px;color:#ef4444;text-decoration:line-through;">${oldPayee}</span></div>
                <div style="display:flex;justify-content:space-between;padding:6px 0;"><span style="color:#999;font-size:13px;">新收款人</span><span style="font-weight:700;font-size:14px;color:#16a34a;">${newPayee}</span></div>
                <div style="display:flex;justify-content:space-between;padding:6px 0;"><span style="color:#999;font-size:13px;">转账金额</span><span style="font-weight:700;font-size:16px;color:#ef4444;">¥${action.data.amount.toLocaleString()}</span></div>
              </div>
              <div style="display:flex;gap:10px;">
                <button id="${confirmId}-cancel" style="flex:1;padding:12px;border:1px solid #e5e7eb;background:#fff;color:#666;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;">取消</button>
                <button id="${confirmId}-ok" style="flex:1;padding:12px;border:none;background:linear-gradient(135deg,#0B4F9C,#1F6FD0);color:white;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;">确认修正</button>
              </div>
            </div>
          `;
          document.body.appendChild(confirmPopup);
          
          document.getElementById(confirmId + '-ok').onclick = () => {
            document.getElementById(confirmId).remove();
            // 执行修正（撤销原转账记录，重新转账）
            const okTx = addTransaction('expense', action.data.amount, `转账给${newPayee}（修正自${oldPayee}）`, '智能转账', true);
            if (okTx === false) {
              appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>修正未完成</strong><br>可用余额不足，本次未扣款。</div></div></div>`);
              scrollToBottom();
              resolve(false);
              return;
            }
            if (typeof apiTransfer === 'function') apiTransfer(newPayee, action.data.amount);
            addRecentAction('transfer', { payee: newPayee, amount: action.data.amount });
            appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">✅ <strong>已修正收款人</strong><br>原收款人：${oldPayee}<br>新收款人：${newPayee}<br>金额：¥${action.data.amount.toLocaleString()}<br>当前余额：¥${mockData.userProfile.debitCard.balance.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</div></div></div>`);
            saveUserData();
            scrollToBottom();
            resolve(true);
          };
          document.getElementById(confirmId + '-cancel').onclick = () => {
            document.getElementById(confirmId).remove();
            appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ 已取消修正，收款人保持为${oldPayee}</div></div></div>`);
            scrollToBottom();
            resolve(true);
          };
        });
      }
      return false;
  }
  
  return false;
}

// 多轮对话状态管理
function updateDialogState(intent, slots) {
  if (!currentDialogState || currentDialogState.intent !== intent) {
    currentDialogState = {
      intent,
      slots: { ...slots },
      missingSlots: [],
      startTime: new Date().toISOString()
    };
  } else {
    // 合并槽位
    Object.keys(slots).forEach(key => {
      if (slots[key] !== null && slots[key] !== undefined) {
        currentDialogState.slots[key] = slots[key];
      }
    });
  }
  
  // 检查缺失的槽位
  currentDialogState.missingSlots = [];
  if (intent === 'transfer') {
    if (!currentDialogState.slots.payee) currentDialogState.missingSlots.push('payee');
    if (!currentDialogState.slots.amount) currentDialogState.missingSlots.push('amount');
  }
  
  return currentDialogState;
}

// 检查是否需要多轮补全
function checkAndAskMissingSlots() {
  if (!currentDialogState || currentDialogState.missingSlots.length === 0) {
    return false;
  }
  
  const missing = currentDialogState.missingSlots;
  const slots = currentDialogState.slots || {};
  let question = '';
  
  if (missing.includes('payee') && missing.includes('amount')) {
    question = '请问你要转账给谁？金额是多少？';
  } else if (missing.includes('payee')) {
    question = slots.amount ? `请问转 ¥${Number(slots.amount).toLocaleString()} 给谁？` : '请问你要转账给谁？';
  } else if (missing.includes('amount')) {
    question = slots.payee ? `请问转给${slots.payee}多少钱？` : '请问转账金额是多少？';
  }
  
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">🤔 ${question}<br><br>（你可以直接回复，我会记住之前的信息）</div></div></div>`);
  scrollToBottom();
  return true;
}

// 增强版消息处理（集成多轮对话、复杂指令、指代理解）
async function enhancedSendMessage(text) {
  // 添加到对话上下文
  addToConversation('user', text);

  // v7 记录本轮问题到对话上下文（供下轮的指代消解）
  var __ctxTurnQ = String(text || '');
  var __ctxInnerBefore = (document.getElementById('chatInner') || {}).textContent || '';
  function __ctxFinishTurn() {
    if (typeof agentCtxRecordTurn !== 'function') return;
    try {
      var innerNow = (document.getElementById('chatInner') || {}).textContent || '';
      var delta = innerNow.slice(__ctxInnerBefore.length).replace(/\s+/g, ' ').trim().slice(0, 180);
      var lastTopic = (typeof agentCtxLastTopic === 'function') ? agentCtxLastTopic() : null;
      agentCtxRecordTurn(__ctxTurnQ, delta, lastTopic ? lastTopic.type : null);
    } catch (e) { /* 记录失败不影响主流程 */ }
  }

  // 0-pre1 负债健康体检：只读分析，必须在 LLM 层之前接管，
  // 否则会被 Function Calling 层当成"通用咨询"输出无意义的执行过程卡。
  if (/(体检|风险|压力|健康|大不大|高不高|怎么样|分析|看看|情况)/.test(text) &&
      /(负债|月供|债务|偿债|房贷.*还|欠款)/.test(text) &&
      typeof renderAgentDebtHealth === 'function') {
    try {
      renderAgentDebtHealth();
      __ctxFinishTurn();
      addToConversation('assistant', '负债健康体检已处理', null);
      return;
    } catch (e) {
      console.warn('负债健康体检失败，降级:', e);
    }
  }

  // 0-pre 信用卡额度/调额/纯数学计算 前置确定性处理（C 组修复）
  // 必须在 Function Calling 层之前接管，避免「普通额度查询」「假设额度计算」
  // 被模型误判为「需要验证完整卡号」的敏感查询。
  if (typeof agentCardLimitPrehandler === 'function') {
    try {
      if (agentCardLimitPrehandler(text)) {
        __ctxFinishTurn();
        addToConversation('assistant', '信用卡额度层已处理', null);
        return;
      }
    } catch (e) {
      console.warn('信用卡额度前置层失败，降级:', e);
    }
  }

  // 0-pre2 冻结资金明细（A 组）与联系人管理（B 组）前置确定性处理
  if (typeof agentFrozenPrehandler === 'function') {
    try {
      if (agentFrozenPrehandler(text)) {
        __ctxFinishTurn();
        addToConversation('assistant', '冻结资金层已处理', null);
        return;
      }
    } catch (e) {
      console.warn('冻结资金前置层失败，降级:', e);
    }
  }
  if (typeof agentContactPrehandler === 'function') {
    try {
      if (agentContactPrehandler(text)) {
        __ctxFinishTurn();
        return;
      }
    } catch (e) {
      console.warn('联系人前置层失败，降级:', e);
    }
  }

  // 0. 资金安排咨询：确定性路由到本地场景推理层
  // 原因：这类问句里的金额是"待配置资金"而非"支出"，若先进 Function Calling 层，
  // 模型可能只调用 risk.detect 并得出"资金压力预警"，与用户真实意图（怎么配置）不符。
  // 本地场景推理层能稳定给出期限匹配的分层配置，因此优先接管。
  if (typeof agentIsScenarioQuery === 'function' && typeof agentScenarioAdvice === 'function' &&
      agentIsScenarioQuery(text)) {
    try {
      const scHandled = await agentScenarioAdvice(text);
      if (scHandled) {
        __ctxFinishTurn();
        addToConversation('assistant', '场景推理层已处理', null);
        return;
      }
    } catch (e) {
      console.warn('场景推理层失败，降级到后续流程:', e);
    }
  }

  // 0. Function Calling 智能层：由模型自己决定调用哪些工具（失败则静默降级）
  if (typeof agentLLMHandle === 'function') {
    try {
      const llmHandled = await agentLLMHandle(text);
      if (llmHandled) {
        __ctxFinishTurn();
        addToConversation('assistant', 'Function Calling 智能层已处理', null);
        return;
      }
    } catch (e) {
      console.warn('Function Calling 层失败，降级到规则智能层:', e);
    }
  }

  // 0.5 规则/场景智能层：目标型场景 / 正则工具组合 / 主动风险干预
  if (typeof agentHandle === 'function') {
    try {
      const handled = await agentHandle(text);
      if (handled) {
        __ctxFinishTurn();
        addToConversation('assistant', '智能层已处理', null);
        return;
      }
    } catch (e) {
      console.warn('智能层处理失败，降级到原有流程:', e);
    }
  }
  
  // 1. 先检查是否是指代引用（"刚才那笔"、"不是XX是XX"）
  const ref = resolveReference(text);
  if (ref.isReference && ref.targetAction) {
    const handled = await handleReference(ref, text);
    if (handled) {
      addToConversation('assistant', '处理指代引用', null);
      return;
    }
  }
  
  // 2. 检查是否是多轮补全（当前有未完成的对话状态）
  if (currentDialogState && currentDialogState.missingSlots.length > 0) {
    // 尝试从当前消息中提取缺失的信息
    const intent = identifyIntent(text);
    if (intent) {
      updateDialogState(currentDialogState.intent, intent.slots);
    } else {
      // 可能是直接回答缺失的信息
      if (currentDialogState.missingSlots.includes('amount')) {
        const amount = extractAmount(text);
        if (amount) {
          currentDialogState.slots.amount = amount;
          currentDialogState.missingSlots = currentDialogState.missingSlots.filter(s => s !== 'amount');
        }
      }
      if (currentDialogState.missingSlots.includes('payee')) {
        const payee = extractPayee(text);
        if (payee) {
          currentDialogState.slots.payee = payee;
          currentDialogState.missingSlots = currentDialogState.missingSlots.filter(s => s !== 'payee');
        }
      }
    }
    
    // 检查是否还有缺失
    if (!checkAndAskMissingSlots()) {
      const completed = currentDialogState;
      const slots = Object.assign({}, completed.slots);
      currentDialogState = null;
      // 引导式对话补全信息后，必须走与"一键式对话"完全相同的转账执行链路，
      // 不能再直接扣款或跳过确认/验证码。
      if (completed.intent === 'transfer') {
        const raw = `转账${slots.amount}元给${slots.payee}`;
        const res = await runUnifiedTransfer(slots.payee, slots.amount, raw, '智能转账');
        addToConversation('assistant', res && res.pending ? '已生成转账确认，等待你确认' : '已处理转账请求', null);
      }
    }
    return;
  }
  
  // 3. 转账类指令优先调用大模型识别类别（普通转账/批量转账/复杂多步）
  if (/(转|打|汇|付|转账|汇款|打款)/.test(text)) {
    try {
      const llmResult = await callLLMIntentClassification(text);
      if (llmResult && llmResult.intent && llmResult.intent !== '未知') {
        const { intent, slots } = llmResult;
        
        // 批量转账：自动选中收款人并预填金额
        if (intent === '批量转账' || intent === 'batch_transfer') {
          let selectedIndexes = [];
          let amount = slots?.amount || 0;
          
          // 从 payee_list 或 payee_name 中提取收款人
          const payeeList = slots?.payee_list || [];
          const payeeNameStr = slots?.payee_name || '';
          const allPayees = payeeList.length > 0 ? payeeList : payeeNameStr.split(/[,，、和]/).map(s => s.trim()).filter(s => s);
          
          // 匹配通讯录
          const contacts = mockData.contacts || [];
          allPayees.forEach(name => {
            const idx = contacts.findIndex(c => c.name === name || name.includes(c.name) || c.name.includes(name));
            if (idx > -1 && !selectedIndexes.includes(idx)) {
              selectedIndexes.push(idx);
            }
          });
          
          // 如果大模型没匹配到收款人，用本地正则再试一次
          if (selectedIndexes.length === 0) {
            const localResult = smartBatchTransferParse(text);
            selectedIndexes = localResult.selectedIndexes;
            if (!amount) amount = localResult.amount;
          }
          
          showBatchTransfer({ selectedIndexes, amount });
          if (selectedIndexes.length > 0 && amount > 0) {
            const names = selectedIndexes.map(i => contacts[i]?.name).join('、');
            appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">已为你智能识别批量转账：<br>• 收款人：<strong>${names}</strong><br>• 每人金额：<strong>¥${amount.toLocaleString()}</strong><br><br>请在下方批量转账界面确认或修改，确认后执行。</div></div></div>`);
            scrollToBottom();
          }
          addToConversation('assistant', `批量转账：${selectedIndexes.length}人，每人${amount}元`, null);
          return;
        }
        
        // 复杂多步指令：拆分步骤并按顺序执行
        if (intent === '复杂多步指令' || intent === 'complex' || (slots?.steps && slots.steps.length > 1)) {
          const steps = slots?.steps || [];
          if (steps.length > 1) {
            const commands = steps.map((step, i) => ({
              text: step.text || `步骤${i+1}`,
              intent: step.intent === '智能转账' ? 'transfer' : (step.intent || 'transfer'),
              slots: step.slots || {},
              confidence: 0.9
            }));
            await executeComplexCommands(commands);
            addToConversation('assistant', `执行${commands.length}个连续指令`, null);
            return;
          }
        }
        
        // 普通转账：用大模型返回的槽位执行
        if (intent === '智能转账' || intent === 'transfer') {
          // 强制兜底：如果文本中有多个收款人（和/、），强制改为批量转账
          const hasMultiplePayees = /给[^，。,.\s]+[和、][^，。,.\s]+(?:转|打|汇|付)/.test(text) || /和.*都转|和.*各转|、.*各转|、.*都转|每人转/.test(text);
          if (hasMultiplePayees) {
            console.log('检测到多收款人，强制改为批量转账');
            const batchResult = smartBatchTransferParse(text);
            showBatchTransfer(batchResult);
            if (batchResult.selectedIndexes.length > 0 && batchResult.amount > 0) {
              const contacts = mockData.contacts || [];
              const names = batchResult.selectedIndexes.map(i => contacts[i]?.name).join('、');
              appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">已为你智能识别批量转账：<br>• 收款人：<strong>${names}</strong><br>• 每人金额：<strong>¥${batchResult.amount.toLocaleString()}</strong><br><br>请在下方批量转账界面确认或修改，确认后执行。</div></div></div>`);
              scrollToBottom();
            }
            addToConversation('assistant', `批量转账：${batchResult.selectedIndexes.length}人，每人${batchResult.amount}元`, null);
            return;
          }
          
          const amount = slots?.amount || 0;
          const payee = slots?.payee_name || '';
          if (amount > 0 && payee) {
            await executeSingleCommand({
              text: text,
              intent: 'transfer',
              slots: { amount, payee: payee, payee_name: payee },
              confidence: 0.95
            });
            addToConversation('assistant', `转账${amount}元给${payee}`, null);
            return;
          }
        }
        
        // 大模型识别为其他非转账意图，走本地规则兜底
      }
    } catch (e) {
      console.warn('大模型意图分类失败，降级到本地规则:', e);
    }
  }
  
  // 4. 检查是否是复杂指令（多步骤）- 本地规则兜底
  const complexCommands = parseComplexCommand(text);
  if (complexCommands.length > 1) {
    await executeComplexCommands(complexCommands);
    addToConversation('assistant', `执行${complexCommands.length}个连续指令`, null);
    return;
  }
  
  // 5. 单条指令处理
  if (complexCommands.length === 1) {
    const cmd = complexCommands[0];
    
    // 检查是否需要多轮补全
    if (cmd.intent === 'transfer' && (!cmd.slots.amount || !cmd.slots.payee)) {
      updateDialogState('transfer', cmd.slots);
      checkAndAskMissingSlots();
      return;
    }
    
    await executeSingleCommand(cmd);
    addToConversation('assistant', `执行${cmd.intent}`, null);
    return;
  }
  
  // 6. 无法识别意图，交给AI处理
  callAIResponse(text);
}

// 调用AI回复（保留原有的AI对话功能）
async function callAIResponse(text) {
  try {
    // 构建包含上下文的prompt
    const contextMessages = conversationContext.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));
    
    const systemPrompt = `你是一个智能金融助手，支持转账、理财、订阅、信用卡管理、账单分析、预算管理等功能。用户可能会用自然语言提问，你需要理解意图并给出简洁有用的回答。如果用户问你能做什么，列出主要功能。`;
    
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...contextMessages,
          { role: 'user', content: text }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });
    
    const data = await response.json();
    const aiReply = data.choices[0].message.content;
    
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">${aiReply}</div></div></div>`);
    addToConversation('assistant', aiReply, null);
    scrollToBottom();
  } catch (error) {
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">抱歉，我遇到了一些问题，请稍后再试。<br><br>你可以试试这些指令：<br>• 给张三转账1000元<br>• 查询余额<br>• 先转500给张三，再查一下余额<br>• 刚才那笔转账成功了吗</div></div></div>`);
    scrollToBottom();
  }
}

// 显示欢迎语（改为渲染智能体简报：今日财务驾驶舱 + AI 发现 + 可执行事项）
function showWelcomeMessage() {
  const chatInner = document.getElementById('chatInner');
  if (!chatInner || chatInner.children.length > 0) return;

  if (typeof renderAgentBriefing === 'function') {
    renderAgentBriefing();
    return;
  }

  const hour = new Date().getHours();
  let greeting = '你好';
  if (hour < 6) greeting = '夜深了';
  else if (hour < 12) greeting = '早上好';
  else if (hour < 14) greeting = '中午好';
  else if (hour < 18) greeting = '下午好';
  else greeting = '晚上好';
  
  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">👋 <strong>${greeting}，小陈！</strong><br><br>我是你的智能金融助手，可以帮你完成：<br><br>💸 <strong>智能转账</strong> — 给张三转账1000元 / 批量转账<br>💰 <strong>理财操作</strong> — 购买安享三年定期500元 / 基金定投<br>💳 <strong>卡片管理</strong> — 查询额度 / 账单分期 / 挂失<br>🔔 <strong>订阅管理</strong> — 订阅某易云vip年卡<br>🎯 <strong>预算管理</strong> — 设置每月预算3000元<br>📊 <strong>财务报告</strong> — 生成本月财务报告<br><br>💡 你可以直接对我说，也可以点击右下角 <strong>+</strong> 查看全部功能。</div></div></div>`);
  scrollToBottom();
}
