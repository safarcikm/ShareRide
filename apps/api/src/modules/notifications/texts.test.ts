import { defaultNotificationSettings } from "@shareride/domain";
import { locales } from "@shareride/i18n";
import { describe, expect, it } from "vitest";
import {
  notificationText,
  smsText,
  type NotificationFacts,
  type PointMovedFacts,
  type PointPausedFacts,
  type TripReminderFacts,
} from "./texts.ts";

// Saturday 14 November 2026: boarding at 09:00 in Iceland (UTC all year).
const facts: NotificationFacts = {
  kind: "request_new",
  role: "driver",
  bookingId: "booking-1",
  tripId: "trip-1",
  name: "Jón",
  seats: 2,
  total: { amount: 5600, currency: "ISK" },
  cancelReason: null,
  refund: { amount: 0, currency: "ISK" },
  from: "BSÍ",
  to: "Hof, Akureyri",
  boardsAt: new Date("2026-11-14T09:00:00Z"),
  requestExpiresAt: new Date("2026-11-14T00:05:00Z"),
  paymentDueAt: new Date("2026-11-13T12:30:00Z"),
  message: null,
  boardPointId: "point-bsi",
  car: { make: "Toyota", model: "Yaris", colour: "white" },
  newCar: null,
  newStop: null,
  removedStop: null,
  moved: { from: new Date("2026-11-14T08:15:00Z"), to: new Date("2026-11-14T09:00:00Z") },
  paid: true,
  answerBy: new Date("2026-11-15T13:30:00Z"),
  pausedPoint: {
    name: "N1 Borgarnes",
    reason: "Road works at the entrance.",
    until: null,
    retired: false,
  },
  movedPoint: { name: "N1 Borgarnes" },
};

const gunna = { name: "Gunna", from: "BSÍ", to: "Hof, Akureyri" };
const tripFacts: TripReminderFacts = {
  kind: "reminder_evening_driver",
  role: "driver",
  tripId: "trip-1",
  departsAt: new Date("2026-11-14T09:00:00Z"),
  passengers: [gunna, { name: "Siggi", from: "Borgarnes", to: "Blönduós" }],
  plateMissing: false,
};

const pausedFacts: PointPausedFacts = {
  kind: "meeting_point_changed_driver",
  role: "driver",
  tripId: "trip-1",
  stopsAt: new Date("2026-11-14T10:10:00Z"),
  point: {
    name: "N1 Borgarnes",
    reason: "Road works at the entrance.",
    until: null,
    retired: false,
  },
};

const movedFacts: PointMovedFacts = {
  kind: "meeting_point_moved_driver",
  role: "driver",
  tripId: "trip-1",
  stopsAt: new Date("2026-11-14T10:10:00Z"),
  movedPoint: { name: "N1 Borgarnes" },
};

const tripText = (changes: Partial<TripReminderFacts>, locale: "is" | "en" = "en") =>
  notificationText({ ...tripFacts, ...changes }, locale, defaultNotificationSettings);

const text = (changes: Partial<NotificationFacts>, locale: "is" | "en" = "en") =>
  notificationText({ ...facts, ...changes }, locale, defaultNotificationSettings);

/** The kinds spec 5's events, new messages and spec 6's cancellations give, with whom they go to. */
const kinds: readonly [NotificationFacts["kind"], "driver" | "passenger"][] = [
  ["request_new", "driver"],
  ["request_halfway", "driver"],
  ["pay_now", "passenger"],
  ["pay_reminder", "passenger"],
  ["booking_confirmed", "passenger"],
  ["booking_confirmed_driver", "driver"],
  ["request_declined", "passenger"],
  ["request_expired", "passenger"],
  ["request_expired_driver", "driver"],
  ["request_withdrawn", "driver"],
  ["payment_window_ended", "passenger"],
  ["payment_window_ended_driver", "driver"],
  ["new_message", "passenger"],
  ["unread_messages", "passenger"],
  ["reminder_evening", "passenger"],
  ["reminder_hour", "passenger"],
  ["booking_cancelled_by_passenger", "driver"],
  ["refund_issued", "passenger"],
  ["booking_cancelled_by_driver", "passenger"],
  ["trip_cancelled", "passenger"],
  ["departure_moved", "passenger"],
  ["departure_moved_far", "passenger"],
  ["trip_changed", "passenger"],
  ["checked_in", "passenger"],
  ["checked_in_driver", "driver"],
  ["no_show_marked", "passenger"],
  ["driver_absent_reported", "driver"],
  ["dispute_decided", "passenger"],
  ["dispute_decided_driver", "driver"],
  ["meeting_point_changed", "passenger"],
  ["meeting_point_moved", "passenger"],
];

