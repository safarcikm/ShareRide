import { tripDetailsRoute, tripSearchRoute, type TripDetailsQuery } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, seedSampleMeetingPoints, seedSampleTrips } from "@shareride/db/seed";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";

// The sample trips at the test clock (Friday 13 November 2026, noon): Anna
// drives BSÍ, Reykjavík to Hof, Akureyri on Saturday at 09:00, through
// N1 Borgarnes and Olís Blönduós, in a white Toyota Yaris with 3 seats.

let api: TestApi;

const point = (key: string) => sampleId(`point:${key}`);
const trip = (key: string) => sampleId(`trip:${key}`);
const north = trip("anna-akureyri");

beforeAll(async () => {
  api = await startTestApi();
  await seedSampleMeetingPoints(api.connection.db, api.now());
  await seedSampleTrips(api.connection.db, api.now());
});

afterAll(async () => {
  await api.close();
});

async function details(id: string, query: TripDetailsQuery = {}, accessToken?: string) {
  const result = await api.client.call(tripDetailsRoute, {
    params: { id },
    query,
    ...(accessToken === undefined ? {} : { accessToken }),
  });
  if (!result.ok) throw new Error(`${String(result.status)} ${result.error.code}`);
  return result.data;
}

describe("GET /v1/trips/{id} (spec 4, 3.6)", () => {
  it("opens a trip for the part a search found, without an account", async () => {
    const search = await api.client.call(tripSearchRoute, {
      query: { from: point("borgarnes"), to: point("blonduos"), seats: 2 },
    });
    if (!search.ok) throw new Error(search.error.code);
    const [found] = search.data.results;
    const opened = await details(north, {
      fromStop: found?.board.position,
      toStop: found?.alight.position,
      seats: 2,
    });
    expect(opened).toMatchObject({
      id: north,
      part: {
        board: 1,
        alight: 2,
        seats: 2,
        freeSeats: 3,
        pricePerSeat: found?.pricePerSeat,
        total: found?.total,
        state: "open",
      },
      seatsOffered: 3,
      driver: { firstName: "Anna" },
      car: { make: "Toyota", model: "Yaris", colour: "white" },
      bookingMode: "approval",
      note: "",
    });
    expect(opened.stops.map((stop) => stop.meetingPoint.id)).toEqual([
      point("bsi"),
      point("borgarnes"),
      point("blonduos"),
      point("akureyri"),
    ]);
    expect(opened.stops.map((stop) => stop.position)).toEqual([0, 1, 2, 3]);
    expect(opened.stops[1]?.plannedAt).toBe(found?.board.plannedAt);
    expect(opened.preferences).toMatchObject({ smoking: "no" });
    // Nothing about the driver but the first name, and no number plate.
    expect(JSON.stringify(opened)).not.toMatch(/registration|phone|driverId/);
  });

  it("is the whole trip without a part, and prices any other part", async () => {
    const whole = await details(north);
    expect(whole.part).toMatchObject({ board: 0, alight: 3, seats: 1 });
    const first = await details(north, { toStop: 1 });
    const middle = await details(north, { fromStop: 1, toStop: 2 });
    const end = await details(north, { fromStop: 2 });
    expect(first.part).toMatchObject({ board: 0, alight: 1 });
    expect(end.part).toMatchObject({ board: 2, alight: 3 });
    expect(whole.part.pricePerSeat.amount).toBe(
      first.part.pricePerSeat.amount +
        middle.part.pricePerSeat.amount +
        end.part.pricePerSeat.amount,
    );
  });

  it("refuses a part that does not run forwards between two stops", async () => {
    const refused = (query: TripDetailsQuery) =>
      api.client.call(tripDetailsRoute, { params: { id: north }, query });
    expect(await refused({ fromStop: 2, toStop: 1 })).toMatchObject({
      status: 400,
      error: { code: "validation_failed", details: [{ path: "toStop", issue: "invalid_part" }] },
    });
    expect(await refused({ fromStop: 3 })).toMatchObject({
      status: 400,
      error: { details: [{ path: "fromStop", issue: "invalid_part" }] },
    });
    expect(await refused({ toStop: 9 })).toMatchObject({ status: 400 });
    expect(await refused({ seats: 9 })).toMatchObject({ status: 400 });
  });

  it("finds no draft and no unknown trip", async () => {
    const unknown = await api.client.call(tripDetailsRoute, {
      params: { id: sampleId("trip:nowhere") },
      query: {},
    });
    expect(unknown).toMatchObject({ status: 404, error: { code: "not_found" } });
    await api.connection.db
      .update(schema.trips)
      .set({ status: "draft" })
      .where(eq(schema.trips.id, trip("sigga-selfoss")));
    try {
      const hidden = await api.client.call(tripDetailsRoute, {
        params: { id: trip("sigga-selfoss") },
        query: {},
      });
      expect(hidden).toMatchObject({ status: 404 });
    } finally {
      await api.connection.db
        .update(schema.trips)
        .set({ status: "published" })
        .where(eq(schema.trips.id, trip("sigga-selfoss")));
    }
  });

  it("says when the part is full, booking has closed, or the trip has left or is cancelled", async () => {
    const part = { fromStop: 1, toStop: 2 };
    expect((await details(north, { ...part, seats: 4 })).part).toMatchObject({
      freeSeats: 3,
      state: "full",
    });

    const boardsAt = new Date((await details(north, part)).stops[1]?.plannedAt ?? 0).getTime();
    const untilCutoff = (boardsAt - api.now().getTime()) / 1000 - 15 * 60;
    api.advance(untilCutoff + 1);
    try {
      expect((await details(north, part)).part.state).toBe("closed");
      api.advance(15 * 60);
      expect((await details(north, part)).part.state).toBe("departed");
      // Further on, Blönduós can still be booked.
      expect((await details(north, { fromStop: 2 })).part.state).toBe("open");
    } finally {
      api.advance(-untilCutoff - 1 - 15 * 60);
    }

    await api.connection.db
      .update(schema.trips)
      .set({ status: "cancelled" })
      .where(eq(schema.trips.id, north));
    try {
      expect((await details(north, part)).part.state).toBe("cancelled");
    } finally {
      await api.connection.db
        .update(schema.trips)
        .set({ status: "published" })
        .where(eq(schema.trips.id, north));
    }
  });

  it("tells the signed-in driver the trip is their own, and refuses a token that is not valid", async () => {
    const { accessToken, userId } = await api.signIn(api.newPhoneNumber());
    expect((await details(north, {}, accessToken)).part.state).toBe("open");
    await api.connection.db
      .update(schema.trips)
      .set({ driverId: userId })
      .where(eq(schema.trips.id, north));
    try {
      expect((await details(north, {}, accessToken)).part.state).toBe("own");
      expect((await details(north)).part.state).toBe("open");
    } finally {
      await api.connection.db
        .update(schema.trips)
        .set({ driverId: sampleId("user:anna") })
        .where(eq(schema.trips.id, north));
    }
    const stale = await api.client.call(tripDetailsRoute, {
      params: { id: north },
      query: {},
      accessToken: "sr_at_not-a-real-token",
    });
    expect(stale).toMatchObject({ status: 401, error: { code: "unauthenticated" } });
  });

  it("counts towards the search limit of the address", async () => {
    api.ip = "198.51.100.9";
    let refused = false;
    for (let attempt = 0; attempt < 80 && !refused; attempt += 1) {
      const result = await api.client.call(tripDetailsRoute, { params: { id: north }, query: {} });
      refused = !result.ok && result.status === 429;
    }
    expect(refused).toBe(true);
  });
});
