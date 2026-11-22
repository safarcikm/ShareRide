import { act, screen, waitFor } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { chatBooking, chatServer } from "@/testing/chat";
import { ok, testMe, type FakeClient } from "@/testing/fake-client";
import { bsi, details } from "@/testing/meeting-points";
import { mockNotifications } from "@/testing/notifications";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));
const mockProject = { id: "test-project" as string | undefined };
jest.mock("@/notifications/project-id", () => ({ projectId: () => mockProject.id }));

const conversationPage = `/messages/${chatBooking.id}`;

const registered = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/me/sessions/current/push-token")
    .map((call) => (call.input["body"] as { token: string | null }).token);

const pages = (client: FakeClient) =>
  client.calls.filter(
    (call) => call.path === "/v1/bookings/{id}/messages" && !("body" in call.input),
  ).length;

function withPush(client: FakeClient) {
  client.answer("/v1/me/sessions/current/push-token", () => ok(204), "put");
  chatServer(client);
}

beforeEach(() => {
  mockNotifications.reset();
  mockProject.id = "test-project";
});

describe("Push notifications (plan 4.5)", () => {
  it("registers this device's token once notifications are allowed, without asking", async () => {
    mockNotifications.permission = "granted";
    const { client } = await renderApp("/", { me: completeMe, setUp: withPush });
    await waitFor(() => {
      expect(registered(client)).toHaveLength(1);
    });
    // Getting the token announces it again, which must not register it again.
    await act(async () => {
      for (let tick = 0; tick < 50; tick++) await Promise.resolve();
    });
    expect(registered(client)).toEqual(["ExponentPushToken[test-device]"]);
    expect(mockNotifications.deviceRequests).toBe(1);
    expect(mockNotifications.tokenRequests).toEqual([{ projectId: "test-project" }]);
  });

  it("registers nothing while notifications are not allowed, when signed out, or before the app has its project", async () => {
    const asked = await renderApp("/", { me: completeMe, setUp: withPush });
    await screen.findAllByRole("header");
    expect(registered(asked.client)).toEqual([]);

    mockNotifications.permission = "granted";
    const signedOut = await renderApp("/", { setUp: withPush });
    await screen.findAllByRole("header");
    expect(registered(signedOut.client)).toEqual([]);

    mockProject.id = undefined;
    const noProject = await renderApp("/", { me: completeMe, setUp: withPush });
    await screen.findAllByRole("header");
    expect(registered(noProject.client)).toEqual([]);
    expect(mockNotifications.tokenRequests).toEqual([]);
  });

  it("registers the new token when the device's token changes", async () => {
    mockNotifications.permission = "granted";
    const { client } = await renderApp("/", { me: completeMe, setUp: withPush });
    await waitFor(() => {
      expect(registered(client)).toHaveLength(1);
    });
    await act(async () => {
      mockNotifications.newToken("new-token");
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(registered(client)).toEqual([
        "ExponentPushToken[test-device]",
        "ExponentPushToken[new-token]",
      ]);
    });
    // The phone was asked for its token once, at start; the new one came with its news.
    expect(mockNotifications.deviceRequests).toBe(1);
  });

  it("opens what a tapped notification is about", async () => {
    await renderApp("/", { me: completeMe, setUp: withPush });
    await screen.findAllByRole("header");
    await act(async () => {
      mockNotifications.tap(conversationPage);
      await Promise.resolve();
    });
    expect(await screen.findByRole("header", { name: "Anna" })).toBeVisible();
    expect(screen).toHavePathname(conversationPage);
  });

  it("opens it once signed in when the tap started the app", async () => {
    mockNotifications.tap(conversationPage);
    await renderApp("/", { me: completeMe, setUp: withPush });
    expect(await screen.findByRole("header", { name: "Anna" })).toBeVisible();
    expect(screen).toHavePathname(conversationPage);
  });

  it("opens the meeting point of a tapped trip reminder, for Directions (spec 7, 3.5)", async () => {
    const page = `/meeting-points/${bsi.id}`;
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        withPush(client);
        client.answer("/v1/meeting-points/{id}", () => ok(200, details(bsi)));
      },
    });
    await screen.findAllByRole("header");
    await act(async () => {
      mockNotifications.tap(page);
      await Promise.resolve();
    });
    expect(await screen.findByRole("header", { name: "BSÍ bus terminal" })).toBeVisible();
    expect(screen).toHavePathname(page);
  });

  it("opens Notices from a notice of PuffinRide's action (spec 9, R9.5)", async () => {
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        withPush(client);
        client.answer("/v1/me/notices", () => ok(200, { notices: [] }), "get");
      },
    });
    await screen.findAllByRole("header");
    await act(async () => {
      mockNotifications.tap("/notices");
      await Promise.resolve();
    });
    expect(await screen.findByRole("header", { name: "Notices" })).toBeVisible();
    expect(screen).toHavePathname("/notices");
  });

  it("ignores a tap that leads anywhere but a booking, a trip, a conversation, a meeting point or Notices", async () => {
    await renderApp("/profile", { me: completeMe, setUp: withPush });
    await screen.findAllByRole("header");
    expect(screen).toHavePathname("/profile");
    await act(async () => {
      mockNotifications.tap("/settings");
      mockNotifications.tap("https://example.com/messages/x");
      await Promise.resolve();
    });
    expect(screen).toHavePathname("/profile");
  });

  it("does not open a tap before the account is complete", async () => {
    mockNotifications.tap(conversationPage);
    await renderApp("/", { me: testMe, setUp: withPush });
    await screen.findAllByRole("header");
    expect(screen).not.toHavePathname(conversationPage);
  });

  it("fetches the conversation on screen when a push about it arrives, instead of showing it", async () => {
    const { client } = await renderApp(conversationPage, { me: completeMe, setUp: withPush });
    expect(await screen.findByRole("header", { name: "Anna" })).toBeVisible();
    const before = pages(client);

    let behavior: unknown;
    await act(async () => {
      behavior = await mockNotifications.receive(conversationPage);
    });
    expect(behavior).toMatchObject({ shouldShowBanner: false, shouldShowList: false });
    await waitFor(() => {
      expect(pages(client)).toBe(before + 1);
    });

    await act(async () => {
      behavior = await mockNotifications.receive("/messages/0190a1d6-0000-7000-8000-0000000000ff");
    });
    expect(behavior).toMatchObject({ shouldShowBanner: true, shouldShowList: true });
  });
});
