import { describe, expect, it } from "vitest";
import {
  addCo2Totals,
  bookingCo2,
  co2GramsFor,
  co2TotalGrams,
  estimatedCo2Grams,
  noCo2,
  partDistanceM,
  shownKilograms,
  tripCo2,
  type Co2Totals,
} from "./co2.ts";

describe("partDistanceM", () => {
  const stretches = [120_000, 269_000, 50_000];

  it("adds the stretches from where the passenger gets in to where they get out", () => {
    expect(partDistanceM(stretches, 0, 2)).toBe(389_000);
    expect(partDistanceM(stretches, 1, 3)).toBe(319_000);
  });

  it("never counts the stretch that starts where the passenger gets out", () => {
    expect(partDistanceM(stretches, 0, 1)).toBe(120_000);
  });
});

describe("co2GramsFor", () => {
  it("is the road kilometres times the grams per car kilometre", () => {
    // BSÍ to Hof, Akureyri (spec 34, 3.2).
    expect(co2GramsFor(389_000, 150)).toBe(58_350);
  });

  it("rounds to whole grams", () => {
    expect(co2GramsFor(389_123, 150)).toBe(58_368);
  });

  it("is nothing with the setting at 0", () => {
    expect(co2GramsFor(389_000, 0)).toBe(0);
  });

  it("counts two seats as one car: it takes the part alone, never the seats (R34.1)", () => {
    expect(co2GramsFor.length).toBe(2);
  });
});

describe("shownKilograms", () => {
  it("shows whole kilograms, rounded down", () => {
    expect(shownKilograms(58_350)).toBe(58);
    expect(shownKilograms(1_000)).toBe(1);
  });

  it("shows nothing under 1 kg, at 0 or without a figure (R34.7)", () => {
    expect(shownKilograms(999)).toBeNull();
    expect(shownKilograms(0)).toBeNull();
    expect(shownKilograms(null)).toBeNull();
  });
});

describe("totals", () => {
  const rode = (grams: number): Co2Totals => ({
    ...noCo2,
    asPassenger: { grams, rides: 1 },
  });
  const drove = (grams: number, passengers: number): Co2Totals => ({
    ...noCo2,
    asDriver: { grams, rides: 1, passengers },
  });

  it("adds each role field by field", () => {
    expect(addCo2Totals([rode(58_350), rode(7_650), drove(95_100, 2)])).toEqual({
      asPassenger: { grams: 66_000, rides: 2 },
      asDriver: { grams: 95_100, rides: 1, passengers: 2 },
    });
  });

  it("is nothing for no totals", () => {
    expect(addCo2Totals([])).toEqual(noCo2);
    expect(noCo2).toEqual({
      asPassenger: { grams: 0, rides: 0 },
      asDriver: { grams: 0, rides: 0, passengers: 0 },
    });
  });

  it("gives the grams of both roles together", () => {
    expect(co2TotalGrams(addCo2Totals([rode(66_000), drove(95_100, 2)]))).toBe(161_100);
  });
});

describe("estimatedCo2Grams", () => {
  it("estimates a part before the ride, and nothing at 0 (3.5)", () => {
    expect(estimatedCo2Grams(389_000, 150)).toBe(58_350);
    expect(estimatedCo2Grams(389_000, 0)).toBeNull();
  });
});

describe("bookingCo2", () => {
  const part = { distanceM: 389_000, storedGrams: null };

  it("estimates a confirmed booking at the setting now", () => {
    expect(bookingCo2({ ...part, status: "confirmed" }, 120)).toEqual({
      distanceM: 389_000,
      grams: 46_680,
    });
  });

  it("gives a completed booking the grams it kept, whatever the setting now (R34.2)", () => {
    expect(bookingCo2({ ...part, status: "completed", storedGrams: 58_350 }, 120)).toEqual({
      distanceM: 389_000,
      grams: 58_350,
    });
  });

  it("gives nothing for a booking that does not count, or at 0 (R34.3, R34.7)", () => {
    for (const status of ["requested", "accepted", "cancelled", "expired", "no_show"] as const) {
      expect(bookingCo2({ ...part, status }, 150)).toBeNull();
    }
    expect(bookingCo2({ ...part, status: "completed", storedGrams: 58_350 }, 0)).toBeNull();
    expect(bookingCo2({ ...part, status: "confirmed" }, 0)).toBeNull();
    expect(bookingCo2({ ...part, status: "completed" }, 150)).toBeNull();
  });
});

describe("tripCo2", () => {
  it("adds the bookings that count on a driver's ride (3.7)", () => {
    expect(
      tripCo2(
        [
          { status: "completed", distanceM: 389_000, storedGrams: 58_350 },
          { status: "confirmed", distanceM: 245_000, storedGrams: null },
          { status: "cancelled", distanceM: 100_000, storedGrams: null },
        ],
        150,
      ),
    ).toEqual({ distanceM: 634_000, grams: 95_100 });
  });

  it("is nothing with no booking that counts, or at 0", () => {
    expect(tripCo2([{ status: "cancelled", distanceM: 1, storedGrams: null }], 150)).toBeNull();
    expect(tripCo2([], 150)).toBeNull();
    expect(
      tripCo2([{ status: "completed", distanceM: 389_000, storedGrams: 58_350 }], 0),
    ).toBeNull();
  });
});
