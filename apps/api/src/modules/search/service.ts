import type { TripSearchResult } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  err,
  matchTrip,
  ok,
  searchDaysAround,
  type CalendarDay,
  type CoveredPoint,
  type Result,
  type SearchableTrip,
  type SearchSettings,
  type TimeOfDay,
  type TripMatch,
  type TripStatus,
} from "@shareride/domain";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { occupancyNow } from "../bookings/seats.ts";
import { searchableStatuses, toSummary } from "../meeting-points/service.ts";
import { notSuspended } from "../account/standing.ts";
import { closedTrips } from "../safety/blocks.ts";

const { meetingPoints, places, segments, trips, tripStops, users } = schema;

type MeetingPointRow = typeof meetingPoints.$inferSelect;

export interface SearchRequest {
  readonly from: string;
  readonly to: string;
  /** "2026-11-14", the passenger's own departure day in Iceland. */
  readonly date?: string | undefined;
  readonly seats: number;
  readonly instant?: boolean | undefined;
  readonly timeOfDay?: TimeOfDay | undefined;
  readonly sort?: "departure" | "price" | undefined;
}

export type SearchError =
  | { readonly code: "not_found"; readonly ends: readonly ("from" | "to")[] }
  | { readonly code: "same_place" };

export interface SearchService {
  search(
    request: SearchRequest,
    searcherId: string | null,
  ): Promise<Result<TripSearchResult[], SearchError>>;
  /**
   * The rides leaving soonest, each for its whole route and one seat, for
   * the front page (spec 4, 3.8).
   */
  soonest(limit: number, searcherId: string | null): Promise<TripSearchResult[]>;
  /** For "nothing matches": the days around the date, and trips from points nearby. */
  alternatives(
    request: SearchRequest,
    searcherId: string | null,
  ): Promise<
    Result<{ days: { date: string; count: number }[]; nearby: TripSearchResult[] }, SearchError>
  >;
}

/** What a search for one end covers (R4.2). */
interface Coverage {
  readonly points: readonly CoveredPoint[];
  /** Searched as a meeting point: other points show how far they are. */
  readonly fromPoint: boolean;
  /** Where the search was centred, for "nothing matches" (R4.7). */
  readonly centre: { readonly table: "meeting_points" | "places"; readonly id: string };
}

/** At most this many results; without a date a route can have many. */
const resultLimit = 50;
/** At most this many trips from nearby points when nothing matches. */
const nearbyLimit = 10;
/**
 * The rides leaving soon: the trips read at a time, three for each shown
 * and at most 150, and at most ten such batches, after which fewer are shown.
 */
const soonestOverfetch = 3;
const soonestMaxBatch = 150;
const soonestMaxRounds = 10;

