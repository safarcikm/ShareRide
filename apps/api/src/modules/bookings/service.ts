import type { Booking, CancellationPreview, TripBookings } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  cancellationTerms,
  cancelReasonsFor,
  checkBooking,
  checkNote,
  err,
  holdsSeats,
  nextStatus,
  ok,
  paymentDeadline,
  peopleColourOf,
  statusAt,
  statusOnAcceptance,
  type BookingEvent,
  type BookingMode,
  type BookingProblem,
  type BookingSettings,
  type BookingStatus,
  type BookingToCancel,
  type CancellationTerms,
  type Canceller,
  type CancelReason,
  type CarColour,
  type DeclineReason,
  type Money,
  type NoteProblem,
  type Result,
  type TripStatus,
} from "@shareride/domain";
import { and, asc, eq, inArray, ne, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AccountService } from "../account/index.ts";
import { addSystemLine } from "../chat/conversations.ts";
import { oweRefund } from "../payments/refunds.ts";
import { bookingConfirmed } from "./confirmed.ts";
import { toSummary } from "../meeting-points/service.ts";
import { recordEvents } from "../notifications/outbox.ts";
import {
  changeOccupancy,
  expireDueBookings,
  lockTrip,
  occupancyNow,
  partOf,
  stopsOf,
  type Queryable,
  type Transaction,
} from "./seats.ts";

const {
  bookings,
  bookingSegmentPrices,
  meetingPoints,
  segments,
  trips,
  tripStops,
  users,
  vehicles,
} = schema;

export interface NotFound {
  readonly code: "not_found";
}

export type BookError = NotFound | { readonly code: "account_incomplete" } | BookingProblem;

/** The booking is no longer a request: answered, withdrawn or expired. */
export type AnswerError = NotFound | { readonly code: "booking_not_requested" };

/**
 * Only an accepted or confirmed booking can be cancelled, until the time to
 * get in; a request is withdrawn or declined instead.
 */
export type PreviewError = NotFound | { readonly code: "booking_not_cancellable" };

export type CancelError =
  | PreviewError
  | { readonly code: "reason_not_offered" }
  /** Only the driver writes a note (spec 6, 3.4), without contact details (R3.10). */
  | { readonly code: "note_not_offered" }
  | NoteProblem
  /** A time limit passed, or the trip moved, since the terms were shown. */
  | { readonly code: "terms_changed"; readonly terms: CancellationTerms };

export interface CancelInput {
  readonly reason: CancelReason;
  /** The driver's note to the passenger, as written. */
  readonly note?: string;
  /** The terms the canceller was shown. */
  readonly terms: CancellationTerms;
}

export interface BookInput {
  readonly fromStop: number;
  readonly toStop: number;
  readonly seats: number;
  readonly total: Money;
  readonly message: string;
  readonly attemptKey: string;
}

export interface BookingService {
  /** Books or requests seats (spec 5, 3.2); `created` is false for a retried attempt (R5.4). */
  book(
    passengerId: string,
    tripId: string,
    input: BookInput,
  ): Promise<Result<{ readonly booking: Booking; readonly created: boolean }, BookError>>;
  /** Upcoming: holding seats until the passenger gets out, soonest first; past: the rest, latest first. */
  myBookings(passengerId: string, when: "upcoming" | "past"): Promise<Booking[]>;
  /** For its passenger or the trip's driver; undefined for anyone else. */
  booking(viewerId: string, bookingId: string): Promise<Booking | undefined>;
  /** Those of the bookings that are the viewer's or on the viewer's trips, in no order. */
  bookingsOf(viewerId: string, bookingIds: readonly string[]): Promise<Booking[]>;
  withdraw(passengerId: string, bookingId: string): Promise<Result<Booking, AnswerError>>;
  /**
   * The reasons the passenger or the trip's driver can give, each with what
   * cancelling for it does now (spec 6, 3.4 and 3.5).
   */
  cancellationPreview(
    viewerId: string,
    bookingId: string,
  ): Promise<Result<CancellationPreview, PreviewError>>;
  /**
   * The passenger or the trip's driver cancels an accepted or confirmed
   * booking (spec 6, 3.4 and 3.5): the seats are freed, a refund is owed and
   * the other is told. Asked again, it answers the cancellation already made.
   */
  cancel(
    viewerId: string,
    bookingId: string,
    input: CancelInput,
  ): Promise<Result<Booking, CancelError>>;
  accept(driverId: string, bookingId: string): Promise<Result<Booking, AnswerError>>;
  decline(
    driverId: string,
    bookingId: string,
    reason: DeclineReason | null,
  ): Promise<Result<Booking, AnswerError>>;
  /** The driver's published trip, with its requests and bookings (spec 5, 3.7). */
  tripBookings(driverId: string, tripId: string): Promise<TripBookings | undefined>;
}

