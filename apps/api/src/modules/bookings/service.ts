import type { Booking, CancellationPreview, TripBookings } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  arrivalOf,
  bookingClosedTo,
  bookingProblemReportable,
  cancellationTerms,
  cancelReasonsFor,
  defaultSafetySettings,
  checkBooking,
  checkNote,
  dayPhase,
  defaultReliabilitySettings,
  defaultReviewSettings,
  driverAbsentWindow,
  err,
  excusedByReason,
  hasTripDay,
  holdsSeats,
  movedFar,
  nextStatus,
  noShowWindow,
  ok,
  latestPaymentDeadline,
  paymentDeadline,
  peopleColourOf,
  statusAt,
  statusOnAcceptance,
  tripCancellation,
  type AccountSuspended,
  type BookingEvent,
  type BookingMode,
  type BookingProblem,
  type CancellationSettings,
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
  type ReliabilitySettings,
  type ReviewSettings,
  type TripCancelReason,
  type TripDaySettings,
  type TripStatus,
} from "@shareride/domain";
import { and, asc, eq, inArray, ne, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AccountService } from "../account/index.ts";
import { checkStanding, lockActive } from "../account/standing.ts";
import { addSystemLine } from "../chat/conversations.ts";
import { oweRefund } from "../payments/refunds.ts";
import {
  applyTripCancellation,
  heldBookingsOf,
  heldStatuses,
  toCancelWithTrip,
} from "./cancel-trip.ts";
import { bookingConfirmed } from "./confirmed.ts";
import { toSummary } from "../meeting-points/service.ts";
import { recordEvents } from "../notifications/outbox.ts";
import type { PhotoStorage } from "../../platform/photo-storage.ts";
import { photoLinkOf } from "../people/photos.ts";
import { newcomer, standingsOf } from "../people/standing.ts";
import { isHidden } from "../privacy/hidden.ts";
import { blocksOf } from "../safety/blocks.ts";
import {
  checkInsAt,
  driverCheckedInAt,
  passengerCheckedInAt,
  shownWindow,
} from "../trip-day/check-ins.ts";
import { reviewsOf, shownReview } from "../reviews/view.ts";
import { disputesOf, shownDispute } from "../trip-day/disputes.ts";
import { cancellationSettingsOf, type RuleSettingsSource } from "../settings/rule-settings.ts";
import {
  changeOccupancy,
  expireDueBookings,
  limitRoomOf,
  lockTrip,
  partOf,
  seatsTakenNow,
  stopsOf,
  type Queryable,
  type Transaction,
  methodOf,
} from "./seats.ts";
import { refitToTripLimit } from "../trips/limit.ts";

const {
  bookings,
  bookingSegmentPrices,
  meetingPoints,
  segments,
  tripChanges,
  trips,
  tripStops,
  users,
  vehicles,
} = schema;

export interface NotFound {
  readonly code: "not_found";
}

export type BookError =
  | NotFound
  | { readonly code: "account_incomplete" }
  /** Suspended: no booking or request (spec 9, 3.6.2). */
  | AccountSuspended
  /** The passenger is deleting their account (spec 11, 3.4). */
  | { readonly code: "account_deletion_pending" }
  /** The meeting points shown at the part's positions are no longer there (spec 6, 3.2). */
  | { readonly code: "stops_changed" }
  | BookingProblem;

/** The booking is no longer a request: answered, withdrawn or expired. */
export type AnswerError = NotFound | { readonly code: "booking_not_requested" };

/** A suspended driver takes nobody new (spec 9, 3.6.2); saying no stays open. */
export type AcceptError = AnswerError | AccountSuspended;

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

/**
 * Not the driver's, or a draft (deleted, never cancelled): not found. The
 * planned departure has come (R6.1): the trip day's then (spec 8). Or the
 * driver was shown another answer to whether it counts on their
 * reliability, as someone paid or left meanwhile.
 */
export type CancelTripError =
  | NotFound
  | { readonly code: "trip_not_cancellable" }
  | { readonly code: "terms_changed"; readonly countsOnReliability: boolean }
  | NoteProblem;

