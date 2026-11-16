import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkTripChange,
  maxMoveMinutes,
  tripChangeKinds,
  type BookingOnTrip,
  type ChangeableTrip,
  type TripChange,
} from "./changes.ts";
import { highestPriceLevel, isPriceLevel } from "./prices.ts";
import { defaultTripSettings } from "./settings.ts";
import { checkTimes, plannedTimes } from "./times.ts";

const settings = defaultTripSettings;
const kr = (amount: number) => ({ amount, currency: "ISK" as const });
const minuteMs = 60_000;
const at = (iso: string) => new Date(iso);
const later = (moment: Date, minutes: number) => new Date(moment.getTime() + minutes * minuteMs);
// Saturday 14 November 2026, noon in Iceland (which keeps UTC).
const now = at("2026-11-14T12:00:00Z");
const allYear = { seasonStartMonth: null, seasonEndMonth: null };
const departure = at("2026-11-15T09:00:00Z");

/** Reykjavík to Akureyri through Borgarnes and Blönduós on Sunday morning, three seats. */
const northTrip: ChangeableTrip = {
  status: "published",
  stops: [
    { plannedAt: departure, season: allYear },
    { plannedAt: at("2026-11-15T10:00:00Z"), season: allYear },
    { plannedAt: at("2026-11-15T12:10:00Z"), season: allYear },
    { plannedAt: at("2026-11-15T14:00:00Z"), season: allYear },
  ],
  typicalS: [3300, 7200, 6000],
  distancesM: [60_000, 200_000, 150_000],
  occupancy: [0, 0, 0],
  seats: 3,
  priceLevel: 100,
  vehicleId: "car-yaris",
  cars: ["car-yaris", "car-van"],
  bookingMode: "approval",
  preferences: { luggage: "suitcase", pets: "ask", smoking: "no", childSeat: false, chat: "some" },
  note: "",
  otherTrips: [],
};

/** Gunna paid, Jón is still to pay, and Sigga's request waits. */
const bookings: readonly BookingOnTrip[] = [
  { id: "booking-gunna", status: "confirmed", departsAtWhenBooked: departure },
  { id: "booking-jon", status: "accepted", departsAtWhenBooked: departure },
  { id: "booking-sigga", status: "requested", departsAtWhenBooked: departure },
];
const bookedTrip: ChangeableTrip = { ...northTrip, occupancy: [1, 3, 1] };

const move = (minutes: number): TripChange => ({
  kind: "departure",
  departsAt: later(departure, minutes),
});
const problems = (result: ReturnType<typeof checkTripChange>) =>
  result.ok ? [] : result.error.map((problem) => problem.code);
const effect = (result: ReturnType<typeof checkTripChange>) => {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
  return result.value;
};
const plannedAt = (trip: ChangeableTrip) => trip.stops.map((stop) => stop.plannedAt.toISOString());

describe("a trip that has left or was cancelled (R6.1)", () => {
  it.each(["departed", "completed"] as const)("cannot change once %s", (status) => {
    expect(
      checkTripChange({ ...northTrip, status }, [], { kind: "seats", seats: 4 }, now, settings),
    ).toEqual({ ok: false, error: [{ code: "trip_departed" }] });
  });

  it("cannot change from its departure time, though the driver has not started it", () => {
    const change: TripChange = { kind: "seats", seats: 4 };
    expect(problems(checkTripChange(northTrip, [], change, departure, settings))).toEqual([
      "trip_departed",
    ]);
    expect(
      checkTripChange(northTrip, [], change, new Date(departure.getTime() - 1), settings).ok,
    ).toBe(true);
  });

  it("cannot change once cancelled", () => {
    expect(
      checkTripChange({ ...northTrip, status: "cancelled" }, [], move(10), now, settings),
    ).toEqual({ ok: false, error: [{ code: "trip_cancelled" }] });
  });
});

