// Legs between meeting points (spec 2, 3.7): the road distance and typical
// driving time each way between every two points in service (R2.11),
// found by the `Router` on our own road file (ADR 0031). Trips copy a
// segment's distance when they are posted, so new legs never change them.
import { setImmediate as nextTurn } from "node:timers/promises";
import type { AdminLegsStatus } from "@shareride/contracts";
import { lockLegs, schema, type Database } from "@shareride/db";
import {
  err,
  keepsLegs,
  meetingPointStatuses,
  ok,
  type Position,
  type Result,
  type RoadLeg,
} from "@shareride/domain";
import { and, count, desc, eq, inArray, max, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { recordAudit } from "../admin/audit.ts";
import type { Queryable, Transaction } from "../bookings/seats.ts";
import { roadFileSourcePrefix, type Router } from "../../platform/router.ts";
import type { ConsoleActor } from "./admin-service.ts";

const { legs, meetingPoints } = schema;

type LegRow = typeof legs.$inferInsert;

/** The statuses whose points keep legs with each other. */
const inService = meetingPointStatuses.filter(keepsLegs);

/** How many missing legs the status lists by name. */
const missingListed = 100;

/** Rows a single insert takes: six values each, well under PostgreSQL's 65 535. */
const insertBatch = 5000;

/** What computing legs did: how many it stored, and how many have no road between. */
export interface LegsComputed {
  readonly legs: number;
  readonly missing: number;
}

export interface LegService {
  /** How complete the legs between points in service are (spec 2, 3.7.4). */
  status(): Promise<AdminLegsStatus>;
  /** "Recompute all": every leg between points in service, on today's map data. */
  recomputeAll(actor: ConsoleActor): Promise<AdminLegsStatus>;
  /**
   * A point's legs to and from every point in service, replacing all its
   * old ones: for activating a point (R2.3) and moving it (R2.10).
   */
  computeFor(pointId: string): Promise<Result<LegsComputed, { readonly code: "not_found" }>>;
}

interface Point {
  readonly id: string;
  readonly nameIs: string;
  readonly location: Position;
}

const samePlace = (a: Position, b: Position) =>
  a.latitude === b.latitude && a.longitude === b.longitude;

async function insertLegs(tx: Transaction, rows: readonly LegRow[]) {
  for (let at = 0; at < rows.length; at += insertBatch) {
    await tx.insert(legs).values(rows.slice(at, at + insertBatch));
  }
}

export function createLegService(dependencies: {
  readonly db: Database;
  readonly router: Router;
  readonly clock: () => Date;
}): LegService {
  const { db, router, clock } = dependencies;

  const pointsInService = (on: Queryable = db): Promise<Point[]> =>
    on
      .select({
        id: meetingPoints.id,
        nameIs: meetingPoints.nameIs,
        location: meetingPoints.location,
      })
      .from(meetingPoints)
      .where(inArray(meetingPoints.status, inService))
      .orderBy(meetingPoints.nameIs, meetingPoints.id);

  const row = (from: string, to: string, leg: RoadLeg, source: string, at: Date): LegRow => ({
    fromMeetingPointId: from,
    toMeetingPointId: to,
    distanceM: leg.distanceM,
    durationS: leg.durationS,
    computedAt: at,
    source,
  });

  async function status(): Promise<AdminLegsStatus> {
    const [points, mapData] = await Promise.all([pointsInService(), router.mapData()]);
    const ids = points.map((point) => point.id);
    const sources =
      ids.length < 2
        ? []
        : await db
            .select({ source: legs.source, legs: count(), last: max(legs.computedAt) })
            .from(legs)
            .where(and(inArray(legs.fromMeetingPointId, ids), inArray(legs.toMeetingPointId, ids)))
            .groupBy(legs.source)
            .orderBy(desc(count()), legs.source);

    const from = alias(meetingPoints, "from_point");
    const to = alias(meetingPoints, "to_point");
    const missing = await db
      .select({ fromId: from.id, fromName: from.nameIs, toId: to.id, toName: to.nameIs })
      .from(from)
      .innerJoin(to, ne(from.id, to.id))
      .where(
        and(
          inArray(from.status, inService),
          inArray(to.status, inService),
          notExists(
            db
              .select({ one: sql`1` })
              .from(legs)
              .where(and(eq(legs.fromMeetingPointId, from.id), eq(legs.toMeetingPointId, to.id))),
          ),
        ),
      )
      .orderBy(from.nameIs, from.id, to.nameIs, to.id)
      .limit(missingListed);

    const near = await Promise.all(points.map((point) => router.nearRoad(point.location)));
    const lastComputed = sources.reduce<Date | null>(
      (latest, { last }) => (last !== null && (latest === null || last > latest) ? last : latest),
      null,
    );
    return {
      mapData: { mapDate: mapData.mapDate, attribution: mapData.attribution },
      points: points.length,
      pairs: points.length * Math.max(0, points.length - 1),
      withLegs: sources.reduce((sum, source) => sum + source.legs, 0),
      lastComputedAt: lastComputed?.toISOString() ?? null,
      sources: sources.map((source) => ({
        source: source.source,
        mapDate: source.source.startsWith(roadFileSourcePrefix)
          ? source.source.slice(roadFileSourcePrefix.length)
          : null,
        current: source.source === mapData.source,
        legs: source.legs,
      })),
      offRoad: points
        .filter((_, index) => near[index] === false)
        .map(({ id, nameIs }) => ({ id, nameIs })),
      missing: missing.map((leg) => ({
        from: { id: leg.fromId, nameIs: leg.fromName },
        to: { id: leg.toId, nameIs: leg.toName },
      })),
    };
  }

  /** "Recompute all" as it runs; a second request meanwhile gets its answer. */
  let running: Promise<AdminLegsStatus> | null = null;

  async function recompute(actor: ConsoleActor): Promise<AdminLegsStatus> {
    const points = await pointsInService();
    const { source } = await router.mapData();
    const at = clock();
    const rows: LegRow[] = [];
    for (const point of points) {
      const others = points.filter((other) => other !== point);
      const found = await router.legsFrom(
        point.location,
        others.map((other) => other.location),
      );
      others.forEach((other, index) => {
        const leg = found[index] ?? null;
        if (leg !== null) rows.push(row(point.id, other.id, leg, source, at));
      });
      // Each point's search takes a few hundredths of a second: let other
      // requests in between them.
      await nextTurn();
    }

    await db.transaction(async (tx) => {
      await lockLegs(tx);
      // A point moved meanwhile keeps the legs its move computed.
      const now = await tx
        .select({ id: meetingPoints.id, location: meetingPoints.location })
        .from(meetingPoints)
        .where(
          inArray(
            meetingPoints.id,
            points.map((point) => point.id),
          ),
        );
      const unmoved = new Set(
        points
          .filter((point) =>
            now.some(
              (current) => current.id === point.id && samePlace(current.location, point.location),
            ),
          )
          .map((point) => point.id),
      );
      const ids = [...unmoved];
      if (ids.length > 0) {
        await tx
          .delete(legs)
          .where(and(inArray(legs.fromMeetingPointId, ids), inArray(legs.toMeetingPointId, ids)));
      }
      const kept = rows.filter(
        (leg) => unmoved.has(leg.fromMeetingPointId) && unmoved.has(leg.toMeetingPointId),
      );
      await insertLegs(tx, kept);
      await recordAudit(tx, {
        operator: actor.operator,
        action: "legs.recomputed",
        after: {
          source,
          points: ids.length,
          legs: kept.length,
          missing: ids.length * Math.max(0, ids.length - 1) - kept.length,
        },
        request: actor.request,
      });
    });
    return status();
  }

  return {
    status,

    recomputeAll(actor) {
      running ??= recompute(actor).finally(() => {
        running = null;
      });
      return running;
    },

    async computeFor(pointId) {
      // Found and written under the lock: one point's legs take a few
      // hundredths of a second, and whichever of two moves comes second
      // reads where the first one put its point. Each move calls this
      // after it is saved, so the last call has the last places.
      return db.transaction(async (tx) => {
        await lockLegs(tx);
        const [point] = await tx
          .select({ id: meetingPoints.id, location: meetingPoints.location })
          .from(meetingPoints)
          .where(eq(meetingPoints.id, pointId));
        if (point === undefined) return err({ code: "not_found" as const });
        const others = (await pointsInService(tx)).filter((other) => other.id !== pointId);
        const places = others.map((other) => other.location);
        const [outward, inward, { source }] = await Promise.all([
          router.legsFrom(point.location, places),
          router.legsTo(point.location, places),
          router.mapData(),
        ]);
        const at = clock();
        const rows = others.flatMap((other, index) => {
          const out = outward[index] ?? null;
          const back = inward[index] ?? null;
          return [
            ...(out === null ? [] : [row(pointId, other.id, out, source, at)]),
            ...(back === null ? [] : [row(other.id, pointId, back, source, at)]),
          ];
        });
        // Its legs to points out of service go too: they were found from
        // where it was.
        await tx
          .delete(legs)
          .where(or(eq(legs.fromMeetingPointId, pointId), eq(legs.toMeetingPointId, pointId)));
        await insertLegs(tx, rows);
        return ok({ legs: rows.length, missing: 2 * others.length - rows.length });
      });
    },
  };
}
