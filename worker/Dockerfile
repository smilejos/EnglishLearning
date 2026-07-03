# Build context is the repo root (see docker-compose.yml).
# Workspace-aware：worker 依賴 @el/shared，需在 monorepo 內安裝並以 tsx 執行。
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg

# 先複製 lockfile 與各 workspace 的 package.json 以利快取。
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/package.json
COPY api/package.json ./api/package.json
COPY worker/package.json ./worker/package.json
COPY web-admin/package.json ./web-admin/package.json
COPY web-learner/package.json ./web-learner/package.json
RUN npm ci --omit=dev --no-audit --no-fund

# 再複製 worker 與其相依的 shared 原始碼。
COPY shared/src ./shared/src
COPY worker/src ./worker/src

WORKDIR /app/worker
ENV WORKER_POLL_MS=3000
ENV WORKER_HEARTBEAT_FILE=/tmp/worker-heartbeat

# worker 無 HTTP 端點：以 heartbeat 檔在 30 秒內曾被更新視為健康。
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD [ -f "$WORKER_HEARTBEAT_FILE" ] && \
      [ $(( $(date +%s) - $(stat -c %Y "$WORKER_HEARTBEAT_FILE") )) -lt 30 ] || exit 1

CMD ["npx", "tsx", "src/index.ts"]
