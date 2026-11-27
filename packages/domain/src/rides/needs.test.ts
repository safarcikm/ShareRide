import { describe, expect, it } from "vitest";
import { bookingNeed, soonestFirst, tripNeed, type Need } from "./needs.ts";

// What needs me (spec 31, 3.3, item 3): a request to answer, a seat to pay
// for, a ride on its trip day. The soonest comes first.

const now = new Date("2026-11-27T12:00:00Z");
const minute = 60_000;
const inMinutes = (minutes: number) => new Date(now.getTime() + minutes * minute);
const boardsAt = inMinutes(90);

const booking = (changes: Partial<Parameters<typeof bookingNeed>[0]> = {}) => ({
  status: "confirmed" as const,
  paymentDueAt: null,
  phase: "upcoming" as const,
  boardsAt,
  ...changes,
});

const trip = (changes: Partial<Parameters<typeof tripNeed>[0]> = {}) => ({
  openRequests: 0,
  requestsCloseAt: null,
  phase: "upcoming" as const,
  departsAt: boardsAt,
  ...changes,
});

describe("what a booking of mine needs", () => {
  it("is paying, by the payment deadline, once the driver said yes", () => {
    const due = inMinutes(30);
    expect(
      bookingNeed(booking({ status: "accepted", paymentDueAt: due, phase: null }), now),
    ).toEqual({ kind: "pay", by: due });
  });

  it("is nothing once the payment deadline is here or behind", () => {
    for (const due of [now, inMinutes(-1)]) {
      expect(
        bookingNeed(booking({ status: "accepted", paymentDueAt: due, phase: null }), now),
      ).toBeNull();
    }
  });

  it("is nothing for an accepted booking without a deadline", () => {
    expect(bookingNeed(booking({ status: "accepted", phase: null }), now)).toBeNull();
  });

  it("is the trip day, by when I get in, while a confirmed seat is on its trip day", () => {
    expect(bookingNeed(booking({ phase: "trip_day" }), now)).toEqual({
      kind: "tripDay",
      by: boardsAt,
    });
  });

  it("is nothing before the trip day and after the ride is done", () => {
    expect(bookingNeed(booking({ phase: "upcoming" }), now)).toBeNull();
    expect(bookingNeed(booking({ phase: "completed" }), now)).toBeNull();
    expect(bookingNeed(booking({ phase: null }), now)).toBeNull();
  });

  it.each(["requested", "declined", "expired", "cancelled", "completed", "no_show"] as const)(
    "is nothing for a %s booking, whatever its day",
    (status) => {
      expect(
        bookingNeed(booking({ status, phase: "trip_day", paymentDueAt: inMinutes(30) }), now),
      ).toBeNull();
    },
  );
});

describe("what a ride I drive needs", () => {
  it("is an answer, by when the first request closes", () => {
    const closes = inMinutes(45);
    expect(tripNeed(trip({ openRequests: 2, requestsCloseAt: closes }), now)).toEqual({
      kind: "answer",
      by: closes,
    });
  });

  it("is nothing once the requests have closed, or with none", () => {
    expect(tripNeed(trip({ openRequests: 1, requestsCloseAt: now }), now)).toBeNull();
    expect(tripNeed(trip({ openRequests: 1, requestsCloseAt: inMinutes(-5) }), now)).toBeNull();
    expect(tripNeed(trip({ openRequests: 0, requestsCloseAt: inMinutes(45) }), now)).toBeNull();
    expect(tripNeed(trip({ openRequests: 1, requestsCloseAt: null }), now)).toBeNull();
  });

  it("is the trip day, by when I leave", () => {
    expect(tripNeed(trip({ phase: "trip_day" }), now)).toEqual({ kind: "tripDay", by: boardsAt });
  });

  it("is an answer first when a ride on its trip day has a request", () => {
    const closes = inMinutes(20);
    expect(
      tripNeed(trip({ phase: "trip_day", openRequests: 1, requestsCloseAt: closes }), now),
    ).toEqual({ kind: "answer", by: closes });
  });

  it("is the trip day again once that request has closed", () => {
    expect(
      tripNeed(trip({ phase: "trip_day", openRequests: 1, requestsCloseAt: inMinutes(-1) }), now),
    ).toEqual({ kind: "tripDay", by: boardsAt });
  });

  it("is nothing before the trip day, after the ride, and for a ride that does not run", () => {
    expect(tripNeed(trip({ phase: "upcoming" }), now)).toBeNull();
    expect(tripNeed(trip({ phase: "completed" }), now)).toBeNull();
    expect(tripNeed(trip({ phase: null }), now)).toBeNull();
  });
});

describe("soonestFirst", () => {
  const item = (name: string, need: Need) => ({ name, need });

  it("puts the soonest first, whatever the kinds", () => {
    const sorted = soonestFirst([
      item("leave", { kind: "tripDay", by: inMinutes(60) }),
      item("pay", { kind: "pay", by: inMinutes(10) }),
      item("answer", { kind: "answer", by: inMinutes(30) }),
    ]);
    expect(sorted.map(({ name }) => name)).toEqual(["pay", "answer", "leave"]);
  });

  it("keeps the order of needs at the same minute, and of the list it was given", () => {
    const list = [
      item("first", { kind: "answer", by: inMinutes(30) }),
      item("second", { kind: "pay", by: inMinutes(30) }),
      item("third", { kind: "tripDay", by: inMinutes(30) }),
    ];
    expect(soonestFirst(list).map(({ name }) => name)).toEqual(["first", "second", "third"]);
    expect(list.map(({ name }) => name)).toEqual(["first", "second", "third"]);
    expect(soonestFirst([])).toEqual([]);
  });

  it("puts a need whose time is behind before one still to come", () => {
    const sorted = soonestFirst([
      item("leaves soon", { kind: "tripDay", by: inMinutes(20) }),
      item("under way", { kind: "tripDay", by: inMinutes(-20) }),
    ]);
    expect(sorted.map(({ name }) => name)).toEqual(["under way", "leaves soon"]);
  });
});
