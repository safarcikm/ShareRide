// The settings' values and their versions (spec 10, 3.2; R10.1 to R10.3;
// ADR 0032). Every change makes a new version; version 0 is the defaults.
import { err, ok, type Result } from "../result.ts";
import { isSettingKey, settingDefinitions, settingKeys, type SettingKey } from "./catalogue.ts";

/** Every setting's value: a whole number in its unit, a switch 1 or 0. */
export type SettingValues = Readonly<Record<SettingKey, number>>;

export const defaultSettingValues: SettingValues = Object.fromEntries(
  settingKeys.map((key) => [key, settingDefinitions[key].default]),
) as Record<SettingKey, number>;

/** One row of the history, as far as the values need it. */
export interface StoredSettingChange {
  readonly version: number;
  readonly key: string;
  readonly newValue: number;
}

/**
 * The values as they were at a version: the defaults with every change up
 * to it laid over them, oldest first. A change to a setting that has left
 * the catalogue is passed over.
 */
export function valuesAt(version: number, changes: readonly StoredSettingChange[]): SettingValues {
  const values: Record<SettingKey, number> = { ...defaultSettingValues };
  const upTo = changes
    .filter((change) => change.version <= version)
    .sort((a, b) => a.version - b.version);
  for (const change of upTo) {
    if (isSettingKey(change.key)) values[change.key] = change.newValue;
  }
  return values;
}

/** A reason for a change, in characters (R10.2). */
export const settingReasonMaxLength = 500;

export interface SettingChangeToMake {
  readonly key: SettingKey;
  readonly oldValue: number;
  readonly newValue: number;
  readonly reason: string;
}

export type SettingChangeProblem =
  | { readonly code: "unknown_setting" }
  | { readonly code: "not_a_step"; readonly step: number }
  | { readonly code: "out_of_range"; readonly min: number; readonly max: number }
  | { readonly code: "unchanged" }
  | { readonly code: "reason_missing" }
  | { readonly code: "reason_too_long"; readonly max: number };

/**
 * Whether the operator may set a value (R10.1, R10.2): a known setting, a
 * whole number on its step and inside its range, not the value it has, and
 * with a reason.
 */
export function checkSettingChange(
  key: string,
  value: number,
  reason: string,
  current: SettingValues,
): Result<SettingChangeToMake, SettingChangeProblem> {
  if (!isSettingKey(key)) return err({ code: "unknown_setting" });
  const { min, max, step } = settingDefinitions[key];
  if (!Number.isInteger(value) || (value - min) % step !== 0) {
    return err({ code: "not_a_step", step });
  }
  if (value < min || value > max) return err({ code: "out_of_range", min, max });
  if (value === current[key]) return err({ code: "unchanged" });
  const why = reason.trim();
  if (why === "") return err({ code: "reason_missing" });
  if (why.length > settingReasonMaxLength) {
    return err({ code: "reason_too_long", max: settingReasonMaxLength });
  }
  return ok({ key, oldValue: current[key], newValue: value, reason: why });
}
