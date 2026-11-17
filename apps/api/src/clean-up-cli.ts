// The hourly clean-up (spec 11, 3.7; R11.5): every retention rule in the
// privacy register, from sign-in records to accounts whose 7 days have
// ended, each recorded in `retention_runs` with how many records it erased.
// Holds keep what they cover (plan 4.7). `pnpm --filter @shareride/api
// clean-up` locally, and every hour as a cron job on staging and production
// (ADR 0018). Needs DATABASE_URL, and AUTH_SECRET for the number a
// suspended person may not sign up with again; reports a failure to Sentry
// when SENTRY_DSN is set.
import * as Sentry from "@sentry/node";
import { connectDatabase } from "@shareride/db";
import { defaultTripDaySettings } from "@shareride/domain";
import { ConfigError, loadErrorReportingConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { createErasure } from "./modules/privacy/erasure.ts";
import { retentionSteps, runRetention } from "./modules/privacy/retention.ts";
import { createKeyedHasher } from "./platform/crypto.ts";
import { captureError, startErrorReporting } from "./platform/error-reporting.ts";

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  process.stderr.write("DATABASE_URL is not set. Copy .env.example to .env first.\n");
  process.exit(1);
}
const authSecret = process.env["AUTH_SECRET"];
if (authSecret === undefined || authSecret === "") {
  process.stderr.write("AUTH_SECRET is not set: the API's own secret, the same value.\n");
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
  const erasure = createErasure({
    db: connection.db,
    clock: () => new Date(),
    hasher: createKeyedHasher(authSecret),
    tripDaySettings: defaultTripDaySettings,
    logger,
  });
  const result = await runRetention({
    db: connection.db,
    now: new Date(),
    steps: retentionSteps({ db: connection.db, erasure, logger }),
    logger,
  });
  logger.info(
    { counts: result.counts, failedRules: result.failedRules, failures: result.failures },
    "clean-up done",
  );
  for (const { rules, error } of result.errors) {
    captureError(error, { job: "clean-up", rules: rules.join(",") });
  }
  if (result.failures > 0) {
    // Each failure is logged with its user ID; the report carries none.
    captureError(new Error(`${String(result.failures)} account erasures failed`), {
      job: "clean-up",
    });
  }
  if (result.errors.length > 0 || result.failures > 0) process.exitCode = 1;
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
