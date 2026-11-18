import { fireEvent, screen } from "expo-router/testing-library";
import type { Booking, BookingReview, MyTrip, ReviewBody } from "@shareride/contracts";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { bookingApi, driverApi } from "@/testing/bookings";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { aReview, completedBooking, completedRider, reviewsCloseAt } from "@/testing/reviews";
import { dispute, tripOnTheDay } from "@/testing/trip-day";
import { tripsApi } from "@/testing/trips";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({
  getLocales: jest.fn(() => [{ languageTag: "en-GB" }]),
}));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Tuesday 17 November 2026, noon: the north trip completed on Sunday at 16:00.
const twoDaysOn = new Date("2026-11-17T12:00:00Z");
let mockNow = twoDaysOn;
jest.mock("@/lib/clock", () => ({ now: () => mockNow }));

afterEach(() => {
  mockNow = twoDaysOn;
});

const bodiesOf = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/bookings/{id}/review")
    .map((call) => call.input["body"]);

/**
 * The booking's page, or its rate screen, on a server that takes a review
 * as the API would (shown at once when `theirs` is already written), unless
 * `review` says what it answers.
 */
async function open(start: Booking, path: string, answers: { review?: () => unknown } = {}) {
  let booking = start;
  return renderApp(path, {
    me: completeMe,
    setUp: (client) => {
      bookingApi(client, () => booking);
      client.answer("/v1/bookings/{id}/review", (input) => {
        if (answers.review !== undefined) return answers.review();
        booking = { ...booking, review: written(booking, input["body"] as ReviewBody) };
        return ok(200, booking.review);
      });
    },
  });
}

/** The booking's reviews once this one is written: both show if the other was. */
function written(booking: Booking, body: ReviewBody): BookingReview {
  const review = booking.review ?? { closesAt: reviewsCloseAt, mine: null, theirs: null };
  return {
    ...review,
    mine: { ...aReview(body.rating, body.comment ?? ""), revealed: review.theirs !== null },
  };
}

const bookingPage = (booking: Booking) => `/bookings/${booking.id}`;
const ratePage = (booking: Booking) => `/bookings/${booking.id}/rate`;
const rateDriver = { name: "Rate the driver" } as const;
const send = { name: "Send review" } as const;
const reportOpen = "You can review this trip once the report about it is settled.";
const personLeft = "This person has left ShareRide, so they can't be reviewed.";

/** Gunna's completed booking while her report that Anna didn't come waits to be decided. */
const withOpenReport = (): Booking => ({
  ...completedBooking(),
  dispute: dispute({ kind: "driver_absent", answer: "contested" }),
});

/** Gunna's completed booking once Anna, the driver, has left ShareRide. */
function withFormerDriver(): Booking {
  const booking = completedBooking();
  return { ...booking, driver: { ...booking.driver, firstName: null } };
}

