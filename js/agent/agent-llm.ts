// ==========================================================================
//  AI Banking Agent · Function Calling 层（TypeScript 源码）
//  编译产物：js/agent/agent-llm.js（经典脚本，无 import/export）
//  说明：模型返回的 JSON（tool_calls / message）结构自由，本文件以 any 承载；
//        类型重点放在状态机与确认卡参数上。
// ==========================================================================

// ==========================================================================
//  AI Banking Agent · Function Calling 层
//  链路：意图识别 → 用户记忆 → 风险判断 → Agent 规划器 → 工具调用 → 执行结果 → 用户确认
//  说明：本文件把 AGENT_TOOL_REGISTRY 里的原子工具翻译成模型可调用的 function schema，
//        由模型自己决定「调哪个工具、按什么顺序调」，而不是由正则押送。
//        模型不可用时静默降级回 agent.js 的规则/场景层，保证离线也能演示。
// ==========================================================================

// ------------------------------ 0. 模型配置与可用性 ------------------------------
var AGENT_LLM_TOOLS_OK = true;      // 模型是否支持 function calling
var AGENT_LLM_MAX_ROUNDS = 6;       // 单次请求最多几轮「思考 → 调工具」
var AGENT_LLM_MAX_TOKENS = 2048;    // 单轮最大输出 token：推理型模型会先消耗 reasoning token，需留足余量
var AGENT_LLM_BUSY = false;         // 防重入

function agentLLMConfig(): any {
  var cfg = { url: '', key: '', model: 'deepseek-chat' };
  try {
    if (typeof DEEPSEEK_API_URL !== 'undefined' && DEEPSEEK_API_URL) cfg.url = DEEPSEEK_API_URL;
    if (typeof DEEPSEEK_API_KEY !== 'undefined' && DEEPSEEK_API_KEY) cfg.key = DEEPSEEK_API_KEY;
    // 走同源代理时不需要浏览器 Key
    if (!cfg.key && typeof window !== 'undefined' && window.__BANK_AI_PROXY__) cfg.key = 'proxy';
    if (typeof MODEL_NAME !== 'undefined' && MODEL_NAME) cfg.model = MODEL_NAME;
  } catch (e) { /* 配置未就绪 */ }
  return cfg;
}

function agentLLMAvailable(): boolean {
  var c = agentLLMConfig();
  return !!(c.url && c.key);
}

// 本地快速闸门：明显是闲聊/寒暄的消息不进入 Agent 链路，避免无谓的模型消耗
function agentLLMShouldAttempt(text: string): boolean {
  var t = String(text || '').trim();
  if (!t) return false;
  if (/^(你好|您好|hi|hello|嗨|哈喽|在吗|谢谢|多谢|再见|你叫什么|你是谁|早上好|晚上好)[！!。.？?~\s]*$/i.test(t)) return false;
  if (t.length <= 3 && !/\d/.test(t)) return false;
  // 含指代词的消息必须进上下文链路，否则模型看不到上文
  if (typeof agentCtxHasReference === 'function' && agentCtxHasReference(t)) return true;
  // 金融知识类提问（概念/区别/怎么办）也交给模型 + RAG
  if (typeof agentKBIsKnowledgeQuery === 'function' && agentKBIsKnowledgeQuery(t)) return true;
  // 资金安排场景
  if (typeof agentIsScenarioQuery === 'function' && agentIsScenarioQuery(t)) return true;
  return /转|账|余额|卡|额度|挂失|理财|基金|赎回|申购|持仓|收益|投资|配置|订阅|会员|续费|扣费|预算|账单|消费|花|支出|收入|工资|资产|生日|鲜花|蛋糕|礼物|出差|旅行|旅游|异常|可疑|现金流|结余|帮我|查|看看|分析|安排|计划|规划|设置|取消|优化|体检|多少钱|还剩|买|购|分期|画像|标签|健康|评分|存|攒|目标|适合|推荐|建议|套现|炒股|杠杆|负债|欠款|借款|存款|定期|活期|余额宝|货币基金|债券|国债|保险|利率|年化|通胀|征信|逾期|月供|风险等级|应急|备用金|储蓄率|区别|是什么|什么意思|哪个好|怎么选|保本|安全吗|闲钱|放哪|亏了|跌了|下跌|回撤|通货膨胀|涨价|物价|CPI|货币政策|降准|降息|加息|宽松|紧缩|经济周期|衰退|萧条|大额存单|存单|房贷|按揭|消费贷|信用贷|操作风险|诈骗|盗刷|影响|为什么|原因/.test(t);
}

// ------------------------------ 1. 工具 schema ------------------------------
function agentToolApiName(name: string): string { return String(name).replace(/\./g, '__'); }
function agentToolOrigName(apiName: string): string { return String(apiName).replace(/__/g, '.'); }