describe("moving the departure (spec 6, 3.2; R6.2 to R6.4)", () => {
  it("moves every planned time together and tells nobody without bookings", () => {
    const moved = effect(checkTripChange(northTrip, [], move(5 * 60), now, settings));
    expect(plannedAt(moved.trip)).toEqual([
      "2026-11-15T14:00:00.000Z",
      "2026-11-15T15:00:00.000Z",
      "2026-11-15T17:10:00.000Z",
      "2026-11-15T19:00:00.000Z",
    ]);
    expect(moved.told).toEqual([]);
    expect(moved.pricing).toBeNull();
  });

  it("keeps to 30 minutes from now and 60 days ahead (R3.5)", () => {
    const tooSoon = { kind: "departure", departsAt: later(now, 29) } as const;
    expect(problems(checkTripChange(northTrip, [], tooSoon, now, settings))).toEqual([
      "departure_too_soon",
    ]);
    const soonest = { kind: "departure", departsAt: later(now, 30) } as const;
    expect(checkTripChange(northTrip, [], soonest, now, settings).ok).toBe(true);
    const tooFar = { kind: "departure", departsAt: later(now, 60 * 24 * 60 + 1) } as const;
    expect(problems(checkTripChange(northTrip, [], tooFar, now, settings))).toEqual([
      "departure_too_far",
    ]);
  });

  it("keeps each stretch to 90% of its typical time, now that the legs say longer (R3.6)", () => {
    const slowerFirstLeg = { ...northTrip, typicalS: [4200, 7200, 6000] };
    expect(checkTripChange(slowerFirstLeg, [], move(10), now, settings)).toEqual({
      ok: false,
      error: [{ code: "stretch_too_fast", segment: 0 }],
    });
  });

  it("tells each booked passenger, and nobody may cancel for free, after a move of 30 minutes", () => {
    expect(effect(checkTripChange(bookedTrip, bookings, move(30), now, settings)).told).toEqual([
      {
        bookingId: "booking-gunna",
        event: { type: "DepartureMoved", byMinutes: 30 },
        freeCancellation: false,
      },
      {
        bookingId: "booking-jon",
        event: { type: "DepartureMoved", byMinutes: 30 },
        freeCancellation: false,
      },
    ]);
  });

  it("lets a paid passenger cancel for free after a move of 31 minutes, earlier or later", () => {
    for (const minutes of [31, -31]) {
      const told = effect(checkTripChange(bookedTrip, bookings, move(minutes), now, settings)).told;
      expect(told.map((one) => [one.bookingId, one.event, one.freeCancellation])).toEqual([
        ["booking-gunna", { type: "DepartureMoved", byMinutes: minutes }, true],
        ["booking-jon", { type: "DepartureMoved", byMinutes: minutes }, false],
      ]);
    }
  });

  it("does not tell a request's passenger (spec 7, 3.3), whose request still limits the move", () => {
    const request = bookings.filter((booking) => booking.status === "requested");
    expect(effect(checkTripChange(bookedTrip, request, move(60), now, settings)).told).toEqual([]);
    expect(problems(checkTripChange(bookedTrip, request, move(121), now, settings))).toEqual([
      "move_too_far",
    ]);
  });

  it("allows exactly 2 hours either way with bookings, and refuses a minute more", () => {
    expect(checkTripChange(bookedTrip, bookings, move(120), now, settings).ok).toBe(true);
    expect(checkTripChange(bookedTrip, bookings, move(-120), now, settings).ok).toBe(true);
    const window = { earliest: at("2026-11-15T07:00:00Z"), latest: at("2026-11-15T11:00:00Z") };
    expect(checkTripChange(bookedTrip, bookings, move(121), now, settings)).toEqual({
      ok: false,
      error: [{ code: "move_too_far", ...window }],
    });
    expect(checkTripChange(bookedTrip, bookings, move(-121), now, settings)).toEqual({
      ok: false,
      error: [{ code: "move_too_far", ...window }],
    });
  });

  it("has no 2-hour limit without bookings", () => {
    expect(checkTripChange(northTrip, [], move(121), now, settings).ok).toBe(true);
  });

  it("counts from each booking's own time: two moves of 20 minutes are 40, and back again is 10", () => {
    const first = effect(checkTripChange(bookedTrip, bookings, move(20), now, settings));
    expect(first.told[0]).toMatchObject({ event: { byMinutes: 20 }, freeCancellation: false });
    const second = effect(checkTripChange(first.trip, bookings, move(40), now, settings));
    expect(second.told[0]).toMatchObject({ event: { byMinutes: 40 }, freeCancellation: true });
    const back = effect(checkTripChange(second.trip, bookings, move(10), now, settings));
    expect(back.told[0]).toMatchObject({ event: { byMinutes: 10 }, freeCancellation: false });
  });

  it("keeps within 2 hours of every booking, made before or after an earlier move", () => {
    // Anna booked once the trip had moved an hour later.
    const trip = effect(checkTripChange(bookedTrip, bookings, move(60), now, settings)).trip;
    const afterAMove = [
      ...bookings,
      { id: "booking-anna", status: "confirmed", departsAtWhenBooked: later(departure, 60) },
    ] as const;
    const window = { earliest: at("2026-11-15T08:00:00Z"), latest: at("2026-11-15T11:00:00Z") };
    expect(checkTripChange(trip, afterAMove, move(121), now, settings)).toEqual({
      ok: false,
      error: [{ code: "move_too_far", ...window }],
    });
    expect(checkTripChange(trip, afterAMove, move(-61), now, settings)).toEqual({
      ok: false,
      error: [{ code: "move_too_far", ...window }],
    });
    const told = effect(checkTripChange(trip, afterAMove, move(-60), now, settings)).told;
    expect(told.at(-1)).toEqual({
      bookingId: "booking-anna",
      event: { type: "DepartureMoved", byMinutes: -120 },
      freeCancellation: true,
    });
  });

  it("does not overlap the driver's other trips (R3.7), though one may leave as the other arrives", () => {
    const evening = {
      departsAt: at("2026-11-15T16:00:00Z"),
      arrivesAt: at("2026-11-15T20:00:00Z"),
    };
    const trip = { ...northTrip, otherTrips: [evening] };
    expect(problems(checkTripChange(trip, [], move(121), now, settings))).toEqual([
      "overlaps_trip",
    ]);
    expect(checkTripChange(trip, [], move(120), now, settings).ok).toBe(true);
  });

  it("keeps every stop in its season (R2.5) when the move changes the month", () => {
    const lastNight = at("2026-11-30T22:00:00Z");
    const trip: ChangeableTrip = {
      ...northTrip,
      stops: northTrip.stops.map((stop, index) => ({
        plannedAt: later(stop.plannedAt, (lastNight.getTime() - departure.getTime()) / minuteMs),
        season: index === 2 ? { seasonStartMonth: 5, seasonEndMonth: 11 } : allYear,
      })),
    };
    const intoDecember = { kind: "departure", departsAt: later(lastNight, 120) } as const;
    expect(checkTripChange(trip, [], intoDecember, now, settings)).toEqual({
      ok: false,
      error: [{ code: "stop_out_of_season", stop: 2 }],
    });
  });

  it("gives every problem at once", () => {
    const thisAfternoon = {
      departsAt: at("2026-11-14T12:00:00Z"),
      arrivesAt: at("2026-11-14T18:00:00Z"),
    };
    const trip = { ...bookedTrip, otherTrips: [thisAfternoon] };
    const inTenMinutes = { kind: "departure", departsAt: later(now, 10) } as const;
    expect(problems(checkTripChange(trip, bookings, inTenMinutes, now, settings))).toEqual([
      "departure_too_soon",
      "overlaps_trip",
      "move_too_far",
    ]);
  });

  it("tells nobody when the departure stays as it is", () => {
    const same = effect(checkTripChange(bookedTrip, bookings, move(0), now, settings));
    expect(same.trip).toEqual(bookedTrip);
    expect(same.told).toEqual([]);
  });
});

