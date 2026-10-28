// ==========================================================================
//  模拟银行核心系统 · 内存数据库（In-Memory Bank Core）
//  这是"数据真实化"的关键：余额/账单/持仓/额度不再是前端写死的 mock，
//  而是由一个独立的数据源统一管理，前端只能通过 API 读写。
//  转账、理财申购/赎回、预算调整等操作都会真实改变这份数据。
// ==========================================================================

// 用时间戳保证"数据是活的"，每次启动都以当前日期重锚定账单/扣费日期
function now() { return new Date(); }
function fmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtDateTime(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 从"今天"往前推 N 天，得到带年月日的时间字符串（用于生成近期流水）
function daysAgo(days, h, m, s) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(h || 9, m || 0, s || 0, 0);
  return fmtDateTime(d);
}

// 按月周期生成账单：以"本月"为口径，类别数值带轻微波动，模拟真实账单
function buildBills() {
  const d = new Date();
  const monthLabel = `${d.getFullYear()}年${d.getMonth() + 1}月`;
  return {
    month: monthLabel,
    income: [
      { label: '工资收入', value: 15000, color: '#22c55e' },
      { label: '理财收益', value: 328.5, color: '#14b8a6' },
      { label: '其他收入', value: 200, color: '#84cc16' },
    ],
    expense: [
      { label: '餐饮美食', value: 2350, color: '#ef4444' },
      { label: '交通出行', value: 680, color: '#f97316' },
      { label: '购物消费', value: 1890, color: '#eab308' },
      { label: '房租水电', value: 3500, color: '#8b5cf6' },
      { label: '娱乐休闲', value: 520, color: '#06b6d4' },
      { label: '其他支出', value: 310, color: '#6b7280' },
    ]
  };
}

// 近三个月账单（用于趋势分析）
function buildMonthlyHistory() {
  const d = new Date();
  const out = [];
  for (let i = 2; i >= 0; i--) {
    const base = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const label = `${base.getFullYear()}年${base.getMonth() + 1}月`;
    // 给每个类别加一点"真实感"的月度波动
    const jitter = (v, s) => Math.round(v * (1 + Math.sin(i * 1.7 + s) * 0.08));
    out.push({
      month: label,
      income: jitter(15528, 0),
      expense: jitter(9480, 2),
      categories: [
        { label: '餐饮美食', value: jitter(2350, 0) },
        { label: '交通出行', value: jitter(680, 1) },
        { label: '购物消费', value: jitter(1890, 2) },
        { label: '房租水电', value: 3500 },
        { label: '娱乐休闲', value: jitter(520, 3) },
        { label: '其他支出', value: jitter(310, 4) },
      ]
    });
  }
  return out;
}

// 理财产品
function buildProducts() {
  return [
    { icon: '📈', name: '稳健增利90天', desc: '中低风险 · 固定收益 · 90天', rate: '3.85%', rateLabel: '近7日年化', riskLevel: 2, minAmount: 1000 },
    { icon: '🏦', name: '天天盈货币基金', desc: '低风险 · 灵活存取 · T+1到账', rate: '2.15%', rateLabel: '7日年化', riskLevel: 1, minAmount: 1 },
    { icon: '📊', name: '均衡配置混合基金', desc: '中风险 · 股债平衡 · 长期持有', rate: '5.62%', rateLabel: '近一年收益', riskLevel: 3, minAmount: 100 },
    { icon: '🔒', name: '安享三年定期', desc: '低风险 · 保本保息 · 3年期', rate: '2.75%', rateLabel: '年利率', riskLevel: 1, minAmount: 50 },
    { icon: '🚀', name: '成长先锋股票基金', desc: '中高风险 · 偏股型 · 波动较大', rate: '12.35%', rateLabel: '近一年收益', riskLevel: 4, minAmount: 1000 },
  ];
}

