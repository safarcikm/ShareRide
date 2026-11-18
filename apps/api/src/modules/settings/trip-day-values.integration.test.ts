import {
  bookingRoute,
  type AdminSettings,
  type AdminWatchedPerson,
  type Config,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { tripDaySettingsFrom } from "@shareride/domain";
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
import { moveTripsOn } from "../trips/completion.ts";
import { settingValuesIn } from "./index.ts";

// The trip day's and reliability's values from the settings (spec 10, 3.2;
// ADR 0032; milestone 11, PR 13): all five are read as they are now. One
// database for the whole file: the history cannot be emptied, so each test
// sets what it needs and puts it back.

let api: TestApi;
let operator: { cookie: string };

const { airport, vik } = sampleTrip;
const { bookings } = schema;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  operator = await api.signInOperator();
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

async function send(method: string, path: string, body?: unknown) {
  const response = await api.request(path, {
    method,
    headers: { cookie: operator.cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

/** Sets a setting, unless it has the value already. */
async function set(key: string, value: number) {
  const now = (await send("GET", "/admin/v1/settings")).body as AdminSettings;
  if (now.settings.find((setting) => setting.key === key)?.value === value) return;
  const changed = await send("PATCH", `/admin/v1/settings/${key}`, {
    value,
    reason: "A test.",
    version: now.version,
  });
  if (changed.status !== 200) throw new Error(JSON.stringify(changed.body));
}

/** A paid booking of a new member on `tripId`, from its first stop to its second. */
async function paidRide(name: string, tripId: string) {
  const member = await newMember(name);
  const booking = await booked(member.accessToken, tripId, { fromStop: 0, toStop: 1 });
  await paid(member.accessToken, booking.id);
  return { member, bookingId: booking.id };
}

async function tripDayOf(member: Member, id: string) {
  const booking = await api.client.call(bookingRoute, {
    accessToken: member.accessToken,
    params: { id },
  });
  if (!booking.ok) throw new Error(booking.error.code);
  return booking.data.tripDay;
}

describe("the trip day's values (R8.1, R8.4)", () => {
  it("has the no-show wait and the completion delay as they are now, for a trip already booked", async () => {
    await set("no_show_wait", 10);
    await set("trip_completion_delay", 2);
    await driverOf(airport, "Jón");
    const { member: gunna, bookingId } = await paidRide("Gunna", airport);
    const stops = await api.connection.db
      .select({ plannedAt: schema.tripStops.plannedAt })
      .from(schema.tripStops)
      .where(eq(schema.tripStops.tripId, airport))
      .orderBy(asc(schema.tripStops.position));
    const first = stops[0]?.plannedAt;
    const last = stops.at(-1)?.plannedAt;
    if (first === undefined || first === null || last === undefined || last === null) {
      throw new Error("No stops.");
    }
    const minutesFrom = (time: Date, minutes: number) =>
      new Date(time.getTime() + minutes * 60_000).toISOString();

    expect(await tripDayOf(gunna, bookingId)).toMatchObject({
      reportOpensAt: minutesFrom(first, 10),
      noShowClosesAt: minutesFrom(last, 120),
    });

    await set("no_show_wait", 20);
    await set("trip_completion_delay", 3);
    expect(await tripDayOf(gunna, bookingId)).toMatchObject({
      reportOpensAt: minutesFrom(first, 20),
      noShowClosesAt: minutesFrom(last, 180),
    });

    // The job that completes trips, as the server runs it every minute:
    // not after 2 hours any more, and after 3.
    const moveOn = async () =>
      moveTripsOn(
        api.connection.db,
        api.now(),
        tripDaySettingsFrom(await settingValuesIn(api.connection.db)),
      );
    await later((last.getTime() - api.now().getTime()) / 1000 + 150 * 60, gunna);
    expect((await moveOn()).completed).toBe(0);
    await later(31 * 60, gunna);
    expect((await moveOn()).completed).toBe(1);

    operator = await api.signInOperator();
    await set("no_show_wait", 10);
    await set("trip_completion_delay", 2);
  });
});

describe("reliability's values (R8.10; spec 8, 3.8.4)", () => {
  it("watches by the level, shows a figure from the count and tells the apps the period, as they are now", async () => {
    const { db } = api.connection;
    await driverOf(airport, "Anna");
    const gunna = await paidRide("Gunna", airport);
    const dora = await paidRide("Dóra", airport);
    await driverOf(vik, "Jón");
    const copies = async (bookingId: string, kept: number, broken: number) => {
      const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (row === undefined) throw new Error("No such booking.");
      const copy = (changes: Partial<typeof bookings.$inferInsert>) =>
        db
          .insert(bookings)
          .values({ ...row, id: crypto.randomUUID(), attemptKey: crypto.randomUUID(), ...changes });
      for (let made = 0; made < kept; made += 1) {
        await copy({ status: "completed", completedAt: api.now() });
      }
      for (let made = 0; made < broken; made += 1) {
        await copy({
          status: "cancelled",
          cancelledAt: api.now(),
          cancelledBy: "passenger",
          countsOnReliability: true,
        });
      }
    };
    // Gunna kept 3 of 5 (60%) and Dóra 4 of 5 (80%).
    await copies(gunna.bookingId, 3, 2);
    await copies(dora.bookingId, 4, 1);
    const watch = async () =>
      (await send("GET", "/admin/v1/reliability/watch")).body as {
        watchPercent: number;
        periodMonths: number;
        people: AdminWatchedPerson[];
      };
    const config = async () => (await (await api.request("/v1/config")).json()) as Config;

    const before = await watch();
    expect(before).toMatchObject({ watchPercent: 80, periodMonths: 12 });
    expect(before.people.map((person) => person.firstName)).toEqual(["Gunna"]);
    expect((await config()).reliabilityMonths).toBe(12);

    // A higher level watches Dóra too.
    await set("reliability_watch_level", 85);
    const higher = await watch();
    expect(higher.watchPercent).toBe(85);
    expect(higher.people.map((person) => person.firstName)).toEqual(["Gunna", "Dóra"]);

    // Shown from 6 that count: neither has a figure, so neither is watched.
    await set("reliability_min_count", 6);
    expect((await watch()).people).toEqual([]);

    await set("reliability_period", 6);
    expect((await watch()).periodMonths).toBe(6);
    expect((await config()).reliabilityMonths).toBe(6);
    expect(
      ((await send("GET", "/admin/v1/reliability/cancellations")).body as { periodMonths: number })
        .periodMonths,
    ).toBe(6);

    await set("reliability_watch_level", 80);
    await set("reliability_min_count", 5);
    await set("reliability_period", 12);
  });
});
