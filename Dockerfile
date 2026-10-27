# 智能金融助手 · CloudBase CloudRun 容器部署
# 零依赖 Node.js 服务：同一进程同时托管前端静态资源与银行核心 API
FROM node:20-alpine

WORKDIR /app

# 复制整个项目（含 server/、css/、js/、index.html）
COPY . /app

# 服务监听 PORT（由 CloudRun 注入，默认 8080），绑定 0.0.0.0
ENV PORT=8080
EXPOSE 8080

CMD ["node", "/app/server/index.js"]
