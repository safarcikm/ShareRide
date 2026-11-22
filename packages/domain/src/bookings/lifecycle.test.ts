import { describe, expect, it } from "vitest";
import {
  bookingEvents,
  declineReasons,
  bookingStatuses,
  holdsSeats,
  nextStatus,
  paidInApp,
  paymentMethods,
  statusOnAcceptance,
  type BookingEvent,
  type BookingStatus,
} from "./lifecycle.ts";

/** The arrows of the lifecycle diagram in pricing and seats, and nothing else. */
const allowed: Readonly<Record<string, BookingStatus>> = {
  "requested accept": "accepted",
  "requested decline": "declined",
  "requested expire": "expired",
  "requested withdraw": "cancelled",
  "accepted pay": "confirmed",
  "accepted expire": "expired",
  "accepted cancel": "cancelled",
  "confirmed cancel": "cancelled",
  "confirmed complete": "completed",
  "confirmed no_show": "no_show",
  "confirmed driver_absent": "cancelled",
  "completed driver_absent": "cancelled",
  "completed no_show": "no_show",
  "no_show rode": "completed",
  "no_show left_behind": "cancelled",
};

describe("the booking lifecycle", () => {
  const pairs = bookingStatuses.flatMap((status) =>
    bookingEvents.map((event) => [status, event] as [BookingStatus, BookingEvent]),
  );

  it.each(pairs)("from %s, %s goes where the diagram says, or is refused", (status, event) => {
    const expected = allowed[`${status} ${event}`];
    const result = nextStatus(status, event);
    if (expected === undefined) {
      expect(result).toEqual({ ok: false, error: { code: "not_allowed", status, event } });
    } else {
      expect(result).toEqual({ ok: true, value: expected });
    }
  });

  it("holds seats while requested, accepted or confirmed (rule S1)", () => {
    expect(bookingStatuses.filter(holdsSeats)).toEqual(["requested", "accepted", "confirmed"]);
  });

  it("confirms an accepted free ride at once, and waits for payment otherwise (R5.11)", () => {
    expect(statusOnAcceptance({ amount: 0, currency: "ISK" }, "in_app")).toBe("confirmed");
    expect(statusOnAcceptance({ amount: 2600, currency: "ISK" }, "in_app")).toBe("accepted");
  });

  it("confirms a booking paid to the driver in person at once, whatever its price (rule M6)", () => {
    expect(paymentMethods).toEqual(["in_app", "in_person"]);
    expect(statusOnAcceptance({ amount: 2600, currency: "ISK" }, "in_person")).toBe("confirmed");
    expect(statusOnAcceptance({ amount: 0, currency: "ISK" }, "in_person")).toBe("confirmed");
  });

  it("counts only what is paid in the app as paid, so nothing paid in person is refunded (rule M6)", () => {
    const total = { amount: 2600, currency: "ISK" } as const;
    expect(paidInApp(total, "in_app")).toEqual(total);
    expect(paidInApp(total, "in_person")).toEqual({ amount: 0, currency: "ISK" });
  });

  it("lets a driver give one of three reasons for declining, seen only by the operator (R5.7)", () => {
    expect(declineReasons).toEqual(["plans_changed", "luggage", "other"]);
  });
});
