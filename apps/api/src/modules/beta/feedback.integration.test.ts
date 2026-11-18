import {
  myFeedbackRoute,
  sendFeedbackRoute,
  type AdminFeedback,
  type AdminFeedbackList,
  type SendFeedbackBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeEmailSender } from "../../platform/email.ts";
import { createFakePushSender } from "../../platform/push.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { createNotificationWorker } from "../notifications/worker.ts";

// Feedback from testers (spec 12, 3.3; R12.5; milestone 11, PR 5).

let api: TestApi;
let operator: { userId: string; cookie: string };

interface Member {
  readonly userId: string;
  readonly accessToken: string;
  readonly phone: string;
}

beforeAll(async () => {
  api = await startTestApi();
  operator = await api.signInOperator();
});

beforeEach(async () => {
  await api.connection.db.delete(schema.feedback);
  await api.connection.db.delete(schema.outboxEvents);
});

afterAll(async () => {
  await api.close();
});

async function newMember(firstName = "Gunna"): Promise<Member> {
  const phone = api.newPhoneNumber();
  const { userId, accessToken } = await api.signIn(phone);
  await api.connection.db
    .update(schema.users)
    .set({ firstName, email: `${userId}@example.test`, emailVerifiedAt: api.now() })
    .where(eq(schema.users.id, userId));
  return { userId, accessToken, phone };
}

const segment = (marker: number, data: readonly number[]) => [
  0xff,
  marker,
  (data.length + 2) >> 8,
  (data.length + 2) & 0xff,
  ...data,
];

const ascii = (text: string) => Array.from(text, (letter) => letter.charCodeAt(0));

/** A JPEG as the app writes a screenshot, or with a segment added before its picture. */
function jpeg(extra: readonly number[] = []) {
  return Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...extra,
    ...segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]),
    ...segment(0xc0, [8, 844 >> 8, 844 & 0xff, 390 >> 8, 390 & 0xff, 1, 1, 0x11, 0]),
    ...segment(0xc4, [0, 1, ...Array.from({ length: 15 }, () => 0), 0]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    0x12,
    0x34,
    0xff,
    0xd9,
  ]);
}

/** A JPEG of exactly `bytes` bytes, its picture data filling the rest. */
function jpegOfSize(bytes: number) {
  const small = jpeg();
  const file = new Uint8Array(bytes).fill(0x12);
  file.set(small.subarray(0, small.length - 4));
  file.set([0xff, 0xd9], bytes - 2);
  return file;
}

const base64 = (file: Uint8Array) => Buffer.from(file).toString("base64");

const draft: SendFeedbackBody = {
  kind: "problem",
  message: "The map does not move.",
  appVersion: "1.4.0",
  platform: "ios",
  osVersion: "19.1",
  screen: "/trips/[id]",
};

const send = (member: Member, changes: Partial<SendFeedbackBody> = {}) =>
  api.client.call(sendFeedbackRoute, {
    accessToken: member.accessToken,
    body: { ...draft, ...changes },
  });