export interface CancelTripInput {
  readonly reason: TripCancelReason;
  /** The driver's note to everyone on the trip, as written. */
  readonly note?: string;
  /** What the driver was shown: whether it shows on their profile (R6.7). */
  readonly countsOnReliability: boolean;
}

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
  /** The meeting points the passenger was shown at those positions, when sent. */
  readonly fromPoint?: string | undefined;
  readonly toPoint?: string | undefined;
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
  /**
   * The driver cancels a published trip before it leaves (spec 6, 3.3):
   * each booking is cancelled with a full refund of what was paid, each
   * request declined, their seats freed, and everyone told. Asked again,
   * as a retry is, it changes nothing.
   */
  cancelTrip(
    driverId: string,
    tripId: string,
    input: CancelTripInput,
  ): Promise<Result<void, CancelTripError>>;
  accept(driverId: string, bookingId: string): Promise<Result<Booking, AcceptError>>;
  decline(
    driverId: string,
    bookingId: string,
    reason: DeclineReason | null,
  ): Promise<Result<Booking, AnswerError>>;
  /** The driver's published trip, with its requests and bookings (spec 5, 3.7). */
  tripBookings(driverId: string, tripId: string): Promise<TripBookings | undefined>;
}

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

/** The changes a passenger reads on their booking: moves, cars and stops (spec 6, 3.2). */
const toldKinds = ["departure", "vehicle", "addStop", "removeStop"];

type Row = Awaited<ReturnType<typeof bookingRows>>[number];

const driverOf = (row: Row) => ({
  id: row.trip.driverId,
  deleteAfter: row.driverLeaving,
  profileId: row.driverProfileId,
  ...row.driverPhoto,
});

const passengerOf = (row: Row) => ({
  id: row.booking.passengerId,
  deleteAfter: row.passengerLeaving,
  profileId: row.passengerProfileId,
  ...row.passengerPhoto,
});

/**
 * Bookings with everything their passenger or driver sees, oldest first,
 * each with its trip's moves, new cars and stops added or removed since it
 * was made (spec 6, 3.2), "I'm here" at its boarding stop (spec 8, 3.2),
 * its report, if any (3.3 to 3.5), and both people's profile, standing
 * (spec 5, 3.3.2) and photo (spec 1, 3.5).
 */
async function readBookings(
  q: Queryable,
  where: SQL | undefined,
  now: Date,
  reliability: ReliabilitySettings,
  photos: PhotoStorage | undefined,
) {
  const rows = await bookingRows(q, where);
  const tripIds = [...new Set(rows.map((row) => row.trip.id))];
  const people = rows.flatMap((row) => [driverOf(row), passengerOf(row)]);
  const linkOf = photoLinkOf(photos, now);
  const [changes, checkIns, reports, written, standingOf, photoLinks] = await Promise.all([
    tripIds.length === 0
      ? []
      : q
          .select()
          .from(tripChanges)
          .where(and(inArray(tripChanges.tripId, tripIds), inArray(tripChanges.kind, toldKinds)))
          .orderBy(asc(tripChanges.changedAt), asc(tripChanges.id)),
    checkInsAt(
      q,
      rows.map((row) => row.boardStop.id),
    ),
    disputesOf(
      q,
      rows.map((row) => row.booking.id),
    ),
    reviewsOf(
      q,
      rows.map((row) => row.booking.id),
    ),
    // Inside a booking's change, these are a few plain reads more while
    // the trip is locked; they lock nothing themselves.
    standingsOf(
      q,
      people.filter((person) => !isHidden(person)).map((person) => person.id),
      now,
      reliability,
    ),
    Promise.all(
      people.map((person) => (isHidden(person) ? Promise.resolve(null) : linkOf(person))),
    ),
  ]);
  // Nobody sees the profile, standing or photo of someone leaving, or of the
  // former member (spec 11, 3.4.3 and 3.5).
  const standing = (person: ReturnType<typeof driverOf>, photo: string | null | undefined) =>
    isHidden(person)
      ? { profileId: null, ...newcomer, photo: null }
      : { profileId: person.profileId, ...standingOf(person.id), photo: photo ?? null };
  return rows.map((row, index) => {
    const { createdAt, status, cancelledAt, expiredAt, decidedAt } = row.booking;
    // A booking that ended shows only the changes made while it held seats.
    const endedAt = cancelledAt ?? expiredAt ?? (status === "declined" ? decidedAt : null);
    return {
      ...row,
      // Two people a row, driver first, as `people` lists them.
      driverStanding: standing(driverOf(row), photoLinks[2 * index]),
      passengerStanding: standing(passengerOf(row), photoLinks[2 * index + 1]),
      passengerCheckedInAt: passengerCheckedInAt(checkIns, row.booking.id),
      driverCheckedInAt: driverCheckedInAt(checkIns, row.boardStop.id),
      dispute: reports.find((report) => report.bookingId === row.booking.id) ?? null,
      reviews: written.filter((review) => review.bookingId === row.booking.id),
      // Made under the trip's lock, so one at the same moment came before the booking.
      changes: changes.filter(
        (change) =>
          change.tripId === row.trip.id &&
          change.changedAt > createdAt &&
          (endedAt === null || change.changedAt < endedAt),
      ),
    };
  });
}

