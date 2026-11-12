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
RUN npm ci --workspace @el/web-learner --include-workspace-root=false --include=dev --no-audit --no-fund

# Base tsconfig is referenced via "../tsconfig.base.json".
COPY tsconfig.base.json ./tsconfig.base.json
COPY scripts/shared-audio-only.mjs scripts/shared-audio-only.d.mts ./scripts/
COPY web-learner ./web-learner
WORKDIR /app/web-learner
ARG VITE_ADMIN_URL=http://localhost:8081
ENV VITE_ADMIN_URL=$VITE_ADMIN_URL
RUN npm run build

FROM nginx:alpine
COPY web-learner/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web-learner/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1
