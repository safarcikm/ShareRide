const opens = /^\/(bookings|drive\/trips|messages)\/[0-9a-f-]{36}$/;

/**
 * Where a notification leads (its `data.path`, set by the API): a booking,
 * a driver's trip or a conversation. Anything else is ignored.
 */
export function notificationPath(data: unknown): string | null {
  const path = typeof data === "object" && data !== null && "path" in data ? data.path : undefined;
  return typeof path === "string" && opens.test(path) ? path : null;
}
