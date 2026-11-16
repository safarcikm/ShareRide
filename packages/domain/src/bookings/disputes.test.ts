import { describe, expect, it } from "vitest";
import { defaultTripDaySettings as settings } from "../trips/day.ts";
import {
  answerDeadline,
  checkAnswer,
  checkDecision,
  disputeEffect,
  outcomeOfAnswer,
  reportCountsOn,
  settlesUnanswered,
  type Dispute,
} from "./disputes.ts";
import { nextStatus } from "./lifecycle.ts";

const hour = 3_600_000;
const raisedAt = new Date("2026-11-20T08:55:00Z");
const completedAt = new Date("2026-11-20T11:30:00Z");
const after = (base: Date, hours: number) => new Date(base.getTime() + hours * hour);

const noShow: Dispute = { kind: "no_show", raisedAt, answer: null, outcome: null };
const absent: Dispute = { kind: "driver_absent", raisedAt, answer: null, outcome: null };

describe("the time to answer a report (R8.6)", () => {
  it("lets the passenger answer a no-show until 24 hours after the trip completes (3.3)", () => {
    expect(answerDeadline(noShow, completedAt, settings)).toEqual(after(completedAt, 24));
  });

  it("gives the driver 24 hours from the report to answer (3.4)", () => {
    expect(answerDeadline(absent, completedAt, settings)).toEqual(after(raisedAt, 24));
  });

  it("takes an answer until the deadline, and not after it", () => {
    expect(checkAnswer(absent, completedAt, after(raisedAt, 24), settings)).toEqual({
      ok: true,
      value: null,
    });
    expect(checkAnswer(absent, completedAt, after(raisedAt, 24.01), settings)).toEqual({
      ok: false,
      error: { code: "answer_window_closed" },
    });
  });

  it("takes one answer only", () => {
    expect(
      checkAnswer({ ...noShow, answer: "contested" }, completedAt, raisedAt, settings),
    ).toEqual({ ok: false, error: { code: "already_answered" } });
  });

  it("takes no answer once the report is decided without one", () => {
    expect(checkAnswer({ ...noShow, outcome: "stands" }, completedAt, raisedAt, settings)).toEqual({
      ok: false,
      error: { code: "already_decided" },
    });
  });

  it("lets an agreed report stand, and leaves a contested one to the operator", () => {
    expect(outcomeOfAnswer("agreed")).toBe("stands");
    expect(outcomeOfAnswer("contested")).toBeNull();
  });

  it("lets an unanswered report stand once its deadline has passed, not at it", () => {
    const deadline = after(completedAt, 24);
    expect(settlesUnanswered(noShow, completedAt, deadline, settings)).toBe(false);
    expect(checkAnswer(noShow, completedAt, deadline, settings).ok).toBe(true);
    const justAfter = new Date(deadline.getTime() + 1);
    expect(settlesUnanswered(noShow, completedAt, justAfter, settings)).toBe(true);
    expect(checkAnswer(noShow, completedAt, justAfter, settings).ok).toBe(false);
    const answered = { ...noShow, answer: "contested" } as const;
    expect(settlesUnanswered(answered, completedAt, after(completedAt, 48), settings)).toBe(false);
  });
});

describe("the operator's decision (3.5, decision 4)", () => {
  const contested = (dispute: Dispute): Dispute => ({ ...dispute, answer: "contested" });

  it("decides a contested no-show as standing, ridden or left behind", () => {
    for (const outcome of ["stands", "rode", "left_behind"] as const) {
      expect(checkDecision(contested(noShow), outcome)).toEqual({ ok: true, value: null });
    }
    expect(checkDecision(contested(noShow), "passenger_absent")).toEqual({
      ok: false,
      error: { code: "outcome_invalid" },
    });
  });

  it("decides a contested driver absence as standing, ridden or the passenger's absence (Q20)", () => {
    for (const outcome of ["stands", "rode", "passenger_absent"] as const) {
      expect(checkDecision(contested(absent), outcome)).toEqual({ ok: true, value: null });
    }
    expect(checkDecision(contested(absent), "left_behind")).toEqual({
      ok: false,
      error: { code: "outcome_invalid" },
    });
  });

  it("decides only what was contested and is still open", () => {
    expect(checkDecision(noShow, "stands")).toEqual({
      ok: false,
      error: { code: "not_contested" },
    });
    expect(checkDecision({ ...contested(noShow), outcome: "rode" }, "stands")).toEqual({
      ok: false,
      error: { code: "already_decided" },
    });
  });
});

