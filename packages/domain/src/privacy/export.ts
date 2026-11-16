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
 * disputes, reviews, reports, moderation, blocks).
 */
export const exportSections = [
  "account",
  "legal_acceptances",
  "settings",
  "devices",
  "email_waiting",
  "vehicles",
  "trips_posted",
  "bookings",
  "payments",
  "conversations",
  "notifications",
  "privacy_requests",
] as const;
export type ExportSection = (typeof exportSections)[number];
