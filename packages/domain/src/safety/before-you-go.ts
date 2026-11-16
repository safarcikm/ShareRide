// "Before you go" (spec 9, 3.3.2): links to the weather, road conditions
// and SafeTravel on every trip that leaves the capital area.
import type { Region } from "../meeting-points/catalogue.ts";

/** Whether any of a trip's stops is outside the capital area, by its meeting point's region. */
export function leavesCapitalArea(regions: readonly Region[]): boolean {
  return regions.some((region) => region !== "capital");
}
