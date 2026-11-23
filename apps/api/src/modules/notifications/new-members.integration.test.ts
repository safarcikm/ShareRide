import { schema } from "@shareride/db";
import { operatorRole } from "@shareride/domain";
import { formatClock, formatDayAndMonth } from "@shareride/i18n";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeEmailSender, type FakeEmailSender } from "../../platform/email.ts";
import { createFakePushSender } from "../../platform/push.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { bookingHelpers, seedForBookings, type Member } from "../bookings/testing.ts";
import { collectExport } from "../privacy/export-data.ts";
import { createNotificationWorker } from "./worker.ts";

// The operator's email about new members (spec 25). The test clock starts on
// Friday 13 November 2026 at noon; Reykjavik keeps UTC.

let api: TestApi;
let email: FakeEmailSender;

const { notifications, notificationDeliveries, notificationPreferences, users } = schema;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await api.connection.db.execute(sql`delete from notifications`);
  await api.connection.db.execute(sql`delete from notification_preferences`);
  // Earlier tests' members joined long ago, so each test counts its own.
  await api.connection.db
    .update(users)
    .set({ ageConfirmedAt: new Date("2026-11-01T00:00:00.000Z") })
    .where(sql`${users.ageConfirmedAt} is not null`);
  email = createFakeEmailSender();
});

afterAll(async () => {
  await api.close();
});

const { newMember } = bookingHelpers(() => api);

const webAppUrl = "https://shareride.test";

function worker() {
  return createNotificationWorker({
    db: api.connection.db,
    clock: () => api.now(),
    push: createFakePushSender(),
    email: { sender: email, webAppUrl },
  });
}

/** Moves the test clock on; it goes back after each test. */
const moved: number[] = [];
function later(minutes: number) {
  moved.push(minutes * 60);
  api.advance(minutes * 60);
}
afterEach(() => {
  for (const seconds of moved.splice(0)) api.advance(-seconds);
});

/** An operator with a confirmed address. */
async function operator(name = "Olga", locale: "is" | "en" = "en") {
  const member = await newMember(name);
  await api.connection.db
    .update(users)
    .set({
      roles: [operatorRole],
      email: `${member.userId}@example.com`,
      emailVerifiedAt: api.now(),
      locale,
    })
    .where(eq(users.id, member.userId));
  return member;
}

/** The operator turns the email on now, as the console page does; when it was. */
async function turnOn(member: Member) {
  const now = api.now();
  await api.connection.db
    .insert(notificationPreferences)
    .values({ userId: member.userId, newMembersSince: now })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: { newMembersSince: now },
    });
  return now;
}

/** A moment as the email says it, such as "13 November at 12:01". Signing in moves the clock. */
const when = (moment: Date, locale: "is" | "en" = "en") =>
  `${formatDayAndMonth(moment, locale)} ${locale === "is" ? "kl." : "at"} ${formatClock(moment)}`;

async function turnOff(member: Member) {
  await api.connection.db
    .update(notificationPreferences)
    .set({ newMembersSince: null })
    .where(eq(notificationPreferences.userId, member.userId));
}

