import { z } from "zod";
import { bookingSchema, peopleColourSchema } from "./bookings.ts";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// Safety and moderation (spec 9): blocking, and later reports. A person is
// blocked through what the two share, such as a booking, so no one's own
// ID is ever shown to someone else (it holds when their account was made).

const errors = { schema: errorResponseSchema } as const;
const unauthenticated = { description: "unauthenticated", ...errors } as const;

/** Someone I blocked, as only I see them (spec 9, section 7). */
export const blockedPersonSchema = z.object({
  /** The block's own ID, to unblock with. */
  id: z.uuid(),
  firstName: z.string(),
  colour: peopleColourSchema,
  blockedAt: timestampSchema,
});

export type BlockedPerson = z.infer<typeof blockedPersonSchema>;

export const blockFromBookingRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/block",
  summary:
    "Block the other person of a booking, silently: neither of us sees or books the other's trips, and our chats become read-only (R9.4)",
  tags: ["safety"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }), body: z.object({}) },
  responses: {
    200: {
      description:
        "Blocked, or already blocked; with the bookings and requests we still have together, before boarding, so I can cancel, withdraw or decline them (spec 9, decision 1)",
      schema: z.object({ together: z.array(bookingSchema) }),
    },
    401: unauthenticated,
    404: { description: "not_found: no such booking of yours, or on your trip", ...errors },
  },
});

export const unblockRoute = defineRoute({
  method: "delete",
  path: "/v1/me/blocks/{id}",
  summary: "Unblock someone I blocked; safe to repeat",
  tags: ["safety"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    204: { description: "Not blocked by me any more" },
    401: unauthenticated,
  },
});

export const myBlocksRoute = defineRoute({
  method: "get",
  path: "/v1/me/blocks",
  summary: "People I blocked, the latest first (spec 9, 3.2.4)",
  tags: ["safety"],
  auth: true,
  responses: {
    200: {
      description: "People I blocked",
      schema: z.object({ blocked: z.array(blockedPersonSchema) }),
    },
    401: unauthenticated,
  },
});
