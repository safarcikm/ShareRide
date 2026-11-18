import type { OpenAPIHono } from "@hono/zod-openapi";
import { startPaymentRoute, testPaymentRoute } from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { BookingService } from "../bookings/service.ts";
import { neverPaused, pausedResponse, type PausedCheck } from "../settings/paused.ts";
import type { PaymentService, StartPaymentError } from "./service.ts";

function startError(c: Context, error: StartPaymentError) {
  switch (error.code) {
    case "not_found":
      return errorResponse(c, 404, "not_found", "There is no such booking of yours.");
    case "booking_not_payable":
      return errorResponse(
        c,
        409,
        "booking_not_payable",
        "This booking is not waiting for payment.",
      );
    case "payments_unavailable":
      return errorResponse(c, 503, "payments_unavailable", "Paying is not available yet.");
  }
}

export function registerPaymentRoutes(
  app: OpenAPIHono<AppEnv>,
  dependencies: {
    readonly payments: PaymentService;
    readonly bookings: BookingService;
    /** Only the test provider takes its outcome from the app. */
    readonly testProvider: boolean;
    readonly requireAuth: MiddlewareHandler;
    /** Whether the operator paused new bookings and payments (spec 10, 3.3). */
    readonly paused?: PausedCheck;
  },
): void {
  const { payments, bookings, requireAuth, paused = neverPaused } = dependencies;

  app.openapi(toOpenApiRoute(startPaymentRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", startPaymentRoute.request.params);
    validated(c, "json", startPaymentRoute.request.body);
    if (await paused("bookings")) return pausedResponse(c, "bookings");
    const result = await payments.start(authOf(c).userId, id);
    return result.ok ? c.json(result.value, 200) : startError(c, result.error);
  });

  if (!dependencies.testProvider) return;
  app.openapi(toOpenApiRoute(testPaymentRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", testPaymentRoute.request.params);
    const { outcome } = validated(c, "json", testPaymentRoute.request.body);
    const { userId } = authOf(c);
    const result = await payments.settle(id, outcome, userId);
    if (!result.ok) {
      return result.error.code === "not_found"
        ? errorResponse(c, 404, "not_found", "There is no such payment of yours.")
        : errorResponse(c, 409, "payment_settled", "This payment already has its outcome.");
    }
    const booking = await bookings.booking(userId, result.value.bookingId);
    if (booking === undefined) throw new Error("The paid booking is not the payer's.");
    return c.json(booking, 200);
  });
}
