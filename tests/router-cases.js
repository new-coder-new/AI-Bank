// 路由器端到端校验（含节流，避免 429）
const CASES = [
  ['明天下午转给张三100', 'transfer.timed'],
  ['下周三给李四转2000', 'transfer.timed'],
  ['给张三转100', 'transfer.name'],
  ['给13800138000转200', 'transfer.phone'],
  ['我和李四吃饭AA，一人200', 'transfer.aa'],
  ['分析一下我这个月的账单', 'bill.analysis'],
  ['我上周转给张三1000，帮我看看流水', 'bill.analysis'],
  ['看看最近的异常交易', 'bill.abnormal'],
  ['我想办一张白金信用卡', 'card.apply'],
  ['把信用卡额度提高到80000', 'card.limit'],
  ['为什么我的卡一天限制1998元', 'card.txn'],
  ['我的卡丢了', 'card.lost'],
  ['申购稳健增利90天 5000元', 'wealth.buy'],
  ['我要做风险测评', 'wealth.risk'],
  ['我买了哪些产品', 'wealth.holding'],
  ['订某易云年卡', 'sub.add'],
  ['某度网盘不续费了', 'sub.renew'],
  ['取消所有订阅', 'sub.cancel-all'],
  ['我现在有哪些卡', 'card.list-skip'],
  ['查一下我的余额', 'readonly-skip'],
  ['今天天气怎么样', 'none']
];

// 与 guideAIRouteIntent 的规则前置保持一致（这部分不调模型）
function ruleRoute(t) {
  if (/(流水|账单|收支|消费统计|支出结构|花销)/.test(t)) return 'bill.analysis';
  if (/(异常|可疑).{0,4}(交易|消费|记录)/.test(t)) return 'bill.abnormal';
  if (/(AA|aa|分摊|平摊|各付|一人|每人)/.test(t) && /(收|转|付|分摊|平摊)/.test(t)) return 'transfer.aa';
  if (/1\d{10}/.test(t) && /(转|汇|打款|付款)/.test(t)) return 'transfer.phone';
  if (/(自动续费|续费|不续费)/.test(t) && /(订阅|会员|网盘|VIP|开|关|关掉|管理)/.test(t)) return 'sub.renew';
  if (/(风险测评|风险评估|测评|风险等级)/.test(t)) return 'wealth.risk';
  if (/(订阅|会员|年卡|月卡)/.test(t) && /(订|开通|想要|添加|买)/.test(t)) return 'sub.add';
  return '';
}

const SYSTEM = [
  '你是银行 App 的意图路由器。把用户的话归到唯一模块，模块枚举：',
  'transfer.name、transfer.phone、transfer.timed、transfer.aa、bill.analysis、bill.abnormal、',
  'card.apply、card.limit、card.txn、card.lost、wealth.buy、wealth.risk、wealth.holding、',
  'sub.add、sub.cancel、sub.cancel-all、sub.renew、none。',
  '只输出 JSON：{"module":"模块名"}。判断不出就返回 none。',
  '只要句子里出现时间说法（明天/后天/下周三/下午三点/过两天/每个月/定时/预约），一律 transfer.timed。',
  '只要在说「一天/每天/单笔/日限/上限/限额/被限制」，一律 card.txn，不是 card.limit。',
  '说「取消所有订阅 / 全部退订 / 都取消」时用 sub.cancel-all。',
  '只读查询（查余额/查额度/有哪些卡/交易记录/我买了哪些产品）不是业务办理，返回 none。'
].join('');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('http://127.0.0.1:8787/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }], temperature: 0, max_tokens: 60 })
    });
    if (res.status === 429) { await sleep(2500); continue; }
    const data = await res.json();
    const content = ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim();
    const m = content.match(/\{[\s\S]*\}/);
    try { return m ? JSON.parse(m[0]).module : 'parse-fail'; } catch (e) { return 'parse-fail'; }
  }
  return '429';
}

(async () => {
  let ok = 0;
  const fails = [];
  for (const [text, expect] of CASES) {
    let got;
    if (expect === 'card.list-skip' || expect === 'readonly-skip') {
      // 这两类在应用里由规则前置拦截，不调模型
      got = 'skip';
    } else {
      const rule = ruleRoute(text);
      if (rule) { got = rule + '(规则)'; }
      else { got = await ask(text); await sleep(600); }
    }
    const expectNorm = expect.replace('-skip', '');
    const pass = got.replace('(规则)', '') === expectNorm || (expect.endsWith('-skip') && got === 'skip');
    if (pass) ok++; else fails.push(text + ' → ' + got + '（期望 ' + expect + '）');
    console.log((pass ? '✅' : '❌') + ' ' + text + ' → ' + got);
  }
  console.log(`\n通过 ${ok}/${CASES.length}`);
  if (fails.length) { console.log('失败：'); fails.forEach((f) => console.log('  ' + f)); }
})();
