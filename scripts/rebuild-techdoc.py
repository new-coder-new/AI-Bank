# -*- coding: utf-8 -*-
"""按当前项目规则重建《智银管家技术文档》：修正事实错误、统一排版、去掉 AI 式格式。"""
import os
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUT_DOCX = r"C:\Users\32977\Desktop\配置\智银管家技术文档-修正版.docx"
ARCH = r"C:\Users\32977\AppData\Local\Temp\techdoc_arch.png"

NAVY = RGBColor(0x0B, 0x3D, 0x7A)
GRAY = RGBColor(0x59, 0x63, 0x72)
BODY_FONT = "微软雅黑"
HEAD_FONT = "微软雅黑"


def set_font(run, size=10.5, bold=False, color=None, name=BODY_FONT):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    if color is not None:
        run.font.color.rgb = color
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), name)


def setup(doc):
    st = doc.styles["Normal"]
    st.font.name = BODY_FONT
    st.font.size = Pt(10.5)
    st._element.rPr.rFonts.set(qn("w:eastAsia"), BODY_FONT)
    st.paragraph_format.line_spacing = 1.5
    st.paragraph_format.space_after = Pt(4)
    for sec in doc.sections:
        sec.top_margin = Inches(1.0)
        sec.bottom_margin = Inches(1.0)
        sec.left_margin = Inches(1.1)
        sec.right_margin = Inches(1.1)
    # 页脚页码
    footer = doc.sections[0].footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    fld1 = OxmlElement("w:fldChar"); fld1.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText"); instr.set(qn("xml:space"), "preserve"); instr.text = "PAGE"
    fld2 = OxmlElement("w:fldChar"); fld2.set(qn("w:fldCharType"), "end")
    run._r.append(fld1); run._r.append(instr); run._r.append(fld2)
    set_font(run, 9, False, GRAY)


