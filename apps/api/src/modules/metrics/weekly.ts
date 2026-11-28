import { schema, type Database } from "@shareride/db";
import {
  addIsoWeeks,
  addWeekMetrics,
  checkExitCriteria,
  compareIsoWeeks,
  endOfIsoWeek,
  exitCriteriaWeeks,
  inIceland,
  isoWeekOf,
  isoWeeksBetween,
  metricKeys,
  onCorridor,
  repeatWithinDays,
  startOfIcelandDay,
  startOfIsoWeek,
  weekMetrics,
  type BookingStatus,
  type ExitCriterionResult,
  type IsoWeek,
  type MetricKey,
  type MetricRecords,
  type WeekMetrics,
} from "@shareride/domain";
import { and, asc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { partDistanceSql } from "../co2/figures.ts";

const { corridors, weeklyMetrics } = schema;

// The weekly figures (spec 10, 3.4; plan 4.6): read from the database's
// own records and the search log, counted by the domain's rules, and
// stored one row per corridor, week and metric.

/** The nightly run starts once this hour has come, Iceland time. */
export const metricsRunHour = 3;
/** The nightly run counts the current week and this many before it (spec 10, 3.4.4). */
export const metricsWeeksBack = 2;

export interface WeekFigures {
  readonly week: IsoWeek;
  /** Null for a week not counted yet. */
  readonly metrics: WeekMetrics | null;
  readonly computedAt: Date | null;
}

export interface MetricsView {
  /** Null for everything. */
  readonly corridorId: string | null;
  readonly weeks: readonly WeekFigures[];
  /** The last 4 complete weeks on the active corridors (decision 2). */
  readonly exitCriteria: {
    readonly from: IsoWeek;
    readonly to: IsoWeek;
    readonly criteria: readonly ExitCriterionResult[];
  };
  readonly corridors: readonly {
    readonly id: string;
    readonly name: string;
    readonly active: boolean;
  }[];
}

export interface WeeklyMetricsService {
  /**
   * Counts these weeks again, for everything and for each active corridor,
   * and stores the figures in place of what was there.
   */
  compute(weeks: readonly IsoWeek[]): Promise<void>;
  /**
   * The nightly run: once a day, after 03:00, the current week and the two
   * before it. Does nothing when today's run is done; says whether it ran.
   */
  computeIfDue(): Promise<boolean>;
  /** The stored figures of the weeks from `from` to `to`, and the exit criteria now. */
  read(range: {
    readonly from: IsoWeek;
    readonly to: IsoWeek;
    readonly corridorId: string | null;
  }): Promise<MetricsView | undefined>;
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Records with what places each belongs to, before they are split by corridor. */
interface Loaded {
  readonly searches: readonly {
    readonly at: Date;
    readonly results: number;
    readonly from: readonly string[];
    readonly to: readonly string[];
  }[];
  readonly trips: readonly (MetricRecords["trips"][number] & {
    readonly from: readonly string[];
    readonly to: readonly string[];
  })[];
  readonly bookings: MetricRecords["bookings"];
  readonly reports: readonly (MetricRecords["reports"][number] & {
    readonly tripId: string | null;
  })[];
  readonly payments: readonly (MetricRecords["payments"][number] & { readonly tripId: string })[];
  readonly refunds: readonly (MetricRecords["refunds"][number] & { readonly tripId: string })[];
}

const iso = (moment: Date) => moment.toISOString();

/** Everything the weeks from `start` to `end` are counted from. */
async function load(tx: Transaction, start: Date, end: Date): Promise<Loaded> {
  // A repeat passenger is found from the bookings of the 60 days before.
  const before = new Date(start.getTime() - repeatWithinDays * 24 * 60 * 60 * 1000);
  const window = (column: ReturnType<typeof sql>) =>
    sql`(${column} >= ${iso(start)} and ${column} < ${iso(end)})`;

  // Each meeting point with the places that cover it, as a search for the place does (spec 4, 3.2).
  const covering = await tx.execute<{ point: string; place: string }>(sql`
    select mp.id as point, p.id as place
    from meeting_points mp
    join places p on (
      cardinality(p.municipalities) > 0 and mp.municipality = any(p.municipalities)
    ) or (
      cardinality(p.municipalities) = 0 and st_dwithin(mp.location, p.location, p.match_radius_m)
    )
    where p.id in (select unnest(place_ids) from corridors)
  `);
  const placesOf = new Map<string, string[]>();
  for (const row of covering.rows) {
    placesOf.set(row.point, [...(placesOf.get(row.point) ?? []), row.place]);
  }
  const places = (kind: string, id: string) => (kind === "place" ? [id] : (placesOf.get(id) ?? []));

  const searchRows = await tx.execute<{
    at: Date;
    results: number;
    from_kind: string;
    from_id: string;
    to_kind: string;
    to_id: string;
  }>(sql`
    select searched_hour as at, results, from_kind, from_id, to_kind, to_id
    from search_log
    where ${window(sql`searched_hour`)}
  `);

  const tripRows = await tx.execute<{
    id: string;
    driver_id: string;
    published_at: Date;
    departs_at: Date;
    completed_at: Date | null;
    cancelled_at: Date | null;
    capacity: number;
    driver_cancellation_counts: boolean;
    first_point: string | null;
    last_point: string | null;
    offered_seat_m: string;
    booked_seat_m: string;
  }>(sql`
    select t.id, t.driver_id, t.published_at, t.departs_at, t.completed_at, t.cancelled_at,
      t.capacity,
      (t.cancelled_by = 'driver' and t.counts_on_reliability) is true as driver_cancellation_counts,
      (select s.meeting_point_id from trip_stops s
        where s.trip_id = t.id and s.removed_at is null order by s.position asc limit 1) as first_point,
      (select s.meeting_point_id from trip_stops s
        where s.trip_id = t.id and s.removed_at is null order by s.position desc limit 1) as last_point,
      coalesce((select sum(g.distance_m::bigint * g.capacity) from segments g where g.trip_id = t.id), 0)
        as offered_seat_m,
      coalesce((select sum(g.distance_m::bigint * g.occupancy) from segments g where g.trip_id = t.id), 0)
        as booked_seat_m
    from trips t
    where t.status <> 'draft' and t.published_at is not null and t.departs_at is not null and (
      ${window(sql`t.published_at`)} or ${window(sql`t.departs_at`)} or ${window(sql`t.completed_at`)}
      or t.id in (
        select b.trip_id from bookings b
        where (b.created_at >= ${iso(before)} and b.created_at < ${iso(end)})
          or (b.confirmed_at >= ${iso(before)} and b.confirmed_at < ${iso(end)})
          or ${window(sql`b.cancelled_at`)} or ${window(sql`b.completed_at`)}
      )
    )
  `);
  const tripIds = tripRows.rows.map((row) => row.id);
  const idList = sql.join(
    tripIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const bookingRows =
    tripIds.length === 0
      ? []
      : (
          await tx.execute<{
            id: string;
            trip_id: string;
            passenger_id: string;
            seats: number;
            created_at: Date;
            confirmed_at: Date | null;
            cancelled_at: Date | null;
            status: string;
            cancelled_by: "passenger" | "driver" | "operator" | null;
            counts_on_reliability: boolean;
            refund_amount: number | null;
            completed_at: Date | null;
            distance_m: number | string;
            co2_grams: number | null;
          }>(sql`
            select b.id, b.trip_id, b.passenger_id, b.seats, b.created_at, b.confirmed_at,
              b.cancelled_at, b.status, b.cancelled_by, b.counts_on_reliability, b.refund_amount,
              b.completed_at, b.co2_grams,
              ${partDistanceSql(sql`b.trip_id`, sql`f.position`, sql`a.position`)} as distance_m
            from bookings b
              join trip_stops f on f.id = b.from_stop_id
              join trip_stops a on a.id = b.to_stop_id
            where b.trip_id in (${idList})
          `)
        ).rows;

  const paymentRows =
    tripIds.length === 0
      ? []
      : (
          await tx.execute<{ at: Date; amount: number; trip_id: string }>(sql`
            select p.settled_at as at, p.amount, b.trip_id
            from payments p join bookings b on b.id = p.booking_id
            where p.status in ('succeeded', 'refund_due', 'refunded') and ${window(sql`p.settled_at`)}
              and b.trip_id in (${idList})
          `)
        ).rows;

  const reportRows = await tx.execute<{
    created_at: Date;
    closed_at: Date | null;
    trip_id: string | null;
  }>(sql`
    select r.created_at, r.closed_at, coalesce(r.trip_id, b.trip_id) as trip_id
    from reports r left join bookings b on b.id = r.booking_id
    where ${window(sql`r.created_at`)}
  `);

  const date = (value: Date | string) => new Date(value);
  const maybe = (value: Date | string | null) => (value === null ? null : new Date(value));
  return {
    searches: searchRows.rows.map((row) => ({
      at: date(row.at),
      results: row.results,
      from: places(row.from_kind, row.from_id),
      to: places(row.to_kind, row.to_id),
    })),
    trips: tripRows.rows.map((row) => ({
      id: row.id,
      driverId: row.driver_id,
      publishedAt: date(row.published_at),
      departsAt: date(row.departs_at),
      completedAt: maybe(row.completed_at),
      cancelledAt: maybe(row.cancelled_at),
      capacity: row.capacity,
      driverCancellationCounts: row.driver_cancellation_counts,
      offeredSeatM: Number(row.offered_seat_m),
      bookedSeatM: Number(row.booked_seat_m),
      from: row.first_point === null ? [] : places("meeting_point", row.first_point),
      to: row.last_point === null ? [] : places("meeting_point", row.last_point),
    })),
    bookings: bookingRows.map((row) => ({
      tripId: row.trip_id,
      passengerId: row.passenger_id,
      seats: row.seats,
      createdAt: date(row.created_at),
      confirmedAt: maybe(row.confirmed_at),
      status: row.status as BookingStatus,
      cancelledBy: row.cancelled_by,
      countsOnReliability: row.counts_on_reliability,
      completedAt: maybe(row.completed_at),
      distanceM: Number(row.distance_m),
      co2Grams: row.co2_grams,
    })),
    reports: reportRows.rows.map((row) => ({
      createdAt: date(row.created_at),
      closedAt: maybe(row.closed_at),
      tripId: row.trip_id,
    })),
    payments: paymentRows.map((row) => ({
      at: date(row.at),
      amount: row.amount,
      tripId: row.trip_id,
    })),
    refunds: bookingRows.flatMap((row) =>
      row.cancelled_at === null || row.refund_amount === null || row.refund_amount === 0
        ? []
        : [{ at: date(row.cancelled_at), amount: row.refund_amount, tripId: row.trip_id }],
    ),
  };
}

/** The records of one corridor: its searches and trips, and what belongs to those trips. */
function onlyOn(loaded: Loaded, corridor: { readonly placeIds: readonly string[] }): Loaded {
  const trips = loaded.trips.filter((trip) => onCorridor(corridor, trip.from, trip.to));
  const ids = new Set(trips.map((trip) => trip.id));
  const ofTrip = (row: { readonly tripId: string | null }) =>
    row.tripId !== null && ids.has(row.tripId);
  return {
    searches: loaded.searches.filter((search) => onCorridor(corridor, search.from, search.to)),
    trips,
    bookings: loaded.bookings.filter(ofTrip),
    // A report about no trip, such as one about a profile, is in the total alone.
    reports: loaded.reports.filter(ofTrip),
    payments: loaded.payments.filter(ofTrip),
    refunds: loaded.refunds.filter(ofTrip),
  };
}

export function createWeeklyMetricsService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
}): WeeklyMetricsService {
  const { db, clock } = dependencies;

  async function computeIn(tx: Transaction, weeks: readonly IsoWeek[], now: Date) {
    if (weeks.length === 0) return;
    const sorted = [...weeks].sort(compareIsoWeeks);
    const first = sorted[0] as IsoWeek;
    const last = sorted.at(-1) as IsoWeek;
    const loaded = await load(tx, startOfIsoWeek(first), endOfIsoWeek(last));
    const active = await tx
      .select({ id: corridors.id, placeIds: corridors.placeIds })
      .from(corridors)
      .where(eq(corridors.active, true));
    const scopes: { corridorId: string | null; records: Loaded }[] = [
      { corridorId: null, records: loaded },
      ...active.map((corridor) => ({ corridorId: corridor.id, records: onlyOn(loaded, corridor) })),
    ];
    const rows = scopes.flatMap(({ corridorId, records }) =>
      sorted.flatMap((week) => {
        const metrics = weekMetrics(records, week, now);
        return metricKeys.map((metric) => ({
          corridorId,
          isoYear: week.year,
          isoWeek: week.week,
          metric,
          numerator: metrics[metric].numerator,
          denominator: metrics[metric].denominator,
          computedAt: now,
          createdAt: now,
          updatedAt: now,
        }));
      }),
    );
    // The same scopes' rows of these weeks go, and the new ones take their place.
    const scope =
      active.length === 0
        ? isNull(weeklyMetrics.corridorId)
        : or(
            isNull(weeklyMetrics.corridorId),
            inArray(
              weeklyMetrics.corridorId,
              active.map((corridor) => corridor.id),
            ),
          );
    await tx
      .delete(weeklyMetrics)
      .where(
        and(
          scope,
          or(
            ...sorted.map((week) =>
              and(eq(weeklyMetrics.isoYear, week.year), eq(weeklyMetrics.isoWeek, week.week)),
            ),
          ),
        ),
      );
    await tx.insert(weeklyMetrics).values(rows);
  }

  /** One run at a time, on every server: the second waits and then finds the work done. */
  const locked = <T>(run: (tx: Transaction) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('weekly_metrics'))`);
      return run(tx);
    });

  return {
    async compute(weeks) {
      await locked((tx) => computeIn(tx, weeks, clock()));
    },

    async computeIfDue() {
      const now = clock();
      if (inIceland(now).hour < metricsRunHour) return false;
      const dueSince = new Date(startOfIcelandDay(now).getTime() + metricsRunHour * 3_600_000);
      const current = isoWeekOf(now);
      const done = (executor: Database | Transaction) =>
        executor
          .select({ id: weeklyMetrics.id })
          .from(weeklyMetrics)
          .where(
            and(
              isNull(weeklyMetrics.corridorId),
              eq(weeklyMetrics.isoYear, current.year),
              eq(weeklyMetrics.isoWeek, current.week),
              gte(weeklyMetrics.computedAt, dueSince),
            ),
          )
          .limit(1);
      if ((await done(db)).length > 0) return false;
      return locked(async (tx) => {
        if ((await done(tx)).length > 0) return false;
        await computeIn(tx, isoWeeksBetween(addIsoWeeks(current, -metricsWeeksBack), current), now);
        return true;
      });
    },

    async read({ from, to, corridorId }) {
      const all = await db
        .select({ id: corridors.id, name: corridors.name, active: corridors.active })
        .from(corridors)
        .orderBy(asc(corridors.name), asc(corridors.id));
      if (corridorId !== null && !all.some((corridor) => corridor.id === corridorId)) {
        return undefined;
      }
      const exitTo = addIsoWeeks(isoWeekOf(clock()), -1);
      const exitFrom = addIsoWeeks(exitTo, -(exitCriteriaWeeks - 1));
      const wanted = [...isoWeeksBetween(from, to), ...isoWeeksBetween(exitFrom, exitTo)];
      const stored =
        wanted.length === 0
          ? []
          : await db
              .select()
              .from(weeklyMetrics)
              .where(
                or(
                  ...wanted.map((week) =>
                    and(eq(weeklyMetrics.isoYear, week.year), eq(weeklyMetrics.isoWeek, week.week)),
                  ),
                ),
              );
      const figures = (week: IsoWeek, scope: string | null): WeekFigures => {
        const rows = stored.filter(
          (row) =>
            row.corridorId === scope && row.isoYear === week.year && row.isoWeek === week.week,
        );
        const [any] = rows;
        if (any === undefined) return { week, metrics: null, computedAt: null };
        const metrics = Object.fromEntries(
          rows.map((row) => [
            row.metric,
            { numerator: row.numerator, denominator: row.denominator },
          ]),
        ) as Record<MetricKey, WeekMetrics[MetricKey]>;
        // A metric added since the week was counted reads as nothing until it is counted again.
        return { week, metrics: addWeekMetrics([metrics]), computedAt: any.computedAt };
      };

      // The targets are held on the launch corridors: the active ones, added
      // up. Reports are about people as often as trips, so theirs is the total.
      const active = all.filter((corridor) => corridor.active);
      const criteria = checkExitCriteria(
        isoWeeksBetween(exitFrom, exitTo).map((week) => {
          const total = figures(week, null).metrics;
          const onCorridors =
            active.length === 0
              ? total
              : addWeekMetrics(
                  active.flatMap((corridor) => figures(week, corridor.id).metrics ?? []),
                );
          return addWeekMetrics([
            {
              ...addWeekMetrics(onCorridors === null ? [] : [onCorridors]),
              reports_answered_late: addWeekMetrics(total === null ? [] : [total])
                .reports_answered_late,
            },
          ]);
        }),
      );
      return {
        corridorId,
        weeks: isoWeeksBetween(from, to).map((week) => figures(week, corridorId)),
        exitCriteria: { from: exitFrom, to: exitTo, criteria },
        corridors: all,
      };
    },
  };
}
