import type { Booking } from "@shareride/contracts";
import { createTranslator } from "@shareride/i18n";
import { cancelledBooking, northBooking, paidBooking, unpaidBooking } from "@/testing/bookings";
import { completedBooking, aReview } from "@/testing/reviews";
import { dispute, onTheDay } from "@/testing/trip-day";
import { bookingRoad, bookingTitle } from "./title";

// Spec 31, 3.8 items 1 and 2, and 3.9 item 1: the title of a booked seat is
// where it stands, with one line on what happens next, and a road shows
// how far it has come.

const en = createTranslator("en");
const is = createTranslator("is");
/** Saturday 14 November 2026, noon in Iceland: the day before the north trip. */
const noon = new Date("2026-11-14T12:00:00Z");
/** The trip's day, with Borgarnes at 10:00. */
const onDay = (clock: string) => new Date(`2026-11-15T${clock}:00Z`);

const title = (booking: Booking, at = noon) => bookingTitle(en, "en", booking, at);
const titill = (booking: Booking, at = noon) => bookingTitle(is, "is", booking, at);

describe("the title of a booked seat", () => {
  it("says a request was sent, and until when the driver can answer", () => {
    expect(title(northBooking())).toEqual({
      over: null,
      title: "Request sent",
      line: "Anna has until 22:00 to answer.",
    });
    expect(titill(northBooking())).toEqual({
      over: null,
      title: "Beiðni send",
      line: "Anna hefur til 22:00 til að svara.",
    });
  });

  it("says the driver said yes and that the seat waits for payment, until when", () => {
    const accepted = northBooking({
      status: "accepted",
      requestExpiresAt: null,
      paymentDueAt: "2026-11-14T12:30:00.000Z",
    });
    expect(title(accepted)).toEqual({
      over: null,
      title: "Anna said yes: pay to keep your seat",
      line: "Your seat is held until 12:30.",
    });
    expect(titill(accepted)).toEqual({
      over: null,
      title: "Anna samþykkti: greiddu til að halda sætinu",
      line: "Sætið er frátekið fyrir þig til kl. 12:30.",
    });
  });

  it("asks to pay for a seat booked instantly, which nobody said yes to", () => {
    expect(title(unpaidBooking)).toEqual({
      over: null,
      title: "Pay to keep your seat",
      line: "Your seat is held until 12:30.",
    });
    expect(titill(unpaidBooking).title).toBe("Greiddu til að halda sætinu");
  });

  it("says tomorrow for a time to pay on the next day", () => {
    const late = { ...unpaidBooking, paymentDueAt: "2026-11-15T08:10:00.000Z" };
    expect(title(late).line).toBe("Your seat is held until 08:10 tomorrow.");
    expect(titill(late).line).toBe("Sætið er frátekið fyrir þig til kl. 08:10 á morgun.");
  });

  it("says the seat is confirmed, and when and where the driver picks you up", () => {
    expect(title(paidBooking)).toEqual({
      over: null,
      title: "Your seat is confirmed",
      line: "Sunday 15 November. Anna picks you up at 10:00 at Borgarnes.",
    });
    expect(titill(paidBooking)).toEqual({
      over: null,
      title: "Sætið þitt er staðfest",
      line: "Sunnudagur 15. nóvember. Anna sækir þig kl. 10:00. Mótsstaður: Borgarnes.",
    });
  });

  describe("on the trip day", () => {
    it("says when the ride leaves, with when and where under it", () => {
      expect(title(onTheDay(), onDay("08:00"))).toEqual({
        over: null,
        title: "Leaves at 10:00",
        line: "Today at 10:00 from Borgarnes.",
      });
      expect(titill(onTheDay(), onDay("08:00"))).toEqual({
        over: null,
        title: "Brottför kl. 10:00",
        line: "Í dag kl. 10:00. Mótsstaður: Borgarnes.",
      });
    });

    it("counts the minutes in the last hour", () => {
      expect(title(onTheDay(), onDay("09:50")).title).toBe("Leaves in 10 minutes");
      expect(titill(onTheDay(), onDay("09:50")).title).toBe("Brottför eftir 10 mínútur");
    });

    it("says the driver is at the meeting point once they said so", () => {
      const here = onTheDay({ driverCheckedInAt: "2026-11-15T09:45:00.000Z" });
      expect(title(here, onDay("09:50"))).toEqual({
        over: null,
        title: "Anna is at the meeting point",
        line: "Today at 10:00 from Borgarnes.",
      });
      expect(titill(here, onDay("09:50")).title).toBe("Anna er á mótsstaðnum");
    });

    it("is the trip day once the time to leave has come", () => {
      expect(title(onTheDay(), onDay("10:00")).title).toBe("Trip day");
      expect(titill(onTheDay(), onDay("10:05")).title).toBe("Ferðadagur");
    });

    it("leaves out today for a ride that leaves after midnight", () => {
      const night = new Date("2026-11-14T23:30:00Z");
      const board = { ...paidBooking.board, plannedAt: "2026-11-15T00:30:00.000Z" };
      expect(title(onTheDay({}, { board }), night).line).toBe("At 00:30 from Borgarnes.");
      expect(titill(onTheDay({}, { board }), night).line).toBe("Kl. 00:30. Mótsstaður: Borgarnes.");
    });
  });

  describe("once the ride is over", () => {
    const after = new Date("2026-11-16T09:00:00Z");

    it("asks how the ride was while it can be reviewed, and until when", () => {
      expect(title(completedBooking(), after)).toEqual({
        over: null,
        title: "How was your ride?",
        line: "You can review until 29 November at 16:00.",
      });
      expect(titill(completedBooking(), after)).toEqual({
        over: null,
        title: "Hvernig var ferðin?",
        line: "Þú getur skrifað umsögn til 29. nóvember kl. 16:00.",
      });
    });

    it.each([
      ["once reviewed", completedBooking({ mine: { ...aReview(5), revealed: false } }), after],
      ["once the 14 days are over", completedBooking(), new Date("2026-11-29T16:00:00Z")],
      ["while a report on it is open", { ...completedBooking(), dispute: dispute() }, after],
      [
        "about a driver who has left",
        { ...completedBooking(), driver: { ...completedBooking().driver, firstName: null } },
        after,
      ],
    ] as const)("says it is completed %s", (_, booking, at) => {
      expect(title(booking, at)).toEqual({ over: null, title: "Completed", line: null });
    });
  });

  describe("once it ended", () => {
    const rideCancelled = northBooking({
      status: "declined",
      cancellation: {
        by: "driver",
        reason: "weather",
        note: "",
        wholeTrip: true,
        refund: { amount: 0, currency: "ISK" },
        countsOnReliability: null,
      },
    });

    it.each([
      [
        "declined",
        northBooking({ status: "declined" }),
        "Declined",
        "The driver couldn't take this request",
        "Hafnað",
      ],
      [
        "expired with no answer",
        northBooking({ status: "expired" }),
        "Expired",
        "The driver didn't answer in time",
        "Útrunnin",
      ],
      [
        "expired with nothing paid",
        northBooking({
          status: "expired",
          requestExpiresAt: null,
          paymentDueAt: "2026-11-14T12:30:00.000Z",
        }),
        "Expired",
        "The time to pay ran out, so the seat was freed.",
        "Útrunnin",
      ],
      [
        "cancelled",
        cancelledBooking,
        "Cancelled",
        "You cancelled this booking: Plans changed",
        "Afbókuð",
      ],
      [
        "withdrawn",
        northBooking({ status: "cancelled", withdrawn: true }),
        "Withdrawn",
        "You withdrew this request. That never counts against you.",
        "Dregin til baka",
      ],
      [
        "declined with its ride cancelled",
        rideCancelled,
        "Cancelled",
        "Anna cancelled the ride: Weather",
        "Afbókuð",
      ],
      [
        "a no-show",
        onTheDay({}, { status: "no_show" }),
        "No-show",
        "Marked as a no-show: no refund, and it shows on your profile.",
        "Mætti ekki",
      ],
      [
        "a no-show on a ride paid in person",
        onTheDay({}, { status: "no_show", payment: "in_person" }),
        "No-show",
        "Marked as a no-show. It shows on your profile.",
        "Mætti ekki",
      ],
    ] as const)(
      "says a booking that ended %s is that, and why under it",
      (_, booking, english, why, icelandic) => {
        expect(title(booking)).toEqual({ over: null, title: english, line: why });
        expect(titill(booking).title).toBe(icelandic);
      },
    );

    it("says why in Icelandic too", () => {
      expect(titill(cancelledBooking).line).toBe("Þú afbókaðir þessa bókun: Breyttar áætlanir");
    });

    it("leaves why to the report while a no-show's report is open", () => {
      const reported = { ...onTheDay({}, { status: "no_show" }), dispute: dispute() };
      expect(title(reported)).toEqual({ over: null, title: "No-show", line: null });
    });

    it("says no more where the one who cancelled gave no reason", () => {
      const noReason = northBooking({
        ...cancelledBooking,
        cancellation: {
          by: "driver",
          reason: null,
          note: "",
          wholeTrip: false,
          refund: paidBooking.total,
          countsOnReliability: null,
        },
      });
      expect(title(noReason)).toEqual({ over: null, title: "Cancelled", line: null });
    });
  });

  it("names the day and the part for the driver, with where the booking stands", () => {
    expect(title({ ...paidBooking, viewer: "driver" })).toEqual({
      over: "Sunday 15 November",
      title: "Borgarnes to Blönduós",
      line: "Confirmed",
    });
    expect(titill({ ...paidBooking, viewer: "driver" })).toEqual({
      over: "Sunnudagur 15. nóvember",
      title: "Borgarnes → Blönduós",
      line: "Staðfest",
    });
  });
});

