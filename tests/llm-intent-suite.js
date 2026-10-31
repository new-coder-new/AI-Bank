// LLM（硅基流动 Qwen）意图识别 & 字段抽取评测
// 用法：node tests/llm-intent-suite.js
// 说明：直接从 js/config.local.js 读取 SiliconFlow Key，按句子调用模型，
//       让模型输出 JSON（模块 + 字段），再与预期对比，统计「意图准确率 / 字段准确率」。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const KEY = (() => {
  try {
    const code = fs.readFileSync(path.join(ROOT, 'js', 'config.local.js'), 'utf8');
    const m = code.match(/siliconflowApiKey\s*:\s*['"]([^'"]+)['"]/);
    return m ? m[1] : '';
  } catch (e) { return ''; }
})();
const MODEL = process.env.SILICONFLOW_MODEL || 'Qwen/Qwen3-30B-A3B-Instruct-2507';
const URL = 'https://api.siliconflow.cn/v1/chat/completions';

const SYSTEM = `你是银行 App 的意图识别与字段抽取器。
从用户一句话中判断它属于下面哪一个细分模块，并抽取该模块需要的字段。

模块枚举（只能选一个）：
- transfer.name   姓名转账
- transfer.phone  手机号转账
- transfer.timed  定时转账
- transfer.aa     AA 收款
- bill.analysis   账单分析
- bill.abnormal   异常交易
- card.apply     信用卡申请
- card.limit     额度调整
- card.txn       交易限制（单笔/每日限额）
- card.lost      卡片挂失
- wealth.buy     理财产品申购
- wealth.risk    风险测评
- wealth.holding 持仓查询
- sub.add        添加订阅
- sub.cancel     取消订阅
- sub.renew      自动续费管理
- none           以上都不是

字段（有就填，没有填 null）：
payee(收款人姓名), phone(11 位手机号), amount(数字/额度金额), date(YYYY-MM-DD), time(HH:MM), single(单笔限额), daily(每日限额),
repeat(不重复/每天/每周/每月/每年), names(AA 参与人姓名数组), product(理财产品名),
cardType(信用卡种类), purpose(用途), tail(卡号后四位), service(订阅服务名),
cycle(/月或/季或/年), target(要操作/取消/调整续费的订阅名), enable(开启自动续费为 true，关闭为 false)

判定规则（重要）：
1. 金额可能紧跟在收款人后面（如「转给张三111」中的 111 就是金额），务必抽取。
2. 「取消订阅 / 不想订阅了 / 退订某服务」→ sub.cancel；
   「不续费 / 关闭自动续费 / 打开自动续费 / 管理续费」→ sub.renew（关闭时 enable=false）。
3. 「设置单笔限额/每日限额」→ card.txn，并把数字填到 single / daily。
4. 「挂失尾号 6789」→ card.lost，tail=6789。
5. 「额度提高到 80000 / 调整为 X」→ card.limit，amount=目标额度。

只输出 JSON，不要解释，不要 markdown 代码块。`;

const cases = [
  { text: '给张三转1000元', module: 'transfer.name', fields: { payee: '张三', amount: 1000 } },
  { text: '转1000给张三', module: 'transfer.name', fields: { payee: '张三', amount: 1000 } },
  { text: '向13800138000转账500', module: 'transfer.phone', fields: { phone: '13800138000', amount: 500 } },
  { text: '用13800138000给李四转200', module: 'transfer.phone', fields: { amount: 200 } },
  { text: '明天下午6点转账给张三111', module: 'transfer.timed', fields: { payee: '张三', amount: 111, time: '18:00' } },
  { text: '下周三上午9点给李四转5000', module: 'transfer.timed', fields: { payee: '李四', amount: 5000 } },
  { text: '向张三和李四AA收款200元', module: 'transfer.aa', fields: { amount: 200 } },
  { text: '分析一下我这个月的账单', module: 'bill.analysis', fields: {} },
  { text: '查看异常交易', module: 'bill.abnormal', fields: {} },
  { text: '我想办一张标准金卡，额度5万，日常消费', module: 'card.apply', fields: { cardType: '标准金卡', purpose: '日常消费' } },
  { text: '我要申请一张信用卡', module: 'card.apply', fields: {} },
  { text: '我要调我的信用卡额度', module: 'card.limit', fields: {} },
  { text: '把信用卡额度提高到80000，原因是消费需求增加', module: 'card.limit', fields: { amount: 80000 } },
  { text: '我要设置单笔限额20000，每日限额50000', module: 'card.txn', fields: { single: 20000, daily: 50000 } },
  { text: '我的卡片丢了，要挂失尾号6789的卡', module: 'card.lost', fields: { tail: '6789' } },
  { text: '申购稳健增利90天 5000元', module: 'wealth.buy', fields: { product: '稳健增利90天', amount: 5000 } },
  { text: '我要做风险测评', module: 'wealth.risk', fields: {} },
  { text: '我买了哪些产品', module: 'wealth.holding', fields: {} },
  { text: '我想要订阅某视频平台VIP年卡', module: 'sub.add', fields: { service: '某视频平台VIP', cycle: '/年' } },
  { text: '我不想订阅某视频平台VIP了', module: 'sub.cancel', fields: { target: '某视频平台VIP' } },
  { text: '某云盘超级会员年卡不续费了', module: 'sub.renew', fields: { target: '某云盘超级会员', enable: false } },
  { text: '某阅读APP会员的自动续费帮我打开', module: 'sub.renew', fields: { target: '某阅读APP会员', enable: true } },
  { text: '今天天气怎么样', module: 'none', fields: {} }
];

