import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  peopleColourCount,
  peopleColourOf,
  tripPageOpen,
  tripPart,
  type PartChoice,
} from "./details.ts";
import { defaultSearchSettings, freeSeats, partPrice, type SearchableTrip } from "./search.ts";

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
    { price: 1100, occupancy: 1 },
    { price: 2900, occupancy: 2 },
    { price: 2000, occupancy: 0 },
  ],
};

const part = (choice: Partial<PartChoice> = {}, trip = northTrip, viewerId: string | null = null) =>
  tripPart(trip, { seats: 1, ...choice }, viewerId, now, settings);

describe("tripPart (spec 4, 3.6)", () => {
  it("is the whole trip when no stops are chosen", () => {
    expect(part()).toEqual({
      ok: true,
      value: {
        board: 0,
        alight: 3,
        seats: 1,
        freeSeats: 1,
        pricePerSeat: kr(6000),
        total: kr(6000),
        state: "open",
      },
    });
  });

  it("prices the chosen part for the seats asked for, with the seats free on all of it", () => {
    expect(part({ board: 2, alight: 3, seats: 3 })).toEqual({
      ok: true,
      value: {
        board: 2,
        alight: 3,
        seats: 3,
        freeSeats: 3,
        pricePerSeat: kr(2000),
        total: kr(6000),
        state: "open",
      },
    });
  });

  it("runs to the last stop from a chosen boarding stop, and from the first to a chosen alighting stop", () => {
    expect(part({ board: 1 })).toMatchObject({ ok: true, value: { board: 1, alight: 3 } });
    expect(part({ alight: 2 })).toMatchObject({ ok: true, value: { board: 0, alight: 2 } });
  });

  it("refuses a part that does not run forwards between two of the trip's stops", () => {
    const refused = (choice: Partial<PartChoice>) => part(choice);
    expect(refused({ board: 3 })).toEqual({
      ok: false,
      error: { code: "invalid_part", end: "board" },
    });
    expect(refused({ board: 4, alight: 5 })).toEqual({
      ok: false,
      error: { code: "invalid_part", end: "board" },
    });
    expect(refused({ alight: 0 })).toEqual({
      ok: false,
      error: { code: "invalid_part", end: "alight" },
    });
    expect(refused({ alight: 4 })).toEqual({
      ok: false,
      error: { code: "invalid_part", end: "alight" },
    });
    expect(refused({ board: 2, alight: 1 })).toEqual({
      ok: false,
      error: { code: "invalid_part", end: "alight" },
    });
    expect(refused({ board: 2, alight: 2 })).toEqual({
      ok: false,
      error: { code: "invalid_part", end: "alight" },
    });
  });

  it("is full when fewer seats are free on the part than asked for", () => {
    expect(part({ board: 1, alight: 2, seats: 2 })).toMatchObject({
      ok: true,
      value: { freeSeats: 1, total: kr(5800), state: "full" },
    });
    const taken = {
      ...northTrip,
      segments: northTrip.segments.map((s) => ({ ...s, occupancy: 3 })),
    };
    expect(part({}, taken)).toMatchObject({ ok: true, value: { freeSeats: 0, state: "full" } });
  });

  it("closes 15 minutes before the boarding stop, and has departed once the boarding stop is passed", () => {
    // Borgarnes is at 10:00.
    const nearly = { board: 1, alight: 2 };
    const before = (minutes: number) =>
      new Date(at("2026-11-15T10:00:00Z").getTime() - minutes * 60_000);
    const stateAt = (moment: Date) => {
      const found = tripPart(northTrip, { ...nearly, seats: 1 }, null, moment, settings);
      return found.ok ? found.value.state : found.error.code;
    };
    // As in search: open until the cut-off, closed from it.
    expect(stateAt(new Date(before(15).getTime() - 1))).toBe("open");
    expect(stateAt(before(15))).toBe("closed");
    expect(stateAt(before(14))).toBe("closed");
    expect(stateAt(before(0))).toBe("departed");
    // A later boarding stop can still be booked after the trip has left Reykjavík,
    // with the trip under way or not (rule S4, Martin 2026-11-16).
    expect(stateAt(before(55))).toBe("open");
  });

  it("names a cancelled trip, a departed one and the driver's own", () => {
    expect(part({}, { ...northTrip, status: "cancelled" })).toMatchObject({
      value: { state: "cancelled" },
    });
    // Under way, the boarding stop decides (rule S4, Martin 2026-11-16).
    const underWay = { ...northTrip, status: "departed" as const };
    const halfPastNine = at("2026-11-15T09:30:00Z");
    expect(
      tripPart(underWay, { board: 0, alight: 3, seats: 1 }, null, halfPastNine, settings),
    ).toMatchObject({
      value: { state: "departed" },
    });
    expect(
      tripPart(underWay, { board: 1, alight: 3, seats: 1 }, null, halfPastNine, settings),
    ).toMatchObject({
      value: { state: "open" },
    });
    expect(part({}, { ...northTrip, status: "completed" })).toMatchObject({
      value: { state: "departed" },
    });
    expect(part({}, northTrip, "driver-anna")).toMatchObject({ value: { state: "own" } });
    expect(part({}, northTrip, "someone-else")).toMatchObject({ value: { state: "open" } });
  });

  it("follows rules P1 and S3 for every part", () => {
    const stretches = fc.array(
      fc.record({
        price: fc.integer({ min: 0, max: 20_000 }),
        occupancy: fc.integer({ min: 0, max: 4 }),
      }),
      { minLength: 1, maxLength: 8 },
    );
    fc.assert(
      fc.property(
        stretches,
        fc.nat(),
        fc.nat(),
        fc.integer({ min: 1, max: 4 }),
        (segments, a, b, seats) => {
          const trip: SearchableTrip = {
            ...northTrip,
            capacity: 4,
            segments,
            stops: [...segments, null].map((_, index) => ({
              meetingPointId: `point-${String(index)}`,
              plannedAt: new Date(at("2026-11-20T08:00:00Z").getTime() + index * 3_600_000),
            })),
          };
          const board = a % segments.length;
          const alight = board + 1 + (b % (segments.length - board));
          const found = tripPart(trip, { board, alight, seats }, null, now, settings);
          const prices = segments.map((segment) => segment.price);
          const occupancy = segments.map((segment) => segment.occupancy);
          expect(found).toMatchObject({
            ok: true,
            value: {
              freeSeats: freeSeats(4, occupancy, board, alight),
              pricePerSeat: kr(partPrice(prices, board, alight)),
              total: kr(seats * partPrice(prices, board, alight)),
            },
          });
        },
      ),
    );
  });
});

