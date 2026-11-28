import type { AdminSetting } from "@shareride/contracts";
import {
  isSettingKey,
  type SettingGroup,
  type SettingKey,
  type SettingUnit,
} from "@shareride/domain";
import { formatCount, type Locale, type MessageKey, type Translate } from "@shareride/i18n";

export const settingsPath = "/admin/settings";

export const groupKeys = {
  switches: "admin.settings.group.switches",
  beta: "admin.settings.group.beta",
  prices: "admin.settings.group.prices",
  booking: "admin.settings.group.booking",
  changes: "admin.settings.group.changes",
  trip_day: "admin.settings.group.trip_day",
  co2: "admin.settings.group.co2",
  apps: "admin.settings.group.apps",
  front_page: "admin.settings.group.front_page",
} as const satisfies Record<SettingGroup, MessageKey>;

/** What to know before changing anything in a group. */
export const groupNotes: Partial<Record<SettingGroup, MessageKey>> = {
  booking: "admin.settings.groupNote.terms",
  changes: "admin.settings.groupNote.terms",
  trip_day: "admin.settings.groupNote.terms",
};

interface SettingTexts {
  readonly name: MessageKey;
  /** What the value does, in a sentence. */
  readonly help: MessageKey;
}

const settingTexts = {
  signups_open: {
    name: "admin.settings.name.signups_open",
    help: "admin.settings.help.signups_open",
  },
  trips_open: {
    name: "admin.settings.name.trips_open",
    help: "admin.settings.help.trips_open",
  },
  bookings_open: {
    name: "admin.settings.name.bookings_open",
    help: "admin.settings.help.bookings_open",
  },
  sms_sending: {
    name: "admin.settings.name.sms_sending",
    help: "admin.settings.help.sms_sending",
  },
  email_sending: {
    name: "admin.settings.name.email_sending",
    help: "admin.settings.help.email_sending",
  },
  push_sending: {
    name: "admin.settings.name.push_sending",
    help: "admin.settings.help.push_sending",
  },
  invite_code_required: {
    name: "admin.settings.name.invite_code_required",
    help: "admin.settings.help.invite_code_required",
  },
  beta_max_testers: {
    name: "admin.settings.name.beta_max_testers",
    help: "admin.settings.help.beta_max_testers",
  },
  suggested_rate: {
    name: "admin.settings.name.suggested_rate",
    help: "admin.settings.help.suggested_rate",
  },
  reference_cost_per_km: {
    name: "admin.settings.name.reference_cost_per_km",
    help: "admin.settings.help.reference_cost_per_km",
  },
  price_step: {
    name: "admin.settings.name.price_step",
    help: "admin.settings.help.price_step",
  },
  price_level_step: {
    name: "admin.settings.name.price_level_step",
    help: "admin.settings.help.price_level_step",
  },
  max_capacity: {
    name: "admin.settings.name.max_capacity",
    help: "admin.settings.help.max_capacity",
  },
  booking_cutoff: {
    name: "admin.settings.name.booking_cutoff",
    help: "admin.settings.help.booking_cutoff",
  },
  request_expiry: {
    name: "admin.settings.name.request_expiry",
    help: "admin.settings.help.request_expiry",
  },
  payment_window: {
    name: "admin.settings.name.payment_window",
    help: "admin.settings.help.payment_window",
  },
  pay_in_person: {
    name: "admin.settings.name.pay_in_person",
    help: "admin.settings.help.pay_in_person",
  },
  free_cancellation_until: {
    name: "admin.settings.name.free_cancellation_until",
    help: "admin.settings.help.free_cancellation_until",
  },
  major_time_change: {
    name: "admin.settings.name.major_time_change",
    help: "admin.settings.help.major_time_change",
  },
  max_time_change: {
    name: "admin.settings.name.max_time_change",
    help: "admin.settings.help.max_time_change",
  },
  reliability_cancellation_window: {
    name: "admin.settings.name.reliability_cancellation_window",
    help: "admin.settings.help.reliability_cancellation_window",
  },
  no_show_wait: {
    name: "admin.settings.name.no_show_wait",
    help: "admin.settings.help.no_show_wait",
  },
  trip_completion_delay: {
    name: "admin.settings.name.trip_completion_delay",
    help: "admin.settings.help.trip_completion_delay",
  },
  reliability_period: {
    name: "admin.settings.name.reliability_period",
    help: "admin.settings.help.reliability_period",
  },
  reliability_min_count: {
    name: "admin.settings.name.reliability_min_count",
    help: "admin.settings.help.reliability_min_count",
  },
  reliability_watch_level: {
    name: "admin.settings.name.reliability_watch_level",
    help: "admin.settings.help.reliability_watch_level",
  },
  app_store_listed: {
    name: "admin.settings.name.app_store_listed",
    help: "admin.settings.help.app_store_listed",
  },
  google_play_listed: {
    name: "admin.settings.name.google_play_listed",
    help: "admin.settings.help.google_play_listed",
  },
  co2_grams_per_car_km: {
    name: "admin.settings.name.co2_grams_per_car_km",
    help: "admin.settings.help.co2_grams_per_car_km",
  },
  festive_days: {
    name: "admin.settings.name.festive_days",
    help: "admin.settings.help.festive_days",
  },
} as const satisfies Record<SettingKey, SettingTexts>;

