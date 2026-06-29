# Build context is the repo root (see docker-compose.yml).
FROM node:20-alpine
WORKDIR /app

# Install only this service's runtime deps (fastify + tsx).
COPY api/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY api/src ./src

ENV API_PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["npx", "tsx", "src/server.ts"]
