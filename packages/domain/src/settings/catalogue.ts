// The operator's settings (spec 10, 3.2; feature H4): which values there
// are, and each one's default, unit and allowed range (R10.1). The list and
// the ranges are ADR 0032's; changing a range or adding a setting needs an
// ADR (R10.4).

export const settingGroups = [
  "switches",
  "beta",
  "prices",
  "booking",
  "changes",
  "trip_day",
  "apps",
] as const;
export type SettingGroup = (typeof settingGroups)[number];

export type SettingUnit =
  "people" | "kr_per_km" | "kr" | "percent" | "seats" | "minutes" | "hours" | "months" | "records";

export interface SettingDefinition {
  readonly group: SettingGroup;
  /** A switch is 1 (on) or 0 (off); a number is a whole number in its unit. */
  readonly kind: "number" | "switch";
  readonly unit: SettingUnit | null;
  readonly default: number;
  readonly min: number;
  readonly max: number;
  /** Values go from `min` in whole steps of this. */
  readonly step: number;
}

const onByDefault = { kind: "switch", unit: null, default: 1, min: 0, max: 1, step: 1 } as const;
const offByDefault = { ...onByDefault, default: 0 } as const;

export const settingDefinitions = {
  // The switches for emergencies (spec 10, 3.3; R10.5): off pauses only
  // what is new, and never cancels or changes a trip or a booking.
  /** Off: a number with no account cannot sign up; members sign in. */
  signups_open: { group: "switches", ...onByDefault },
  /** Off: no trip is published, posted again or posted as a return. */
  trips_open: { group: "switches", ...onByDefault },
  /** Off: no new booking, request or payment; answering and cancelling go on. */
  bookings_open: { group: "switches", ...onByDefault },
  /** Off: no text message is sent, so no new number gets its code (spec 26). */
  sms_sending: { group: "switches", ...onByDefault },
  /** Off: emails wait. */
  email_sending: { group: "switches", ...onByDefault },
  /** Off: push notifications wait. */
  push_sending: { group: "switches", ...onByDefault },
  /**
   * Creating an account needs an invite code (spec 12, R12.1). Off by
   * default: the beta is open to everyone (ADR 0035); the operator can
   * still close sign-ups to invited people.
   */
  invite_code_required: { group: "beta", ...offByDefault },
  /** No code works once this many accounts joined with one (R12.3). */
  beta_max_testers: {
    group: "beta",
    kind: "number",
    unit: "people",
    default: 150,
    min: 0,
    max: 1000,
    step: 1,
  },
  // Prices (pricing and seats, rules P2 to P4). A published trip keeps
  // the four price values of the version it was published under (R10.3).
  /** The suggested price per km per passenger (rule P2). */
  suggested_rate: {
    group: "prices",
    kind: "number",
    unit: "kr_per_km",
    default: 15,
    min: 5,
    max: 30,
    step: 1,
  },
  /**
   * The cost of driving per km that a full car shares (rule P3). Its top
   * is the state mileage allowance: raising it needs an ADR.
   */
  reference_cost_per_km: {
    group: "prices",
    kind: "number",
    unit: "kr_per_km",
    default: 150,
    min: 50,
    max: 150,
    step: 1,
  },
  /** Prices are whole steps of this. */
  price_step: {
    group: "prices",
    kind: "number",
    unit: "kr",
    default: 100,
    min: 50,
    max: 500,
    step: 50,
  },
  /** Price levels are whole steps of this (rule P4). */
  price_level_step: {
    group: "prices",
    kind: "number",
    unit: "percent",
    default: 10,
    min: 5,
    max: 25,
    step: 5,
  },
  /** The seats a trip offers, at most (rule S1); read as it is now, never by version. */
  max_capacity: {
    group: "prices",
    kind: "number",
    unit: "seats",
    default: 8,
    min: 1,
    max: 8,
    step: 1,
  },
  // Booking and paying (rules S4, M1; R5.5). Read as they are now: a
  // deadline is stored when it is set and does not move.
  /** Booking closes this many minutes before the boarding stop (rule S4). */
  booking_cutoff: {
    group: "booking",
    kind: "number",
    unit: "minutes",
    default: 15,
    min: 0,
    max: 120,
    step: 1,
  },
  /** A request the driver has not answered expires after this many hours (R5.5). */
  request_expiry: {
    group: "booking",
    kind: "number",
    unit: "hours",
    default: 12,
    min: 1,
    max: 48,
    step: 1,
  },
  /** The time to pay after the driver accepts (rule M1). */
  payment_window: {
    group: "booking",
    kind: "number",
    unit: "minutes",
    default: 30,
    min: 10,
    max: 120,
    step: 1,
  },
  /**
   * On: a booking made from now on is paid to the driver in person, not in
   * the app, until payments in the app work (rule M6, ADR 0038). A booking
   * keeps the way of paying it was made with.
   */
  pay_in_person: { group: "booking", ...offByDefault },
  // Changes and cancellations. A booking keeps the first, the second and
  // the fourth as they were when it was made (R10.3).
  /** A passenger cancelling this long or more before boarding is refunded in full (rule M2). */
  free_cancellation_until: {
    group: "changes",
    kind: "number",
    unit: "minutes",
    default: 15,
    min: 0,
    max: 120,
    step: 1,
  },
  /** A departure moved by more than this lets a passenger cancel for free (R6.3). */
  major_time_change: {
    group: "changes",
    kind: "number",
    unit: "minutes",
    default: 30,
    min: 10,
    max: 120,
    step: 1,
  },
  /** With bookings, a departure moves at most this far from when each was made (R6.4). */
  max_time_change: {
    group: "changes",
    kind: "number",
    unit: "minutes",
    default: 120,
    min: 30,
    max: 360,
    step: 1,
  },
  /** A passenger's cancellation counts when made less than this before boarding (R6.8). */
  reliability_cancellation_window: {
    group: "changes",
    kind: "number",
    unit: "hours",
    default: 24,
    min: 0,
    max: 72,
    step: 1,
  },

  // Trip day and reliability (spec 8; ADR 0032): all read as they are now.
  /** The wait after boarding before a no-show or the driver's absence (R8.4, R8.5). */
  no_show_wait: {
    group: "trip_day",
    kind: "number",
    unit: "minutes",
    default: 10,
    min: 5,
    max: 30,
    step: 1,
  },
  /** A trip completes this long after the planned time of its last stop (R8.1). */
  trip_completion_delay: {
    group: "trip_day",
    kind: "number",
    unit: "hours",
    default: 2,
    min: 1,
    max: 12,
    step: 1,
  },
  /** Trips and bookings count on the reliability figure for this long (R8.10). */
  reliability_period: {
    group: "trip_day",
    kind: "number",
    unit: "months",
    default: 12,
    min: 3,
    max: 24,
    step: 1,
  },
  /** The reliability figure is shown once this many count (R8.10). */
  reliability_min_count: {
    group: "trip_day",
    kind: "number",
    unit: "records",
    default: 5,
    min: 1,
    max: 20,
    step: 1,
  },
  /** Below this, the operator sees the person on the watch list (spec 8, 3.8). */
  reliability_watch_level: {
    group: "trip_day",
    kind: "number",
    unit: "percent",
    default: 80,
    min: 50,
    max: 95,
    step: 1,
  },
  // The phone apps on the website (spec 35; ADR 0055): read as they are
  // now. Off until each store's page is public.
  /** On: the website shows the App Store's badge, and Safari on an iPhone Apple's banner. */
  app_store_listed: { group: "apps", ...offByDefault },
  /** On: the website shows Google Play's badge, and Android browsers our own strip. */
  google_play_listed: { group: "apps", ...offByDefault },
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof settingDefinitions;

export const settingKeys = Object.keys(settingDefinitions) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(settingDefinitions, key);
}
