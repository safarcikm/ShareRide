import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { askAboutMyDataRoute } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { defaultTripDaySettings } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import { createFakeEmailSender } from "../../platform/email.ts";
import { createFakePushSender } from "../../platform/push.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { bookingHelpers, hours, type Member } from "../bookings/testing.ts";
import { createNotificationWorker } from "../notifications/worker.ts";
import { runPrivacyCommand } from "./command.ts";
import { createErasure } from "./erasure.ts";
import { collectExport } from "./export-data.ts";
import { createPrivacyRequests } from "./requests.ts";
import { retentionSteps, runRetention } from "./retention.ts";

// Ask about my data (spec 11, 3.6; R11.7; plan 4.8). The test clock starts
// on Friday 13 November 2026 at noon.

let api: TestApi;
let logLines: string[];

beforeAll(async () => {
  api = await startTestApi();
});

beforeEach(() => {
  logLines = [];
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind } = bookingHelpers(() => api);
const day = 24 * 3600 * 1000;

function logger() {
  return createLogger({
    level: "info",
    destination: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString());
        callback();
      },
    }),
  });
}

function erasure() {
  return createErasure({
    db: api.connection.db,
    clock: () => api.now(),
    hasher: api.features.hasher,
    tripDaySettings: defaultTripDaySettings,
    logger: logger(),
  });
}

/** Gives the member a verified email in `locale`; the address. */
async function withEmail(member: Member, locale: "is" | "en" = "en"): Promise<string> {
  const email = `${randomUUID()}@example.test`;
  await api.connection.db
    .update(schema.users)
    .set({ email, emailVerifiedAt: api.now(), locale })
    .where(eq(schema.users.id, member.userId));
  return email;
}

function ask(member: Member, body: { kind: string; text: string }) {
  return api.client.call(askAboutMyDataRoute, {
    accessToken: member.accessToken,
    body: body as { kind: "question"; text: string },
  });
}

async function asked(member: Member, text = "Why do you keep my old trips?") {
  const result = await ask(member, { kind: "question", text });
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

async function command(...args: string[]) {
  const lines: string[] = [];
  const exitCode = await runPrivacyCommand(args, {
    db: api.connection.db,
    clock: () => api.now(),
    erasure: erasure(),
    before: undefined,
    write: (line) => lines.push(line),
  });
  return { exitCode, output: lines.join("\n") };
}

function noticeWorker() {
  const push = createFakePushSender();
  const email = createFakeEmailSender();
  const worker = createNotificationWorker({
    db: api.connection.db,
    clock: () => api.now(),
    push,
    email: { sender: email, webAppUrl: "https://shareride.test" },
  });
  return { worker, push, email };
}

async function requestRow(id: string) {
  const [row] = await api.connection.db
    .select()
    .from(schema.privacyRequests)
    .where(eq(schema.privacyRequests.id, id));
  if (row === undefined) throw new Error("No request.");
  return row;
}

describe("asking (spec 11, 3.6)", () => {
  it("takes a request from someone with a verified email, due a month later", async () => {
    const gunna = await newMember("Gunna");
    await withEmail(gunna);
    const now = api.now();

    const result = await ask(gunna, { kind: "objection", text: "  Please stop the emails.  " });

    expect(result).toMatchObject({ ok: true, status: 201 });
    if (!result.ok) return;
    // 13 November to 13 December: 30 days.
    expect(result.data).toEqual({
      id: expect.any(String) as string,
      kind: "objection",
      receivedAt: now.toISOString(),
      dueAt: new Date(now.getTime() + 30 * day).toISOString(),
    });
    expect(await requestRow(result.data.id)).toMatchObject({
      userId: gunna.userId,
      text: "Please stop the emails.",
      answeredAt: null,
      answer: null,
    });
  });

  it("needs a verified email, since the answer goes by email", async () => {
    const gunna = await newMember("Gunna");
    await api.connection.db
      .update(schema.users)
      .set({ email: `${randomUUID()}@example.test`, emailVerifiedAt: null })
      .where(eq(schema.users.id, gunna.userId));

    expect(await ask(gunna, { kind: "question", text: "Why?" })).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "email_required" },
    });
  });

  it("refuses an empty or too long text, and a kind it does not know", async () => {
    const gunna = await newMember("Gunna");
    await withEmail(gunna);

    for (const text of ["   ", "x".repeat(2001)]) {
      expect(await ask(gunna, { kind: "question", text })).toMatchObject({
        ok: false,
        status: 400,
        error: { code: "request_text_invalid" },
      });
    }
    expect(await ask(gunna, { kind: "complaint", text: "Why?" })).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("takes 5 a day, then says when another can be sent", async () => {
    const gunna = await newMember("Gunna");
    await withEmail(gunna);
    for (let count = 0; count < 5; count += 1) await asked(gunna, `Question ${String(count)}`);

    const sixth = await ask(gunna, { kind: "question", text: "One more" });
    expect(sixth).toMatchObject({
      ok: false,
      status: 429,
      error: { code: "rate_limited", retryAfterSeconds: hours(24) },
    });

    await later(hours(24), gunna);
    expect(await ask(gunna, { kind: "question", text: "One more" })).toMatchObject({ ok: true });
  });

  it("counts a request sent while another is being saved after it", async () => {
    const gunna = await newMember("Gunna");
    await withEmail(gunna);
    for (let count = 0; count < 4; count += 1) await asked(gunna, `Question ${String(count)}`);
    const requests = createPrivacyRequests({ db: api.connection.db, clock: () => api.now() });
    const other = await api.connection.pool.connect();
    let sixth: ReturnType<typeof requests.ask> | undefined;
    try {
      // As another request does: the account's row first, then the fifth.
      await other.query("BEGIN");
      await other.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [gunna.userId]);
      await other.query(
        "INSERT INTO privacy_requests (user_id, kind, text, received_at, due_at) VALUES ($1, 'question', 'Fifth', $2, $3)",
        [gunna.userId, api.now(), new Date(api.now().getTime() + 30 * day)],
      );
      sixth = requests.ask(gunna.userId, { kind: "question", text: "Sixth" });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await other.query("COMMIT");
    } finally {
      other.release();
    }

    expect(await sixth).toMatchObject({ ok: false, error: { code: "rate_limited" } });
  });
});