/** Statuses a booking can hold seats in, before its deadline is checked (rule S1). */
const heldStatuses: BookingStatus[] = ["requested", "accepted", "confirmed"];

/** What a driver sees on the trip: everyone who is, or was, riding along. */
const onTripStatuses: BookingStatus[] = [
  "requested",
  "accepted",
  "confirmed",
  "completed",
  "no_show",
];

const isk = (amount: number): Money => ({ amount, currency: "ISK" });

const passengers = alias(users, "passengers");
const drivers = alias(users, "drivers");
const boardStops = alias(tripStops, "board_stops");
const alightStops = alias(tripStops, "alight_stops");
const boardPoints = alias(meetingPoints, "board_points");
const alightPoints = alias(meetingPoints, "alight_points");

/** Bookings with everything their passenger or driver sees, oldest first. */
async function readBookings(q: Queryable, where: SQL | undefined) {
  return q
    .select({
      booking: bookings,
      trip: { id: trips.id, driverId: trips.driverId, bookingMode: trips.bookingMode },
      driverName: drivers.firstName,
      passengerName: passengers.firstName,
      passengerSince: passengers.createdAt,
      car: {
        make: vehicles.make,
        model: vehicles.model,
        colour: vehicles.colour,
        registration: vehicles.registration,
      },
      boardStop: boardStops,
      boardPoint: boardPoints,
      alightStop: alightStops,
      alightPoint: alightPoints,
    })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .innerJoin(drivers, eq(drivers.id, trips.driverId))
    .innerJoin(passengers, eq(passengers.id, bookings.passengerId))
    .leftJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .innerJoin(boardStops, eq(boardStops.id, bookings.fromStopId))
    .innerJoin(boardPoints, eq(boardPoints.id, boardStops.meetingPointId))
    .innerJoin(alightStops, eq(alightStops.id, bookings.toStopId))
    .innerJoin(alightPoints, eq(alightPoints.id, alightStops.meetingPointId))
    .where(where)
    .orderBy(asc(bookings.createdAt), asc(bookings.id));
}

type BookingRow = Awaited<ReturnType<typeof readBookings>>[number];

const localised = (is: string, en: string | null) => ({ is, en: en ?? is });

/** Every stop of a booked trip has its time; the epoch stands in for one that does not. */
const plannedAt = (stop: { readonly plannedAt: Date | null }) => stop.plannedAt ?? new Date(0);

type BookingColumns = typeof bookings.$inferSelect;

/** Cancelled by the passenger before the driver decided: only a request can be (R5.8). */
const isWithdrawal = (booking: BookingColumns) =>
  booking.status === "cancelled" &&
  booking.cancelledBy === "passenger" &&
  booking.decidedAt === null;

/** What `cancellationTerms` needs of a booking, its boarding time and its trip's departure. */
function toCancel(
  booking: BookingColumns,
  status: BookingStatus,
  departsAt: Date | null,
  boardsAt: Date,
): BookingToCancel {
  if (departsAt === null) throw new Error("A booked trip has its departure.");
  return {
    status,
    total: isk(booking.totalPrice),
    boardsAt,
    departsAt,
    // Null only for a booking the previous version made during a deploy.
    departsAtWhenBooked: booking.departsAtWhenBooked ?? departsAt,
  };
}

