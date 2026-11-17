import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  fitLevelWithin,
  highestLevelWithin,
  isLevelWithin,
  limitRoom,
  takingsOf,
  tripLimit,
  type TripLoad,
} from "./limit.ts";
import { highestPriceLevel, priceCap, segmentPrices } from "./prices.ts";
import { defaultTripSettings as settings } from "./settings.ts";

const kr = (amount: number) => ({ amount, currency: "ISK" });
const km = (value: number) => value * 1000;

// Spec 17's example: Reykjavík → Borgarnes → Blönduós → Akureyri.
const example = [km(74), km(171), km(143)];
const load = (seats: number, occupancy: number[], takings: number): TripLoad => ({
  distancesM: example,
  occupancy,
  seats,
  takings,
});

describe("tripLimit (rule P3)", () => {
  it("is what a full car pays at the caps", () => {
    expect(tripLimit(example, 3, settings)).toEqual(kr(43_800));
    expect(tripLimit(example, 1, settings)).toEqual(kr(29_100));
    expect(tripLimit(example, 8, settings)).toEqual(kr(52_000));
  });
});

describe("takingsOf (rule P3)", () => {
  const paidAt = new Date("2026-11-14T12:00:00Z");
  const booking = (
    status: string,
    totalPrice: number,
    refundAmount: number | null = null,
    confirmedAt: Date | null = paidAt,
  ) =>
    ({ status, totalPrice, refundAmount, confirmedAt }) as Parameters<typeof takingsOf>[0][number];

  it("counts what each booking pays the driver, less refunds", () => {
    expect(takingsOf([booking("confirmed", 14_600)])).toEqual(kr(14_600));
    expect(takingsOf([booking("no_show", 14_600)])).toEqual(kr(14_600));
    expect(takingsOf([booking("cancelled", 14_600, 14_600)])).toEqual(kr(0));
    expect(takingsOf([booking("cancelled", 14_600, 0)])).toEqual(kr(14_600));
    expect(takingsOf([booking("completed", 14_600, 5_000)])).toEqual(kr(9_600));
  });

  it("counts requests and unpaid bookings, which hold seats", () => {
    expect(takingsOf([booking("requested", 5_800), booking("accepted", 5_800)])).toEqual(
      kr(11_600),
    );
  });

  it("does not count a request withdrawn, or a booking cancelled, before it was paid", () => {
    expect(takingsOf([booking("cancelled", 5_800, null, null)])).toEqual(kr(0));
  });

  it("does not count declined or expired bookings", () => {
    expect(takingsOf([booking("declined", 5_800), booking("expired", 5_800)])).toEqual(kr(0));
  });
});

describe("limitRoom (rule P3)", () => {
  const stretches = [
    { capacity: 3, cap: 2_400 },
    { capacity: 3, cap: 5_600 },
  ];
  const paid = (totalPrice: number, refundAmount: number | null = null) => ({
    status: "confirmed" as const,
    totalPrice,
    refundAmount,
    confirmedAt: new Date("2026-11-14T12:00:00Z"),
  });

  it("is the stored caps' limit less the takings", () => {
    expect(limitRoom(stretches, [])).toEqual(kr(24_000));
    expect(limitRoom(stretches, [paid(8_000), paid(8_000, 3_000)])).toEqual(kr(11_000));
  });

  it("is never below 0", () => {
    expect(limitRoom([{ capacity: 1, cap: 2_400 }], [paid(8_000)])).toEqual(kr(0));
  });
});

