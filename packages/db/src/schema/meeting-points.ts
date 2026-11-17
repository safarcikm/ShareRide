import {
  amenities,
  meetingPointIssueReasons,
  meetingPointIssueStatuses,
  meetingPointStatuses,
  meetingPointTypes,
  placeKinds,
  regions,
  type ShelterHours,
} from "@shareride/domain";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { at, geographyPoint, id, oneOf, timestamps } from "./columns.ts";
import { users } from "./users.ts";

/**
 * Curated places where trips start, stop and end (spec 2, ADR 0006). Only
 * the operator changes them; they are never deleted (rule R2.2).
 */
export const meetingPoints = pgTable(
  "meeting_points",
  {
    id: id(),
    nameIs: text().notNull(),
    /** Null when the English name is the same. */
    nameEn: text(),
    /** Other names people search for, such as "KEF". */
    aliases: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    location: geographyPoint().notNull(),
    region: text().notNull(),
    municipality: text().notNull(),
    type: text().notNull(),
    amenities: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    whereToStandIs: text(),
    whereToStandEn: text(),
    /** A week of the shelter's opening hours from Monday, each day null when closed (spec 2, 3.2). */
    shelterHours: jsonb().$type<ShelterHours>(),
    /** Such as holiday hours, per language. */
    shelterNoteIs: text(),
    shelterNoteEn: text(),
    /** Whole months, 1 to 12, possibly across the new year; null for all year (R2.5). */
    seasonStartMonth: smallint(),
    seasonEndMonth: smallint(),
    status: text().notNull().default("draft"),
    pauseReasonIs: text(),
    pauseReasonEn: text(),
    pausedUntil: date({ mode: "string" }),
    /** The day the operator last confirmed the point, from a visit or local knowledge (spec 2, decision 2). */
    lastCheckedOn: date({ mode: "string" }),
    reviewDueOn: date({ mode: "string" }),
    /** When the operator reviewed the amenities and the season, for activation (R2.3). */
    amenitiesReviewedOn: date({ mode: "string" }),
    seasonReviewedOn: date({ mode: "string" }),
    /** Sample data for local development and staging (milestone 3, decision 1). */
    sample: boolean().notNull().default(false),
    /** The names and aliases normalised by rule R2.6, for place search. */
    searchText: text().notNull(),
    ...timestamps,
  },
  (table) => [
    check("meeting_points_region_check", oneOf(table.region, regions)),
    check("meeting_points_type_check", oneOf(table.type, meetingPointTypes)),
    check("meeting_points_status_check", oneOf(table.status, meetingPointStatuses)),
    check(
      "meeting_points_amenities_check",
      sql`${table.amenities} <@ array[${sql.join(
        amenities.map((amenity) => sql.raw(`'${amenity}'`)),
        sql`, `,
      )}]::text[]`,
    ),
    check(
      "meeting_points_season_check",
      sql`(${table.seasonStartMonth} is null and ${table.seasonEndMonth} is null) or (${table.seasonStartMonth} between 1 and 12 and ${table.seasonEndMonth} between 1 and 12)`,
    ),
    // Seven days, Monday first; the domain checks each day's times.
    check(
      "meeting_points_shelter_hours_check",
      sql`case when ${table.shelterHours} is null then true when jsonb_typeof(${table.shelterHours}) = 'array' then jsonb_array_length(${table.shelterHours}) = 7 else false end`,
    ),
    index("meeting_points_location_index").using("gist", table.location),
    index("meeting_points_search_text_index").using("gin", sql`${table.searchText} gin_trgm_ops`),
  ],
);

/**
 * Towns, villages, landmarks and the capital area: not meeting points, but
 * what people type to find the meeting points near them (spec 2, 3.4).
 */
export const places = pgTable(
  "places",
  {
    id: id(),
    nameIs: text().notNull(),
    nameEn: text(),
    aliases: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    location: geographyPoint().notNull(),
    kind: text().notNull(),
    region: text().notNull(),
    /** A search for this place covers active points this close (spec 4, R4.2). */
    matchRadiusM: integer().notNull(),
    /**
     * When set, the place covers every active point in these municipalities
     * instead of a radius: "Reykjavík" covers the capital area (spec 4, 3.2).
     */
    municipalities: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    sample: boolean().notNull().default(false),
    searchText: text().notNull(),
    ...timestamps,
  },
  (table) => [
    check("places_kind_check", oneOf(table.kind, placeKinds)),
    check("places_region_check", oneOf(table.region, regions)),
    check("places_match_radius_check", sql`${table.matchRadiusM} > 0`),
    index("places_search_text_index").using("gin", sql`${table.searchText} gin_trgm_ops`),
  ],
);