async function bookingRows(q: Queryable, where: SQL | undefined) {
  return q
    .select({
      booking: bookings,
      trip: {
        id: trips.id,
        driverId: trips.driverId,
        departsAt: trips.departsAt,
        arrivesAt: trips.arrivesAt,
        bookingMode: trips.bookingMode,
        status: trips.status,
        cancelledAt: trips.cancelledAt,
        countsOnReliability: trips.countsOnReliability,
        completedAt: trips.completedAt,
      },
      driverName: drivers.firstName,
      driverProfileId: drivers.profileId,
      driverLeaving: drivers.deleteAfter,
      driverPhoto: { photoKey: drivers.photoKey, photoHiddenAt: drivers.photoHiddenAt },
      passengerName: passengers.firstName,
      passengerProfileId: passengers.profileId,
      passengerLeaving: passengers.deleteAfter,
      passengerPhoto: { photoKey: passengers.photoKey, photoHiddenAt: passengers.photoHiddenAt },
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
    paymentMethod: methodOf(booking),
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

/** The planned time of the trip's last stop, as the trip day's windows count from it. */
const lastStopOf = (row: BookingRow) => row.trip.arrivesAt ?? plannedAt(row.alightStop);

/** The trip day at the boarding stop (spec 8, 3.1 and 3.2), for a booking that boards. */
function tripDayOf(
  row: BookingRow,
  status: BookingStatus,
  now: Date,
  settings: TripDaySettings,
): Booking["tripDay"] {
  if (!hasTripDay(status)) return null;
  const boardsAt = plannedAt(row.boardStop);
  const lastStopAt = lastStopOf(row);
  const window = shownWindow(boardsAt, settings);
  const noShow = noShowWindow(boardsAt, lastStopAt, settings);
  return {
    phase: dayPhase(boardsAt, lastStopAt, now, settings),
    checkInOpensAt: window.opensAt,
    checkInClosesAt: window.closesAt,
    passengerCheckedInAt: row.passengerCheckedInAt?.toISOString() ?? null,
    driverCheckedInAt: row.driverCheckedInAt?.toISOString() ?? null,
    reportOpensAt: noShow.opensAt.toISOString(),
    noShowClosesAt: noShow.closesAt.toISOString(),
    driverAbsentClosesAt: driverAbsentWindow(boardsAt, lastStopAt, settings).closesAt.toISOString(),
    arrival: arrivalOf({ status, checkedIn: row.passengerCheckedInAt !== null }),
  };
}

function present(
  row: BookingRow,
  viewerId: string,
  now: Date,
  settings: TripDaySettings,
  reviewSettings: ReviewSettings,
  /** The booking's own cancellation values (R10.3). */
  cancellation: CancellationSettings,
): Booking {
  const { booking, trip, car } = row;
  const status = shownStatus(booking, now);
  const viewer = viewerId === booking.passengerId ? "passenger" : "driver";
  const withdrawn = isWithdrawal(booking);
  // Ended with the whole trip, at the same moment (spec 6, 3.3), not cancelled alone before it.
  const wholeTrip =
    trip.cancelledAt !== null && booking.cancelledAt?.getTime() === trip.cancelledAt.getTime();
  const stopOf = (point: typeof row.boardPoint, stop: typeof row.boardStop): Booking["board"] => ({
    position: stop.position,
    meetingPoint: toSummary(point),
    plannedAt: plannedAt(stop).toISOString(),
  });
  // Every stop moves with the departure (R6.2): the passenger's boarding
  // time is always this far from it.
  const departsAt = trip.departsAt ?? plannedAt(row.boardStop);
  const boardingAfterMs = plannedAt(row.boardStop).getTime() - departsAt.getTime();
  const boardingAt = (departure: unknown) =>
    new Date(new Date(String(departure)).getTime() + boardingAfterMs).toISOString();
  return {
    id: booking.id,
    status,
    viewer,
    trip: { id: trip.id, bookingMode: trip.bookingMode as BookingMode },
    board: stopOf(row.boardPoint, row.boardStop),
    alight: stopOf(row.alightPoint, row.alightStop),
    seats: booking.seats,
    total: isk(booking.totalPrice),
    payment: methodOf(booking),
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
    // A request declined because the driver cancelled the trip says so too.
    cancellation:
      (status === "cancelled" && !withdrawn) || (status === "declined" && wholeTrip)
        ? {
            by: booking.cancelledBy as "passenger" | "driver" | "operator",
            reason: booking.cancelReason as CancelReason | null,
            note: booking.cancelNote,
            wholeTrip,
            refund: isk(booking.refundAmount ?? 0),
            // Whether it counts is the canceller's own business (spec 8); a
            // trip counts once, on the trip.
            countsOnReliability:
              booking.cancelledBy !== viewer
                ? null
                : wholeTrip
                  ? trip.countsOnReliability
                  : booking.countsOnReliability,
          }
        : null,
    changes: row.changes.map(({ kind, before, after, changedAt }) => {
      switch (kind) {
        case "vehicle":
          return {
            kind: "vehicle" as const,
            car: {
              make: String(after["make"]),
              model: String(after["model"]),
              colour: after["colour"] as CarColour,
            },
            changedAt: changedAt.toISOString(),
          };
        case "addStop":
          return {
            kind: "addStop" as const,
            stop: { is: String(after["nameIs"]), en: String(after["nameEn"]) },
            plannedAt: String(after["plannedAt"]),
            changedAt: changedAt.toISOString(),
          };
        case "removeStop":
          return {
            kind: "removeStop" as const,
            stop: { is: String(before["nameIs"]), en: String(before["nameEn"]) },
            changedAt: changedAt.toISOString(),
          };
        default:
          return {
            kind: "departure" as const,
            from: boardingAt(before["departsAt"]),
            to: boardingAt(after["departsAt"]),
            changedAt: changedAt.toISOString(),
          };
      }
    }),
    // Null only for a booking the previous version made during a deploy.
    movedFar: movedFar(booking.departsAtWhenBooked ?? departsAt, departsAt, cancellation),
    cancellationRules: {
      freeUntilMinutes: cancellation.refundCutoffMinutes,
      farMoveMinutes: cancellation.freeCancellationMoveMinutes,
    },
    problemReportable: bookingProblemReportable(
      { status, tripCompletedAt: trip.completedAt },
      now,
      defaultSafetySettings,
    ),
    driver: {
      firstName: row.driverName,
      colour: peopleColourOf(trip.driverId),
      ...row.driverStanding,
    },
    passenger: {
      firstName: row.passengerName,
      colour: peopleColourOf(booking.passengerId),
      ...row.passengerStanding,
      // The month only, as profiles show it (Iceland keeps UTC all year).
      memberSince: row.passengerSince.toISOString().slice(0, 7),
    },
    car:
      car === null ? null : { make: car.make, model: car.model, colour: car.colour as CarColour },
    // The exact meeting details open once the booking is confirmed (R5.12),
    // and stay with the ride once it completed.
    confirmed:
      status === "confirmed" || status === "completed"
        ? {
            registration: car?.registration ?? null,
            whereToStand:
              row.boardPoint.whereToStandIs === null
                ? null
                : localised(row.boardPoint.whereToStandIs, row.boardPoint.whereToStandEn),
          }
        : null,
    tripDay: tripDayOf(row, status, now, settings),
    dispute: row.dispute === null ? null : shownDispute(row.dispute, lastStopOf(row), settings),
    review: shownReview(row.reviews, booking, status, viewerId, reviewSettings),
  };
}

export function createBookingService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly account: Pick<AccountService, "me">;
  /**
   * Booking's values as they are now, and each booking's own cancellation
   * values (ADR 0032).
   */
  readonly settings: Pick<RuleSettingsSource, "booking" | "cancellationAt">;
  readonly tripDaySettings: TripDaySettings;
  /** The time to review (spec 8, 3.7). */
  readonly reviewSettings?: ReviewSettings;
  /** Whether the operator paused bookings and payments (spec 10, 3.3); never when left out. */
  readonly bookingsPausedIn?: (tx: Transaction) => Promise<boolean>;
  /** The reliability figure's values beside each person; the defaults when left out. */
  readonly reliabilitySettings?: ReliabilitySettings;
  /** Where people's photos are kept; no photos when left out (spec 1, 3.5). */
  readonly photos?: PhotoStorage;
}): BookingService {
  const { db, clock, account, tripDaySettings } = dependencies;
  const ruleSettings = dependencies.settings;
  const bookingsPausedIn = dependencies.bookingsPausedIn ?? (() => Promise.resolve(false));
  const reviewSettings = dependencies.reviewSettings ?? defaultReviewSettings;
  const reliability = dependencies.reliabilitySettings ?? defaultReliabilitySettings;
  const { photos } = dependencies;

  /** Bookings as their viewer sees them, each by its own cancellation values. */
  async function presentAll(rows: readonly BookingRow[], viewerId: string, now: Date) {
    const cancellationOf = await cancellationSettingsOf(
      ruleSettings,
      rows.map((row) => row.booking.settingsVersion),
    );
    return rows.map((row) =>
      present(
        row,
        viewerId,
        now,
        tripDaySettings,
        reviewSettings,
        cancellationOf(row.booking.settingsVersion),
      ),
    );
  }

  async function readOne(q: Queryable, bookingId: string, viewerId: string, now: Date) {
    const [row] = await readBookings(q, eq(bookings.id, bookingId), now, reliability, photos);
    if (row === undefined) return undefined;
    if (row.booking.passengerId !== viewerId && row.trip.driverId !== viewerId) return undefined;
    return present(
      row,
      viewerId,
      now,
      tripDaySettings,
      reviewSettings,
      await ruleSettings.cancellationAt(row.booking.settingsVersion),
    );
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
   * it is to change: the passenger's (withdraw) or the driver's (accept,
   * decline). `first` runs in the transaction before the trip is locked.
   */
  async function answer<Refused = never>(
    viewerId: string,
    bookingId: string,
    who: "passenger" | "driver",
    event: Extract<BookingEvent, "accept" | "decline" | "withdraw">,
    changes: (
      booking: typeof bookings.$inferSelect,
      boardsAt: Date,
      now: Date,
    ) => Partial<typeof bookings.$inferInsert>,
    first?: (tx: Transaction) => Promise<Result<void, Refused>>,
  ): Promise<Result<Booking, AnswerError | Refused>> {
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
      if (first !== undefined) {
        const allowed = await first(tx);
        if (!allowed.ok) return allowed;
      }
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
        // A request made before the level rose gives back less than its
        // seats now cost (spec 17).
        await refitToTripLimit(tx, found.tripId, now);
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

      // The values now; the booking keeps their version (R10.3).
      const { version: settingsVersion, settings } = await ruleSettings.booking();
      return db.transaction(async (tx) => {
        // One booking at a time per passenger, so two cannot overlap (R5.10)
        // or use the same attempt key; then the trip, for its seats (R5.2).
        // A suspension holds the same lock while it cancels their bookings,
        // and deleting an account takes it before it checks.
        const active = await lockActive(tx, passengerId, clock());
        if (!active.ok) return active;
        const [passenger] = await tx
          .select({ deleteAfter: users.deleteAfter })
          .from(users)
          .where(eq(users.id, passengerId));
        const again = await retried(tx);
        if (again !== undefined) return again;
        if (passenger === undefined || passenger.deleteAfter !== null) {
          return err({ code: "account_deletion_pending" });
        }
        const trip = await lockTrip(tx, tripId);
        if (trip === undefined) return err({ code: "not_found" });
        // Nobody books with a driver deleting their account, nor on a trip
        // left with the former member (spec 11, 3.4.3 and 3.5). Deleting
        // locks the driver's trips before it checks for bookings, so with
        // the trip locked this reads the date as it stands.
        const [driver] = await tx
          .select({ id: users.id, deleteAfter: users.deleteAfter })
          .from(users)
          .where(eq(users.id, trip.driverId));
        if (driver === undefined || isHidden(driver)) return err({ code: "not_found" });
        const now = clock();
        await expireDueBookings(tx, tripId, now);
        // Closed by a block with the driver, silently: as if the trip did
        // not exist (R9.4), even for another part of a trip already booked.
        if (bookingClosedTo(passengerId, trip.driverId, await blocksOf(tx, passengerId))) {
          return err({ code: "not_found" });
        }
        // A suspended driver's trip under way takes nobody new (spec 9,
        // 3.6.2). Read without a lock: the driver's row comes before trips.
        if (!(await checkStanding(tx, trip.driverId, now)).ok) {
          return err({ code: "trip_not_bookable" });
        }

        // One query at a time: a transaction has one connection.
        const stops = await stopsOf(tx, tripId);
        // A stop added since the passenger chose moves the positions on.
        const shown = (position: number, pointId: string | undefined) =>
          pointId === undefined || stops[position]?.meetingPointId === pointId;
        if (!shown(input.fromStop, input.fromPoint) || !shown(input.toStop, input.toPoint)) {
          return err({ code: "stops_changed" });
        }
        const segmentRows = await tx
          .select({ price: segments.price, occupancy: segments.occupancy })
          .from(segments)
          .where(eq(segments.tripId, tripId))
          .orderBy(asc(segments.position));
        const held = await heldBookings(tx, passengerId, now);
        const limitRoom = await limitRoomOf(tx, tripId);
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
            limitRoom,
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
            settingsVersion,
            paymentMethod: plan.paymentMethod,
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
      const rows = await readBookings(
        db,
        eq(bookings.passengerId, passengerId),
        now,
        reliability,
        photos,
      );
      const upcoming = (row: BookingRow) =>
        holdsSeats(shownStatus(row.booking, now)) &&
        plannedAt(row.alightStop).getTime() > now.getTime();
      const boardsAt = (row: BookingRow) => plannedAt(row.boardStop).getTime();
      const chosen =
        when === "upcoming"
          ? rows.filter(upcoming).sort((a, b) => boardsAt(a) - boardsAt(b))
          : rows.filter((row) => !upcoming(row)).sort((a, b) => boardsAt(b) - boardsAt(a));
      return presentAll(chosen, passengerId, now);
    },

    async booking(viewerId, bookingId) {
      return readOne(db, bookingId, viewerId, clock());
    },

    async bookingsOf(viewerId, bookingIds) {
      if (bookingIds.length === 0) return [];
      const now = clock();
      const rows = await readBookings(
        db,
        inArray(bookings.id, [...bookingIds]),
        now,
        reliability,
        photos,
      );
      return presentAll(
        rows.filter(
          (row) => row.booking.passengerId === viewerId || row.trip.driverId === viewerId,
        ),
        viewerId,
        now,
      );
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
      const cancellation = await ruleSettings.cancellationAt(found.booking.settingsVersion);
      const reasons: CancellationPreview["reasons"] = [];
      for (const reason of cancelReasonsFor(by)) {
        const terms = cancellationTerms(booking, { by, reason } as Canceller, now, cancellation);
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

        // From the booking's own stop, which may since have been removed
        // from the trip if the booking no longer holds seats there (R6.5).
        const [boarding] = await tx
          .select({ plannedAt: tripStops.plannedAt })
          .from(tripStops)
          .where(eq(tripStops.id, booking.fromStopId));
        const boardsAt = plannedAt(boarding ?? { plannedAt: null });
        const toBeCancelled = toCancel(
          booking,
          booking.status as BookingStatus,
          trip.departsAt,
          boardsAt,
        );
        const cancellation = await ruleSettings.cancellationAt(booking.settingsVersion);
        const terms = cancellationTerms(toBeCancelled, canceller, now, cancellation);
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
            // Worked out now, as it depends on the time (R8.11).
            excusedByReason: excusedByReason(toBeCancelled, canceller, now, cancellation),
            updatedAt: now,
          })
          .where(eq(bookings.id, bookingId));
        // An accepted or confirmed booking holds its seats until now (rule S1),
        // so its stops are still on the trip.
        const part = partOf(await stopsOf(tx, found.tripId), booking);
        await changeOccupancy(tx, found.tripId, part, -booking.seats);
        // Money kept after a late cancellation counts while the seat is free
        // again, and a seat booked before the level rose comes back dearer
        // (spec 17).
        await refitToTripLimit(tx, found.tripId, now);
        if (refund.amount > 0) await oweRefund(tx, bookingId, refund, now);
        await addSystemLine(
          tx,
          bookingId,
          { key: "cancelled", by, reason, note, wholeTrip: false },
          now,
        );
        await recordEvents(tx, [{ type: "BookingCancelled", bookingId, by }], now);
        return shown();
      });
    },

    async cancelTrip(driverId, tripId, input) {
      // As a booking's note: trimmed, and composed as the database counts it.
      const note = (input.note ?? "").trim().normalize("NFC");
      const noteProblem = checkNote(note)[0];
      if (noteProblem !== undefined) return err(noteProblem);
      return db.transaction(async (tx) => {
        const trip = await lockTrip(tx, tripId);
        if (trip?.driverId !== driverId) return err({ code: "not_found" });
        // Asked again, as a retry is: cancelled already, everyone told once.
        if (trip.status === "cancelled") return ok(undefined);
        // After the lock, which may have waited while a deadline passed.
        const now = clock();
        await expireDueBookings(tx, tripId, now);
        const held = await heldBookingsOf(tx, tripId);
        const outcome = tripCancellation(
          { status: trip.status as "published", departsAt: trip.departsAt ?? new Date(0) },
          toCancelWithTrip(held),
          input.reason,
          now,
        );
        if (!outcome.ok) return err({ code: "trip_not_cancellable" });
        // Someone paid or left since the screen showed it: show it again.
        const { countsOnReliability } = outcome.value;
        if (countsOnReliability !== input.countsOnReliability) {
          return err({ code: "terms_changed", countsOnReliability });
        }
        await applyTripCancellation(
          tx,
          tripId,
          held,
          outcome.value,
          { by: "driver", reason: input.reason, note },
          now,
        );
        return ok(undefined);
      });
    },

    async accept(driverId, bookingId) {
      // Nobody can pay during a pause, so the booking waits as long as it
      // can; the pause's end gives it its window (movePaymentDeadlines).
      // Read in the transaction, first, and held: the switch turns either
      // before it, and is seen, or after it, and moves this deadline itself.
      let paused = false;
      const { settings } = await ruleSettings.booking();
      return answer(
        driverId,
        bookingId,
        "driver",
        "accept",
        (booking, boardsAt, now) => {
          // A free ride needs no payment, nor one paid to the driver in
          // person, so it is confirmed at once (R5.11, rule M6).
          const status = statusOnAcceptance(isk(booking.totalPrice), methodOf(booking));
          return {
            status,
            decidedAt: now,
            paymentDueAt:
              status !== "accepted"
                ? null
                : paused
                  ? latestPaymentDeadline(boardsAt, settings)
                  : paymentDeadline(now, boardsAt, settings),
            confirmedAt: status === "confirmed" ? now : null,
          };
        },
        // Accepting takes a passenger on, which a suspension stops; the
        // driver's row first, as in booking, then the trip.
        async (tx) => {
          paused = await bookingsPausedIn(tx);
          return lockActive(tx, driverId, clock());
        },
      );
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
      const [rows, segmentRows, taken] = await Promise.all([
        readBookings(
          db,
          and(eq(bookings.tripId, tripId), inArray(bookings.status, onTripStatuses)),
          now,
          reliability,
          photos,
        ),
        db
          .select({ position: segments.position, occupancy: segments.occupancy })
          .from(segments)
          .where(eq(segments.tripId, tripId))
          .orderBy(asc(segments.position)),
        seatsTakenNow(db, [tripId], now),
      ]);
      const shown = rows
        .map((row) => ({ row, status: shownStatus(row.booking, now) }))
        .filter(({ status }) => onTripStatuses.includes(status));
      // As search and trip details count them, while the trip runs; and the
      // seats its passengers took, once they rode.
      const occupancy = segmentRows.map(({ position, occupancy: stored }) => ({
        position,
        occupancy: taken(tripId, position, stored),
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
        bookings: await presentAll(
          [...requests, ...others].map(({ row }) => row),
          driverId,
          now,
        ),
        segments: occupancy,
        capacity: trip.capacity,
      };
    },
  };
}
