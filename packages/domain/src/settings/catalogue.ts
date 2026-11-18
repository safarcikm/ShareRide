// The operator's settings (spec 10, 3.2; feature H4): which values there
// are, and each one's default, unit and allowed range (R10.1). The list and
// the ranges are ADR 0032's; changing a range or adding a setting needs an
// ADR (R10.4).

export const settingGroups = ["switches", "beta"] as const;
export type SettingGroup = (typeof settingGroups)[number];

export type SettingUnit = "people";

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
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof settingDefinitions;

export const settingKeys = Object.keys(settingDefinitions) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(settingDefinitions, key);
}
