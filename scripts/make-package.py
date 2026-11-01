#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成「源代码与部署材料」提交压缩包。

与 scripts/build-submission.py 的区别：
  - 那个负责生成 docx / pptx / 安全报告；
  - 这个只做一件事：打一个干净、可解压即跑的源码包。

安全约束（硬性）：
  1. 绝不打包 js/core/config.local.js 与任何 .env；
  2. 打包完成后逐条自检，发现敏感内容直接删包并以非 0 退出。
"""
import os
import re
import sys
import zipfile
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.dirname(ROOT)
STAMP = datetime.now().strftime("%Y%m%d")
ZIP_PATH = os.path.join(OUT_DIR, "智银管家-源代码与部署材料-%s.zip" % STAMP)

# 打包根文件
ROOT_FILES = [
    "index.html", "package.json", "package-lock.json", "README.md",
    "Dockerfile", ".dockerignore", ".gitignore",
    "vite.config.mjs", "tsconfig.json", "tsconfig.emit.json",
    "tsconfig.strict-all.json", "cloudbaserc.json",
]
# 打包目录
DIRS = ["css", "js", "server", "tests", "docs", "scripts", "types", "build", "preview"]
# 目录级排除
SKIP_DIRS = {"node_modules", ".git", ".workbuddy", "data", "logs", "__pycache__", "dist", "demo", "frames"}
# preview 目录只收 README 引用的截图，不收录屏与帧序列
PREVIEW_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")
# 文件级排除（安全红线）
SKIP_FILES = {"config.local.js", "capture-previews.mjs", "build-submission.py"}
SKIP_SUFFIX = (".db", ".db-wal", ".db-shm", ".mp4", ".webm", ".log", ".tsbuildinfo")

# 提交包内说明
PACKAGE_README = """智银管家 · 源代码与部署材料
================================

一、这是什么
  面向个人客户的对话式手机银行演示原型。单端口 Web 应用：
  前端静态页面 + 零第三方依赖的 Node HTTP 服务 + SQLite 持久化。
  不连接任何真实银行、支付、征信系统，全部数据为演示数据。

二、环境要求
  Node.js >= 22（服务端使用内置 node:sqlite，低于 22 会报
  ERR_UNKNOWN_BUILTIN_MODULE）。Windows / Linux / macOS 均可。

三、最快启动（无需 npm install）
  本包已包含编译产物 build/js/，直接运行：
      node server/index.js
  浏览器打开 http://127.0.0.1:8787/
  健康检查 GET /api/health

四、从源码重新构建
      npm install          # 仅构建期依赖：typescript + vite
      npm run build:ts     # 38 个 TS 编译到 build/js
      npm run typecheck    # 三套 tsconfig 全量类型检查
      npm test             # 9 个测试套件，143 条用例
      npm start            # 会先自动编译再启动

