import { northBooking, northMyTrip, unpaidBooking } from "@/testing/bookings";
import { onTheDay } from "@/testing/trip-day";
import { plannedDraft } from "@/testing/trips";
import { mergeRides, needing, needOf, seatsTaken } from "./rides";

const at = (time: string) => new Date(`2026-11-15T${time}:00.000Z`);

/** A published trip of three stretches, leaving and arriving at these times. */
function trip(departs: string, arrives: string, seatsTaken: number[] = [0, 0, 0]) {
  return {
    ...northMyTrip,
    departsAt: at(departs).toISOString(),
    arrivesAt: at(arrives).toISOString(),
    openRequests: 0,
    requestsCloseAt: null,
    firstRequest: null,
    segments: seatsTaken.map((taken) => ({
      distanceM: 100_000,
      durationS: 3600,
      suggestedPrice: { amount: 1500, currency: "ISK" as const },
      cap: { amount: 3000, currency: "ISK" as const },
      price: { amount: 1500, currency: "ISK" as const },
      seatsTaken: taken,
    })),
  };
}

/** A booking boarding and alighting at these times. */
function booking(id: string, boards: string, alights: string) {
  const base = northBooking();
  return northBooking({
    id,
    board: { ...base.board, plannedAt: at(boards).toISOString() },
    alight: { ...base.alight, plannedAt: at(alights).toISOString() },
  });
}

describe("mergeRides (spec 16, 3.3)", () => {
  it("orders a booking at 09:00 before a trip at 10:00, whatever the time now", () => {
    const early = booking("0190a1d6-0000-7000-8000-0000000000c1", "09:00", "11:00");
    const later = trip("10:00", "13:00");
    const rides = mergeRides([early], [later], "upcoming");
    expect(rides.map((ride) => ride.kind)).toEqual(["booking", "trip"]);
    expect(rides[0]).toMatchObject({ booking: early, startsAt: at("09:00"), endsAt: at("11:00") });
    expect(rides[1]).toMatchObject({ trip: later, startsAt: at("10:00"), endsAt: at("13:00") });
  });

  it("leaves drafts out: they are not rides yet", () => {
    expect(mergeRides([], [plannedDraft()], "upcoming")).toEqual([]);
  });

  it("puts the latest first for past rides", () => {
    const first = trip("08:00", "09:00");
    const second = booking("0190a1d6-0000-7000-8000-0000000000c2", "12:00", "13:00");
    const rides = mergeRides([second], [first], "past");
    expect(rides.map((ride) => ride.kind)).toEqual(["booking", "trip"]);
  });
});

describe("needOf (spec 31, 3.3 item 3)", () => {
  const noon = new Date("2026-11-14T12:00:00.000Z");
  const [ride] = mergeRides([unpaidBooking], [], "upcoming");

  it("asks to pay while the payment deadline is still to come", () => {
    expect(ride && needOf(ride, noon)).toEqual({
      kind: "pay",
      by: new Date("2026-11-14T12:30:00.000Z"),
    });
    expect(ride && needOf(ride, new Date("2026-11-14T12:30:00.000Z"))).toBeNull();
  });

  it("asks nothing of a request or a confirmed booking before its trip day", () => {
    const rides = mergeRides(
      [
        northBooking(),
        northBooking({ id: "0190a1d6-0000-7000-8000-0000000000c3", status: "confirmed" }),
        onTheDay({ phase: "upcoming" }),
        onTheDay({ phase: "completed" }),
      ],
      [],
      "upcoming",
    );
    expect(rides.map((each) => needOf(each, noon))).toEqual([null, null, null, null]);
  });

  it("asks to answer requests until they close", () => {
    const waiting = {
      ...trip("10:00", "13:00"),
      openRequests: 2,
      requestsCloseAt: "2026-11-14T22:00:00.000Z",
    };
    const [driving] = mergeRides([], [waiting], "upcoming");
    expect(driving && needOf(driving, noon)).toEqual({
      kind: "answer",
      by: new Date("2026-11-14T22:00:00.000Z"),
    });
    expect(driving && needOf(driving, new Date("2026-11-14T22:00:00.000Z"))).toBeNull();
    const [answered] = mergeRides([], [trip("10:00", "13:00")], "upcoming");
    expect(answered && needOf(answered, noon)).toBeNull();
  });

  it("raises a booked seat on its trip day, by when I get in", () => {
    const booking = onTheDay({ phase: "trip_day" });
    const [mine] = mergeRides([booking], [], "upcoming");
    expect(mine && needOf(mine, noon)).toEqual({
      kind: "tripDay",
      by: new Date(booking.board.plannedAt),
    });
  });

  it("raises a ride I drive on its trip day, by when it leaves", () => {
    const [driving] = mergeRides(
      [],
      [{ ...trip("10:00", "13:00"), phase: "trip_day" as const }],
      "upcoming",
    );
    expect(driving && needOf(driving, noon)).toEqual({ kind: "tripDay", by: at("10:00") });
  });
});

describe("needing (spec 31, 3.3 item 3)", () => {
  const noon = new Date("2026-11-14T12:00:00.000Z");

  it("lists the rides that need me, the soonest need first, whenever the rides start", () => {
    // Leaves first, and its requests close at 22:00.
    const asked = {
      ...trip("08:00", "13:00"),
      openRequests: 1,
      requestsCloseAt: "2026-11-14T22:00:00.000Z",
    };
    // Leaves later, to pay by 12:30.
    const unpaid = northBooking({
      ...unpaidBooking,
      board: { ...unpaidBooking.board, plannedAt: at("10:00").toISOString() },
      alight: { ...unpaidBooking.alight, plannedAt: at("12:05").toISOString() },
    });
    const rides = mergeRides([unpaid, northBooking()], [asked, trip("07:00", "09:00")], "upcoming");
    expect(rides.map((ride) => ride.kind)).toEqual(["trip", "trip", "booking", "booking"]);
    const needs = needing(rides, noon);
    expect(needs.map(({ ride, need }) => [ride.kind, need.kind])).toEqual([
      ["booking", "pay"],
      ["trip", "answer"],
    ]);
    expect(needs[0]?.need.by).toEqual(new Date("2026-11-14T12:30:00.000Z"));
  });

  it("is empty when nothing needs me", () => {
    expect(
      needing(mergeRides([northBooking()], [trip("07:00", "09:00")], "upcoming"), noon),
    ).toEqual([]);
  });
});

describe("seats on a trip (spec 31, 3.5 item 4; rule S1)", () => {
  it("counts the seats taken on the fullest stretch", () => {
    const booked = trip("10:00", "13:00", [0, 2, 1]);
    expect(seatsTaken(booked)).toBe(2);
    expect(seatsTaken(trip("10:00", "13:00"))).toBe(0);
  });
});
