const opens = /^\/(bookings|drive\/trips|messages|meeting-points)\/[0-9a-f-]{36}$/;

/** Screens a notification can lead to that are about no one record (spec 9). */
const screens = new Set(["/notices", "/settings/reports"]);

/**
 * Where a notification leads (its `data.path`, set by the API): a booking,
 * a driver's trip, a conversation, the meeting point of a trip reminder
 * ("Directions", spec 7, 3.5), Notices from ShareRide or My reports (spec
 * 9). Anything else is ignored.
 */
export function notificationPath(data: unknown): string | null {
  const path = typeof data === "object" && data !== null && "path" in data ? data.path : undefined;
  return typeof path === "string" && (opens.test(path) || screens.has(path)) ? path : null;
}
