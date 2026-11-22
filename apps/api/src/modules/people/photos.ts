// A person's profile photo beside their name (spec 1, 3.5; ADR 0033): on
// trips, search results, bookings and profiles. Whoever is hidden from
// everyone (privacy/hidden.ts) shows no photo; the callers leave them out.
// Its owner and the console see it also while ShareRide hides it, marked
// so (spec 9, 3.4.3).
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

/** A photo with whether ShareRide hid it. */
export interface MarkedPhoto {
  readonly url: string;
  readonly hidden: boolean;
}

/**
 * People's photos as their owner and the console see them at `now`: also
 * one ShareRide hid, marked so; null without one, and on a server without
 * photo storage.
 */
export function markedPhotoOf(
  storage: PhotoStorage | undefined,
  now: Date,
): (person: PhotoOwner) => Promise<MarkedPhoto | null> {
  return async (person) =>
    storage === undefined || person.photoKey === null
      ? null
      : {
          url: await storage.linkTo(person.photoKey, now),
          hidden: person.photoHiddenAt !== null,
        };
}
