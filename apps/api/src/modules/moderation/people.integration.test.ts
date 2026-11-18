import { randomUUID } from "node:crypto";
import {
  acceptRequestRoute,
  cancelTripRoute,
  declineRequestRoute,
  fileReportRoute,
  publicProfileRoute,
  type AdminDeclineRate,
  type AdminOperatorNote,
  type AdminTrip,
  type AdminTripListItem,
  type AdminUser,
  type AdminUserListItem,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId } from "@shareride/db/seed";
import { defaultTripDaySettings, icelandDate } from "@shareride/domain";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import { collectExport } from "../privacy/export-data.ts";
import { moveTripsOn } from "../trips/completion.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";

// The console's users, trips and bookings (spec 9, 3.5; milestone 9,
// PR 8). At the test clock (Friday 13 November 2026, noon), the sample
// trips leave the next days: Anna's from BSÍ to Akureyri asks the driver
// to accept each request; Jón's to Keflavík Airport is booked at once.

let api: TestApi;
const { airport, north, vik } = sampleTrip;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  const { db } = api.connection;
  await db.execute(sql`delete from operator_notes`);
  await db.execute(sql`delete from moderation_actions`);
  await db.execute(sql`delete from reports`);
  // The former member's reviews belong to no booking, so they outlive the trips.
  await db.execute(sql`delete from reviews`);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, book, paid } = bookingHelpers(() => api);
const hourMs = 3_600_000;

