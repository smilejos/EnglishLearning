import Fastify from "fastify";

const port = Number(process.env.API_PORT ?? 8080);
const host = "0.0.0.0";

const app = Fastify({ logger: true });

// Liveness / readiness probe used by docker-compose healthcheck.
app.get("/healthz", async () => ({ ok: true, service: "api" }));

app.get("/", async () => ({ service: "english-learning api", status: "skeleton" }));

app
  .listen({ port, host })
  .then((addr) => app.log.info(`api listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
