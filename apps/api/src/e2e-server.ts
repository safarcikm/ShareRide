// The API for the app's browser tests (apps/mobile/e2e), started by
// Playwright. It empties, migrates and seeds the *_test database (draft legal
// documents, the sample meeting points and the sample trips), pays with the
// test provider, writes
// each text message as a JSON line to E2E_SMS_OUTBOX and each email to
// E2E_EMAIL_OUTBOX for the tests to read, runs the notification worker
// every second with email only (no push from a browser), and runs on PORT
// (default 3001). `POST /e2e/trips/{id}/move` with `{ "minutes": 10 }` puts a
// trip's first stop that many minutes from the real time, with its "I'm here"
// and reports, for the trip day journeys; moved far enough back, a report
// nobody answered stands. For the console's browser tests (apps/admin/e2e),
// E2E_ADMIN_APP_DIR is the console's build, served at /admin, and
// E2E_OPERATOR_LINK a file: the API makes a new operator account and writes
// its passkey setup link there, with passkeys bound to E2E_ADMIN_ORIGIN.
// Never use it for anything else.
import { randomBytes } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { pingDatabase, schema } from "@shareride/db";
import { seedDevelopmentData } from "@shareride/db/seed";
import { freshTestDatabase } from "@shareride/db/testing";
import { createApp } from "./app.ts";
import { createLogger } from "./logger.ts";
import {
  createOperatorSessionService,
  createPasskeyService,
  runOperatorCommand,
} from "./modules/admin/index.ts";
import { createNotificationWorker } from "./modules/notifications/index.ts";
import { createExportBuilder, exportCipherPurpose } from "./modules/privacy/index.ts";
import { moveTripForTests } from "./modules/trip-day/testing.ts";
import { createFileCipher, createKeyedHasher } from "./platform/crypto.ts";
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
const adminAppDir = env["E2E_ADMIN_APP_DIR"];
const operatorLink = env["E2E_OPERATOR_LINK"];
const adminOrigin = env["E2E_ADMIN_ORIGIN"] ?? `http://localhost:${String(port)}`;

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

if (operatorLink !== undefined && operatorLink !== "") {
  const [operator] = await connection.db
    .insert(schema.users)
    .values({ firstName: "Operator", locale: "en" })
    .returning({ id: schema.users.id });
  const sessions = createOperatorSessionService({ db: connection.db, clock });
  const printed: string[] = [];
  const status = await runOperatorCommand(["add", operator?.id ?? ""], {
    db: connection.db,
    adminOrigin,
    sessions,
    passkeys: createPasskeyService({ db: connection.db, clock, sessions, adminOrigin }),
    write: (line) => printed.push(line),
  });
  const link = printed.join("\n").match(/\S+\/admin\/setup#\S+/)?.[0];
  if (status !== 0 || link === undefined) {
    process.stderr.write(`The operator command failed:\n${printed.join("\n")}\n`);
    process.exit(1);
  }
  writeFileSync(operatorLink, link);
}

// Every request counts as a new address, so the per-address limit never
// stops a test run; the limits have their own integration tests.
let requests = 0;

const secret = randomBytes(32).toString("hex");
const app = createApp({
  logger: createLogger({ level: "warn" }),
  checkDatabase: () => pingDatabase(connection.pool),
  webOrigins: [webOrigin],
  ...(adminAppDir === undefined || adminAppDir === "" ? {} : { adminAppDir }),
  features: {
    db: connection.db,
    sms,
    email: { sender: email, webAppUrl: webOrigin },
    hasher: createKeyedHasher(secret),
    exportCipher: createFileCipher(secret, exportCipherPurpose),
    clock,
    clientAddress: () => `e2e-${String((requests += 1))}`,
    secureCookies: false,
    payments: createTestPaymentProvider(),
    adminOrigin,
  },
});

// The trip day journeys move one trip's times, never the shared clock
// (milestone 7 plan, 4.2). Minutes from the real time, which the browser
// goes by, not from this API's clock, which runs ahead with each code sent.
app.post("/e2e/trips/:id/move", async (c) => {
  const body: unknown = await c.req.json();
  const minutes =
    typeof body === "object" && body !== null && "minutes" in body ? body.minutes : undefined;
  if (typeof minutes !== "number") return c.json({ error: "Send { minutes }." }, 400);
  await moveTripForTests(connection.db, c.req.param("id"), minutes, new Date());
  return c.body(null, 204);
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
  // News by SMS goes nowhere here, so the sign-in codes' file and clock stay as they were.
  sms: { send: () => Promise.resolve() },
});
startRepeating({
  everyMs: 1000,
  run: () => worker.runOnce(),
  onError: (error) => {
    process.stderr.write(`notification worker: ${String(error)}\n`);
  },
});

const exportBuilder = createExportBuilder({
  db: connection.db,
  cipher: createFileCipher(secret, exportCipherPurpose),
  clock,
  logger: createLogger({ level: "warn" }),
});
startRepeating({
  everyMs: 1000,
  run: () => exportBuilder.buildDue(),
  onError: (error) => {
    process.stderr.write(`data exports: ${String(error)}\n`);
  },
});

serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(`e2e API listening on port ${String(info.port)}\n`);
});