async function send(cookie: string, method: string, path: string, body?: unknown) {
  const response = await api.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

/** The console's search, with what to look for in the body, never the address. */
const find = (cookie: string, q: string) => send(cookie, "POST", "/admin/v1/users/search", { q });

const person = (member: Member, firstName: string | null) => ({
  userId: member.userId,
  firstName,
  status: "active",
  suspendedUntil: null,
  locale: "en",
});

async function phoneOf(member: Member) {
  const [row] = await api.connection.db
    .select({ phone: schema.users.phoneE164 })
    .from(schema.users)
    .where(eq(schema.users.id, member.userId));
  if (row === undefined || row.phone === null) throw new Error("No phone number.");
  return row.phone;
}

async function departureOf(tripId: string) {
  const [row] = await api.connection.db
    .select({ departsAt: schema.trips.departsAt })
    .from(schema.trips)
    .where(eq(schema.trips.id, tripId));
  if (row === undefined || row.departsAt === null) throw new Error("No departure.");
  return row.departsAt;
}

/** Anna drives to Akureyri; Gunna and Siggi each ask for a seat, and she answers. */
async function answeredRequests() {
  const anna = await driverOf(north, "Anna");
  const gunna = await newMember("Gunna");
  const siggi = await newMember("Siggi");
  const asked = await booked(gunna.accessToken, north, { fromStop: 0, toStop: 3 });
  const declined = await booked(siggi.accessToken, north, { fromStop: 1, toStop: 3 });
  const accept = await api.client.call(acceptRequestRoute, {
    accessToken: anna.accessToken,
    params: { id: asked.id },
    body: {},
  });
  if (!accept.ok) throw new Error(accept.error.code);
  const decline = await api.client.call(declineRequestRoute, {
    accessToken: anna.accessToken,
    params: { id: declined.id },
    body: { reason: "luggage" },
  });
  if (!decline.ok) throw new Error(decline.error.code);
  return { anna, gunna, siggi, acceptedId: asked.id, declinedId: declined.id };
}

describe("the console's users and trips", () => {
  it("are for operators only", async () => {
    const gunna = await newMember("Gunna");
    const asGunna = { authorization: `Bearer ${gunna.accessToken}` };
    for (const [method, path, body] of [
      ["POST", "/admin/v1/users/search", { q: "Gunna" }],
      ["GET", `/admin/v1/users/${gunna.userId}`, undefined],
      ["POST", `/admin/v1/users/${gunna.userId}/notes`, { text: "A note." }],
      ["GET", "/admin/v1/trips", undefined],
      ["GET", `/admin/v1/trips/${airport}`, undefined],
      ["GET", "/admin/v1/decline-rates", undefined],
    ] as const) {
      const answered = await api.request(path, {
        method,
        headers: { ...asGunna, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      expect(answered.status, path).toBe(401);
    }
    expect(await api.connection.db.select().from(schema.operatorNotes)).toEqual([]);
  });
});

describe("finding people (spec 9, 3.5.1)", () => {
  it("finds them by part of their first name, whatever the case, by name", async () => {
    const gunna = await newMember("Gunnhildur");
    const gunnar = await newMember("Gunnar");
    await newMember("Anna");
    const { cookie } = await api.signInOperator();

    const { status, body } = await find(cookie, "gUNN");

    expect(status).toBe(200);
    const { users, more } = body as { users: AdminUserListItem[]; more: boolean };
    expect(more).toBe(false);
    expect(users.map((user) => user.person.firstName)).toEqual(
      expect.arrayContaining(["Gunnar", "Gunnhildur"]),
    );
    expect(users.every((user) => user.person.firstName?.toLowerCase().includes("gunn"))).toBe(true);
    expect(users.find((user) => user.person.userId === gunnar.userId)).toEqual({
      person: person(gunnar, "Gunnar"),
      phone: await phoneOf(gunnar),
      email: null,
      joinedAt: expect.any(String) as unknown,
    });
    const names = users.map((user) => user.person.firstName ?? "");
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "is")));
    expect(users.some((user) => user.person.userId === gunna.userId)).toBe(true);
  });

  it("reads % and _ in a name as themselves", async () => {
    await newMember("Anna");
    const { cookie } = await api.signInOperator();

    for (const q of ["%", "_"]) {
      const { body } = await find(cookie, q);
      expect((body as { users: AdminUserListItem[] }).users, q).toEqual([]);
    }
  });

  it("finds one by phone number, with or without +354, by email in any case, and by ID", async () => {
    const gunna = await newMember("Gunna");
    await api.connection.db
      .update(schema.users)
      .set({ email: "gunna@example.com" })
      .where(eq(schema.users.id, gunna.userId));
    const phone = await phoneOf(gunna);
    const { cookie } = await api.signInOperator();

    for (const q of [
      phone,
      phone.slice(4),
      `${phone.slice(4, 7)} ${phone.slice(7)}`,
      "Gunna@Example.com",
      gunna.userId,
      gunna.userId.toUpperCase(),
    ]) {
      const { status, body } = await find(cookie, q);
      expect(status, q).toBe(200);
      expect((body as { users: AdminUserListItem[] }).users, q).toEqual([
        expect.objectContaining({ person: person(gunna, "Gunna"), email: "gunna@example.com" }),
      ]);
    }
  });

  it("never lists the former member", async () => {
    const { cookie } = await api.signInOperator();

    const { body } = await find(cookie, schema.formerMemberId);

    expect((body as { users: AdminUserListItem[] }).users).toEqual([]);
    const page = await send(cookie, "GET", `/admin/v1/users/${schema.formerMemberId}`);
    expect(page.status).toBe(404);
  });

  it("needs something to search for", async () => {
    const { cookie } = await api.signInOperator();

    for (const sent of [{ q: "  " }, {}]) {
      const { status, body } = await send(cookie, "POST", "/admin/v1/users/search", sent);

      expect(status).toBe(400);
      expect(body).toMatchObject({ error: { code: "validation_failed" } });
    }
  });

  it("lists 50 at most, and says there were more", async () => {
    const { db } = api.connection;
    await db.insert(schema.users).values(
      Array.from({ length: 51 }, (_, index) => ({
        firstName: `Þórdís${String(index)}`,
        status: "active",
        locale: "en",
      })),
    );
    const { cookie } = await api.signInOperator();

    const { body } = await find(cookie, "Þórdís");

    const found = body as { users: AdminUserListItem[]; more: boolean };
    expect(found.users).toHaveLength(50);
    expect(found.more).toBe(true);
  });
});

/** Jón drove Gunna to the airport; the trip completed half an hour ago (spec 8, 3.8). */
async function afterTheTrip() {
  const jon = await driverOf(airport, "Jón");
  const gunna = await newMember("Gunna");
  const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
  await paid(gunna.accessToken, booking.id);
  const [last] = await api.connection.db
    .select({ plannedAt: schema.tripStops.plannedAt })
    .from(schema.tripStops)
    .where(eq(schema.tripStops.tripId, airport))
    .orderBy(desc(schema.tripStops.position))
    .limit(1);
  if (last === undefined || last.plannedAt === null) {
    throw new Error("A published trip's stop has its time.");
  }
  const completesAt = last.plannedAt.getTime() + 150 * 60_000;
  await later(Math.round((completesAt - api.now().getTime()) / 1000), jon, gunna);
  await moveTripsOn(api.connection.db, api.now(), defaultTripDaySettings);
  return { jon, gunna, bookingId: booking.id };
}

async function profileOf(viewer: Member, member: Member) {
  const [row] = await api.connection.db
    .select({ profileId: schema.users.profileId })
    .from(schema.users)
    .where(eq(schema.users.id, member.userId));
  if (row === undefined) throw new Error("No such member.");
  const result = await api.client.call(publicProfileRoute, {
    accessToken: viewer.accessToken,
    params: { profileId: row.profileId },
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

describe("a person's page (spec 9, 3.5.2)", () => {
  it("shows their profile, cars, trips, bookings, reports, actions, notes and declines", async () => {
    const { anna, gunna, siggi, acceptedId, declinedId } = await answeredRequests();
    const { db } = api.connection;
    await db
      .update(schema.users)
      .set({ about: "I like quiet drives.", aboutHiddenAt: api.now(), languages: ["is", "en"] })
      .where(eq(schema.users.id, anna.userId));
    const [car] = await db
      .insert(schema.vehicles)
      .values({ ownerId: anna.userId, make: "Skoda", model: "Octavia", colour: "white" })
      .returning({ id: schema.vehicles.id });
    const filed = await api.client.call(fileReportRoute, {
      accessToken: siggi.accessToken,
      body: { about: { kind: "trip", tripId: north }, category: "other", description: "" },
    });
    if (!filed.ok) throw new Error(filed.error.code);
    const { cookie } = await api.signInOperator();
    await send(cookie, "POST", `/admin/v1/users/${anna.userId}/warning`, {
      rule: "other",
      reason: "Please answer requests sooner.",
    });
    await send(cookie, "POST", `/admin/v1/users/${anna.userId}/notes`, { text: "Called her." });

    const { status, body } = await send(cookie, "GET", `/admin/v1/users/${anna.userId}`);

    expect(status).toBe(200);
    const user = body as AdminUser;
    expect(user).toMatchObject({
      person: person(anna, "Anna"),
      phone: await phoneOf(anna),
      email: null,
      phoneVerifiedAt: expect.any(String) as unknown,
      emailVerifiedAt: null,
      ageConfirmedAt: expect.any(String) as unknown,
      licenceDeclaredAt: null,
      languages: ["is", "en"],
      about: { text: "I like quiet drives.", hidden: true },
      deleteAfter: null,
      vehicles: [
        {
          id: car?.id,
          make: "Skoda",
          model: "Octavia",
          colour: "white",
          registration: null,
          removed: false,
        },
      ],
      bookings: [],
      reportsBy: [],
      declines: {
        answered: 2,
        declined: 1,
        reasons: { plans_changed: 0, luggage: 1, other: 0, none: 0 },
      },
    });
    expect(user.trips).toEqual([
      expect.objectContaining({
        id: north,
        driver: person(anna, "Anna"),
        status: "published",
        from: expect.objectContaining({ name: { is: "BSÍ", en: "BSÍ bus terminal" } }) as unknown,
        to: expect.objectContaining({
          name: { is: "Hof, Akureyri", en: "Hof bus stop, Akureyri" },
        }) as unknown,
        capacity: 3,
        // Gunna's accepted request holds a seat on every segment; Siggi's was declined.
        seatsHeld: 1,
      }),
    ]);
    expect(user.reportsAbout.map((report) => report.id)).toEqual([filed.data.id]);
    expect(user.actions.map((action) => action.kind)).toEqual(["warning"]);
    expect(user.notes).toEqual([
      expect.objectContaining({
        text: "Called her.",
        by: expect.objectContaining({ firstName: null }) as unknown,
      }),
    ]);

    const passenger = await send(cookie, "GET", `/admin/v1/users/${siggi.userId}`);
    expect((passenger.body as AdminUser).bookings).toEqual([
      expect.objectContaining({
        id: declinedId,
        tripId: north,
        driver: person(anna, "Anna"),
        status: "declined",
        seats: 1,
        from: expect.objectContaining({
          name: { is: "N1 Borgarnesi", en: "N1 Borgarnes" },
        }) as unknown,
        declineReason: "luggage",
        requestedAt: expect.any(String) as unknown,
        departsAt: (await departureOf(north)).toISOString(),
      }),
    ]);
    expect((passenger.body as AdminUser).reportsBy.map((report) => report.id)).toEqual([
      filed.data.id,
    ]);
    expect((passenger.body as AdminUser).declines).toBeNull();
    const rider = await send(cookie, "GET", `/admin/v1/users/${gunna.userId}`);
    expect((rider.body as AdminUser).bookings.map((booking) => booking.id)).toEqual([acceptedId]);
  });

  it("answers not found for no such person", async () => {
    const { cookie } = await api.signInOperator();

    const { status } = await send(cookie, "GET", `/admin/v1/users/${randomUUID()}`);

    expect(status).toBe(404);
  });
});

describe("a person's rating, reliability and reviews (spec 9, 3.5.2)", () => {
  it("counts the rating and reliability as their profile does, and lists every review", async () => {
    const { jon, gunna, bookingId } = await afterTheTrip();
    const ago = (hours: number) => new Date(api.now().getTime() - hours * hourMs);
    const [written, waiting, gone] = [ago(3), ago(2), ago(1)];
    const reviews = await api.connection.db
      .insert(schema.reviews)
      .values([
        {
          bookingId,
          authorId: gunna.userId,
          subjectId: jon.userId,
          authorRole: "passenger",
          rating: 4,
          comment: "On time and careful.",
          revealedAt: written,
          createdAt: written,
        },
        // Not shown yet: nobody else reads it, and it does not count.
        {
          bookingId,
          authorId: jon.userId,
          subjectId: gunna.userId,
          authorRole: "driver",
          rating: 5,
          revealedAt: null,
          createdAt: waiting,
        },
        // By someone since erased, and hidden by ShareRide: it does not count either.
        {
          bookingId: null,
          authorId: schema.formerMemberId,
          subjectId: jon.userId,
          authorRole: "passenger",
          rating: 1,
          comment: "Unkind words",
          revealedAt: gone,
          hiddenAt: gone,
          createdAt: gone,
        },
      ])
      .returning({ id: schema.reviews.id });
    const { cookie } = await api.signInOperator();

    const { status, body } = await send(cookie, "GET", `/admin/v1/users/${jon.userId}`);

    expect(status).toBe(200);
    const page = body as AdminUser;
    const profile = await profileOf(gunna, jon);
    expect(page.rating).toEqual({ average: 4, count: 1 });
    expect(page.rating).toEqual(profile.rating);
    expect(page.reliability).toEqual({
      kept: 1,
      counted: 1,
      percent: null,
      byRole: { driver: { kept: 1, counted: 1 }, passenger: { kept: 0, counted: 0 } },
      belowWatchLevel: false,
    });
    expect(page.reliability).toMatchObject(profile.reliability);
    const formerMember = expect.objectContaining({
      userId: schema.formerMemberId,
      firstName: null,
      status: "deleted",
    }) as unknown;
    expect(page.reviewsAbout).toEqual([
      {
        id: reviews[2]?.id,
        rating: 1,
        comment: "Unkind words",
        authorRole: "passenger",
        author: formerMember,
        subject: person(jon, "Jón"),
        writtenAt: gone.toISOString(),
        revealed: true,
        hidden: true,
      },
      {
        id: reviews[0]?.id,
        rating: 4,
        comment: "On time and careful.",
        authorRole: "passenger",
        author: person(gunna, "Gunna"),
        subject: person(jon, "Jón"),
        writtenAt: written.toISOString(),
        revealed: true,
        hidden: false,
      },
    ]);
    const waitingReview = {
      id: reviews[1]?.id,
      rating: 5,
      comment: "",
      authorRole: "driver",
      author: person(jon, "Jón"),
      subject: person(gunna, "Gunna"),
      writtenAt: waiting.toISOString(),
      revealed: false,
      hidden: false,
    };
    expect(page.reviewsBy).toEqual([waitingReview]);

    const passenger = (await send(cookie, "GET", `/admin/v1/users/${gunna.userId}`))
      .body as AdminUser;
    expect(passenger.rating).toEqual({ average: null, count: 0 });
    expect(passenger.reliability).toMatchObject({ kept: 1, counted: 1, percent: null });
    expect(passenger.reviewsAbout).toEqual([waitingReview]);
    expect(passenger.reviewsBy.map((review) => review.id)).toEqual([reviews[0]?.id]);
  });

  it("lists the latest 20 reviews of each kind", async () => {
    const jon = await driverOf(airport, "Jón");
    const now = api.now().getTime();
    const ago = (hours: number) => new Date(now - hours * hourMs);
    await api.connection.db.insert(schema.reviews).values(
      Array.from({ length: 21 }, (_, hours) => ({
        bookingId: null,
        authorId: schema.formerMemberId,
        subjectId: jon.userId,
        authorRole: "passenger",
        rating: 5,
        revealedAt: ago(hours),
        createdAt: ago(hours),
      })),
    );
    const { cookie } = await api.signInOperator();

    const page = (await send(cookie, "GET", `/admin/v1/users/${jon.userId}`)).body as AdminUser;

    expect(page.rating.count).toBe(21);
    expect(page.reviewsAbout).toHaveLength(20);
    expect(page.reviewsAbout.at(-1)?.writtenAt).toBe(ago(19).toISOString());
  });
});

describe("notes about a person (spec 9, 3.5.3)", () => {
  it("are kept with who wrote them, latest first, and audited without their words", async () => {
    const gunna = await newMember("Gunna");
    const operator = await api.signInOperator();
    await api.connection.db
      .update(schema.users)
      .set({ firstName: "Martin" })
      .where(eq(schema.users.id, operator.userId));

    const first = await send(operator.cookie, "POST", `/admin/v1/users/${gunna.userId}/notes`, {
      text: "  Asked about a refund by phone. ",
    });
    const firstAt = api.now();
    await later(60);
    await send(operator.cookie, "POST", `/admin/v1/users/${gunna.userId}/notes`, {
      text: "Refund sent.",
    });

    expect(first.status).toBe(201);
    const { note } = first.body as { note: AdminOperatorNote };
    expect(note).toEqual({
      id: expect.any(String) as unknown,
      text: "Asked about a refund by phone.",
      by: expect.objectContaining({ userId: operator.userId, firstName: "Martin" }) as unknown,
      at: firstAt.toISOString(),
    });
    const page = await send(operator.cookie, "GET", `/admin/v1/users/${gunna.userId}`);
    expect((page.body as AdminUser).notes.map((each) => each.text)).toEqual([
      "Refund sent.",
      "Asked about a refund by phone.",
    ]);
    const audited = await api.connection.db
      .select({
        operatorId: schema.auditLog.operatorUserId,
        subjectType: schema.auditLog.subjectType,
        after: schema.auditLog.after,
      })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, "user.note_added"),
          eq(schema.auditLog.subjectId, gunna.userId),
        ),
      )
      .orderBy(asc(schema.auditLog.id));
    expect(audited).toEqual([
      { operatorId: operator.userId, subjectType: "user", after: { noteId: note.id } },
      expect.objectContaining({ subjectType: "user" }),
    ]);
  });

  it("must say something, in at most 1 000 characters", async () => {
    const gunna = await newMember("Gunna");
    const { cookie } = await api.signInOperator();

    for (const [text, issue] of [
      ["   ", "note_missing"],
      ["x".repeat(1001), "too_long"],
    ] as const) {
      const { status, body } = await send(cookie, "POST", `/admin/v1/users/${gunna.userId}/notes`, {
        text,
      });
      expect(status, issue).toBe(400);
      expect(body, issue).toMatchObject({
        error: { code: "validation_failed", details: [{ path: "text", issue }] },
      });
    }
    const unknown = await send(cookie, "POST", `/admin/v1/users/${randomUUID()}/notes`, {
      text: "A note.",
    });
    expect(unknown.status).toBe(404);
    expect(await api.connection.db.select().from(schema.operatorNotes)).toEqual([]);
  });

  it("are in the person's Download my data, never who wrote them", async () => {
    const gunna = await newMember("Gunna");
    const { cookie } = await api.signInOperator();
    await send(cookie, "POST", `/admin/v1/users/${gunna.userId}/notes`, { text: "Called her." });

    const data = await collectExport(api.connection.db, gunna.userId, api.now());

    expect(data.sections.notes).toEqual([
      { text: "Called her.", addedAt: api.now().toISOString() },
    ]);
  });
});

describe("finding trips (spec 9, 3.5.1)", () => {
  async function trips(cookie: string, query = "") {
    const { status, body } = await send(cookie, "GET", `/admin/v1/trips${query}`);
    expect(status).toBe(200);
    return (body as { trips: AdminTripListItem[] }).trips.map((trip) => trip.id);
  }

  it("lists the trips from today on, the soonest first, with no filter", async () => {
    const { cookie } = await api.signInOperator();

    const found = await trips(cookie);

    expect(found).toEqual(expect.arrayContaining([airport, north, vik]));
    const departures = await Promise.all(found.map(departureOf));
    expect(departures).toEqual([...departures].sort((a, b) => a.getTime() - b.getTime()));
  });

  it("finds them by the day they leave, a stop's name, the driver, or a trip's or booking's ID", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 3 });
    const { cookie } = await api.signInOperator();
    const day = icelandDate(await departureOf(vik));

    expect(await trips(cookie, `?date=${day}`)).toContain(vik);
    expect(await trips(cookie, `?date=${day}`)).not.toContain(airport);
    expect(await trips(cookie, "?place=keflav")).toEqual([airport]);
    // Both of Anna's trips stop there: the latest departure first.
    expect(await trips(cookie, `?place=${encodeURIComponent("Blönduós")}`)).toEqual([
      sampleId("trip:anna-home"),
      north,
    ]);
    expect(await trips(cookie, `?place=${encodeURIComponent("Hof bus")}`)).toEqual(
      expect.arrayContaining([north]),
    );
    expect(await trips(cookie, `?driverId=${jon.userId}`)).toEqual([airport]);
    expect(await trips(cookie, `?id=${airport}`)).toEqual([airport]);
    expect(await trips(cookie, `?id=${booking.id}`)).toEqual([airport]);
    expect(await trips(cookie, `?id=${randomUUID()}`)).toEqual([]);
  });

  it("refuses a day that is not a date", async () => {
    const { cookie } = await api.signInOperator();

    const { status } = await send(cookie, "GET", "/admin/v1/trips?date=tomorrow");

    expect(status).toBe(400);
  });
});

