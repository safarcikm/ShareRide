import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { freeSeats } from "../trips/search.ts";
import { checkBooking, type BookableTrip, type BookingAttempt } from "./check.ts";
import { holdsSeats, nextStatus, statusOnAcceptance, type BookingStatus } from "./lifecycle.ts";
import { defaultBookingSettings } from "./settings.ts";

const settings = defaultBookingSettings;
const kr = (amount: number) => ({ amount, currency: "ISK" as const });
const at = (iso: string) => new Date(iso);
// Saturday 14 November 2026, noon in Iceland (which keeps UTC).
const now = at("2026-11-14T12:00:00Z");

/** Reykjavík to Akureyri through Borgarnes and Blönduós, on Sunday morning. */
const northTrip: BookableTrip = {
  id: "trip-north",
  driverId: "driver-anna",
  status: "published",
  bookingMode: "approval",
  capacity: 3,
  stops: [
    { meetingPointId: "bsi", plannedAt: at("2026-11-15T09:00:00Z") },
    { meetingPointId: "borgarnes", plannedAt: at("2026-11-15T10:00:00Z") },
    { meetingPointId: "blonduos", plannedAt: at("2026-11-15T12:10:00Z") },
    { meetingPointId: "hof", plannedAt: at("2026-11-15T14:00:00Z") },
  ],
  segments: [
    { price: 1200, occupancy: 0 },
    { price: 2600, occupancy: 1 },
    { price: 2000, occupancy: 0 },
  ],
};

/** One seat from Borgarnes to Blönduós: 2 600 kr. */
const attempt: BookingAttempt = {
  trip: northTrip,
  passengerId: "passenger-jon",
  board: 1,
  alight: 2,
  seats: 1,
  shownTotal: kr(2600),
  message: "",
  heldBookings: [],
  now,
};

const problem = (changes: Partial<BookingAttempt>) => {
  const result = checkBooking({ ...attempt, ...changes }, settings);
  return result.ok ? null : result.error;
};

