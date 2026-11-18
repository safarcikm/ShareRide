import type { ChatMessage, SendMessageBody } from "@shareride/contracts";
import { act, fireEvent, screen } from "expo-router/testing-library";
import { AccessibilityInfo, ScrollView } from "react-native";
import { readPreference } from "@/lib/preferences";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import {
  bookingApi,
  driverApi,
  northBooking,
  northMyTrip,
  northStop,
  paidBooking,
} from "@/testing/bookings";
import {
  callsTo,
  chatBooking,
  chatMessage,
  chatServer,
  conversationOf,
  messageId,
  openedLine,
} from "@/testing/chat";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
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
// Saturday 14 November 2026, noon in Iceland.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));
jest.mock("@/chat/client-id", () => {
  let made = 0;
  return {
    newClientId: () => {
      made += 1;
      return `0190a1d6-0000-7000-8000-c${String(made).padStart(11, "0")}`;
    },
  };
});

const bookingId = chatBooking.id;
const conversationPage = `/messages/${bookingId}`;

const sends = (client: FakeClient) =>
  callsTo(client, "/v1/bookings/{id}/messages", (input) => "body" in input).map(
    (call) => call.input["body"] as Record<string, unknown>,
  );
const reads = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/bookings/{id}/messages/read")
    .map((call) => (call.input["body"] as { upTo: string }).upTo);

async function openConversation(
  start: Parameters<typeof chatServer>[1] = {},
  more: (client: FakeClient) => void = () => undefined,
) {
  let server: ReturnType<typeof chatServer> | undefined;
  const app = await renderApp(conversationPage, {
    me: completeMe,
    setUp: (client) => {
      server = chatServer(client, start);
      more(client);
    },
  });
  if (server === undefined) throw new Error("The fake chat server was not set up.");
  return { ...app, server };
}

async function write(text: string) {
  await fireEvent.changeText(await screen.findByLabelText("Write a message"), text);
  await fireEvent.press(screen.getByRole("button", { name: "Send" }));
}

