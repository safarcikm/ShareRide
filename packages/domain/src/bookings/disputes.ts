// When the two sides disagree about the trip day (spec 8, 3.3 to 3.5; rules
// R8.6 and R8.7): a no-show the driver marked, or a driver the passenger
// says never came. The other side agrees, contests or stays silent; a
// contested report waits for the operator, whose decision is final in the
// app. Each outcome sets the booking's next status, the refund, the payout
// and whose reliability it counts on.
import { err, ok, type Result } from "../result.ts";
import type { TripDaySettings } from "../trips/day.ts";
import type { BookingEvent, BookingStatus } from "./lifecycle.ts";

/** What was reported: the passenger didn't come, or the driver didn't. */
export const disputeKinds = ["no_show", "driver_absent"] as const;
export type DisputeKind = (typeof disputeKinds)[number];

/** "That's right" or "That's not right" (spec 8, section 8). */
export const disputeAnswers = ["agreed", "contested"] as const;
export type DisputeAnswer = (typeof disputeAnswers)[number];

/**
 * How a report ends. It stands when the other side agrees, stays silent or
 * the operator says so. A contested report the operator finds wrong says
 * what happened instead: the passenger rode, either way; a no-show's
 * passenger was left behind (decision 4 of the milestone 7 plan); or a
 * driver absence's passenger didn't come (spec 8, decision 5).
 */
export const disputeOutcomes = ["stands", "rode", "left_behind", "passenger_absent"] as const;
export type DisputeOutcome = (typeof disputeOutcomes)[number];

/** The outcomes the operator can choose for each kind. */
export const operatorOutcomes: Readonly<Record<DisputeKind, readonly DisputeOutcome[]>> = {
  no_show: ["stands", "rode", "left_behind"],
  driver_absent: ["stands", "rode", "passenger_absent"],
};

/** Who reports: the driver marks a no-show, the passenger says the driver didn't come. */
export function reporterOf(kind: DisputeKind): "passenger" | "driver" {
  return kind === "no_show" ? "driver" : "passenger";
}

/** Who answers a report: the other side (R8.6). */
export function answererOf(kind: DisputeKind): "passenger" | "driver" {
  return kind === "no_show" ? "passenger" : "driver";
}

/** A note with a report or an answer, for the operator (spec 8, 3.3 and 3.4). */
export const disputeNoteMaxLength = 500;

/**
 * A report's or an answer's note, trimmed and composed as the database
 * counts it: up to 500 characters, and may be empty. Only the operator reads
 * it (spec 8, section 7), so unlike a trip's note it may hold contact
 * details.
 */
export function checkDisputeNote(note: string): Result<string, { readonly code: "note_too_long" }> {
  const tidy = note.trim().normalize("NFC");
  // Characters as the database counts them (code points).
  if (Array.from(tidy).length > disputeNoteMaxLength) return err({ code: "note_too_long" });
  return ok(tidy);
}

export interface Dispute {
  readonly kind: DisputeKind;
  readonly raisedAt: Date;
  readonly answer: DisputeAnswer | null;
  readonly outcome: DisputeOutcome | null;
}

const hourMs = 3_600_000;

/**
 * Until when the other side can answer (R8.6): a passenger marked a no-show
 * until 24 hours after the trip completes (3.3), a driver reported absent 24
 * hours from the report (3.4).
 */
export function answerDeadline(
  dispute: Pick<Dispute, "kind" | "raisedAt">,
  completedAt: Date,
  settings: TripDaySettings,
): Date {
  const from = dispute.kind === "no_show" ? completedAt : dispute.raisedAt;
  return new Date(from.getTime() + settings.answerWindowHours * hourMs);
}

export type AnswerProblem =
  | { readonly code: "already_answered" }
  | { readonly code: "already_decided" }
  | { readonly code: "answer_window_closed" };

/**
 * The other side answers once, until the deadline. A report that stood
 * because nobody answered in time is decided, so it takes no late answer.
 */
export function checkAnswer(
  dispute: Dispute,
  completedAt: Date,
  now: Date,
  settings: TripDaySettings,
): Result<null, AnswerProblem> {
  if (dispute.answer !== null) return err({ code: "already_answered" });
  if (dispute.outcome !== null) return err({ code: "already_decided" });
  if (now > answerDeadline(dispute, completedAt, settings)) {
    return err({ code: "answer_window_closed" });
  }
  return ok(null);
}

/** An agreed report stands at once; a contested one waits for the operator. */
export function outcomeOfAnswer(answer: DisputeAnswer): DisputeOutcome | null {
  return answer === "agreed" ? "stands" : null;
}

/**
 * An unanswered report stands once the time to answer has passed (R8.6):
 * after the deadline, so that an answer at the deadline itself still counts.
 */
export function settlesUnanswered(
  dispute: Dispute,
  completedAt: Date,
  now: Date,
  settings: TripDaySettings,
): boolean {
  return (
    dispute.answer === null &&
    dispute.outcome === null &&
    now > answerDeadline(dispute, completedAt, settings)
  );
}

