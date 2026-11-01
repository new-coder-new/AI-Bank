# -*- coding: utf-8 -*-
"""生成参赛提交材料：技术文档 / 答辩 PPT / 安全自评报告 / 源代码压缩包。"""
import os
import re
import sys
import shutil
import zipfile
from datetime import datetime

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from pptx import Presentation
from pptx.util import Inches as PInches, Pt as PPt
from pptx.dml.color import RGBColor as PRGB

ROOT = r"C:\Users\32977\Desktop\配置\deploy-v5"
OUT = r"C:\Users\32977\Desktop\配置\智银管家-参赛提交"
MEDIA = os.path.join(ROOT, "scripts", "_submit_media")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MEDIA, exist_ok=True)

FONT_CN = r"C:\Windows\Fonts\msyh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
NAVY = RGBColor(0x0B, 0x3D, 0x7A)
GRAY = RGBColor(0x55, 0x5F, 0x6D)
ACCENT = RGBColor(0x0B, 0x4F, 0x9C)


def stats():
    ts = []
    for base, _, files in os.walk(os.path.join(ROOT, "js")):
        for f in files:
            if f.endswith(".ts"):
                ts.append(os.path.join(base, f))
    lines = 0
    for f in ts:
        with open(f, encoding="utf-8", errors="ignore") as fh:
            lines += len(fh.readlines())
    srv = os.path.join(ROOT, "server", "index.js")
    db = os.path.join(ROOT, "server", "db.js")
    srv_lines = len(open(srv, encoding="utf-8", errors="ignore").readlines())
    db_lines = len(open(db, encoding="utf-8", errors="ignore").readlines())
    routes = len(re.findall(r"'(GET|POST) /api/[^']+'", open(srv, encoding="utf-8", errors="ignore").read()))
    return len(ts), lines, srv_lines, db_lines, routes


def set_cn_font(run, size=10.5, bold=False, color=None, name="微软雅黑"):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), name)


def doc_setup(doc):
    st = doc.styles["Normal"]
    st.font.name = "微软雅黑"
    st.font.size = Pt(10.5)
    st._element.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑")
    for sec in doc.sections:
        sec.top_margin = Inches(0.9)
        sec.bottom_margin = Inches(0.9)
        sec.left_margin = Inches(1.0)
        sec.right_margin = Inches(1.0)


def h(doc, text, level=1):
    p = doc.add_heading(level=level)
    run = p.add_run(text)
    size = {1: 18, 2: 14, 3: 12}[level]
    set_cn_font(run, size, True, NAVY)
    p.paragraph_format.space_before = Pt(12 if level == 1 else 8)
    p.paragraph_format.space_after = Pt(6)
    return p


def para(doc, text, size=10.5, bold=False, color=None, align=None, space_after=6):
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_cn_font(run, size, bold, color)
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.25
    return p


def bullet(doc, text, size=10.5):
    p = doc.add_paragraph(style="List Bullet")
    run = p.add_run(text)
    set_cn_font(run, size)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.2
    return p


