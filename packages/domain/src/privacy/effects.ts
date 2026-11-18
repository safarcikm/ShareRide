/**
 * The kinds of personal data in spec 11's table 3.5. Every table that holds
 * something about a person names one of these in the personal data
 * catalogue (packages/db/src/personal-data.ts).
 */
export const personalDataCategories = [
  /** Phone number, first name, photo, about, languages, email, settings. */
  "account",
  /** Signed-in devices and push tokens. */
  "devices",
  /** Legal acceptances and notification settings. */
  "consents",
  "notification_log",
  "vehicles",
  /** Messages the person sent. */
  "messages",
  "reviews_received",
  "reviews_written",
  /** Trips posted and bookings made, with their changes, check-ins and disputes. */
  "trips_and_bookings",
  /** Payments, refunds, receipts, payouts and the ledger. */
  "payments",
  /** Reports, moderation actions and appeals. */
  "moderation",
  /** Blocks made by or about the person. */
  "blocks",
  "audit",
  "exports",
  "privacy_requests",
  /** What the person sent as feedback during the beta, with its screenshots (spec 12). */
  "feedback",
] as const;
export type PersonalDataCategory = (typeof personalDataCategories)[number];

/**
 * What deletion does: `erase` deletes the rows, `empty` keeps the row
 * without its personal fields, `move` keeps the rows linked to the shared
 * former member instead of the person (decision 2), `keep` leaves them as
 * they are, since they hold IDs only or are linked through rows that move.
 */
export type DeletionEffect = "erase" | "empty" | "move" | "keep";

export const deletionEffects = {
  account: "erase",
  devices: "erase",
  consents: "erase",
  notification_log: "erase",
  // A car a published trip used keeps its make, model and colour for that
  // trip, moved to the former member, without its number plate.
  vehicles: "erase",
  // The other person sees "Message deleted".
  messages: "empty",
  reviews_received: "erase",
  // Shown as written by "A former member" (spec 8).
  reviews_written: "move",
  // So the other people's history, payouts and statistics stay right.
  trips_and_bookings: "move",
  // Kept as bookkeeping law requires, linked through the bookings.
  payments: "keep",
  // Kept 3 years after closure, for safety.
  moderation: "move",
  blocks: "erase",
  audit: "keep",
  exports: "erase",
  privacy_requests: "move",
  feedback: "erase",
} as const satisfies Record<PersonalDataCategory, DeletionEffect>;
