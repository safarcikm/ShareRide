// Spec 9's numbers (safety and moderation). Until the operator settings
// exist (spec 10) they are these defaults, passed to every rule so the API
// can later read them from the database.

export interface SafetySettings {
  /** A report's description, an appeal and a statement's reason: at most this many characters (3.1.4). */
  readonly textMaxLength: number;
  /** A booking problem can be reported until this many hours after its trip completes (R9.1). */
  readonly bookingReportHours: number;
  /** Every report is answered within this many hours (R9.9). */
  readonly responseHours: number;
  /** Urgent reports reach the operator by SMS from this hour, Reykjavik time… */
  readonly smsAlertFromHour: number;
  /** …until this hour; push only outside them (R9.9, spec 9 decision 4). */
  readonly smsAlertUntilHour: number;
  /** An action that affects someone can be appealed for this many days (R9.5). */
  readonly appealDays: number;
  /** One person files at most this many reports in 24 hours, against abuse of reports. */
  readonly reportsPerDay: number;
  /** Reports, actions and appeals are kept this many years after closure (spec 9, section 7). */
  readonly reportKeptYears: number;
}

/** The starting values (spec 9, accepted 2026-11-13; milestone 9 plan). */
export const defaultSafetySettings: SafetySettings = {
  textMaxLength: 1000,
  bookingReportHours: 24,
  responseHours: 24,
  smsAlertFromHour: 7,
  smsAlertUntilHour: 23,
  appealDays: 14,
  reportsPerDay: 10,
  reportKeptYears: 3,
};

/**
 * Characters as chat counts them (R7.2): Unicode code points after NFC, so
 * an accented letter is one. An emoji with a skin tone, a flag or a family
 * counts as two to seven; the counter on screen uses the same function.
 */
export function characterCount(text: string): number {
  return Array.from(text.normalize("NFC")).length;
}
