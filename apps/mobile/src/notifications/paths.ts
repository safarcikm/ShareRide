const opens = /^\/(bookings|drive\/trips|messages|meeting-points)\/[0-9a-f-]{36}$/;

/**
 * Where a notification leads (its `data.path`, set by the API): a booking,
 * a driver's trip, a conversation, or the meeting point of a trip reminder
 * ("Directions", spec 7, 3.5). Anything else is ignored.
 */
export function notificationPath(data: unknown): string | null {
  const path = typeof data === "object" && data !== null && "path" in data ? data.path : undefined;
  return typeof path === "string" && opens.test(path) ? path : null;
}
