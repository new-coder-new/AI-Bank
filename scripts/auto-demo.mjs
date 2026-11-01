// 自动演示录制：Playwright 设备模拟（默认 iPhone 13）+ 逐帧截图，ffmpeg 合成 5 分钟视频。
//
// 用法：
//   node scripts/auto-demo.mjs                  # 默认 iPhone 13，约 5 分钟
//   node scripts/auto-demo.mjs --android        # Pixel 7（Chromium 内核）
//   node scripts/auto-demo.mjs --fast           # 快速自检（不等待，约 1 分钟）
//   node scripts/auto-demo.mjs --url=http://10.136.54.242:8787 --fps=4
//
// 输出：preview/demo/demo-<时间>.mp4 / .webm，帧文件在 preview/demo/frames-*/
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
const ANDROID = args.includes('--android');
const FAST = args.includes('--fast');
const URL = opt('url', 'http://127.0.0.1:8787/');
const FPS = Math.max(2, Math.min(10, Number(opt('fps', '4')) || 4));
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT_DIR = path.join(process.cwd(), 'preview', 'demo');
const FRAME_DIR = path.join(OUT_DIR, 'frames-' + STAMP);
const DEVICE = ANDROID ? devices['Pixel 7'] : devices['iPhone 13'];
const PACE = (FAST ? 0.15 : 1) * (Number(opt('pace', '1.3')) || 1.3);

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
    } catch (e) { /* 切页瞬间截图失败，跳过 */ }
    await sleep(Math.round(1000 / FPS));
  }
}

// —— 通用页面操作 ——
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const hasText = async (page, re) => re.test(await bodyText(page));

async function waitFor(page, fn, timeout = 12000, label = '') {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if (await fn()) return true; } catch (e) { /* 重试 */ }
    await sleep(250);
  }
  log('  等待超时：' + label);
  return false;
}

async function clickByText(page, re) {
  const src = re instanceof RegExp ? re.source : String(re);
  const ok = await page.evaluate(({ src }) => {
    const r = new RegExp(src);
    const list = Array.from(document.querySelectorAll('button,.guide-chip'))
      .filter((b) => r.test((b.textContent || '').trim()))
      .filter((b) => b.offsetParent !== null);
    const el = list[list.length - 1];
    if (!el) return false;
    el.click();
    return true;
  }, { src });
  await sleep(400);
  return ok;
}

async function say(page, text, waitAfter = 900) {
  await page.evaluate(({ text }) => {
    const input = document.getElementById('userInput');
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('sendBtn').click();
  }, { text });
  await sleep(waitAfter);
}

async function waitChip(page, re, timeout = 12000) {
  const src = re.source;
  return waitFor(page, async () => page.evaluate(({ src }) => {
    const r = new RegExp(src);
    return Array.from(document.querySelectorAll('.guide-chip')).some((c) => r.test((c.textContent || '').trim()));
  }, { src }), timeout, 'chip ' + re);
}

