import type { TripChangeBody, TripChangeEffect } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  addStopLegPairs,
  checkTripChange,
  err,
  isOfferedForNewTrips,
  lookUpLegs,
  ok,
  latestPaymentDeadline,
  paymentDeadline,
  removeStopLegPairs,
  requestDeadline,
  routeLegPairs,
  splitPrice,
  suggestedPrice,
  type BookingOnTrip,
  defaultBookingSettings,
  type BookingSettings,
  type CarColour,
  type ChangeEffect,
  type ChangeProblem,
  type LegLookup,
  type MeetingPointStatus,
  type AccountSuspended,
  type NotificationSettings,
  type Result,
  type TripChange,
  type PriceSettings,
  paidInApp,
} from "@shareride/domain";
import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { lockActive } from "../account/standing.ts";
import {
  expireDueBookings,
  lockTrip,
  methodOf,
  takingsOfTrip,
  type Transaction,
} from "../bookings/seats.ts";
import { addSystemLine } from "../chat/conversations.ts";
import { followDepartureMove } from "../notifications/schedule.ts";
import { recordEvents } from "../notifications/outbox.ts";
import { choicesOf, type NotFound } from "./drafts.ts";
import { cancellationSettingsOf, type RuleSettingsSource } from "../settings/rule-settings.ts";
import type { TripSettingsSource } from "../settings/trip-settings.ts";

const {
  bookings,
  bookingSegmentPrices,
  legs,
  meetingPoints,
  segments,
  tripChanges,
  trips,
  tripStops,
  vehicles,
} = schema;

type TripRow = typeof trips.$inferSelect;

const alightStops = alias(tripStops, "alight_stops");

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
    { readonly code: "trip_departed" | "trip_cancelled" | "distances_missing" }
  >[];
}

/** A new stop's legs are still being worked out (spec 2, 3.7): try again soon. */
export interface DistancesPending {
  readonly code: "distances_missing";
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
  ): Promise<
    Result<
      TripChangeEffect,
      NotFound | NotChangeable | ChangeNotAllowed | DistancesPending | AccountSuspended
    >
  >;
}

/** The legs between these ordered pairs of points, as a lookup. */
async function legsFor(
  tx: Transaction,
  pairs: readonly (readonly [string, string])[],
): Promise<LegLookup> {
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
  return lookUpLegs(
    rows.map((row) => ({
      from: row.fromMeetingPointId,
      to: row.toMeetingPointId,
      distanceM: row.distanceM,
      durationS: row.durationS,
    })),
  );
}

/**
 * The change as the rules read it: a note as the database counts it (NFC);
 * a stop to add with whether it is offered, its season and the legs that
 * place it, or one to remove with the leg past it. A point that does not
 * exist is not offered.
 */
