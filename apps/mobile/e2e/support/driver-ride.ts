import type { Locator, Page } from "@playwright/test";

/**
 * A passenger's row on a ride I drive (spec 31, 3.12, item 4), by who it is
 * and how their booking stands: "Dóra, Mjódd bus terminal to Olís
 * Norðlingaholt, 1 seat, 100 ISK, Waiting for payment". Pressing it unfolds
 * their profile, reporting them and "Cancel booking".
 */
export const passengerRow = (within: Page | Locator, name: string, status: string) =>
  within.getByRole("button", { name: new RegExp(`^${name}, .+, ${status}$`) });
