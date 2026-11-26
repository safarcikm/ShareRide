import type { Config } from "@shareride/contracts";
import { router } from "expo-router";
import { act, fireEvent, screen, waitFor } from "expo-router/testing-library";
import { consentKey, consentRecord } from "@/analytics/consent";
import { createFakeAnalyticsHost, setAnalyticsHost } from "@/testing/analytics-host";
import { renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import type * as TestHost from "@/testing/analytics-host";
import { ok, testMe, type FakeClient } from "@/testing/fake-client";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("@/analytics/host", () => {
  return jest.requireActual<typeof TestHost>("@/testing/analytics-host").mockHostModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
const mockPreferences = new Map<string, string>();
jest.mock("@/lib/preferences", () => ({
  readPreference: (key: string) => Promise.resolve(mockPreferences.get(key) ?? null),
  writePreference: (key: string, value: string) => {
    mockPreferences.set(key, value);
    return Promise.resolve();
  },
}));

// The question about cookies, Google's tag and the Cookies page on the
// website (spec 23, 3.1 to 3.3). The phone apps have none.

const id = "G-ABC123XYZ9";
const question =
  "May we count your visit with Google Analytics? It uses cookies and tells Google which pages you open, never your name.";

const config = (analytics: Config["analytics"]) => ({
  setUp: (client: FakeClient) => {
    client.answer("/v1/config", () =>
      ok(200, {
        beta: false,
        paused: [],
        maxSeats: 8,
        freeCancellationMinutes: 15,
        maxMoveMinutes: 120,
        reliabilityMonths: 12,
        signInProviders: [],
        payInPerson: false,
        analytics,
      }),
    );
  },
});
const withAnalytics = config({ googleMeasurementId: id });

const savedChoice = () => JSON.parse(mockPreferences.get(consentKey) ?? "null") as unknown;
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 3600 * 1000);

let page: ReturnType<typeof createFakeAnalyticsHost>;

beforeEach(() => {
  mockPreferences.clear();
  page = createFakeAnalyticsHost();
  page.cookies.add("_ga").add("_ga_ABC123XYZ9").add("other");
  setAnalyticsHost(page);
});

describe("The question about cookies", () => {
  it("asks on the website with Google Analytics, and loads nothing from Google until answered", async () => {
    await renderApp("/legal/privacy", withAnalytics);
    // A region named Cookies, for screen readers (3.1, item 8).
    expect(await screen.findByLabelText("Cookies")).toHaveProp("role", "region");
    expect(screen.getByText(question)).toBeVisible();
    // Accept and Decline alike, side by side (R23.2).
    expect(screen.getByRole("button", { name: "Accept" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Decline" })).toBeVisible();
    expect(page.scripts).toEqual([]);
    expect(page.commands()).toEqual([]);
  });

  it("stands over the menu's bar as the bar is laid out, which large text makes taller", async () => {
    await renderApp("/", withAnalytics);
    await screen.findByLabelText("Cookies");
    // Until the bar is laid out, over its height as counted: its line, its
    // padding and a tab.
    expect(screen.getByTestId("consent-layer")).toHaveStyle({ bottom: 2 + 4 + 56 + 4 + 8 });
    await fireEvent(screen.getByTestId("tab-bar"), "layout", {
      nativeEvent: { layout: { x: 0, y: 580, width: 360, height: 160 } },
    });
    expect(screen.getByTestId("consent-layer")).toHaveStyle({ bottom: 160 + 8 });
    // The web tells a height of nothing for a bar out of sight, as under
    // another screen: that is not its height.
    await fireEvent(screen.getByTestId("tab-bar"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 0, height: 0 } },
    });
    expect(screen.getByTestId("consent-layer")).toHaveStyle({ bottom: 160 + 8 });
  });

  it("counts the bar's height again once that bar is gone", async () => {
    const first = await renderApp("/", withAnalytics);
    await screen.findByLabelText("Cookies");
    await fireEvent(screen.getByTestId("tab-bar"), "layout", {
      nativeEvent: { layout: { x: 0, y: 580, width: 360, height: 160 } },
    });
    await first.unmount();
    await renderApp("/", withAnalytics);
    await screen.findByLabelText("Cookies");
    expect(screen.getByTestId("consent-layer")).toHaveStyle({ bottom: 2 + 4 + 56 + 4 + 8 });
  });

  it("Accept loads Google's tag and counts the screen open now, by its pattern", async () => {
    await renderApp("/legal/privacy", withAnalytics);
    await fireEvent.press(await screen.findByRole("button", { name: "Accept" }));
    await waitFor(() => {
      expect(page.scripts).toEqual([`https://www.googletagmanager.com/gtag/js?id=${id}`]);
    });
    expect(page.pageViews()).toEqual(["/legal/[type]"]);
    expect(screen.queryByText(question)).toBeNull();
    expect(savedChoice()).toEqual({ choice: "accepted", at: expect.any(String) as string });
  });

  it("Decline loads nothing, removes Google's cookies and keeps the answer", async () => {
    await renderApp("/legal/privacy", withAnalytics);
    await fireEvent.press(await screen.findByRole("button", { name: "Decline" }));
    expect(screen.queryByText(question)).toBeNull();
    expect(page.scripts).toEqual([]);
    expect([...page.cookies]).toEqual(["other"]);
    expect(savedChoice()).toEqual({ choice: "declined", at: expect.any(String) as string });
  });

  it("does not ask again within 12 months, and counts from the start once accepted", async () => {
    mockPreferences.set(consentKey, consentRecord("accepted", daysAgo(300)));
    await renderApp("/legal/privacy", withAnalytics);
    await waitFor(() => {
      expect(page.pageViews()).toEqual(["/legal/[type]"]);
    });
    expect(screen.queryByText(question)).toBeNull();
  });

  it("counts each screen opened after, by its pattern, never its address", async () => {
    mockPreferences.set(consentKey, consentRecord("accepted", daysAgo(1)));
    await renderApp("/about", withAnalytics);
    await fireEvent.press(await screen.findByRole("link", { name: "Privacy Policy" }));
    expect(await screen.findByText("Draft text.")).toBeVisible();
    await waitFor(() => {
      expect(page.pageViews()).toEqual(["/about", "/legal/[type]"]);
    });
    expect(JSON.stringify(page.commands())).not.toContain("privacy");
  });

  it("counts another screen of the same pattern, such as the next document", async () => {
    mockPreferences.set(consentKey, consentRecord("accepted", daysAgo(1)));
    await renderApp("/legal/terms", withAnalytics);
    await waitFor(() => {
      expect(page.pageViews()).toEqual(["/legal/[type]"]);
    });
    await act(() => {
      router.push("/legal/privacy");
    });
    await waitFor(() => {
      expect(page.pageViews()).toEqual(["/legal/[type]", "/legal/[type]"]);
    });
  });

  it("asks again after 12 months", async () => {
    mockPreferences.set(consentKey, consentRecord("declined", daysAgo(370)));
    await renderApp("/legal/privacy", withAnalytics);
    expect(await screen.findByText(question)).toBeVisible();
  });

  it("does not ask on a site without Google Analytics, or in the phone apps", async () => {
    await renderApp("/legal/privacy", config(null));
    expect(await screen.findByText("Draft text.")).toBeVisible();
    expect(screen.queryByText(question)).toBeNull();

    setAnalyticsHost(null);
    await renderApp("/legal/privacy", withAnalytics);
    expect(await screen.findByText("Draft text.")).toBeVisible();
    expect(screen.queryByText(question)).toBeNull();
  });

  it("waits while signing in or up, and asks on the next screen (spec 29, 3.6)", async () => {
    await renderApp("/sign-in", withAnalytics);
    expect(
      await screen.findByRole("header", { name: "Sign in or create an account" }),
    ).toBeVisible();
    expect(screen.queryByText(question)).toBeNull();
    await act(() => {
      router.push("/sign-in/country");
    });
    expect(await screen.findByRole("header", { name: "Choose a country" })).toBeVisible();
    expect(screen.queryByText(question)).toBeNull();
    await act(() => {
      router.replace("/legal/privacy");
    });
    expect(await screen.findByText(question)).toBeVisible();
  });

  it("waits on About you too (spec 29, 3.6)", async () => {
    await renderApp("/", {
      ...withAnalytics,
      me: { ...testMe, ageConfirmed: true, missingSteps: ["profile"] },
    });
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    expect(screen.queryByText(question)).toBeNull();
  });

  it("Read more opens the Cookies page", async () => {
    await renderApp("/legal/privacy", withAnalytics);
    await fireEvent.press(await screen.findByRole("link", { name: "Read more" }));
    expect(
      await screen.findByRole("switch", { name: "Count my visits with Google Analytics" }),
    ).toBeVisible();
  });
});

describe("The Cookies page", () => {
  const theSwitch = () =>
    screen.findByRole("switch", { name: "Count my visits with Google Analytics" });

  it("turning Google Analytics off stops it at once and removes its cookies (R23.4)", async () => {
    mockPreferences.set(consentKey, consentRecord("accepted", daysAgo(10)));
    await renderApp("/cookies", withAnalytics);
    expect(await theSwitch()).toBeChecked();
    await waitFor(() => {
      expect(page.scripts).toHaveLength(1);
    });
    await fireEvent.press(await theSwitch());
    expect(await theSwitch()).not.toBeChecked();
    expect(page.globals[`ga-disable-${id}`]).toBe(true);
    expect([...page.cookies]).toEqual(["other"]);
    expect(savedChoice()).toEqual({ choice: "declined", at: expect.any(String) as string });
    // Loaded again, so nothing of Google's tag is left running in the page.
    expect(page.reloads()).toBe(1);
  });

  it("stops in this tab too when it is turned off in another", async () => {
    mockPreferences.set(consentKey, consentRecord("accepted", daysAgo(10)));
    await renderApp("/cookies", withAnalytics);
    expect(await theSwitch()).toBeChecked();
    await waitFor(() => {
      expect(page.scripts).toHaveLength(1);
    });
    mockPreferences.set(consentKey, consentRecord("declined", daysAgo(0)));
    await act(() => {
      page.changeInAnotherTab(consentKey);
    });
    await waitFor(async () => {
      expect(await theSwitch()).not.toBeChecked();
    });
    expect(page.globals[`ga-disable-${id}`]).toBe(true);
    // Not loaded again: the visitor may be in the middle of something here.
    expect(page.reloads()).toBe(0);
  });

  it("turning it on is accepting; the page asks with its switch, not the bar too", async () => {
    await renderApp("/cookies", withAnalytics);
    expect(await theSwitch()).not.toBeChecked();
    expect(screen.queryByText(question)).toBeNull();
    await fireEvent.press(await theSwitch());
    expect(await theSwitch()).toBeChecked();
    await waitFor(() => {
      expect(page.pageViews()).toEqual(["/cookies"]);
    });
    expect(screen.queryByText(question)).toBeNull();
  });

  it("says that no visits are counted where there is no Google Analytics", async () => {
    await renderApp("/cookies", config(null));
    expect(
      await screen.findByText("No visits are counted here, and no cookies are used for analytics."),
    ).toBeVisible();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByRole("link", { name: "Read the Privacy Policy" })).toBeVisible();
  });

  it("opens from About", async () => {
    await renderApp("/about", withAnalytics);
    await fireEvent.press(await screen.findByRole("link", { name: "Cookies" }));
    expect(await theSwitch()).toBeVisible();
  });
});
