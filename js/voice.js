// ========== 全局语音输入（对话框语音按钮） ==========
let globalIsRecording = false;
let globalAudioChunks = [];
let globalMediaRecorder = null;

function toggleGlobalVoice() {
  if (globalIsRecording) {
    stopGlobalVoiceRecording();
  } else {
    startGlobalVoiceRecording();
  }
}

function startGlobalVoiceRecording() {
  const voiceBtn = document.getElementById('voiceBtn');
  const recordingBar = document.getElementById('voiceRecordingBar');
  const userInput = document.getElementById('userInput');
  if (!voiceBtn || !recordingBar) return;

  // 检查浏览器支持
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
    alert('当前浏览器不支持语音输入，请使用Chrome/Edge/Safari等现代浏览器');
    return;
  }

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      globalIsRecording = true;
      globalAudioChunks = [];
      globalMediaRecorder = new MediaRecorder(stream);
      globalMediaRecorder.ondataavailable = e => { if (e.data.size > 0) globalAudioChunks.push(e.data); };
      globalMediaRecorder.onstop = () => {
        globalIsRecording = false;
        stream.getTracks().forEach(t => t.stop());
        // 恢复UI
        voiceBtn.classList.remove('recording');
        voiceBtn.textContent = '🎤';
        recordingBar.classList.remove('show');
        if (userInput) userInput.style.display = '';
        // 识别音频
        if (globalAudioChunks.length > 0) {
          const audioBlob = new Blob(globalAudioChunks, { type: 'audio/webm' });
          transcribeGlobalAudio(audioBlob);
        }
      };
      globalMediaRecorder.start();

      // 更新UI
      voiceBtn.classList.add('recording');
      voiceBtn.textContent = '⏹';
      recordingBar.classList.add('show');
      if (userInput) userInput.style.display = 'none';

      // 自动停止（最长15秒）
      setTimeout(() => {
        if (globalIsRecording) stopGlobalVoiceRecording();
      }, 15000);
    })
    .catch(err => {
      console.error('全局语音录音错误:', err);
      if (err.name === 'NotAllowedError') {
        alert('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问');
      } else {
        alert('录音失败：' + err.message);
      }
    });
}

function stopGlobalVoiceRecording() {
  if (globalMediaRecorder && globalMediaRecorder.state !== 'inactive') {
    globalMediaRecorder.stop();
  }
}