describe("rating the driver from the booking (spec 8, 3.7)", () => {
  it("offers it once the booking completed, with until when", async () => {
    await open(completedBooking(), bookingPage(completedBooking()));
    expect(await screen.findByRole("button", rateDriver)).toBeVisible();
    expect(screen.getByText("You can review until 29 November at 16:00.")).toBeVisible();
  });

  it("waits while a report on the booking is open (3.7.3)", async () => {
    await open(withOpenReport(), bookingPage(withOpenReport()));
    expect(await screen.findByText(reportOpen)).toBeVisible();
    expect(screen.queryByRole("button", rateDriver)).toBeNull();
  });

  it("is not offered about a driver who has left ShareRide", async () => {
    await open(withFormerDriver(), bookingPage(withFormerDriver()));
    expect(await screen.findByText(personLeft)).toBeVisible();
    expect(screen.queryByRole("button", rateDriver)).toBeNull();
  });

  it("is not offered before the booking completes", async () => {
    const booking = { ...completedBooking(), status: "confirmed" as const, review: null };
    await open(booking, bookingPage(booking));
    expect(await screen.findByText("Anna")).toBeVisible();
    expect(screen.queryByRole("button", rateDriver)).toBeNull();
  });

  it("is not offered once the 14 days are over", async () => {
    mockNow = new Date(reviewsCloseAt);
    await open(completedBooking(), bookingPage(completedBooking()));
    expect(await screen.findByText("Completed")).toBeVisible();
    expect(screen.queryByRole("button", rateDriver)).toBeNull();
  });

  it("shows the review sent, hidden from the driver until both have reviewed", async () => {
    const booking = completedBooking({
      mine: { ...aReview(4, "Smooth drive."), revealed: false },
    });
    await open(booking, bookingPage(booking));
    expect(await screen.findByText("Your review")).toBeVisible();
    expect(screen.getByLabelText("4 stars out of 5")).toBeVisible();
    // The number shows next to the stars (spec 15, 4.1).
    expect(screen.getByText("4/5")).toBeVisible();
    expect(screen.getByText("Smooth drive.")).toBeVisible();
    expect(
      screen.getByText(
        "Your review appears when the other person has reviewed too, or after 14 days.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", rateDriver)).toBeNull();
  });

  it("shows the driver's review of the passenger once it shows", async () => {
    const booking = completedBooking({
      mine: { ...aReview(5), revealed: true },
      theirs: aReview(4, "On time, and friendly."),
    });
    await open(booking, bookingPage(booking));
    expect(await screen.findByText("Review of you")).toBeVisible();
    expect(screen.getByLabelText("5 stars out of 5")).toBeVisible();
    expect(screen.getByLabelText("4 stars out of 5")).toBeVisible();
    expect(screen.getByText("On time, and friendly.")).toBeVisible();
    expect(
      screen.queryByText(
        "Your review appears when the other person has reviewed too, or after 14 days.",
      ),
    ).toBeNull();
  });

  it("opens the rate screen", async () => {
    await open(completedBooking(), bookingPage(completedBooking()));
    await fireEvent.press(await screen.findByRole("button", rateDriver));
    expect(await screen.findByRole("header", { name: "How was your trip?" })).toBeVisible();
    expect(screen.getByLabelText("Rate the driver")).toHaveProp("accessibilityRole", "radiogroup");
  });
});

