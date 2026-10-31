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

/** 当前一级模块 */

/** 客户端 API 层（js/core/api.js） */

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

// —— 运行时动态挂载（window.__BANK_* / __API_* / __AGENT_* 等）——
interface Window {
  [key: string]: any;
}

// DOM 动态属性（现有代码直接用 .value/.disabled/.checked）
interface Element {
  value?: string;
  disabled?: boolean;
  checked?: boolean;
  files?: any;
  dataset?: any;
  style?: any;
}
interface EventTarget {
  value?: string;
  checked?: boolean;
  matches?: (s: string) => boolean;
}

// —— DOM 动态属性（现有代码直接读 .onclick/.focus/.closest/.getContext）——
interface Element {
  onclick?: any;
  focus?: () => void;
  closest?: (sel: string) => Element | null;
  getContext?: (type: string, opts?: any) => any;
  width?: number;
  height?: number;
  min?: string;
  max?: string;
  step?: string;
}

// —— 事件目标 ——
interface EventTarget {
  closest?: (sel: string) => Element | null;
  parentElement?: any;
}

// —— 跨文件函数（运行时由其它脚本提供）——
declare function runAgentWorkflow(...args: any[]): any;
declare function guideTimedNextStep(...args: any[]): any;

// 这三个全局在源码里也有声明（var），这里用 var 合并类型

// —— Function Calling 层（js/agent/agent-llm.ts，以 noCheck 转译）——
declare function agentLLMHandle(text: string): Promise<boolean>;
declare function agentLLMClearHistory(): void;
declare function agentLLMApprove(id: string): void;
declare function agentLLMReject(id: string): void;

// —— 金融知识库（js/agent/kb.ts，以 noCheck 转译）——
declare function agentKBHandle(text: string): Promise<boolean> | boolean;
declare function agentKBIsKnowledgeQuery(text: string): boolean;
declare function agentKBQuickAsk(text: string): any;
declare function agentKBAsk(text: string): any;

