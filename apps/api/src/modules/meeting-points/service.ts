import type {
  MeetingPointDetails,
  MeetingPointSummary,
  NearestMeetingPoints,
  Place,
  PlaceSearchResult,
} from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  isOfferedForNewTrips,
  isVisible,
  meetingPointStatuses,
  minimumQueryLength,
  normaliseSearchText,
  rankPlaceMatches,
  type PlaceCandidate,
} from "@shareride/domain";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

const { meetingPoints, places } = schema;

type MeetingPointRow = typeof meetingPoints.$inferSelect;
type PlaceRow = typeof places.$inferSelect;

/** Shown on the map and in the list (spec 2, 3.1.5). */
const visibleStatuses = meetingPointStatuses.filter(isVisible);
/** Offered for new trips, and so near a place (rule R2.4). */
const offeredStatuses = meetingPointStatuses.filter(isOfferedForNewTrips);
/** Close enough in trigrams to be worth ranking; the domain rule decides (spec 2, 3.4). */
const trigramThreshold = 0.3;
/** Rows of each table the domain rule ranks, best SQL matches first. */
const candidatesPerTable = 50;
/** Shown when no point is within a place's reach. */
const nearestWhenNoneInReach = 3;

const localised = (is: string, en: string | null) => ({ is, en: en ?? is });

function toSummary(row: MeetingPointRow): MeetingPointSummary {
  return {
    id: row.id,
    name: localised(row.nameIs, row.nameEn),
    region: row.region as MeetingPointSummary["region"],
    municipality: row.municipality,
    type: row.type as MeetingPointSummary["type"],
    amenities: row.amenities as MeetingPointSummary["amenities"],
    position: row.location,
    status: row.status as MeetingPointSummary["status"],
    season:
      row.seasonStartMonth === null || row.seasonEndMonth === null
        ? null
        : { startMonth: row.seasonStartMonth, endMonth: row.seasonEndMonth },
    pauseReason:
      row.status === "paused" && row.pauseReasonIs !== null
        ? localised(row.pauseReasonIs, row.pauseReasonEn)
        : null,
    sample: row.sample,
  };
}

function toPlace(row: PlaceRow): Place {
  return {
    id: row.id,
    name: localised(row.nameIs, row.nameEn),
    kind: row.kind as Place["kind"],
    region: row.region as Place["region"],
  };
}

const namesOf = (row: { nameIs: string; nameEn: string | null }) =>
  row.nameEn === null ? [row.nameIs] : [row.nameIs, row.nameEn];

export interface MeetingPointService {
  /** Every point the map and list show (spec 2, 3.1). */
  list(): Promise<MeetingPointSummary[]>;
  details(id: string): Promise<MeetingPointDetails | undefined>;
  /** Meeting points and places matching a query, best first (spec 2, 3.4). */
  searchPlaces(query: string): Promise<PlaceSearchResult[]>;
  /** The active points a place covers, or the nearest ones when it covers none. */
  nearest(placeId: string): Promise<NearestMeetingPoints | undefined>;
}

export function createMeetingPointService(dependencies: {
  readonly db: Database;
}): MeetingPointService {
  const { db } = dependencies;
  const visible = inArray(meetingPoints.status, visibleStatuses);

  type SearchText = typeof meetingPoints.searchText | typeof places.searchText;

  function matching(column: SearchText, q: string) {
    // Normalised text holds only letters, digits and spaces, so LIKE needs no escaping.
    return or(
      sql`${column} like ${`%${q}%`}`,
      sql`word_similarity(${q}, ${column}) > ${trigramThreshold}`,
    );
  }

  /** Texts that start with the query, then the closest, so the limit keeps the best. */
  function bestFirst(column: SearchText, q: string) {
    return [
      desc(sql`${column} like ${`${q}%`}`),
      desc(sql`word_similarity(${q}, ${column})`),
    ] as const;
  }

  return {
    async list() {
      const rows = await db
        .select()
        .from(meetingPoints)
        .where(visible)
        .orderBy(asc(meetingPoints.nameIs));
      return rows.map(toSummary);
    },

    async details(id) {
      const [row] = await db
        .select()
        .from(meetingPoints)
        .where(and(eq(meetingPoints.id, id), visible));
      if (row === undefined) return undefined;
      return {
        ...toSummary(row),
        aliases: row.aliases,
        whereToStand:
          row.whereToStandIs === null ? null : localised(row.whereToStandIs, row.whereToStandEn),
        pausedUntil: row.status === "paused" ? row.pausedUntil : null,
        lastCheckedOn: row.lastCheckedOn,
      };
    },

    async searchPlaces(query) {
      const q = normaliseSearchText(query);
      if (q.length < minimumQueryLength) return [];
      const [pointRows, placeRows] = await Promise.all([
        db
          .select()
          .from(meetingPoints)
          .where(and(visible, matching(meetingPoints.searchText, q)))
          .orderBy(...bestFirst(meetingPoints.searchText, q))
          .limit(candidatesPerTable),
        db
          .select()
          .from(places)
          .where(matching(places.searchText, q))
          .orderBy(...bestFirst(places.searchText, q))
          .limit(candidatesPerTable),
      ]);
      type Candidate = PlaceCandidate &
        ({ kind: "meetingPoint"; row: MeetingPointRow } | { kind: "place"; row: PlaceRow });
      const candidates: Candidate[] = [
        ...pointRows.map((row) => ({
          id: row.id,
          kind: "meetingPoint" as const,
          names: namesOf(row),
          aliases: row.aliases,
          row,
        })),
        ...placeRows.map((row) => ({
          id: row.id,
          kind: "place" as const,
          names: namesOf(row),
          aliases: row.aliases,
          row,
        })),
      ];
      return rankPlaceMatches(q, candidates).map(({ candidate }) =>
        candidate.kind === "meetingPoint"
          ? { kind: "meetingPoint", meetingPoint: toSummary(candidate.row) }
          : { kind: "place", place: toPlace(candidate.row) },
      );
    },

    async nearest(placeId) {
      const [place] = await db.select().from(places).where(eq(places.id, placeId));
      if (place === undefined) return undefined;
      const distance = sql<number>`round(st_distance(${meetingPoints.location}, (select ${places.location} from ${places} where ${places.id} = ${placeId})))::int`;
      const active = inArray(meetingPoints.status, offeredStatuses);
      const reach =
        place.municipalities.length > 0
          ? inArray(meetingPoints.municipality, place.municipalities)
          : sql`st_dwithin(${meetingPoints.location}, (select ${places.location} from ${places} where ${places.id} = ${placeId}), ${place.matchRadiusM})`;
      const select = () =>
        db
          .select({ row: meetingPoints, distanceM: distance })
          .from(meetingPoints)
          .orderBy(asc(distance));
      const inReach = await select().where(and(active, reach));
      const rows =
        inReach.length > 0 ? inReach : await select().where(active).limit(nearestWhenNoneInReach);
      return {
        place: toPlace(place),
        withinReach: inReach.length > 0,
        meetingPoints: rows.map(({ row, distanceM }) => ({
          meetingPoint: toSummary(row),
          distanceM,
        })),
      };
    },
  };
}
