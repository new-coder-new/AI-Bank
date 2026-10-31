// ==========================================================================
//  引导层（TypeScript 源码，noCheck 转译）
//  编译产物：js/flows/guide-flower.js
//  说明：该层是「经典脚本 + 全局状态」结构，状态对象（GUIDE_*）随流程变化，
//        因此采用 noCheck 转译；对外入口在 types/global.d.ts 声明。
// ==========================================================================
// 引导层：生日鲜花（由 guide.js 拆分而来）
// 距离某个「月-日」还有多少天（当天为 0）
function guideDaysUntilMonthDay(m, d) {
    var now = new Date();
    var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var next = new Date(now.getFullYear(), m - 1, d);
    if (next < todayMid)
        next = new Date(now.getFullYear() + 1, m - 1, d);
    return Math.round((Number(next) - Number(todayMid)) / 86400000);
}
// 某年某月第 n 个周日；若已过则顺延到明年
function guideNthSundayNext(month, nth) {
    function nthSunday(y) {
        var first = new Date(y, month - 1, 1);
        var offset = (7 - first.getDay()) % 7; // 第一个周日
        return new Date(y, month - 1, 1 + offset + (nth - 1) * 7);
    }
    var now = new Date();
    var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var d = nthSunday(now.getFullYear());
    if (d < todayMid)
        d = nthSunday(now.getFullYear() + 1);
    var days = Math.round((Number(d) - Number(todayMid)) / 86400000);
    return {
        date: d,
        str: d.getFullYear() + '-' + guidePad2(String(d.getMonth() + 1)) + '-' + guidePad2(String(d.getDate())),
        days: days,
        text: days === 0 ? '就是今天' : '还有 ' + days + ' 天'
    };
}
// 主菜单提醒卡：一张卡里放「异常交易 / 生日 / 情人节」三类提醒
// 联系人生日在「本月」时，自动锁定活期 ¥1000 作为生日鲜花预留（月末自动解冻）
function guideEnsureBirthdayHold() {
    try {
        var u = mockData.userProfile;
        if (!u || !u.debitCard)
            return null;
        var d = u.debitCard;
        var now = new Date();
        var ym = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
        var month = now.getMonth() + 1;
        var PER = 1000; // 每位本月过生日的联系人各锁 ¥1000
        var today = ym + '-' + ('0' + now.getDate()).slice(-2);
        var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        var releaseDate = lastDay.getFullYear() + '-' + ('0' + (lastDay.getMonth() + 1)).slice(-2) + '-' + ('0' + lastDay.getDate()).slice(-2);
        // 本月过生日的联系人
        var list = (u.birthdayContacts || []).slice();
        var targets = [];
        list.forEach(function (c) {
            var parts = String(c.birthday || '').split('-').map(Number).filter(function (x) { return !isNaN(x); });
            var m = parts.length >= 2 ? parts[parts.length - 2] : NaN;
            if (m === month && c.name)
                targets.push(c.name);
        });
        if (!targets.length)
            return null;
        if (!Array.isArray(u.flowerHolds))
            u.flowerHolds = [];
        if (!d.frozenItems)
            d.frozenItems = [];
        if (!u.lockedFunds)
            u.lockedFunds = [];
        // 每位联系人一笔：本月已锁过的跳过
        targets.forEach(function (name) {
            var key = 'FZ-FLOWER-' + ym + '-' + name;
            var exists = u.flowerHolds.some(function (h) { return h && h.key === key && h.status === '已锁定'; });
            if (exists)
                return;
            if ((Number(d.available) || 0) < PER)
                return; // 可用不足则跳过
            d.available = Math.round((Number(d.available) - PER) * 100) / 100;
            d.frozen = Math.round((Number(d.frozen) || 0) + PER * 100) / 100;
            d.frozenItems.push({
                id: key, type: '生日鲜花预留', reason: name + ' 本月生日',
                amount: PER, freezeDate: today, releaseDate: releaseDate, status: '冻结中'
            });
            u.lockedFunds.push({
                purpose: '生日鲜花预留（' + name + '）', amount: PER, freezeDate: today, releaseDate: releaseDate,
                autoTransfer: false, frozen: true, status: '已锁定', freezeId: key
            });
            u.flowerHolds.push({
                key: key, month: ym, name: name, amount: PER,
                freezeDate: today, releaseDate: releaseDate, status: '已锁定'
            });
        });
        // 汇总给界面展示
        var active = u.flowerHolds.filter(function (h) { return h && h.month === ym && h.status === '已锁定'; });
        if (!active.length)
            return null;
        var total = active.reduce(function (s2, h) { return s2 + (Number(h.amount) || 0); }, 0);
        u.flowerHold = {
            month: ym,
            count: active.length,
            amount: total,
            names: active.map(function (h) { return h.name; }),
            releaseDate: releaseDate
        };
        if (typeof saveUserData === 'function')
            saveUserData();
        return u.flowerHold;
    }
    catch (e) {
        return null;
    }
}
function guideHomeRemindersHtml() {
    var rows = [];
    var hold = (typeof guideEnsureBirthdayHold === 'function') ? guideEnsureBirthdayHold() : null;
    // ① 异常交易
    var abnormal = [];
    try {
        abnormal = (typeof detectAbnormalTxns === 'function') ? (detectAbnormalTxns() || []) : [];
    }
    catch (e) {
        abnormal = [];
    }
    if (abnormal.length) {
        rows.push('<div class="mini-row"><div class="mini-row-main">' +
            '<div class="mini-row-title">⚠️ 检测到 ' + abnormal.length + ' 笔异常交易</div>' +
            '<div class="mini-row-sub">系统识别到可疑消费、异地交易</div></div>' +
            '<button class="mini-link" onclick="showAbnormalAlert()">查看</button></div>');
    }
    // ② 生日：只在临近（≤2 天）时提醒，且 2 天内全部列出；没有就不显示
    var bdays = guideUpcomingBirthdays(2);
    bdays.forEach(function (n) {
        var days = n.days === 0 ? '今天生日' : '还有 ' + n.days + ' 天';
        rows.push('<div class="mini-row"><div class="mini-row-main">' +
            '<div class="mini-row-title">🎂 ' + guideEsc(n.name) + '生日' + (days === '今天生日' ? '就是今天' : '，' + days) + '</div>' +
            (n.flower ? '<div class="mini-row-sub">推荐：' + guideEsc(n.flower) + ' ¥' + n.price + '</div>' : '') +
            '</div><button class="mini-link" onclick="guideStartFlowerForContact(\'' + guideEsc(n.name) + '\')">订鲜花+蛋糕</button></div>');
    });
    // ②.5 本月生日鲜花预留（有预留才显示）
    if (hold && hold.amount) {
        rows.push('<div class="mini-row"><div class="mini-row-main">' +
            '<div class="mini-row-sub">已为' + (hold.count > 1 ? hold.count + ' 位本月生日（' + (hold.names || []).join('、') + '）' : (hold.names || [])[0] + '生日') + '预留 ¥' + hold.amount + '</div></div></div>');
    }
    // ③④⑤ 节日鲜花：只在临近（≤2 天）时才提醒，避免常年占版面
    var FEST_WARN_DAYS = 2;
    var vDays = guideDaysUntilMonthDay(2, 14);
    if (vDays <= FEST_WARN_DAYS) {
        var vText = vDays === 0 ? '今天就是情人节' : '还有 ' + vDays + ' 天';
        rows.push('<div class="mini-row"><div class="mini-row-main">' +
            '<div class="mini-row-title">💐 情人节：2 月 14 日，' + vText + '</div>' +
            '<div class="mini-row-sub">推荐：简约玫瑰 ¥299</div></div>' +
            '</div>');
    }
    var momDate = guideNthSundayNext(5, 2);
    if (momDate.days <= FEST_WARN_DAYS) {
        rows.push('<div class="mini-row"><div class="mini-row-main">' +
            '<div class="mini-row-title">🌷 母亲节：' + guideFlowerDisplayDate(momDate.str) + '，' + momDate.text + '</div>' +
            '<div class="mini-row-sub">推荐：康乃馨礼盒 ¥128</div></div>' +
            '</div>');
    }
    var dadDate = guideNthSundayNext(6, 3);
    if (dadDate.days <= FEST_WARN_DAYS) {
        rows.push('<div class="mini-row"><div class="mini-row-main">' +
            '<div class="mini-row-title">🌿 父亲节：' + guideFlowerDisplayDate(dadDate.str) + '，' + dadDate.text + '</div>' +
            '<div class="mini-row-sub">推荐：百合礼盒 ¥199</div></div>' +
            '</div>');
    }
    if (!rows.length)
        return '';
    return '<div class="mini-card home-reminders"><div class="mini-card-title">今日提醒</div>' + rows.join('') + '</div>';
}
// 最近要过生日的联系人（含距离天数）
function guideNearestBirthday() {
    if (typeof syncContactsBirthdays === 'function')
        syncContactsBirthdays();
    var list = (mockData.userProfile && mockData.userProfile.birthdayContacts) || [];
    var today = new Date();
    var todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var items = list.map(function (c) {
        var parts = String(c.birthday || '').split('-').map(Number);
        var m = parts.length >= 2 ? parts[parts.length - 2] : NaN;
        var d = parts.length >= 2 ? parts[parts.length - 1] : NaN;
        if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31))
            return null;
        var next = new Date(today.getFullYear(), m - 1, d);
        if (next < todayMid)
            next = new Date(today.getFullYear() + 1, m - 1, d);
        var days = Math.round((Number(next) - Number(todayMid)) / 86400000);
        return { name: c.name, relation: c.relation || '', birthday: m + '-' + d, days: days, flower: c.flower || '', price: c.price || 0, next: next };
    }).filter(Boolean).sort(function (a, b) { return a.days - b.days; });
    return items[0] || null;
}
// 7 天内要过生日的联系人（按天数升序，去重）
function guideUpcomingBirthdays(limitDays) {
    if (typeof syncContactsBirthdays === 'function')
        syncContactsBirthdays();
    var list = (mockData.userProfile && mockData.userProfile.birthdayContacts) || [];
    var today = new Date();
    var todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var seen = {};
    var items = [];
    list.forEach(function (c) {
        if (!c || !c.name || seen[c.name])
            return;
        var parts = String(c.birthday || '').split('-').map(Number);
        var m = parts.length >= 2 ? parts[parts.length - 2] : NaN;
        var d = parts.length >= 2 ? parts[parts.length - 1] : NaN;
        if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31))
            return;
        var next = new Date(today.getFullYear(), m - 1, d);
        if (next < todayMid)
            next = new Date(today.getFullYear() + 1, m - 1, d);
        var days = Math.round((Number(next) - Number(todayMid)) / 86400000);
        seen[c.name] = true;
        items.push({ name: c.name, relation: c.relation || '', birthday: m + '-' + d, days: days, flower: c.flower || '', price: c.price || 0, next: next });
    });
    items.sort(function (a, b) { return a.days - b.days; });
    var lim = (typeof limitDays === 'number') ? limitDays : 7;
    return items.filter(function (x) { return x.days <= lim; });
}
// 主菜单生日提醒卡（紧凑一行 + 一个按钮）
// 情人节一键下单：优先「爱人」关系，默认玫瑰礼盒 + 2 月 14 日下午
function guideStartValentineFlower() {
    guideResetAllSessions();
    var bday = (mockData.userProfile && mockData.userProfile.birthdayContacts) || [];
    var contacts = guideFlowerContacts();
    var pick = bday.filter(function (x) { return x && x.relation === '爱人' && contacts.indexOf(x.name) !== -1; })[0];
    var name = pick ? pick.name : (contacts[0] || '');
    if (!name) {
        appendMessage(guideMessage('<p>还没有可下单的联系人，请先在「联系人」里添加收花人。</p>'));
        scrollToBottom();
        return;
    }
    guideStartFlowerPreset(name, { bouquet: '简约玫瑰', monthDay: [2, 14], slot: 'afternoon', card: '情人节快乐', note: '情人节' });
}
// 母亲节 / 父亲节下单：优先对应关系的联系人
function guideStartParentsDayFlower(kind) {
    guideResetAllSessions();
    var isMom = kind === 'mother';
    var wantRel = isMom ? '母亲' : '父亲';
    var bday = (mockData.userProfile && mockData.userProfile.birthdayContacts) || [];
    var contacts = guideFlowerContacts();
    var pick = bday.filter(function (x) { return x && x.relation === wantRel && contacts.indexOf(x.name) !== -1; })[0];
    // 关系写「家人」但名字像父母的也兜底匹配
    if (!pick) {
        pick = bday.filter(function (x) {
            if (!x || contacts.indexOf(x.name) === -1)
                return false;
            return isMom ? /妈|母/.test(x.name) : /爸|父/.test(x.name);
        })[0];
    }
    var name = pick ? pick.name : (contacts[0] || '');
    if (!name) {
        appendMessage(guideMessage('<p>还没有可下单的联系人，请先在「联系人」里添加收花人。</p>'));
        scrollToBottom();
        return;
    }
    var fest = guideNthSundayNext(isMom ? 5 : 6, isMom ? 2 : 3);
    guideStartFlowerPreset(name, {
        bouquet: isMom ? '康乃馨礼盒' : '百合礼盒',
        dateStr: fest.str,
        slot: 'morning',
        card: isMom ? '母亲节快乐' : '父亲节快乐',
        note: isMom ? '母亲节' : '父亲节'
    });
}
// 按联系人生成预填订单（通用）：opts.bouquet / opts.monthDay / opts.slot / opts.card / opts.note
function guideStartFlowerPreset(name, opts) {
    var o = opts || {};
    var contacts = guideFlowerContacts();
    var target = String(name || '');
    if (contacts.indexOf(target) === -1) {
        guideStartFlowerOrder();
        return;
    }
    var c = (mockData.contacts || []).filter(function (x) { return x && x.name === target; })[0] || {};
    var bd = ((mockData.userProfile && mockData.userProfile.birthdayContacts) || []).filter(function (x) { return x && x.name === target; })[0] || {};
    var bouquet = o.bouquet ? guideFlowerBouquet(o.bouquet) : (bd.flower ? guideFlowerBouquet(bd.flower) : null);
    // 配送日期：优先指定「月-日」，否则用联系人生日
    var date = '';
    var md = o.monthDay || (bd.birthday ? [Number(String(bd.birthday).split('-')[0]), Number(String(bd.birthday).split('-')[1])] : null);
    if (o.dateStr) {
        date = o.dateStr;
    }
    else if (md && md[0] >= 1 && md[1] >= 1) {
        var now = new Date();
        var cand = new Date(now.getFullYear(), md[0] - 1, md[1]);
        var todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (cand < todayMid)
            cand = new Date(now.getFullYear() + 1, md[0] - 1, md[1]);
        date = cand.getFullYear() + '-' + guidePad2(String(cand.getMonth() + 1)) + '-' + guidePad2(String(cand.getDate()));
    }
    GUIDE_FLOWER = {
        mode: 'order', stage: 'confirm',
        order: {
            recipient: target,
            phone: c.phoneFull || c.phone || '',
            address: c.address || '清远市清城区XX小区',
            bouquet: bouquet ? bouquet.name : '',
            cake: o.cake || '无蛋糕',
            date: date,
            slot: o.slot || 'afternoon',
            card: o.card || '生日快乐',
            payMethod: '储蓄卡'
        },
        editing: null
    };
    currentModule = 'flower';
    var filled = [];
    if (c.phoneFull || c.phone)
        filled.push('手机号 ' + (c.phoneFull || c.phone));
    filled.push('收货地址 ' + GUIDE_FLOWER.order.address);
    if (bouquet)
        filled.push('花束 ' + bouquet.name);
    // 已为该联系人在同一天下过单 → 直接提示，不再走确认卡
    var dupAtStart = guideFlowerDuplicate(target, date);
    if (dupAtStart) {
        GUIDE_FLOWER = null;
        guideFlowerWarnDuplicate(dupAtStart);
        return;
    }
    // 不再输出「已按联系人信息自动填写…」提示，直接进确认卡（信息都在卡里可改）
    guideFlowerConfirm();
}
// 点生日提醒直接进鲜花确认（收花人/手机号/地址按联系人自动填好，可改）
function guideStartFlowerForContact(name) {
    // 生日礼：鲜花 + 蛋糕（默认 6 寸，可在卡片里改成 8 寸或不加蛋糕）
    guideStartFlowerPreset(name, { cake: '6寸水果蛋糕' });
    return;
}
function guideFlowerCake(name) {
    return FLOWER_CAKES.filter(function (x) { return x.name === name; })[0] || FLOWER_CAKES[0];
}
// 订单总价 = 花束 + 蛋糕
function guideFlowerOrderTotal(o) {
    var bq = guideFlowerBouquet(o && o.bouquet);
    var ck = guideFlowerCake(o && o.cake);
    return { bouquet: bq, cake: ck, total: (bq ? bq.price : 0) + (ck ? ck.price : 0) };
}
function guideFlowerDateStr(days) {
    var d = new Date();
    d.setDate(d.getDate() + (Number(days) || 0));
    return d.getFullYear() + '-' + guidePad2(d.getMonth() + 1) + '-' + guidePad2(d.getDate());
}
// 订单表：首次访问时放两条演示记录（一条待配送、一条已完成）
function guideFlowerOrders() {
    var u = mockData.userProfile || (mockData.userProfile = {});
    if (!Array.isArray(u.flowerOrders)) {
        u.flowerOrders = [
            {
                id: 'F' + Date.now() + '1', recipient: '李四', phone: '13800138000',
                address: '清远市清城区XX小区', bouquet: '简约玫瑰', price: 199,
                date: guideFlowerDateStr(4), slot: 'afternoon', card: '生日快乐',
                payMethod: '储蓄卡', status: '待配送', createdAt: new Date().toLocaleString('zh-CN')
            },
            {
                id: 'F' + Date.now() + '2', recipient: '王五', phone: '13700137000',
                address: '清远市清城区YY小区', bouquet: '康乃馨礼盒', price: 259,
                date: '2026-10-20', slot: 'morning', card: '',
                payMethod: '储蓄卡', status: '已完成', createdAt: '2026/10/18 09:00:00'
            }
        ];
    }
    return u.flowerOrders;
}
function guideFlowerSlot(slotKey) {
    return FLOWER_SLOTS.filter(function (s) { return s.key === slotKey; })[0] || FLOWER_SLOTS[0];
}
function guideFlowerBouquet(name) {
    if (!name)
        return null;
    return FLOWER_BOUQUETS.filter(function (b) {
        return name.indexOf(b.name) !== -1 || b.name.indexOf(name) !== -1 ||
            (name.indexOf('玫瑰') !== -1 && b.name === '简约玫瑰') ||
            (name.indexOf('向日葵') !== -1 && b.name === '向日葵花束') ||
            (name.indexOf('混搭') !== -1 && b.name === '混搭小花束') ||
            (name.indexOf('康乃馨') !== -1 && b.name === '康乃馨礼盒') ||
            (name.indexOf('百合') !== -1 && b.name === '百合礼盒') ||
            (name.indexOf('郁金香') !== -1 && b.name === '郁金香花束');
    })[0] || null;
}
function guideFlowerDisplayDate(date) {
    if (!date)
        return '';
    var parts = String(date).split('-');
    return Number(parts[1]) + '月' + Number(parts[2]) + '日';
}
// 距离配送开始还有多少小时
function guideFlowerHoursLeft(order) {
    var slot = guideFlowerSlot(order && order.slot);
    var start = String((order && order.date) || '') + ' ' + String(slot.label).slice(0, 5);
    var t = Date.parse(start.replace(/-/g, '/'));
    if (isNaN(t))
        return 999;
    return (t - Date.now()) / 3600000;
}
// 从一句话里抽鲜花订单的各个字段
function guideFlowerParse(text) {
    var raw = String(text || '');
    var out = { recipient: '', phone: '', address: '', bouquet: '', date: '', slot: '', card: '', payMethod: '' };
    var pm = raw.match(/1\d{10}/);
    if (pm)
        out.phone = pm[0];
    if (/信用卡/.test(raw))
        out.payMethod = '信用卡';
    else if (/储蓄卡|借记卡/.test(raw))
        out.payMethod = '储蓄卡';
    var cm = raw.match(/(?:写贺卡|贺卡留言|贺卡|留言)\s*[:：]?\s*([^，,。；;]*)/);
    if (cm && cm[1])
        out.card = cm[1].trim().slice(0, 30);
    var b = guideFlowerBouquet(raw);
    if (b)
        out.bouquet = b.name;
    if (/下午|14-18|14:00/.test(raw))
        out.slot = 'afternoon';
    else if (/晚上|晚间|19-21|19:00/.test(raw))
        out.slot = 'evening';
    else if (/上午|早上|9-12|09:00/.test(raw))
        out.slot = 'morning';
    var dm = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dm)
        out.date = dm[1] + '-' + guidePad2(dm[2]) + '-' + guidePad2(dm[3]);
    else if (/今天|今日/.test(raw))
        out.date = guideFlowerDateStr(0);
    else if (/后天/.test(raw))
        out.date = guideFlowerDateStr(2);
    else if (/明天|明日/.test(raw))
        out.date = guideFlowerDateStr(1);
    else {
        var md = raw.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
        if (md)
            out.date = guideMonthDayDate(md[1], md[2]);
    }
    // 地址：取包含行政区/街道/小区的片段
    var segs = raw.split(/[，,。；;\n]/).map(function (x) { return x.trim(); }).filter(Boolean);
    var used = [];
    segs.forEach(function (seg) {
        if (!out.phone && /1\d{10}/.test(seg)) {
            out.phone = seg.match(/1\d{10}/)[0];
            used.push(seg);
            return;
        }
        if (!out.address && /(市|区|县|路|街|小区|号|楼|室|大道|花园|苑)/.test(seg) &&
            !/月|日|点|卡|玫瑰|向日葵|康乃馨|混搭/.test(seg)) {
            out.address = seg;
            used.push(seg);
        }
    });
    // 收花人：「送给 / 给 / 收花人：X」或剩下的短中文片段
    var rm = raw.match(/(?:送给|送|给|收花人|收件人)\s*[:：]?\s*([\u4e00-\u9fa5·]{2,4})/);
    if (rm)
        out.recipient = rm[1];
    if (!out.recipient) {
        var leftover = segs.filter(function (seg) { return used.indexOf(seg) === -1; })
            .map(function (seg) { return seg.replace(/(送给|送|给|收花人|收件人)/g, '').trim(); })
            .filter(function (seg) { return /^[\u4e00-\u9fa5·]{2,4}$/.test(seg); })[0];
        if (leftover)
            out.recipient = leftover;
    }
    // 剩下的短文本若不像地址/花束/时间，当作贺卡留言
    if (!out.card) {
        var maybe = segs.filter(function (seg) {
            var cleaned = seg.replace(/^(送给|送|给|收花人|收件人)\s*[:：]?\s*/, '').trim();
            if (out.recipient && cleaned === out.recipient)
                return false;
            if (used.indexOf(seg) !== -1)
                return false;
            if (/1\d{10}/.test(seg))
                return false;
            if (/月|日|点|卡|玫瑰|向日葵|康乃馨|混搭/.test(seg))
                return false;
            if (/^(送给|送|给|收花人|收件人)/.test(seg))
                return false;
            return /^[\u4e00-\u9fa5，,！!…\s]{2,30}$/.test(seg);
        })[0];
        if (maybe)
            out.card = maybe.trim().slice(0, 30);
    }
    return out;
}
function guideFlowerMissingPrompt(s) {
    var miss = [];
    if (!s.recipient)
        miss.push('收花人');
    if (!s.phone)
        miss.push('手机号');
    if (!s.address)
        miss.push('收货地址');
    if (!s.bouquet)
        miss.push('花束款式');
    if (!s.date || !s.slot)
        miss.push('配送日期和时段');
    if (!miss.length)
        return '';
    return '请提供' + miss.join('、') + '。';
}
// 允许收花的人：生日联系人（为空时退回通讯录联系人）
function guideFlowerContacts() {
    var b = (mockData.userProfile && mockData.userProfile.birthdayContacts) || [];
    if (b.length)
        return b.map(function (x) { return x.name; });
    return (mockData.contacts || []).map(function (x) { return x.name; });
}
function guideFlowerContactsText() {
    var names = guideFlowerContacts();
    return names.length ? names.join('、') : '暂无联系人';
}
// 生日鲜花：这里只看订单/看提醒，下单统一走主页面「今日提醒」里的入口
function guideStartBirthdayFlower() {
    guideResetAllSessions();
    currentModule = 'flower';
    var nearest = (typeof guideNearestBirthday === 'function') ? guideNearestBirthday() : null;
    appendMessage(guideMessage('<p>生日鲜花包含以下操作：</p>' +
        '<div class="guide-rows">' +
        '<div class="guide-row"><div class="guide-row-title">订鲜花+蛋糕</div><div class="guide-row-example">例如：给林小雨订一束花</div></div>' +
        '<div class="guide-row"><div class="guide-row-title">查看鲜花订单</div><div class="guide-row-example">例如：查看鲜花订单</div></div>' +
        '<div class="guide-row"><div class="guide-row-title">生日提醒</div><div class="guide-row-example">例如：最近谁的生日</div></div>' +
        '</div>' +
        (nearest ? '<p class="guide-tip">最近：' + guideEsc(nearest.name) + (nearest.relation ? '（' + guideEsc(nearest.relation) + '）' : '') +
            ' ' + Number(String(nearest.birthday).split('-')[0]) + ' 月 ' + Number(String(nearest.birthday).split('-')[1]) + ' 日，还有 ' + nearest.days + ' 天</p>' : '') +
        '<p class="guide-tip">可下单的联系人：' + guideFlowerContactsText() + '</p>' +
        '<p class="guide-tip">直接说出你的需求即可（照示例说也行）。</p>'));
    scrollToBottom();
}
function guideStartFlowerOrder(opts) {
    guideResetAllSessions();
    var pre = opts || {};
    var contacts = guideFlowerContacts();
    var name = pre.recipient && contacts.indexOf(pre.recipient) !== -1 ? pre.recipient : (contacts[0] || '');
    var c = (mockData.contacts || []).filter(function (x) { return x && x.name === name; })[0] || {};
    var bq = pre.bouquet ? guideFlowerBouquet(pre.bouquet) : null;
    GUIDE_FLOWER = {
        mode: 'order', stage: 'confirm',
        order: {
            recipient: name,
            phone: pre.phone || c.phoneFull || c.phone || '',
            address: pre.address || c.address || '清远市清城区XX小区',
            bouquet: bq ? bq.name : (FLOWER_BOUQUETS[0] ? FLOWER_BOUQUETS[0].name : ''),
            cake: pre.cake || '无蛋糕',
            date: pre.date || guideFlowerDateStr(1),
            slot: pre.slot || 'afternoon',
            card: pre.card || '生日快乐',
            payMethod: '储蓄卡'
        },
        editing: null
    };
    currentModule = 'flower';
    // 表单卡：所有字段在卡片里选/填，填完点「提交订单」，不再多轮对话收集
    guideFlowerConfirm();
}
function guideFlowerDuplicate(recipient, date) {
    if (!recipient || !date)
        return null;
    var list = guideFlowerOrders().filter(function (o) {
        return o && o.status === '待配送' && o.recipient === recipient && o.date === date;
    });
    return list[0] || null;
}
// 重复下单时的统一提示
function guideFlowerWarnDuplicate(order) {
    appendMessage(guideMessage('<p>「' + guideEsc(order.recipient) + '」在 ' + guideFlowerDisplayDate(order.date) + ' 已有一束待配送的鲜花（' +
        guideEsc(order.bouquet) + (order.cake && order.cake !== '无蛋糕' ? ' + ' + guideEsc(order.cake) : '') +
        '），同一人同一天不能重复下单。</p>' +
        '<p class="guide-tip">如需更换款式，请先取消原订单再重新下单。</p>' +
        '<div class="guide-chips"><button class="guide-chip" onclick="guideStartFlowerList()">查看鲜花订单</button></div>'));
    scrollToBottom();
}
// 确认卡：字段都可直接点开修改（下拉 / 输入框 / 日期选择）
function guideFlowerOrderCard(s) {
    var o = s.order;
    var slot = guideFlowerSlot(o.slot);
    var contacts = guideFlowerContacts();
    var recipientOpts = contacts.map(function (n) {
        return '<option value="' + guideEsc(n) + '"' + (n === o.recipient ? ' selected' : '') + '>' + guideEsc(n) + '</option>';
    }).join('');
    var bouquetOpts = FLOWER_BOUQUETS.map(function (b) {
        return '<option value="' + guideEsc(b.name) + '"' + (b.name === o.bouquet ? ' selected' : '') + '>' +
            guideEsc(b.name) + '（¥' + b.price + '）</option>';
    }).join('');
    var slotOpts = FLOWER_SLOTS.map(function (x) {
        return '<option value="' + x.key + '"' + (x.key === o.slot ? ' selected' : '') + '>' + x.text + '</option>';
    }).join('');
    var payOpts = ['储蓄卡', '信用卡'].map(function (p) {
        return '<option value="' + p + '"' + (p === (o.payMethod === '信用卡' ? '信用卡' : '储蓄卡') ? ' selected' : '') + '>' + p + '</option>';
    }).join('');
    var cakeOpts = FLOWER_CAKES.map(function (x) {
        return '<option value="' + x.name + '"' + (x.name === (o.cake || '无蛋糕') ? ' selected' : '') + '>' +
            x.name + (x.price ? '（¥' + x.price + '）' : '') + '</option>';
    }).join('');
    var dateVal = o.date || guideFlowerDateStr(0);
    var tot = guideFlowerOrderTotal(o);
    var totalText = '花束 ¥' + (tot.bouquet ? tot.bouquet.price : 0) +
        (tot.cake && tot.cake.price ? ' + 蛋糕 ¥' + tot.cake.price : '') + ' = ¥' + tot.total;
    return '<div class="data-card flower-form"><div class="data-card-title">填写鲜花订单</div>' +
        '<div class="data-row"><span class="data-label">收花人</span><span class="data-value">' +
        '<select class="flower-input" id="flRecipient">' + recipientOpts + '</select></span></div>' +
        '<div class="data-row"><span class="data-label">联系电话</span><span class="data-value">' +
        '<input class="flower-input" id="flPhone" value="' + guideEsc(o.phone) + '" placeholder="收花人手机号"></span></div>' +
        '<div class="data-row"><span class="data-label">收货地址</span><span class="data-value">' +
        '<input class="flower-input" id="flAddress" value="' + guideEsc(o.address) + '" placeholder="详细收货地址"></span></div>' +
        '<div class="data-row"><span class="data-label">花束款式</span><span class="data-value">' +
        '<select class="flower-input" id="flBouquet" onchange="guideFlowerRefreshTotal()">' + bouquetOpts + '</select></span></div>' +
        '<div class="data-row"><span class="data-label">配送日期</span><span class="data-value">' +
        '<input class="flower-input" type="date" id="flDate" value="' + guideEsc(dateVal) + '" min="' + guideFlowerDateStr(0) + '"></span></div>' +
        '<div class="data-row"><span class="data-label">配送时段</span><span class="data-value">' +
        '<select class="flower-input" id="flSlot">' + slotOpts + '</select></span></div>' +
        '<div class="data-row"><span class="data-label">贺卡留言</span><span class="data-value">' +
        '<input class="flower-input" id="flCard" maxlength="30" value="' + guideEsc(o.card || '') + '" placeholder="选填"></span></div>' +
        '<div class="data-row"><span class="data-label">蛋糕</span><span class="data-value">' +
        '<select class="flower-input" id="flCake" onchange="guideFlowerRefreshTotal()">' + cakeOpts + '</select></span></div>' +
        '<div class="data-row"><span class="data-label">支付方式</span><span class="data-value">' +
        '<select class="flower-input" id="flPay">' + payOpts + '</select></span></div>' +
        '<div class="data-row"><span class="data-label">合计</span><span class="data-value" id="flTotal" style="font-weight:600;color:#B42318;">' + totalText + '</span></div>' +
        '</div>';
}
// 花束改选后同步价格提示（当前只改显示，提交时以表单为准）
// 提交前把表单里的值同步回 order
function guideFlowerSyncForm() {
    var s = GUIDE_FLOWER;
    if (!s || !s.order)
        return;
    var o = s.order;
    function val(id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : null; }
    var v;
    v = val('flRecipient');
    if (v)
        o.recipient = v;
    v = val('flPhone');
    if (v !== null)
        o.phone = v;
    v = val('flAddress');
    if (v !== null)
        o.address = v;
    v = val('flBouquet');
    if (v)
        o.bouquet = v;
    v = val('flDate');
    if (v)
        o.date = v;
    v = val('flSlot');
    if (v)
        o.slot = v;
    v = val('flCard');
    if (v !== null)
        o.card = v;
    v = val('flPay');
    if (v)
        o.payMethod = v;
    v = val('flCake');
    if (v !== null)
        o.cake = v;
}
// 蛋糕/花束变化时刷新合计文案
function guideFlowerRefreshTotal() {
    var s = GUIDE_FLOWER;
    if (!s || !s.order)
        return;
    guideFlowerSyncForm();
    var el = document.getElementById('flTotal');
    if (!el)
        return;
    var tot = guideFlowerOrderTotal(s.order);
    el.textContent = '花束 ¥' + (tot.bouquet ? tot.bouquet.price : 0) +
        (tot.cake && tot.cake.price ? ' + 蛋糕 ¥' + tot.cake.price : '') + ' = ¥' + tot.total;
}
function guideFlowerConfirm() {
    var s = GUIDE_FLOWER;
    if (!s)
        return;
    // 出确认卡之前再核一次：只能为联系人下单
    if (guideFlowerContacts().indexOf(s.order.recipient) === -1) {
        appendMessage(guideMessage('<p>收花人必须是联系人，当前「' + guideEsc(s.order.recipient) + '」不在联系人里，请重新选择收花人。</p>' +
            '<p class="guide-tip">可选收花人：' + guideEsc(guideFlowerContactsText()) + '</p>'));
        scrollToBottom();
        s.order.recipient = '';
        s.stage = 'slots';
        return;
    }
    s.stage = 'confirm';
    s.boxId = s.boxId || ('flower-confirm-' + Date.now());
    appendMessage(guideMessage('<div id="' + s.boxId + '">' + guideFlowerOrderCard(s) +
        '<div class="guide-chips">' +
        '<button class="guide-chip" onclick="guideFlowerSubmit()">提交订单</button>' +
        '<button class="guide-chip" onclick="guideFlowerCancelOp()">取消</button>' +
        '</div>' +
        '</div>'));
    scrollToBottom();
}
async function guideFlowerOrderStep(text) {
    var t = String(text || '').trim();
    var s = GUIDE_FLOWER;
    var parsed = guideFlowerParse(t);
    var o = s.order;
    // 确认阶段的自由输入：支付方式 / 确认 / 取消
    if (s.stage === 'confirm') {
        if (/信用卡/.test(t)) {
            o.payMethod = '信用卡';
            appendMessage(guideMessage('<p>已切换为信用卡支付。</p>'));
            guideFlowerConfirm();
            return true;
        }
        if (/储蓄卡|借记卡/.test(t)) {
            o.payMethod = '储蓄卡';
            appendMessage(guideMessage('<p>已切换为储蓄卡支付。</p>'));
            guideFlowerConfirm();
            return true;
        }
        if (/^(确认|提交|提交订单|确定|是|好|行)$/.test(t.replace(/[吧呢啊呀。.!！?？\s]/g, ''))) {
            return guideFlowerSubmit();
        }
        if (/^(取消|不|算了|返回)$/.test(t.replace(/[吧呢啊呀。.!！?？\s]/g, ''))) {
            guideFlowerCancelOp();
            return true;
        }
        // 订单确认卡不支持对话改单：提示直接在卡片表单里修改
        if (/(改|换|调整|变成|修改)/.test(t)) {
            appendMessage(guideMessage('<p>确认卡上的信息请在卡片表单里直接修改（收花人 / 花束 / 日期 / 时段 / 贺卡等），改完点「提交订单」即可。</p>'));
            scrollToBottom();
            return true;
        }
    }
    if (parsed.recipient) {
        var allowed = guideFlowerContacts();
        if (allowed.indexOf(parsed.recipient) === -1) {
            appendMessage(guideMessage('<p>「<b>' + guideEsc(parsed.recipient) + '</b>」不在联系人里，鲜花只能为联系人下单。</p>' +
                '<p class="guide-tip">可选收花人：' + guideEsc(guideFlowerContactsText()) + '</p>'));
            scrollToBottom();
            return true;
        }
        o.recipient = parsed.recipient;
    }
    if (parsed.phone)
        o.phone = parsed.phone;
    if (parsed.address)
        o.address = parsed.address;
    if (parsed.bouquet)
        o.bouquet = parsed.bouquet;
    if (parsed.date)
        o.date = parsed.date;
    if (parsed.slot)
        o.slot = parsed.slot;
    if (parsed.card)
        o.card = parsed.card;
    if (parsed.payMethod)
        o.payMethod = parsed.payMethod;
    if (o.recipient && o.phone && o.address && o.bouquet && o.date && o.slot) {
        guideFlowerConfirm();
        return true;
    }
    appendMessage(guideMessage('<p>' + guideFlowerMissingPrompt(o) + '</p>' +
        '<p class="guide-tip">可选花束：' + FLOWER_BOUQUETS.map(function (b) { return b.name; }).join('、') + '</p>' +
        '<p class="guide-tip">配送时段：' + FLOWER_SLOTS.map(function (x) { return x.text; }).join('、') + '</p>'));
    scrollToBottom();
    return true;
}
function guideFlowerPaySwitch() {
    var s = GUIDE_FLOWER;
    if (!s)
        return;
    s.order.payMethod = s.order.payMethod === '信用卡' ? '储蓄卡' : '信用卡';
    appendMessage(guideMessage('<p>已切换为' + (s.order.payMethod === '信用卡' ? '信用卡' : '储蓄卡') + '支付。</p>'));
    guideFlowerConfirm();
}
async function guideFlowerSubmit() {
    var s = GUIDE_FLOWER;
    if (!s || s.stage !== 'confirm')
        return true;
    guideFlowerSyncForm();
    var o = s.order;
    var tot = guideFlowerOrderTotal(o);
    var bouquet = tot.bouquet;
    var price = tot.total;
    var today = guideFlowerDateStr(0);
    if (o.date < today) {
        appendMessage(guideMessage('<p>配送日期不能早于今天（' + guideFlowerDisplayDate(today) + '），请在表单里重新选择配送日期后再提交。</p>'));
        scrollToBottom();
        s.order.date = guideFlowerDateStr(1);
        s.stage = 'confirm';
        guideFlowerConfirm();
        return true;
    }
    if (o.card && o.card.length > 30)
        o.card = o.card.slice(0, 30);
    if (guideFlowerContacts().indexOf(o.recipient) === -1) {
        appendMessage(guideMessage('<p>收花人必须是联系人，当前「' + guideEsc(o.recipient) + '」不在联系人里，请重新选择收花人。</p>' +
            '<p class="guide-tip">可选收花人：' + guideEsc(guideFlowerContactsText()) + '</p>'));
        scrollToBottom();
        s.order.recipient = guideFlowerContacts()[0] || '';
        s.stage = 'confirm';
        guideFlowerConfirm();
        return true;
    }
    // 同一人同一天不允许重复下单
    var dupOrder = guideFlowerDuplicate(o.recipient, o.date);
    if (dupOrder) {
        guideConfirmCardDone(s.boxId, '未提交');
        GUIDE_FLOWER = null;
        guideFlowerWarnDuplicate(dupOrder);
        return true;
    }
    if (!(price > 0)) {
        appendMessage(guideMessage('<p>该花束没有有效价格，请在表单里重新选择款式。</p>'));
        scrollToBottom();
        s.stage = 'confirm';
        guideFlowerConfirm();
        return true;
    }
    var payMethod = o.payMethod === '信用卡' ? '信用卡' : '储蓄卡';
    var debit = (mockData.userProfile && mockData.userProfile.debitCard) || {};
    var available = Number(debit.available) || 0;
    var cc = (mockData.userProfile && mockData.userProfile.creditCard) || {};
    var creditAvailable = Number(cc.available) || 0;
    if (payMethod === '储蓄卡' && price > available) {
        appendMessage(guideMessage('<p>储蓄卡可用余额 ¥' + available.toLocaleString('zh-CN') + ' 不足支付本次鲜花订单（¥' + price + '），请改用信用卡支付。</p>' +
            '<div class="guide-chips"><button class="guide-chip" onclick="guideFlowerPaySwitch()">改用信用卡支付</button>' +
            '<button class="guide-chip" onclick="guideFlowerCancelOp()">取消</button></div>'));
        scrollToBottom();
        return true;
    }
    if (payMethod === '信用卡' && price > creditAvailable) {
        appendMessage(guideMessage('<p>信用卡可用额度 ¥' + creditAvailable.toLocaleString('zh-CN') + ' 不足支付本次鲜花订单（¥' + price + '），请改用储蓄卡支付。</p>' +
            '<div class="guide-chips"><button class="guide-chip" onclick="guideFlowerPaySwitch()">改用储蓄卡支付</button>' +
            '<button class="guide-chip" onclick="guideFlowerCancelOp()">取消</button></div>'));
        scrollToBottom();
        return true;
    }
    // —— 服务端权威：后端在线时由服务端扣款并落订单 ——
    if (typeof API !== 'undefined' && API.live && typeof apiFlowerOrder === 'function') {
        var srvFlower = null;
        try {
            srvFlower = await apiFlowerOrder({
                recipient: o.recipient, phone: o.phone, address: o.address, bouquet: o.bouquet,
                cake: o.cake || '无蛋糕', date: o.date, slot: o.slot, card: o.card || '',
                payMethod: payMethod, price: price,
                cakePrice: tot.cake ? tot.cake.price : 0,
                bouquetPrice: bouquet ? bouquet.price : 0
            });
        }
        catch (e) {
            srvFlower = null;
        }
        if (srvFlower && srvFlower.ok) {
            mockData.userProfile.debitCard.balance = Number(srvFlower.balance);
            mockData.userProfile.debitCard.available = Number(srvFlower.available);
            if (Array.isArray(srvFlower.orders))
                mockData.userProfile.flowerOrders = srvFlower.orders;
            guideConfirmCardDone(s.boxId, '已提交');
            GUIDE_FLOWER = null;
            saveUserData();
            var cakeNote2 = (tot.cake && tot.cake.price) ? ('（含' + tot.cake.name + ' ¥' + tot.cake.price + '）') : '';
            appendMessage(guideMessage('<p>鲜花订单提交成功，已从' + payMethod + '支付 ¥' + price + cakeNote2 + '，将在配送日按时派送。</p>' +
                '<div class="guide-chips"><button class="guide-chip" onclick="guideStartFlowerList()">查看鲜花订单</button></div>'));
            scrollToBottom();
            return true;
        }
        if (srvFlower && srvFlower.error) {
            appendMessage(guideMessage('<p>鲜花订单未提交：' + guideEsc(srvFlower.error) + '</p>'));
            scrollToBottom();
            s.stage = 'confirm';
            guideFlowerConfirm();
            return true;
        }
        // 服务端不可用 → 走本地逻辑
    }
    // 下单即支付：储蓄卡走统一扣款门禁，信用卡占用额度并计入本期账单
    if (payMethod === '储蓄卡') {
        var paid = addTransaction('expense', price, '鲜花订单-' + o.recipient + '(' + o.bouquet + ')', '鲜花订购', true);
        if (paid === false) {
            appendMessage(guideMessage('<p>储蓄卡可用余额不足，鲜花订单未提交，账户未扣款。</p>'));
            scrollToBottom();
            return true;
        }
    }
    else {
        cc.available = Math.max(0, Math.round((creditAvailable - price) * 100) / 100);
        cc.used = Math.round(((Number(cc.used) || 0) + price) * 100) / 100;
        cc.currentBill = Math.round(((Number(cc.currentBill) || 0) + price) * 100) / 100;
        cc.minPayment = Math.round(cc.currentBill * 10) / 100;
        if (mockData.card) {
            mockData.card.usedLimit = cc.used;
            mockData.card.availableLimit = cc.available;
            mockData.card.billAmount = cc.currentBill;
        }
    }
    guideConfirmCardDone(s.boxId, '已提交');
    GUIDE_FLOWER = null;
    guideFlowerOrders().unshift({
        id: 'F' + Date.now(),
        recipient: o.recipient,
        phone: o.phone,
        address: o.address,
        bouquet: o.bouquet,
        cake: o.cake || '无蛋糕',
        cakePrice: tot.cake ? tot.cake.price : 0,
        bouquetPrice: bouquet ? bouquet.price : 0,
        price: price,
        date: o.date,
        slot: o.slot,
        card: o.card || '',
        payMethod: payMethod,
        paid: true,
        paidAmount: price,
        status: '待配送',
        createdAt: new Date().toLocaleString('zh-CN')
    });
    saveUserData();
    var cakeNote = (tot.cake && tot.cake.price) ? ('（含' + tot.cake.name + ' ¥' + tot.cake.price + '）') : '';
    appendMessage(guideMessage('<p>鲜花订单提交成功，已从' + payMethod + '支付 ¥' + price + cakeNote + '，将在配送日按时派送。</p>' +
        '<div class="guide-chips"><button class="guide-chip" onclick="guideStartFlowerList()">查看鲜花订单</button></div>'));
    scrollToBottom();
    return true;
}
function guideStartFlowerList() {
    guideResetAllSessions();
    GUIDE_FLOWER = { mode: 'list', stage: 'list' };
    currentModule = 'flower';
    var list = guideFlowerOrders();
    var pending = list.filter(function (x) { return x.status === '待配送'; });
    var done = list.filter(function (x) { return x.status !== '待配送'; });
    var rows = function (arr) {
        return arr.map(function (o2) {
            var slot = guideFlowerSlot(o2.slot);
            return '<div class="bank-sched-item">' +
                '<div class="bank-sched-date" style="background:#F5F8FD;color:#09407F;"><b>' + guideEsc(o2.status) + '</b><small>' + guideEsc(guideFlowerDisplayDate(o2.date)) + '</small></div>' +
                '<div class="bank-sched-main"><b>' + guideEsc(o2.bouquet) + '｜收件：' + guideEsc(o2.recipient) + '</b>' +
                '<small>' + guideFlowerDisplayDate(o2.date) + ' ' + slot.text + ' · ' + guideEsc(o2.payMethod || '储蓄卡') + '</small></div>' +
                '<div class="bank-sched-side" style="gap:8px;display:flex;">' +
                (o2.status === '待配送'
                    ? '<button class="ui-link" onclick="guideFlowerCancelStart(\'' + o2.id + '\')">取消订单</button>'
                    : '<button class="ui-link" style="color:#B42318;" onclick="guideFlowerDeleteOrder(\'' + o2.id + '\')">删除</button>') +
                '</div>' +
                '</div>';
        }).join('');
    };
    var boxId = 'flower-list-' + Date.now();
    var more = function (count, expanded) {
        if (count <= 2)
            return '';
        return '<button class="card-more" onclick="guideFlowerListToggle(\'' + boxId + '\')">' +
            (expanded ? '收起列表' : '查看全部 ' + count + ' 笔') + '</button>';
    };
    var build = function (expanded) {
        var limit = expanded ? 999 : 2;
        return '<p>鲜花订单列表：</p>' +
            '<div class="report-panel"><div class="report-panel-title">待配送</div>' +
            (rows(pending.slice(0, limit)) || '<div class="report-empty">暂无待配送订单</div>') +
            more(pending.length, expanded) +
            '</div>' +
            '<div class="report-panel" style="margin-top:10px;"><div class="report-panel-title">已完成</div>' +
            (rows(done.slice(0, limit)) || '<div class="report-empty">暂无历史订单</div>') +
            more(done.length, expanded) +
            '</div>';
    };
    appendMessage(guideMessage('<div id="' + boxId + '">' + build(false) + '</div>'));
    scrollToBottom();
    window.__flowerListBuild = window.__flowerListBuild || {};
    window.__flowerListBuild[boxId] = build;
}
// 展开 / 收起鲜花订单列表
function guideFlowerListToggle(boxId) {
    var box = document.getElementById(boxId);
    var build = (window.__flowerListBuild || {})[boxId];
    if (!box || !build)
        return;
    var expanded = box.getAttribute('data-expanded') === '1';
    box.innerHTML = build(!expanded);
    box.setAttribute('data-expanded', expanded ? '0' : '1');
    scrollToBottom();
}
// 删除一条鲜花订单记录（待配送的需先取消）
function guideFlowerDeleteOrder(orderId) {
    var list = guideFlowerOrders();
    var target = list.filter(function (x) { return x.id === orderId; })[0];
    if (!target) {
        appendMessage(guideMessage('<p>该记录不存在，可能已被删除。</p>'));
        scrollToBottom();
        return;
    }
    if (target.status === '待配送') {
        appendMessage(guideMessage('<p>待配送的订单不能直接删除，请先取消订单。</p>' +
            '<div class="guide-chips"><button class="guide-chip" onclick="guideFlowerCancelStart(\'' + orderId + '\')">取消订单</button></div>'));
        scrollToBottom();
        return;
    }
    var idx = list.indexOf(target);
    if (idx !== -1)
        list.splice(idx, 1);
    saveUserData();
    appendMessage(guideMessage('<p>已删除该条鲜花订单记录（' + guideEsc(target.recipient) + '・' + guideFlowerDisplayDate(target.date) + '）。</p>'));
    scrollToBottom();
    guideStartFlowerList();
}
// 修改订单：配送日前可改
function guideFlowerModifyStart(orderId) {
    var order = guideFlowerOrders().filter(function (x) { return x.id === orderId; })[0];
    if (!order)
        return;
    if (guideFlowerHoursLeft(order) < 0) {
        appendMessage(guideMessage('<p>该订单已过配送时间，无法修改。</p>'));
        scrollToBottom();
        return;
    }
    GUIDE_FLOWER = { mode: 'modify', stage: 'modify-slots', order: order, newBouquet: '' };
    currentModule = 'flower';
    var slot = guideFlowerSlot(order.slot);
    appendMessage(guideMessage('<p>要修改「' + guideEsc(order.recipient) + '」这笔鲜花订单的什么？</p>' +
        '<p class="guide-tip">例如：改成向日葵花束</p>' +
        '<p class="guide-tip">当前：' + guideEsc(order.bouquet) + '｜' + guideFlowerDisplayDate(order.date) + ' ' + slot.text +
        '（配送前 24 小时以上可免费修改）</p>'));
    scrollToBottom();
}
function guideFlowerModifyConfirm() {
    var s = GUIDE_FLOWER;
    if (!s || !s.order)
        return;
    s.stage = 'modify-confirm';
    var bouquet = guideFlowerBouquet(s.newBouquet);
    s.newBouquet = bouquet ? bouquet.name : s.newBouquet;
    var oldPrice = Number(s.order.paidAmount || s.order.price) || 0;
    var newPrice = bouquet ? Number(bouquet.price) || 0 : oldPrice;
    var diff = Math.round((newPrice - oldPrice) * 100) / 100;
    appendMessage(guideMessage('<div class="data-card"><div class="data-card-title">确认修改订单</div>' +
        '<div class="data-row"><span class="data-label">原款式</span><span class="data-value">' + guideEsc(s.order.bouquet) + '</span></div>' +
        '<div class="data-row"><span class="data-label">新款式</span><span class="data-value">' + guideEsc(s.newBouquet) + '（¥' + newPrice + '）</span></div>' +
        (s.order.paid === true && diff !== 0 ? '<div class="data-row"><span class="data-label">改单差价</span><span class="data-value ' + (diff > 0 ? 'expense' : 'income') + '">' + (diff > 0 ? '补 ¥' : '退 ¥') + Math.abs(diff) + '</span></div>' : '') +
        '<div class="data-row"><span class="data-label">其余信息</span><span class="data-value">保持不变</span></div>' +
        '<div class="data-row"><span class="data-label">支付方式</span><span class="data-value">' + guideEsc(s.order.payMethod || '储蓄卡') + '</span></div>' +
        '</div>' +
        '<div class="guide-chips">' +
        '<button class="guide-chip" onclick="guideFlowerModifySubmit()">确认修改</button>' +
        '<button class="guide-chip" onclick="guideFlowerCancelOp()">返回</button>' +
        '</div>'));
    scrollToBottom();
}
function guideFlowerModifySubmit() {
    var s = GUIDE_FLOWER;
    if (!s || s.stage !== 'modify-confirm' || !s.order)
        return;
    var target = guideFlowerOrders().filter(function (x) { return x.id === s.order.id; })[0];
    var bouquet = guideFlowerBouquet(s.newBouquet);
    if (target && bouquet) {
        var oldPrice = Number(target.paidAmount || target.price) || 0;
        var newPrice = Number(bouquet.price) || 0;
        var diff = Math.round((newPrice - oldPrice) * 100) / 100;
        // 已支付的订单改款式必须补差价/退差价，不能只改展示价
        if (target.paid === true && diff !== 0) {
            if (String(target.payMethod) === '信用卡') {
                var cc = mockData.userProfile.creditCard || {};
                if (diff > 0 && (Number(cc.available) || 0) < diff) {
                    appendMessage(guideMessage('<p>信用卡可用额度不足以补差价 ¥' + diff + '，订单未修改。</p>'));
                    scrollToBottom();
                    return;
                }
                cc.available = Math.round(((Number(cc.available) || 0) - diff) * 100) / 100;
                cc.used = Math.round(((Number(cc.used) || 0) + diff) * 100) / 100;
                cc.currentBill = Math.round(((Number(cc.currentBill) || 0) + diff) * 100) / 100;
                cc.minPayment = Math.round(cc.currentBill * 10) / 100;
                if (mockData.card) {
                    mockData.card.availableLimit = cc.available;
                    mockData.card.usedLimit = cc.used;
                    mockData.card.billAmount = cc.currentBill;
                }
            }
            else if (diff > 0) {
                var payDiff = addTransaction('expense', diff, '鲜花改单补差价-' + target.recipient, '鲜花订购', true);
                if (payDiff === false) {
                    appendMessage(guideMessage('<p>储蓄卡可用余额不足以补差价 ¥' + diff + '，订单未修改。</p>'));
                    scrollToBottom();
                    return;
                }
            }
            else {
                addTransaction('income', -diff, '鲜花改单退款-' + target.recipient, '鲜花订购', true);
            }
            target.paidAmount = newPrice;
        }
        target.bouquet = bouquet.name;
        target.price = newPrice;
        target.updatedAt = new Date().toLocaleString('zh-CN');
        saveUserData();
    }
    GUIDE_FLOWER = null;
    appendMessage(guideMessage('<p>订单已修改：款式改为「' + guideEsc(bouquet ? bouquet.name : s.newBouquet) + '」，其余信息保持不变。</p>'));
    scrollToBottom();
}
// 取消订单：不足 24 小时收服务费
function guideFlowerCancelStart(orderId) {
    var order = guideFlowerOrders().filter(function (x) { return x.id === orderId; })[0];
    if (!order)
        return;
    GUIDE_FLOWER = { mode: 'cancel', stage: 'cancel-confirm', order: order, boxId: 'flower-cancel-' + Date.now() };
    currentModule = 'flower';
    var slot = guideFlowerSlot(order.slot);
    var hrs = guideFlowerHoursLeft(order);
    appendMessage(guideMessage('<div id="' + GUIDE_FLOWER.boxId + '-wrap">' +
        '<div class="data-card"><div class="data-card-title">确认取消这条鲜花订单</div>' +
        '<div class="data-row"><span class="data-label">收花人</span><span class="data-value">' + guideEsc(order.recipient) + '</span></div>' +
        '<div class="data-row"><span class="data-label">配送时间</span><span class="data-value">' + guideFlowerDisplayDate(order.date) + ' ' + slot.text + '</span></div>' +
        '</div>' +
        (hrs < 24 ? '<p class="guide-tip">距离配送日不足24小时，取消会收取少量服务费 ¥' + FLOWER_CANCEL_FEE + '。</p>' : '<p class="guide-tip">配送前 24 小时以上可免费取消。</p>') +
        '<div class="guide-chips">' +
        '<button class="guide-chip" onclick="guideFlowerCancelSubmit()">确认取消</button>' +
        '<button class="guide-chip" onclick="guideFlowerCancelOp()">返回</button>' +
        '</div>' +
        '</div>'));
    scrollToBottom();
}
function guideFlowerCancelSubmit() {
    var s = GUIDE_FLOWER;
    if (!s || s.stage !== 'cancel-confirm' || !s.order)
        return;
    var order = s.order;
    var hrs = guideFlowerHoursLeft(order);
    var target = guideFlowerOrders().filter(function (x) { return x.id === order.id; })[0];
    if (!target) {
        appendMessage(guideMessage('<p>订单不存在，可能已被取消。</p>'));
        GUIDE_FLOWER = null;
        scrollToBottom();
        return;
    }
    if (target.status === '已取消') {
        appendMessage(guideMessage('<p>该订单已经取消过，不会重复退款。</p>'));
        GUIDE_FLOWER = null;
        scrollToBottom();
        return;
    }
    var paid = target.paid === true;
    var paidAmount = Number(target.paidAmount || target.price) || 0;
    var fee = (paid && hrs < 24) ? FLOWER_CANCEL_FEE : 0;
    var refund = paid ? Math.max(0, Math.round((paidAmount - fee) * 100) / 100) : 0;
    if (paid && refund > 0) {
        if (String(target.payMethod) === '信用卡') {
            var cc = mockData.userProfile.creditCard || {};
            cc.available = Math.round(((Number(cc.available) || 0) + refund) * 100) / 100;
            cc.used = Math.max(0, Math.round(((Number(cc.used) || 0) - refund) * 100) / 100);
            cc.currentBill = Math.max(0, Math.round(((Number(cc.currentBill) || 0) - refund) * 100) / 100);
            cc.minPayment = Math.round(cc.currentBill * 10) / 100;
            if (mockData.card) {
                mockData.card.usedLimit = cc.used;
                mockData.card.availableLimit = cc.available;
                mockData.card.billAmount = cc.currentBill;
            }
        }
        else {
            addTransaction('income', refund, '鲜花订单退款-' + target.recipient, '鲜花订购', true);
        }
    }
    target.status = '已取消';
    target.cancelledAt = new Date().toLocaleString('zh-CN');
    target.cancelFee = fee;
    target.refundAmount = refund;
    saveUserData();
    guideConfirmCardDone(s.boxId ? (s.boxId + '-wrap') : null, '已取消');
    GUIDE_FLOWER = null;
    appendMessage(guideMessage('<p>鲜花订单已取消' +
        (paid ? '，已退回 ¥' + refund + (fee > 0 ? '（扣除配送前 24 小时内取消服务费 ¥' + fee + '）' : '') : '，该订单未支付，无需退款') +
        '。</p>'));
    scrollToBottom();
    if (typeof guideModuleWrapUp === 'function')
        setTimeout(function () { guideModuleWrapUp('flower'); }, 400);
}
function guideFlowerCancelOp() {
    var boxId = GUIDE_FLOWER && GUIDE_FLOWER.boxId;
    GUIDE_FLOWER = null;
    if (!guideConfirmCardCollapse(boxId, '已取消本次操作，鲜花订单保持不变。')) {
        appendMessage(guideMessage('<p>已取消本次操作，鲜花订单保持不变。</p>'));
    }
    scrollToBottom();
    if (typeof guideModuleWrapUp === 'function')
        setTimeout(function () { guideModuleWrapUp('flower'); }, 400);
}
// 鲜花会话统一入口
async function guideFlowerSession(t) {
    var s = GUIDE_FLOWER;
    if (!s)
        return true;
    var plain = String(t || '').replace(/[吧呢啊呀。.!！?？\s]/g, '');
    if (s.mode === 'order') {
        if (s.stage === 'confirm' && /^(取消|不|算了)$/.test(plain)) {
            guideFlowerCancelOp();
            return true;
        }
        if (/^(返回|菜单|返回菜单|退出|取消|不订了|算了)$/.test(plain) && s.stage !== 'confirm') {
            GUIDE_FLOWER = null;
            guideExitSilently();
            return true;
        }
        return guideFlowerOrderStep(t);
    }
    if (s.mode === 'modify') {
        if (/^(返回|取消|不|算了)$/.test(plain) && s.stage === 'modify-confirm') {
            guideFlowerCancelOp();
            return true;
        }
        if (s.stage === 'modify-confirm' && /^(确认|确定|确认修改|是|好|行)$/.test(plain)) {
            guideFlowerModifySubmit();
            return true;
        }
        if (/^(返回|菜单|退出)$/.test(plain)) {
            GUIDE_FLOWER = null;
            guideBackToMenu();
            return true;
        }
        var b2 = guideFlowerBouquet(t);
        if (b2) {
            s.newBouquet = b2.name;
            guideFlowerModifyConfirm();
            return true;
        }
        appendMessage(guideMessage('<p>要改成哪一款花束？可选：' + FLOWER_BOUQUETS.map(function (x) { return x.name; }).join('、') + '</p>'));
        scrollToBottom();
        return true;
    }
    if (s.mode === 'cancel') {
        if (/^(确认|确定|确认取消|是|好|行)$/.test(plain)) {
            guideFlowerCancelSubmit();
            return true;
        }
        if (/^(返回|取消|不|算了)$/.test(plain)) {
            guideFlowerCancelOp();
            return true;
        }
        appendMessage(guideMessage('<p>请确认是否取消这条鲜花订单：回复「确认取消」或「返回」。</p>'));
        scrollToBottom();
        return true;
    }
    if (s.mode === 'list') {
        // 列表模式必须有出口：返回/菜单/退出/取消（未指定订单）都回到一级菜单
        if (/^(返回|菜单|返回菜单|退出|取消|不看了|算了)$/.test(plain)) {
            GUIDE_FLOWER = null;
            guideExitSilently();
            return true;
        }
        if (/修改|改一下|换款式|改款式/.test(t)) {
            var target2 = guideFlowerOrders().filter(function (x) { return x.status === '待配送' && t.indexOf(x.recipient) !== -1; })[0];
            if (target2) {
                guideFlowerModifyStart(target2.id);
                return true;
            }
        }
        if (/取消/.test(t)) {
            var target3 = guideFlowerOrders().filter(function (x) { return x.status === '待配送' && t.indexOf(x.recipient) !== -1; })[0];
            if (target3) {
                guideFlowerCancelStart(target3.id);
                return true;
            }
        }
        // 先识别「查看订单」这类只读请求，避免「订单」里的「订」被当成下单
        if (/(查看|看看|查询|显示|我的订单|订单列表|鲜花订单)/.test(t)) {
            guideStartFlowerList();
            return true;
        }
        // 下单相关说法：直接进入下单流程
        if (/(订|买|下单|送花|订花|来一束|花束|蛋糕)/.test(t)) {
            if (typeof guideStartFlowerOrder === 'function')
                guideStartFlowerOrder();
            return true;
        }
        appendMessage(guideMessage('<p>可以查看上面的订单；如需取消，告诉我「取消李四的鲜花订单」。</p>'));
        scrollToBottom();
        return true;
    }
    return true;
}
