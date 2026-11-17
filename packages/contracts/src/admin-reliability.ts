import { cancelReasons } from "@shareride/domain";
import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { localisedTextSchema } from "./meeting-points.ts";
import { reliabilitySchema } from "./people.ts";
import { defineRoute } from "./route.ts";

// The operator console's Reliability page (spec 8, 3.8; R8.10, R8.11;
// milestone 7, PR 7d): the cancellations that do not count only because of
// a weather or road-closure reason, which the operator can overrule so that
// they count, and the people whose figure is below the watch level. The
// operator decides on a warning or a suspension as a person; nothing here
// suspends anyone.

const errors = { schema: errorResponseSchema } as const;

/** Whether a whole trip was cancelled, by its driver, or one booking, by either side. */
export const adminCancellationKinds = ["trip", "booking"] as const;

/** A person as the console shows them; a former member's first name is null (spec 11, 3.5). */
const adminReliabilityPersonSchema = z.object({
  userId: z.uuid(),
  firstName: z.string().nullable(),
});

export const adminExcusedCancellationSchema = z.object({
  kind: z.enum(adminCancellationKinds),
  /** The trip's ID for a trip, the booking's for a booking. */
  id: z.uuid(),
  /** Whose reliability it is about: the one who cancelled. */
  person: adminReliabilityPersonSchema,
  role: z.enum(["driver", "passenger"]),
  reason: z.enum(cancelReasons),
  /** The driver's note to the passengers, as written; empty for none. */
  note: z.string(),
  cancelledAt: timestampSchema,
  /**
   * A trip's first and last stops, or where a booking's passenger was to
   * get in and out; and when the trip was to leave.
   */
  from: localisedTextSchema,
  to: localisedTextSchema,
  departsAt: timestampSchema.nullable(),
  /** When the operator overruled the reason, so that it counts; null until then, or once undone. */
  overruledAt: timestampSchema.nullable(),
  /** The operator's note on the last change of whether it counts; empty before any. */
  overruleNote: z.string(),
});

export type AdminExcusedCancellation = z.infer<typeof adminExcusedCancellationSchema>;

export const adminWatchedPersonSchema = adminReliabilityPersonSchema.extend({
  reliability: reliabilitySchema,
});

export type AdminWatchedPerson = z.infer<typeof adminWatchedPersonSchema>;

export const adminExcusedCancellationsRoute = defineRoute({
  method: "get",
  path: "/admin/v1/reliability/cancellations",
  summary:
    "Cancellations over the last 12 months that do not count only because of a weather or road-closure reason, newest first",
  tags: ["admin", "reliability"],
  auth: "operator",
  responses: {
    200: {
      description: "The cancellations, overruled ones included",
      schema: z.object({ cancellations: z.array(adminExcusedCancellationSchema) }),
    },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminChangeCountingBodySchema = z.object({
  /** True overrules the reason, so it counts; false undoes that. */
  counts: z.boolean(),
  /** Why, for a warning or a complaint later; needed, up to 500 characters (`checkOverruleNote`). */
  note: z.string(),
});

export const adminChangeCountingRoute = defineRoute({
  method: "post",
  path: "/admin/v1/reliability/cancellations/{kind}/{id}/counts",
  summary:
    "Overrule a clearly wrong weather or road-closure reason, so the cancellation counts, or undo that, with a note",
  tags: ["admin", "reliability"],
  auth: "operator",
  request: {
    params: z.object({ kind: z.enum(adminCancellationKinds), id: z.uuid() }),
    body: adminChangeCountingBodySchema,
  },
  responses: {
    200: { description: "The cancellation as it is now", schema: adminExcusedCancellationSchema },
    400: {
      description: "validation_failed: an unknown kind, a bad ID, or a note missing or too long",
      ...errors,
    },
    401: { description: "operator_unauthenticated", ...errors },
    404: {
      description: "not_found: not one of the cancellations the list shows",
      ...errors,
    },
    409: { description: "unchanged: it already counts, or already doesn't", ...errors },
  },
});

export const adminReliabilityWatchRoute = defineRoute({
  method: "get",
  path: "/admin/v1/reliability/watch",
  summary: "The people whose reliability figure is below the watch level, lowest first",
  tags: ["admin", "reliability"],
  auth: "operator",
  responses: {
    200: {
      description: "The people, and the watch level in percent",
      schema: z.object({
        watchPercent: z.int().min(0).max(100),
        people: z.array(adminWatchedPersonSchema),
      }),
    },
    401: { description: "operator_unauthenticated", ...errors },
  },
});
