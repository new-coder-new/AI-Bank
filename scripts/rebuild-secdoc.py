# -*- coding: utf-8 -*-
"""按当前项目规则重建《智银管家安全自评报告》：修正事实、统一排版、去掉 AI 式格式。"""
import os
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUT = r"C:\Users\32977\Desktop\配置\智银管家安全自评报告-修正版.docx"
NAVY = RGBColor(0x0B, 0x3D, 0x7A)
GRAY = RGBColor(0x59, 0x63, 0x72)
FONT = "微软雅黑"


def set_font(run, size=10.5, bold=False, color=None):
    run.font.name = FONT
    run.font.size = Pt(size)
    run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), FONT)


def setup(doc):
    st = doc.styles["Normal"]
    st.font.name = FONT
    st.font.size = Pt(10.5)
    st._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    st.paragraph_format.line_spacing = 1.5
    st.paragraph_format.space_after = Pt(4)
    for sec in doc.sections:
        sec.top_margin = Inches(1.0)
        sec.bottom_margin = Inches(1.0)
        sec.left_margin = Inches(1.1)
        sec.right_margin = Inches(1.1)
    footer = doc.sections[0].footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer.add_run()
    f1 = OxmlElement("w:fldChar"); f1.set(qn("w:fldCharType"), "begin")
    it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = "PAGE"
    f2 = OxmlElement("w:fldChar"); f2.set(qn("w:fldCharType"), "end")
    run._r.append(f1); run._r.append(it); run._r.append(f2)
    set_font(run, 9, False, GRAY)


def h1(doc, text):
    p = doc.add_paragraph()
    set_font(p.add_run(text), 16, True, NAVY)
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.keep_with_next = True


def h2(doc, text):
    p = doc.add_paragraph()
    set_font(p.add_run(text), 12.5, True, NAVY)
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.keep_with_next = True


def body(doc, text, indent=True):
    p = doc.add_paragraph()
    set_font(p.add_run(text), 10.5)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    if indent:
        p.paragraph_format.first_line_indent = Pt(21)
    p.paragraph_format.space_after = Pt(4)


def bullet(doc, text):
    p = doc.add_paragraph(style="List Bullet")
    set_font(p.add_run(text), 10.5)
    p.paragraph_format.space_after = Pt(2)


def table(doc, headers, rows):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, text in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = ""
        set_font(cell.paragraphs[0].add_run(text), 9.5, True, NAVY)
    for row in rows:
        cells = t.add_row().cells
        for i, text in enumerate(row):
            cells[i].text = ""
            set_font(cells[i].paragraphs[0].add_run(str(text)), 9.5)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


doc = Document()
setup(doc)

# 封面
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(90)
set_font(p.add_run("智银管家安全自评报告"), 24, True, NAVY)
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
set_font(p.add_run("权限分级实现说明与已知风险清单"), 12, False, GRAY)
p.paragraph_format.space_after = Pt(40)
for line in ["文档版本：v1.0", "发布日期：2026 年 11 月 1 日", "适用系统：智银管家演示版"]:
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(p.add_run(line), 10.5, False, GRAY)
    p.paragraph_format.space_after = Pt(2)
doc.add_page_break()

# 1 自评结论
h1(doc, "1 自评结论")
body(doc, "本系统为演示环境，但资金链路的权限分级、验证与审计均在服务端实现。前端无法通过修改金额、修改价格或跳过验证完成交易；演示凭据固定为 123456，仅用于评委复现，不适用于生产环境。")
body(doc, "结论：演示范围内满足“资金动作分级验证、服务端权威、可审计”三项要求；作为生产系统仍存在若干已知风险，见第 4 节。")

# 2 权限分级实现说明
h1(doc, "2 权限分级实现说明")
h2(doc, "2.1 档位表")
table(doc, ["档位", "金额区间", "验证要素", "服务端行为"], [
    ["T1", "低于 ¥1,000", "交易密码或指纹", "确认后扣款，不校验验证令牌"],
    ["T2", "¥1,000–9,999", "短信验证码", "校验一次性令牌后扣款"],
    ["T3", "¥10,000–99,999", "短信 + 人脸", "校验一次性令牌后扣款"],
    ["T4", "≥ ¥100,000", "短信 + 人脸 + 人工复核", "写入复核队列，审批通过后执行"],
])
body(doc, "复核队列的来源包括：大额转账（≥ ¥100,000）、信用卡申请与额度调整。T4 转账在审批通过前不扣款。")

