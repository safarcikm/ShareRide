import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { router } from "expo-router";
import { AppState, Dimensions } from "react-native";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { chatBooking, chatServer, conversationOf, messageId, openedLine } from "@/testing/chat";
import { ok, type FakeClient } from "@/testing/fake-client";
import { mockNotifications } from "@/testing/notifications";
import { badgeText } from "@/navigation/count-badge";

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

const conversationPage = `/messages/${chatBooking.id}`;

/** The badge's answer: `unread.count` messages not yet read, in one conversation with Anna. */
function unreadServer(client: FakeClient, unread: { count: number }) {
  client.answer("/v1/me/conversations", () =>
    ok(200, {
      conversations: [conversationOf(chatBooking, { unread: unread.count })],
      unread: unread.count,
    }),
  );
}

const badgeCalls = (client: FakeClient) =>
  client.calls.filter((call) => call.path === "/v1/me/conversations").length;

beforeEach(() => {
  mockNotifications.reset();
});

describe("The Messages tab (spec 7, 3.1, item 9)", () => {
  it("sits between Offer and Profile and says how many messages are unread", async () => {
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        unreadServer(client, { count: 3 });
      },
    });
    const messages = await screen.findByRole("tab", { name: "Messages, 3 unread" });
    expect(within(messages).getByText("3", { includeHiddenElements: true })).toBeTruthy();
    const names = screen
      .getAllByRole("tab")
      .map((tab) => (tab.props as { accessibilityLabel?: string }).accessibilityLabel);
    expect(names).toEqual(["Find", "My rides", "Offer", "Messages, 3 unread", "Profile"]);
  });

  it("shows no count when everything is read", async () => {
    const { client } = await renderApp("/", { me: completeMe });
    await waitFor(() => {
      expect(badgeCalls(client)).toBe(1);
    });
    expect(screen.getByRole("tab", { name: "Messages" })).toBeVisible();
    expect(screen.queryByTestId("count-badge", { includeHiddenElements: true })).toBeNull();
  });

  it("opens my conversations, and the badge follows the list", async () => {
    const unread = { count: 3 };
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        unreadServer(client, unread);
      },
    });
    const messages = await screen.findByRole("tab", { name: "Messages, 3 unread" });
    unread.count = 1;
    await fireEvent.press(messages);
    expect(await screen.findByRole("header", { name: "Messages" })).toBeVisible();
    expect(screen).toHavePathname("/messages");
    expect(screen.getByRole("button", { name: /^Anna, .*, 1 unread$/ })).toBeVisible();
    expect(
      await screen.findByRole("tab", { name: "Messages, 1 unread", selected: true }),
    ).toBeVisible();
  });

  it("asks to sign in when signed out, and fetches nothing", async () => {
    const { client } = await renderApp("/");
    await fireEvent.press(await screen.findByRole("tab", { name: "Messages" }));
    expect(await screen.findByText("Sign in to see your messages")).toBeVisible();
    expect(badgeCalls(client)).toBe(0);
    expect(screen.queryByTestId("count-badge", { includeHiddenElements: true })).toBeNull();
  });

  it("shows no count once signed out", async () => {
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        unreadServer(client, { count: 3 });
        client.answer("/v1/auth/sign-out", () => ok(204));
      },
    });
    expect(await screen.findByRole("tab", { name: "Messages, 3 unread" })).toBeVisible();
    await fireEvent.press(screen.getByRole("tab", { name: "Profile" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Settings" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("tab", { name: "Messages" })).toBeVisible();
    expect(screen.queryByTestId("count-badge", { includeHiddenElements: true })).toBeNull();
  });

  it("fetches the count again when the app comes back to the front", async () => {
    // React Native's test set-up already mocks it; the spy is that same mock.
    const listening = jest.spyOn(AppState, "addEventListener");
    const before = listening.mock.calls.length;
    const unread = { count: 0 };
    const { client } = await renderApp("/", {
      me: completeMe,
      setUp: (fake) => {
        unreadServer(fake, unread);
      },
    });
    await waitFor(() => {
      expect(badgeCalls(client)).toBe(1);
    });
    unread.count = 4;
    await act(async () => {
      for (const [event, listener] of listening.mock.calls.slice(before)) {
        if (event === "change") listener("active");
      }
      await Promise.resolve();
    });
    expect(await screen.findByRole("tab", { name: "Messages, 4 unread" })).toBeVisible();
  });

  it("fetches the count again when a push arrives", async () => {
    const unread = { count: 0 };
    const { client } = await renderApp("/", {
      me: completeMe,
      setUp: (fake) => {
        unreadServer(fake, unread);
      },
    });
    await waitFor(() => {
      expect(badgeCalls(client)).toBe(1);
    });
    expect(screen.getByRole("tab", { name: "Messages" })).toBeVisible();
    unread.count = 2;
    await act(async () => {
      await mockNotifications.receive(conversationPage);
    });
    expect(await screen.findByRole("tab", { name: "Messages, 2 unread" })).toBeVisible();
  });

  it("clears the count once the conversation has been read", async () => {
    let server: ReturnType<typeof chatServer> | undefined;
    const { client } = await renderApp("/", {
      me: completeMe,
      setUp: (fake) => {
        server = chatServer(fake, {
          messages: [
            openedLine,
            {
              ...openedLine,
              id: messageId(2),
              kind: "text",
              from: "them",
              system: null,
              text: "On my way.",
            },
          ],
        });
        fake.answer("/v1/me/conversations", () => {
          const count =
            server?.messages.filter((m) => m.from === "them" && m.readAt === null).length ?? 0;
          return ok(200, {
            conversations: [conversationOf(chatBooking, { unread: count })],
            unread: count,
          });
        });
      },
    });
    expect(await screen.findByRole("tab", { name: "Messages, 1 unread" })).toBeVisible();
    await act(() => {
      router.push(conversationPage);
    });
    expect(await screen.findByText("On my way.")).toBeVisible();
    await waitFor(() => {
      expect(client.calls.some((call) => call.path === "/v1/bookings/{id}/messages/read")).toBe(
        true,
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    // Find is on show, which never asks for the conversations: the read did.
    expect(await screen.findByRole("tab", { name: "Messages", selected: false })).toBeVisible();
    expect(screen).toHavePathname("/");
  });

  it("shows nine at most, then 9+", () => {
    expect(badgeText(1)).toBe("1");
    expect(badgeText(9)).toBe("9");
    expect(badgeText(10)).toBe("9+");
    expect(badgeText(250)).toBe("9+");
  });
});

describe("The Messages count on wide screens", () => {
  beforeEach(() => {
    Dimensions.set({ window: { width: 1280, height: 800, scale: 1, fontScale: 1 } });
  });

  afterEach(async () => {
    await act(() => {
      Dimensions.set({ window: { width: 750, height: 1334, scale: 2, fontScale: 2 } });
    });
  });

  it("shows the count beside Messages in the top bar", async () => {
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        unreadServer(client, { count: 12 });
      },
    });
    const bar = await screen.findByTestId("top-bar");
    const messages = await within(bar).findByRole("tab", { name: "Messages, 12 unread" });
    expect(within(messages).getByText("9+", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("tab-bar")).toBeNull();
  });
});