describe("what each outcome does (R8.7)", () => {
  const confirmed = { status: "confirmed", tripCompleted: false } as const;
  const noShowBooking = { status: "no_show", tripCompleted: true } as const;
  const driverCancelled = {
    by: "driver",
    reason: "driver_absent",
    countsOnReliability: true,
  } as const;

  it("a no-show that stands: no refund, the driver is paid, and it counts on the passenger", () => {
    expect(disputeEffect("no_show", "stands", noShowBooking)).toEqual({
      bookingEvent: null,
      cancellation: null,
      refund: "none",
      payout: "pay",
      countsOn: "passenger",
      removesReviews: false,
    });
  });

  it("they rode: the booking completes, the driver is paid, and nothing counts", () => {
    expect(disputeEffect("no_show", "rode", noShowBooking)).toEqual({
      bookingEvent: "rode",
      cancellation: null,
      refund: "none",
      payout: "pay",
      countsOn: null,
      removesReviews: false,
    });
  });

  it("they were left behind: as a driver absence, cancelled by the driver with a full refund that counts on them", () => {
    expect(disputeEffect("no_show", "left_behind", noShowBooking)).toEqual({
      bookingEvent: "left_behind",
      cancellation: driverCancelled,
      refund: "full",
      payout: "withhold",
      countsOn: "driver",
      removesReviews: false,
    });
  });

  it("a driver absence that stands: cancelled as if by the driver, a full refund, counted on them, reviews removed", () => {
    for (const status of ["confirmed", "completed"] as const) {
      expect(disputeEffect("driver_absent", "stands", { status, tripCompleted: true })).toEqual({
        bookingEvent: "driver_absent",
        cancellation: driverCancelled,
        refund: "full",
        payout: "withhold",
        countsOn: "driver",
        removesReviews: true,
      });
    }
  });

  it("a driver absence found wrong, the passenger rode: the booking goes on, the driver is paid, and nothing counts", () => {
    expect(disputeEffect("driver_absent", "rode", confirmed)).toEqual({
      bookingEvent: null,
      cancellation: null,
      refund: "none",
      payout: "pay",
      countsOn: null,
      removesReviews: false,
    });
    const completed = { status: "completed", tripCompleted: true } as const;
    expect(disputeEffect("driver_absent", "rode", completed).bookingEvent).toBeNull();
  });

  it("completes the booking of a ride found to have happened, if its trip completed while the report was open (R8.2)", () => {
    const left = { status: "confirmed", tripCompleted: true } as const;
    expect(disputeEffect("driver_absent", "rode", left).bookingEvent).toBe("complete");
    expect(nextStatus("confirmed", "complete")).toEqual({ ok: true, value: "completed" });
  });

  it("a driver absence found wrong, the passenger didn't come: a no-show with no refund that counts on the passenger (Q20)", () => {
    for (const status of ["confirmed", "completed"] as const) {
      expect(
        disputeEffect("driver_absent", "passenger_absent", { status, tripCompleted: true }),
      ).toEqual({
        bookingEvent: "no_show",
        cancellation: null,
        refund: "none",
        payout: "pay",
        countsOn: "passenger",
        removesReviews: true,
      });
      expect(nextStatus(status, "no_show")).toEqual({ ok: true, value: "no_show" });
    }
  });

  it("counts each outcome on the same side as its effect", () => {
    expect(reportCountsOn("no_show", "stands")).toBe("passenger");
    expect(reportCountsOn("no_show", "rode")).toBeNull();
    expect(reportCountsOn("no_show", "left_behind")).toBe("driver");
    expect(reportCountsOn("driver_absent", "stands")).toBe("driver");
    expect(reportCountsOn("driver_absent", "rode")).toBeNull();
    expect(reportCountsOn("driver_absent", "passenger_absent")).toBe("passenger");
  });

  it("has no effect for an outcome the kind cannot have", () => {
    expect(() => disputeEffect("no_show", "passenger_absent", noShowBooking)).toThrow();
    expect(() => disputeEffect("driver_absent", "left_behind", confirmed)).toThrow();
  });

  it("moves the booking along the lifecycle from where each report leaves it", () => {
    expect(nextStatus("no_show", "rode")).toEqual({ ok: true, value: "completed" });
    expect(nextStatus("no_show", "left_behind")).toEqual({ ok: true, value: "cancelled" });
    expect(nextStatus("confirmed", "driver_absent")).toEqual({ ok: true, value: "cancelled" });
    expect(nextStatus("completed", "driver_absent")).toEqual({ ok: true, value: "cancelled" });
  });
});