// 订阅（扣费日期相对今天，保证演示"3天后扣费"常新）
function buildSubscriptions() {
  const d = new Date();
  const chargeOn = (inDays) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + inDays);
    return fmtDate(x);
  };
  return [
    { id: 1, icon: '🏋️', name: '某健身APP会员', detail: '连续包月', price: 128, cycle: '/月', cycleLabel: '连续包月', chargeInDays: 3, chargeDate: chargeOn(3), usage: '低' },
    { id: 2, icon: '🎬', name: '某视频平台VIP', detail: '连续包月', price: 25, cycle: '/月', cycleLabel: '连续包月', chargeInDays: 9, chargeDate: chargeOn(9), usage: '高' },
    { id: 3, icon: '📚', name: '某阅读APP会员', detail: '连续包月', price: 15, cycle: '/月', cycleLabel: '连续包月', chargeInDays: 7, chargeDate: chargeOn(7), usage: '低' },
    { id: 4, icon: '☁️', name: '某云盘超级会员', detail: '连续包月', price: 30, cycle: '/月', cycleLabel: '连续包月', chargeInDays: 13, chargeDate: chargeOn(13), usage: '低' },
    { id: 5, icon: '🎵', name: '某音乐平台会员', detail: '连续包季', price: 45, cycle: '/季', cycleLabel: '连续包季', chargeInDays: 16, chargeDate: chargeOn(16), usage: '中' }
  ];
}

// 用户画像（核心账户数据）
function buildUserProfile() {
  return {
    name: '小陈',
    gender: '男',
    idCard: '441802199803152817',
    birthday: '1998-03-15',
    phone: '138****6688',
    email: 'chenyuanhui@example.com',
    address: '广东省清远市清城区某某街道某某小区3栋502室',
    level: '白金客户（VIP3）',
    openDate: '2019-06-18',
    manager: '李经理（工号 A10086）',
    debitCard: {
      number: '6222 0236 0201 8888 666',
      bank: '中国工商银行',
      branch: '清远分行营业部',
      status: '正常',
      balance: 1000000.00,
      available: 998000.00,
      frozen: 2000.00,
      todayIncome: 15000.00,
      todayExpense: 3280.50,
      // 冻结明细（A组测试）：每一笔冻结都有原因、发生时间与预计解冻日期
      frozenItems: [
        {
          id: 'FZ20261018-001',
          type: '预授权冻结',
          reason: '酒店入住预授权（清远某某国际酒店）',
          amount: 1500.00,
          freezeDate: '2026-10-18 21:34',
          releaseDate: '2026-10-28',
          status: '冻结中'
        },
        {
          id: 'FZ20261022-002',
          type: '在途资金',
          reason: '他行转账在途资金（招商银行汇入待确认）',
          amount: 500.00,
          freezeDate: '2026-10-22 09:12',
          releaseDate: '2026-10-26',
          status: '冻结中'
        }
      ],
    },
    creditCard: {
      number: '6228 4801 2345 6789',
      level: '白金信用卡',
      // 额度字段分层：区分申请/审批/生效额度（均来自业务数据，缺则前端明确标注「暂无数据」）
      appliedLimit: null,      // 申请额度：当前无进行中的调额申请
      approvedLimit: 90000,    // 审批额度：银行风控审批通过的最高额度
      effectiveLimit: 90000,   // 当前生效额度
      limit: 90000,            // 兼容字段，等价 effectiveLimit
      approvedAt: '2025-11-18 14:20:00',
      used: 23650.00,          // 已用额度
      available: 66350.00,     // 可用额度 = 生效额度 - 已用额度
      billDay: 15,
      dueDay: 5,
      currentBill: 8420.50,
      minPayment: 842.05,
      limitUpdatedAt: '2026-09-20 10:30:00'
    },
    loan: {
      type: '个人住房按揭贷款',
      contractNo: '房按字2023第08866号',
      amount: 850000,
      remaining: 712580.36,
      monthlyPayment: 4580.25,
      rate: 4.20,
      startDate: '2023-08-15',
      endDate: '2053-08-14',
      repayMethod: '等额本息',
      status: '正常还款中',
    },
    recentTxns: [
      { type: 'income', amount: 15000.00, desc: '工资收入（某某科技有限公司）', time: daysAgo(0, 9, 0, 12), channel: '企业网银代发' },
      { type: 'expense', amount: 3500.00, desc: '房贷月供扣款', time: daysAgo(0, 8, 30, 0), channel: '自动扣款' },
      { type: 'expense', amount: 268.50, desc: '消费-某某超市（清远万达店）', time: daysAgo(1, 19, 25, 33), channel: '微信支付' },
      { type: 'expense', amount: 128.00, desc: '消费-某某餐厅（聚餐）', time: daysAgo(1, 12, 15, 8), channel: '支付宝' },
      { type: 'expense', amount: 50.00, desc: '话费充值（中国移动）', time: daysAgo(2, 10, 5, 21), channel: '手机银行' },
      { type: 'expense', amount: 4800.00, desc: '消费-某某数码城（购买电子产品）', time: daysAgo(2, 23, 45, 18), channel: '刷卡消费', abnormal: true, abnormalReason: '大额消费+凌晨交易' },
      { type: 'expense', amount: 200.00, desc: '消费-某某便利店', time: daysAgo(3, 2, 15, 33), channel: '微信支付', abnormal: true, abnormalReason: '凌晨交易' },
      { type: 'expense', amount: 1500.00, desc: '转账给-未知账户', time: daysAgo(4, 14, 30, 0), channel: '网银转账', abnormal: true, abnormalReason: '非常用收款人' },
    ],
    holdings: [
      { name: '稳健增利90天', icon: '📈', amount: 10000, cost: 10000, profit: 95.20, profitRate: 0.95, buyDate: '2026-08-15', status: '持有中' },
      { name: '天天盈货币基金', icon: '🏦', amount: 5000, cost: 5000, profit: 22.15, profitRate: 0.44, buyDate: '2026-09-01', status: '持有中' },
      { name: '均衡配置混合基金', icon: '📊', amount: 8000, cost: 8000, profit: -156.80, profitRate: -1.96, buyDate: '2026-07-20', status: '持有中' },
    ],
    budgets: { day: 480, week: 3000, month: 12000, year: 144000 },
    transferHistory: [
      { id: 1, payee: '张三', account: '6222 **** **** 1234', amount: 2000, time: daysAgo(10, 14, 30), status: '已完成', channel: '姓名转账' },
      { id: 2, payee: '李四', account: '6225 **** **** 5678', amount: 500, time: daysAgo(12, 9, 15), status: '已完成', channel: '手机号转账' },
      { id: 3, payee: '王五', account: '6217 **** **** 9012', amount: 1500, time: daysAgo(15, 16, 45), status: '已完成', channel: '姓名转账' },
    ],
    birthdayContacts: [
      { name: '林小雨', birthday: '10-15', relation: '爱人', flower: '向日葵', price: 168, preferences: ['向日葵', '暖色系'], allergies: ['香菜'] },
      { name: '张三', birthday: '09-15', relation: '朋友', flower: '向日葵', price: 168 },
      { name: '李四', birthday: '09-20', relation: '同事', flower: '康乃馨', price: 128 },
      { name: '王五', birthday: '10-01', relation: '家人', flower: '玫瑰', price: 299 },
    ]
  };
}