describe("the seats offered (rule S5)", () => {
  const taken = { ...northTrip, seats: 4, occupancy: [1, 2, 1] };

  it("go down to the most seats taken on any segment, and no further, telling nobody", () => {
    const down = effect(
      checkTripChange(taken, bookings, { kind: "seats", seats: 2 }, now, settings),
    );
    expect(down.trip.seats).toBe(2);
    expect(down.told).toEqual([]);
    expect(checkTripChange(taken, bookings, { kind: "seats", seats: 1 }, now, settings)).toEqual({
      ok: false,
      error: [{ code: "seats_below_taken", taken: 2 }],
    });
  });

  it("go down to 1 without bookings, and up to 8 (R3.9)", () => {
    expect(checkTripChange(northTrip, [], { kind: "seats", seats: 1 }, now, settings).ok).toBe(
      true,
    );
    expect(checkTripChange(northTrip, [], { kind: "seats", seats: 8 }, now, settings).ok).toBe(
      true,
    );
    for (const seats of [0, 9, 2.5]) {
      expect(
        problems(checkTripChange(northTrip, [], { kind: "seats", seats }, now, settings)),
      ).toEqual(["seats_invalid"]);
    }
  });

  it("lower a price level above the highest for more seats, and say so (rule P4)", () => {
    const dear = { ...northTrip, priceLevel: 200 };
    const eight = effect(checkTripChange(dear, [], { kind: "seats", seats: 8 }, now, settings));
    expect(eight.trip.priceLevel).toBe(highestPriceLevel(8, settings));
    expect(eight.trip.priceLevel).toBe(110);
    expect(eight.priceLevelLowered).toBe(true);
    // 60, 200 and 150 km: each at 110% and under the cap for 8 seats (rules P3, P4).
    expect(eight.pricing).toEqual([
      { price: kr(1000), cap: kr(1000) },
      { price: kr(3300), cap: kr(3300) },
      { price: kr(2500), cap: kr(2500) },
    ]);
    const four = effect(checkTripChange(dear, [], { kind: "seats", seats: 4 }, now, settings));
    expect(four.trip.priceLevel).toBe(200);
    expect(four.priceLevelLowered).toBe(false);
  });
});

