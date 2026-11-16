// Bookings as the API returns them, and fake booking answers, for screen
// tests. Not used by the app itself.
import type { Booking, CancellationPreview, MyTrip } from "@shareride/contracts";
import { passengerCancelReasons, type Money } from "@shareride/domain";
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
    refund: paidBooking.total,
    countsOnReliability: true,
  },
});

/** What cancelling now does for each of the passenger's reasons; weather never counts (R6.8). */
export function cancellationPreview(
  refund: Money,
  countsOnReliability: boolean,
): CancellationPreview {
  return {
    reasons: passengerCancelReasons.map((reason) => ({
      reason,
      refund,
      countsOnReliability: reason === "weather" ? false : countsOnReliability,
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
const holding = new Set<Booking["status"]>(["requested", "accepted", "confirmed"]);

/**
 * Answers the driver's trip page for the north trip: its requests and
 * bookings, with the seats each stretch holds, and accepting and declining.
 * `answers` can replace what accepting or declining answers.
 */
export function driverApi(
  client: FakeClient,
  start: readonly Booking[],
  answers: { accept?: () => unknown; decline?: () => unknown } = {},
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
  client.answer("/v1/me/trips/{id}/bookings", () =>
    ok(200, {
      bookings: [
        ...bookings.filter((booking) => booking.status === "requested"),
        ...bookings.filter((booking) => booking.status !== "requested"),
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
  return {
    remove: (id: string) => {
      bookings = bookings.filter((booking) => booking.id !== id);
    },
    add: (booking: Booking) => {
      bookings = [...bookings, booking];
    },
  };
}
