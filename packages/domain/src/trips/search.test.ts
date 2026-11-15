import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  defaultSearchSettings,
  freeSeats,
  matchTrip,
  partPrice,
  searchDaysAround,
  timeOfDay,
  type SearchableTrip,
  type TripSearch,
} from "./search.ts";

const settings = defaultSearchSettings;
const kr = (amount: number) => ({ amount, currency: "ISK" as const });
// Saturday 14 November 2026, noon in Iceland (which keeps UTC).
const now = new Date("2026-11-14T12:00:00Z");
const at = (iso: string) => new Date(iso);

/** Reykjavík to Akureyri through Borgarnes and Blönduós, on Sunday morning. */
const northTrip: SearchableTrip = {
  id: "trip-north",
  driverId: "driver-anna",
  status: "published",
  capacity: 3,
  stops: [
    { meetingPointId: "bsi", plannedAt: at("2026-11-15T09:00:00Z") },
    { meetingPointId: "borgarnes", plannedAt: at("2026-11-15T10:00:00Z") },
    { meetingPointId: "blonduos", plannedAt: at("2026-11-15T12:00:00Z") },
    { meetingPointId: "hof", plannedAt: at("2026-11-15T14:00:00Z") },
  ],
  segments: [
    { price: 1100, occupancy: 0 },
    { price: 2900, occupancy: 0 },
    { price: 2000, occupancy: 0 },
  ],
};

const search = (changes: Partial<TripSearch> = {}): TripSearch => ({
  from: [{ meetingPointId: "borgarnes", distanceM: 0 }],
  to: [{ meetingPointId: "blonduos", distanceM: 0 }],
  date: null,
  timeOfDay: null,
  seats: 1,
  searcherId: null,
  ...changes,
});