// 每个工具的参数规格（供模型理解如何传参）。required 写在参数对象内部。
var AGENT_TOOL_SPECS: Record<string, any> = {
  'account.balance': { group: '账户', desc: '查询借记卡可用余额、冻结金额与资产总览', params: {} },
  'account.frozenDetail': { group: '账户', desc: '查询冻结金额明细：每笔冻结的类型、原因、金额、冻结时间与预计解冻日期。当用户问"冻结金额明细/为什么被冻结/什么时候解冻/解冻后可用余额"时调用', params: {} },
  'contact.list': { group: '转账', desc: '查询转账联系人列表（姓名、开户行、卡号）', params: {} },
  'contact.add': { group: '转账', desc: '新增转账联系人，需要姓名与银行卡号，可选开户银行', params: { name: { type: 'string', description: '联系人姓名', required: true }, account: { type: 'string', description: '银行卡号', required: true }, bank: { type: 'string', description: '开户银行' } } },
  'account.profile': { group: '账户', desc: '读取用户画像：风险等级、家庭成员、理财目标、常用收款人', params: {} },
  'account.financeOverview': { group: '账户', desc: '生成完整财务全景：收入、支出、月结余、储蓄率、总资产、风险等级、支出结构。当用户问"我的财务情况/我最近财务状况/帮我看看财务"时优先调用它', params: {} },
  'account.profileAnalysis': { group: '账户', desc: '生成深度用户画像分析：客户标签、财务健康评分（四维）、生命周期阶段、带理由的个性化服务推荐。当用户问"分析我的画像/我是什么类型的客户/适合我的服务/根据我的情况推荐"时调用', params: {} },
  'account.healthScore': { group: '账户', desc: '生成财务健康评分（储蓄能力/消费稳定性/负债压力/风险水平）与生命周期建议', params: {} },
  'risk.detect': { group: '风险', desc: '识别高危金融行为：高杠杆、信用资金投资（套现炒股）、过度负债、资产集中、资金压力、涉诈通道。用户表达"我要套信用卡炒股/借钱投资/全部买入"等意图时应先调用它，并根据结果拒绝执行并给出替代建议', params: { text: { type: 'string', description: '用户原文', required: true }, amount: { type: 'number', description: '涉及金额（元）' } } },
  'decision.purchaseAdvice': { group: '决策', desc: '分析一笔消费是否值得买：综合可用余额、月收入、月结余、信用卡额度与预算水位，输出"是否建议购买"。当用户问"我想买X元的东西，能买吗/负担得起吗"时调用', params: { amount: { type: 'number', description: '消费金额（元）', required: true }, text: { type: 'string', description: '消费描述，如 8000元的电脑' } } },
  'decision.installmentAdvice': { group: '决策', desc: '评估分期付款方案：给出是否建议分期、推荐期数、月供、手续费与风险提示。当用户问"建议分期吗/分几期划算"时调用', params: { amount: { type: 'number', description: '消费金额（元）', required: true }, text: { type: 'string', description: '消费描述' } } },
  'plan.goal': { group: '规划', desc: '跨场景目标规划：理解储蓄与消费目标（如"一年存10万，同时旅游和买电脑"），输出月度预算、储蓄计划、里程碑与建议。当用户提出多目标或长期目标时调用', params: { text: { type: 'string', description: '用户的完整目标描述', required: true } } },

  'kb.search': { group: '知识', desc: '检索金融知识库，覆盖五大类：①宏观金融（通货膨胀/CPI/利率/存贷款利率变化原因/货币政策/加息降息影响/经济周期）②银行业务（活期存款/定期存款/大额存单/信用卡/贷款/房贷/消费贷/分期）③投资理财（货币基金/银行理财/基金/股票/债券/R1~R5风险等级）④金融风险（信用/市场/流动性/操作/杠杆）⑤个人财务规划（消费管理/储蓄规划/资产配置/应急资金/风险承受能力）。返回内容含 points 要点、why 原因、impact 对个人影响、fit 适合人群、advices 建议。当用户在问金融概念、产品区别、"为什么XX"、"XX有什么影响"、某产品怎么样、基金跌了怎么办、要不要买某产品时**必须**先调用它拿到标准知识，再结合用户数据组织"基础解释→原因分析→对用户影响→处理建议"的答复，不要凭记忆编造', params: { query: { type: 'string', description: '用户的原始问题', required: true } } },
  'scenario.allocate': { group: '知识', desc: '资金安排场景推理：按金额、使用期限、用途与风险偏好给出分层配置建议。当用户说"我有X万闲钱，Y后要用，怎么安排/怎么配置/放哪里"时调用。若用户未说明期限，应先用一句反问确认期限', params: { text: { type: 'string', description: '用户的完整描述，需包含金额与期限', required: true } } },

  'account.transactions': { group: '账户', desc: '查询近期交易明细，可按收/支类型筛选', params: { type: { type: 'string', enum: ['income', 'expense'], description: '交易类型，不传返回全部' } } },

  'bill.monthSummary': { group: '账单', desc: '汇总本月收入、支出与结余', params: {} },
  'bill.categoryStats': { group: '账单', desc: '按月统计消费分类金额并排序，用于分析钱花在哪', params: {} },
  'bill.detectAbnormal': { group: '账单', desc: '检测大额、凌晨时段、可疑渠道等异常交易', params: {} },
  'bill.trend': { group: '账单', desc: '对比本月支出与近 3 个月均值，并归因主要增长分类', params: {} },

  'subscription.list': { group: '订阅', desc: '读取全部订阅/自动续费清单及月均支出', params: {} },
  'subscription.scan': { group: '订阅', desc: '扫描未来 7 天内的扣费时间点，并识别近 3 个月使用频率偏低的订阅', params: {} },
  'subscription.cancel': { group: '订阅', desc: '取消指定订阅，停止后续自动扣费。属于账户变更操作，系统会先请用户确认', params: { id: { type: 'integer', description: '订阅 ID，从 subscription.list 的结果中获取' }, name: { type: 'string', description: '订阅名称，不知道 ID 时可用名称模糊匹配' } } },

  'transfer.resolvePayee': { group: '转账', desc: '在通讯录中查找收款人并返回开户行与卡号；查不到说明是新联系人', params: { payee: { type: 'string', description: '收款人姓名或手机号', required: true } } },
  'transfer.execute': { group: '转账', desc: '向指定收款人执行转账。属于资金操作，系统会先请用户确认', params: { payee: { type: 'string', description: '收款人姓名', required: true }, amount: { type: 'number', description: '转账金额（元）', required: true }, channel: { type: 'string', description: '转账渠道，默认智能转账' } } },

  'card.overview': { group: '卡片', desc: '读取信用卡额度、已用额度、可用额度、本期账单与到期还款日', params: {} },
  'card.limitDetail': { group: '卡片', desc: '查询信用卡额度的三层字段：申请额度、审批额度、当前生效额度，以及已用额度、可用额度、本期账单和数据更新时间。当用户问「我的信用卡额度是多少/申请额度/审批额度/生效额度/总额度/可用额度」时必须调用它，不得凭空回答或要求用户验证卡号', params: {} },
  'card.adjustLimit': { group: '卡片', desc: '申请调整信用卡额度（提额/降额）。会记录申请额度并进入「审批中」状态，不会直接改生效额度。当用户说「把额度调到X元/提高额度/降低额度/申请提额」时调用', params: { target: { type: 'number', description: '目标额度（元）', required: true } } },
  'card.freeze': { group: '卡片', desc: '挂失信用卡。属于高风险操作，系统会先请用户确认', params: { reason: { type: 'string', description: '挂失原因，如 丢失 / 被盗 / 疑似盗刷' } } },
  'card.unfreeze': { group: '卡片', desc: '解除卡片挂失或冻结状态', params: {} },

  'wealth.list': { group: '理财', desc: '读取全部理财产品：风险等级、年化收益率、期限、起购金额', params: {} },
  'wealth.recommend': { group: '理财', desc: '按金额、期限与风险偏好生成多套资产配置方案并测算收益', params: { amount: { type: 'number', description: '可投金额（元）', required: true }, horizon: { type: 'integer', description: '投资期限（月）' }, riskPref: { type: 'string', enum: ['保守', '稳健', '均衡', '进取'], description: '风险偏好' } } },
  'wealth.buy': { group: '理财', desc: '申购理财产品。属于资金操作，系统会先请用户确认', params: { product: { type: 'string', description: '产品名称，必须与 wealth.list 返回的名称一致', required: true }, amount: { type: 'number', description: '申购金额（元）', required: true } } },
  'wealth.redeem': { group: '理财', desc: '赎回已持有的理财产品。属于资金操作，系统会先请用户确认', params: { product: { type: 'string', description: '持仓产品名称' }, amount: { type: 'number', description: '赎回金额（元），不传表示全部赎回' } } },

  'budget.status': { group: '预算', desc: '检查月度预算执行水位、剩余额度与按当前速度可维持的天数', params: {} },
 'budget.set': { group: '预算', desc: '设置日/周/月/年预算。系统会先请用户确认', params: { amount: { type: 'number', description: '预算金额（元）', required: true }, period: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: '预算周期', required: true } } },
  'budget.createFund': { group: '预算', desc: '创建专项预算账户（出差基金、装修基金等）。系统会先请用户确认', params: { name: { type: 'string', description: '专项名称，如 上海出差专项预算', required: true }, amount: { type: 'number', description: '专项金额（元）', required: true }, deadline: { type: 'string', description: '截止日期 YYYY-MM-DD' } } },

  'life.scanBirthdays': { group: '生活', desc: '扫描家庭联系人生日，返回最近一位及其剩余天数与偏好（常用花材、蛋糕尺寸、忌口）', params: { withinDays: { type: 'integer', description: '扫描范围天数，默认 15' } } },
  'life.reserveDeposit': { group: '生活', desc: '锁定一笔活期资金专款专用。系统会先请用户确认', params: { amount: { type: 'number', description: '锁定金额（元）', required: true }, purpose: { type: 'string', description: '锁定用途，如 生日预留 / 出差备用金' }, date: { type: 'string', description: '预计支出日期 YYYY-MM-DD' }, autoTransfer: { type: 'boolean', description: '到期是否自动转出' } } },
  'life.orderFlower': { group: '生活', desc: '预订鲜花并安排配送。系统会先请用户确认', params: { name: { type: 'string', description: '收花人姓名' }, flower: { type: 'string', description: '花材，如 向日葵 / 康乃馨' }, price: { type: 'number', description: '金额（元）' }, deliverDate: { type: 'string', description: '配送日期 YYYY-MM-DD' } } },
  'life.orderCake': { group: '生活', desc: '预订生日蛋糕并安排配送。系统会先请用户确认', params: { name: { type: 'string', description: '收蛋糕人姓名' }, size: { type: 'string', description: '尺寸，如 6寸' }, price: { type: 'number', description: '金额（元）' }, deliverDate: { type: 'string', description: '配送日期 YYYY-MM-DD' } } },
  'life.setReminder': { group: '生活', desc: '设置提醒事项并生成祝福语草稿', params: { title: { type: 'string', description: '提醒标题' }, date: { type: 'string', description: '提醒日期 YYYY-MM-DD' } } },
  'life.travelPlan': { group: '生活', desc: '按目的地、天数和总预算拆解出差/旅行的财务计划', params: { city: { type: 'string', description: '目的地城市' }, budget: { type: 'number', description: '总预算（元）' }, days: { type: 'integer', description: '行程天数' } } }
};

