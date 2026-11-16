// The API for the app's browser tests (apps/mobile/e2e), started by
// Playwright. It empties, migrates and seeds the *_test database (draft legal
// documents, the sample meeting points and the sample trips), pays with the
// test provider, writes
// each text message as a JSON line to E2E_SMS_OUTBOX and each email to
// E2E_EMAIL_OUTBOX for the tests to read, runs the notification worker
// every second with email only (no push from a browser), and runs on PORT
// (default 3001). Never use it for anything else.
import { randomBytes } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { pingDatabase } from "@shareride/db";
import { seedDevelopmentData } from "@shareride/db/seed";
import { freshTestDatabase } from "@shareride/db/testing";
import { createApp } from "./app.ts";
import { createLogger } from "./logger.ts";
import { createNotificationWorker } from "./modules/notifications/index.ts";
import { createKeyedHasher } from "./platform/crypto.ts";
import type { EmailSender } from "./platform/email.ts";
import { createTestPaymentProvider } from "./platform/payments.ts";
import type { PushSender } from "./platform/push.ts";
import { startRepeating } from "./platform/repeat.ts";
import type { SmsSender } from "./platform/sms.ts";

const env = process.env;
const outbox = env["E2E_SMS_OUTBOX"];
const emailOutbox = env["E2E_EMAIL_OUTBOX"];
if (
  env["NODE_ENV"] === "production" ||
  outbox === undefined ||
  outbox === "" ||
  emailOutbox === undefined ||
  emailOutbox === ""
) {
  process.stderr.write(
    "The e2e API needs E2E_SMS_OUTBOX and E2E_EMAIL_OUTBOX and never runs in production.\n",
  );
  process.exit(1);
}
const port = Number(env["PORT"] ?? "3001");
const webOrigin = env["E2E_WEB_ORIGIN"] ?? "http://localhost:8082";

// Refuses databases whose name does not end in _test, because it empties them.
const connection = await freshTestDatabase();
await seedDevelopmentData(connection.db, new Date());
writeFileSync(outbox, "");
writeFileSync(emailOutbox, "");

// Each code sent moves the clock 31 seconds on, so a test can sign in to the
// same account again at once without waiting out the resend limit (R1.3).
let clockOffsetMs = 0;
const sms: SmsSender = {
  send(message) {
    appendFileSync(outbox, `${JSON.stringify(message)}\n`);
    clockOffsetMs += 31_000;
    return Promise.resolve();
  },
};

const email: EmailSender = {
  send(message) {
    const { to, subject, text } = message;
    appendFileSync(emailOutbox, `${JSON.stringify({ to, subject, text })}\n`);
    return Promise.resolve({ id: `e2e-${message.idempotencyKey}` });
  },
};
const clock = () => new Date(Date.now() + clockOffsetMs);

// Every request counts as a new address, so the per-address limit never
// stops a test run; the limits have their own integration tests.
let requests = 0;

const app = createApp({
  logger: createLogger({ level: "warn" }),
  checkDatabase: () => pingDatabase(connection.pool),
  webOrigins: [webOrigin],
  features: {
    db: connection.db,
    sms,
    email: { sender: email, webAppUrl: webOrigin },
    hasher: createKeyedHasher(randomBytes(32).toString("hex")),
    clock,
    clientAddress: () => `e2e-${String((requests += 1))}`,
    secureCookies: false,
    payments: createTestPaymentProvider(),
  },
});

// A browser registers no push token, so nothing is pushed.
const push: PushSender = {
  send: (messages) => Promise.resolve(messages.map(() => ({ status: "ok" as const, id: "" }))),
  receipts: () => Promise.resolve(new Map()),
};
const worker = createNotificationWorker({
  db: connection.db,
  clock,
  push,
  email: { sender: email, webAppUrl: webOrigin },
});
startRepeating({
  everyMs: 1000,
  run: () => worker.runOnce(),
  onError: (error) => {
    process.stderr.write(`notification worker: ${String(error)}\n`);
  },
});

serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(`e2e API listening on port ${String(info.port)}\n`);
});
