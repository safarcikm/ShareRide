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
  type TripChange,
  type TripSettings,
} from "@shareride/domain";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { expireDueBookings, lockTrip, type Transaction } from "../bookings/seats.ts";
import { addSystemLine } from "../chat/conversations.ts";
import { followDepartureMove } from "../notifications/schedule.ts";
import { recordEvents } from "../notifications/outbox.ts";
import { choicesOf, type NotFound } from "./drafts.ts";

const { bookings, legs, meetingPoints, segments, tripChanges, trips, tripStops, users } = schema;

type TripRow = typeof trips.$inferSelect;

/** What a change was and is, flat, as `trip_changes` keeps it. */
type ChangeValues = (typeof tripChanges.$inferInsert)["before"];

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

/** The change as the rules read it: a note as the database counts it (NFC). */
function asRead(change: TripChangeBody): TripChange {
  switch (change.kind) {
    case "departure":
      return { kind: "departure", departsAt: new Date(change.departsAt) };
    case "details":
      return { ...change, note: change.note.normalize("NFC") };
    case "seats":
    case "priceLevel":
    case "bookingMode":
      return change;
  }
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
    prices: readonly number[],
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
      seats: effect.trip.seats,
      priceLevel: effect.trip.priceLevel,
      priceLevelLowered: effect.priceLevelLowered,
      prices:
        effect.pricing?.map(({ price }) => price) ??
        prices.map((amount) => ({ amount, currency: "ISK" as const })),
    };
  }

  /** Records a change with its time (spec 6, 3.2): what it was and what it is. */
  async function record(
    tx: Transaction,
    tripId: string,
    kind: TripChange["kind"],
    before: ChangeValues,
    after: ChangeValues,
    now: Date,
  ): Promise<string> {
    const [recorded] = await tx
      .insert(tripChanges)
      .values({ tripId, kind, before, after, changedAt: now, createdAt: now, updatedAt: now })
      .returning({ id: tripChanges.id });
    if (recorded === undefined) throw new Error("The change was not recorded.");
    return recorded.id;
  }

  /**
   * Saves seats or a price level: the trip's, and each stretch's seats, cap
   * and price for new bookings (rules P3, P4). Bookings keep their prices (P1).
   */
  async function reprice(
    tx: Transaction,
    tripId: string,
    effect: ChangeEffect,
    now: Date,
  ): Promise<void> {
    const { seats, priceLevel } = effect.trip;
    await tx
      .update(trips)
      .set({ capacity: seats, priceLevel, updatedAt: now })
      .where(eq(trips.id, tripId));
    for (const [position, pricing] of (effect.pricing ?? []).entries()) {
      await tx
        .update(segments)
        .set({ capacity: seats, cap: pricing.cap.amount, price: pricing.price.amount })
        .where(and(eq(segments.tripId, tripId), eq(segments.position, position)));
    }
  }

  /**
   * Saves a change that is not a move, when it changes something: seats,
   * price level, booking mode, or the preferences and note. Nobody is told
   * (spec 7, 3.3); passengers see it on the trip.
   */
  async function saveChoice(
    tx: Transaction,
    trip: TripRow,
    change: Exclude<TripChange, { readonly kind: "departure" | "vehicle" }>,
    effect: ChangeEffect,
    now: Date,
  ): Promise<void> {
    const before = choicesOf(trip);
    const after = effect.trip;
    switch (change.kind) {
      case "seats":
        if (after.seats === before.seats) return;
        await reprice(tx, trip.id, effect, now);
        await record(
          tx,
          trip.id,
          "seats",
          { seats: before.seats, priceLevel: before.priceLevel },
          { seats: after.seats, priceLevel: after.priceLevel },
          now,
        );
        return;
      case "priceLevel":
        if (after.priceLevel === before.priceLevel) return;
        await reprice(tx, trip.id, effect, now);
        await record(
          tx,
          trip.id,
          "priceLevel",
          { priceLevel: before.priceLevel },
          { priceLevel: after.priceLevel },
          now,
        );
        return;
      case "bookingMode":
        // Requests already waiting stay open (spec 6, 3.2).
        if (after.bookingMode === before.bookingMode) return;
        await tx
          .update(trips)
          .set({ bookingMode: after.bookingMode, updatedAt: now })
          .where(eq(trips.id, trip.id));
        await record(
          tx,
          trip.id,
          "bookingMode",
          { bookingMode: before.bookingMode },
          { bookingMode: after.bookingMode },
          now,
        );
        return;
      case "details": {
        const kept = { ...before.preferences, note: trip.note };
        const made = { ...after.preferences, note: after.note };
        if (
          Object.entries(made).every(([key, value]) => kept[key as keyof typeof kept] === value)
        ) {
          return;
        }
        await tx
          .update(trips)
          .set({ ...after.preferences, note: after.note, updatedAt: now })
          .where(eq(trips.id, trip.id));
        // The note's text is not kept, only whether it changed: the trip
        // shows the one it has now, and an old note has no use (minimisation).
        await record(
          tx,
          trip.id,
          "details",
          { ...before.preferences },
          { ...after.preferences, noteChanged: made.note !== kept.note },
          now,
        );
        return;
      }
    }
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

    const recorded = await record(
      tx,
      tripId,
      "departure",
      { departsAt: iso(before) },
      { departsAt: iso(after) },
      now,
    );

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
        tripChangeId: recorded,
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
          asRead(change),
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
        const effect = effectOf(
          checked.value,
          held,
          departsAt,
          segmentRows.map((segment) => segment.price),
          now,
        );
        if (preview) return ok(effect);
        const read = asRead(change);
        if (read.kind === "departure") {
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
        } else if (read.kind !== "vehicle") {
          await saveChoice(tx, trip, read, checked.value, now);
        }
        return ok(effect);
      });
    },
  };
}