// 完成验证弹窗：安全验证（密码/指纹/短信）、短信验证码弹窗、人脸弹窗
async function completeVerify(page, timeout = 6000) {
  const appeared = await waitFor(page, async () => page.evaluate(() =>
    !!document.querySelector('[id^="security-verify-"],[id^="otp-verify-"],[id^="face-verify-"]')), timeout, '验证弹窗');
  if (!appeared) return false;

  // 短信验证码弹窗（otp-verify）
  const otpPopup = await page.evaluate(() => !!document.querySelector('[id^="otp-verify-"]'));
  if (otpPopup) {
    await page.evaluate(() => {
      const m = document.querySelector('[id^="otp-verify-"]');
      const input = m && m.querySelector('input');
      if (input) { input.value = '123456'; input.dispatchEvent(new Event('input', { bubbles: true })); }
      const ok = m && Array.from(m.querySelectorAll('button')).find((b) => /^确认$/.test((b.textContent || '').trim()));
      if (ok) ok.click();
    });
    await sleep(1500);
    return true;
  }

  // 人脸弹窗
  const facePopup = await page.evaluate(() => !!document.querySelector('[id^="face-verify-"]'));
  if (facePopup) {
    await page.evaluate(() => {
      const m = document.querySelector('[id^="face-verify-"]');
      const b = m && Array.from(m.querySelectorAll('button')).find((x) => /开始识别|开始人脸/.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(2600);
    return true;
  }

  const kind = await page.evaluate(() => {
    const overlay = document.querySelector('[id^="security-verify-"]');
    const btn = overlay && Array.from(overlay.querySelectorAll('button')).find((b) => /交易密码|指纹验证|短信验证/.test(b.textContent || ''));
    if (!btn) return 'none';
    btn.click();
    return (btn.textContent || '').trim();
  });
  await sleep(500);
  if (/密码/.test(kind)) {
    await page.evaluate(() => {
      const overlay = document.querySelector('[id^="security-verify-"]');
      if (!overlay) return;
      ['1', '2', '3', '4', '5', '6'].forEach((d) => {
        const b = Array.from(overlay.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === d);
        if (b) b.click();
      });
    });
  } else if (/指纹/.test(kind)) {
    await page.evaluate(() => {
      const overlay = document.querySelector('[id^="security-verify-"]');
      const b = overlay && Array.from(overlay.querySelectorAll('button')).find((x) => /模拟指纹/.test(x.textContent || ''));
      if (b) b.click();
    });
  } else if (/短信/.test(kind)) {
    await page.evaluate(() => {
      const overlay = document.querySelector('[id^="security-verify-"]');
      if (!overlay) return;
      const input = overlay.querySelector('input');
      if (input) { input.value = '123456'; input.dispatchEvent(new Event('input', { bubbles: true })); }
      const ok = Array.from(overlay.querySelectorAll('button')).find((x) => /确认|验证/.test(x.textContent || ''));
      if (ok) ok.click();
    });
  }
  await sleep(900);
  return true;
}

// 段与段之间清场：结束会话、清掉待确认计划、关闭弹窗
async function resetStage(page, moduleKey) {
  await page.evaluate((mod) => {
    try { if (typeof window.guideResetAllSessions === 'function') window.guideResetAllSessions(); } catch (e) { }
    try { window.AGENT_PENDING_PLANS = {}; } catch (e) { }
    document.querySelectorAll('[id^="security-verify-"],[id^="face-verify-"],[id^="otp-verify-"]').forEach((n) => n.remove());
    window.currentModule = mod || 'chat';
  }, moduleKey);
  await sleep(400);
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
  await sleep(400);
  return true;
}

(async () => {
  log('设备:', ANDROID ? 'Pixel 7 (Chromium)' : 'iPhone 13 (WebKit 近似)', '| 视口:', JSON.stringify(DEVICE.viewport), '| URL:', URL);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--hide-scrollbars'] });
  const context = await browser.newContext({ ...DEVICE, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.guideHandleText === 'function', null, { timeout: 20000 });
  await page.evaluate(() => { window.confirm = () => true; });
  await sleep(1200);

  const cap = captureLoop(page);
  const results = [];

  // ① 开场：主菜单
  log('① 主菜单');
  await beat(6000);

  // ② 转账 800（T1：指纹/密码）
  log('② 转账 800（T1）');
  await say(page, '转账收款', 1200);
  await waitFor(page, async () => hasText(page, /转账收款包含以下操作/), 8000, '转账菜单');
  await beat(1200);
  await say(page, '给张三转账 800 元', 1500);
  await waitChip(page, /^否$/);
  await beat(1500);
  await clickByText(page, /^否$/);
  await waitFor(page, async () => hasText(page, /请确认本次转账/), 12000, '转账确认卡');
  await beat(1800);
  await clickByText(page, /确认转账|确认执行/);
  await completeVerify(page);
  const okTransfer = await waitFor(page, async () => hasText(page, /转账已完成|转账成功|已转账/), 12000, '转账完成');
  results.push(['转账 800', okTransfer]);
  await beat(10000);

  // ③ 定时转账 1000（T2：短信验证）
  log('③ 定时转账 1000（T2）');
  await resetStage(page, 'transfer');
  await say(page, '明天下午3点转账给张三1000元', 1500);
  const chipRepeat = await waitChip(page, /^不重复$/, 15000);
  if (chipRepeat) { await beat(1200); await clickByText(page, /^不重复$/); }
  await beat(1500);
  if (await waitChip(page, /^否$/, 4000)) { await clickByText(page, /^否$/); await beat(1200); }
  const hasCard = await waitFor(page, async () => page.evaluate(() => !!document.querySelector('.bank-otp-input')), 15000, '定时确认卡');
  if (hasCard) {
    await beat(1800);
    await fillOtp(page);
    await clickByText(page, /确认定时转账|验证并执行/);
    const okTimed = await waitFor(page, async () => hasText(page, /定时转账任务已创建/), 12000, '定时任务创建');
    results.push(['定时转账 1000', okTimed]);
  } else {
    results.push(['定时转账 1000', false]);
  }
  await beat(10000);

  // ④ 账单分析（本月 ↔ 本年）
  log('④ 账单分析');
  await resetStage(page, 'chat');
  await say(page, '账单与交易', 1000);
  await waitFor(page, async () => hasText(page, /账单与交易包含以下操作|账单分析/), 8000, '账单菜单');
  await beat(1200);
  await say(page, '分析账单', 1500);
  const hasBill = await waitFor(page, async () => page.evaluate(() => !!document.getElementById('bill-analysis-card')), 12000, '账单卡');
  results.push(['账单分析', hasBill]);
  await beat(3500);
  if (hasBill) {
    await clickByText(page, /^本年$/);
    await beat(4000);
    await clickByText(page, /^本月$/);
    await beat(3000);
  }
  await beat(8000);

  // ⑤ 理财申购（风险测评 / 确认卡 / 验证）
  log('⑤ 理财申购');
  await resetStage(page, 'chat');
  await page.evaluate(() => {
    try {
      window.riskProfile = { level: 3, name: '平衡型', date: '2026-06-01' };
      window.mockData.userProfile.riskProfile = window.riskProfile;
    } catch (e) { }
  });
  await say(page, '理财', 1000);
  await waitFor(page, async () => hasText(page, /理财包含以下操作/), 8000, '理财菜单');
  await beat(1200);
  await say(page, '申购1001，5000元', 1500);
  await beat(1800);
  if (await hasText(page, /风险测评|开始测评/)) { await clickByText(page, /开始测评|立即测评/); await beat(2500); }
  const buyCard = await waitFor(page, async () => hasText(page, /确认申购/), 15000, '申购确认卡');
  if (buyCard) {
    await beat(1800);
    await clickByText(page, /确认申购/);
    await beat(800);
    await completeVerify(page);
    await fillOtp(page);
    await clickByText(page, /验证并执行/);
    const okBuy = await waitFor(page, async () => hasText(page, /申购已提交|申购详情|已自动加入持仓/), 15000, '申购结果');
    results.push(['理财申购', okBuy]);
  } else {
    results.push(['理财申购', false]);
  }
  await beat(9000);

  // ⑥ 订阅：我的订阅 + 重复拦截
  log('⑥ 订阅管理');
  await resetStage(page, 'sub');
  await say(page, '查看我的订阅', 1500);
  const mySubs = await waitFor(page, async () => hasText(page, /我的订阅（共/), 10000, '我的订阅');
  results.push(['我的订阅', mySubs]);
  await beat(3000);
  await say(page, '订阅某视频平台VIP年卡', 1800);
  if (await waitChip(page, /^否$/, 8000)) { await clickByText(page, /^否$/); await beat(1200); }
  if (await waitChip(page, /确认添加/, 12000)) {
    await clickByText(page, /确认添加/);
    const dupBlocked = await waitFor(page, async () => hasText(page, /已有有效订阅|订阅未开通/), 10000, '重复订阅拦截');
    results.push(['重复订阅拦截', dupBlocked]);
  } else {
    results.push(['重复订阅拦截', false]);
  }
  await beat(8000);

  // ⑦ 收尾：重置演示数据
  log('⑦ 重置演示数据');
  await resetStage(page, 'chat');
  await beat(1500);
  await page.evaluate(() => { if (typeof window.showUserInfoFromTopbar === 'function') window.showUserInfoFromTopbar(); });
  await beat(2000);
  await clickByText(page, /重置演示数据/);
  await beat(1500);
  await clickByText(page, /确定|确认/);
  await beat(6000);

  recording = false;
  await cap;
  await context.close();
  await browser.close();

  log('帧数:', frames);
  console.log('\n[结果] ' + results.map(([k, v]) => k + '：' + (v ? '✅' : '❌')).join(' | '));

  const pattern = path.join(FRAME_DIR, '%05d.jpg');
  const mp4 = path.join(OUT_DIR, 'demo-' + STAMP + '.mp4');
  const runFf = (out, codec, extra) => execFileSync(ffmpeg, [
    '-y', '-framerate', String(FPS), '-i', pattern,
    '-c:v', codec, '-pix_fmt', 'yuv420p', ...(extra || []), out
  ], { stdio: 'ignore' });

  log('合成 mp4 …');
  runFf(mp4, 'libx264', ['-movflags', '+faststart', '-crf', '23']);
  log('完成：', mp4);
  if (args.includes('--keep-frames')) {
    log('帧目录（--keep-frames 保留）：', FRAME_DIR);
  } else {
    fs.rmSync(FRAME_DIR, { recursive: true, force: true });
    log('已清理帧目录（需要保留加 --keep-frames）');
  }
})();
