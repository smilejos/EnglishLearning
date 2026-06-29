# Build context is the repo root (see docker-compose.yml).
FROM node:20-alpine
WORKDIR /app

# Install only this service's runtime deps (pg + tsx).
COPY worker/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY worker/src ./src

ENV WORKER_HEARTBEAT_MS=5000
ENV WORKER_HEARTBEAT_FILE=/tmp/worker-heartbeat

# worker 無 HTTP 端點：以 heartbeat 檔在 30 秒內曾被更新視為健康。
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD [ -f "$WORKER_HEARTBEAT_FILE" ] && \
      [ $(( $(date +%s) - $(stat -c %Y "$WORKER_HEARTBEAT_FILE") )) -lt 30 ] || exit 1

CMD ["npx", "tsx", "src/index.ts"]