async function transcribeGlobalAudio(audioBlob) {
  const recordingText = document.getElementById('voiceRecordingText');
  // 未配置语音识别 Key：不发起请求，直接走模拟识别，避免弹错误框
  if (!SILICONFLOW_API_KEY) {
    console.info('[voice] 未配置 SiliconFlow API Key，语音识别走模拟结果');
    if (recordingText) {
      recordingText.textContent = '未配置语音 Key，使用模拟识别';
      recordingText.style.color = '#999';
    }
    const mockTexts = ['查一下我的余额', '本月消费统计', '转500元给张三', '我的理财产品', '信用卡额度'];
    setTimeout(() => handleGlobalVoiceResult(mockTexts[Math.floor(Math.random() * mockTexts.length)]), 400);
    return;
  }
  if (recordingText) {
    recordingText.textContent = '正在识别...';
    recordingText.style.color = '#0B4F9C';
  }
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', VOICE_MODEL);
    const response = await fetch(SILICONFLOW_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SILICONFLOW_API_KEY}` },
      body: formData
    });
    if (!response.ok) throw new Error('API请求失败 ' + response.status);
    const data = await response.json();
    const text = (data.text || '').trim();
    if (text) {
      handleGlobalVoiceResult(text);
    } else {
      alert('未识别到语音内容，请重试');
    }
  } catch (err) {
    console.error('全局语音识别错误:', err);
    alert('语音识别失败：' + err.message + '\n将使用模拟识别');
    // 降级：模拟识别
    const mockTexts = ['查一下我的余额', '本月消费统计', '转500元给张三', '我的理财产品', '信用卡额度'];
    const mockText = mockTexts[Math.floor(Math.random() * mockTexts.length)];
    handleGlobalVoiceResult(mockText);
  }
}

function handleGlobalVoiceResult(text) {
  const userInput = document.getElementById('userInput');
  if (userInput) {
    userInput.value = text;
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  }

  // 判断是否是转账指令
  const isTransfer = /转|汇款|打款|付款|给.*钱/.test(text) && /\d+/.test(text);

  if (isTransfer) {
    // 转账指令：尝试AI大模型解析，成功则添加用户消息并弹确认框，失败则让AI对话智能回复
    parseVoiceCommandSmart(text);
  } else {
    // 其他指令：直接调用 sendMessage() 发送消息（会自动添加用户消息并处理意图）
    setTimeout(() => {
      sendMessage();
    }, 300);
  }
}

// 智能转账解析：支持姓名/手机号/定时/AA四种转账类型
async function parseVoiceCommandSmart(text) {
  // 未配置 Key：跳过模型解析，直接把文本交给对话链路（本地规则/知识库）
  if (!DEEPSEEK_API_KEY) {
    console.info('[voice] 未配置 DeepSeek API Key，跳过模型解析');
    const userInput = document.getElementById('userInput');
    if (userInput) userInput.value = text;
    sendMessage();
    return;
  }
  try {
    const prompt = `你是一个金融语音指令解析器。请从以下用户语音识别文本中提取转账信息，返回严格的JSON格式，不要有任何其他文字。

支持的转账类型：
- name: 按姓名转账（普通转账）
- phone: 手机号转账
- timed: 定时转账（未来某个时间执行）
- aa: AA收款（多人分摊，我先垫付）

需要提取的字段：
- type: 转账类型（name/phone/timed/aa）
- amount: 转账金额（数字，中文数字请转换成阿拉伯数字）
- payee: 收款人姓名（字符串，无法确定则为空字符串）
- phone: 收款手机号（字符串，仅phone类型需要）
- date: 定时转账日期（格式YYYY-MM-DD，仅timed类型需要，无法确定则为空）
- time: 定时转账时间（格式HH:mm，仅timed类型需要，默认09:00）
- repeat: 重复方式（不重复/每天/每周/每月，仅timed类型需要，默认不重复）
- total: AA总金额（数字，仅aa类型需要）
- count: AA参与人数（数字，仅aa类型需要，默认2人）

用户语音文本："${text}"

返回格式示例：
普通转账：{"type":"name","amount":500,"payee":"张三"}
手机号转账：{"type":"phone","amount":500,"phone":"13812345678","payee":""}
定时转账：{"type":"timed","amount":1000,"payee":"房东","date":"2026-10-01","time":"09:00","repeat":"每月"}
AA收款：{"type":"aa","total":200,"count":4}`;

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 300
      })
    });

    if (!response.ok) throw new Error('API请求失败');
    const data = await response.json();
    const resultText = data.choices[0].message.content.trim();
    let jsonStr = resultText;
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    // 验证解析结果
    const type = parsed.type || 'name';
    let isValid = false;
    if (type === 'name' && parsed.amount > 0 && parsed.payee) isValid = true;
    else if (type === 'phone' && parsed.amount > 0 && parsed.phone) isValid = true;
    else if (type === 'timed' && parsed.amount > 0 && parsed.payee && parsed.date) isValid = true;
    else if (type === 'aa' && parsed.total > 0 && parsed.count > 0) isValid = true;

    if (isValid) {
      // 解析成功：添加用户消息，显示智能确认弹窗
      appendMessage(`<div class="message"><div class="msg-avatar user">陈</div><div class="msg-content"><div class="msg-bubble">${text}</div></div></div>`);
      scrollToBottom();
      showSmartVoiceTransferConfirm(parsed, text);
    } else {
      // 信息不完整：将文字填入输入框，调用 sendMessage() 让AI对话智能回复
      const userInput = document.getElementById('userInput');
      if (userInput) userInput.value = text;
      sendMessage();
    }
  } catch (err) {
    console.error('智能转账解析失败，交由AI对话处理:', err);
    // 解析失败：将文字填入输入框，调用 sendMessage() 让AI对话智能回复
    const userInput = document.getElementById('userInput');
    if (userInput) userInput.value = text;
    sendMessage();
  }
}

// 智能转账确认弹窗（支持修改金额和收款人）
function showSmartVoiceTransferConfirm(data, originalText) {
  const confirmId = 'smart-voice-confirm-' + Date.now();
  const typeLabels = { name: '按姓名转账', phone: '手机号转账', timed: '定时转账', aa: 'AA收款', bank: '银行卡号转账' };
  const typeLabel = typeLabels[data.type] || '转账';
  const inputId = confirmId + '-input';

  let detailHtml = '';
  // 通讯录选项
  const contactOptions = mockData.contacts.map(c => `<option value="${c.name}" data-phone="${c.phone}">${c.name}（${c.phone}）</option>`).join('');
  if (data.type === 'name') {
    detailHtml = `
      <div class="data-row"><span class="data-label">转账类型</span><span class="data-value">${typeLabel}</span></div>
      <div class="data-row" style="align-items:center;">
        <span class="data-label">收款人</span>
        <select class="form-select" id="${inputId}-payee" style="flex:1;margin-left:8px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;outline:none;background:white;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
          <option value="">-- 请选择收款人 --</option>
          ${contactOptions}
        </select>
      </div>
      <div class="data-row" style="align-items:center;">
        <span class="data-label">转账金额</span>
        <input type="number" class="form-input" id="${inputId}-amount" value="${parseFloat(data.amount).toFixed(2)}" placeholder="请输入金额" style="flex:1;margin-left:8px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;font-weight:700;color:#ef4444;outline:none;text-align:right;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
      </div>
    `;
  } else if (data.type === 'phone') {
    detailHtml = `
      <div class="data-row"><span class="data-label">转账类型</span><span class="data-value">${typeLabel}</span></div>
      <div class="data-row" style="align-items:center;">
        <span class="data-label">收款手机号</span>
        <select class="form-select" id="${inputId}-phone" style="flex:1;margin-left:8px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;outline:none;background:white;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
          <option value="">-- 请选择联系人 --</option>
          ${mockData.contacts.map(c => `<option value="${c.phone}">${c.name}（${c.phone}）</option>`).join('')}
        </select>
      </div>
      <div class="data-row" style="align-items:center;">
        <span class="data-label">转账金额</span>
        <input type="number" class="form-input" id="${inputId}-amount" value="${parseFloat(data.amount).toFixed(2)}" placeholder="请输入金额" style="flex:1;margin-left:8px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;font-weight:700;color:#ef4444;outline:none;text-align:right;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
      </div>
    `;
  } else if (data.type === 'timed') {
    detailHtml = `
      <div class="data-row"><span class="data-label">转账类型</span><span class="data-value">${typeLabel}</span></div>
      <div class="data-row" style="align-items:center;">
        <span class="data-label">收款人</span>
        <select class="form-select" id="${inputId}-payee" style="flex:1;margin-left:8px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;outline:none;background:white;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
          <option value="">-- 请选择收款人 --</option>
          ${contactOptions}
        </select>
      </div>
      <div class="data-row" style="align-items:center;">
        <span class="data-label">转账金额</span>
        <input type="number" class="form-input" id="${inputId}-amount" value="${parseFloat(data.amount).toFixed(2)}" placeholder="请输入金额" style="flex:1;margin-left:8px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;font-weight:700;color:#ef4444;outline:none;text-align:right;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
      </div>
      <div class="data-row"><span class="data-label">执行时间</span><span class="data-value">${data.date} ${data.time || '09:00'}</span></div>
      <div class="data-row"><span class="data-label">重复方式</span><span class="data-value">${data.repeat || '不重复'}</span></div>
    `;
  } else if (data.type === 'aa') {
    const per = (parseFloat(data.total) / parseInt(data.count)).toFixed(2);
    detailHtml = `
      <div class="data-row"><span class="data-label">转账类型</span><span class="data-value">${typeLabel}</span></div>
      <div class="data-row" style="align-items:center;">
        <span class="data-label">总金额</span>
        <input type="number" class="form-input" id="${inputId}-total" value="${parseFloat(data.total).toFixed(2)}" placeholder="请输入总金额" style="flex:1;margin-left:8px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;font-weight:700;color:#ef4444;outline:none;text-align:right;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
      </div>
      <div class="data-row" style="align-items:center;">
        <span class="data-label">参与人数</span>
        <input type="number" class="form-input" id="${inputId}-count" value="${data.count}" placeholder="请输入人数" style="flex:1;margin-left:8px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;outline:none;text-align:right;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
      </div>
      <div class="data-row"><span class="data-label">人均金额</span><span class="data-value" style="font-weight:600;">¥${per}</span></div>
    `;
  } else if (data.type === 'bank') {
    detailHtml = `
      <div class="data-row"><span class="data-label">转账类型</span><span class="data-value">${typeLabel}</span></div>
      <div class="data-row" style="align-items:center;">
        <span class="data-label">收款卡号</span>
        <input type="text" class="form-input" id="${inputId}-bankcard" value="${data.bankcard || ''}" placeholder="请输入银行卡号" maxlength="19" style="flex:1;margin-left:8px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;outline:none;font-family:monospace;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb';validateBankCardInput('${inputId}-bankcard')" oninput="this.value=this.value.replace(/\\D/g,'')">
      </div>
      <div class="data-row" id="${inputId}-bankcard-valid" style="display:none;">
        <span class="data-label">卡号校验</span>
        <span class="data-value" style="color:#22c55e;font-size:12px;">卡号格式正确</span>
      </div>
      <div class="data-row" id="${inputId}-bankcard-invalid" style="display:none;">
        <span class="data-label">卡号校验</span>
        <span class="data-value" style="color:#ef4444;font-size:12px;">卡号格式不正确</span>
      </div>
      <div class="data-row" style="align-items:center;">
        <span class="data-label">转账金额</span>
        <input type="number" class="form-input" id="${inputId}-amount" value="${parseFloat(data.amount).toFixed(2)}" placeholder="请输入金额" style="flex:1;margin-left:8px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;font-weight:700;color:#ef4444;outline:none;text-align:right;" onfocus="this.style.borderColor='#0B4F9C'" onblur="this.style.borderColor='#e5e7eb'">
      </div>
    `;
  }

  appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
    <div style="margin-bottom:10px;font-size:14px;font-weight:600;">请确认并修改转账信息：</div>
    <div class="data-card" style="background:#fffbeb;border-color:#fde68a;">
      ${detailHtml}
    </div>
    <div style="display:flex;gap:10px;margin-top:12px;" id="${confirmId}">
      <button class="btn btn-primary" style="flex:1;" onclick="confirmSmartTransferEdit('${confirmId}', '${inputId}', '${data.type}')">确认转账</button>
      <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('${confirmId}').innerHTML='<div style=\\'padding:8px;text-align:center;color:#999;\\'>已取消转账</div>';">取消</button>
    </div>
  </div></div></div>`);
  scrollToBottom();
}

