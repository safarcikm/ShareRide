import { act, fireEvent, screen, within } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import type { AnswerDisputeBody, Booking, MyTrip } from "@shareride/contracts";
import { renderApp, completeMe } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { bookingApi, driverApi, northBooking, northMyTrip, paidBooking } from "@/testing/bookings";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { dispute, onTheDay, rider, tripOnTheDay } from "@/testing/trip-day";
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
// Sunday 15 November 2026, 10:15 in Iceland: Gunna was to get in at
// Borgarnes at 10:00, and the 10-minute wait has passed.
const afterTheWait = new Date("2026-11-15T10:15:00Z");
let mockNow = afterTheWait;
jest.mock("@/lib/clock", () => ({ now: () => mockNow }));

afterEach(() => {
  mockNow = afterTheWait;
});

const bookingId = paidBooking.id;
const disputeId = dispute().id;
const minuteMs = 60_000;
const hourMs = 60 * minuteMs;

const bodiesOf = (client: FakeClient, path: string) =>
  client.calls.filter((call) => call.path === path).map((call) => call.input["body"]);

/**
 * Gunna's booking page, on a server that takes her report and her answer
 * as the API would, unless `report` or `answer` says what they answer.
 */
async function openBooking(
  start: Booking,
  answers: { report?: () => unknown; answer?: () => unknown } = {},
) {
  let booking = start;
  return renderApp(`/bookings/${bookingId}`, {
    me: completeMe,
    setUp: (client) => {
      bookingApi(client, () => booking);
      client.answer("/v1/bookings/{id}/driver-absent", () => {
        if (answers.report !== undefined) return answers.report();
        const raisedAt = mockNow.toISOString();
        booking = { ...booking, dispute: dispute({ kind: "driver_absent", raisedAt }) };
        return ok(200, booking.dispute);
      });
      client.answer("/v1/disputes/{id}/answer", (input) => {
        if (answers.answer !== undefined) return answers.answer();
        booking = { ...booking, dispute: answered(booking, input["body"] as AnswerDisputeBody) };
        return ok(200, booking.dispute);
      });
    },
  });
}

/** The report once answered: contested, it waits for PuffinRide; agreed, it stands. */
function answered(booking: Booking, body: AnswerDisputeBody) {
  const at = mockNow.toISOString();
  const open = booking.dispute ?? dispute();
  return body.answer === "contested"
    ? { ...open, answer: "contested" as const, answeredAt: at }
    : {
        ...open,
        answer: "agreed" as const,
        answeredAt: at,
        outcome: "stands" as const,
        decidedBy: "system" as const,
        decidedAt: at,
      };
}

const driverAbsent = { name: "The driver didn't come" } as const;

