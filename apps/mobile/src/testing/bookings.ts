// Bookings as the API returns them, and fake booking answers, for screen
// tests. Not used by the app itself.
import type { Booking } from "@shareride/contracts";
import { ok, type FakeClient } from "./fake-client";
import { northResult, northStops } from "./search";

const at = (position: number) => {
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
    board: at(1),
    alight: at(2),
    seats: 1,
    total: { amount: 2900, currency: "ISK" },
    message: "",
    createdAt: "2026-11-14T12:00:00.000Z",
    requestExpiresAt: "2026-11-14T22:00:00.000Z",
    paymentDueAt: null,
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

/** Answers GET /v1/bookings/{id} with `booking`. */
export function bookingApi(client: FakeClient, booking: () => Booking) {
  client.answer("/v1/bookings/{id}", () => ok(200, booking()), "get");
}
