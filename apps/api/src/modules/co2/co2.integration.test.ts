import {
  bookingRoute,
  configRoute,
  myCo2Route,
  myTripRoute,
  type Booking,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { co2GramsFor, defaultTripDaySettings as settings, partDistanceM } from "@shareride/domain";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { moveTripsOn } from "../trips/completion.ts";

// The CO2 figures the API gives (spec 34, sections 3.5 to 3.8 and 6). The
// airport trip at the test clock: Hlemmur to Keflavík Airport on Saturday
// at 05:30, 2 seats, instant; the north trip, BSÍ to Hof, has no bookings.

let api: TestApi;
const { airport, north, vik } = sampleTrip;
const hourMs = 3_600_000;
const { segments, trips } = schema;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
});

afterEach(() => {
  rewind();
  api.fixSetting("co2_grams_per_car_km", undefined);
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, details, booked, paid } = bookingHelpers(() => api);

/** A trip's stretches, in metres, as stored. */
async function stretches(tripId: string) {
  const rows = await api.connection.db
    .select({ distanceM: segments.distanceM })
    .from(segments)
    .where(eq(segments.tripId, tripId))
    .orderBy(asc(segments.position));
  return rows.map((row) => row.distanceM);
}

/** The airport trip's part, or another trip's. */
async function figureOf(board: number, alight: number, gramsPerCarKm = 150, tripId = airport) {
  const distanceM = partDistanceM(await stretches(tripId), board, alight);
  return { distanceM, grams: co2GramsFor(distanceM, gramsPerCarKm) };
}

/** Jón drives; Gunna has two seats from the first stop to the third, Sigga one to the end, both paid. */
async function aFullRide() {
  const jon = await driverOf(airport, "Jón");
  const gunna = await newMember("Gunna");
  const gunnas = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 2, seats: 2 });
  await paid(gunna.accessToken, gunnas.id);
  const sigga = await newMember("Sigga");
  const siggas = await booked(sigga.accessToken, airport, { fromStop: 2, toStop: 3 });
  await paid(sigga.accessToken, siggas.id);
  return { jon, gunna, gunnas, sigga, siggas };
}

/** Moves the clock past the airport trip's completion, or the last of `tripIds`'. */
async function completeTheTrip(...members: Member[]) {
  await completeTrips([airport], ...members);
}

async function completeTrips(tripIds: readonly string[], ...members: Member[]) {
  const rows = await api.connection.db
    .select({ arrivesAt: trips.arrivesAt })
    .from(trips)
    .where(inArray(trips.id, [...tripIds]));
  const last = Math.max(...rows.map((row) => row.arrivesAt?.getTime() ?? 0));
  const completesAt = last + 2 * hourMs;
  await later(Math.round((completesAt - api.now().getTime()) / 1000) + 1, ...members);
  await moveTripsOn(api.connection.db, api.now(), settings);
}

async function bookingAs(member: Member, id: string): Promise<Booking> {
  const found = await api.client.call(bookingRoute, {
    accessToken: member.accessToken,
    params: { id },
  });
  if (!found.ok) throw new Error(found.error.code);
  return found.data;
}

async function myTrip(member: Member, id: string) {
  const found = await api.client.call(myTripRoute, {
    accessToken: member.accessToken,
    params: { id },
  });
  if (!found.ok) throw new Error(found.error.code);
  return found.data;
}

async function totalsOf(member: Member) {
  const found = await api.client.call(myCo2Route, { accessToken: member.accessToken });
  if (!found.ok) throw new Error(found.error.code);
  return found.data;
}

describe("a ride's details (spec 34, 3.5)", () => {
  it("give the part's road distance and one car's grams, whatever the seats", async () => {
    const { distanceM, grams } = await figureOf(0, 2);
    for (const seats of [1, 2]) {
      const { part } = await details(airport, 0, 2, seats);
      expect(part).toMatchObject({ distanceM, co2Grams: grams });
    }
    expect((await details(airport, 1, 3)).part).toMatchObject(
      await figureOf(1, 3).then((figure) => ({
        distanceM: figure.distanceM,
        co2Grams: figure.grams,
      })),
    );
  });

  it("give no grams while the operator's value is 0", async () => {
    api.fixSetting("co2_grams_per_car_km", 0);
    const { part } = await details(airport, 0, 2);
    expect(part.co2Grams).toBeNull();
    expect(part.distanceM).toBeGreaterThan(0);
  });
});

