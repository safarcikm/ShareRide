import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  canOverrule,
  defaultReliabilitySettings as settings,
  driverBookingRecord,
  driverTripRecord,
  passengerRecord,
  reliabilityOf,
  type ReliabilityRecord,
} from "./reliability.ts";

const now = new Date("2026-11-20T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const kept = (role: "driver" | "passenger", days = 1): ReliabilityRecord => ({
  role,
  at: daysAgo(days),
  kept: true,
});
const broken = (role: "driver" | "passenger", days = 1): ReliabilityRecord => ({
  role,
  at: daysAgo(days),
  kept: false,
});

describe("what counts on reliability (spec 8, 3.8)", () => {
  const booking = { cancelledBy: null, countsOnReliability: false, at: now } as const;

  it("counts a completed booking as kept and a no-show as not, for the passenger", () => {
    expect(passengerRecord({ ...booking, status: "completed" })).toEqual(kept("passenger", 0));
    expect(passengerRecord({ ...booking, status: "no_show" })).toEqual(broken("passenger", 0));
  });

  it("counts a passenger's cancellation only when it counts (spec 6, R6.8)", () => {
    const cancelled = { ...booking, status: "cancelled", cancelledBy: "passenger" } as const;
    expect(passengerRecord(cancelled)).toBeNull();
    expect(passengerRecord({ ...cancelled, countsOnReliability: true })).toEqual(
      broken("passenger", 0),
    );
  });

  it.each(["requested", "accepted", "confirmed", "declined", "expired"] as const)(
    "leaves out a %s booking",
    (status) => {
      expect(passengerRecord({ ...booking, status })).toBeNull();
      expect(driverBookingRecord({ ...booking, status })).toBeNull();
    },
  );

  it("counts a driver's cancellation of one booking, or an absence that stood, on the driver", () => {
    const cancelled = { ...booking, status: "cancelled", cancelledBy: "driver" } as const;
    expect(driverBookingRecord({ ...cancelled, countsOnReliability: true })).toEqual(
      broken("driver", 0),
    );
    expect(driverBookingRecord(cancelled)).toBeNull();
    expect(passengerRecord({ ...cancelled, countsOnReliability: true })).toBeNull();
  });

  it("counts a completed trip with passengers as kept, and a cancelled trip that counts as not", () => {
    const trip = { countsOnReliability: false, passengersCarried: 2, at: now } as const;
    expect(driverTripRecord({ ...trip, status: "completed" })).toEqual(kept("driver", 0));
    expect(driverTripRecord({ ...trip, status: "completed", passengersCarried: 0 })).toBeNull();
    expect(driverTripRecord({ ...trip, status: "cancelled" })).toBeNull();
    expect(driverTripRecord({ ...trip, status: "cancelled", countsOnReliability: true })).toEqual(
      broken("driver", 0),
    );
    expect(driverTripRecord({ ...trip, status: "published" })).toBeNull();
  });

  it("lets the operator overrule only a weather or road-closure reason (R8.11)", () => {
    expect(canOverrule("weather")).toBe(true);
    expect(canOverrule("road_closed")).toBe(true);
    expect(canOverrule("car_problem")).toBe(false);
    expect(canOverrule(null)).toBe(false);
  });
});

describe("the reliability figure (R8.10)", () => {
  it("is the share kept, across both roles, rounded down", () => {
    const records = [
      ...Array.from({ length: 23 }, () => kept("passenger")),
      kept("driver"),
      broken("driver"),
    ];
    expect(reliabilityOf(records, now, settings)).toEqual({
      kept: 24,
      counted: 25,
      percent: 96,
      byRole: { driver: { kept: 1, counted: 2 }, passenger: { kept: 23, counted: 23 } },
      belowWatchLevel: false,
    });
    const twoOfThree = [kept("driver"), kept("driver"), broken("driver")];
    const five = [...twoOfThree, ...twoOfThree.slice(0, 2)];
    expect(reliabilityOf(five, now, settings).percent).toBe(80);
    expect(reliabilityOf([...five, broken("passenger")], now, settings).percent).toBe(66);
  });

  it("rounds down in whole numbers, so 29 kept of 100 is 29%", () => {
    const records = [
      ...Array.from({ length: 29 }, () => kept("passenger")),
      ...Array.from({ length: 71 }, () => broken("passenger")),
    ];
    expect(reliabilityOf(records, now, settings).percent).toBe(29);
  });

  it("is shown only once 5 count", () => {
    const four = [kept("driver"), kept("driver"), kept("passenger"), broken("passenger")];
    expect(reliabilityOf(four, now, settings)).toMatchObject({ counted: 4, percent: null });
    expect(reliabilityOf([...four, kept("driver")], now, settings)).toMatchObject({
      counted: 5,
      percent: 80,
    });
  });

  it("counts the last 12 months only", () => {
    const old = new Date("2025-11-20T11:59:59Z");
    const edge = new Date("2025-11-20T12:00:00Z");
    const records = [
      { role: "passenger", at: old, kept: false },
      { role: "passenger", at: edge, kept: false },
    ] as const;
    expect(reliabilityOf(records, now, settings)).toMatchObject({ kept: 0, counted: 1 });
  });

  it("puts people below 80% on the operator's watch list, never anyone without a figure", () => {
    const records = [kept("driver"), kept("driver"), kept("driver"), broken("driver")];
    expect(reliabilityOf(records, now, settings).belowWatchLevel).toBe(false);
    expect(reliabilityOf([...records, broken("passenger")], now, settings).belowWatchLevel).toBe(
      true,
    );
  });

  it("always matches the records it comes from", () => {
    const record = fc.record({
      role: fc.constantFrom("driver" as const, "passenger" as const),
      at: fc.date({ min: new Date("2025-01-01T00:00:00Z"), max: now, noInvalidDate: true }),
      kept: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(record), (records) => {
        const since = new Date("2025-11-20T12:00:00Z");
        const recent = records.filter((r) => r.at >= since);
        const figure = reliabilityOf(records, now, settings);
        expect(figure.counted).toBe(recent.length);
        expect(figure.kept).toBe(recent.filter((r) => r.kept).length);
        expect(figure.byRole.driver.counted + figure.byRole.passenger.counted).toBe(figure.counted);
        expect(figure.byRole.driver.kept + figure.byRole.passenger.kept).toBe(figure.kept);
        if (figure.counted < 5) expect(figure.percent).toBeNull();
        else expect(figure.percent).toBe(Math.floor((figure.kept * 100) / figure.counted));
      }),
    );
  });
});