function agentBuildToolSchemas(): any[] {
  var out: any[] = [];
  Object.keys(AGENT_TOOL_REGISTRY).forEach(function (name: any) {
    var tool: any = (AGENT_TOOL_REGISTRY as any)[name] || {};
    var spec = AGENT_TOOL_SPECS[name] || { group: '通用', desc: '', params: {} };
    var props: Record<string, any> = {}, required: any[] = [];
    Object.keys(spec.params || {}).forEach(function (key: any) {
      var raw = spec.params[key] || {};
      var clean = {};
      Object.keys(raw).forEach(function (k: any) { if (k !== 'required') (clean as any)[k] = (raw as any)[k]; });
      props[key] = clean;
      if (raw.required) required.push(key);
    });
    out.push({
      type: 'function',
      function: {
        name: agentToolApiName(name),
        description: '【' + (spec.group || '通用') + '】' + (tool.label || name) + '：' + (spec.desc || ''),
        parameters: { type: 'object', properties: props, required: required }
      }
    });
  });
  return out;
}

var AGENT_TOOL_RISK_LABEL: Record<string, string> = { low: '只读查询', medium: '账户变更', high: '资金操作' };

// ------------------------------ 2. 系统提示词（含用户记忆） ------------------------------
function agentSystemPrompt(): string {
  var m = AGENT_MEMORY || {};
  var p = m.profile || {};
  var family = (m.family || []).map(function (f: any) {
    return f.relation + ' ' + f.name + '（生日 ' + f.birthday + '，还有 ' + agentDaysUntil(f.birthday) + ' 天，常用花材 ' + (f.favoriteFlower || '未记录') + '）';
  }).join('；') || '无';
  var goals = (m.goals || []).map(function (g: any) {
    return g.name + ' 已存 ¥' + agentFmtInt(g.saved) + ' / ¥' + agentFmtInt(g.target) + '（截止 ' + g.deadline + '）';
  }).join('；') || '无';
  var debit = (mockData.userProfile && mockData.userProfile.debitCard) ? mockData.userProfile.debitCard : {};
  var sessionCtx = (typeof agentSessionContextText === 'function') ? agentSessionContextText(5) : '';
  var recentQA = (typeof agentCtxHistoryText === 'function') ? agentCtxHistoryText(3) : '';
  var curTopic = (typeof agentCtxLastTopic === 'function') ? agentCtxLastTopic() : null;

  return [
    '你是「AI Banking Agent」——一个会主动替用户管理金融生活的银行智能体。今天的日期是 ' + agentDateStr(0) + '，当前月份标签为 ' + agentMonthLabel() + '。',
    '',
    '【你已经记住的用户档案】',
    '姓名：' + (p.name || '小陈') + '；城市：' + (p.city || '未知') + '；风险等级：' + (p.riskLevel || '未评估'),
    '近 3 个月月均支出：¥' + agentFmtInt(p.monthlyAvgExpense) + '；单笔转账确认阈值：¥' + agentFmtInt(p.confirmThreshold),
    '家庭成员：' + family,
    '理财目标：' + goals,
    '最近一条记忆：' + ((m.notes && m.notes[0]) ? m.notes[0].text : '无'),
    '',
    '【本次会话已掌握的信息】（用户可能直接追问，不要让他重复描述背景）',
    sessionCtx || '（本轮尚未产生查询结果。用户连续追问时应复用上文对话中出现过的数字与结论。）',
    '',
    recentQA ? '【最近几轮对话原文】\n' + recentQA : '',
    '',
    '【当前讨论主题】',
    curTopic ? ('用户最近在聊：' + curTopic.label + (curTopic.summary ? '（' + curTopic.summary + '）' : '') + '。如果他的新问题里出现指代词，大概率指这个。') : '（本轮尚无明确主题。）',
    '',
    '【多轮上下文与指代理解要求】（重要）',
    '- 用户连续提问时，必须结合上文已经得到过的数据作答，不要重新询问已经提供过的信息。',
    '- 例如用户先问"分析我的财务情况"，再问"那我能买3000元的手机吗"，你应直接复用前面的收入/支出/结余结论给出购买建议，而不是从零开始。',
    '- 用户的提问里可能包含指代词，你必须结合上文消解出它到底指什么，**绝不能反问"您指的是什么"**。常见指代：',
    '  · "这个情况 / 这种情况" → 上一轮分析的那个对象（消费结构、财务状况等）',
    '  · "刚才那个问题 / 上面说的" → 上一轮的讨论主题',
    '  · "上面的分析 / 这个结果 / 这些数据" → 上一轮得出的结论与数字',
    '  · "这个产品 / 这个方案 / 它 / 这种方式" → 上一轮提到的具体产品、方案或方法',
    '- 消解示例：用户先问"最近消费最高的是哪一类"，再问"这个情况需要调整吗"，则"这个情况"= 当前消费结构，你应当继续分析：是否存在消费过高的类别、是否影响储蓄目标、并给出优化建议，**不要要求用户重述背景**。',
    '- 如果上文数据不足以回答新问题，才对缺失的那一项调用工具补齐，并在回答里说明用到了哪些已有结论。',
    '',
    '【金融知识问答（RAG）要求】',
    '- 当用户问金融概念、产品区别、某类产品怎么样、"基金跌了怎么办"这类**知识性问题**时，必须先调用 kb.search 检索知识库，再结合用户自身数据作答。',
    '- 知识库覆盖五类：①宏观金融（通货膨胀/CPI/利率/存贷款利率变化原因/货币政策/加息降息/经济周期）②银行业务（活期/定期/大额存单/信用卡/贷款/房贷/消费贷/分期）③投资理财（货币基金/银行理财/基金/股票/债券/R1~R5风险等级）④金融风险（信用/市场/流动性/操作/杠杆）⑤个人财务规划（消费管理/储蓄规划/资产配置/应急资金/风险承受能力）。',
    '- **禁止凭记忆编造**产品特性、监管规则或历史收益。检索不到时应说明知识库暂无该条目，并给出你能确定的一般性判断。',
    '- 回答结构：先给基础解释（要点式）→ 再结合用户情况给个性化判断 → 最后反问关键的一两项（如"这笔钱多久不用？更在意收益还是流动性？"）。',
    '- 对比类问题（"A 和 B 有什么区别"）要逐维度对比：收益特点、风险等级、流动性，最后给出"什么情况下选哪个"。',
    '',
    '【金融逻辑分析要求（重要）】',
    '- 用户问"为什么…"（如"为什么贷款利率提高"）或"…有什么影响"时，不能只解释定义，必须按**三段式**回答：',
    '  ① 基础解释：这是什么（概念/机制）',
    '  ② 原因分析：为什么会发生（货币政策、市场资金成本、风险控制、通胀与汇率等）',
    '  ③ 对用户的影响：会带来什么变化（房贷月供、消费贷成本、存款收益、企业融资），并按用户自身数据（储蓄率/负债率/风险等级）具体说',
    '  最后给出"你该怎么处理"的可执行建议。',
    '- kb.search 返回的每条知识含 why（原因）、impact（对个人影响）、fit（适合人群）、advices（建议）四个字段，请充分利用它们组织三段式回答，而不是只看 points。',
    '- 分析要落到用户身上，避免只讲宏大叙事；能引用用户真实数字（月结余、月供占比）时就引用。',
    '',
    '【场景推理要求】',
    '- 当用户说"我有X万闲钱、Y后要用、应该怎么安排"时，调用 scenario.allocate。',
    '- 配置建议必须基于**期限匹配**：短期要用的钱不配权益类，长期不用的钱不应全放活期。',
    '- 若用户没说明资金期限，先用一句话反问确认期限，不要凭空假设。',
    '',
    '【工作原则】',
    '1. 必须通过调用工具获取真实数据。余额、账单、产品收益、订阅、生日等数字一律来自工具返回结果，严禁凭空编造。',
    '2. 一次可以并行调用多个互不依赖的工具；也可以分多轮调用——先查数据，再基于结果计算或决策。',
    '3. 只读查询（risk=low）请直接调用，不要反问用户"要不要帮你查"。',
    '4. 涉及转账、申购、赎回、取消订阅、锁定资金、挂失等账户变更（risk=medium/high）时，你照常调用工具即可，系统会自动弹出确认卡让用户点确认，你不需要自己再问"是否确认"。',
    '5. 不要一次性调用与用户目标无关的工具。工具调用要精准，能一步拿到的不要拆成两步。',
    '6. 信息不足时（例如转账没给金额、转账没给收款人），先调用能拿到的信息，再在最终回答里明确问出缺失的那一项。',
    '',
    '【用户画像与个性化推荐要求】',
    '- 当用户问"适合我的服务/推荐产品/我是什么类型的客户"时，先调用 account.profileAnalysis 拿到画像与标签，再给出建议。',
    '- 推荐必须说明理由，格式参考："由于你的风险等级为 R2、资金期限超过 1 年、流动性需求较低，因此推荐低风险稳健型产品。"',
    '- 禁止只输出"推荐产品A"而不给依据。',
    '',
    '【风险识别要求】',
    '- 当用户表达"套现信用卡投资/借钱炒股/加杠杆/全部资金买入单一标的/为他人代收代付"等意图时，必须先调用 risk.detect。',
    '- 若识别为高风险或严重风险，你必须在回答中：① 明确指出该行为的风险与后果；② 说明不会直接执行；③ 给出替代方案（如使用自有可投资资金做风险匹配的投资）。',
    '- 绝不能协助规避风控，也不能声称"可以绕过"任何限制。',
    '',
    '【不可逾越的资金安全约束】',
    'A. 转账金额 ≥ ¥5,000 必须触发二次验证；≥ ¥500 需要用户确认。这套分级由系统强制实施，你无需在回答里复述档位，但绝不能声称"已跳过验证"或"无需确认"。',
    'B. 任何转账都不得使账户余额变为负数。若用户要求的金额超过可用余额（可先调 account.balance 查看），不要调用 transfer.execute——系统会拒绝，你应当改为向用户说明资金缺口，并按"优先不借钱"的顺序给出方案：① 降低金额 ② 分批转账 ③ 用信用卡（属透支，有利息）④ 贷款（会产生利息，通常约定不得用于投资）。',
    'D. 严禁协助任何形式的信用资金套现、代收代付、刷单返利等违规或涉诈行为。',
    '',
    '【回答要求】',
    '- 全程使用简体中文，金额统一用 ¥ 并保留两位小数。',
    '- 工具跑完后，用 2~5 句话给出结论，先说最重要的判断，再说依据。',
    '- 如果是分析类请求，最后给 1~3 条具体可执行的建议（可含金额、时间、动作）。',
    '- 不要罗列工具名和参数，不要说"我已调用某工具"，直接给业务结论。',
    '- 涉及收益或风险时给出提示，但不要冗长免责声明。',
    '- 如果用户输入与金融/账户/生活财务完全无关（纯闲聊），不要调用任何工具，用一句话友好回答即可。'
  ].join('\n');
}

