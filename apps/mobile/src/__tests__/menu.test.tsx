import { act, fireEvent, screen, within } from "expo-router/testing-library";
import { Dimensions } from "react-native";
import { getLocales } from "expo-localization";
import type { DriverReadiness } from "@shareride/contracts";
import { readAppData, writeAppData } from "@/lib/app-data";
import { completeMe, renderApp, signInByEmail } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { ok, testMe } from "@/testing/fake-client";
import { northResult, searchApi, soonestApi, soonRide, tripDetailsApi } from "@/testing/search";
import { colors } from "@/theme/tokens";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: jest.fn() }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn(() => Promise.resolve(null)),
  writeAppData: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

const mockedRead = readAppData as jest.Mock;
const mockedWrite = writeAppData as jest.Mock;

beforeEach(() => {
  (getLocales as jest.Mock).mockReturnValue([{ languageTag: "en-GB" }]);
  mockedRead.mockReset().mockResolvedValue(null);
  mockedWrite.mockClear();
});

const tab = (name: string) => screen.getByRole("tab", { name });

interface NavigationState {
  readonly routes: readonly { readonly name: string; readonly state?: NavigationState }[];
}

/** How many copies of the menu the app's stack holds: one, or Back walks through old ones. */
function menuCopies(state: NavigationState | undefined): number {
  if (state === undefined) return 0;
  const here = state.routes.filter((route) => route.name === "(tabs)").length;
  if (here > 0) return here;
  return state.routes.reduce((count, route) => count + menuCopies(route.state), 0);
}

/** On Find, chooses Borgarnes in From. */
async function chooseFrom() {
  await fireEvent.press(await screen.findByRole("button", { name: /^From: / }));
  await fireEvent.changeText(await screen.findByLabelText("From"), "borg");
  await fireEvent.press(await screen.findByRole("button", { name: /^Borgarnes/ }));
  expect(await screen.findByRole("button", { name: "From: Borgarnes" })).toBeVisible();
}

const readiness: DriverReadiness = {
  ready: false,
  items: [
    { item: "car", done: false, blocking: true },
    { item: "licence", done: false, blocking: true },
  ],
  licenceDeclaredAt: null,
};