export type DecisionProblem =
  | { readonly code: "not_contested" }
  | { readonly code: "already_decided" }
  | { readonly code: "outcome_invalid" };

/** The operator decides only a contested report that is still open (3.5). */
export function checkDecision(
  dispute: Dispute,
  outcome: DisputeOutcome,
): Result<null, DecisionProblem> {
  if (dispute.outcome !== null) return err({ code: "already_decided" });
  if (dispute.answer !== "contested") return err({ code: "not_contested" });
  if (!operatorOutcomes[dispute.kind].includes(outcome)) return err({ code: "outcome_invalid" });
  return ok(null);
}

/** What the operator can decide a report as: a contested, open report's outcomes, else none. */
export function decidableOutcomes(dispute: Dispute): readonly DisputeOutcome[] {
  return operatorOutcomes[dispute.kind].filter((outcome) => checkDecision(dispute, outcome).ok);
}

/**
 * Whether the operator may read the booking's conversation for this report
 * (spec 8, 3.5; R7.3, R9.6): only when it was contested, which is what
 * brings it to the operator, before or after the decision.
 */
export function operatorMayRead(dispute: Pick<Dispute, "answer">): boolean {
  return dispute.answer === "contested";
}

/** Whose reliability a decided report counts on, if anyone's (spec 8, 3.8). */
export function reportCountsOn(
  kind: DisputeKind,
  outcome: DisputeOutcome,
): "passenger" | "driver" | null {
  switch (outcome) {
    case "rode":
      return null;
    case "left_behind":
      return "driver";
    case "passenger_absent":
      return "passenger";
    case "stands":
      return kind === "no_show" ? "passenger" : "driver";
  }
}

export interface DisputeEffect {
  /** What happens to the booking: none when it stays as the report left it. */
  readonly bookingEvent: Extract<
    BookingEvent,
    "driver_absent" | "rode" | "left_behind" | "complete" | "no_show"
  > | null;
  /**
   * A booking cancelled because the driver didn't come is cancelled as if by
   * the driver, and counts on them like a driver's cancellation (3.4, spec 6).
   */
  readonly cancellation: {
    readonly by: "driver";
    readonly reason: "driver_absent";
    readonly countsOnReliability: true;
  } | null;
  /** All the passenger paid goes back, or nothing (rules M2, M3). */
  readonly refund: "full" | "none";
  /** Whether the driver is paid for the booking once payouts exist (spec 13). */
  readonly payout: "pay" | "withhold";
  /** Whose reliability it counts on, if anyone's (spec 8, 3.8). */
  readonly countsOn: "passenger" | "driver" | null;
  /** A booking the driver never drove has nothing to review. */
  readonly removesReviews: boolean;
}

/** The booking a report is about, when its outcome is applied. */
export interface DisputedBooking {
  readonly status: BookingStatus;
  /** Whether its trip has completed (R8.1). */
  readonly tripCompleted: boolean;
}

const asDriverCancelled = {
  by: "driver",
  reason: "driver_absent",
  countsOnReliability: true,
} as const;

/**
 * R8.7. A no-show already left the booking as `no_show` when it was marked,
 * so standing changes nothing more. A driver absence leaves the booking as
 * it was until it is decided. If the passenger rode, the booking goes on:
 * if its trip has completed meanwhile, the booking completes then, as it
 * would have with the trip (R8.2). If the passenger didn't come, it is
 * their no-show, as if the driver had marked it (decision 5).
 */
export function disputeEffect(
  kind: DisputeKind,
  outcome: DisputeOutcome,
  booking: DisputedBooking,
): DisputeEffect {
  const countsOn = reportCountsOn(kind, outcome);
  const driverAtFault = {
    cancellation: asDriverCancelled,
    refund: "full",
    payout: "withhold",
    countsOn,
  } as const;
  const driverPaid = {
    cancellation: null,
    refund: "none",
    payout: "pay",
    countsOn,
    removesReviews: false,
  } as const;
  if (kind === "no_show") {
    switch (outcome) {
      case "stands":
        return { bookingEvent: null, ...driverPaid };
      case "rode":
        return { bookingEvent: "rode", ...driverPaid };
      case "left_behind":
        return { bookingEvent: "left_behind", ...driverAtFault, removesReviews: false };
      case "passenger_absent":
        throw new Error("A no-show found wrong: the passenger rode or was left behind.");
    }
  }
  switch (outcome) {
    case "stands":
      return { bookingEvent: "driver_absent", ...driverAtFault, removesReviews: true };
    case "rode": {
      const completes = booking.status === "confirmed" && booking.tripCompleted;
      return { bookingEvent: completes ? "complete" : null, ...driverPaid };
    }
    case "passenger_absent":
      return { bookingEvent: "no_show", ...driverPaid, removesReviews: true };
    case "left_behind":
      throw new Error("A driver absence found wrong: the passenger rode or didn't come.");
  }
}
