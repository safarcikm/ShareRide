import { describe, expect, it } from "vitest";
import { defaultSafetySettings } from "./settings.ts";
import {
  checkActive,
  checkReinstatement,
  checkSuspension,
  isSuspended,
  operatorBookingRefund,
  restrictedActions,
  suspensionEffects,
  type SuspendedPassengerBooking,
} from "./suspension.ts";

const kr = (amount: number) => ({ amount, currency: "ISK" as const });
const now = new Date("2026-11-20T12:00:00Z");
const later = new Date("2026-11-21T08:00:00Z");
const earlier = new Date("2026-11-20T08:00:00Z");

describe("whether someone is suspended (3.6.1)", () => {
  it("is until the end date, and for good without one", () => {
    expect(isSuspended({ status: "suspended", suspendedUntil: later }, now)).toBe(true);
    expect(isSuspended({ status: "suspended", suspendedUntil: null }, now)).toBe(true);
    expect(isSuspended({ status: "suspended", suspendedUntil: now }, now)).toBe(false);
    expect(isSuspended({ status: "active", suspendedUntil: null }, now)).toBe(false);
  });

  it("refuses the restricted actions until the suspension ends (R9.10)", () => {
    const suspended = { status: "suspended", suspendedUntil: later } as const;
    expect(checkActive(suspended, now)).toEqual({
      ok: false,
      error: { code: "account_suspended", until: later },
    });
    expect(checkActive({ status: "suspended", suspendedUntil: null }, now)).toEqual({
      ok: false,
      error: { code: "account_suspended", until: null },
    });
    expect(checkActive(suspended, later)).toEqual({ ok: true, value: undefined });
    expect(checkActive({ status: "active", suspendedUntil: null }, now)).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("restricts searching, booking, posting, taking passengers on, chatting and reviewing, and nothing else", () => {
    expect(restrictedActions).toEqual([
      "search",
      "book",
      "request",
      "post_trip",
      "change_trip",
      "accept_request",
      "send_message",
      "review",
    ]);
  });
});

describe("suspending someone (3.6.1)", () => {
  const input = {
    rule: "safety",
    reason: "Dangerous driving on two trips.",
    until: later,
  } as const;

  it("takes a rule, a reason and an end date or none", () => {
    expect(checkSuspension(input, now)).toEqual({ ok: true, value: input });
    expect(checkSuspension({ ...input, until: null }, now)).toMatchObject({ ok: true });
  });

  it("holds the reason to the settings' length", () => {
    const settings = { ...defaultSafetySettings, textMaxLength: 10 };
    expect(checkSuspension(input, now, settings)).toEqual({
      ok: false,
      error: { code: "too_long" },
    });
  });

  it("refuses an empty reason and an end that is not in the future", () => {
    expect(checkSuspension({ ...input, reason: "   " }, now)).toEqual({
      ok: false,
      error: { code: "reason_missing" },
    });
    expect(checkSuspension({ ...input, until: now }, now)).toEqual({
      ok: false,
      error: { code: "until_past" },
    });
  });
});

describe("reinstating someone (3.6.3)", () => {
  it("needs a note for the person, trimmed and held to the settings' length", () => {
    expect(checkReinstatement("  Shown to be a mix-up.  ", defaultSafetySettings)).toEqual({
      ok: true,
      value: "Shown to be a mix-up.",
    });
    expect(checkReinstatement(" \n ", defaultSafetySettings)).toEqual({
      ok: false,
      error: { code: "reason_missing" },
    });
    const settings = { ...defaultSafetySettings, textMaxLength: 5 };
    expect(checkReinstatement("Too long", settings)).toEqual({
      ok: false,
      error: { code: "too_long" },
    });
  });
});

describe("what a suspension cancels (3.6.2, R9.10, milestone 9 decision 3)", () => {
  const trips = [
    { id: "upcoming", status: "published", departsAt: later },
    { id: "under-way", status: "published", departsAt: earlier },
    { id: "departed", status: "departed", departsAt: earlier },
    { id: "done", status: "completed", departsAt: earlier },
    { id: "cancelled", status: "cancelled", departsAt: later },
    { id: "draft", status: "draft", departsAt: later },
  ] as const;

  const booking = (
    id: string,
    status: SuspendedPassengerBooking["status"],
    tripStatus: SuspendedPassengerBooking["tripStatus"] = "published",
    boardsAt = later,
  ): SuspendedPassengerBooking => ({
    id,
    status,
    tripStatus,
    boardsAt,
    total: kr(2900),
    paymentMethod: "in_app",
  });

  it("cancels only the upcoming trips the person drives", () => {
    expect(suspensionEffects(trips, [], now).trips).toEqual(["upcoming"]);
  });

  it("cancels the person's upcoming bookings, refunding in full what was paid", () => {
    expect(
      suspensionEffects(
        [],
        [
          booking("paid", "confirmed"),
          booking("unpaid", "accepted"),
          booking("asked", "requested"),
          booking("over", "completed"),
          booking("gone", "cancelled"),
          booking("on-the-road", "confirmed", "departed", earlier),
          booking("left", "confirmed", "published", earlier),
          booking("trip-cancelled", "confirmed", "cancelled", later),
        ],
        now,
      ).bookings,
    ).toEqual([
      { id: "paid", event: "cancel", refund: kr(2900) },
      { id: "unpaid", event: "cancel", refund: kr(0) },
      { id: "asked", event: "withdraw", refund: kr(0) },
    ]);
  });

  it("cancels a booking that boards at a later stop of a trip under way", () => {
    expect(
      suspensionEffects([], [booking("later-stop", "confirmed", "departed", later)], now).bookings,
    ).toEqual([{ id: "later-stop", event: "cancel", refund: kr(2900) }]);
  });
});

describe("ShareRide's refund when it cancels a booking (decision 3)", () => {
  it("gives back all that was paid, and nothing for what was not", () => {
    expect(operatorBookingRefund("confirmed", kr(5600), "in_app")).toEqual(kr(5600));
    expect(operatorBookingRefund("accepted", kr(5600), "in_app")).toEqual(kr(0));
    expect(operatorBookingRefund("requested", kr(5600), "in_app")).toEqual(kr(0));
  });

  it("gives back nothing for a booking paid to the driver in person (rule M6)", () => {
    expect(operatorBookingRefund("confirmed", kr(5600), "in_person")).toEqual(kr(0));
  });
});
