import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  createTripRoute,
  deleteTripRoute,
  myTripRoute,
  myTripsRoute,
  publishTripRoute,
  quoteRoute,
  stopsAlongRoute,
  updateTripRoute,
} from "@shareride/contracts";
import type { PublishProblem } from "@shareride/domain";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { DraftInvalid, TripService } from "./drafts.ts";
import type { RouteService, StopUnavailable } from "./service.ts";

/** The legs job works out new distances within minutes (spec 2, 3.7; spec 3, 3.9). */
const distancesRetryAfterSeconds = 60;

const pending = (c: Context) =>
  errorResponse(c, 503, "distances_pending", "The distances are being worked out.", {
    retryAfterSeconds: distancesRetryAfterSeconds,
  });

const unavailable = (
  c: Context,
  error: Pick<StopUnavailable, "code" | "stops">,
  paths: (stop: number) => string,
) =>
  errorResponse(c, 400, error.code, "A meeting point is not in use for new trips.", {
    details: error.stops.map((stop) => ({ path: paths(stop), issue: "unavailable" })),
  });

export function registerTripRoutes(
  app: OpenAPIHono<AppEnv>,
  routes: RouteService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(stopsAlongRoute, requireAuth), async (c) => {
    const { from, to, date } = validated(c, "query", stopsAlongRoute.request.query);
    if (from === to) {
      return errorResponse(c, 400, "validation_failed", "The two ends are the same point.", {
        details: [{ path: "to", issue: "same_as_from" }],
      });
    }
    const found = await routes.stopsAlong(from, to, date);
    if (found.ok) return c.json({ meetingPoints: found.value }, 200);
    return found.error.code === "stop_unavailable"
      ? unavailable(c, found.error, (stop) => (stop === 0 ? "from" : "to"))
      : pending(c);
  });

  app.openapi(toOpenApiRoute(quoteRoute, requireAuth), async (c) => {
    const body = validated(c, "json", quoteRoute.request.body);
    const quote = await routes.quote(body);
    if (quote.ok) return c.json(quote.value, 200);
    switch (quote.error.code) {
      case "stop_unavailable":
        return unavailable(c, quote.error, (stop) =>
          stop === body.stops.length ? "add" : `stops.${String(stop)}`,
        );
      case "price_level_invalid":
        return errorResponse(
          c,
          400,
          "price_level_invalid",
          "The price level is not a whole step.",
          {
            details: [{ path: "priceLevel", issue: "invalid" }],
          },
        );
      case "distances_missing":
        return pending(c);
    }
  });
}

/** Where a publishing problem points: a stop, a stretch or a field (publishTripRoute). */
function problemPath(problem: PublishProblem): string {
  switch (problem.code) {
    case "driver_not_ready":
      return "driver";
    case "car_missing":
      return "vehicleId";
    case "seats_invalid":
      return "seats";
    case "price_level_invalid":
      return "priceLevel";
    case "stop_unavailable":
    case "stop_out_of_season":
    case "stop_repeated":
      return `stops.${String(problem.stop)}`;
    case "too_few_stops":
    case "route_too_long":
      return "stops";
    case "times_missing":
    case "departure_too_soon":
    case "departure_too_far":
    case "overlaps_trip":
      return "plannedTimes";
    case "times_not_increasing":
    case "stretch_too_fast":
      return `segments.${String(problem.segment)}`;
    case "note_too_long":
    case "note_has_contact_details":
      return "note";
  }
}

const tripNotFound = (c: Context) =>
  errorResponse(c, 404, "not_found", "There is no such trip of yours.");
const notDraft = (c: Context) =>
  errorResponse(c, 409, "trip_not_draft", "The trip is published; only drafts change here.");

function draftInvalid(c: Context, error: DraftInvalid) {
  switch (error.code) {
    case "stop_repeated":
      return errorResponse(c, 400, "validation_failed", "A stop is there twice.", {
        details: [{ path: `stops.${String(error.stop)}`, issue: "repeated" }],
      });
    case "stop_unavailable":
      return unavailable(c, error, (stop) => `stops.${String(stop)}`);
    case "planned_times_mismatch":
      return errorResponse(c, 400, "validation_failed", "Give one planned time per stop.", {
        details: [{ path: "plannedTimes", issue: "one_per_stop" }],
      });
    case "note_too_long":
      return errorResponse(c, 400, "validation_failed", "The note is too long.", {
        details: [{ path: "note", issue: "too_long" }],
      });
    case "vehicle_unavailable":
      return errorResponse(c, 400, "vehicle_unavailable", "The car is not one of yours.", {
        details: [{ path: "vehicleId", issue: "unavailable" }],
      });
  }
}

export function registerDraftRoutes(
  app: OpenAPIHono<AppEnv>,
  drafts: TripService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(myTripsRoute, requireAuth), async (c) =>
    c.json({ trips: await drafts.myTrips(authOf(c).userId) }, 200),
  );

  app.openapi(toOpenApiRoute(myTripRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", myTripRoute.request.params);
    const trip = await drafts.myTrip(authOf(c).userId, id);
    return trip === undefined ? tripNotFound(c) : c.json(trip, 200);
  });

  app.openapi(toOpenApiRoute(createTripRoute, requireAuth), async (c) => {
    const body = validated(c, "json", createTripRoute.request.body);
    const result = await drafts.create(authOf(c).userId, body);
    if (result.ok) return c.json(result.value, 201);
    return result.error.code === "distances_missing" ? pending(c) : draftInvalid(c, result.error);
  });

  app.openapi(toOpenApiRoute(updateTripRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", updateTripRoute.request.params);
    const body = validated(c, "json", updateTripRoute.request.body);
    const result = await drafts.update(authOf(c).userId, id, body);
    if (result.ok) return c.json(result.value, 200);
    switch (result.error.code) {
      case "not_found":
        return tripNotFound(c);
      case "trip_not_draft":
        return notDraft(c);
      case "distances_missing":
        return pending(c);
      default:
        return draftInvalid(c, result.error);
    }
  });

  app.openapi(toOpenApiRoute(deleteTripRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", deleteTripRoute.request.params);
    const result = await drafts.remove(authOf(c).userId, id);
    if (result.ok) return c.body(null, 204);
    return result.error.code === "not_found" ? tripNotFound(c) : notDraft(c);
  });

  app.openapi(toOpenApiRoute(publishTripRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", publishTripRoute.request.params);
    validated(c, "json", publishTripRoute.request.body);
    const result = await drafts.publish(authOf(c).userId, id);
    if (result.ok) return c.json(result.value, 200);
    switch (result.error.code) {
      case "not_found":
        return tripNotFound(c);
      case "trip_not_draft":
        return notDraft(c);
      case "distances_missing":
        return pending(c);
      case "trip_not_publishable":
        return errorResponse(c, 422, "trip_not_publishable", "The trip breaks some rules.", {
          details: result.error.problems.map((problem) => ({
            path: problemPath(problem),
            issue: problem.code,
          })),
        });
    }
  });
}
