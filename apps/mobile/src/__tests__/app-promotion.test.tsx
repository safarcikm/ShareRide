import type { AppStore } from "@shareride/domain";
import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { getLocales } from "expo-localization";
import { Dimensions, Linking } from "react-native";
import { browserUserAgent } from "@/app-promotion/browser";
import { onWebsite } from "@/lib/on-website";
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
jest.mock("expo-localization", () => ({ getLocales: jest.fn() }));
const mockPreferences = new Map<string, string>();
jest.mock("@/lib/preferences", () => ({
  readPreference: (key: string) => Promise.resolve(mockPreferences.get(key) ?? null),
  writePreference: (key: string, value: string) => {
    mockPreferences.set(key, value);
    return Promise.resolve();
  },
}));
// These tests are the website unless they say not.
jest.mock("@/lib/on-website", () => ({ onWebsite: jest.fn(() => true) }));
jest.mock("@/app-promotion/browser", () => ({ browserUserAgent: jest.fn(() => null) }));

// The phone apps on the website (spec 35): the badges in the footer and on
// About, the QR code on a laptop, and the strip on Android phones, each
// store only while its switch is on (R35.1), and none in the phone apps.

const android =
  "Mozilla/5.0 (Linux; Android 16; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1";

const phone = { width: 750, height: 1334, scale: 2, fontScale: 2 };
const laptop = { width: 1280, height: 800, scale: 1, fontScale: 1 };

const appStore = "https://apps.apple.com/app/id6840158626";
const googlePlay = (place: string) =>
  `https://play.google.com/store/apps/details?id=is.puffinride.app&referrer=utm_source%3Dpuffinride.is%26utm_medium%3D${place}`;

/** The operator's settings with these stores' pages public, and Google Analytics if given. */
const listed = (appStores: readonly AppStore[], analytics: string | null = null) => ({
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
        emailSignIn: true,
        analytics: analytics === null ? null : { googleMeasurementId: analytics },
        appStores,
      }),
    );
  },
});

let openURL: jest.SpyInstance;

beforeEach(() => {
  (getLocales as jest.Mock).mockReturnValue([{ languageTag: "en-GB" }]);
  (onWebsite as jest.Mock).mockReturnValue(true);
  (browserUserAgent as jest.Mock).mockReturnValue(null);
  mockPreferences.clear();
  setAnalyticsHost(null);
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});

afterEach(() => {
  openURL.mockRestore();
});

const footer = async () => within(await screen.findByTestId("site-footer"));

