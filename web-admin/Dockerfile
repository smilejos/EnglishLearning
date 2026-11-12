# Build context is the repo root (see docker-compose.yml).
FROM node:22-alpine AS build
WORKDIR /app
# 依 monorepo lockfile 安裝，避免獨立 npm install 重新解析相依版本。
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY api/package.json ./api/package.json
COPY worker/package.json ./worker/package.json
COPY web-admin/package.json ./web-admin/package.json
COPY web-learner/package.json ./web-learner/package.json
RUN npm ci --workspace @el/web-admin --include-workspace-root=false --include=dev --no-audit --no-fund

# Base tsconfig is referenced via "../tsconfig.base.json".
COPY tsconfig.base.json ./tsconfig.base.json
COPY web-admin ./web-admin
WORKDIR /app/web-admin
ARG VITE_LEARNER_URL=http://localhost:8082
ENV VITE_LEARNER_URL=$VITE_LEARNER_URL
# 單一網域路徑分流：SPA 以 /admin/ 為 base 打包。
ARG VITE_BASE=/admin/
ENV VITE_BASE=$VITE_BASE
RUN npm run build

FROM nginx:alpine
COPY web-admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web-admin/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1
