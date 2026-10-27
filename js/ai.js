// ========== 大模型意图分类与模块路由 ==========
// 调用大模型自动识别用户意图，分类到对应模块
async function callLLMIntentClassification(text) {
  const intentDefinitions = `
支持的意图（15种）：
1. 智能转账 - 用户要求转账、汇款、打款、付款给单个收款人
2. 批量转账 - 用户要求给多个收款人转账，包括"给XX和YY都转"、"给XX、YY各转"、"给XX和YY分别转"、"批量转账"、"多人转账"
3. 复杂多步指令 - 用户要求执行多个连续操作，包括"先...再..."、"转...给...，然后查..."、多笔不同金额的转账（如"给XX转A，给YY转B"）
4. 理财购买 - 用户要求购买、申购、买入理财产品或基金
5. 预算设置 - 用户要求设置、设定预算（日/周/月/年预算）
6. 订阅购买 - 用户要求订阅、开通、购买VIP会员或续费
7. 查询余额 - 用户询问账户余额、有多少钱、还剩多少
8. 查询信用卡 - 用户询问信用卡额度、账单、可用额度
9. 卡片挂失 - 用户要求挂失卡片、卡片丢了、冻结卡片
10. 重置数据 - 用户要求重置数据、恢复默认、清空数据
11. 财务报告 - 用户要求生成财务报告、月度报告、综合报告
12. 本月消费 - 用户询问本月消费、这个月花了多少、月度消费统计
13. 你能做什么 - 用户询问功能、你能做什么、你能干啥、你有什么用
14. 用户信息 - 用户要求查看用户信息、我的账户、个人信息
15. 未知 - 无法归类到以上任何意图

模块映射：
- 智能转账 → transfer
- 批量转账 → batch_transfer
- 复杂多步指令 → complex
- 理财购买 → wealth
- 预算设置 → budget
- 订阅购买 → subscribe
- 查询余额 → userinfo
- 查询信用卡 → card
- 卡片挂失 → card
- 重置数据 → userinfo
- 财务报告 → report
- 本月消费 → bill
- 用户信息 → userinfo
- 你能做什么 → chat（直接在对话中回答）
- 未知 → chat（走AI对话）

槽位抽取要求：
- amount: 金额（数字）
- date: 日期（今天/明天/后天/每周/每月等）
- payee_name: 收款人姓名（批量转账时用逗号分隔多个收款人）
- payee_list: 批量转账的收款人列表（数组）
- phone: 手机号
- product_name: 理财产品名称
- period: 周期（月卡/季卡/年卡 或 day/week/month/year）
- platform: 订阅平台（某易云/某讯/某度）
- steps: 复杂多步指令的步骤列表（数组，每个元素包含intent和text）

请严格输出JSON格式，不要输出多余解释：
{"intent": "意图名称", "module": "模块名", "slots": {"amount": null, "date": null, "payee_name": null, "payee_list": [], "phone": null, "product_name": null, "period": null, "platform": null, "steps": []}, "confidence": 0.0, "reply": "给用户的简短回复"}
`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: 'system', content: '你是一个银行智能体的意图分类引擎。根据用户输入，识别意图并分类到对应模块。只输出JSON，不要输出多余解释，不要输出推理过程。' + intentDefinitions },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
        max_tokens: 2000,
        stream: false
      })
    });
    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      let content = data.choices[0].message.content || '';
      // 尝试从内容中提取JSON部分（去除可能的前后文本）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
      try {
        const result = JSON.parse(content);
        console.log('大模型意图分类结果:', result);
        return result;
      } catch (parseErr) {
        console.warn('大模型输出JSON解析失败，原始内容:', content);
        // 降级：用简单规则判断
        return null;
      }
    }
    console.warn('大模型返回格式异常:', data);
    return null;
  } catch (err) {
    console.error('大模型意图分类失败:', err);
    return null;
  }
}

