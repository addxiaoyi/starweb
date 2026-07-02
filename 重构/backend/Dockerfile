FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# 仅复制依赖清单，利用层缓存安装生产依赖
COPY package*.json ./
RUN npm ci --omit=dev

# 复制后端源码
COPY src ./src

# 运行时数据目录（可挂载 volume 持久化）
RUN mkdir -p /app/data

EXPOSE 8787 8788

CMD ["npm", "run", "start"]
