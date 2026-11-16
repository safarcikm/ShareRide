import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// The trip day (spec 8, 3.1 and 3.2): "I'm here" at a stop.

const errors = { schema: errorResponseSchema } as const;

/** "I'm here" as stored: the stop and the time, never a location (R8.3). */
export const checkInSchema = z.object({
  stopId: z.uuid(),
  checkedInAt: timestampSchema,
});

export type CheckIn = z.infer<typeof checkInSchema>;

const checkInResponses = {
  200: {
    description: "The check-in; a repeat answers with the first one and tells nobody again",
    schema: checkInSchema,
  },
  401: { description: "unauthenticated", ...errors },
  409: {
    description:
      "check_in_not_open, with opensAt: more than 30 minutes before the stop; check_in_closed: more than 60 minutes after it; not_confirmed: the booking is not confirmed; trip_not_running: the trip is not published or under way",
    ...errors,
  },
} as const;

export const passengerCheckInRoute = defineRoute({
  method: "post",
  path: "/v1/bookings/{id}/check-in",
  summary: "The passenger's \"I'm here\" at their boarding stop; the driver is told (R8.3)",
  tags: ["trip day"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }), body: z.object({}) },
  responses: {
    ...checkInResponses,
    404: { description: "not_found: no such booking of yours", ...errors },
  },
});

export const driverCheckInRoute = defineRoute({
  method: "post",
  path: "/v1/trips/{id}/stops/{stopId}/check-in",
  summary: "The driver's \"I'm here\" at a stop; each passenger getting in there is told (R8.3)",
  tags: ["trip day"],
  auth: true,
  request: { params: z.object({ id: z.uuid(), stopId: z.uuid() }), body: z.object({}) },
  responses: {
    ...checkInResponses,
    404: { description: "not_found: no such stop on a trip of yours", ...errors },
  },
});
