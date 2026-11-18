import { addIcelandMonths } from "../privacy/calendar.ts";

// The search log (spec 10, 3.4.5; R10.6): what was searched for, never by
// whom. A row holds the two ends, the day searched for, how many trips
// were shown, the platform and the hour. No person, session, device or
// address, and nothing a row could be matched to a request by.

/** The header the apps send with every request. */
export const clientPlatformHeader = "X-Client-Platform";

export const searchLogPlatforms = ["ios", "android", "web", "unknown"] as const;
export type SearchLogPlatform = (typeof searchLogPlatforms)[number];

/** The platform a header names; anything else, or none, is unknown. */
export function searchLogPlatform(header: string | undefined): SearchLogPlatform {
  const named = header?.trim().toLowerCase();
  return searchLogPlatforms.find((platform) => platform === named) ?? "unknown";
}

/** What an end of a search was: a place, or one meeting point. */
export const searchEndKinds = ["place", "meeting_point"] as const;
export type SearchEndKind = (typeof searchEndKinds)[number];

/** The time a row keeps: the start of the hour, so it cannot be matched to a request. */
export function searchLogHour(now: Date): Date {
  const hour = new Date(now.getTime());
  hour.setUTCMinutes(0, 0, 0);
  return hour;
}

/** Rows are kept this long, enough to compare a month with the same one a year before. */
export const searchLogKeptMonths = 14;

/** Rows of hours before this are deleted. */
export function searchLogDeletedBefore(now: Date): Date {
  return addIcelandMonths(now, -searchLogKeptMonths);
}