五、目录说明
  index.html      单页外壳（引用 build/js/**）
  css/style.css   全部样式
  js/**/*.ts      TypeScript 源码（前端唯一源）
  build/js/**     编译产物（index.html 实际加载这些）
  server/index.js 零依赖 HTTP 服务：静态资源 + 模拟银行核心 API
  server/db.js    SQLite 持久化（state 表存业务快照，ledger 表存资金审计）
  tests/          10 个测试套件 + 一键运行器
  docs/           功能清单 / 使用手册 / 部署说明 / 测试用例 / 目录结构 等
  scripts/        部署脚本与演示录制脚本
  types/          TypeScript 全局声明

六、部署
  见 docs/部署说明.md，覆盖：本地 / Docker / 云服务器(CVM) / 局域网手机演示。
  云服务器一键部署：bash scripts/deploy-cvm.sh

七、文档索引
  docs/功能清单.md       按前端实际入口逐项列功能与实现文件（验收对照用）
  docs/部署说明.md       环境要求、构建、Docker、CVM、环境变量
  docs/测试用例.md       测试套件总览 + 143 条用例明细 + 实测结果
  docs/使用手册.md       按操作步骤讲怎么用
  docs/目录结构.md       文件树与职责
  README.md              项目完整技术说明

八、演示约定
  交易密码 / 短信验证码：123456
  初始余额约 100 万，右上角「重置演示数据」可随时恢复
  未配置大模型 Key 时自动降级为规则引擎，全流程仍可完整演示

九、安全说明
  - 本包不含任何真实 API Key：前端恒为 window.__BANK_KEYS__ = {}，
    模型调用经 /api/ai/chat 由服务端代理。
  - 如需本地直连模型，复制 js/core/config.local.example.js 为
    config.local.js 自行填写，该文件已在 .gitignore 中。
"""


def should_skip(name, cur):
    if name in SKIP_FILES:
        return True
    if name.startswith(".") and name not in (".dockerignore", ".gitignore"):
        return True
    if name.endswith(SKIP_SUFFIX):
        return True
    if name.startswith(".env"):
        return True
    # 任何层级的本地密钥文件
    if name == "config.local.js":
        return True
    # preview 只收截图，录屏/帧序列一律不要（54MB）
    rel_dir = os.path.relpath(cur, ROOT).replace(os.sep, "/")
    if rel_dir == "preview" or rel_dir.startswith("preview/"):
        if not name.lower().endswith(PREVIEW_EXTS):
            return True
    return False


def build():
    count = 0
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in ROOT_FILES:
            full = os.path.join(ROOT, f)
            if os.path.isfile(full):
                z.write(full, f)
                count += 1
        for d in DIRS:
            base = os.path.join(ROOT, d)
            if not os.path.isdir(base):
                continue
            for cur, subs, files in os.walk(base):
                subs[:] = [s for s in subs
                           if s not in SKIP_DIRS and not s.startswith(("frames-", "demo-"))]
                for f in files:
                    if should_skip(f, cur):
                        continue
                    full = os.path.join(cur, f)
                    rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
                    z.write(full, rel)
                    count += 1
        z.writestr("提交包说明.txt", PACKAGE_README)
        count += 1
    return count


def verify():
    """打包后自检：任何一条不过就删包退出。"""
    problems = []
    with zipfile.ZipFile(ZIP_PATH) as z:
        names = z.namelist()
        # 1) 不得含本地密钥文件
        for n in names:
            if n.endswith("config.local.js") or "/.env" in n or n.startswith(".env"):
                problems.append("包含敏感文件: " + n)
        # 2) 不得含 node_modules / .git / data / 录屏素材
        for n in names:
            for bad in ("node_modules/", ".git/", "/data/", "preview/demo/", "preview/frames"):
                if n.startswith(bad) or ("/" + bad) in n:
                    problems.append("包含应排除目录: " + n)
        # 2.5) README 引用的每张图都必须真的在包里，否则图文全挂
        try:
            readme = z.read("README.md").decode("utf-8", "ignore")
        except KeyError:
            readme = ""
        for img in re.findall(r"!\[[^\]]*\]\(([^)\s]+)\)", readme):
            if img.startswith(("http://", "https://", "data:")):
                continue
            if img not in names:
                problems.append("README 引用的图片缺失: " + img)
        # 3) 内容扫描：不得出现真实 Key 形态
        pat = re.compile(rb"sk-[A-Za-z0-9]{25,}")
        for n in names:
            if n.endswith((".js", ".ts", ".md", ".json", ".txt", ".html")):
                try:
                    data = z.read(n)
                except Exception:
                    continue
                if pat.search(data):
                    problems.append("疑似明文密钥: " + n)
        # 4) 必备文件
        for need in ("README.md", "docs/部署说明.md", "docs/测试用例.md",
                     "docs/功能清单.md", "server/index.js", "server/db.js"):
            if need not in names:
                problems.append("缺少必备文件: " + need)
        # 5) 前端产物与源码齐全
        js_ts = [n for n in names if n.startswith("js/") and n.endswith(".ts")]
        js_built = [n for n in names if n.startswith("build/js/") and n.endswith(".js")]
        if len(js_ts) < 30:
            problems.append("TS 源码不全：只有 %d 个" % len(js_ts))
        if len(js_built) < 30:
            problems.append("编译产物不全：只有 %d 个" % len(js_built))
        return names, js_ts, js_built, problems


def main():
    print("打包中…")
    count = build()
    names, js_ts, js_built, problems = verify()
    size_mb = os.path.getsize(ZIP_PATH) / 1024 / 1024

    if problems:
        os.remove(ZIP_PATH)
        print("\n❌ 自检未通过，已删除压缩包：")
        for p in problems:
            print("   -", p)
        sys.exit(1)

    print("\n✅ 打包完成")
    print("   路径：%s" % ZIP_PATH)
    print("   大小：%.2f MB" % size_mb)
    print("   条目：%d 个文件" % len(names))
    print("   TS 源码：%d 个 / 编译产物：%d 个" % (len(js_ts), len(js_built)))
    print("\n   自检全部通过：无本地密钥、无 node_modules/.git/data、无明文 Key、必备文档齐全")


if __name__ == "__main__":
    main()
