// A booking's life (pricing and seats, "Booking lifecycle"): the statuses,
// which ones hold seats (rule S1) and the only changes allowed between them.
import type { Money } from "../money.ts";
import { err, ok, type Result } from "../result.ts";

export const bookingStatuses = [
  "requested",
  "accepted",
  "confirmed",
  "declined",
  "expired",
  "cancelled",
  "completed",
  "no_show",
] as const;
export type BookingStatus = (typeof bookingStatuses)[number];

/**
 * What can happen to a booking: the driver accepts or declines a request; a
 * deadline passes; the passenger withdraws a request, pays or cancels; the
 * trip completes; the driver marks the passenger absent; or, after the trip,
 * the driver's own absence stands (spec 8).
 */
export const bookingEvents = [
  "accept",
  "decline",
  "expire",
  "withdraw",
  "pay",
  "cancel",
  "complete",
  "no_show",
  "driver_absent",
] as const;
export type BookingEvent = (typeof bookingEvents)[number];

/** The arrows of the lifecycle diagram, and nothing else. */
const changes: Readonly<
  Record<BookingStatus, Partial<Readonly<Record<BookingEvent, BookingStatus>>>>
> = {
  requested: { accept: "accepted", decline: "declined", expire: "expired", withdraw: "cancelled" },
  accepted: { pay: "confirmed", expire: "expired", cancel: "cancelled" },
  confirmed: { cancel: "cancelled", complete: "completed", no_show: "no_show" },
  declined: {},
  expired: {},
  cancelled: {},
  completed: { driver_absent: "cancelled" },
  no_show: {},
};

export interface ChangeNotAllowed {
  readonly code: "not_allowed";
  readonly status: BookingStatus;
  readonly event: BookingEvent;
}

export function nextStatus(
  status: BookingStatus,
  event: BookingEvent,
): Result<BookingStatus, ChangeNotAllowed> {
  const next = changes[status][event];
  return next === undefined ? err({ code: "not_allowed", status, event }) : ok(next);
}

/** Why a driver declined a request, if they say: seen only by the operator (spec 5, 3.3.5; R5.7). */
export const declineReasons = ["plans_changed", "luggage", "other"] as const;
export type DeclineReason = (typeof declineReasons)[number];

/** Rule S1: these bookings count towards a segment's occupancy. */
export function holdsSeats(status: BookingStatus): boolean {
  return status === "requested" || status === "accepted" || status === "confirmed";
}

/**
 * Where an accepted booking goes: straight to confirmed when the ride is
 * free, otherwise to waiting for payment (R5.11, rule M1).
 */
export function statusOnAcceptance(total: Money): "accepted" | "confirmed" {
  return total.amount === 0 ? "confirmed" : "accepted";
}
