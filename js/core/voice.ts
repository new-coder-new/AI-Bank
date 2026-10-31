// ==========================================================================
//  经典脚本模块（TypeScript 源码，noCheck 转译）
//  编译产物：js/core/voice.js
//  说明：本层为「全局函数 + 动态状态」结构，采用 noCheck 转译；
//        对外符号统一在 types/global.d.ts 声明。
// ==========================================================================

// ========== 全局语音输入（对话框语音按钮） ==========
let globalIsRecording = false;
let globalIsStarting = false;
let globalAudioChunks = [];
let globalMediaRecorder = null;
let globalMediaStream = null;
let globalRecordingTimer = null;
let globalInputBefore = '';

function toggleGlobalVoice() {
  if (globalIsRecording) {
    stopGlobalVoiceRecording();
  } else if (!globalIsStarting) {
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

  globalIsStarting = true;
  globalInputBefore = userInput ? userInput.value : '';
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      globalIsStarting = false;
      globalIsRecording = true;
      globalMediaStream = stream;
      globalAudioChunks = [];
      globalMediaRecorder = new MediaRecorder(stream);
      globalMediaRecorder.ondataavailable = e => { if (e.data.size > 0) globalAudioChunks.push(e.data); };
      globalMediaRecorder.onstop = () => {
        globalIsRecording = false;
        if (globalRecordingTimer) { clearTimeout(globalRecordingTimer); globalRecordingTimer = null; }
        stream.getTracks().forEach(t => t.stop());
        globalMediaStream = null;
        // 恢复UI
        voiceBtn.classList.remove('recording');
        voiceBtn.setAttribute('aria-label', '语音输入');
        voiceBtn.setAttribute('title', '语音输入');
        recordingBar.classList.remove('show');
        if (userInput) userInput.style.display = '';
        // 识别音频
        if (globalAudioChunks.length > 0) {
          const audioBlob = new Blob(globalAudioChunks, { type: 'audio/webm' });
          transcribeGlobalAudio(audioBlob);
        }
      };
      globalMediaRecorder.start();

      // 更新UI（不改 textContent，避免把 SVG 图标换成 emoji）
      voiceBtn.classList.add('recording');
      voiceBtn.setAttribute('aria-label', '停止录音');
      voiceBtn.setAttribute('title', '停止录音');
      recordingBar.classList.add('show');
      if (userInput) userInput.style.display = 'none';

      // 自动停止（最长15秒）；保存句柄，重新录音时清掉旧定时器
      globalRecordingTimer = setTimeout(() => {
        if (globalIsRecording) stopGlobalVoiceRecording();
      }, 15000);
    })
    .catch(err => {
      console.error('全局语音录音错误:', err);
      globalIsStarting = false;
      globalIsRecording = false;
      if (globalMediaStream) {
        try { globalMediaStream.getTracks().forEach(t => t.stop()); } catch (e) { }
        globalMediaStream = null;
      }
      if (globalRecordingTimer) { clearTimeout(globalRecordingTimer); globalRecordingTimer = null; }
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
  if (!bankHasASRKey()) {
    // 不能把随机指令自动提交（尤其不能自动提交“转500元给张三”）
    console.info('[voice] 未配置语音识别，提示用户手动输入');
    if (recordingText) {
      recordingText.textContent = '语音识别未配置，请手动输入';
      recordingText.style.color = '#999';
    }
    if (typeof showToast === 'function') showToast('语音识别不可用，请手动输入', 2600);
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
    const response = await bankFetch(SILICONFLOW_API_URL, {
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
    alert('语音识别失败：' + err.message + '\n请手动输入。');
    // 不自动提交任何内容，避免把用户没说过的话当成指令执行
  }
}

function handleGlobalVoiceResult(text) {
  const userInput = document.getElementById('userInput');
  if (userInput) {
    // 录音期间用户如果手动输入了内容，追加而不是静默覆盖
    const current = String(userInput.value || '').trim();
    userInput.value = (current && current !== String(globalInputBefore || '').trim())
      ? (current + ' ' + text)
      : text;
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  }

  // 语音与键盘输入等价：统一交给 sendMessage()，由主菜单守卫 / 模块作用域 /
  // 槽位流程 / 金额分级 / 确认卡 / 收尾询问统一处理，不做任何“语音直通”。
  setTimeout(() => {
    if (typeof sendMessage === 'function') sendMessage();
  }, 200);
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


// 删除有问题的 sendMessageFromVoice 函数，使用 sendMessage() 替代