/** Who cancels and why, if the reason is one offered to them (spec 6, 3.4 and 3.5). */
function cancellerOf(by: Canceller["by"], reason: CancelReason): Canceller | undefined {
  const offered: readonly CancelReason[] = cancelReasonsFor(by);
  return offered.includes(reason) ? ({ by, reason } as Canceller) : undefined;
}

/** The viewer's side of a booking, or undefined for someone else. */
const sideOf = (
  viewerId: string,
  parties: { readonly passengerId: string; readonly driverId: string },
): Canceller["by"] | undefined =>
  parties.passengerId === viewerId
    ? "passenger"
    : parties.driverId === viewerId
      ? "driver"
      : undefined;

// Refunds are in ISK, the only currency the contracts take.
const sameTerms = (a: CancellationTerms, b: CancellationTerms) =>
  a.refund.amount === b.refund.amount && a.countsOnReliability === b.countsOnReliability;

/** The status as of `now`: a request or unpaid booking past its deadline reads as expired. */
function shownStatus(booking: BookingRow["booking"], now: Date): BookingStatus {
  return statusAt(
    {
      status: booking.status as BookingStatus,
      requestExpiresAt: booking.expiresAt,
      paymentDueAt: booking.paymentDueAt,
    },
    now,
  );
}

function present(row: BookingRow, viewerId: string, now: Date): Booking {
  const { booking, trip, car } = row;
  const status = shownStatus(booking, now);
  const viewer = viewerId === booking.passengerId ? "passenger" : "driver";
  const withdrawn = isWithdrawal(booking);
  const stopOf = (point: typeof row.boardPoint, stop: typeof row.boardStop): Booking["board"] => ({
    position: stop.position,
    meetingPoint: toSummary(point),
    plannedAt: plannedAt(stop).toISOString(),
  });
  return {
    id: booking.id,
    status,
    viewer,
    trip: { id: trip.id, bookingMode: trip.bookingMode as BookingMode },
    board: stopOf(row.boardPoint, row.boardStop),
    alight: stopOf(row.alightPoint, row.alightStop),
    seats: booking.seats,
    total: isk(booking.totalPrice),
    message: booking.message,
    createdAt: booking.createdAt.toISOString(),
    // An expired booking keeps the deadline that passed, so it can say which.
    requestExpiresAt:
      status === "requested" || (status === "expired" && booking.paymentDueAt === null)
        ? (booking.expiresAt?.toISOString() ?? null)
        : null,
    paymentDueAt:
      status === "accepted" || status === "expired"
        ? (booking.paymentDueAt?.toISOString() ?? null)
        : null,
    // A withdrawn request never counts against the passenger (R5.8).
    withdrawn,
    cancellation:
      status === "cancelled" && !withdrawn
        ? {
            by: booking.cancelledBy as "passenger" | "driver" | "operator",
            reason: booking.cancelReason as CancelReason | null,
            note: booking.cancelNote,
            refund: isk(booking.refundAmount ?? 0),
            // Whether it counts is the canceller's own business (spec 8).
            countsOnReliability:
              booking.cancelledBy === viewer ? booking.countsOnReliability : null,
          }
        : null,
    driver: { firstName: row.driverName ?? "", colour: peopleColourOf(trip.driverId) },
    passenger: {
      firstName: row.passengerName ?? "",
      colour: peopleColourOf(booking.passengerId),
      // The month only, as profiles show it (Iceland keeps UTC all year).
      memberSince: row.passengerSince.toISOString().slice(0, 7),
    },
    car:
      car === null ? null : { make: car.make, model: car.model, colour: car.colour as CarColour },
    // The exact meeting details open once the booking is confirmed (R5.12).
    confirmed:
      status === "confirmed"
        ? {
            registration: car?.registration ?? null,
            whereToStand:
              row.boardPoint.whereToStandIs === null
                ? null
                : localised(row.boardPoint.whereToStandIs, row.boardPoint.whereToStandEn),
          }
        : null,
  };
}

