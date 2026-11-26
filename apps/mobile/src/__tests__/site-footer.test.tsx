import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import { getLocales } from "expo-localization";
import { Dimensions, Linking } from "react-native";
import { onWebsite } from "@/lib/on-website";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { searchApi } from "@/testing/search";
import { blonduos, borgarnes } from "@/testing/trips";
import { colors, pageMaxWidth } from "@/theme/tokens";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: jest.fn() }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// The footer is the website's; these tests are the website unless they say not.
jest.mock("@/lib/on-website", () => ({ onWebsite: jest.fn(() => true) }));

function deviceLanguage(languageTag: string) {
  (getLocales as jest.Mock).mockReturnValue([{ languageTag }]);
}

const phone = { width: 750, height: 1334, scale: 2, fontScale: 2 };
const laptop = { width: 1280, height: 800, scale: 1, fontScale: 1 };

let openURL: jest.SpyInstance;

beforeEach(() => {
  deviceLanguage("en-GB");
  (onWebsite as jest.Mock).mockReturnValue(true);
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});

afterEach(() => {
  openURL.mockRestore();
});

const footer = async () => within(await screen.findByTestId("site-footer"));

const links = [
  "About PuffinRide",
  "Carpool in Iceland",
  "Meeting points",
  "Terms of Service",
  "Community Rules",
  "Privacy Policy",
  "Cookies",
  "admin@puffinride.is",
];

// The website's footer (spec 30, 3.3): at the end of each public page, four
// groups on a laptop and quiet links on a phone.
describe("the footer on a phone's browser", () => {
  it("ends the front page with every link, and no group headings", async () => {
    await renderApp("/");
    const end = await footer();
    for (const name of [...links, "Facebook", "Instagram"]) {
      expect(end.getByRole("link", { name })).toBeVisible();
    }
    expect(end.queryByText("Contact")).toBeNull();
    expect(end.queryByText("Carpooling across Iceland")).toBeNull();
  });

  it("opens each page within the app, an email, our Facebook Page and Instagram", async () => {
    await renderApp("/carpool-iceland");
    await fireEvent.press((await footer()).getByRole("link", { name: "Privacy Policy" }));
    await waitFor(() => {
      expect(screen).toHavePathname("/legal/privacy");
    });
    await fireEvent.press((await footer()).getByRole("link", { name: "About PuffinRide" }));
    expect(await screen.findByRole("header", { name: "About PuffinRide" })).toBeVisible();
    const end = await footer();
    await fireEvent.press(end.getByRole("link", { name: "admin@puffinride.is" }));
    expect(openURL).toHaveBeenCalledWith("mailto:admin@puffinride.is");
    await fireEvent.press(end.getByRole("link", { name: "Facebook" }));
    expect(openURL).toHaveBeenCalledWith("https://www.facebook.com/profile.php?id=61597055066444");
    await fireEvent.press(end.getByRole("link", { name: "Instagram" }));
    expect(openURL).toHaveBeenCalledWith("https://www.instagram.com/puffinride.is/");
  });

  it("is in Icelandic for an Icelandic device", async () => {
    deviceLanguage("is-IS");
    await renderApp("/about");
    const end = await footer();
    for (const name of ["Um PuffinRide", "Samferða um Ísland", "Mótsstaðir", "Vafrakökur"]) {
      expect(end.getByRole("link", { name })).toBeVisible();
    }
  });
});

describe("the footer on a laptop", () => {
  beforeEach(() => {
    Dimensions.set({ window: laptop });
  });

  afterEach(async () => {
    await act(() => {
      Dimensions.set({ window: phone });
    });
  });

  it("is four groups under a line as wide as the page, the logo and name first", async () => {
    await renderApp("/");
    const end = await footer();
    expect(screen.getByTestId("site-footer-content")).toHaveStyle({
      maxWidth: pageMaxWidth,
      borderTopColor: colors.light.border,
    });
    expect(end.getByText("Carpooling across Iceland")).toBeVisible();
    for (const group of ["Terms", "Contact"]) {
      expect(end.getByText(group)).toBeVisible();
    }
    expect(end.getAllByText("PuffinRide")).toHaveLength(2);
    for (const name of [...links, "PuffinRide on Facebook", "PuffinRide on Instagram"]) {
      expect(end.getByRole("link", { name })).toBeVisible();
    }
    // Group headings are not the page's: its own stay in order.
    expect(end.queryAllByRole("header")).toHaveLength(0);
  });
});

describe("where the footer is", () => {
  it.each([
    ["/about", "About PuffinRide"],
    ["/legal/terms", "Terms of Service"],
    ["/cookies", "Cookies"],
    ["/meeting-points", "Meeting points"],
  ])("ends %s", async (path, title) => {
    await renderApp(path);
    expect(await screen.findByRole("header", { name: title })).toBeVisible();
    expect(await screen.findByTestId("site-footer")).toBeVisible();
  });

  it("is not on Profile, signing in or My rides", async () => {
    await renderApp("/profile");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeVisible();
    expect(screen.queryByTestId("site-footer")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => {
      expect(screen).toHavePathname("/sign-in");
    });
    expect(screen.queryByTestId("site-footer")).toBeNull();
  });

  it("ends the search results, but not the form that changes the search", async () => {
    await renderApp(
      `/search/results?from=${borgarnes.id}&to=${blonduos.id}&fromName=Borgarnes&toName=Bl%C3%B6ndu%C3%B3s&seats=1`,
      {
        setUp: (client) => {
          searchApi(client);
        },
      },
    );
    await screen.findByTestId("trip-result");
    expect(screen.getByTestId("site-footer")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: /^Change search: / }));
    expect(await screen.findByRole("header", { name: "Change search" })).toBeVisible();
    expect(screen.queryByTestId("site-footer")).toBeNull();
  });

  it("is not on My rides, signed in", async () => {
    await renderApp("/my-rides", { me: completeMe });
    expect(await screen.findByRole("header", { name: "My rides" })).toBeVisible();
    expect(screen.queryByTestId("site-footer")).toBeNull();
  });

  it("is not in the phone apps, which have About in Profile", async () => {
    (onWebsite as jest.Mock).mockReturnValue(false);
    await renderApp("/about");
    expect(await screen.findByRole("header", { name: "About PuffinRide" })).toBeVisible();
    expect(screen.queryByTestId("site-footer")).toBeNull();
  });
});
