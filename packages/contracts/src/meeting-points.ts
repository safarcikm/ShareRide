import {
  amenities,
  meetingPointIssueLimits,
  meetingPointIssueReasons,
  meetingPointTypes,
  placeKinds,
  regions,
} from "@shareride/domain";
import { z } from "zod";
import { errorResponseSchema } from "./errors.ts";
import { defineRoute } from "./route.ts";

/** A text in both app languages; English repeats Icelandic where they are the same. */
export const localisedTextSchema = z.object({ is: z.string(), en: z.string() });

/** WGS 84, as GPS and maps use. */
export const positionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/** A calendar date, for example 2026-11-14. */
export const dateSchema = z.iso.date();

const monthSchema = z.int().min(1).max(12);

/** What the map and the list show of a meeting point (spec 2, 3.1). */
export const meetingPointSummarySchema = z.object({
  id: z.uuid(),
  name: localisedTextSchema,
  region: z.enum(regions),
  municipality: z.string(),
  type: z.enum(meetingPointTypes),
  amenities: z.array(z.enum(amenities)),
  position: positionSchema,
  /** Draft and retired points are never listed. */
  status: z.enum(["active", "paused", "retiring"]),
  /** Null when in use all year; whole months, possibly across the new year. */
  season: z.object({ startMonth: monthSchema, endMonth: monthSchema }).nullable(),
  /** Why a paused point is not in use. */
  pauseReason: localisedTextSchema.nullable(),
  /** Sample data for testing, not a checked meeting point (milestone 3). */
  sample: z.boolean(),
});

export type MeetingPointSummary = z.infer<typeof meetingPointSummarySchema>;

/** A photo of a meeting point, in the order the operator chose (spec 2, 3.2). */
export const meetingPointPhotoSchema = z.object({
  /** A signed link that lasts at least an hour: absolute, or a path on this API. */
  url: z.string(),
  /** For screen readers. */
  description: localisedTextSchema,
  width: z.int().positive(),
  height: z.int().positive(),
});

export type MeetingPointPhoto = z.infer<typeof meetingPointPhotoSchema>;

/** Everything about one meeting point (spec 2, 3.2). */
export const meetingPointDetailsSchema = meetingPointSummarySchema.extend({
  aliases: z.array(z.string()),
  whereToStand: localisedTextSchema.nullable(),
  pausedUntil: dateSchema.nullable(),
  lastCheckedOn: dateSchema.nullable(),
  /** Up to five, in order; none where no photo storage is set up. */
  photos: z.array(meetingPointPhotoSchema),
});

export type MeetingPointDetails = z.infer<typeof meetingPointDetailsSchema>;

export const meetingPointsResponseSchema = z.object({
  meetingPoints: z.array(meetingPointSummarySchema),
});

export const meetingPointsRoute = defineRoute({
  method: "get",
  path: "/v1/meeting-points",
  summary: "Every meeting point shown on the map and in the list",
  tags: ["meeting-points"],
  responses: {
    200: { description: "Active, paused and retiring points", schema: meetingPointsResponseSchema },
  },
});

export const meetingPointRoute = defineRoute({
  method: "get",
  path: "/v1/meeting-points/{id}",
  summary: "One meeting point's details",
  tags: ["meeting-points"],
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: { description: "The meeting point", schema: meetingPointDetailsSchema },
    404: { description: "not_found: no such point, or not shown", schema: errorResponseSchema },
  },
});

/** Spec 2, 3.5: what is wrong, and a note of up to 300 characters. */
export const meetingPointIssueBodySchema = z.object({
  reason: z.enum(meetingPointIssueReasons),
  // Counted in characters as people see them by the API; this only bounds the body.
  note: z.string().max(meetingPointIssueLimits.noteMax * 8),
});

export const reportMeetingPointIssueRoute = defineRoute({
  method: "post",
  path: "/v1/meeting-points/{id}/issues",
  summary: "Report a problem with a meeting point for the operator to check (spec 2, 3.5; R2.8)",
  tags: ["meeting-points"],
  auth: true,
  request: { params: z.object({ id: z.uuid() }), body: meetingPointIssueBodySchema },
  responses: {
    204: { description: "Sent to the operator's queue" },
    400: {
      description: "validation_failed: the note is over 300 characters (`note`, `too_long`)",
      schema: errorResponseSchema,
    },
    401: { description: "unauthenticated", schema: errorResponseSchema },
    404: { description: "not_found: no such point, or not shown", schema: errorResponseSchema },
    429: {
      description: "too_many_reports: 5 in 24 hours, with retryAfterSeconds",
      schema: errorResponseSchema,
    },
  },
});

/** A town, village, landmark or the capital area: not a meeting point. */
export const placeSchema = z.object({
  id: z.uuid(),
  name: localisedTextSchema,
  kind: z.enum(placeKinds),
  region: z.enum(regions),
});

export type Place = z.infer<typeof placeSchema>;

export const placeSearchResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("meetingPoint"),
    meetingPoint: meetingPointSummarySchema,
  }),
  z.object({ kind: z.literal("place"), place: placeSchema }),
]);

export type PlaceSearchResult = z.infer<typeof placeSearchResultSchema>;

export const placeSearchRoute = defineRoute({
  method: "get",
  path: "/v1/places/search",
  summary: "Meeting points and places matching what someone types",
  tags: ["meeting-points"],
  request: {
    query: z.object({ q: z.string().max(100) }),
  },
  responses: {
    200: {
      description:
        "Best first: exact and prefix matches, aliases, then close matches (spec 2, 3.4)",
      schema: z.object({ results: z.array(placeSearchResultSchema) }),
    },
  },
});

export const nearestMeetingPointsResponseSchema = z.object({
  place: placeSchema,
  /**
   * True when these points are within the place's reach, the ones a trip
   * search for it covers; false when none are, and these are just the nearest.
   */
  withinReach: z.boolean(),
  meetingPoints: z.array(
    z.object({
      meetingPoint: meetingPointSummarySchema,
      /** Straight-line distance from the place, in metres. */
      distanceM: z.int().nonnegative(),
    }),
  ),
});

export type NearestMeetingPoints = z.infer<typeof nearestMeetingPointsResponseSchema>;

export const nearestMeetingPointsRoute = defineRoute({
  method: "get",
  path: "/v1/places/{id}/nearest-meeting-points",
  summary: "The active meeting points nearest to a place, nearest first",
  tags: ["meeting-points"],
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: {
      description: "The place and its meeting points",
      schema: nearestMeetingPointsResponseSchema,
    },
    404: { description: "not_found: no such place", schema: errorResponseSchema },
  },
});
