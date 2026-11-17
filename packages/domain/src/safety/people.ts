// What the console's users pages decide (spec 9, 3.5; milestone 9, PR 8):
// an operator's note about a person, and each driver's request decline
// rate, so a pattern that could be discrimination can be looked at (3.4.5).
import { declineReasons, type BookingStatus, type DeclineReason } from "../bookings/lifecycle.ts";
import { err, ok, type Result } from "../result.ts";
import { characterCount, defaultSafetySettings, type SafetySettings } from "./settings.ts";

export type OperatorNoteProblem = { readonly code: "note_missing" } | { readonly code: "too_long" };

/**
 * A note an operator writes about a person: trimmed, not empty, as long as a
 * statement's reason at most. The person gets it in Download my data (Q24).
 */
export function checkOperatorNote(
  text: string,
  settings: SafetySettings = defaultSafetySettings,
): Result<string, OperatorNoteProblem> {
  const note = text.trim();
  if (note === "") return err({ code: "note_missing" });
  if (characterCount(note) > settings.textMaxLength) return err({ code: "too_long" });
  return ok(note);
}

/** A booking as far as its request goes. */
export interface RequestFacts {
  readonly status: BookingStatus;
  /** Null for an instant booking. */
  readonly requestedAt: Date | null;
  /** When the driver accepted or declined. */
  readonly decidedAt: Date | null;
  readonly cancelledAt: Date | null;
}

/**
 * How the driver answered a request: "accepted" whatever happened after,
 * "declined" when they turned the person down, or null when they never
 * answered (instant, still waiting, expired or withdrawn). A request
 * declined because its trip was cancelled is no answer either: it was the
 * trip, not the person.
 */
export function requestAnswer(request: RequestFacts): "accepted" | "declined" | null {
  if (request.requestedAt === null || request.decidedAt === null) return null;
  if (request.status !== "declined") return "accepted";
  return request.cancelledAt === null ? "declined" : null;
}

export interface RequestRow extends RequestFacts {
  readonly driverId: string;
  readonly declineReason: DeclineReason | null;
}

export interface DeclineRate {
  readonly driverId: string;
  /** Requests they accepted or declined in the window. */
  readonly answered: number;
  readonly declined: number;
  /** Why they declined, by the reason they picked; `none` when they gave none (R5.7). */
  readonly reasons: Readonly<Record<DeclineReason | "none", number>>;
}

/**
 * Each driver who answered a request made in the last `declineRateDays`
 * days, the highest share of declines first, then the most answered, then
 * by ID.
 */
export function declineRates(
  rows: readonly RequestRow[],
  now: Date,
  settings: SafetySettings = defaultSafetySettings,
): DeclineRate[] {
  const since = now.getTime() - settings.declineRateDays * 86_400_000;
  const byDriver = new Map<
    string,
    { answered: number; declined: number; reasons: Record<DeclineReason | "none", number> }
  >();
  for (const row of rows) {
    if (row.requestedAt === null || row.requestedAt.getTime() < since) continue;
    const answer = requestAnswer(row);
    if (answer === null) continue;
    let rate = byDriver.get(row.driverId);
    if (rate === undefined) {
      const reasons = Object.fromEntries([...declineReasons, "none"].map((key) => [key, 0]));
      rate = {
        answered: 0,
        declined: 0,
        reasons: reasons as Record<DeclineReason | "none", number>,
      };
      byDriver.set(row.driverId, rate);
    }
    rate.answered += 1;
    if (answer === "declined") {
      rate.declined += 1;
      rate.reasons[row.declineReason ?? "none"] += 1;
    }
  }
  return [...byDriver]
    .map(([driverId, rate]) => ({ driverId, ...rate }))
    .sort(
      (a, b) =>
        // a.declined / a.answered against b's, without dividing; then the
        // most answered, then by ID, so equal rates keep one order.
        b.declined * a.answered - a.declined * b.answered ||
        b.answered - a.answered ||
        (a.driverId < b.driverId ? -1 : a.driverId > b.driverId ? 1 : 0),
    );
}
