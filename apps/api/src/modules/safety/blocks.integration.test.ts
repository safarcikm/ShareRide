import { randomUUID } from "node:crypto";
import {
  blockFromBookingRoute,
  blockFromProfileRoute,
  conversationMessagesRoute,
  messageAllPassengersRoute,
  myBlocksRoute,
  myConversationsRoute,
  sendMessageRoute,
  soonestTripsRoute,
  tripDetailsRoute,
  tripSearchAlternativesRoute,
  tripSearchRoute,
  unblockRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { peopleColourOf } from "@shareride/domain";
import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";

// The sample trips at the test clock (Friday 13 November 2026, noon): Jón
// drives Hlemmur to Keflavík Airport on Saturday at 05:30 (2 seats, instant)
// and Selfoss to Vík on Sunday. A person is blocked through a booking the two
// share, so no one's own ID is shown to anyone.

let api: TestApi;

const { airport, vik } = sampleTrip;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, book, booked, paid } = bookingHelpers(() => api);

/** Blocks the other person of the booking. */
function block(member: Member, bookingId: string) {
  return api.client.call(blockFromBookingRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    body: {},
  });
}

function unblock(member: Member, blockId: string) {
  return api.client.call(unblockRoute, {
    accessToken: member.accessToken,
    params: { id: blockId },
  });
}

/** A block made some other way, such as from a profile later (milestone 7). */
async function blockDirectly(blocker: Member, blockedPerson: Member) {
  await api.connection.db
    .insert(schema.blocks)
    .values({ blockerId: blocker.userId, blockedId: blockedPerson.userId });
}

/** Jón drives the airport trip and the trip to Vík. */
async function jonDrives() {
  const jon = await driverOf(airport, "Jón");
  await api.connection.db
    .update(schema.trips)
    .set({ driverId: jon.userId })
    .where(eq(schema.trips.id, vik));
  return jon;
}

/** Gunna's booking on Jón's trip to Vík, which she can block him from. */
async function gunnaOnVik() {
  const jon = await jonDrives();
  const gunna = await newMember("Gunna");
  const booking = await booked(gunna.accessToken, vik, { fromStop: 0, toStop: 1 });
  return { jon, gunna, bookingId: booking.id };
}

async function blocked(member: Member) {
  const result = await api.client.call(myBlocksRoute, { accessToken: member.accessToken });
  if (!result.ok) throw new Error(result.error.code);
  return result.data.blocked;
}

async function airportEnds() {
  const stops = await api.connection.db
    .select({ point: schema.tripStops.meetingPointId })
    .from(schema.tripStops)
    .where(eq(schema.tripStops.tripId, airport))
    .orderBy(asc(schema.tripStops.position));
  return { from: stops[0]?.point ?? "", to: stops.at(-1)?.point ?? "" };
}

/** Whether `member` finds the airport trip in search, rides leaving soon and alternatives. */
async function findsAirport(member: Member) {
  const { from, to } = await airportEnds();
  const [search, soonest, alternatives] = await Promise.all([
    api.client.call(tripSearchRoute, {
      accessToken: member.accessToken,
      query: { from, to, seats: 1 },
    }),
    api.client.call(soonestTripsRoute, { accessToken: member.accessToken, query: {} }),
    api.client.call(tripSearchAlternativesRoute, {
      accessToken: member.accessToken,
      // The days around Sunday: the trip leaves on Saturday.
      query: { from, to, date: "2026-11-15", seats: 1 },
    }),
  ]);
  if (!search.ok || !soonest.ok || !alternatives.ok) throw new Error("A search failed.");
  return {
    search: search.data.results.some((result) => result.tripId === airport),
    soonest: soonest.data.results.some((result) => result.tripId === airport),
    days: alternatives.data.days.find((day) => day.date === "2026-11-14")?.count ?? 0,
  };
}

function detailsFor(member: Member | null) {
  return api.client.call(tripDetailsRoute, {
    params: { id: airport },
    query: { seats: 1 },
    ...(member === null ? {} : { accessToken: member.accessToken }),
  });
}

