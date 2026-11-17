import { randomUUID } from "node:crypto";
import {
  acceptRequestRoute,
  askDataExportRoute,
  blockFromBookingRoute,
  dataExportLinkRoute,
  driverCheckInRoute,
  getDataExportRoute,
  passengerCheckInRoute,
  sendConfirmCodeRoute,
  sendMessageRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { exportSections } from "@shareride/domain";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import { createFakeEmailSender } from "../../platform/email.ts";
import { createFakePushSender } from "../../platform/push.ts";
import { readZip } from "../../platform/zip.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  hours,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { createNotificationWorker } from "../notifications/worker.ts";
import { unlabelledFields } from "./export-page.ts";
import type { ExportData } from "./export-data.ts";
import {
  cleanUpExports,
  createExportBuilder,
  exportBuildAttempts,
  exportBuildLeaseMinutes,
} from "./exports.ts";

// "Download my data" (spec 11, 3.2; plan 4.4). The sample trips at the test
// clock (Friday 13 November 2026, noon): Anna drives BSÍ to Hof, Akureyri on
// Saturday at 09:00, 3 seats, by approval.

let api: TestApi;
let builder: ReturnType<typeof createExportBuilder>;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
  builder = createExportBuilder({
    db: api.connection.db,
    cipher: api.features.exportCipher,
    clock: api.features.clock,
    logger: createLogger({ level: "silent" }),
  });
});

beforeEach(async () => {
  await freshSampleTrips(api);
  await api.connection.db.delete(schema.dataExports);
  await api.connection.db.delete(schema.outboxEvents);
  await api.connection.db.delete(schema.blocks);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

/** Sends a confirm code to the member's own number and gives it back. */
async function freshCode(member: Member): Promise<string> {
  // The sign-in code went a moment ago; one code per 30 seconds (R1.3).
  await later(31, member);
  const sent = await api.client.call(sendConfirmCodeRoute, {
    accessToken: member.accessToken,
    body: {},
  });
  if (!sent.ok) throw new Error(sent.error.code);
  return api.lastCode(await phoneOf(member));
}

async function phoneOf(member: Member): Promise<string> {
  const [user] = await api.connection.db
    .select({ phone: schema.users.phoneE164 })
    .from(schema.users)
    .where(eq(schema.users.id, member.userId));
  if (user === undefined || user.phone === null) throw new Error("The member has no number.");
  return user.phone;
}

function ask(member: Member, code: string) {
  return api.client.call(askDataExportRoute, { accessToken: member.accessToken, body: { code } });
}

function statusOf(member: Member) {
  return api.client.call(getDataExportRoute, { accessToken: member.accessToken });
}

function linkFor(member: Member) {
  return api.client.call(dataExportLinkRoute, { accessToken: member.accessToken, body: {} });
}

/** Asks, builds and downloads the member's export. */
async function exportOf(member: Member) {
  const asked = await ask(member, await freshCode(member));
  if (!asked.ok) throw new Error(asked.error.code);
  await builder.buildDue();
  const link = await linkFor(member);
  if (!link.ok) throw new Error(link.error.code);
  const response = await api.request(link.data.path);
  expect(response.status).toBe(200);
  const entries = readZip(Buffer.from(await response.arrayBuffer()));
  const json = entries.find((entry) => entry.name === "shareride-data.json");
  const html = entries.find((entry) => entry.name === "shareride-data.html");
  if (json === undefined || html === undefined) throw new Error("A file is missing.");
  return {
    text: json.data.toString("utf8"),
    data: JSON.parse(json.data.toString("utf8")) as ExportData,
    html: html.data.toString("utf8"),
  };
}

/** A builder that stops before reading the data, until `release` is called. */
function heldBuilder() {
  const { db } = api.connection;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reach = () => {};
  const reached = new Promise<void>((resolve) => {
    reach = resolve;
  });
  const transaction: typeof db.transaction = async (run, config) => {
    if (config?.accessMode === "read only") {
      reach();
      await held;
    }
    return db.transaction(run, config);
  };
  const slowDb = new Proxy(db, {
    get: (target, property, receiver) =>
      property === "transaction"
        ? transaction
        : (Reflect.get(target, property, receiver) as unknown),
  });
  const builder = createExportBuilder({
    db: slowDb,
    cipher: api.features.exportCipher,
    clock: api.features.clock,
    logger: createLogger({ level: "silent" }),
  });
  return { run: () => builder.buildDue(), reached, release };
}

/** A notification worker with fake push and email. */
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

/** Gives the member a phone that takes push, and a verified email in `locale`; the email. */
async function reachable(member: Member, locale: "is" | "en"): Promise<string> {
  const { db } = api.connection;
  const [session] = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, member.userId));
  if (session === undefined) throw new Error("No session.");
  await db.insert(schema.pushTokens).values({
    sessionId: session.id,
    userId: member.userId,
    platform: "ios",
    token: `ExponentPushToken[${randomUUID()}]`,
  });
  const email = `${randomUUID()}@example.test`;
  await db
    .update(schema.users)
    .set({ email, emailVerifiedAt: api.now(), locale })
    .where(eq(schema.users.id, member.userId));
  return email;
}

