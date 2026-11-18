import {
  activationItems,
  amenities,
  importLimits,
  meetingPointIssueReasons,
  meetingPointStatuses,
  meetingPointTypes,
  photoLimits,
  regions,
  seasonFilters,
} from "@shareride/domain";
import { z } from "zod";
import { timestampSchema } from "./common.ts";
import { errorResponseSchema } from "./errors.ts";
import { dateSchema, localisedTextSchema, positionSchema } from "./meeting-points.ts";
import { defineRoute } from "./route.ts";

// The operator console's meeting points (spec 2, 3.6; milestone 8, PRs 6
// and 7): every point, drafts and retired ones too. The rules for each
// field are in the domain (`validateMeetingPointDraft`, `validatePause`,
// `nextPointStatus`); these shapes only bound them.

/** Error codes of the console's meeting point routes. */
export const adminMeetingPointErrorCodes = [
  /** Someone saved the point since the form loaded it. */
  "meeting_point_changed",
  /** Retired points stay as they were (R2.2). */
  "meeting_point_retired",
  /** Only a draft's spot is edited; moving a point in use has its own step (R2.10). */
  "move_needed",
  /** The point's status does not allow this change, such as pausing a draft (`nextPointStatus`). */
  "status_change_not_allowed",
  /** An item of the activation checklist is not done (R2.3); `details` names each one. */
  "activation_not_ready",
  /** Only a point in service moves with its own step: a draft's spot is edited, a retired point stays. */
  "move_not_allowed",
  /** A point has at most `photoLimits.maxPerPoint` photos. */
  "too_many_photos",
  /** Someone changed the photo's descriptions since the console loaded them. */
  "photo_changed",
  /** A photo was added or removed since the console loaded them, so the new order misses it. */
  "photos_changed",
  /** No photo storage is set up here (PHOTO_STORAGE=none, ADR 0022). */
  "photo_storage_off",
  /** Photo storage did not take the file; trying again later can work. */
  "photo_storage_unavailable",
  /** Someone resolved the problem report since the queue loaded it. */
  "issue_resolved",
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
  /**
   * Trips still to stop here: published or under way, with this stop still
   * ahead. Their drivers and passengers are told of a pause, and a retiring
   * point retires after the last of them (spec 2, 3.6.4 and 3.6.5).
   */
  futureTrips: z.int().min(0),
  createdAt: timestampSchema,
  /** Sent back with an edit, so an edit never overwrites a newer one. */
  updatedAt: timestampSchema,
});

export type AdminMeetingPoint = z.infer<typeof adminMeetingPointSchema>;

/** A row of the console's list and a dot on its map. */
export const adminMeetingPointListItemSchema = adminMeetingPointSchema
  .pick({
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
  })
  .extend({
    /** Problem reports about it still open: it needs review (spec 2, 3.5). */
    openIssues: z.int().nonnegative(),
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
      /** Only points with an open problem report (spec 2, 3.5). */
      openIssues: flagSchema.optional(),
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

/** The copy the console acted on: a change to a point saved since is refused. */
const loadedSchema = z.object({
  /** The point's `updatedAt` when the console loaded it. */
  updatedAt: timestampSchema,
});

const statusResponses = {
  200: { description: "The point with its new status", schema: adminMeetingPointSchema },
  401: { description: "operator_unauthenticated", ...errors },
  404: { description: "not_found", ...errors },
  409: {
    description:
      "meeting_point_changed: saved by someone else since; status_change_not_allowed: not from this status",
    ...errors,
  },
} as const;

export const adminPauseMeetingPointRoute = defineRoute({
  method: "post",
  path: "/admin/v1/meeting-points/{id}/pause",
  summary: "Pause an active point, telling the drivers and passengers of its future trips",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: {
    params: z.object({ id: z.uuid() }),
    body: loadedSchema.extend({
      /** Shown to users in their language; the domain has the limit (`pauseLimits`). */
      reasonIs: shortText,
      reasonEn: shortText,
      /** The day it is back in use in Iceland, or null until the operator brings it back. */
      until: dateSchema.nullable(),
    }),
  },
  responses: {
    ...statusResponses,
    400: {
      description: "validation_failed, with each field and its problem in `details`",
      ...errors,
    },
  },
});

export const adminResumeMeetingPointRoute = defineRoute({
  method: "post",
  path: "/admin/v1/meeting-points/{id}/resume",
  summary: "Bring a paused point back into use",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }), body: loadedSchema },
  responses: { ...statusResponses, 400: { description: "validation_failed", ...errors } },
});

export const adminRetireMeetingPointRoute = defineRoute({
  method: "post",
  path: "/admin/v1/meeting-points/{id}/retire",
  summary: "Retire a point for good, at once or after its last future trip",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }), body: loadedSchema },
  responses: { ...statusResponses, 400: { description: "validation_failed", ...errors } },
});

