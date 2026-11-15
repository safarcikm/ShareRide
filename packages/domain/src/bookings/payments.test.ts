import { describe, expect, it } from "vitest";
import { paymentStatuses, settlePayment } from "./payments.ts";

const now = new Date("2026-11-14T12:00:00Z");
const minutes = (count: number) => new Date(now.getTime() + count * 60_000);
const accepted = { status: "accepted" as const, requestExpiresAt: null, paymentDueAt: minutes(10) };

describe("settling a payment (rule M1, R13.3)", () => {
  it("has five statuses", () => {
    expect(paymentStatuses).toEqual(["pending", "succeeded", "failed", "refund_due", "refunded"]);
  });

  it("confirms the booking when paid within the window", () => {
    expect(
      settlePayment({ booking: accepted, payment: "pending", outcome: "succeeded", now }),
    ).toEqual({ ok: true, value: { payment: "succeeded", confirm: true } });
  });

  it("leaves the booking waiting when the payment fails, so the passenger can try again", () => {
    expect(
      settlePayment({ booking: accepted, payment: "pending", outcome: "failed", now }),
    ).toEqual({
      ok: true,
      value: { payment: "failed", confirm: false },
    });
  });

  it("owes a full refund for a payment that succeeds after the window closed", () => {
    const late = { ...accepted, paymentDueAt: now };
    expect(settlePayment({ booking: late, payment: "pending", outcome: "succeeded", now })).toEqual(
      {
        ok: true,
        value: { payment: "refund_due", confirm: false },
      },
    );
    for (const status of ["expired", "cancelled", "confirmed"] as const) {
      expect(
        settlePayment({
          booking: { ...accepted, status },
          payment: "pending",
          outcome: "succeeded",
          now,
        }),
      ).toEqual({ ok: true, value: { payment: "refund_due", confirm: false } });
    }
  });

  it("settles a payment once", () => {
    for (const payment of ["succeeded", "failed", "refund_due", "refunded"] as const) {
      expect(settlePayment({ booking: accepted, payment, outcome: "succeeded", now })).toEqual({
        ok: false,
        error: { code: "payment_settled" },
      });
    }
  });
});
