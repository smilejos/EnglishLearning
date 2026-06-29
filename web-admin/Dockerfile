# Build context is the repo root (see docker-compose.yml).
FROM node:20-alpine AS build
WORKDIR /app
# Base tsconfig is referenced via "../tsconfig.base.json".
COPY tsconfig.base.json ./tsconfig.base.json
COPY web-admin ./web-admin
WORKDIR /app/web-admin
RUN npm install --no-audit --no-fund && npm run build

FROM nginx:alpine
COPY web-admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web-admin/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:80/ || exit 1
