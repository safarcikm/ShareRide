import type { OpenAPIHono } from "@hono/zod-openapi";
import { reviewBookingRoute } from "@shareride/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { accountSuspended } from "../account/standing.ts";
import { authOf, type AppEnv } from "../../context.ts";
import { errorResponse } from "../../errors.ts";
import { toOpenApiRoute, validated } from "../../openapi.ts";
import type { ReviewError, ReviewService } from "./service.ts";

const invalid = (c: Context, path: string, issue: string, message: string) =>
  errorResponse(c, 400, "validation_failed", message, { details: [{ path, issue }] });

function reviewError(c: Context, error: ReviewError) {
  switch (error.code) {
    case "not_found":
      return errorResponse(c, 404, "not_found", "There is no such booking of yours.");
    case "rating_invalid":
      return invalid(c, "rating", "invalid", "Give 1 to 5 stars.");
    case "comment_too_long":
      return invalid(c, "comment", "too_long", "The comment is too long.");
    case "comment_has_contact_details":
      return invalid(
        c,
        "comment",
        "contact_details",
        "Leave phone numbers, email addresses and links out of the comment.",
      );
    case "not_completed":
      return errorResponse(c, 409, "not_completed", "Only completed bookings are reviewed.");
    case "review_window_closed":
      return errorResponse(
        c,
        409,
        "review_window_closed",
        "Reviews are written within 14 days of the trip.",
      );
    case "already_reviewed":
      return errorResponse(
        c,
        409,
        "already_reviewed",
        "You have reviewed this booking; a review is not changed.",
      );
    case "report_open":
      return errorResponse(
        c,
        409,
        "report_open",
        "A report on this booking is waiting to be decided.",
      );
    case "person_left":
      return errorResponse(c, 409, "person_left", "The other person has left PuffinRide.");
    case "account_suspended":
      return accountSuspended(c, error);
  }
}

/** Rate and review after a completed booking (spec 8, 3.7). */
export function registerReviewRoutes(
  app: OpenAPIHono<AppEnv>,
  service: ReviewService,
  requireAuth: MiddlewareHandler,
): void {
  app.openapi(toOpenApiRoute(reviewBookingRoute, requireAuth), async (c) => {
    const { id } = validated(c, "param", reviewBookingRoute.request.params);
    const body = validated(c, "json", reviewBookingRoute.request.body);
    const result = await service.review(authOf(c).userId, id, body);
    return result.ok ? c.json(result.value, 200) : reviewError(c, result.error);
  });
}
