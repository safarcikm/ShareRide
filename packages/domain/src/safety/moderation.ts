// The operator's actions (spec 9, 3.4.3 to 3.4.4; rule R9.5): what they
// are, the statement of reasons each sends, appeals, and cancelling a trip
// as the operator.
import { err, ok, type Result } from "../result.ts";
import {
  tripCancellation,
  type BookingToCancelWithTrip,
  type CancellableTrip,
  type TripCancelProblem,
  type TripCancellation,
} from "../trips/cancel.ts";
import { characterCount, defaultSafetySettings, type SafetySettings } from "./settings.ts";

export const moderationActionKinds = [
  "warning",
  "content_hidden",
  "suspension",
  "reinstatement",
  "trip_cancelled",
  "refund",
] as const;
export type ModerationActionKind = (typeof moderationActionKinds)[number];

/**
 * The rule an action concerns. Until the community rules are written, a
 * list that matches the report categories (milestone 9 plan, section 3);
 * it moves to the rules' own headings once the lawyer has reviewed them.
 */
export const moderationRules = [
  "safety",
  "harassment",
  "discrimination",
  "scam",
  "false_info",
  "offensive",
  "not_as_listed",
  "reliability",
  "other",
] as const;
export type ModerationRule = (typeof moderationRules)[number];

/** Content the operator can hide (3.4.3). Profile photos join when they exist. */
export const hideableContent = ["message", "review", "trip_note", "about"] as const;
export type HideableContent = (typeof hideableContent)[number];

/** What an action can concern: content hidden, a trip cancelled or a booking refunded. */
export const moderatedContent = [...hideableContent, "trip", "booking"] as const;
export type ModeratedContent = (typeof moderatedContent)[number];

export const appealOutcomes = ["upheld", "reversed"] as const;
export type AppealOutcome = (typeof appealOutcomes)[number];

export interface Statement {
  readonly rule: ModerationRule;
  /** Written for the person affected, in plain words. */
  readonly reason: string;
}

export type StatementProblem = { readonly code: "reason_missing" } | { readonly code: "too_long" };

/** Every action that affects someone states the rule and the reason (R9.5). */
export function checkStatement(
  statement: Statement,
  settings: SafetySettings = defaultSafetySettings,
): Result<Statement, StatementProblem> {
  const reason = statement.reason.trim();
  if (reason === "") return err({ code: "reason_missing" });
  if (characterCount(reason) > settings.textMaxLength) return err({ code: "too_long" });
  return ok({ rule: statement.rule, reason });
}

/** A reinstatement is good news; every other action can be appealed (R9.5). */
export function isAppealable(kind: ModerationActionKind): boolean {
  return kind !== "reinstatement";
}

const dayMs = 86_400_000;

/** The last moment to appeal: 14 days after the action. */
export function appealDueAt(actedAt: Date, settings: SafetySettings): Date {
  return new Date(actedAt.getTime() + settings.appealDays * dayMs);
}

export type AppealProblem =
  | { readonly code: "not_appealable" }
  | { readonly code: "already_appealed" }
  | { readonly code: "window_closed" }
  | { readonly code: "empty" }
  | { readonly code: "too_long" };

/** An appeal is made once, within 14 days, with something to say (R9.5). */
export function checkAppeal(
  action: {
    readonly kind: ModerationActionKind;
    readonly at: Date;
    readonly appealedAt: Date | null;
  },
  text: string,
  now: Date,
  settings: SafetySettings,
): Result<string, AppealProblem> {
  if (!isAppealable(action.kind)) return err({ code: "not_appealable" });
  if (action.appealedAt) return err({ code: "already_appealed" });
  if (now.getTime() > appealDueAt(action.at, settings).getTime()) {
    return err({ code: "window_closed" });
  }
  const trimmed = text.trim();
  if (trimmed === "") return err({ code: "empty" });
  if (characterCount(trimmed) > settings.textMaxLength) return err({ code: "too_long" });
  return ok(trimmed);
}

/** Whether the notice offers "Appeal" now: once, within 14 days, and never for good news. */
export function canAppeal(
  action: {
    readonly kind: ModerationActionKind;
    readonly at: Date;
    readonly appealedAt: Date | null;
  },
  now: Date,
  settings: SafetySettings,
): boolean {
  return (
    isAppealable(action.kind) &&
    action.appealedAt === null &&
    now.getTime() <= appealDueAt(action.at, settings).getTime()
  );
}

export type AppealAnswerProblem =
  | { readonly code: "not_appealed" }
  | { readonly code: "already_answered" }
  | StatementProblem;

/** The operator answers an appeal once; the answer is final in the app (3.4.4). */
export function checkAppealAnswer(
  action: { readonly appealedAt: Date | null; readonly appealAnsweredAt: Date | null },
  answer: string,
  settings: SafetySettings,
): Result<string, AppealAnswerProblem> {
  if (action.appealedAt === null) return err({ code: "not_appealed" });
  if (action.appealAnsweredAt !== null) return err({ code: "already_answered" });
  const trimmed = answer.trim();
  if (trimmed === "") return err({ code: "reason_missing" });
  if (characterCount(trimmed) > settings.textMaxLength) return err({ code: "too_long" });
  return ok(trimmed);
}

/**
 * The operator cancels an upcoming trip (3.4.3): full refunds, as any trip
 * cancellation, and it counts on the driver only when the operator says so
 * and the trip had a passenger.
 */
export function operatorTripCancellation(
  trip: CancellableTrip,
  bookings: readonly BookingToCancelWithTrip[],
  countsOnReliability: boolean,
  now: Date,
): Result<TripCancellation, TripCancelProblem> {
  // "other" counts whenever there is a passenger; the operator's choice decides.
  const cancellation = tripCancellation(trip, bookings, "other", now);
  if (!cancellation.ok) return cancellation;
  return ok({
    ...cancellation.value,
    countsOnReliability: cancellation.value.countsOnReliability && countsOnReliability,
  });
}
