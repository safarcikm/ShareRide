import { notificationScreens } from "@shareride/contracts";

const opens =
  /^\/(?:(?:bookings|drive\/trips|messages|meeting-points)\/[0-9a-f-]{36}|bookings\/[0-9a-f-]{36}\/rate)$/;

/** Screens a notification opens that are not about one record: the list the API names them from. */
const screens = new Set<string>(Object.values(notificationScreens));

/**
 * Where a notification leads (its `data.path`, set by the API): a booking,
 * a driver's trip, a conversation, the meeting point of a trip reminder
 * ("Directions", spec 7, 3.5), a booking's rating screen ("How was your
 * trip?", spec 20, 3.1.3), Download my data when the file is ready
 * (spec 11, 3.2), Your data when a question about it is answered (spec
 * 11, 3.6), Notices from PuffinRide and My reports (spec 9), My feedback
 * when it has a reply (spec 12, 3.3.5) or Beta news. Anything else is
 * ignored.
 */
export function notificationPath(data: unknown): string | null {
  const path = typeof data === "object" && data !== null && "path" in data ? data.path : undefined;
  return typeof path === "string" && (opens.test(path) || screens.has(path)) ? path : null;
}
