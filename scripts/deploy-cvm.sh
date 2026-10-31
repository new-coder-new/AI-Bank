#!/usr/bin/env bash
# =============================================================================
#  AI Banking Agent · 一键部署到腾讯云 CVM
#  用法：bash scripts/deploy-cvm.sh
#  说明：打包 → 上传 → 解压（保留 data/）→ 重启服务 → 健康检查
# =============================================================================
set -euo pipefail

# ---------- 配置（改这里） ----------
HOST="${HOST:-root@43.139.247.241}"
APP_DIR="/opt/ai-banking-agent"
SERVICE="ai-banking-agent"
PORT="${PORT:-80}"
PUBLIC_URL="${PUBLIC_URL:-http://43.139.247.241}"
# -----------------------------------

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="/tmp/bank-app-$$.tar.gz"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

cleanup() { rm -f "$PKG"; }
trap cleanup EXIT

say "1/5 编译 TypeScript 并打包（仓库只保留 .ts，产物在打包前生成）"
BUILD_LOG="/tmp/bank-build-$$.log"
if ! ( cd "$ROOT" && npm run build:ts ) > "$BUILD_LOG" 2>&1; then
  echo -e "\033[1;31m    TypeScript 编译失败，已中止。以下是编译器输出：\033[0m"
  cat "$BUILD_LOG"
  exit 1
fi
: > "$BUILD_LOG"
echo "    编译产物: $(find "$ROOT/build/js" -name '*.js' | wc -l) 个 js 文件"
tar -czf "$PKG" -C "$ROOT" \
  --exclude='.git' --exclude='.workbuddy' --exclude='preview' \
  --exclude='data' --exclude='logs' --exclude='node_modules' \
  --exclude='*.log' --exclude='config.local.js' \
  index.html css js server package.json Dockerfile tsconfig.emit.json types build
echo "    包大小: $(du -h "$PKG" | cut -f1)"

say "2/5 上传"
scp -q "$PKG" "$HOST:/tmp/"

say "3/5 解压到 $APP_DIR（保留 data 目录）"
ssh "$HOST" "
  set -e
  mkdir -p $APP_DIR
  find $APP_DIR -mindepth 1 -maxdepth 1 ! -name data -exec rm -rf {} + 2>/dev/null || true
  tar -xzf /tmp/$(basename "$PKG") -C $APP_DIR
  mkdir -p $APP_DIR/data
  rm -f /tmp/$(basename "$PKG")
  echo \"    文件数: \$(find $APP_DIR -type f | wc -l)\"
"

say "4/5 重启服务"
ssh "$HOST" "systemctl restart $SERVICE && sleep 2 && systemctl is-active $SERVICE"

say "5/5 健康检查"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$PUBLIC_URL/")
SIZE=$(curl -s --max-time 15 "$PUBLIC_URL/" | wc -c)
echo "    首页: HTTP $CODE  ${SIZE} bytes"
curl -s --max-time 15 "$PUBLIC_URL/api/health"; echo

if [ "$CODE" = "200" ]; then
  echo -e "\n\033[1;32m✅ 部署成功 → $PUBLIC_URL/\033[0m"
else
  echo -e "\n\033[1;31m❌ 首页返回 $CODE，请查看日志：ssh $HOST 'journalctl -u $SERVICE -n 50 --no-pager'\033[0m"
  exit 1
fi
