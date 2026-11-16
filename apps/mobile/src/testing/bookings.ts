// Bookings as the API returns them, and fake booking answers, for screen
// tests. Not used by the app itself.
import type { Booking, CancelBookingBody, CancellationPreview, MyTrip } from "@shareride/contracts";
import { cancelReasonsFor, type BookingStatus, type Money } from "@shareride/domain";
import { failure, ok, type FakeClient } from "./fake-client";
import { northResult, northStops } from "./search";
import { plannedDraft } from "./trips";

/** A stop of the north trip, as a booking holds it. */
export const northStop = (position: number) => {
  const stop = northStops[position];
  if (stop === undefined) throw new Error(`No stop ${String(position)}`);
  return stop;
};

/** Borgarnes to Blönduós on the north trip, one seat, as its passenger sees it. */
export function northBooking(changes: Partial<Booking> = {}): Booking {
  return {
    id: "0190a1d6-0000-7000-8000-0000000000b1",
    status: "requested",
    viewer: "passenger",
    trip: { id: northResult.tripId, bookingMode: "approval" },
    board: northStop(1),
    alight: northStop(2),
    seats: 1,
    total: { amount: 2900, currency: "ISK" },
    message: "",
    createdAt: "2026-11-14T12:00:00.000Z",
    requestExpiresAt: "2026-11-14T22:00:00.000Z",
    paymentDueAt: null,
    withdrawn: false,
    cancellation: null,
    driver: { firstName: "Anna", colour: 1 },
    passenger: { firstName: "Gunna", colour: 2, memberSince: "2026-11" },
    car: { make: "Toyota", model: "Yaris", colour: "white" },
    confirmed: null,
    changes: [],
    movedFar: false,
    problemReportable: true,
    ...changes,
  };
}

/** An instant booking waiting for payment until 12:30. */
export const unpaidBooking = northBooking({
  status: "accepted",
  trip: { id: northResult.tripId, bookingMode: "instant" },
  requestExpiresAt: null,
  paymentDueAt: "2026-11-14T12:30:00.000Z",
});

/** The same booking once paid: the number plate and where to stand show. */
export const paidBooking = northBooking({
  ...unpaidBooking,
  status: "confirmed",
  paymentDueAt: null,
  confirmed: {
    registration: "AB 123",
    whereToStand: { is: "Við dælurnar", en: "By the petrol pumps" },
  },
});

/** The paid booking once its passenger cancelled it in time, with a full refund. */
export const cancelledBooking = northBooking({
  ...paidBooking,
  status: "cancelled",
  confirmed: null,
  cancellation: {
    by: "passenger",
    reason: "plans_changed",
    note: "",
    wholeTrip: false,
    refund: paidBooking.total,
    countsOnReliability: true,
  },
});

/**
 * What cancelling now does for each of the passenger's reasons, or the
 * driver's; weather and road closures never count (R6.7, R6.8).
 */
export function cancellationPreview(
  refund: Money,
  countsOnReliability: boolean,
  by: "passenger" | "driver" = "passenger",
): CancellationPreview {
  return {
    reasons: cancelReasonsFor(by).map((reason) => ({
      reason,
      refund,
      countsOnReliability:
        reason === "weather" || reason === "road_closed" ? false : countsOnReliability,
    })),
  };
}

/** Answers GET /v1/bookings/{id} with `booking`. */
export function bookingApi(client: FakeClient, booking: () => Booking) {
  client.answer("/v1/bookings/{id}", () => ok(200, booking()), "get");
}

/** The north trip's three stretches as My trips lists them, with the seats taken on each. */
export function northSegments(taken: readonly [number, number, number]): MyTrip["segments"] {
  return [1100, 2900, 2000].map((amount, position) => ({
    distanceM: 100_000,
    durationS: 3600,
    suggestedPrice: { amount, currency: "ISK" },
    cap: { amount: amount * 2, currency: "ISK" },
    price: { amount, currency: "ISK" },
    seatsTaken: taken[position] ?? 0,
  }));
}

/**
 * Anna's north trip as she sees it in My trips, published, with Gunna's
 * request for Borgarnes to Blönduós waiting until 22:00.
 */
export const northMyTrip = plannedDraft({
  id: northResult.tripId,
  status: "published",
  stops: northStops.map(({ meetingPoint, plannedAt }) => ({ meetingPoint, plannedAt })),
  seats: 3,
  departsAt: northStops[0]?.plannedAt ?? null,
  arrivesAt: northStops.at(-1)?.plannedAt ?? null,
  publishedAt: "2026-11-14T09:00:00.000Z",
  segments: northSegments([0, 1, 0]),
  openRequests: 1,
  requestsCloseAt: "2026-11-14T22:00:00.000Z",
});

