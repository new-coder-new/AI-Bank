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
function toggleBankBalance(btn) {
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
  { key: 'budget', label: '预算管理' },
  { key: 'installment', label: '账单分期' },
  { key: 'manualReviews', label: '复核审批' },
  { key: 'security', label: '安全中心' }
];

function renderFunctionSheet() {
  const body = document.getElementById('funcPanelBody');
  if (!body) return;
  const groupsHtml = FUNC_GROUPS.map(function (g) {
    // 每组按自身条目数决定列数（最多 4 列），避免 2/3 项时出现空位
    const cols = Math.max(2, Math.min(4, g.items.length));
    return '<section class="func-group">' +
      '<h4 class="func-group-title">' + g.title + '</h4>' +
      '<div class="func-grid" style="grid-template-columns:repeat(' + cols + ',1fr)">' + g.items.map(function (it) {
        return '<button class="func-tile" onclick="selectFunc(\'' + it.key + '\')">' +
          '<span class="func-tile-ico">' + bankIcon(it.icon, 20) + '</span>' +
          '<span class="func-tile-label">' + it.label + '</span></button>';
      }).join('') + '</div></section>';
  }).join('');

  // 未进主分组的原有能力，降级为一行文字入口，避免功能失去入口
  const moreHtml = '<section class="func-group">' +
    '<h4 class="func-group-title">更多</h4>' +
    '<div class="func-links">' + FUNC_MORE.map(function (it) {
      return '<button class="ui-link" onclick="selectFunc(\'' + it.key + '\')">' + it.label + '</button>';
    }).join('') + '</div></section>';

  body.innerHTML = groupsHtml + moreHtml;
}


// ========== 用户体验优化：新手教程 ==========
const tutorialSteps = [
  {
    title: ' 欢迎使用智能金融助手',
    desc: '这是一个AI驱动的金融助手，支持智能转账、理财、订阅管理、账单分析等功能。让我用30秒带你了解核心功能！',
    highlight: null
  },
  {
    title: ' 智能对话',
    desc: '在这里你可以用自然语言和AI对话，比如"给张三转账1000元"、"设置每月1号定时转账"。定时转账创建时需要用验证码确认。',
    highlight: '.chat-container'
  },
  {
    title: ' 全部服务',
    desc: '点击输入框左下角的+号，可以打开全部银行服务，分为转账、账单、卡片、理财、生活五组，底部还有一行「更多」入口。',
    highlight: '.func-btn'
  },
  {
    title: ' 语音输入',
    desc: '点击麦克风按钮，可以用语音输入指令，支持语音转账、查询余额等操作，识别后自动发送给AI处理。',
    highlight: '.voice-btn'
  },
  {
    title: ' 用户信息',
    desc: '点击右上角的用户头像，可以查看账户总览、基本信息、卡片贷款、交易记录、联系人等详细信息。',
    highlight: '.topbar-user-btn'
  },
  {
    title: ' 深色模式',
    desc: '顶部栏可以开始新对话；左侧菜单可以切换深色/浅色模式或查看使用手册。',
    highlight: '.agent-menu-btn'
  },
  {
    title: ' 开始使用',
    desc: '教程结束！现在你可以开始使用智能金融助手了。试试在输入框输入"你能做什么"，看看AI都能帮你做什么吧！',
    highlight: null
  }
];

