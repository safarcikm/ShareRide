const opens = /^\/(bookings|drive\/trips|messages|meeting-points)\/[0-9a-f-]{36}$/;

/** Screens a notification opens that are not about one record. */
const screens = new Set(["/settings/privacy/download", "/notices", "/settings/reports"]);

/**
 * Where a notification leads (its `data.path`, set by the API): a booking,
 * a driver's trip, a conversation, the meeting point of a trip reminder
 * ("Directions", spec 7, 3.5), Download my data when the file is ready
 * (spec 11, 3.2), or Notices from ShareRide and My reports (spec 9).
 * Anything else is ignored.
 */
export function notificationPath(data: unknown): string | null {
  const path = typeof data === "object" && data !== null && "path" in data ? data.path : undefined;
  return typeof path === "string" && (opens.test(path) || screens.has(path)) ? path : null;
}