describe("checking a booking (rule S4, R5.3, R5.6, R5.10)", () => {
  it("plans a request that holds the seats until its deadline", () => {
    expect(checkBooking({ ...attempt, message: "One big suitcase" }, settings)).toEqual({
      ok: true,
      value: {
        status: "requested",
        segmentPrices: [{ position: 1, price: 2600 }],
        total: kr(2600),
        requestExpiresAt: at("2026-11-15T00:00:00Z"),
        paymentDueAt: null,
      },
    });
  });

  it("plans an instant booking that waits 30 minutes for payment", () => {
    const instant = { ...northTrip, bookingMode: "instant" as const };
    expect(
      checkBooking(
        { ...attempt, trip: instant, alight: 3, seats: 2, shownTotal: kr(9200) },
        settings,
      ),
    ).toEqual({
      ok: true,
      value: {
        status: "accepted",
        segmentPrices: [
          { position: 1, price: 2600 },
          { position: 2, price: 2000 },
        ],
        total: kr(9200),
        requestExpiresAt: null,
        paymentDueAt: at("2026-11-14T12:30:00Z"),
      },
    });
  });

  it("confirms a free instant booking at once (R5.11)", () => {
    const free: BookableTrip = {
      ...northTrip,
      bookingMode: "instant",
      segments: northTrip.segments.map((segment) => ({ ...segment, price: 0 })),
    };
    const result = checkBooking({ ...attempt, trip: free, shownTotal: kr(0) }, settings);
    expect(result.ok && result.value.status).toBe("confirmed");
    expect(result.ok && result.value.paymentDueAt).toBeNull();
  });

  it("refuses a trip that is not published or under way, or has passed the boarding stop", () => {
    for (const status of ["draft", "completed", "cancelled"] as const) {
      expect(problem({ trip: { ...northTrip, status } })).toEqual({ code: "trip_not_bookable" });
    }
    expect(problem({ now: at("2026-11-15T10:00:00Z") })).toEqual({ code: "trip_not_bookable" });
  });

  it("books a later stop once the trip has left its first one (rule S4, Martin 2026-11-16)", () => {
    // Anna left BSÍ at 09:00; Borgarnes, at 10:00, is more than the cut-off away.
    const underWay = { ...northTrip, status: "departed" as const };
    expect(problem({ trip: underWay, now: at("2026-11-15T09:30:00Z") })).toBeNull();
    expect(problem({ trip: underWay, now: at("2026-11-15T09:45:00Z") })).toEqual({
      code: "booking_closed",
    });
  });

  it("refuses a part that does not fit the trip", () => {
    expect(problem({ board: 2, alight: 2 })).toEqual({ code: "invalid_part", end: "alight" });
    expect(problem({ board: 3, alight: 3 })).toEqual({ code: "invalid_part", end: "board" });
    expect(problem({ board: 0, alight: 4 })).toEqual({ code: "invalid_part", end: "alight" });
    expect(problem({ board: 0.5 })).toEqual({ code: "invalid_part", end: "board" });
  });

  it("refuses the driver's own trip", () => {
    expect(problem({ passengerId: "driver-anna" })).toEqual({ code: "own_trip" });
  });

  it("closes 15 minutes before the boarding stop, as search and trip details do", () => {
    expect(problem({ now: at("2026-11-15T09:45:00Z") })).toEqual({ code: "booking_closed" });
    expect(problem({ now: at("2026-11-15T09:44:59.999Z") })).toBeNull();
  });

  it("needs at least one whole seat", () => {
    expect(problem({ seats: 0, shownTotal: kr(0) })).toEqual({ code: "invalid_seats" });
    expect(problem({ seats: 1.5 })).toEqual({ code: "invalid_seats" });
  });

  it("allows a message only with a request, of at most 300 characters and no contact details", () => {
    const instant = { ...northTrip, bookingMode: "instant" as const };
    expect(problem({ trip: instant, message: "Hi" })).toEqual({ code: "message_not_allowed" });
    expect(problem({ message: "a".repeat(300) })).toBeNull();
    expect(problem({ message: "a".repeat(301) })).toEqual({ code: "message_too_long" });
    expect(problem({ message: "Call me on 555 1234" })).toEqual({
      code: "message_has_contact_details",
      kinds: ["phone"],
    });
  });

  it("tells how many seats are free when too few are (rule S3)", () => {
    expect(problem({ seats: 3, shownTotal: kr(7800) })).toEqual({
      code: "seats_taken",
      freeSeats: 2,
    });
    // Before the busy stretch, all three are free.
    expect(problem({ board: 0, alight: 1, seats: 3, shownTotal: kr(3600) })).toBeNull();
  });

  it("asks again when the price is not the one last shown (R5.3)", () => {
    expect(problem({ shownTotal: kr(2400) })).toEqual({
      code: "price_changed",
      total: kr(2600),
    });
  });

  it("refuses a booking that overlaps one the passenger already holds (R5.10)", () => {
    const held = (boardsAt: string, alightsAt: string) => [
      { boardsAt: at(boardsAt), alightsAt: at(alightsAt) },
    ];
    expect(problem({ heldBookings: held("2026-11-15T11:00:00Z", "2026-11-15T13:00:00Z") })).toEqual(
      { code: "overlapping_booking" },
    );
    // Ending as this one starts, or starting as it ends, is fine.
    expect(
      problem({ heldBookings: held("2026-11-15T08:00:00Z", "2026-11-15T10:00:00Z") }),
    ).toBeNull();
    expect(
      problem({ heldBookings: held("2026-11-15T12:10:00Z", "2026-11-15T15:00:00Z") }),
    ).toBeNull();
  });

  it("follows the worked example in pricing and seats (capacity 3)", () => {
    // A, B, C and D are the four stops; every stretch costs 1 000 kr.
    let trip: BookableTrip = {
      ...northTrip,
      bookingMode: "instant",
      segments: northTrip.segments.map(() => ({ price: 1000, occupancy: 0 })),
    };
    const book = (board: number, alight: number, seats: number) => {
      const result = checkBooking(
        {
          ...attempt,
          trip,
          board,
          alight,
          seats,
          shownTotal: kr(1000 * seats * (alight - board)),
        },
        settings,
      );
      if (result.ok) {
        trip = {
          ...trip,
          segments: trip.segments.map((segment, position) =>
            position >= board && position < alight
              ? { ...segment, occupancy: segment.occupancy + seats }
              : segment,
          ),
        };
      }
      return result.ok ? "accepted" : result.error.code;
    };
    expect(book(0, 3, 1)).toBe("accepted");
    expect(book(0, 1, 2)).toBe("accepted");
    expect(book(1, 2, 2)).toBe("accepted");
    expect(book(1, 3, 1)).toBe("seats_taken");
    expect(book(2, 3, 2)).toBe("accepted");
    expect(trip.segments.map((segment) => segment.occupancy)).toEqual([3, 3, 3]);
  });
});

