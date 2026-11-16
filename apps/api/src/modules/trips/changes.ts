import type { TripChangeBody, TripChangeEffect } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  checkTripChange,
  err,
  lookUpLegs,
  ok,
  paymentDeadline,
  requestDeadline,
  routeLegPairs,
  type BookingOnTrip,
  type BookingSettings,
  type ChangeEffect,
  type ChangeProblem,
  type NotificationSettings,
  type Result,
  type TripSettings,
} from "@shareride/domain";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { expireDueBookings, lockTrip, type Transaction } from "../bookings/seats.ts";
import { addSystemLine } from "../chat/conversations.ts";
import { followDepartureMove } from "../notifications/schedule.ts";
import { recordEvents } from "../notifications/outbox.ts";
import { choicesOf, type NotFound } from "./drafts.ts";

const { bookings, legs, meetingPoints, segments, tripChanges, trips, tripStops, users } = schema;

/** The trip has left or was cancelled: nothing changes any more (R6.1). */
export interface NotChangeable {
  readonly code: "trip_not_changeable";
}

/** The change breaks these rules (spec 6, 3.2), each named so the app can say why. */
export interface ChangeNotAllowed {
  readonly code: "change_not_allowed";
  readonly problems: readonly Exclude<
    ChangeProblem,
    { readonly code: "trip_departed" | "trip_cancelled" }
  >[];
}

export interface TripChangeService {
  /**
   * One change to a published trip of the driver's, saved, or with
   * `preview` only worked out (spec 6, 3.2). The same checks and effect
   * either way, under the trip's lock, so the preview matches what saving
   * does as of that moment.
   */
  change(
    driverId: string,
    tripId: string,
    change: TripChangeBody,
    options: { readonly preview: boolean },
  ): Promise<Result<TripChangeEffect, NotFound | NotChangeable | ChangeNotAllowed>>;
}

/** Statuses of trips that hold the driver's time (R3.7). */
const ongoingStatuses = ["published", "departed"];
const heldStatuses = ["requested", "accepted", "confirmed"];

const iso = (moment: Date) => moment.toISOString();

/** A booking holding seats on the trip, as a change needs it. */
interface HeldBooking {
  readonly id: string;
  readonly status: string;
  readonly departsAtWhenBooked: Date | null;
  readonly requestedAt: Date | null;
  readonly totalPrice: number;
  /** The planned time at its boarding stop, before the change. */
  readonly boardsAt: Date | null;
}