describe("the badges in the footer (spec 35, 3.5)", () => {
  it("are not there while neither store's page is public", async () => {
    await renderApp("/about", listed([]));
    const end = await footer();
    expect(end.getByRole("link", { name: "Cookies" })).toBeVisible();
    expect(end.queryByRole("link", { name: "Download on the App Store" })).toBeNull();
    expect(end.queryByRole("link", { name: "Get it on Google Play" })).toBeNull();
  });

  it("show each store whose page is public, the App Store first, and open its page", async () => {
    await renderApp("/about", listed(["app_store", "google_play"]));
    const end = await footer();
    const badges = await end.findAllByRole("link", { name: /App Store|Google Play/ });
    expect(badges.map((badge) => badge.props.accessibilityLabel as string)).toEqual([
      "Download on the App Store",
      "Get it on Google Play",
    ]);
    await fireEvent.press(end.getByRole("link", { name: "Download on the App Store" }));
    expect(openURL).toHaveBeenCalledWith(appStore);
    await fireEvent.press(end.getByRole("link", { name: "Get it on Google Play" }));
    expect(openURL).toHaveBeenCalledWith(googlePlay("footer"));
  });

  it("show only the store that is public", async () => {
    await renderApp("/about", listed(["google_play"]));
    const end = await footer();
    expect(await end.findByRole("link", { name: "Get it on Google Play" })).toBeVisible();
    expect(end.queryByRole("link", { name: "Download on the App Store" })).toBeNull();
  });

  it("show Google Play's badge in Icelandic on an Icelandic page, Apple's in English", async () => {
    (getLocales as jest.Mock).mockReturnValue([{ languageTag: "is-IS" }]);
    await renderApp("/about", listed(["app_store", "google_play"]));
    const end = await footer();
    expect(await end.findByRole("link", { name: "Sækja frá Google Play" })).toBeVisible();
    expect(end.getByRole("link", { name: "Sækja í App Store" })).toBeVisible();
    const pictures = end.getAllByTestId("store-badge-image");
    expect(pictures.map((picture) => (picture.props.source as { uri: string }).uri)).toEqual([
      "/stores/app-store-badge-en.svg",
      "/stores/google-play-badge-is.png",
    ]);
  });

  it("are not in the phone apps (R35.2)", async () => {
    (onWebsite as jest.Mock).mockReturnValue(false);
    await renderApp("/about", listed(["app_store", "google_play"]));
    expect(await screen.findByRole("header", { name: "About PuffinRide" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Download on the App Store" })).toBeNull();
    expect(screen.queryByText("The PuffinRide app")).toBeNull();
  });
});

describe("the app on About (spec 35, 3.6)", () => {
  afterEach(async () => {
    await act(() => {
      Dimensions.set({ window: phone });
    });
  });

  it("is a section with the badges, the trademark lines, and no QR code on a phone", async () => {
    await renderApp("/about", listed(["app_store", "google_play"]));
    const section = within(await screen.findByTestId("about-app"));
    expect(section.getByRole("header", { name: "The PuffinRide app" })).toBeVisible();
    expect(
      section.getByText(
        "PuffinRide is also an app for your phone. It tells you at once when something happens on your rides.",
      ),
    ).toBeVisible();
    await fireEvent.press(section.getByRole("link", { name: "Get it on Google Play" }));
    expect(openURL).toHaveBeenCalledWith(googlePlay("about"));
    expect(section.getByText("App Store is a service mark of Apple Inc.")).toBeVisible();
    expect(
      section.getByText("Google Play and the Google Play logo are trademarks of Google LLC."),
    ).toBeVisible();
    expect(section.queryByLabelText("QR code for the PuffinRide app")).toBeNull();
  });

  it("has the QR code to /app on a laptop", async () => {
    Dimensions.set({ window: laptop });
    await renderApp("/about", listed(["app_store"]));
    const section = within(await screen.findByTestId("about-app"));
    const code = section.getByLabelText("QR code for the PuffinRide app");
    expect((code.props.source as { uri: string }).uri).toBe("/stores/app-qr.svg");
    expect(section.getByText("Or point your phone's camera at the code.")).toBeVisible();
    // Only the trademark line of the store shown.
    expect(section.getByText("App Store is a service mark of Apple Inc.")).toBeVisible();
    expect(section.queryByText(/Google Play/)).toBeNull();
  });

  it("is not there while neither store's page is public", async () => {
    await renderApp("/about", listed([]));
    expect(await screen.findByRole("header", { name: "About PuffinRide" })).toBeVisible();
    expect(screen.queryByTestId("about-app")).toBeNull();
  });
});

describe("the strip on an Android phone (spec 35, 3.4)", () => {
  beforeEach(() => {
    (browserUserAgent as jest.Mock).mockReturnValue(android);
  });

  afterEach(async () => {
    await act(() => {
      Dimensions.set({ window: phone });
    });
  });

  // A region named for screen readers, as the question about cookies is.
  const strip = async () => {
    const found = await screen.findByLabelText("The PuffinRide app");
    expect(found).toHaveProp("role", "region");
    return found;
  };

  it("says the app is on Google Play, above the page, while Google Play's page is public", async () => {
    await renderApp("/", listed(["google_play"]));
    const banner = within(await strip());
    expect(banner.getByText("PuffinRide")).toBeVisible();
    expect(
      banner.getByText("Get notified about your rides."),
    ).toBeVisible();
    expect(banner.getByRole("button", { name: "Install" })).toBeVisible();
    expect(banner.getByRole("button", { name: "Close" })).toBeVisible();
  });

  it("opens Google Play with Install, then stays away in this browser (R35.4)", async () => {
    const first = await renderApp("/", listed(["google_play"]));
    await fireEvent.press(within(await strip()).getByRole("button", { name: "Install" }));
    expect(openURL).toHaveBeenCalledWith(googlePlay("banner"));
    expect(screen.queryByLabelText("The PuffinRide app")).toBeNull();
    expect(mockPreferences.has("app-banner-closed")).toBe(true);
    await first.unmount();
    await renderApp("/", listed(["google_play"]));
    expect(await screen.findByRole("header", { name: /Share your ride/ })).toBeVisible();
    expect(screen.queryByLabelText("The PuffinRide app")).toBeNull();
  });

  it("closes with × and stays away, keeping only when", async () => {
    await renderApp("/", listed(["google_play"]));
    await fireEvent.press(within(await strip()).getByRole("button", { name: "Close" }));
    expect(screen.queryByLabelText("The PuffinRide app")).toBeNull();
    expect(openURL).not.toHaveBeenCalled();
    const kept = JSON.parse(mockPreferences.get("app-banner-closed") ?? "null") as unknown;
    expect(kept).toEqual({ at: expect.any(String) as unknown });
  });

  it("is in Icelandic on an Icelandic page", async () => {
    (getLocales as jest.Mock).mockReturnValue([{ languageTag: "is-IS" }]);
    await renderApp("/", listed(["google_play"]));
    const banner = within(await screen.findByLabelText("PuffinRide-appið"));
    expect(banner.getByText("Fáðu tilkynningar um ferðirnar þínar.")).toBeVisible();
    expect(banner.getByRole("button", { name: "Sækja" })).toBeVisible();
    expect(banner.getByRole("button", { name: "Loka" })).toBeVisible();
  });

  it("waits while the question about cookies is open, then shows", async () => {
    setAnalyticsHost(createFakeAnalyticsHost());
    await renderApp("/", listed(["google_play"], "G-ABC123XYZ9"));
    expect(await screen.findByTestId("consent-layer")).toBeVisible();
    expect(screen.queryByLabelText("The PuffinRide app")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Decline" }));
    expect(await strip()).toBeVisible();
  });

  it("is not there while signing in", async () => {
    await renderApp("/sign-in", listed(["google_play"]));
    expect(await screen.findByRole("header", { name: /Sign in|Welcome/ })).toBeVisible();
    expect(screen.queryByLabelText("The PuffinRide app")).toBeNull();
  });

  it("is not there while Google Play's page is not public, or once closed before", async () => {
    const first = await renderApp("/", listed(["app_store"]));
    expect(await screen.findByRole("header", { name: /Share your ride/ })).toBeVisible();
    expect(screen.queryByLabelText("The PuffinRide app")).toBeNull();
    await first.unmount();
    mockPreferences.set("app-banner-closed", JSON.stringify({ at: "2026-11-28T02:00:00.000Z" }));
    await renderApp("/", listed(["google_play"]));
    expect(await screen.findByRole("header", { name: /Share your ride/ })).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByLabelText("The PuffinRide app")).toBeNull();
    });
  });

  it("is not on an iPhone, which has Apple's banner, on a laptop, or in the phone apps", async () => {
    (browserUserAgent as jest.Mock).mockReturnValue(iphone);
    const onIphone = await renderApp("/", listed(["app_store", "google_play"]));
    expect(await screen.findByRole("header", { name: /Share your ride/ })).toBeVisible();
    expect(screen.queryByLabelText("The PuffinRide app")).toBeNull();
    await onIphone.unmount();

    (browserUserAgent as jest.Mock).mockReturnValue(android);
    Dimensions.set({ window: laptop });
    const wide = await renderApp("/", listed(["google_play"]));
    await screen.findAllByRole("header", { name: /Share your ride/ });
    expect(screen.queryByLabelText("The PuffinRide app")).toBeNull();
    await wide.unmount();
    await act(() => {
      Dimensions.set({ window: phone });
    });

    (onWebsite as jest.Mock).mockReturnValue(false);
    await renderApp("/", listed(["google_play"]));
    await screen.findAllByRole("header", { name: /Share your ride/ });
    expect(screen.queryByLabelText("The PuffinRide app")).toBeNull();
  });
});
