// 启动一个「手机大小」的 Chrome 窗口（Playwright 设备模拟），用于手动演示 / 录屏。
//
// 用法：
//   node scripts/mobile-browser.mjs                # iPhone 13（390×664 视口，DPR 3，触屏）
//   node scripts/mobile-browser.mjs --android      # Pixel 7
//   node scripts/mobile-browser.mjs --size=390x844 # 自定义逻辑分辨率
//   node scripts/mobile-browser.mjs --url=http://10.136.54.242:8787
//
// 说明：窗口内会自动接管 confirm/alert（重置数据、删除等操作直接确认），
//       并使用固定用户目录，关闭窗口后本地缓存仍保留。
import { chromium, devices } from 'playwright';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=')[1] : dflt;
};
const ANDROID = args.includes('--android');
const URL = opt('url', 'http://127.0.0.1:8787/');
const size = (opt('size', '') || '').split('x').map(Number);

const device = ANDROID ? devices['Pixel 7'] : devices['iPhone 13'];
const viewport = size.length === 2 && size[0] && size[1] ? { width: size[0], height: size[1] } : device.viewport;

const profileRoot = process.env.LOCALAPPDATA || os.homedir();
const userDataDir = path.join(profileRoot, 'zhiyin-mobile-profile');
fs.mkdirSync(userDataDir, { recursive: true });

const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chrome',
  headless: false,
  viewport,
  screen: viewport,
  deviceScaleFactor: device.deviceScaleFactor || 2,
  isMobile: true,
  hasTouch: true,
  userAgent: device.userAgent,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  args: ['--hide-scrollbars', `--window-size=${viewport.width},${viewport.height + 120}`]
});

const page = context.pages()[0] || await context.newPage();

// 关键：接管原生弹窗，否则 Playwright 默认「取消」，重置数据/删除类操作都会失败
page.on('dialog', async (dialog) => {
  console.log('[mobile] 弹窗已自动确认：' + String(dialog.message()).replace(/\s+/g, ' ').slice(0, 60));
  try { await dialog.accept(); } catch (e) { /* 忽略 */ }
});

async function harden() {
  try {
    await page.evaluate(() => {
      window.confirm = () => true;
      window.alert = () => { };
      window.prompt = (_m, d) => (d === undefined ? '' : d);
    });
  } catch (e) { /* 页面切换中，忽略 */ }
}
page.on('load', harden);

await page.goto(URL, { waitUntil: 'load' });
await harden();
console.log('[mobile] 已打开 ' + URL + ' | 视口 ' + viewport.width + '×' + viewport.height + ' | 设备模拟：' + (ANDROID ? 'Pixel 7' : 'iPhone 13'));
console.log('[mobile] confirm/alert 已接管；用户目录：' + userDataDir);
console.log('[mobile] 窗口保持打开，关闭窗口即退出。');

await new Promise((resolve) => { context.on('close', resolve); });
console.log('[mobile] 窗口已关闭');
