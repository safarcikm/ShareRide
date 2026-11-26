import type { MyTrip } from "@shareride/contracts";
import { createTranslator } from "@shareride/i18n";
import { northBooking, northMyTrip, unpaidBooking } from "@/testing/bookings";
import { onTheDay, tripOnTheDay } from "@/testing/trip-day";
import { needCardTexts, needTagText } from "./need-texts";
import { mergeRides, needOf, type Ride } from "./rides";

// Spec 31, 3.3 item 3, 3.5 and 3.10: what a ride needs, in words.

const en = createTranslator("en");
const is = createTranslator("is");
/** Saturday 14 November 2026, noon in Iceland. */
const noon = new Date("2026-11-14T12:00:00Z");

const asRide = (ride: { booking: Parameters<typeof mergeRides>[0][number] } | { trip: MyTrip }) => {
  const [merged] =
    "booking" in ride
      ? mergeRides([ride.booking], [], "upcoming")
      : mergeRides([], [ride.trip], "upcoming");
  if (merged === undefined) throw new Error("Not a ride");
  return merged;
};

function texts(ride: Ride, at: Date, language: "en" | "is" = "en") {
  const need = needOf(ride, at);
  if (need === null) throw new Error("Needs nothing");
  const t = language === "en" ? en : is;
  return { tag: needTagText(t, ride, need, at), card: needCardTexts(t, language, ride, need, at) };
}

/** Anna's ride on Sunday at 09:00, Gunna asking for Borgarnes to Blönduós until 22:00 today. */
const asked = asRide({ trip: northMyTrip });

describe("a ride I drive with a request to answer", () => {
  it("names who asks, for what, and how long there is to answer", () => {
    expect(texts(asked, noon)).toEqual({
      tag: "Answer Gunna's request",
      card: {
        title: "Gunna asks for 1 seat",
        detail: "Borgarnes to Blönduós, Sun 15 Nov. 10 h left to answer.",
        action: "See the request",
      },
    });
  });

  it("says it in Icelandic without bending the name", () => {
    expect(texts(asked, noon, "is")).toEqual({
      tag: "Gunna bíður svars",
      card: {
        title: "Gunna biður um 1 sæti",
        detail: "Borgarnes → Blönduós, sun. 15. nóv. 10 klst. eftir til að svara.",
        action: "Sjá beiðnina",
      },
    });
  });

  it("counts the requests when there are several, with the ride's own ends", () => {
    const two = asRide({ trip: { ...northMyTrip, openRequests: 2 } });
    expect(texts(two, noon)).toEqual({
      tag: "2 requests to answer",
      card: {
        title: "2 requests to answer",
        detail: "BSÍ bus terminal to Hof, Akureyri, Sun 15 Nov. 10 h left to answer.",
        action: "See the requests",
      },
    });
  });

  it("counts one request from someone who has no name any more", () => {
    const nameless = asRide({
      trip: {
        ...northMyTrip,
        firstRequest:
          northMyTrip.firstRequest === null
            ? null
            : { ...northMyTrip.firstRequest, firstName: null },
      },
    });
    expect(texts(nameless, noon).tag).toBe("1 request to answer");
    expect(texts(nameless, noon).card).toMatchObject({
      title: "1 request to answer",
      action: "See the request",
    });
    // Nor when the list says someone asks and not who.
    const unnamed = asRide({ trip: { ...northMyTrip, firstRequest: null } });
    expect(texts(unnamed, noon).card.title).toBe("1 request to answer");
  });

  it("says minutes when little time is left", () => {
    expect(texts(asked, new Date("2026-11-14T21:40:30Z")).card.detail).toBe(
      "Borgarnes to Blönduós, Sun 15 Nov. 19 min left to answer.",
    );
  });
});

