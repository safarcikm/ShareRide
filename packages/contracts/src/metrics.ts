import { corridorMaxPlaces, corridorNameMaxLength } from "@shareride/domain";
import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

// The console's corridors (spec 10, 3.4.1 and section 6): a name and the
// places along a road, which the weekly figures are counted for.

const errors = { schema: errorResponseSchema } as const;

/** A place to pick for a corridor, by its Icelandic name. */
export const adminCorridorPlaceSchema = z.object({ id: z.uuid(), name: z.string() });

export const adminCorridorSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** The places along the road, in order. A place that is gone has an empty name. */
  places: z.array(adminCorridorPlaceSchema),
  active: z.boolean(),
  updatedAt: timestampSchema,
});

export type AdminCorridor = z.infer<typeof adminCorridorSchema>;

export const adminCorridorsSchema = z.object({
  /** By name. */
  corridors: z.array(adminCorridorSchema),
  /** Every place, by name, to pick from. */
  places: z.array(adminCorridorPlaceSchema),
});

export type AdminCorridors = z.infer<typeof adminCorridorsSchema>;

export const adminCorridorsRoute = defineRoute({
  method: "get",
  path: "/admin/v1/corridors",
  summary: "The corridors, and the places a corridor can be made of",
  tags: ["admin", "metrics"],
  auth: "operator",
  responses: {
    200: { description: "The corridors, by name", schema: adminCorridorsSchema },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

const nameSchema = z.string().max(corridorNameMaxLength * 4);
// The rules say how many; this only bounds what is read.
const placeIdsSchema = z.array(z.uuid()).max(corridorMaxPlaces * 4);
const badCorridor = {
  description:
    "validation_failed: the name is missing or too long, there are fewer than 2 places or more than 12, a place is there twice, or a place does not exist",
  ...errors,
} as const;

export const adminCreateCorridorRoute = defineRoute({
  method: "post",
  path: "/admin/v1/corridors",
  summary: "Add a corridor, active from the start",
  tags: ["admin", "metrics"],
  auth: "operator",
  request: { body: z.object({ name: nameSchema, placeIds: placeIdsSchema }) },
  responses: {
    201: { description: "The new corridor", schema: adminCorridorSchema },
    400: badCorridor,
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminUpdateCorridorRoute = defineRoute({
  method: "patch",
  path: "/admin/v1/corridors/{id}",
  summary: "Change a corridor's name, places or whether it is active; send what changes",
  tags: ["admin", "metrics"],
  auth: "operator",
  request: {
    params: z.object({ id: z.uuid() }),
    body: z.object({
      name: nameSchema.optional(),
      placeIds: placeIdsSchema.optional(),
      active: z.boolean().optional(),
    }),
  },
  responses: {
    200: { description: "The corridor, changed", schema: adminCorridorSchema },
    400: badCorridor,
    401: { description: "operator_unauthenticated", ...errors },
    404: { description: "not_found", ...errors },
  },
});
