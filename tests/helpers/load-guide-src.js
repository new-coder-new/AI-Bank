// 测试公共加载器：按运行顺序拼接引导层源码（拆分后由多处复用）
// 用法：const loadGuideSource = require('./helpers/load-guide-src');
const fs = require('node:fs');
const path = require('node:path');

const FLOWS = path.join(__dirname, '..', '..', 'js', 'flows');
const CORE = path.join(__dirname, '..', '..', 'js', 'core');
const ORDER = [
  'guide-rules.js',
  'guide-ai.js',
  'guide-menu.js',
  'guide-transfer.js',
  'guide-wealth.js',
  'guide-sub.js',
  'guide-flower.js',
  'guide-card.js'
];

function loadGuideSource() {
  const CORE_FILES = ['session.js'];
  return ORDER
    .map((f) => {
      const p = path.join(FLOWS, f);
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    })
    .filter(Boolean)
    .join('\n') + '\n' + CORE_FILES.map(function (f) { return fs.readFileSync(path.join(CORE, f), 'utf8'); }).join('\n');
}

module.exports = loadGuideSource;
module.exports.ORDER = ORDER;