describe("the road of a booked seat", () => {
  const steps = ["Asked", "Confirmed", "Trip day", "Done"];

  it("goes Asked, Confirmed, Trip day, Done for a ride that was asked for", () => {
    expect(bookingRoad(en, northBooking())).toEqual({ steps, current: 0 });
    expect(bookingRoad(is, northBooking())?.steps).toEqual([
      "Beiðni",
      "Staðfest",
      "Ferðadagur",
      "Lokið",
    ]);
  });

  it("stays at Asked while a request the driver said yes to waits for payment", () => {
    expect(bookingRoad(en, northBooking({ status: "accepted" }))?.current).toBe(0);
  });

  it("moves on as the seat is confirmed, the day comes and the ride is done", () => {
    const asked = { trip: { ...paidBooking.trip, bookingMode: "approval" as const } };
    expect(bookingRoad(en, { ...paidBooking, ...asked })).toEqual({ steps, current: 1 });
    expect(bookingRoad(en, onTheDay({}, asked))).toEqual({ steps, current: 2 });
    expect(bookingRoad(en, { ...completedBooking(), ...asked })).toEqual({ steps, current: 3 });
  });

  it("starts at Confirmed for a ride booked instantly", () => {
    const instant = ["Confirmed", "Trip day", "Done"];
    expect(bookingRoad(en, paidBooking)).toEqual({ steps: instant, current: 0 });
    expect(bookingRoad(en, onTheDay())).toEqual({ steps: instant, current: 1 });
    expect(bookingRoad(en, completedBooking())).toEqual({ steps: instant, current: 2 });
  });

  it("has none before an instant booking is paid: nothing is confirmed yet", () => {
    expect(bookingRoad(en, unpaidBooking)).toBeNull();
  });

  it.each([
    ["declined", northBooking({ status: "declined" })],
    ["expired", northBooking({ status: "expired" })],
    ["cancelled", cancelledBooking],
    ["a no-show", onTheDay({}, { status: "no_show" })],
  ] as const)("has none for a booking that ended %s", (_, booking) => {
    expect(bookingRoad(en, booking)).toBeNull();
  });

  it("has none for the driver, whose ride has its own page", () => {
    expect(bookingRoad(en, { ...paidBooking, viewer: "driver" })).toBeNull();
  });
});