interface UnitTexts {
  /** A value with its unit: "150 people". */
  readonly value: MessageKey;
  /** The label of the field a new value is typed in. */
  readonly field: MessageKey;
}

const unitTexts = {
  people: { value: "admin.settings.unit.people", field: "admin.settings.newValue.people" },
  kr_per_km: { value: "admin.settings.unit.kr_per_km", field: "admin.settings.newValue.kr_per_km" },
  kr: { value: "admin.settings.unit.kr", field: "admin.settings.newValue.kr" },
  percent: { value: "admin.settings.unit.percent", field: "admin.settings.newValue.percent" },
  seats: { value: "admin.settings.unit.seats", field: "admin.settings.newValue.seats" },
  minutes: { value: "admin.settings.unit.minutes", field: "admin.settings.newValue.minutes" },
  hours: { value: "admin.settings.unit.hours", field: "admin.settings.newValue.hours" },
  months: { value: "admin.settings.unit.months", field: "admin.settings.newValue.months" },
  records: { value: "admin.settings.unit.records", field: "admin.settings.newValue.records" },
  g_per_km: { value: "admin.settings.unit.g_per_km", field: "admin.settings.newValue.g_per_km" },
} as const satisfies Record<SettingUnit, UnitTexts>;

const isUnit = (unit: string | null): unit is SettingUnit =>
  unit !== null && Object.hasOwn(unitTexts, unit);

/** A setting's name; a key that has left the catalogue is shown as it is. */
export function settingName(t: Translate, key: string): string {
  return isSettingKey(key) ? t(settingTexts[key].name) : t("admin.settings.unknown", { key });
}

export function settingHelp(t: Translate, key: string): string | null {
  return isSettingKey(key) ? t(settingTexts[key].help) : null;
}

/** What a setting looks like, as far as showing a value needs it. */
export type ShownSetting = Pick<AdminSetting, "kind" | "unit">;

/** A value in words: "On", "Off" or "150 people". */
export function valueText(
  t: Translate,
  locale: Locale,
  setting: ShownSetting,
  value: number,
): string {
  if (setting.kind === "switch") return t(value === 1 ? "admin.settings.on" : "admin.settings.off");
  const shown = formatCount(value, locale);
  return isUnit(setting.unit)
    ? t(unitTexts[setting.unit].value, { count: value, value: shown })
    : shown;
}

/** The label of the field for a new value; null for a unit the console does not know. */
export function valueFieldLabel(t: Translate, setting: ShownSetting): string | null {
  return isUnit(setting.unit) ? t(unitTexts[setting.unit].field) : null;
}