// ------------------------------ 3. 多轮上下文 ------------------------------
var AGENT_LLM_HISTORY: any[] = [];

function agentLLMPushHistory(userText: string, assistantText?: string): void {
  AGENT_LLM_HISTORY.push({ role: 'user', content: userText });
  AGENT_LLM_HISTORY.push({ role: 'assistant', content: assistantText || '（已执行操作）' });
  while (AGENT_LLM_HISTORY.length > 8) AGENT_LLM_HISTORY.shift();
}
function agentLLMResetHistory(): void { AGENT_LLM_HISTORY = []; }

function agentBuildMessages(text: string): any[] {
  var msgs = [{ role: 'system', content: agentSystemPrompt() }];
  AGENT_LLM_HISTORY.forEach(function (h) { msgs.push(h); });
  msgs.push({ role: 'user', content: text });
  return msgs;
}

// ------------------------------ 4. 模型调用 ------------------------------
async function agentLLMCall(messages: any, tools?: any, opts?: any): Promise<any> {
  var c = agentLLMConfig();
  if (!c.url || !c.key) throw new Error('未配置模型服务');

  var useTools = !!(tools && tools.length && AGENT_LLM_TOOLS_OK);
  var body: any = {
    model: c.model,
    messages: messages,
    temperature: 0.2,
    max_tokens: (opts && opts.maxTokens) || AGENT_LLM_MAX_TOKENS,
    stream: false
  };
  if (useTools) { body.tools = tools; body.tool_choice = 'auto'; }

  var resp;
  try {
    resp = await bankFetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + c.key },
      body: JSON.stringify(body)
    });
  } catch (netErr) {
    throw new Error('网络不可达：' + ((netErr as any) && (netErr as any).message ? (netErr as any).message : String(netErr)));
  }

  var data = null;
  try { data = await resp.json(); } catch (e) { data = null; }

  if (!resp.ok) {
    var apiMsg = ((data as any) && (data as any).error && (data as any).error.message) ? data.error.message : ('HTTP ' + resp.status);
    // 模型不支持 tools 时，降级为纯对话并记住（下次不再带 tools）
    if (useTools && /tool|function|unsupported|not support|invalid/i.test(apiMsg)) {
      AGENT_LLM_TOOLS_OK = false;
      console.warn('[agent-llm] 当前模型不支持 function calling，已降级为规则层：', apiMsg);
      return null;
    }
    throw new Error(apiMsg);
  }
  if (!data || !data.choices || !data.choices[0]) throw new Error('模型返回为空');
  var choice = data.choices[0];
  return {
    message: choice.message || null,
    finishReason: choice.finish_reason || '',
    usage: data.usage || null
  };
}

// ------------------------------ 5. 执行过程可视化 ------------------------------
var AGENT_TRACE_SEQ = 0;
var AGENT_TRACE_TICK = 0;

// 执行过程（理解需求 / 调取偏好 / 风险评估）不对用户展示，只保留最终回答或确认卡
var AGENT_TRACE_VISIBLE = false;

function agentTraceStart(title?: string): any {
  AGENT_TRACE_SEQ++;
  var id = 'agenttrace-' + AGENT_TRACE_SEQ + '-' + Date.now();
  if (!AGENT_TRACE_VISIBLE) {
    // 不渲染执行流，后续 agentTraceStep / Note / Complete 都会因 removed 而不做事
    return { id: id, count: 0, startedAt: Date.now(), removed: true, tools: 0 };
  }
  var html = '<div class="message" id="' + id + '-msg">' +
    '<div class="msg-avatar ai">🤖</div>' +
    '<div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · Agent 执行过程</div>' +
    '<div class="msg-bubble agent-bubble agent-trace">' +
    '<div class="agent-trace-head" id="' + id + '-head"><span class="agent-trace-live"></span>' + (title || '正在处理你的请求') + '</div>' +
    '<div class="agent-trace-list" id="' + id + '-list"></div>' +
    '<div class="agent-trace-foot" id="' + id + '-foot"></div>' +
    '</div></div></div>';
  appendMessage(html);
  scrollToBottom();
  return { id: id, count: 0, startedAt: Date.now(), removed: false, tools: 0 };
}

// 追加一条「进行中」的执行步骤，等待 wait 毫秒后返回该行 id
async function agentTraceStep(trace: any, runningText: string, opts?: any): Promise<string | null> {
  if (trace.removed) return null;
  var list = document.getElementById(trace.id + '-list');
  if (!list) return null;
  var i = trace.count++;
  var lineId = trace.id + '-l' + i;
  var el = document.createElement('div');
  el.className = 'agent-trace-line running';
  el.id = lineId;
  el.innerHTML = '<span class="agent-trace-ico"><span class="agent-spin"></span></span>' +
    '<span class="agent-trace-text">' + runningText + '</span>';
  list.appendChild(el);
  scrollToBottom();
  var wait = (opts && typeof opts.wait === 'number') ? opts.wait : 420;
  if (wait > 0) await agentSleep(wait);
  return lineId;
}

