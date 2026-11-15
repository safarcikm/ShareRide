// The payment provider port (spec 13): bookings and payments talk to this,
// never to a provider's SDK, so the real provider replaces the test one
// without touching them. Card details never reach ShareRide (R13.2).
import type { Money } from "@shareride/domain";

/**
 * The payment's ID is the idempotency key of every call: asked twice, the
 * provider opens the same checkout, and makes the same refund only once.
 */
export interface PaymentProvider {
  /** As the app knows it, to open the right checkout. */
  readonly name: "test";
  /** Opens a checkout for a payment; the provider's outcome comes later. */
  startCheckout(request: {
    readonly paymentId: string;
    readonly amount: Money;
  }): Promise<{ readonly providerRef: string }>;
  /** Pays a payment back in full (R13.3). */
  refund(request: {
    readonly paymentId: string;
    readonly providerRef: string;
    readonly amount: Money;
  }): Promise<void>;
}

/**
 * Local and staging only (milestone 4): the app shows its own test sheet and
 * reports the outcome to `POST /v1/test-payments/{id}`. No money moves.
 */
export function createTestPaymentProvider(): PaymentProvider {
  return {
    name: "test",
    startCheckout: ({ paymentId }) => Promise.resolve({ providerRef: `test_${paymentId}` }),
    refund: () => Promise.resolve(),
  };
}
