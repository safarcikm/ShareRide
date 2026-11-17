import { schema, type Database } from "@shareride/db";
import {
  completesAt,
  deleteAfter,
  deletionCheck,
  err,
  holdsSeats,
  ok,
  statusAt,
  type BookingStatus,
  type DeletionInputs,
  type OpenItem as Open,
  type Result,
  type TripDaySettings,
  type TripStatus,
} from "@shareride/domain";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Logger } from "../../logger.ts";
import { endAllSessions, type AuthService, type ConfirmError } from "../auth/service.ts";
import type { Queryable } from "../bookings/seats.ts";
import { recordEvents } from "../notifications/outbox.ts";

const { bookings, meetingPoints, tripStops, trips, users } = schema;

// "Delete my account" (spec 11, 3.4; privacy plan 4.5): what is still open,
// then, with a fresh code, signed out everywhere and hidden at once, with 7
// days to change one's mind before the data is erased.

/** A place's name in both languages; one without an English name keeps its own. */
interface Places {
  readonly from: { readonly is: string; readonly en: string };
  readonly to: { readonly is: string; readonly en: string };
}

/** Something open, with what the app shows of it (spec 11, 3.4.1). */
export type OpenItem =
  | {
      readonly kind: "trip";
      readonly id: string;
      readonly departsAt: Date;
      readonly places: Places;
    }
  | {
      readonly kind: "booking" | "request";
      readonly id: string;
      readonly tripId: string;
      readonly boardsAt: Date;
      readonly places: Places;
    }
  | {
      readonly kind: "trip_under_way";
      readonly tripId: string;
      readonly completesAt: Date;
      readonly places: Places;
    }
  | { readonly kind: "dispute" | "held_payout"; readonly id: string };

export interface DeletionCheckResult {
  readonly allowed: boolean;
  readonly mustSettle: readonly OpenItem[];
  readonly canCancel: readonly OpenItem[];
}

export type DeleteError = ConfirmError | { readonly code: "deletion_blocked" };

export interface DeletionService {
  /** What stands between the person and deleting their account (R11.3). */
  check(userId: string): Promise<DeletionCheckResult>;
  /**
   * With a fresh code and nothing open: sets when the data is erased, signs
   * the person out everywhere and tells them by email (spec 11, 3.4).
   */
  schedule(userId: string, code: string): Promise<Result<{ deleteAfter: Date }, DeleteError>>;
  /** "Keep my account": undoes a waiting deletion, leaving the status as it was. */
  cancel(userId: string): Promise<void>;
}

export interface DeletionServiceDependencies {
  readonly db: Database;
  readonly clock: () => Date;
  readonly auth: Pick<AuthService, "withConfirmCode">;
  readonly tripDaySettings: TripDaySettings;
  readonly logger: Logger;
}

const point = (nameIs: string, nameEn: string | null) => ({ is: nameIs, en: nameEn ?? nameIs });

