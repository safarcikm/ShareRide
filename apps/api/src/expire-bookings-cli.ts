// Stores the expiry of every request and unpaid booking past its deadline
// (R5.5, rule M1), once: `pnpm --filter @shareride/api expire-bookings`. The
// API does this every minute by itself; this is for trying it by hand. Needs
// only DATABASE_URL, and reports a failure to Sentry when SENTRY_DSN is set.
import * as Sentry from "@sentry/node";
import { connectDatabase } from "@shareride/db";
import { ConfigError, loadErrorReportingConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { expireAllDueBookings } from "./modules/bookings/index.ts";
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
  logger.warn({ problems: error.problems }, "error reporting is off: its settings are not valid");
}
const connection = connectDatabase(url, {
  maxConnections: 1,
  applicationName: "shareride-expire-bookings",
});
try {
  const expired = await expireAllDueBookings(connection.db, new Date());
  logger.info({ expired }, "booking deadlines done");
} catch (error) {
  logger.error({ err: error }, "booking deadlines failed");
  // Does nothing when error reporting is off.
  captureError(error, { job: "booking-deadlines" });
  process.exitCode = 1;
} finally {
  await connection.close();
  // Send any report before the process ends.
  await Sentry.flush(2000);
}
