// Reports on the trip day (spec 8, 3.3 and 3.4; R8.4 to R8.6): the driver
// marks a passenger who didn't come, or the passenger says the driver
// didn't come, and the other side answers. A booking is reported once. An
// agreed report stands at once; a contested one waits for the operator.
import type { Dispute } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  answererOf,
  checkAnswer,
  checkDisputeNote,
  checkDriverAbsent,
  checkNoShow,
  completesAt,
  err,
  nextStatus,
  ok,
  outcomeOfAnswer,
  type AnswerProblem,
  type BookingStatus,
  type DisputeAnswer,
  type DisputeKind,
  type DriverAbsentProblem,
  type NoShowProblem,
  type Result,
  type TripDaySettings,
} from "@shareride/domain";
import { and, eq, isNull } from "drizzle-orm";
import {
  changeOccupancy,
  expireDueBookings,
  lockTrip,
  partOf,
  stopsOf,
  type Transaction,
} from "../bookings/seats.ts";
import { refitToTripLimit } from "../trips/limit.ts";
import { recordEvents } from "../notifications/outbox.ts";
import { asRule, disputesOf, shownDispute, type DisputeRow } from "./disputes.ts";
import { applyOutcome } from "./outcome.ts";

const { bookings, checkIns, disputes, trips, tripStops } = schema;

type NoteProblem = { readonly code: "note_too_long" };
type NotFound = { readonly code: "not_found" };

export type NoShowError = NotFound | NoteProblem | NoShowProblem;
export type DriverAbsentError = NotFound | NoteProblem | DriverAbsentProblem;
export type AnswerError = NotFound | NoteProblem | AnswerProblem;

export interface ReportService {
  /** The driver marks a confirmed passenger of their trip as a no-show; the passenger is told. */
  markNoShow(
    driverId: string,
    bookingId: string,
    note: string | undefined,
  ): Promise<Result<Dispute, NoShowError>>;
  /** The passenger says the driver didn't come; the driver is told. */
  reportDriverAbsent(
    passengerId: string,
    bookingId: string,
    note: string | undefined,
  ): Promise<Result<Dispute, DriverAbsentError>>;
  /** The other side agrees, and the report stands, or contests it for the operator. */
  answer(
    userId: string,
    disputeId: string,
    input: { readonly answer: DisputeAnswer; readonly note?: string | undefined },
  ): Promise<Result<Dispute, AnswerError>>;
}

type TripRow = typeof trips.$inferSelect;

/** A booked trip's last stop has its time; the epoch stands in for one that does not. */
const lastStopOf = (trip: TripRow) => trip.arrivesAt ?? new Date(0);