/** Everything open for `userId` now, as the domain rule and the app need it. */
async function openFor(q: Queryable, userId: string, now: Date, settings: TripDaySettings) {
  const driving = await q
    .select({
      id: trips.id,
      status: trips.status,
      departsAt: trips.departsAt,
      arrivesAt: trips.arrivesAt,
    })
    .from(trips)
    .where(and(eq(trips.driverId, userId), inArray(trips.status, ["published", "departed"])));
  const tripIds = driving.map((trip) => trip.id);

  const held =
    tripIds.length === 0
      ? []
      : await q
          .select({
            tripId: bookings.tripId,
            status: bookings.status,
            requestExpiresAt: bookings.expiresAt,
            paymentDueAt: bookings.paymentDueAt,
          })
          .from(bookings)
          .where(
            and(
              inArray(bookings.tripId, tripIds),
              inArray(bookings.status, ["requested", "accepted", "confirmed"]),
            ),
          );
  const holding = (tripId: string) =>
    held.filter(
      (booking) =>
        booking.tripId === tripId &&
        holdsSeats(statusAt({ ...booking, status: booking.status as BookingStatus }, now)),
    ).length;

  const board = alias(tripStops, "board");
  const alight = alias(tripStops, "alight");
  const boardPoint = alias(meetingPoints, "board_point");
  const alightPoint = alias(meetingPoints, "alight_point");
  const riding = await q
    .select({
      id: bookings.id,
      tripId: bookings.tripId,
      status: bookings.status,
      requestExpiresAt: bookings.expiresAt,
      paymentDueAt: bookings.paymentDueAt,
      boardsAt: board.plannedAt,
      tripArrivesAt: trips.arrivesAt,
      fromIs: boardPoint.nameIs,
      fromEn: boardPoint.nameEn,
      toIs: alightPoint.nameIs,
      toEn: alightPoint.nameEn,
    })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .innerJoin(board, eq(board.id, bookings.fromStopId))
    .innerJoin(alight, eq(alight.id, bookings.toStopId))
    .innerJoin(boardPoint, eq(boardPoint.id, board.meetingPointId))
    .innerJoin(alightPoint, eq(alightPoint.id, alight.meetingPointId))
    .where(
      and(
        eq(bookings.passengerId, userId),
        inArray(bookings.status, ["requested", "accepted", "confirmed"]),
      ),
    );

  // The first and last stop of each trip, for the trips the person drives
  // and those they ride on that are under way.
  const stopTrips = [...new Set([...tripIds, ...riding.map((booking) => booking.tripId)])];
  const stops =
    stopTrips.length === 0
      ? []
      : await q
          .select({
            tripId: tripStops.tripId,
            nameIs: meetingPoints.nameIs,
            nameEn: meetingPoints.nameEn,
          })
          .from(tripStops)
          .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
          .where(and(inArray(tripStops.tripId, stopTrips), isNull(tripStops.removedAt)))
          .orderBy(asc(tripStops.tripId), asc(tripStops.position));
  const ends = (tripId: string): Places => {
    const own = stops.filter((stop) => stop.tripId === tripId);
    const first = own[0];
    const last = own.at(-1);
    if (first === undefined || last === undefined) throw new Error("A trip has no stops.");
    return { from: point(first.nameIs, first.nameEn), to: point(last.nameIs, last.nameEn) };
  };

  const inputs: DeletionInputs = {
    trips: driving.flatMap((trip) =>
      trip.departsAt === null || trip.arrivesAt === null
        ? []
        : [
            {
              id: trip.id,
              status: trip.status as TripStatus,
              departsAt: trip.departsAt,
              arrivesAt: trip.arrivesAt,
              seatHoldingBookings: holding(trip.id),
            },
          ],
    ),
    bookings: riding.flatMap((booking) =>
      booking.boardsAt === null || booking.tripArrivesAt === null
        ? []
        : [
            {
              id: booking.id,
              tripId: booking.tripId,
              status: statusAt({ ...booking, status: booking.status as BookingStatus }, now),
              boardsAt: booking.boardsAt,
              tripArrivesAt: booking.tripArrivesAt,
            },
          ],
    ),
    // Milestone 7's disputes and spec 13's payouts add theirs when they exist.
    openDisputes: [],
    heldPayouts: [],
  };
  const found = deletionCheck(inputs, now, settings);

  const shown = (item: Open): OpenItem => {
    switch (item.kind) {
      case "trip": {
        const departsAt = driving.find((row) => row.id === item.id)?.departsAt ?? null;
        if (departsAt === null) throw new Error("An open trip has no departure.");
        return { kind: "trip", id: item.id, departsAt, places: ends(item.id) };
      }
      case "booking":
      case "request": {
        const booking = riding.find((row) => row.id === item.id);
        if (booking === undefined || booking.boardsAt === null) {
          throw new Error("An open booking has no boarding time.");
        }
        return {
          kind: item.kind,
          id: item.id,
          tripId: booking.tripId,
          boardsAt: booking.boardsAt,
          places: {
            from: point(booking.fromIs, booking.fromEn),
            to: point(booking.toIs, booking.toEn),
          },
        };
      }
      case "trip_under_way": {
        const arrivesAt =
          driving.find((row) => row.id === item.id)?.arrivesAt ??
          riding.find((row) => row.tripId === item.id)?.tripArrivesAt ??
          null;
        if (arrivesAt === null) throw new Error("A trip under way has no arrival.");
        return {
          kind: "trip_under_way",
          tripId: item.id,
          completesAt: completesAt(arrivesAt, settings),
          places: ends(item.id),
        };
      }
      case "dispute":
      case "held_payout":
        return { kind: item.kind, id: item.id };
    }
  };
  return {
    allowed: found.allowed,
    mustSettle: found.mustSettle.map(shown),
    canCancel: found.canCancel.map(shown),
  };
}

export function createDeletionService(dependencies: DeletionServiceDependencies): DeletionService {
  const { db, clock, auth, tripDaySettings, logger } = dependencies;

  return {
    async check(userId) {
      return openFor(db, userId, clock(), tripDaySettings);
    },

    async schedule(userId, code) {
      const now = clock();
      // Refused before the code, so asking while something is open never
      // uses a try; checked again with the code, under the person's lock.
      if (!(await openFor(db, userId, now, tripDaySettings)).allowed) {
        return err({ code: "deletion_blocked" });
      }
      return auth.withConfirmCode(userId, code, async (tx) => {
        // The same lock booking takes, so no booking starts meanwhile.
        await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
        if (!(await openFor(tx, userId, now, tripDaySettings)).allowed) {
          return err({ code: "deletion_blocked" as const });
        }
        const until = deleteAfter(now);
        await tx
          .update(users)
          .set({ deleteAfter: until, updatedAt: now })
          .where(eq(users.id, userId));
        await endAllSessions(tx, userId, "account_deleted", now);
        await recordEvents(tx, [{ type: "AccountDeletionScheduled", userId }], now);
        logger.info({ userId }, "account deletion scheduled");
        return ok({ deleteAfter: until });
      });
    },

    async cancel(userId) {
      const now = clock();
      const kept = await db
        .update(users)
        .set({ deleteAfter: null, updatedAt: now })
        .where(and(eq(users.id, userId), isNotNull(users.deleteAfter)))
        .returning({ id: users.id });
      if (kept.length > 0) logger.info({ userId }, "account deletion cancelled");
    },
  };
}