describe("highestLevelWithin (rule P4)", () => {
  it("is the seats' level when nothing is booked", () => {
    expect(highestLevelWithin(load(3, [0, 0, 0], 0), settings)).toEqual({
      level: 250,
      limitedBy: "seats",
    });
  });

  it("is the seats' level when the bookings were made with the seats the trip has", () => {
    expect(highestLevelWithin(load(3, [2, 2, 2], 29_200), settings)).toEqual({
      level: 250,
      limitedBy: "seats",
    });
  });

  it("falls after seats are added to a booked trip (spec 17, gap 1)", () => {
    expect(highestLevelWithin(load(3, [1, 1, 1], 29_100), settings)).toEqual({
      level: 120,
      limitedBy: "trip_limit",
    });
  });

  it("is free once kept money has used the limit (spec 17, gap 2)", () => {
    expect(highestLevelWithin(load(3, [1, 1, 1], 43_800), settings)).toEqual({
      level: 0,
      limitedBy: "trip_limit",
    });
  });

  it("hardly moves for a driver at the suggested level after a no-show", () => {
    expect(highestLevelWithin(load(3, [0, 0, 0], 5_800), settings).level).toBe(210);
  });

  it("is 0% without error when fewer seats leave kept money above the limit", () => {
    expect(highestLevelWithin(load(1, [1, 1, 1], 43_800), settings)).toEqual({
      level: 0,
      limitedBy: "trip_limit",
    });
  });

  it("is today's level for any free trip", () => {
    for (let seats = 1; seats <= settings.maxSeats; seats += 1) {
      expect(highestLevelWithin(load(seats, [0, 0, 0], 0), settings).level).toBe(
        highestPriceLevel(seats, settings),
      );
    }
  });

  it("always keeps a full car within the trip limit", () => {
    const trip = fc
      .record({
        distancesM: fc.array(fc.integer({ min: 1_000, max: 400_000 }), {
          minLength: 1,
          maxLength: 6,
        }),
        seats: fc.integer({ min: 1, max: settings.maxSeats }),
        bookedSeats: fc.integer({ min: 0, max: settings.maxSeats }),
        bookedLevel: fc.integer({ min: 0, max: 50 }).map((step) => step * 10),
        bookedWith: fc.integer({ min: 1, max: settings.maxSeats }),
      })
      .filter(({ seats, bookedSeats, bookedWith }) => bookedSeats <= Math.min(seats, bookedWith));
    fc.assert(
      fc.property(trip, ({ distancesM, seats, bookedSeats, bookedLevel, bookedWith }) => {
        // Seats booked on the whole route while the trip had `bookedWith`
        // seats, at a level that number allowed; then it offers `seats`.
        const level = Math.min(bookedLevel, highestPriceLevel(bookedWith, settings));
        const paid = segmentPrices(distancesM, level, bookedWith, settings);
        const takings = bookedSeats * paid.reduce((sum, price) => sum + price.amount, 0);
        const occupancy = distancesM.map(() => bookedSeats);
        const found = highestLevelWithin({ distancesM, occupancy, seats, takings }, settings);
        const limit = tripLimit(distancesM, seats, settings).amount;
        // A full car at level `at`: what is booked, and the free seats at its prices.
        const fits = (at: number) =>
          takings +
            segmentPrices(distancesM, at, seats, settings).reduce(
              (sum, price) => sum + (seats - bookedSeats) * price.amount,
              0,
            ) <=
          limit;
        const top = highestPriceLevel(seats, settings);
        // Within the limit, and the highest step that is: the next one up
        // is above the seats' level or does not fit.
        expect(found.level === 0 || fits(found.level)).toBe(true);
        expect(found.level <= top).toBe(true);
        expect(found.level === top || !fits(found.level + settings.priceLevelStep)).toBe(true);
      }),
    );
  });
});

describe("fitLevelWithin and isLevelWithin (rule P4)", () => {
  const gap1 = load(3, [1, 1, 1], 29_100);

  it("lowers a level above the highest and says why", () => {
    expect(fitLevelWithin(250, gap1, settings)).toEqual({
      level: 120,
      lowered: true,
      limitedBy: "trip_limit",
    });
  });

  it("keeps a level that fits", () => {
    expect(fitLevelWithin(100, gap1, settings)).toEqual({
      level: 100,
      lowered: false,
      limitedBy: "trip_limit",
    });
  });

  it("allows whole steps from free up to the highest", () => {
    expect(isLevelWithin(120, gap1, settings)).toBe(true);
    expect(isLevelWithin(130, gap1, settings)).toBe(false);
    expect(isLevelWithin(0, gap1, settings)).toBe(true);
    expect(isLevelWithin(115, gap1, settings)).toBe(false);
    expect(isLevelWithin(-10, gap1, settings)).toBe(false);
  });

  it("builds the limit from the rounded caps the segments store", () => {
    const caps = example.map((distanceM) => priceCap(distanceM, 3, settings).amount);
    expect(tripLimit(example, 3, settings).amount).toBe(
      3 * caps.reduce((sum, cap) => sum + cap, 0),
    );
    expect(
      limitRoom(
        caps.map((cap) => ({ capacity: 3, cap })),
        [],
      ),
    ).toEqual(tripLimit(example, 3, settings));
  });
});