describe("answering, through the privacy command (plan, decision 3)", () => {
  it("lists the requests waiting for an answer, nearest due first, with their text", async () => {
    await api.connection.db.delete(schema.privacyRequests);
    const gunna = await newMember("Gunna");
    await withEmail(gunna);
    const first = await asked(gunna, "Why do you keep my old trips?\nAnd for how long?");
    await later(hours(24), gunna);
    const second = await asked(gunna, "Please correct my name.");

    const { exitCode, output } = await command("requests");

    expect(exitCode).toBe(0);
    expect(output).toBe(
      [
        `${first.id}  question  received 13 Nov 2026  due 13 Dec 2026  user ${gunna.userId}`,
        "    Why do you keep my old trips?",
        "    And for how long?",
        `${second.id}  question  received 14 Nov 2026  due 14 Dec 2026  user ${gunna.userId}`,
        "    Please correct my name.",
      ].join("\n"),
    );
  });

  it("says when nothing is waiting", async () => {
    await api.connection.db.delete(schema.privacyRequests);
    expect(await command("requests")).toEqual({
      exitCode: 0,
      output: "No request is waiting for an answer.",
    });
  });

  it("marks a request past its due date", async () => {
    await api.connection.db.delete(schema.privacyRequests);
    const gunna = await newMember("Gunna");
    await withEmail(gunna);
    await asked(gunna);
    await later(hours(24 * 31), gunna);

    expect((await command("requests")).output.split("\n")[0]).toMatch(/ {2}overdue$/);
  });

  it("shows control characters in a request as codes, so the text cannot steer the terminal", async () => {
    await api.connection.db.delete(schema.privacyRequests);
    const gunna = await newMember("Gunna");
    await withEmail(gunna);
    await asked(gunna, "Hi\u001b[2K\u001b[1A there\r\u202eevil\u0007");

    const { output } = await command("requests");

    expect(output.split("\n")[1]).toBe("    Hi\\u001b[2K\\u001b[1A there\\u000d\\u202eevil\\u0007");
  });

  it("answers by email in the person's language, once, in the audit log", async () => {
    const operator = await api.signInOperator();
    const gunna = await newMember("Gunna");
    const address = await withEmail(gunna, "is");
    const request = await asked(gunna);
    const { worker, push, email } = noticeWorker();

    expect(
      await command(
        "answer",
        request.id,
        "--text",
        "We keep trips 3 years for the people you rode with.",
        "--by",
        operator.userId,
      ),
    ).toEqual({
      exitCode: 0,
      output: `Answered request ${request.id}. The email goes out within a minute.`,
    });
    expect(await requestRow(request.id)).toMatchObject({
      answeredAt: api.now(),
      answer: "We keep trips 3 years for the people you rode with.",
    });

    await worker.runOnce();
    expect(push.sent).toEqual([]);
    expect(email.sent).toHaveLength(1);
    const [mail] = email.sent;
    expect(mail?.to).toBe(address);
    expect(mail?.subject).toBe("Svar við spurningu þinni um gögnin þín");
    expect(mail?.text).toContain("We keep trips 3 years for the people you rode with.");
    expect(mail?.text).toContain("https://shareride.test/settings/privacy");

    const entries = await api.connection.db
      .select({
        action: schema.auditLog.action,
        operatorUserId: schema.auditLog.operatorUserId,
        subjectType: schema.auditLog.subjectType,
        after: schema.auditLog.after,
      })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.subjectId, request.id));
    expect(entries).toEqual([
      {
        action: "privacy_request.answered",
        operatorUserId: operator.userId,
        subjectType: "privacy_request",
        after: { answeredAt: api.now().toISOString() },
      },
    ]);

    expect(await command("answer", request.id, "--text", "Again", "--by", operator.userId)).toEqual(
      { exitCode: 1, output: "That request has already been answered." },
    );
  });

  it.each([
    ["an empty answer", "text", "   ", "An answer needs some text."],
    ["no such request", "id", randomUUID(), "No request has that ID."],
    ["someone who is not an operator", "by", "member", "That account is not an operator."],
  ])("refuses %s", async (_name, change, value, message) => {
    const operator = await api.signInOperator();
    const gunna = await newMember("Gunna");
    await withEmail(gunna);
    const request = await asked(gunna);
    const given = { id: request.id, text: "Here is your answer.", by: operator.userId };
    if (change === "by") given.by = gunna.userId;
    else given[change as "id" | "text"] = value;

    expect(await command("answer", given.id, "--text", given.text, "--by", given.by)).toEqual({
      exitCode: 1,
      output: message,
    });
    expect((await requestRow(request.id)).answeredAt).toBeNull();
  });

  it("answers once when two operators answer at the same moment", async () => {
    const operator = await api.signInOperator();
    const gunna = await newMember("Gunna");
    await withEmail(gunna);
    const request = await asked(gunna);

    const results = await Promise.all(
      ["First answer.", "Second answer."].map((text) =>
        command("answer", request.id, "--text", text, "--by", operator.userId),
      ),
    );

    expect(results.map((result) => result.exitCode).sort()).toEqual([0, 1]);
    expect(results.map((result) => result.output)).toContain(
      "That request has already been answered.",
    );
    const audited = await api.connection.db
      .select({ id: schema.auditLog.id })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.subjectId, request.id));
    expect(audited).toHaveLength(1);
    const { worker, email } = noticeWorker();
    await worker.runOnce();
    expect(email.sent).toHaveLength(1);
  });

  it("sends no email when the account is erased between the answer and the email", async () => {
    const operator = await api.signInOperator();
    const gunna = await newMember("Gunna");
    await withEmail(gunna);
    const request = await asked(gunna);
    expect(
      await command("answer", request.id, "--text", "Noted.", "--by", operator.userId),
    ).toMatchObject({ exitCode: 0 });
    await api.connection.db
      .update(schema.users)
      .set({ deleteAfter: new Date(api.now().getTime() - 1000) })
      .where(eq(schema.users.id, gunna.userId));
    expect(await erasure().eraseDue()).toMatchObject({ erased: 1 });
    const { worker, email } = noticeWorker();

    await worker.runOnce();

    expect(email.sent).toEqual([]);
    expect(await requestRow(request.id)).toMatchObject({
      userId: schema.formerMemberId,
      answer: "Noted.",
    });
  });

  it("records the answer without an email once the account is erased", async () => {
    const operator = await api.signInOperator();
    const gunna = await newMember("Gunna");
    await withEmail(gunna);
    const request = await asked(gunna);
    await api.connection.db
      .update(schema.users)
      .set({ deleteAfter: new Date(api.now().getTime() - 1000) })
      .where(eq(schema.users.id, gunna.userId));
    expect(await erasure().eraseDue()).toMatchObject({ erased: 1 });
    const { worker, email } = noticeWorker();

    expect(
      await command("answer", request.id, "--text", "Noted.", "--by", operator.userId),
    ).toEqual({
      exitCode: 0,
      output: `Answered request ${request.id}. No email: the account has been deleted.`,
    });
    await worker.runOnce();
    expect(email.sent).toEqual([]);
  });

  it("shows how to use it", async () => {
    for (const args of [
      ["requests", "now"],
      ["answer"],
      ["answer", randomUUID(), "--text", "Hi"],
      ["answer", randomUUID(), "--by", "x"],
    ]) {
      const { exitCode, output } = await command(...args);
      expect(exitCode).toBe(2);
      expect(output).toContain('privacy answer <request ID> --text "<answer>" --by <operator>');
    }
  });
});