describe("a seat of mine to pay for", () => {
  /** Waiting for payment until 12:30 today. */
  const instant = asRide({ booking: unpaidBooking });
  const approved = asRide({
    booking: northBooking({
      ...unpaidBooking,
      trip: { ...unpaidBooking.trip, bookingMode: "approval" },
    }),
  });

  it("says the driver said yes when the driver approves, and by when to pay", () => {
    expect(texts(approved, noon)).toEqual({
      tag: "Pay by 12:30",
      card: {
        title: "Anna said yes: pay to keep your seat",
        detail: "Borgarnes to Blönduós, Sun 15 Nov. Pay by 12:30.",
        action: "Pay 2,900 ISK",
      },
    });
    expect(texts(approved, noon, "is").card.title).toBe(
      "Anna samþykkti: greiddu til að halda sætinu",
    );
  });

  it("names no answer on a seat booked instantly", () => {
    expect(texts(instant, noon).card.title).toBe("Pay to keep your seat");
  });

  it("says tomorrow when the deadline is on the next day", () => {
    const late = asRide({
      booking: northBooking({ ...unpaidBooking, paymentDueAt: "2026-11-15T08:10:00.000Z" }),
    });
    expect(texts(late, noon).tag).toBe("Pay by 08:10 tomorrow");
    expect(texts(late, noon).card.detail).toBe(
      "Borgarnes to Blönduós, Sun 15 Nov. Pay by 08:10 tomorrow.",
    );
  });

  it("stands a former member's name in for a driver who left", () => {
    const left = asRide({
      booking: northBooking({
        ...unpaidBooking,
        trip: { ...unpaidBooking.trip, bookingMode: "approval" },
        driver: { ...unpaidBooking.driver, firstName: null },
      }),
    });
    expect(texts(left, noon).card.title).toBe("A former member said yes: pay to keep your seat");
  });
});

describe("a ride on its trip day", () => {
  /** Gunna gets in at Borgarnes on Sunday at 10:00. */
  const seat = asRide({ booking: onTheDay() });
  /** Anna leaves BSÍ on Sunday at 09:00. */
  const drive = asRide({
    trip: { ...tripOnTheDay(), openRequests: 0, requestsCloseAt: null, firstRequest: null },
  });

  it("says when it leaves, until an hour before", () => {
    const early = new Date("2026-11-15T07:30:00Z");
    expect(texts(seat, early)).toEqual({
      tag: "Leaves at 10:00",
      card: {
        title: "Leaves at 10:00",
        detail: "Borgarnes to Blönduós, Sun 15 Nov.",
        action: "See your ride",
      },
    });
    expect(texts(drive, early).card).toEqual({
      title: "Leaves at 09:00",
      detail: "BSÍ bus terminal to Hof, Akureyri, Sun 15 Nov.",
      action: "See your ride",
    });
    expect(texts(drive, early, "is")).toEqual({
      tag: "Brottför kl. 09:00",
      card: {
        title: "Brottför kl. 09:00",
        detail: "BSÍ umferðarmiðstöð → Hof, Akureyri, sun. 15. nóv.",
        action: "Skoða ferðina",
      },
    });
  });

  it("counts the minutes within the hour before", () => {
    expect(texts(seat, new Date("2026-11-15T09:20:00Z")).tag).toBe("Leaves in 40 minutes");
    expect(texts(seat, new Date("2026-11-15T09:00:00Z")).tag).toBe("Leaves in 60 minutes");
    expect(texts(seat, new Date("2026-11-15T08:59:59Z")).tag).toBe("Leaves at 10:00");
    // Never none: the last minute is one.
    expect(texts(seat, new Date("2026-11-15T09:59:30Z")).tag).toBe("Leaves in 1 minute");
    expect(texts(seat, new Date("2026-11-15T09:20:00Z"), "is").tag).toBe(
      "Brottför eftir 40 mínútur",
    );
  });

  it("says Trip day once the time to leave has come", () => {
    expect(texts(seat, new Date("2026-11-15T10:00:00Z")).tag).toBe("Trip day");
    expect(texts(seat, new Date("2026-11-15T10:30:00Z")).card.title).toBe("Trip day");
  });
});
