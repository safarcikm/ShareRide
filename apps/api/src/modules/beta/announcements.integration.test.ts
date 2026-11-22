import { randomUUID } from "node:crypto";
import {
  myAnnouncementsRoute,
  setPushTokenRoute,
  updateNotificationSettingsRoute,
  type AdminAnnouncement,
  type AdminAnnouncements,
  type AnnouncementBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import {
  sampleId,
  seedSampleCorridors,
  seedSampleMeetingPoints,
  seedSampleTrips,
} from "@shareride/db/seed";
import { and, asc, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeEmailSender } from "../../platform/email.ts";
import { createFakePushSender } from "../../platform/push.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { createNotificationWorker } from "../notifications/worker.ts";

// Announcements and "Beta news" (spec 10, 3.5; R10.7; milestone 11, PR 10).
// The sample trips give three drivers: Jón drives Hlemmur to the airport
// (the airport corridor) and Selfoss to Vík, Sigga Mjódd to Selfoss (the
// south corridor), Anna to Akureyri and home. Gunna has a booking on Jón's
// trip to the airport; Palli, Dísa and the others have nothing.

let api: TestApi;
let operator: { userId: string; cookie: string };

interface Member {
  readonly userId: string;
  readonly accessToken: string;
}

let gunna: Member;
let palli: Member;
let disa: Member;
let suspended: Member;
let leaving: Member;
const { announcements, bookings, notifications, tripStops, users } = schema;
const jon = sampleId("user:jon");
const sigga = sampleId("user:sigga");
const anna = sampleId("user:anna");
const airport = sampleId("corridor:airport");

async function newMember(locale: "is" | "en" = "en"): Promise<Member> {
  const { userId, accessToken } = await api.signIn(api.newPhoneNumber());
  await api.connection.db
    .update(users)
    .set({ locale, email: `${userId}@example.test`, emailVerifiedAt: api.now() })
    .where(eq(users.id, userId));
  return { userId, accessToken };
}

beforeAll(async () => {
  api = await startTestApi();
  const { db } = api.connection;
  await seedSampleMeetingPoints(db, api.now());
  await seedSampleCorridors(db, api.now());
  await seedSampleTrips(db, api.now());
  operator = await api.signInOperator();
  await db
    .update(users)
    .set({ email: "operator@example.test", emailVerifiedAt: api.now() })
    .where(eq(users.id, operator.userId));

  gunna = await newMember();
  await api.client.call(setPushTokenRoute, {
    accessToken: gunna.accessToken,
    body: { token: "ExponentPushToken[gunna]" },
  });
  const stops = await db
    .select()
    .from(tripStops)
    .where(eq(tripStops.tripId, sampleId("trip:jon-airport")))
    .orderBy(asc(tripStops.position));
  const [first, last] = [stops[0], stops.at(-1)];
  if (first === undefined || last === undefined) throw new Error("No stops.");
  await db.insert(bookings).values({
    tripId: first.tripId,
    passengerId: gunna.userId,
    fromStopId: first.id,
    toStopId: last.id,
    seats: 1,
    status: "confirmed",
    totalPrice: 1500,
    attemptKey: randomUUID(),
    confirmedAt: api.now(),
    createdAt: api.now(),
    updatedAt: api.now(),
  });

  palli = await newMember("is");
  // Dísa turned "Beta news" off.
  disa = await newMember();
  const off = await api.client.call(updateNotificationSettingsRoute, {
    accessToken: disa.accessToken,
    body: { betaNews: false },
  });
  expect(off).toMatchObject({ ok: true, data: { betaNews: false, reminders: true } });
  // Not in good standing: one suspended, one waiting to be deleted.
  suspended = await newMember();
  await db.update(users).set({ status: "suspended" }).where(eq(users.id, suspended.userId));
  leaving = await newMember();
  await db
    .update(users)
    .set({ deleteAfter: new Date(api.now().getTime() + 7 * 24 * 3600 * 1000) })
    .where(eq(users.id, leaving.userId));
});

beforeEach(async () => {
  await api.connection.db.delete(notifications);
  await api.connection.db.delete(announcements);
  await api.connection.db.delete(schema.outboxEvents);
});

afterAll(async () => {
  await api.close();
});

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

const texts: AnnouncementBody = {
  audience: "everyone",
  corridorId: null,
  titleIs: "Ný útgáfa",
  titleEn: "A new version",
  messageIs: "Við bættum kortið.\nTakk fyrir prófunina.",
  messageEn: "We improved the map.\nThank you for testing.",
};

async function draft(changes: Partial<AnnouncementBody> = {}) {
  const made = await console_("POST", "/admin/v1/announcements", { ...texts, ...changes });
  if (made.status !== 201) throw new Error(JSON.stringify(made.body));
  return made.body as AdminAnnouncement;
}

async function audit(action: string) {
  return api.connection.db
    .select({
      operatorUserId: schema.auditLog.operatorUserId,
      subjectId: schema.auditLog.subjectId,
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

/** Who has a notification of the announcement, sorted. */
async function toldOf(announcementId: string) {
  const rows = await api.connection.db
    .select({ recipientId: notifications.recipientId })
    .from(notifications)
    .where(
      and(eq(notifications.announcementId, announcementId), eq(notifications.kind, "announcement")),
    );
  return rows.map((row) => row.recipientId).sort();
}

const sorted = (ids: readonly string[]) => [...ids].sort();

describe("writing an announcement (spec 10, 3.5.1)", () => {
  it("needs the operator's console session", async () => {
    const response = await api.request("/admin/v1/announcements");
    expect(response.status).toBe(401);
    const member = await console_("GET", "/admin/v1/announcements", undefined, "none=1");
    expect(member.status).toBe(401);
  });

  it("stores a draft with its texts trimmed, and sends nothing", async () => {
    const made = await console_("POST", "/admin/v1/announcements", {
      ...texts,
      titleEn: "  A new version ",
    });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({
      audience: "everyone",
      corridor: null,
      titleEn: "A new version",
      titleIs: "Ný útgáfa",
      sentAt: null,
      testSentAt: null,
      reach: null,
      delivered: null,
    });
    const { id } = made.body as AdminAnnouncement;
    expect((await audit("announcement.created"))[0]).toEqual({
      operatorUserId: operator.userId,
      subjectId: id,
      // Who it is for, never the texts.
      after: { audience: "everyone", corridorId: null },
    });
    const { worker, email } = noticeWorker();
    await worker.runOnce();
    expect(email.sent).toHaveLength(0);

    const list = await console_("GET", "/admin/v1/announcements");
    const overview = list.body as AdminAnnouncements;
    expect(overview.announcements.map((announcement) => announcement.id)).toEqual([id]);
    expect(overview.corridors.map((corridor) => corridor.id)).toContain(airport);
  });

  it("refuses one without both languages (R10.7)", async () => {
    for (const field of ["titleIs", "titleEn", "messageIs", "messageEn"] as const) {
      const made = await console_("POST", "/admin/v1/announcements", { ...texts, [field]: "  " });
      expect(made.status).toBe(400);
      expect(codeOf(made.body)).toBe("validation_failed");
      expect(detailsOf(made.body)).toEqual([{ path: field, issue: "missing" }]);
    }
    const long = await console_("POST", "/admin/v1/announcements", {
      ...texts,
      titleIs: "a".repeat(81),
    });
    expect(detailsOf(long.body)).toEqual([{ path: "titleIs", issue: "too_long" }]);
    const longMessage = await console_("POST", "/admin/v1/announcements", {
      ...texts,
      messageEn: "a".repeat(1001),
    });
    expect(detailsOf(longMessage.body)).toEqual([{ path: "messageEn", issue: "too_long" }]);
  });

  it("needs a corridor that exists for that audience, and keeps none for the others", async () => {
    const none = await console_("POST", "/admin/v1/announcements", {
      ...texts,
      audience: "corridor",
    });
    expect(detailsOf(none.body)).toEqual([{ path: "corridorId", issue: "missing" }]);
    const unknown = await console_("POST", "/admin/v1/announcements", {
      ...texts,
      audience: "corridor",
      corridorId: sampleId("corridor:nowhere"),
    });
    expect(unknown.status).toBe(400);
    expect(detailsOf(unknown.body)).toEqual([{ path: "corridorId", issue: "not_found" }]);

    const made = await draft({ audience: "corridor", corridorId: airport });
    expect(made.corridor?.id).toBe(airport);
    expect(made.corridor?.name).not.toBe("");
    const drivers = await draft({ audience: "drivers", corridorId: airport });
    expect(drivers.corridor).toBeNull();
  });

  it("changes a draft, and never what was sent", async () => {
    const made = await draft();
    const changed = await console_("PUT", `/admin/v1/announcements/${made.id}`, {
      ...texts,
      audience: "drivers",
      titleEn: "Drivers: a new version",
    });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ audience: "drivers", titleEn: "Drivers: a new version" });
    const bad = await console_("PUT", `/admin/v1/announcements/${made.id}`, {
      ...texts,
      messageIs: "",
    });
    expect(detailsOf(bad.body)).toEqual([{ path: "messageIs", issue: "missing" }]);
    const gone = await console_("PUT", `/admin/v1/announcements/${randomUUID()}`, texts);
    expect(gone.status).toBe(404);

    expect((await console_("POST", `/admin/v1/announcements/${made.id}/send`)).status).toBe(200);
    const late = await console_("PUT", `/admin/v1/announcements/${made.id}`, texts);
    expect(late.status).toBe(409);
    expect(codeOf(late.body)).toBe("already_sent");
  });
});

describe("an announcement's reach (3.5.2)", () => {
  it("counts the people of each audience, and those with push and with email", async () => {
    const reachOf = async (changes: Partial<AnnouncementBody>) => {
      const made = await draft(changes);
      const reach = await console_("GET", `/admin/v1/announcements/${made.id}/reach`);
      expect(reach.status).toBe(200);
      return reach.body;
    };
    // The three sample drivers, the operator, Gunna and Palli; not Dísa
    // (Beta news off), nor the suspended one or the one leaving. Only Gunna
    // has a phone with push; the sample drivers have no email.
    expect(await reachOf({})).toEqual({ people: 6, push: 1, email: 3 });
    expect(await reachOf({ audience: "drivers" })).toEqual({ people: 3, push: 0, email: 0 });
    expect(await reachOf({ audience: "passengers" })).toEqual({ people: 1, push: 1, email: 1 });
    // Jón drives it and Gunna has a booking on it.
    expect(await reachOf({ audience: "corridor", corridorId: airport })).toEqual({
      people: 2,
      push: 1,
      email: 1,
    });
    const none = await console_("GET", `/admin/v1/announcements/${randomUUID()}/reach`);
    expect(none.status).toBe(404);
  });
});

describe("Send to me (3.5.2)", () => {
  it("sends the operator their own copy in both languages, each time they ask", async () => {
    const made = await draft();
    const { worker, email } = noticeWorker();
    const tested = await console_("POST", `/admin/v1/announcements/${made.id}/test`);
    expect(tested.status).toBe(200);
    expect(tested.body).toMatchObject({ testSentAt: api.now().toISOString(), sentAt: null });
    await worker.runOnce();
    await worker.runOnce();
    expect(email.sent).toHaveLength(1);
    const [mail] = email.sent;
    expect(mail?.to).toBe("operator@example.test");
    expect(mail?.subject).toBe("Test: A new version");
    expect(mail?.text).toContain("Ný útgáfa");
    expect(mail?.text).toContain("Við bættum kortið.");
    expect(mail?.text).toContain("We improved the map.");
    expect(mail?.text).toContain("You get this because you are a PuffinRide beta tester.");
    expect(mail?.text).toContain("Þú færð þetta af því að þú tekur þátt í beta-prófun PuffinRide.");
    // Nobody else, and it is not on the operator's Beta news page.
    expect(await toldOf(made.id)).toEqual([]);
    expect((await audit("announcement.tested"))[0]?.subjectId).toBe(made.id);

    api.advance(60);
    await console_("POST", `/admin/v1/announcements/${made.id}/test`);
    await worker.runOnce();
    expect(email.sent).toHaveLength(2);
    const none = await console_("POST", `/admin/v1/announcements/${randomUUID()}/test`);
    expect(none.status).toBe(404);
  });
});

describe("sending an announcement (3.5.3; R10.7)", () => {
  it("reaches the right people of each audience, and nobody with Beta news off", async () => {
    const { worker } = noticeWorker();
    const expected: [Partial<AnnouncementBody>, string[]][] = [
      [{}, [anna, jon, sigga, operator.userId, gunna.userId, palli.userId]],
      [{ audience: "drivers" }, [anna, jon, sigga]],
      [{ audience: "passengers" }, [gunna.userId]],
      [{ audience: "corridor", corridorId: airport }, [jon, gunna.userId]],
      [{ audience: "corridor", corridorId: sampleId("corridor:south") }, [sigga]],
    ];
    for (const [changes, people] of expected) {
      const made = await draft(changes);
      const sent = await console_("POST", `/admin/v1/announcements/${made.id}/send`);
      expect(sent.status).toBe(200);
      // The reach stored is how many it went to.
      expect(sent.body).toMatchObject({ sentAt: api.now().toISOString(), reach: people.length });
      await worker.runOnce();
      expect(await toldOf(made.id)).toEqual(sorted(people));
      api.advance(1);
    }
    const everyone = await toldOf(
      (await api.connection.db.select().from(announcements))[0]?.id ?? "",
    );
    expect(everyone).not.toContain(disa.userId);
    expect(everyone).not.toContain(suspended.userId);
    expect(everyone).not.toContain(leaving.userId);
  });

  it("sends once: a second Send is refused and each person is told once", async () => {
    const made = await draft();
    const { worker, push, email } = noticeWorker();
    expect((await console_("POST", `/admin/v1/announcements/${made.id}/send`)).status).toBe(200);
    const again = await console_("POST", `/admin/v1/announcements/${made.id}/send`);
    expect(again.status).toBe(409);
    expect(codeOf(again.body)).toBe("already_sent");
    expect((await audit("announcement.sent"))[0]).toEqual({
      operatorUserId: operator.userId,
      subjectId: made.id,
      after: { audience: "everyone", corridorId: null, reach: 6 },
    });

    await worker.runOnce();
    await worker.runOnce();
    // The event run again, as after a crash, adds nothing.
    await api.connection.db.update(schema.outboxEvents).set({ processedAt: null });
    await worker.runOnce();
    await worker.runOnce();
    expect(await toldOf(made.id)).toHaveLength(6);

    // By email to the verified addresses, each in the person's language.
    expect(sorted(email.sent.map((mail) => mail.to))).toEqual(
      sorted([
        "operator@example.test",
        `${gunna.userId}@example.test`,
        `${palli.userId}@example.test`,
      ]),
    );
    const english = email.sent.find((mail) => mail.to === `${gunna.userId}@example.test`);
    expect(english?.subject).toBe("A new version");
    expect(english?.text).toContain("We improved the map.\nThank you for testing.");
    expect(english?.text).toContain(
      "You get this because you are a PuffinRide beta tester. Turn off beta news in Settings.",
    );
    expect(english?.text).toContain("https://shareride.test/settings/beta-news");
    const icelandic = email.sent.find((mail) => mail.to === `${palli.userId}@example.test`);
    expect(icelandic?.subject).toBe("Ný útgáfa");
    expect(icelandic?.text).toContain("Við bættum kortið.");
    expect(icelandic?.text).toContain(
      "Þú færð þetta af því að þú tekur þátt í beta-prófun PuffinRide.",
    );
    expect(icelandic?.text).not.toContain("We improved the map.");

    // By push to the one phone, with the start of the message.
    expect(push.sent).toEqual([
      {
        to: "ExponentPushToken[gunna]",
        title: "A new version",
        body: "We improved the map. Thank you for testing.",
        data: { path: "/settings/beta-news" },
      },
    ]);

    // The list shows what was delivered.
    const list = (await console_("GET", "/admin/v1/announcements")).body as AdminAnnouncements;
    expect(list.announcements[0]).toMatchObject({
      id: made.id,
      reach: 6,
      delivered: { push: 1, email: 3 },
    });
  });

  it("drops it for someone who turned Beta news off before it went out", async () => {
    const made = await draft({ audience: "passengers" });
    const { worker, push, email } = noticeWorker();
    await console_("POST", `/admin/v1/announcements/${made.id}/send`);
    // Gunna turns the news off before the worker sends anything.
    await api.client.call(updateNotificationSettingsRoute, {
      accessToken: gunna.accessToken,
      body: { betaNews: false },
    });
    await worker.runOnce();
    await worker.runOnce();
    expect(push.sent).toHaveLength(0);
    expect(email.sent).toHaveLength(0);
    await api.client.call(updateNotificationSettingsRoute, {
      accessToken: gunna.accessToken,
      body: { betaNews: true },
    });
  });
});

describe("Beta news in the app (plan 4.7)", () => {
  it("lists the announcements sent to the person, newest first, in both languages", async () => {
    const { worker } = noticeWorker();
    const first = await draft();
    await console_("POST", `/admin/v1/announcements/${first.id}/send`);
    await worker.runOnce();
    api.advance(600);
    const forDrivers = await draft({ audience: "drivers", titleEn: "For drivers" });
    await console_("POST", `/admin/v1/announcements/${forDrivers.id}/send`);
    const second = await draft({ audience: "passengers", titleEn: "For passengers" });
    await console_("POST", `/admin/v1/announcements/${second.id}/send`);
    // A draft and a test are never on the page.
    const unsent = await draft({ titleEn: "Not yet" });
    await console_("POST", `/admin/v1/announcements/${unsent.id}/test`);
    await worker.runOnce();

    const mine = await api.client.call(myAnnouncementsRoute, { accessToken: gunna.accessToken });
    if (!mine.ok) throw new Error(mine.error.code);
    expect(mine.data.announcements.map((announcement) => announcement.titleEn)).toEqual([
      "For passengers",
      "A new version",
    ]);
    expect(mine.data.announcements[1]).toMatchObject({
      id: first.id,
      titleIs: "Ný útgáfa",
      messageEn: "We improved the map.\nThank you for testing.",
    });

    const palliSees = await api.client.call(myAnnouncementsRoute, {
      accessToken: palli.accessToken,
    });
    if (!palliSees.ok) throw new Error(palliSees.error.code);
    expect(palliSees.data.announcements.map((announcement) => announcement.id)).toEqual([first.id]);
    const disaSees = await api.client.call(myAnnouncementsRoute, { accessToken: disa.accessToken });
    expect(disaSees).toMatchObject({ ok: true, data: { announcements: [] } });
    expect(await api.client.call(myAnnouncementsRoute, {})).toMatchObject({
      ok: false,
      status: 401,
    });
  });
});