describe("matchTrip (spec 4, R4.1)", () => {
  it("finds Reykjavík to Akureyri for Borgarnes to Blönduós, with that part's price", () => {
    expect(matchTrip(northTrip, search(), now, settings)).toEqual({
      board: 1,
      alight: 2,
      boardDistanceM: 0,
      alightDistanceM: 0,
      freeSeats: 3,
      pricePerSeat: kr(2900),
      total: kr(2900),
    });
  });

  it("does not match the opposite direction", () => {
    const back = search({
      from: [{ meetingPointId: "blonduos", distanceM: 0 }],
      to: [{ meetingPointId: "borgarnes", distanceM: 0 }],
    });
    expect(matchTrip(northTrip, back, now, settings)).toBeNull();
  });

  it("matches only published trips", () => {
    for (const status of ["draft", "departed", "completed", "cancelled"] as const) {
      expect(matchTrip({ ...northTrip, status }, search(), now, settings)).toBeNull();
    }
  });

  it("takes the date from the boarding stop in Iceland, not from the trip's start", () => {
    // Leaves Reykjavík before midnight; reaches Borgarnes after it.
    const night: SearchableTrip = {
      ...northTrip,
      stops: [
        { meetingPointId: "bsi", plannedAt: at("2026-11-15T23:30:00Z") },
        { meetingPointId: "borgarnes", plannedAt: at("2026-11-16T00:30:00Z") },
        { meetingPointId: "blonduos", plannedAt: at("2026-11-16T02:30:00Z") },
        { meetingPointId: "hof", plannedAt: at("2026-11-16T04:30:00Z") },
      ],
    };
    const monday = { year: 2026, month: 11, day: 16 };
    const sunday = { year: 2026, month: 11, day: 15 };
    expect(matchTrip(night, search({ date: monday }), now, settings)).not.toBeNull();
    expect(matchTrip(night, search({ date: sunday }), now, settings)).toBeNull();
    const fromReykjavik = search({ from: [{ meetingPointId: "bsi", distanceM: 0 }] });
    expect(matchTrip(night, { ...fromReykjavik, date: sunday }, now, settings)).not.toBeNull();
  });

  it("matches every upcoming trip without a date", () => {
    expect(matchTrip(northTrip, search({ date: null }), now, settings)).not.toBeNull();
  });

  it("stops matching 15 minutes before the boarding stop (rule S4)", () => {
    const boarding = northTrip.stops[1]?.plannedAt.getTime() ?? 0;
    const minutesBefore = (minutes: number) => new Date(boarding - minutes * 60_000);
    expect(matchTrip(northTrip, search(), minutesBefore(15), settings)).not.toBeNull();
    expect(matchTrip(northTrip, search(), minutesBefore(14), settings)).toBeNull();
  });

  it("needs the seats free on every stretch of the part (rule S3)", () => {
    // The worked example in pricing and seats, after step 3: A→B and B→C full.
    const occupied: SearchableTrip = {
      ...northTrip,
      segments: northTrip.segments.map((segment, index) => ({
        ...segment,
        occupancy: [3, 3, 1][index] ?? 0,
      })),
    };
    const bToD = search({
      from: [{ meetingPointId: "borgarnes", distanceM: 0 }],
      to: [{ meetingPointId: "hof", distanceM: 0 }],
    });
    expect(matchTrip(occupied, bToD, now, settings)).toBeNull();
    const cToD = search({
      from: [{ meetingPointId: "blonduos", distanceM: 0 }],
      to: [{ meetingPointId: "hof", distanceM: 0 }],
      seats: 2,
    });
    expect(matchTrip(occupied, cToD, now, settings)).toMatchObject({
      freeSeats: 2,
      pricePerSeat: kr(2000),
      total: kr(4000),
    });
    expect(matchTrip(occupied, { ...cToD, seats: 3 }, now, settings)).toBeNull();
  });

  it("never shows drivers their own trips", () => {
    expect(matchTrip(northTrip, search({ searcherId: "driver-anna" }), now, settings)).toBeNull();
    expect(matchTrip(northTrip, search({ searcherId: "someone" }), now, settings)).not.toBeNull();
  });

  it("boards and alights at the stops closest to what was searched", () => {
    // "Reykjavík" covers both capital stops; the one nearer the centre wins.
    const capital: SearchableTrip = {
      ...northTrip,
      stops: [
        { meetingPointId: "bsi", plannedAt: at("2026-11-15T09:00:00Z") },
        { meetingPointId: "mjodd", plannedAt: at("2026-11-15T09:20:00Z") },
        { meetingPointId: "borgarnes", plannedAt: at("2026-11-15T10:20:00Z") },
        { meetingPointId: "hof", plannedAt: at("2026-11-15T14:00:00Z") },
      ],
    };
    const fromReykjavik = search({
      from: [
        { meetingPointId: "mjodd", distanceM: 2100 },
        { meetingPointId: "bsi", distanceM: 900 },
      ],
      to: [{ meetingPointId: "hof", distanceM: 0 }],
    });
    expect(matchTrip(capital, fromReykjavik, now, settings)).toMatchObject({
      board: 0,
      alight: 3,
      boardDistanceM: 900,
      pricePerSeat: kr(6000),
    });
  });

  it("skips a nearer boarding stop that is already too close to leaving", () => {
    const capital: SearchableTrip = {
      ...northTrip,
      stops: [
        { meetingPointId: "bsi", plannedAt: at("2026-11-14T12:10:00Z") },
        { meetingPointId: "mjodd", plannedAt: at("2026-11-14T12:30:00Z") },
        { meetingPointId: "hof", plannedAt: at("2026-11-14T17:00:00Z") },
      ],
      segments: [
        { price: 500, occupancy: 0 },
        { price: 6000, occupancy: 0 },
      ],
    };
    const fromReykjavik = search({
      from: [
        { meetingPointId: "bsi", distanceM: 0 },
        { meetingPointId: "mjodd", distanceM: 2100 },
      ],
      to: [{ meetingPointId: "hof", distanceM: 0 }],
    });
    expect(matchTrip(capital, fromReykjavik, now, settings)).toMatchObject({
      board: 1,
      boardDistanceM: 2100,
    });
  });

  it("keeps to the time of day at the boarding stop, boarding later if that fits", () => {
    const evening: SearchableTrip = {
      ...northTrip,
      stops: [
        { meetingPointId: "bsi", plannedAt: at("2026-11-15T17:50:00Z") },
        { meetingPointId: "mjodd", plannedAt: at("2026-11-15T18:05:00Z") },
        { meetingPointId: "hof", plannedAt: at("2026-11-15T22:30:00Z") },
      ],
      segments: [
        { price: 500, occupancy: 0 },
        { price: 6000, occupancy: 0 },
      ],
    };
    const fromReykjavik = search({
      from: [
        { meetingPointId: "bsi", distanceM: 900 },
        { meetingPointId: "mjodd", distanceM: 2100 },
      ],
      to: [{ meetingPointId: "hof", distanceM: 0 }],
    });
    expect(matchTrip(evening, fromReykjavik, now, settings)).toMatchObject({ board: 0 });
    expect(
      matchTrip(evening, { ...fromReykjavik, timeOfDay: "afternoon" }, now, settings),
    ).toMatchObject({ board: 0 });
    expect(
      matchTrip(evening, { ...fromReykjavik, timeOfDay: "evening" }, now, settings),
    ).toMatchObject({ board: 1, pricePerSeat: kr(6000) });
    expect(
      matchTrip(evening, { ...fromReykjavik, timeOfDay: "morning" }, now, settings),
    ).toBeNull();
  });

  // Random trips and searches: what any match must satisfy.
  const trips = fc.integer({ min: 2, max: 8 }).chain((stopCount) =>
    fc.record({
      capacity: fc.integer({ min: 1, max: 8 }),
      gapsMinutes: fc.array(fc.integer({ min: 1, max: 600 }), {
        minLength: stopCount,
        maxLength: stopCount,
      }),
      prices: fc.array(fc.integer({ min: 0, max: 20 }), {
        minLength: stopCount - 1,
        maxLength: stopCount - 1,
      }),
      taken: fc.array(fc.integer({ min: 0, max: 8 }), {
        minLength: stopCount - 1,
        maxLength: stopCount - 1,
      }),
      from: fc.subarray(Array.from({ length: stopCount }, (_, index) => index)),
      to: fc.subarray(Array.from({ length: stopCount }, (_, index) => index)),
      seats: fc.integer({ min: 1, max: 8 }),
    }),
  );

  it("always boards before it alights, at covered stops, with S3 seats and the P1 price", () => {
    fc.assert(
      fc.property(trips, (drawn) => {
        let minutes = 0;
        const trip: SearchableTrip = {
          ...northTrip,
          capacity: drawn.capacity,
          stops: drawn.gapsMinutes.map((gap, index) => {
            minutes += gap;
            return {
              meetingPointId: `point-${String(index)}`,
              plannedAt: new Date(now.getTime() + (20 + minutes) * 60_000),
            };
          }),
          segments: drawn.prices.map((price, index) => ({
            price: price * 100,
            occupancy: Math.min(drawn.capacity, drawn.taken[index] ?? 0),
          })),
        };
        const covered = (indexes: number[]) =>
          indexes.map((index) => ({ meetingPointId: `point-${String(index)}`, distanceM: index }));
        const found = matchTrip(
          trip,
          search({ from: covered(drawn.from), to: covered(drawn.to), seats: drawn.seats }),
          now,
          settings,
        );
        if (found === null) return;
        expect(found.board).toBeLessThan(found.alight);
        expect(drawn.from).toContain(found.board);
        expect(drawn.to).toContain(found.alight);
        const part = trip.segments.slice(found.board, found.alight);
        const s3 = trip.capacity - Math.max(...part.map((segment) => segment.occupancy));
        expect(found.freeSeats).toBe(s3);
        expect(found.freeSeats).toBeGreaterThanOrEqual(drawn.seats);
        const p1 = part.reduce((sum, segment) => sum + segment.price, 0);
        expect(found.pricePerSeat).toEqual(kr(p1));
        expect(found.total).toEqual(kr(drawn.seats * p1));
      }),
    );
  });
});

