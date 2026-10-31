// ==========================================================================
//  经典脚本模块（TypeScript 源码，noCheck 转译）
//  编译产物：js/core/ui.js
//  说明：本层为「全局函数 + 动态状态」结构，采用 noCheck 转译；
//        对外符号统一在 types/global.d.ts 声明。
// ==========================================================================

// ========== 用户体验优化：深色模式 ==========
function toggleDarkMode() {
  const body = document.body;
  const isDark = body.classList.toggle('dark-mode');
  const btn = document.getElementById('darkModeBtn');
  if (btn) btn.textContent = isDark ? '浅色模式' : '深色模式';
  localStorage.setItem('darkMode', isDark ? 'true' : 'false');
  showToast(isDark ? '已切换到深色模式' : '已切换到浅色模式');
}

function initDarkMode() {
  const isDark = localStorage.getItem('darkMode') === 'true';
  const btn = document.getElementById('darkModeBtn');
  if (isDark) document.body.classList.add('dark-mode');
  if (btn) btn.textContent = isDark ? '浅色模式' : '深色模式';
}

// ========== 银行 App 首页 / 全部服务 ==========
function toggleBankBalance(btn: any) {
  const el = document.querySelector('.bank-balance-amount');
  if (!el) return;
  const masked = el.classList.toggle('masked');
  el.textContent = masked ? '¥ ****' : (el.dataset.raw || '¥ 0.00');
  if (btn) btn.classList.toggle('off', masked);
}

function openTxnsPage() {
  showUserInfoFromTopbar();
  setTimeout(function () { if (typeof goToTxnsTab === 'function') goToTxnsTab(); }, 30);
}

var FUNC_GROUPS = [
  {
    title: '转账', items: [
      { key: 'transferName', label: '姓名转账', icon: 'transfer' },
      { key: 'transferPhone', label: '手机号转账', icon: 'receive' },
      { key: 'scheduled', label: '定时转账', icon: 'timer' },
      { key: 'aa', label: 'AA收款', icon: 'users' }
    ]
  },
  {
    title: '账单', items: [
      { key: 'bill', label: '账单分析', icon: 'bill' },
      { key: 'abnormal', label: '异常交易', icon: 'alert' }
    ]
  },
  {
    title: '卡片', items: [
      { key: 'cardApply', label: '卡片申请', icon: 'card' },
      { key: 'myCards', label: '我的卡片', icon: 'card' },
      { key: 'cardLimit', label: '额度调整', icon: 'sliders' },
      { key: 'txnLimit', label: '交易限制', icon: 'lock' },
      { key: 'cardLost', label: '卡片挂失', icon: 'alert' }
    ]
  },
  {
    title: '理财', items: [
      { key: 'wealth', label: '产品申购', icon: 'wealth' },
      { key: 'risk', label: '风险评估', icon: 'shield' },
      { key: 'holdings', label: '持仓管理', icon: 'pie' }
    ]
  },
  {
    title: '生活', items: [
      { key: 'subscribe', label: '订阅管理', icon: 'bell' },
      { key: 'birthday', label: '生日鲜花', icon: 'gift' }
    ]
  }
];

// 主分组之外、但仍在用的能力：降级为面板底部一行文字入口，避免功能失去入口
var FUNC_MORE = [
  { key: 'bankTransfer', label: '银行卡转账' },
  { key: 'transferHistory', label: '转账记录' },
  { key: 'batchTransfer', label: '批量转账' },
  { key: 'installment', label: '账单分期' },
  { key: 'manualReviews', label: '复核审批' },
  { key: 'security', label: '安全中心' }
];

// 教程步骤数据（原代码引用 tutorialSteps / currentTutorialStep 但未声明）
var tutorialSteps: Array<{ target: string; text: string; highlight?: string; title?: string; desc?: string }> = [
  { target: '#func-panel', text: '这里是全部功能入口，点击任意功能即可开始。' },
  { target: '#chat-input', text: '也可以直接输入需求，例如「给张三转账 1000 元」。' },
  { target: '#user-chip', text: '点右上角头像可以查看账户、卡片和安全设置。' }
];
var currentTutorialStep = 0;

function showTutorial() {
  currentTutorialStep = 0;
  showTutorialStep();
}