describe("a trip's page (spec 9, 3.5.2)", () => {
  it("shows its stops, car and every booking and request, with why one was declined", async () => {
    const { anna, gunna, siggi, acceptedId, declinedId } = await answeredRequests();
    const { cookie } = await api.signInOperator();

    const { status, body } = await send(cookie, "GET", `/admin/v1/trips/${north}`);

    expect(status).toBe(200);
    const trip = body as AdminTrip;
    expect(trip).toMatchObject({
      id: north,
      driver: person(anna, "Anna"),
      status: "published",
      bookingMode: "approval",
      capacity: 3,
      seatsHeld: 1,
      note: "",
      noteHidden: false,
      cancelledAt: null,
      cancelledBy: null,
      vehicle: expect.objectContaining({ make: expect.any(String) as unknown }) as unknown,
    });
    expect(trip.stops.map((stop) => stop.name.is)).toEqual([
      "BSÍ",
      "N1 Borgarnesi",
      "Olís Blönduósi",
      "Hof, Akureyri",
    ]);
    expect(trip.bookings).toEqual([
      expect.objectContaining({
        id: acceptedId,
        passenger: person(gunna, "Gunna"),
        status: "accepted",
        declineReason: null,
        totalPrice: { amount: expect.any(Number) as unknown, currency: "ISK" },
      }),
      expect.objectContaining({
        id: declinedId,
        passenger: person(siggi, "Siggi"),
        status: "declined",
        declineReason: "luggage",
      }),
    ]);
  });

  it("answers not found for no such trip, or a draft", async () => {
    await api.connection.db
      .update(schema.trips)
      .set({ status: "draft" })
      .where(eq(schema.trips.id, vik));
    const { cookie } = await api.signInOperator();

    for (const id of [randomUUID(), vik]) {
      const { status } = await send(cookie, "GET", `/admin/v1/trips/${id}`);
      expect(status, id).toBe(404);
    }
    const listed = await send(cookie, "GET", `/admin/v1/trips?id=${vik}`);
    expect(listed.body).toEqual({ trips: [], more: false });
    const driver = await send(cookie, "GET", `/admin/v1/users/${(await driverOf(vik)).userId}`);
    expect((driver.body as AdminUser).trips.map((trip) => trip.id)).not.toContain(vik);
  });
});

