// What a payment's outcome does to it and to its booking (rule M1, spec 13
// R13.3). The provider's confirmation decides; this says what it means.
import { err, ok, type Result } from "../result.ts";
import { statusAt } from "./deadlines.ts";
import type { BookingStatus } from "./lifecycle.ts";

/**
 * `refund_due`: paid too late, so the money goes back; it becomes `refunded`
 * once the provider has taken the refund, and is retried until then.
 */
export const paymentStatuses = [
  "pending",
  "succeeded",
  "failed",
  "refund_due",
  "refunded",
] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

/** What the provider says happened. */
export type PaymentOutcome = "succeeded" | "failed";

export interface PaymentSettlement {
  /** The payment's new status. */
  readonly payment: "succeeded" | "failed" | "refund_due";
  /** Whether the booking is now confirmed (the lifecycle's `pay`). */
  readonly confirm: boolean;
}

/**
 * A payment is settled once. Paid while its booking still waits for payment,
 * it confirms the booking; paid any later, after the window closed or for a
 * booking that no longer waits, it is owed back in full. A failed payment
 * leaves the booking waiting, so the passenger can try again in the window.
 */
export function settlePayment(input: {
  readonly booking: {
    readonly status: BookingStatus;
    readonly requestExpiresAt: Date | null;
    readonly paymentDueAt: Date | null;
  };
  readonly payment: PaymentStatus;
  readonly outcome: PaymentOutcome;
  readonly now: Date;
}): Result<PaymentSettlement, { readonly code: "payment_settled" }> {
  if (input.payment !== "pending") return err({ code: "payment_settled" });
  if (input.outcome === "failed") return ok({ payment: "failed", confirm: false });
  return statusAt(input.booking, input.now) === "accepted"
    ? ok({ payment: "succeeded", confirm: true })
    : ok({ payment: "refund_due", confirm: false });
}
