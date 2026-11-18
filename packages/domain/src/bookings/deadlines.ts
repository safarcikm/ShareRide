// When a request must be answered (R5.5) and when an accepted booking must
// be paid (rule M1). Both are fixed when the booking reaches that status.
import type { BookingStatus } from "./lifecycle.ts";
import type { BookingSettings } from "./settings.ts";

const minutes = (count: number) => count * 60_000;

/**
 * 12 hours after the request, or 2 hours before boarding, whichever is
 * earlier; a request made less than 2 hours 30 minutes before boarding
 * expires at the booking cut-off instead.
 */
export function requestDeadline(
  requestedAt: Date,
  boardsAt: Date,
  settings: BookingSettings,
): Date {
  const untilBoarding = boardsAt.getTime() - requestedAt.getTime();
  if (untilBoarding < minutes(settings.lateRequestMinutes)) {
    return new Date(boardsAt.getTime() - minutes(settings.bookingCutoffMinutes));
  }
  return new Date(
    Math.min(
      requestedAt.getTime() + minutes(settings.requestExpiryMinutes),
      boardsAt.getTime() - minutes(settings.requestLatestBeforeBoardingMinutes),
    ),
  );
}

/** 30 minutes after acceptance, and never later than the booking cut-off. */
export function paymentDeadline(acceptedAt: Date, boardsAt: Date, settings: BookingSettings): Date {
  return new Date(
    Math.min(
      acceptedAt.getTime() + minutes(settings.paymentWindowMinutes),
      boardsAt.getTime() - minutes(settings.bookingCutoffMinutes),
    ),
  );
}

/** The latest an unpaid booking can wait: the booking cut-off before boarding. */
export function latestPaymentDeadline(boardsAt: Date, settings: BookingSettings): Date {
  return new Date(boardsAt.getTime() - minutes(settings.bookingCutoffMinutes));
}

/**
 * An unpaid booking's deadline once bookings and payments are open again
 * after a pause (spec 10, 3.3): nobody could pay during the pause, so a
 * deadline that came inside it is the payment window after the pause's end;
 * one still ahead stays. Never later than the booking cut-off.
 */
export function paymentDeadlineAfterPause(
  acceptedAt: Date,
  boardsAt: Date,
  reopenedAt: Date,
  settings: BookingSettings,
): Date {
  const asAccepted = paymentDeadline(acceptedAt, boardsAt, settings);
  return asAccepted.getTime() > reopenedAt.getTime()
    ? asAccepted
    : paymentDeadline(reopenedAt, boardsAt, settings);
}

/**
 * A booking's status at `now`: a request or an unpaid booking whose deadline
 * has come is expired, even before the expiry job has stored it, so a late
 * job never keeps a seat taken or a request open.
 */
export function statusAt(
  booking: {
    readonly status: BookingStatus;
    readonly requestExpiresAt: Date | null;
    readonly paymentDueAt: Date | null;
  },
  now: Date,
): BookingStatus {
  const due =
    booking.status === "requested"
      ? booking.requestExpiresAt
      : booking.status === "accepted"
        ? booking.paymentDueAt
        : null;
  return due !== null && due.getTime() <= now.getTime() ? "expired" : booking.status;
}