/** Three passengers with confirmed bookings on Anna's trip, and a word from the first. */
async function busyTrip() {
  const anna = await driverOf(sampleTrip.north, "Anna");
  const passengers = [];
  for (const name of ["Gunna", "Siggi", "Palli"]) {
    const member = await newMember(name);
    const request = await booked(member.accessToken, sampleTrip.north, { fromStop: 0, toStop: 3 });
    const accepted = await api.client.call(acceptRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: {},
    });
    if (!accepted.ok) throw new Error(accepted.error.code);
    if (accepted.data.status === "accepted") await paid(member.accessToken, request.id);
    passengers.push({ member, bookingId: request.id });
  }
  const [gunna] = passengers;
  if (gunna === undefined) throw new Error("No passengers.");
  const sent = await api.client.call(sendMessageRoute, {
    accessToken: gunna.member.accessToken,
    params: { id: gunna.bookingId },
    body: { clientId: randomUUID(), text: "I'll wait by the door" },
  });
  if (!sent.ok) throw new Error(sent.error.code);
  return { anna, passengers: passengers.map((passenger) => passenger.member) };
}

describe("download my data (spec 11, 3.2)", () => {
  it("is refused without a fresh code, and nothing is asked for", async () => {
    const gunna = await newMember("Gunna");
    expect(await ask(gunna, "123456")).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "code_expired" },
    });
    const code = await freshCode(gunna);
    const wrong = code === "000000" ? "111111" : "000000";
    expect(await ask(gunna, wrong)).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "code_invalid" },
    });
    expect(await statusOf(gunna)).toMatchObject({ ok: true, data: { state: "none" } });
  });

  it("builds the file after it is asked for, with exactly the expected sections", async () => {
    const gunna = await newMember("Gunna");
    const asked = await ask(gunna, await freshCode(gunna));
    expect(asked).toMatchObject({ ok: true, status: 202, data: { state: "preparing" } });
    expect(await linkFor(gunna)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "export_not_ready" },
    });

    expect(await builder.buildDue()).toBe(1);
    const ready = await statusOf(gunna);
    if (!ready.ok || ready.data.state !== "ready") throw new Error("Not ready.");
    expect(new Date(ready.data.expiresAt).getTime() - new Date(ready.data.readyAt).getTime()).toBe(
      7 * 24 * 3600 * 1000,
    );
    expect(ready.data.byteSize).toBeGreaterThan(0);

    const link = await linkFor(gunna);
    if (!link.ok) throw new Error(link.error.code);
    const response = await api.request(link.data.path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="shareride-data-\d{4}-\d{2}-\d{2}\.zip"$/,
    );
    const names = readZip(Buffer.from(await response.arrayBuffer())).map((entry) => entry.name);
    expect(names).toEqual(["shareride-data.json", "shareride-data.html"]);

    const { data, html } = await exportOf(await newMember("Siggi"));
    expect(data).toMatchObject({ format: "shareride-export", version: 1, locale: "en" });
    expect(Object.keys(data.sections)).toEqual([...exportSections]);
    expect(data.sections.account).toMatchObject({ firstName: "Siggi", deleteAfter: null });
    expect(html).toContain("<h1>Your ShareRide data</h1>");
    expect(html).not.toMatch(/<script|https?:\/\//i);
  });

  it("allows one a day, refused before the code is used", async () => {
    const gunna = await newMember("Gunna");
    await ask(gunna, await freshCode(gunna));
    const code = await freshCode(gunna);
    const again = await ask(gunna, code);
    expect(again).toMatchObject({ ok: false, status: 429, error: { code: "export_too_soon" } });
    if (again.ok) return;
    expect(again.error.retryAfterSeconds).toBe(24 * 3600 - 31);

    await later(hours(24), gunna);
    expect(await ask(gunna, await freshCode(gunna))).toMatchObject({ ok: true, status: 202 });
  });

  it("shows the other people of a busy trip by first name only (R11.2)", async () => {
    const { anna, passengers } = await busyTrip();
    const [gunna, siggi, palli] = passengers;
    if (gunna === undefined || siggi === undefined || palli === undefined) throw new Error();
    const strangers = async (...members: Member[]) =>
      (
        await Promise.all(members.map(async (member) => [member.userId, await phoneOf(member)]))
      ).flat();

    const mine = await exportOf(gunna);
    expect(mine.text).toContain('"firstName": "Anna"');
    const [booking] = mine.data.sections.bookings as {
      status: string;
      prices: { from: string; to: string; price: number }[];
    }[];
    expect(booking?.status).toBe("confirmed");
    expect(booking?.prices.length).toBe(3);
    expect(booking?.prices[0]).toMatchObject({ from: "BSÍ bus terminal", price: 1100 });
    expect(mine.text).toContain("I'll wait by the door");
    for (const secret of await strangers(anna, siggi, palli))
      expect(mine.text).not.toContain(secret);
    expect(mine.text).not.toMatch(/Siggi|Palli/);
    expect(mine.text).toContain(await phoneOf(gunna));

    const driver = await exportOf(anna);
    const [trip] = driver.data.sections.trips_posted as { passengers: { firstName: string }[] }[];
    expect(trip?.passengers.map((passenger) => passenger.firstName)).toEqual([
      "Gunna",
      "Siggi",
      "Palli",
    ]);
    for (const secret of await strangers(gunna, siggi, palli)) {
      expect(driver.text).not.toContain(secret);
    }
    expect(driver.text).toContain('"from": "Gunna"');
  });

  it("lists the people I blocked by first name and date, never who blocked me", async () => {
    const anna = await driverOf(sampleTrip.north, "Anna");
    const gunna = await newMember("Gunna");
    const request = await booked(gunna.accessToken, sampleTrip.north, { fromStop: 0, toStop: 3 });
    const at = api.now().toISOString();
    const blocked = await api.client.call(blockFromBookingRoute, {
      accessToken: gunna.accessToken,
      params: { id: request.id },
      body: {},
    });
    if (!blocked.ok) throw new Error(blocked.error.code);

    const mine = await exportOf(gunna);
    expect(mine.data.sections.blocks).toEqual([{ firstName: "Anna", since: at }]);
    expect(mine.text).not.toContain(anna.userId);
    expect(unlabelledFields(mine.data)).toEqual([]);
    expect(mine.html).toContain("<h2>People you blocked</h2>");
    expect((await exportOf(anna)).data.sections.blocks).toEqual([]);
  });

  it("has the person's own times at the meeting point, with the booking or the stop", async () => {
    const anna = await driverOf(sampleTrip.north, "Anna");
    const gunna = await newMember("Gunna");
    const request = await booked(gunna.accessToken, sampleTrip.north, { fromStop: 0, toStop: 3 });
    const accepted = await api.client.call(acceptRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: {},
    });
    if (!accepted.ok) throw new Error(accepted.error.code);
    if (accepted.data.status === "accepted") await paid(gunna.accessToken, request.id);
    const [bsi] = await api.connection.db
      .select({ id: schema.tripStops.id, plannedAt: schema.tripStops.plannedAt })
      .from(schema.tripStops)
      .where(eq(schema.tripStops.tripId, sampleTrip.north))
      .orderBy(asc(schema.tripStops.position));
    if (bsi?.plannedAt === null || bsi === undefined) throw new Error("No first stop.");

    // Ten minutes before Anna leaves BSÍ, Gunna, then a minute later Anna.
    const tenBefore = (bsi.plannedAt.getTime() - api.now().getTime()) / 1000 - 10 * 60;
    await later(Math.round(tenBefore), anna, gunna);
    const passengerAt = api.now().toISOString();
    const hers = await api.client.call(passengerCheckInRoute, {
      accessToken: gunna.accessToken,
      params: { id: request.id },
      body: {},
    });
    expect(hers).toMatchObject({ ok: true, data: { checkedInAt: passengerAt } });
    await later(60, anna, gunna);
    const driverAt = api.now().toISOString();
    const his = await api.client.call(driverCheckInRoute, {
      accessToken: anna.accessToken,
      params: { id: sampleTrip.north, stopId: bsi.id },
      body: {},
    });
    expect(his).toMatchObject({ ok: true, data: { checkedInAt: driverAt } });

    const mine = await exportOf(gunna);
    const [booking] = mine.data.sections.bookings as { checkedInAt: string | null }[];
    // Anna's own shows here only as a line of their chat.
    expect(booking?.checkedInAt).toBe(passengerAt);

    const driver = await exportOf(anna);
    const [trip] = driver.data.sections.trips_posted as {
      stops: { checkedInAt: string | null }[];
    }[];
    expect(trip?.stops.map((stop) => stop.checkedInAt)).toEqual([driverAt, null, null, null]);
    expect(unlabelledFields(driver.data)).toEqual([]);
  });

  it("has reports about a ride with the person's own note only (spec 8, 7)", async () => {
    const { anna, passengers } = await busyTrip();
    const [gunna, siggi] = passengers;
    if (gunna === undefined || siggi === undefined) throw new Error("No passengers.");
    const bookingOf = async (member: Member) => {
      const [booking] = await api.connection.db
        .select({ id: schema.bookings.id })
        .from(schema.bookings)
        .where(eq(schema.bookings.passengerId, member.userId));
      if (booking === undefined) throw new Error("No booking.");
      return booking.id;
    };
    const raisedAt = api.now();
    const answeredAt = new Date(raisedAt.getTime() + hours(1) * 1000);
    const decidedAt = new Date(raisedAt.getTime() + hours(2) * 1000);
    // Anna marked Gunna a no-show, Gunna contested it and ShareRide decided;
    // Siggi says Anna didn't come, and Anna's contest waits for ShareRide.
    await api.connection.db.insert(schema.disputes).values([
      {
        bookingId: await bookingOf(gunna),
        kind: "no_show",
        raisedAt,
        note: "Waited ten minutes at the stop",
        answer: "contested",
        answeredAt,
        answerNote: "I stood at the main entrance",
        outcome: "rode",
        decidedBy: "operator",
        decidedAt,
        decisionNote: "The check-in times agree",
      },
      {
        bookingId: await bookingOf(siggi),
        kind: "driver_absent",
        raisedAt,
        note: "Nobody came by quarter past",
        answer: "contested",
        answeredAt,
        answerNote: "I was parked by the bus bay",
      },
    ]);
    const noShow = {
      kind: "no_show",
      reportedBy: "driver",
      reportedAt: raisedAt.toISOString(),
      answer: "contested",
      answeredAt: answeredAt.toISOString(),
      outcome: "rode",
      decidedBy: "operator",
      closedAt: decidedAt.toISOString(),
    };
    const driverAbsent = {
      kind: "driver_absent",
      reportedBy: "passenger",
      reportedAt: raisedAt.toISOString(),
      answer: "contested",
      answeredAt: answeredAt.toISOString(),
      outcome: null,
      decidedBy: null,
      closedAt: null,
    };
    const notes = [
      "Waited ten minutes",
      "main entrance",
      "check-in times",
      "Nobody came",
      "bus bay",
    ] as const;
    const mentioned = (text: string) => notes.filter((note) => text.includes(note));

    // Gunna answered hers, Siggi reported his.
    const gunnas = await exportOf(gunna);
    const [answered] = gunnas.data.sections.bookings as { dispute: unknown }[];
    expect(answered?.dispute).toEqual({ ...noShow, yourNote: "I stood at the main entrance" });
    expect(mentioned(gunnas.text)).toEqual(["main entrance"]);
    expect(unlabelledFields(gunnas.data)).toEqual([]);
    expect(gunnas.html).toContain("<dt>Answer</dt><dd>That&#39;s not right</dd>");

    const siggis = await exportOf(siggi);
    const [reported] = siggis.data.sections.bookings as { dispute: unknown }[];
    expect(reported?.dispute).toEqual({ ...driverAbsent, yourNote: "Nobody came by quarter past" });
    expect(mentioned(siggis.text)).toEqual(["Nobody came"]);

    // Anna reported one and answered the other: her own notes, each with
    // that passenger only.
    const annas = await exportOf(anna);
    const [trip] = annas.data.sections.trips_posted as { passengers: { dispute: unknown }[] }[];
    expect(trip?.passengers.map((passenger) => passenger.dispute)).toEqual([
      { ...noShow, yourNote: "Waited ten minutes at the stop" },
      { ...driverAbsent, yourNote: "I was parked by the bus bay" },
      null,
    ]);
    expect(mentioned(annas.text)).toEqual(["Waited ten minutes", "bus bay"]);
    expect(unlabelledFields(annas.data)).toEqual([]);
  });

  it("has whether a cancellation counts, and when ShareRide made it, with whoever cancelled (spec 8, 6)", async () => {
    const { anna, passengers } = await busyTrip();
    const [gunna, siggi] = passengers;
    if (gunna === undefined || siggi === undefined) throw new Error("No passengers.");
    const cancelledAt = api.now();
    const overruledAt = new Date(cancelledAt.getTime() + hours(1) * 1000);
    const cancel = (member: Member, cancelledBy: "driver" | "passenger") =>
      api.connection.db
        .update(schema.bookings)
        .set({
          status: "cancelled",
          cancelledAt,
          cancelledBy,
          cancelReason: "weather",
          countsOnReliability: true,
          overruledAt,
          overruleNote: "The road was open all day",
        })
        .where(eq(schema.bookings.passengerId, member.userId));
    // Anna cancelled Gunna's booking and Siggi his own, both for the
    // weather; ShareRide made each count on whoever cancelled.
    await cancel(gunna, "driver");
    await cancel(siggi, "passenger");
    const counted = { countsOnReliability: true, overruledAt: overruledAt.toISOString() };
    const notCounted = (entry: Record<string, unknown> | undefined) => {
      expect(entry).toBeDefined();
      expect(entry).not.toHaveProperty("countsOnReliability");
      expect(entry).not.toHaveProperty("overruledAt");
    };

    const gunnas = await exportOf(gunna);
    const [hers] = gunnas.data.sections.bookings as Record<string, unknown>[];
    notCounted(hers);

    const siggis = await exportOf(siggi);
    const [his] = siggis.data.sections.bookings as Record<string, unknown>[];
    expect(his).toMatchObject(counted);

    const annas = await exportOf(anna);
    const [trip] = annas.data.sections.trips_posted as { passengers: Record<string, unknown>[] }[];
    const [forGunna, forSiggi] = trip?.passengers ?? [];
    expect(forGunna).toMatchObject(counted);
    notCounted(forSiggi);
    expect(unlabelledFields(annas.data)).toEqual([]);
    // The operator's note is theirs only.
    for (const { text } of [gunnas, siggis, annas]) expect(text).not.toContain("road was open");
  });

  it("has the reviews the person wrote, and those about them once shown (spec 8, R8.9)", async () => {
    const { anna, passengers } = await busyTrip();
    const [gunna, siggi] = passengers;
    if (gunna === undefined || siggi === undefined) throw new Error("No passengers.");
    const bookingOf = async (member: Member) => {
      const [booking] = await api.connection.db
        .select({ id: schema.bookings.id })
        .from(schema.bookings)
        .where(eq(schema.bookings.passengerId, member.userId));
      if (booking === undefined) throw new Error("No booking.");
      return booking.id;
    };
    const sentAt = api.now();
    const shownAt = new Date(sentAt.getTime() + hours(1) * 1000);
    const hiddenAt = new Date(sentAt.getTime() + hours(2) * 1000);
    // Gunna and Anna reviewed each other, so both show; the operator then
    // hid Anna's. Siggi reviewed Anna, who hasn't yet: it shows to nobody.
    await api.connection.db.insert(schema.reviews).values([
      {
        bookingId: await bookingOf(gunna),
        authorId: gunna.userId,
        subjectId: anna.userId,
        authorRole: "passenger",
        rating: 5,
        comment: "Smooth ride",
        revealedAt: shownAt,
        createdAt: sentAt,
      },
      {
        bookingId: await bookingOf(gunna),
        authorId: anna.userId,
        subjectId: gunna.userId,
        authorRole: "driver",
        rating: 4,
        comment: "On time",
        revealedAt: shownAt,
        hiddenAt,
        createdAt: sentAt,
      },
      {
        bookingId: await bookingOf(siggi),
        authorId: siggi.userId,
        subjectId: anna.userId,
        authorRole: "passenger",
        rating: 2,
        comment: "Late pickup",
        createdAt: sentAt,
      },
    ]);
    const review = (
      rating: number,
      comment: string,
      shown: Date | null,
      hidden: Date | null = null,
    ) => ({
      rating,
      comment,
      sentAt: sentAt.toISOString(),
      shownAt: shown?.toISOString() ?? null,
      hiddenAt: hidden?.toISOString() ?? null,
    });
    const comments = ["Smooth ride", "On time", "Late pickup"] as const;
    const mentioned = (text: string) => comments.filter((comment) => text.includes(comment));

    const gunnas = await exportOf(gunna);
    const [gunnasBooking] = gunnas.data.sections.bookings as {
      yourReview: unknown;
      theirReview: unknown;
    }[];
    expect(gunnasBooking?.yourReview).toEqual(review(5, "Smooth ride", shownAt));
    expect(gunnasBooking?.theirReview).toEqual(review(4, "On time", shownAt, hiddenAt));
    expect(unlabelledFields(gunnas.data)).toEqual([]);

    // Siggi's own, waiting to show; nothing about him yet.
    const siggis = await exportOf(siggi);
    const [siggisBooking] = siggis.data.sections.bookings as {
      yourReview: unknown;
      theirReview: unknown;
    }[];
    expect(siggisBooking?.yourReview).toEqual(review(2, "Late pickup", null));
    expect(siggisBooking?.theirReview).toBeNull();

    // Anna sees Gunna's review of her, and her own of Gunna; Siggi's waits.
    const annas = await exportOf(anna);
    const [trip] = annas.data.sections.trips_posted as {
      passengers: { yourReview: unknown; theirReview: unknown }[];
    }[];
    expect(
      trip?.passengers.map(({ yourReview, theirReview }) => ({ yourReview, theirReview })),
    ).toEqual([
      {
        yourReview: review(4, "On time", shownAt, hiddenAt),
        theirReview: review(5, "Smooth ride", shownAt),
      },
      { yourReview: null, theirReview: null },
      { yourReview: null, theirReview: null },
    ]);
    expect(mentioned(annas.text)).toEqual(["Smooth ride", "On time"]);
    expect(unlabelledFields(annas.data)).toEqual([]);
  });

  it("labels every field of the readable page in both languages", async () => {
    const { passengers, anna } = await busyTrip();
    for (const member of [anna, ...passengers]) {
      expect(unlabelledFields((await exportOf(member)).data)).toEqual([]);
    }
    await api.connection.db
      .update(schema.users)
      .set({ locale: "is" })
      .where(eq(schema.users.id, anna.userId));
    await later(hours(24), anna);
    const icelandic = await exportOf(anna);
    expect(icelandic.html).toContain('<html lang="is">');
    expect(icelandic.html).toContain("<h1>ShareRide gögnin þín</h1>");
    expect(icelandic.html).toContain("<dt>Staða</dt><dd>Staðfest</dd>");
    expect(icelandic.html).not.toMatch(/<dd>(confirmed|published|approval)<\/dd>/);
  });

  it("tells the person by push and email when it is ready, without a link", async () => {
    const gunna = await newMember("Gunna");
    const address = await reachable(gunna, "is");
    const { worker, push, email } = noticeWorker();

    await ask(gunna, await freshCode(gunna));
    await worker.runOnce();
    expect(push.sent).toEqual([]);
    await builder.buildDue();
    await worker.runOnce();

    expect(push.sent).toHaveLength(1);
    const [pushed] = push.sent;
    expect(pushed).toMatchObject({
      title: "Gögnin þín eru tilbúin til niðurhals",
      data: { path: "/settings/privacy/download" },
    });
    expect(pushed?.body).toMatch(/^Sæktu skrána í ShareRide fyrir .+\. Eftir það er henni eytt\.$/);
    expect(email.sent).toHaveLength(1);
    const [mail] = email.sent;
    expect(mail?.to).toBe(address);
    expect(mail?.subject).toBe("Gögnin þín eru tilbúin til niðurhals");
    // The email opens the app's download screen; the file's link is never in it.
    expect(`${mail?.text ?? ""}${mail?.html ?? ""}`).not.toContain("/v1/exports/");
  });

  it("does not tell the person once the file can no longer be downloaded", async () => {
    const gunna = await newMember("Gunna");
    await reachable(gunna, "en");
    const { worker, push, email } = noticeWorker();
    await ask(gunna, await freshCode(gunna));
    await builder.buildDue();
    // Sending was held up until the file had expired.
    await later(hours(7 * 24) + 1, gunna);
    await worker.runOnce();

    expect(push.sent).toEqual([]);
    expect(email.sent).toEqual([]);
    const deliveries = await api.connection.db
      .select({
        status: schema.notificationDeliveries.status,
        reason: schema.notificationDeliveries.reason,
      })
      .from(schema.notificationDeliveries)
      .innerJoin(
        schema.notifications,
        eq(schema.notifications.id, schema.notificationDeliveries.notificationId),
      )
      .where(eq(schema.notifications.recipientId, gunna.userId));
    expect(deliveries.length).toBeGreaterThan(0);
    for (const delivery of deliveries) {
      expect(delivery).toEqual({ status: "skipped", reason: "no_longer_applies" });
    }
  });

  it("gives a link that works once, for 2 minutes", async () => {
    const gunna = await newMember("Gunna");
    await ask(gunna, await freshCode(gunna));
    await builder.buildDue();

    const first = await linkFor(gunna);
    if (!first.ok) throw new Error(first.error.code);
    // A preview or link checker asks with HEAD first; that leaves the link to use.
    const head = await api.request(first.data.path, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(Number(head.headers.get("content-length"))).toBeGreaterThan(0);
    expect((await api.request(first.data.path)).status).toBe(200);
    const used = await api.request(first.data.path);
    expect(used.status).toBe(404);
    expect(used.headers.get("cache-control")).toBe("no-store");
    expect((await api.request(first.data.path, { method: "HEAD" })).status).toBe(404);

    const second = await linkFor(gunna);
    if (!second.ok) throw new Error(second.error.code);
    expect(second.data.path).not.toBe(first.data.path);
    await later(121, gunna);
    expect((await api.request(second.data.path)).status).toBe(404);
    expect((await api.request("/v1/exports/sr_dx_unknown")).status).toBe(404);
  });

  it("deletes the earlier file when another is asked for", async () => {
    const gunna = await newMember("Gunna");
    await ask(gunna, await freshCode(gunna));
    await builder.buildDue();
    await later(hours(24), gunna);
    expect(await ask(gunna, await freshCode(gunna))).toMatchObject({ ok: true, status: 202 });
    const rows = await api.connection.db
      .select({ file: schema.dataExports.file, readyAt: schema.dataExports.readyAt })
      .from(schema.dataExports)
      .where(eq(schema.dataExports.userId, gunna.userId))
      .orderBy(schema.dataExports.askedAt);
    // The earlier one was made, and its file is gone; the new one waits.
    expect(rows.map((row) => row.file)).toEqual([null, null]);
    expect(rows.map((row) => row.readyAt !== null)).toEqual([true, false]);
  });

  it("marks a file that cannot be opened as failed, and the person may ask again", async () => {
    const gunna = await newMember("Gunna");
    await ask(gunna, await freshCode(gunna));
    await builder.buildDue();
    // As if the secret had changed since the file was made.
    await api.connection.db
      .update(schema.dataExports)
      .set({ file: Buffer.from("not a sealed file") })
      .where(eq(schema.dataExports.userId, gunna.userId));
    const link = await linkFor(gunna);
    if (!link.ok) throw new Error(link.error.code);

    expect((await api.request(link.data.path)).status).toBe(404);
    expect(await statusOf(gunna)).toMatchObject({
      ok: true,
      data: { state: "failed", nextAllowedAt: null },
    });
    expect(await ask(gunna, await freshCode(gunna))).toMatchObject({ ok: true, status: 202 });
  });

  it("expires after 7 days; the clean-up deletes the file, then the record", async () => {
    const gunna = await newMember("Gunna");
    await ask(gunna, await freshCode(gunna));
    await builder.buildDue();
    const link = await linkFor(gunna);
    if (!link.ok) throw new Error(link.error.code);

    await later(hours(7 * 24) + 1, gunna);
    expect(await statusOf(gunna)).toMatchObject({
      ok: true,
      data: { state: "expired", byteSize: null, nextAllowedAt: null },
    });
    expect((await api.request(link.data.path)).status).toBe(404);
    expect(await linkFor(gunna)).toMatchObject({ ok: false, status: 409 });

    expect(await cleanUpExports(api.connection.db, api.now())).toEqual({
      exportFiles: 1,
      exportRecords: 0,
    });
    const [kept] = await api.connection.db
      .select({ file: schema.dataExports.file })
      .from(schema.dataExports)
      .where(eq(schema.dataExports.userId, gunna.userId));
    expect(kept).toEqual({ file: null });

    // The dates are kept 30 days from expiry, not from asking.
    await later(hours(24 * 24), gunna);
    expect(await cleanUpExports(api.connection.db, api.now())).toEqual({
      exportFiles: 0,
      exportRecords: 0,
    });
    await later(hours(6 * 24), gunna);
    expect(await cleanUpExports(api.connection.db, api.now())).toEqual({
      exportFiles: 0,
      exportRecords: 1,
    });
    expect(await statusOf(gunna)).toMatchObject({ ok: true, data: { state: "none" } });
  });

  it("gives up after 3 tries, and the person may ask again at once", async () => {
    const gunna = await newMember("Gunna");
    await ask(gunna, await freshCode(gunna));
    // As if three runs had taken it and stopped, the last over 5 minutes ago.
    await api.connection.db
      .update(schema.dataExports)
      .set({ attempts: exportBuildAttempts, updatedAt: new Date(api.now().getTime() - 6 * 60_000) })
      .where(eq(schema.dataExports.userId, gunna.userId));

    expect(await builder.buildDue()).toBe(0);
    expect(await statusOf(gunna)).toMatchObject({
      ok: true,
      data: { state: "failed", nextAllowedAt: null },
    });
    expect(await ask(gunna, await freshCode(gunna))).toMatchObject({ ok: true, status: 202 });
  });

  it("does not take an export another run is building", async () => {
    const gunna = await newMember("Gunna");
    await ask(gunna, await freshCode(gunna));
    await api.connection.db
      .update(schema.dataExports)
      .set({ attempts: 1, updatedAt: api.now() })
      .where(eq(schema.dataExports.userId, gunna.userId));
    expect(await builder.buildDue()).toBe(0);
    await later(5 * 60 + 1, gunna);
    expect(await builder.buildDue()).toBe(1);
  });

  it("keeps the file of the first try to finish, even one slower than its lease", async () => {
    const gunna = await newMember("Gunna");
    await ask(gunna, await freshCode(gunna));
    const slow = heldBuilder();
    const slowRun = slow.run();
    await slow.reached;
    // The lease ends and another run takes the same export.
    await later(exportBuildLeaseMinutes * 60 + 1, gunna);
    const next = heldBuilder();
    const nextRun = next.run();
    await next.reached;

    slow.release();
    expect(await slowRun).toBe(1);
    next.release();
    expect(await nextRun).toBe(0);

    expect(await statusOf(gunna)).toMatchObject({ ok: true, data: { state: "ready" } });
    const told = await api.connection.db
      .select({ kind: schema.outboxEvents.kind })
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.kind, "DataExportReady"));
    expect(told).toHaveLength(1);
  });

  it("is deleted with the account", async () => {
    const gunna = await newMember("Gunna");
    await ask(gunna, await freshCode(gunna));
    await api.connection.db.delete(schema.users).where(inArray(schema.users.id, [gunna.userId]));
    expect(await api.connection.db.select().from(schema.dataExports)).toEqual([]);
  });
});