describe("the price level (rule P4)", () => {
  it("changes for new bookings only, telling nobody", () => {
    for (const priceLevel of [0, 90, highestPriceLevel(3, settings)]) {
      const changed = effect(
        checkTripChange(bookedTrip, bookings, { kind: "priceLevel", priceLevel }, now, settings),
      );
      expect(changed.trip.priceLevel).toBe(priceLevel);
      expect(changed.told).toEqual([]);
    }
  });

  it("prices new bookings at the new level, under the cap for the seats", () => {
    const change = { kind: "priceLevel", priceLevel: 200 } as const;
    expect(effect(checkTripChange(northTrip, [], change, now, settings)).pricing).toEqual([
      { price: kr(1800), cap: kr(2300) },
      { price: kr(6000), cap: kr(7500) },
      { price: kr(4500), cap: kr(5600) },
    ]);
  });

  it("is a step of 10% from free to the highest for the seats", () => {
    for (const priceLevel of [95, -10, highestPriceLevel(3, settings) + 10]) {
      expect(
        problems(checkTripChange(northTrip, [], { kind: "priceLevel", priceLevel }, now, settings)),
      ).toEqual(["price_level_invalid"]);
    }
  });
});

describe("the car", () => {
  it("is told to every passenger, with whether they may still cancel for free", () => {
    const movedFar = effect(checkTripChange(bookedTrip, bookings, move(45), now, settings)).trip;
    const change = { kind: "vehicle", vehicleId: "car-van" } as const;
    const changed = effect(checkTripChange(movedFar, bookings, change, now, settings));
    expect(changed.trip.vehicleId).toBe("car-van");
    expect(changed.told).toEqual([
      { bookingId: "booking-gunna", event: { type: "TripChanged" }, freeCancellation: true },
      { bookingId: "booking-jon", event: { type: "TripChanged" }, freeCancellation: false },
    ]);
  });

  it("is one of the driver's cars, not removed", () => {
    const stranger = { kind: "vehicle", vehicleId: "car-someone-elses" } as const;
    expect(problems(checkTripChange(bookedTrip, bookings, stranger, now, settings))).toEqual([
      "car_missing",
    ]);
    // The car the trip has is kept, even once removed: nothing changes.
    const removed = { ...bookedTrip, vehicleId: "car-old", cars: ["car-van"] };
    const same = { kind: "vehicle", vehicleId: "car-old" } as const;
    expect(effect(checkTripChange(removed, bookings, same, now, settings)).told).toEqual([]);
  });

  it("tells nobody when it stays the same, or nobody has booked", () => {
    const same = { kind: "vehicle", vehicleId: "car-yaris" } as const;
    expect(effect(checkTripChange(bookedTrip, bookings, same, now, settings)).told).toEqual([]);
    const van = { kind: "vehicle", vehicleId: "car-van" } as const;
    expect(effect(checkTripChange(northTrip, [], van, now, settings)).told).toEqual([]);
  });
});