// 组装完整数据库状态
function buildDB() {
  return {
    version: 3,
    createdAt: now().toISOString(),
    contacts: [
      { name: '林小雨', phone: '136****3456', account: '6228 **** **** 3456', bank: '农业银行', relation: '爱人', birthday: '2026-10-15' },
      { name: '张三', phone: '138****1234', account: '6222 **** **** 1234', bank: '工商银行' },
      { name: '李四', phone: '139****5678', account: '6225 **** **** 5678', bank: '招商银行' },
      { name: '王五', phone: '137****9012', account: '6217 **** **** 9012', bank: '建设银行' },
    ],
    bills: buildBills(),
    monthlyHistory: buildMonthlyHistory(),
    products: buildProducts(),
    card: {
      type: '白金信用卡',
      number: '6228 **** **** 8888',
      totalLimit: 90000,
      usedLimit: 23650,
      availableLimit: 66350,
      billAmount: 8420.50,
      dueDate: '2026-09-25',
    },
    subscriptions: buildSubscriptions(),
    userProfile: buildUserProfile(),
    // 专项预算账户（规划/预留用）
    funds: [],
    // 主动洞察快照（后端可预计算，供前端直接消费）
    insights: []
  };
}

module.exports = { buildDB, fmtDate, fmtDateTime, now, daysAgo };
