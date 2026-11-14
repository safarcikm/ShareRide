// Deletes sign-in records past their retention and ends idle sessions:
// `pnpm --filter @shareride/api clean-up` locally, and every hour as a cron
// job on staging and production (ADR 0018). Needs only DATABASE_URL, and
// reports a failure to Sentry when SENTRY_DSN is set.
import * as Sentry from "@sentry/node";
import { connectDatabase } from "@shareride/db";
import { ConfigError, loadErrorReportingConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { cleanUpSignInRecords } from "./modules/auth/clean-up.ts";
import { captureError, startErrorReporting } from "./platform/error-reporting.ts";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  process.stderr.write("DATABASE_URL is not set. Copy .env.example to .env first.\n");
  process.exit(1);
}

const logger = createLogger({ level: "info" });
try {
  startErrorReporting(loadErrorReportingConfig(process.env));
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  // Deleting records on time matters more; the API refuses the same settings.
  logger.warn({ problems: error.problems }, "error reporting is off: its settings are not valid");
}
const connection = connectDatabase(url, {
  maxConnections: 1,
  applicationName: "shareride-clean-up",
});
try {
  const counts = await cleanUpSignInRecords(connection.db, new Date());
  logger.info({ counts }, "clean-up done");
} catch (error) {
  logger.error({ err: error }, "clean-up failed");
  // Does nothing when error reporting is off.
  captureError(error, { job: "clean-up" });
  process.exitCode = 1;
} finally {
  await connection.close();
  // Send any report before the process ends.
  await Sentry.flush(2000);
}
