// 自动演示录制（定稿 3:58 分镜）：Playwright 设备模拟 → 逐帧截图 → ffmpeg 合成 mp4
//
// 用法：
//   node scripts/auto-demo.mjs            # iPhone 13，默认节奏，约 4 分钟
//   node scripts/auto-demo.mjs --fast     # 快速自检（1 分钟内跑完全部步骤）
//   node scripts/auto-demo.mjs --pace=1.2 # 调整节奏（越大越慢）
//
// 输出：preview/demo/demo-<时间>.mp4（帧默认清理，--keep-frames 保留）
import { chromium, devices } from 'playwright';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { execFileSync } = require('node:child_process');
const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=')[1] : dflt;
};
const FAST = args.includes('--fast');
const ANDROID = args.includes('--android');
const URL = opt('url', 'http://127.0.0.1:8787/');
const FPS = Math.max(2, Math.min(10, Number(opt('fps', '4')) || 4));
const PACE = (FAST ? 0.12 : 1) * (Number(opt('pace', '1')) || 1);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = path.join(process.cwd(), 'preview', 'demo');
const FRAME_DIR = path.join(OUT_DIR, 'frames-' + STAMP);
const DEVICE = ANDROID ? devices['Pixel 7'] : devices['iPhone 13'];

fs.mkdirSync(FRAME_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const beat = (ms) => sleep(Math.round(ms * PACE));
const log = (...a) => console.log('[demo]', ...a);

let frames = 0;
let recording = true;
async function captureLoop(page) {
  while (recording) {
    try {
      await page.screenshot({ path: path.join(FRAME_DIR, String(frames).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 80 });
      frames++;
    } catch (e) { /* 切换瞬间截图失败，跳过 */ }
    await sleep(Math.round(1000 / FPS));
  }
}

// —— 页面操作 ——
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const hasText = async (page, re) => re.test(await bodyText(page));

async function waitFor(page, fn, timeout = 10000, label = '') {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await fn()) return true; } catch (e) { /* 重试 */ }
    await sleep(200);
  }
  log('  ⚠️ 超时：' + label);
  return false;
}

async function clickByText(page, re) {
  const src = re instanceof RegExp ? re.source : String(re);
  const ok = await page.evaluate(({ src }) => {
    const r = new RegExp(src);
    const list = Array.from(document.querySelectorAll('button,.guide-chip,.ui-btn-primary,.ui-link'))
      .filter((b) => r.test((b.textContent || '').trim()))
      .filter((b) => b.offsetParent !== null);
    const el = list[list.length - 1];
    if (!el) return false;
    el.click();
    return true;
  }, { src });
  await sleep(250);
  return ok;
}

async function say(page, text, waitAfter = 700) {
  await page.evaluate(({ text }) => {
    const input = document.getElementById('userInput');
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('sendBtn').click();
  }, { text });
  await sleep(waitAfter);
}

async function waitChip(page, re, timeout = 10000) {
  const src = re.source;
  return waitFor(page, async () => page.evaluate(({ src }) => {
    const r = new RegExp(src);
    return Array.from(document.querySelectorAll('.guide-chip')).some((c) => r.test((c.textContent || '').trim()) && c.offsetParent !== null);
  }, { src }), timeout, 'chip ' + re);
}

