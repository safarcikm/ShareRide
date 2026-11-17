import { describe, expect, it } from "vitest";
import {
  accountNoticeKinds,
  channelsFor,
  isAccountNotice,
  notificationKinds,
  notificationRules,
  notificationsFor,
  stillApplies,
  type NotificationEvent,
  type Recipient,
} from "./catalogue.ts";
import { defaultNotificationSettings } from "./settings.ts";

const settings = defaultNotificationSettings;

describe("who is told about each event (spec 7, 3.3)", () => {
  const cases: [NotificationEvent, ReturnType<typeof notificationsFor>][] = [
    [{ type: "BookingRequested" }, [{ kind: "request_new", to: "driver" }]],
    [{ type: "RequestHalfway" }, [{ kind: "request_halfway", to: "driver" }]],
    [{ type: "BookingAccepted" }, [{ kind: "pay_now", to: "passenger" }]],
    [{ type: "PaymentDueSoon" }, [{ kind: "pay_reminder", to: "passenger" }]],
    [
      { type: "BookingConfirmed" },
      [
        { kind: "booking_confirmed", to: "passenger" },
        { kind: "booking_confirmed_driver", to: "driver" },
      ],
    ],
    [{ type: "BookingDeclined" }, [{ kind: "request_declined", to: "passenger" }]],
    [
      { type: "BookingExpired", reason: "unanswered" },
      [
        { kind: "request_expired", to: "passenger" },
        { kind: "request_expired_driver", to: "driver" },
      ],
    ],
    [
      { type: "BookingExpired", reason: "unpaid" },
      [
        { kind: "payment_window_ended", to: "passenger" },
        { kind: "payment_window_ended_driver", to: "driver" },
      ],
    ],
    [{ type: "BookingWithdrawn" }, [{ kind: "request_withdrawn", to: "driver" }]],
    [{ type: "DepartureMoved", byMinutes: 30 }, [{ kind: "departure_moved", to: "passenger" }]],
    [{ type: "DepartureMoved", byMinutes: -30 }, [{ kind: "departure_moved", to: "passenger" }]],
    [{ type: "DepartureMoved", byMinutes: 31 }, [{ kind: "departure_moved_far", to: "passenger" }]],
    [
      { type: "DepartureMoved", byMinutes: -31 },
      [{ kind: "departure_moved_far", to: "passenger" }],
    ],
    [{ type: "TripChanged" }, [{ kind: "trip_changed", to: "passenger" }]],
    [{ type: "TripCancelled" }, [{ kind: "trip_cancelled", to: "passenger" }]],
    [
      { type: "BookingCancelled", by: "driver" },
      [{ kind: "booking_cancelled_by_driver", to: "passenger" }],
    ],
    [
      { type: "BookingCancelled", by: "passenger" },
      [{ kind: "booking_cancelled_by_passenger", to: "driver" }],
    ],
    [{ type: "RefundIssued" }, [{ kind: "refund_issued", to: "passenger" }]],
    [
      { type: "MeetingPointChanged" },
      [
        { kind: "meeting_point_changed_driver", to: "driver" },
        { kind: "meeting_point_changed", to: "passenger" },
      ],
    ],
    [{ type: "MessageSent", to: "driver" }, [{ kind: "new_message", to: "driver" }]],
    [{ type: "MessageSent", to: "passenger" }, [{ kind: "new_message", to: "passenger" }]],
    [{ type: "UnreadMessages", to: "passenger" }, [{ kind: "unread_messages", to: "passenger" }]],
    [
      { type: "ReminderDue", which: "evening", to: "passenger" },
      [{ kind: "reminder_evening", to: "passenger" }],
    ],
    [
      { type: "ReminderDue", which: "evening", to: "driver" },
      [{ kind: "reminder_evening_driver", to: "driver" }],
    ],
    [
      { type: "ReminderDue", which: "hour", to: "passenger" },
      [{ kind: "reminder_hour", to: "passenger" }],
    ],
    [
      { type: "ReminderDue", which: "hour", to: "driver" },
      [{ kind: "reminder_hour_driver", to: "driver" }],
    ],
    [{ type: "PayoutSent" }, [{ kind: "payout_sent", to: "driver" }]],
    // "I'm here" (spec 8, 3.2): the other side at that stop.
    [{ type: "CheckedIn", by: "driver" }, [{ kind: "checked_in", to: "passenger" }]],
    [{ type: "CheckedIn", by: "passenger" }, [{ kind: "checked_in_driver", to: "driver" }]],
    // Reports (spec 8, 3.3 to 3.5): the other side is asked to answer, and
    // both are told what the operator decided.
    [{ type: "NoShowMarked" }, [{ kind: "no_show_marked", to: "passenger" }]],
    [{ type: "DriverAbsentReported" }, [{ kind: "driver_absent_reported", to: "driver" }]],
    [
      { type: "DisputeDecided" },
      [
        { kind: "dispute_decided", to: "passenger" },
        { kind: "dispute_decided_driver", to: "driver" },
      ],
    ],
    // Reviews (spec 8, 3.7 and 3.9): "How was your trip?" to each side, and
    // the person a review is about, once it shows.
    [{ type: "RateTrip", to: "passenger" }, [{ kind: "rate_trip", to: "passenger" }]],
    [{ type: "RateTrip", to: "driver" }, [{ kind: "rate_trip_driver", to: "driver" }]],
    [{ type: "ReviewRevealed", about: "driver" }, [{ kind: "review_visible", to: "driver" }]],
    [{ type: "ReviewRevealed", about: "passenger" }, [{ kind: "review_visible", to: "passenger" }]],
  ];

  it.each(cases)("%o", (event, expected) => {
    expect(notificationsFor(event)).toEqual(expected);
  });

  it("covers every kind of notification, with news about the account", () => {
    const told = new Set(cases.flatMap(([event]) => notificationsFor(event).map((n) => n.kind)));
    expect([...told, ...accountNoticeKinds].sort()).toEqual([...notificationKinds].sort());
  });
});

