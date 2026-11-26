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
