import {
  amenities,
  meetingPointStatuses,
  meetingPointTypes,
  placeKinds,
  regions,
} from "@shareride/domain";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { at, geographyPoint, id, oneOf, timestamps } from "./columns.ts";

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
    /** Whole months, 1 to 12, possibly across the new year; null for all year (R2.5). */
    seasonStartMonth: smallint(),
    seasonEndMonth: smallint(),
    status: text().notNull().default("draft"),
    pauseReasonIs: text(),
    pauseReasonEn: text(),
    pausedUntil: date({ mode: "string" }),
    lastCheckedOn: date({ mode: "string" }),
    reviewDueOn: date({ mode: "string" }),
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