describe("the person's own records", () => {
  it("are in Download my data, with the answer", async () => {
    const operator = await api.signInOperator();
    const gunna = await newMember("Gunna");
    await withEmail(gunna);
    const received = api.now();
    const request = await asked(gunna, "Why do you keep my old trips?");
    await later(hours(2), gunna);
    const answered = api.now();
    await command("answer", request.id, "--text", "For 3 years.", "--by", operator.userId);
    const other = await newMember("Sigga");
    await withEmail(other);
    await asked(other, "Someone else's question");

    const data = await collectExport(api.connection.db, gunna.userId, api.now());

    expect(data.sections.privacy_requests).toEqual([
      {
        kind: "question",
        text: "Why do you keep my old trips?",
        receivedAt: received.toISOString(),
        dueAt: new Date(received.getTime() + 30 * day).toISOString(),
        answeredAt: answered.toISOString(),
        ourAnswer: "For 3 years.",
      },
    ]);
  });

  it("move to the former member when the account is erased, to show they were answered", async () => {
    const gunna = await newMember("Gunna");
    await withEmail(gunna);
    const request = await asked(gunna);
    await api.connection.db
      .update(schema.users)
      .set({ deleteAfter: new Date(api.now().getTime() - 1000) })
      .where(eq(schema.users.id, gunna.userId));

    expect(await erasure().eraseDue()).toMatchObject({ erased: 1 });

    expect(await requestRow(request.id)).toMatchObject({
      userId: schema.formerMemberId,
      text: "Why do you keep my old trips?",
    });
  });
});