describe("freeSeats and partPrice (rules S3 and P1)", () => {
  it("follow the worked example in pricing and seats", () => {
    const occupancy = [3, 3, 1];
    expect(freeSeats(3, occupancy, 1, 3)).toBe(0);
    expect(freeSeats(3, occupancy, 2, 3)).toBe(2);
    expect(partPrice([1100, 2900, 2000], 0, 3)).toBe(6000);
    expect(partPrice([1100, 2900, 2000], 1, 2)).toBe(2900);
  });
});

describe("timeOfDay", () => {
  it("is morning before noon, afternoon until six and evening after, in Iceland", () => {
    expect(timeOfDay(at("2026-11-15T00:00:00Z"))).toBe("morning");
    expect(timeOfDay(at("2026-11-15T11:59:00Z"))).toBe("morning");
    expect(timeOfDay(at("2026-11-15T12:00:00Z"))).toBe("afternoon");
    expect(timeOfDay(at("2026-11-15T17:59:00Z"))).toBe("afternoon");
    expect(timeOfDay(at("2026-11-15T18:00:00Z"))).toBe("evening");
  });
});

describe("searchDaysAround (R4.7)", () => {
  it("lists the three days either side, over a month's end", () => {
    expect(searchDaysAround({ year: 2026, month: 12, day: 30 }, settings)).toEqual([
      { year: 2026, month: 12, day: 27 },
      { year: 2026, month: 12, day: 28 },
      { year: 2026, month: 12, day: 29 },
      { year: 2026, month: 12, day: 31 },
      { year: 2027, month: 1, day: 1 },
      { year: 2027, month: 1, day: 2 },
    ]);
  });
});