// 根据大模型分类结果执行模块跳转
function executeLLMIntentRoute(result, originalText) {
  if (!result || !result.intent) return false;

  const { intent, module, slots, reply } = result;

  // 你能做什么：直接在对话中输出功能列表
  if (intent === '你能做什么') {
    const featureList = `
      <p style="margin-bottom:10px;font-weight:600;"> 我是您的智能金融助手，支持以下功能：</p>
      <div class="data-card">
        <div class="data-row"><span class="data-label"> 智能转账</span><span class="data-value">姓名/手机号/银行卡/AA；定时转账需验证码后创建</span></div>
        <div class="data-row"><span class="data-label"> 理财操作</span><span class="data-value">风险测评、智能推荐、申购赎回、我的持仓</span></div>
        <div class="data-row"><span class="data-label"> 卡片管理</span><span class="data-value">额度查询、智能调额、挂失解挂</span></div>
        <div class="data-row"><span class="data-label"> 订阅管理</span><span class="data-value">订阅列表、添加订阅、一键取消、自动续费</span></div>
        <div class="data-row"><span class="data-label"> 预算管理</span><span class="data-value">多周期预算（日/周/月/年）、总预算、超支预警</span></div>
        <div class="data-row"><span class="data-label"> 财务报告</span><span class="data-value">月度综合报告、收支分析、资产状况、AI建议</span></div>
        <div class="data-row"><span class="data-label">️ 异常交易</span><span class="data-value">大额/凌晨/可疑交易智能识别与预警</span></div>
        <div class="data-row"><span class="data-label"> 生日鲜花</span><span class="data-value">联系人生日提醒、一键订购鲜花、自动支付</span></div>
        <div class="data-row"><span class="data-label">️ 安全中心</span><span class="data-value">密码/指纹/短信验证、登录设备管理</span></div>
        <div class="data-row"><span class="data-label"> 用户信息</span><span class="data-value">账户总览、基本信息、卡片贷款、交易记录查询</span></div>
      </div>
      <p style="margin-top:10px;font-size:12px;color:#999;"> 您可以直接输入指令，例如："给张三转账1000元"、"查余额"、"设置每月预算5000"、"购买安享三年定期500元"等。</p>
    `;
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">${featureList}</div></div></div>`);
    scrollToBottom();
    return true;
  }

  // 未知意图：返回false，走普通AI对话
  if (intent === '未知' || !module) {
    return false;
  }

  // 高风险操作：转账、理财购买、挂失、重置 - 需要确认
  if (['智能转账', '理财购买', '卡片挂失', '重置数据'].includes(intent)) {
    // 转账：调用智能解析并弹确认框
    if (intent === '智能转账' && slots && slots.amount) {
      showSmartVoiceTransferConfirmFromSlots(slots);
      return true;
    }
    // 理财购买：匹配产品并弹确认框
    if (intent === '理财购买' && slots && slots.product_name && slots.amount) {
      // 根据产品名称查找产品对象
      let productObj = mockData.products.find(p => p.name === slots.product_name || p.name.includes(slots.product_name) || slots.product_name.includes(p.name));
      if (!productObj) {
        // 模糊匹配
        if (/安享|定期|三年|3年/.test(slots.product_name)) productObj = mockData.products.find(p => p.name.includes('安享'));
        else if (/稳健|债券|固收/.test(slots.product_name)) productObj = mockData.products.find(p => p.name.includes('稳健'));
        else if (/成长|股票|混合/.test(slots.product_name)) productObj = mockData.products.find(p => p.name.includes('成长'));
        else if (/货币|天天盈|灵活/.test(slots.product_name)) productObj = mockData.products.find(p => p.name.includes('天天盈'));
      }
      if (productObj) {
        showSmartBuyConfirm(productObj, slots.amount, originalText);
      } else {
        // 找不到产品，打开理财模块
        const navEl = document.querySelector(`.nav-item[onclick*="wealth"]`);
        if (navEl) switchModule('wealth', navEl);
      }
      return true;
    }
    // 挂失、重置：弹确认框
    if (intent === '卡片挂失' || intent === '重置数据') {
      const title = intent === '卡片挂失' ? '卡片挂失' : '重置数据';
      const msg = intent === '卡片挂失'
        ? '️ 卡片挂失是高风险操作，挂失后卡片将无法使用。请确认是否继续？'
        : '️ 重置数据将清除所有用户数据，恢复为默认演示数据。此操作不可撤销，请确认是否继续？';
      showCriticalConfirm(title, msg, () => {
        if (intent === '卡片挂失') {
          const u = mockData.userProfile;
          if (!u.creditCard.isFrozen) {
            u.creditCard.isFrozen = true;
            u.creditCard.status = '已挂失';
            saveUserData();
          }
          appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble"><p>✅ <strong>信用卡已挂失</strong></p><div class="data-card"><div class="data-row"><span class="data-label">挂失时间</span><span class="data-value">${new Date().toLocaleString('zh-CN')}</span></div><div class="data-row"><span class="data-label">卡片状态</span><span class="data-value" style="color:#ef4444;font-weight:600;">已挂失</span></div></div></div></div></div>`);
        } else {
          resetUserData();
          appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">✅ <strong>数据已重置</strong><br>所有用户数据已恢复为默认演示数据。</div></div></div>`);
        }
        scrollToBottom();
      });
      return true;
    }
  }

  // 预算设置：直接执行
  if (intent === '预算设置' && slots && slots.amount && slots.period) {
    smartBudgetSetFromPrefill(slots.amount, slots.period);
    return true;
  }

  // 订阅购买：打开模块并预填
  if (intent === '订阅购买') {
    const navEl = document.querySelector(`.nav-item[onclick*="subscribe"]`);
    if (navEl) switchModule('subscribe', navEl);
    setTimeout(() => showAddSubscribeForm(slots), 500);
    if (reply) {
      setTimeout(() => {
        appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">${reply}</div></div></div>`);
        scrollToBottom();
      }, 300);
    }
    return true;
  }

  // 其他查询类：直接打开对应模块
  const moduleNavMap = {
    'userinfo': null, // 特殊处理
    'card': 'card',
    'bill': 'bill',
    'report': 'report',
    'transfer': 'transfer',
    'wealth': 'wealth',
    'budget': 'budget'
  };

  if (module === 'userinfo') {
    showUserInfoFromTopbar();
  } else if (moduleNavMap[module]) {
    const navEl = document.querySelector(`.nav-item[onclick*="${moduleNavMap[module]}"]`);
    if (navEl) switchModule(moduleNavMap[module], navEl);
  }

  if (reply) {
    setTimeout(() => {
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">${reply}</div></div></div>`);
      scrollToBottom();
    }, 300);
  }

  return true;
}


