import { describe, expect, it } from "vitest";
import { defaultTripDaySettings as settings } from "../trips/day.ts";
import {
  answerDeadline,
  checkAnswer,
  checkDecision,
  disputeEffect,
  outcomeOfAnswer,
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

  it("lets an agreed report stand, and leaves a contested one to the operator", () => {
    expect(outcomeOfAnswer("agreed")).toBe("stands");
    expect(outcomeOfAnswer("contested")).toBeNull();
  });

  it("lets an unanswered report stand once its deadline has passed", () => {
    expect(settlesUnanswered(noShow, completedAt, after(completedAt, 23.9), settings)).toBe(false);
    expect(settlesUnanswered(noShow, completedAt, after(completedAt, 24), settings)).toBe(true);
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
    expect(checkDecision(contested(noShow), "reversed")).toEqual({
      ok: false,
      error: { code: "outcome_invalid" },
    });
  });

  it("decides a contested driver absence as standing or reversed", () => {
    for (const outcome of ["stands", "reversed"] as const) {
      expect(checkDecision(contested(absent), outcome)).toEqual({ ok: true, value: null });
    }
    expect(checkDecision(contested(absent), "rode")).toEqual({
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
  it("a no-show that stands: no refund, the driver is paid, and it counts on the passenger", () => {
    expect(disputeEffect("no_show", "stands")).toEqual({
      bookingEvent: null,
      refund: "none",
      payout: "pay",
      countsOn: "passenger",
      removesReviews: false,
    });
  });

  it("they rode: the booking completes, the driver is paid, and nothing counts", () => {
    expect(disputeEffect("no_show", "rode")).toEqual({
      bookingEvent: "rode",
      refund: "none",
      payout: "pay",
      countsOn: null,
      removesReviews: false,
    });
  });

  it("they were left behind: as a driver absence, a full refund that counts on the driver", () => {
    expect(disputeEffect("no_show", "left_behind")).toEqual({
      bookingEvent: "left_behind",
      refund: "full",
      payout: "withhold",
      countsOn: "driver",
      removesReviews: false,
    });
  });

  it("a driver absence that stands: cancelled with a full refund, counted on the driver, reviews removed", () => {
    expect(disputeEffect("driver_absent", "stands")).toEqual({
      bookingEvent: "driver_absent",
      refund: "full",
      payout: "withhold",
      countsOn: "driver",
      removesReviews: true,
    });
  });

  it("a driver absence reversed: the booking stays, the driver is paid, and nothing counts", () => {
    expect(disputeEffect("driver_absent", "reversed")).toEqual({
      bookingEvent: null,
      refund: "none",
      payout: "pay",
      countsOn: null,
      removesReviews: false,
    });
  });

  it("has no effect for an outcome the kind cannot have", () => {
    expect(() => disputeEffect("no_show", "reversed")).toThrow();
    expect(() => disputeEffect("driver_absent", "rode")).toThrow();
    expect(() => disputeEffect("driver_absent", "left_behind")).toThrow();
  });

  it("moves the booking along the lifecycle from where each report leaves it", () => {
    expect(nextStatus("no_show", "rode")).toEqual({ ok: true, value: "completed" });
    expect(nextStatus("no_show", "left_behind")).toEqual({ ok: true, value: "cancelled" });
    expect(nextStatus("confirmed", "driver_absent")).toEqual({ ok: true, value: "cancelled" });
    expect(nextStatus("completed", "driver_absent")).toEqual({ ok: true, value: "cancelled" });
  });
});
