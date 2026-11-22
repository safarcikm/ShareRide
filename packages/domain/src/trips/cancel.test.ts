import { describe, expect, it } from "vitest";
import { tripCancellation, tripExcusedByReason, type BookingToCancelWithTrip } from "./cancel.ts";

const kr = (amount: number) => ({ amount, currency: "ISK" as const });
const departsAt = new Date("2026-11-20T08:00:00Z");
const before = (minutes: number) => new Date(departsAt.getTime() - minutes * 60_000);
const trip = { status: "published", departsAt } as const;

const inApp = { paymentMethod: "in_app" } as const;
const gunna: BookingToCancelWithTrip = {
  id: "gunna",
  status: "confirmed",
  total: kr(2900),
  ...inApp,
};
const jon: BookingToCancelWithTrip = { id: "jon", status: "accepted", total: kr(2900), ...inApp };
const sigga: BookingToCancelWithTrip = {
  id: "sigga",
  status: "requested",
  total: kr(1500),
  ...inApp,
};

describe("cancelling a trip (spec 6, 3.3; R6.6, R6.7)", () => {
  it("refunds every paid booking in full, cancels the unpaid ones and declines the requests", () => {
    expect(tripCancellation(trip, [gunna, jon, sigga], "car_problem", before(60))).toEqual({
      ok: true,
      value: {
        countsOnReliability: true,
        bookings: [
          { id: "gunna", outcome: "cancelled", refund: kr(2900) },
          { id: "jon", outcome: "cancelled", refund: kr(0) },
          { id: "sigga", outcome: "declined", refund: kr(0) },
        ],
      },
    });
  });

  it("refunds nothing for a booking paid to the driver in person (rule M6)", () => {
    const anna = { ...gunna, id: "anna", paymentMethod: "in_person" } as const;
    expect(tripCancellation(trip, [anna], "car_problem", before(60))).toEqual({
      ok: true,
      value: {
        countsOnReliability: true,
        bookings: [{ id: "anna", outcome: "cancelled", refund: kr(0) }],
      },
    });
  });

  it.each(["weather", "road_closed"] as const)("does not count for %s", (reason) => {
    expect(tripCancellation(trip, [gunna], reason, before(60))).toMatchObject({
      ok: true,
      value: { countsOnReliability: false },
    });
  });

  it("counts only with a passenger: requests and unpaid bookings are not one (spec 8, 3.8)", () => {
    expect(tripCancellation(trip, [jon, sigga], "illness", before(60))).toMatchObject({
      ok: true,
      value: { countsOnReliability: false },
    });
    expect(tripCancellation(trip, [], "plans_changed", before(60))).toEqual({
      ok: true,
      value: { countsOnReliability: false, bookings: [] },
    });
  });

  it("refuses a trip already cancelled, and one that has departed (R6.1)", () => {
    expect(
      tripCancellation({ ...trip, status: "cancelled" }, [gunna], "other", before(60)),
    ).toEqual({ ok: false, error: { code: "trip_cancelled" } });
    for (const status of ["departed", "completed"] as const) {
      expect(tripCancellation({ ...trip, status }, [gunna], "other", before(60))).toEqual({
        ok: false,
        error: { code: "trip_departed" },
      });
    }
    expect(tripCancellation(trip, [gunna], "other", departsAt)).toEqual({
      ok: false,
      error: { code: "trip_departed" },
    });
    expect(tripCancellation(trip, [gunna], "other", new Date(departsAt.getTime() - 1)).ok).toBe(
      true,
    );
  });
});

describe("a trip cancellation the operator can overrule (R8.11)", () => {
  it("is one with a passenger, for weather or a road closure", () => {
    expect(tripExcusedByReason([gunna, sigga], "weather")).toBe(true);
    expect(tripExcusedByReason([gunna], "road_closed")).toBe(true);
  });

  it("is not one without a passenger, which never counts, or for another reason", () => {
    expect(tripExcusedByReason([jon, sigga], "weather")).toBe(false);
    expect(tripExcusedByReason([gunna], "illness")).toBe(false);
  });
});
