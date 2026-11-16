// The trip day (spec 8, 3.2; R8.3): "I'm here" at a stop. It records who
// said it and when, never where they are. The other side at that stop is
// told once, by a push and a line in the conversation.
import type { CheckIn } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  checkCheckIn,
  err,
  ok,
  tripStatusAt,
  type BookingStatus,
  type CheckInProblem,
  type Result,
  type TripDaySettings,
  type TripRole,
  type TripStatus,
} from "@shareride/domain";
import { and, eq, isNull } from "drizzle-orm";
import { lockTrip, type Transaction } from "../bookings/seats.ts";
import { addSystemLine } from "../chat/conversations.ts";
import { recordEvents } from "../notifications/outbox.ts";

const { bookings, checkIns, trips, tripStops } = schema;

export type CheckInError = { readonly code: "not_found" } | CheckInProblem;

export interface TripDayService {
  /** The passenger's "I'm here" at their boarding stop; the driver is told. */
  passengerCheckIn(userId: string, bookingId: string): Promise<Result<CheckIn, CheckInError>>;
  /** The driver's "I'm here" at a stop of their trip; each confirmed passenger getting in there is told. */
  driverCheckIn(
    userId: string,
    tripId: string,
    stopId: string,
  ): Promise<Result<CheckIn, CheckInError>>;
}

type TripRow = typeof trips.$inferSelect;
type StopRow = typeof tripStops.$inferSelect;

const shown = (stopId: string, at: Date): CheckIn => ({
  stopId,
  checkedInAt: at.toISOString(),
});

export function createTripDayService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings: TripDaySettings;
}): TripDayService {
  const { db, clock, settings } = dependencies;

  /** The trip's status as of now: the minute job may not have moved it on yet (R8.1). */
  function statusNow(trip: TripRow, now: Date): TripStatus {
    if (trip.departsAt === null || trip.arrivesAt === null) return trip.status as TripStatus;
    return tripStatusAt(
      {
        status: trip.status as TripStatus,
        firstStopAt: trip.departsAt,
        lastStopAt: trip.arrivesAt,
      },
      now,
      settings,
    );
  }

  /**
   * Records `userId`'s "I'm here" at the stop, for the passenger's booking
   * or, with none, as the driver, and tells the other side on each of
   * `told`, the bookings getting in there. A repeat answers with the first
   * and tells nobody again; a new booking at the same stop starts afresh.
   * Call it with the trip locked, so two at once are one after the other.
   */
  async function checkIn(
    tx: Transaction,
    found: {
      readonly trip: TripRow;
      readonly stop: StopRow;
      readonly userId: string;
      readonly booking: { readonly id: string; readonly status: BookingStatus } | null;
    },
    told: () => Promise<readonly string[]>,
    now: Date,
  ): Promise<Result<CheckIn, CheckInError>> {
    const { trip, stop, userId, booking } = found;
    const by: TripRole = booking === null ? "driver" : "passenger";
    const [earlier] = await tx
      .select({ at: checkIns.checkedInAt })
      .from(checkIns)
      .where(
        booking === null
          ? and(eq(checkIns.tripStopId, stop.id), isNull(checkIns.bookingId))
          : eq(checkIns.bookingId, booking.id),
      );
    if (earlier !== undefined) return ok(shown(stop.id, earlier.at));
    if (stop.plannedAt === null) throw new Error("A published trip's stop has its time.");
    const allowed = checkCheckIn(
      {
        stopAt: stop.plannedAt,
        tripStatus: statusNow(trip, now),
        bookingStatus: booking?.status ?? null,
      },
      now,
      settings,
    );
    if (!allowed.ok) return allowed;
    await tx.insert(checkIns).values({
      tripStopId: stop.id,
      userId,
      bookingId: booking?.id ?? null,
      checkedInAt: now,
    });
    const bookingIds = await told();
    await recordEvents(
      tx,
      bookingIds.map((bookingId) => ({ type: "CheckedIn", bookingId, by })),
      now,
    );
    for (const bookingId of bookingIds) {
      await addSystemLine(tx, bookingId, { key: "checked_in", by }, now);
    }
    return ok(shown(stop.id, now));
  }

  return {
    async passengerCheckIn(userId, bookingId) {
      const now = clock();
      return db.transaction(async (tx) => {
        const [mine] = await tx
          .select({ tripId: bookings.tripId })
          .from(bookings)
          .where(and(eq(bookings.id, bookingId), eq(bookings.passengerId, userId)));
        if (mine === undefined) return err({ code: "not_found" });
        // Every change to a trip's bookings locks the trip first.
        const trip = await lockTrip(tx, mine.tripId);
        const [row] = await tx
          .select({ booking: bookings, stop: tripStops })
          .from(bookings)
          .innerJoin(tripStops, eq(tripStops.id, bookings.fromStopId))
          .where(eq(bookings.id, bookingId));
        if (trip === undefined || row === undefined) return err({ code: "not_found" });
        return checkIn(
          tx,
          {
            trip,
            stop: row.stop,
            userId,
            booking: { id: bookingId, status: row.booking.status as BookingStatus },
          },
          () => Promise.resolve([bookingId]),
          now,
        );
      });
    },

    async driverCheckIn(userId, tripId, stopId) {
      const now = clock();
      return db.transaction(async (tx) => {
        const [trip] = await tx
          .select()
          .from(trips)
          .where(and(eq(trips.id, tripId), eq(trips.driverId, userId)))
          .for("update");
        const [stop] = await tx
          .select()
          .from(tripStops)
          .where(
            and(
              eq(tripStops.id, stopId),
              eq(tripStops.tripId, tripId),
              isNull(tripStops.removedAt),
            ),
          );
        if (trip === undefined || stop === undefined) return err({ code: "not_found" });
        // A draft runs nowhere; its stops have no times yet.
        if (trip.status === "draft") return err({ code: "trip_not_running" });
        const boarding = async () => {
          const rows = await tx
            .select({ id: bookings.id })
            .from(bookings)
            .where(
              and(
                eq(bookings.tripId, tripId),
                eq(bookings.fromStopId, stopId),
                eq(bookings.status, "confirmed"),
              ),
            );
          return rows.map((row) => row.id);
        };
        return checkIn(tx, { trip, stop, userId, booking: null }, boarding, now);
      });
    },
  };
}
