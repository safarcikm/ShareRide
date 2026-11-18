import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { err, ok } from "../result.ts";
import {
  canOverrule,
  canUndoOverrule,
  checkOverruleNote,
  defaultReliabilitySettings as settings,
  driverBookingRecord,
  driverTripRecord,
  passengerRecord,
  passengerWasDue,
  reliabilityOf,
  reliabilitySince,
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
  const booking = {
    cancelledBy: null,
    countsOnReliability: false,
    reportOutcome: null,
    at: now,
  } as const;

  it("counts a completed booking as kept and a no-show that stands as not, for the passenger", () => {
    expect(passengerRecord({ ...booking, status: "completed" })).toEqual(kept("passenger", 0));
    expect(passengerRecord({ ...booking, status: "no_show", reportOutcome: "stands" })).toEqual(
      broken("passenger", 0),
    );
  });

  it("leaves out a no-show while the passenger can still answer or the operator decides (R8.6)", () => {
    expect(passengerRecord({ ...booking, status: "no_show" })).toBeNull();
  });

  it("counts a passenger's report that the driver didn't come, found to be their own no-show (decision 5)", () => {
    expect(
      passengerRecord({ ...booking, status: "no_show", reportOutcome: "passenger_absent" }),
    ).toEqual(broken("passenger", 0));
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
    const trip = { countsOnReliability: false, passengersDue: 2, at: now } as const;
    expect(driverTripRecord({ ...trip, status: "completed" })).toEqual(kept("driver", 0));
    expect(driverTripRecord({ ...trip, status: "completed", passengersDue: 0 })).toBeNull();
    expect(driverTripRecord({ ...trip, status: "cancelled" })).toBeNull();
    expect(driverTripRecord({ ...trip, status: "cancelled", countsOnReliability: true })).toEqual(
      broken("driver", 0),
    );
    expect(driverTripRecord({ ...trip, status: "published" })).toBeNull();
  });

  it("has the driver due for a completed booking or a no-show that stands, nothing else", () => {
    expect(passengerWasDue({ status: "completed", reportOutcome: null })).toBe(true);
    expect(passengerWasDue({ status: "no_show", reportOutcome: "stands" })).toBe(true);
    expect(passengerWasDue({ status: "no_show", reportOutcome: "passenger_absent" })).toBe(true);
    // Still open to an answer, or the operator's decision.
    expect(passengerWasDue({ status: "no_show", reportOutcome: null })).toBe(false);
    expect(passengerWasDue({ status: "cancelled", reportOutcome: "left_behind" })).toBe(false);
  });

  it("lets the operator overrule a cancellation that doesn't count only for its reason (R8.11)", () => {
    expect(canOverrule({ countsOnReliability: false, excusedByReason: true })).toBe(true);
    // Too early to count whatever the reason, or already counting.
    expect(canOverrule({ countsOnReliability: false, excusedByReason: false })).toBe(false);
    expect(canOverrule({ countsOnReliability: true, excusedByReason: false })).toBe(false);
    // Overruled already.
    expect(canOverrule({ countsOnReliability: true, excusedByReason: true })).toBe(false);
  });

  it("lets the operator undo an overrule, and only that", () => {
    expect(canUndoOverrule({ countsOnReliability: true, excusedByReason: true })).toBe(true);
    expect(canUndoOverrule({ countsOnReliability: false, excusedByReason: true })).toBe(false);
    // It counts for another reason: not the operator's to undo.
    expect(canUndoOverrule({ countsOnReliability: true, excusedByReason: false })).toBe(false);
  });

  it("needs a note of up to 500 characters for either", () => {
    expect(checkOverruleNote("  Clear skies all day.  ")).toEqual(ok("Clear skies all day."));
    expect(checkOverruleNote(" \n ")).toEqual(err({ code: "note_missing" }));
    expect(checkOverruleNote("þ".repeat(500))).toEqual(ok("þ".repeat(500)));
    expect(checkOverruleNote("þ".repeat(501))).toEqual(err({ code: "note_too_long" }));
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

  it("starts the period 12 months back, on that month's last day when it is shorter", () => {
    expect(reliabilitySince(now, settings)).toEqual(new Date("2025-11-20T12:00:00Z"));
    const leapDay = new Date("2028-02-29T08:00:00Z");
    expect(reliabilitySince(leapDay, settings)).toEqual(new Date("2027-02-28T08:00:00Z"));
  });

  it("puts people below 80% on the operator's watch list, never anyone without a figure", () => {
    const records = [kept("driver"), kept("driver"), kept("driver"), broken("driver")];
    expect(reliabilityOf(records, now, settings).belowWatchLevel).toBe(false);
    expect(reliabilityOf([...records, broken("passenger")], now, settings).belowWatchLevel).toBe(
      true,
    );
  });

  it("watches from just below 80%: 80% is not on the list, 79% is", () => {
    const keptOf = (k: number) => [
      ...Array.from({ length: k }, () => kept("passenger")),
      ...Array.from({ length: 100 - k }, () => broken("passenger")),
    ];
    expect(reliabilityOf(keptOf(80), now, settings)).toMatchObject({
      percent: 80,
      belowWatchLevel: false,
    });
    expect(reliabilityOf(keptOf(79), now, settings)).toMatchObject({
      percent: 79,
      belowWatchLevel: true,
    });
  });

  it("goes back 12 months to the same day, or the month's last day when it has none", () => {
    const leapDay = new Date("2028-02-29T12:00:00Z");
    const records = [
      { role: "driver", at: new Date("2027-02-28T11:59:59Z"), kept: false },
      { role: "driver", at: new Date("2027-02-28T12:00:00Z"), kept: true },
    ] as const;
    expect(reliabilityOf(records, leapDay, settings)).toMatchObject({ kept: 1, counted: 1 });
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