describe("seats over any sequence of bookings (rules S2 and S3)", () => {
  type Step =
    | {
        readonly kind: "book";
        readonly board: number;
        readonly alight: number;
        readonly seats: number;
      }
    | {
        readonly kind: "accept" | "decline" | "expire" | "withdraw" | "pay" | "cancel";
        readonly which: number;
      };

  const stops = northTrip.stops.length;
  const step: fc.Arbitrary<Step> = fc.oneof(
    fc
      .tuple(
        fc.integer({ min: 0, max: stops - 2 }),
        fc.integer({ min: 1, max: stops - 1 }),
        fc.integer({ min: 1, max: 4 }),
      )
      .map(([board, length, seats]) => ({
        kind: "book" as const,
        board,
        alight: Math.min(stops - 1, board + length),
        seats,
      })),
    fc
      .tuple(
        fc.constantFrom("accept", "decline", "expire", "withdraw", "pay", "cancel" as const),
        fc.nat(),
      )
      .map(([kind, which]) => ({ kind, which })),
  );

  it("never holds more seats than the car has, and books exactly the seats free (S2, S3)", () => {
    fc.assert(
      fc.property(
        fc.array(step, { maxLength: 40 }),
        fc.constantFrom("approval", "instant" as const),
        fc.constantFrom(0, 1000),
        (steps, bookingMode, price) => {
          const bookings: {
            board: number;
            alight: number;
            seats: number;
            status: BookingStatus;
          }[] = [];
          const occupancy = () =>
            northTrip.segments.map((_, position) =>
              bookings
                .filter(
                  (booking) =>
                    holdsSeats(booking.status) &&
                    booking.board <= position &&
                    position < booking.alight,
                )
                .reduce((sum, booking) => sum + booking.seats, 0),
            );
          for (const next of steps) {
            if (next.kind === "book") {
              const trip: BookableTrip = {
                ...northTrip,
                bookingMode,
                segments: occupancy().map((held) => ({ price, occupancy: held })),
              };
              const total = kr(price * next.seats * (next.alight - next.board));
              const result = checkBooking(
                {
                  ...attempt,
                  trip,
                  board: next.board,
                  alight: next.alight,
                  seats: next.seats,
                  shownTotal: total,
                },
                settings,
              );
              if (result.ok) bookings.push({ ...next, status: result.value.status });
            } else if (bookings.length > 0) {
              const booking = bookings[next.which % bookings.length];
              if (booking !== undefined) {
                const moved = nextStatus(booking.status, next.kind);
                if (moved.ok) {
                  booking.status =
                    next.kind === "accept" ? statusOnAcceptance(kr(price)) : moved.value;
                }
              }
            }
            const held = occupancy();
            expect(Math.max(...held)).toBeLessThanOrEqual(northTrip.capacity);
            // Another passenger can book exactly the free seats on every part, and no more.
            const trip: BookableTrip = {
              ...northTrip,
              bookingMode,
              segments: held.map((seats) => ({ price, occupancy: seats })),
            };
            for (let board = 0; board < stops - 1; board++) {
              for (let alight = board + 1; alight < stops; alight++) {
                const free = freeSeats(northTrip.capacity, held, board, alight);
                expect(free).toBeGreaterThanOrEqual(0);
                const tryBooking = (seats: number) =>
                  checkBooking(
                    {
                      ...attempt,
                      trip,
                      board,
                      alight,
                      seats,
                      shownTotal: kr(price * seats * (alight - board)),
                      message: "",
                    },
                    settings,
                  );
                if (free > 0) expect(tryBooking(free).ok).toBe(true);
                expect(tryBooking(free + 1)).toEqual({
                  ok: false,
                  error: { code: "seats_taken", freeSeats: free },
                });
              }
            }
          }
        },
      ),
    );
  });
});
