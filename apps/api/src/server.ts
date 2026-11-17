// Starts the API: `pnpm --filter @shareride/api dev` locally, `node
// apps/api/src/server.ts` in the container.
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { connectDatabase, pingDatabase } from "@shareride/db";
import { defaultReviewSettings, defaultTripDaySettings } from "@shareride/domain";
import { createApp } from "./app.ts";
import { ConfigError, loadConfig, type Config } from "./config.ts";
import { createLogger } from "./logger.ts";
import { expireAllDueBookings } from "./modules/bookings/index.ts";
import { endDueSuspensions } from "./modules/moderation/index.ts";
import { moveMeetingPointsOn } from "./modules/meeting-points/index.ts";
import { createNotificationWorker } from "./modules/notifications/index.ts";
import { createPaymentService } from "./modules/payments/index.ts";
import { revealDueReviews } from "./modules/reviews/index.ts";
import { settleUnansweredReports } from "./modules/trip-day/index.ts";
import { moveTripsOn } from "./modules/trips/index.ts";
import { clientAddress } from "./platform/client-address.ts";
import { createExportBuilder, exportCipherPurpose } from "./modules/privacy/index.ts";
import { createFileCipher, createKeyedHasher } from "./platform/crypto.ts";
import { captureError, startErrorReporting } from "./platform/error-reporting.ts";
import { createTestPaymentProvider } from "./platform/payments.ts";
import { createExpoPushSender } from "./platform/push-expo.ts";
import { startRepeating } from "./platform/repeat.ts";
import { selectEmail } from "./platform/select-email.ts";
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
// loadConfig refuses the test provider in production.
const payments = config.payments.provider === "test" ? createTestPaymentProvider() : undefined;
// Email through Mailjet (ADR 0027), or the terminal in development; none
// when EMAIL_PROVIDER is none. Adding an email and the worker share it.
const email = selectEmail(config.email, (line) => {
  process.stdout.write(`${line}\n`);
});
const exportCipher = createFileCipher(config.authSecret, exportCipherPurpose);
const app = createApp({
  logger,
  checkDatabase: () => pingDatabase(database.pool),
  webOrigins: config.webOrigins,
  ...(config.webAppDir === undefined ? {} : { webAppDir: config.webAppDir }),
  ...(config.adminAppDir === undefined ? {} : { adminAppDir: config.adminAppDir }),
  ...(reportError === undefined ? {} : { reportError }),
  features: {
    db: database.db,
    sms,
    hasher: createKeyedHasher(config.authSecret),
    exportCipher,
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
    ...(config.adminOrigin === undefined ? {} : { adminOrigin: config.adminOrigin }),
    ...(payments === undefined ? {} : { payments }),
    ...(email === undefined ? {} : { email }),
  },
});

/** Runs a job inside the API every so often; a failure is logged and reported. */
function every(everyMs: number, job: string, run: () => Promise<unknown>) {
  return startRepeating({
    everyMs,
    run,
    onError: (error) => {
      logger.error({ err: error, job }, "job failed");
      // Does nothing when error reporting is off.
      captureError(error, { job });
    },
  });
}

