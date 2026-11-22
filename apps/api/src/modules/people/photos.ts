// A person's profile photo beside their name (spec 1, 3.5; ADR 0033): on
// trips, search results, bookings and profiles. Whoever is hidden from
// everyone (privacy/hidden.ts) shows no photo; the callers leave them out.
import { photoShown } from "@shareride/domain";
import type { PhotoStorage } from "../../platform/photo-storage.ts";

/** What a person's row holds about their photo. */
export interface PhotoOwner {
  readonly photoKey: string | null;
  readonly photoHiddenAt: Date | null;
}

/**
 * Links to people's photos as others see them at `now`: null without one,
 * for one ShareRide hid, and on a server without photo storage.
 */
export function photoLinkOf(
  storage: PhotoStorage | undefined,
  now: Date,
): (person: PhotoOwner) => Promise<string | null> {
  return async (person) =>
    storage === undefined || person.photoKey === null || !photoShown(person)
      ? null
      : storage.linkTo(person.photoKey, now);
}
