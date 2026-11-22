// The address the web app was opened at, read once as the bundle loads,
// before the router sends a signed-out visitor from a member screen to
// Find (spec 20, 3.2). Only the path: no query and no fragment, which can
// hold a token (verify-email.tsx).
let first = typeof window === "undefined" ? null : window.location.pathname;

/** The path the app was opened at, such as /bookings/<id>/rate, once: then none. */
export function takeOpenedPath(): string | null {
  const path = first;
  first = null;
  return path;
}