describe("decline rates (spec 9, 3.4.5)", () => {
  it("lists each driver who answered a request, the highest share of declines first", async () => {
    const { anna } = await answeredRequests();
    // Jón's trip books at once: no request to answer.
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const instant = await book(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    expect(instant.ok).toBe(true);
    const { cookie } = await api.signInOperator();

    const { status, body } = await send(cookie, "GET", "/admin/v1/decline-rates");

    expect(status).toBe(200);
    const { drivers } = body as { drivers: AdminDeclineRate[] };
    expect(drivers).toEqual([
      {
        driver: person(anna, "Anna"),
        answered: 2,
        declined: 1,
        reasons: { plans_changed: 0, luggage: 1, other: 0, none: 0 },
      },
    ]);
    expect(drivers.some((rate) => rate.driver.userId === jon.userId)).toBe(false);
  });

  it("leaves out a request declined because the driver cancelled the trip", async () => {
    const anna = await driverOf(north, "Anna");
    const gunna = await newMember("Gunna");
    const asked = await booked(gunna.accessToken, north, { fromStop: 0, toStop: 3 });
    const cancelled = await api.client.call(cancelTripRoute, {
      accessToken: anna.accessToken,
      params: { id: north },
      body: { reason: "illness", countsOnReliability: false },
    });
    expect(cancelled.ok).toBe(true);
    const { cookie } = await api.signInOperator();

    const { body } = await send(cookie, "GET", "/admin/v1/decline-rates");

    const [request] = await api.connection.db
      .select({ status: schema.bookings.status })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, asked.id));
    expect(request?.status).toBe("declined");
    expect((body as { drivers: AdminDeclineRate[] }).drivers).toEqual([]);
  });

  it("counts only the requests made in the last 90 days", async () => {
    await answeredRequests();
    await api.connection.db
      .update(schema.bookings)
      .set({ requestedAt: new Date(api.now().getTime() - 91 * 86_400_000) })
      .where(eq(schema.bookings.tripId, north));
    const { cookie } = await api.signInOperator();

    const { body } = await send(cookie, "GET", "/admin/v1/decline-rates");

    expect((body as { drivers: AdminDeclineRate[] }).drivers).toEqual([]);
  });
});
