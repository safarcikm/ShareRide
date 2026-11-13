// Starts the API: `pnpm --filter @shareride/api dev` locally, `node
// apps/api/src/server.ts` in the container.
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { connectDatabase, pingDatabase } from "@shareride/db";
import { createApp } from "./app.ts";
import { ConfigError, loadConfig, type Config } from "./config.ts";
import { createLogger } from "./logger.ts";
import { clientAddress } from "./platform/client-address.ts";
import { createKeyedHasher } from "./platform/crypto.ts";
import { createDevSmsSender } from "./platform/sms.ts";

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
// The only sender until milestone 2; loadConfig refuses it in production.
const sms = createDevSmsSender({ print: (line) => process.stdout.write(`${line}\n`) });
const app = createApp({
  logger,
  checkDatabase: () => pingDatabase(database.pool),
  webOrigins: config.webOrigins,
  features: {
    db: database.db,
    sms,
    hasher: createKeyedHasher(config.authSecret),
    clock: () => new Date(),
    clientAddress: (c) =>
      clientAddress({
        remote: getConnInfo(c).remote.address,
        forwardedFor: c.req.header("x-forwarded-for"),
        trustProxy: config.trustProxy,
      }),
    secureCookies: config.nodeEnv === "production",
  },
});

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
