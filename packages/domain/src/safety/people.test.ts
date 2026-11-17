import { describe, expect, it } from "vitest";
import { checkOperatorNote, declineRates, requestAnswer, type RequestRow } from "./people.ts";
import { defaultSafetySettings } from "./settings.ts";

const now = new Date("2026-11-20T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("an operator's note about a person (spec 9, 3.5.3)", () => {
  it("is trimmed, not empty, and at most 1 000 characters", () => {
    expect(checkOperatorNote(" Called about the luggage. ")).toEqual({
      ok: true,
      value: "Called about the luggage.",
    });
    expect(checkOperatorNote("  ")).toEqual({ ok: false, error: { code: "note_missing" } });
    expect(checkOperatorNote("é".repeat(1000))).toEqual({ ok: true, value: "é".repeat(1000) });
    expect(checkOperatorNote("x".repeat(1001))).toEqual({ ok: false, error: { code: "too_long" } });
  });
});

describe("how a driver answered a request (spec 9, 3.4.5; spec 5)", () => {
  const request = {
    requestedAt: daysAgo(3),
    decidedAt: daysAgo(2),
    cancelledAt: null,
  } as const;

  it("is accepted once the driver took it, whatever happened after", () => {
    for (const status of ["accepted", "confirmed", "completed", "no_show", "cancelled"] as const) {
      expect(requestAnswer({ ...request, status }), status).toBe("accepted");
    }
    expect(requestAnswer({ ...request, status: "cancelled", cancelledAt: daysAgo(1) })).toBe(
      "accepted",
    );
  });

  it("is declined only when the driver turned the person down", () => {
    expect(requestAnswer({ ...request, status: "declined" })).toBe("declined");
    // A request is declined with the trip when the driver or ShareRide cancels it.
    expect(requestAnswer({ ...request, status: "declined", cancelledAt: daysAgo(2) })).toBeNull();
  });

  it("is no answer when it was instant, waited, expired or was withdrawn", () => {
    expect(requestAnswer({ ...request, status: "confirmed", requestedAt: null })).toBeNull();
    expect(requestAnswer({ ...request, status: "requested", decidedAt: null })).toBeNull();
    expect(requestAnswer({ ...request, status: "expired", decidedAt: null })).toBeNull();
    expect(
      requestAnswer({ ...request, status: "cancelled", decidedAt: null, cancelledAt: daysAgo(2) }),
    ).toBeNull();
  });
});

describe("each driver's decline rate (spec 9, 3.4.5)", () => {
  const row = (driverId: string, overrides: Partial<RequestRow> = {}): RequestRow => ({
    driverId,
    status: "confirmed",
    requestedAt: daysAgo(10),
    decidedAt: daysAgo(10),
    cancelledAt: null,
    declineReason: null,
    ...overrides,
  });

  it("counts the requests each driver answered in the last 90 days, and why they declined", () => {
    const rates = declineRates(
      [
        row("jon"),
        row("jon", { status: "declined", declineReason: "luggage" }),
        row("jon", { status: "declined" }),
        row("jon", { status: "declined", declineReason: "luggage" }),
        row("jon", { status: "expired", decidedAt: null }),
        row("jon", { status: "declined", requestedAt: daysAgo(91), decidedAt: daysAgo(91) }),
        row("anna"),
        row("sigga", { status: "declined", cancelledAt: daysAgo(10) }),
      ],
      now,
      defaultSafetySettings,
    );

    expect(rates).toEqual([
      {
        driverId: "jon",
        answered: 4,
        declined: 3,
        reasons: { plans_changed: 0, luggage: 2, other: 0, none: 1 },
      },
      {
        driverId: "anna",
        answered: 1,
        declined: 0,
        reasons: { plans_changed: 0, luggage: 0, other: 0, none: 0 },
      },
    ]);
  });

  it("puts the highest share of declines first, then the most answered", () => {
    const rates = declineRates(
      [
        row("a", { status: "declined" }),
        row("a"),
        row("b", { status: "declined" }),
        row("b", { status: "declined" }),
        row("b"),
        row("b"),
        row("c", { status: "declined" }),
      ],
      now,
      defaultSafetySettings,
    );

    expect(rates.map((rate) => rate.driverId)).toEqual(["c", "b", "a"]);
  });

  it("keeps one order for equal rates: by ID", () => {
    const rates = declineRates([row("zed"), row("ana")], now, defaultSafetySettings);

    expect(rates.map((rate) => rate.driverId)).toEqual(["ana", "zed"]);
  });

  it("counts a request made exactly 90 days ago, not one a moment earlier", () => {
    const edge = new Date(now.getTime() - 90 * 86_400_000);
    const rates = declineRates(
      [
        row("jon", { requestedAt: edge }),
        row("jon", { requestedAt: new Date(edge.getTime() - 1) }),
      ],
      now,
      defaultSafetySettings,
    );

    expect(rates.map((rate) => rate.answered)).toEqual([1]);
  });
});
