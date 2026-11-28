// The screens that need an account, in one place: the root layout opens
// the member screens only for an account that is ready (spec 16, 3.5),
// and a link to any of these opened before signing in is kept through it
// (spec 20, 3.2; kept-link.ts).

/** Open only to an account that is ready: signed in, every sign-up step done. */
export const memberScreens = [
  "profile/edit",
  "profile/preview",
  "people/[profileId]",
  "drive/cars/index",
  "drive/cars/new",
  "drive/cars/[id]",
  "drive/licence",
  "drive/photo",
  "drive/trips/index",
  "drive/trips/new",
  "drive/trips/[id]/index",
  "drive/trips/[id]/route",
  "drive/trips/[id]/time",
  "drive/trips/[id]/price",
  "drive/trips/[id]/seats",
  "drive/trips/[id]/review",
  "drive/trips/[id]/published",
  "drive/trips/[id]/share",
  "drive/trips/[id]/message",
  "drive/trips/[id]/cancel",
  "drive/trips/[id]/edit/index",
  "drive/trips/[id]/edit/time",
  "drive/trips/[id]/edit/price",
  "drive/trips/[id]/edit/seats",
  "drive/trips/[id]/edit/car",
  "drive/trips/[id]/edit/stop",
  "drive/trips/[id]/edit/remove-stop",
  "drive/trips/[id]/edit/booking",
  "drive/trips/[id]/edit/details",
  "drive/trips/[id]/edit/check",
  "trips/[id]/book",
  "bookings/[id]/index",
  "bookings/[id]/booked",
  "bookings/[id]/cancel",
  "bookings/[id]/no-show",
  "bookings/[id]/driver-absent",
  "bookings/[id]/answer",
  "bookings/[id]/rate",
  "onboarding/faster",
  "onboarding/face-id",
] as const;

/**
 * Open signed in or out, but only of use signed in: signed out they close
 * back to the menu. Notifications and their emails open them, and "Forgot
 * your password?" opens Choose a password once signed in (spec 27, 3.4).
 */
export const accountScreens = [
  "messages/[bookingId]",
  "notices",
  "settings/feedback",
  "settings/beta-news",
  "settings/reports",
  "settings/privacy/download",
  "settings/password",
] as const;

/**
 * Open signed in or out, but not while an account waits to be deleted:
 * then the app shows only when the account goes and "Keep my account"
 * (spec 11, 3.4.4). Every page of Profile under `settings/` is here; a
 * page left out would be open to such an account, so member-screens.test.ts
 * asks of every page which list it is in, or why it is in none.
 * Report, the two pages that block a person and "What's wrong here?" for a
 * meeting point are here too (A59): "Keep my account" opens them again.
 * Notices from PuffinRide is not: a notice's email links there, and a
 * person may read or appeal one before the account goes.
 */
export const notWhileDeleting = [
  "settings",
  "settings/email",
  "settings/sign-in-methods",
  "settings/password",
  "settings/notifications",
  "settings/language",
  "settings/feedback",
  "settings/beta-news",
  "settings/blocked",
  "settings/reports",
  "feedback",
  "settings/privacy/index",
  "settings/privacy/ask",
  "settings/privacy/download",
  "settings/privacy/delete",
  "messages/[bookingId]",
  "verify-email",
  "report",
  "bookings/[id]/block",
  "people/[profileId]/block",
  // Signed out, it asks to sign in first.
  "meeting-points/[id]/problem",
] as const;
