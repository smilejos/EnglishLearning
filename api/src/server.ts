// api 進入點：載入環境設定、建立 DB pool 與 app，開始監聽。
import { loadConfig, createPool } from "@el/shared";
import { buildApp } from "./app";

const config = loadConfig();
const pool = createPool(config.databaseUrl);

const app = buildApp({ config, pool, logger: true });

const port = Number(process.env.API_PORT ?? 8080);
const host = "0.0.0.0";

app
  .listen({ port, host })
  .then((addr) => app.log.info(`api listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
