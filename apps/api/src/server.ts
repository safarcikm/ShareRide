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
import { startErrorReporting } from "./platform/error-reporting.ts";
import { selectSmsSender } from "./platform/select-sms-sender.ts";

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
const reportError = startErrorReporting(config.errorReporting);
const database = connectDatabase(config.databaseUrl, { applicationName: "shareride-api" });
// The development sender prints to the terminal, not the logs; loadConfig
// refuses it in production.
const sms = selectSmsSender(config.sms, (line) => process.stdout.write(`${line}\n`));
// Without the proxies' entry every client looks like the same address and
// shares one set of sending limits, so say so once.
let reportedMissingProxyEntry = false;
function reportMissingProxyEntry(): void {
  if (reportedMissingProxyEntry) return;
  reportedMissingProxyEntry = true;
  logger.warn(
    { trustedProxies: config.trustedProxies },
    "X-Forwarded-For lacks the trusted proxies' entry; limits use the connection's address",
  );
}
const app = createApp({
  logger,
  checkDatabase: () => pingDatabase(database.pool),
  webOrigins: config.webOrigins,
  ...(config.webAppDir === undefined ? {} : { webAppDir: config.webAppDir }),
  ...(reportError === undefined ? {} : { reportError }),
  features: {
    db: database.db,
    sms,
    hasher: createKeyedHasher(config.authSecret),
    clock: () => new Date(),
    clientAddress: (c) => {
      const found = clientAddress({
        remote: getConnInfo(c).remote.address,
        forwardedFor: c.req.header("x-forwarded-for"),
        trustedProxies: config.trustedProxies,
      });
      if (config.trustedProxies > 0 && found.source === "connection") reportMissingProxyEntry();
      return found.address;
    },
    secureCookies: config.nodeEnv === "production",
  },
});

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info(
    {
      port: info.port,
      nodeEnv: config.nodeEnv,
      smsProvider: config.sms.provider,
      smsPaused: config.sms.paused,
      trustedProxies: config.trustedProxies,
      webApp: config.webAppDir !== undefined,
      errorReporting: reportError !== undefined,
      release: config.errorReporting.release,
    },
    "API listening",
  );
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
