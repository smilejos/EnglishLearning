# Build context is the repo root (see docker-compose.yml).
# Workspace-aware：api 依賴 @el/shared，需在 monorepo 內安裝並以 tsx 執行。
FROM node:20-alpine
WORKDIR /app

# 先複製 lockfile 與各 workspace 的 package.json 以利快取。
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/package.json
COPY api/package.json ./api/package.json
COPY worker/package.json ./worker/package.json
COPY web-admin/package.json ./web-admin/package.json
COPY web-learner/package.json ./web-learner/package.json
RUN npm ci --omit=dev --no-audit --no-fund

# 再複製 api 與其相依的 shared 原始碼。
COPY shared/src ./shared/src
COPY api/src ./api/src

WORKDIR /app/api
ENV API_PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["npx", "tsx", "src/server.ts"]
