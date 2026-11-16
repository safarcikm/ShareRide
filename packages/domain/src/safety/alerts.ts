// How the operator hears about a new report (spec 9, 3.4.1; rule R9.9).
import { inIceland } from "../time.ts";
import type { SafetySettings } from "./settings.ts";

export type AlertChannel = "push" | "sms";

/**
 * Push always. An urgent report also goes by SMS from 07:00 to 23:00
 * Reykjavik time; at night push only (spec 9 decision 4).
 */
export function alertChannels(
  urgent: boolean,
  now: Date,
  settings: SafetySettings,
): readonly AlertChannel[] {
  const { hour } = inIceland(now);
  const daytime = hour >= settings.smsAlertFromHour && hour < settings.smsAlertUntilHour;
  return urgent && daytime ? ["push", "sms"] : ["push"];
}
