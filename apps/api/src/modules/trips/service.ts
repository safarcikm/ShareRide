import type { MeetingPointSummary, Quote, QuoteRequest } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  checkRoute,
  checkTimes,
  err,
  fitPriceLevel,
  highestPriceLevel,
  insertionLegPairs,
  insertStop,
  isInSeason,
  lookUpLegs,
  ok,
  plannedTimes,
  priceCap,
  routeLegPairs,
  routePrice,
  segmentPrice,
  stopsOnTheWay,
  stopsOutOfSeason,
  suggestedPrice,
  type DistancesMissing,
  type Result,
} from "@shareride/domain";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { offeredStatuses, toSummary } from "../meeting-points/service.ts";
import type { TripSettingsSource } from "../settings/trip-settings.ts";

const { meetingPoints, legs } = schema;

/**
 * Stops, by their position in the request, that are not offered for new
 * trips; an added stop counts as the one after the last.
 */
export interface StopUnavailable {
  readonly code: "stop_unavailable";
  readonly stops: readonly number[];
}

export interface PriceLevelInvalid {
  readonly code: "price_level_invalid";
}

/** Building a trip's route (spec 3, 3.4 to 3.6): stops on the way and quotes. */
export interface RouteService {
  /** Active points on the way, in route order; with a date, in season then. */
  stopsAlong(
    from: string,
    to: string,
    date?: string,
  ): Promise<Result<MeetingPointSummary[], StopUnavailable | DistancesMissing>>;
  quote(
    request: QuoteRequest,
  ): Promise<Result<Quote, StopUnavailable | PriceLevelInvalid | DistancesMissing>>;
}

export function createRouteService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  /** A route being planned is priced by the values now. */
  readonly settings: TripSettingsSource;
}): RouteService {
  const { db, clock } = dependencies;
  const offered = inArray(meetingPoints.status, offeredStatuses);

  /** The offered points among `ids`, by ID. */
  async function offeredPoints(ids: readonly string[]) {
    const rows = await db
      .select()
      .from(meetingPoints)
      .where(and(offered, inArray(meetingPoints.id, [...new Set(ids)])));
    return new Map(rows.map((row) => [row.id, row]));
  }

  /** The legs for these ordered pairs, as a lookup. */
  async function legsFor(pairs: readonly (readonly [string, string])[]) {
    const rows =
      pairs.length === 0
        ? []
        : await db
            .select()
            .from(legs)
            .where(
              sql`(${legs.fromMeetingPointId}, ${legs.toMeetingPointId}) in (${sql.join(
                pairs.map(([from, to]) => sql`(${from}::uuid, ${to}::uuid)`),
                sql`, `,
              )})`,
            );
    return lookUpLegs(
      rows.map((row) => ({
        from: row.fromMeetingPointId,
        to: row.toMeetingPointId,
        distanceM: row.distanceM,
        durationS: row.durationS,
      })),
    );
  }

  return {
    async stopsAlong(from, to, date) {
      const { settings } = await dependencies.settings.current();
      const ends = await offeredPoints([from, to]);
      const unavailable = [from, to].flatMap((id, index) => (ends.has(id) ? [] : [index]));
      if (unavailable.length > 0) return err({ code: "stop_unavailable", stops: unavailable });

      const month = date === undefined ? undefined : Number(date.slice(5, 7));
      const candidates = (await db.select().from(meetingPoints).where(offered)).filter(
        (row) => month === undefined || isInSeason(row, month),
      );
      const legRows = await db
        .select()
        .from(legs)
        .where(or(eq(legs.fromMeetingPointId, from), eq(legs.toMeetingPointId, to)));
      const lookup = lookUpLegs(
        legRows.map((row) => ({
          from: row.fromMeetingPointId,
          to: row.toMeetingPointId,
          distanceM: row.distanceM,
          durationS: row.durationS,
        })),
      );
      const found = stopsOnTheWay(
        from,
        to,
        candidates.map((row) => row.id),
        lookup,
        settings,
      );
      if (!found.ok) return found;
      const byId = new Map(candidates.map((row) => [row.id, row]));
      return ok(
        found.value.flatMap((id) => {
          const row = byId.get(id);
          return row === undefined ? [] : [toSummary(row)];
        }),
      );
    },

    async quote(request) {
      const { settings } = await dependencies.settings.current();
      const { seats, add } = request;
      const asked = request.priceLevel ?? 100;
      if (asked % settings.priceLevelStep !== 0) return err({ code: "price_level_invalid" });
      const named = add === undefined ? request.stops : [...request.stops, add];
      const points = await offeredPoints(named);
      const unavailable = named.flatMap((id, index) => (points.has(id) ? [] : [index]));
      if (unavailable.length > 0) return err({ code: "stop_unavailable", stops: unavailable });

      const offeredPoint = (id: string) => {
        const row = points.get(id);
        if (row === undefined) throw new Error("Every stop was found offered above.");
        return row;
      };

      let stops = request.stops;
      if (add !== undefined) {
        const inserted = insertStop(stops, add, await legsFor(insertionLegPairs(stops, add)));
        if (!inserted.ok) return inserted;
        stops = inserted.value;
      }
      const route = checkRoute(stops, await legsFor(routeLegPairs(stops)), settings);
      if (!route.ok) return route;

      const { level, lowered } = fitPriceLevel(asked, seats, settings);
      const segments = route.value.segments.map((segment) => ({
        ...segment,
        suggestedPrice: suggestedPrice(segment.distanceM, settings),
        cap: priceCap(segment.distanceM, seats, settings),
        price: segmentPrice(segment.distanceM, level, seats, settings),
      }));
      const problems: Quote["problems"] = [...route.value.problems];
      const warnings: Quote["warnings"] = [...route.value.warnings];
      if (lowered) warnings.push({ code: "price_level_lowered" });

      let times: Date[] | null = null;
      if (request.departure !== undefined) {
        const departure = new Date(request.departure);
        problems.push(...stopsOutOfSeason(stops.map(offeredPoint), departure));
        const typicalS = route.value.segments.map((segment) => segment.durationS);
        times = plannedTimes(departure, typicalS, settings);
        problems.push(...checkTimes(times, typicalS, clock(), settings).problems);
      }

      return ok({
        stops: [...stops],
        segments,
        distanceM: route.value.distanceM,
        durationS: route.value.durationS,
        directDistanceM: route.value.directDistanceM,
        priceLevel: level,
        highestPriceLevel: highestPriceLevel(seats, settings),
        priceLevelStep: settings.priceLevelStep,
        wholeRoutePrice: routePrice(segments.map((segment) => segment.price)),
        plannedTimes: times?.map((time) => time.toISOString()) ?? null,
        problems,
        warnings,
      });
    },
  };
}
