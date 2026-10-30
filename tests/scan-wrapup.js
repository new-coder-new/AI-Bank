// 扫描：所有出现「已取消 / 未执行 / 取消成功」文案的函数，是否已接衔接
const fs = require('fs');
const lines = fs.readFileSync('js/flows/guide.js', 'utf8').split('\n');
let fn = '(top)';
let depth = 0;
const funcs = {};
let cur = null;
for (const line of lines) {
  const m = line.match(/^function (\w+)/);
  if (m) { fn = m[1]; cur = { name: fn, hasWrapup: false, msgs: [] }; funcs[fn] = cur; }
  if (cur) {
    if (/guideModuleWrapUp/.test(line)) cur.hasWrapup = true;
    if (/已取消|未执行取消|取消成功|已退出当前流程/.test(line) && /appendMessage|guideConfirmCardCollapse|guideCardLostCollapse/.test(line)) {
      cur.msgs.push(line.trim().slice(0, 80));
    }
  }
}
const targets = Object.values(funcs).filter((f) => f.msgs.length);
console.log('含取消类文案的函数：' + targets.length);
for (const f of targets) {
  console.log((f.hasWrapup ? '✅ ' : '❌ ') + f.name + '  [' + f.msgs.length + ' 条]');
  if (!f.hasWrapup) f.msgs.forEach((m) => console.log('     ' + m));
}
