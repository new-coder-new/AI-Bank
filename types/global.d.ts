// 全局类型声明：只为现有「经典脚本 + 全局变量」结构提供编辑器提示与类型检查基础。
// 迁 TS 时可逐步把这些声明换成真实类型来自动生成/手写。

interface BankContact {
  name: string;
  phone?: string;
  phoneFull?: string;
  account?: string;
  bank?: string;
  relation?: string;
  birthday?: string;
  address?: string;
}

interface BankDebitCard {
  number?: string;
  bank?: string;
  branch?: string;
  status?: string;
  balance?: number;
  available?: number;
  frozen?: number;
  todayIncome?: number;
  todayExpense?: number;
  frozenItems?: Array<{ id: string; type: string; reason?: string; amount: number; freezeDate?: string; releaseDate?: string; status?: string }>;
}

interface BankCreditCard {
  id?: string;
  cardType?: string;
  tail?: string;
  limit?: number;
  used?: number;
  available?: number;
  purpose?: string;
  status?: string;
  issuedAt?: string;
  isFrozen?: boolean;
}

interface BankTxn {
  type: 'income' | 'expense' | string;
  amount: number;
  desc: string;
  time?: string;
  channel?: string;
}

interface BankHolding {
  name: string;
  amount: number;
  cost?: number;
  profit?: number;
  profitRate?: number;
  buyDate?: string;
  status?: string;
  riskLevel?: number;
}

interface BankManualReview {
  id: string;
  purpose: string;
  amount: number;
  status: '待人工复核' | '已通过' | '已拒绝' | '审批失败' | '部分执行' | string;
  submittedAt?: string;
  reviewedAt?: string;
  source?: string;
  note?: string;
  actions?: Array<{ tool: string; args: Record<string, unknown> }>;
}

interface BankUserProfile {
  name?: string;
  level?: string;
  phone?: string;
  debitCard: BankDebitCard;
  creditCard?: Record<string, any>;
  creditCards?: BankCreditCard[];
  holdings?: BankHolding[];
  recentTxns?: BankTxn[];
  transferHistory?: Array<Record<string, any>>;
  scheduledTransfers?: Array<Record<string, any>>;
  flowerOrders?: Array<Record<string, any>>;
  cardApplications?: Array<Record<string, any>>;
  manualReviews?: BankManualReview[];
  pendingRedemptions?: Array<Record<string, any>>;
  txnLimit?: { single?: number; daily?: number; night?: string; overseas?: string };
  budgets?: Record<string, number>;
  [key: string]: any;
}

interface MockData {
  contacts: BankContact[];
  products: Array<Record<string, any>>;
  subscriptions: Array<Record<string, any>>;
  userProfile: BankUserProfile;
  bills?: Record<string, any>;
  [key: string]: any;
}

/** 前端内存中的账户数据（启动时由 /api/snapshot 注入，localStorage 仅作缓存） */
declare let mockData: MockData;

/** 当前一级模块 */
declare let currentModule: 'chat' | 'transfer' | 'bill' | 'card' | 'wealth' | 'sub' | 'flower' | 'userinfo' | string;

/** 客户端 API 层（js/core/api.js） */
declare const API: {
  base: string;
  enabled: boolean;
  live: boolean;
  token: string;
  verifyToken: string;
  verifyExp: number;
  pending: unknown[];
};

declare function apiRequest<T = any>(method: string, path: string, body?: unknown): Promise<T>;
declare function bankFetch(url: string, options?: RequestInit, timeoutMs?: number): Promise<Response>;

/** 消息与渲染 */
declare function appendMessage(html: string): void;
declare function guideMessage(html: string): string;
declare function guideAsk(html: string): void;
declare function scrollToBottom(): void;
declare function showToast(message: string, duration?: number): void;
declare function escapeHtml(v: unknown): string;
declare function saveUserData(): void;
declare function addTransaction(type: string, amount: number, desc: string, channel?: string, deduct?: boolean): boolean | void;

/** 引导流（js/flows/guide.js 及子模块） */
declare function guideHandleText(text: string): Promise<boolean>;
declare function guideStartNameTransfer(): void;
declare function guideOpenService(key: string): void;
declare function guideResetAllSessions(): void;
declare function guideModuleWrapUp(module: string): void;

/** Agent 工具层（js/agent/agent.js） */
declare function callAgentTool(tool: string, args?: Record<string, unknown>): Promise<any>;
declare function agentTransferFlow(payee: string, amount: number, rawText?: string, channel?: string, opts?: Record<string, any>): Promise<any>;
declare function agentTransferTier(amount: number, risk?: any): { key: string; name: string; rank: number; needConfirm: boolean; needPassword: boolean; needOtp: boolean; needFace: boolean; needVerify: boolean; needManual: boolean };

/** 安全验证 */
declare function showSecurityVerification(purpose: string, callback: (ok: boolean) => void): void;
declare function showOtpVerification(purpose: string, callback: (ok: boolean) => void): void;
declare function showFaceVerification(purpose: string, callback: (ok: boolean) => void): void;
declare function requestFundVerify(): Promise<any>;
declare function verifyAmountRisk(amount: number, purpose: string, actions?: any[]): Promise<{ ok: boolean; tier?: any; pendingReview?: boolean }>;