declare function guideStartCardApply(): void;
declare function renderServiceWelcome(): void;
declare var GUIDE_HOME_ENTRIES: any;
declare var GUIDE_SUB: any;
declare var GUIDE_CARD_APPLY: any;
declare var GUIDE_CARD_LIMIT: any;
declare var GUIDE_CARD_LOST: any;
declare var GUIDE_TXN_LIMIT: any;
declare var GUIDE_TRANSFER: any;
declare var GUIDE_AA: any;
declare var GUIDE_WEALTH: any;
declare var GUIDE_HOLDING: any;
declare var GUIDE_FLOWER: any;
declare var GUIDE_WRAPUP: any;
declare function guideOpenOverview(...args: any[]): any;
declare function guideOpenModuleMenu(...args: any[]): any;
declare function guideSwitchModuleTarget(...args: any[]): any;
declare function guideFlowLockedNotice(...args: any[]): any;
declare function guideStartWealthPurchase(...args: any[]): any;
declare function guideStartTxnLimit(...args: any[]): any;
declare function guideStartPhoneTransfer(...args: any[]): any;
declare function guideStartTimedTransfer(...args: any[]): any;
declare function guideStartAATransfer(...args: any[]): any;
declare function guideStartHoldings(...args: any[]): any;
declare function guideStartSubAdd(...args: any[]): any;
declare function guideStartSubManage(...args: any[]): any;
declare function guideStartSubAutoRenew(...args: any[]): any;
declare function guideStartSubCancel(...args: any[]): any;
declare function guideStartValentineFlower(...args: any[]): any;
declare function guideStartParentsDayFlower(...args: any[]): any;
declare function guideStartFlowerPreset(...args: any[]): any;
declare function guideStartFlowerForContact(...args: any[]): any;
declare function guideFlowerCake(...args: any[]): any;
declare function guideFlowerOrderTotal(...args: any[]): any;
declare function guideFlowerDateStr(...args: any[]): any;
declare function guideFlowerOrders(...args: any[]): any;
declare function guideFlowerSlot(...args: any[]): any;
declare function guideFlowerBouquet(...args: any[]): any;
declare function guideFlowerDisplayDate(...args: any[]): any;
declare function guideFlowerHoursLeft(...args: any[]): any;
declare function guideFlowerParse(...args: any[]): any;
declare function guideFlowerMissingPrompt(...args: any[]): any;
declare function guideFlowerContacts(...args: any[]): any;
declare function guideFlowerContactsText(...args: any[]): any;
declare function guideStartBirthdayFlower(...args: any[]): any;
declare function guideStartFlowerOrder(...args: any[]): any;
declare function guideFlowerDuplicate(...args: any[]): any;
declare function guideFlowerWarnDuplicate(...args: any[]): any;
declare function guideFlowerOrderCard(...args: any[]): any;
declare function guideFlowerSyncForm(...args: any[]): any;
declare function guideFlowerRefreshTotal(...args: any[]): any;
declare function guideFlowerConfirm(...args: any[]): any;
declare function guideFlowerPaySwitch(...args: any[]): any;
declare function guideStartFlowerList(...args: any[]): any;
declare function guideFlowerListToggle(...args: any[]): any;
declare function guideFlowerDeleteOrder(...args: any[]): any;
declare function guideFlowerModifyStart(...args: any[]): any;
declare function guideFlowerModifyConfirm(...args: any[]): any;
declare function guideFlowerModifySubmit(...args: any[]): any;
declare function guideFlowerCancelStart(...args: any[]): any;
declare function guideFlowerCancelSubmit(...args: any[]): any;
declare function guideFlowerCancelOp(...args: any[]): any;
declare function guideStartCardLimitAdjust(...args: any[]): any;
declare function guideStartCardLost(...args: any[]): any;
declare function guideServiceByKey(...args: any[]): any;
declare function guideIsReadOnlyQuery(...args: any[]): any;
declare function guideIsCardApplyPhrase(...args: any[]): any;
declare function guideLooksTimedTransfer(...args: any[]): any;
declare function guideIsSubRenewManagePhrase(...args: any[]): any;
declare function guideIsSubRenewOffPhrase(...args: any[]): any;
declare function guideIsSubCancelPhrase(...args: any[]): any;
declare function guideIsSubAddPlain(...args: any[]): any;
declare function guideIsSubAddPhrase(...args: any[]): any;
declare function guideIsHoldingsQuery(...args: any[]): any;
declare function guideIsCardListQuery(...args: any[]): any;
declare function guideIsCardLimitAdjustIntent(...args: any[]): any;
declare function guideIsBillAnalysisIntent(...args: any[]): any;
declare function guideIsFinalActionText(...args: any[]): any;
declare function guideNormalizeText(...args: any[]): any;
declare function guideIsMenuIntent(...args: any[]): any;
declare function guideResolveIntent(...args: any[]): any;
declare function guideResolveService(...args: any[]): any;
declare function guideIsContact(...args: any[]): any;
declare function guideContactNames(...args: any[]): any;
declare function guideLooksLikeNewTransfer(...args: any[]): any;
declare function guideIsWealthCatalogQuery(...args: any[]): any;
declare function guideIsSubCatalogQuery(...args: any[]): any;
declare function guideIsAllProductsIntent(...args: any[]): any;
declare function guideSubFindService(...args: any[]): any;
declare var GUIDE_SERVICES: any;
declare var GUIDE_SHOW_OVERVIEW: any;
declare var GUIDE_SERVICE_KEYWORDS: any;
declare var GUIDE_SUB_KEYWORDS: any;
declare function guideAIRouteIntent(...args: any[]): any;
declare function guideAIFirstEnabled(...args: any[]): any;
declare function guideAIFirstSkipped(...args: any[]): any;
declare function guideAIIntent(...args: any[]): any;
declare function guideAIIntentExtract(...args: any[]): any;
declare function guideTransferAIExtract(...args: any[]): any;
declare function guideTransferAIFallback(...args: any[]): any;
declare function guideLLMJson(...args: any[]): any;
declare function guideAISlots(...args: any[]): any;
declare function guideTimedAIExtract(...args: any[]): any;
declare function guideAAAIExtract(...args: any[]): any;
declare function guideAAAIHasMore(...args: any[]): any;
declare function guideCardApplyAIType(...args: any[]): any;
declare function guideTxnLimitAIFlag(...args: any[]): any;
declare function guideTxnLimitAILimits(...args: any[]): any;
declare function guideHoldingAIIntent(...args: any[]): any;
declare function guideSubAIFlag(...args: any[]): any;
declare function guideSubAIExtract(...args: any[]): any;
declare var GUIDE_INTENT_MODULES: any;
declare function guideChip(...args: any[]): any;
declare function guideChipsDone(...args: any[]): any;
declare function guideTryActionableCommand(...args: any[]): any;
declare function guideMainModuleGuess(...args: any[]): any;
declare function guideExplicitSubCommand(...args: any[]): any;
declare function guideHasBusinessEntity(...args: any[]): any;
declare function guideSlotsComplete(...args: any[]): any;
declare function guidePickSub(...args: any[]): any;
declare function guideBackToMenu(...args: any[]): any;
declare function guideExitSilently(...args: any[]): any;
declare function guideAwaitingFinalAction(...args: any[]): any;
declare function guideCancelPendingScheduled(...args: any[]): any;
declare function guideSayInvalid(...args: any[]): any;
declare function guideEscapeText(...args: any[]): any;
declare function guideIsNegativeAmount(...args: any[]): any;
declare function guidePlainMoney(...args: any[]): any;
declare function guidePad2(...args: any[]): any;
declare function guideDateStr(...args: any[]): any;
declare function guideOffsetDate(...args: any[]): any;
declare function guideMonthDayDate(...args: any[]): any;
declare function guideUnknownPayeeNotice(...args: any[]): any;
declare function guideConfirmCardDone(...args: any[]): any;
declare function guideConfirmCardCollapse(...args: any[]): any;
declare function guidePhoneResolvePayee(...args: any[]): any;
declare function guidePeriodQuestion(...args: any[]): any;
declare function guideCommitTransfer(...args: any[]): any;
declare function guideEsc(...args: any[]): any;
declare function guidePickCardFromText(...args: any[]): any;
declare function showCardLimitRecords(...args: any[]): any;
declare function guideTxnLimitFlagText(...args: any[]): any;
declare function guideTxnLimitValue(...args: any[]): any;
declare function guideTxnLimitFlag(...args: any[]): any;
declare function guideTxnLimitNightQuestion(...args: any[]): any;
declare function guideTxnLimitPickHtml(...args: any[]): any;
declare function guideTxnLimitAskLimits(...args: any[]): any;
declare function guideTxnLimitPickCard(...args: any[]): any;
declare function guideTypingBubble(...args: any[]): any;
declare function guideTxnLimitStep(...args: any[]): any;
declare function guideTxnLimitCurrentValues(...args: any[]): any;
declare function guideTxnLimitConfirm(...args: any[]): any;
declare function guideTxnLimitSubmit(...args: any[]): any;
declare function guideTxnLimitCancel(...args: any[]): any;
declare function guideCollapseLatestChips(...args: any[]): any;
declare function guideCollapseCardNote(...args: any[]): any;
declare function guideCollapseChoiceChips(...args: any[]): any;
declare function guideTimedAskRepeat(...args: any[]): any;
declare function guideTimedRepeatChoose(...args: any[]): any;
declare function guideParseSimpleAmount(...args: any[]): any;
declare function guideTimedPhraseIntent(...args: any[]): any;
declare function guideAAPhraseIntent(...args: any[]): any;
declare function guideTimedExtract(...args: any[]): any;
declare function guideTransferParse(...args: any[]): any;
declare function guideTransferHandleRemarkStage(...args: any[]): any;
declare function guideTransferStep(...args: any[]): any;
declare function guideTransferAskRemark(...args: any[]): any;
declare function guideTransferRemarkChoice(...args: any[]): any;
declare function guideTimedMissingPrompt(...args: any[]): any;
declare function guideTimedParseRepeat(...args: any[]): any;
declare function guideTimedRepeatLabel(...args: any[]): any;
declare function guideTimedWhenText(...args: any[]): any;
declare function guideTimedStep(...args: any[]): any;
declare function guideTimedConfirm(...args: any[]): any;
declare function guideTransferConfirm(...args: any[]): any;
declare function guideAAParse(...args: any[]): any;
declare function guideAAPushParticipant(...args: any[]): any;
declare function guideAAAddNames(...args: any[]): any;
declare function guideAAPickPrompt(...args: any[]): any;
declare function guideAAPick(...args: any[]): any;
declare function guideAAMore(...args: any[]): any;
declare function guideAANoMore(...args: any[]): any;
declare function guideAAConfirm(...args: any[]): any;
declare function guideAAConfirmCardHtml(...args: any[]): any;
declare function guideAAConfirmDoneHtml(...args: any[]): any;
declare function guideAACancel(...args: any[]): any;
declare function guideAASubmit(...args: any[]): any;
declare function guideAAStep(...args: any[]): any;
declare function guideWealthProfile(...args: any[]): any;
declare function guideWealthValidProfile(...args: any[]): any;
declare function guideWealthTerm(...args: any[]): any;
declare function guideWealthRecommendations(...args: any[]): any;
declare function guideWealthProductCode(...args: any[]): any;
declare function guideWealthCodeCandidate(...args: any[]): any;
declare function guideWealthFindByCode(...args: any[]): any;
declare function guideWealthExplicitCode(...args: any[]): any;
declare function guideWealthProductLine(...args: any[]): any;
declare function guideWealthShowAllProducts(...args: any[]): any;
declare function guideWealthProductListHtml(...args: any[]): any;
declare function guideWealthAccountTail(...args: any[]): any;
declare function guideWealthProdRow(...args: any[]): any;
declare function guideWealthProductsHtml(...args: any[]): any;
declare function guideWealthProductsToggle(...args: any[]): any;
declare function guideWealthShowRecommendations(...args: any[]): any;
declare function guideWealthStartAssess(...args: any[]): any;
declare function guideWealthCancelAssess(...args: any[]): any;
declare function guideWealthFindProduct(...args: any[]): any;
declare function guideWealthParse(...args: any[]): any;
declare function guideWealthStep(...args: any[]): any;
declare function guideWealthConfirm(...args: any[]): any;
declare function guideWealthRiskProceed(...args: any[]): any;
declare function guideWealthRiskCancel(...args: any[]): any;
declare function guideWealthSubmit(...args: any[]): any;
declare function guideWealthCancel(...args: any[]): any;
declare function guideWealthAIProduct(...args: any[]): any;
declare function guideHoldingList(...args: any[]): any;
declare function guideHoldingAccountTail(...args: any[]): any;
declare function guideHoldingCode(...args: any[]): any;
declare function guideHoldingFind(...args: any[]): any;
declare function guideHoldingAmount(...args: any[]): any;
declare function guideHoldingTermDays(...args: any[]): any;
declare function guideHoldingClosed(...args: any[]): any;
declare function guideHoldingChoose(...args: any[]): any;
declare function guideHoldingAllRedeemIntent(...args: any[]): any;
declare function guideHoldingStep(...args: any[]): any;
declare function guideHoldingSubConfirm(...args: any[]): any;
declare function guideHoldingSubSubmitAsRisk(...args: any[]): any;
declare function guideHoldingSubSubmit(...args: any[]): any;
declare function guideHoldingRedeemConfirm(...args: any[]): any;
declare function guideHoldingRedeemSubmit(...args: any[]): any;
declare function guideHoldingRedeemAllConfirm(...args: any[]): any;
declare function guideHoldingRedeemAllSubmit(...args: any[]): any;
declare function guideHoldingModify(...args: any[]): any;
declare function guideHoldingCancel(...args: any[]): any;
declare function guideSubActive(...args: any[]): any;
declare function guideSubNormName(...args: any[]): any;
declare function guideSubCycleText(...args: any[]): any;
declare function guideSubHistoryList(...args: any[]): any;
declare function guideSubParseCycle(...args: any[]): any;
declare function guideSubYesNo(...args: any[]): any;
declare function guideSubShowCatalog(...args: any[]): any;
declare function guideSubPresetRows(...args: any[]): any;
declare function guideSubAddStep(...args: any[]): any;
declare function guideSubAddRenewChoice(...args: any[]): any;
declare function guideSubAddConfirm(...args: any[]): any;
declare function guideSubAddSubmit(...args: any[]): any;
declare function guideSubChoose(...args: any[]): any;
declare function guideSubManageStep(...args: any[]): any;
declare function guideSubManageConfirm(...args: any[]): any;
declare function guideSubManageSubmit(...args: any[]): any;
declare function guideSubCancelStep(...args: any[]): any;
declare function guideSubCancelSubmit(...args: any[]): any;
declare function guideSubCancelAllStart(...args: any[]): any;
declare function guideSubCancelAllSubmit(...args: any[]): any;
declare function guideSubCancelAllOp(...args: any[]): any;
declare function guideSubCancelOp(...args: any[]): any;
declare function guideSubSession(...args: any[]): any;
declare function guideDaysUntilMonthDay(...args: any[]): any;
declare function guideNthSundayNext(...args: any[]): any;
declare function guideEnsureBirthdayHold(...args: any[]): any;
declare function guideHomeRemindersHtml(...args: any[]): any;
declare function guideNearestBirthday(...args: any[]): any;
declare function guideUpcomingBirthdays(...args: any[]): any;
declare function guideFlowerOrderStep(...args: any[]): any;
declare function guideFlowerSubmit(...args: any[]): any;
declare function guideFlowerSession(...args: any[]): any;
declare function guideCardApplyTypesText(...args: any[]): any;
declare function guideCardApplyPurposesText(...args: any[]): any;
declare function guideCardApplyParse(...args: any[]): any;
declare function guideCardApplyMissingPrompt(...args: any[]): any;
declare function guideCardApplyMoney(...args: any[]): any;
declare function guideCardApplyStep(...args: any[]): any;
declare function guideCardApplyConfirm(...args: any[]): any;
declare function guideCardApplySubmit(...args: any[]): any;
declare function guideCardApplyCancel(...args: any[]): any;
declare function guideCardApplyRecords(...args: any[]): any;
declare function guideCardLimitState(...args: any[]): any;
declare function guideCardLimitCards(...args: any[]): any;
declare function guideCardLabel(...args: any[]): any;
declare function guideCardLimitPickCardHtml(...args: any[]): any;
declare function guideCardLimitPickCard(...args: any[]): any;
declare function guideCardLimitParse(...args: any[]): any;
declare function guideCardLimitStep(...args: any[]): any;
declare function guideCardLimitConfirm(...args: any[]): any;
declare function guideCardLimitSubmit(...args: any[]): any;
declare function guideCardLimitCancel(...args: any[]): any;
declare function guideCardLimitAIReason(...args: any[]): any;
declare function guideCardLostCards(...args: any[]): any;
declare function guideCardLostStep(...args: any[]): any;
declare function guideCardLostSubmit(...args: any[]): any;
declare function guideCardLostApply(...args: any[]): any;
declare function guideCardLostCollapse(...args: any[]): any;
declare function guideCardLostCancel(...args: any[]): any;