describe("POST /v1/bookings/{id}/block and GET /v1/me/blocks (spec 9, 3.2)", () => {
  it("lists the people I blocked, the latest first, with first name and colour", async () => {
    const jon = await jonDrives();
    const anna = await newMember("Anna");
    const gunna = await newMember("Gunna");
    const annas = await booked(anna.accessToken, airport, { fromStop: 0, toStop: 1 });
    const gunnas = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    expect(await block(jon, annas.id)).toMatchObject({ status: 200 });
    api.advance(60);
    try {
      expect(await block(jon, gunnas.id)).toMatchObject({ status: 200 });
      const list = await blocked(jon);
      expect(list).toEqual([
        {
          id: expect.any(String) as unknown,
          firstName: "Gunna",
          colour: peopleColourOf(gunna.userId),
          blockedAt: api.now().toISOString(),
        },
        expect.objectContaining({ firstName: "Anna" }),
      ]);
      // A block's own ID, never the person's.
      expect(list.map((person) => person.id)).not.toContain(gunna.userId);
    } finally {
      api.advance(-60);
    }
  });

  it("gives the bookings and requests we still have together, as I see them", async () => {
    const { jon, gunna, bookingId } = await gunnaOnVik();
    const airportBooking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    const result = await block(gunna, bookingId);
    expect(result).toMatchObject({ status: 200 });
    if (!result.ok) return;
    // Soonest first: the airport on Saturday, Vík on Sunday.
    expect(result.data.together.map((booking) => [booking.id, booking.viewer])).toEqual([
      [airportBooking.id, "passenger"],
      [bookingId, "passenger"],
    ]);
    // From the driver's side, the same two, as the driver sees them.
    const fromJon = await block(jon, bookingId);
    expect(fromJon.ok && fromJon.data.together.map((booking) => booking.viewer)).toEqual([
      "driver",
      "driver",
    ]);
  });

  it("leaves out a booking whose boarding has passed", async () => {
    const { gunna, bookingId } = await gunnaOnVik();
    const airportBooking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    await paid(gunna.accessToken, airportBooking.id);
    await paid(gunna.accessToken, bookingId);
    // Saturday 06:00: the airport trip left at 05:30; Vík is on Sunday.
    await later(18 * 3600, gunna);
    const result = await block(gunna, bookingId);
    expect(result).toMatchObject({ status: 200 });
    expect(result.ok && result.data.together.map((booking) => booking.id)).toEqual([bookingId]);
  });

  it("gives bookings each way when each of us drives the other", async () => {
    const { jon, gunna, bookingId } = await gunnaOnVik();
    // Gunna drives the airport trip, with Jón booked on it.
    await api.connection.db
      .update(schema.trips)
      .set({ driverId: gunna.userId })
      .where(eq(schema.trips.id, airport));
    const jons = await booked(jon.accessToken, airport, { fromStop: 0, toStop: 1 });
    const result = await block(gunna, bookingId);
    expect(
      result.ok && result.data.together.map((booking) => [booking.id, booking.viewer]),
    ).toEqual([
      [jons.id, "driver"],
      [bookingId, "passenger"],
    ]);
  });

  it("leaves out bookings that no longer hold seats", async () => {
    const { gunna, bookingId } = await gunnaOnVik();
    const airportBooking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    await api.connection.db
      .update(schema.bookings)
      .set({ status: "cancelled" })
      .where(eq(schema.bookings.id, airportBooking.id));
    const result = await block(gunna, bookingId);
    expect(result.ok && result.data.together.map((booking) => booking.id)).toEqual([bookingId]);
  });

  it("is silent: the person blocked does not see it in their list", async () => {
    const { jon, gunna, bookingId } = await gunnaOnVik();
    await block(gunna, bookingId);
    expect(await blocked(jon)).toEqual([]);
  });

  it("is safe to repeat, and keeps the first time", async () => {
    const { gunna, bookingId } = await gunnaOnVik();
    await block(gunna, bookingId);
    const [first] = await blocked(gunna);
    api.advance(60);
    try {
      expect(await block(gunna, bookingId)).toMatchObject({ status: 200 });
      expect(await blocked(gunna)).toEqual([first]);
    } finally {
      api.advance(-60);
    }
  });

  it("refuses a booking that is not mine or on my trip", async () => {
    const { bookingId } = await gunnaOnVik();
    const stranger = await newMember("Sigga");
    expect(await block(stranger, bookingId)).toMatchObject({
      status: 404,
      error: { code: "not_found" },
    });
    expect(await block(stranger, randomUUID())).toMatchObject({ status: 404 });
    expect(await blocked(stranger)).toEqual([]);
  });

  it("needs an account", async () => {
    const { bookingId } = await gunnaOnVik();
    const result = await api.client.call(blockFromBookingRoute, {
      params: { id: bookingId },
      body: {},
    });
    expect(result).toMatchObject({ status: 401 });
  });
});

/** The reference of a member's public profile, never their ID. */
async function profileIdOf(member: Member) {
  const [row] = await api.connection.db
    .select({ profileId: schema.users.profileId })
    .from(schema.users)
    .where(eq(schema.users.id, member.userId));
  if (row === undefined) throw new Error("No such member.");
  return row.profileId;
}