export function createTripChangeService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings: TripSettings;
  readonly bookingSettings: BookingSettings;
  readonly notificationSettings: NotificationSettings;
}): TripChangeService {
  const { db, clock, settings, bookingSettings, notificationSettings } = dependencies;

  /** Each stretch's typical driving time now (R3.6), or the one it was published with. */
  async function typicalTimes(
    tx: Transaction,
    points: readonly string[],
    published: readonly number[],
  ): Promise<number[]> {
    const pairs = routeLegPairs(points);
    const rows =
      pairs.length === 0
        ? []
        : await tx
            .select()
            .from(legs)
            .where(
              sql`(${legs.fromMeetingPointId}, ${legs.toMeetingPointId}) in (${sql.join(
                pairs.map(([from, to]) => sql`(${from}::uuid, ${to}::uuid)`),
                sql`, `,
              )})`,
            );
    const lookup = lookUpLegs(
      rows.map((row) => ({
        from: row.fromMeetingPointId,
        to: row.toMeetingPointId,
        distanceM: row.distanceM,
        durationS: row.durationS,
      })),
    );
    return points
      .slice(1)
      .map(
        (to, index) =>
          lookup(points[index] ?? "", to)?.durationS ?? published[index] ?? Number.MAX_SAFE_INTEGER,
      );
  }

  /**
   * The effect as the contract gives it, with the requests on the trip: a
   * request whose deadline, worked out again from its new boarding time
   * (R5.5), has passed expires with the move, as saving does.
   */
  function effectOf(
    effect: ChangeEffect,
    held: readonly HeldBooking[],
    departsAt: Date,
    now: Date,
  ): TripChangeEffect {
    const times = effect.trip.stops.map((stop) => iso(stop.plannedAt));
    const byMs =
      (effect.trip.stops[0]?.plannedAt.getTime() ?? departsAt.getTime()) - departsAt.getTime();
    const requests = held.filter((booking) => booking.status === "requested");
    const expiring = requests.filter(
      ({ requestedAt, boardsAt }) =>
        requestedAt !== null &&
        boardsAt !== null &&
        requestDeadline(requestedAt, new Date(boardsAt.getTime() + byMs), bookingSettings) <= now,
    ).length;
    // A free ride has nothing to refund (R5.11).
    const paid = new Set(
      held.filter((booking) => booking.totalPrice > 0).map((booking) => booking.id),
    );
    return {
      departsAt: times[0] ?? "",
      arrivesAt: times.at(-1) ?? "",
      plannedTimes: times,
      told: effect.told.length,
      freeCancellations: effect.told.filter(
        (told) => told.freeCancellation && paid.has(told.bookingId),
      ).length,
      requests: requests.length - expiring,
      expiring,
    };
  }

  /** Saves a new departure: every stop moves with it (R6.2), and what hangs on the times. */
  async function moveDeparture(
    tx: Transaction,
    tripId: string,
    effect: ChangeEffect,
    stops: readonly { readonly id: string; readonly plannedAt: Date | null }[],
    now: Date,
  ): Promise<void> {
    const before = stops[0]?.plannedAt;
    const after = effect.trip.stops[0]?.plannedAt;
    if (before === undefined || before === null || after === undefined) {
      throw new Error("A published trip has its times.");
    }
    const byMs = after.getTime() - before.getTime();
    for (const [position, stop] of stops.entries()) {
      const plannedAt = effect.trip.stops[position]?.plannedAt ?? null;
      await tx.update(tripStops).set({ plannedAt }).where(eq(tripStops.id, stop.id));
    }
    await tx
      .update(trips)
      .set({ departsAt: after, arrivesAt: effect.trip.stops.at(-1)?.plannedAt, updatedAt: now })
      .where(eq(trips.id, tripId));

    // Deadlines are worked out again from the new boarding time (R5.5,
    // rule M1), and one that has passed expires.
    const held = await tx
      .select({ booking: bookings, boardsAt: tripStops.plannedAt })
      .from(bookings)
      .innerJoin(tripStops, eq(tripStops.id, bookings.fromStopId))
      .where(and(eq(bookings.tripId, tripId), inArray(bookings.status, heldStatuses)));
    for (const { booking, boardsAt } of held) {
      if (boardsAt === null) continue;
      if (booking.status === "requested" && booking.requestedAt !== null) {
        await tx
          .update(bookings)
          .set({ expiresAt: requestDeadline(booking.requestedAt, boardsAt, bookingSettings) })
          .where(eq(bookings.id, booking.id));
      }
      if (booking.status === "accepted" && booking.decidedAt !== null) {
        await tx
          .update(bookings)
          .set({ paymentDueAt: paymentDeadline(booking.decidedAt, boardsAt, bookingSettings) })
          .where(eq(bookings.id, booking.id));
      }
    }
    await expireDueBookings(tx, tripId, now);

    const [recorded] = await tx
      .insert(tripChanges)
      .values({
        tripId,
        kind: "departure",
        before: { departsAt: iso(before) },
        after: { departsAt: iso(after) },
        changedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: tripChanges.id });
    if (recorded === undefined) throw new Error("The change was not recorded.");

    // Only a request can expire here: a payment deadline is at the latest 15
    // minutes before boarding, and the new departure is 30 or more away (R3.5).
    const { told } = effect;
    for (const { bookingId } of told) {
      const boardsAt = held.find(({ booking }) => booking.id === bookingId)?.boardsAt;
      if (boardsAt === null || boardsAt === undefined) continue;
      await addSystemLine(
        tx,
        bookingId,
        {
          key: "departure_changed",
          from: iso(new Date(boardsAt.getTime() - byMs)),
          to: iso(boardsAt),
        },
        now,
      );
    }
    await recordEvents(
      tx,
      told.map(({ bookingId }) => ({
        type: "DepartureMoved",
        bookingId,
        tripChangeId: recorded.id,
      })),
      now,
    );
    await followDepartureMove(tx, tripId, now, notificationSettings);
  }

  return {
    async change(driverId, tripId, change, { preview }) {
      return db.transaction(async (tx) => {
        // As publishing: one at a time per driver, so two trips cannot overlap (R3.7).
        await tx.select({ id: users.id }).from(users).where(eq(users.id, driverId)).for("update");
        const trip = await lockTrip(tx, tripId);
        if (trip?.driverId !== driverId) return err({ code: "not_found" });
        // After the lock, which may have waited while a deadline passed.
        const now = clock();
        await expireDueBookings(tx, tripId, now);

        const stopRows = await tx
          .select({ stop: tripStops, point: meetingPoints })
          .from(tripStops)
          .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
          .where(eq(tripStops.tripId, tripId))
          .orderBy(asc(tripStops.position));
        const segmentRows = await tx
          .select()
          .from(segments)
          .where(eq(segments.tripId, tripId))
          .orderBy(asc(segments.position));
        const held: HeldBooking[] = await tx
          .select({
            id: bookings.id,
            status: bookings.status,
            departsAtWhenBooked: bookings.departsAtWhenBooked,
            requestedAt: bookings.requestedAt,
            totalPrice: bookings.totalPrice,
            boardsAt: tripStops.plannedAt,
          })
          .from(bookings)
          .innerJoin(tripStops, eq(tripStops.id, bookings.fromStopId))
          .where(and(eq(bookings.tripId, tripId), inArray(bookings.status, heldStatuses)))
          .orderBy(asc(bookings.createdAt), asc(bookings.id));
        const others = await tx
          .select({ departsAt: trips.departsAt, arrivesAt: trips.arrivesAt })
          .from(trips)
          .where(
            and(
              eq(trips.driverId, driverId),
              inArray(trips.status, ongoingStatuses),
              ne(trips.id, tripId),
            ),
          );
        const departsAt = trip.departsAt ?? now;
        const checked = checkTripChange(
          {
            status: trip.status as "published" | "departed" | "cancelled",
            stops: stopRows.map(({ stop, point }) => ({
              plannedAt: stop.plannedAt ?? departsAt,
              season: point,
            })),
            typicalS: await typicalTimes(
              tx,
              stopRows.map(({ stop }) => stop.meetingPointId),
              segmentRows.map((segment) => segment.durationS),
            ),
            distancesM: segmentRows.map((segment) => segment.distanceM),
            occupancy: segmentRows.map((segment) => segment.occupancy),
            ...choicesOf(trip),
            vehicleId: trip.vehicleId ?? "",
            note: trip.note,
            otherTrips: others.flatMap((other) =>
              other.departsAt === null || other.arrivesAt === null
                ? []
                : [{ departsAt: other.departsAt, arrivesAt: other.arrivesAt }],
            ),
          },
          held.map((booking): BookingOnTrip => ({
            id: booking.id,
            status: booking.status as BookingOnTrip["status"],
            // Null only for a booking the previous version made during a deploy.
            departsAtWhenBooked: booking.departsAtWhenBooked ?? departsAt,
          })),
          { kind: change.kind, departsAt: new Date(change.departsAt) },
          now,
          settings,
        );
        if (!checked.ok) {
          const ended = checked.error.find(
            (problem) => problem.code === "trip_departed" || problem.code === "trip_cancelled",
          );
          if (ended !== undefined) return err({ code: "trip_not_changeable" });
          return err({
            code: "change_not_allowed",
            problems: checked.error as ChangeNotAllowed["problems"],
          });
        }
        const effect = effectOf(checked.value, held, departsAt, now);
        if (preview) return ok(effect);
        // Nothing to save when the departure is the one it has.
        if (checked.value.trip.stops[0]?.plannedAt.getTime() !== departsAt.getTime()) {
          await moveDeparture(
            tx,
            tripId,
            checked.value,
            stopRows.map(({ stop }) => stop),
            now,
          );
        }
        return ok(effect);
      });
    },
  };
}
