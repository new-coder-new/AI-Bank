// ==========================================================================
//  引导层会话状态：GUIDE_* 状态、模块作用域、流程锁与重置
//  源码：js/core/session.ts　→　编译：build/js/core/session.js（经典脚本，无 import/export）
//  对外入口：guideAbortPendingPlans / guideResetAllSessions / guideModuleMenuHint / guideModuleLabel 等
//  类型：tsc 严格模式检查；对外符号统一在 types/global.d.ts 声明
// ==========================================================================
// 引导层会话状态（TypeScript 源文件）
// 说明：从原单体引导层拆出的「会话状态 + 公共状态管理」模块。
// 运行形态仍是经典脚本（无 import/export），由 `npm run build:ts` 编译为 js/core/session.js，
// 其它脚本通过全局变量/函数直接引用；类型只在本文件内生效。

// —— 运行时由其它脚本提供的全局 ——
declare var currentModule: string;
declare var AGENT_PENDING_PLANS: Record<string, any>;
declare function guideServiceByKey(key: string): any;
declare function guideFlowLockedNotice(extra?: string): void;

/** 会话状态：结构随流程变化，统一按 any 处理 */
var GUIDE_WRAPUP: any = null;   // 业务完成后的「是否继续」待答状态
var GUIDE_TRANSFER: any = null;
var GUIDE_AA: any = null;
var GUIDE_WEALTH: any = null;
var GUIDE_CARD_APPLY: any = null;
var GUIDE_CARD_LIMIT: any = null;
var GUIDE_TXN_LIMIT: any = null;
var GUIDE_CARD_LOST: any = null;
var GUIDE_HOLDING: any = null;
var GUIDE_SUB: any = null;
var GUIDE_FLOWER: any = null;

var GUIDE_MODULE_LABELS: Record<string, string> = {
  chat: '主菜单', transfer: '转账', bill: '账单分析', card: '卡片管理',
  wealth: '理财', sub: '订阅管理', flower: '生日鲜花'
};

// 退出时清理「待确认」的计划：标记取消并收起卡片，避免确认卡守卫继续拦截后续输入
function guideAbortPendingPlans(): void {
  try {
    var plans: any = (typeof AGENT_PENDING_PLANS === 'object' && AGENT_PENDING_PLANS) ? (AGENT_PENDING_PLANS as any) : null;
    if (plans) {
      Object.keys(plans).forEach(function (k: string) {
        var rec = plans[k];
        if (!rec || rec.status !== 'pending') return;
        rec.status = 'cancelled';
        var footer = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById(k + '-footer') : null;
        if (footer) footer.innerHTML = '<div class="agent-reject-card">已取消，本次未发生任何交易。</div>';
      });
    }
    if (typeof window !== 'undefined' && (window as any).__pendingScheduledTransfers) {
      Object.keys((window as any).__pendingScheduledTransfers).forEach(function (c) {
        (window as any).__pendingScheduledTransfers[c] = null;
      });
    }
  } catch (e) { /* 清理失败不影响退出 */ }
}

function guideResetAllSessions(): void {
  GUIDE_TRANSFER = null;
  GUIDE_AA = null;
  GUIDE_WEALTH = null;
  GUIDE_CARD_APPLY = null;
  GUIDE_CARD_LIMIT = null;
  GUIDE_TXN_LIMIT = null;
  GUIDE_CARD_LOST = null;
  GUIDE_HOLDING = null;
  GUIDE_SUB = null;
  GUIDE_FLOWER = null;
  if (typeof window !== 'undefined') (window as any).__pendingScheduledTransfers = {};
  GUIDE_WRAPUP = null;
}

// 一级模块起始页（只停在二级菜单、没有进行中流程）时，乱说一句应按本模块提示
function guideModuleMenuHint(module?: string): string {
  try {
    var key = module || currentModule;
    if (!key || key === 'chat') return '';
    if (key === 'sub') {
      return '<p>请选择订阅管理里的操作：</p>' +
        '<p class="guide-tip">我的订阅 / 可订阅会员 / 添加订阅 / 管理自动续费 / 取消订阅。</p>';
    }
    if (key === 'flower') {
      return '<p>请选择生日鲜花里的操作：</p>' +
        '<p class="guide-tip">订鲜花+蛋糕 / 查看鲜花订单 / 生日提醒。</p>';
    }
    var svc = (typeof guideServiceByKey === 'function') ? guideServiceByKey(key) : null;
    if (!svc || !svc.subs || !svc.subs.length) return '';
    var names = svc.subs.map(function (x: any) { return x.label; }).join(' / ');
    return '<p>请选择' + guideModuleLabel(key) + '里的操作：</p>' +
      '<p class="guide-tip">' + names + '。</p>';
  } catch (e) { return ''; }
}

function guideModuleLabel(key: string): string {
  return GUIDE_MODULE_LABELS[key] || '当前模块';
}

// 当前正在进行的对话流程（没有则返回空串）——用于「流程锁」：没走完就不许换功能 / 重开一单
function guideActiveFlowLabel(): string {
  if (GUIDE_TRANSFER) {
    if (GUIDE_TRANSFER.kind === 'timed') return '定时转账';
    if (GUIDE_TRANSFER.kind === 'phone') return '手机号转账';
    if (GUIDE_TRANSFER.kind === 'bank') return '银行卡转账';
    return '姓名转账';
  }
  if (GUIDE_AA) return 'AA 收款';
  if (GUIDE_WEALTH) return '理财申购';
  if (GUIDE_CARD_APPLY) return '信用卡申请';
  if (GUIDE_CARD_LIMIT) return '额度调整';
  if (GUIDE_TXN_LIMIT) return '交易限制设置';
  if (GUIDE_CARD_LOST) return '卡片挂失';
  if (GUIDE_HOLDING) return '持仓管理';
  // 订阅：只有进了子模块才加锁，停在「请选择操作」不算进行中
  if (GUIDE_SUB && /^(add|cancel|manage|cancel-all)$/.test(String(GUIDE_SUB.mode || ''))) return '订阅管理';
  // 鲜花：只看订单列表不算「进行中流程」；改单/取消才算
  if (GUIDE_FLOWER && /^(order|modify|cancel)$/.test(String(GUIDE_FLOWER.mode || ''))) return '鲜花订购';
  return '';
}

// 会话步骤统一执行：步骤返回 false（表示没接住）时不交给主链路，而是提示先完成当前流程
function guideLockedRun(fn: () => any): boolean | Promise<boolean> {
  var r = fn();
  if (r && typeof r.then === 'function') {
    return r.then(function (v: any) {
      if (v === false) guideFlowLockedNotice();
      return true;
    });
  }
  if (r === false || r === undefined || r === null) guideFlowLockedNotice();
  return true;
}