// ========== AI 对话 ==========
async function sendMessage() {
  // 如果在用户信息页面，自动回到聊天界面
  const userInfoPage = document.getElementById('userInfoPage');
  if (userInfoPage && userInfoPage.classList.contains('show')) {
    closeUserInfoPage();
  }
  const input = document.getElementById('userInput');
  const text = input.value.trim();
  if (!text || isLoading) return;
  
  appendMessage(`<div class="message user"><div class="msg-avatar user">陈</div><div class="msg-content"><div class="msg-name">小陈</div><div class="msg-bubble">${escapeHtml(text)}</div></div></div>`);
  input.value = '';
  input.style.height = 'auto';
  scrollToBottom();

  // 检测"你能做什么"类问题，调用AI API输出功能列表
  if (/你能做什么|你能干啥|你有什么用|你会什么|你有什么功能|功能介绍|介绍一下|能帮我做什么|可以做什么|有哪些功能|你是谁/.test(text)) {
    const loadingId = 'loading-' + Date.now();
    appendMessage(`<div class="message" id="${loadingId}"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div></div></div>`);
    scrollToBottom();
    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [
            { role: 'system', content: `你是一个专业的智能金融助手。用户在询问你的功能，请用简洁清晰的方式列出你支持的所有功能。

要求：
1. 用中文回答
2. 先一句话介绍自己，然后列出功能
3. 功能用列表形式，每个功能一行，包含图标和简短说明
4. 不要编造不存在的功能
5. 最后加一句引导用户使用的话

支持的功能列表：
-  智能转账：按姓名/手机号/银行卡号/AA收款；定时转账创建时需短信验证码，到期自动执行，执行前可取消
-  理财操作：风险测评、智能推荐、申购赎回、我的持仓、基金定投
-  卡片管理：额度查询、智能调额、挂失解挂、账单分期
-  订阅管理：订阅列表、添加订阅、一键取消、自动续费
-  预算管理：多周期预算设置（日/周/月/年）、总预算、超支预警
-  财务报告：月度综合报告、收支分析、资产状况、AI建议
- ️ 异常交易：大额/凌晨/可疑交易智能识别与预警
-  生日鲜花：联系人生日提醒、一键订购鲜花、自动支付
- ️ 安全中心：密码/指纹/短信验证、登录设备管理
-  用户信息：账户总览、基本信息、卡片贷款、交易记录查询（支持按日期筛选）、联系人管理
-  智能客服：多轮对话、复杂指令拆解、指代理解、上下文记忆` },
            { role: 'user', content: text }
          ],
          temperature: 0.7, max_tokens: 1024, stream: false
        })
      });
      const data = await response.json();
      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();
      if (data.choices && data.choices[0]) {
        appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">${formatAiText(data.choices[0].message.content)}</div></div></div>`);
      } else {
        throw new Error(data.error?.message || 'API 返回异常');
      }
    } catch (err) {
      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble" style="color:#ef4444;">⚠️ AI 服务暂时不可用：${escapeHtml(err.message)}</div></div></div>`);
    }
    return;
  }

  // 使用增强版消息处理（多轮对话、复杂指令、指代理解）
  await enhancedSendMessage(text);
}

