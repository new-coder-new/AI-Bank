declare var isLoading: any;
declare var DEEPSEEK_API_URL: any;
declare var DEEPSEEK_API_KEY: any;
declare var MODEL_NAME: any;
// ========== 大模型意图分类与模块路由（TypeScript 源码） ==========
// 编译产物：js/agent/ai.js（经典脚本，无 import/export）

// —— 运行时由其它脚本提供的全局 ——
declare function bankHasLLMKey(): boolean;
declare function bankFetch(url: string, opts?: any, timeoutMs?: number): Promise<Response>;
declare function formatAiText(text: string): string;
declare function enhancedSendMessage(text: string): Promise<void>;
declare function guideHandleText(text: string): Promise<boolean>;
declare function closeUserInfoPage(): void;
declare function escapeHtml(v: unknown): string;
declare function appendMessage(html: string): void;
declare function scrollToBottom(): void;

interface LLMIntentResult {
  intent?: string;
  module?: string;
  slots?: any;
  confidence?: number;
  reply?: string;
  [key: string]: any;
}

/** 调用大模型识别用户意图（未配置 Key 时返回 null，由调用方降级到本地规则） */
async function callLLMIntentClassification(text: string): Promise<LLMIntentResult | null> {
  const intentDefinitions = `
支持的意图（11种）：
1. 智能转账 - 用户要求转账、汇款、打款、付款给收款人（含多个收款人、多笔转账，交给转账流程逐个处理）
2. 理财购买 - 用户要求购买、申购、买入理财产品或基金
3. 订阅购买 - 用户要求订阅、开通、购买VIP会员或续费
4. 查询余额 - 用户询问账户余额、有多少钱、还剩多少
5. 查询信用卡 - 用户询问信用卡额度、账单、可用额度
6. 卡片挂失 - 用户要求挂失卡片、卡片丢了、冻结卡片
7. 重置数据 - 用户要求重置数据、恢复默认、清空数据
8. 本月消费 - 用户询问本月消费、这个月花了多少、月度消费统计
9. 你能做什么 - 用户询问功能、你能做什么、你能干啥、你有什么用
10. 用户信息 - 用户要求查看用户信息、我的账户、个人信息
11. 未知 - 无法归类到以上任何意图

模块映射：
- 智能转账 → transfer
- 理财购买 → wealth
- 订阅购买 → subscribe
- 查询余额 → userinfo
- 查询信用卡 → card
- 卡片挂失 → card
- 重置数据 → userinfo
- 本月消费 → bill
- 用户信息 → userinfo
- 你能做什么 → chat（直接在对话中回答）
- 未知 → chat（走AI对话）

槽位抽取要求：
- amount: 金额（数字）
- date: 日期（今天/明天/后天/每周/每月等）
- payee_name: 收款人姓名（多个收款人可用逗号分隔）
- payee_list: 多个收款人的列表（数组）
- phone: 手机号
- product_name: 理财产品名称
- period: 周期（月卡/季卡/年卡 或 day/week/month/year）
- platform: 订阅平台（某视频平台VIP/某阅读APP会员/某度）

请严格输出JSON格式，不要输出多余解释：
{"intent": "意图名称", "module": "模块名", "slots": {"amount": null, "date": null, "payee_name": null, "payee_list": [], "phone": null, "product_name": null, "period": null, "platform": null, "steps": []}, "confidence": 0.0, "reply": "给用户的简短回复"}
`;

  if (!bankHasLLMKey()) {
    console.info('[ai] 未配置 DeepSeek API Key，意图分类降级为本地规则');
    return null;
  }

  try {
    const response = await bankFetch(DEEPSEEK_API_URL, {
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
    const data: any = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      let content: string = data.choices[0].message.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) content = jsonMatch[0];
      try {
        const result = JSON.parse(content);
        console.log('大模型意图分类结果:', result);
        return result;
      } catch (parseErr) {
        console.warn('大模型输出JSON解析失败，原始内容:', content);
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

// ========== AI 对话 ==========
async function sendMessage(): Promise<void> {
  if (typeof window !== 'undefined') (window as any).__DEDUPE_BREAK__ = true;
  const userInfoPage = document.getElementById('userInfoPage');
  if (userInfoPage && userInfoPage.classList.contains('show')) {
    closeUserInfoPage();
  }
  const input = document.getElementById('userInput') as HTMLInputElement | null;
  if (!input) return;
  const text = input.value.trim();
  if (!text || isLoading) return;

  appendMessage(`<div class="message user"><div class="msg-avatar user">陈</div><div class="msg-content"><div class="msg-name">小陈</div><div class="msg-bubble">${escapeHtml(text)}</div></div></div>`);
  input.value = '';
  input.style.height = 'auto';
  scrollToBottom();
  isLoading = true;

  try {
    // 服务向导优先（异步：AI 优先识别 → 规则兜底）
    if (typeof guideHandleText === 'function') {
      var guideHandled = await guideHandleText(text);
      if (guideHandled) return;
    }

    // 「你能做什么」类问题：调用 AI 输出功能列表
    if (/你能做什么|你能干啥|你有什么用|你会什么|你有什么功能|功能介绍|介绍一下|能帮我做什么|可以做什么|有哪些功能|你是谁/.test(text)) {
      const loadingId = 'loading-' + Date.now();
      appendMessage(`<div class="message" id="${loadingId}"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div></div></div>`);
      scrollToBottom();
      try {
        if (!bankHasLLMKey()) {
          throw new Error('未配置 DeepSeek API Key，请参考 js/config.local.example.js 创建 js/config.local.js');
        }
        const response = await bankFetch(DEEPSEEK_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
          body: JSON.stringify({
            model: MODEL_NAME,
            messages: [
              {
                role: 'system', content: `你是一个专业的智能金融助手。用户在询问你的功能，请用简洁清晰的方式列出你支持的所有功能。

要求：
1. 用中文回答
2. 先一句话介绍自己，然后列出功能
3. 功能用列表形式，每个功能一行，包含图标和简短说明
4. 不要编造不存在的功能
5. 最后加一句引导用户使用的话

支持的功能列表：
-  智能转账：按姓名/手机号/银行卡号/AA收款；定时转账创建时需短信验证码，到期自动执行，执行前可取消
-  理财操作：风险测评、智能推荐、申购赎回、持仓管理、基金定投
-  卡片管理：额度查询、智能调额、挂失解挂
-  订阅管理：订阅列表、添加订阅、一键取消、自动续费
-  财务报告：月度综合报告、收支分析、资产状况、AI建议
- ️ 异常交易：大额/凌晨/可疑交易智能识别与预警
-  生日鲜花：联系人生日提醒、一键订购鲜花、自动支付
- ️ 安全中心：密码/指纹/短信验证、登录设备管理
-  用户信息：账户总览、基本信息、交易记录查询（支持按日期筛选）、联系人管理
-  智能客服：多轮对话、复杂指令拆解、指代理解、上下文记忆`
              },
              { role: 'user', content: text }
            ],
            temperature: 0.7, max_tokens: 1024, stream: false
          })
        });
        const data: any = await response.json();
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        if (data.choices && data.choices[0]) {
          appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">${formatAiText(data.choices[0].message.content)}</div></div></div>`);
        } else {
          throw new Error(data.error?.message || 'API 返回异常');
        }
      } catch (err: any) {
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble" style="color:#ef4444;">⚠️ AI 服务暂时不可用：${escapeHtml(err.message)}</div></div></div>`);
      }
      return;
    }

    // 增强版消息处理（多轮对话、复杂指令、指代理解）
    await enhancedSendMessage(text);
  } finally {
    isLoading = false;
  }
}
