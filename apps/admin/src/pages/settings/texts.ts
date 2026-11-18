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
} as const satisfies Record<SettingGroup, MessageKey>;

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
} as const satisfies Record<SettingKey, SettingTexts>;

interface UnitTexts {
  /** A value with its unit: "150 people". */
  readonly value: MessageKey;
  /** The label of the field a new value is typed in. */
  readonly field: MessageKey;
}

const unitTexts = {
  people: { value: "admin.settings.unit.people", field: "admin.settings.newValue.people" },
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