async function sent(member: Member, changes: Partial<SendFeedbackBody> = {}) {
  const result = await send(member, changes);
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

async function console_(method: string, path: string, body?: unknown, cookie = operator.cookie) {
  const response = await api.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

const codeOf = (body: unknown) => (body as { error: { code: string } }).error.code;
const detailsOf = (body: unknown) =>
  (body as { error: { details?: { path: string; issue: string }[] } }).error.details;

async function audit(action: string) {
  return api.connection.db
    .select({
      operatorUserId: schema.auditLog.operatorUserId,
      subjectId: schema.auditLog.subjectId,
      before: schema.auditLog.before,
      after: schema.auditLog.after,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action))
    .orderBy(desc(schema.auditLog.id));
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

describe("sending feedback (spec 12, 3.3; R12.5)", () => {
  it("needs a signed-in person", async () => {
    const result = await api.client.call(sendFeedbackRoute, { body: draft });
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("stores the message with the app's details and the person's language", async () => {
    const gunna = await newMember();
    const result = await send(gunna, { message: "  The map does not move. \n" });
    expect(result).toMatchObject({
      ok: true,
      status: 201,
      data: {
        kind: "problem",
        message: "The map does not move.",
        hasScreenshot: false,
        reply: null,
        repliedAt: null,
        createdAt: api.now().toISOString(),
      },
    });
    const [row] = await api.connection.db.select().from(schema.feedback);
    expect(row).toMatchObject({
      userId: gunna.userId,
      appVersion: "1.4.0",
      platform: "ios",
      osVersion: "19.1",
      screen: "/trips/[id]",
      language: "en",
      status: "new",
    });
  });

  it("keeps a screenshot that is a JPEG without metadata, apart from the feedback", async () => {
    const gunna = await newMember();
    const file = jpeg();
    const made = await sent(gunna, { screenshot: base64(file) });
    expect(made.hasScreenshot).toBe(true);
    const [picture] = await api.connection.db.select().from(schema.feedbackScreenshots);
    expect(picture).toMatchObject({ feedbackId: made.id, width: 390, height: 844 });
    expect(Uint8Array.from(picture?.file ?? [])).toEqual(file);
  });

  it("refuses a file that is not a JPEG, has metadata or is too large, and stores nothing", async () => {
    const gunna = await newMember();
    const exif = segment(0xe1, ascii("Exif\0\0GPS"));
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    for (const [file, issue] of [
      [png, "not_jpeg"],
      [jpeg(exif), "metadata"],
    ] as const) {
      const result = await send(gunna, { screenshot: base64(file) });
      expect(result).toMatchObject({ ok: false, status: 400 });
      if (result.ok) throw new Error("taken");
      expect(result.error.code).toBe("validation_failed");
      expect(result.error.details).toEqual([{ path: "screenshot", issue }]);
    }
    // One byte over 1 MB: the body's own check refuses it.
    const large = await send(gunna, { screenshot: base64(jpegOfSize(1024 * 1024 + 1)) });
    expect(large).toMatchObject({ ok: false, status: 400 });
    expect((await sent(gunna, { screenshot: base64(jpegOfSize(1024 * 1024)) })).hasScreenshot).toBe(
      true,
    );
    expect(await api.connection.db.select().from(schema.feedback)).toHaveLength(1);
  });

  it("refuses an empty or overlong message and details that are not one line", async () => {
    const gunna = await newMember();
    for (const [changes, detail] of [
      [{ message: "   " }, { path: "message", issue: "missing" }],
      [{ message: "a".repeat(2001) }, { path: "message", issue: "too_long" }],
      [{ screen: "/trips\n/x" }, { path: "screen", issue: "invalid" }],
      [{ appVersion: "" }, { path: "appVersion", issue: "invalid" }],
    ] as const) {
      const result = await send(gunna, changes);
      if (result.ok) throw new Error("taken");
      expect(result.status).toBe(400);
      expect(result.error.details).toEqual([detail]);
    }
    expect(await api.connection.db.select().from(schema.feedback)).toHaveLength(0);
  });

  it("takes ten in a day and refuses the eleventh until the oldest is a day old", async () => {
    const gunna = await newMember();
    const jon = await newMember("Jón");
    for (let i = 0; i < 10; i += 1) {
      await sent(gunna);
      api.advance(60);
    }
    const eleventh = await send(gunna);
    expect(eleventh).toMatchObject({ ok: false, status: 429 });
    if (eleventh.ok) throw new Error("taken");
    expect(eleventh.error.code).toBe("rate_limited");
    expect(eleventh.error.retryAfterSeconds).toBe(24 * 3600 - 600);
    // Another person's count is their own.
    expect((await send(jon)).ok).toBe(true);
    api.advance(24 * 3600 - 600 - 31);
    // A day on, the access token has ended: signed in again (31 seconds).
    const { accessToken } = await api.signIn(gunna.phone);
    expect((await send({ ...gunna, accessToken })).ok).toBe(true);
  });
});

describe("my feedback (spec 12, 3.3.5)", () => {
  it("lists what I sent, newest first, and never another person's", async () => {
    const gunna = await newMember();
    const jon = await newMember("Jón");
    const first = await sent(gunna, { message: "First" });
    api.advance(60);
    const second = await sent(gunna, { kind: "idea", message: "Second" });
    await sent(jon, { message: "Jón's own" });

    const mine = await api.client.call(myFeedbackRoute, { accessToken: gunna.accessToken });
    if (!mine.ok) throw new Error(mine.error.code);
    expect(mine.data.feedback.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(JSON.stringify(mine.data)).not.toContain("Jón's own");
    // The operator's status is not shown to the person.
    expect(Object.keys(mine.data.feedback[0] ?? {})).not.toContain("status");
  });
});

describe("the console's feedback (spec 12, 3.3.4)", () => {
  beforeEach(async () => {
    // The clock moved a day on: a console session lasts less.
    operator = await api.signInOperator();
  });

  it("is for operators only", async () => {
    const gunna = await newMember();
    const made = await sent(gunna, { screenshot: base64(jpeg()) });
    for (const [method, path, body] of [
      ["GET", "/admin/v1/feedback"],
      ["GET", `/admin/v1/feedback/${made.id}`],
      ["GET", `/admin/v1/feedback/${made.id}/screenshot`],
      ["POST", `/admin/v1/feedback/${made.id}/status`, { status: "read" }],
      ["POST", `/admin/v1/feedback/${made.id}/reply`, { reply: "Thanks" }],
    ] as const) {
      const response = await api.request(path, {
        method,
        headers: {
          authorization: `Bearer ${gunna.accessToken}`,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      expect(response.status).toBe(401);
    }
  });

  it("lists feedback newest first, by status and kind, with how many are new", async () => {
    const gunna = await newMember();
    const problem = await sent(gunna);
    api.advance(60);
    const idea = await sent(gunna, { kind: "idea", message: "Show the weather." });
    await console_("POST", `/admin/v1/feedback/${problem.id}/status`, { status: "planned" });

    const all = (await console_("GET", "/admin/v1/feedback")).body as AdminFeedbackList;
    expect(all.feedback.map((item) => item.id)).toEqual([idea.id, problem.id]);
    expect(all.newCount).toBe(1);
    expect(all.feedback[0]).toMatchObject({
      userId: gunna.userId,
      firstName: "Gunna",
      kind: "idea",
      message: "Show the weather.",
      appVersion: "1.4.0",
      platform: "ios",
      osVersion: "19.1",
      screen: "/trips/[id]",
      language: "en",
      hasScreenshot: false,
      status: "new",
    });

    const planned = (await console_("GET", "/admin/v1/feedback?status=planned"))
      .body as AdminFeedbackList;
    expect(planned.feedback.map((item) => item.id)).toEqual([problem.id]);
    expect(planned.newCount).toBe(1);
    const ideas = (await console_("GET", "/admin/v1/feedback?kind=idea")).body as AdminFeedbackList;
    expect(ideas.feedback.map((item) => item.id)).toEqual([idea.id]);
    expect((await console_("GET", "/admin/v1/feedback?status=lost")).status).toBe(400);
  });

  it("changes the status, with the change in the audit log", async () => {
    const gunna = await newMember();
    const made = await sent(gunna);
    const changed = await console_("POST", `/admin/v1/feedback/${made.id}/status`, {
      status: "done",
    });
    expect(changed.status).toBe(200);
    expect((changed.body as AdminFeedback).status).toBe("done");
    expect((await audit("feedback.status_changed"))[0]).toEqual({
      operatorUserId: operator.userId,
      subjectId: made.id,
      before: { status: "new" },
      after: { status: "done" },
    });
    // The same status again changes nothing and writes nothing.
    const entries = (await audit("feedback.status_changed")).length;
    await console_("POST", `/admin/v1/feedback/${made.id}/status`, { status: "done" });
    expect(await audit("feedback.status_changed")).toHaveLength(entries);
    const missing = await console_(
      "POST",
      "/admin/v1/feedback/018f0000-0000-7000-8000-000000000000/status",
      { status: "done" },
    );
    expect(missing.status).toBe(404);
  });

  it("shows the screenshot as a JPEG nobody caches, and records that it was opened", async () => {
    const gunna = await newMember();
    const file = jpeg();
    const made = await sent(gunna, { screenshot: base64(file) });
    const plain = await sent(gunna);
    const before = (await audit("feedback.screenshot_viewed")).length;

    const response = await api.request(`/admin/v1/feedback/${made.id}/screenshot`, {
      headers: { cookie: operator.cookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(file);
    const entries = await audit("feedback.screenshot_viewed");
    expect(entries).toHaveLength(before + 1);
    expect(entries[0]).toMatchObject({ operatorUserId: operator.userId, subjectId: made.id });

    for (const id of [plain.id, "not-an-id"]) {
      const none = await api.request(`/admin/v1/feedback/${id}/screenshot`, {
        headers: { cookie: operator.cookie },
      });
      expect(none.status).toBe(404);
    }
    expect(await audit("feedback.screenshot_viewed")).toHaveLength(before + 1);
  });

  it("replies once: the push says there is a reply, the email carries it", async () => {
    const gunna = await newMember();
    const made = await sent(gunna);
    const { worker, push, email } = noticeWorker();

    const empty = await console_("POST", `/admin/v1/feedback/${made.id}/reply`, { reply: "  " });
    expect(empty.status).toBe(400);
    expect(detailsOf(empty.body)).toEqual([{ path: "reply", issue: "missing" }]);
    const long = await console_("POST", `/admin/v1/feedback/${made.id}/reply`, {
      reply: "a".repeat(1001),
    });
    expect(detailsOf(long.body)).toEqual([{ path: "reply", issue: "too_long" }]);

    const replied = await console_("POST", `/admin/v1/feedback/${made.id}/reply`, {
      reply: " Thanks, fixed in the next version. ",
    });
    expect(replied.status).toBe(200);
    expect(replied.body).toMatchObject({
      reply: "Thanks, fixed in the next version.",
      repliedAt: api.now().toISOString(),
      // A reply shows it was read.
      status: "read",
    });
    // The log keeps when, not what.
    expect((await audit("feedback.replied"))[0]).toEqual({
      operatorUserId: operator.userId,
      subjectId: made.id,
      before: null,
      after: { repliedAt: api.now().toISOString() },
    });

    const again = await console_("POST", `/admin/v1/feedback/${made.id}/reply`, {
      reply: "Another",
    });
    expect(again.status).toBe(409);
    expect(codeOf(again.body)).toBe("already_replied");

    await worker.runOnce();
    await worker.runOnce();
    expect(push.sent).toHaveLength(0);
    expect(email.sent).toHaveLength(1);
    const [mail] = email.sent;
    expect(mail?.to).toBe(`${gunna.userId}@example.test`);
    expect(mail?.subject).toBe("ShareRide replied to your feedback");
    expect(mail?.text).toContain("Thanks, fixed in the next version.");
    expect(mail?.text).toContain("https://shareride.test/settings/feedback");

    const mine = await api.client.call(myFeedbackRoute, { accessToken: gunna.accessToken });
    if (!mine.ok) throw new Error(mine.error.code);
    expect(mine.data.feedback[0]).toMatchObject({
      reply: "Thanks, fixed in the next version.",
      repliedAt: api.now().toISOString(),
    });
  });

  it("tells nobody when the feedback went with its account before the reply was sent", async () => {
    const gunna = await newMember();
    const made = await sent(gunna);
    const { worker, email } = noticeWorker();
    await console_("POST", `/admin/v1/feedback/${made.id}/reply`, { reply: "Thanks" });
    await api.connection.db.delete(schema.feedback).where(eq(schema.feedback.id, made.id));
    await worker.runOnce();
    expect(email.sent).toHaveLength(0);
  });
});
