// Starts the API: `pnpm --filter @shareride/api dev` locally, `node
// apps/api/src/server.ts` in the container.
import { serve } from "@hono/node-server";
import { connectDatabase, pingDatabase } from "@shareride/db";
import { createApp } from "./app.ts";
import { ConfigError, loadConfig, type Config } from "./config.ts";
import { createLogger } from "./logger.ts";

let config: Config;
try {
  config = loadConfig(process.env);
} catch (error) {
  if (error instanceof ConfigError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

const logger = createLogger({ level: config.logLevel });
const database = connectDatabase(config.databaseUrl, { applicationName: "shareride-api" });
const app = createApp({ logger, checkDatabase: () => pingDatabase(database.pool) });

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info({ port: info.port, nodeEnv: config.nodeEnv }, "API listening");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    void database.close().then(() => process.exit(0));
  });
}

process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.once("SIGINT", () => {
  shutdown("SIGINT");
});
