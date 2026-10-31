# 智能金融助手 · CloudBase CloudRun 容器部署
# 零依赖 Node.js 服务：同一进程同时托管前端静态资源与银行核心 API
FROM node:20-alpine

WORKDIR /app

# 复制整个项目（含 server/、css/、js/、index.html）
COPY . /app

# 服务监听 PORT（由 CloudRun 注入，默认 8080），绑定 0.0.0.0
ENV PORT=8080
EXPOSE 8080

# 持久化数据卷：/app/data/bank.db 保存业务数据（SQLite）
# 部署时挂载云盘/卷到此目录，容器重建或重新部署都不会丢数据
VOLUME ["/app/data"]
ENV BANK_DB_FILE=/app/data/bank.db

CMD ["node", "/app/server/index.js"]