describe("the booking mode", () => {
  it("changes for new bookings, telling nobody: requests stay open", () => {
    const change = { kind: "bookingMode", bookingMode: "instant" } as const;
    const changed = effect(checkTripChange(bookedTrip, bookings, change, now, settings));
    expect(changed.trip.bookingMode).toBe("instant");
    expect(changed.told).toEqual([]);
    expect(changed.pricing).toBeNull();
  });

  it("changes either way without bookings", () => {
    const instant = { ...northTrip, bookingMode: "instant" } as const;
    const change = { kind: "bookingMode", bookingMode: "approval" } as const;
    expect(effect(checkTripChange(instant, [], change, now, settings)).trip.bookingMode).toBe(
      "approval",
    );
  });
});

describe("the preferences and note", () => {
  const preferences = { ...northTrip.preferences, pets: "yes" } as const;

  it("change on the trip, telling nobody", () => {
    const change = { kind: "details", preferences, note: "Room for skis." } as const;
    const changed = effect(checkTripChange(bookedTrip, bookings, change, now, settings));
    expect(changed.trip.preferences).toEqual(preferences);
    expect(changed.trip.note).toBe("Room for skis.");
    expect(changed.told).toEqual([]);
  });

  it("keep the note's rules (R3.10)", () => {
    const withNumber = { kind: "details", preferences, note: "Call 555 1234" } as const;
    expect(checkTripChange(northTrip, [], withNumber, now, settings)).toEqual({
      ok: false,
      error: [{ code: "note_has_contact_details", kinds: ["phone"] }],
    });
    const tooLong = { kind: "details", preferences, note: "a".repeat(501) } as const;
    expect(problems(checkTripChange(northTrip, [], tooLong, now, settings))).toEqual([
      "note_too_long",
    ]);
  });
});