function blockFromProfile(member: Member, profileId: string) {
  return api.client.call(blockFromProfileRoute, {
    accessToken: member.accessToken,
    params: { profileId },
    body: {},
  });
}

describe("POST /v1/people/{profileId}/block (spec 9, 3.2.1)", () => {
  it("blocks a person from their profile, with nothing between us", async () => {
    const jon = await jonDrives();
    const sigga = await newMember("Sigga");
    const result = await blockFromProfile(sigga, await profileIdOf(jon));
    expect(result).toMatchObject({ status: 200, data: { together: [] } });
    expect(await blocked(sigga)).toEqual([expect.objectContaining({ firstName: "Jón" })]);
    // The trips he drives are closed to her (R9.4).
    expect(await findsAirport(sigga)).toEqual({ search: false, soonest: false, days: 0 });
  });

  it("gives the bookings and requests we still have together, as from a booking", async () => {
    const { jon, gunna, bookingId } = await gunnaOnVik();
    const result = await blockFromProfile(gunna, await profileIdOf(jon));
    expect(result).toMatchObject({ status: 200 });
    expect(result.ok && result.data.together.map((booking) => booking.id)).toEqual([bookingId]);
  });

  it("is safe to repeat, and keeps the first time", async () => {
    const jon = await jonDrives();
    const sigga = await newMember("Sigga");
    const profileId = await profileIdOf(jon);
    await blockFromProfile(sigga, profileId);
    const first = await blocked(sigga);
    api.advance(60);
    try {
      expect(await blockFromProfile(sigga, profileId)).toMatchObject({ status: 200 });
      expect(await blocked(sigga)).toEqual(first);
    } finally {
      api.advance(-60);
    }
  });

  it("finds no profile of mine to block, of someone leaving ShareRide, or unknown", async () => {
    const jon = await jonDrives();
    const sigga = await newMember("Sigga");
    expect(await blockFromProfile(jon, await profileIdOf(jon))).toMatchObject({
      status: 404,
      error: { code: "not_found" },
    });
    await api.connection.db
      .update(schema.users)
      .set({ deleteAfter: new Date(api.now().getTime() + 30 * 24 * 3_600_000) })
      .where(eq(schema.users.id, jon.userId));
    expect(await blockFromProfile(sigga, await profileIdOf(jon))).toMatchObject({ status: 404 });
    expect(await blockFromProfile(sigga, randomUUID())).toMatchObject({ status: 404 });
    expect(await blocked(sigga)).toEqual([]);
    expect(await blocked(jon)).toEqual([]);
  });

  it("needs an account", async () => {
    const jon = await jonDrives();
    const result = await api.client.call(blockFromProfileRoute, {
      params: { profileId: await profileIdOf(jon) },
      body: {},
    });
    expect(result).toMatchObject({ status: 401 });
  });
});

describe("DELETE /v1/me/blocks/{id}", () => {
  it("unblocks, and is safe to repeat", async () => {
    const { gunna, bookingId } = await gunnaOnVik();
    await block(gunna, bookingId);
    const [made] = await blocked(gunna);
    expect(await unblock(gunna, made?.id ?? "")).toMatchObject({ status: 204 });
    expect(await unblock(gunna, made?.id ?? "")).toMatchObject({ status: 204 });
    expect(await blocked(gunna)).toEqual([]);
  });

  it("cannot lift a block someone else made", async () => {
    const { jon, gunna, bookingId } = await gunnaOnVik();
    await block(gunna, bookingId);
    const [made] = await blocked(gunna);
    expect(await unblock(jon, made?.id ?? "")).toMatchObject({ status: 204 });
    expect(await blocked(gunna)).toHaveLength(1);
    expect((await findsAirport(gunna)).search).toBe(false);
  });
});

