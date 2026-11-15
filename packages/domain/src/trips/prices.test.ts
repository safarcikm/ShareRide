import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  fitPriceLevel,
  highestPriceLevel,
  isPriceLevel,
  priceCap,
  priceLevels,
  routePrice,
  segmentPrices,
  suggestedPrice,
} from "./prices.ts";
import { defaultTripSettings as settings } from "./settings.ts";

const kr = (amount: number) => ({ amount, currency: "ISK" });
const km = (value: number) => value * 1000;

// The worked example in pricing and seats: Reykjavík (A), Borgarnes (B),
// Blönduós (C), Akureyri (D), 3 seats, 15 kr per km, steps of 100 kr.
const example = [km(74), km(171), km(143)];

describe("suggestedPrice (rule P2)", () => {
  it("is the distance times the suggested rate, to the nearest 100 kr", () => {
    expect(example.map((distanceM) => suggestedPrice(distanceM, settings))).toEqual([
      kr(1100),
      kr(2600),
      kr(2100),
    ]);
  });

  it("rounds halves up", () => {
    // 10 km at 15 kr is 150 kr, half way between 100 and 200.
    expect(suggestedPrice(km(10), settings)).toEqual(kr(200));
    expect(suggestedPrice(9_999, settings)).toEqual(kr(100));
  });
});

describe("priceCap (rule P3)", () => {
  it("shares the reference cost between the seats and the driver", () => {
    // 74 km × 150 kr / 4 = 2 775 kr.
    expect(priceCap(km(74), 3, settings)).toEqual(kr(2800));
    expect(priceCap(km(74), 8, settings)).toEqual(kr(1200));
  });
});

describe("highestPriceLevel (rule P4)", () => {
  it("falls as seats are added", () => {
    // 150 / (4 × 15) = 2.5; 150 / (9 × 15) = 1.11.
    expect(highestPriceLevel(3, settings)).toBe(250);
    expect(highestPriceLevel(8, settings)).toBe(110);
    expect(highestPriceLevel(1, settings)).toBe(500);
  });

  it("lists the levels from free up to the highest, in steps of 10%", () => {
    expect(priceLevels(8, settings)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]);
    expect(isPriceLevel(80, 8, settings)).toBe(true);
    expect(isPriceLevel(85, 8, settings)).toBe(false);
    expect(isPriceLevel(120, 8, settings)).toBe(false);
    expect(isPriceLevel(-10, 8, settings)).toBe(false);
  });

  it("lowers a level above the highest, and says so", () => {
    expect(fitPriceLevel(200, 8, settings)).toEqual({ level: 110, lowered: true });
    expect(fitPriceLevel(100, 8, settings)).toEqual({ level: 100, lowered: false });
  });
});

describe("segmentPrices (rule P4)", () => {
  it("gives the worked example's prices at 100% and 80%", () => {
    const full = segmentPrices(example, 100, 3, settings);
    expect(full).toEqual([kr(1100), kr(2600), kr(2100)]);
    expect(routePrice(full)).toEqual(kr(5800));
    const lower = segmentPrices(example, 80, 3, settings);
    expect(lower).toEqual([kr(900), kr(2100), kr(1700)]);
    expect(routePrice(lower)).toEqual(kr(4700));
  });

  it("is free at 0%", () => {
    expect(routePrice(segmentPrices(example, 0, 3, settings))).toEqual(kr(0));
  });

  const seats = fc.integer({ min: 1, max: settings.maxSeats });
  const distances = fc.array(fc.integer({ min: 0, max: 1_000_000 }), {
    minLength: 1,
    maxLength: 12,
  });

  it("never goes above the cap, and stays in whole steps", () => {
    fc.assert(
      fc.property(distances, seats, (distancesM, seatCount) => {
        const levels = priceLevels(seatCount, settings);
        for (const level of levels) {
          segmentPrices(distancesM, level, seatCount, settings).forEach((price, index) => {
            const cap = priceCap(distancesM[index] ?? 0, seatCount, settings);
            expect(price.amount).toBeGreaterThanOrEqual(0);
            expect(price.amount).toBeLessThanOrEqual(cap.amount);
            expect(price.amount % settings.priceStep).toBe(0);
          });
        }
      }),
    );
  });

  /**
   * A reference for the price at a level before the cap, with BigInt so it
   * shares no arithmetic with the code: distance × rate × level, to the
   * nearest step, halves up.
   */
  const uncapped = (distanceM: number, level: number) => {
    const numerator = BigInt(distanceM * settings.suggestedRatePerKm * level);
    const denominator = 100_000n;
    const step = BigInt(settings.priceStep);
    return Number(((2n * numerator + denominator * step) / (2n * denominator * step)) * step);
  };

  it("only absorbs rounding with the cap at the highest level", () => {
    fc.assert(
      fc.property(distances, seats, (distancesM, seatCount) => {
        const highest = highestPriceLevel(seatCount, settings);
        segmentPrices(distancesM, highest, seatCount, settings).forEach((price, index) => {
          const before = uncapped(distancesM[index] ?? 0, highest);
          expect(before - price.amount).toBeLessThanOrEqual(settings.priceStep);
        });
      }),
    );
  });

  it("would go over the cap of a long segment one step above the highest level", () => {
    const long = fc.integer({ min: 300_000, max: 1_000_000 });
    fc.assert(
      fc.property(long, seats, (distanceM, seatCount) => {
        const above = highestPriceLevel(seatCount, settings) + settings.priceLevelStep;
        expect(uncapped(distanceM, above)).toBeGreaterThan(
          priceCap(distanceM, seatCount, settings).amount,
        );
      }),
    );
  });

  it("never falls when the level rises", () => {
    fc.assert(
      fc.property(distances, seats, (distancesM, seatCount) => {
        const totals = priceLevels(seatCount, settings).map(
          (level) => routePrice(segmentPrices(distancesM, level, seatCount, settings)).amount,
        );
        totals.slice(1).forEach((total, index) => {
          expect(total).toBeGreaterThanOrEqual(totals[index] ?? 0);
        });
      }),
    );
  });
});