let currentTutorialStep = 0;

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
function showToast(message, duration) {
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

// 显示使用手册
function showManual() {
  try {
    const existing = document.getElementById('manualOverlay');
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement('div');
    overlay.id = 'manualOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    const sections = [
      { title: '① 主菜单规则', items: [
        '主菜单只识别一级模块，先说功能名（如"转账"）打开二级菜单',
        '进入模块后再直接说需求，例如"给张三转账1000元"',
        '只读查询例外，可直接问："查一下余额" / "查信用卡额度" / "看交易记录"'
      ] },
      { title: '② 转账（含 AA / 定时）', items: [
        '"给张三转账1000元" → 是否添加备注 → 确认转账',
        '"转账给13800138000" → 补金额',
        '"明天下午3点转账给张三" → 补金额与钟点 → 是否重复',
        '"我和张三AA，我垫了600元" → 没有了（自己不用写进名单）',
        '金额支持中文与单位："一千五" / "1.5万" / "100百万"'
      ] },
      { title: '③ 账单分析', items: ['"分析本月账单" → 收支结构/支出构成/近 7 日趋势', '"查看异常交易" → 异常明细'] },
      { title: '④ 卡片管理', items: [
        '"办一张金卡，额度5万" → 再问主要用途',
        '"查看我的信用卡"',
        '"白金卡额度提到8万" → 80000 → 再问调整原因',
        '"6789的卡，单笔限额2万"（只改一项时另一项说"不变"）',
        '"挂失尾号6789的卡" → 确认挂失（需验证）'
      ] },
      { title: '⑤ 理财', items: [
        '产品编号：1001 稳健增利90天 / 1002 天天盈 / 1003 均衡配置 / 1004 安享三年 / 1005 成长先锋',
        '"申购1001，5000元"',
        '"有哪些理财产品" → 在售清单（默认收起，可展开）',
        '"做一次风险测评" / "查看持仓收益"'
      ] },
      { title: '⑥ 订阅管理', items: [
        '"订阅某易云年卡" → 选周期 → 是否自动续费 → 确认',
        '"能订哪些会员" → 可订阅清单（含已订阅标记）',
        '"取消所有订阅" → 一键全取消',
        '"某度网盘不续费了" → 管理自动续费'
      ] },
      { title: '⑦ 生日鲜花', items: [
        '入口：主菜单「今日提醒」里生日行的【订鲜花+蛋糕】（暂不提供其他入口按钮）',
        '"给林小雨订一束花" → 确认订单（收花人/花束/日期/贺卡）',
        '"查看鲜花订单" → 订单列表（待配送/已完成）',
        '联系人生日在「本月」时，系统自动锁定活期 ¥1000 作为鲜花预留，月末自动解冻'
      ] },
      { title: '⑧ 收尾与退出', items: [
        '完成/取消/退出后都会问："还需要办理其他 XX 业务吗？"',
        '回"需要"→ 打开该模块菜单；回"退出"→ 回到主菜单',
        '在某个模块里说别的模块业务，会提示"切换到 XX"或"退出"',
        '停在确认卡上时，其他输入只回"请完成上述操作。"'
      ] }
    ];

    let html = '<div style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">';
    html += '<div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:center;position:sticky;top:0;background:#fff;z-index:1;">';
    html += '<div style="font-size:18px;font-weight:700;color:#1a1a1a;"> 使用手册</div>';
    html += '<button onclick="document.getElementById(\'manualOverlay\').remove()" style="position:absolute;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#999;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;">×</button>';
    html += '</div>';
    html += '<div style="padding:20px 24px;">';
    html += '<div style="background:linear-gradient(135deg,#F2F6FC,#DFE9F7);border-radius:12px;padding:14px 16px;margin-bottom:20px;">';
    html += '<div style="font-size:14px;font-weight:600;color:#083A73;margin-bottom:4px;"> 智能金融助手</div>';
    html += '<div style="font-size:12px;color:#09407F;">先说模块、再办事：主菜单只判断你要用哪个功能，进入模块后再补信息。资金操作统一走确认与验证流程。</div>';
    html += '</div>';

    sections.forEach(function(sec) {
      html += '<div style="margin-bottom:18px;">';
      html += '<div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:10px;">' + sec.title + '</div>';
      html += '<div style="display:flex;flex-direction:column;gap:6px;">';
      sec.items.forEach(function(item) {
        html += '<div style="font-size:12px;color:#666;background:#f9fafb;padding:8px 12px;border-radius:8px;">' + item + '</div>';
      });
      html += '</div></div>';
    });

    html += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 16px;">';
    html += '<div style="font-size:13px;font-weight:600;color:#16a34a;margin-bottom:6px;"> 操作提示</div>';
    html += '<div style="font-size:12px;color:#15803d;line-height:1.8;">';
    html += '• 主菜单只列六个入口：转账 / 账单分析 / 卡片管理 / 理财 / 订阅管理 / 生日鲜花<br>';
    html += '• 二级菜单是「功能名 + 示例」文本，直接照示例说即可<br>';
    html += '• 演示验证码/交易密码统一为 <strong>123456</strong>；指纹验证模拟约 2 秒<br>';
    html += '• 定时转账创建需验证码，到期执行前可在“定时任务”里取消<br>';
    html += '• 点「是/否」后，问题下方会记录你的选择（如“是否添加备注：否”）<br>';
    html += '• 顶部栏可开始新对话；菜单可切换深色模式<br>';
    html += '• 数据保存在本地浏览器，刷新不丢失';
    html += '</div></div>';
    html += '</div></div>';

    overlay.innerHTML = html;
    document.body.appendChild(overlay);
  } catch (e) {
    alert('使用手册加载失败: ' + e.message);
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  initDarkMode();
  initPageAnimations();
  renderFunctionSheet();
  checkTutorial();
  executeDueInvestments();
  if (typeof releaseLockedFunds === 'function') releaseLockedFunds();
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