describe("A conversation (spec 7, 3.1)", () => {
  const hi = chatMessage({
    id: messageId(2),
    text: "Hi! I'll wait by the pumps.",
    sentAt: "2026-11-14T11:55:00.000Z",
  });
  const seen = chatMessage({
    id: messageId(3),
    from: "me",
    text: "Great, thank you.",
    clientId: "0190a1d6-0000-7000-8000-a00000000003",
    sentAt: "2026-11-14T11:56:00.000Z",
    readAt: "2026-11-14T11:57:00.000Z",
  });
  const onMyWay = chatMessage({
    id: messageId(4),
    from: "me",
    kind: "quick",
    text: null,
    quick: { key: "onMyWay" },
    clientId: "0190a1d6-0000-7000-8000-a00000000004",
    sentAt: "2026-11-14T11:58:00.000Z",
  });

  it("shows the safety tip, the request message, then the messages oldest first, with Seen under my last read one", async () => {
    const { client } = await openConversation({ messages: [onMyWay, openedLine, seen, hi] });
    expect(await screen.findByRole("header", { name: "Anna" })).toBeVisible();
    expect(screen.getByText("Sunday 15 November · Borgarnes → Blönduós")).toBeVisible();
    expect(
      screen.getByText("Pay only in the app. ShareRide never asks for card details in a chat."),
    ).toBeVisible();
    expect(screen.getByText("Booking confirmed. You can message each other here.")).toBeVisible();
    expect(
      screen
        .getAllByLabelText(/^(You|Anna), /)
        .map((item) => (item.props as { accessibilityLabel: string }).accessibilityLabel),
    ).toEqual([
      "You, Sent with the request: One small bag.",
      "Anna, 11:55: Hi! I'll wait by the pumps.",
      "You, 11:56: Great, thank you. Seen",
      "You, 11:58: I'm on my way",
    ]);
    expect(screen.getAllByText(/ · Seen$/)).toHaveLength(1);
    expect(screen.getByText("11:56 · Seen")).toBeVisible();
    // Opening the conversation reads the other person's messages.
    expect(reads(client)).toEqual([hi.id]);
  });

  it("says Removed by ShareRide for a message ShareRide removed, mine or theirs, with nothing to report (spec 9, 3.4.3)", async () => {
    const theirs = chatMessage({
      id: messageId(5),
      text: null,
      removed: true,
      sentAt: "2026-11-14T11:59:00.000Z",
    });
    const mine = chatMessage({
      id: messageId(6),
      from: "me",
      text: null,
      removed: true,
      clientId: "0190a1d6-0000-7000-8000-a00000000006",
      sentAt: "2026-11-14T12:00:00.000Z",
    });
    await openConversation({ messages: [openedLine, theirs, mine] });
    expect(await screen.findAllByText("Removed by ShareRide")).toHaveLength(2);
    expect(
      screen
        .getAllByLabelText(/^(You|Anna), /)
        .map((item) => (item.props as { accessibilityLabel: string }).accessibilityLabel),
    ).toEqual([
      "You, Sent with the request: One small bag.",
      "Anna, 11:59: Removed by ShareRide",
      "You, 12:00: Removed by ShareRide",
    ]);
    // Nothing left to report, so no hint about how.
    expect(screen.queryByText(/Press and hold/)).toBeNull();
    const [removed] = screen.getAllByText("Removed by ShareRide");
    if (removed === undefined) throw new Error("No removed message.");
    await fireEvent(removed, "longPress");
    expect(screen.queryByRole("header", { name: "Report message" })).toBeNull();
  });

  it("says who cancelled the booking and why, in the reader's words (spec 6)", async () => {
    const cancelled = chatMessage({
      id: messageId(5),
      from: "system",
      kind: "system",
      text: null,
      system: { key: "cancelled", by: "them", reason: "car_problem", note: "", wholeTrip: false },
      sentAt: "2026-11-14T11:59:00.000Z",
    });
    await openConversation({ messages: [openedLine, cancelled] });
    expect(await screen.findByText("Anna cancelled the booking: Car problem")).toBeVisible();
  });

  it("quotes the driver's note after the reason, as written (spec 6, 3.4)", async () => {
    const cancelled = chatMessage({
      id: messageId(5),
      from: "system",
      kind: "system",
      text: null,
      system: {
        key: "cancelled",
        by: "them",
        reason: "car_problem",
        note: "Sorry, the clutch went.",
        wholeTrip: false,
      },
      sentAt: "2026-11-14T11:59:00.000Z",
    });
    await openConversation({ messages: [openedLine, cancelled] });
    expect(
      await screen.findByText("Anna cancelled the booking: Car problem “Sorry, the clutch went.”"),
    ).toBeVisible();
  });

  it("says when the departure moved, at the reader's own stop (spec 6, 3.2)", async () => {
    const moved = chatMessage({
      id: messageId(5),
      from: "system",
      kind: "system",
      text: null,
      system: {
        key: "departure_changed",
        from: "2026-11-15T10:00:00.000Z",
        to: "2026-11-15T10:45:00.000Z",
      },
      sentAt: "2026-11-14T11:59:00.000Z",
    });
    await openConversation({ messages: [openedLine, moved] });
    expect(await screen.findByText("Departure changed from 10:00 to 10:45")).toBeVisible();
  });

  it("says when the car changed, by its colour, make and model (spec 6, 3.2)", async () => {
    const newCar = chatMessage({
      id: messageId(5),
      from: "system",
      kind: "system",
      text: null,
      system: { key: "car_changed", car: { make: "Volvo", model: "XC40", colour: "red" } },
      sentAt: "2026-11-14T11:59:00.000Z",
    });
    await openConversation({ messages: [openedLine, newCar] });
    expect(await screen.findByText("New car: Red Volvo XC40")).toBeVisible();
  });

  it("says when a stop was added, by its name and time (spec 6, 3.2)", async () => {
    const newStop = chatMessage({
      id: messageId(5),
      from: "system",
      kind: "system",
      text: null,
      system: {
        key: "stop_added",
        stop: { is: "N1 Mosfellsbæ", en: "N1 Mosfellsbær" },
        plannedAt: "2026-11-15T10:20:00.000Z",
      },
      sentAt: "2026-11-14T11:59:00.000Z",
    });
    await openConversation({ messages: [openedLine, newStop] });
    expect(await screen.findByText("New stop: N1 Mosfellsbær at 10:20")).toBeVisible();
  });

  it("names a new stop in the app's language", async () => {
    jest
      .mocked(readPreference)
      .mockImplementation((key) => Promise.resolve(key === "language" ? "is" : null));
    try {
      const newStop = chatMessage({
        id: messageId(5),
        from: "system",
        kind: "system",
        text: null,
        system: {
          key: "stop_added",
          stop: { is: "N1 Mosfellsbæ", en: "N1 Mosfellsbær" },
          plannedAt: "2026-11-15T10:20:00.000Z",
        },
        sentAt: "2026-11-14T11:59:00.000Z",
      });
      await openConversation({ messages: [openedLine, newStop] });
      expect(await screen.findByText("Nýr viðkomustaður: N1 Mosfellsbæ kl. 10:20")).toBeVisible();
    } finally {
      jest.mocked(readPreference).mockImplementation(() => Promise.resolve(null));
    }
  });

  const removedStop = chatMessage({
    id: messageId(5),
    from: "system",
    kind: "system",
    text: null,
    system: { key: "stop_removed", stop: { is: "N1 Borgarnesi", en: "N1 Borgarnes" } },
    sentAt: "2026-11-14T11:59:00.000Z",
  });

  it("says when a stop was removed, by its name (spec 6, 3.2)", async () => {
    await openConversation({ messages: [openedLine, removedStop] });
    expect(await screen.findByText("Stop removed: N1 Borgarnes")).toBeVisible();
  });

  it("names a stop removed in the app's language", async () => {
    jest
      .mocked(readPreference)
      .mockImplementation((key) => Promise.resolve(key === "language" ? "is" : null));
    try {
      await openConversation({ messages: [openedLine, removedStop] });
      expect(await screen.findByText("Viðkomustaður felldur niður: N1 Borgarnesi")).toBeVisible();
    } finally {
      jest.mocked(readPreference).mockImplementation(() => Promise.resolve(null));
    }
  });

  it("shows the driver the passenger's name and their request message", async () => {
    await openConversation({
      booking: { ...chatBooking, viewer: "driver" },
      messages: [openedLine, { ...hi, text: "On my way!" }],
    });
    expect(await screen.findByRole("header", { name: "Gunna" })).toBeVisible();
    expect(screen.getByLabelText("Gunna, Sent with the request: One small bag.")).toBeVisible();
    expect(screen.getByLabelText("Gunna, 11:55: On my way!")).toBeVisible();
  });

  it("sends a text; one that fails stays as Not sent, and a tap sends it again with the same ID", async () => {
    const { client, server } = await openConversation();
    server.nextSends.push(() => failure(500, "internal_error"));
    await write("  Can I bring skis?  ");
    const notSent = await screen.findByRole("button", {
      name: "Not sent. Tap to try again. Can I bring skis?",
    });
    expect(screen.getByLabelText("Write a message")).toHaveDisplayValue("");

    await fireEvent.press(notSent);
    expect(await screen.findByLabelText("You, 12:01: Can I bring skis?")).toBeVisible();
    expect(screen.queryByText("Not sent. Tap to try again.")).toBeNull();
    const [first, second] = sends(client);
    expect(first).toEqual({ clientId: expect.any(String) as string, text: "Can I bring skis?" });
    expect(second).toEqual(first);
  });

  it("does not send an empty message", async () => {
    const { client } = await openConversation();
    await write("   ");
    expect(sends(client)).toEqual([]);
  });

  it("sends quick messages; I'm running late asks how many minutes", async () => {
    const { client } = await openConversation();
    await fireEvent.press(await screen.findByRole("button", { name: "Thank you!" }));
    expect(await screen.findByLabelText("You, 12:01: Thank you!")).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "I'm running late" }));
    expect(screen.getByText("How many minutes?")).toBeVisible();
    for (const minutes of ["5 min", "15 min", "30 min"]) {
      expect(screen.getByRole("button", { name: minutes })).toBeVisible();
    }
    await fireEvent.press(screen.getByRole("button", { name: "10 min" }));
    expect(await screen.findByLabelText("You, 12:02: I'm running 10 minutes late")).toBeVisible();
    expect(screen.queryByText("How many minutes?")).toBeNull();
    expect(sends(client).map(({ quick }) => quick)).toEqual([
      { key: "thanks" },
      { key: "late", minutes: 10 },
    ]);
  });

  it("says when messages are sent too quickly, and keeps the message to send again", async () => {
    const { server } = await openConversation();
    server.nextSends.push(() => failure(429, "too_many_messages"));
    await write("Hello?");
    expect(
      await screen.findByText("You're sending messages quickly. Wait a moment, then try again."),
    ).toBeVisible();
    await fireEvent.press(
      screen.getByRole("button", { name: "Not sent. Tap to try again. Hello?" }),
    );
    expect(await screen.findByLabelText("You, 12:01: Hello?")).toBeVisible();
  });

  it("can only be read once it has closed", async () => {
    await openConversation({ canWrite: false, messages: [openedLine, hi] });
    expect(await screen.findByText("This chat is closed. You can still read it.")).toBeVisible();
    expect(screen.getByLabelText("Anna, 11:55: Hi! I'll wait by the pumps.")).toBeVisible();
    expect(screen.queryByLabelText("Write a message")).toBeNull();
    expect(screen.queryByRole("button", { name: "Thank you!" })).toBeNull();
  });

  it("shows a former member and their deleted messages once their account is erased (spec 11, 3.5)", async () => {
    const erased = chatMessage({
      id: messageId(2),
      kind: "erased",
      text: null,
      sentAt: "2026-11-14T11:55:00.000Z",
    });
    await openConversation({
      booking: { ...chatBooking, driver: { ...chatBooking.driver, firstName: null } },
      canWrite: false,
      messages: [openedLine, erased, seen],
    });
    expect(await screen.findByRole("header", { name: "A former member" })).toBeVisible();
    expect(screen.getByLabelText("A former member, 11:55: Message deleted")).toBeVisible();
    expect(screen.getByLabelText("You, 11:56: Great, thank you. Seen")).toBeVisible();
    expect(screen.queryByLabelText("Write a message")).toBeNull();
  });

  it("says it has closed when a message is sent just after", async () => {
    const { server } = await openConversation();
    server.nextSends.push(() => {
      server.canWrite = false;
      return failure(409, "chat_closed");
    });
    await write("Thanks for the ride!");
    expect(await screen.findByText("This chat is closed. You can still read it.")).toBeVisible();
    expect(screen.queryByLabelText("Write a message")).toBeNull();
  });

  it("fetches new messages every 5 seconds while open, reads them, and shows Seen", async () => {
    jest.useFakeTimers();
    try {
      const { client, server } = await openConversation();
      await write("Where do I stand?");
      expect(await screen.findByLabelText("You, 12:01: Where do I stand?")).toBeVisible();
      server.readMine();
      const answer = server.receive({ text: "By the pumps." });
      await act(() => jest.advanceTimersByTimeAsync(5_000));
      expect(await screen.findByLabelText("Anna, 12:02: By the pumps.")).toBeVisible();
      expect(screen.getByLabelText("You, 12:01: Where do I stand? Seen")).toBeVisible();
      expect(reads(client)).toEqual([answer.id]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows a message whose answer was lost once, when the next fetch has it", async () => {
    jest.useFakeTimers();
    try {
      const { server } = await openConversation();
      // Stored, but the answer never came back.
      server.nextSends.push((body) => {
        server.receive({ from: "me", clientId: body.clientId, text: "Lost on the way" });
        return failure(0, "network_error");
      });
      await write("Lost on the way");
      expect(
        await screen.findByRole("button", { name: "Not sent. Tap to try again. Lost on the way" }),
      ).toBeVisible();
      await act(() => jest.advanceTimersByTimeAsync(5_000));
      expect(screen.queryByRole("button", { name: /Not sent/ })).toBeNull();
      expect(screen.getAllByLabelText(/^You, \d\d:\d\d: Lost on the way$/)).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("sends a quick message tapped twice while it is on its way once", async () => {
    const { client, server } = await openConversation();
    let release: () => void = () => undefined;
    server.nextSends.push(
      (body) =>
        new Promise((resolve) => {
          release = () => {
            const { quick } = body as Extract<SendMessageBody, { quick: unknown }>;
            const message = server.receive({
              from: "me",
              kind: "quick",
              text: null,
              quick: quick as ChatMessage["quick"],
            });
            resolve(ok(201, { ...message, clientId: body.clientId }));
          };
        }),
    );
    const thanks = await screen.findByRole("button", { name: "Thank you!" });
    await fireEvent.press(thanks);
    await fireEvent.press(thanks);
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect(await screen.findAllByLabelText(/^You, \d\d:\d\d: Thank you!$/)).toHaveLength(1);
    expect(sends(client)).toHaveLength(1);
  });

  it("fetches one page of new messages at a time, however slow the answer", async () => {
    jest.useFakeTimers();
    try {
      const { client, server } = await openConversation();
      await write("Hi");
      expect(await screen.findByLabelText("You, 12:01: Hi")).toBeVisible();
      const fetches = () =>
        callsTo(client, "/v1/bookings/{id}/messages", (input) => "query" in input).length;
      server.readMine();
      const release = server.holdNextFetch();
      await act(() => jest.advanceTimersByTimeAsync(5_000));
      const started = fetches();
      await act(() => jest.advanceTimersByTimeAsync(15_000));
      expect(fetches()).toBe(started);
      await act(async () => {
        release();
        await Promise.resolve();
      });
      expect(await screen.findByLabelText("You, 12:01: Hi. Seen")).toBeVisible();
      await act(() => jest.advanceTimersByTimeAsync(5_000));
      expect(fetches()).toBe(started + 1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("marks messages read again after a failed try, with the next fetch", async () => {
    jest.useFakeTimers();
    try {
      let tries = 0;
      const { client } = await openConversation(
        { messages: [openedLine, chatMessage({ id: messageId(2), text: "Are you there?" })] },
        (fake) => {
          fake.answer("/v1/bookings/{id}/messages/read", () => {
            tries += 1;
            return tries === 1 ? failure(0, "network_error") : ok(204);
          });
        },
      );
      expect(await screen.findByLabelText("Anna, 12:00: Are you there?")).toBeVisible();
      for (let count = 0; count < 3; count += 1) {
        await act(() => jest.advanceTimersByTimeAsync(5_000));
      }
      expect(reads(client)).toEqual([messageId(2), messageId(2)]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("reads out new messages, and a message that was not sent", async () => {
    jest.useFakeTimers();
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    try {
      const { server } = await openConversation();
      server.receive({ text: "By the pumps." });
      server.receive({ kind: "quick", text: null, quick: { key: "onMyWay" } });
      await act(() => jest.advanceTimersByTimeAsync(5_000));
      expect(announce).toHaveBeenCalledWith(
        "Anna, 12:01: By the pumps. Anna, 12:02: I'm on my way",
      );
      server.nextSends.push(() => failure(500, "internal_error"));
      await write("Can I bring skis?");
      expect(await screen.findByRole("button", { name: /Not sent/ })).toBeVisible();
      expect(announce).toHaveBeenLastCalledWith("Not sent. Tap to try again. Can I bring skis?");
    } finally {
      announce.mockRestore();
      jest.useRealTimers();
    }
  });

  it("opens at the end, and stays there as messages come only while I read there", async () => {
    const scrollToEnd = (ScrollView.prototype as unknown as { scrollToEnd: jest.Mock }).scrollToEnd;
    const many = Array.from({ length: 55 }, (_unused, index) =>
      chatMessage({
        id: messageId(10 + index),
        text: `Message ${String(index)}`,
        sentAt: new Date(Date.parse("2026-11-14T10:00:00.000Z") + index * 60_000).toISOString(),
      }),
    );
    await openConversation({ messages: many });
    expect(await screen.findByLabelText("Anna, 10:54: Message 54")).toBeVisible();
    const scroll = screen.getByTestId("screen-scroll");
    const grows = (height: number) =>
      act(async () => {
        await fireEvent(scroll, "contentSizeChange", 400, height);
      });
    const readAt = (y: number, height: number) =>
      fireEvent.scroll(scroll, {
        nativeEvent: {
          contentOffset: { x: 0, y },
          layoutMeasurement: { width: 400, height: 800 },
          contentSize: { width: 400, height },
        },
      });
    scrollToEnd.mockClear();
    await grows(5000);
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    // Up at the top, earlier messages come in above: the screen stays where I read.
    await readAt(0, 5000);
    await fireEvent.press(screen.getByRole("button", { name: "Show earlier messages" }));
    await grows(5400);
    expect(scrollToEnd).toHaveBeenCalledTimes(1);
    // My own message brings me back to the end.
    await write("Hello");
    await grows(5480);
    expect(scrollToEnd).toHaveBeenCalledTimes(2);
    // At the end, it follows what comes next.
    await readAt(4680, 5480);
    await grows(5560);
    expect(scrollToEnd).toHaveBeenCalledTimes(3);
  });

  it("shows earlier messages a page at a time", async () => {
    const many = Array.from({ length: 55 }, (_unused, index) =>
      chatMessage({
        id: messageId(10 + index),
        text: `Message ${String(index)}`,
        sentAt: new Date(Date.parse("2026-11-14T10:00:00.000Z") + index * 60_000).toISOString(),
      }),
    );
    const { client } = await openConversation({ messages: many });
    expect(await screen.findByLabelText("Anna, 10:54: Message 54")).toBeVisible();
    expect(screen.queryByLabelText("Anna, 10:00: Message 0")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show earlier messages" }));
    expect(await screen.findByLabelText("Anna, 10:00: Message 0")).toBeVisible();
    expect(screen.getByLabelText("Anna, 10:54: Message 54")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Show earlier messages" })).toBeNull();
    expect(
      callsTo(client, "/v1/bookings/{id}/messages", (input) => "query" in input).map(
        (call) => call.input["query"],
      ),
    ).toContainEqual({ before: messageId(15) });
  });

  it("says when the chat has not opened yet, or could not be loaded", async () => {
    let tries = 0;
    await renderApp(conversationPage, {
      me: completeMe,
      setUp: (client) => {
        client.answer(
          "/v1/bookings/{id}/messages",
          () => {
            tries += 1;
            return tries === 1 ? failure(409, "not_confirmed") : failure(500, "internal_error");
          },
          "get",
        );
      },
    });
    expect(await screen.findByText("The chat opens once the booking is confirmed.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("The messages could not be loaded.")).toBeVisible();
  });
});

describe("A conversation while suspended (spec 9, 3.6.2)", () => {
  it("stays readable, and says why nothing can be sent instead of the field", async () => {
    await renderApp(conversationPage, {
      me: { ...completeMe, suspension: { until: null } },
      setUp: (client) => {
        chatServer(client);
      },
    });
    expect(
      await screen.findByText("Your account is suspended. Read why under Profile, Notices."),
    ).toBeVisible();
    expect(screen.queryByLabelText("Write a message")).toBeNull();
  });
});

describe("Conversations list (spec 7, 3.1, item 9)", () => {
  const other = northBooking({
    id: "0190a1d6-0000-7000-8000-0000000000b7",
    viewer: "driver",
    status: "confirmed",
    board: northStop(0),
    alight: northStop(1),
    requestExpiresAt: null,
    passenger: { firstName: "Jón", colour: 3, memberSince: "2026-10" },
    confirmed: { registration: "AB 123", whereToStand: null },
  });

  function conversationsApi(client: FakeClient, answer: () => unknown) {
    client.answer("/v1/me/conversations", answer);
  }

  it("lists each chat with the other person, the trip, the last message and unread count", async () => {
    await renderApp("/messages", {
      me: completeMe,
      setUp: (client) => {
        conversationsApi(client, () =>
          ok(200, {
            conversations: [
              conversationOf(chatBooking, {
                unread: 2,
                lastMessage: chatMessage({
                  id: messageId(5),
                  kind: "quick",
                  text: null,
                  quick: { key: "late", minutes: 15 },
                }),
              }),
              conversationOf(other, {
                lastMessage: chatMessage({ id: messageId(6), from: "me", text: "See you at 9" }),
              }),
            ],
            unread: 2,
          }),
        );
        chatServer(client);
      },
    });
    expect(await screen.findByRole("header", { name: "Messages" })).toBeVisible();
    expect(screen.getByText("2 unread")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Jón, Sunday 15 November, BSÍ bus terminal to Borgarnes, You: See you at 9",
      }),
    ).toBeVisible();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Anna, Sunday 15 November, Borgarnes to Blönduós, I'm running 15 minutes late, 2 unread",
      }),
    );
    expect(await screen.findByRole("header", { name: "Anna" })).toBeVisible();
    expect(screen).toHavePathname(conversationPage);
  });

  it("says chats open once a booking is confirmed, and when the list could not be loaded", async () => {
    const server = { down: true };
    await renderApp("/messages", {
      me: completeMe,
      setUp: (client) => {
        conversationsApi(client, () =>
          server.down ? failure(500, "internal_error") : ok(200, { conversations: [], unread: 0 }),
        );
      },
    });
    expect(await screen.findByText("The messages could not be loaded.")).toBeVisible();
    server.down = false;
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText(
        "Chats open once a booking is confirmed. Then you can message your driver or passengers here.",
      ),
    ).toBeVisible();
  });
});

describe("Where a chat starts (spec 7, 3.1 and 3.2)", () => {
  it("lets the passenger of a confirmed booking message the driver", async () => {
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => paidBooking);
        chatServer(client);
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Message Anna" }));
    expect(await screen.findByRole("header", { name: "Anna" })).toBeVisible();
    expect(screen).toHavePathname(conversationPage);
  });

  it("keeps the passenger's chat once the ride completed, with no more where to stand (spec 8)", async () => {
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => ({ ...paidBooking, status: "completed" }));
        chatServer(client);
      },
    });
    expect(await screen.findByRole("button", { name: "Message Anna" })).toBeVisible();
    expect(screen.queryByText("Where to stand")).toBeNull();
  });

  it("has no chat before the booking is confirmed", async () => {
    await renderApp(`/bookings/${bookingId}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => northBooking());
      },
    });
    expect(await screen.findByRole("button", { name: "Withdraw request" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Message Anna" })).toBeNull();
  });

  const jon = northBooking({
    id: "0190a1d6-0000-7000-8000-0000000000b5",
    viewer: "driver",
    status: "confirmed",
    board: northStop(0),
    alight: northStop(2),
    requestExpiresAt: null,
    passenger: { firstName: "Jón", colour: 3, memberSince: "2026-10" },
    confirmed: { registration: "AB 123", whereToStand: null },
  });
  const gunnaPaying = northBooking({
    viewer: "driver",
    status: "accepted",
    requestExpiresAt: null,
    paymentDueAt: "2026-11-14T12:30:00.000Z",
  });

  it("lets the driver message each confirmed passenger, or all of them", async () => {
    await renderApp(`/drive/trips/${northMyTrip.id}`, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [northMyTrip]);
        driverApi(client, [gunnaPaying, jon]);
        chatServer(client, { booking: jon });
      },
    });
    expect(await screen.findByLabelText("Jón, 1 seat, Confirmed")).toBeVisible();
    // Gunna has not paid, so there is no chat with her yet.
    expect(screen.queryByRole("button", { name: "Message Gunna" })).toBeNull();
    expect(screen.getByRole("button", { name: "Message all passengers" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Message Jón" }));
    expect(await screen.findByRole("header", { name: "Jón" })).toBeVisible();
    expect(screen).toHavePathname(`/messages/${jon.id}`);
  });

  it("still lets the driver message a passenger, or all of them, once the trip completed (spec 8)", async () => {
    await renderApp(`/drive/trips/${northMyTrip.id}`, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [{ ...northMyTrip, status: "completed" }]);
        driverApi(client, [{ ...jon, status: "completed" }]);
        chatServer(client, { booking: jon });
      },
    });
    expect(await screen.findByLabelText("Jón, 1 seat, Completed")).toBeVisible();
    expect(screen.getByRole("button", { name: "Message Jón" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Message all passengers" })).toBeVisible();
  });

  it("offers no message to all before a passenger is confirmed", async () => {
    await renderApp(`/drive/trips/${northMyTrip.id}`, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [northMyTrip]);
        driverApi(client, [gunnaPaying]);
      },
    });
    expect(await screen.findByLabelText("Gunna, 1 seat, Waiting for payment")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Message all passengers" })).toBeNull();
  });

  it("sends the driver's message to all passengers; a retry after a failure sends it once", async () => {
    let answers = [() => failure(500, "internal_error"), () => ok(200, { sent: 2 })];
    const app = await renderApp(`/drive/trips/${northMyTrip.id}/message`, {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/trips/{id}/messages", () => {
          const [next, ...rest] = answers;
          answers = rest;
          return next?.() ?? ok(200, { sent: 0 });
        });
      },
    });
    expect(await screen.findByRole("header", { name: "Message all passengers" })).toBeVisible();
    expect(
      screen.getByText(
        "Each passenger gets it in their own chat. Passengers don't see each other.",
      ),
    ).toBeVisible();
    await write("Leaving 10 minutes early tomorrow.");
    expect(await screen.findByText("Something went wrong on our side. Try again.")).toBeVisible();
    // What was written stays, to send again.
    expect(screen.getByLabelText("Write a message")).toHaveDisplayValue(
      "Leaving 10 minutes early tomorrow.",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Sent to 2 passengers.")).toBeVisible();
    expect(screen.getByLabelText("Write a message")).toHaveDisplayValue("");
    const bodies = app.client.calls
      .filter((call) => call.path === "/v1/trips/{id}/messages")
      .map((call) => call.input["body"]);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[0]).toEqual({
      clientId: expect.any(String) as string,
      text: "Leaving 10 minutes early tomorrow.",
    });

    await fireEvent.press(screen.getByRole("button", { name: "I'm running late" }));
    await fireEvent.press(screen.getByRole("button", { name: "15 min" }));
    expect(
      await screen.findByText(
        "There's no one to message: no passenger is confirmed, or their chat is closed.",
      ),
    ).toBeVisible();
    const last = app.client.calls.filter((call) => call.path === "/v1/trips/{id}/messages").at(-1);
    expect(last?.input["body"]).toMatchObject({ quick: { key: "late", minutes: 15 } });
    expect((last?.input["body"] as { clientId: string }).clientId).not.toBe(
      (bodies[0] as { clientId: string }).clientId,
    );
  });

  it("keeps the client ID of a message to all whose answer was lost, after sending something else", async () => {
    let answers = [() => failure(0, "network_error"), () => ok(200, { sent: 2 })];
    const app = await renderApp(`/drive/trips/${northMyTrip.id}/message`, {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/trips/{id}/messages", () => {
          const [next, ...rest] = answers;
          answers = rest;
          return next?.() ?? ok(200, { sent: 2 });
        });
      },
    });
    const bodies = () =>
      app.client.calls
        .filter((call) => call.path === "/v1/trips/{id}/messages")
        .map((call) => call.input["body"] as { clientId: string });
    await write("Leaving early.");
    await screen.findByLabelText("Write a message");
    expect(bodies()).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Thank you!" }));
    expect(await screen.findByText("Sent to 2 passengers.")).toBeVisible();
    // The words are still there; sent again, they keep their first ID.
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    const [text, quick, again] = bodies();
    expect(again).toEqual(text);
    expect(quick?.clientId).not.toBe(text?.clientId);
  });
});