describe("the retention rule (privacy register: privacy requests)", () => {
  it("deletes a request 3 years after its answer, and keeps one held or unanswered", async () => {
    const { db } = api.connection;
    await db.delete(schema.privacyRequests);
    const now = api.now();
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 3);
    const gunna = await newMember("Gunna");
    const held = await newMember("Siggi");
    const operator = await api.signInOperator();
    await db.insert(schema.holds).values({
      subjectType: "user",
      subjectId: held.userId,
      reason: "Claim",
      endsAt: new Date(now.getTime() + day),
      setBy: operator.userId,
    });
    const row = (userId: string, answeredAt: Date | null) => ({
      userId,
      kind: "question",
      text: "Why?",
      receivedAt: new Date(cutoff.getTime() - 40 * day),
      dueAt: new Date(cutoff.getTime() - 10 * day),
      answeredAt,
      answer: answeredAt === null ? null : "Because.",
    });
    await db
      .insert(schema.privacyRequests)
      .values([
        row(gunna.userId, cutoff),
        row(gunna.userId, new Date(cutoff.getTime() + 1)),
        row(gunna.userId, null),
        row(held.userId, cutoff),
      ]);

    const result = await runRetention({
      db,
      now,
      steps: retentionSteps({ db, erasure: erasure() }),
      logger: logger(),
    });

    expect(result.failedRules).toEqual([]);
    expect(result.counts.privacy_requests).toEqual({ erased: 1, anonymised: 0 });
    const left = await db
      .select({
        userId: schema.privacyRequests.userId,
        answeredAt: schema.privacyRequests.answeredAt,
      })
      .from(schema.privacyRequests);
    expect(left).toHaveLength(3);
    expect(left.filter((kept) => kept.answeredAt?.getTime() === cutoff.getTime())).toEqual([
      { userId: held.userId, answeredAt: cutoff },
    ]);
  });
});
