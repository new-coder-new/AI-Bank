// ==========================================================================
//  经典脚本模块（TypeScript 源码，noCheck 转译）
//  编译产物：js/core/icons.js
//  说明：本层为「全局函数 + 动态状态」结构，采用 noCheck 转译；
//        对外符号统一在 types/global.d.ts 声明。
// ==========================================================================
// ==========================================================================
//  UI 图标层：统一线性图标，避免界面里堆满彩色 emoji
//  用法：bankIcon('transfer', 20) -> 返回可直接插入 innerHTML 的 SVG 字符串
// ==========================================================================
var BANK_ICONS = {
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z"/>',
    transfer: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    receive: '<path d="M17 7 7 17"/><path d="M16 17H7V8"/>',
    timer: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    bill: '<path d="M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2Z"/><path d="M9 8h6M9 12h6"/>',
    chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
    wealth: '<path d="M4 17l5-5 3 3 7-8"/><path d="M15 7h4v4"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><path d="M7 15h3"/>',
    bell: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10.5 19a2 2 0 0 0 3 0"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 6M17.5 13.5A5.5 5.5 0 0 1 21 19"/>',
    gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M12 9v11M4 13h16"/><path d="M12 9c-2.5 0-4.5-1.2-4.5-2.8S9 4 10.5 4.6 12 9 12 9Zm0 0c2.5 0 4.5-1.2 4.5-2.8S15 4 13.5 4.6 12 9 12 9Z"/>',
    shield: '<path d="M12 3 5 6v5.5c0 4.4 3 7.6 7 9.5 4-1.9 7-5.1 7-9.5V6l-7-3Z"/><path d="m9.2 12 2 2 3.6-3.8"/>',
    lock: '<rect x="4.5" y="10" width="15" height="10" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/><path d="M12 14v2"/>',
    alert: '<path d="M12 4 3 20h18L12 4Z"/><path d="M12 9.5V14M12 17h.01"/>',
    home: '<path d="m4 11 8-7 8 7"/><path d="M6 10v9h12v-9"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1.4"/><rect x="14" y="4" width="6" height="6" rx="1.4"/><rect x="4" y="14" width="6" height="6" rx="1.4"/><rect x="14" y="14" width="6" height="6" rx="1.4"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    repeat: '<path d="M17 4 20 7l-3 3"/><path d="M20 7H8a4 4 0 0 0-4 4"/><path d="M7 20l-3-3 3-3"/><path d="M4 17h12a4 4 0 0 0 4-4"/>',
    pie: '<path d="M12 4a8 8 0 1 0 8 8h-8V4Z"/><path d="M15 4.8A8 8 0 0 1 19.2 9H15V4.8Z"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.7 9.2a2.4 2.4 0 1 1 3.6 2.1c-.8.5-1.3 1-1.3 1.9"/><path d="M12 16.8h.01"/>',
    moon: '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z"/>',
    refresh: '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.6-2L20 12M4 12l2.3 5a7 7 0 0 0 11.6-2"/>',
    eye: '<path d="M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    arrow: '<path d="m9 6 6 6-6 6"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    withdraw: '<path d="M12 20V5M6 11l6-6 6 6"/>',
    scan: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/><path d="M8 12h8"/>',
    safe: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="12" cy="12" r="4"/><path d="M12 8v1M12 15v1M8 12h1M15 12h1"/>',
    more: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>'
};
function bankIcon(name, size) {
    var path = BANK_ICONS[name] || BANK_ICONS.grid;
    var s = size || 20;
    return '<svg class="bank-svg" viewBox="0 0 24 24" width="' + s + '" height="' + s + '"' +
        ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"' +
        ' stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
}
