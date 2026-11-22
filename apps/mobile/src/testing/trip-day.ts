// The north trip on Sunday 15 November 2026, its day, for screen tests: it
// leaves BSÍ at 09:00, is in Borgarnes at 10:00, Blönduós at 12:05 and Hof
// at 14:00, and completes at 16:00. Not used by the app itself.
import type { Booking, Dispute, MyTrip } from "@shareride/contracts";
import { northBooking, northMyTrip, northStop, paidBooking } from "./bookings";
import { aProfileId, newcomer } from "./people";

export type TripDay = NonNullable<Booking["tripDay"]>;

const minuteMs = 60_000;
const later = (at: string, minutes: number) =>
  new Date(new Date(at).getTime() + minutes * minuteMs).toISOString();

/** When the north trip completes, and a report about it can last be made (24 hours on). */
const completesAt = "2026-11-15T16:00:00.000Z";
const reportsCloseAt = "2026-11-16T16:00:00.000Z";

/** Gunna's paid booking on the trip day, "I'm here" open in Borgarnes from 09:30 to 11:00. */
export function onTheDay(changes: Partial<TripDay> = {}, booking: Partial<Booking> = {}): Booking {
  return northBooking({
    ...paidBooking,
    tripDay: {
      phase: "trip_day",
      checkInOpensAt: "2026-11-15T09:30:00.000Z",
      checkInClosesAt: "2026-11-15T11:00:00.000Z",
      passengerCheckedInAt: null,
      driverCheckedInAt: null,
      reportOpensAt: "2026-11-15T10:10:00.000Z",
      noShowClosesAt: completesAt,
      driverAbsentClosesAt: reportsCloseAt,
      arrival: "not_here",
      ...changes,
    },
    ...booking,
  });
}

/** The north trip on its day, "I'm here" said at the stops given. */
export function tripOnTheDay(saidAt: readonly number[] = []): MyTrip {
  return {
    ...northMyTrip,
    phase: "trip_day",
    stops: northMyTrip.stops.map((stop, position) => ({
      ...stop,
      checkIn:
        stop.checkIn === null
          ? null
          : { ...stop.checkIn, at: saidAt.includes(position) ? "2026-11-15T08:50:00.000Z" : null },
    })),
  };
}

/**
 * A passenger on the north trip as its driver sees them on the day, with
 * the windows at the stop where they get in.
 */
export function rider(
  id: string,
  firstName: string,
  part: { board: number; alight: number; seats?: number },
  arrival: TripDay["arrival"],
  status: Booking["status"] = "confirmed",
  changes: Partial<TripDay> = {},
): Booking {
  const board = northStop(part.board);
  return northBooking({
    id,
    viewer: "driver",
    status,
    board,
    alight: northStop(part.alight),
    seats: part.seats ?? 1,
    passenger: {
      firstName,
      colour: 2,
      memberSince: "2026-11",
      profileId: aProfileId(3),
      photo: null,
      ...newcomer,
    },
    tripDay: {
      phase: "trip_day",
      checkInOpensAt: later(board.plannedAt, -30),
      checkInClosesAt: later(board.plannedAt, 60),
      passengerCheckedInAt: arrival === "here" ? later(board.plannedAt, -20) : null,
      driverCheckedInAt: null,
      reportOpensAt: later(board.plannedAt, 10),
      noShowClosesAt: completesAt,
      driverAbsentClosesAt: reportsCloseAt,
      arrival,
      ...changes,
    },
  });
}

/**
 * A report on a booking, open: nobody has answered it yet. A no-show can
 * be answered until 24 hours after the trip completes; a driver's absence
 * 24 hours from the report.
 */
export function dispute(changes: Partial<Dispute> = {}): Dispute {
  const kind = changes.kind ?? "no_show";
  const raisedAt = changes.raisedAt ?? "2026-11-15T10:15:00.000Z";
  return {
    id: "0190a1d6-0000-7000-8000-0000000000d1",
    kind,
    raisedAt,
    answerBy: kind === "no_show" ? reportsCloseAt : later(raisedAt, 24 * 60),
    answer: null,
    answeredAt: null,
    outcome: null,
    decidedBy: null,
    decidedAt: null,
    ...changes,
  };
}
