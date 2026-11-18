import { fireEvent, screen, within } from "expo-router/testing-library";
import type { Booking, MyReport, FileReportBody } from "@shareride/contracts";
import { Linking } from "react-native";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  bookingApi,
  cancellationPreview,
  driverApi,
  northBooking,
  northMyTrip,
  northStop,
  paidBooking,
  requestToDrive,
} from "@/testing/bookings";
import { callsTo, chatMessage, chatServer, messageId, openedLine } from "@/testing/chat";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { newcomer } from "@/testing/people";
import { northResult, northTrip, tripDetailsApi } from "@/testing/search";
import { tripsApi } from "@/testing/trips";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland: the trip is on Sunday.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

afterEach(() => {
  jest.restoreAllMocks();
});

const filed = (changes: Partial<MyReport> = {}): MyReport => ({
  id: "0190a1d6-0000-7000-8000-0000000000d1",
  kind: "trip",
  category: "not_as_listed",
  firstName: "Anna",
  filedAt: "2026-11-12T09:00:00.000Z",
  status: "open",
  outcome: null,
  closedAt: null,
  ...changes,
});

/** Answers POST /v1/reports with `answer`, or as the server would. */
function reportsApi(client: FakeClient, answer?: () => unknown) {
  client.answer(
    "/v1/reports",
    (input) => {
      const { kind } = (input["body"] as FileReportBody).about;
      // A person reported from their profile is a report about a person.
      return answer?.() ?? ok(201, filed({ kind: kind === "profile" ? "user" : kind }));
    },
    "post",
  );
}

const reportsSent = (client: FakeClient) =>
  callsTo(client, "/v1/reports", () => true).map((call) => (call.input as { body: unknown }).body);

async function openTrip(changes: Parameters<typeof northTrip>[1] = {}, signedIn = true) {
  const app = await renderApp(`/trips/${northResult.tripId}?from=1&to=2`, {
    ...(signedIn ? { me: completeMe } : {}),
    setUp: (client) => {
      tripDetailsApi(client, () => ok(200, northTrip({ board: 1, alight: 2 }, changes)));
      reportsApi(client);
    },
  });
  expect(await screen.findByRole("header", { name: "Borgarnes → Blönduós" })).toBeVisible();
  return app;
}

