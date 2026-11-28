import { randomUUID } from "node:crypto";
import {
  acceptRequestRoute,
  askDataExportRoute,
  blockFromBookingRoute,
  dataExportLinkRoute,
  driverCheckInRoute,
  fileReportRoute,
  getDataExportRoute,
  passengerCheckInRoute,
  sendConfirmCodeRoute,
  sendMessageRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { defaultTripDaySettings, exportSections } from "@shareride/domain";
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
import { moveTripsOn } from "../trips/completion.ts";
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
    photos: api.photos,
  });
});

beforeEach(async () => {
  await freshSampleTrips(api);
  await api.connection.db.delete(schema.dataExports);
  await api.connection.db.delete(schema.outboxEvents);
  await api.connection.db.delete(schema.blocks);
  await api.connection.db.delete(schema.reports);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

/** Sends a confirm code to the member and gives it back. */
async function freshCode(member: Member): Promise<string> {
  // The sign-in code went a moment ago; one code per 30 seconds (R1.3).
  await later(31, member);
  const sent = await api.client.call(sendConfirmCodeRoute, {
    accessToken: member.accessToken,
    body: {},
  });
  if (!sent.ok) throw new Error(sent.error.code);
  // By email to a verified email, else by text (spec 26, 3.6).
  if (sent.data.channel === "email") return api.lastEmailCode(await emailOf(member));
  return api.lastCode(await phoneOf(member));
}

async function emailOf(member: Member): Promise<string> {
  const [user] = await api.connection.db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, member.userId));
  if (user === undefined || user.email === null) throw new Error("The member has no email.");
  return user.email;
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
  const json = entries.find((entry) => entry.name === "puffinride-data.json");
  const html = entries.find((entry) => entry.name === "puffinride-data.html");
  if (json === undefined || html === undefined) throw new Error("A file is missing.");
  return {
    text: json.data.toString("utf8"),
    data: JSON.parse(json.data.toString("utf8")) as ExportData,
    html: html.data.toString("utf8"),
    entries,
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
      /^attachment; filename="puffinride-data-\d{4}-\d{2}-\d{2}\.zip"$/,
    );
    const names = readZip(Buffer.from(await response.arrayBuffer())).map((entry) => entry.name);
    expect(names).toEqual(["puffinride-data.json", "puffinride-data.html"]);

    const { data, html } = await exportOf(await newMember("Siggi"));
    expect(data).toMatchObject({ format: "shareride-export", version: 1, locale: "en" });
    expect(Object.keys(data.sections)).toEqual([...exportSections]);
    expect(data.sections.account).toMatchObject({ firstName: "Siggi", deleteAfter: null });
    expect(html).toContain("<h1>Your PuffinRide data</h1>");
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

  it("lists the Google and Apple accounts linked to mine (spec 19, 7)", async () => {
    const ari = await newMember("Ari");
    const linkedAt = new Date("2026-11-10T09:00:00.000Z");
    await api.connection.db.insert(schema.identities).values({
      userId: ari.userId,
      provider: "google",
      subject: "export-subject",
      email: "ari-export@example.com",
      linkedAt,
      lastUsedAt: linkedAt,
    });
    const { data, text } = await exportOf(ari);
    expect(data.sections.sign_in_methods).toEqual([
      {
        method: "Google",
        email: "ari-export@example.com",
        linkedAt: linkedAt.toISOString(),
        lastUsedAt: linkedAt.toISOString(),
      },
    ]);
    // The provider's own identifier for the person stays out (R19.5).
    expect(text).not.toContain("export-subject");
  });

  it("says when a password was set, never the password or its hash (spec 27, R27.3)", async () => {
    const bara = await newMember("Bára");
    const setAt = new Date("2026-11-20T09:00:00.000Z");
    await api.connection.db.insert(schema.memberPasswords).values({
      userId: bara.userId,
      hash: "scrypt$15$8$3$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g",
      setAt,
      createdAt: setAt,
      // A new hash at sign-in later on leaves the date it was chosen.
      updatedAt: new Date("2026-11-22T09:00:00.000Z"),
    });
    const { data, text } = await exportOf(bara);
    expect(data.sections.sign_in_methods).toEqual([
      { method: "Password", email: null, linkedAt: setAt.toISOString(), lastUsedAt: null },
    ]);
    expect(text).not.toContain("scrypt$");
  });

  it("lists each device with Face ID or fingerprint, never its key or handle (spec 27, 3.6)", async () => {
    const dora = await newMember("Dóra");
    const createdAt = new Date("2026-11-21T10:00:00.000Z");
    const usedAt = new Date("2026-11-22T08:30:00.000Z");
    await api.connection.db.insert(schema.memberPasskeys).values([
      {
        userId: dora.userId,
        credentialId: "export-credential-one",
        publicKey: "export-public-key",
        counter: 3,
        transports: ["internal"],
        backedUp: true,
        userHandle: "export-user-handle",
        browser: "Safari",
        system: "iPhone",
        lastUsedAt: usedAt,
        createdAt,
        updatedAt: usedAt,
      },
      {
        userId: dora.userId,
        credentialId: "export-credential-two",
        publicKey: "export-public-key-two",
        counter: 0,
        transports: [],
        backedUp: false,
        userHandle: "export-user-handle",
        browser: null,
        system: null,
        createdAt: usedAt,
        updatedAt: usedAt,
      },
    ]);
    const { data, text } = await exportOf(dora);
    expect(data.sections.sign_in_methods).toEqual([
      {
        method: "Face ID or fingerprint: Safari on iPhone",
        email: null,
        linkedAt: createdAt.toISOString(),
        lastUsedAt: usedAt.toISOString(),
      },
      {
        method: "Face ID or fingerprint",
        email: null,
        linkedAt: usedAt.toISOString(),
        lastUsedAt: null,
      },
    ]);
    for (const secret of ["export-credential", "export-public-key", "export-user-handle"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("lists the reports I sent and their outcome, never a report about me (R9.2)", async () => {
    const anna = await driverOf(sampleTrip.north, "Anna");
    const gunna = await newMember("Gunna");
    const at = api.now().toISOString();
    const filed = await api.client.call(fileReportRoute, {
      accessToken: gunna.accessToken,
      body: {
        about: { kind: "trip", tripId: sampleTrip.north },
        category: "not_as_listed",
        description: "The car was not the one listed.",
      },
    });
    if (!filed.ok) throw new Error(filed.error.code);

    const mine = await exportOf(gunna);
    expect(mine.data.sections.reports).toEqual([
      {
        subject: "trip",
        person: "Anna",
        category: "not_as_listed",
        description: "The car was not the one listed.",
        sentAt: at,
        status: "open",
        outcome: null,
        closedAt: null,
      },
    ]);
    expect(unlabelledFields(mine.data)).toEqual([]);
    expect(mine.html).toContain("<h2>Reports you sent</h2>");
    expect(mine.html).toContain("<dd>The ride wasn&#39;t as listed</dd>");
    expect(mine.text).not.toContain(anna.userId);

    const theirs = await exportOf(anna);
    expect(theirs.data.sections.reports).toEqual([]);
    expect(theirs.text).not.toContain("The car was not the one listed.");
    expect(theirs.text).not.toContain("Gunna");
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
    // Anna marked Gunna a no-show, Gunna contested it and PuffinRide decided;
    // Siggi says Anna didn't come, and Anna's contest waits for PuffinRide.
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

  it("has whether a cancellation counts, and when PuffinRide made it, with whoever cancelled (spec 8, 6)", async () => {
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
    // weather; PuffinRide made each count on whoever cancelled.
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

  it("has the reviews about the person from trips over 3 years ago, by nobody (A51)", async () => {
    const gunna = await newMember("Gunna");
    const sentAt = api.now();
    const shownAt = new Date(sentAt.getTime() + hours(1) * 1000);
    // As the 3-year clean-up leaves them: by the former member, on no ride.
    // The last one about her never showed.
    await api.connection.db.insert(schema.reviews).values([
      {
        bookingId: null,
        authorId: schema.formerMemberId,
        subjectId: gunna.userId,
        authorRole: "driver",
        rating: 4,
        comment: "On time",
        revealedAt: shownAt,
        createdAt: sentAt,
      },
      {
        bookingId: null,
        authorId: schema.formerMemberId,
        subjectId: gunna.userId,
        authorRole: "passenger",
        rating: 3,
        comment: "Quiet company",
        revealedAt: shownAt,
        hiddenAt: shownAt,
        createdAt: sentAt,
      },
      {
        bookingId: null,
        authorId: schema.formerMemberId,
        subjectId: gunna.userId,
        authorRole: "driver",
        rating: 1,
        comment: "Never shown",
        createdAt: sentAt,
      },
    ]);

    const { data, text } = await exportOf(gunna);
    expect(data.sections.earlier_reviews).toEqual([
      {
        authorRole: "driver",
        rating: 4,
        comment: "On time",
        sentAt: sentAt.toISOString(),
        shownAt: shownAt.toISOString(),
        hiddenAt: null,
      },
      {
        authorRole: "passenger",
        rating: 3,
        comment: "Quiet company",
        sentAt: sentAt.toISOString(),
        shownAt: shownAt.toISOString(),
        hiddenAt: shownAt.toISOString(),
      },
    ]);
    expect(text).not.toContain("Never shown");
    expect(unlabelledFields(data)).toEqual([]);
  });

  it("has the feedback I sent with our reply, and its screenshot as a file (spec 12, section 7)", async () => {
    const gunna = await newMember("Gunna");
    const jon = await newMember("Jón");
    const { db } = api.connection;
    const sentAt = api.now();
    const details = {
      appVersion: "1.4.0",
      platform: "ios",
      osVersion: "19.1",
      screen: "/trips/[id]",
      language: "en",
    };
    const [mine, other] = await db
      .insert(schema.feedback)
      .values([
        {
          userId: gunna.userId,
          kind: "problem",
          message: "The map does not move.",
          ...details,
          status: "planned",
          reply: "Thanks, we are on it.",
          repliedAt: sentAt,
          createdAt: sentAt,
        },
        { userId: jon.userId, kind: "idea", message: "Jón's own idea", ...details },
      ])
      .returning({ id: schema.feedback.id });
    if (mine === undefined || other === undefined) throw new Error("No feedback.");
    const picture = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
    await db.insert(schema.feedbackScreenshots).values([
      { feedbackId: mine.id, file: picture, width: 390, height: 844 },
      {
        feedbackId: other.id,
        file: Buffer.from([0xff, 0xd8, 0x09, 0xff, 0xd9]),
        width: 1,
        height: 1,
      },
    ]);

    const { data, html, text, entries } = await exportOf(gunna);
    expect(data.sections.feedback).toEqual([
      {
        kind: "problem",
        message: "The map does not move.",
        appVersion: "1.4.0",
        platform: "ios",
        osVersion: "19.1",
        screen: "/trips/[id]",
        locale: "en",
        sentAt: sentAt.toISOString(),
        screenshot: `feedback/${mine.id}.jpg`,
        ourReply: "Thanks, we are on it.",
        repliedAt: sentAt.toISOString(),
      },
    ]);
    // The picture is a file of the ZIP; nobody else's is, and the operator's status is theirs.
    expect(entries.map((entry) => entry.name)).toEqual([
      "puffinride-data.json",
      "puffinride-data.html",
      `feedback/${mine.id}.jpg`,
    ]);
    expect(entries[2]?.data.equals(picture)).toBe(true);
    expect(text).not.toContain("Jón's own idea");
    expect(text).not.toContain("planned");
    expect(html).toContain("<h2>Feedback you sent</h2>");
    expect(html).toContain("Something isn&#39;t working");
    expect(unlabelledFields(data)).toEqual([]);
    await db.delete(schema.feedback);
  });

  it("has my profile photo as a file, and when PuffinRide hid it (ADR 0033)", async () => {
    const gunna = await newMember("Gunna");
    const { db } = api.connection;
    const key = "profile-photos/0193f0c4-7d4a-7b1e-9c2a-123456789abc.jpg";
    const picture = Uint8Array.from([0xff, 0xd8, 0x05, 0x06, 0xff, 0xd9]);
    api.photos.files.set(key, picture);
    const hiddenAt = api.now();
    await db
      .update(schema.users)
      .set({ photoKey: key, photoHiddenAt: hiddenAt })
      .where(eq(schema.users.id, gunna.userId));

    const { data, entries } = await exportOf(gunna);
    expect(data.sections.account).toMatchObject({
      photo: "profile/photo.jpg",
      photoHiddenAt: hiddenAt.toISOString(),
    });
    expect(entries.map((entry) => entry.name)).toEqual([
      "puffinride-data.json",
      "puffinride-data.html",
      "profile/photo.jpg",
    ]);
    expect(entries[2]?.data.equals(Buffer.from(picture))).toBe(true);
    expect(unlabelledFields(data)).toEqual([]);

    // Without a photo, nothing.
    const siggi = await exportOf(await newMember("Siggi"));
    expect(siggi.data.sections.account).toMatchObject({ photo: null, photoHiddenAt: null });
    api.photos.files.clear();
  });

  it("gives the CO2 each booking kept and the person's totals by role (spec 34, 3.11)", async () => {
    const { airport } = sampleTrip;
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const gunnas = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 2, seats: 2 });
    await paid(gunna.accessToken, gunnas.id);
    const [trip] = await api.connection.db
      .select({ arrivesAt: schema.trips.arrivesAt })
      .from(schema.trips)
      .where(eq(schema.trips.id, airport));
    const completesAt = (trip?.arrivesAt?.getTime() ?? 0) + 2 * 3_600_000;
    await later(Math.round((completesAt - api.now().getTime()) / 1000) + 1, jon, gunna);
    await moveTripsOn(api.connection.db, api.now(), defaultTripDaySettings);
    const [kept] = await api.connection.db
      .select({ grams: schema.bookings.co2Grams })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, gunnas.id));
    const grams = kept?.grams ?? null;
    expect(grams).toBeGreaterThan(1000);

    const passenger = await exportOf(gunna);
    expect(passenger.data.sections.bookings).toEqual([
      expect.objectContaining({ id: gunnas.id, status: "completed", co2Grams: grams }),
    ]);
    // Two seats are one car not driven.
    expect(passenger.data.sections.co2_saved).toEqual({
      asPassenger: { grams, rides: 1 },
      asDriver: { grams: 0, rides: 0, passengers: 0 },
      carried: null,
    });
    expect(passenger.html).toContain("<h2>CO2 saved</h2>");
    expect(unlabelledFields(passenger.data)).toEqual([]);

    const driver = await exportOf(jon);
    expect(driver.data.sections.co2_saved).toEqual({
      asPassenger: { grams: 0, rides: 0 },
      asDriver: { grams, rides: 1, passengers: 1 },
      carried: null,
    });
    expect(unlabelledFields(driver.data)).toEqual([]);
  });

  it("gives the CO2 carried over from trips made anonymous, within the totals (spec 34, 3.11)", async () => {
    const sigga = await newMember("Sigga");
    await api.connection.db.insert(schema.co2Carried).values({
      userId: sigga.userId,
      passengerGrams: 58_350,
      passengerRides: 1,
      driverGrams: 12_000,
      driverRides: 2,
      driverPassengers: 3,
    });
    try {
      const { data, html } = await exportOf(sigga);
      const carried = {
        asPassenger: { grams: 58_350, rides: 1 },
        asDriver: { grams: 12_000, rides: 2, passengers: 3 },
      };
      expect(data.sections.co2_saved).toEqual({ ...carried, carried });
      expect(html).toContain("Of these, from rides over 3 years ago");
      expect(unlabelledFields(data)).toEqual([]);
    } finally {
      await api.connection.db.delete(schema.co2Carried);
    }
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
    expect(icelandic.html).toContain("<h1>PuffinRide-gögnin þín</h1>");
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
    expect(pushed?.body).toMatch(
      /^Sæktu skrána í PuffinRide fyrir .+\. Eftir það er henni eytt\.$/,
    );
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