// 验证弹窗：交易密码 / 短信验证码弹窗 / 人脸弹窗
async function completeVerify(page, timeout = 5000) {
  const appeared = await waitFor(page, async () => page.evaluate(() =>
    !!document.querySelector('[id^="security-verify-"],[id^="otp-verify-"],[id^="face-verify-"]')), timeout, '验证弹窗');
  if (!appeared) return false;

  const kind = await page.evaluate(() => {
    if (document.querySelector('[id^="otp-verify-"]')) return 'otp';
    if (document.querySelector('[id^="face-verify-"]')) return 'face';
    return 'security';
  });

  if (kind === 'otp') {
    await page.evaluate(() => {
      const m = document.querySelector('[id^="otp-verify-"]');
      const input = m && m.querySelector('input');
      if (input) { input.value = '123456'; input.dispatchEvent(new Event('input', { bubbles: true })); }
      const ok = m && Array.from(m.querySelectorAll('button')).find((b) => /^确认$/.test((b.textContent || '').trim()));
      if (ok) ok.click();
    });
    await sleep(1200);
    return true;
  }
  if (kind === 'face') {
    await page.evaluate(() => {
      const m = document.querySelector('[id^="face-verify-"]');
      const b = m && Array.from(m.querySelectorAll('button')).find((x) => /开始识别|开始人脸/.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(2400);
    return true;
  }
  const sub = await page.evaluate(() => {
    const o = document.querySelector('[id^="security-verify-"]');
    const b = o && Array.from(o.querySelectorAll('button')).find((x) => /交易密码|指纹验证|短信验证/.test(x.textContent || ''));
    if (!b) return 'none';
    b.click();
    return (b.textContent || '').trim();
  });
  await sleep(400);
  if (/密码/.test(sub)) {
    await page.evaluate(() => {
      const o = document.querySelector('[id^="security-verify-"]');
      if (!o) return;
      ['1', '2', '3', '4', '5', '6'].forEach((d) => {
        const b = Array.from(o.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === d);
        if (b) b.click();
      });
    });
  } else if (/指纹/.test(sub)) {
    await page.evaluate(() => {
      const o = document.querySelector('[id^="security-verify-"]');
      const b = o && Array.from(o.querySelectorAll('button')).find((x) => /模拟指纹/.test(x.textContent || ''));
      if (b) b.click();
    });
  } else if (/短信/.test(sub)) {
    await page.evaluate(() => {
      const o = document.querySelector('[id^="security-verify-"]');
      if (!o) return;
      const input = o.querySelector('input');
      if (input) { input.value = '123456'; input.dispatchEvent(new Event('input', { bubbles: true })); }
      const ok = Array.from(o.querySelectorAll('button')).find((x) => /确认|验证/.test(x.textContent || ''));
      if (ok) ok.click();
    });
  }
  await sleep(800);
  return true;
}

async function fillOtp(page) {
  const has = await page.evaluate(() => !!document.querySelector('.bank-otp-input, .agent-verify-input'));
  if (!has) return false;
  await page.evaluate(() => {
    const i = document.querySelector('.bank-otp-input, .agent-verify-input');
    if (!i) return;
    i.value = '123456';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(300);
  return true;
}

async function resetStage(page, moduleKey) {
  await page.evaluate((mod) => {
    try { if (typeof window.guideResetAllSessions === 'function') window.guideResetAllSessions(); } catch (e) { }
    try { window.AGENT_PENDING_PLANS = {}; } catch (e) { }
    document.querySelectorAll('[id^="security-verify-"],[id^="face-verify-"],[id^="otp-verify-"]').forEach((n) => n.remove());
    window.currentModule = mod || 'chat';
  }, moduleKey);
  await sleep(250);
}

(async () => {
  log('设备:', ANDROID ? 'Pixel 7' : 'iPhone 13', '| 视口:', JSON.stringify(DEVICE.viewport), '| 节奏:', PACE);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--hide-scrollbars'] });
  const context = await browser.newContext({ ...DEVICE, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.guideHandleText === 'function', null, { timeout: 20000 });
  await page.evaluate(() => { window.confirm = () => true; });
  await beat(600);

  const cap = captureLoop(page);
  const results = [];
  const step = (name, ok) => { results.push([name, !!ok]); log((ok ? '✅ ' : '❌ ') + name); };

  // ① 主菜单
  log('① 主菜单');
  await beat(5000);

  // ② T1：700 元（密码）
  await say(page, '转账收款', 700);
  await waitFor(page, async () => hasText(page, /转账收款包含以下操作/), 6000, '转账菜单');
  await say(page, '给张三转账 700 元', 700);
  if (await waitChip(page, /^否$/)) await clickByText(page, /^否$/);
  await waitFor(page, async () => hasText(page, /请确认本次转账/), 8000, 'T1 确认卡');
  await clickByText(page, /确认转账|确认执行/);
  await completeVerify(page);
  step('转账 700（T1）', await waitFor(page, async () => hasText(page, /转账已完成|转账成功/), 8000, 'T1 结果'));
  await beat(1200);

  // ③ T2：手机号 1200（短信）
  await resetStage(page, 'transfer');
  await say(page, '转账给13800138000，1200元', 700);
  if (await waitChip(page, /^否$/)) await clickByText(page, /^否$/);
  await waitFor(page, async () => hasText(page, /请确认本次转账/), 8000, 'T2 确认卡');
  await clickByText(page, /确认转账|确认执行/);
  await completeVerify(page);
  await fillOtp(page);
  await clickByText(page, /验证并执行/);
  step('手机号转账 1200（T2）', await waitFor(page, async () => hasText(page, /转账已完成|转账成功/), 8000, 'T2 结果'));
  await beat(1200);

  // ④ T3：定时 20000（短信 + 人脸）
  await resetStage(page, 'transfer');
  await say(page, '明天下午3点转账给张三20000元', 700);
  if (await waitChip(page, /^不重复$/)) await clickByText(page, /^不重复$/);
  if (await waitChip(page, /^否$/)) await clickByText(page, /^否$/);
  const t3card = await waitFor(page, async () => page.evaluate(() => !!document.querySelector('.bank-otp-input')), 8000, 'T3 确认卡');
  if (t3card) {
    await fillOtp(page);
    if (await clickByText(page, /开始人脸确认/)) await sleep(2400);
    await clickByText(page, /确认定时转账|验证并执行/);
  }
  step('定时转账 20000（T3）', await waitFor(page, async () => hasText(page, /定时转账任务已创建/), 8000, 'T3 结果'));
  await beat(1200);

  // ⑤ AA 收款
  await resetStage(page, 'transfer');
  await say(page, '我和张三AA，我垫了600元', 700);
  if (await waitChip(page, /没有了/)) await clickByText(page, /没有了/);
  if (await waitChip(page, /发起AA收款/)) await clickByText(page, /发起AA收款/);
  step('AA 收款', await waitFor(page, async () => hasText(page, /已发起|已完成|AA收款/), 8000, 'AA 结果'));
  await beat(1200);

  // ⑥ 账单分析
  await resetStage(page, 'chat');
  await say(page, '账单与交易', 500);
  await say(page, '分析账单', 800);
  const bill = await waitFor(page, async () => page.evaluate(() => !!document.getElementById('bill-analysis-card')), 8000, '账单卡');
  if (bill) { await clickByText(page, /^本年$/); await beat(1500); await clickByText(page, /^本月$/); await beat(900); }
  step('账单分析（本月/本年）', bill);
  await beat(1200);

  // ⑦ 异常交易
  await say(page, '查看异常交易', 900);
  step('异常交易', await waitFor(page, async () => hasText(page, /异常交易|可疑/), 6000, '异常交易'));
  await beat(1200);

  // ⑧ 我的卡片 + 办卡
  await resetStage(page, 'chat');
  await say(page, '卡片管理', 500);
  await say(page, '查看我的信用卡', 800);
  step('我的卡片', await waitFor(page, async () => hasText(page, /白金信用卡|尾号/), 6000, '卡片列表'));
  await beat(800);

  await say(page, '办一张标准金卡，额度5万', 800);
  await say(page, '出行差旅', 700);
  if (await waitChip(page, /提交申请/)) await clickByText(page, /提交申请/);
  step('卡片申请（5 万）', await waitFor(page, async () => hasText(page, /已提交|审核中|申请已提交|复核/), 8000, '办卡结果'));
  await beat(1000);

  // ⑨ 额度调整
  await say(page, '白金卡额度提到8万', 700);
  await say(page, '消费需求增加', 600);
  if (await waitChip(page, /确认|提交/)) await clickByText(page, /确认|提交/);
  await completeVerify(page, 3000);
  step('额度调整到 8 万', await waitFor(page, async () => hasText(page, /调整|额度/), 6000, '调额结果'));
  await beat(1000);

  // ⑩ 交易限制
  await say(page, '尾号6789的卡，单笔限额2万', 700);
  await say(page, '不变', 600);
  if (await waitChip(page, /确认|提交/)) await clickByText(page, /确认|提交/);
  await completeVerify(page, 3000);
  step('交易限制（单笔 2 万）', await waitFor(page, async () => hasText(page, /限额/), 6000, '限额结果'));
  await beat(1000);

  // ⑪ 理财清单 + 申购 + 持仓
  await resetStage(page, 'chat');
  await page.evaluate(() => {
    try {
      window.riskProfile = { level: 3, name: '平衡型', date: '2026-06-01' };
      window.mockData.userProfile.riskProfile = window.riskProfile;
    } catch (e) { }
  });
  await say(page, '理财', 500);
  await say(page, '有哪些理财产品', 800);
  step('在售产品清单', await waitFor(page, async () => hasText(page, /在售理财产品|起购/), 6000, '产品清单'));

  await say(page, '申购1001，5000元', 700);
  if (await waitChip(page, /确认申购/)) await clickByText(page, /确认申购/);
  await completeVerify(page, 4000);
  await fillOtp(page);
  await clickByText(page, /验证并执行/);
  step('理财申购 5000', await waitFor(page, async () => hasText(page, /申购已提交|申购详情/), 8000, '申购结果'));
  await beat(800);

  await say(page, '查看我的持仓', 900);
  step('我的持仓', await waitFor(page, async () => hasText(page, /持仓|累计收益/), 6000, '持仓'));
  await beat(1000);

  // ⑫ 订阅：取消全部 → 可订阅清单 → 订阅阅读 → 关闭续费 → 我的订阅
  await resetStage(page, 'sub');
  await say(page, '取消所有订阅', 700);
  if (await waitChip(page, /确认全部取消/)) await clickByText(page, /确认全部取消/);
  step('取消所有订阅', await waitFor(page, async () => hasText(page, /已取消全部|已取消/), 8000, '取消结果'));
  await beat(800);

  await say(page, '能订哪些会员', 900);
  step('可订阅会员', await waitFor(page, async () => hasText(page, /可订阅的服务如下/), 6000, '会员清单'));

  await say(page, '订阅某阅读APP会员年卡', 700);
  if (await waitChip(page, /^否$/)) await clickByText(page, /^否$/);
  if (await waitChip(page, /确认添加/)) await clickByText(page, /确认添加/);
  step('添加订阅（重复拦截）', await waitFor(page, async () => hasText(page, /已有有效订阅|已存在|已添加|添加成功/), 8000, '添加结果'));
  await beat(800);

  await say(page, '关闭某阅读APP会员的自动续费', 700);
  if (await waitChip(page, /确认|关闭/)) await clickByText(page, /确认|关闭/);
  step('管理自动续费（关闭）', await waitFor(page, async () => hasText(page, /已关闭|自动续费/), 6000, '续费结果'));
  await beat(800);

  await say(page, '查看我的订阅', 900);
  step('我的订阅', await waitFor(page, async () => hasText(page, /我的订阅/), 8000, '我的订阅'));
  await beat(1000);

  // ⑬ 生日鲜花（先确保有最近生日联系人，再直接进确认表单）
  await resetStage(page, 'chat');
  await page.evaluate(() => {
    try {
      const contacts = window.mockData.contacts || [];
      const c = contacts.find((x) => x.name === '林小雨') || contacts[0];
      const d = new Date();
      d.setDate(d.getDate() + 1);
      const md = [d.getMonth() + 1, d.getDate()];
      if (c) { c.birthday = String(md[1]).padStart(2, '0') + '-' + String(md[0]).padStart(2, '0'); }
      const bcs = window.mockData.userProfile.birthdayContacts || [];
      const target = bcs.find((x) => x.name === '林小雨') || bcs[0];
      if (target) { target.monthDay = md; target.birthday = c ? c.birthday : target.birthday; }
      if (typeof window.saveUserData === 'function') window.saveUserData();
      if (typeof window.guideStartFlowerForContact === 'function') window.guideStartFlowerForContact('林小雨');
      else if (typeof window.guideStartFlowerOrder === 'function') window.guideStartFlowerOrder();
    } catch (e) { }
  });
  await beat(700);
  if (await waitChip(page, /提交订单/)) await clickByText(page, /提交订单/);
  step('生日鲜花（订花+蛋糕）', await waitFor(page, async () => hasText(page, /订单已提交|已下单|鲜花订单/), 8000, '鲜花结果'));
  await beat(1000);

  // ⑭ 复核审批：通过刚办的信用卡申请
  await page.evaluate(() => { try { window.showUserInfoFromTopbar(); } catch (e) { } });
  await beat(500);
  await page.evaluate(() => { try { window.switchUserInfoTab('reviews'); } catch (e) { } });
  await beat(600);
  if (await waitChip(page, /管理员审批/)) await clickByText(page, /管理员审批/);
  if (await waitChip(page, /^通过$/)) await clickByText(page, /^通过$/);
  await completeVerify(page, 3000);
  step('复核审批（通过）', await waitFor(page, async () => hasText(page, /已通过|审批/), 7000, '审批结果'));
  await beat(800);

  // ⑮ 用户信息：账户总览 → 交易记录
  await page.evaluate(() => { try { window.switchUserInfoTab('overview'); } catch (e) { } });
  await beat(900);
  await page.evaluate(() => { try { window.switchUserInfoTab('txns'); } catch (e) { } });
  step('用户信息（总览/交易记录）', await waitFor(page, async () => hasText(page, /交易记录|收入|支出/), 6000, '交易记录'));
  await beat(900);

  // ⑯ 重置演示数据
  await page.evaluate(() => { try { window.showUserInfoFromTopbar(); } catch (e) { } });
  await beat(400);
  await clickByText(page, /重置演示数据/);
  await beat(600);
  await clickByText(page, /确定|确认/);
  await sleep(1500);
  step('重置演示数据', await waitFor(page, async () => hasText(page, /智能金融助手|今日提醒|欢迎/), 6000, '重置结果'));
  await beat(1200);

  recording = false;
  await cap;
  await context.close();
  await browser.close();

  log('帧数:', frames);
  console.log('\n[结果] ' + results.map(([k, v]) => k + '：' + (v ? '✅' : '❌')).join(' | '));

  const pattern = path.join(FRAME_DIR, '%05d.jpg');
  const mp4 = path.join(OUT_DIR, 'demo-' + STAMP + '.mp4');
  execFileSync(ffmpeg, ['-y', '-framerate', String(FPS), '-i', pattern, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-crf', '23', mp4], { stdio: 'ignore' });
  log('完成：', mp4);
  if (!args.includes('--keep-frames')) fs.rmSync(FRAME_DIR, { recursive: true, force: true });
})();