// Booking deadlines (R5.5, rule M1). Every booking change also stores its
// trip's expiries first, so a late run never keeps a seat taken.
const jobs = [
  every(60_000, "booking-deadlines", async () => {
    const expired = await expireAllDueBookings(database.db, new Date());
    if (expired > 0) logger.info({ expired }, "bookings expired");
  }),
  // Trips depart at their first stop and complete 2 hours after their last,
  // with their confirmed bookings (spec 8, R8.1 and R8.2). Reports nobody
  // answered within 24 hours stand (R8.6), and reviews nobody answered show
  // 14 days after completion (R8.9).
  every(60_000, "trip-day", async () => {
    const moved = await moveTripsOn(database.db, new Date(), defaultTripDaySettings);
    if (moved.departed + moved.completed > 0) logger.info(moved, "trips moved on");
    const settled = await settleUnansweredReports(database.db, new Date(), defaultTripDaySettings);
    if (settled > 0) logger.info({ settled }, "reports settled");
    const revealed = await revealDueReviews(database.db, new Date(), defaultReviewSettings);
    if (revealed > 0) logger.info({ revealed }, "reviews revealed");
  }),
  // Suspensions end when their end passes, and each person is told (spec 9, 3.6.3).
  every(60_000, "suspensions", async () => {
    const ended = await endDueSuspensions(database.db, new Date());
    if (ended > 0) logger.info({ ended }, "suspensions ended");
  }),
  // Paused meeting points come back into use on their end date, and
  // retiring ones retire after their last trip (spec 2, 3.6.4 and 3.6.5).
  every(60_000, "meeting-points", async () => {
    const moved = await moveMeetingPointsOn(database.db, new Date());
    if (moved.resumed + moved.retired > 0) logger.info(moved, "meeting points moved on");
  }),
];
// "Download my data" files (spec 11, 3.2), built within seconds of asking.
const exportBuilder = createExportBuilder({
  db: database.db,
  cipher: exportCipher,
  clock: () => new Date(),
  logger,
});
jobs.push(
  every(10_000, "data-exports", async () => {
    const built = await exportBuilder.buildDue();
    if (built > 0) logger.info({ built }, "data exports built");
  }),
);
// Refunds the provider has not taken yet are asked for again (R13.3).
// Without a provider nothing is paid, so nothing is owed back.
if (payments !== undefined) {
  const owed = createPaymentService({
    db: database.db,
    clock: () => new Date(),
    provider: payments,
  });
  jobs.push(
    every(60_000, "owed-refunds", async () => {
      const refunded = await owed.refundOwed();
      if (refunded > 0) logger.info({ refunded }, "owed refunds made");
    }),
  );
}

// Notifications (spec 7, 3.7), every 5 seconds unless WORKER=off. Push
// goes through Expo's push service to the devices that registered a token;
// email is skipped as `email_off` when EMAIL_PROVIDER is none.
if (config.worker) {
  const worker = createNotificationWorker({
    db: database.db,
    clock: () => new Date(),
    push: createExpoPushSender(
      config.push.accessToken === undefined ? {} : { accessToken: config.push.accessToken },
    ),
    ...(email === undefined ? {} : { email }),
    // Last-minute news by SMS (spec 7, 3.4), through the same sender as codes.
    sms,
    onSendError: (error, delivery) => {
      logger.warn({ err: error, delivery: delivery.id, channel: delivery.channel }, "not sent");
    },
    // A bug: logged each time, and reported once given up.
    onEventError: (error, event) => {
      logger.warn({ err: error, event: event.id, kind: event.kind }, "event not handled");
      if (event.givenUp) captureError(error, { job: "notifications", event: event.id });
    },
  });
  jobs.push(
    every(5_000, "notifications", async () => {
      const run = await worker.runOnce();
      if (run.events + run.scheduled + run.sent + run.failed + run.receipts > 0) {
        logger.info(run, "notifications");
      }
    }),
  );
}

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info(
    {
      port: info.port,
      nodeEnv: config.nodeEnv,
      smsProvider: config.sms.provider,
      smsPaused: config.sms.paused,
      paymentProvider: config.payments.provider,
      emailProvider: config.email.provider,
      worker: config.worker,
      trustedProxies: config.trustedProxies,
      webApp: config.webAppDir !== undefined,
      console: config.adminAppDir !== undefined,
      errorReporting: reportError !== undefined,
      release: config.errorReporting.release,
    },
    "API listening",
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  const stopped = Promise.all(jobs.map((job) => job.stop()));
  server.close(() => {
    void stopped.then(() => database.close()).then(() => process.exit(0));
  });
}

process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.once("SIGINT", () => {
  shutdown("SIGINT");
});