const toDay = (date: string): CalendarDay => {
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number);
  return { year, month, day };
};
const isoDay = (day: CalendarDay) =>
  `${String(day.year)}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
/** Iceland keeps UTC all year, so a day there runs from midnight UTC; padded a day for safety. */
const dayBounds = (first: CalendarDay, last: CalendarDay) => ({
  start: new Date(Date.UTC(first.year, first.month - 1, first.day - 1)),
  end: new Date(Date.UTC(last.year, last.month - 1, last.day + 2)),
});

export function createSearchService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings: SearchSettings;
}): SearchService {
  const { db, clock, settings } = dependencies;
  const searchable = inArray(meetingPoints.status, searchableStatuses);

  /** The points a meeting point or a place covers, within `radiusM` when given. */
  async function cover(id: string, radiusM?: number): Promise<Coverage | undefined> {
    const [searched] = await db.select().from(meetingPoints).where(eq(meetingPoints.id, id));
    if (searched !== undefined) {
      const reach = radiusM ?? settings.nearbyPointM;
      const distance = sql<number>`round(st_distance(${meetingPoints.location}, (select ${meetingPoints.location} from ${meetingPoints} where ${meetingPoints.id} = ${id})))::int`;
      const rows = await db
        .select({ id: meetingPoints.id, distanceM: distance })
        .from(meetingPoints)
        .where(
          and(
            searchable,
            sql`st_dwithin(${meetingPoints.location}, (select ${meetingPoints.location} from ${meetingPoints} where ${meetingPoints.id} = ${id}), ${reach})`,
          ),
        );
      const others = rows.filter((row) => row.id !== id);
      return {
        points: [{ meetingPointId: id, distanceM: 0 }, ...others.map(toCovered)],
        fromPoint: true,
        centre: { table: "meeting_points", id },
      };
    }
    const [found] = await db.select().from(places).where(eq(places.id, id));
    if (found === undefined) return undefined;
    const centre = sql`(select ${places.location} from ${places} where ${places.id} = ${id})`;
    const distance = sql<number>`round(st_distance(${meetingPoints.location}, ${centre}))::int`;
    const reach =
      radiusM === undefined && found.municipalities.length > 0
        ? inArray(meetingPoints.municipality, found.municipalities)
        : sql`st_dwithin(${meetingPoints.location}, ${centre}, ${radiusM ?? found.matchRadiusM})`;
    const rows = await db
      .select({ id: meetingPoints.id, distanceM: distance })
      .from(meetingPoints)
      .where(and(searchable, reach));
    return { points: rows.map(toCovered), fromPoint: false, centre: { table: "places", id } };
  }

  const toCovered = (row: { id: string; distanceM: number }): CoveredPoint => ({
    meetingPointId: row.id,
    distanceM: row.distanceM,
  });

  async function resolve(
    request: SearchRequest,
  ): Promise<Result<{ from: Coverage; to: Coverage }, SearchError>> {
    if (request.from === request.to) return err({ code: "same_place" });
    const [from, to] = await Promise.all([cover(request.from), cover(request.to)]);
    const missing = (
      [
        ["from", from],
        ["to", to],
      ] as const
    ).flatMap(([end, coverage]) => (coverage === undefined ? [end] : []));
    if (from === undefined || to === undefined) return err({ code: "not_found", ends: missing });
    return ok({ from, to });
  }

  /**
   * Published trips and trips under way (rule S4) with a stop among `from`
   * boarding late enough (and in `between` when given), and a later stop
   * among `to`, with everything the domain rules need. The SQL only narrows;
   * `matchTrip` decides.
   */
  async function candidates(
    from: readonly CoveredPoint[],
    to: readonly CoveredPoint[],
    searcherId: string | null,
    options: { between?: { start: Date; end: Date }; instant?: boolean },
  ) {
    if (from.length === 0 || to.length === 0) return [];
    const earliest = new Date(clock().getTime() + settings.bookingCutoffMinutes * 60_000);
    const fromIds = from.map((point) => point.meetingPointId);
    const toIds = to.map((point) => point.meetingPointId);
    const between = options.between;
    const found = await db.execute<{ id: string }>(sql`
      select distinct ${trips.id} as id
      from ${trips}
      join ${tripStops} boarding on boarding.trip_id = ${trips.id}
        and boarding.removed_at is null
        and boarding.meeting_point_id in (${sql.join(
          fromIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
        and boarding.planned_at > ${earliest.toISOString()}
        ${between === undefined ? sql`` : sql`and boarding.planned_at >= ${between.start.toISOString()} and boarding.planned_at < ${between.end.toISOString()}`}
      join ${tripStops} alighting on alighting.trip_id = ${trips.id}
        and alighting.removed_at is null
        and alighting.meeting_point_id in (${sql.join(
          toIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
        and alighting.position > boarding.position
      -- Under way, a later stop can still be booked (rule S4).
      where ${trips.status} in ('published', 'departed')
        ${options.instant === true ? sql`and ${trips.bookingMode} = 'instant'` : sql``}
    `);
    return load(
      found.rows.map((row) => row.id),
      searcherId,
    );
  }

  /**
   * The trips, with everything the domain rules need; those closed to the
   * searcher by a block are left out, as if they did not exist (R9.4).
   */
  async function load(found: readonly string[], searcherId: string | null) {
    const closed = await closedTrips(db, searcherId, found);
    const ids = found.filter((id) => !closed.has(id));
    if (ids.length === 0) return [];
    const [tripRows, stopRows, segmentRows, asOfNow] = await Promise.all([
      db
        .select({ trip: trips, firstName: users.firstName })
        .from(trips)
        .innerJoin(users, eq(users.id, trips.driverId))
        .where(and(inArray(trips.id, [...ids]), notSuspended(clock()))),
      db
        .select({ stop: tripStops, point: meetingPoints })
        .from(tripStops)
        .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
        // A stop removed is no longer the trip's (spec 6, 3.2).
        .where(and(inArray(tripStops.tripId, [...ids]), isNull(tripStops.removedAt)))
        .orderBy(asc(tripStops.position)),
      db
        .select()
        .from(segments)
        .where(inArray(segments.tripId, [...ids]))
        .orderBy(asc(segments.position)),
      occupancyNow(db, [...ids], clock()),
    ]);
    return tripRows.map(({ trip, firstName }) => {
      const stops = stopRows.filter((row) => row.stop.tripId === trip.id);
      const searchable: SearchableTrip = {
        id: trip.id,
        driverId: trip.driverId,
        status: trip.status as TripStatus,
        capacity: trip.capacity,
        stops: stops.map((row) => ({
          meetingPointId: row.point.id,
          plannedAt: row.stop.plannedAt ?? new Date(0),
        })),
        segments: segmentRows
          .filter((row) => row.tripId === trip.id)
          .map((row) => ({
            price: row.price,
            occupancy: asOfNow(trip.id, row.position, row.occupancy),
          })),
      };
      return {
        searchable,
        points: stops.map((row) => row.point),
        firstName: firstName ?? "",
        bookingMode: trip.bookingMode as TripSearchResult["bookingMode"],
      };
    });
  }

  type Candidate = Awaited<ReturnType<typeof candidates>>[number];

  function toResult(
    candidate: Candidate,
    found: TripMatch,
    shown: { from: (distanceM: number, id: string) => number | null; to: typeof shown.from },
  ): TripSearchResult {
    const { searchable, points } = candidate;
    const stopAt = (
      position: number,
      distanceM: number,
      nearby: (distanceM: number, id: string) => number | null,
    ) => {
      const point = points[position] as MeetingPointRow;
      return {
        position,
        meetingPoint: toSummary(point),
        plannedAt: (searchable.stops[position]?.plannedAt ?? new Date(0)).toISOString(),
        nearbyM: nearby(distanceM, point.id),
      };
    };
    const first = points[0] as MeetingPointRow;
    const last = points.at(-1) as MeetingPointRow;
    return {
      tripId: searchable.id,
      board: stopAt(found.board, found.boardDistanceM, shown.from),
      alight: stopAt(found.alight, found.alightDistanceM, shown.to),
      tripFrom: toSummary(first).name,
      tripTo: toSummary(last).name,
      pricePerSeat: found.pricePerSeat,
      total: found.total,
      freeSeats: found.freeSeats,
      driver: { firstName: candidate.firstName },
      bookingMode: candidate.bookingMode,
    };
  }

  /** A nearby distance shows for points other than the meeting point searched (spec 4, 3.2). */
  const nearbyOf = (coverage: Coverage) => (distanceM: number) =>
    coverage.fromPoint && distanceM > 0 ? distanceM : null;

  function sorted(
    found: { result: TripSearchResult; boardsAt: Date }[],
    sort: SearchRequest["sort"],
  ) {
    return found
      .sort(
        (a, b) =>
          (sort === "price" ? a.result.pricePerSeat.amount - b.result.pricePerSeat.amount : 0) ||
          a.boardsAt.getTime() - b.boardsAt.getTime() ||
          // The same order every time for trips leaving together.
          (a.result.tripId < b.result.tripId ? -1 : a.result.tripId > b.result.tripId ? 1 : 0),
      )
      .map(({ result }) => result);
  }

  return {
    async search(request, searcherId) {
      const resolved = await resolve(request);
      if (!resolved.ok) return resolved;
      const { from, to } = resolved.value;
      const date = request.date === undefined ? null : toDay(request.date);
      const found = await candidates(from.points, to.points, searcherId, {
        ...(date === null ? {} : { between: dayBounds(date, date) }),
        ...(request.instant === undefined ? {} : { instant: request.instant }),
      });
      const now = clock();
      const shown = { from: nearbyOf(from), to: nearbyOf(to) };
      const matches = found.flatMap((candidate) => {
        const match = matchTrip(
          candidate.searchable,
          {
            from: from.points,
            to: to.points,
            date,
            timeOfDay: request.timeOfDay ?? null,
            seats: request.seats,
            searcherId,
          },
          now,
          settings,
        );
        if (match === null) return [];
        const boardsAt = candidate.searchable.stops[match.board]?.plannedAt ?? new Date(0);
        return [{ result: toResult(candidate, match, shown), boardsAt }];
      });
      return ok(sorted(matches, request.sort).slice(0, resultLimit));
    },

    async soonest(limit, searcherId) {
      const now = clock();
      const earliest = new Date(now.getTime() + settings.bookingCutoffMinutes * 60_000);
      const searchableStatus = sql.join(
        searchableStatuses.map((status) => sql`${status}`),
        sql`, `,
      );
      const whole = { from: () => null, to: () => null };
      const matchWhole = (candidate: Candidate) => {
        const { stops } = candidate.searchable;
        const first = stops[0];
        const last = stops.at(-1);
        if (first === undefined || last === undefined) return [];
        const match = matchTrip(
          candidate.searchable,
          {
            from: [{ meetingPointId: first.meetingPointId, distanceM: 0 }],
            to: [{ meetingPointId: last.meetingPointId, distanceM: 0 }],
            date: null,
            timeOfDay: null,
            seats: 1,
            searcherId,
          },
          now,
          settings,
        );
        // Listed only for the whole route, from the first stop to the last.
        if (match?.board !== 0 || match.alight !== stops.length - 1) return [];
        return [{ result: toResult(candidate, match, whole), boardsAt: first.plannedAt }];
      };

      // The SQL only narrows: some trips are full on a stretch or the
      // searcher's own, which the domain decides. So it reads the trips
      // soonest first in batches, until enough match or none are left.
      const batch = Math.min(limit * soonestOverfetch, soonestMaxBatch);
      const found: { result: TripSearchResult; boardsAt: Date }[] = [];
      let after: { plannedAt: string; id: string } | null = null;
      for (let round = 0; round < soonestMaxRounds && found.length < limit; round += 1) {
        const page: { rows: { id: string; planned_at: string }[] } = await db.execute(sql`
          select ${trips.id} as id, first.planned_at::text as planned_at
          from ${trips}
          join ${tripStops} first on first.trip_id = ${trips.id} and first.position = 0
            and first.removed_at is null
          join ${meetingPoints} first_point on first_point.id = first.meeting_point_id
          join ${tripStops} last on last.trip_id = ${trips.id} and last.removed_at is null
            and last.position = (
              select max(position) from ${tripStops}
              where trip_id = ${trips.id} and removed_at is null
            )
          join ${meetingPoints} last_point on last_point.id = last.meeting_point_id
          where ${trips.status} = 'published'
            and first.planned_at > ${earliest.toISOString()}
            and first_point.status in (${searchableStatus})
            and last_point.status in (${searchableStatus})
            ${after === null ? sql`` : sql`and (first.planned_at, ${trips.id}) > (${after.plannedAt}::timestamptz, ${after.id}::uuid)`}
          order by first.planned_at, ${trips.id}
          limit ${batch}
        `);
        const loaded = await load(
          page.rows.map((row) => row.id),
          searcherId,
        );
        found.push(...loaded.flatMap(matchWhole));
        const last = page.rows.at(-1);
        if (page.rows.length < batch || last === undefined) break;
        after = { plannedAt: last.planned_at, id: last.id };
      }
      return sorted(found, "departure").slice(0, limit);
    },

    async alternatives(request, searcherId) {
      const resolved = await resolve(request);
      if (!resolved.ok) return resolved;
      const { from, to } = resolved.value;
      const now = clock();
      const date = request.date === undefined ? null : toDay(request.date);
      const searchOf = (day: CalendarDay | null, ends = { from: from.points, to: to.points }) => ({
        ...ends,
        date: day,
        timeOfDay: null,
        seats: request.seats,
        searcherId,
      });

      let days: { date: string; count: number }[] = [];
      if (date !== null) {
        const around = searchDaysAround(date, settings);
        const first = around[0] ?? date;
        const last = around.at(-1) ?? date;
        const found = await candidates(from.points, to.points, searcherId, {
          between: dayBounds(first, last),
        });
        days = around.map((day) => ({
          date: isoDay(day),
          count: found.filter(
            (candidate) => matchTrip(candidate.searchable, searchOf(day), now, settings) !== null,
          ).length,
        }));
      }

      // Points within reach of what was searched, at either end (R4.7).
      const centreId = (coverage: Coverage) => coverage.centre.id;
      const [wideFrom, wideTo] = await Promise.all([
        cover(centreId(from), settings.alternativesRadiusM),
        cover(centreId(to), settings.alternativesRadiusM),
      ]);
      const ends = { from: wideFrom?.points ?? [], to: wideTo?.points ?? [] };
      const covers = (coverage: Coverage, id: string) =>
        coverage.points.some((point) => point.meetingPointId === id);
      const outside = (coverage: Coverage) => (distanceM: number, id: string) =>
        covers(coverage, id) ? nearbyOf(coverage)(distanceM) : distanceM;
      const found = await candidates(ends.from, ends.to, searcherId, {
        ...(date === null ? {} : { between: dayBounds(date, date) }),
      });
      const nearby = found.flatMap((candidate) => {
        const match = matchTrip(candidate.searchable, searchOf(date, ends), now, settings);
        if (match === null) return [];
        const board = candidate.points[match.board]?.id ?? "";
        const alight = candidate.points[match.alight]?.id ?? "";
        // A trip the search itself finds is not an alternative.
        if (covers(from, board) && covers(to, alight)) return [];
        const boardsAt = candidate.searchable.stops[match.board]?.plannedAt ?? new Date(0);
        const shown = { from: outside(from), to: outside(to) };
        return [{ result: toResult(candidate, match, shown), boardsAt }];
      });
      return ok({ days, nearby: sorted(nearby, "departure").slice(0, nearbyLimit) });
    },
  };
}
