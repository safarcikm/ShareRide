// Deletes sign-in records past their retention, ends idle sessions, and
// deletes old drafts of trips, conversations 12 months after their trip,
// the notification log after 90 days, old console sessions, and data exports
// once expired; then erases the accounts whose 7 days have ended (spec 11,
// 3.5): `pnpm --filter @shareride/api clean-up` locally, and every hour as a
// cron job on staging and production (ADR 0018). Needs DATABASE_URL, and
// AUTH_SECRET for the number a suspended person may not sign up with again;
// reports a failure to Sentry when SENTRY_DSN is set.
import * as Sentry from "@sentry/node";
import { connectDatabase } from "@shareride/db";
import { defaultTripDaySettings } from "@shareride/domain";
import { ConfigError, loadErrorReportingConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { cleanUpOperatorSessions, cleanUpOperatorSignIn } from "./modules/admin/clean-up.ts";
import { cleanUpSignInRecords } from "./modules/auth/clean-up.ts";
import { cleanUpConversations } from "./modules/chat/clean-up.ts";
import { cleanUpNotifications } from "./modules/notifications/clean-up.ts";
import { createErasure } from "./modules/privacy/erasure.ts";
import { cleanUpExports } from "./modules/privacy/exports.ts";
import { cleanUpDrafts } from "./modules/trips/clean-up.ts";
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
  const now = new Date();
  const counts = await cleanUpSignInRecords(connection.db, now);
  const drafts = await cleanUpDrafts(connection.db, now);
  const conversations = await cleanUpConversations(connection.db, now);
  const notifications = await cleanUpNotifications(connection.db, now);
  const operatorSessions = await cleanUpOperatorSessions(connection.db, now);
  const operatorSignIn = await cleanUpOperatorSignIn(connection.db, now);
  const exports = await cleanUpExports(connection.db, now);
  // Last, so a failing account never holds up the rules above.
  const accounts = await createErasure({
    db: connection.db,
    clock: () => new Date(),
    hasher: createKeyedHasher(authSecret),
    tripDaySettings: defaultTripDaySettings,
    logger,
  }).eraseDue();
  logger.info(
    {
      counts: {
        ...counts,
        drafts,
        conversations,
        notifications,
        operatorSessions,
        operatorSignIn,
        ...exports,
        accountsErased: accounts.erased,
        accountsFailed: accounts.failed,
      },
    },
    "clean-up done",
  );
  if (accounts.failed > 0) {
    // Each failure is logged with its user ID; the report carries none.
    captureError(new Error(`${accounts.failed} account erasures failed`), { job: "clean-up" });
    process.exitCode = 1;
  }
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