function showTutorialStep() {
  const step = tutorialSteps[currentTutorialStep];
  if (!step) {
    closeTutorial();
    return;
  }

  // 移除旧的高亮
  document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));

  // 添加新的高亮
  if (step.highlight) {
    const el = document.querySelector(step.highlight);
    if (el) {
      el.classList.add('tutorial-highlight');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // 移除旧的教程弹窗
  const oldTutorial = document.getElementById('tutorial-overlay');
  if (oldTutorial) oldTutorial.remove();

  // 创建新的教程弹窗
  const overlay = document.createElement('div');
  overlay.id = 'tutorial-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:100000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.3s ease;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:14px;color:#999;margin-bottom:8px;">${currentTutorialStep + 1} / ${tutorialSteps.length}</div>
        <div style="width:100%;height:4px;background:#e5e7eb;border-radius:2px;margin-bottom:16px;overflow:hidden;">
          <div style="height:100%;background:linear-gradient(90deg,#0B4F9C,#1F6FD0);width:${((currentTutorialStep + 1) / tutorialSteps.length) * 100}%;transition:width 0.3s ease;"></div>
        </div>
        <div style="font-size:18px;font-weight:700;color:#1a1a1a;margin-bottom:8px;">${step.title}</div>
        <div style="font-size:14px;color:#666;line-height:1.6;">${step.desc}</div>
      </div>
      <div style="display:flex;gap:10px;">
        ${currentTutorialStep > 0 ? '<button class="btn btn-secondary" style="flex:1;" onclick="prevTutorialStep()">上一步</button>' : ''}
        ${currentTutorialStep < tutorialSteps.length - 1 
          ? '<button class="btn btn-primary" style="flex:1;" onclick="nextTutorialStep()">下一步</button>'
          : '<button class="btn btn-primary" style="flex:1;" onclick="closeTutorial()">开始使用</button>'
        }
      </div>
      <button onclick="closeTutorial()" style="width:100%;margin-top:10px;padding:8px;border:none;background:none;color:#999;cursor:pointer;font-size:12px;">跳过教程</button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function nextTutorialStep() {
  currentTutorialStep++;
  showTutorialStep();
}

function prevTutorialStep() {
  currentTutorialStep--;
  showTutorialStep();
}

function closeTutorial() {
  const overlay = document.getElementById('tutorial-overlay');
  if (overlay) overlay.remove();
  document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
  localStorage.setItem('tutorialCompleted', 'true');
}

function checkTutorial() {
  // 改版后首页信息已经收敛，首次进入不再自动弹教程，避免遮挡首页。
  // 需要时可通过 ?tutorial=1 主动打开。
  const wantTutorial = new URLSearchParams(location.search).get('tutorial') === '1';
  if (wantTutorial && !localStorage.getItem('tutorialCompleted')) {
    setTimeout(() => showTutorial(), 600);
  }
}


// ========== 用户体验优化：动画效果 ==========
// Toast提示
function showToast(message: any, duration: any) {
  duration = duration || 2000;
  const oldToast = document.getElementById('toast-notification');
  if (oldToast) oldToast.remove();

  const toast = document.createElement('div');
  toast.id = 'toast-notification';
  toast.className = 'bank-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// 页面加载动画
function initPageAnimations() {
  // 添加教程高亮样式
  if (!document.getElementById('tutorial-highlight-style')) {
    const style = document.createElement('style');
    style.id = 'tutorial-highlight-style';
    style.textContent = `
      .tutorial-highlight { position: relative; z-index: 99999; box-shadow: 0 0 0 4px #0B4F9C, 0 0 20px rgba(11,79,156,0.5); border-radius: 8px; animation: pulse-highlight 1.5s infinite; }
      @keyframes pulse-highlight { 0%,100% { box-shadow: 0 0 0 4px #0B4F9C, 0 0 20px rgba(11,79,156,0.5); } 50% { box-shadow: 0 0 0 6px #0B4F9C, 0 0 30px rgba(11,79,156,0.7); } }
      .btn { transition: all 0.2s ease; }
      .btn:active { transform: scale(0.97); }
      .quick-card { transition: all 0.2s ease; }
      .quick-card:active { transform: scale(0.98); }
      .msg-bubble { animation: slideUp 0.3s ease; }
      @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .func-panel { animation: slideUp 0.2s ease; }
      .userinfo-page { animation: slideInRight 0.3s ease; }
      @keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
    `;
    document.head.appendChild(style);
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  initDarkMode();
  initPageAnimations();
  checkTutorial();
  executeDueInvestments();
  if (typeof releaseLockedFunds === 'function') releaseLockedFunds();
  if (typeof releasePendingRedemptions === 'function') releasePendingRedemptions();
  showWelcomeMessage();
  if (typeof initScheduledTransferEngine === 'function') initScheduledTransferEngine();

  // 手机端适配：键盘弹出时自动滚动
  const userInputEl = document.getElementById('userInput');
  if (userInputEl) {
    userInputEl.addEventListener('focus', function() {
      setTimeout(() => {
        scrollToBottom();
        const inputArea = document.querySelector('.input-area');
        if (inputArea) {
          inputArea.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      }, 300);
    });
  }

  // 窗口大小变化时重新调整（手机键盘弹出/收起）
  let originalHeight = window.innerHeight;
  window.addEventListener('resize', function() {
    if (Math.abs(window.innerHeight - originalHeight) > 100) {
      setTimeout(() => {
        scrollToBottom();
        const userInfoPage = document.getElementById('userInfoPage');
        if (userInfoPage && userInfoPage.classList.contains('show')) {
          const content = document.getElementById('userInfoContent');
          if (content) content.scrollTop = content.scrollHeight;
        }
      }, 100);
    }
  });

  // 防止双击缩放
  document.addEventListener('dblclick', function(e) {
    e.preventDefault();
  }, { passive: false });
});

