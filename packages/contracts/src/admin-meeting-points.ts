import {
  amenities,
  meetingPointStatuses,
  meetingPointTypes,
  regions,
  seasonFilters,
} from "@shareride/domain";
import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { dateSchema, localisedTextSchema, positionSchema } from "./meeting-points.ts";
import { defineRoute } from "./route.ts";

// The operator console's meeting points (spec 2, 3.6; milestone 8, PR 6):
// every point, drafts and retired ones too. The rules for each field are
// in the domain (`validateMeetingPointDraft`); these shapes only bound them.

/** Error codes of the console's meeting point routes. */
export const adminMeetingPointErrorCodes = [
  /** Someone saved the point since the form loaded it. */
  "meeting_point_changed",
  /** Retired points stay as they were (R2.2). */
  "meeting_point_retired",
  /** Only a draft's spot is edited; moving a point in use has its own step (R2.10). */
  "move_needed",
] as const;

const errors = { schema: errorResponseSchema } as const;

const monthSchema = z.int().min(1).max(12);

/** "07:00"; the domain checks the times. */
const clockTimeSchema = z.string().max(5);

/** A week of a shelter's opening hours from Monday; null for a day it is closed. */
export const shelterHoursSchema = z
  .array(z.object({ opens: clockTimeSchema, closes: clockTimeSchema }).nullable())
  .length(7);

export const seasonMonthsSchema = z.object({ startMonth: monthSchema, endMonth: monthSchema });

/** Generous bounds; the domain has the real limits (`meetingPointLimits`). */
const shortText = z.string().max(200);
const longText = z.string().max(1000);

/** A meeting point as the console shows and edits it. */
export const adminMeetingPointSchema = z.object({
  id: z.uuid(),
  nameIs: z.string(),
  /** Null when the English name is the Icelandic one. */
  nameEn: z.string().nullable(),
  aliases: z.array(z.string()),
  position: positionSchema,
  region: z.enum(regions),
  municipality: z.string(),
  type: z.enum(meetingPointTypes),
  amenities: z.array(z.enum(amenities)),
  whereToStandIs: z.string().nullable(),
  whereToStandEn: z.string().nullable(),
  shelterHours: shelterHoursSchema.nullable(),
  shelterNoteIs: z.string().nullable(),
  shelterNoteEn: z.string().nullable(),
  /** Null when in use all year. */
  season: seasonMonthsSchema.nullable(),
  status: z.enum(meetingPointStatuses),
  pauseReason: localisedTextSchema.nullable(),
  pausedUntil: dateSchema.nullable(),
  /** The day the operator last confirmed the point (spec 2, decision 2). */
  lastCheckedOn: dateSchema.nullable(),
  reviewDueOn: dateSchema.nullable(),
  /** When the operator reviewed the amenities and the season (R2.3), or null. */
  amenitiesReviewedOn: dateSchema.nullable(),
  seasonReviewedOn: dateSchema.nullable(),
  /** Sample data for testing, not a checked meeting point (milestone 3). */
  sample: z.boolean(),
  createdAt: timestampSchema,
  /** Sent back with an edit, so an edit never overwrites a newer one. */
  updatedAt: timestampSchema,
});

export type AdminMeetingPoint = z.infer<typeof adminMeetingPointSchema>;

/** A row of the console's list and a dot on its map. */
export const adminMeetingPointListItemSchema = adminMeetingPointSchema.pick({
  id: true,
  nameIs: true,
  nameEn: true,
  position: true,
  region: true,
  municipality: true,
  type: true,
  season: true,
  status: true,
  reviewDueOn: true,
  sample: true,
  updatedAt: true,
});

export type AdminMeetingPointListItem = z.infer<typeof adminMeetingPointListItemSchema>;

/** What the operator sends to create or edit a point. */
export const adminMeetingPointInputSchema = z.object({
  nameIs: shortText,
  nameEn: shortText.nullable(),
  aliases: z.array(shortText).max(50),
  position: positionSchema,
  region: z.enum(regions),
  municipality: shortText,
  type: z.enum(meetingPointTypes),
  amenities: z.array(z.enum(amenities)).max(amenities.length),
  whereToStandIs: longText.nullable(),
  whereToStandEn: longText.nullable(),
  shelterHours: shelterHoursSchema.nullable(),
  shelterNoteIs: longText.nullable(),
  shelterNoteEn: longText.nullable(),
  season: seasonMonthsSchema.nullable(),
  lastCheckedOn: dateSchema.nullable(),
  /** Ticked: today is kept as the day they were reviewed, until unticked. */
  amenitiesReviewed: z.boolean(),
  seasonReviewed: z.boolean(),
});

export type AdminMeetingPointInput = z.infer<typeof adminMeetingPointInputSchema>;

const flagSchema = z.union([z.boolean(), z.stringbool()]);

export const adminMeetingPointsRoute = defineRoute({
  method: "get",
  path: "/admin/v1/meeting-points",
  summary: "Every meeting point, with filters, by name",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: {
    query: z.object({
      status: z.enum(meetingPointStatuses).optional(),
      region: z.enum(regions).optional(),
      type: z.enum(meetingPointTypes).optional(),
      /** In use all year, or in or out of season this month in Iceland. */
      season: z.enum(seasonFilters).optional(),
      /** Only points whose yearly review is overdue (R2.9). */
      reviewOverdue: flagSchema.optional(),
      /** Part of a name or alias (R2.6). */
      q: z.string().max(100).optional(),
    }),
  },
  responses: {
    200: {
      description: "The matching points, by Icelandic name",
      schema: z.object({ meetingPoints: z.array(adminMeetingPointListItemSchema) }),
    },
    400: { description: "validation_failed", ...errors },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminMeetingPointRoute = defineRoute({
  method: "get",
  path: "/admin/v1/meeting-points/{id}",
  summary: "One meeting point, every field",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: { description: "The meeting point", schema: adminMeetingPointSchema },
    401: { description: "operator_unauthenticated", ...errors },
    404: { description: "not_found", ...errors },
  },
});

export const adminCreateMeetingPointRoute = defineRoute({
  method: "post",
  path: "/admin/v1/meeting-points",
  summary: "Add a meeting point as a draft",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: { body: adminMeetingPointInputSchema },
  responses: {
    201: { description: "The new draft", schema: adminMeetingPointSchema },
    400: {
      description: "validation_failed, with each field and its problem in `details`",
      ...errors,
    },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminUpdateMeetingPointRoute = defineRoute({
  method: "put",
  path: "/admin/v1/meeting-points/{id}",
  summary: "Save a meeting point's fields",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: {
    params: z.object({ id: z.uuid() }),
    body: adminMeetingPointInputSchema.extend({
      /** The point's `updatedAt` when the form loaded it. */
      updatedAt: timestampSchema,
    }),
  },
  responses: {
    200: { description: "The saved point", schema: adminMeetingPointSchema },
    400: {
      description: "validation_failed, with each field and its problem in `details`",
      ...errors,
    },
    401: { description: "operator_unauthenticated", ...errors },
    404: { description: "not_found", ...errors },
    409: {
      description:
        "meeting_point_changed: saved by someone else since; meeting_point_retired; move_needed: the spot of a point that is not a draft",
      ...errors,
    },
  },
});