// Activating a draft (spec 2, 3.6.3; milestone 8, PR 12a): only when its
// checklist passes (R2.3, `activationChecklist`). Activation computes the
// point's legs with every point in service (3.7) in the same transaction.

export const adminActivationChecklistSchema = z.object({
  /** Each item of R2.3, in the order the console shows them. */
  items: z.array(z.object({ item: z.enum(activationItems), done: z.boolean() })),
  /** Every item is done. */
  ready: z.boolean(),
});
export type AdminActivationChecklist = z.infer<typeof adminActivationChecklistSchema>;

export const adminActivationChecklistRoute = defineRoute({
  method: "get",
  path: "/admin/v1/meeting-points/{id}/activation",
  summary: "The point's activation checklist: what R2.3 asks and whether it has it",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }) },
  responses: {
    200: { description: "The checklist", schema: adminActivationChecklistSchema },
    401: { description: "operator_unauthenticated", ...errors },
    404: { description: "not_found", ...errors },
  },
});

export const adminActivateMeetingPointRoute = defineRoute({
  method: "post",
  path: "/admin/v1/meeting-points/{id}/activate",
  summary: "Activate a draft whose checklist passes, computing its legs",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }), body: loadedSchema },
  responses: {
    ...statusResponses,
    400: { description: "validation_failed", ...errors },
    409: {
      description:
        "meeting_point_changed: saved by someone else since; status_change_not_allowed: not a draft; activation_not_ready: with each item not done in `details`",
      ...errors,
    },
  },
});

// Moving a point in service (spec 2, 3.6.6; R2.10; milestone 8, PR 12b):
// its legs are computed again in the same transaction, and when it moved
// more than 50 m (`pointMovedFar`), the drivers and passengers of the trips
// still to stop there are told.

export const adminMeetingPointMovedSchema = z.object({
  meetingPoint: adminMeetingPointSchema,
  /** How far it moved, in whole metres. */
  metres: z.int().min(0),
  /** The trips still to stop there whose drivers and passengers are told; 0 within 50 m. */
  tripsTold: z.int().min(0),
});
export type AdminMeetingPointMoved = z.infer<typeof adminMeetingPointMovedSchema>;

export const adminMoveMeetingPointRoute = defineRoute({
  method: "post",
  path: "/admin/v1/meeting-points/{id}/move",
  summary: "Move a point in service, computing its legs and telling the trips that stop there",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: {
    params: z.object({ id: z.uuid() }),
    body: loadedSchema.extend({ position: positionSchema }),
  },
  responses: {
    200: { description: "The point at its new spot", schema: adminMeetingPointMovedSchema },
    400: {
      description:
        "validation_failed, with `position` and its problem in `details`: outside_iceland, same_place, or no_road (no road within 1 km reaches a point in service)",
      ...errors,
    },
    401: { description: "operator_unauthenticated", ...errors },
    404: { description: "not_found", ...errors },
    409: {
      description:
        "meeting_point_changed: saved by someone else since; move_not_allowed: a draft or a retired point",
      ...errors,
    },
  },
});

// Photos of a point (spec 2, 3.6.3; milestone 8, PR 8): up to five, each
// with a description in both languages, in the order the app shows them.
// The rules are in the domain (`checkPhotoFile`, `validatePhotoDescriptions`).

/** A photo as the console shows it. */
export const adminMeetingPointPhotoSchema = z.object({
  id: z.uuid(),
  /** A signed link that lasts at least an hour: absolute, or a path on this API. */
  url: z.string(),
  descriptionIs: z.string(),
  descriptionEn: z.string(),
  width: z.int().positive(),
  height: z.int().positive(),
  /** Sent back with an edit of its descriptions. */
  updatedAt: timestampSchema,
});

export type AdminMeetingPointPhoto = z.infer<typeof adminMeetingPointPhotoSchema>;

const photosSchema = z.object({ photos: z.array(adminMeetingPointPhotoSchema) });

const photoDescriptionsSchema = z.object({
  /** Read by screen readers; the domain has the limit (`photoLimits`). */
  descriptionIs: longText,
  descriptionEn: longText,
});

const photoParams = z.object({ id: z.uuid(), photoId: z.uuid() });

const photoResponses = {
  200: { description: "The point's photos, in order", schema: photosSchema },
  401: { description: "operator_unauthenticated", ...errors },
  404: { description: "not_found: no such point, or no such photo of it", ...errors },
} as const;

