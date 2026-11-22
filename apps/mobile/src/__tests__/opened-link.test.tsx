import { fireEvent, screen, waitFor } from "expo-router/testing-library";
import { takeOpenedPath } from "@/navigation/opened-link";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { bookingApi } from "@/testing/bookings";
import { chatBooking, chatServer } from "@/testing/chat";
import { ok, testMe, tokens, type FakeClient } from "@/testing/fake-client";
import { completedBooking } from "@/testing/reviews";

// A link to a screen that needs an account, opened before signing in, as
// from an email on the web (spec 20, 3.2). The address the app was opened
// at is the test's; the app's own storage is a map.

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
const mockData = new Map<string, string>();
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn((key: string) => Promise.resolve(mockData.get(key) ?? null)),
  writeAppData: jest.fn((key: string, value: string) => {
    mockData.set(key, value);
    return Promise.resolve();
  }),
}));
jest.mock("@/navigation/opened-link", () => ({ takeOpenedPath: jest.fn(() => null) }));
// Tuesday 17 November 2026, noon: the booking completed on Sunday.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-17T12:00:00Z") }));

const booking = completedBooking();
const ratePage = `/bookings/${booking.id}/rate`;

/** Opens the app at `path`, as the browser would. */
function openedAt(path: string) {
  (takeOpenedPath as jest.Mock).mockReturnValueOnce(path);
}

const keptPath = () => {
  const kept = mockData.get("pending-link");
  return kept === undefined || kept === "" ? null : (JSON.parse(kept) as { path: string }).path;
};

async function signInWithCode(fake: FakeClient) {
  fake.answer("/v1/auth/phone/start", () => ok(202, { resendAfterSeconds: 30 }));
  fake.answer("/v1/auth/phone/verify", () =>
    ok(200, { ...tokens(1), user: completeMe, isNewUser: false }),
  );
  await fireEvent.changeText(await screen.findByLabelText("Mobile number"), "690 0000");
  await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
  await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
}

beforeEach(() => {
  mockData.clear();
  (takeOpenedPath as jest.Mock).mockReset().mockReturnValue(null);
});

describe("a link opened before signing in (spec 20, 3.2)", () => {
  it("asks to sign in, then opens the screen of the link", async () => {
    openedAt(ratePage);
    const app = await renderApp(ratePage, {
      setUp: (client) => {
        bookingApi(client, () => booking);
      },
    });
    expect(await screen.findByText("Sign in or create an account")).toBeVisible();
    expect(keptPath()).toBe(ratePage);
    await signInWithCode(app.client);
    await waitFor(() => {
      expect(screen).toHavePathname(ratePage);
    });
    expect(await screen.findByRole("button", { name: "Send review" })).toBeVisible();
    // Taken once: nothing is left for a later sign-in.
    expect(keptPath()).toBeNull();
  });

  it("goes before an offer kept earlier, which is let go", async () => {
    mockData.set("pending-offer", JSON.stringify({ keptAt: "2026-11-17T11:30:00.000Z" }));
    openedAt(ratePage);
    const app = await renderApp(ratePage, {
      setUp: (client) => {
        bookingApi(client, () => booking);
      },
    });
    expect(await screen.findByText("Sign in or create an account")).toBeVisible();
    await signInWithCode(app.client);
    expect(await screen.findByRole("button", { name: "Send review" })).toBeVisible();
    expect(screen).toHavePathname(ratePage);
    expect(mockData.get("pending-offer")).toBe("");
  });

  it("asks to sign in for a conversation, then opens it", async () => {
    const chat = `/messages/${chatBooking.id}`;
    openedAt(chat);
    const app = await renderApp(chat, {
      setUp: (client) => {
        chatServer(client);
      },
    });
    expect(await screen.findByText("Sign in or create an account")).toBeVisible();
    expect(keptPath()).toBe(chat);
    await signInWithCode(app.client);
    await waitFor(() => {
      expect(screen).toHavePathname(chat);
    });
    expect(await screen.findByText("One small bag.")).toBeVisible();
  });

  it("keeps the link while sign-up steps are left, without asking to sign in", async () => {
    openedAt(ratePage);
    await renderApp(ratePage, { me: { ...testMe, missingSteps: ["legal", "profile"] } });
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    expect(keptPath()).toBe(ratePage);
  });

  it("keeps nothing for an account that is ready: the link opens", async () => {
    openedAt(ratePage);
    await renderApp(ratePage, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => booking);
      },
    });
    expect(await screen.findByRole("button", { name: "Send review" })).toBeVisible();
    expect(keptPath()).toBeNull();
  });

  it("keeps nothing and asks nothing for a screen open to everyone", async () => {
    openedAt("/");
    await renderApp("/");
    expect(await screen.findByRole("header", { name: "Where are you going?" })).toBeVisible();
    expect(screen.queryByText("Sign in or create an account")).toBeNull();
    expect(keptPath()).toBeNull();
  });
});
