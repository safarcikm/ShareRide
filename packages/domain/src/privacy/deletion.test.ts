import { describe, expect, it } from "vitest";
import { deleteAfter, deletionCheck, type DeletionInputs } from "./deletion.ts";

const none: DeletionInputs = { trips: [], bookings: [], openDisputes: [], heldPayouts: [] };
const now = new Date("2026-11-16T12:00:00Z");
const at = (iso: string) => new Date(iso);

/** A trip of the person's from 14:00 to 16:00 today. */
const trip = (over: Partial<DeletionInputs["trips"][number]> = {}) => ({
  id: "t1",
  status: "published" as const,
  departsAt: at("2026-11-16T14:00:00Z"),
  arrivesAt: at("2026-11-16T16:00:00Z"),
  seatHoldingBookings: 1,
  ...over,
});

/** A booking of the person's, boarding at 14:30 on a trip arriving at 16:00. */
const booking = (over: Partial<DeletionInputs["bookings"][number]> = {}) => ({
  id: "b1",
  tripId: "t9",
  status: "confirmed" as const,
  boardsAt: at("2026-11-16T14:30:00Z"),
  tripArrivesAt: at("2026-11-16T16:00:00Z"),
  ...over,
});

describe("what is open before deleting an account (spec 11, 3.4; R11.3)", () => {
  it("allows deletion when nothing is open", () => {
    expect(deletionCheck(none, now)).toEqual({ mustSettle: [], canCancel: [], allowed: true });
  });

  it("lists an upcoming trip with bookings or requests to cancel", () => {
    const check = deletionCheck(
      {
        ...none,
        trips: [
          trip({ id: "t1", seatHoldingBookings: 2 }),
          trip({ id: "t2", seatHoldingBookings: 0 }),
          trip({ id: "t3", status: "completed" }),
          trip({ id: "t4", status: "cancelled" }),
          trip({ id: "t5", status: "draft" }),
        ],
      },
      now,
    );
    expect(check.canCancel).toEqual([{ kind: "trip", id: "t1" }]);
    expect(check.allowed).toBe(false);
  });

  it("lists upcoming bookings and requests to cancel or withdraw", () => {
    const check = deletionCheck(
      {
        ...none,
        bookings: [
          booking({ id: "b1", status: "requested" }),
          booking({ id: "b2", status: "accepted" }),
          booking({ id: "b3", status: "confirmed" }),
          booking({ id: "b4", status: "cancelled" }),
          booking({ id: "b5", status: "completed" }),
          booking({ id: "b6", status: "declined" }),
        ],
      },
      now,
    );
    expect(check.canCancel).toEqual([
      { kind: "request", id: "b1" },
      { kind: "booking", id: "b2" },
      { kind: "booking", id: "b3" },
    ]);
    expect(check.mustSettle).toEqual([]);
  });

  it("asks to wait for a trip under way, which nobody can cancel", () => {
    const onTheWay = at("2026-11-16T15:00:00Z");
    const check = deletionCheck(
      { ...none, trips: [trip({ id: "t1" })], bookings: [booking({ tripId: "t2" })] },
      onTheWay,
    );
    expect(check.mustSettle).toEqual([
      { kind: "trip_under_way", id: "t1" },
      { kind: "trip_under_way", id: "t2" },
    ]);
    expect(check.canCancel).toEqual([]);
    expect(check.allowed).toBe(false);
  });

  it("counts a trip as under way whatever its status says, until 2 hours after its last stop", () => {
    const departed = trip({ status: "departed" });
    expect(
      deletionCheck({ ...none, trips: [departed] }, at("2026-11-16T17:59:00Z")).mustSettle,
    ).toEqual([{ kind: "trip_under_way", id: "t1" }]);
    expect(deletionCheck({ ...none, trips: [trip()] }, at("2026-11-16T18:00:00Z")).allowed).toBe(
      true,
    );
    expect(
      deletionCheck({ ...none, bookings: [booking()] }, at("2026-11-16T18:00:00Z")).allowed,
    ).toBe(true);
  });

  it("does not hold up deletion for a request or unpaid booking whose boarding has passed", () => {
    const later = at("2026-11-16T14:30:00Z");
    const check = deletionCheck(
      {
        ...none,
        bookings: [
          booking({ id: "b1", status: "requested" }),
          booking({ id: "b2", status: "accepted" }),
        ],
      },
      later,
    );
    expect(check).toEqual({ mustSettle: [], canCancel: [], allowed: true });
  });

  it("must settle open disputes and held payouts first", () => {
    const check = deletionCheck({ ...none, openDisputes: ["d1"], heldPayouts: ["p1"] }, now);
    expect(check.mustSettle).toEqual([
      { kind: "dispute", id: "d1" },
      { kind: "held_payout", id: "p1" },
    ]);
    expect(check.allowed).toBe(false);
  });
});

describe("the waiting period (R11.8)", () => {
  it("erases 7 days after deletion is asked for", () => {
    expect(deleteAfter(new Date("2026-11-16T21:40:00Z")).toISOString()).toBe(
      "2026-11-23T21:40:00.000Z",
    );
  });
});