/** A notification about new members, made now as the worker's step makes it; when. */
async function madeNow(member: Member) {
  const now = api.now();
  const [made] = await api.connection.db
    .insert(notifications)
    .values({
      recipientId: member.userId,
      kind: "new_members",
      uniqueKey: `new_members:${now.toISOString()}:new_members:${member.userId}`,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: notifications.id });
  if (made === undefined) throw new Error("Not made.");
  await api.connection.db.insert(notificationDeliveries).values({
    notificationId: made.id,
    channel: "email",
    status: "queued",
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return now;
}

/** The operator's emails about new members, as the log keeps them. */
async function deliveries(member: Member) {
  return api.connection.db
    .select({
      channel: notificationDeliveries.channel,
      status: notificationDeliveries.status,
      reason: notificationDeliveries.reason,
    })
    .from(notifications)
    .innerJoin(notificationDeliveries, eq(notificationDeliveries.notificationId, notifications.id))
    .where(and(eq(notifications.recipientId, member.userId), eq(notifications.kind, "new_members")))
    .orderBy(asc(notifications.createdAt));
}

const sentTo = (member: Member) =>
  email.sent.filter((message) => message.to === `${member.userId}@example.com`);

/** Every member who finished signing up and is not deleted, as the email counts them. */
async function membersInAll() {
  const [row] = await api.connection.db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.ageConfirmedAt} is not null and ${users.status} <> 'deleted'`);
  return row?.count ?? 0;
}

describe("sending the email about new members (spec 25)", () => {
  it("says how many finished signing up since it was turned on, and the members in all", async () => {
    const olga = await operator();
    later(1);
    const on = await turnOn(olga);
    later(1);
    await newMember("Anna");
    await newMember("Bo");
    // Typed the code but never finished: not counted (R25.2).
    await newMember("Unfinished", { complete: false });
    // Deleted since: not counted.
    const gone = await newMember("Gone");
    await api.connection.db
      .update(users)
      .set({ status: "deleted" })
      .where(eq(users.id, gone.userId));
    later(1);
    await madeNow(olga);
    await worker().runOnce();

    expect(await deliveries(olga)).toEqual([{ channel: "email", status: "sent", reason: null }]);
    const [message] = sentTo(olga);
    expect(message?.subject).toBe("2 new members on PuffinRide");
    expect(message?.text).toContain(
      `Since ${when(on)}, 2 people have finished signing up. PuffinRide has ${String(await membersInAll())} members now.`,
    );
    expect(message?.text).toContain(`Open the console: ${webAppUrl}/admin`);
    expect(message?.text).toContain(
      "You get this email because you turned on emails about new members in the PuffinRide console.",
    );
    // Never who (R25.4).
    for (const name of ["Anna", "Bo"]) expect(message?.text).not.toContain(name);
  });

  it("counts from the last email, so nobody is counted twice (R25.3)", async () => {
    const olga = await operator();
    await turnOn(olga);
    later(1);
    await newMember("Anna");
    later(1);
    const first = await madeNow(olga);
    later(61);
    await newMember("Bo");
    await newMember("Cara");
    later(1);
    await madeNow(olga);
    await worker().runOnce();

    expect(sentTo(olga).map((message) => message.subject)).toEqual([
      "A new member on PuffinRide",
      "2 new members on PuffinRide",
    ]);
    expect(sentTo(olga)[1]?.text).toContain(`Since ${when(first)}, 2 people`);
  });

  it("says it in the operator's language", async () => {
    const olga = await operator("Olga", "is");
    const on = await turnOn(olga);
    later(1);
    await newMember("Anna");
    later(1);
    await madeNow(olga);
    await worker().runOnce();
    expect(sentTo(olga)[0]?.subject).toBe("1 nýr notandi á PuffinRide");
    expect(sentTo(olga)[0]?.text).toContain(`Frá ${when(on, "is")} hefur 1 lokið skráningu.`);
  });

  it("sends nothing once the operator turned it off (R25.1)", async () => {
    const olga = await operator();
    await turnOn(olga);
    later(1);
    await newMember("Anna");
    await madeNow(olga);
    await turnOff(olga);
    await worker().runOnce();
    expect(await deliveries(olga)).toEqual([
      { channel: "email", status: "skipped", reason: "no_longer_applies" },
    ]);
    expect(sentTo(olga)).toEqual([]);
  });

  it("sends nothing made before it was turned off and on again", async () => {
    const olga = await operator();
    await turnOn(olga);
    later(1);
    await newMember("Anna");
    await madeNow(olga);
    later(1);
    await turnOn(olga);
    await worker().runOnce();
    expect(await deliveries(olga)).toEqual([
      { channel: "email", status: "skipped", reason: "no_longer_applies" },
    ]);
  });

  it("sends nothing to someone who no longer has the operator role", async () => {
    const olga = await operator();
    await turnOn(olga);
    later(1);
    await newMember("Anna");
    await madeNow(olga);
    await api.connection.db.update(users).set({ roles: [] }).where(eq(users.id, olga.userId));
    await worker().runOnce();
    expect(await deliveries(olga)).toEqual([
      { channel: "email", status: "skipped", reason: "no_longer_applies" },
    ]);
  });

  it("skips the email without a confirmed address (R25.5)", async () => {
    const olga = await operator();
    await api.connection.db
      .update(users)
      .set({ emailVerifiedAt: null })
      .where(eq(users.id, olga.userId));
    await turnOn(olga);
    later(1);
    await newMember("Anna");
    await madeNow(olga);
    await worker().runOnce();
    expect(await deliveries(olga)).toEqual([
      { channel: "email", status: "skipped", reason: "no_email" },
    ]);
  });
});

describe("the choice in Download my data (spec 25, section 7)", () => {
  it("says since when it was on, and nothing while it is off", async () => {
    const olga = await operator();
    const settings = async () =>
      (await collectExport(api.connection.db, olga.userId, api.now())).sections.settings;
    expect(await settings()).toEqual({ tripReminders: true, betaNews: true });
    const on = await turnOn(olga);
    expect(await settings()).toEqual({
      tripReminders: true,
      betaNews: true,
      newMemberEmailsSince: on.toISOString(),
    });
    await turnOff(olga);
    expect(await settings()).toEqual({ tripReminders: true, betaNews: true });
  });
});