describe("notification texts", () => {
  it.each(locales)(
    "are complete sentences in %s for every kind, starting with a capital",
    (locale) => {
      for (const [kind, role] of kinds) {
        const { title, body } = text(
          {
            kind,
            role,
            message: { text: "Halló" },
            cancelReason: "car_problem",
            newCar: facts.car,
          },
          locale,
        );
        for (const line of [title, body]) {
          expect(line, kind).not.toMatch(/[{}]/);
          expect(line.charAt(0), kind).toBe(line.charAt(0).toLocaleUpperCase(locale));
        }
      }
      for (const kind of ["reminder_evening_driver", "reminder_hour_driver"] as const) {
        const { title, body } = tripText({ kind, plateMissing: true }, locale);
        for (const line of [title, body]) {
          expect(line, kind).not.toMatch(/[{}]/);
          expect(line.charAt(0), kind).toBe(line.charAt(0).toLocaleUpperCase(locale));
        }
      }
      const paused = notificationText(
        { ...pausedFacts, point: { ...pausedFacts.point, until: "2026-11-30" } },
        locale,
        defaultNotificationSettings,
      );
      for (const line of [paused.title, ...paused.body.split("\n")]) {
        expect(line).not.toMatch(/[{}]/);
        expect(line.charAt(0)).toBe(line.charAt(0).toLocaleUpperCase(locale));
      }
    },
  );

  it("put names and places after a colon or a dot", () => {
    expect(text({})).toEqual({
      title: "New request: Jón",
      body: "2 seats · BSÍ – Hof, Akureyri · Saturday 14 November at 09:00",
      path: "/drive/trips/trip-1",
    });
    expect(text({}, "is")).toMatchObject({
      title: "Ný beiðni: Jón",
      body: "2 sæti · BSÍ – Hof, Akureyri · laugardagur 14. nóvember kl. 09:00",
    });
  });

  it("say who is at the meeting point, and which one (spec 8, 3.2)", () => {
    expect(text({ kind: "checked_in", role: "passenger", name: "Anna" })).toEqual({
      title: "At the meeting point: Anna",
      body: "BSÍ",
      path: "/bookings/booking-1",
    });
    expect(text({ kind: "checked_in_driver", name: "Gunna" }, "is")).toEqual({
      title: "Á mótsstaðnum: Gunna",
      body: "BSÍ",
      path: "/drive/trips/trip-1",
    });
  });

  it("ask the other side of a report to answer, and say until when (spec 8, 3.3 and 3.4)", () => {
    expect(text({ kind: "no_show_marked", role: "passenger", name: "Anna" })).toEqual({
      title: "The driver says you didn't come",
      body: "BSÍ – Hof, Akureyri · Saturday 14 November at 09:00. Is this right? Answer by Sunday 15 November at 13:30.",
      path: "/bookings/booking-1",
    });
    expect(text({ kind: "driver_absent_reported", name: "Gunna" }, "is")).toEqual({
      title: "Farþegi segir að þú hafir ekki komið: Gunna",
      body: "BSÍ – Hof, Akureyri · laugardagur 14. nóvember kl. 09:00. Er þetta rétt? Svarfrestur: sunnudagur 15. nóvember kl. 13:30.",
      path: "/drive/trips/trip-1",
    });
  });

  it("tell both sides that the operator has decided, never how in the text (spec 8, 3.5)", () => {
    expect(text({ kind: "dispute_decided", role: "passenger" })).toEqual({
      title: "PuffinRide has decided on the report",
      body: "BSÍ – Hof, Akureyri · Saturday 14 November at 09:00. See the outcome in the app.",
      path: "/bookings/booking-1",
    });
    expect(text({ kind: "dispute_decided_driver" }, "is")).toMatchObject({
      title: "PuffinRide hefur tekið ákvörðun um tilkynninguna",
      path: "/drive/trips/trip-1",
    });
  });

  it("ask how the trip was, opening the rating screen for the passenger and the trip for the driver (spec 20, 3.1.3)", () => {
    expect(text({ kind: "rate_trip", role: "passenger", name: "Jón" })).toEqual({
      title: "How was your ride?",
      body: "Rate the driver: Jón. BSÍ – Hof, Akureyri · Saturday 14 November at 09:00.",
      path: "/bookings/booking-1/rate",
    });
    expect(text({ kind: "rate_trip_driver" })).toEqual({
      title: "How was your ride?",
      body: "Rate your passengers. It helps other drivers choose.",
      path: "/drive/trips/trip-1",
    });
    expect(text({ kind: "rate_trip", role: "passenger" }, "is")).toMatchObject({
      title: "Hvernig var ferðin?",
      path: "/bookings/booking-1/rate",
    });
  });

  it("give the deadline to pay and the amount in the recipient's language", () => {
    expect(text({ kind: "pay_now", role: "passenger" })).toEqual({
      title: "Pay now: BSÍ – Hof, Akureyri",
      body: "Pay 5,600 ISK by 12:30 to confirm your seat.",
      path: "/bookings/booking-1",
    });
    expect(text({ kind: "pay_reminder", role: "passenger" }, "is")).toMatchObject({
      title: "10 mínútur eftir til að greiða",
      body: "Greiddu 5.600 kr. fyrir kl. 12:30 til að staðfesta sætið.",
    });
  });

  it("start an Icelandic line with a capital, as weekdays are written in lower case", () => {
    expect(text({ kind: "booking_confirmed", role: "passenger" }, "is").body).toBe(
      "Laugardagur 14. nóvember kl. 09:00 · BSÍ",
    );
    expect(text({ kind: "request_halfway" }).body).toBe(
      "Answer by Saturday 14 November at 00:05, or it expires.",
    );
  });

  it("show a message as written, and a quick message in the reader's language", () => {
    expect(text({ kind: "new_message", message: { text: "on my way, 5 min" } })).toEqual({
      title: "Jón",
      body: "on my way, 5 min",
      path: "/messages/booking-1",
    });
    expect(
      text({ kind: "new_message", message: { quick: { key: "late", minutes: 10 } } }, "is").body,
    ).toBe("Mér seinkar um 10 mínútur");
  });

  it("tell the driver who cancelled, and the passenger what is refunded and where (spec 6)", () => {
    expect(text({ kind: "booking_cancelled_by_passenger", name: "Gunna" })).toEqual({
      title: "Booking cancelled: Gunna",
      body: "2 seats · BSÍ – Hof, Akureyri · Saturday 14 November at 09:00",
      path: "/drive/trips/trip-1",
    });
    expect(text({ kind: "refund_issued", role: "passenger" })).toEqual({
      title: "Refund of 5,600 ISK",
      body: "BSÍ – Hof, Akureyri · Saturday 14 November at 09:00. It goes back to the card you paid with.",
      path: "/bookings/booking-1",
    });
    expect(text({ kind: "refund_issued", role: "passenger" }, "is")).toMatchObject({
      title: "Endurgreiðsla, 5.600 kr.",
      body: "BSÍ – Hof, Akureyri · laugardagur 14. nóvember kl. 09:00. Hún fer aftur á kortið sem þú greiddir með.",
    });
  });

  it("tell the passenger why the driver cancelled and the refund, never the note (spec 6, 3.4)", () => {
    const cancelled = {
      kind: "booking_cancelled_by_driver",
      role: "passenger",
      cancelReason: "car_problem",
      refund: { amount: 5600, currency: "ISK" },
    } as const;
    expect(text(cancelled)).toEqual({
      title: "The driver cancelled: Car problem",
      body: "BSÍ – Hof, Akureyri · Saturday 14 November at 09:00. Full refund of 5,600 ISK.",
      path: "/bookings/booking-1",
    });
    expect(text({ ...cancelled, refund: { amount: 0, currency: "ISK" } }, "is")).toMatchObject({
      title: "Bílstjórinn afbókaði: Bilun í bíl",
      body: "BSÍ – Hof, Akureyri · laugardagur 14. nóvember kl. 09:00. Leitaðu að annarri ferð.",
    });
    expect(smsText({ ...facts, ...cancelled }, "en")).toBe(
      "PuffinRide: the driver cancelled your booking for Saturday 14 November at 09:00. Full refund. Details in the app.",
    );
    expect(smsText({ ...facts, ...cancelled, refund: { amount: 0, currency: "ISK" } }, "is")).toBe(
      "PuffinRide: Bílstjórinn aflýsti bókun þinni: laugardagur 14. nóvember kl. 09:00. Nánar í appinu.",
    );
    expect(() => smsText({ ...facts, kind: "request_new" }, "en")).toThrow(/No SMS/);
  });

  it("tell everyone on a cancelled trip why, and the refund, never the note (spec 6, 3.3)", () => {
    const cancelled = {
      kind: "trip_cancelled",
      role: "passenger",
      cancelReason: "weather",
      refund: { amount: 5600, currency: "ISK" },
    } as const;
    expect(text(cancelled)).toEqual({
      title: "Ride cancelled: Weather",
      body: "BSÍ – Hof, Akureyri · Saturday 14 November at 09:00. Full refund of 5,600 ISK.",
      path: "/bookings/booking-1",
    });
    // A request, or a booking not paid for: nothing to refund.
    expect(text({ ...cancelled, refund: { amount: 0, currency: "ISK" } }, "is")).toMatchObject({
      title: "Ferð aflýst: Veður",
      body: "BSÍ – Hof, Akureyri · laugardagur 14. nóvember kl. 09:00. Leitaðu að annarri ferð.",
    });
    expect(smsText({ ...facts, ...cancelled }, "en")).toBe(
      "PuffinRide: your ride on Saturday 14 November at 09:00 is cancelled. Full refund. Details in the app.",
    );
    expect(smsText({ ...facts, ...cancelled }, "is")).toBe(
      "PuffinRide: Ferðinni þinni var aflýst: laugardagur 14. nóvember kl. 09:00. Full endurgreiðsla. Nánar í appinu.",
    );
    expect(smsText({ ...facts, ...cancelled, refund: { amount: 0, currency: "ISK" } }, "en")).toBe(
      "PuffinRide: your ride on Saturday 14 November at 09:00 is cancelled. Details in the app.",
    );
  });

  it("tell a passenger the new boarding time, and after a move of more than 30 minutes that a paid booking can be cancelled with a full refund (spec 6, 3.2)", () => {
    const moved = { kind: "departure_moved", role: "passenger" } as const;
    expect(text(moved)).toEqual({
      title: "Departure changed from 08:15 to 09:00",
      body: "BSÍ – Hof, Akureyri · Saturday 14 November at 09:00.",
      path: "/bookings/booking-1",
    });
    expect(text({ ...moved, kind: "departure_moved_far" }, "is")).toMatchObject({
      title: "Brottför breytt úr 08:15 í 09:00",
      body: "BSÍ – Hof, Akureyri · laugardagur 14. nóvember kl. 09:00. Þú getur haldið bókuninni eða afbókað með fullri endurgreiðslu.",
    });
    // Not paid yet, or free: nothing to refund, so no offer.
    expect(text({ ...moved, kind: "departure_moved_far", paid: false })).toMatchObject({
      body: "BSÍ – Hof, Akureyri · Saturday 14 November at 09:00.",
    });
    const far = { ...facts, ...moved, kind: "departure_moved_far" } as const;
    expect(smsText(far, "en")).toBe(
      "PuffinRide: your ride on Saturday 14 November now leaves at 09:00. Keep it or cancel with a full refund in the app.",
    );
    expect(smsText({ ...far, paid: false }, "is")).toBe(
      "PuffinRide: Ný brottför: laugardagur 14. nóvember kl. 09:00. Nánar í appinu.",
    );
    expect(() => text({ ...moved, moved: null })).toThrow(/needs the move/);
  });

  it("tell a passenger the new car by its colour, make and model, never its number plate (spec 6, 3.2)", () => {
    const changed = {
      kind: "trip_changed",
      role: "passenger",
      newCar: { make: "Volvo", model: "XC40", colour: "red" },
    } as const;
    expect(text(changed)).toEqual({
      title: "New car: Red Volvo XC40",
      body: "BSÍ – Hof, Akureyri · Saturday 14 November at 09:00.",
      path: "/bookings/booking-1",
    });
    expect(text(changed, "is")).toMatchObject({ title: "Nýr bíll: Rauður Volvo XC40" });
    expect(() => text({ ...changed, newCar: null })).toThrow(/needs the new car/);
  });

  it("tell a passenger a new stop with its time, in their language (spec 6, 3.2)", () => {
    const added = {
      kind: "trip_changed",
      role: "passenger",
      newStop: { name: "Smáralind", plannedAt: new Date("2026-11-14T05:45:00Z") },
    } as const;
    expect(text(added)).toEqual({
      title: "New stop: Smáralind at 05:45",
      body: "BSÍ – Hof, Akureyri · Saturday 14 November at 09:00.",
      path: "/bookings/booking-1",
    });
    expect(text(added, "is")).toMatchObject({ title: "Nýr viðkomustaður: Smáralind kl. 05:45" });
  });

  it("tell a passenger a stop removed, in their language (spec 6, 3.2)", () => {
    const removed = {
      kind: "trip_changed",
      role: "passenger",
      removedStop: { name: "N1 Fitjar" },
    } as const;
    expect(text(removed)).toEqual({
      title: "Stop removed: N1 Fitjar",
      body: "BSÍ – Hof, Akureyri · Saturday 14 November at 09:00.",
      path: "/bookings/booking-1",
    });
    expect(text({ ...removed, removedStop: { name: "N1 Fitjum" } }, "is")).toMatchObject({
      title: "Viðkomustaður felldur niður: N1 Fitjum",
    });
  });

  it("tell a passenger their meeting point is paused, the operator's reason, and until when if known (spec 2, 3.6.4)", () => {
    const paused = { kind: "meeting_point_changed", role: "passenger" } as const;
    expect(text(paused)).toEqual({
      title: "Meeting point not in use for now: N1 Borgarnes",
      body: "Road works at the entrance.\nBSÍ – Hof, Akureyri · Saturday 14 November at 09:00. The driver is asked to choose another stop.",
      path: "/bookings/booking-1",
    });
    const until = {
      ...paused,
      pausedPoint: {
        name: "N1 Borgarnesi",
        reason: "Vegavinna við innkeyrsluna.",
        until: "2026-11-30",
        retired: false,
      },
    };
    expect(text(until, "is")).toMatchObject({
      title: "Mótsstaður ekki í notkun í bili: N1 Borgarnesi",
      body: "Vegavinna við innkeyrsluna.\nAftur í notkun: 30. nóvember 2026\nBSÍ – Hof, Akureyri · laugardagur 14. nóvember kl. 09:00. Bílstjórinn er beðinn um að velja annan viðkomustað.",
    });
    expect(smsText({ ...facts, ...paused }, "en")).toBe(
      "PuffinRide: the meeting point for your ride on Saturday 14 November has changed. Details in the app.",
    );
    expect(smsText({ ...facts, ...paused }, "is")).toBe(
      "PuffinRide: Mótsstaður ferðarinnar þinnar hefur breyst: laugardagur 14. nóvember. Nánar í appinu.",
    );
    expect(() => text({ ...paused, pausedPoint: null })).toThrow(/needs the paused point/);
  });

  it("ask the driver to choose another stop for the trip, at the time it stops there (spec 2, 3.6.4)", () => {
    expect(notificationText(pausedFacts, "en", defaultNotificationSettings)).toEqual({
      title: "Meeting point not in use for now: N1 Borgarnes",
      body: "Road works at the entrance.\nChoose another stop for your ride: Saturday 14 November at 10:10.",
      path: "/drive/trips/trip-1",
    });
    const until = { ...pausedFacts.point, until: "2026-11-30" };
    expect(
      notificationText({ ...pausedFacts, point: until }, "is", defaultNotificationSettings).body,
    ).toBe(
      "Road works at the entrance.\nAftur í notkun: 30. nóvember 2026\nVeldu annan viðkomustað fyrir ferðina: laugardagur 14. nóvember kl. 10:10.",
    );
  });

  it("say a point retired while paused is no longer in use, without a day it is back", () => {
    const retired = { ...pausedFacts.point, retired: true };
    expect(
      notificationText({ ...pausedFacts, point: retired }, "en", defaultNotificationSettings),
    ).toMatchObject({
      title: "Meeting point no longer in use: N1 Borgarnes",
      body: "Road works at the entrance.\nChoose another stop for your ride: Saturday 14 November at 10:10.",
    });
    expect(
      text({ kind: "meeting_point_changed", role: "passenger", pausedPoint: retired }, "is").title,
    ).toBe("Mótsstaður ekki lengur í notkun: N1 Borgarnes");
  });

  it("tell a passenger their meeting point moved, with their part, and to look where it is (spec 2, 3.6.6)", () => {
    const moved = { kind: "meeting_point_moved", role: "passenger" } as const;
    expect(text(moved)).toEqual({
      title: "Meeting point moved: N1 Borgarnes",
      body: "BSÍ – Hof, Akureyri · Saturday 14 November at 09:00. See where it is now before you go.",
      path: "/bookings/booking-1",
    });
    expect(text({ ...moved, movedPoint: { name: "N1 Borgarnesi" } }, "is")).toMatchObject({
      title: "Mótsstaður færður: N1 Borgarnesi",
      body: "BSÍ – Hof, Akureyri · laugardagur 14. nóvember kl. 09:00. Sjáðu hvar hann er núna áður en þú leggur af stað.",
    });
    // By SMS within 24 hours of boarding, as a pause (spec 7, 3.4).
    expect(smsText({ ...facts, ...moved }, "en")).toBe(
      "PuffinRide: the meeting point for your ride on Saturday 14 November has changed. Details in the app.",
    );
    expect(() => text({ ...moved, movedPoint: null })).toThrow(/needs the moved point/);
  });

  it("tell the driver a meeting point of the trip moved, at the time it stops there (spec 2, 3.6.6)", () => {
    expect(notificationText(movedFacts, "en", defaultNotificationSettings)).toEqual({
      title: "Meeting point moved: N1 Borgarnes",
      body: "Your ride stops there: Saturday 14 November at 10:10. See where it is now before you go.",
      path: "/drive/trips/trip-1",
    });
    expect(notificationText(movedFacts, "is", defaultNotificationSettings)).toEqual({
      title: "Mótsstaður færður: N1 Borgarnes",
      body: "Ferðin þín stoppar þar: laugardagur 14. nóvember kl. 10:10. Sjáðu hvar hann er núna áður en þú leggur af stað.",
      path: "/drive/trips/trip-1",
    });
  });

  it("refuse a kind that has no text yet", () => {
    expect(() => text({ kind: "payout_sent" })).toThrow(/No text for payout_sent/);
  });

  it("tell of unread messages by the trip's day, never their text, and open the chat (3.6, item 3)", () => {
    const secret = { text: "My door code is 4512" };
    expect(text({ kind: "unread_messages", role: "passenger", message: secret })).toEqual({
      title: "You have unread messages about your ride on Saturday 14 November",
      body: "Open the chat in PuffinRide to read them.",
      path: "/messages/booking-1",
    });
    expect(text({ kind: "unread_messages", role: "driver", message: secret }, "is")).toEqual({
      title: "Þú átt ólesin skilaboð um ferðina: laugardagur 14. nóvember",
      body: "Opnaðu spjallið í PuffinRide til að lesa þau.",
      path: "/messages/booking-1",
    });
  });

  it("remind a passenger of the time, the meeting point, the driver and the car, with Directions (3.5)", () => {
    expect(text({ kind: "reminder_evening", role: "passenger" })).toEqual({
      title: "Tomorrow at 09:00 · Meeting point: BSÍ",
      body: "Driver: Jón · White Toyota Yaris",
      path: "/meeting-points/point-bsi",
      open: "Directions",
    });
    expect(text({ kind: "reminder_hour", role: "passenger" }, "is")).toEqual({
      title: "Eftir klukkustund, kl. 09:00 · Mótsstaður: BSÍ",
      body: "Bílstjóri: Jón · Hvítur Toyota Yaris",
      path: "/meeting-points/point-bsi",
      open: "Leiðarlýsing",
    });
    expect(text({ kind: "reminder_hour", role: "passenger", car: null }).body).toBe("Driver: Jón");
    expect(
      text({
        kind: "reminder_hour",
        role: "passenger",
        car: { make: "Kia", model: "Ceed", colour: "other" },
      }).body,
    ).toBe("Driver: Jón · Kia Ceed");
  });

  it("remind a driver who gets in and out where, and of a missing number plate (3.5)", () => {
    expect(tripText({})).toEqual({
      title: "Tomorrow at 09:00: 2 passengers",
      body: "Gunna: BSÍ – Hof, Akureyri\nSiggi: Borgarnes – Blönduós",
      path: "/drive/trips/trip-1",
    });
    expect(
      tripText({ kind: "reminder_hour_driver", passengers: [gunna], plateMissing: true }, "is"),
    ).toEqual({
      title: "Eftir klukkustund, kl. 09:00: 1 farþegi",
      body: "Gunna: BSÍ – Hof, Akureyri\nBættu við bílnúmerinu svo farþegarnir finni bílinn.",
      path: "/drive/trips/trip-1",
    });
  });

  it("never say why PuffinRide cancelled a trip or booking (spec 9, 3.6.2)", () => {
    expect(text({ kind: "trip_cancelled", role: "passenger", cancelReason: null })).toEqual({
      title: "PuffinRide cancelled the ride",
      body: "BSÍ – Hof, Akureyri · Saturday 14 November at 09:00. Find another ride.",
      path: "/bookings/booking-1",
    });
    expect(
      text({ kind: "booking_cancelled_by_shareride", role: "driver", cancelReason: null }, "is"),
    ).toMatchObject({ title: "PuffinRide afbókaði: Jón" });
  });

  it("tell the person what PuffinRide did, and the email why and how to appeal (spec 9, R9.5)", () => {
    const settings = defaultNotificationSettings;
    const notice = {
      kind: "moderation_action",
      action: "suspension",
      rule: "harassment",
      reason: "Repeated messages after being asked to stop.",
      until: new Date("2026-12-13T12:00:00Z"),
      at: new Date("2026-11-13T12:00:00Z"),
      content: null,
    } as const;
    // The push names what happened, never the reason: a lock screen shows it.
    expect(notificationText(notice, "en", settings)).toEqual({
      title: "Your account is suspended until 13 December at 12:00",
      body: "Read why in PuffinRide.",
      path: "/notices",
      open: "Open your notices in PuffinRide",
      emailBody: [
        "Your account is suspended until 13 December at 12:00",
        "",
        "Rule: Harassment",
        "Reason: Repeated messages after being asked to stop.",
        "",
        "If you disagree, you can appeal in PuffinRide, under Notices, until 27 November at 12:00.",
      ].join("\n"),
    });
    expect(notificationText({ ...notice, until: null }, "is", settings)).toMatchObject({
      title: "Aðganginum þínum hefur verið lokað ótímabundið",
      body: "Lestu ástæðuna í PuffinRide.",
    });
    expect(
      notificationText(
        { ...notice, action: "reinstatement", rule: null, reason: "A mix-up.", until: null },
        "en",
        settings,
      ),
    ).toEqual({
      title: "Your account is open again",
      body: "You can use PuffinRide as before.",
      path: "/",
      emailBody: "You can use PuffinRide as before.\n\nNote: A mix-up.",
    });
    // The email names what it affected (R9.5).
    const hidden = {
      ...notice,
      action: "content_hidden",
      rule: "offensive",
      reason: "Rude words about another member.",
      until: null,
      content: "message",
    } as const;
    expect(notificationText(hidden, "en", settings).emailBody).toBe(
      [
        "We removed something you posted",
        "",
        "Rule: Offensive content",
        "Reason: Rude words about another member.",
        "Concerns: a message you sent",
        "",
        "If you disagree, you can appeal in PuffinRide, under Notices, until 27 November at 12:00.",
      ].join("\n"),
    );
    expect(
      notificationText({ ...hidden, content: "trip_note" }, "is", settings).emailBody,
    ).toContain("Varðar: ");
    expect(notificationText({ kind: "suspension_ended" }, "is", settings)).toEqual({
      title: "Aðgangurinn þinn er opinn á ný",
      body: "Lokuninni er lokið. Þú getur notað PuffinRide eins og áður.",
      path: "/",
    });
  });

  it("tell a tester there is a reply to their feedback; only the email carries it (spec 12, 3.3.4)", () => {
    const settings = defaultNotificationSettings;
    const reply = {
      kind: "feedback_replied",
      sentAt: new Date("2027-03-10T12:00:00Z"),
      reply: "Thanks, fixed in the next version.",
    } as const;
    expect(notificationText(reply, "en", settings)).toEqual({
      title: "PuffinRide replied to your feedback",
      body: "Open PuffinRide to read the reply.",
      path: "/settings/feedback",
      open: "Open your feedback in PuffinRide",
      emailBody: [
        "Thank you for the feedback you sent on 10 March. Our reply:",
        "",
        "Thanks, fixed in the next version.",
      ].join("\n"),
    });
    expect(notificationText(reply, "is", settings)).toMatchObject({
      title: "PuffinRide svaraði ábendingunni þinni",
      body: "Opnaðu PuffinRide til að lesa svarið.",
    });
  });

  it("carry an announcement as written, the email with why they get it (spec 10, 3.5.3)", () => {
    const settings = defaultNotificationSettings;
    const message = `We improved the map.\n${"Thank you for testing. ".repeat(10)}`.trim();
    const news = { kind: "announcement", title: "A new version", message } as const;
    const text = notificationText(news, "en", settings);
    expect(text).toMatchObject({
      title: "A new version",
      path: "/settings/beta-news",
      open: "Open Beta news in PuffinRide",
      emailBody: [
        message,
        "",
        "You get this because you are a PuffinRide beta tester. Turn off beta news in Profile, under Notifications.",
      ].join("\n"),
    });
    // The push has the start of it, on one line.
    expect(text.body.startsWith("We improved the map. Thank you for testing.")).toBe(true);
    expect(text.body).toHaveLength(140);
    expect(text.body.endsWith("…")).toBe(true);
    expect(notificationText(news, "is", settings).emailBody).toContain(
      "Þú færð þetta af því að þú tekur þátt í beta-prófun PuffinRide. Þú getur slökkt á fréttum af beta-prófuninni í Prófílnum, undir Tilkynningar.",
    );
  });

  it("mark the operator's own copy as a test, with both languages (spec 10, 3.5.2)", () => {
    const test = {
      kind: "announcement_test",
      titleIs: "Ný útgáfa",
      titleEn: "A new version",
      messageIs: "Við bættum kortið.",
      messageEn: "We improved the map.",
    } as const;
    expect(notificationText(test, "is", defaultNotificationSettings)).toEqual({
      title: "Prófun: Ný útgáfa",
      body: "Við bættum kortið.",
      path: "/settings/beta-news",
      open: "Opna fréttir af beta-prófuninni í PuffinRide",
      emailBody: [
        "Ný útgáfa",
        "",
        "Við bættum kortið.",
        "",
        "Þú færð þetta af því að þú tekur þátt í beta-prófun PuffinRide. Þú getur slökkt á fréttum af beta-prófuninni í Prófílnum, undir Tilkynningar.",
        "",
        "----",
        "",
        "A new version",
        "",
        "We improved the map.",
        "",
        "You get this because you are a PuffinRide beta tester. Turn off beta news in Profile, under Notifications.",
      ].join("\n"),
    });
  });

  it("tell the person PuffinRide's answer to their appeal, the email with its words (spec 9, 3.4.4)", () => {
    const settings = defaultNotificationSettings;
    const answer = {
      kind: "appeal_answered",
      outcome: "upheld",
      answer: "The messages show it.",
    } as const;
    expect(notificationText(answer, "en", settings)).toEqual({
      title: "PuffinRide answered your appeal",
      body: "We looked again and the decision stands.",
      path: "/notices",
      open: "Open your notices in PuffinRide",
      emailBody: [
        "PuffinRide answered your appeal",
        "",
        "We looked again and the decision stands.",
        "",
        "Our answer: The messages show it.",
      ].join("\n"),
    });
    expect(notificationText({ ...answer, outcome: "reversed" }, "is", settings)).toMatchObject({
      title: "PuffinRide svaraði andmælum þínum",
      body: "Við skoðuðum málið aftur og breyttum ákvörðuninni.",
    });
  });

  it("tell the reporter the outcome in general terms only (spec 9, 3.1.6)", () => {
    const settings = defaultNotificationSettings;
    expect(
      notificationText({ kind: "report_closed", outcome: "action_taken" }, "en", settings),
    ).toEqual({
      title: "Your report",
      body: "We've looked into your report and taken action.",
      path: "/settings/reports",
    });
    expect(
      notificationText({ kind: "report_closed", outcome: "no_breach" }, "is", settings),
    ).toEqual({
      title: "Niðurstaða tilkynningar þinnar",
      body: "Við höfum skoðað tilkynninguna og fundum ekki brot á reglunum.",
      path: "/settings/reports",
    });
  });

  it("tell an operator only that a report came in, and whether about safety (spec 9, R9.9)", () => {
    const settings = defaultNotificationSettings;
    expect(notificationText({ kind: "report_filed" }, "en", settings)).toEqual({
      title: "New report",
      body: "Look at it in the console within 24 hours.",
      path: "/",
    });
    expect(notificationText({ kind: "report_filed_urgent" }, "is", settings)).toEqual({
      title: "Ný öryggistilkynning",
      body: "Skoðaðu hana strax í stjórnborðinu.",
      path: "/",
    });
    expect(smsText({ kind: "report_filed_urgent" }, "en")).toBe(
      "PuffinRide: a new safety report. Look at it in the console now.",
    );
    expect(smsText({ kind: "report_filed_urgent" }, "is")).toBe(
      "PuffinRide: ný öryggistilkynning. Skoðaðu hana strax í stjórnborðinu.",
    );
  });

  it("tell an operator in their language that a recovery code was used (spec 22)", () => {
    expect(
      notificationText({ kind: "console_recovered" }, "is", defaultNotificationSettings),
    ).toEqual({
      title: "PuffinRide: einhver komst inn í stjórnborðið með SMS-kóða",
      body: "SMS-kóði í símann þinn var notaður til að komast inn í stjórnborð PuffinRide og vista nýjan aðgangslykil. Ef þetta varst ekki þú skaltu taka hlutverkið af á þjóninum strax: operator remove.",
      path: "/admin",
      open: "Opna stjórnborðið",
    });
    expect(smsText({ kind: "console_recovered" }, "is")).toBe(
      "PuffinRide: SMS-kóði var notaður til að komast inn í stjórnborðið og vista nýjan aðgangslykil. Ef þetta varst ekki þú skaltu taka hlutverkið af á þjóninum strax (operator remove).",
    );
  });

  describe("about new members (spec 25)", () => {
    const since = new Date("2026-11-23T14:02:00.000Z");
    const facts = (count: number, total: number) =>
      ({ kind: "new_members", count, since, total }) as const;
    const text = (count: number, total: number, locale: "en" | "is") =>
      notificationText(facts(count, total), locale, defaultNotificationSettings);

    it("say how many joined, since when and how many there are, never who (R25.4)", () => {
      expect(text(2, 37, "en")).toEqual({
        title: "2 new members on PuffinRide",
        body: "Since 23 November at 14:02, 2 people have finished signing up. PuffinRide has 37 members now.",
        path: "/admin",
        open: "Open the console",
        footer:
          "You get this email because you turned on emails about new members in the PuffinRide console. Turn them off there, under Emails to you.",
      });
      expect(text(1, 1, "en")).toMatchObject({
        title: "A new member on PuffinRide",
        body: "Since 23 November at 14:02, 1 person has finished signing up. PuffinRide has 1 member now.",
      });
    });

    it("say it in Icelandic, with the singular after 21", () => {
      expect(text(2, 37, "is")).toEqual({
        title: "2 nýir notendur á PuffinRide",
        body: "Frá 23. nóvember kl. 14:02 hafa 2 lokið skráningu. Alls eru 37 notendur á PuffinRide.",
        path: "/admin",
        open: "Opna stjórnborðið",
        footer:
          "Þú færð þennan póst því þú kveiktir á pósti um nýja notendur í stjórnborði PuffinRide. Þú slekkur á honum þar, undir Tölvupóstur til þín.",
      });
      expect(text(21, 21, "is")).toMatchObject({
        title: "21 nýr notandi á PuffinRide",
        body: "Frá 23. nóvember kl. 14:02 hefur 21 lokið skráningu. Alls er 21 notandi á PuffinRide.",
      });
    });
  });
});
