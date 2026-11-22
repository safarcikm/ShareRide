import type { Config } from "@shareride/contracts";
import { router } from "expo-router";
import { act, fireEvent, screen, waitFor } from "expo-router/testing-library";
import { consentKey, consentRecord } from "@/analytics/consent";
import { createFakeAnalyticsHost, setAnalyticsHost } from "@/testing/analytics-host";
import { renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import type * as TestHost from "@/testing/analytics-host";
import { ok, type FakeClient } from "@/testing/fake-client";

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
    await renderApp("/legal", withAnalytics);
    await fireEvent.press(await screen.findByRole("button", { name: "Privacy Policy" }));
    expect(await screen.findByText("Draft text.")).toBeVisible();
    await waitFor(() => {
      expect(page.pageViews()).toEqual(["/legal", "/legal/[type]"]);
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

  it("opens from Terms, rules and privacy", async () => {
    await renderApp("/legal", withAnalytics);
    await fireEvent.press(await screen.findByRole("button", { name: "Cookies" }));
    expect(await theSwitch()).toBeVisible();
  });
});