// 银行卡号校验（长度+Luhn算法）
function validateBankCard(cardNumber) {
  if (!cardNumber) return { valid: false, message: '请输入银行卡号' };
  const cleaned = cardNumber.replace(/\D/g, '');
  // 长度校验：16-19位
  if (cleaned.length < 16 || cleaned.length > 19) {
    return { valid: false, message: '银行卡号长度应为16-19位' };
  }
  // Luhn算法校验
  let sum = 0;
  let isEven = false;
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i], 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  if (sum % 10 !== 0) {
    return { valid: false, message: '银行卡号校验失败（Luhn算法）' };
  }
  // 识别银行（简单识别）
  let bank = '未知银行';
  if (cleaned.startsWith('6222')) bank = '工商银行';
  else if (cleaned.startsWith('6225')) bank = '招商银行';
  else if (cleaned.startsWith('6217')) bank = '建设银行';
  else if (cleaned.startsWith('6228')) bank = '农业银行';
  else if (cleaned.startsWith('6216')) bank = '中国银行';
  return { valid: true, message: '卡号格式正确', bank: bank, cardNumber: cleaned };
}

// 输入框实时校验
function validateBankCardInput(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const result = validateBankCard(input.value);
  const validEl = document.getElementById(inputId + '-valid');
  const invalidEl = document.getElementById(inputId + '-invalid');
  if (validEl) validEl.style.display = result.valid ? 'flex' : 'none';
  if (invalidEl) invalidEl.style.display = result.valid ? 'none' : 'flex';
  if (result.valid && result.bank) {
    if (validEl) validEl.querySelector('.data-value').textContent = `${result.bank} · 卡号格式正确`;
  }
}

