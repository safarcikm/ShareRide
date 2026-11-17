import type { OpenAPIHono } from "@hono/zod-openapi";
import { driverCheckInRoute, passengerCheckInRoute } from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { CheckInError, TripDayService } from "./service.ts";

function checkInError(c: Context, error: CheckInError, notFound: string) {
  switch (error.code) {
    case "not_found":
      return errorResponse(c, 404, "not_found", notFound);
    case "check_in_not_open":
      return errorResponse(c, 409, "check_in_not_open", '"I\'m here" is not open yet.', {
        opensAt: error.opensAt.toISOString(),
      });
    case "check_in_closed":
      return errorResponse(c, 409, "check_in_closed", '"I\'m here" has closed for this stop.');
    case "not_confirmed":
      return errorResponse(c, 409, "not_confirmed", "The booking is not confirmed.");
    case "trip_not_running":
      return errorResponse(c, 409, "trip_not_running", "The trip is not running.");
  }
}

/** "I'm here" for the passenger and the driver (spec 8, 3.2). */
export function registerTripDayRoutes(
  app: OpenAPIHono<AppEnv>,
  service: TripDayService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(passengerCheckInRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", passengerCheckInRoute.request.params);
    validated(c, "json", passengerCheckInRoute.request.body);
    const result = await service.passengerCheckIn(authOf(c).userId, id);
    return result.ok
      ? c.json(result.value, 200)
      : checkInError(c, result.error, "There is no such booking of yours.");
  });

  app.openapi(toOpenApiRoute(driverCheckInRoute, requireAuth), async (c) => {
    const { id, stopId } = validated(c, "param", driverCheckInRoute.request.params);
    validated(c, "json", driverCheckInRoute.request.body);
    const result = await service.driverCheckIn(authOf(c).userId, id, stopId);
    return result.ok
      ? c.json(result.value, 200)
      : checkInError(c, result.error, "There is no such stop on a trip of yours.");
  });
}