// 把某一行标记为完成/失败，并补上结果说明
function agentTraceSettle(trace: any, lineId: string | null, resultText?: string, state?: string): void {
  if (!lineId || trace.removed) return;
  var el = document.getElementById(lineId);
  if (!el) return;
  var st = state || 'done';
  el.className = 'agent-trace-line ' + (st === 'fail' ? 'fail' : 'done');
  var ico = el.querySelector('.agent-trace-ico');
  if (ico) ico.textContent = st === 'fail' ? '!' : '✓';
  var txt = el.querySelector('.agent-trace-text');
  if (txt) {
    if (resultText) {
      var sub = document.createElement('span');
      sub.className = 'agent-trace-sub';
      sub.textContent = resultText;
      txt.appendChild(sub);
    }
  }
  if (st !== 'fail') AGENT_TRACE_TICK++;
  scrollToBottom();
}

function agentTraceNote(trace: any, text: string, state?: string): void {
  if (trace.removed) return;
  var list = document.getElementById(trace.id + '-list');
  if (!list) return;
  var el = document.createElement('div');
  el.className = 'agent-trace-line ' + (state || 'done');
  el.innerHTML = '<span class="agent-trace-ico">' + (state === 'fail' ? '!' : (state === 'running' ? '<span class="agent-spin"></span>' : '✓')) + '</span>' +
    '<span class="agent-trace-text">' + text + '</span>';
  list.appendChild(el);
  scrollToBottom();
}

function agentTraceComplete(trace: any, footNote?: string): void {
  if (!trace || trace.removed) return;
  var head = document.getElementById(trace.id + '-head');
  if (head) {
    var live = head.querySelector('.agent-trace-live');
    if (live) { live.className = 'agent-trace-live done'; }
    head.innerHTML = '<span class="agent-trace-live done"></span>执行过程已完成';
  }
  var foot = document.getElementById(trace.id + '-foot');
  if (foot) {
    var sec = ((Date.now() - trace.startedAt) / 1000).toFixed(1);
    foot.innerHTML = '共 ' + trace.count + ' 个步骤' +
      (trace.tools ? ' · 调用 ' + trace.tools + ' 个工具' : '') +
      ' · 耗时 ' + sec + ' 秒' +
      (footNote ? '<br>' + footNote : '');
  }
  scrollToBottom();
}