describe("trips closed by a block (R9.4)", () => {
  it.each([
    ["the passenger blocks the driver", "passenger"],
    ["the driver blocks the passenger", "driver"],
  ] as const)("hides the driver's other trips both ways when %s", async (_, who) => {
    const { jon, gunna, bookingId } = await gunnaOnVik();
    expect(await findsAirport(gunna)).toEqual({ search: true, soonest: true, days: 1 });
    await block(who === "passenger" ? gunna : jon, bookingId);

    expect(await findsAirport(gunna)).toEqual({ search: false, soonest: false, days: 0 });
    expect(await detailsFor(gunna)).toMatchObject({ status: 404, error: { code: "not_found" } });
    expect(await book(gunna.accessToken, airport, { fromStop: 0, toStop: 1 })).toMatchObject({
      status: 404,
      error: { code: "not_found" },
    });
    // Signed out, the trip is public as before.
    expect(await detailsFor(null)).toMatchObject({ status: 200 });
    // The driver still sees their own trip.
    expect(await detailsFor(jon)).toMatchObject({ status: 200 });
  });

  it.each([
    ["the passenger booked on it blocked me", "booked"],
    ["I blocked the passenger booked on it", "searcher"],
  ] as const)("leaves a trip open when %s: who is booked is private", async (_, who) => {
    await driverOf(airport, "Jón");
    const anna = await newMember("Anna");
    const gunna = await newMember("Gunna");
    await booked(anna.accessToken, airport, { fromStop: 0, toStop: 1 });
    if (who === "booked") await blockDirectly(anna, gunna);
    else await blockDirectly(gunna, anna);

    // Otherwise a blocker could find which rides the other person booked.
    expect(await findsAirport(gunna)).toEqual({ search: true, soonest: true, days: 1 });
    expect(await detailsFor(gunna)).toMatchObject({ status: 200 });
    expect(await book(gunna.accessToken, airport, { fromStop: 0, toStop: 1 })).toMatchObject({
      status: 201,
    });
  });

  it("refuses another part of a trip I already hold, once in a block with its driver", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const first = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    await block(jon, first.id);
    expect(await book(gunna.accessToken, airport, { fromStop: 1, toStop: 2 })).toMatchObject({
      status: 404,
      error: { code: "not_found" },
    });
  });

  it("opens the trip again once unblocked", async () => {
    const { gunna, bookingId } = await gunnaOnVik();
    await block(gunna, bookingId);
    const [made] = await blocked(gunna);
    await unblock(gunna, made?.id ?? "");
    expect(await findsAirport(gunna)).toEqual({ search: true, soonest: true, days: 1 });
    expect(await book(gunna.accessToken, airport, { fromStop: 0, toStop: 1 })).toMatchObject({
      status: 201,
    });
  });

  it("leaves a booking we already share open to both of us", async () => {
    const { gunna, bookingId } = await gunnaOnVik();
    await block(gunna, bookingId);
    const details = await api.client.call(tripDetailsRoute, {
      accessToken: gunna.accessToken,
      params: { id: vik },
      query: { seats: 1 },
    });
    expect(details).toMatchObject({ status: 200 });
  });
});

describe("chats with a block (R9.4: read-only)", () => {
  async function confirmed() {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    await paid(gunna.accessToken, booking.id);
    return { jon, gunna, bookingId: booking.id };
  }

  const send = (member: Member, bookingId: string) =>
    api.client.call(sendMessageRoute, {
      accessToken: member.accessToken,
      params: { id: bookingId },
      body: { clientId: randomUUID(), text: "Hello" },
    });

  it("makes the conversation read-only for both; only the blocker is told it was them", async () => {
    const { jon, gunna, bookingId } = await confirmed();
    expect(await send(gunna, bookingId)).toMatchObject({ status: 201 });
    await block(gunna, bookingId);

    for (const [member, mine] of [
      [jon, false],
      [gunna, true],
    ] as const) {
      expect(await send(member, bookingId)).toMatchObject({
        status: 409,
        error: { code: "chat_closed" },
      });
      const page = await api.client.call(conversationMessagesRoute, {
        accessToken: member.accessToken,
        params: { id: bookingId },
        query: {},
      });
      expect(page).toMatchObject({
        status: 200,
        data: { conversation: { canWrite: false, blockedByMe: mine } },
      });
      // Both can still read what was said.
      expect(page.ok && page.data.messages.some((message) => message.text === "Hello")).toBe(true);
      const list = await api.client.call(myConversationsRoute, {
        accessToken: member.accessToken,
      });
      expect(list).toMatchObject({
        status: 200,
        data: { conversations: [{ canWrite: false, blockedByMe: mine }] },
      });
    }

    const [made] = await blocked(gunna);
    await unblock(gunna, made?.id ?? "");
    expect(await send(jon, bookingId)).toMatchObject({ status: 201 });
  });

  it("leaves a blocked passenger out of the driver's message to all passengers", async () => {
    const { jon, bookingId } = await confirmed();
    const anna = await newMember("Anna");
    const annas = await booked(anna.accessToken, airport, { fromStop: 0, toStop: 1 });
    await paid(anna.accessToken, annas.id);
    await block(jon, bookingId);

    const result = await api.client.call(messageAllPassengersRoute, {
      accessToken: jon.accessToken,
      params: { id: airport },
      body: { clientId: randomUUID(), text: "Running ten minutes late" },
    });
    expect(result).toMatchObject({ status: 200, data: { sent: 1 } });
  });
});
