// Prices of a trip's segments (pricing and seats, rules P2 to P4). All
// arithmetic is on whole numbers: distances in metres, rates in krónur per
// km, levels in percent, so no price passes through a floating point.
import type { Money } from "../money.ts";
import type { TripSettings } from "./settings.ts";

export type PriceSettings = Pick<
  TripSettings,
  "suggestedRatePerKm" | "referenceCostPerKm" | "priceStep" | "priceLevelStep"
>;

const isk = (amount: number): Money => ({ amount, currency: "ISK" });

/** Rule P4: the level, in percent, at which every segment costs its suggested price. */
export const suggestedPriceLevel = 100;

/**
 * `numerator / denominator` krónur to the nearest whole step, halves up, for
 * values that are not negative.
 */
function toNearestStep(numerator: number, denominator: number, step: number): number {
  return Math.floor((2 * numerator + denominator * step) / (2 * denominator * step)) * step;
}

/** Rule P2: distance × suggested rate, to the nearest price step. */
export function suggestedPrice(distanceM: number, settings: PriceSettings): Money {
  return isk(toNearestStep(distanceM * settings.suggestedRatePerKm, 1000, settings.priceStep));
}

/**
 * Rule P3: a full car earns at most the cost of driving, shared by the seats
 * and the driver.
 */
export function priceCap(distanceM: number, seats: number, settings: PriceSettings): Money {
  return isk(
    toNearestStep(distanceM * settings.referenceCostPerKm, 1000 * (seats + 1), settings.priceStep),
  );
}

/**
 * Rule P4: the highest price level, in percent, that keeps every segment
 * under its cap. The same for every segment, as both scale with distance.
 */
export function highestPriceLevel(seats: number, settings: PriceSettings): number {
  const { referenceCostPerKm, suggestedRatePerKm, priceLevelStep } = settings;
  const steps = Math.floor(
    (100 * referenceCostPerKm) / ((seats + 1) * suggestedRatePerKm * priceLevelStep),
  );
  return steps * priceLevelStep;
}

/** Every level a driver can choose: free, then each step up to the highest. */
export function priceLevels(seats: number, settings: PriceSettings): number[] {
  const highest = highestPriceLevel(seats, settings);
  return Array.from(
    { length: highest / settings.priceLevelStep + 1 },
    (_, index) => index * settings.priceLevelStep,
  );
}

export function isPriceLevel(level: number, seats: number, settings: PriceSettings): boolean {
  return (
    Number.isInteger(level) &&
    level >= 0 &&
    level % settings.priceLevelStep === 0 &&
    level <= highestPriceLevel(seats, settings)
  );
}

/**
 * A level above the highest is lowered to it, and the driver is told (spec 3,
 * 3.6.4), for example after offering more seats.
 */
export function fitPriceLevel(
  level: number,
  seats: number,
  settings: PriceSettings,
): { readonly level: number; readonly lowered: boolean } {
  const highest = highestPriceLevel(seats, settings);
  return level > highest ? { level: highest, lowered: true } : { level, lowered: false };
}

/**
 * Rule P4: a segment's price at a level, never above its cap (the cap only
 * absorbs rounding).
 */
export function segmentPrice(
  distanceM: number,
  level: number,
  seats: number,
  settings: PriceSettings,
): Money {
  const atLevel = toNearestStep(
    distanceM * settings.suggestedRatePerKm * level,
    1000 * 100,
    settings.priceStep,
  );
  return isk(Math.min(atLevel, priceCap(distanceM, seats, settings).amount));
}

/** Rule P4 for each segment of a trip. */
export function segmentPrices(
  distancesM: readonly number[],
  level: number,
  seats: number,
  settings: PriceSettings,
): Money[] {
  return distancesM.map((distanceM) => segmentPrice(distanceM, level, seats, settings));
}

/** What a passenger for the whole route pays for one seat (rule P1). */
export function routePrice(prices: readonly Money[]): Money {
  return isk(prices.reduce((total, price) => total + price.amount, 0));
}