describe("The driver didn't come (spec 8, 3.4; R8.5)", () => {
  it("is offered on the trip day once the wait after the passenger's time has passed", async () => {
    await openBooking(onTheDay());
    // In the bar, where "I'm here" is (spec 31, 3.9): it is the thing to do now.
    const bar = within(await screen.findByTestId("bottom-bar"));
    const report = bar.getByRole("link", driverAbsent);
    // After the chat: talking to the driver comes first.
    const links = screen.getAllByRole("link");
    expect(links.indexOf(report)).toBeGreaterThan(
      links.indexOf(screen.getByRole("link", { name: "Message Anna" })),
    );
    expect(screen.getAllByRole("link", driverAbsent)).toHaveLength(1);
  });

  it("is not offered during the wait", async () => {
    mockNow = new Date("2026-11-15T10:09:00Z");
    await openBooking(onTheDay());
    expect(await screen.findByRole("button", { name: "I'm here" })).toBeVisible();
    expect(screen.queryByRole("link", driverAbsent)).toBeNull();
  });

  it("is still offered after the trip completes, until 24 hours after", async () => {
    mockNow = new Date("2026-11-16T15:59:00Z");
    await openBooking(onTheDay({ phase: "completed" }, { status: "completed" }));
    expect(await screen.findByRole("link", driverAbsent)).toBeVisible();
  });

  it("is gone more than 24 hours after the trip completed", async () => {
    mockNow = new Date("2026-11-16T16:01:00Z");
    await openBooking(onTheDay({ phase: "completed" }, { status: "completed" }));
    expect(await screen.findByText("Completed")).toBeVisible();
    expect(screen.queryByRole("link", driverAbsent)).toBeNull();
  });

  it("is not offered once the booking has a report", async () => {
    await openBooking(onTheDay({}, { dispute: dispute({ kind: "driver_absent" }) }));
    expect(await screen.findByRole("button", { name: "I'm here" })).toBeVisible();
    expect(screen.queryByRole("link", driverAbsent)).toBeNull();
  });

  it("says what happens next, takes a note only PuffinRide reads, and tells PuffinRide", async () => {
    const { client } = await openBooking(onTheDay());
    await fireEvent.press(await screen.findByRole("link", driverAbsent));
    expect(await screen.findByRole("header", driverAbsent)).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}/driver-absent`);
    expect(screen.getByText("Tell PuffinRide that Anna didn't come?")).toBeVisible();
    expect(
      screen.getByText(
        "Anna is told at once and has 24 hours to answer. If Anna agrees or doesn't answer, the booking is cancelled.",
      ),
    ).toBeVisible();
    expect(screen.getByText("You then get a full refund of 2,900 ISK.")).toBeVisible();
    expect(screen.getByText("Only PuffinRide reads this. Up to 500 characters.")).toBeVisible();
    await fireEvent.changeText(
      screen.getByLabelText("Note for PuffinRide (optional)"),
      "  Waited until 10:30 by the pumps.  ",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Tell PuffinRide" }));
    expect(
      await screen.findByText(
        "You told PuffinRide Anna didn't come. Anna can answer until 16 November at 10:15.",
      ),
    ).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
    expect(bodiesOf(client, "/v1/bookings/{id}/driver-absent")).toEqual([
      { note: "Waited until 10:30 by the pumps." },
    ]);
  });

  it("sends no note when none was written, and says nothing of a refund for a free ride", async () => {
    const free = { amount: 0, currency: "ISK" } as const;
    const { client } = await openBooking(onTheDay({}, { total: free }));
    await fireEvent.press(await screen.findByRole("link", driverAbsent));
    expect(await screen.findByText("Tell PuffinRide that Anna didn't come?")).toBeVisible();
    expect(screen.queryByText(/full refund/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Tell PuffinRide" }));
    expect(await screen.findByText(/You told PuffinRide Anna didn't come/)).toBeVisible();
    expect(bodiesOf(client, "/v1/bookings/{id}/driver-absent")).toEqual([{}]);
  });

  it("keeps a note over 500 characters from being sent", async () => {
    const { client } = await openBooking(onTheDay());
    await fireEvent.press(await screen.findByRole("link", driverAbsent));
    await fireEvent.changeText(
      await screen.findByLabelText("Note for PuffinRide (optional)"),
      "x".repeat(501),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Tell PuffinRide" }));
    expect(await screen.findAllByText("Keep the note to 500 characters.")).not.toHaveLength(0);
    expect(bodiesOf(client, "/v1/bookings/{id}/driver-absent")).toEqual([]);
  });

  it.each([
    [
      failure(409, "report_too_early", { allowedAt: "2026-11-15T10:20:00.000Z" }),
      "You can do this from 10:20.",
    ],
    [
      failure(409, "report_too_late"),
      "It's too late to report this: more than 24 hours have passed since the ride completed.",
    ],
    [
      failure(0, "network_error"),
      "We couldn't reach PuffinRide. Check your connection and try again.",
    ],
  ])("says why it could not tell PuffinRide (%#)", async (answer, said) => {
    await openBooking(onTheDay(), { report: () => answer });
    await fireEvent.press(await screen.findByRole("link", driverAbsent));
    await fireEvent.press(await screen.findByRole("button", { name: "Tell PuffinRide" }));
    expect(await screen.findByText(said)).toBeVisible();
  });

  it.each(["already_reported", "not_boarding", "not_found"])(
    "says the booking changed, with the way back to it (%s)",
    async (code) => {
      await openBooking(onTheDay(), { report: () => failure(409, code) });
      await fireEvent.press(await screen.findByRole("link", driverAbsent));
      await fireEvent.press(await screen.findByRole("button", { name: "Tell PuffinRide" }));
      expect(await screen.findByText("This booking changed since you opened it.")).toBeVisible();
      await fireEvent.press(screen.getByRole("button", { name: "Back to the booking" }));
      expect(screen).toHavePathname(`/bookings/${bookingId}`);
    },
  );

  it("waits for the driver, then for PuffinRide once the driver contests it", async () => {
    const reported = dispute({ kind: "driver_absent" });
    await openBooking(
      onTheDay(
        {},
        { dispute: { ...reported, answer: "contested", answeredAt: reported.raisedAt } },
      ),
    );
    expect(
      await screen.findByText("Anna says it's not right. PuffinRide will look into it and decide."),
    ).toBeVisible();
  });

  it("says PuffinRide cancelled it once it stands, with the refund", async () => {
    await openBooking(
      northBooking({
        ...paidBooking,
        status: "cancelled",
        confirmed: null,
        cancellation: {
          by: "driver",
          reason: "driver_absent",
          note: "",
          wholeTrip: false,
          refund: paidBooking.total,
          countsOnReliability: null,
        },
        dispute: {
          ...dispute({ kind: "driver_absent" }),
          outcome: "stands",
          decidedBy: "system",
          decidedAt: "2026-11-16T10:15:00.000Z",
        },
      }),
    );
    expect(
      await screen.findByText("Anna didn't come, so PuffinRide cancelled this booking."),
    ).toBeVisible();
    expect(
      screen.getByText("Full refund of 2,900 ISK, back to the card you paid with."),
    ).toBeVisible();
    expect(screen.queryByText("PuffinRide has looked into it and decided.")).toBeNull();
  });

  it("says the driver left without them when PuffinRide decides so (decision 4)", async () => {
    const marked = dispute();
    await openBooking(
      northBooking({
        ...paidBooking,
        status: "cancelled",
        confirmed: null,
        cancellation: {
          by: "driver",
          reason: "driver_absent",
          note: "",
          wholeTrip: false,
          refund: paidBooking.total,
          countsOnReliability: null,
        },
        dispute: {
          ...marked,
          answer: "contested",
          answeredAt: marked.raisedAt,
          outcome: "left_behind",
          decidedBy: "operator",
          decidedAt: "2026-11-16T10:15:00.000Z",
        },
      }),
    );
    expect(
      await screen.findByText("Anna left without you, so PuffinRide cancelled this booking."),
    ).toBeVisible();
    expect(
      screen.queryByText("Anna didn't come, so PuffinRide cancelled this booking."),
    ).toBeNull();
    expect(
      screen.getByText("Full refund of 2,900 ISK, back to the card you paid with."),
    ).toBeVisible();
    expect(screen.getByText("PuffinRide has looked into it and decided.")).toBeVisible();
  });
});

/** Gunna's booking once Anna marked her as a no-show, with the report open. */
const markedNoShow = (changes: Partial<Booking> = {}) =>
  onTheDay({ arrival: "no_show" }, { status: "no_show", dispute: dispute(), ...changes });

describe("Answering a no-show (spec 8, 3.3; R8.6)", () => {
  it("asks whether it's right, until when, and what not answering does", async () => {
    await openBooking(markedNoShow());
    expect(await screen.findByText("Anna says you didn't come.")).toBeVisible();
    expect(screen.getByText("Is this right?")).toBeVisible();
    expect(screen.getByText("Answer by 16 November at 16:00.")).toBeVisible();
    expect(
      screen.getByText("If you don't answer, it stands: no refund, and it shows on your profile."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "That's right" })).toBeVisible();
    expect(screen.getByRole("button", { name: "That's not right" })).toBeVisible();
    expect(screen.queryByText(/Marked as a no-show/)).toBeNull();
  });

  it("contests it with a note, then waits for PuffinRide", async () => {
    const { client } = await openBooking(markedNoShow());
    await fireEvent.press(await screen.findByRole("button", { name: "That's not right" }));
    expect(await screen.findByRole("header", { name: "Is this right?" })).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}/answer`);
    expect(screen.getByRole("radio", { name: "That's not right" })).toBeChecked();
    expect(
      screen.getByText(
        "PuffinRide looks at what you both said, when each of you said you were there and your messages, then decides.",
      ),
    ).toBeVisible();
    await fireEvent.changeText(
      screen.getByLabelText("What happened? (optional)"),
      "I was by the pumps from 09:55.",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send answer" }));
    expect(
      await screen.findByText("You said it's not right. PuffinRide will look into it and decide."),
    ).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${bookingId}`);
    expect(
      client.calls.find((call) => call.path === "/v1/disputes/{id}/answer")?.input,
    ).toMatchObject({
      params: { id: disputeId },
      body: { answer: "contested", note: "I was by the pumps from 09:55." },
    });
  });

  it("moves focus to the outcome once the no-show stands", async () => {
    await openBooking(markedNoShow());
    await fireEvent.press(await screen.findByRole("button", { name: "That's right" }));
    await screen.findByRole("radio", { name: "That's right" });
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    focusMoves.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Send answer" }));
    expect(
      await screen.findByText("Marked as a no-show: no refund, and it shows on your profile."),
    ).toBeVisible();
    expect(focusMoves).toHaveBeenCalledTimes(1);
    focusMoves.mockRestore();
  });

  it("agrees, after seeing what it means, and the no-show stands", async () => {
    const { client } = await openBooking(markedNoShow());
    await fireEvent.press(await screen.findByRole("button", { name: "That's right" }));
    expect(await screen.findByRole("radio", { name: "That's right" })).toBeChecked();
    expect(
      screen.getByText("The no-show stands: no refund, and it shows on your profile."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "That's not right" }));
    await fireEvent.press(screen.getByRole("radio", { name: "That's right" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send answer" }));
    expect(
      await screen.findByText("Marked as a no-show: no refund, and it shows on your profile."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "That's right" })).toBeNull();
    expect(bodiesOf(client, "/v1/disputes/{id}/answer")).toEqual([{ answer: "agreed" }]);
  });

  it.each([
    [failure(409, "answer_window_closed"), "The time to answer has passed."],
    [failure(409, "already_decided"), "This booking changed since you opened it."],
    [failure(409, "already_answered"), "This booking changed since you opened it."],
  ])("says why the answer was not taken (%#)", async (answer, said) => {
    await openBooking(markedNoShow(), { answer: () => answer });
    await fireEvent.press(await screen.findByRole("button", { name: "That's right" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Send answer" }));
    expect(await screen.findByText(said)).toBeVisible();
  });

  it("no longer asks once the time to answer has passed", async () => {
    mockNow = new Date("2026-11-16T16:01:00Z");
    await openBooking(markedNoShow());
    expect(await screen.findByText("The time to answer has passed.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "That's right" })).toBeNull();
  });

  it("says PuffinRide decided, and the outcome", async () => {
    await openBooking(
      markedNoShow({
        dispute: {
          ...dispute(),
          answer: "contested",
          answeredAt: "2026-11-15T11:00:00.000Z",
          outcome: "stands",
          decidedBy: "operator",
          decidedAt: "2026-11-16T09:00:00.000Z",
        },
      }),
    );
    expect(await screen.findByText("PuffinRide has looked into it and decided.")).toBeVisible();
    expect(
      screen.getByText("Marked as a no-show: no refund, and it shows on your profile."),
    ).toBeVisible();
  });
});

const tripId = northMyTrip.id;
const gunnaId = "0190a1d6-0000-7000-8000-0000000000c2";
const saidAtBorgarnes = { driverCheckedInAt: "2026-11-15T09:58:00.000Z" } as const;

/** Óli, in the car since BSÍ, and Gunna, who was to get in at Borgarnes. */
function riders(gunna: Partial<Booking> = {}, day: Parameters<typeof rider>[5] = saidAtBorgarnes) {
  return [
    rider("0190a1d6-0000-7000-8000-0000000000c1", "Óli", { board: 0, alight: 3 }, "here"),
    {
      ...rider(gunnaId, "Gunna", { board: 1, alight: 2 }, "not_here", "confirmed", day),
      ...gunna,
    },
  ];
}

/**
 * Anna's trip page for the north trip on its day, on a server that marks a
 * no-show and takes her answer as the API would, unless `mark` or `answer`
 * says what they answer.
 */
async function openDriverTrip(
  trip: MyTrip,
  start: Booking[],
  answers: { mark?: () => unknown; answer?: () => unknown } = {},
) {
  let bookings = start;
  let change: (id: string, next: (booking: Booking) => Booking) => Booking | undefined = () =>
    undefined;
  const rendered = await renderApp(`/drive/trips/${tripId}`, {
    me: completeMe,
    setUp: (client: FakeClient) => {
      tripsApi(client, [trip]);
      client.answer("/v1/me/trips/{id}", () => ok(200, trip), "get");
      const api = driverApi(client, bookings);
      change = (id, next) => {
        bookings = bookings.map((booking) => (booking.id === id ? next(booking) : booking));
        const changed = bookings.find((booking) => booking.id === id);
        if (changed === undefined) return undefined;
        api.remove(id);
        api.add(changed);
        return changed;
      };
      const idOf = (input: Record<string, unknown>) => (input["params"] as { id: string }).id;
      client.answer("/v1/bookings/{id}/no-show", (input) => {
        if (answers.mark !== undefined) return answers.mark();
        const marked = change(idOf(input), (booking) => ({
          ...booking,
          status: "no_show",
          tripDay: booking.tripDay === null ? null : { ...booking.tripDay, arrival: "no_show" },
          dispute: dispute({ raisedAt: mockNow.toISOString() }),
        }));
        return ok(200, marked?.dispute);
      });
      client.answer("/v1/disputes/{id}/answer", (input) => {
        if (answers.answer !== undefined) return answers.answer();
        const reported = bookings.find((booking) => booking.dispute?.id === idOf(input));
        if (reported === undefined) return failure(404, "not_found");
        const body = input["body"] as AnswerDisputeBody;
        const next = change(reported.id, (booking) => ({
          ...booking,
          dispute: answered(booking, body),
          ...(body.answer === "agreed" ? { status: "cancelled" as const, confirmed: null } : {}),
        }));
        return ok(200, next?.dispute);
      });
    },
  });
  /** Changes what the server holds for a booking, as the other side would. */
  return {
    ...rendered,
    change: (id: string, next: (booking: Booking) => Booking) => change(id, next),
  };
}

const markGunna = { name: "Mark as no-show: Gunna" } as const;

describe("Marking a no-show (spec 8, 3.3; R8.4)", () => {
  it("is offered for a passenger getting in, once the wait has passed and the driver said I'm here", async () => {
    await openDriverTrip(tripOnTheDay([0, 1]), riders());
    expect(await screen.findByRole("button", markGunna)).toBeVisible();
  });

  it("is not offered during the wait", async () => {
    mockNow = new Date("2026-11-15T10:09:00Z");
    await openDriverTrip(tripOnTheDay([0, 1]), riders());
    expect(await screen.findByText("Use this only when parked.")).toBeVisible();
    expect(screen.queryByRole("button", markGunna)).toBeNull();
  });

  it("asks for I'm here at that stop first", async () => {
    await openDriverTrip(tripOnTheDay([0]), riders({}, {}));
    expect(
      await screen.findByText("To mark a no-show here, press “I'm here” first."),
    ).toBeVisible();
    expect(screen.queryByRole("button", markGunna)).toBeNull();
  });

  it("confirms with what it does, takes a note for PuffinRide, and marks them", async () => {
    const { client } = await openDriverTrip(tripOnTheDay([0, 1]), riders());
    await fireEvent.press(await screen.findByRole("button", markGunna));
    expect(await screen.findByRole("header", markGunna)).toBeVisible();
    expect(screen).toHavePathname(`/bookings/${gunnaId}/no-show`);
    expect(
      screen.getByText(
        "Mark this passenger as a no-show? They get no refund, and it shows on their profile.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Gunna is told at once and can answer until 16 November at 16:00. If Gunna says it's not right, PuffinRide decides.",
      ),
    ).toBeVisible();
    await fireEvent.changeText(
      screen.getByLabelText("Note for PuffinRide (optional)"),
      "Waited until 10:15.",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Mark as no-show" }));
    expect(
      await screen.findByText(
        "You marked Gunna as a no-show. Gunna can answer until 16 November at 16:00.",
      ),
    ).toBeVisible();
    expect(screen).toHavePathname(`/drive/trips/${tripId}`);
    expect(screen.queryByRole("button", markGunna)).toBeNull();
    expect(bodiesOf(client, "/v1/bookings/{id}/no-show")).toEqual([
      { note: "Waited until 10:15." },
    ]);
  });

  it("moves focus to the report once, not again when it changes later", async () => {
    jest.useFakeTimers();
    const focusMoves = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    try {
      const { change } = await openDriverTrip(tripOnTheDay([0, 1]), riders());
      await fireEvent.press(await screen.findByRole("button", markGunna));
      focusMoves.mockClear();
      await fireEvent.press(await screen.findByRole("button", { name: "Mark as no-show" }));
      expect(await screen.findByText(/^You marked Gunna as a no-show\./)).toBeVisible();
      expect(focusMoves).toHaveBeenCalledTimes(1);
      // Gunna contests it; the page loads again on its own half a minute later.
      change(gunnaId, (booking) => ({
        ...booking,
        dispute:
          booking.dispute === null
            ? null
            : { ...booking.dispute, answer: "contested", answeredAt: "2026-11-15T10:16:00.000Z" },
      }));
      await act(() => jest.advanceTimersByTimeAsync(30_000));
      expect(
        await screen.findByText(
          "Gunna says it's not right. PuffinRide will look into it and decide.",
        ),
      ).toBeVisible();
      expect(focusMoves).toHaveBeenCalledTimes(1);
    } finally {
      focusMoves.mockRestore();
      jest.useRealTimers();
    }
  });

  it.each([
    [
      failure(409, "no_show_too_early", { allowedAt: "2026-11-15T10:20:00.000Z" }),
      "You can do this from 10:20.",
    ],
    [failure(409, "driver_not_checked_in"), "To mark a no-show here, press “I'm here” first."],
    [
      failure(409, "trip_completed"),
      "The ride has completed, so a no-show can no longer be marked.",
    ],
  ])("says why it could not mark them (%#)", async (answer, said) => {
    await openDriverTrip(tripOnTheDay([0, 1]), riders(), { mark: () => answer });
    await fireEvent.press(await screen.findByRole("button", markGunna));
    await fireEvent.press(await screen.findByRole("button", { name: "Mark as no-show" }));
    expect(await screen.findByText(said)).toBeVisible();
  });

  it.each(["already_reported", "not_confirmed"])(
    "says the booking changed, with the way back to the ride (%s)",
    async (code) => {
      await openDriverTrip(tripOnTheDay([0, 1]), riders(), { mark: () => failure(409, code) });
      await fireEvent.press(await screen.findByRole("button", markGunna));
      await fireEvent.press(await screen.findByRole("button", { name: "Mark as no-show" }));
      expect(await screen.findByText("This booking changed since you opened it.")).toBeVisible();
      await fireEvent.press(screen.getByRole("button", { name: "Back to the ride" }));
      expect(screen).toHavePathname(`/drive/trips/${tripId}`);
    },
  );

  it("shows when Gunna contests it", async () => {
    await openDriverTrip(
      tripOnTheDay([0, 1]),
      riders({
        status: "no_show",
        dispute: { ...dispute(), answer: "contested", answeredAt: "2026-11-15T10:30:00.000Z" },
      }),
    );
    expect(
      await screen.findByText(
        "Gunna says it's not right. PuffinRide will look into it and decide.",
      ),
    ).toBeVisible();
  });
});

describe("Answering the driver didn't come (spec 8, 3.4; R8.6)", () => {
  // 10:40: Gunna said Anna didn't come at 10:20.
  const reported = dispute({ kind: "driver_absent", raisedAt: "2026-11-15T10:20:00.000Z" });

  it("asks the driver on the trip page whether it's right, and until when", async () => {
    mockNow = new Date("2026-11-15T10:40:00Z");
    await openDriverTrip(tripOnTheDay([0, 1]), riders({ dispute: reported }));
    expect(await screen.findByRole("header", { name: "Reports" })).toBeVisible();
    expect(screen.getByText("Gunna says you didn't come.")).toBeVisible();
    expect(screen.getByText("Answer by 16 November at 10:20.")).toBeVisible();
    expect(
      screen.getByText(
        "If you don't answer, it stands: the booking is cancelled as if by you, and it shows on your profile.",
      ),
    ).toBeVisible();
    // Already reported: the driver answers instead of marking.
    expect(screen.queryByRole("button", markGunna)).toBeNull();
  });

  it("agrees, and the booking is cancelled as if by the driver", async () => {
    mockNow = new Date("2026-11-15T10:40:00Z");
    const { client } = await openDriverTrip(tripOnTheDay([0, 1]), riders({ dispute: reported }));
    await fireEvent.press(await screen.findByRole("button", { name: "That's right" }));
    expect(
      await screen.findByText(
        "The booking is cancelled as if by you: Gunna gets a full refund, and it shows on your profile.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Send answer" }));
    expect(await screen.findByText("The booking was cancelled as if by you.")).toBeVisible();
    expect(screen).toHavePathname(`/drive/trips/${tripId}`);
    expect(bodiesOf(client, "/v1/disputes/{id}/answer")).toEqual([{ answer: "agreed" }]);
  });

  it("says nothing of a refund on a free ride", async () => {
    mockNow = new Date("2026-11-15T10:40:00Z");
    const free = { amount: 0, currency: "ISK" } as const;
    await openDriverTrip(tripOnTheDay([0, 1]), riders({ dispute: reported, total: free }));
    await fireEvent.press(await screen.findByRole("button", { name: "That's right" }));
    expect(
      await screen.findByText(
        "The booking is cancelled as if by you, and it shows on your profile.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/full refund/)).toBeNull();
  });

  it("contests it, then waits for PuffinRide", async () => {
    mockNow = new Date("2026-11-15T10:40:00Z");
    await openDriverTrip(tripOnTheDay([0, 1]), riders({ dispute: reported }));
    await fireEvent.press(await screen.findByRole("button", { name: "That's not right" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Send answer" }));
    expect(
      await screen.findByText("You said it's not right. PuffinRide will look into it and decide."),
    ).toBeVisible();
  });

  it("is still asked after the trip has completed", async () => {
    mockNow = new Date(new Date(reported.answerBy).getTime() - hourMs);
    await openDriverTrip(
      { ...tripOnTheDay([0, 1]), status: "completed", phase: "completed" },
      riders({ status: "completed", dispute: reported }),
    );
    expect(await screen.findByText("Gunna says you didn't come.")).toBeVisible();
    expect(screen.getByRole("button", { name: "That's not right" })).toBeVisible();
  });
});
