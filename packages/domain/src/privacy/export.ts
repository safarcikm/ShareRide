import { err, ok, type Result } from "../result.ts";
import { addDays } from "./calendar.ts";
import { privacySettings } from "./settings.ts";

export interface ExportTooSoon {
  readonly code: "export_too_soon";
  readonly retryAfterSeconds: number;
}

/** One export per 24 hours, counted from when the last one was asked for (spec 11, 3.2). */
export function exportAllowed(lastAskedAt: Date | null, now: Date): Result<void, ExportTooSoon> {
  if (lastAskedAt === null) return ok(undefined);
  const next = lastAskedAt.getTime() + privacySettings.exportEveryHours * 3600 * 1000;
  if (next <= now.getTime()) return ok(undefined);
  return err({
    code: "export_too_soon",
    retryAfterSeconds: Math.ceil((next - now.getTime()) / 1000),
  });
}

/** An export can be downloaded for 7 days after it is ready (R11.2). */
export function exportExpiresAt(readyAt: Date): Date {
  return addDays(readyAt, privacySettings.exportValidDays);
}

/**
 * The parts of an export (spec 11, 3.2.3), in the order the readable page
 * shows them. Each table in the personal data catalogue feeds one of these
 * or says why it is left out. Milestone 7 and spec 9 add theirs (check-ins,
 * disputes, reviews, moderation); reports and blocks are in.
 */
export const exportSections = [
  "account",
  "legal_acceptances",
  "settings",
  "devices",
  /** Google and Apple accounts linked to the account (spec 19, 3.4). */
  "sign_in_methods",
  "email_waiting",
  "vehicles",
  "trips_posted",
  "bookings",
  /** Reviews about the person from trips made anonymous, by nobody and on no ride (A51). */
  "earlier_reviews",
  "payments",
  "conversations",
  /** Reports the person filed and their outcomes, never who reported them (spec 9). */
  "reports",
  /** Problems the person reported with meeting points, while still open (spec 2, 3.5). */
  "meeting_point_reports",
  /** Blocks the person made, never who blocked them (spec 9). */
  "blocks",
  /** What ShareRide did about the person and why, with their appeals; never which operator (spec 9, R9.5). */
  "notices",
  /** What operators wrote down about the person; never which operator (spec 9, 3.5.3; A49). */
  "notes",
  "notifications",
  "privacy_requests",
  /** The feedback the person sent and the replies, with the screenshots as files (spec 12, 3.3). */
  "feedback",
] as const;
export type ExportSection = (typeof exportSections)[number];