describe("the rate screen (spec 8, screen 6; R8.8)", () => {
  it("sends the stars and the comment, then says the review shows once both have reviewed", async () => {
    const { client } = await open(completedBooking(), ratePage(completedBooking()));
    expect(await screen.findByText("Anna")).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "4 stars" }));
    expect(screen.getByRole("radio", { name: "4 stars" })).toBeChecked();
    await fireEvent.changeText(
      screen.getByLabelText("Tell others what it was like (optional)"),
      "  Smooth drive.  ",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send review" }));
    expect(await screen.findByText("Review sent. Thank you.")).toBeVisible();
    expect(
      screen.getByText(
        "Your review appears when the other person has reviewed too, or after 14 days.",
      ),
    ).toBeVisible();
    expect(bodiesOf(client)).toEqual([{ rating: 4, comment: "Smooth drive." }]);
    expect(screen.getByRole("button", { name: "Back to the booking" })).toBeVisible();
  });

  it("leaves out an empty comment", async () => {
    const { client } = await open(completedBooking(), ratePage(completedBooking()));
    await fireEvent.press(await screen.findByRole("radio", { name: "5 stars" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send review" }));
    expect(await screen.findByText("Review sent. Thank you.")).toBeVisible();
    expect(bodiesOf(client)).toEqual([{ rating: 5 }]);
  });

  it("says both reviews show now when the other person had already reviewed", async () => {
    const booking = completedBooking({ theirs: null });
    await open(booking, ratePage(booking), {
      review: () =>
        ok(200, {
          closesAt: reviewsCloseAt,
          mine: { ...aReview(5), revealed: true },
          theirs: aReview(4),
        }),
    });
    await fireEvent.press(await screen.findByRole("radio", { name: "5 stars" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send review" }));
    expect(
      await screen.findByText("You have both reviewed, so both reviews show now."),
    ).toBeVisible();
  });

  it("asks for the stars first", async () => {
    const { client } = await open(completedBooking(), ratePage(completedBooking()));
    await fireEvent.press(await screen.findByRole("button", { name: "Send review" }));
    expect(await screen.findByText("Choose a rating from 1 to 5 stars.")).toBeVisible();
    expect(bodiesOf(client)).toEqual([]);
  });

  it("refuses contact details and a comment over 500 characters as they are typed", async () => {
    const { client } = await open(completedBooking(), ratePage(completedBooking()));
    await fireEvent.press(await screen.findByRole("radio", { name: "3 stars" }));
    const comment = screen.getByLabelText("Tell others what it was like (optional)");
    await fireEvent.changeText(comment, "Call me on 555 1234");
    expect(
      screen.getByText("Please don't share phone numbers, emails or links in a review."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Send review" }));
    await fireEvent.changeText(comment, "é".repeat(501));
    expect(screen.getAllByText("Keep the review to 500 characters.")[0]).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Send review" }));
    expect(bodiesOf(client)).toEqual([]);
    await fireEvent.changeText(comment, "é".repeat(500));
    expect(screen.queryByText("Keep the review to 500 characters.")).toBeNull();
  });

  it.each([
    ["review_window_closed", "Reviews of this trip closed 14 days after it ended."],
    ["report_open", reportOpen],
    ["person_left", personLeft],
    ["already_reviewed", "You have already reviewed this trip."],
    ["not_completed", "This booking changed since you opened it."],
  ])("says why a review was not taken, and stops: %s", async (code, said) => {
    await open(completedBooking(), ratePage(completedBooking()), {
      review: () => failure(409, code),
    });
    await fireEvent.press(await screen.findByRole("radio", { name: "2 stars" }));
    await fireEvent.press(screen.getByRole("button", send));
    expect(await screen.findByText(said)).toBeVisible();
    expect(screen.queryByRole("button", send)).toBeNull();
  });

  it("stops when the booking is no longer there", async () => {
    await open(completedBooking(), ratePage(completedBooking()), {
      review: () => failure(404, "not_found"),
    });
    await fireEvent.press(await screen.findByRole("radio", { name: "2 stars" }));
    await fireEvent.press(screen.getByRole("button", send));
    expect(await screen.findByText("This booking changed since you opened it.")).toBeVisible();
    expect(screen.queryByRole("button", send)).toBeNull();
  });

  it.each([
    ["rating", "invalid", "Choose a rating from 1 to 5 stars."],
    ["comment", "too_long", "Keep the review to 500 characters."],
    [
      "comment",
      "contact_details",
      "Please don't share phone numbers, emails or links in a review.",
    ],
    ["comment", "too_big", "Something went wrong on our side. Try again."],
  ])(
    "keeps the form when the server finds a problem with the %s (%s)",
    async (path, issue, said) => {
      await open(completedBooking(), ratePage(completedBooking()), {
        review: () => failure(400, "validation_failed", { details: [{ path, issue }] }),
      });
      await fireEvent.press(await screen.findByRole("radio", { name: "2 stars" }));
      await fireEvent.press(screen.getByRole("button", send));
      expect(await screen.findByText(said)).toBeVisible();
      expect(screen.getByRole("button", send)).toBeVisible();
    },
  );

  it("says at once that it waits while a report on the booking is open", async () => {
    await open(withOpenReport(), ratePage(withOpenReport()));
    expect(await screen.findByText(reportOpen)).toBeVisible();
    expect(screen.queryByRole("button", send)).toBeNull();
  });

  it("says at once that a driver who has left ShareRide can't be reviewed", async () => {
    await open(withFormerDriver(), ratePage(withFormerDriver()));
    expect(await screen.findByText(personLeft)).toBeVisible();
    expect(screen.queryByRole("button", send)).toBeNull();
  });

  it("says so when the booking was already reviewed before the screen opened", async () => {
    const booking = completedBooking({ mine: { ...aReview(5), revealed: false } });
    await open(booking, ratePage(booking));
    expect(await screen.findByText("You have already reviewed this trip.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send review" })).toBeNull();
  });

  it("says so when the 14 days are over", async () => {
    mockNow = new Date(reviewsCloseAt);
    await open(completedBooking(), ratePage(completedBooking()));
    expect(
      await screen.findByText("Reviews of this trip closed 14 days after it ended."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Send review" })).toBeNull();
  });
});

describe("a low rating (spec 8, 3.7.4)", () => {
  const wentWrong = "Did something go wrong?";
  const reportProblem = { name: "Report a problem with this trip" } as const;
  // Monday morning, within 24 hours of the trip, when a problem with it can
  // still be reported (R9.1); by Tuesday noon it can't.
  const nextMorning = new Date("2026-11-16T09:00:00Z");

  it("asks whether something went wrong after 1 or 2 stars, and offers a report on the trip", async () => {
    mockNow = nextMorning;
    const booking = completedBooking();
    const { client } = await open(booking, ratePage(booking));
    await fireEvent.press(await screen.findByRole("radio", { name: "3 stars" }));
    expect(screen.queryByText(wentWrong)).toBeNull();
    await fireEvent.press(screen.getByRole("radio", { name: "2 stars" }));
    expect(screen.getByText(wentWrong)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", reportProblem));
    expect(screen).toHavePathname("/report");
    expect(screen).toHaveSearchParams({ kind: "booking", id: booking.id });
    expect(bodiesOf(client)).toEqual([]);
  });

  it("offers to report the person once a problem with the trip can no longer be reported", async () => {
    const booking = { ...completedBooking(), problemReportable: false };
    await open(booking, ratePage(booking));
    await fireEvent.press(await screen.findByRole("radio", { name: "1 star" }));
    expect(screen.getByText(wentWrong)).toBeVisible();
    expect(screen.queryByRole("button", reportProblem)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Report Anna" }));
    expect(screen).toHavePathname("/report");
    expect(screen).toHaveSearchParams({ kind: "user", id: booking.id });
  });

  it("keeps a review not yet sent on coming back from the report", async () => {
    mockNow = nextMorning;
    await open(completedBooking(), ratePage(completedBooking()));
    await fireEvent.press(await screen.findByRole("radio", { name: "2 stars" }));
    const comment = "Late and in a hurry.";
    await fireEvent.changeText(
      screen.getByLabelText("Tell others what it was like (optional)"),
      comment,
    );
    await fireEvent.press(screen.getByRole("button", reportProblem));
    expect(await screen.findByRole("header", reportProblem)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("radio", { name: "2 stars" })).toBeChecked();
    expect(screen.getByLabelText("Tell others what it was like (optional)")).toHaveProp(
      "value",
      comment,
    );
    expect(screen.getByText(wentWrong)).toBeVisible();
  });

  it("offers the driver a report on a passenger they rate low", async () => {
    const gunna = {
      ...completedRider("0190a1d6-0000-7000-8000-0000000000c1", "Gunna"),
      problemReportable: false,
    };
    await open(gunna, ratePage(gunna));
    await fireEvent.press(await screen.findByRole("radio", { name: "1 star" }));
    expect(screen.getByText(wentWrong)).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Report Gunna" }));
    expect(screen).toHavePathname("/report");
    expect(screen).toHaveSearchParams({ kind: "user", id: gunna.id });
  });

  it("asks again once a low review is sent", async () => {
    mockNow = nextMorning;
    await open(completedBooking(), ratePage(completedBooking()));
    await fireEvent.press(await screen.findByRole("radio", { name: "1 star" }));
    await fireEvent.press(screen.getByRole("button", send));
    expect(await screen.findByText("Review sent. Thank you.")).toBeVisible();
    expect(screen.getByText(wentWrong)).toBeVisible();
    expect(screen.getByRole("button", reportProblem)).toBeVisible();
  });

  it("does not ask once a review of 3 stars or more is sent", async () => {
    await open(completedBooking(), ratePage(completedBooking()));
    await fireEvent.press(await screen.findByRole("radio", { name: "3 stars" }));
    await fireEvent.press(screen.getByRole("button", send));
    expect(await screen.findByText("Review sent. Thank you.")).toBeVisible();
    expect(screen.queryByText(wentWrong)).toBeNull();
  });
});

describe("the driver rates each passenger (spec 8, 3.7)", () => {
  const tripId = completedRider("x", "Gunna").trip.id;
  const completedTrip: MyTrip = {
    ...tripOnTheDay([0, 1]),
    status: "completed",
    phase: "completed",
  };

  async function openDriverTrip(bookings: Booking[]) {
    let current = bookings;
    return renderApp(`/drive/trips/${tripId}`, {
      me: completeMe,
      setUp: (client: FakeClient) => {
        tripsApi(client, [completedTrip]);
        client.answer("/v1/me/trips/{id}", () => ok(200, completedTrip), "get");
        const api = driverApi(client, bookings);
        client.answer("/v1/bookings/{id}/review", (input) => {
          const id = (input["params"] as { id: string }).id;
          const booking = current.find((one) => one.id === id);
          if (booking === undefined) return failure(404, "not_found");
          const changed = { ...booking, review: written(booking, input["body"] as ReviewBody) };
          current = current.map((one) => (one.id === id ? changed : one));
          api.remove(id);
          api.add(changed);
          return ok(200, changed.review);
        });
      },
    });
  }

  it("offers each passenger of the completed trip a review, named", async () => {
    await openDriverTrip([
      completedRider("0190a1d6-0000-7000-8000-0000000000c1", "Gunna"),
      completedRider("0190a1d6-0000-7000-8000-0000000000c2", "Siggi", {
        mine: { ...aReview(5), revealed: true },
        theirs: aReview(3, "Quiet ride."),
      }),
    ]);
    expect(await screen.findByRole("button", { name: "Rate your passenger: Gunna" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Rate your passenger: Siggi" })).toBeNull();
    expect(screen.getByText("Your review")).toBeVisible();
    expect(screen.getByText("Review of you")).toBeVisible();
    expect(screen.getByText("Quiet ride.")).toBeVisible();
  });

  it("offers no review of a passenger who has left ShareRide", async () => {
    const former = completedRider("0190a1d6-0000-7000-8000-0000000000c1", "Gunna");
    await openDriverTrip([{ ...former, passenger: { ...former.passenger, firstName: null } }]);
    expect(await screen.findByText(personLeft)).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Rate your passenger/ })).toBeNull();
  });

  it("rates a passenger, and the trip then shows the review sent instead of the button", async () => {
    const gunna = completedRider("0190a1d6-0000-7000-8000-0000000000c1", "Gunna", {
      theirs: null,
    });
    const { client } = await openDriverTrip([gunna]);
    await fireEvent.press(
      await screen.findByRole("button", { name: "Rate your passenger: Gunna" }),
    );
    expect(await screen.findByLabelText("Rate your passenger")).toHaveProp(
      "accessibilityRole",
      "radiogroup",
    );
    expect(screen.getByText("Gunna")).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "5 stars" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send review" }));
    expect(await screen.findByText("Review sent. Thank you.")).toBeVisible();
    expect(bodiesOf(client)).toEqual([{ rating: 5 }]);
    await fireEvent.press(screen.getByRole("button", { name: "Back to the trip" }));
    expect(await screen.findByText("Your review")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Rate your passenger: Gunna" })).toBeNull();
  });
});