export const adminMeetingPointPhotosRoute = defineRoute({
  method: "get",
  path: "/admin/v1/meeting-points/{id}/photos",
  summary: "A meeting point's photos, in order",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: { params: z.object({ id: z.uuid() }) },
  responses: photoResponses,
});

/** A file's bytes in base64: up to `photoLimits.maxBytes` once decoded. */
const photoFileSchema = z.base64().max(Math.ceil(photoLimits.maxBytes / 3) * 4);

export const adminAddMeetingPointPhotoRoute = defineRoute({
  method: "post",
  path: "/admin/v1/meeting-points/{id}/photos",
  summary: "Add a photo, as the console wrote it again: a JPEG without metadata",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: {
    params: z.object({ id: z.uuid() }),
    body: photoDescriptionsSchema.extend({ file: photoFileSchema }),
  },
  responses: {
    201: { description: "The point's photos, the new one last", schema: photosSchema },
    400: {
      description:
        "validation_failed, with each field and its problem in `details`; the file's are not_jpeg, metadata and too_large",
      ...errors,
    },
    401: photoResponses[401],
    404: { description: "not_found", ...errors },
    409: { description: "too_many_photos; meeting_point_retired", ...errors },
    413: { description: "payload_too_large", ...errors },
    503: { description: "photo_storage_off; photo_storage_unavailable", ...errors },
  },
});

export const adminDescribeMeetingPointPhotoRoute = defineRoute({
  method: "put",
  path: "/admin/v1/meeting-points/{id}/photos/{photoId}",
  summary: "Change a photo's descriptions",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: {
    params: photoParams,
    body: photoDescriptionsSchema.extend({
      /** The photo's `updatedAt` when the console loaded it. */
      updatedAt: timestampSchema,
    }),
  },
  responses: {
    ...photoResponses,
    400: {
      description: "validation_failed, with each field and its problem in `details`",
      ...errors,
    },
    409: { description: "photo_changed: changed since; meeting_point_retired", ...errors },
  },
});

export const adminOrderMeetingPointPhotosRoute = defineRoute({
  method: "put",
  path: "/admin/v1/meeting-points/{id}/photo-order",
  summary: "Put a point's photos in a new order",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: {
    params: z.object({ id: z.uuid() }),
    body: z.object({
      /** Every photo of the point once, the first shown first. */
      order: z.array(z.uuid()).max(photoLimits.maxPerPoint),
    }),
  },
  responses: {
    ...photoResponses,
    400: { description: "validation_failed", ...errors },
    409: {
      description: "photos_changed: one added or removed since; meeting_point_retired",
      ...errors,
    },
  },
});

export const adminRemoveMeetingPointPhotoRoute = defineRoute({
  method: "delete",
  path: "/admin/v1/meeting-points/{id}/photos/{photoId}",
  summary: "Remove a photo, here and in photo storage",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: { params: photoParams },
  responses: {
    ...photoResponses,
    400: { description: "validation_failed", ...errors },
    409: { description: "meeting_point_retired", ...errors },
  },
});

// Adding drafts from a CSV file (spec 2, 3.6.9; milestone 8 plan, 4.6). The
// domain reads and checks the file (`readMeetingPointImport`).

/** A row of the file as it will be saved, or why it will be skipped. */
export const adminImportRowSchema = z.object({
  /** The line of the file the row starts on; the header is line 1. */
  line: z.int().positive(),
  nameIs: z.string(),
  /** The draft as it will be saved; null when the row has problems. */
  point: adminMeetingPointInputSchema
    .pick({
      nameEn: true,
      aliases: true,
      position: true,
      region: true,
      municipality: true,
      type: true,
      amenities: true,
      whereToStandIs: true,
      whereToStandEn: true,
      season: true,
    })
    .nullable(),
  /** By the file's column, "position" for both coordinates, or "row". */
  problems: z.array(z.object({ column: z.string(), issue: z.string() })),
  /** The new draft's ID, once saved. */
  id: z.uuid().nullable(),
});

export type AdminImportRow = z.infer<typeof adminImportRowSchema>;

export const adminImportMeetingPointsRoute = defineRoute({
  method: "post",
  path: "/admin/v1/meeting-points/import",
  summary: "Check a CSV file of meeting points, or add its rows without problems as drafts",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: {
    body: z.object({
      /** The file's text, read as UTF-8. */
      file: z.string().max(importLimits.maxBytes),
      /** False shows what would be saved; true saves it, in one transaction. */
      save: z.boolean(),
    }),
  },
  responses: {
    200: {
      description: "Each row with its problems, and the drafts added when saved",
      schema: z.object({ rows: z.array(adminImportRowSchema), added: z.int().min(0) }),
    },
    400: {
      description:
        "validation_failed: the file cannot be read; `details` has each problem, with `path` " +
        "`file`, `columns.<name>` or `lines.<number>`",
      ...errors,
    },
    401: { description: "operator_unauthenticated", ...errors },
    413: { description: "payload_too_large: the file is over 1 MB", ...errors },
  },
});

