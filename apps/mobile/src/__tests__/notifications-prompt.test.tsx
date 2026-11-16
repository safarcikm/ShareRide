import { fireEvent, screen, waitFor } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { ok, type FakeClient } from "@/testing/fake-client";
import { mockNotifications } from "@/testing/notifications";
import { plannedDraft, tripsApi } from "@/testing/trips";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: () => Promise.resolve(null),
  writePreference: () => Promise.resolve(),
}));
const mockStored = new Map<string, string>();
jest.mock("@/lib/app-data", () => ({
  readAppData: (key: string) => Promise.resolve(mockStored.get(key) ?? null),
  writeAppData: (key: string, value: string) => {
    mockStored.set(key, value);
    return Promise.resolve();
  },
}));
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));
const mockProject = { id: "test-project" as string | undefined };
jest.mock("@/notifications/project-id", () => ({ projectId: () => mockProject.id }));

const turnOn = "Turn on notifications so you hear at once if your trip changes.";
const addEmail = "Add an email so we can reach you if your trip changes.";

// Each test posts its own trip, so each is a new occasion.
let trips = 0;
function postedTrip() {
  trips += 1;
  return plannedDraft({
    id: `0190a1d6-0000-7000-8000-0000000003${String(trips).padStart(2, "0")}`,
    status: "published",
  });
}

const answered = () => JSON.parse(mockStored.get("notificationsPromptAnswered") ?? "[]") as unknown;

const registered = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/me/sessions/current/push-token")
    .map((call) => (call.input["body"] as { token: string | null }).token);

async function openPosted(me = completeMe) {
  const trip = postedTrip();
  const app = await renderApp(`/drive/trips/${trip.id}/published`, {
    me,
    setUp: (client) => {
      tripsApi(client, [trip]);
      client.answer("/v1/me/sessions/current/push-token", () => ok(204), "put");
    },
  });
  expect(await screen.findByRole("header", { name: "Your trip is published" })).toBeVisible();
  return { ...app, trip };
}

/** Lets the prompt finish asking the phone and the device's storage. */
async function settled() {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Share the trip" })).toBeVisible();
  });
  for (let tick = 0; tick < 10; tick++) await Promise.resolve();
}

beforeEach(() => {
  mockNotifications.reset();
  mockProject.id = "test-project";
  mockStored.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("The prompt to turn on notifications (spec 7, 3.6.2)", () => {
  it("asks someone this phone cannot reach yet, after posting a trip, and registers the phone once allowed", async () => {
    const { client, trip } = await openPosted();
    expect(await screen.findByText(turnOn)).toBeVisible();
    expect(screen.getByRole("button", { name: "Add an email" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Turn on notifications" }));
    await waitFor(() => {
      expect(registered(client)).toEqual(["ExponentPushToken[test-device]"]);
    });
    expect(mockNotifications.permissionRequests).toBe(1);
    expect(screen.queryByText(turnOn)).toBeNull();
    await waitFor(() => {
      expect(answered()).toEqual([`posted:${trip.id}`]);
    });
  });

  it("counts turning them on as an answer even when the phone cannot give its token yet", async () => {
    mockNotifications.deviceFailure = new Error("SERVICE_NOT_AVAILABLE");
    const { trip } = await openPosted();
    await fireEvent.press(await screen.findByRole("button", { name: "Turn on notifications" }));
    await waitFor(() => {
      expect(screen.queryByText(turnOn)).toBeNull();
    });
    expect(answered()).toEqual([`posted:${trip.id}`]);
  });

  it("offers an email instead once the phone was told no, and says so", async () => {
    mockNotifications.answer = "denied";
    const announced = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const { trip } = await openPosted();
    await fireEvent.press(await screen.findByRole("button", { name: "Turn on notifications" }));
    expect(await screen.findByText(addEmail)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Turn on notifications" })).toBeNull();
    expect(announced).toHaveBeenCalledWith(addEmail);
    await fireEvent.press(screen.getByRole("button", { name: "Add an email" }));
    expect(await screen.findByRole("header", { name: "Your email" })).toBeVisible();
    expect(answered()).toEqual([`posted:${trip.id}`]);
  });

  it("takes the first no, as on Android where the phone could ask again", async () => {
    mockNotifications.answer = "denied";
    mockNotifications.asksAgainAfterNo = true;
    await openPosted();
    await fireEvent.press(await screen.findByRole("button", { name: "Turn on notifications" }));
    expect(await screen.findByText(addEmail)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Turn on notifications" })).toBeNull();
  });

  it("offers only an email when the phone was told no before", async () => {
    mockNotifications.permission = "denied";
    await openPosted();
    expect(await screen.findByText(addEmail)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Turn on notifications" })).toBeNull();
    expect(mockNotifications.permissionRequests).toBe(0);
  });

  it("offers only an email where push cannot reach, as before the app has its project", async () => {
    mockProject.id = undefined;
    await openPosted();
    expect(await screen.findByText(addEmail)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Turn on notifications" })).toBeNull();
    expect(mockNotifications.permissionRequests).toBe(0);
  });

  it("closes with Not now, and is not asked again for the same trip", async () => {
    const { trip } = await openPosted();
    await fireEvent.press(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByText(turnOn)).toBeNull();
    await waitFor(() => {
      expect(answered()).toEqual([`posted:${trip.id}`]);
    });
    expect(mockNotifications.permissionRequests).toBe(0);
  });

  it("is not asked for an occasion already answered", async () => {
    const trip = postedTrip();
    mockStored.set(
      "notificationsPromptAnswered",
      JSON.stringify(["posted:other", `posted:${trip.id}`]),
    );
    await renderApp(`/drive/trips/${trip.id}/published`, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [trip]);
      },
    });
    expect(await screen.findByRole("header", { name: "Your trip is published" })).toBeVisible();
    await settled();
    expect(screen.queryByText(turnOn)).toBeNull();
  });

  it("is not shown to someone with a verified email", async () => {
    await openPosted({ ...completeMe, email: "anna-prompt@example.com" });
    await settled();
    expect(screen.queryByText(turnOn)).toBeNull();
    expect(screen.queryByText(addEmail)).toBeNull();
  });

  it("is not shown when another of my phones gets push", async () => {
    await openPosted({ ...completeMe, pushOn: true });
    await settled();
    expect(screen.queryByText(turnOn)).toBeNull();
    expect(screen.queryByText(addEmail)).toBeNull();
  });

  it("is not shown when this phone already has notifications on", async () => {
    mockNotifications.permission = "granted";
    await openPosted();
    await settled();
    expect(screen.queryByText(turnOn)).toBeNull();
    expect(screen.queryByText(addEmail)).toBeNull();
  });
});
