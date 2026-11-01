# 智银管家 · 容器部署（Docker）
# 源码只保留 TypeScript；镜像内先跑 npm run build:ts 生成 js 产物，再启动零依赖 Node 服务
FROM node:20-alpine

WORKDIR /app

# 先装依赖（仅 typescript 等构建期依赖），利用分层缓存
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 复制项目源码（含 .ts 源码、tsconfig、server/、css/、index.html）
COPY . /app

# 编译 TypeScript → js（runtime 加载的是这些产物）
RUN npm run build:ts

# 服务监听 PORT（由 CloudRun 注入，默认 8080），绑定 0.0.0.0
ENV PORT=8080
EXPOSE 8080

# 持久化数据卷：/app/data/bank.db 保存业务数据（SQLite）
# 部署时挂载云盘/卷到此目录，容器重建或重新部署都不会丢数据
VOLUME ["/app/data"]
ENV BANK_DB_FILE=/app/data/bank.db

CMD ["node", "/app/server/index.js"]
