// The console's Reliability page (spec 8, 3.8; R8.10, R8.11; milestone 7,
// PR 7d): the cancellations that do not count only because of a weather or
// road-closure reason, which the operator can overrule so that they count,
// or undo that, with a note (section 6); and the people whose figure is
// below the watch level. The operator then decides on a warning or a
// suspension as a person (3.8.4).
import type { AdminExcusedCancellation, AdminWatchedPerson } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  canOverrule,
  canUndoOverrule,
  checkOverruleNote,
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
import type { Queryable } from "../bookings/seats.ts";
import { shown } from "../privacy/hidden.ts";
import { reliabilityOfPeople } from "./reliability.ts";

const { bookings, meetingPoints, tripStops, trips, users } = schema;

export type CancellationKind = AdminExcusedCancellation["kind"];

/** Who acts in the console, for the audit log. */
export interface ReliabilityActor {
  readonly operator: AuditEntry["operator"];
  readonly request: AuditEntry["request"];
}

export type ChangeCountingError =
  | { readonly code: "not_found" }
  | { readonly code: "unchanged" }
  | { readonly code: "note_missing" }
  | { readonly code: "note_too_long" };

export interface ChangeCounting {
  readonly kind: CancellationKind;
  readonly id: string;
  /** True overrules the reason, so it counts; false undoes that. */
  readonly counts: boolean;
  readonly note: string;
}

export interface ReliabilityAdminService {
  /** Over the period that counts, newest first, overruled ones included. */
  excusedCancellations(): Promise<readonly AdminExcusedCancellation[]>;
  /** Only for one of those the list shows, and only a change. */
  changeCounting(
    change: ChangeCounting,
    actor: ReliabilityActor,
  ): Promise<Result<AdminExcusedCancellation, ChangeCountingError>>;
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
  async function excusedTrips(
    q: Queryable,
    where: SQL | undefined,
  ): Promise<AdminExcusedCancellation[]> {
    const rows = await q
      .select({ trip: trips, firstName: cancelling.firstName })
      .from(trips)
      .innerJoin(cancelling, eq(cancelling.id, trips.driverId))
      .where(and(eq(trips.status, "cancelled"), eq(trips.excusedByReason, true), where));
    if (rows.length === 0) return [];
    // The whole trip's first and last stops.
    const stops = await q
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
          overruleNote: trip.overruleNote,
        },
      ];
    });
  }

  /** Bookings cancelled for a reason the operator can overrule, with whoever cancelled. */
  async function excusedBookings(
    q: Queryable,
    where: SQL | undefined,
  ): Promise<AdminExcusedCancellation[]> {
    const rows = await q
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
          overruleNote: booking.overruleNote,
        },
      ];
    });
  }

  /**
   * One of these, or those, as the list shows them: over the period that
   * counts, and never someone leaving ShareRide or the former member, who
   * is no one to overrule.
   */
  function listed(q: Queryable, kind: CancellationKind, id?: string) {
    const since = reliabilitySince(clock(), settings);
    return kind === "trip"
      ? excusedTrips(
          q,
          and(
            gte(trips.cancelledAt, since),
            shown(cancelling),
            id === undefined ? undefined : eq(trips.id, id),
          ),
        )
      : excusedBookings(
          q,
          and(
            gte(bookings.cancelledAt, since),
            shown(cancelling),
            id === undefined ? undefined : eq(bookings.id, id),
          ),
        );
  }

  async function excusedCancellations() {
    const [ofTrips, ofBookings] = await Promise.all([listed(db, "trip"), listed(db, "booking")]);
    return [...ofTrips, ...ofBookings].sort(
      (a, b) => b.cancelledAt.localeCompare(a.cancelledAt) || a.id.localeCompare(b.id),
    );
  }

  async function changeCounting(
    { kind, id, counts, note }: ChangeCounting,
    actor: ReliabilityActor,
  ): Promise<Result<AdminExcusedCancellation, ChangeCountingError>> {
    const checked = checkOverruleNote(note);
    if (!checked.ok) return checked;
    const now = clock();
    const table = kind === "trip" ? trips : bookings;
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          countsOnReliability: table.countsOnReliability,
          excusedByReason: table.excusedByReason,
        })
        .from(table)
        .where(eq(table.id, id))
        .for("update");
      // Only what the list shows, so nobody leaving is changed (spec 11,
      // 3.4.4: undoing brings the account back as it was).
      const [shownNow] = row === undefined ? [] : await listed(tx, kind, id);
      if (row === undefined || shownNow === undefined) return err({ code: "not_found" } as const);
      if (!(counts ? canOverrule(row) : canUndoOverrule(row))) {
        return err({ code: "unchanged" } as const);
      }
      await tx
        .update(table)
        .set({
          countsOnReliability: counts,
          overruledAt: counts ? now : null,
          overruleNote: checked.value,
          updatedAt: now,
        })
        .where(eq(table.id, id));
      // A person's record: the names of the fields changed, never their values (spec 9, 3.8).
      await recordAudit(tx, {
        operator: actor.operator,
        action: counts ? `${kind}.reason_overruled` : `${kind}.overrule_undone`,
        subjectType: kind,
        subjectId: id,
        after: { changed: ["countsOnReliability", "overruledAt", "overruleNote"] },
        request: actor.request,
      });
      const [changed] = await listed(tx, kind, id);
      if (changed === undefined) throw new Error("A cancellation the list showed is gone from it.");
      return ok(changed);
    });
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

  return { excusedCancellations, changeCounting, watched };
}