describe("any sequence of changes the rules allow", () => {
  const typical = fc.array(fc.integer({ min: 600, max: 4 * 3600 }), { minLength: 1, maxLength: 5 });
  // Departures from 30 minutes to 59 days from now, on whole 5 minutes.
  const startMinutes = fc.integer({ min: 6, max: 59 * 24 * 12 }).map((steps) => steps * 5);
  const aBooking = fc.record({
    status: fc.constantFrom("requested", "accepted", "confirmed"),
    // Made up to 2 hours either side of the present departure.
    offsetMinutes: fc.integer({ min: -24, max: 24 }).map((steps) => steps * 5),
    board: fc.nat(),
    length: fc.nat(),
    seats: fc.integer({ min: 1, max: 3 }),
  });
  /** A change, with a departure as minutes from the trip's present one. */
  type Drawn = Exclude<TripChange, { kind: "departure" }> | { kind: "move"; minutes: number };
  const aChange: fc.Arbitrary<Drawn> = fc.oneof(
    fc
      .integer({ min: -60, max: 60 })
      .map((steps) => ({ kind: "move", minutes: steps * 5 }) as const),
    fc.integer({ min: 0, max: 9 }).map((seats) => ({ kind: "seats", seats }) as const),
    fc
      .integer({ min: 0, max: 30 })
      .map((steps) => ({ kind: "priceLevel", priceLevel: steps * 10 }) as const),
    fc
      .constantFrom("car-yaris", "car-van", "car-someone-elses")
      .map((vehicleId) => ({ kind: "vehicle", vehicleId }) as const),
    fc
      .constantFrom("approval", "instant")
      .map((bookingMode) => ({ kind: "bookingMode", bookingMode }) as const),
  );

  /**
   * The change table (spec 6, 3.2) said again plainly, for trips whose
   * stretches always fit, in no season and with no other trips.
   */
  function allowedByTheTable(
    trip: ChangeableTrip,
    onTrip: readonly BookingOnTrip[],
    change: TripChange,
  ): boolean {
    switch (change.kind) {
      case "departure": {
        const to = change.departsAt.getTime();
        if (to === trip.stops[0]?.plannedAt.getTime()) return true;
        const fromNow = to - now.getTime();
        return (
          fromNow >= 30 * minuteMs &&
          fromNow <= 60 * 24 * 60 * minuteMs &&
          onTrip.every(
            (booking) => Math.abs(to - booking.departsAtWhenBooked.getTime()) <= 2 * 60 * minuteMs,
          )
        );
      }
      case "seats":
        return (
          Number.isInteger(change.seats) &&
          change.seats >= Math.max(1, ...trip.occupancy) &&
          change.seats <= 8
        );
      case "priceLevel":
        return (
          change.priceLevel % 10 === 0 &&
          change.priceLevel >= 0 &&
          change.priceLevel <= highestPriceLevel(trip.seats, settings)
        );
      case "vehicle":
        return change.vehicleId === trip.vehicleId || trip.cars.includes(change.vehicleId);
      case "bookingMode":
      case "details":
        return true;
    }
  }

  it("allows what the table allows, and keeps every rule after each change", () => {
    fc.assert(
      fc.property(
        typical,
        startMinutes,
        fc.array(aBooking, { maxLength: 6 }),
        fc.array(aChange, { maxLength: 12 }),
        (typicalS, start, drawnBookings, drawnChanges) => {
          const departsAt = later(now, start);
          const occupancy = typicalS.map(() => 0);
          const onTrip: BookingOnTrip[] = [];
          for (const [index, drawn] of drawnBookings.entries()) {
            const board = drawn.board % typicalS.length;
            const alight = board + 1 + (drawn.length % (typicalS.length - board));
            const part = occupancy.slice(board, alight);
            if (part.some((taken) => taken + drawn.seats > northTrip.seats)) continue;
            for (let segment = board; segment < alight; segment += 1) {
              occupancy[segment] = (occupancy[segment] ?? 0) + drawn.seats;
            }
            onTrip.push({
              id: `booking-${String(index)}`,
              status: drawn.status,
              departsAtWhenBooked: later(departsAt, drawn.offsetMinutes),
            });
          }
          let trip: ChangeableTrip = {
            ...northTrip,
            stops: plannedTimes(departsAt, typicalS, settings).map((plannedAt) => ({
              plannedAt,
              season: allYear,
            })),
            typicalS,
            // About 90 km/h.
            distancesM: typicalS.map((seconds) => seconds * 25),
            occupancy,
          };
          for (const drawn of drawnChanges) {
            const present = trip.stops[0]?.plannedAt ?? departsAt;
            const change: TripChange =
              drawn.kind === "move"
                ? { kind: "departure", departsAt: later(present, drawn.minutes) }
                : drawn;
            const result = checkTripChange(trip, onTrip, change, now, settings);
            expect(result.ok).toBe(allowedByTheTable(trip, onTrip, change));
            if (!result.ok) continue;
            const { told, pricing } = result.value;
            const before = trip;
            trip = result.value.trip;

            expect(trip.seats).toBeGreaterThanOrEqual(Math.max(...occupancy));
            expect(trip.seats).toBeLessThanOrEqual(settings.maxSeats);
            expect(isPriceLevel(trip.priceLevel, trip.seats, settings)).toBe(true);
            const times = trip.stops.map((stop) => stop.plannedAt);
            expect(checkTimes(times, typicalS, now, settings).problems).toEqual([]);
            const departure = times[0]?.getTime() ?? 0;
            for (const booking of onTrip) {
              const fromBookedMs = departure - booking.departsAtWhenBooked.getTime();
              expect(Math.abs(fromBookedMs)).toBeLessThanOrEqual(maxMoveMinutes * minuteMs);
            }

            const repriced = change.kind === "seats" || change.kind === "priceLevel";
            expect(pricing === null).toBe(!repriced);
            for (const segment of pricing ?? []) {
              expect(segment.price.amount).toBeLessThanOrEqual(segment.cap.amount);
            }

            const moved = departure !== before.stops[0]?.plannedAt.getTime();
            const newCar = trip.vehicleId !== before.vehicleId;
            const booked = onTrip.filter((booking) => booking.status !== "requested");
            expect(told.map((one) => one.bookingId)).toEqual(
              moved || newCar ? booked.map((booking) => booking.id) : [],
            );
            for (const one of told) {
              const booking = booked.find((candidate) => candidate.id === one.bookingId);
              const fromBookedMs = departure - (booking?.departsAtWhenBooked.getTime() ?? 0);
              expect(one.freeCancellation).toBe(
                booking?.status === "confirmed" && Math.abs(fromBookedMs) > 30 * minuteMs,
              );
            }
          }
        },
      ),
    );
  });
});

describe("the kinds of change recorded (spec 6, section 6)", () => {
  it("name every change the driver can make, each once", () => {
    const kinds = {
      departure: true,
      seats: true,
      priceLevel: true,
      vehicle: true,
      bookingMode: true,
      details: true,
    } satisfies Record<TripChange["kind"], true>;
    expect([...tripChangeKinds].sort()).toEqual(Object.keys(kinds).sort());
  });
});