function agentTraceRemove(trace: any): void {
  if (!trace) return;
  trace.removed = true;
  var el = document.getElementById(trace.id + '-msg');
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

// ------------------------------ 6. 结果与确认卡渲染 ------------------------------
function agentToolResultDigest(data: any): any {
  if (data === null || data === undefined) return null;
  try {
    var s = JSON.stringify(data);
    if (s.length > 1600) return s.slice(0, 1600) + '…(内容已截断)';
    return data;
  } catch (e) { return String(data); }
}

function agentParseToolArgs(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}

function agentToolActionLabel(action: any): string {
  var esc = function (v: any) { return (typeof escapeHtml === 'function') ? escapeHtml(String(v)) : String(v); };
  var label = (action.tool && action.tool.label) || action.name;
  var ar = action.args || {};
  var parts = [];
  if (ar.payee) parts.push(esc(ar.payee));
  if (ar.product) parts.push(esc(ar.product));
  if (ar.purpose) parts.push(esc(ar.purpose));
  if (ar.name) parts.push(esc(ar.name));
  if (ar.flower) parts.push(esc(ar.flower));
  if (ar.city) parts.push(esc(ar.city));
  if (ar.deliverDate) parts.push(esc(ar.deliverDate) + ' 送达');
  if (ar.period) parts.push(esc(({ day: '每日', week: '每周', month: '每月', year: '每年' } as Record<string, string>)[ar.period] || ar.period));
  if (ar.amount !== undefined && ar.amount !== null && ar.amount !== '') parts.push('¥' + agentFmt(ar.amount));
  return esc(label) + (parts.length ? '：' + parts.join(' · ') : '');
}

function agentActionAmount(action: any): number {
  var ar = (action && action.args) || {};
  // 鲜花/蛋糕工具用 price 字段，其余资金工具用 amount。
  // 负数必须按 0 计：否则一笔 5000 转账 + 一笔 -4900 鲜花会被算成 100 元，绕过 T2/T3 验证。
  var v;
  if (action && (action.name === 'life.orderFlower' || action.name === 'life.orderCake')) {
    v = Number(ar.price) || 0;
  } else {
    v = Number(ar.amount) || 0;
  }
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function agentRenderAgentReply(content: string): void {
  if (!content) return;
  var html = (typeof formatAiText === 'function') ? formatAiText(content) : escapeHtml(content);
  appendMessage('<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手</div><div class="msg-bubble">' + html + '</div></div></div>');
  scrollToBottom();
}

function agentLLMRenderConfirm(state: any): void {
  var batch = state.needsConfirm || [];
  var total = batch.reduce(function (s: any, a: any) { return s + agentActionAmount(a); }, 0);
  var hasHigh = batch.some(function (a: any) { return (a.tool && a.tool.risk) === 'high'; });
  var rows = batch.map(function (a: any, i: any) {
    return '<div class="agent-confirm-row" id="' + state.id + '-a' + i + '">' +
      '<span class="agent-confirm-idx">' + (i + 1) + '</span>' +
      '<span class="agent-confirm-text">' + agentToolActionLabel(a) + '</span>' +
      '<span class="agent-confirm-tag">待确认</span></div>';
  }).join('');

  var riskHtml = batch.map(function (a: any) {
    var risk = (a.tool && a.tool.risk) || 'medium';
    return '<span class="agent-confirm-risk ' + risk + '">' + (AGENT_TOOL_RISK_LABEL[risk] || '需确认') + '</span>';
  }).join('');

  // —— 金额分级：批次内只要含"扣款类"工具，就统一按金额/风险定档 ——
  // 扣款类：转账、理财申购、鲜花、蛋糕；不含只读/预算设置/账户设置类工具。
  // 风控红线：¥5,000 以上必须二次验证，此逻辑与规则层（agentTransferTier）保持一致。
  // 注意：不能用 tool.risk（transfer.execute 恒为 'high'，那是"需确认"标记，不是可疑度），
  // 必须用 agentAssessTransferRisk 的"可疑度"结果来抬档，否则一笔 ¥100 转账也会被要求验证码。
  var tier = null, tierBadge = null, tierHtml = '', verifyHtml = '';
  var transferActs = batch.filter(function (a: any) { return a.name === 'transfer.execute'; });
  var debitActs = batch.filter(function (a: any) {
    return ['transfer.execute', 'wealth.buy', 'life.orderFlower', 'life.orderCake'].indexOf(a.name) > -1;
  });
  if (debitActs.length && typeof agentTransferTier === 'function') {
    var tierAmount = debitActs.reduce(function (s: any, a: any) { return s + agentActionAmount(a); }, 0);
    var tierRisk = null;
    if (transferActs.length && typeof agentAssessTransferRisk === 'function') {
      var firstArgs = transferActs[0].args || {};
      tierRisk = agentAssessTransferRisk(firstArgs.payee || '收款人', Number(firstArgs.amount) || 0);
    }
    tier = agentTransferTier(tierAmount, tierRisk);
    tierBadge = agentTierBadge(tier);
    tierHtml = '<div class="agent-tier-row">' +
      '<span class="agent-tier-badge" style="color:' + tierBadge.color + ';background:' + tierBadge.bg + ';border-color:' + tierBadge.border + ';">' + tierBadge.text + '</span>' +
      '</div>';
    if (tier.needVerify) {
      verifyHtml =
        '<div class="agent-verify-box" id="' + state.id + '-verify">' +
        '<div class="agent-verify-title">' + (tier.needManual ? '大额交易，请输入验证码，通过后提交人工复核' : '请输入二次验证码') + '</div>' +
        '<div class="agent-verify-hint">验证码已发送至尾号 **** 的手机（演示验证码：' + AGENT_DEMO_OTP + '）</div>' +
        '<input class="agent-verify-input" id="' + state.id + '-otp" type="text" inputmode="numeric" maxlength="6" placeholder="请输入 6 位验证码" autocomplete="off">' +
        '<div class="agent-verify-err" id="' + state.id + '-otp-err"></div>' +
        '</div>';
    }
    state.tier = tier;
  }

  // —— 余额门禁：涉及转账时，交易前先算可用余额，不足则不出「确认执行」，改出超支方案 ——
  var shortage = null;
  if (transferActs.length && typeof agentCheckBalance === 'function') {
    var check = agentCheckBalance(transferActs.map(function (a: any) { return { amount: Number(a.args && a.args.amount) || 0 }; }));
    if (!check.enough) shortage = check;
  }
  state.shortage = shortage;

  if (shortage) {
    var sp = transferActs[0].args && transferActs[0].args.payee;
    appendMessage(agentShortageCardHtml(shortage, sp || '收款人'));
    scrollToBottom();
    return;
  }

  appendMessage('<div class="message" id="' + state.id + '-confirm"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手 · 等待你确认</div>' +
    '<div class="msg-bubble agent-bubble">' +
    '<div class="agent-plan-head"><span class="agent-plan-dot"></span>确认后我会执行这 ' + batch.length + ' 项操作</div>' +
    '<div class="agent-confirm-card">' +
    '<div class="agent-confirm-title">' + (hasHigh ? '其中包含资金变动操作，请核对后确认' : '以下操作会修改你的账户设置') + riskHtml + '</div>' +
    tierHtml +
    rows +
    (total > 0 ? '<div class="agent-confirm-total"><span>涉及金额</span><span>¥' + agentFmt(total) + '</span></div>' : '') +
    verifyHtml +
    '<div class="agent-confirm-actions">' +
    '<button class="btn btn-primary btn-sm" onclick="agentLLMApprove(\'' + state.id + '\')">' +
    (tier && tier.needVerify ? '验证并执行' : '确认执行') + '</button>' +
    '<button class="btn btn-secondary btn-sm" onclick="agentLLMReject(\'' + state.id + '\')">暂不执行</button>' +
    '</div></div></div></div></div>');
  scrollToBottom();
}

function agentLLMRenderNextSteps(state: any): void {
  var names = (state.executed || []).map(function (x: any) { return x.name; });
  function has(re: RegExp) { return names.some(function (n: any) { return re.test(n); }); }
  var pool = [];
  if (has(/^bill\./)) pool.push('帮我优化一下订阅');
  if (has(/^bill\.|^account\.transactions/)) pool.push('帮我核查异常交易');
  if (has(/^bill\.|^budget\./)) pool.push('帮我制定下个月预算');
  if (has(/^subscription\./)) pool.push('帮我体检一下本月账单');
  if (has(/^wealth\./)) pool.push('我手上有 10 万，明年要用，帮我配置');
  if (has(/^card\./)) pool.push('帮我看下信用卡账单和还款日');
  if (has(/^life\./)) pool.push('帮我看下本月还有什么要注意的');
  pool.push('帮我看看这个月还有什么要注意的');

  var picked: any[] = [];
  pool.forEach(function (t) { if (picked.indexOf(t) === -1) picked.push(t); });
  picked = picked.slice(0, 3);

  var html = '<div class="message"><div class="msg-avatar ai">🤖</div><div class="msg-content">' +
    '<div class="msg-name">智能金融助手</div>' +
    '<div class="msg-bubble agent-bubble">' +
    '<div class="agent-followup" style="margin-top:0;">' +
    '<span class="agent-followup-label">接下来我可以替你：</span>' +
    picked.map(function (t) {
      return '<div class="agent-followup-line">· ' + t + '</div>';
    }).join('') +
    '</div></div></div></div>';
  appendMessage(html);
  scrollToBottom();
}

// ------------------------------ 7. Agent 主循环 ------------------------------
var AGENT_LLM_PENDING: Record<string, any> = {};
var AGENT_LLM_SEQ = 0;
var AGENT_LLM_LAST = null;   // 最近一次 Agent 请求状态，便于调试与「继续执行」

function agentIntentLabel(text: string): string {
  var keys = [];
  if (/转|汇款|打款|付款/.test(text)) keys.push('转账');
  if (/账单|消费|花了|支出/.test(text)) keys.push('账单分析');
  if (/理财|基金|申购|赎回|收益|配置|投资|持仓/.test(text)) keys.push('理财');
  if (/卡|额度|挂失/.test(text)) keys.push('卡片管理');
  if (/订阅|会员|续费|扣费/.test(text)) keys.push('订阅管理');
  if (/预算/.test(text)) keys.push('预算');
  if (/生日|鲜花|蛋糕|礼物/.test(text)) keys.push('生日关怀');
  if (/出差|旅行|旅游/.test(text)) keys.push('出差财务');
  if (/异常|可疑/.test(text)) keys.push('风险核查');
  if (!keys.length) keys.push('通用咨询');
  return keys.join(' + ');
}

function agentMemoryLine(): string {
  var m = AGENT_MEMORY || {};
  var p = m.profile || {};
  var fam = (m.family || []).length;
  var highRiskDay = (m.family || []).map(function (f: any) { return agentDaysUntil(f.birthday); }).sort(function (a: any, b: any) { return a - b; })[0];
  var parts = [fam + ' 位家庭成员已建档', p.riskLevel || '未评估', '月均支出 ¥' + agentFmtInt(p.monthlyAvgExpense)];
  if (typeof highRiskDay === 'number' && highRiskDay <= 15) parts.push('最近生日 ' + highRiskDay + ' 天后');
  return parts.join(' · ');
}

async function agentLLMHandle(text: string): Promise<boolean> {
  if (!agentLLMAvailable()) return false;
  if (!agentLLMShouldAttempt(text)) return false;
  if (AGENT_LLM_BUSY) { if (typeof showToast === 'function') showToast('上一条请求还在处理中，请稍候', 2000); return true; }

  if (!AGENT_MEMORY) initAgentMemory();
  AGENT_LLM_BUSY = true;

  var trace = agentTraceStart('Agent 正在处理你的请求');
  var state = {
    id: 'agentllm-' + (++AGENT_LLM_SEQ) + '-' + Date.now(),
    text: text,
    trace: trace,
    messages: agentBuildMessages(text),
    tools: agentBuildToolSchemas(),
    round: 0,
    executed: [],
    needsConfirm: [],
    status: 'running'
  };
  AGENT_LLM_LAST = state;

  // —— v6 前置风险闸门：高危行为在进入模型循环之前就拦下 ——
  // 放在这里而不是等模型调用工具，是为了防止模型"先斩后奏"地先调用了执行型工具。
  // 例外：咨询型问句（"我有5万闲钱，半年后要用，怎么安排"）里的金额是待配置资金而非支出，
  // 若在这里拦截会把"资产配置咨询"误判成"一笔 5 万支出"，必须放行让模型/场景层正常分析。
  if (typeof agentRiskDetect === 'function' && !agentIsRiskQuery(text) && !agentIsGoalStatement(text) &&
      !(typeof agentIsConsultativeQuery === 'function' && agentIsConsultativeQuery(text))) {
    var preDet = agentRiskDetect(text);
    if (preDet.blocked) {
      agentTraceRemove(trace);
      appendMessage(agentRiskBlockCardHtml(preDet));
      scrollToBottom();
      if (typeof agentRememberRiskBlock === 'function') agentRememberRiskBlock(preDet);
      if (typeof showToast === 'function') showToast('已识别到高风险行为，未执行', 2600);
      addToConversation('assistant', '已拦截高危行为：' + (preDet.top as any).title, null);
      AGENT_LLM_BUSY = false;
      return true;
    }
  }

  try {
    // —— 阶段一：意图识别 ——
    var l1 = await agentTraceStep(trace, '正在理解你的需求……', { wait: 300 });
    agentTraceSettle(trace, l1, '意图识别：' + agentIntentLabel(text));

    // —— 阶段二：用户记忆 ——
    var l2 = await agentTraceStep(trace, '正在调取你的账户与偏好……', { wait: 280 });
    agentTraceSettle(trace, l2, '用户记忆：' + agentMemoryLine());

    // —— 阶段三：风险判断 ——
    var l3 = await agentTraceStep(trace, '正在评估操作风险……', { wait: 260 });
    agentTraceSettle(trace, l3, '风险判断：只读查询直接执行；涉及资金或账户变更将暂停并请你确认');

    var out = await agentLLMRunLoop(state);

    if (!out.handled) {
      // 模型没有用到任何工具 → 交回原有规则/场景层处理
      agentTraceRemove(trace);
      AGENT_LLM_BUSY = false;
      return false;
    }
    if (out.awaiting) { AGENT_LLM_BUSY = false; return true; }

    AGENT_LLM_BUSY = false;
    return true;
  } catch (e) {
    console.warn('[agent-llm] 链路异常，降级到规则层：', e);
    AGENT_LLM_BUSY = false;
    if (AGENT_LLM_TOOLS_OK) {
      agentTraceNote(trace, '模型服务暂时不可用，已切换为本地规则引擎继续处理', 'fail');
    } else {
      agentTraceNote(trace, '当前模型不支持工具调用，已切换为本地规则引擎继续处理', 'fail');
    }
    await agentSleep(700);
    agentTraceRemove(trace);
    return false;
  } finally {
    // 任何分支（含超时/异常）都必须释放重入锁，否则后续消息会被永久 toast 吞掉
    AGENT_LLM_BUSY = false;
  }
}

// 模型没给出正文（截断或只产出推理内容）时，用真实工具结果拼一段兜底结论，避免出现空白回复
function agentLLMFallbackAnswer(state: any): string {
  var done = (state.executed || []).filter(function (x: any) { return x.ok && x.summary; });
  if (!done.length) {
    return '我已经读取了你的账户数据。你想让我重点看哪一块？\n例如：本月支出结构 / 异常交易 / 订阅扣费 / 理财配置';
  }
  var lines = done.slice(0, 4).map(function (x: any) { return '· ' + (x.label || x.name) + '：' + x.summary; });
  return '根据实际查询到的数据：\n' + lines.join('\n') + '\n\n需要我针对其中某一项继续安排吗？';
}

async function agentLLMRunLoop(state: any): Promise<any> {
  var trace = state.trace;

  while (state.round < AGENT_LLM_MAX_ROUNDS) {
    state.round++;

    var out = await agentLLMCall(state.messages, AGENT_LLM_TOOLS_OK ? state.tools : null);
    if (!out) return { handled: false, state: state };   // 模型不支持 tools
    var msg = out.message;
    var calls = (msg && msg.tool_calls) ? msg.tool_calls : [];

    // 推理型模型可能把 token 花在 reasoning 上导致截断：无工具调用且被截断时，放宽预算重试一次
    if (!calls.length && out.finishReason === 'length' && !state.retriedTruncation) {
      state.retriedTruncation = true;
      var out2 = await agentLLMCall(state.messages, AGENT_LLM_TOOLS_OK ? state.tools : null, { maxTokens: AGENT_LLM_MAX_TOKENS * 2 });
      if (out2) { out = out2; msg = out2.message; calls = (msg && msg.tool_calls) ? msg.tool_calls : []; }
    }

    // —— 模型给出最终答复，不再调用工具 ——
    if (!calls.length) {
      if (state.round === 1 && !state.executed.length) {
        return { handled: false, state: state };
      }
      var lf = await agentTraceStep(trace, '正在汇总结论与建议……', { wait: 320 });
      agentTraceSettle(trace, lf, '已生成执行结果');
      agentTraceComplete(trace, state.executed.length ? ('本轮共完成 ' + state.executed.filter(function (x: any) { return x.ok; }).length + ' 项操作，均可随时撤销或修改。') : '');
      var content = (msg && msg.content) ? String(msg.content).trim() : '';
      if (!content) content = agentLLMFallbackAnswer(state);   // 截断/仅推理时不留空白回复
      agentRenderAgentReply(content);
      if (state.executed.length) agentLLMRenderNextSteps(state);
      agentLLMPushHistory(state.text, content);
      if (typeof addToConversation === 'function') addToConversation('assistant', content, null);
      return { handled: true, state: state };
    }

    // —— 记录本轮 assistant 的 tool_calls ——
    state.messages.push({ role: 'assistant', content: (msg && msg.content) || '', tool_calls: calls });

    for (var i = 0; i < calls.length; i++) {
      var call = calls[i];
      var fname = (call.function && call.function.name) ? call.function.name : '';
      var name = agentToolOrigName(fname);
      var tool = getAgentTool(name);
      var args = agentParseToolArgs(call.function && call.function.arguments);

      if (!tool) {
        state.messages.push({
          role: 'tool', tool_call_id: call.id,
          content: JSON.stringify({ ok: false, error: '不存在的工具 ' + name })
        });
        continue;
      }

      // —— 风险闸门：账户变更/资金操作 → 暂停，等用户确认 ——
      var risk = tool.risk || 'low';
      if (risk !== 'low') {
        state.needsConfirm = calls.slice(i).map(function (c2: any) {
          var n2 = agentToolOrigName((c2.function && c2.function.name) || '');
          return { id: c2.id, name: n2, tool: getAgentTool(n2), args: agentParseToolArgs(c2.function && c2.function.arguments) };
        });
        var lw = await agentTraceStep(trace, '正在生成待确认的执行方案……', { wait: 300 });
        agentTraceSettle(trace, lw, '已完成分析，有 ' + state.needsConfirm.length + ' 项操作需要你确认后才执行');
        agentTraceComplete(trace, '资金与账户安全永远优先：这一步不会自动执行。');
        AGENT_LLM_PENDING[state.id] = { state: state, status: 'pending' };
        state.status = 'pending';
        agentLLMRenderConfirm(state);
        if (typeof showToast === 'function') showToast('Agent 需要你确认 ' + state.needsConfirm.length + ' 项操作', 2400);
        return { handled: true, state: state, awaiting: true };
      }

      // —— 只读工具：直接执行 ——
      var lineId = await agentTraceStep(trace, '正在' + (tool.label || name) + '……', { wait: 460 });
      var res = await callAgentTool(name, args);
      trace.tools++;
      var okState = (res.ok === false) ? 'fail' : 'done';
      state.executed.push({ name: name, label: tool.label || name, ok: res.ok !== false, summary: res.summary || '' });
      agentTraceSettle(trace, lineId, res.summary || (okState === 'fail' ? '执行失败' : '已完成'), okState);

      state.messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: fname,
        content: JSON.stringify({ ok: res.ok !== false, summary: res.summary || '', data: agentToolResultDigest(res.data) })
      });
      await agentSleep(110);
    }
  }

  // 轮次用尽：给出保守收尾
  agentTraceNote(trace, '已达到本次最大执行轮数，先输出当前结论', 'fail');
  agentTraceComplete(trace);
  agentRenderAgentReply('这次分析涉及的步骤比较多，我先按目前掌握的数据给出结论，需要继续深挖可以直接对我说。');
  AGENT_LLM_BUSY = false;
  return { handled: true, state: state };
}

