// Getting ready to drive (spec 3, section 3.1, rule R3.1): what a driver
// still needs before publishing a trip.

// Payouts are left out until payments are built (milestone 3 plan, decision 3).

export type ReadinessItem = "photo" | "car" | "licence";

export interface DriverReadiness {
  /** True when nothing blocking is missing. */
  readonly ready: boolean;
  readonly items: readonly {
    readonly item: ReadinessItem;
    readonly done: boolean;
    readonly blocking: boolean;
  }[];
}

export function driverReadiness(driver: {
  /** Phone verified and the current terms accepted (spec 1). */
  readonly accountComplete: boolean;
  /** A profile photo ShareRide has not hidden (spec 9, 3.4.3). */
  readonly hasPhoto: boolean;
  /**
   * Whether photos can be added here: without photo storage the photo is
   * listed but does not block (profile photos plan, decision 3).
   */
  readonly photosOn: boolean;
  /** A car that has not been removed. */
  readonly hasCar: boolean;
  readonly licenceDeclared: boolean;
}): DriverReadiness {
  const items = [
    { item: "photo", done: driver.hasPhoto, blocking: driver.photosOn },
    { item: "car", done: driver.hasCar, blocking: true },
    { item: "licence", done: driver.licenceDeclared, blocking: true },
  ] as const;
  return {
    ready: driver.accountComplete && items.every((entry) => entry.done || !entry.blocking),
    items,
  };
}