async function readChange(
  tx: Transaction,
  change: TripChangeBody,
  points: readonly string[],
): Promise<TripChange> {
  switch (change.kind) {
    case "departure":
      return { kind: "departure", departsAt: new Date(change.departsAt) };
    case "details":
      return { ...change, note: change.note.normalize("NFC") };
    case "addStop": {
      const { meetingPointId } = change;
      const [point] = await tx
        .select({
          status: meetingPoints.status,
          seasonStartMonth: meetingPoints.seasonStartMonth,
          seasonEndMonth: meetingPoints.seasonEndMonth,
        })
        .from(meetingPoints)
        .where(eq(meetingPoints.id, meetingPointId))
        // Shared, as when publishing: a pause under way and the new stop
        // wait for each other, so the pause tells this trip or it is refused.
        .for("share");
      const offered =
        point !== undefined && isOfferedForNewTrips(point.status as MeetingPointStatus);
      return {
        kind: "addStop",
        stop: {
          meetingPointId,
          season: point ?? { seasonStartMonth: null, seasonEndMonth: null },
          offered,
        },
        legs: await legsFor(tx, offered ? addStopLegPairs(points, meetingPointId) : []),
      };
    }
    case "removeStop":
      return {
        kind: "removeStop",
        meetingPointId: change.meetingPointId,
        legs: await legsFor(tx, removeStopLegPairs(points, change.meetingPointId)),
      };
    case "seats":
    case "priceLevel":
    case "bookingMode":
    case "vehicle":
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
  /** The settings version it was made under (R10.3). */
  readonly settingsVersion: number;
  readonly requestedAt: Date | null;
  readonly totalPrice: number;
  /** Paid to the driver in person, there is nothing to refund (rule M6). */
  readonly paymentMethod: string;
  /** The planned time at its boarding stop, before the change. */
  readonly boardsAt: Date | null;
  /** Where it gets in and out, by meeting point (R6.5). */
  readonly fromPoint: string;
  readonly toPoint: string;
}

export function createTripChangeService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  /** A published trip keeps the price values of its version (spec 10, R10.3). */
  readonly settings: TripSettingsSource;
  /**
   * Deadlines and how far a departure can move as they are now; each
   * booking's own `major_time_change` (ADR 0032).
   */
  readonly ruleSettings: RuleSettingsSource;
  readonly notificationSettings: NotificationSettings;
  /** Whether the operator paused bookings and payments (spec 10, 3.3); never when left out. */
  readonly bookingsPausedIn?: (tx: Transaction) => Promise<boolean>;
}): TripChangeService {
  const { db, clock, ruleSettings, notificationSettings } = dependencies;
  // As last read: each change reads the values first, and they are the
  // same for every trip, so a change running beside it sees them no older.
  let bookingSettings: BookingSettings = defaultBookingSettings;
  const bookingsPausedIn = dependencies.bookingsPausedIn ?? (() => Promise.resolve(false));

  /** Each stretch's typical driving time now (R3.6), or the one it was published with. */
  async function typicalTimes(
    tx: Transaction,
    points: readonly string[],
    published: readonly number[],
  ): Promise<number[]> {
    const lookup = await legsFor(tx, routeLegPairs(points));
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
    // A free ride has nothing to refund (R5.11), nor one paid in person (rule M6).
    const paid = new Set(
      held
        .filter(
          (booking) =>
            paidInApp({ amount: booking.totalPrice, currency: "ISK" }, methodOf(booking)).amount >
            0,
        )
        .map((booking) => booking.id),
    );
    // A new stop splits one stretch in two, and removing one joins two;
    // the others keep their prices.
    const { addedStop, removedStop } = effect;
    const stored =
      addedStop !== null
        ? [
            ...prices.slice(0, addedStop.position - 1),
            ...addedStop.stretches.map(({ price }) => price.amount),
            ...prices.slice(addedStop.position),
          ]
        : removedStop !== null
          ? [
              ...prices.slice(0, removedStop.position - 1),
              removedStop.stretch.price.amount,
              ...prices.slice(removedStop.position + 1),
            ]
          : prices;
    return {
      departsAt: times[0] ?? "",
      arrivesAt: times.at(-1) ?? "",
      stops: effect.trip.stops.map((stop) => stop.meetingPointId),
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
      levelLimitedBy: effect.levelLimitedBy,
      prices:
        effect.pricing?.map(({ price }) => price) ??
        stored.map((amount) => ({ amount, currency: "ISK" as const })),
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
   * A stop added or removed left too little room in the trip limit for the
   * level (spec 17): the level falls and every stretch is priced again, as
   * a price level change of its own, with its reason. Call it after the
   * stop is saved, so the stretches have their new positions.
   */
  async function lowerAfterStop(
    tx: Transaction,
    trip: TripRow,
    effect: ChangeEffect,
    now: Date,
  ): Promise<void> {
    if (effect.pricing === null) return;
    await reprice(tx, trip.id, effect, now);
    await record(
      tx,
      trip.id,
      "priceLevel",
      { priceLevel: trip.priceLevel },
      { priceLevel: effect.trip.priceLevel, reason: "trip_limit" },
      now,
    );
  }

  /**
   * Saves a change that is not a move, when it changes something: seats,
   * price level, booking mode, or the preferences and note. Nobody is told
   * (spec 7, 3.3); passengers see it on the trip.
   */
  async function saveChoice(
    tx: Transaction,
    trip: TripRow,
    change: Exclude<
      TripChange,
      { readonly kind: "departure" | "vehicle" | "addStop" | "removeStop" }
    >,
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
          {
            seats: after.seats,
            priceLevel: after.priceLevel,
            ...(effect.levelLimitedBy === "trip_limit" ? { reason: "trip_limit" } : {}),
          },
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
          .set({
            ...after.preferences,
            note: after.note,
            // A new note is new content: one ShareRide hid stays hidden only as it was (spec 9, 3.4.3).
            ...(made.note === kept.note ? {} : { noteHiddenAt: null }),
            updatedAt: now,
          })
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

  /** A car as the change records it and passengers read it: never its number plate (R7.9). */
  async function carOf(tx: Transaction, vehicleId: string | null) {
    const [car] =
      vehicleId === null
        ? []
        : await tx
            .select({ make: vehicles.make, model: vehicles.model, colour: vehicles.colour })
            .from(vehicles)
            .where(eq(vehicles.id, vehicleId));
    return car === undefined ? null : { ...car, colour: car.colour as CarColour };
  }

  /**
   * Saves another car, when it is another: each booked passenger is told,
   * on the booking, in the chat, by push and by email (spec 6, 3.2; spec 7, 3.3).
   */
  async function changeCar(
    tx: Transaction,
    trip: TripRow,
    effect: ChangeEffect,
    now: Date,
  ): Promise<void> {
    const vehicleId = effect.trip.vehicleId;
    if (vehicleId === trip.vehicleId) return;
    const car = await carOf(tx, vehicleId);
    if (car === null) throw new Error("The rules took a car that is not there.");
    await tx.update(trips).set({ vehicleId, updatedAt: now }).where(eq(trips.id, trip.id));
    const recorded = await record(
      tx,
      trip.id,
      "vehicle",
      { vehicleId: trip.vehicleId, ...(await carOf(tx, trip.vehicleId)) },
      { vehicleId, ...car },
      now,
    );
    for (const { bookingId } of effect.told) {
      await addSystemLine(tx, bookingId, { key: "car_changed", ...car }, now);
    }
    await recordEvents(
      tx,
      effect.told.map(({ bookingId }) => ({
        type: "TripChanged",
        bookingId,
        tripChangeId: recorded,
      })),
      now,
    );
  }

  /**
   * Saves a new stop (spec 6, 3.2): the stops and segments after it move up
   * one, the segment it splits becomes two with the same seats taken, and
   * each booking's price for it is shared between the two, keeping its
   * total (rule P1). Each booked passenger is told, on the booking, in the
   * chat, by push and by email (spec 7, 3.3).
   */
  async function addStop(
    tx: Transaction,
    tripId: string,
    effect: ChangeEffect,
    stops: readonly { readonly id: string; readonly position: number }[],
    segmentRows: readonly (typeof segments.$inferSelect)[],
    now: Date,
    settings: PriceSettings,
  ): Promise<void> {
    const { addedStop } = effect;
    const stop = effect.trip.stops[addedStop?.position ?? -1];
    const split = segmentRows[(addedStop?.position ?? 0) - 1];
    if (addedStop === null || stop === undefined || split === undefined) {
      throw new Error("The rules added a stop that is not there.");
    }
    const { position, stretches } = addedStop;
    const segment = position - 1;
    const stretch = (at: number) => ({
      distanceM: effect.trip.distancesM[at] ?? 0,
      durationS: effect.trip.typicalS[at] ?? 0,
    });
    const there = stretch(segment);
    const onwards = stretch(position);

    // One at a time from the last, as positions are unique.
    for (const later of [...segmentRows].reverse()) {
      if (later.position < position) break;
      await tx
        .update(segments)
        .set({ position: later.position + 1 })
        .where(and(eq(segments.tripId, tripId), eq(segments.position, later.position)));
    }
    for (const later of [...stops].reverse()) {
      if (later.position < position) break;
      await tx
        .update(tripStops)
        .set({ position: later.position + 1 })
        .where(eq(tripStops.id, later.id));
    }
    const [inserted] = await tx
      .insert(tripStops)
      .values({ tripId, meetingPointId: stop.meetingPointId, position, plannedAt: stop.plannedAt })
      .returning({ id: tripStops.id });
    if (inserted === undefined) throw new Error("The stop was not added.");
    const [toIt, onFromIt] = stretches;
    await tx
      .update(segments)
      .set({
        toStopId: inserted.id,
        ...there,
        suggestedPrice: suggestedPrice(there.distanceM, settings).amount,
        cap: toIt.cap.amount,
        price: toIt.price.amount,
      })
      .where(and(eq(segments.tripId, tripId), eq(segments.position, segment)));
    await tx.insert(segments).values({
      ...split,
      position,
      fromStopId: inserted.id,
      ...onwards,
      suggestedPrice: suggestedPrice(onwards.distanceM, settings).amount,
      cap: onFromIt.cap.amount,
      price: onFromIt.price.amount,
    });

    // Each booking's prices follow the segments, the last first.
    const priced = await tx
      .select({
        bookingId: bookingSegmentPrices.bookingId,
        position: bookingSegmentPrices.segmentPosition,
        price: bookingSegmentPrices.price,
      })
      .from(bookingSegmentPrices)
      .innerJoin(bookings, eq(bookings.id, bookingSegmentPrices.bookingId))
      .where(and(eq(bookings.tripId, tripId), gte(bookingSegmentPrices.segmentPosition, segment)))
      .orderBy(desc(bookingSegmentPrices.segmentPosition));
    for (const row of priced) {
      const at = and(
        eq(bookingSegmentPrices.bookingId, row.bookingId),
        eq(bookingSegmentPrices.segmentPosition, row.position),
      );
      if (row.position > segment) {
        await tx
          .update(bookingSegmentPrices)
          .set({ segmentPosition: row.position + 1 })
          .where(at);
        continue;
      }
      const [first, second] = splitPrice(row.price, [there.distanceM, onwards.distanceM]);
      await tx.update(bookingSegmentPrices).set({ price: first }).where(at);
      await tx
        .insert(bookingSegmentPrices)
        .values({ bookingId: row.bookingId, segmentPosition: position, price: second });
    }
    await tx.update(trips).set({ updatedAt: now }).where(eq(trips.id, tripId));

    const [point] = await tx
      .select({ nameIs: meetingPoints.nameIs, nameEn: meetingPoints.nameEn })
      .from(meetingPoints)
      .where(eq(meetingPoints.id, stop.meetingPointId));
    if (point === undefined) throw new Error("The rules added a point that is not there.");
    const added = {
      nameIs: point.nameIs,
      nameEn: point.nameEn ?? point.nameIs,
      plannedAt: iso(stop.plannedAt),
    };
    const recorded = await record(
      tx,
      tripId,
      "addStop",
      {},
      { meetingPointId: stop.meetingPointId, ...added },
      now,
    );
    for (const { bookingId } of effect.told) {
      await addSystemLine(tx, bookingId, { key: "stop_added", ...added }, now);
    }
    await recordEvents(
      tx,
      effect.told.map(({ bookingId }) => ({
        type: "TripChanged",
        bookingId,
        tripChangeId: recorded,
      })),
      now,
    );
  }

  /**
   * Removes a stop no booking uses (spec 6, 3.2; R6.5). It stays, marked
   * removed, for the bookings that once got in or out there, which still
   * name it, and leaves every list of the trip's stops. The segments either
   * side become the way past it, with the same seats taken; the stops and
   * segments after it move down one; and each booking's prices for the two
   * are added, keeping its total (rule P1). Each booked passenger is told,
   * on the booking, in the chat, by push and by email (spec 7, 3.3).
   */
  async function removeStop(
    tx: Transaction,
    tripId: string,
    effect: ChangeEffect,
    stops: readonly {
      readonly id: string;
      readonly position: number;
      readonly meetingPointId: string;
      readonly plannedAt: Date | null;
    }[],
    segmentRows: readonly (typeof segments.$inferSelect)[],
    now: Date,
    settings: PriceSettings,
  ): Promise<void> {
    const { removedStop } = effect;
    const position = removedStop?.position ?? -1;
    const stop = stops[position];
    const after = stops[position + 1];
    if (removedStop === null || stop === undefined || after === undefined) {
      throw new Error("The rules removed a stop that is not there.");
    }
    const segment = position - 1;
    const { stretch } = removedStop;
    const past = {
      distanceM: effect.trip.distancesM[segment] ?? 0,
      durationS: effect.trip.typicalS[segment] ?? 0,
    };

    await tx.update(tripStops).set({ removedAt: now }).where(eq(tripStops.id, stop.id));
    await tx
      .delete(segments)
      .where(and(eq(segments.tripId, tripId), eq(segments.position, position)));
    await tx
      .update(segments)
      .set({
        toStopId: after.id,
        ...past,
        occupancy: effect.trip.occupancy[segment] ?? 0,
        suggestedPrice: suggestedPrice(past.distanceM, settings).amount,
        cap: stretch.cap.amount,
        price: stretch.price.amount,
      })
      .where(and(eq(segments.tripId, tripId), eq(segments.position, segment)));
    // One at a time from the first, as positions are unique.
    for (const later of segmentRows) {
      if (later.position <= position) continue;
      await tx
        .update(segments)
        .set({ position: later.position - 1 })
        .where(and(eq(segments.tripId, tripId), eq(segments.position, later.position)));
    }
    for (const later of stops) {
      if (later.position <= position) continue;
      await tx
        .update(tripStops)
        .set({ position: later.position - 1 })
        .where(eq(tripStops.id, later.id));
    }

    // Each booking's prices follow the segments, the first first: a price
    // for the stretch from the stop is added to the one for the stretch to it.
    const priced = await tx
      .select({
        bookingId: bookingSegmentPrices.bookingId,
        position: bookingSegmentPrices.segmentPosition,
        price: bookingSegmentPrices.price,
      })
      .from(bookingSegmentPrices)
      .innerJoin(bookings, eq(bookings.id, bookingSegmentPrices.bookingId))
      .where(and(eq(bookings.tripId, tripId), gte(bookingSegmentPrices.segmentPosition, segment)))
      .orderBy(asc(bookingSegmentPrices.segmentPosition));
    const toIt = new Map(
      priced.filter((row) => row.position === segment).map((row) => [row.bookingId, row.price]),
    );
    for (const row of priced) {
      if (row.position === segment) continue;
      const at = and(
        eq(bookingSegmentPrices.bookingId, row.bookingId),
        eq(bookingSegmentPrices.segmentPosition, row.position),
      );
      const joined = toIt.get(row.bookingId);
      if (row.position === position && joined !== undefined) {
        await tx
          .update(bookingSegmentPrices)
          .set({ price: joined + row.price })
          .where(
            and(
              eq(bookingSegmentPrices.bookingId, row.bookingId),
              eq(bookingSegmentPrices.segmentPosition, segment),
            ),
          );
        await tx.delete(bookingSegmentPrices).where(at);
        continue;
      }
      await tx
        .update(bookingSegmentPrices)
        .set({ segmentPosition: row.position - 1 })
        .where(at);
    }
    await tx.update(trips).set({ updatedAt: now }).where(eq(trips.id, tripId));

    const [point] = await tx
      .select({ nameIs: meetingPoints.nameIs, nameEn: meetingPoints.nameEn })
      .from(meetingPoints)
      .where(eq(meetingPoints.id, stop.meetingPointId));
    if (point === undefined) throw new Error("The rules removed a point that is not there.");
    const removed = { nameIs: point.nameIs, nameEn: point.nameEn ?? point.nameIs };
    const recorded = await record(
      tx,
      tripId,
      "removeStop",
      {
        meetingPointId: stop.meetingPointId,
        ...removed,
        plannedAt: stop.plannedAt === null ? null : iso(stop.plannedAt),
      },
      {},
      now,
    );
    for (const { bookingId } of effect.told) {
      await addSystemLine(tx, bookingId, { key: "stop_removed", ...removed }, now);
    }
    await recordEvents(
      tx,
      effect.told.map(({ bookingId }) => ({
        type: "TripChanged",
        bookingId,
        tripChangeId: recorded,
      })),
      now,
    );
  }

  /** Saves a new departure: every stop moves with it (R6.2), and what hangs on the times. */
  async function moveDeparture(
    tx: Transaction,
    tripId: string,
    effect: ChangeEffect,
    stops: readonly { readonly id: string; readonly plannedAt: Date | null }[],
    now: Date,
    paused: boolean,
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
    // During a pause of payments an unpaid booking waits until the cut-off.
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
          .set({
            paymentDueAt: paused
              ? latestPaymentDeadline(boardsAt, bookingSettings)
              : paymentDeadline(booking.decidedAt, boardsAt, bookingSettings),
          })
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
        // First, and held to the end: a payment deadline moved here must
        // agree with the switch, which moves the deadlines when it turns.
        const paused = await bookingsPausedIn(tx);
        // As publishing: one at a time per driver, so two trips cannot overlap
        // (R3.7), and none while suspended (spec 9, 3.6.2).
        const active = await lockActive(tx, driverId, clock());
        if (!active.ok) return active;
        const trip = await lockTrip(tx, tripId);
        if (trip?.driverId !== driverId) return err({ code: "not_found" });
        // After the lock, which may have waited while a deadline passed.
        const now = clock();
        await expireDueBookings(tx, tripId, now);
        bookingSettings = (await ruleSettings.booking()).settings;
        const settings = {
          ...(await dependencies.settings.at(trip.settingsVersion)),
          maxMoveMinutes: await ruleSettings.maxMoveMinutes(),
        };

        const stopRows = await tx
          .select({ stop: tripStops, point: meetingPoints })
          .from(tripStops)
          .innerJoin(meetingPoints, eq(meetingPoints.id, tripStops.meetingPointId))
          .where(and(eq(tripStops.tripId, tripId), isNull(tripStops.removedAt)))
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
            settingsVersion: bookings.settingsVersion,
            requestedAt: bookings.requestedAt,
            totalPrice: bookings.totalPrice,
            paymentMethod: bookings.paymentMethod,
            boardsAt: tripStops.plannedAt,
            fromPoint: tripStops.meetingPointId,
            toPoint: alightStops.meetingPointId,
          })
          .from(bookings)
          .innerJoin(tripStops, eq(tripStops.id, bookings.fromStopId))
          .innerJoin(alightStops, eq(alightStops.id, bookings.toStopId))
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
        const cars = await tx
          .select({ id: vehicles.id })
          .from(vehicles)
          .where(and(eq(vehicles.ownerId, driverId), isNull(vehicles.removedAt)));
        const departsAt = trip.departsAt ?? now;
        const cancellationOf = await cancellationSettingsOf(
          ruleSettings,
          held.map((booking) => booking.settingsVersion),
        );
        const points = stopRows.map(({ stop }) => stop.meetingPointId);
        const read = await readChange(tx, change, points);
        const checked = checkTripChange(
          {
            status: trip.status as "published" | "departed" | "cancelled",
            stops: stopRows.map(({ stop, point }) => ({
              meetingPointId: stop.meetingPointId,
              plannedAt: stop.plannedAt ?? departsAt,
              season: point,
            })),
            typicalS: await typicalTimes(
              tx,
              points,
              segmentRows.map((segment) => segment.durationS),
            ),
            distancesM: segmentRows.map((segment) => segment.distanceM),
            occupancy: segmentRows.map((segment) => segment.occupancy),
            ...choicesOf(trip),
            takings: (await takingsOfTrip(tx, tripId)).amount,
            vehicleId: trip.vehicleId ?? "",
            cars: cars.map((car) => car.id),
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
            freeCancellationMoveMinutes: cancellationOf(booking.settingsVersion)
              .freeCancellationMoveMinutes,
            fromPoint: booking.fromPoint,
            toPoint: booking.toPoint,
          })),
          read,
          now,
          settings,
        );
        if (!checked.ok) {
          const ended = checked.error.find(
            (problem) => problem.code === "trip_departed" || problem.code === "trip_cancelled",
          );
          if (ended !== undefined) return err({ code: "trip_not_changeable" });
          if (checked.error.some((problem) => problem.code === "distances_missing")) {
            return err({ code: "distances_missing" });
          }
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
        if (read.kind === "departure") {
          // Nothing to save when the departure is the one it has.
          if (checked.value.trip.stops[0]?.plannedAt.getTime() !== departsAt.getTime()) {
            await moveDeparture(
              tx,
              tripId,
              checked.value,
              stopRows.map(({ stop }) => stop),
              now,
              paused,
            );
          }
        } else if (read.kind === "vehicle") {
          await changeCar(tx, trip, checked.value, now);
        } else if (read.kind === "addStop") {
          await addStop(
            tx,
            tripId,
            checked.value,
            stopRows.map(({ stop }) => stop),
            segmentRows,
            now,
            settings,
          );
          await lowerAfterStop(tx, trip, checked.value, now);
        } else if (read.kind === "removeStop") {
          await removeStop(
            tx,
            tripId,
            checked.value,
            stopRows.map(({ stop }) => stop),
            segmentRows,
            now,
            settings,
          );
          await lowerAfterStop(tx, trip, checked.value, now);
        } else {
          await saveChoice(tx, trip, read, checked.value, now);
        }
        return ok(effect);
      });
    },
  };
}