// ------------------------------ 8. 用户确认后的续跑 ------------------------------
async function agentLLMApprove(id: string): Promise<void> {
  var rec = AGENT_LLM_PENDING[id];
  if (!rec || rec.status !== 'pending') return;
  var state = rec.state;
  var batch = state.needsConfirm || [];

  // —— v6 二次风险闸门：用户点"确认执行"时再校验一次原请求是否属高危行为 ——
  // 攻击面：用户先被拦下，再换个说法点确认卡；此处必须复检，不能只依赖入口那一次。
  if (typeof agentRiskDetect === 'function') {
    var reDet = agentRiskDetect(state.text);
    if (reDet.blocked) {
      rec.status = 'rejected';
      var card0 = document.getElementById(id + '-confirm');
      if (card0) {
        var w0 = card0.querySelector('.agent-confirm-actions');
        if (w0) w0.innerHTML = '<div class="agent-reject-card" style="margin-top:0;">该请求涉及高风险行为，系统已拒绝执行。</div>';
      }
      appendMessage(agentRiskBlockCardHtml(reDet));
      scrollToBottom();
      if (typeof agentRememberRiskBlock === 'function') agentRememberRiskBlock(reDet);
      if (typeof showToast === 'function') showToast('高风险行为，已拒绝执行', 2600);
      AGENT_LLM_BUSY = false;
      return;
    }
  }

  // —— T2 密码确认：金额达到 ¥500–4,999 时先完成一次安全验证 ——
  if (state.tier && state.tier.key === 'T2' && typeof showSecurityVerification === 'function') {
    var t2Total = batch.reduce(function (s: any, a: any) { return s + agentActionAmount(a); }, 0);
    var t2ok = await new Promise(function (resolve) {
      showSecurityVerification('密码确认（¥' + agentFmt(t2Total) + '）', function (ok) { resolve(!!ok); });
    });
    if (!t2ok) return;
  }

  // —— 二次验证闸门：T3/T4 档必须验证码通过，否则绝不执行、绝不改状态 ——
  if (state.tier && state.tier.needVerify) {
    var input = document.getElementById(id + '-otp');
    var errEl = document.getElementById(id + '-otp-err');
    var got = input ? String(input.value || '').trim() : '';
    if (!got) {
      if (errEl) errEl.textContent = '请输入验证码后再继续';
      if (input) ((input as any) as HTMLInputElement).focus?.();
      return;
    }
    if (got !== AGENT_DEMO_OTP) {
      if (errEl) errEl.textContent = '验证码不正确，请重新输入（本次未执行任何操作）';
      if (input) { (input as HTMLInputElement).value = ''; ((input as any) as HTMLInputElement).focus?.(); }
      if (typeof showToast === 'function') showToast('验证失败，操作未执行', 2200);
      return;
    }
    if (input) input.disabled = true;
    if (errEl) { errEl.textContent = '验证通过'; errEl.className = 'agent-verify-err ok'; }
  }

  // —— T4：验证通过后只提交人工复核，不执行任何扣款 ——
  if (state.tier && state.tier.needManual) {
    var t4Amount = batch.reduce(function (s: any, a: any) { return s + agentActionAmount(a); }, 0);
    submitManualReview({
      amount: t4Amount,
      purpose: batch.length > 1 ? 'Agent 大额交易（' + batch.length + ' 项）' : (batch[0] ? agentToolActionLabel(batch[0]) : 'Agent 大额交易'),
      source: 'Agent',
      items: batch.map(function (a: any) { return agentToolActionLabel(a); }),
      actions: batch.map(function (a: any) { return { tool: a.name, args: a.args || {} }; }),
      tier: state.tier
    });
    rec.status = 'pending_review';
    var reviewCard = document.getElementById(id + '-confirm');
    if (reviewCard) {
      var reviewActions = reviewCard.querySelector('.agent-confirm-actions');
      if (reviewActions) reviewActions.innerHTML = '<div class="agent-reject-card" style="margin-top:0;">已提交人工复核，本次未扣款。复核通过后才会执行。</div>';
    }
    batch.forEach(function (a: any, i: any) {
      var row = document.getElementById(id + '-a' + i);
      if (!row) return;
      var tag = row.querySelector('.agent-confirm-tag');
      if (tag) { tag.textContent = '待复核'; tag.className = 'agent-confirm-tag'; }
    });
    if (typeof showToast === 'function') showToast('已提交人工复核，本次未扣款', 2800);
    AGENT_LLM_BUSY = false;
    return;
  }

  // —— 余额门禁：执行前最后校验，不足则中止并转超支方案 ——
  var transferActs = batch.filter(function (a: any) { return a.name === 'transfer.execute'; });
  if (transferActs.length && typeof agentCheckBalance === 'function') {
    var check = agentCheckBalance(transferActs.map(function (a: any) { return { amount: Number(a.args && a.args.amount) || 0 }; }));
    if (!check.enough) {
      if (typeof showToast === 'function') showToast('余额不足，操作已中止', 2600);
      var sp = transferActs[0].args && transferActs[0].args.payee;
      appendMessage(agentShortageCardHtml(check, sp || '收款人'));
      scrollToBottom();
      return;   // 状态保持 pending，用户可改金额后重试
    }
  }

  rec.status = 'running';

  var card = document.getElementById(id + '-confirm');
  var actionsWrap = card ? card.querySelector('.agent-confirm-actions') : null;
  if (actionsWrap) actionsWrap.innerHTML = '<div class="agent-confirm-running">已确认，正在逐项执行…</div>';

  AGENT_LLM_BUSY = true;
  try {
    // 先补一条「用户已确认」的痕迹
    var lc = await agentTraceStep(state.trace, '正在执行你确认的 ' + batch.length + ' 项操作……', { wait: 260 });
    agentTraceSettle(state.trace, lc, '用户已确认，开始执行');

    for (var i = 0; i < batch.length; i++) {
      var a = batch[i];
      var row = document.getElementById(id + '-a' + i);
      if (row) {
        var tag = row.querySelector('.agent-confirm-tag');
        if (tag) { tag.textContent = '执行中'; tag.className = 'agent-confirm-tag running'; }
      }
      var toolLabel = (a.tool && a.tool.label) || a.name || '操作';
      var lineId = await agentTraceStep(state.trace, '正在' + toolLabel + '……', { wait: 420 });
      var res = await callAgentTool(a.name, a.args || {});
      state.trace.tools++;
      var okState = (res.ok === false) ? 'fail' : 'done';
      state.executed.push({ name: a.name, label: toolLabel, ok: res.ok !== false, summary: res.summary || '' });
      agentTraceSettle(state.trace, lineId, res.summary || (okState === 'fail' ? '执行失败' : '已完成'), okState);
      if (row) {
        var tag2 = row.querySelector('.agent-confirm-tag');
        if (tag2) { tag2.textContent = res.ok === false ? '失败' : '已完成'; tag2.className = 'agent-confirm-tag ' + (res.ok === false ? 'fail' : 'done'); }
      }
      state.messages.push({
        role: 'tool',
        tool_call_id: a.id,
        name: agentToolApiName(a.name),
        content: JSON.stringify({ ok: res.ok !== false, summary: res.summary || '', data: agentToolResultDigest(res.data) })
      });
    }
    state.needsConfirm = [];
    state.status = 'running';

    if (AGENT_MEMORY) {
      AGENT_MEMORY.notes.unshift({ at: new Date().toISOString(), text: '用户确认并执行了 ' + batch.length + ' 项操作' });
      saveAgentMemory();
      if (typeof renderAgentMemoryBox === 'function') renderAgentMemoryBox();
    }
    if (typeof showToast === 'function') showToast('已执行 ' + batch.length + ' 项操作', 2200);

    // 让模型基于真实执行结果继续把话说完整
    await agentLLMRunLoop(state);
    rec.status = 'done';
  } catch (e) {
    console.warn('[agent-llm] 确认后执行失败：', e);
    agentTraceNote(state.trace, '执行后汇总失败：' + ((e && (e as any).message) || '未知错误'), 'fail');
    agentTraceComplete(state.trace);
    var okCount = state.executed.filter(function (x: any) { return x.ok; }).length;
    agentRenderAgentReply('已完成 ' + okCount + ' 项操作，但后续汇总时连接模型失败。你可以在「我的数据」里核对最新变动。');
  }
  AGENT_LLM_BUSY = false;
}