// 转账模块卡号校验
function validateTransferBankCard() {
  const input = document.getElementById('transferBankCard');
  if (!input) return;
  const result = validateBankCard(input.value);
  const validEl = document.getElementById('transferBankCardValid');
  const invalidEl = document.getElementById('transferBankCardInvalid');
  if (validEl) validEl.style.display = result.valid ? 'block' : 'none';
  if (invalidEl) invalidEl.style.display = result.valid ? 'none' : 'block';
  if (result.valid && result.bank) {
    if (validEl) validEl.textContent = `${result.bank} · 卡号格式正确`;
  }
}

// 确认修改后的转账
function confirmSmartTransferEdit(confirmId, inputId, type) {
  const data = { type: type };
  if (type === 'name' || type === 'timed') {
    data.payee = document.getElementById(inputId + '-payee')?.value || '';
    data.amount = parseFloat(document.getElementById(inputId + '-amount')?.value) || 0;
  } else if (type === 'phone') {
    data.phone = document.getElementById(inputId + '-phone')?.value || '';
    data.amount = parseFloat(document.getElementById(inputId + '-amount')?.value) || 0;
  } else if (type === 'aa') {
    data.total = parseFloat(document.getElementById(inputId + '-total')?.value) || 0;
    data.count = parseInt(document.getElementById(inputId + '-count')?.value) || 1;
  } else if (type === 'bank') {
    data.bankcard = document.getElementById(inputId + '-bankcard')?.value || '';
    data.amount = parseFloat(document.getElementById(inputId + '-amount')?.value) || 0;
  }

  // 验证
  if (type === 'name' || type === 'timed') {
    if (!data.payee) { alert('请选择收款人'); return; }
    if (data.amount <= 0) { alert('请输入正确的转账金额'); return; }
  } else if (type === 'phone') {
    if (!data.phone) { alert('请选择收款手机号'); return; }
    if (data.amount <= 0) { alert('请输入正确的转账金额'); return; }
  } else if (type === 'aa') {
    if (data.total <= 0) { alert('请输入正确的总金额'); return; }
    if (data.count <= 0) { alert('请输入正确的参与人数'); return; }
  } else if (type === 'bank') {
    const cardResult = validateBankCard(data.bankcard);
    if (!cardResult.valid) { alert(cardResult.message); return; }
    data.bankcard = cardResult.cardNumber;
    data.bank = cardResult.bank;
    if (data.amount <= 0) { alert('请输入正确的转账金额'); return; }
  }

  const quickAmount = parseFloat(data.amount) || 0;
  const quickTier = typeof agentTransferTier === 'function' ? agentTransferTier(quickAmount, null) : null;
  const needsRiskVerify = (data.type === 'name' || data.type === 'phone' || data.type === 'bank') &&
    !!quickTier && quickTier.rank >= 2;
  const doneText = data.type === 'timed' ? '已确认，请完成短信验证' : data.type === 'aa' ? '已确认，请选择参与人员' : needsRiskVerify ? '已确认，请完成安全验证' : '转账已执行';
  document.getElementById(confirmId).innerHTML = '<div style=\'padding:8px;text-align:center;color:#16a34a;font-weight:600;\'>' + doneText + '</div>';
  executeSmartVoiceTransfer(data);
}

