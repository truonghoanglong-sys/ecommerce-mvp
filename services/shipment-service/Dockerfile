# Build context = thư mục gốc dự án (để copy được shared/proto dùng chung)
FROM node:22-alpine

# Giữ đúng cấu trúc thư mục như lúc dev → PROTO_DIR=../../shared/proto vẫn đúng
WORKDIR /app/services/shipment-service

# 1) Copy package.json trước rồi npm install → Docker cache lại lớp này,
#    lần build sau chỉ sửa code thì KHÔNG phải cài lại thư viện
COPY services/shipment-service/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 2) Copy code + proto
COPY services/shipment-service/ ./
COPY shared/proto /app/shared/proto

ENV NODE_ENV=production
EXPOSE 3005

# Không chạy bằng root (an toàn hơn nếu service bị tấn công)
USER node

# Docker tự gọi /health để biết service sống hay chết
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3005/health > /dev/null || exit 1

CMD ["node", "src/server.js"]
