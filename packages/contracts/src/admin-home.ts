import { z } from "zod";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// The console's home page (spec 10, 3.1.1): what needs the operator
// today, as counts that link to their lists.

const count = z.int().min(0);

export const adminHomeSchema = z.object({
  /** Open reports about people (spec 9): the urgent ones, and the others. */
  reports: z.object({ urgent: count, other: count }),
  /** Appeals nobody has answered (spec 9). */
  appeals: count,
  /** Disputes waiting for a decision (spec 8). */
  disputes: count,
  /** Open problem reports about meeting points, and points whose yearly review is overdue (spec 2). */
  meetingPointProblems: count,
  meetingPointReviewsOverdue: count,
  /** Notifications that failed on a channel in the last 24 hours (spec 7). */
  failedNotifications: count,
  /** People below the reliability watch level (spec 8). */
  watched: count,
  /** Feedback nobody has looked at (spec 12). */
  newFeedback: count,
  /** Testers the beta can still take; null while no invite code is needed. */
  placesLeft: count.nullable(),
  /** The switches for emergencies that are off, by their setting's key. */
  switchesOff: z.array(z.string()),
});

export type AdminHome = z.infer<typeof adminHomeSchema>;

export const adminHomeRoute = defineRoute({
  method: "get",
  path: "/admin/v1/home",
  summary: "Today's counts for the console's home page",
  tags: ["admin"],
  auth: "operator",
  responses: {
    200: { description: "The counts as they are now", schema: adminHomeSchema },
    401: { description: "operator_unauthenticated", schema: errorResponseSchema },
  },
});