export function createReportService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly settings: TripDaySettings;
}): ReportService {
  const { db, clock, settings } = dependencies;

  /** The booking, with its boarding stop's planned time as it is now. */
  async function bookingOn(tx: Transaction, bookingId: string) {
    const [row] = await tx
      .select({ booking: bookings, boardsAt: tripStops.plannedAt })
      .from(bookings)
      .innerJoin(tripStops, eq(tripStops.id, bookings.fromStopId))
      .where(eq(bookings.id, bookingId));
    if (row === undefined || row.boardsAt === null) {
      throw new Error("A booking's stop has its time.");
    }
    return { booking: row.booking, boardsAt: row.boardsAt };
  }

  /**
   * Records a report on a booking that has none. A repeat of the same report
   * answers with the first and tells nobody again; the other side's report
   * is answered instead (`already_reported`).
   */
  async function raise<Problem extends NoShowProblem | DriverAbsentProblem>(
    tx: Transaction,
    trip: TripRow,
    bookingId: string,
    kind: DisputeKind,
    note: string,
    now: Date,
    allowed: (
      booking: typeof bookings.$inferSelect,
      boardsAt: Date,
    ) => Promise<Result<null, Problem>>,
  ): Promise<
    Result<
      { readonly dispute: Dispute; readonly created: boolean },
      Problem | { readonly code: "already_reported" }
    >
  > {
    const [earlier] = await disputesOf(tx, [bookingId]);
    if (earlier !== undefined) {
      return earlier.kind === kind
        ? ok({ dispute: shownDispute(earlier, lastStopOf(trip), settings), created: false })
        : err({ code: "already_reported" });
    }
    const { booking, boardsAt } = await bookingOn(tx, bookingId);
    const check = await allowed(booking, boardsAt);
    if (!check.ok) return check;
    const [row] = await tx
      .insert(disputes)
      .values({ bookingId, kind, raisedAt: now, note })
      .returning();
    if (row === undefined) throw new Error("The report was not stored.");
    return ok({ dispute: shownDispute(row, lastStopOf(trip), settings), created: true });
  }

  return {
    async markNoShow(driverId, bookingId, note) {
      const tidy = checkDisputeNote(note ?? "");
      if (!tidy.ok) return tidy;
      const [mine] = await db
        .select({ tripId: bookings.tripId })
        .from(bookings)
        .innerJoin(trips, eq(trips.id, bookings.tripId))
        .where(and(eq(bookings.id, bookingId), eq(trips.driverId, driverId)));
      if (mine === undefined) return err({ code: "not_found" });
      return db.transaction(async (tx) => {
        // Every change to a trip's bookings locks the trip first.
        const trip = await lockTrip(tx, mine.tripId);
        if (trip === undefined) return err({ code: "not_found" });
        const now = clock();
        await expireDueBookings(tx, trip.id, now);
        const raised = await raise(
          tx,
          trip,
          bookingId,
          "no_show",
          tidy.value,
          now,
          async (booking, boardsAt) => {
            const [driverHere] = await tx
              .select({ id: checkIns.id })
              .from(checkIns)
              .where(and(eq(checkIns.tripStopId, booking.fromStopId), isNull(checkIns.bookingId)));
            return checkNoShow(
              {
                bookingStatus: booking.status as BookingStatus,
                boardsAt,
                lastStopAt: lastStopOf(trip),
                driverCheckedIn: driverHere !== undefined,
                reported: false,
              },
              now,
              settings,
            );
          },
        );
        if (!raised.ok) return raised;
        if (!raised.value.created) return ok(raised.value.dispute);
        // Marked now: the booking is a no-show and frees its seats (rule S1).
        const { booking } = await bookingOn(tx, bookingId);
        const next = nextStatus(booking.status as BookingStatus, "no_show");
        if (!next.ok) throw new Error("A no-show is marked on a confirmed booking.");
        await tx
          .update(bookings)
          .set({ status: next.value, updatedAt: now })
          .where(eq(bookings.id, bookingId));
        const part = partOf(await stopsOf(tx, trip.id), booking);
        await changeOccupancy(tx, trip.id, part, -booking.seats);
        // The driver keeps the money while the seat is free again (spec 17).
        await refitToTripLimit(tx, trip.id, now);
        await recordEvents(tx, [{ type: "NoShowMarked", bookingId }], now);
        return ok(raised.value.dispute);
      });
    },

    async reportDriverAbsent(passengerId, bookingId, note) {
      const tidy = checkDisputeNote(note ?? "");
      if (!tidy.ok) return tidy;
      const [mine] = await db
        .select({ tripId: bookings.tripId })
        .from(bookings)
        .where(and(eq(bookings.id, bookingId), eq(bookings.passengerId, passengerId)));
      if (mine === undefined) return err({ code: "not_found" });
      return db.transaction(async (tx) => {
        const trip = await lockTrip(tx, mine.tripId);
        if (trip === undefined) return err({ code: "not_found" });
        const now = clock();
        await expireDueBookings(tx, trip.id, now);
        // The booking stays as it is until the report is decided (3.4).
        const raised = await raise(
          tx,
          trip,
          bookingId,
          "driver_absent",
          tidy.value,
          now,
          (booking, boardsAt) =>
            Promise.resolve(
              checkDriverAbsent(
                {
                  bookingStatus: booking.status as BookingStatus,
                  boardsAt,
                  lastStopAt: lastStopOf(trip),
                  reported: false,
                },
                now,
                settings,
              ),
            ),
        );
        if (!raised.ok) return raised;
        if (raised.value.created) {
          await recordEvents(tx, [{ type: "DriverAbsentReported", bookingId }], now);
        }
        return ok(raised.value.dispute);
      });
    },

    async answer(userId, disputeId, input) {
      const tidy = checkDisputeNote(input.note ?? "");
      if (!tidy.ok) return tidy;
      const [found] = await db
        .select({
          kind: disputes.kind,
          tripId: bookings.tripId,
          passengerId: bookings.passengerId,
          driverId: trips.driverId,
        })
        .from(disputes)
        .innerJoin(bookings, eq(bookings.id, disputes.bookingId))
        .innerJoin(trips, eq(trips.id, bookings.tripId))
        .where(eq(disputes.id, disputeId));
      // Only the other side answers; to the one who reported it, it is not theirs to answer.
      const answerer =
        found === undefined
          ? undefined
          : answererOf(found.kind as DisputeKind) === "passenger"
            ? found.passengerId
            : found.driverId;
      if (found === undefined || answerer !== userId) return err({ code: "not_found" });
      return db.transaction(async (tx) => {
        const trip = await lockTrip(tx, found.tripId);
        if (trip === undefined) return err({ code: "not_found" });
        const now = clock();
        const reread = async (): Promise<DisputeRow> => {
          const [row] = await tx.select().from(disputes).where(eq(disputes.id, disputeId));
          if (row === undefined)
            throw new Error("A report is never deleted while its trip is locked.");
          return row;
        };
        const dispute = await reread();
        // Asked again, as a retry is: the same answer changes nothing.
        if (dispute.answer === input.answer) {
          return ok(shownDispute(dispute, lastStopOf(trip), settings));
        }
        const allowed = checkAnswer(
          asRule(dispute),
          completesAt(lastStopOf(trip), settings),
          now,
          settings,
        );
        if (!allowed.ok) return allowed;
        await tx
          .update(disputes)
          .set({ answer: input.answer, answeredAt: now, answerNote: tidy.value, updatedAt: now })
          .where(eq(disputes.id, disputeId));
        const outcome = outcomeOfAnswer(input.answer);
        if (outcome !== null) {
          await applyOutcome(tx, await reread(), { outcome, by: "system", note: "" }, now);
        }
        return ok(shownDispute(await reread(), lastStopOf(trip), settings));
      });
    },
  };
}