describe("The menu (spec 16, 3.1)", () => {
  it("shows Find, My rides, Offer, Messages and Profile in that order, with Find chosen", async () => {
    await renderApp("/");
    const tabs = await screen.findAllByRole("tab");
    expect(
      tabs.map((each) => (each.props as { accessibilityLabel?: string }).accessibilityLabel),
    ).toEqual(["Find", "My rides", "Offer", "Messages", "Profile"]);
    expect(tab("Find")).toBeSelected();
    expect(tab("My rides")).not.toBeSelected();
    expect(screen.getByTestId("tab-bar")).toBeVisible();
  });

  it("gives each place an ID of its own, which the phone journeys tap in any language", async () => {
    await renderApp("/");
    await screen.findAllByRole("tab");
    for (const [id, name] of [
      ["tab-index", "Find"],
      ["tab-my-rides", "My rides"],
      ["tab-offer", "Offer"],
      ["tab-messages", "Messages"],
      ["tab-profile", "Profile"],
    ] as const) {
      expect(screen.getByTestId(id)).toHaveAccessibleName(name);
    }
  });

  it("asks to sign in on My rides when signed out", async () => {
    await renderApp("/");
    await fireEvent.press(await screen.findByRole("tab", { name: "My rides" }));
    expect(await screen.findByRole("header", { name: "Sign in to see your rides" })).toBeVisible();
    // A signed-out place has the puffin by its pin over its title.
    expect(screen.getByTestId("puffin-by-pin", { includeHiddenElements: true })).toBeTruthy();
    expect(tab("My rides")).toBeSelected();
    expect(screen).toHavePathname("/my-rides");
    // A main screen has no Back button.
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Sign in or create an account")).toBeVisible();
    expect(mockedWrite).not.toHaveBeenCalledWith("pending-offer", expect.anything());
  });

  it("offers to sign in on Offer when signed out, keeping the offer", async () => {
    await renderApp("/");
    await fireEvent.press(await screen.findByRole("tab", { name: "Offer" }));
    expect(
      await screen.findByText("Driving somewhere? Share the empty seats in your car."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Sign in to offer a ride" }));
    expect(await screen.findByText("Sign in or create an account")).toBeVisible();
    const [key] = mockedWrite.mock.calls.at(-1) as [string, string];
    expect(key).toBe("pending-offer");
  });

  it("welcomes on Profile when signed out: what an account is for and Sign in, then rows and the language", async () => {
    await renderApp("/");
    await fireEvent.press(await screen.findByRole("tab", { name: "Profile" }));
    expect(await screen.findByRole("header", { name: "Profile" })).toBeVisible();
    // The puffin by its pin, which screen readers skip, over the welcome.
    expect(screen.getByTestId("puffin-by-pin", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("puffin-by-pin")).toBeNull();
    expect(
      screen.getByText(
        "Sign in to book seats and offer rides, with your rides and messages in one place.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
    // The same rows as signed in.
    expect(screen.getByRole("button", { name: "Meeting points" })).toBeVisible();
    expect(screen.getByRole("button", { name: "About PuffinRide" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Change the language to Icelandic" })).toBeVisible();
  });

  it("opens the legal documents on About from Profile when signed out", async () => {
    await renderApp("/");
    await fireEvent.press(await screen.findByRole("tab", { name: "Profile" }));
    await fireEvent.press(await screen.findByRole("button", { name: "About PuffinRide" }));
    expect(await screen.findByRole("link", { name: "Terms of Service" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Community Rules" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
    expect(screen).toHavePathname("/about");
  });

  it("opens a ride on top, with Back and without the tab bar", async () => {
    const ride = soonRide("2026-11-15", 0, { tripId: northResult.tripId });
    await renderApp("/", {
      setUp: (fake) => {
        soonestApi(fake, [ride]);
        tripDetailsApi(fake);
      },
    });
    await fireEvent.press(await screen.findByTestId("trip-result"));
    expect(await screen.findByTestId("bottom-bar")).toBeVisible();
    expect(screen.queryByTestId("tab-bar")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByTestId("tab-bar")).toBeVisible();
    expect(tab("Find")).toBeSelected();
  });

  it("goes back to Find from a ride opened directly", async () => {
    await renderApp(`/trips/${northResult.tripId}?from=0&to=3`, {
      setUp: (fake) => {
        tripDetailsApi(fake);
      },
    });
    expect(await screen.findByTestId("bottom-bar")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByTestId("tab-bar")).toBeVisible();
    expect(screen).toHavePathname("/");
  });

  it("keeps a tab as it was when coming back to it", async () => {
    await renderApp("/", {
      setUp: (fake) => {
        searchApi(fake);
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: /^From: / }));
    await fireEvent.changeText(await screen.findByLabelText("From"), "borg");
    await fireEvent.press(await screen.findByRole("button", { name: /^Borgarnes/ }));
    await fireEvent.press(tab("Profile"));
    expect(await screen.findByRole("header", { name: "Profile" })).toBeVisible();
    await fireEvent.press(tab("Find"));
    expect(await screen.findByRole("button", { name: "From: Borgarnes" })).toBeVisible();
  });

  it("stays on Find after signing in, and keeps the menu", async () => {
    await renderApp("/", { me: completeMe });
    expect(await screen.findByTestId("tab-bar")).toBeVisible();
    expect(tab("Find")).toBeSelected();
    expect(screen).toHavePathname("/");
    expect(screen.getByRole("button", { name: "Find a ride" })).toBeVisible();
  });

  it("opens Offer after signing in when an offer was kept", async () => {
    mockedRead.mockImplementation((name: string) =>
      Promise.resolve(
        name === "pending-offer" ? JSON.stringify({ keptAt: "2026-11-14T11:30:00.000Z" }) : null,
      ),
    );
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/me/driver-readiness", () => ok(200, readiness));
        client.answer("/v1/me/vehicles", () => ok(200, { vehicles: [] }));
      },
    });
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    expect(screen).toHavePathname("/offer");
    expect(tab("Offer")).toBeSelected();
  });

  it("sends an account with sign-up steps left to its next step from any tab", async () => {
    await renderApp("/my-rides", { me: { ...testMe, missingSteps: ["legal", "profile"] } });
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    expect(screen).toHavePathname("/onboarding/about-you");
  });

  it("keeps one menu after signing in and after signing out", async () => {
    const app = await renderApp("/", {
      setUp: (fake) => {
        fake.answer("/v1/me/bookings", () => ok(200, { bookings: [] }));
        fake.answer("/v1/auth/sign-out", () => ok(204));
      },
    });
    await fireEvent.press(await screen.findByRole("tab", { name: "My rides" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Sign in" }));
    await signInByEmail(app.client);
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(menuCopies(app.getRouterState())).toBe(1);
    await fireEvent.press(tab("Profile"));
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(menuCopies(app.getRouterState())).toBe(1);
  });

  it("shows the account's own pages on My rides, Offer and Profile once signed in", async () => {
    await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/me/bookings", () => ok(200, { bookings: [] }));
        client.answer("/v1/me/driver-readiness", () => ok(200, readiness));
        client.answer("/v1/me/vehicles", () => ok(200, { vehicles: [] }));
      },
    });
    await fireEvent.press(await screen.findByRole("tab", { name: "My rides" }));
    expect(await screen.findByRole("header", { name: "My rides" })).toBeVisible();
    await fireEvent.press(tab("Offer"));
    expect(await screen.findByRole("header", { name: "Where are you driving?" })).toBeVisible();
    await fireEvent.press(tab("Profile"));
    expect(await screen.findByRole("header", { name: "My profile" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });
});

describe("The tab bar on phones", () => {
  it("shows the chosen place in the primary colour, and every name whole at large text", async () => {
    await renderApp("/");
    const find = await screen.findByRole("tab", { name: "Find" });
    expect(within(find).getByText("Find")).toHaveStyle({ color: colors.light.primary });
    expect(within(tab("Profile")).getByText("Profile")).toHaveStyle({
      color: colors.light.textMuted,
    });
    // The text is twice the usual size in these tests; no name is cut short.
    expect(Dimensions.get("window").fontScale).toBe(2);
    const labels = within(screen.getByTestId("tab-bar")).getAllByText(/./u);
    expect(labels).toHaveLength(5);
    for (const label of labels) {
      expect((label.props as { numberOfLines?: number }).numberOfLines).toBeUndefined();
    }
  });
});

describe("The tab bar's places", () => {
  it("start at the top of their tabs, so a name of two lines, as Ferðirnar mínar, lifts no icon over the others", async () => {
    (getLocales as jest.Mock).mockReturnValue([{ languageTag: "is-IS" }]);
    await renderApp("/");
    await screen.findByRole("tab", { name: "Ferðirnar mínar" });
    const places = screen.getAllByRole("tab");
    expect(places).toHaveLength(5);
    // 2 from the top, where an icon over a name of one line (22 in a pill
    // padded by 4, 4 between, and a line of 18) is at the middle of a tab 56 high.
    for (const place of places) {
      expect(place).toHaveStyle({ justifyContent: "flex-start", paddingTop: 2, minHeight: 56 });
    }
  });
});

describe("The top bar on wide screens", () => {
  beforeEach(() => {
    Dimensions.set({ window: { width: 1280, height: 800, scale: 1, fontScale: 1 } });
  });

  afterEach(async () => {
    // The screen is still on show here, so its update goes through act.
    await act(() => {
      Dimensions.set({ window: { width: 750, height: 1334, scale: 2, fontScale: 2 } });
    });
  });

  it("shows the logo, the name, the places and the language, instead of the tab bar", async () => {
    await renderApp("/");
    const bar = await screen.findByTestId("top-bar");
    expect(within(bar).getByTestId("logo", { includeHiddenElements: true })).toBeTruthy();
    expect(within(bar).getByText("PuffinRide")).toBeVisible();
    expect(within(bar).getByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(within(bar).getByRole("tab", { name: "My rides" })).toBeVisible();
    expect(within(bar).getByRole("tab", { name: "Offer" })).toBeVisible();
    expect(within(bar).getByRole("tab", { name: "Messages" })).toBeVisible();
    expect(within(bar).getByRole("tab", { name: "Profile" })).toBeVisible();
    expect(
      within(bar).getByRole("button", { name: "Change the language to Icelandic" }),
    ).toBeVisible();
    expect(screen.queryByTestId("tab-bar")).toBeNull();
  });

  it("lines its content up with the page (spec 18, 3.3)", async () => {
    await renderApp("/");
    await screen.findByTestId("top-bar");
    expect(screen.getByTestId("top-bar-content")).toHaveStyle({ maxWidth: 1144, width: "100%" });
  });

  it("opens Find from the logo and name", async () => {
    const app = await renderApp("/profile");
    const bar = within(await screen.findByTestId("top-bar"));
    await fireEvent.press(bar.getByRole("link", { name: "PuffinRide, to the front page" }));
    expect(await screen.findByRole("button", { name: "Find a ride" })).toBeVisible();
    expect(screen).toHavePathname("/");
    expect(menuCopies(app.getRouterState())).toBe(1);
  });

  it("turns a place primary under the pointer, underlined only when chosen", async () => {
    await renderApp("/");
    const bar = within(await screen.findByTestId("top-bar"));
    expect(bar.getByText("Profile")).toHaveStyle({ color: colors.light.text });
    await fireEvent(bar.getByRole("tab", { name: "Profile" }), "hoverIn");
    expect(bar.getByText("Profile")).toHaveStyle({ color: colors.light.primary });
    expect(bar.getByText("Profile")).not.toHaveStyle({ textDecorationLine: "underline" });
    await fireEvent(bar.getByRole("tab", { name: "Profile" }), "hoverOut");
    expect(bar.getByText("Profile")).toHaveStyle({ color: colors.light.text });
  });

  it("stays on a ride, showing the place it was found from, and goes back there", async () => {
    const ride = soonRide("2026-11-15", 0, { tripId: northResult.tripId });
    await renderApp("/", {
      setUp: (fake) => {
        soonestApi(fake, [ride]);
        tripDetailsApi(fake);
      },
    });
    await fireEvent.press(await screen.findByTestId("trip-result"));
    expect(await screen.findByRole("button", { name: "Share" })).toBeVisible();
    const bar = screen.getByTestId("top-bar");
    expect(within(bar).getByRole("tab", { name: "Find", selected: true })).toBeVisible();
    await fireEvent.press(within(bar).getByRole("tab", { name: "Profile" }));
    expect(await screen.findByRole("header", { name: "Profile" })).toBeVisible();
    expect(screen).toHavePathname("/profile");
    // The ride closed: the bar never piles screens up behind Back.
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    await fireEvent.press(within(bar).getByRole("tab", { name: "Find" }));
    expect(await screen.findByRole("button", { name: "Find a ride" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });

  it("keeps Find's search when the window turns narrow and wide again", async () => {
    await renderApp("/", { setUp: searchApi });
    await chooseFrom();
    await act(() => {
      Dimensions.set({ window: { width: 750, height: 1334, scale: 2, fontScale: 2 } });
    });
    expect(await screen.findByTestId("tab-bar")).toBeVisible();
    expect(screen.getByRole("button", { name: "From: Borgarnes" })).toBeVisible();
    await act(() => {
      Dimensions.set({ window: { width: 1280, height: 800, scale: 1, fontScale: 1 } });
    });
    expect(await screen.findByTestId("top-bar")).toBeVisible();
    expect(screen.getByRole("button", { name: "From: Borgarnes" })).toBeVisible();
  });

  it("keeps one menu and its places after opening a ride from a link", async () => {
    const app = await renderApp(`/trips/${northResult.tripId}?from=0&to=3`, {
      setUp: (fake) => {
        tripDetailsApi(fake);
        searchApi(fake);
      },
    });
    expect(await screen.findByRole("button", { name: "Share" })).toBeVisible();
    const bar = () => within(screen.getByTestId("top-bar"));
    await fireEvent.press(bar().getByRole("tab", { name: "Find" }));
    await chooseFrom();
    await fireEvent.press(bar().getByRole("tab", { name: "Profile" }));
    expect(await screen.findByRole("header", { name: "Profile" })).toBeVisible();
    await fireEvent.press(bar().getByRole("tab", { name: "Find" }));
    expect(await screen.findByRole("button", { name: "From: Borgarnes" })).toBeVisible();
    expect(menuCopies(app.getRouterState())).toBe(1);
  });

  it("closes sign-in onto the menu it opened from", async () => {
    const app = await renderApp("/profile");
    app.client.answer("/v1/auth/email/start", () => ok(202, { resendAfterSeconds: 30 }));
    await fireEvent.press(await screen.findByRole("button", { name: "Sign in" }));
    await fireEvent.changeText(await screen.findByLabelText("Email"), "anna@example.com");
    await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByLabelText("6-digit code")).toBeVisible();
    await fireEvent.press(within(screen.getByTestId("top-bar")).getByRole("tab", { name: "Find" }));
    expect(await screen.findByRole("button", { name: "Find a ride" })).toBeVisible();
    expect(screen).toHavePathname("/");
    expect(menuCopies(app.getRouterState())).toBe(1);
  });
});
