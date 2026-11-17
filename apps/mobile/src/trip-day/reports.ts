import type { Booking, Dispute } from "@shareride/contracts";
import { answererOf } from "@shareride/domain";
import { formatClock, formatDayAndMonth, type Locale, type Translate } from "@shareride/i18n";

// When a booking's reports can be made and answered (spec 8, 3.3 to 3.5),
// from the times the server gives with it.

const ms = (time: string) => new Date(time).getTime();

/**
 * The passenger can say the driver didn't come (R8.5): for a confirmed or
 * completed booking not yet reported, from the wait after their boarding
 * time until 24 hours after the trip completes.
 */
export function offersDriverAbsent(booking: Booking, at: Date): boolean {
  const { tripDay } = booking;
  return (
    booking.viewer === "passenger" &&
    (booking.status === "confirmed" || booking.status === "completed") &&
    booking.dispute === null &&
    tripDay !== null &&
    at.getTime() >= ms(tripDay.reportOpensAt) &&
    at.getTime() <= ms(tripDay.driverAbsentClosesAt)
  );
}

/**
 * The driver can mark a confirmed passenger not yet reported as a no-show
 * (R8.4): once the wait after their boarding time has passed, until the
 * trip completes. It also needs the driver's "I'm here" at that stop.
 */
export function noShowOpen(booking: Booking, at: Date): boolean {
  const { tripDay } = booking;
  return (
    booking.viewer === "driver" &&
    booking.status === "confirmed" &&
    booking.dispute === null &&
    tripDay !== null &&
    at.getTime() >= ms(tripDay.reportOpensAt) &&
    at.getTime() < ms(tripDay.noShowClosesAt)
  );
}

/** Where a booking's report stands for the person looking at it. */
export type ReportState =
  /** The viewer answers, until `deadline`. */
  | { readonly state: "to_answer"; readonly kind: Dispute["kind"]; readonly deadline: Date }
  /** The viewer reported it; the other side can answer until `deadline`. */
  | { readonly state: "waiting"; readonly kind: Dispute["kind"]; readonly deadline: Date }
  /** The viewer did not answer in time; it stands on the server's next round. */
  | { readonly state: "too_late" }
  /** Contested, for ShareRide to decide; `byViewer` when the viewer contested it. */
  | { readonly state: "contested"; readonly byViewer: boolean }
  /** ShareRide decided it (3.5). */
  | { readonly state: "decided" }
  /** It stood, agreed or not answered in time: `kind` says what the driver is told. */
  | { readonly state: "stood"; readonly kind: Dispute["kind"] };

/**
 * The booking's report as the viewer sees it, or null for none, and for a
 * report that stood when the booking's own status already says it all: to
 * the passenger, a no-show or a cancellation (3.3 and 3.4).
 */
export function reportState(booking: Booking, at: Date): ReportState | null {
  const { dispute } = booking;
  if (dispute === null) return null;
  const answers = answererOf(dispute.kind) === booking.viewer;
  if (dispute.outcome !== null) {
    if (dispute.decidedBy === "operator") return { state: "decided" };
    return booking.viewer === "driver" ? { state: "stood", kind: dispute.kind } : null;
  }
  if (dispute.answer === "contested") return { state: "contested", byViewer: answers };
  const deadline = new Date(dispute.answerBy);
  if (!answers) return { state: "waiting", kind: dispute.kind, deadline };
  return at.getTime() <= deadline.getTime()
    ? { state: "to_answer", kind: dispute.kind, deadline }
    : { state: "too_late" };
}

/** "16 November at 16:00": a time to answer by, a day or so away. */
export const deadlineText = (t: Translate, locale: Locale, deadline: Date) =>
  t("notify.when", { date: formatDayAndMonth(deadline, locale), time: formatClock(deadline) });