def h1(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_font(run, 16, True, NAVY, HEAD_FONT)
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.keep_with_next = True
    return p


def h2(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_font(run, 12.5, True, NAVY, HEAD_FONT)
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.keep_with_next = True
    return p


def body(doc, text, indent=True):
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_font(run, 10.5)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    if indent:
        p.paragraph_format.first_line_indent = Pt(21)
    p.paragraph_format.space_after = Pt(4)
    return p


def bullet(doc, text):
    p = doc.add_paragraph(style="List Bullet")
    run = p.add_run(text)
    set_font(run, 10.5)
    p.paragraph_format.space_after = Pt(2)
    return p


def table(doc, headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = t.rows[0].cells
    for i, text in enumerate(headers):
        hdr[i].text = ""
        run = hdr[i].paragraphs[0].add_run(text)
        set_font(run, 9.5, True, NAVY)
    for row in rows:
        cells = t.add_row().cells
        for i, text in enumerate(row):
            cells[i].text = ""
            run = cells[i].paragraphs[0].add_run(str(text))
            set_font(run, 9.5)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


doc = Document()
setup(doc)

# —— 封面 ——
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(90)
run = p.add_run("智银管家技术文档")
set_font(run, 26, True, NAVY, HEAD_FONT)

p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("ZhiYin Banker Copilot")
set_font(run, 14, False, GRAY, HEAD_FONT)

p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("系统架构、核心算法与安全设计")
set_font(run, 12, False, GRAY, HEAD_FONT)
p.paragraph_format.space_after = Pt(40)

for line in ["文档版本：v1.0", "发布日期：2026 年 11 月 1 日", "运行形态：单端口 Web 应用", "默认地址：http://127.0.0.1:8787/"]:
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(line)
    set_font(run, 10.5, False, GRAY)
    p.paragraph_format.space_after = Pt(2)

doc.add_page_break()

# —— 1 文档说明 ——
h1(doc, "1 文档说明")
body(doc, "本文档介绍智银管家的系统架构、业务处理流程、核心算法与安全设计。智银管家是一个面向个人客户的对话式银行服务演示原型，用于展示自然语言交互在银行业务办理中的应用。")
body(doc, "在资金操作中，前端负责信息收集、结果展示和用户确认，服务端负责余额校验、资金变动与审计记录。系统使用 Node.js 内置 SQLite 模块保存业务数据，不依赖额外的数据库服务。")

# —— 2 项目概述 ——
h1(doc, "2 项目概述")
h2(doc, "2.1 项目定位")
body(doc, "智银管家以对话窗口作为主要交互入口：用户用自然语言提出需求，系统识别意图并补齐必要信息，再按业务类型生成确认卡；涉及资金变动的操作还需通过对应的安全验证。相比菜单式操作，减少了页面跳转与查找入口的成本。")
h2(doc, "2.2 业务范围")
body(doc, "系统目前覆盖以下业务：")
for t in ["转账收款：姓名转账、手机号转账、定时转账、AA 收款；",
          "账单与交易：本月与本年账单分析、异常交易；",
          "卡片管理：我的卡片、卡片申请、额度调整、交易限制、卡片挂失；",
          "理财：我的持仓、在售产品、产品申购、风险评估；",
          "订阅管理：我的订阅、可订阅会员、添加订阅、自动续费、取消订阅；",
          "生活订购：生日鲜花（鲜花与蛋糕）；",
          "账户：账户总览、基本信息、卡片信息、复核审批、交易记录、联系人。"]:
    bullet(doc, t)
h2(doc, "2.3 运行形态")
body(doc, "系统采用前后端分离的模块化组织方式，但运行时由同一个 Web 服务提供页面与业务接口。前端使用 TypeScript 编写，后端为零依赖 Node.js HTTP 服务，SQLite 保存服务端业务快照与资金流水。")

# —— 3 系统架构 ——
h1(doc, "3 系统架构")
h2(doc, "3.1 总体架构")
body(doc, "系统分为用户层、前端交互层、HTTP 接口层、领域能力层与数据层，AI 能力作为可选的意图增强层存在。")
if os.path.exists(ARCH):
    doc.add_picture(ARCH, width=Inches(6.1))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("图 1 智银管家总体架构")
    set_font(run, 9, False, GRAY)
body(doc, "用户通过浏览器访问 Web 页面。前端交互层负责展示业务入口、聊天内容、用户信息与确认卡；HTTP 接口层接收前端请求并返回业务数据；领域能力层完成意图路由、槽位抽取、金额档位判定、风险识别与复核；数据层保存业务状态与审计流水。")

h2(doc, "3.2 前端结构")
body(doc, "前端采用 TypeScript 多模块结构，源码经构建后输出到 build/js/，页面按顺序加载脚本，各模块通过全局函数提供能力。按职责分为三个目录：")
table(doc, ["目录", "职责", "主要模块"], [
    ["js/core/", "基础配置、数据与页面公共能力", "config、api、storage、session、ui、visualization、icons"],
    ["js/flows/", "业务流程与页面交互", "chat、security、transfer、wealth、card、cardlimit、subscription、analysis、guide-*、userinfo"],
    ["js/agent/", "自然语言理解、决策与知识检索", "agent、agent-llm、context、kb、scenario、profile、decision、riskdetect、planner、display、insights"],
])
body(doc, "页面按模块依赖顺序加载：icons、config、api、visualization、storage、security、transfer、wealth、card、subscription、userinfo、analysis、ai、agent、profile、decision、riskdetect、planner、display、cardlimit、agentsvc、context、kb、scenario、insights、agent-llm、chat、ui。")

h2(doc, "3.3 后端结构")
body(doc, "后端入口为 server/index.js，使用 Node.js 内置 HTTP 模块提供服务，不依赖 Express 等第三方 Web 框架，在同一端口处理静态资源与业务 API。默认端口 8787，可通过环境变量 PORT 指定。")
body(doc, "后端主要职责包括：提供页面与静态资源；处理账户、账单、转账等业务请求；接收业务变更；校验资金操作的余额与安全条件；写入 SQLite；记录审计流水。资金类写操作在服务端会再次校验，不能仅凭前端显示判断成功。")

h2(doc, "3.4 数据模型与持久化")
body(doc, "SQLite 使用 WAL 模式。state 表以键值形式保存业务快照，ledger 表记录资金操作审计流水。前端本地数据包括 financeAssistantData_v1、agent_memory_v2 等字段；定时转账、风险测评与人工复核记录作为本地保留字段，在服务端快照注入时不会被覆盖。")

h2(doc, "3.5 部署形态")
body(doc, "项目提供 Dockerfile，支持容器部署；也可直接以 Node 进程运行。服务启动后可通过 GET /api/health 检查运行状态，本地默认访问地址为 http://127.0.0.1:8787/。")

# —— 4 核心算法与业务处理 ——
h1(doc, "4 核心算法与业务处理")
h2(doc, "4.1 对话处理流程")
body(doc, "chat 模块中的 enhancedSendMessage() 是处理用户输入的主要入口。用户发送消息后，系统不会将全部内容直接交给大模型，而是按预设顺序判断：")
for t in ["前置规则：会话上下文、只读分析、资金与账户查询等可确定性处理的请求；",
          "场景 Agent：常见业务意图的确定性处理；",
          "Function Calling：需要模型理解或选择工具时进入；",
          "兜底回复：均无法识别时调用普通 AI 回复。"]:
    bullet(doc, t)
body(doc, "资金类操作不能完全依赖大模型，必须有确定性规则兜底；高风险行为必须在进入执行前被拦截。")
h2(doc, "4.2 Agent 工具调用")
body(doc, "Agent 工具通过 registerAgentTool(name, { label, risk, run }) 注册，目前约有 40 个工具，覆盖账户、账单、订阅、转账、卡片、理财、生活服务、风险评估、决策分析与金融知识查询等业务，并通过 callAgentTool(name, args) 统一调度。")
body(doc, "agent-llm 将已注册工具转换为模型可识别的 Function Schema。模型判断需要调用工具时，系统按返回的 tool_call 进入对应流程；涉及业务变更的调用不会直接执行，而是先生成确认卡，用户批准后再执行。未配置 API Key 时 Function Calling 不可用，系统转由规则与场景 Agent 处理。")
body(doc, "Agent 使用 localStorage.agent_memory_v2 保存长期记忆，包括用户画像与偏好、家庭成员、理财目标、备注、已拒绝事项与历史拦截记录，用于辅助后续对话理解，不替代账户数据与服务端校验结果。")

h2(doc, "4.3 T1–T4 金额分级验证")
body(doc, "涉及资金扣款的业务采用金额分级验证，适用范围包括单笔转账、理财申购、鲜花与蛋糕订购、订阅首次扣费与定时转账创建。不同金额对应不同验证要求：")
table(doc, ["档位", "金额区间", "验证方式", "资金动作"], [
    ["T1", "低于 ¥1,000", "交易密码或指纹", "确认后执行"],
    ["T2", "¥1,000–9,999", "短信验证码", "验证后执行"],
    ["T3", "¥10,000–99,999", "短信验证码 + 人脸", "验证后执行"],
    ["T4", "≥ ¥100,000", "短信 + 人脸 + 人工复核", "不立即扣款，审批通过后执行"],
])
body(doc, "系统不仅按金额决定档位，还结合风险评分调整：最终取金额档位与风险档位中要求更高的一档。定时转账创建时统一要求验证码；金额达到 T4 时进入人工复核，不创建自动扣款任务。理财赎回、AA 收款等不涉及直接扣款的操作，不叠加金额验证。")

h2(doc, "4.4 风险评分")
body(doc, "系统使用可疑度评分判断交易风险，评分由收款人关系、历史交易、转账金额与交易时间构成，上限 99 分：")
table(doc, ["评分项", "加分"], [
    ["收款人不在联系人中", "+40"],
    ["该收款人无历史成功转账", "+22"],
    ["金额超过历史均值 3 倍", "按倍数加分，最多 +28"],
    ["单笔金额 ¥1,000–9,999", "+15"],
    ["单笔金额 ¥10,000–99,999", "+35"],
    ["单笔金额 ≥ ¥100,000", "+55"],
    ["交易时间 00:00–06:00", "+15"],
    ["金额超历史均值 10 倍以上", "再 +10"],
])
body(doc, "风险等级按分数划分：低于 30 分为低风险，30–59 分为中风险（至少 T2），60 分及以上为高风险（至少 T3）。例如新联系人且首次转账，两项合计 62 分，即使金额只有 100 元也会被要求至少 T3 验证。风险评分用于调整验证要求，不直接替代交易审核。")

h2(doc, "4.5 上下文与槽位补全")
body(doc, "系统结合对话记录识别指代，例如“刚才那笔换成李四”会定位到对应业务对象并更新收款人。对于缺少必要信息的请求，系统记录已获取参数，并针对缺失项继续提问；以转账为例，需要收款人、金额与转账渠道，用户可分批提供。")
body(doc, "kb 模块内置金融知识库并提供检索，用于回答理财常识与金融知识问题。知识检索主要服务于咨询场景，涉及账户数据与资金操作时仍需调用对应业务工具。")

h2(doc, "4.6 只读分析")
body(doc, "系统包含账单分析、财务健康评估与用户画像等只读分析能力：账单分析对收支记录分类统计并识别异常交易；财务健康评估结合收入、支出与负债情况分析；用户画像分析消费与风险偏好。分析结果用于帮助用户了解财务状况，不直接修改账户余额。")

# —— 5 安全设计 ——
h1(doc, "5 安全设计")
h2(doc, "5.1 三层校验")
body(doc, "资金类操作在前端界面、用户确认与服务端执行三个环节校验。")
body(doc, "第一层为界面校验：前端按金额、风险档位与余额生成确认卡，决定是否显示确认按钮、交易密码输入框或验证码输入框；需要人工复核的操作不提供直接扣款入口。")
body(doc, "第二层为用户确认后校验：点击确认后不直接扣款，再次检查交易是否仍满足风险验证要求、T2 短信验证码是否通过、T3 与 T4 的短信与人脸是否通过、可用余额是否足够，避免确认卡打开后账户状态变化导致原校验失效。")
body(doc, "第三层为工具与服务端校验：工具执行层设置余额门禁，服务端在写入前再次校验业务条件；不通过则拒绝写入。")

h2(doc, "5.2 确认卡机制")
body(doc, "系统有两类确认卡，执行前统一走上述三层校验：")
for t in ["Function Calling 确认卡（agentLLMRenderConfirm、agentLLMApprove）：用于模型自主规划路径，展示执行轨迹、风险标签、待确认操作、金额合计与验证码输入；",
          "规则与计划确认卡（agentRenderPlanConfirm、agentApprovePlan）：用于确定性路径，展示计划步骤与档位。"]:
    bullet(doc, t)

h2(doc, "5.3 会话与接口安全")
body(doc, "重置服务端数据等敏感写接口要求先请求 GET /api/session 获取会话令牌，后续请求通过 X-Bank-Session 请求头提交；无有效令牌或来源不符时服务端拒绝处理。AI 代理接口采用同源校验，并按 IP 限制请求频率，每个 IP 每分钟最多 20 次对话请求。")

h2(doc, "5.4 API Key 管理")
body(doc, "浏览器不持有真实 API Key：前端仅调用 /api/ai/chat 同源代理；服务端从环境变量 DEEPSEEK_API_KEY、SILICONFLOW_API_KEY 或本机 js/core/config.local.js（已被 .gitignore 忽略，只由服务端读取）获取 Key 并在服务端转发；浏览器拿到的 config.local.js 仅含 window.__BANK_KEYS__ = {} 与代理开关。")

h2(doc, "5.5 审计与敏感信息")
body(doc, "每笔资金动作写入 SQLite ledger 审计流水，包含时间、动作、金额、对象、IP、结果与元数据；业务快照存于 state 表。身份证、余额等敏感信息在界面遮罩显示，查看需通过统一安全验证。演示验证码与交易密码统一为 123456，仅用于演示环境，生产化时必须替换为真实短信、指纹或人脸通道。")

h2(doc, "5.6 异常处理")
body(doc, "当服务端不可访问时，前端可切换到本地演示模式，仅用于展示，不代表服务端业务数据已完成更新；恢复连接后以服务端快照为准。")

# —— 6 质量保障 ——
h1(doc, "6 质量保障")
for t in ["TypeScript 三套配置（主检查、strict-all、strict emit）全部通过，构建输出 38 个脚本；",
          "10 个测试套件：意图、主菜单、模块守卫、目录、二级菜单、确认卡守卫、芯片枚举、服务端接口、源码守卫与 LLM 意图样例；",
          "服务端接口测试使用临时端口与临时数据库，不污染演示数据；",
          "构建产物压缩并 hash 命名，Docker 多阶段构建。"]:
    bullet(doc, t)

# —— 7 部署与运行 ——
h1(doc, "7 部署与运行")
table(doc, ["方式", "命令", "说明"], [
    ["本地", "npm install && npm start", "首次自动编译 TypeScript，端口 8787"],
    ["开发", "npm run dev", "Vite 开发模式（HMR）"],
    ["Docker", "docker build -t zhiyin . / docker run -p 8787:8787 zhiyin", "node:22-alpine，构建期编译"],
    ["局域网", "http://<内网IP>:8787/", "需与电脑同一网络并放行 8787 端口"],
])

h1(doc, "附录 A 演示数据与验证码")
table(doc, ["项", "值"], [
    ["用户名", "小陈"],
    ["交易密码 / 短信验证码", "123456"],
    ["储蓄卡初始可用余额", "¥998,000（冻结 ¥2,000）"],
    ["重置方式", "头像 → 重置演示数据，或 POST /api/reset"],
])

doc.save(OUT_DOCX)
print("saved:", OUT_DOCX, os.path.getsize(OUT_DOCX))