// 执行智能语音转账
async function executeSmartVoiceTransfer(data) {
  const type = data.type || 'name';
  // 语音转账同样适用金额分级；T4 只提交人工复核，不立即扣款
  if ((type === 'name' || type === 'phone' || type === 'bank') && typeof verifyAmountRisk === 'function') {
    const voiceAmount = parseFloat(data.amount) || 0;
    const voicePayee = type === 'name'
      ? (data.payee || '指定收款人')
      : type === 'phone'
        ? (data.name || data.phone || '手机号用户')
        : (data.bank || '银行卡用户');
    const risk = await verifyAmountRisk(voiceAmount, '语音转账', [{ tool: 'transfer.execute', args: { payee: voicePayee, amount: voiceAmount, channel: '语音转账' } }]);
    if (risk && risk.pendingReview) return;
    if (!risk || !risk.ok) {
      appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">已取消语音转账，账户未发生扣款。</div></div></div>');
      scrollToBottom();
      return;
    }
  }
  if (type === 'name') {
    // 按姓名转账
    const amount = parseFloat(data.amount) || 0;
    const payee = data.payee || '指定收款人';
    const okTx = addTransaction('expense', amount, `语音转账给${payee}`, '语音转账');
    if (okTx === false) {
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>语音转账未完成</strong><br>可用余额不足，本次未扣款。</div></div></div>`);
      scrollToBottom();
      return;
    }
    if (!mockData.userProfile.transferHistory) mockData.userProfile.transferHistory = [];
    const newId = Math.max(0, ...mockData.userProfile.transferHistory.map(t => t.id)) + 1;
    mockData.userProfile.transferHistory.unshift({
      id: newId, payee: payee, account: mockData.contacts.find(c => c.name === payee)?.account || '**** **** **** ****',
      amount: amount, time: new Date().toLocaleString('zh-CN'), status: '已完成', channel: '语音转账'
    });
    saveUserData();
    if (typeof apiTransfer === 'function') apiTransfer(payee, amount);
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
      <p><strong>语音转账成功</strong></p>
      <div class="data-card">
        <div class="data-row"><span class="data-label">转账方式</span><span class="data-value">语音转账</span></div>
        <div class="data-row"><span class="data-label">收款人</span><span class="data-value">${payee}</span></div>
        <div class="data-row"><span class="data-label">转账金额</span><span class="data-value expense" style="font-weight:700;">-¥ ${amount.toFixed(2)}</span></div>
        <div class="data-row"><span class="data-label">当前余额</span><span class="data-value" style="font-weight:700;">¥ ${mockData.userProfile.debitCard.balance.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
      </div>
    </div></div></div>`);
  } else if (type === 'phone') {
    // 手机号转账
    const amount = parseFloat(data.amount) || 0;
    const phone = data.phone || '';
    const okTx = addTransaction('expense', amount, `手机号转账到${phone}`, '手机号转账');
    if (okTx === false) {
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>手机号转账未完成</strong><br>可用余额不足，本次未扣款。</div></div></div>`);
      scrollToBottom();
      return;
    }
    if (!mockData.userProfile.transferHistory) mockData.userProfile.transferHistory = [];
    const newId = Math.max(0, ...mockData.userProfile.transferHistory.map(t => t.id)) + 1;
    mockData.userProfile.transferHistory.unshift({
      id: newId, payee: `手机号${phone}`, account: '手机号转账',
      amount: amount, time: new Date().toLocaleString('zh-CN'), status: '已完成', channel: '手机号转账'
    });
    saveUserData();
    if (typeof apiTransfer === 'function') apiTransfer(`手机号${phone}`, amount);
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
      <p><strong>手机号转账成功</strong></p>
      <div class="data-card">
        <div class="data-row"><span class="data-label">转账方式</span><span class="data-value">手机号转账</span></div>
        <div class="data-row"><span class="data-label">收款手机号</span><span class="data-value">${phone}</span></div>
        <div class="data-row"><span class="data-label">转账金额</span><span class="data-value expense" style="font-weight:700;">-¥ ${amount.toFixed(2)}</span></div>
        <div class="data-row"><span class="data-label">当前余额</span><span class="data-value" style="font-weight:700;">¥ ${mockData.userProfile.debitCard.balance.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
      </div>
    </div></div></div>`);
  } else if (type === 'timed') {
    // 定时转账：语音只负责整理要素，仍必须通过验证码确认后才创建任务
    const amount = parseFloat(data.amount) || 0;
    const payee = data.payee || '指定收款人';
    const date = data.date || '';
    const time = data.time || '09:00';
    const repeat = data.repeat || '不重复';
    const info = (mockData.contacts || []).find(c => c.name === payee);
    if (typeof openScheduledTransferConfirm === 'function') {
      openScheduledTransferConfirm({
        payee: payee,
        account: info?.account || '',
        amount: amount,
        date: date,
        time: time,
        repeat: repeat,
        remark: '',
        channel: '语音'
      });
    } else {
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">⚠️ 定时转账需要完成安全验证，请到「定时转账」中新建。</div></div></div>`);
      scrollToBottom();
    }
  } else if (type === 'aa') {
    // AA 收款必须选择参与人员；语音只负责预填总额，打开表单让用户确认分摊
    const total = parseFloat(data.total) || 0;
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">👥 <strong>AA 收款需要选择参与人员</strong><br>已为你打开 AA 表单并预填总额 ¥${total.toFixed(2)}，请选择参与人后确认每人应付。</div></div></div>`);
    scrollToBottom();
    if (typeof openAAForm === 'function') openAAForm(total, data.activity || 'AA收款');
  } else if (type === 'bank') {
    // 银行卡号转账
    const amount = parseFloat(data.amount) || 0;
    const bankcard = data.bankcard || '';
    const bank = data.bank || '未知银行';
    // 脱敏显示卡号
    const maskedCard = bankcard.length >= 8 ? bankcard.substring(0, 4) + ' **** **** ' + bankcard.substring(bankcard.length - 4) : bankcard;
    const okTx = addTransaction('expense', amount, `银行卡转账至${maskedCard}`, '银行卡转账');
    if (okTx === false) {
      appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">❌ <strong>银行卡转账未完成</strong><br>可用余额不足，本次未扣款。</div></div></div>`);
      scrollToBottom();
      return;
    }
    if (!mockData.userProfile.transferHistory) mockData.userProfile.transferHistory = [];
    const newId = Math.max(0, ...mockData.userProfile.transferHistory.map(t => t.id)) + 1;
    mockData.userProfile.transferHistory.unshift({
      id: newId, payee: bank, account: maskedCard,
      amount: amount, time: new Date().toLocaleString('zh-CN'), status: '已完成', channel: '银行卡转账'
    });
    saveUserData();
    if (typeof apiTransfer === 'function') apiTransfer(bank, amount);
    appendMessage(`<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content"><div class="msg-name">智能金融助手</div><div class="msg-bubble">
      <p><strong>银行卡转账成功</strong></p>
      <div class="data-card">
        <div class="data-row"><span class="data-label">转账方式</span><span class="data-value">银行卡号转账</span></div>
        <div class="data-row"><span class="data-label">收款银行</span><span class="data-value" style="font-weight:600;">${bank}</span></div>
        <div class="data-row"><span class="data-label">收款卡号</span><span class="data-value" style="font-family:monospace;">${maskedCard}</span></div>
        <div class="data-row"><span class="data-label">转账金额</span><span class="data-value expense" style="font-weight:700;">-¥ ${amount.toFixed(2)}</span></div>
        <div class="data-row"><span class="data-label">当前余额</span><span class="data-value" style="font-weight:700;">¥ ${mockData.userProfile.debitCard.balance.toLocaleString('zh-CN', {minimumFractionDigits: 2})}</span></div>
      </div>
      <p style="margin-top:8px;font-size:12px;color:#22c55e;">卡号已通过Luhn算法校验，转账成功</p>
    </div></div></div>`);
  }
  scrollToBottom();
}

// 删除有问题的 sendMessageFromVoice 函数，使用 sendMessage() 替代

