// 快速检验「意图路由」提示词：node tests/router-probe.js
const KEY = (() => {
  const fs = require('fs'); const path = require('path');
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'config.local.js'), 'utf8');
  const m = code.match(/siliconflowApiKey\s*:\s*['"]([^'"]+)['"]/);
  return m ? m[1] : '';
})();
const MODEL = 'Qwen/Qwen3-30B-A3B-Instruct-2507';
const URL = 'https://api.siliconflow.cn/v1/chat/completions';

const SYSTEM = `你是银行 App 的意图路由器。把用户的话归到唯一模块，模块枚举：
transfer.name、transfer.phone、transfer.timed、transfer.aa、
bill.analysis、bill.abnormal、
card.apply、card.limit、card.txn、card.lost、
wealth.buy、wealth.risk、wealth.holding、
sub.add、sub.cancel、sub.renew、none。
只输出 JSON：{"module":"模块名"}。判断不出就返回 none。

区分要点：
- card.limit = 调整信用卡总额度（提额、降额、把额度调到 X）
- card.txn  = 交易限额（单笔限额、每日/每天限额、消费上限、一天只能用多少、限额是多少、怎么被限制了）
  只要在说「一天/每天/单笔/日限/上限/限额/被限制」，一律 card.txn，不是 card.limit。`;

const cases = [
  ['为什么我的卡一天限制1998元', 'card.txn'],
  ['卡片怎么一天只能用200元啊', 'card.txn'],
  ['我的卡单笔限额是多少', 'card.txn'],
  ['每日限额能改到 5 万吗', 'card.txn'],
  ['我要把额度调到 80000', 'card.limit'],
  ['帮我提额', 'card.limit'],
  ['额度太高了，帮我降低额度', 'card.limit'],
  ['我想申请调整信用卡额度', 'card.limit']
];

async function ask(text) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }], temperature: 0, max_tokens: 60 })
  });
  const raw = await res.text();
  const data = JSON.parse(raw);
  let c = (data.choices && data.choices[0].message.content) || '';
  c = c.replace(/```(?:json)?/g, '').trim();
  const m = c.match(/\{[\s\S]*\}/);
  return m ? (JSON.parse(m[0]).module || 'parse-fail') : 'no-json:' + c.slice(0, 40);
}

(async () => {
  let ok = 0;
  for (const [text, expect] of cases) {
    let got = 'ERR';
    try { got = await ask(text); } catch (e) { got = 'ERR ' + e.message; }
    const pass = got === expect;
    if (pass) ok++;
    console.log((pass ? '✅' : '❌') + ' ' + text + ' → ' + got + '（期望 ' + expect + '）');
  }
  console.log(`\n${ok}/${cases.length}`);
})();