/** Gunna's request for Borgarnes to Blönduós, as Anna, the driver, sees it. */
export const requestToDrive = northBooking({ viewer: "driver", message: "One small bag." });

/** Statuses that hold seats (rule S1), as the server counts them. */
const holding = new Set<BookingStatus>(["requested", "accepted", "confirmed"]);
/** Who the driver's trip page lists, as the server does: who is, or was, riding along. */
const onTrip = new Set<BookingStatus>([...holding, "completed", "no_show"]);

/**
 * Answers the driver's trip page for the north trip: its requests and
 * bookings, with the seats each stretch holds; accepting and declining; and
 * each booking, its cancellation preview and cancelling it, which always
 * refunds what was paid (rule M2). `answers` can replace what accepting,
 * declining, the preview or cancelling answers.
 */
export function driverApi(
  client: FakeClient,
  start: readonly Booking[],
  answers: {
    accept?: () => unknown;
    decline?: () => unknown;
    preview?: () => unknown;
    /** What cancelling answers; `undefined` cancels as the server would. */
    cancel?: () => unknown;
  } = {},
) {
  let bookings = [...start];
  const change = (id: string, changes: Partial<Booking>) => {
    const next = bookings.map((booking) =>
      booking.id === id ? { ...booking, ...changes } : booking,
    );
    bookings = next;
    return next.find((booking) => booking.id === id);
  };
  const idOf = (input: Record<string, unknown>) => (input["params"] as { id: string }).id;
  const byId = (input: Record<string, unknown>) =>
    bookings.find((booking) => booking.id === idOf(input));
  client.answer("/v1/me/trips/{id}/bookings", () =>
    ok(200, {
      bookings: [
        ...bookings.filter((booking) => booking.status === "requested"),
        ...bookings.filter(
          (booking) => booking.status !== "requested" && onTrip.has(booking.status),
        ),
      ],
      segments: [0, 1, 2].map((position) => ({
        position,
        occupancy: bookings
          .filter(
            (booking) =>
              holding.has(booking.status) &&
              booking.board.position <= position &&
              position < booking.alight.position,
          )
          .reduce((sum, booking) => sum + booking.seats, 0),
      })),
      capacity: 3,
    }),
  );
  client.answer("/v1/bookings/{id}/accept", (input) => {
    if (answers.accept !== undefined) return answers.accept();
    const accepted = change(idOf(input), {
      status: "accepted",
      requestExpiresAt: null,
      paymentDueAt: "2026-11-14T12:30:00.000Z",
    });
    return accepted === undefined ? failure(404, "not_found") : ok(200, accepted);
  });
  client.answer("/v1/bookings/{id}/decline", (input) => {
    if (answers.decline !== undefined) return answers.decline();
    const declined = change(idOf(input), { status: "declined", requestExpiresAt: null });
    return declined === undefined ? failure(404, "not_found") : ok(200, declined);
  });
  client.answer(
    "/v1/bookings/{id}",
    (input) => {
      const booking = byId(input);
      return booking === undefined ? failure(404, "not_found") : ok(200, booking);
    },
    "get",
  );
  client.answer("/v1/bookings/{id}/cancellation-preview", (input) => {
    if (answers.preview !== undefined) return answers.preview();
    const booking = byId(input);
    if (booking === undefined) return failure(404, "not_found");
    const paid = booking.status === "confirmed" ? booking.total : { ...booking.total, amount: 0 };
    return ok(200, cancellationPreview(paid, booking.status === "confirmed", "driver"));
  });
  client.answer("/v1/bookings/{id}/cancel", (input) => {
    const answered = answers.cancel?.();
    if (answered !== undefined) return answered;
    const { reason, terms, note } = input["body"] as CancelBookingBody;
    const cancelled = change(idOf(input), {
      status: "cancelled",
      confirmed: null,
      cancellation: { by: "driver", reason, note: note ?? "", wholeTrip: false, ...terms },
    });
    return cancelled === undefined ? failure(404, "not_found") : ok(200, cancelled);
  });
  return {
    remove: (id: string) => {
      bookings = bookings.filter((booking) => booking.id !== id);
    },
    add: (booking: Booking) => {
      bookings = [...bookings, booking];
    },
  };
}