// Problem reports about meeting points (spec 2, 3.5 and 3.6; milestone 8,
// PR 10b): the queue of open reports, and resolving one. Never who sent it.

export const adminMeetingPointIssueSchema = z.object({
  id: z.uuid(),
  meetingPoint: z.object({
    id: z.uuid(),
    nameIs: z.string(),
    status: z.enum(meetingPointStatuses),
    lastCheckedOn: dateSchema.nullable(),
  }),
  reason: z.enum(meetingPointIssueReasons),
  note: z.string(),
  sentAt: timestampSchema,
});
export type AdminMeetingPointIssue = z.infer<typeof adminMeetingPointIssueSchema>;

export const adminMeetingPointIssuesRoute = defineRoute({
  method: "get",
  path: "/admin/v1/meeting-point-issues",
  summary: "The open problem reports about meeting points, the oldest first",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  responses: {
    200: {
      description: "The queue",
      schema: z.object({ issues: z.array(adminMeetingPointIssueSchema) }),
    },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminResolveMeetingPointIssueRoute = defineRoute({
  method: "post",
  path: "/admin/v1/meeting-point-issues/{id}/resolve",
  summary:
    "Resolve a problem report with a note on what was done, and mark the point checked today if so; removes the link to the person who sent it",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  request: {
    params: z.object({ id: z.uuid() }),
    // The domain counts the note in characters (`checkIssueResolution`); this bounds the body.
    body: z.object({ note: z.string().max(4000), checkedToday: z.boolean() }),
  },
  responses: {
    204: { description: "Resolved" },
    400: {
      description:
        "validation_failed: the note is empty (`note`, `required`) or over 1 000 characters (`note`, `too_long`)",
      ...errors,
    },
    401: { description: "operator_unauthenticated", ...errors },
    404: { description: "not_found", ...errors },
    409: { description: "issue_resolved: resolved by someone else since", ...errors },
  },
});

// Distances between meeting points (spec 2, 3.7; milestone 8, PR 11b): how
// complete the legs between points in service are, and "Recompute all".
// Legs come from our own road file (ADR 0031).

const legPointSchema = z.object({ id: z.uuid(), nameIs: z.string() });

export const adminLegsStatusSchema = z.object({
  /** The road file the API has now. */
  mapData: z.object({
    /** When the map data was taken; null for a stand-in such as tests'. */
    mapDate: timestampSchema.nullable(),
    /** "© OpenStreetMap contributors", which the data's licence asks the console to show. */
    attribution: z.string(),
  }),
  /** Active, paused and retiring points, which keep legs with each other (R2.11). */
  points: z.int().nonnegative(),
  /** The legs they need: one each way between every two of them. */
  pairs: z.int().nonnegative(),
  /** The legs among them that exist. */
  withLegs: z.int().nonnegative(),
  /** When the newest of those legs was computed. */
  lastComputedAt: timestampSchema.nullable(),
  /** Those legs by the map data they were computed on, the most first. */
  sources: z.array(
    z.object({
      source: z.string(),
      /** The map data's date, for legs from a road file. */
      mapDate: timestampSchema.nullable(),
      /** Computed on the map data the API has now. */
      current: z.boolean(),
      legs: z.int().nonnegative(),
    }),
  ),
  /** Points with no road within 1 km, which get no legs: their position needs a look. */
  offRoad: z.array(legPointSchema),
  /** The first 100 legs missing, by the names of their points. */
  missing: z.array(z.object({ from: legPointSchema, to: legPointSchema })),
});
export type AdminLegsStatus = z.infer<typeof adminLegsStatusSchema>;

export const adminLegsStatusRoute = defineRoute({
  method: "get",
  path: "/admin/v1/legs",
  summary: "How complete the legs between meeting points in service are, and on which map data",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  responses: {
    200: { description: "The legs' status", schema: adminLegsStatusSchema },
    401: { description: "operator_unauthenticated", ...errors },
  },
});

export const adminRecomputeLegsRoute = defineRoute({
  method: "post",
  path: "/admin/v1/legs/recompute",
  summary:
    "Compute the legs between every two meeting points in service again, on the map data the API has now; gives the new status",
  tags: ["admin", "meeting-points"],
  auth: "operator",
  // An empty JSON body: the API takes no other kind of POST (cross-site requests).
  request: { body: z.object({}) },
  responses: {
    200: { description: "Recomputed", schema: adminLegsStatusSchema },
    401: { description: "operator_unauthenticated", ...errors },
  },
});
