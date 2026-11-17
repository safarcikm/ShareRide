import { defaultNotificationSettings } from "@shareride/domain";
import { locales } from "@shareride/i18n";
import { describe, expect, it } from "vitest";
import {
  notificationText,
  smsText,
  type NotificationFacts,
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
      "ShareRide: the driver cancelled your booking for Saturday 14 November at 09:00. Full refund. Details in the app.",
    );
    expect(smsText({ ...facts, ...cancelled, refund: { amount: 0, currency: "ISK" } }, "is")).toBe(
      "ShareRide: Bílstjórinn aflýsti bókun þinni: laugardagur 14. nóvember kl. 09:00. Nánar í appinu.",
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
      title: "Trip cancelled: Weather",
      body: "BSÍ – Hof, Akureyri · Saturday 14 November at 09:00. Full refund of 5,600 ISK.",
      path: "/bookings/booking-1",
    });
    // A request, or a booking not paid for: nothing to refund.
    expect(text({ ...cancelled, refund: { amount: 0, currency: "ISK" } }, "is")).toMatchObject({
      title: "Ferð aflýst: Veður",
      body: "BSÍ – Hof, Akureyri · laugardagur 14. nóvember kl. 09:00. Leitaðu að annarri ferð.",
    });
    expect(smsText({ ...facts, ...cancelled }, "en")).toBe(
      "ShareRide: your trip on Saturday 14 November at 09:00 is cancelled. Full refund. Details in the app.",
    );
    expect(smsText({ ...facts, ...cancelled }, "is")).toBe(
      "ShareRide: Ferðinni þinni var aflýst: laugardagur 14. nóvember kl. 09:00. Full endurgreiðsla. Nánar í appinu.",
    );
    expect(smsText({ ...facts, ...cancelled, refund: { amount: 0, currency: "ISK" } }, "en")).toBe(
      "ShareRide: your trip on Saturday 14 November at 09:00 is cancelled. Details in the app.",
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
      "ShareRide: your trip on Saturday 14 November now leaves at 09:00. Keep it or cancel with a full refund in the app.",
    );
    expect(smsText({ ...far, paid: false }, "is")).toBe(
      "ShareRide: Ný brottför: laugardagur 14. nóvember kl. 09:00. Nánar í appinu.",
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

  it("refuse a kind that has no text yet", () => {
    expect(() => text({ kind: "meeting_point_changed" })).toThrow(
      /No text for meeting_point_changed/,
    );
  });

  it("tell of unread messages by the trip's day, never their text, and open the chat (3.6, item 3)", () => {
    const secret = { text: "My door code is 4512" };
    expect(text({ kind: "unread_messages", role: "passenger", message: secret })).toEqual({
      title: "You have unread messages about your trip on Saturday 14 November",
      body: "Open the chat in ShareRide to read them.",
      path: "/messages/booking-1",
    });
    expect(text({ kind: "unread_messages", role: "driver", message: secret }, "is")).toEqual({
      title: "Þú átt ólesin skilaboð um ferðina: laugardagur 14. nóvember",
      body: "Opnaðu spjallið í ShareRide til að lesa þau.",
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
      "ShareRide: a new safety report. Look at it in the console now.",
    );
    expect(smsText({ kind: "report_filed_urgent" }, "is")).toBe(
      "ShareRide: ný öryggistilkynning. Skoðaðu hana strax í stjórnborðinu.",
    );
  });
});
