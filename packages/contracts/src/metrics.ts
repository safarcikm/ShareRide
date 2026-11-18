import {
  corridorMaxPlaces,
  corridorNameMaxLength,
  exitCriteria,
  metricKeys,
} from "@shareride/domain";
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

// The weekly figures and the beta's exit criteria (spec 10, 3.4 and
// section 6).

/** An ISO week in Iceland time, as "2026-W07". */
export const isoWeekSchema = z.string().regex(/^\d{4}-W\d{2}$/);

export const metricValueSchema = z.object({
  numerator: z.int(),
  /** Null for a plain count or sum; otherwise what the numerator is a share of. */
  denominator: z.int().nullable(),
});

export const adminMetricsWeekSchema = z.object({
  week: isoWeekSchema,
  /** The week's Monday, "2026-11-09". */
  startsOn: z.string(),
  /** By metric; null for a week not counted yet. */
  metrics: z.record(z.enum(metricKeys), metricValueSchema).nullable(),
  computedAt: timestampSchema.nullable(),
});

export const adminExitCriterionSchema = z.object({
  key: z.enum(exitCriteria.map((criterion) => criterion.key)),
  status: z.enum(["met", "not_met", "no_data"]),
  numerator: z.int(),
  denominator: z.int(),
});

export const adminMetricsSchema = z.object({
  /** The corridor asked for; null for everything. */
  corridorId: z.uuid().nullable(),
  /** Oldest first. */
  weeks: z.array(adminMetricsWeekSchema),
  /** The last 4 complete weeks on the active corridors, whatever was asked for. */
  exitCriteria: z.object({
    from: isoWeekSchema,
    to: isoWeekSchema,
    criteria: z.array(adminExitCriterionSchema),
  }),
  /** Every corridor, by name, for the picker. */
  corridors: z.array(z.object({ id: z.uuid(), name: z.string(), active: z.boolean() })),
});

export type AdminMetrics = z.infer<typeof adminMetricsSchema>;
export type AdminMetricsWeek = z.infer<typeof adminMetricsWeekSchema>;

export const adminMetricsQuerySchema = z.object({
  /** The first week; 7 weeks before `to` when left out. */
  from: isoWeekSchema.optional(),
  /** The last week; the current one when left out. */
  to: isoWeekSchema.optional(),
  /** A corridor's ID; everything when left out. */
  corridor: z.uuid().optional(),
});

export const adminMetricsRoute = defineRoute({
  method: "get",
  path: "/admin/v1/metrics",
  summary: "The weekly figures of up to 53 weeks, and the beta's exit criteria",
  tags: ["admin", "metrics"],
  auth: "operator",
  request: { query: adminMetricsQuerySchema },
  responses: {
    200: { description: "The figures, oldest week first", schema: adminMetricsSchema },
    400: {
      description: "validation_failed: no such week, `to` before `from`, or more than 53 weeks",
      ...errors,
    },
    401: { description: "operator_unauthenticated", ...errors },
    404: { description: "not_found: no such corridor", ...errors },
  },
});

/**
 * The same figures as a CSV file, with the same query: a file, so not a
 * contract route. Figures about fewer than 5 people read "<5" in it.
 */
export const adminMetricsCsvPath = "/admin/v1/metrics.csv";
