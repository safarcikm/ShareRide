// The console's Reliability page (spec 8, 3.8; R8.10, R8.11; milestone 7,
// PR 7d): the cancellations that do not count only because of a weather or
// road-closure reason, which the operator can overrule so that they count,
// and the people whose figure is below the watch level. The operator then
// decides on a warning or a suspension as a person (3.8.4).
import type { AdminExcusedCancellation, AdminWatchedPerson } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  canOverrule,
  err,
  ok,
  reliabilitySince,
  type CancelReason,
  type ReliabilitySettings,
  type Result,
} from "@shareride/domain";
import { and, asc, eq, gte, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { recordAudit, type AuditEntry } from "../admin/audit.ts";
import { shown } from "../privacy/hidden.ts";
import { reliabilityOfPeople } from "./reliability.ts";

const { bookings, meetingPoints, tripStops, trips, users } = schema;

export type CancellationKind = AdminExcusedCancellation["kind"];

/** Who acts in the console, for the audit log. */
export interface ReliabilityActor {
  readonly operator: AuditEntry["operator"];
  readonly request: AuditEntry["request"];
}

export type OverruleError = { readonly code: "not_found" } | { readonly code: "already_overruled" };

export interface ReliabilityAdminService {
  /** Over the period that counts, newest first, overruled ones included. */
  excusedCancellations(): Promise<readonly AdminExcusedCancellation[]>;
  overrule(
    kind: CancellationKind,
    id: string,
    actor: ReliabilityActor,
  ): Promise<Result<AdminExcusedCancellation, OverruleError>>;
  /** The people below the watch level, lowest first. */
  watched(): Promise<readonly AdminWatchedPerson[]>;
}

const cancelling = alias(users, "cancelling");
const fromStop = alias(tripStops, "from_stop");
const toStop = alias(tripStops, "to_stop");
const fromPoint = alias(meetingPoints, "from_point");
const toPoint = alias(meetingPoints, "to_point");

const nameOf = (point: { nameIs: string; nameEn: string | null }) => ({
  is: point.nameIs,
  en: point.nameEn ?? point.nameIs,
});

const iso = (at: Date | null) => at?.toISOString() ?? null;

export function createReliabilityAdminService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings: ReliabilitySettings;
}): ReliabilityAdminService {
  const { db, clock, settings } = dependencies;

  /** Trips cancelled for a reason the operator can overrule, with their driver. */
  async function excusedTrips(where: SQL | undefined): Promise<AdminExcusedCancellation[]> {
    const rows = await db
      .select({ trip: trips, firstName: cancelling.firstName })
      .from(trips)
      .innerJoin(cancelling, eq(cancelling.id, trips.driverId))
      .where(and(eq(trips.status, "cancelled"), eq(trips.excusedByReason, true), where));
    if (rows.length === 0) return [];
    // The whole trip's first and last stops.
    const stops = await db
      .select({
        tripId: tripStops.tripId,
        nameIs: meetingPoints.nameIs,
        nameEn: meetingPoints.nameEn,
      })
      .from(tripStops)
      .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
      .where(
        and(
          inArray(
            tripStops.tripId,
            rows.map(({ trip }) => trip.id),
          ),
          isNull(tripStops.removedAt),
        ),
      )
      .orderBy(asc(tripStops.position));
    return rows.flatMap(({ trip, firstName }) => {
      const own = stops.filter((stop) => stop.tripId === trip.id);
      const first = own[0];
      const last = own.at(-1);
      if (first === undefined || last === undefined || trip.cancelledAt === null) return [];
      return [
        {
          kind: "trip" as const,
          id: trip.id,
          person: { userId: trip.driverId, firstName },
          role: "driver" as const,
          reason: trip.cancelReason as CancelReason,
          note: trip.cancelNote,
          cancelledAt: trip.cancelledAt.toISOString(),
          from: nameOf(first),
          to: nameOf(last),
          departsAt: iso(trip.departsAt),
          overruledAt: iso(trip.overruledAt),
        },
      ];
    });
  }

  /** Bookings cancelled for a reason the operator can overrule, with whoever cancelled. */
  async function excusedBookings(where: SQL | undefined): Promise<AdminExcusedCancellation[]> {
    const rows = await db
      .select({
        booking: bookings,
        driverId: trips.driverId,
        departsAt: trips.departsAt,
        firstName: cancelling.firstName,
        from: { nameIs: fromPoint.nameIs, nameEn: fromPoint.nameEn },
        to: { nameIs: toPoint.nameIs, nameEn: toPoint.nameEn },
      })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .innerJoin(
        cancelling,
        or(
          and(eq(bookings.cancelledBy, "passenger"), eq(cancelling.id, bookings.passengerId)),
          and(eq(bookings.cancelledBy, "driver"), eq(cancelling.id, trips.driverId)),
        ),
      )
      .innerJoin(fromStop, eq(fromStop.id, bookings.fromStopId))
      .innerJoin(fromPoint, eq(fromPoint.id, fromStop.meetingPointId))
      .innerJoin(toStop, eq(toStop.id, bookings.toStopId))
      .innerJoin(toPoint, eq(toPoint.id, toStop.meetingPointId))
      .where(and(eq(bookings.status, "cancelled"), eq(bookings.excusedByReason, true), where));
    return rows.flatMap(({ booking, driverId, departsAt, firstName, from, to }) => {
      const role = booking.cancelledBy === "driver" ? "driver" : "passenger";
      if (booking.cancelledAt === null) return [];
      return [
        {
          kind: "booking" as const,
          id: booking.id,
          person: { userId: role === "driver" ? driverId : booking.passengerId, firstName },
          role,
          reason: booking.cancelReason as CancelReason,
          note: booking.cancelNote,
          cancelledAt: booking.cancelledAt.toISOString(),
          // Where the passenger was to get in and out.
          from: nameOf(from),
          to: nameOf(to),
          departsAt: iso(departsAt),
          overruledAt: iso(booking.overruledAt),
        },
      ];
    });
  }

  async function excusedCancellations() {
    const since = reliabilitySince(clock(), settings);
    // Someone leaving ShareRide, or the former member, is no one to overrule.
    const [ofTrips, ofBookings] = await Promise.all([
      excusedTrips(and(gte(trips.cancelledAt, since), shown(cancelling))),
      excusedBookings(and(gte(bookings.cancelledAt, since), shown(cancelling))),
    ]);
    return [...ofTrips, ...ofBookings].sort(
      (a, b) => b.cancelledAt.localeCompare(a.cancelledAt) || a.id.localeCompare(b.id),
    );
  }

  async function overrule(
    kind: CancellationKind,
    id: string,
    actor: ReliabilityActor,
  ): Promise<Result<AdminExcusedCancellation, OverruleError>> {
    const now = clock();
    const table = kind === "trip" ? trips : bookings;
    const found = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          countsOnReliability: table.countsOnReliability,
          excusedByReason: table.excusedByReason,
          status: table.status,
        })
        .from(table)
        .where(eq(table.id, id))
        .for("update");
      if (row === undefined || row.status !== "cancelled" || !row.excusedByReason) {
        return err({ code: "not_found" } as const);
      }
      if (!canOverrule(row)) return err({ code: "already_overruled" } as const);
      await tx
        .update(table)
        .set({ countsOnReliability: true, overruledAt: now, updatedAt: now })
        .where(eq(table.id, id));
      // A person's record: the field changed, which is not about who they are.
      await recordAudit(tx, {
        operator: actor.operator,
        action: `${kind}.reason_overruled`,
        subjectType: kind,
        subjectId: id,
        before: { countsOnReliability: false },
        after: { countsOnReliability: true },
        request: actor.request,
      });
      return ok(undefined);
    });
    if (!found.ok) return found;
    const [overruled] =
      kind === "trip"
        ? await excusedTrips(eq(trips.id, id))
        : await excusedBookings(eq(bookings.id, id));
    if (overruled === undefined) throw new Error("An overruled cancellation is still excused.");
    return ok(overruled);
  }

  async function watched(): Promise<readonly AdminWatchedPerson[]> {
    const now = clock();
    const since = reliabilitySince(now, settings);
    const from = since.toISOString();
    // Everyone with a trip or booking that may count over the period, a few
    // more rather than fewer; the domain decides which count.
    const candidates = await db.execute<{ id: string }>(sql`
      select ${bookings.passengerId} as id from ${bookings}
        where ${bookings.status} in ('completed', 'cancelled', 'no_show')
          and (${bookings.completedAt} >= ${from} or ${bookings.cancelledAt} >= ${from}
            or ${bookings.updatedAt} >= ${from})
      union
      select ${trips.driverId} from ${trips}
        where ${trips.status} in ('completed', 'cancelled')
          and (${trips.completedAt} >= ${from} or ${trips.cancelledAt} >= ${from}
            or ${trips.updatedAt} >= ${from})
      union
      select ${trips.driverId} from ${bookings}
        join ${trips} on ${trips.id} = ${bookings.tripId}
        where ${bookings.cancelledBy} = 'driver' and ${bookings.cancelledAt} >= ${from}
    `);
    const ids = candidates.rows.map((row) => row.id);
    if (ids.length === 0) return [];
    const people = await db
      .select({ id: users.id, firstName: users.firstName })
      .from(users)
      .where(and(inArray(users.id, ids), shown(users)));
    const figures = await reliabilityOfPeople(
      db,
      people.map((person) => person.id),
      now,
      settings,
    );
    return people
      .flatMap(({ id, firstName }) => {
        const figure = figures.get(id);
        if (figure === undefined || !figure.belowWatchLevel) return [];
        const { kept, counted, percent, byRole } = figure;
        return [{ userId: id, firstName, reliability: { kept, counted, percent, byRole } }];
      })
      .sort(
        (a, b) =>
          (a.reliability.percent ?? 0) - (b.reliability.percent ?? 0) ||
          b.reliability.counted - a.reliability.counted ||
          a.userId.localeCompare(b.userId),
      );
  }

  return { excusedCancellations, overrule, watched };
}
