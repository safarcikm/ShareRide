import { describe, expect, it } from "vitest";
import {
  appealDueAt,
  checkAppeal,
  checkStatement,
  isAppealable,
  moderationActionKinds,
  operatorTripCancellation,
} from "./moderation.ts";
import { defaultSafetySettings } from "./settings.ts";

const settings = defaultSafetySettings;
const kr = (amount: number) => ({ amount, currency: "ISK" as const });
const actedAt = new Date("2026-11-20T12:00:00Z");
const days = (n: number) => n * 86_400_000;

describe("the statement of reasons (3.4.4, R9.5)", () => {
  it("needs a rule and a reason the person can read", () => {
    expect(checkStatement({ rule: "harassment", reason: " Repeated messages. " })).toEqual({
      ok: true,
      value: { rule: "harassment", reason: "Repeated messages." },
    });
    expect(checkStatement({ rule: "harassment", reason: "" })).toEqual({
      ok: false,
      error: { code: "reason_missing" },
    });
    expect(checkStatement({ rule: "harassment", reason: "x".repeat(1001) })).toEqual({
      ok: false,
      error: { code: "too_long" },
    });
  });
});

describe("appeals (3.4.4, R9.5)", () => {
  const action = { kind: "suspension", at: actedAt, appealedAt: null } as const;

  it("can be made against every action except a reinstatement", () => {
    expect(moderationActionKinds.filter(isAppealable)).toEqual([
      "warning",
      "content_hidden",
      "suspension",
      "trip_cancelled",
      "refund",
    ]);
  });

  it("is open for 14 days", () => {
    expect(appealDueAt(actedAt, settings)).toEqual(new Date(actedAt.getTime() + days(14)));
    const lastMoment = new Date(actedAt.getTime() + days(14));
    expect(checkAppeal(action, "I was not driving.", lastMoment, settings)).toEqual({
      ok: true,
      value: "I was not driving.",
    });
    expect(
      checkAppeal(action, "I was not driving.", new Date(lastMoment.getTime() + 1000), settings),
    ).toEqual({ ok: false, error: { code: "window_closed" } });
  });

  it("is made once, with something to say", () => {
    expect(checkAppeal({ ...action, appealedAt: actedAt }, "Again.", actedAt, settings)).toEqual({
      ok: false,
      error: { code: "already_appealed" },
    });
    expect(checkAppeal(action, " ", actedAt, settings)).toEqual({
      ok: false,
      error: { code: "empty" },
    });
    expect(checkAppeal(action, "a".repeat(1001), actedAt, settings)).toEqual({
      ok: false,
      error: { code: "too_long" },
    });
    expect(checkAppeal({ ...action, kind: "reinstatement" }, "Why?", actedAt, settings)).toEqual({
      ok: false,
      error: { code: "not_appealable" },
    });
  });
});

describe("the operator cancels a trip (3.4.3)", () => {
  const trip = { status: "published", departsAt: new Date("2026-11-21T08:00:00Z") } as const;
  const bookings = [
    { id: "gunna", status: "confirmed", total: kr(2900) },
    { id: "sigga", status: "requested", total: kr(1500) },
  ] as const;

  it("refunds in full and does not count on the driver unless the operator says so", () => {
    expect(operatorTripCancellation(trip, bookings, false, actedAt)).toEqual({
      ok: true,
      value: {
        countsOnReliability: false,
        bookings: [
          { id: "gunna", outcome: "cancelled", refund: kr(2900) },
          { id: "sigga", outcome: "declined", refund: kr(0) },
        ],
      },
    });
    expect(operatorTripCancellation(trip, bookings, true, actedAt)).toMatchObject({
      ok: true,
      value: { countsOnReliability: true },
    });
  });

  it("counts only with a passenger, like any trip cancellation", () => {
    expect(operatorTripCancellation(trip, [bookings[1]], true, actedAt)).toMatchObject({
      ok: true,
      value: { countsOnReliability: false },
    });
  });

  it("refuses a trip that has departed", () => {
    expect(
      operatorTripCancellation({ ...trip, status: "departed" }, bookings, false, actedAt),
    ).toEqual({
      ok: false,
      error: { code: "trip_departed" },
    });
  });
});