export function createBookingService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly account: Pick<AccountService, "me">;
  readonly settings: BookingSettings;
}): BookingService {
  const { db, clock, account, settings } = dependencies;

  async function readOne(q: Queryable, bookingId: string, viewerId: string, now: Date) {
    const [row] = await readBookings(q, eq(bookings.id, bookingId));
    if (row === undefined) return undefined;
    if (row.booking.passengerId !== viewerId && row.trip.driverId !== viewerId) return undefined;
    return present(row, viewerId, now);
  }

  async function byAttemptKey(q: Queryable, passengerId: string, attemptKey: string) {
    const [row] = await q
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.passengerId, passengerId), eq(bookings.attemptKey, attemptKey)));
    return row?.id;
  }

  /** The passenger's bookings on any trip that still hold seats, from boarding to alighting (R5.10). */
  async function heldBookings(tx: Transaction, passengerId: string, now: Date) {
    const rows = await tx
      .select({
        booking: bookings,
        boardsAt: boardStops.plannedAt,
        alightsAt: alightStops.plannedAt,
      })
      .from(bookings)
      .innerJoin(boardStops, eq(boardStops.id, bookings.fromStopId))
      .innerJoin(alightStops, eq(alightStops.id, bookings.toStopId))
      .where(and(eq(bookings.passengerId, passengerId), inArray(bookings.status, heldStatuses)));
    return rows
      .filter((row) => holdsSeats(shownStatus(row.booking, now)))
      .map((row) => ({
        boardsAt: plannedAt({ plannedAt: row.boardsAt }),
        alightsAt: plannedAt({ plannedAt: row.alightsAt }),
      }));
  }

  /**
   * Answers or withdraws a request, with its trip locked. `who` says whose
   * it is to change: the passenger's (withdraw) or the driver's (accept, decline).
   */
  async function answer(
    viewerId: string,
    bookingId: string,
    who: "passenger" | "driver",
    event: Extract<BookingEvent, "accept" | "decline" | "withdraw">,
    changes: (
      booking: typeof bookings.$inferSelect,
      boardsAt: Date,
      now: Date,
    ) => Partial<typeof bookings.$inferInsert>,
  ): Promise<Result<Booking, AnswerError>> {
    const [found] = await db
      .select({
        tripId: bookings.tripId,
        passengerId: bookings.passengerId,
        driverId: trips.driverId,
      })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .where(eq(bookings.id, bookingId));
    const owner = who === "passenger" ? found?.passengerId : found?.driverId;
    if (found === undefined || owner !== viewerId) return err({ code: "not_found" });

    return db.transaction(async (tx) => {
      if ((await lockTrip(tx, found.tripId)) === undefined) return err({ code: "not_found" });
      // After the lock, which may have waited while a deadline passed.
      const now = clock();
      await expireDueBookings(tx, found.tripId, now);
      const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
      if (booking === undefined) return err({ code: "not_found" });
      // Only a request can be answered or withdrawn; an expired one was stored above.
      const next = nextStatus(booking.status as BookingStatus, event);
      if (!next.ok) return err({ code: "booking_not_requested" });
      const stops = await stopsOf(tx, found.tripId);
      const part = partOf(stops, booking);
      const boardsAt = plannedAt(stops[part.board] ?? { plannedAt: null });
      const change = { status: next.value, ...changes(booking, boardsAt, now), updatedAt: now };
      await tx.update(bookings).set(change).where(eq(bookings.id, bookingId));
      if (!holdsSeats(change.status as BookingStatus)) {
        await changeOccupancy(tx, found.tripId, part, -booking.seats);
      }
      if (change.status === "confirmed") {
        await bookingConfirmed(tx, { id: bookingId, tripId: found.tripId }, now);
      } else {
        const told = {
          accept: "BookingAccepted",
          decline: "BookingDeclined",
          withdraw: "BookingWithdrawn",
        } as const;
        await recordEvents(tx, [{ type: told[event], bookingId }], now);
      }
      const shown = await readOne(tx, bookingId, viewerId, now);
      if (shown === undefined) throw new Error("The booking was not stored.");
      return ok(shown);
    });
  }

  return {
    async book(passengerId, tripId, input) {
      const retried = async (q: Queryable) => {
        const id = await byAttemptKey(q, passengerId, input.attemptKey);
        if (id === undefined) return undefined;
        const booking = await readOne(q, id, passengerId, clock());
        return booking === undefined ? undefined : ok({ booking, created: false });
      };
      const before = await retried(db);
      if (before !== undefined) return before;

      const me = await account.me(passengerId);
      if (me.missingSteps.length > 0) return err({ code: "account_incomplete" });

      return db.transaction(async (tx) => {
        // One booking at a time per passenger, so two cannot overlap (R5.10)
        // or use the same attempt key; then the trip, for its seats (R5.2).
        await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, passengerId))
          .for("update");
        const again = await retried(tx);
        if (again !== undefined) return again;
        const trip = await lockTrip(tx, tripId);
        if (trip === undefined) return err({ code: "not_found" });
        const now = clock();
        await expireDueBookings(tx, tripId, now);

        // One query at a time: a transaction has one connection.
        const stops = await stopsOf(tx, tripId);
        const segmentRows = await tx
          .select({ price: segments.price, occupancy: segments.occupancy })
          .from(segments)
          .where(eq(segments.tripId, tripId))
          .orderBy(asc(segments.position));
        const held = await heldBookings(tx, passengerId, now);
        const message = input.message.trim().normalize("NFC");
        const checked = checkBooking(
          {
            trip: {
              id: trip.id,
              driverId: trip.driverId,
              status: trip.status as TripStatus,
              capacity: trip.capacity,
              stops: stops.map((stop) => ({
                meetingPointId: stop.meetingPointId,
                plannedAt: plannedAt(stop),
              })),
              segments: segmentRows,
              bookingMode: trip.bookingMode as BookingMode,
            },
            passengerId,
            board: input.fromStop,
            alight: input.toStop,
            seats: input.seats,
            shownTotal: input.total,
            message,
            heldBookings: held,
            now,
          },
          settings,
        );
        if (!checked.ok) return checked;
        const plan = checked.value;
        const fromStop = stops[input.fromStop];
        const toStop = stops[input.toStop];
        if (fromStop === undefined || toStop === undefined)
          throw new Error("The part was checked.");

        const [created] = await tx
          .insert(bookings)
          .values({
            tripId,
            passengerId,
            fromStopId: fromStop.id,
            toStopId: toStop.id,
            seats: input.seats,
            status: plan.status,
            totalPrice: plan.total.amount,
            message,
            attemptKey: input.attemptKey,
            requestedAt: plan.status === "requested" ? now : null,
            decidedAt: plan.status === "requested" ? null : now,
            expiresAt: plan.requestExpiresAt,
            paymentDueAt: plan.paymentDueAt,
            confirmedAt: plan.status === "confirmed" ? now : null,
            departsAtWhenBooked: trip.departsAt,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: bookings.id });
        if (created === undefined) throw new Error("The booking was not stored.");
        await tx.insert(bookingSegmentPrices).values(
          plan.segmentPrices.map((segment) => ({
            bookingId: created.id,
            segmentPosition: segment.position,
            price: segment.price,
          })),
        );
        await changeOccupancy(
          tx,
          tripId,
          { board: input.fromStop, alight: input.toStop },
          input.seats,
        );
        if (plan.status === "confirmed") {
          await bookingConfirmed(tx, { id: created.id, tripId }, now);
        } else {
          const type = plan.status === "requested" ? "BookingRequested" : "BookingAccepted";
          await recordEvents(tx, [{ type, bookingId: created.id }], now);
        }
        const booking = await readOne(tx, created.id, passengerId, now);
        if (booking === undefined) throw new Error("The booking was not stored.");
        return ok({ booking, created: true });
      });
    },

    async myBookings(passengerId, when) {
      const now = clock();
      const rows = await readBookings(db, eq(bookings.passengerId, passengerId));
      const upcoming = (row: BookingRow) =>
        holdsSeats(shownStatus(row.booking, now)) &&
        plannedAt(row.alightStop).getTime() > now.getTime();
      const boardsAt = (row: BookingRow) => plannedAt(row.boardStop).getTime();
      const chosen =
        when === "upcoming"
          ? rows.filter(upcoming).sort((a, b) => boardsAt(a) - boardsAt(b))
          : rows.filter((row) => !upcoming(row)).sort((a, b) => boardsAt(b) - boardsAt(a));
      return chosen.map((row) => present(row, passengerId, now));
    },

    async booking(viewerId, bookingId) {
      return readOne(db, bookingId, viewerId, clock());
    },

    async bookingsOf(viewerId, bookingIds) {
      if (bookingIds.length === 0) return [];
      const now = clock();
      const rows = await readBookings(db, inArray(bookings.id, [...bookingIds]));
      return rows
        .filter((row) => row.booking.passengerId === viewerId || row.trip.driverId === viewerId)
        .map((row) => present(row, viewerId, now));
    },

    withdraw(passengerId, bookingId) {
      return answer(
        passengerId,
        bookingId,
        "passenger",
        "withdraw",
        (_booking, _boardsAt, now) => ({
          cancelledAt: now,
          cancelledBy: "passenger",
        }),
      );
    },

    async cancellationPreview(viewerId, bookingId) {
      const [found] = await db
        .select({
          booking: bookings,
          driverId: trips.driverId,
          departsAt: trips.departsAt,
          boardsAt: boardStops.plannedAt,
        })
        .from(bookings)
        .innerJoin(trips, eq(trips.id, bookings.tripId))
        .innerJoin(boardStops, eq(boardStops.id, bookings.fromStopId))
        .where(eq(bookings.id, bookingId));
      const by =
        found === undefined
          ? undefined
          : sideOf(viewerId, { passengerId: found.booking.passengerId, driverId: found.driverId });
      if (found === undefined || by === undefined) return err({ code: "not_found" });
      const now = clock();
      const booking = toCancel(
        found.booking,
        shownStatus(found.booking, now),
        found.departsAt,
        plannedAt({ plannedAt: found.boardsAt }),
      );
      const reasons: CancellationPreview["reasons"] = [];
      for (const reason of cancelReasonsFor(by)) {
        const terms = cancellationTerms(booking, { by, reason } as Canceller, now);
        if (!terms.ok) return err({ code: "booking_not_cancellable" });
        reasons.push({ reason, ...terms.value });
      }
      return ok({ reasons });
    },

    async cancel(viewerId, bookingId, input) {
      const [found] = await db
        .select({
          tripId: bookings.tripId,
          passengerId: bookings.passengerId,
          driverId: trips.driverId,
        })
        .from(bookings)
        .innerJoin(trips, eq(trips.id, bookings.tripId))
        .where(eq(bookings.id, bookingId));
      const by = found === undefined ? undefined : sideOf(viewerId, found);
      if (found === undefined || by === undefined) return err({ code: "not_found" });
      const canceller = cancellerOf(by, input.reason);
      if (canceller === undefined) return err({ code: "reason_not_offered" });
      // As the booking's message: trimmed, and composed as the database counts it.
      const note = (input.note ?? "").trim().normalize("NFC");
      if (by === "passenger" && note !== "") return err({ code: "note_not_offered" });
      const noteProblem = checkNote(note)[0];
      if (noteProblem !== undefined) return err(noteProblem);

      return db.transaction(async (tx) => {
        const trip = await lockTrip(tx, found.tripId);
        if (trip === undefined) return err({ code: "not_found" });
        // After the lock, which may have waited while a deadline passed.
        const now = clock();
        await expireDueBookings(tx, found.tripId, now);
        const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
        if (booking === undefined) return err({ code: "not_found" });
        const shown = async () => {
          const read = await readOne(tx, bookingId, viewerId, now);
          if (read === undefined) throw new Error("The booking was not stored.");
          return ok(read);
        };
        // Asked again, as a retry is: the cancellation already made, refunded
        // once. One the other side made meanwhile is not this one's answer.
        const again =
          booking.status === "cancelled" && booking.cancelledBy === by && !isWithdrawal(booking);
        if (again) return shown();

        const stops = await stopsOf(tx, found.tripId);
        const part = partOf(stops, booking);
        const boardsAt = plannedAt(stops[part.board] ?? { plannedAt: null });
        const terms = cancellationTerms(
          toCancel(booking, booking.status as BookingStatus, trip.departsAt, boardsAt),
          canceller,
          now,
        );
        if (!terms.ok) return err({ code: "booking_not_cancellable" });
        if (!sameTerms(terms.value, input.terms)) {
          return err({ code: "terms_changed", terms: terms.value });
        }
        const { refund, countsOnReliability } = terms.value;
        const { reason } = canceller;
        await tx
          .update(bookings)
          .set({
            status: "cancelled",
            cancelledAt: now,
            cancelledBy: by,
            cancelReason: reason,
            cancelNote: note,
            refundAmount: refund.amount,
            countsOnReliability,
            updatedAt: now,
          })
          .where(eq(bookings.id, bookingId));
        // An accepted or confirmed booking holds its seats until now (rule S1).
        await changeOccupancy(tx, found.tripId, part, -booking.seats);
        if (refund.amount > 0) await oweRefund(tx, bookingId, refund, now);
        await addSystemLine(tx, bookingId, { key: "cancelled", by, reason, note }, now);
        await recordEvents(tx, [{ type: "BookingCancelled", bookingId, by }], now);
        return shown();
      });
    },

    accept(driverId, bookingId) {
      return answer(driverId, bookingId, "driver", "accept", (booking, boardsAt, now) => {
        // A free ride needs no payment, so it is confirmed at once (R5.11).
        const status = statusOnAcceptance(isk(booking.totalPrice));
        return {
          status,
          decidedAt: now,
          paymentDueAt: status === "accepted" ? paymentDeadline(now, boardsAt, settings) : null,
          confirmedAt: status === "confirmed" ? now : null,
        };
      });
    },

    decline(driverId, bookingId, reason) {
      return answer(driverId, bookingId, "driver", "decline", (_booking, _boardsAt, now) => ({
        decidedAt: now,
        declineReason: reason,
      }));
    },

    async tripBookings(driverId, tripId) {
      const [trip] = await db
        .select({ capacity: trips.capacity })
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.driverId, driverId), ne(trips.status, "draft")));
      if (trip === undefined) return undefined;
      const now = clock();
      const [rows, segmentRows, asOfNow] = await Promise.all([
        readBookings(
          db,
          and(eq(bookings.tripId, tripId), inArray(bookings.status, onTripStatuses)),
        ),
        db
          .select({ position: segments.position, occupancy: segments.occupancy })
          .from(segments)
          .where(eq(segments.tripId, tripId))
          .orderBy(asc(segments.position)),
        occupancyNow(db, [tripId], now),
      ]);
      const shown = rows
        .map((row) => ({ row, status: shownStatus(row.booking, now) }))
        .filter(({ status }) => onTripStatuses.includes(status));
      // As search and trip details count them.
      const occupancy = segmentRows.map(({ position, occupancy: stored }) => ({
        position,
        occupancy: asOfNow(tripId, position, stored),
      }));
      // Requests first, oldest first (rows come oldest first); then by where passengers get in and out.
      const requests = shown.filter(({ status }) => status === "requested");
      const others = shown
        .filter(({ status }) => status !== "requested")
        .sort(
          (a, b) =>
            a.row.boardStop.position - b.row.boardStop.position ||
            a.row.alightStop.position - b.row.alightStop.position,
        );
      return {
        bookings: [...requests, ...others].map(({ row }) => present(row, driverId, now)),
        segments: occupancy,
        capacity: trip.capacity,
      };
    },
  };
}