async function callModel(text) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: text }
    ],
    temperature: 0,
    max_tokens: 400,
    stream: false
  };
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify(body)
  });
  const raw = await res.text();
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + raw.slice(0, 160));
  const data = JSON.parse(raw);
  let content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  content = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = content.indexOf('{');
  const e = content.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('模型未返回 JSON：' + content.slice(0, 120));
  return JSON.parse(content.slice(s, e + 1));
}

function norm(v) {
  if (v === null || v === undefined) return '';
  let s = String(v).replace(/\s/g, '').toLowerCase();
  // 周期归一：年卡/年付/每年 → /年；月卡/每月 → /月；季卡/每季 → /季
  if (/^(年卡|年付|每年|包年|按年|\/年)$/.test(s)) s = '/年';
  else if (/^(月卡|月付|每月|包月|按月|\/月)$/.test(s)) s = '/月';
  else if (/^(季卡|季付|每季|包季|按季|\/季)$/.test(s)) s = '/季';
  return s;
}

(async function () {
  if (!KEY) { console.error('未找到 SiliconFlow Key（js/config.local.js）'); process.exit(1); }
  console.log('模型：' + MODEL + '\n用例数：' + cases.length + '\n');

  const rows = [];
  for (const c of cases) {
    let got = null;
    let err = '';
    try { got = await callModel(c.text); } catch (e) { err = e.message; }
    const modOk = got && String(got.module) === c.module;
    const fieldChecks = Object.keys(c.fields || {}).map((k) => {
      const expVal = c.fields[k];
      let gotVal = got ? got[k] : undefined;
      if (got && got.fields && got.fields[k] !== undefined) gotVal = got.fields[k];
      let ok;
      if (Array.isArray(gotVal) || Array.isArray(expVal)) {
        ok = JSON.stringify((gotVal || []).map(norm).sort()) === JSON.stringify((expVal || []).map(norm).sort());
      } else if (typeof expVal === 'number' || typeof gotVal === 'number') {
        ok = Number(gotVal) === Number(expVal);
      } else {
        ok = norm(gotVal).includes(norm(expVal)) || norm(expVal).includes(norm(gotVal)) && norm(expVal) !== '';
      }
      return { key: k, exp: expVal, got: gotVal, ok };
    });
    rows.push({ text: c.text, expModule: c.module, got, modOk, fieldChecks, err });
  }

  const pad = (s, n) => { s = String(s); const w = [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 2 : 1), 0); return s + ' '.repeat(Math.max(0, n - w)); };
  console.log(pad('用例', 34) + pad('期望模块', 18) + pad('模型模块', 18) + pad('字段', 10) + '结果');
  console.log('-'.repeat(104));
  rows.forEach((r) => {
    const gotMod = r.err ? 'ERR' : (r.got && r.got.module);
    const fOk = r.fieldChecks.filter((x) => x.ok).length;
    const pass = r.modOk && fOk === r.fieldChecks.length;
    console.log(pad(r.text, 34) + pad(r.expModule, 18) + pad(gotMod || '-', 18) +
      pad(r.fieldChecks.length ? fOk + '/' + r.fieldChecks.length : '-', 10) + (pass ? '✅' : '❌'));
  });

  const modCorrect = rows.filter((r) => r.modOk).length;
  const passAll = rows.filter((r) => r.modOk && r.fieldChecks.every((x) => x.ok)).length;
  const totalFields = rows.reduce((a, r) => a + r.fieldChecks.length, 0);
  const okFields = rows.reduce((a, r) => a + r.fieldChecks.filter((x) => x.ok).length, 0);
  console.log('-'.repeat(104));
  console.log(`意图准确率：${modCorrect}/${rows.length}（${(modCorrect / rows.length * 100).toFixed(1)}%）`);
  console.log(`字段准确率：${okFields}/${totalFields}（${totalFields ? (okFields / totalFields * 100).toFixed(1) : '-'}%）`);
  console.log(`整体通过（意图+字段全对）：${passAll}/${rows.length}`);

  const bad = rows.filter((r) => !(r.modOk && r.fieldChecks.every((x) => x.ok)));
  if (bad.length) {
    console.log('\n问题明细：');
    bad.forEach((r) => {
      console.log('- ' + r.text + (r.err ? '  ⚠ ' + r.err : ''));
      if (!r.modOk) console.log('    模块：期望 ' + r.expModule + '，实际 ' + (r.got && r.got.module));
      r.fieldChecks.filter((x) => !x.ok).forEach((x) => {
        console.log('    字段 ' + x.key + '：期望 ' + JSON.stringify(x.exp) + '，实际 ' + JSON.stringify(x.got));
      });
    });
  }
})();