/**
 * The road distance and typical driving time from one meeting point to
 * another, computed ahead (spec 2, 3.7; ADR 0009). A to B and B to A are
 * separate legs.
 */
export const legs = pgTable(
  "legs",
  {
    fromMeetingPointId: uuid()
      .notNull()
      .references(() => meetingPoints.id),
    toMeetingPointId: uuid()
      .notNull()
      .references(() => meetingPoints.id),
    distanceM: integer().notNull(),
    durationS: integer().notNull(),
    computedAt: at().notNull(),
    /** What computed it: the routing engine and its map data, or the sample road graph. */
    source: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.fromMeetingPointId, table.toMeetingPointId] }),
    check(
      "legs_not_to_itself_check",
      sql`${table.fromMeetingPointId} <> ${table.toMeetingPointId}`,
    ),
    check("legs_positive_check", sql`${table.distanceM} > 0 and ${table.durationS} > 0`),
    index("legs_to_index").on(table.toMeetingPointId),
  ],
);

/**
 * Photos of a meeting point (spec 2, 3.6.3), up to five, shown in their
 * order. The file is in photo storage under `storageKey` (ADR 0022): a
 * JPEG the console wrote again without metadata, of faces and number
 * plates blurred by the operator. A photo the operator removes is deleted
 * here and in storage.
 */
export const meetingPointPhotos = pgTable(
  "meeting_point_photos",
  {
    id: id(),
    meetingPointId: uuid()
      .notNull()
      .references(() => meetingPoints.id),
    /** A random name in photo storage, never the operator's file name. */
    storageKey: text().notNull(),
    descriptionIs: text().notNull(),
    descriptionEn: text().notNull(),
    /** From 0, the first shown first. */
    position: smallint().notNull(),
    width: smallint().notNull(),
    height: smallint().notNull(),
    bytes: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    unique("meeting_point_photos_storage_key_unique").on(table.storageKey),
    index("meeting_point_photos_point_index").on(table.meetingPointId, table.position),
    check(
      "meeting_point_photos_size_check",
      sql`${table.width} > 0 and ${table.height} > 0 and ${table.bytes} > 0`,
    ),
    check("meeting_point_photos_position_check", sql`${table.position} >= 0`),
  ],
);

/**
 * Problem reports about a meeting point (spec 2, 3.5): open in the
 * operator's queue until resolved. Resolving removes the link to the person
 * who sent it, and the report is deleted 12 months later (section 7).
 */
export const meetingPointIssues = pgTable(
  "meeting_point_issues",
  {
    id: id(),
    meetingPointId: uuid()
      .notNull()
      .references(() => meetingPoints.id),
    /** Who sent it, until it is resolved. */
    reporterId: uuid().references(() => users.id, { onDelete: "set null" }),
    reason: text().notNull(),
    note: text().notNull().default(""),
    status: text().notNull().default("open"),
    /** The operator's note on what was done. */
    resolutionNote: text(),
    resolvedById: uuid().references(() => users.id, { onDelete: "set null" }),
    resolvedAt: at(),
    ...timestamps,
  },
  (table) => [
    index("meeting_point_issues_reporter_index").on(table.reporterId, table.createdAt),
    index("meeting_point_issues_point_index").on(table.meetingPointId),
    index("meeting_point_issues_open_index")
      .on(table.createdAt)
      .where(sql`${table.status} = 'open'`),
    index("meeting_point_issues_resolved_index").on(table.resolvedAt),
    check("meeting_point_issues_reason_check", oneOf(table.reason, meetingPointIssueReasons)),
    check("meeting_point_issues_status_check", oneOf(table.status, meetingPointIssueStatuses)),
    check(
      "meeting_point_issues_resolved_check",
      sql`(${table.status} = 'resolved') = (${table.resolvedAt} is not null) and (${table.status} = 'resolved') = (${table.resolutionNote} is not null) and (${table.status} = 'open' or ${table.reporterId} is null)`,
    ),
  ],
);