describe("the channels of each kind (spec 7, 3.3 and 3.4)", () => {
  it.each([
    ["request_new", true, "fallback", false],
    ["request_halfway", true, "fallback", false],
    ["pay_now", true, "always", false],
    ["pay_reminder", true, "never", false],
    ["booking_confirmed", true, "always", false],
    ["booking_confirmed_driver", true, "always", false],
    ["request_declined", true, "always", false],
    ["request_expired", true, "always", false],
    ["request_expired_driver", true, "never", false],
    ["request_withdrawn", true, "never", false],
    ["payment_window_ended", true, "fallback", false],
    ["payment_window_ended_driver", true, "fallback", false],
    ["departure_moved", true, "always", false],
    ["departure_moved_far", true, "always", true],
    ["trip_changed", true, "always", false],
    ["trip_cancelled", true, "always", true],
    ["booking_cancelled_by_driver", true, "always", true],
    ["booking_cancelled_by_passenger", true, "always", false],
    ["refund_issued", false, "always", false],
    ["meeting_point_changed", true, "always", true],
    ["meeting_point_changed_driver", true, "always", false],
    ["new_message", true, "never", false],
    ["unread_messages", false, "fallback", false],
    ["reminder_evening", true, "fallback", false],
    ["reminder_evening_driver", true, "fallback", false],
    ["reminder_hour", true, "never", false],
    ["reminder_hour_driver", true, "never", false],
    ["payout_sent", false, "always", false],
    // Push only (spec 8, 3.9): it matters at the stop, and nowhere later.
    ["checked_in", true, "never", false],
    ["checked_in_driver", true, "never", false],
    // Push and email (spec 8, 3.9): the answer has a deadline.
    ["no_show_marked", true, "always", false],
    ["driver_absent_reported", true, "always", false],
    ["dispute_decided", true, "always", false],
    ["dispute_decided_driver", true, "always", false],
    // Push only (spec 8, 3.9): a nudge, not news anyone must have.
    ["rate_trip", true, "never", false],
    ["rate_trip_driver", true, "never", false],
    ["review_visible", true, "never", false],
    ["data_export_ready", true, "always", false],
    // The answer to a question about one's data goes by email (spec 11, 3.6).
    ["privacy_request_answered", false, "always", false],
  ] as const)("%s: push %s, email %s, SMS %s", (kind, push, email, sms) => {
    expect(notificationRules[kind]).toEqual({ push, email, sms });
  });
});

