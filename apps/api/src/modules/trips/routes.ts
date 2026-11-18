import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  changeTripRoute,
  copyTripRoute,
  createTripRoute,
  deleteTripRoute,
  myTripRoute,
  myTripsRoute,
  publishTripRoute,
  quoteRoute,
  stopsAlongRoute,
  updateTripRoute,
  type TripChangeBody,
} from "@shareride/contracts";
import type { ChangeProblem, PublishProblem } from "@shareride/domain";
import type { Context, MiddlewareHandler } from "hono";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import { accountSuspended } from "../account/standing.ts";
import { neverPaused, pausedResponse, type PausedCheck } from "../settings/paused.ts";
import type { ChangeNotAllowed, TripChangeService } from "./changes.ts";
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
  /** Whether the operator paused new trips (spec 10, 3.3). */
  paused: PausedCheck = neverPaused,
): void {
  app.openapi(toOpenApiRoute(myTripsRoute, requireAuth), async (c) => {
    const { when } = validated(c, "query", myTripsRoute.request.query);
    return c.json({ trips: await drafts.myTrips(authOf(c).userId, when) }, 200);
  });

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

  app.openapi(toOpenApiRoute(copyTripRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", copyTripRoute.request.params);
    const { reverse } = validated(c, "query", copyTripRoute.request.query);
    validated(c, "json", copyTripRoute.request.body);
    if (await paused("trips")) return pausedResponse(c, "trips");
    const result = await drafts.copy(authOf(c).userId, id, { reverse });
    if (result.ok) return c.json(result.value, 201);
    return result.error.code === "not_found"
      ? tripNotFound(c)
      : errorResponse(
          c,
          422,
          "too_few_stops",
          "Fewer than two of the trip's meeting points are still in use.",
        );
  });

  app.openapi(toOpenApiRoute(publishTripRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", publishTripRoute.request.params);
    validated(c, "json", publishTripRoute.request.body);
    // Drafts and changes to published trips go on; only a new trip waits.
    if (await paused("trips")) return pausedResponse(c, "trips");
    const result = await drafts.publish(authOf(c).userId, id);
    if (result.ok) return c.json(result.value, 200);
    switch (result.error.code) {
      case "account_suspended":
        return accountSuspended(c, result.error);
      case "not_found":
        return tripNotFound(c);
      case "trip_not_draft":
        return notDraft(c);
      case "distances_missing":
        return pending(c);
      case "account_deletion_pending":
        return errorResponse(
          c,
          403,
          "account_deletion_pending",
          "Your account is being deleted. Keep it to book or publish again.",
        );
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

/** Where a change's problem points: the departure, a stop, a stretch or a field. */
function changeProblemPath(
  problem: ChangeNotAllowed["problems"][number],
  kind: TripChangeBody["kind"],
): string {
  switch (problem.code) {
    case "times_missing":
    case "departure_too_soon":
    case "departure_too_far":
    case "overlaps_trip":
    case "move_too_far":
      return "departsAt";
    case "times_not_increasing":
    case "stretch_too_fast":
      return `segments.${String(problem.segment)}`;
    case "stop_out_of_season":
      // A new stop is named by the point, as it is not on the trip yet.
      return kind === "addStop" ? "meetingPointId" : `stops.${String(problem.stop)}`;
    case "stop_on_trip":
      return `stops.${String(problem.stop)}`;
    case "stop_does_not_fit":
      return `segments.${String(problem.segment)}`;
    case "stop_unavailable":
    case "route_too_long":
    case "stop_not_on_trip":
    case "stop_at_end":
    case "stop_in_use":
      return "meetingPointId";
    case "seats_invalid":
    case "seats_below_taken":
      return "seats";
    case "price_level_invalid":
      return "priceLevel";
    case "car_missing":
      return "vehicleId";
    case "note_too_long":
    case "note_has_contact_details":
      return "note";
  }
}

/** The departures the bookings allow, when a move went too far (R6.4). */
function departureWindow(problems: readonly ChangeProblem[]) {
  const tooFar = problems.find((problem) => problem.code === "move_too_far");
  return tooFar === undefined
    ? {}
    : {
        departureWindow: {
          earliest: tooFar.earliest.toISOString(),
          latest: tooFar.latest.toISOString(),
        },
      };
}

/** How many bookings and requests get in or out at a stop to remove (R6.5). */
function bookingsAtStop(problems: readonly ChangeProblem[]) {
  const inUse = problems.find((problem) => problem.code === "stop_in_use");
  return inUse === undefined ? {} : { bookingsAtStop: inUse.bookings };
}

/** Changing a published trip (spec 6, 3.2). */
export function registerTripChangeRoutes(
  app: OpenAPIHono<AppEnv>,
  changes: TripChangeService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(changeTripRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", changeTripRoute.request.params);
    const { preview } = validated(c, "query", changeTripRoute.request.query);
    const body = validated(c, "json", changeTripRoute.request.body);
    const result = await changes.change(authOf(c).userId, id, body, { preview });
    if (result.ok) return c.json(result.value, 200);
    switch (result.error.code) {
      case "account_suspended":
        return accountSuspended(c, result.error);
      case "not_found":
        return tripNotFound(c);
      case "trip_not_changeable":
        return errorResponse(
          c,
          409,
          "trip_not_changeable",
          "The trip has left or was cancelled; it no longer changes.",
        );
      case "change_not_allowed":
        return errorResponse(c, 422, "change_not_allowed", "The change breaks some rules.", {
          details: result.error.problems.map((problem) => ({
            path: changeProblemPath(problem, body.kind),
            issue: problem.code,
          })),
          ...departureWindow(result.error.problems),
          ...bookingsAtStop(result.error.problems),
        });
      case "distances_missing":
        return pending(c);
    }
  });
}
