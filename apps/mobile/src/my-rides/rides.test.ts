import { northBooking, northMyTrip, unpaidBooking } from "@/testing/bookings";
import { plannedDraft } from "@/testing/trips";
import { mergeRides, needsYou, seatsFree, seatsTaken } from "./rides";

const at = (time: string) => new Date(`2026-11-15T${time}:00.000Z`);

/** A published trip of three stretches, leaving and arriving at these times. */
function trip(departs: string, arrives: string, seatsTaken: number[] = [0, 0, 0]) {
  return {
    ...northMyTrip,
    departsAt: at(departs).toISOString(),
    arrivesAt: at(arrives).toISOString(),
    openRequests: 0,
    requestsCloseAt: null,
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

describe("needsYou (spec 16, 3.3 item 2)", () => {
  const noon = new Date("2026-11-14T12:00:00.000Z");
  const [ride] = mergeRides([unpaidBooking], [], "upcoming");

  it("asks to pay while the payment deadline is still to come", () => {
    expect(ride && needsYou(ride, noon)).toBe("pay");
    expect(ride && needsYou(ride, new Date("2026-11-14T12:30:00.000Z"))).toBeNull();
  });

  it("asks nothing of a request or a confirmed booking", () => {
    const rides = mergeRides(
      [
        northBooking(),
        northBooking({ id: "0190a1d6-0000-7000-8000-0000000000c3", status: "confirmed" }),
      ],
      [],
      "upcoming",
    );
    expect(rides.map((each) => needsYou(each, noon))).toEqual([null, null]);
  });

  it("asks to answer requests until they close", () => {
    const waiting = {
      ...trip("10:00", "13:00"),
      openRequests: 2,
      requestsCloseAt: "2026-11-14T22:00:00.000Z",
    };
    const [driving] = mergeRides([], [waiting], "upcoming");
    expect(driving && needsYou(driving, noon)).toBe("answer");
    expect(driving && needsYou(driving, new Date("2026-11-14T22:00:00.000Z"))).toBeNull();
    const [answered] = mergeRides([], [trip("10:00", "13:00")], "upcoming");
    expect(answered && needsYou(answered, noon)).toBeNull();
  });
});

describe("seats on a trip (spec 16, 3.3 item 3; rules S1 and S3)", () => {
  it("counts the seats taken on the fullest stretch, and the seats free on each", () => {
    const booked = trip("10:00", "13:00", [0, 2, 1]);
    expect(seatsTaken(booked)).toBe(2);
    expect(seatsFree(booked)).toEqual([3, 1, 2]);
    expect(seatsTaken(trip("10:00", "13:00"))).toBe(0);
  });
});