describe("Reporting a trip (spec 9, 3.1)", () => {
  it("asks what happened, sends it, and thanks", async () => {
    const { client } = await openTrip();
    await fireEvent.press(screen.getByRole("button", { name: "Report this trip" }));
    expect(await screen.findByRole("header", { name: "Report this trip" })).toBeVisible();
    expect(screen).toHaveSearchParams({ kind: "trip", id: northResult.tripId });

    // Nothing is sent before choosing what happened.
    await fireEvent.press(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText("Choose what happened.")).toBeVisible();
    expect(reportsSent(client)).toEqual([]);

    await fireEvent.press(screen.getByRole("radio", { name: "The trip wasn't as listed" }));
    await fireEvent.changeText(
      screen.getByLabelText("Tell us more (optional)"),
      "  The car was not the one listed.  ",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send report" }));

    expect(
      await screen.findByRole("header", { name: "Thank you. We look at every report." }),
    ).toBeVisible();
    expect(reportsSent(client)).toEqual([
      {
        about: { kind: "trip", tripId: northResult.tripId },
        category: "not_as_listed",
        description: "The car was not the one listed.",
      },
    ]);
    // A trip is no booking the two share: nothing to block through.
    expect(screen.queryByRole("button", { name: "Block Anna too" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(screen).toHavePathname(`/trips/${northResult.tripId}`);
  });

  it("is not offered for my own trip", async () => {
    await openTrip({ part: { state: "own" }, drivenByMe: true });
    expect(screen.queryByRole("button", { name: "Report this trip" })).toBeNull();
  });

  it("is not offered to its driver once it has left, or been cancelled", async () => {
    await openTrip({ part: { state: "departed" }, drivenByMe: true });
    expect(screen.queryByRole("button", { name: "Report this trip" })).toBeNull();
  });

  it("is not offered signed out", async () => {
    await openTrip({}, false);
    expect(screen.queryByRole("button", { name: "Report this trip" })).toBeNull();
  });

  it("puts 112 first for a safety report (3.1.3)", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await openTrip();
    await fireEvent.press(screen.getByRole("button", { name: "Report this trip" }));
    expect(screen.queryByText("If you are in danger, call 112 now.")).toBeNull();

    await fireEvent.press(
      await screen.findByRole("radio", { name: "Safety: dangerous driving, threats or violence" }),
    );
    // Read out at once, as an alert, above what happened (3.1.3).
    expect(
      within(screen.getByRole("alert")).getByText("If you are in danger, call 112 now."),
    ).toBeVisible();
    await fireEvent.press(
      screen.getByRole("button", { name: "Emergency: 112. Calls the emergency number" }),
    );
    expect(open).toHaveBeenCalledWith("tel:112");
    open.mockRestore();
  });

  it("asks for a shorter description over 1 000 characters, and sends nothing", async () => {
    const { client } = await openTrip();
    await fireEvent.press(screen.getByRole("button", { name: "Report this trip" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Something else" }));
    await fireEvent.changeText(screen.getByLabelText("Tell us more (optional)"), "a".repeat(1001));
    expect(screen.getByText("Shorten it to 1000 characters or fewer.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Send report" }));
    expect(reportsSent(client)).toEqual([]);
  });

  it.each([
    [
      "too_many_reports",
      429,
      "You've sent many reports in the last 24 hours. Try again later, or call 112 if you are in danger.",
    ],
    ["not_found", 404, "This can no longer be reported."],
    ["internal_error", 500, "Something went wrong on our side. Try again."],
  ] as const)("says so when the server answers %s", async (code, status, text) => {
    await renderApp(`/trips/${northResult.tripId}?from=1&to=2`, {
      me: completeMe,
      setUp: (client) => {
        tripDetailsApi(client);
        reportsApi(client, () => failure(status, code));
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Report this trip" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "Something else" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText(text)).toBeVisible();
  });
});

describe("Reporting from a conversation (spec 9, 3.1.1)", () => {
  const unkind = chatMessage({
    id: messageId(7),
    text: "Something unkind",
    sentAt: "2026-11-14T11:55:00.000Z",
  });

  async function openConversation() {
    const app = await renderApp(`/messages/${paidBooking.id}`, {
      me: completeMe,
      setUp: (client) => {
        chatServer(client, { booking: paidBooking, messages: [openedLine, unkind] });
        bookingApi(client, () => paidBooking);
        client.answer("/v1/bookings/{id}/cancellation-preview", () =>
          ok(200, cancellationPreview(paidBooking.total, true, "passenger")),
        );
        client.answer("/v1/bookings/{id}/block", () => ok(200, { together: [] }), "post");
        reportsApi(client);
      },
    });
    expect(await screen.findByText("Something unkind")).toBeVisible();
    return app;
  }

  it("reports the person through the booking, then offers to block them too", async () => {
    const { client } = await openConversation();
    expect(screen.getByText("Press and hold a message to report it.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Report Anna" }));
    expect(await screen.findByRole("header", { name: "Report Anna" })).toBeVisible();
    // Anna is named from the booking, not from the address.
    expect(screen).toHaveSearchParams({ kind: "user", id: paidBooking.id });
    expect(
      screen.getByText(
        "This report doesn't let us read your conversation. To show us something they wrote, report that message in the chat instead.",
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Harassment or unwanted contact" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send report" }));

    expect(
      await screen.findByRole("header", { name: "Thank you. We look at every report." }),
    ).toBeVisible();
    expect(reportsSent(client)).toEqual([
      {
        about: { kind: "user", bookingId: paidBooking.id },
        category: "harassment",
        description: "",
      },
    ]);
    await fireEvent.press(screen.getByRole("button", { name: "Block Anna too" }));
    expect(screen).toHavePathname(`/bookings/${paidBooking.id}/block`);
  });

  it("reports a message pressed and held", async () => {
    const { client } = await openConversation();
    await fireEvent(screen.getByText("Something unkind"), "longPress");
    expect(await screen.findByRole("header", { name: "Report message" })).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Offensive content" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send report" }));
    await screen.findByRole("header", { name: "Thank you. We look at every report." });
    expect(reportsSent(client)).toEqual([
      { about: { kind: "message", messageId: unkind.id }, category: "offensive", description: "" },
    ]);
  });

  it("offers reporting a message to a screen reader as an action", async () => {
    await openConversation();
    await fireEvent(screen.getByText("Something unkind"), "accessibilityAction", {
      nativeEvent: { actionName: "report" },
    });
    expect(await screen.findByRole("header", { name: "Report message" })).toBeVisible();
  });
});

describe("Reporting a problem with a booking (spec 9, 3.1.1; R9.1)", () => {
  async function openBooking(booking: Booking) {
    return renderApp(`/bookings/${booking.id}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => booking);
        reportsApi(client);
      },
    });
  }

  it("is offered on a confirmed booking, about the booking", async () => {
    await openBooking(paidBooking);
    await fireEvent.press(
      await screen.findByRole("button", { name: "Report a problem with this trip" }),
    );
    expect(
      await screen.findByRole("header", { name: "Report a problem with this trip" }),
    ).toBeVisible();
  });

  it("is not offered once the time to report has passed", async () => {
    await openBooking({ ...paidBooking, status: "completed", problemReportable: false });
    expect(await screen.findByRole("button", { name: "Message Anna" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Report a problem with this trip" })).toBeNull();
  });

  it("is not offered for a request", async () => {
    // As the server answers for a request.
    await openBooking({
      ...paidBooking,
      status: "requested",
      confirmed: null,
      problemReportable: false,
    });
    expect(await screen.findByRole("button", { name: "Withdraw request" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Report a problem with this trip" })).toBeNull();
  });
});

describe("Reporting from the driver's trip (spec 9, 3.1.1)", () => {
  const jon = northBooking({
    id: "0190a1d6-0000-7000-8000-0000000000b5",
    viewer: "driver",
    status: "confirmed",
    board: northStop(0),
    alight: northStop(2),
    requestExpiresAt: null,
    passenger: {
      firstName: "Jón",
      colour: 3,
      memberSince: "2026-10",
      profileId: null,
      ...newcomer,
    },
    confirmed: { registration: "AB 123", whereToStand: null },
  });

  async function openDriverTrip() {
    const app = await renderApp(`/drive/trips/${northMyTrip.id}`, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [northMyTrip]);
        driverApi(client, [requestToDrive, jon]);
        reportsApi(client);
      },
    });
    expect(await screen.findByLabelText("Jón, 1 seat, Confirmed")).toBeVisible();
    return app;
  }

  it("reports a passenger, named from the booking", async () => {
    const { client } = await openDriverTrip();
    await fireEvent.press(screen.getByRole("button", { name: "Report Jón" }));
    expect(await screen.findByRole("header", { name: "Report Jón" })).toBeVisible();
    expect(screen).toHaveSearchParams({ kind: "user", id: jon.id });
    await fireEvent.press(screen.getByRole("radio", { name: "Something else" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send report" }));
    await screen.findByRole("header", { name: "Thank you. We look at every report." });
    expect(reportsSent(client)).toEqual([
      { about: { kind: "user", bookingId: jon.id }, category: "other", description: "" },
    ]);
  });

  it("reports the person behind an unkind request", async () => {
    await openDriverTrip();
    await fireEvent.press(screen.getByRole("button", { name: "Report Gunna" }));
    expect(await screen.findByRole("header", { name: "Report Gunna" })).toBeVisible();
    expect(screen).toHaveSearchParams({ kind: "user", id: requestToDrive.id });
  });
});

describe("My reports in Settings (spec 9, 3.1.7)", () => {
  async function openReports(answer: () => unknown) {
    await renderApp("/settings", {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/me/reports", answer, "get");
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "My reports" }));
  }

  it("lists what I reported, when, and what was found", async () => {
    await openReports(() =>
      ok(200, {
        reports: [
          filed(),
          filed({
            id: "0190a1d6-0000-7000-8000-0000000000d2",
            kind: "message",
            category: "harassment",
            firstName: null,
            status: "closed",
            outcome: "action_taken",
            closedAt: "2026-11-13T09:00:00.000Z",
          }),
        ],
      }),
    );
    expect(await screen.findByText("Trip: Anna")).toBeVisible();
    expect(screen.getByText("The trip wasn't as listed · Sent 12 November 2026")).toBeVisible();
    expect(screen.getByText("We look at every report within 24 hours.")).toBeVisible();
    expect(screen.getByText("Message: a former member")).toBeVisible();
    expect(screen.getByText("We've looked into your report and taken action.")).toBeVisible();
  });

  it("says when there is nothing, and offers to try again after a failure", async () => {
    let attempts = 0;
    await openReports(() => {
      attempts += 1;
      return attempts === 1 ? failure(500, "internal_error") : ok(200, { reports: [] });
    });
    expect(await screen.findByText("Your reports could not be loaded.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You haven't reported anything.")).toBeVisible();
  });
});
