// The API for the app's browser tests (apps/mobile/e2e), started by
// Playwright. It empties, migrates and seeds the *_test database (draft legal
// documents, the sample meeting points and the sample trips), pays with the
// test provider, writes each text message as a JSON line to E2E_SMS_OUTBOX
// and each email to E2E_EMAIL_OUTBOX for the tests to read, runs the
// notification worker every second with email only (no push from a browser),
// and runs on PORT (default 3001). `POST /e2e/trips/{id}/move` with
// `{ "minutes": 10 }` puts a trip's first stop that many minutes from the real
// time, with its "I'm here" and reports, for the trip day journeys; moved far
// enough back, a report nobody answered stands. The API runs on the real
// time, as the browser does; each code sent makes the earlier sends look 31
// seconds older, so the resend limits never hold a test up. For the console's
// browser tests (apps/admin/e2e), E2E_ADMIN_APP_DIR is the console's build,
// served at /admin, and E2E_OPERATOR_LINK a file: the API makes a new operator
// account and writes its passkey setup link there, with passkeys bound to
// E2E_ADMIN_ORIGIN. Meeting point photos go to a new folder each run.
// `POST /e2e/suspend` with `{ "phone": "+354…", "reason": "…" }` suspends
// that person with no end, as the console will, for the safety journey.
// `POST /e2e/report` with `{ "by": "Jón", "tripOf": "Anna", "category":
// "safety", "description": "…" }` files a report about a sample driver's
// trip as another sample driver, for the console's reports journey.
// Never use either for anything else.
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { pingDatabase, schema } from "@shareride/db";
import { seedDevelopmentData } from "@shareride/db/seed";
import { freshTestDatabase } from "@shareride/db/testing";
import { operatorRole, reportCategories, type ReportCategory } from "@shareride/domain";
import { and, eq, sql } from "drizzle-orm";
import { createApp } from "./app.ts";
import { createLogger } from "./logger.ts";
import { selectPhotoStorage } from "./platform/select-photo-storage.ts";
import {
  createOperatorSessionService,
  createPasskeyService,
  runOperatorCommand,
} from "./modules/admin/index.ts";
import { createModerationService } from "./modules/moderation/index.ts";
import { createNotificationWorker } from "./modules/notifications/index.ts";
import { createExportBuilder, exportCipherPurpose } from "./modules/privacy/index.ts";
import { createReportService } from "./modules/safety/index.ts";
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

// Each code sent makes every earlier send look 31 seconds older to the
// limits (R1.3), so a test can sign in to the same account again at once
// without waiting out the resend limit. The clock itself stays the real
// time, which the browser goes by too: moving it on with each code, as
// before, put the API minutes ahead of the browser by the end of a full run,
// and a trip moved to 15 minutes ago was already past its "I'm here" window
// on the API. The sends look older before the message is written, so a test
// that waits for the message can send again at once.
const { rateLimitEvents } = schema;
const sms: SmsSender = {
  async send(message) {
    await connection.db
      .update(rateLimitEvents)
      .set({ createdAt: sql`${rateLimitEvents.createdAt} - interval '31 seconds'` });
    appendFileSync(outbox, `${JSON.stringify(message)}\n`);
  },
};

const email: EmailSender = {
  send(message) {
    const { to, subject, text } = message;
    appendFileSync(emailOutbox, `${JSON.stringify({ to, subject, text })}\n`);
    return Promise.resolve({ id: `e2e-${message.idempotencyKey}` });
  },
};
const clock = () => new Date();

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
    // The journeys sign up without an invite code: the closed beta's gate
    // is held off here, whatever the console's Settings say.
    fixedSettings: { invite_code_required: 0 },
    secureCookies: false,
    payments: createTestPaymentProvider(),
    adminOrigin,
    ...selectPhotoStorage({
      provider: "folder",
      folder: mkdtempSync(join(tmpdir(), "shareride-e2e-photos-")),
    }),
  },
});

// The trip day journeys move one trip's times, never the shared clock
// (milestone 7 plan, 4.2). Minutes from the real time, which the browser and
// this API both go by.
app.post("/e2e/trips/:id/move", async (c) => {
  const body: unknown = await c.req.json();
  const minutes =
    typeof body === "object" && body !== null && "minutes" in body ? body.minutes : undefined;
  if (typeof minutes !== "number") return c.json({ error: "Send { minutes }." }, 400);
  await moveTripForTests(connection.db, c.req.param("id"), minutes, new Date());
  return c.body(null, 204);
});

// A suspension, as the console will make it (spec 9, 3.6), by an operator
// made for these tests.
const moderation = createModerationService({ db: connection.db, clock });
let operatorId: string | undefined;
app.post("/e2e/suspend", async (c) => {
  const body: unknown = await c.req.json();
  const field = (name: string) =>
    typeof body === "object" && body !== null && name in body
      ? (body as Record<string, unknown>)[name]
      : undefined;
  const phone = field("phone");
  const reason = field("reason");
  if (typeof phone !== "string" || typeof reason !== "string") {
    return c.json({ error: "Send { phone, reason }." }, 400);
  }
  const { users } = schema;
  const [person] = await connection.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phoneE164, phone));
  if (person === undefined) return c.json({ error: "No such person." }, 404);
  if (operatorId === undefined) {
    const [operator] = await connection.db
      .insert(users)
      .values({ locale: "en", firstName: "Operator", roles: [operatorRole] })
      .returning({ id: users.id });
    operatorId = operator?.id;
  }
  if (operatorId === undefined) return c.json({ error: "No operator." }, 500);
  const result = await moderation.suspend(
    { userId: operatorId, sessionId: null },
    { userId: person.id, rule: "harassment", reason, until: null },
    null,
  );
  return result.ok ? c.json(result.value, 200) : c.json({ error: result.error.code }, 409);
});

// A report by one sample driver about another's trip, as the app files it
// (spec 9, 3.1), for the console's reports journey.
const reports = createReportService({ db: connection.db, clock });
app.post("/e2e/report", async (c) => {
  const body: unknown = await c.req.json();
  const field = (name: string) =>
    typeof body === "object" && body !== null && name in body
      ? (body as Record<string, unknown>)[name]
      : undefined;
  const by = field("by");
  const tripOf = field("tripOf");
  const category = field("category");
  const description = field("description");
  if (
    typeof by !== "string" ||
    typeof tripOf !== "string" ||
    typeof description !== "string" ||
    !reportCategories.some((one) => one === category)
  ) {
    return c.json({ error: "Send { by, tripOf, category, description }." }, 400);
  }
  const { users, trips } = schema;
  const [reporter] = await connection.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.firstName, by));
  const [trip] = await connection.db
    .select({ id: trips.id })
    .from(trips)
    .innerJoin(users, eq(users.id, trips.driverId))
    .where(and(eq(users.firstName, tripOf), eq(trips.status, "published")))
    .limit(1);
  if (reporter === undefined || trip === undefined) {
    return c.json({ error: "No such person or trip." }, 404);
  }
  const result = await reports.file(reporter.id, {
    about: { kind: "trip", tripId: trip.id },
    category: category as ReportCategory,
    description,
  });
  return result.ok ? c.json(result.value, 201) : c.json({ error: result.error.code }, 409);
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
