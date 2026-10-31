// 服务端接口集成测试：临时端口 + 临时数据库，不污染本地 data/bank.db
// 用法：node tests/server-suite.js
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 8791;
const ORIGIN = 'http://127.0.0.1:' + PORT;
const DB_FILE = path.join(os.tmpdir(), 'bank-test-' + Date.now() + '.db');

let passed = 0;
let failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log(' ✅ ' + name); }
  else { failed++; console.log(' ❌ ' + name + (extra ? ' → ' + extra : '')); }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: Object.assign({}, process.env, { PORT: String(PORT), BANK_DB_FILE: DB_FILE }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    child.stdout.on('data', (d) => {
      out += String(d);
      if (out.includes('已启动') || out.includes('bank-core')) resolve(child);
    });
    child.stderr.on('data', (d) => { out += String(d); });
    child.on('exit', (code) => reject(new Error('服务端提前退出 code=' + code + '\n' + out)));
    setTimeout(() => reject(new Error('启动超时')), 10000);
  });
}

async function api(method, p, body, headers) {
  const res = await fetch(ORIGIN + p, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json', Referer: ORIGIN + '/' }, headers || {}),
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  return { status: res.status, json: json };
}

(async () => {
  let child = null;
  try {
    child = await startServer();

    // ① 健康检查
    const health = await api('GET', '/api/health');
    ok('GET /api/health 返回 ok', health.status === 200 && health.json && health.json.ok === true);

    // ② 会话令牌
    const sess = await api('GET', '/api/session');
    ok('GET /api/session 下发令牌', !!(sess.json && sess.json.token));
    const H = { 'X-Bank-Session': sess.json.token };

    // ③ 快照
    const snap = await api('GET', '/api/snapshot', null, H);
    ok('GET /api/snapshot 返回账户', !!(snap.json && snap.json.userProfile));
    const before = snap.json.userProfile.debitCard.available;

    // ④ T1：999 元免令牌
    const t1 = await api('POST', '/api/transfer', { payee: '张三', amount: 999 }, H);
    ok('¥999 无验证令牌可执行（T1）', t1.json && t1.json.ok === true, JSON.stringify(t1.json).slice(0, 80));

    // ⑤ T2：1000 元无令牌被拒
    const t2 = await api('POST', '/api/transfer', { payee: '张三', amount: 1000 }, H);
    ok('¥1,000 无验证令牌被拒绝（T2）', t2.json && t2.json.ok === false && /验证|令牌|安全/.test(t2.json.error || ''), JSON.stringify(t2.json).slice(0, 80));

    // ⑥ 验证令牌 → 带令牌可执行
    const v = await api('POST', '/api/verify/issue', { pin: '123456' }, H);
    ok('POST /api/verify/issue 下发验证令牌', !!(v.json && v.json.verifyToken));
    const HV = Object.assign({}, H, { 'X-Bank-Verify': v.json.verifyToken });
    const t2ok = await api('POST', '/api/transfer', { payee: '张三', amount: 1000 }, HV);
    ok('¥1,000 带验证令牌执行成功', t2ok.json && t2ok.json.ok === true, JSON.stringify(t2ok.json).slice(0, 80));

    // ⑦ T4：10 万转人工复核，不扣款
    const snap2 = await api('GET', '/api/snapshot', null, H);
    const availBefore = snap2.json.userProfile.debitCard.available;
    const v2 = await api('POST', '/api/verify/issue', { pin: '123456' }, H);
    const t4 = await api('POST', '/api/transfer', { payee: '张三', amount: 100000 }, Object.assign({}, H, { 'X-Bank-Verify': v2.json.verifyToken }));
    const snap3 = await api('GET', '/api/snapshot', null, H);
    ok('¥100,000 转人工复核且未扣款',
      !!(t4.json && t4.json.pendingReview === true) && snap3.json.userProfile.debitCard.available === availBefore,
      JSON.stringify(t4.json).slice(0, 80));

    // ⑧ 价格不可信：鲜花谎报价 -> 服务端按价目表
    const flower = await api('POST', '/api/flower/order', {
      recipient: '李四', bouquet: '简约玫瑰', cake: '无蛋糕', date: '2030-01-01', slot: 'afternoon',
      payMethod: '储蓄卡', price: 1
    }, H);
    ok('鲜花谎报价格被服务端纠正为 ¥299', !!(flower.json && flower.json.ok && flower.json.order.price === 299),
      JSON.stringify(flower.json && flower.json.order || flower.json).slice(0, 100));

    // ⑨ 订阅重复添加被拒
    const sub1 = await api('POST', '/api/subscription/add', { name: '某讯 VIP', cycle: '/月', price: 30 }, H);
    const sub2 = await api('POST', '/api/subscription/add', { name: '某讯 VIP', cycle: '/月', price: 30 }, H);
    ok('首次订阅成功、重复订阅被拒', !!(sub1.json && sub1.json.ok) && !!(sub2.json && sub2.json.ok === false));

    // ⑩ 复核审批需验证令牌
    const apply = await api('POST', '/api/card/apply', { cardType: '旅行信用卡', limit: 30000, purpose: '出行差旅' }, H);
    ok('信用卡申请进入复核队列', !!(apply.json && apply.json.reviewId));
    const apprNoTok = await api('POST', '/api/review/approve', { id: apply.json.reviewId }, H);
    ok('复核审批无令牌被拒', !!(apprNoTok.json && apprNoTok.json.ok === false));
    const v3 = await api('POST', '/api/verify/issue', { pin: '123456' }, H);
    const apprOk = await api('POST', '/api/review/approve', { id: apply.json.reviewId }, Object.assign({}, H, { 'X-Bank-Verify': v3.json.verifyToken }));
    ok('复核审批带令牌执行成功', !!(apprOk.json && apprOk.json.ok === true), JSON.stringify(apprOk.json).slice(0, 100));

    // ⑪ 审计与流水
    const audit = await api('GET', '/api/audit', null, H);
    const ledger = await api('GET', '/api/ledger?limit=5', null, H);
    ok('GET /api/audit 有记录', !!(audit.json && Array.isArray(audit.json.items) && audit.json.items.length > 0));
    ok('GET /api/ledger 有记录', !!(ledger.json && Array.isArray(ledger.json.items) && ledger.json.items.length > 0));

    // ⑫ 无令牌访问快照被拒
    const noSess = await api('GET', '/api/snapshot');
    ok('无会话访问快照被拒（401）', noSess.status === 401);
  } catch (e) {
    failed++;
    console.log(' ❌ 集成测试异常：' + e.message);
  } finally {
    if (child) {
      await new Promise(function (resolve) {
        const done = function () { resolve(); };
        child.once('exit', done);
        try { child.kill(); } catch (e) { done(); }
        setTimeout(done, 3000);
      });
    }
    ['', '-wal', '-shm'].forEach((suffix) => {
      for (let i = 0; i < 5; i++) {
        try { fs.unlinkSync(DB_FILE + suffix); break; } catch (e) { }
      }
    });
  }

  console.log('\n通过 ' + passed + '/' + (passed + failed) + '，失败 ' + failed);
  process.exitCode = failed ? 1 : 0;
})();