describe("peopleColourOf (spec 15, 5.3)", () => {
  it("gives a driver the same colour every time, and spreads drivers over all five", () => {
    const id = "0190a1d6-0000-7000-8000-0000000000d1";
    expect(peopleColourOf(id)).toBe(peopleColourOf(id));
    const colours = new Set(
      Array.from({ length: 50 }, (_, n) =>
        peopleColourOf(`0190a1d6-0000-7000-8000-${String(n).padStart(12, "0")}`),
      ),
    );
    expect(colours).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(peopleColourCount).toBe(5);
  });
});

describe("tripPageOpen (spec 4, R4.6; Q17)", () => {
  const lastStopAt = at("2026-11-15T14:00:00Z");
  const days = (n: number) => new Date(lastStopAt.getTime() + n * 86_400_000);

  it("keeps a trip's page open until a week after its last stop, whatever its status", () => {
    for (const status of ["published", "departed", "completed", "cancelled"] as const) {
      expect(tripPageOpen({ status, lastStopAt }, days(7), settings)).toBe(true);
      expect(tripPageOpen({ status, lastStopAt }, days(7.01), settings)).toBe(false);
    }
  });

  it("never opens a draft", () => {
    expect(tripPageOpen({ status: "draft", lastStopAt }, now, settings)).toBe(false);
  });
});
