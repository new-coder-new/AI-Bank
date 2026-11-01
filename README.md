# 智银管家 · ZhiYin Banker Copilot

**代码仓库**：https://github.com/new-coder-new/AI-Bank

面向个人客户的**对话式银行智能服务台**（演示原型）：一句话说出需求，系统补齐槽位、给出确认卡、按金额分级验证。资金判定与审计均由服务端权威处理，前端只负责呈现与引导。仓库只保留 TypeScript，运行时零第三方依赖（Node 内置模块 + SQLite）。

## 界面预览

| 桌面端 | 移动端 | 转账确认 | 账单分析 |
|---|---|---|---|
| ![](preview/bank-home-desktop.png) | ![](preview/bank-home-mobile.png) | ![](preview/guided-transfer-confirm.png) | ![](preview/bill-analysis.png) |

## 功能

- **转账收款**：姓名 / 手机号 / 定时 / AA 收款
- **账单与交易**：账单分析（本月 / 本年）、异常交易
- **卡片管理**：我的卡片 / 申请 / 额度调整 / 交易限制 / 挂失
- **理财**：持仓 / 在售产品 / 申购 / 风险评估
- **订阅管理**：我的订阅 / 可订阅会员 / 自动续费 / 取消
- **生活订购**：生日鲜花（鲜花 + 蛋糕）
- **账户**：总览 / 基本信息 / 卡片信息 / 复核审批 / 交易记录 / 联系人

## 快速开始

```bash
npm install && npm start        # 首次自动编译 TS，启动后访问 http://127.0.0.1:8787/
npm run dev                     # Vite 开发模式
npm run typecheck && npm test   # 三套 strict 检查 + 测试套件
npm run build                   # 编译 38 个 TS + Vite 打包
```

演示凭据：交易密码 / 短信验证码统一 `123456`；头像 →「重置演示数据」恢复初始状态。

## 架构

38 个 TypeScript 模块（strict）→ 38 个 `/api` 路由（Node 零依赖）→ 意图路由 / 槽位抽取 / 档位判定 / 复核 / 审计 → SQLite（`state` 快照 + `ledger` 流水）。AI 能力可选，未配置 Key 时降级为规则引擎。

## 安全分级

| 档位 | 金额 | 验证 | 资金动作 |
|---|---|---|---|
| T1 | < ¥1,000 | 交易密码 / 指纹 | 确认后执行 |
| T2 | ¥1,000–9,999 | 短信验证码 | 验证后执行 |
| T3 | ¥10,000–99,999 | 短信 + 人脸 | 验证后执行 |
| T4 | ≥ ¥100,000 | 短信 + 人脸 + 人工复核 | 不扣款，审批后执行 |

服务端权威判档；一次性验证令牌（`X-Bank-Verify`）防重放；所有资金动作写 `ledger` 审计流水。复核来源：大额转账、信用卡申请、额度调整。

## 部署

```bash
npm install && npm start                                        # 本地
docker build -t zhiyin . && docker run -p 8787:8787 zhiyin      # Docker
```

局域网手机访问 `http://<内网IP>:8787/`；详见 [docs/部署说明.md](docs/部署说明.md)。

## 文档

[使用手册](docs/使用手册.md) ｜ [测试用例](docs/测试用例.md) ｜ [部署说明](docs/部署说明.md) ｜ [安全审查报告](docs/安全审查报告.md)

## 边界

演示环境（PIN/OTP 固定、单用户、无 HTTPS、SQLite 单机），仅用于学习、比赛与技术交流。
