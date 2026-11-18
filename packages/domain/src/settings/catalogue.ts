// The operator's settings (spec 10, 3.2; feature H4): which values there
// are, and each one's default, unit and allowed range (R10.1). The list and
// the ranges are ADR 0032's; changing a range or adding a setting needs an
// ADR (R10.4).

export const settingGroups = ["switches", "beta", "prices"] as const;
export type SettingGroup = (typeof settingGroups)[number];

export type SettingUnit = "people" | "kr_per_km" | "kr" | "percent" | "seats";

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

export const settingDefinitions = {
  // The switches for emergencies (spec 10, 3.3; R10.5): off pauses only
  // what is new, and never cancels or changes a trip or a booking.
  /** Off: a number with no account cannot sign up; members sign in. */
  signups_open: { group: "switches", ...onByDefault },
  /** Off: no trip is published, posted again or posted as a return. */
  trips_open: { group: "switches", ...onByDefault },
  /** Off: no new booking, request or payment; answering and cancelling go on. */
  bookings_open: { group: "switches", ...onByDefault },
  /** Off: no text message is sent, so nobody can ask for a sign-in code. */
  sms_sending: { group: "switches", ...onByDefault },
  /** Off: emails wait. */
  email_sending: { group: "switches", ...onByDefault },
  /** Off: push notifications wait. */
  push_sending: { group: "switches", ...onByDefault },
  /** Creating an account needs an invite code (spec 12, R12.1). */
  invite_code_required: { group: "beta", ...onByDefault },
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
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof settingDefinitions;

export const settingKeys = Object.keys(settingDefinitions) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(settingDefinitions, key);
}