describe("a booked seat (3.6)", () => {
  it("estimates a confirmed booking, then shows the grams it kept, for the passenger alone", async () => {
    const { jon, gunna, gunnas } = await aFullRide();
    expect((await bookingAs(gunna, gunnas.id)).co2).toEqual(await figureOf(0, 2));
    expect((await bookingAs(jon, gunnas.id)).co2).toBeNull();

    await completeTheTrip(jon, gunna);
    // The value moved after the ride: the booking keeps what it counted (R34.2).
    api.fixSetting("co2_grams_per_car_km", 120);
    const completed = await bookingAs(gunna, gunnas.id);
    expect(completed.status).toBe("completed");
    expect(completed.co2).toEqual(await figureOf(0, 2, 150));
  });

  it("shows nothing for a booking that is not confirmed, or while the value is 0", async () => {
    const gunna = await newMember("Gunna");
    const unpaid = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 2 });
    expect((await bookingAs(gunna, unpaid.id)).co2).toBeNull();
    await paid(gunna.accessToken, unpaid.id);
    api.fixSetting("co2_grams_per_car_km", 0);
    expect((await bookingAs(gunna, unpaid.id)).co2).toBeNull();
  });
});

describe("the driver's ride (3.7)", () => {
  it("adds its confirmed and completed bookings, one car each", async () => {
    const { jon, gunna, sigga } = await aFullRide();
    const first = await figureOf(0, 2);
    const second = await figureOf(2, 3);
    const sum = {
      distanceM: first.distanceM + second.distanceM,
      grams: first.grams + second.grams,
    };
    expect((await myTrip(jon, airport)).co2).toEqual(sum);

    await completeTheTrip(jon, gunna, sigga);
    expect((await myTrip(jon, airport)).co2).toEqual(sum);
  });

  it("is nothing for a ride with no booking that counts", async () => {
    const anna = await driverOf(north, "Anna");
    expect((await myTrip(anna, north)).co2).toBeNull();
  });
});

describe("my own totals (3.8)", () => {
  it("give a passenger's and a driver's figures, each their own", async () => {
    const { jon, gunna, sigga } = await aFullRide();
    const first = await figureOf(0, 2);
    const second = await figureOf(2, 3);
    // Before the ride nothing counts yet.
    expect(await totalsOf(gunna)).toEqual({ grams: 0, asPassenger: null, asDriver: null });

    await completeTheTrip(jon, gunna, sigga);
    expect(await totalsOf(gunna)).toEqual({
      grams: first.grams,
      asPassenger: { grams: first.grams, rides: 1 },
      asDriver: null,
    });
    expect(await totalsOf(sigga)).toEqual({
      grams: second.grams,
      asPassenger: { grams: second.grams, rides: 1 },
      asDriver: null,
    });
    expect(await totalsOf(jon)).toEqual({
      grams: first.grams + second.grams,
      asPassenger: null,
      asDriver: { grams: first.grams + second.grams, rides: 1, passengers: 2 },
    });
  });

  it("give a member who drove and rode both roles, and never another member's bookings", async () => {
    const { jon, gunna, sigga } = await aFullRide();
    // Jón rides to Vík on Sunday, beside Gunna, who rides part of the way.
    const jons = await booked(jon.accessToken, vik, { fromStop: 0, toStop: 3 });
    await paid(jon.accessToken, jons.id);
    const gunnas = await booked(gunna.accessToken, vik, { fromStop: 1, toStop: 3 });
    await paid(gunna.accessToken, gunnas.id);
    await completeTrips([airport, vik], jon, gunna, sigga);

    const droveGrams = (await figureOf(0, 2)).grams + (await figureOf(2, 3)).grams;
    const rode = await figureOf(0, 3, 150, vik);
    expect(await totalsOf(jon)).toEqual({
      grams: droveGrams + rode.grams,
      asPassenger: { grams: rode.grams, rides: 1 },
      asDriver: { grams: droveGrams, rides: 1, passengers: 2 },
    });
    const gunnaRode = (await figureOf(0, 2)).grams + (await figureOf(1, 3, 150, vik)).grams;
    expect(await totalsOf(gunna)).toEqual({
      grams: gunnaRode,
      asPassenger: { grams: gunnaRode, rides: 2 },
      asDriver: null,
    });
  });

  it("are hidden while the operator's value is 0, and only for someone signed in", async () => {
    const { jon, gunna, sigga } = await aFullRide();
    await completeTheTrip(jon, gunna, sigga);
    api.fixSetting("co2_grams_per_car_km", 0);
    expect(await totalsOf(gunna)).toEqual({ grams: 0, asPassenger: null, asDriver: null });
    expect(await api.client.call(myCo2Route, {})).toMatchObject({ ok: false, status: 401 });
  });
});

describe("the apps' values", () => {
  it("give the grams per car km, for About's method", async () => {
    expect(await api.client.call(configRoute, {})).toMatchObject({
      ok: true,
      data: { co2GramsPerCarKm: 150 },
    });
  });
});