async function agentLLMReject(id: string): Promise<void> {
  var rec = AGENT_LLM_PENDING[id];
  if (!rec || rec.status !== 'pending') return;
  rec.status = 'cancelled';
  var state = rec.state;
  var batch = state.needsConfirm || [];

  var card = document.getElementById(id + '-confirm');
  if (card) {
    var actionsWrap = card.querySelector('.agent-confirm-actions');
    if (actionsWrap) actionsWrap.innerHTML = '<div class="agent-reject-card" style="margin-top:0;">已取消，本次未执行任何操作。</div>';
  }
  batch.forEach(function (a: any, i: any) {
    var row = document.getElementById(id + '-a' + i);
    if (row) {
      var tag = row.querySelector('.agent-confirm-tag');
      if (tag) { tag.textContent = '已取消'; tag.className = 'agent-confirm-tag'; }
    }
    state.messages.push({
      role: 'tool',
      tool_call_id: a.id,
      name: agentToolApiName(a.name),
      content: JSON.stringify({ ok: false, summary: '用户取消执行，未做任何变更' })
    });
  });
  state.needsConfirm = [];

  agentTraceNote(state.trace, '用户取消了 ' + batch.length + ' 项操作，本次不做任何变更', 'fail');
  agentTraceComplete(state.trace);

  AGENT_LLM_BUSY = false;
}

// 供对话重置时清空模型上下文
function agentLLMClearHistory(): void {
  agentLLMResetHistory();
  AGENT_LLM_PENDING = {};
}
