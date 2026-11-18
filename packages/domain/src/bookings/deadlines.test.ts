import { describe, expect, it } from "vitest";
import {
  latestPaymentDeadline,
  paymentDeadline,
  paymentDeadlineAfterPause,
  requestDeadline,
  statusAt,
} from "./deadlines.ts";
import { defaultBookingSettings } from "./settings.ts";

const settings = defaultBookingSettings;
const boardsAt = new Date("2026-11-15T10:00:00Z");
const before = (minutes: number) => new Date(boardsAt.getTime() - minutes * 60_000);
const iso = (moment: Date) => moment.toISOString();

describe("a request's deadline (R5.5)", () => {
  it("is 12 hours after the request when boarding is far off", () => {
    expect(iso(requestDeadline(before(3 * 24 * 60), boardsAt, settings))).toBe(
      "2026-11-12T22:00:00.000Z",
    );
  });

  it("is 2 hours before boarding when that comes first", () => {
    expect(iso(requestDeadline(before(10 * 60), boardsAt, settings))).toBe(
      "2026-11-15T08:00:00.000Z",
    );
  });

  it("is still 2 hours before boarding for a request 2 h 31 min and exactly 2 h 30 min before", () => {
    expect(iso(requestDeadline(before(151), boardsAt, settings))).toBe("2026-11-15T08:00:00.000Z");
    expect(iso(requestDeadline(before(150), boardsAt, settings))).toBe("2026-11-15T08:00:00.000Z");
  });

  it("is the booking cut-off for a request made less than 2 h 30 min before boarding", () => {
    expect(iso(requestDeadline(before(149), boardsAt, settings))).toBe("2026-11-15T09:45:00.000Z");
    expect(iso(requestDeadline(before(20), boardsAt, settings))).toBe("2026-11-15T09:45:00.000Z");
  });
});

describe("the payment deadline (rule M1)", () => {
  it("is 30 minutes after acceptance", () => {
    expect(iso(paymentDeadline(before(5 * 60), boardsAt, settings))).toBe(
      "2026-11-15T05:30:00.000Z",
    );
  });

  it("is never later than the booking cut-off", () => {
    expect(iso(paymentDeadline(before(40), boardsAt, settings))).toBe("2026-11-15T09:45:00.000Z");
    expect(iso(paymentDeadline(before(45), boardsAt, settings))).toBe("2026-11-15T09:45:00.000Z");
    expect(iso(paymentDeadline(before(46), boardsAt, settings))).toBe("2026-11-15T09:44:00.000Z");
  });
});

describe("the payment deadline across a pause (spec 10, 3.3)", () => {
  // Accepted 5 hours before boarding: to pay by 4 h 30 min before.
  const acceptedAt = before(5 * 60);

  it("waits until the cut-off at the latest while paying is paused", () => {
    expect(iso(latestPaymentDeadline(boardsAt, settings))).toBe("2026-11-15T09:45:00.000Z");
  });

  it("is the payment window after the pause's end when it came inside the pause", () => {
    expect(iso(paymentDeadlineAfterPause(acceptedAt, boardsAt, before(3 * 60), settings))).toBe(
      "2026-11-15T07:30:00.000Z",
    );
  });

  it("is the window after the pause's end when it came at that very moment", () => {
    expect(iso(paymentDeadlineAfterPause(acceptedAt, boardsAt, before(270), settings))).toBe(
      "2026-11-15T06:00:00.000Z",
    );
  });

  it("stays when it is still ahead as the pause ends", () => {
    expect(iso(paymentDeadlineAfterPause(acceptedAt, boardsAt, before(271), settings))).toBe(
      "2026-11-15T05:30:00.000Z",
    );
  });

  it("is never later than the booking cut-off", () => {
    expect(iso(paymentDeadlineAfterPause(acceptedAt, boardsAt, before(20), settings))).toBe(
      "2026-11-15T09:45:00.000Z",
    );
  });
});

describe("a booking's status once a deadline passes", () => {
  const deadline = new Date("2026-11-15T08:00:00Z");
  const justBefore = new Date(deadline.getTime() - 1);

  it("is expired from the moment a request's or a payment's deadline comes", () => {
    const request = {
      status: "requested",
      requestExpiresAt: deadline,
      paymentDueAt: null,
    } as const;
    expect(statusAt(request, justBefore)).toBe("requested");
    expect(statusAt(request, deadline)).toBe("expired");
    const unpaid = { status: "accepted", requestExpiresAt: null, paymentDueAt: deadline } as const;
    expect(statusAt(unpaid, justBefore)).toBe("accepted");
    expect(statusAt(unpaid, deadline)).toBe("expired");
  });

  it("stays as it is for every other status", () => {
    const paid = {
      status: "confirmed",
      requestExpiresAt: deadline,
      paymentDueAt: deadline,
    } as const;
    expect(statusAt(paid, new Date("2026-11-16T00:00:00Z"))).toBe("confirmed");
  });
});
