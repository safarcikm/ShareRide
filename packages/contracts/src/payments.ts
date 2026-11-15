import { z } from "zod";
import { bookingSchema } from "./bookings.ts";
import { moneySchema, timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// Paying for an accepted booking (spec 5, 3.5; rule M1). Until the real
// provider comes (spec 13), local and staging use a test provider: the app
// shows its own test sheet and no money moves.

const errors = { schema: errorResponseSchema } as const;
const unauthenticated = { description: "unauthenticated", ...errors } as const;

export const paymentProviders = ["test"] as const;

export const paymentSchema = z.object({
  paymentId: z.uuid(),
  /** Which checkout the app opens: `test` is the app's own test sheet. */
  provider: z.enum(paymentProviders),
  amount: moneySchema,
  /** The booking's payment deadline (rule M1). */
  dueAt: timestampSchema,
});

export type Payment = z.infer<typeof paymentSchema>;

export const startPaymentRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/payment",
  summary: "Start paying for my accepted booking, or pick up the payment already started",
  tags: ["payments"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }), body: z.object({}) },
  responses: {
    200: { description: "The payment to complete", schema: paymentSchema },
    401: unauthenticated,
    404: { description: "not_found: no such booking of yours", ...errors },
    409: {
      description:
        "booking_not_payable: not waiting for payment (requested, paid, expired or cancelled)",
      ...errors,
    },
    503: { description: "payments_unavailable: no payment provider is set up", ...errors },
  },
});

export const paymentOutcomes = ["succeeded", "failed"] as const;

export const testPaymentRoute = defineRoute({
  method: "post",
  path: "/v1/test-payments/{id}",
  summary:
    "Local and staging only: what happened on the test sheet. Success confirms the booking within the window (no money moves)",
  tags: ["payments"],
  auth: true,
  request: {
    params: z.object({ id: z.uuid() }),
    body: z.object({ outcome: z.enum(paymentOutcomes) }),
  },
  responses: {
    200: { description: "The booking after the payment", schema: bookingSchema },
    401: unauthenticated,
    404: { description: "not_found: no such payment of yours", ...errors },
    409: { description: "payment_settled: this payment already has its outcome", ...errors },
  },
});