h2(doc, "2.2 判定顺序")
for t in ["服务端按金额计算金额档位；",
          "叠加风险档位：高风险行为至少 T3，中风险至少 T2；",
          "取两者较高档位作为本次要求的验证组合；",
          "验证通过后签发一次性令牌，资金接口校验令牌、档位与余额后才执行。"]:
    bullet(doc, t)

h2(doc, "2.3 防绕过措施")
table(doc, ["攻击面", "措施"], [
    ["前端改金额", "服务端按提交金额重新判定档位，与前端展示不一致时以服务端为准"],
    ["前端改价格", "产品价格由服务端计算，前端仅展示"],
    ["重放验证结果", "令牌一次性消费，绑定操作与金额"],
    ["跳过确认卡", "确认卡是唯一执行入口，未确认前拦截新指令"],
    ["T4 直接扣款", "服务端只入队，审批通过后才执行；未通过不扣款"],
    ["越权访问他人数据", "演示为单用户会话，路由不接受外部用户标识"],
])

h2(doc, "2.4 审计与可追溯")
body(doc, "每笔资金动作追加一条 ledger 记录，包含操作类型、金额、来源、时间与载荷，只追加不修改；可通过 GET /api/ledger 查询。重置演示数据时会同时清空流水并重新播种。")

# 3 数据与隐私
h1(doc, "3 数据与隐私")
for t in ["全部为演示数据（虚构姓名、卡号、余额），不含真实个人信息；",
          "数据仅存本机 SQLite（data/bank.db），不上传第三方；",
          "AI 密钥仅由服务端持有（环境变量读取），前端经同源代理调用，密钥不下发浏览器；",
          "未配置 AI 密钥时自动降级为规则引擎，功能不受影响。"]:
    bullet(doc, t)

# 4 已知风险清单
h1(doc, "4 已知风险清单")
table(doc, ["编号", "风险", "等级", "影响", "现状与缓解", "建议"], [
    ["R1", "演示 PIN 与 OTP 固定为 123456", "高（演示）", "任何人可完成验证", "仅演示环境；文档已明确", "生产接入真实短信或生物识别"],
    ["R2", "HTTP 明文（局域网）", "中", "链路可被嗅探", "仅内网演示", "生产强制 HTTPS 与 HSTS"],
    ["R3", "无多用户鉴权与会话隔离", "中", "无法区分真实用户", "演示单用户模型", "接入 OAuth/JWT 与租户隔离"],
    ["R4", "限流为内存级、单实例", "中", "可被单机打满", "已加基础限流", "网关限流与 WAF"],
    ["R5", "SQLite 单机存储", "低", "并发与容灾有限", "演示量级足够", "生产换 PostgreSQL 并做备份"],
    ["R6", "前端源码可见", "低", "业务逻辑暴露", "判档在服务端完成", "保持服务端权威即可"],
    ["R7", "未做渗透测试与依赖漏洞扫描", "中", "可能存在未知漏洞", "代码审查与源码守卫测试", "上线前完成渗透测试与 SCA"],
    ["R8", "审计日志未做检索与告警", "低", "追溯效率一般", "已记录全量流水", "接入日志平台与告警"],
    ["R9", "演示数据重置接口无鉴权", "中（演示）", "可被清空演示数据", "仅演示用途", "生产移除该接口或加管理员鉴权"],
    ["R10", "AI 代理为可选依赖", "低", "无密钥时能力降级", "自动降级规则引擎", "生产配置密钥并加熔断"],
    ["R11", "本地配置文件可能写入真实密钥", "中", "误提交会泄露密钥", "config.local.js 已 gitignore，提交包已排除", "统一使用环境变量，禁止写入仓库"],
])

# 5 改进计划
h1(doc, "5 改进计划")
for t in ["P0：真实短信通道与生物识别；启用 HTTPS；移除演示重置接口或增加管理员鉴权；",
          "P1：多用户鉴权与会话隔离；网关限流；审计检索与告警；",
          "P2：渗透测试与依赖漏洞扫描；数据库迁移与备份；",
          "P3：AI 意图层灰度与熔断；人工复核服务级别约定。"]:
    bullet(doc, t)

doc.save(OUT)
print("saved:", OUT, os.path.getsize(OUT))