describe("how one person is reached (spec 7, 3.3, 3.4 and 3.7)", () => {
  const boardsAt = new Date("2026-11-20T08:00:00Z");
  const hoursBefore = (hours: number, minutes = 0) =>
    new Date(boardsAt.getTime() - (hours * 60 + minutes) * 60_000);
  const passenger: Recipient = {
    role: "passenger",
    hasPushDevice: true,
    hasVerifiedEmail: true,
    hasVerifiedPhone: true,
    boardsAt,
    smsSentToday: 0,
  };
  const channels = (
    kind: Parameters<typeof channelsFor>[0],
    recipient: Partial<Recipient>,
    now = hoursBefore(48),
  ) => channelsFor(kind, { ...passenger, ...recipient }, now, settings);

  it("pushes to someone with a device, and says why not to someone without", () => {
    expect(channels("pay_reminder", {})).toEqual([{ channel: "push", send: true }]);
    expect(channels("pay_reminder", { hasPushDevice: false })).toEqual([
      { channel: "push", send: false, reason: "no_device" },
    ]);
  });

  it("emails a verified address when the kind always emails", () => {
    expect(channels("pay_now", {})).toEqual([
      { channel: "push", send: true },
      { channel: "email", send: true },
    ]);
    expect(channels("pay_now", { hasVerifiedEmail: false })).toEqual([
      { channel: "push", send: true },
      { channel: "email", send: false, reason: "no_email" },
    ]);
  });

  it("tells about the account by push and email, never by SMS (spec 11, 3.2)", () => {
    const account = { role: null, boardsAt: null };
    expect(channels("data_export_ready", account, hoursBefore(1))).toEqual([
      { channel: "push", send: true },
      { channel: "email", send: true },
    ]);
    expect(isAccountNotice("data_export_ready")).toBe(true);
    expect(isAccountNotice("privacy_request_answered")).toBe(true);
    expect(isAccountNotice("booking_confirmed")).toBe(false);
  });

  it("emails as the fallback only when there is no device with push", () => {
    expect(channels("request_new", { role: "driver" })).toEqual([
      { channel: "push", send: true },
      { channel: "email", send: false, reason: "has_push" },
    ]);
    expect(channels("request_new", { role: "driver", hasPushDevice: false })).toEqual([
      { channel: "push", send: false, reason: "no_device" },
      { channel: "email", send: true },
    ]);
    expect(channels("unread_messages", { hasPushDevice: false })).toEqual([
      { channel: "email", send: true },
    ]);
  });

  it("sends an SMS to a passenger from exactly 24 hours before boarding", () => {
    expect(channels("trip_cancelled", {}, hoursBefore(24))).toContainEqual({
      channel: "sms",
      send: true,
    });
    expect(channels("trip_cancelled", {}, hoursBefore(0, 1))).toContainEqual({
      channel: "sms",
      send: true,
    });
    expect(channels("trip_cancelled", {}, boardsAt)).toContainEqual({ channel: "sms", send: true });
  });

  it("sends no SMS a minute earlier than that, or once boarding has passed", () => {
    expect(channels("trip_cancelled", {}, hoursBefore(24, 1))).toContainEqual({
      channel: "sms",
      send: false,
      reason: "outside_sms_window",
    });
    expect(channels("trip_cancelled", {}, hoursBefore(0, -1))).toContainEqual({
      channel: "sms",
      send: false,
      reason: "outside_sms_window",
    });
  });

  it("never sends a driver an SMS (R7.10), even for a kind that has one", () => {
    for (const kind of ["meeting_point_changed", "meeting_point_changed_driver"] as const) {
      const driver = channels(kind, { role: "driver" }, hoursBefore(2));
      expect(driver.map((decision) => decision.channel)).toEqual(["push", "email"]);
    }
  });

  it("sends at most 5 SMS a day, and only to a verified number (R7.10)", () => {
    expect(channels("trip_cancelled", { smsSentToday: 4 }, hoursBefore(2))).toContainEqual({
      channel: "sms",
      send: true,
    });
    expect(channels("trip_cancelled", { smsSentToday: 5 }, hoursBefore(2))).toContainEqual({
      channel: "sms",
      send: false,
      reason: "sms_limit",
    });
    expect(channels("trip_cancelled", { hasVerifiedPhone: false }, hoursBefore(2))).toContainEqual({
      channel: "sms",
      send: false,
      reason: "no_phone",
    });
  });

  it("sends no SMS for a kind that has none", () => {
    expect(
      channels("departure_moved", {}, hoursBefore(2)).map((decision) => decision.channel),
    ).toEqual(["push", "email"]);
  });
});

