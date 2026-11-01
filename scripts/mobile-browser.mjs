// 启动一个「手机大小」的 Chrome 窗口（Playwright 设备模拟），用于手动演示 / 录屏。
//
// 用法：
//   node scripts/mobile-browser.mjs                # iPhone 13（390×844，DPR 3，触屏）
//   node scripts/mobile-browser.mjs --android      # Pixel 7
//   node scripts/mobile-browser.mjs --size=390x844 # 自定义逻辑分辨率
//   node scripts/mobile-browser.mjs --url=http://10.136.54.242:8787
//
// 窗口保持打开，关掉窗口即退出。
import { chromium, devices } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.split('=')[1] : dflt;
};
const ANDROID = args.includes('--android');
const URL = opt('url', 'http://127.0.0.1:8787/');
const size = (opt('size', '') || '').split('x').map(Number);

const device = ANDROID ? devices['Pixel 7'] : devices['iPhone 13'];
const viewport = size.length === 2 && size[0] && size[1]
  ? { width: size[0], height: size[1] }
  : device.viewport;

const context = await chromium.launchPersistentContext('', {
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
await page.goto(URL, { waitUntil: 'load' });
console.log('[mobile] 已打开 ' + URL + ' | 视口 ' + viewport.width + '×' + viewport.height + ' | 设备模拟：' + (ANDROID ? 'Pixel 7' : 'iPhone 13'));
console.log('[mobile] 窗口保持打开，关闭窗口即退出。');

// 保持进程存活直到窗口关闭
await new Promise((resolve) => {
  context.on('close', resolve);
});
console.log('[mobile] 窗口已关闭');
