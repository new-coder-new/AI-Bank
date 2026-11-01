// 生成/更新 README 用的界面预览图（preview/*.png）
// 用法：node scripts/capture-previews.mjs
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.DEMO_URL || 'http://127.0.0.1:8787/';
const OUT = path.join(process.cwd(), 'preview');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--hide-scrollbars'] });

async function shot(ctxOpts, file, action) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.guideHandleText === 'function', null, { timeout: 20000 });
  await sleep(1200);
  if (action) await action(page);
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, file) });
  console.log('[preview] ' + file);
  await ctx.close();
}

const clickText = (page, re) => page.evaluate((src) => {
  const r = new RegExp(src);
  const list = Array.from(document.querySelectorAll('.guide-chip,button'))
    .filter((b) => r.test((b.textContent || '').trim()) && b.offsetParent);
  const el = list[list.length - 1];
  if (el) el.click();
}, re.source);

// 1) 桌面首页
await shot({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' }, 'bank-home-desktop.png');

// 2) 移动首页（iPhone 13）
await shot({ ...devices['iPhone 13'], locale: 'zh-CN' }, 'bank-home-mobile.png');

// 3) 引导式转账确认卡
await shot({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' }, 'guided-transfer-confirm.png', async (page) => {
  await page.evaluate(() => window.guideHandleText('给张三转账800元'));
  await sleep(1200);
  await clickText(page, /^否$/);
  await sleep(1200);
  await clickText(page, /确认转账|确认执行/).catch(() => { });
  await sleep(800);
});

// 4) 定时转账确认卡
await shot({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' }, 'timed-transfer-confirm.png', async (page) => {
  await page.evaluate(() => {
    window.guideResetAllSessions();
    window.currentModule = 'chat';
  });
  await page.evaluate(() => {
    const task = { payee: '张三', account: '6222 **** **** 1234', amount: 20000, date: '2026-11-02', time: '15:00', repeat: '不重复', remark: '', channel: '对话' };
    openScheduledTransferConfirm(task, { okLabel: '确认定时转账' });
  });
  await sleep(1200);
});

// 5) 账单分析（本月）
await shot({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' }, 'bill-analysis.png', async (page) => {
  await page.evaluate(() => { window.guideResetAllSessions(); window.currentModule = 'chat'; });
  await page.evaluate(() => window.guideHandleText('分析账单'));
  await sleep(1800);
});

// 6) 理财确认卡
await shot({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' }, 'wealth-confirm.png', async (page) => {
  await page.evaluate(() => {
    window.guideResetAllSessions();
    window.currentModule = 'wealth';
    window.riskProfile = { level: 3, name: '平衡型', date: '2026-06-01' };
    window.mockData.userProfile.riskProfile = window.riskProfile;
  });
  await page.evaluate(() => window.guideHandleText('申购1001，5000元'));
  await sleep(1600);
});

await browser.close();
console.log('[preview] 完成');