describe("stillApplies", () => {
  it("sends the request's notifications only while it waits for an answer", () => {
    for (const kind of ["request_new", "request_halfway"] as const) {
      expect(stillApplies(kind, "requested")).toBe(true);
      for (const status of ["accepted", "confirmed", "declined", "expired", "cancelled"] as const) {
        expect(stillApplies(kind, status)).toBe(false);
      }
    }
  });

  it("asks for the payment only while the booking waits for it", () => {
    for (const kind of ["pay_now", "pay_reminder"] as const) {
      expect(stillApplies(kind, "accepted")).toBe(true);
      for (const status of ["confirmed", "expired", "requested"] as const) {
        expect(stillApplies(kind, status)).toBe(false);
      }
    }
  });

  it("asks for an answer to a report only while the booking is as the report left it (spec 8, 3.3 and 3.4)", () => {
    expect(stillApplies("no_show_marked", "no_show")).toBe(true);
    for (const status of ["completed", "cancelled"] as const) {
      expect(stillApplies("no_show_marked", status)).toBe(false);
    }
    for (const status of ["confirmed", "completed"] as const) {
      expect(stillApplies("driver_absent_reported", status)).toBe(true);
    }
    for (const status of ["cancelled", "no_show"] as const) {
      expect(stillApplies("driver_absent_reported", status)).toBe(false);
    }
    // The decision tells what happened, whatever the booking became.
    for (const status of ["completed", "cancelled", "no_show"] as const) {
      expect(stillApplies("dispute_decided", status)).toBe(true);
    }
  });

  it("asks for a review, and says one shows, only while the booking is completed (spec 8, 3.7)", () => {
    for (const kind of ["rate_trip", "rate_trip_driver", "review_visible"] as const) {
      expect(stillApplies(kind, "completed")).toBe(true);
      // A driver absence that stands, or a passenger found absent, removes the reviews.
      for (const status of ["cancelled", "no_show"] as const) {
        expect(stillApplies(kind, status)).toBe(false);
      }
    }
  });

  it("says someone is at the meeting point only while the booking is confirmed (spec 8, 3.2)", () => {
    for (const kind of ["checked_in", "checked_in_driver"] as const) {
      expect(stillApplies(kind, "confirmed")).toBe(true);
      for (const status of ["cancelled", "no_show", "completed"] as const) {
        expect(stillApplies(kind, status)).toBe(false);
      }
    }
  });

  it("reminds a passenger only of a booking still confirmed (R7.11)", () => {
    for (const kind of ["reminder_evening", "reminder_hour"] as const) {
      expect(stillApplies(kind, "confirmed")).toBe(true);
      for (const status of ["cancelled", "accepted", "expired", "requested"] as const) {
        expect(stillApplies(kind, status)).toBe(false);
      }
    }
  });

  it("tells what happened whatever the booking has done since", () => {
    for (const kind of ["booking_confirmed", "request_declined", "new_message"] as const) {
      expect(stillApplies(kind, "expired")).toBe(true);
    }
  });
});
