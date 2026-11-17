// The reliability figure of people (spec 8, 3.8; R8.10): their trips and
// bookings that count over the period, as the domain decides it.
import { schema } from "@shareride/db";
import {
  driverBookingRecord,
  driverTripRecord,
  passengerRecord,
  passengerWasDue,
  reliabilityOf,
  reliabilitySince,
  type BookingStatus,
  type DisputeOutcome,
  type Reliability,
  type ReliabilityRecord,
  type ReliabilitySettings,
  type TripStatus,
} from "@shareride/domain";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Queryable } from "../bookings/seats.ts";

const { bookings, disputes, trips } = schema;

type CancelledBy = "passenger" | "driver" | "operator" | null;

/** The figure of each of these people, now. */
export async function reliabilityOfPeople(
  q: Queryable,
  userIds: readonly string[],
  now: Date,
  settings: ReliabilitySettings,
): Promise<ReadonlyMap<string, Reliability>> {
  const ids = [...new Set(userIds)];
  const records = new Map<string, ReliabilityRecord[]>(ids.map((id) => [id, []]));
  if (ids.length > 0) {
    const since = reliabilitySince(now, settings);
    const add = (userId: string, record: ReliabilityRecord | null) => {
      if (record !== null) records.get(userId)?.push(record);
    };
    for (const row of await asPassenger(q, ids, since)) {
      add(row.userId, passengerRecord(row));
    }
    for (const row of await cancelledByTheirDriver(q, ids, since)) {
      add(row.userId, driverBookingRecord(row));
    }
    for (const row of await asDriver(q, ids, since)) {
      add(row.userId, driverTripRecord(row));
    }
  }
  return new Map(ids.map((id) => [id, reliabilityOf(records.get(id) ?? [], now, settings)]));
}

/**
 * Their bookings that ended in the period, each with when: completed,
 * cancelled, or the report of a no-show raised.
 */
async function asPassenger(q: Queryable, ids: readonly string[], since: Date) {
  const at = sql<Date>`coalesce(${bookings.completedAt}, ${bookings.cancelledAt}, ${disputes.raisedAt})`;
  const rows = await q
    .select({
      userId: bookings.passengerId,
      status: bookings.status,
      cancelledBy: bookings.cancelledBy,
      countsOnReliability: bookings.countsOnReliability,
      completedAt: bookings.completedAt,
      cancelledAt: bookings.cancelledAt,
      raisedAt: disputes.raisedAt,
      reportOutcome: disputes.outcome,
    })
    .from(bookings)
    .leftJoin(disputes, eq(disputes.bookingId, bookings.id))
    .where(
      and(
        inArray(bookings.passengerId, [...ids]),
        inArray(bookings.status, ["completed", "cancelled", "no_show"]),
        gte(at, since),
      ),
    );
  return rows.flatMap((row) => {
    const when = row.completedAt ?? row.cancelledAt ?? row.raisedAt;
    return when === null
      ? []
      : [
          {
            userId: row.userId,
            status: row.status as BookingStatus,
            cancelledBy: row.cancelledBy as CancelledBy,
            countsOnReliability: row.countsOnReliability,
            reportOutcome: row.reportOutcome as DisputeOutcome | null,
            at: when,
          },
        ];
  });
}

/** The bookings on their trips cancelled in the period, for the driver. */
async function cancelledByTheirDriver(q: Queryable, ids: readonly string[], since: Date) {
  const rows = await q
    .select({
      userId: trips.driverId,
      status: bookings.status,
      cancelledBy: bookings.cancelledBy,
      countsOnReliability: bookings.countsOnReliability,
      cancelledAt: bookings.cancelledAt,
    })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .where(
      and(
        inArray(trips.driverId, [...ids]),
        eq(bookings.status, "cancelled"),
        gte(bookings.cancelledAt, since),
      ),
    );
  return rows.flatMap((row) =>
    row.cancelledAt === null
      ? []
      : [
          {
            userId: row.userId,
            status: row.status as BookingStatus,
            cancelledBy: row.cancelledBy as CancelledBy,
            countsOnReliability: row.countsOnReliability,
            reportOutcome: null,
            at: row.cancelledAt,
          },
        ],
  );
}

/** Their trips that completed or were cancelled in the period, with the passengers due on each. */
async function asDriver(q: Queryable, ids: readonly string[], since: Date) {
  const at = sql<Date>`coalesce(${trips.completedAt}, ${trips.cancelledAt})`;
  const rows = await q
    .select({
      id: trips.id,
      userId: trips.driverId,
      status: trips.status,
      countsOnReliability: trips.countsOnReliability,
      completedAt: trips.completedAt,
      cancelledAt: trips.cancelledAt,
    })
    .from(trips)
    .where(
      and(
        inArray(trips.driverId, [...ids]),
        inArray(trips.status, ["completed", "cancelled"]),
        gte(at, since),
      ),
    );
  const completed = rows.filter((row) => row.status === "completed").map((row) => row.id);
  const due = new Map<string, number>();
  if (completed.length > 0) {
    const passengers = await q
      .select({
        tripId: bookings.tripId,
        status: bookings.status,
        reportOutcome: disputes.outcome,
      })
      .from(bookings)
      .leftJoin(disputes, eq(disputes.bookingId, bookings.id))
      .where(
        and(
          inArray(bookings.tripId, completed),
          inArray(bookings.status, ["completed", "no_show"]),
        ),
      );
    for (const passenger of passengers) {
      const wasDue = passengerWasDue({
        status: passenger.status as BookingStatus,
        reportOutcome: passenger.reportOutcome as DisputeOutcome | null,
      });
      if (wasDue) due.set(passenger.tripId, (due.get(passenger.tripId) ?? 0) + 1);
    }
  }
  return rows.flatMap((row) => {
    const when = row.completedAt ?? row.cancelledAt;
    return when === null
      ? []
      : [
          {
            userId: row.userId,
            status: row.status as TripStatus,
            countsOnReliability: row.countsOnReliability,
            passengersDue: due.get(row.id) ?? 0,
            at: when,
          },
        ];
  });
}