def table(doc, headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    for i, text in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = ""
        run = cell.paragraphs[0].add_run(text)
        set_cn_font(run, 9.5, True, NAVY)
    for row in rows:
        cells = t.add_row().cells
        for i, text in enumerate(row):
            cells[i].text = ""
            run = cells[i].paragraphs[0].add_run(str(text))
            set_cn_font(run, 9.5)
    doc.add_paragraph()
    return t


def build_arch_png(path):
    W, H = 1700, 1100
    img = Image.new("RGB", (W, H), "#F5F7FB")
    d = ImageDraw.Draw(img)
    f_title = ImageFont.truetype(FONT_BOLD, 46)
    f_box = ImageFont.truetype(FONT_BOLD, 27)
    f_text = ImageFont.truetype(FONT_CN, 21)
    f_small = ImageFont.truetype(FONT_CN, 18)

    d.text((W // 2, 40), "智银管家 · 系统架构", font=f_title, fill="#0B3D7A", anchor="ma")

    def box(x1, y1, x2, y2, title, lines, fill="#FFFFFF", edge="#C7D4E8", tc="#0B3D7A"):
        d.rounded_rectangle([x1, y1, x2, y2], radius=14, fill=fill, outline=edge, width=2)
        d.text(((x1 + x2) // 2, y1 + 18), title, font=f_box, fill=tc, anchor="ma")
        for i, line in enumerate(lines):
            d.text((x1 + 24, y1 + 62 + i * 30), line, font=f_text, fill="#39485C")

    # 用户层
    box(90, 110, 1610, 215, "用户层", ["手机浏览器（竖屏 390×844）", "桌面浏览器 1440×900", "局域网 / 本机访问"], "#EEF4FE", "#B9CCE9")
    # 前端层
    box(90, 255, 1110, 500, "前端交互层 · H5（38 个 TypeScript 模块）", [
        "主菜单 → 二级菜单 → 槽位补齐 → 确认卡",
        "确认 / 验证 / 结果卡 / 收尾问句",
        "转账 · 账单 · 卡片 · 理财 · 订阅 · 鲜花",
        "用户信息页：总览 / 卡片 / 复核 / 流水 / 联系人",
    ])
    box(1140, 255, 1610, 500, "设备与工具", [
        "TypeScript strict",
        "Vite 构建 / 压缩",
        "Playwright 自动演示",
        "剪映 / 录屏",
    ], "#FFF9EC", "#EAD9B0", "#8A6D1F")
    # 接口层
    box(90, 540, 1610, 690, "HTTP 接口层 · Node 零依赖服务（38 个 /api 路由）", [
        "转账 /api/transfer · /api/verify/issue        卡片 /api/card/*        理财 /api/wealth/*",
        "订阅 /api/subscription/*        复核 /api/review/approve|reject        审计 /api/ledger",
        "/api/snapshot · /api/reset · /api/budget/set · /api/ai/chat（可选 AI 代理）",
    ])
    # 领域层
    box(90, 730, 1010, 940, "领域能力层", [
        "意图路由（关键词 + 优先级）    槽位抽取（金额/时间/收款人/卡号）",
        "金额档位 T1–T4 + 风险加权      定时任务 / 订阅到期巡检",
        "人工复核队列 / 审批执行        审计流水（不可变追加）",
    ])
    box(1040, 730, 1610, 940, "数据与外部", [
        "SQLite（WAL）：state / ledger",
        "演示 PIN / OTP：123456",
        "AI Key 仅服务端（可选，缺省降级规则）",
        "Docker / CVM 部署脚本",
    ], "#EEF9F1", "#BFE3CB", "#1F6B3A")
    # 箭头
    def arrow(x, y1, y2):
        d.line([x, y1, x, y2], fill="#7C93B6", width=3)
        d.polygon([(x - 9, y2 - 10), (x + 9, y2 - 10), (x, y2)], fill="#7C93B6")

    arrow(W // 2, 215, 255)
    arrow(W // 2, 500, 540)
    arrow(W // 2, 690, 730)

    d.text((W // 2, H - 44), "服务端权威判档 · 前端只做展示与确认 · 资金与价格以服务端为准", font=f_small, fill="#5A6B82", anchor="ma")
    img.save(path, "PNG")
    return path


def build_tech_doc(ts_count, ts_lines, srv_lines, db_lines, routes, arch_png):
    doc = Document()
    doc_setup(doc)
    para(doc, "2026 深圳国际金融科技大赛", 12, True, GRAY, WD_ALIGN_PARAGRAPH.CENTER, 2)
    para(doc, "智银管家 · 技术文档", 26, True, NAVY, WD_ALIGN_PARAGRAPH.CENTER, 4)
    para(doc, "对话式银行智能服务台 ｜ 系统架构 · 核心算法 · 安全设计", 12, False, GRAY, WD_ALIGN_PARAGRAPH.CENTER, 18)

    h(doc, "1. 项目概述", 1)
    para(doc, "智银管家是一个面向手机端的对话式银行服务台演示系统。用户从六个业务入口进入模块，用一句自然语言说出需求，系统完成槽位补齐、确认卡确认、分级安全验证与结果反馈，全部资金动作由服务端判档、扣款并写入审计流水。")
    para(doc, "核心亮点：", 10.5, True)
    for t in [
        "对话即可办业务：菜单只负责选模块，业务信息用自然语言补齐；",
        "安全分级：T1 密码/指纹、T2 短信、T3 短信+人脸、T4 短信+人脸+人工复核，按金额与可疑度取较高档；",
        "服务端权威：金额档位、余额、价格、复核结论都由服务端判定，前端无法绕过；",
        "全链路可演示、可重置：一键恢复演示数据，配有 Playwright 自动化演示脚本。",
    ]:
        bullet(doc, t)

    h(doc, "2. 系统架构", 1)
    para(doc, "系统采用「前端 H5 + 零依赖 Node 服务 + SQLite」三层结构，AI 能力作为可选的意图增强层，未配置密钥时自动降级为规则引擎。")
    doc.add_picture(arch_png, width=Inches(6.3))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    para(doc, "图 1  系统架构", 9, False, GRAY, WD_ALIGN_PARAGRAPH.CENTER, 10)
    table(doc, ["层", "实现", "要点"], [
        ["前端交互层", f"{ts_count} 个 TypeScript 模块，约 {ts_lines} 行", "经典脚本 + 全局类型声明；strict 通过；Vite 压缩构建"],
        ["HTTP 接口层", f"Node 内置模块实现，{routes} 个 /api 路由，约 {srv_lines} 行", "零第三方运行时依赖；静态托管白名单；同源校验"],
        ["领域能力层", "意图路由 / 槽位抽取 / 档位判定 / 复核 / 审计", "纯函数为主，便于单测与复现"],
        ["数据层", f"SQLite（node:sqlite，WAL），约 {db_lines} 行", "state 快照 + ledger 审计表；重置即重新播种"],
    ])

    h(doc, "3. 核心算法", 1)
    h(doc, "3.1 意图路由与优先级", 2)
    para(doc, "入口不是「大模型直接决定一切」，而是「确定性规则优先、模型兜底」：")
    for t in [
        "先做全局拦截：退出、返回主菜单、切换模块、复核关键词等最高优先级；",
        "再做模块守卫：未进入模块时先要求选择模块，避免跨模块误操作；",
        "然后在模块内匹配二级操作（如「定时转账」「额度调整」）；",
        "都未命中时交给槽位解析器尝试识别金额/时间/收款人等，仍失败才提示示例。",
    ]:
        bullet(doc, t)
    para(doc, "这样既保证演示可复现（同一句话永远走同一路径），又保留自然语言输入的灵活性。")

    h(doc, "3.2 槽位抽取与多轮补齐", 2)
    table(doc, ["槽位", "抽取方式", "缺失时"], [
        ["金额", "阿拉伯数字 + 中文数字（万/千）", "追问金额"],
        ["时间", "今天/明天/后天 + 上午/下午 + 点/分", "追问执行时间"],
        ["收款人", "联系人姓名、手机号、卡号", "追问或要求先在联系人添加"],
        ["用途/原因", "受控词表（出行差旅、消费需求增加等）", "给出可选值"],
        ["周期", "月/季/年、不重复/每天/每周", "给默认并确认"],
    ])
    para(doc, "多轮流程用「草稿对象 + 状态机」实现：每次补齐一个槽位写回草稿，齐全后渲染确认卡；用户改口时按新槽位覆盖，不产生重复任务。")

    h(doc, "3.3 金额档位与风险加权", 2)
    table(doc, ["档位", "触发金额", "验证方式", "资金动作"], [
        ["T1", "< ¥1,000", "交易密码 / 指纹", "确认后执行"],
        ["T2", "¥1,000 – ¥9,999", "短信验证码", "验证后执行"],
        ["T3", "¥10,000 – ¥99,999", "短信验证码 + 人脸", "验证后执行"],
        ["T4", "≥ ¥100,000", "短信 + 人脸 + 人工复核", "提交复核，不立即扣款"],
    ])
    para(doc, "最终档位 = max(金额档, 可疑度档)：高风险行为（返利、深夜、异地）至少 T3，中风险至少 T2，防止「小额但高风险」绕过验证。")

    h(doc, "3.4 验证令牌与幂等", 2)
    para(doc, "服务端在验证通过后签发一次性令牌（请求头 X-Bank-Verify），资金接口校验令牌 + 金额档位 + 余额后才会执行；令牌消费即失效，避免重放。")

    h(doc, "3.5 定时任务与订阅巡检", 2)
    para(doc, "定时转账落库为任务对象（金额、日期、时间、重复方式）；订阅记录下次扣款日与自动续费开关，到期由服务端巡检扣费并写审计，余额不足时标记失败且不扣款。")

    h(doc, "3.6 人工复核闭环", 2)
    para(doc, "大额转账（≥ ¥100,000）、信用卡申请、额度调整会写入复核队列。审批通过时先做一次安全验证，再执行原操作；被拒绝则原操作作废，全程不扣款。")

    h(doc, "4. 安全设计", 1)
    table(doc, ["控制点", "实现"], [
        ["服务端权威", "金额档位、余额、产品价格、风险等级均由服务端计算，前端修改无效"],
        ["验证令牌", "一次性令牌绑定操作、过期失效；资金接口强校验"],
        ["复核隔离", "T4 与卡片/额度审批先入队，审批通过后执行"],
        ["审计流水", "所有资金动作追加 ledger 记录（操作、金额、来源、时间）"],
        ["静态资源", "仅放行 css/js/build/preview 白名单；隐藏文件不可访问"],
        ["AI 密钥", "仅服务端持有；前端经同源 /api/ai/chat 代理；无密钥自动降级"],
        ["演示凭据", "PIN 与 OTP 固定 123456，仅用于演示，不在生产使用"],
    ])

    h(doc, "5. 数据模型", 1)
    table(doc, ["表", "字段", "用途"], [
        ["state", "id / json / updated_at", "完整业务快照（账户、卡片、订阅、任务、复核队列）"],
        ["ledger", "id / type / amount / payload / created_at", "资金审计流水，只追加不修改"],
    ])

    h(doc, "6. API 概览（节选）", 1)
    table(doc, ["方法", "路径", "说明"], [
        ["GET", "/api/snapshot", "获取完整业务快照"],
        ["POST", "/api/transfer", "转账（服务端判档 + 令牌校验）"],
        ["POST", "/api/verify/issue", "签发验证令牌（演示 OTP 123456）"],
        ["GET", "/api/ledger", "审计流水"],
        ["POST", "/api/review/approve", "人工复核通过（执行原操作）"],
        ["POST", "/api/review/reject", "人工复核拒绝"],
        ["POST", "/api/reset", "重置演示数据"],
        ["POST", "/api/ai/chat", "可选 AI 意图代理"],
    ])

    h(doc, "7. 质量保障", 1)
    for t in [
        "TypeScript：主检查 + strict-all + strict emit 三套配置全部 0 错误；",
        "测试：10 个套件（意图、主菜单、模块守卫、目录、二级菜单、确认卡守卫、芯片枚举、服务端接口、源码守卫、LLM 意图样例）；",
        f"构建：{ts_count} 个脚本编译压缩并 hash；Docker 多阶段构建；",
        "演示：Playwright 设备模拟 + ffmpeg 合成，可重复录制。",
    ]:
        bullet(doc, t)

    h(doc, "8. 部署与运行", 1)
    table(doc, ["方式", "命令", "说明"], [
        ["本地", "npm install && npm start", "端口 8787，自动编译 TS"],
        ["开发", "npm run dev", "Vite HMR"],
        ["Docker", "docker build -t zhiyin . && docker run -p 8787:8787 zhiyin", "node:22-alpine"],
        ["云服务器", "bash scripts/deploy-cvm.sh", "构建、打包、上传、重启"],
        ["局域网", "http://<内网IP>:8787/", "手机与电脑同一 Wi-Fi"],
    ])

    h(doc, "9. 目录结构（节选）", 1)
    for line in [
        "index.html            页面骨架（引用 build/js 下 38 个脚本）",
        "css/style.css         全局样式（含手机断点）",
        "js/core/              配置、接口、存储、UI 工具",
        "js/flows/             各业务流程（转账、账单、卡片、理财、订阅、鲜花…）",
        "js/agent/             意图与工具定义（41 个工具 schema）",
        "server/index.js       HTTP 服务与 38 个 API",
        "server/db.js          SQLite 持久化与播种",
        "tests/                10 个测试套件",
        "scripts/              Vite 插件、部署脚本、自动演示",
        "docs/                 使用手册、测试用例、部署说明、安全审查报告",
    ]:
        para(doc, "  " + line, 9.5)

    para(doc, "文档版本：v1.0     生成时间：" + datetime.now().strftime("%Y-%m-%d"), 9, False, GRAY, None, 0)
    path = os.path.join(OUT, "01-技术文档.docx")
    doc.save(path)
    return path


def build_pptx(arch_png):
    prs = Presentation()
    prs.slide_width = PInches(13.333)
    prs.slide_height = PInches(7.5)
    blank = prs.slide_layouts[6]

    def add_slide(title, bullets=None, image=None, notes=""):
        s = prs.slides.add_slide(blank)
        bar = s.shapes.add_shape(1, 0, 0, prs.slide_width, PInches(0.9))
        bar.fill.solid()
        bar.fill.fore_color.rgb = PRGB(0x0B, 0x3D, 0x7A)
        bar.line.fill.background()
        tf = s.shapes.add_textbox(PInches(0.6), PInches(0.18), PInches(12), PInches(0.6)).text_frame
        tf.text = title
        p = tf.paragraphs[0]
        p.font.size = PPt(28)
        p.font.bold = True
        p.font.name = "微软雅黑"
        p.font.color.rgb = PRGB(0xFF, 0xFF, 0xFF)
        if bullets:
            box = s.shapes.add_textbox(PInches(0.8), PInches(1.3), PInches(11.8), PInches(5.6))
            tf2 = box.text_frame
            tf2.word_wrap = True
            for i, (text, size, bold) in enumerate(bullets):
                p2 = tf2.paragraphs[0] if i == 0 else tf2.add_paragraph()
                p2.text = text
                p2.font.size = PPt(size)
                p2.font.bold = bold
                p2.font.name = "微软雅黑"
                p2.font.color.rgb = PRGB(0x24, 0x33, 0x45)
                p2.space_after = PPt(10)
        if image:
            s.shapes.add_picture(image, PInches(0.7), PInches(1.35), width=PInches(11.9))
        if notes:
            s.notes_slide.notes_text_frame.text = notes
        return s

    # 1 封面
    s = prs.slides.add_slide(blank)
    bg = s.shapes.add_shape(1, 0, 0, prs.slide_width, prs.slide_height)
    bg.fill.solid()
    bg.fill.fore_color.rgb = PRGB(0x0B, 0x3D, 0x7A)
    bg.line.fill.background()
    tf = s.shapes.add_textbox(PInches(0.9), PInches(2.2), PInches(11.5), PInches(1.2)).text_frame
    tf.text = "智银管家"
    tf.paragraphs[0].font.size = PPt(54)
    tf.paragraphs[0].font.bold = True
    tf.paragraphs[0].font.name = "微软雅黑"
    tf.paragraphs[0].font.color.rgb = PRGB(0xFF, 0xFF, 0xFF)
    tf2 = s.shapes.add_textbox(PInches(0.9), PInches(3.6), PInches(11.5), PInches(1.6)).text_frame
    tf2.text = "对话式银行智能服务台\n系统架构 · 核心算法 · 安全分级"
    for p in tf2.paragraphs:
        p.font.size = PPt(22)
        p.font.name = "微软雅黑"
        p.font.color.rgb = PRGB(0xD7, 0xE4, 0xF7)
    s.notes_slide.notes_text_frame.text = "开场 20 秒：介绍项目定位——一句话办银行业务的手机端演示系统。"

    add_slide("问题与思路", [
        ("传统手机银行：功能深、入口多、表单长，办一笔转账要点 5–6 屏。", 22, False),
        ("我们的做法：对话里把需求说完整，系统补齐槽位、给确认卡、按金额分级验证。", 22, True),
        ("菜单只负责「进哪个模块」，业务信息全部由自然语言补齐。", 22, False),
    ], notes="60 秒：说明痛点与交互范式差异。")

    add_slide("系统架构", image=arch_png,
              notes="60 秒：前端 38 个 TS 模块 → 38 个 API → 服务端判档 → SQLite 快照 + 审计流水。")

    add_slide("六大业务模块", [
        ("转账收款：姓名 / 手机号 / 定时 / AA 收款", 20, False),
        ("账单与交易：本月·本年账单分析、异常交易", 20, False),
        ("卡片管理：我的卡片 / 申请 / 调额 / 交易限制 / 挂失", 20, False),
        ("理财：持仓 / 在售清单 / 申购 / 风险测评", 20, False),
        ("订阅管理：我的订阅 / 可订会员 / 自动续费 / 取消", 20, False),
        ("生活订购：生日鲜花（鲜花 + 蛋糕）", 20, False),
    ], notes="50 秒：快速过一遍模块，为演示做铺垫。")

    add_slide("对话交互设计", [
        ("四层结构：模块菜单 → 槽位补齐 → 确认卡 → 结果卡 + 收尾问句", 22, True),
        ("缺什么问什么：金额、时间、收款人、用途，逐项补齐", 20, False),
        ("确认卡是唯一执行入口，未完成确认前不允许新指令", 20, False),
        ("每笔完成/取消后追问「还需要办理其他业务吗」", 20, False),
    ], notes="60 秒：强调可预测、可演示，不依赖大模型随机发挥。")

    add_slide("安全分级：T1–T4", [
        ("T1  < ¥1,000：交易密码 / 指纹", 22, False),
        ("T2  ¥1,000–9,999：短信验证码", 22, False),
        ("T3  ¥10,000–99,999：短信 + 人脸", 22, False),
        ("T4  ≥ ¥100,000：短信 + 人脸 + 人工复核（不立即扣款）", 22, True),
        ("风险加权：深夜 / 异地 / 返利等可疑行为至少 T2–T3", 20, False),
    ], notes="70 秒：安全是最大卖点，讲清「金额 + 可疑度取较高档」。")

    add_slide("服务端权威与审计", [
        ("前端只收集与展示：档位、余额、价格、复核结论都由服务端计算", 21, False),
        ("一次性验证令牌（X-Bank-Verify）绑定操作，消费即失效", 21, False),
        ("复核队列：大额转账 / 卡申请 / 调额，审批通过才执行", 21, False),
        ("所有资金动作写 ledger 审计流水，可追溯、可重置", 21, False),
    ], notes="50 秒：说明「演示也不糊弄」，真正落到服务端。")

    add_slide("技术实现", [
        ("前端：38 个 TypeScript 模块、约 2.2 万行，strict 0 错误", 21, False),
        ("后端：Node 零第三方依赖，38 个 /api 路由", 21, False),
        ("数据：SQLite（WAL）state + ledger 双表", 21, False),
        ("构建：Vite 压缩 hash、Docker 多阶段、CVM 部署脚本", 21, False),
    ], notes="45 秒：给评委一个工程完整度的印象。")

    add_slide("质量保障", [
        ("三套 tsconfig 全量 strict 检查通过", 21, False),
        ("10 个测试套件：意图 / 菜单 / 守卫 / 目录 / 确认卡 / 芯片 / 服务端 / 源码", 21, False),
        ("自动演示：Playwright 设备模拟 + ffmpeg 合成，可重复录制", 21, False),
        ("一键重置演示数据，任何状态都能回到初始", 21, False),
    ], notes="40 秒。")

    add_slide("演示路径（约 4 分钟）", [
        ("转账 700（T1 密码）→ 手机号 1200（T2 短信）→ 定时 20000（T3 人脸）", 20, False),
        ("AA 收款 → 账单分析（本月/本年）→ 异常交易", 20, False),
        ("我的卡片 → 办卡 5 万 → 额度调整 → 交易限制", 20, False),
        ("理财申购 → 持仓 → 订阅四步 → 鲜花 → 复核审批 → 重置", 20, False),
    ], notes="40 秒：按演示脚本走一遍，评委对覆盖度心里有数。")

    add_slide("运行与部署", [
        ("本地：npm install && npm start → http://127.0.0.1:8787/", 22, False),
        ("Docker：docker build -t zhiyin . && docker run -p 8787:8787 zhiyin", 22, False),
        ("局域网手机演示：http://<内网IP>:8787/", 22, False),
        ("演示凭据：PIN / OTP 固定 123456，可一键重置", 22, False),
    ], notes="30 秒。")

    add_slide("总结", [
        ("把「表单式手机银行」变成「对话式银行服务台」", 24, True),
        ("安全分级真正落到服务端：档位、令牌、复核、审计", 22, False),
        ("工程完整：strict TS、10 个测试套件、Docker、自动演示", 22, False),
        ("下一步：多用户会话、HTTPS、审计检索、真实短信通道", 20, False),
    ], notes="30 秒收尾：落到「可演示、可复现、可扩展」。")
    path = os.path.join(OUT, "02-答辩材料.pptx")
    prs.save(path)
    return path


def build_security_doc():
    doc = Document()
    doc_setup(doc)
    para(doc, "2026 深圳国际金融科技大赛", 12, True, GRAY, WD_ALIGN_PARAGRAPH.CENTER, 2)
    para(doc, "智银管家 · 安全自评报告", 24, True, NAVY, WD_ALIGN_PARAGRAPH.CENTER, 4)
    para(doc, "权限分级实现说明 与 已知风险清单", 12, False, GRAY, WD_ALIGN_PARAGRAPH.CENTER, 14)

    h(doc, "1. 自评结论", 1)
    para(doc, "本系统是演示环境，但资金链路的权限分级、验证与审计均在服务端实现，前端无法通过改金额、改价格或跳过验证完成交易。演示凭据固定为 123456，仅用于评委复现，不适用于生产。")
    para(doc, "结论：演示范围内满足「资金动作分级验证 + 服务端权威 + 可审计」；作为生产系统仍存在若干已知风险，见第 4 节。")

    h(doc, "2. 权限分级实现说明", 1)
    h(doc, "2.1 档位表", 2)
    table(doc, ["档位", "金额区间", "验证要素", "服务端行为"], [
        ["T1", "< ¥1,000", "交易密码 / 指纹", "校验令牌后扣款"],
        ["T2", "¥1,000 – 9,999", "短信验证码", "校验 OTP 令牌后扣款"],
        ["T3", "¥10,000 – 99,999", "短信 + 人脸", "双要素令牌校验后扣款"],
        ["T4", "≥ ¥100,000", "短信 + 人脸 + 人工复核", "写入复核队列，审批通过后执行"],
    ])
    h(doc, "2.2 判定顺序", 2)
    for t in [
        "服务端按金额计算档位；",
        "叠加风险档：高风险（返利、深夜、异地）至少 T3，中风险至少 T2；",
        "取两者较高档位作为本次要求的验证组合；",
        "验证通过后签发一次性令牌，资金接口校验令牌、档位与余额后才执行。",
    ]:
        bullet(doc, t)
    h(doc, "2.3 防绕过措施", 2)
    table(doc, ["攻击面", "措施"], [
        ["前端改金额 / 改价格", "服务端重新计算金额档位与产品价格，签名不符直接拒绝"],
        ["重放验证结果", "令牌一次性消费，绑定操作与金额"],
        ["跳过确认卡", "确认卡是唯一执行入口，未确认前拦截新指令"],
        ["T4 直接扣款", "服务端只入队，审批通过后才执行；未通过不扣款"],
        ["越权访问他人数据", "演示为单用户会话；路由不接受外部用户标识"],
    ])
    h(doc, "2.4 审计与可追溯", 2)
    para(doc, "每笔资金动作追加一条 ledger 记录（操作类型、金额、来源、时间、载荷），只追加不修改，`GET /api/ledger` 可查询；重置演示数据会同时清空流水并重新播种。")

    h(doc, "3. 数据与隐私", 1)
    for t in [
        "全部为演示数据（虚构姓名、卡号、余额），不含真实个人信息；",
        "数据仅存本机 SQLite（data/bank.db），不上传第三方；",
        "AI 密钥仅服务端持有，前端经同源代理调用，密钥不下发浏览器；",
        "未配置 AI 密钥时自动降级为规则引擎，功能不受影响。",
    ]:
        bullet(doc, t)

    h(doc, "4. 已知风险清单", 1)
    table(doc, ["#", "风险", "等级", "影响", "现状与缓解", "建议"], [
        ["R1", "演示 PIN/OTP 固定 123456", "高（演示）", "任何人可完成验证", "仅演示环境；文档明确", "生产接入真实短信/生物识别"],
        ["R2", "HTTP 明文（局域网）", "中", "链路可被嗅探", "仅内网演示", "生产强制 HTTPS/HSTS"],
        ["R3", "无多用户鉴权与会话隔离", "中", "无法区分真实用户", "演示单用户模型", "接入 OAuth/JWT 与租户隔离"],
        ["R4", "限流为内存级、单实例", "中", "可被单机打满", "基础限流已加", "网关限流 + WAF"],
        ["R5", "SQLite 单机存储", "低", "并发与容灾有限", "演示量级足够", "生产换 PostgreSQL + 备份"],
        ["R6", "前端源码可见", "低", "逻辑暴露", "判档在服务端", "保持服务端权威即可"],
        ["R7", "未做渗透测试 / 依赖扫描", "中", "未知漏洞", "代码审查 + 源码守卫测试", "上线前做渗透与 SCA"],
        ["R8", "审计日志未做检索与告警", "低", "追溯效率一般", "已记录全量流水", "接入日志平台与告警"],
        ["R9", "演示数据重置接口无鉴权", "中（演示）", "可被清空演示数据", "仅演示用途", "生产移除该接口或加管理员鉴权"],
        ["R10", "AI 代理为可选依赖", "低", "无密钥时能力降级", "自动降级规则引擎", "生产配置密钥与熔断"],
    ])

    h(doc, "5. 改进计划", 1)
    for t in [
        "P0：真实短信通道与生物识别；HTTPS；移除演示重置接口或加管理员鉴权；",
        "P1：多用户鉴权与会话隔离；网关限流；审计检索与告警；",
        "P2：渗透测试与依赖漏洞扫描；数据库迁移与备份；",
        "P3：AI 意图层灰度与熔断、人工复核 SLA。",
    ]:
        bullet(doc, t)

    para(doc, "报告版本：v1.0     生成时间：" + datetime.now().strftime("%Y-%m-%d"), 9, False, GRAY, None, 0)
    path = os.path.join(OUT, "04-安全自评报告.docx")
    doc.save(path)
    return path


def build_zip():
    zip_path = os.path.join(OUT, "03-源代码与部署材料.zip")
    skip_dirs = {"node_modules", "build", "dist", "data", "preview", ".git", ".workbuddy", "__pycache__"}
    include_root = [
        "index.html", "package.json", "package-lock.json", "README.md", "Dockerfile",
        ".dockerignore", ".gitignore", "vite.config.mjs",
        "tsconfig.json", "tsconfig.emit.json", "tsconfig.strict-all.json",
    ]
    dirs = ["css", "js", "server", "tests", "scripts", "types", "docs"]
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in include_root:
            full = os.path.join(ROOT, f)
            if os.path.isfile(full):
                z.write(full, f)
        for d in dirs:
            base = os.path.join(ROOT, d)
            for cur, subs, files in os.walk(base):
                subs[:] = [s for s in subs if s not in skip_dirs]
                for f in files:
                    if f.endswith((".db", ".mp4", ".webm", ".jpg", ".png")):
                        continue
                    # 本地密钥文件绝不打进提交包（只保留 .example）
                    if f == "config.local.js" or f.startswith(".env"):
                        continue
                    full = os.path.join(cur, f)
                    rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
                    z.write(full, rel)
        # 提交说明与检查清单
        readme = (
            "智银管家 · 源代码与部署材料\n\n"
            "运行：npm install && npm start → http://127.0.0.1:8787/\n"
            "构建：npm run build；类型检查：npm run typecheck；测试：npm test\n"
            "部署：见 docs/部署说明.md（本地 / Docker / CVM / 局域网）\n"
            "测试用例：见 docs/测试用例.md 与 tests/（10 个套件）\n"
        )
        z.writestr("README-提交说明.txt", readme)
    return zip_path


def main():
    ts_count, ts_lines, srv_lines, db_lines, routes = stats()
    arch = os.path.join(MEDIA, "arch.png")
    build_arch_png(arch)
    files = [
        build_tech_doc(ts_count, ts_lines, srv_lines, db_lines, routes, arch),
        build_pptx(arch),
        build_security_doc(),
        build_zip(),
    ]
    # 演示视频（如果有）
    video_dir = os.path.join(ROOT, "preview", "demo")
    if os.path.isdir(video_dir):
        vids = [os.path.join(video_dir, f) for f in os.listdir(video_dir) if f.endswith(".mp4")]
        if vids:
            latest = max(vids, key=os.path.getmtime)
            shutil.copy2(latest, os.path.join(OUT, "05-演示视频.mp4"))
    # 提交说明
    lines = [
        "智银管家 · 参赛提交材料",
        "",
        "对应报名页面的 4 项必交材料：",
        "  01-技术文档.docx          → 技术文档（系统架构图、核心算法说明、安全设计文档）",
        "  02-答辩材料.pptx          → 答辩材料（约 12 页，汇报时长 ≤10 分钟）",
        "  03-源代码与部署材料.zip   → 源代码与部署材料（含 README、部署说明、测试用例）",
        "  04-安全自评报告.docx      → 安全自评报告（权限分级实现说明 + 已知风险清单）",
        "  05-演示视频.mp4           → 附加：手机端演示录像（非必交）",
        "  代码仓库                   → https://github.com/new-coder-new/AI-Bank",
        "",
        "体积检查：",
    ]
    for f in sorted(os.listdir(OUT)):
        full = os.path.join(OUT, f)
        if os.path.isfile(full):
            mb = os.path.getsize(full) / 1024 / 1024
            lines.append(f"  {f}  {mb:.1f} MB")
    lines += [
        "",
        "格式对照：",
        "  技术文档 PDF/DOC/DOCX ≤50MB → 已用 DOCX，可另存 PDF",
        "  答辩 PPT/PPTX/PDF ≤80MB     → 已用 PPTX",
        "  源码 ZIP/RAR/7Z/TAR.GZ ≤300MB → 已用 ZIP",
        "  安全自评报告               → DOCX（可按页面要求转 PDF）",
        "",
        "上传前自检：",
        "  1) 技术文档包含架构图与安全设计；2) PPT 试讲 ≤10 分钟；",
        "  3) 压缩包解压后能 npm install && npm start；4) 安全报告覆盖 10 项风险。",
    ]
    with open(os.path.join(OUT, "提交说明.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print("生成完成：", OUT)
    for f in sorted(os.listdir(OUT)):
        print(" ", f, round(os.path.getsize(os.path.join(OUT, f)) / 1024 / 1024, 2), "MB")


if __name__ == "__main__":
    main()
