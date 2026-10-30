// 验证「明天下午转给张三100」走的是模型路由还是本地规则
const fs = require('fs');
const sys = [
  '你是银行 App 的意图路由器。把用户的话归到唯一模块，模块枚举：',
  'transfer.name、transfer.phone、transfer.timed、transfer.aa、bill.analysis、bill.abnormal、',
  'card.apply、card.limit、card.txn、card.lost、wealth.buy、wealth.risk、wealth.holding、',
  'sub.add、sub.cancel、sub.cancel-all、sub.renew、none。',
  '只输出 JSON：{"module":"模块名"}。判断不出就返回 none。',
  '区分要点：card.limit 是调整信用卡总额度；card.txn 是交易限额；',
  'transfer.timed 是定时/预约/指定时间转账（含「明天下午」「下周三」「过两天」这类时间说法）。'
].join('');

const cases = [
  '明天下午转给张三100',
  '明天下午给张三转100',
  '下周三给李四转2000',
  '过两天给张三转500',
  '给张三转100'
];

(async () => {
  for (const text of cases) {
    const res = await fetch('http://127.0.0.1:8787/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: sys }, { role: 'user', content: text }], temperature: 0, max_tokens: 60 })
    });
    const data = await res.json();
    const content = ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim();
    console.log(text + '  →  ' + content.replace(/\s+/g, ' ').slice(0, 60));
  }
})();
