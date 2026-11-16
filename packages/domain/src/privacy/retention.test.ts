import { describe, expect, it } from "vitest";
import { isHeld, privacyCutoffs, retentionRules, validateHold, type Hold } from "./retention.ts";

describe("the retention rules this feature adds (spec 11, 3.7)", () => {
  const now = new Date("2029-11-16T03:17:00Z");
  const cutoffs = privacyCutoffs(now);

  it("deletes exports, blocked numbers and waiting accounts once their date passes", () => {
    expect(cutoffs.exportsExpiredBy).toEqual(now);
    expect(cutoffs.blockedNumbersUntil).toEqual(now);
    expect(cutoffs.deletionsDueBy).toEqual(now);
  });

  it("keeps the list of erased accounts 30 days", () => {
    expect(cutoffs.erasedAccountsBefore.toISOString()).toBe("2029-10-17T03:17:00.000Z");
  });

  it("anonymises trips and bookings 3 calendar years after the trip", () => {
    expect(cutoffs.tripsArrivedBy.toISOString()).toBe("2026-11-16T03:17:00.000Z");
  });

  it("deletes privacy requests 3 years after the answer and runs after 90 days", () => {
    expect(cutoffs.requestsAnsweredBy.toISOString()).toBe("2026-11-16T03:17:00.000Z");
    expect(cutoffs.retentionRunsBefore.toISOString()).toBe("2029-08-18T03:17:00.000Z");
  });

  it("names every rule once", () => {
    expect(new Set(retentionRules).size).toBe(retentionRules.length);
    expect(retentionRules).toContain("accounts");
    expect(retentionRules).toContain("conversations");
  });
});

describe("holds (3.7.3, R11.6)", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const hold = (over: Partial<Hold> = {}): Hold => ({
    subject: { kind: "booking", id: "b1" },
    endsAt: new Date("2026-12-01T00:00:00Z"),
    releasedAt: null,
    ...over,
  });

  it("keeps a record whose subject is held", () => {
    expect(isHeld([hold()], [{ kind: "booking", id: "b1" }], now)).toBe(true);
    expect(
      isHeld(
        [hold()],
        [
          { kind: "trip", id: "t1" },
          { kind: "booking", id: "b1" },
        ],
        now,
      ),
    ).toBe(true);
  });

  it("does not keep other records", () => {
    expect(isHeld([hold()], [{ kind: "booking", id: "b2" }], now)).toBe(false);
    expect(isHeld([hold()], [{ kind: "trip", id: "b1" }], now)).toBe(false);
    expect(isHeld([], [{ kind: "booking", id: "b1" }], now)).toBe(false);
  });

  it("lets go at its end or when ended early", () => {
    expect(isHeld([hold({ endsAt: now })], [{ kind: "booking", id: "b1" }], now)).toBe(false);
    expect(isHeld([hold({ releasedAt: now })], [{ kind: "booking", id: "b1" }], now)).toBe(false);
  });

  it("needs a reason and an end date in the future", () => {
    expect(validateHold({ reason: "  Chargeback  ", endsAt: new Date("2027-01-01") }, now)).toEqual(
      { ok: true, value: { reason: "Chargeback", endsAt: new Date("2027-01-01") } },
    );
    expect(validateHold({ reason: "   ", endsAt: new Date("2027-01-01") }, now)).toEqual({
      ok: false,
      error: { code: "hold_reason_required" },
    });
    expect(validateHold({ reason: "Claim", endsAt: now }, now)).toEqual({
      ok: false,
      error: { code: "hold_end_not_future" },
    });
  });
});
