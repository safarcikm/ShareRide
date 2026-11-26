import { fireEvent, screen } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import { shareLink } from "@/lib/share";
import { renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { northResult, searchApi, soonestApi, soonRide } from "@/testing/search";
import { blonduos, borgarnes } from "@/testing/trips";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
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
jest.mock("@/lib/share", () => ({ shareLink: jest.fn(() => Promise.resolve("shared")) }));

const mockedShare = shareLink as jest.Mock;

beforeEach(() => {
  mockedShare.mockClear();
});

const resultsUrl = `/search/results?from=${borgarnes.id}&to=${blonduos.id}&fromName=Borgarnes&toName=Bl%C3%B6ndu%C3%B3s&seats=2`;

async function openResults() {
  await renderApp(resultsUrl, {
    setUp: (client) => {
      searchApi(client);
    },
  });
  await screen.findByTestId("trip-result");
}

const shareButton = (route: string) =>
  screen.findByRole("button", { name: `Share the ride ${route}` });

describe("The share icon on a ride's card (spec 28, 3.1)", () => {
  it("shares the part's link from the card's corner, without opening the trip", async () => {
    await openResults();
    await fireEvent.press(await shareButton("Borgarnes → Blönduós"));
    // The part, not the seats searched: those are for whoever opens it (spec 4, 3.7).
    expect(mockedShare).toHaveBeenCalledWith(
      `http://localhost:3000/trips/${northResult.tripId}?from=1&to=2`,
      "Borgarnes → Blönduós on PuffinRide",
    );
    expect(screen).toHavePathname("/search/results");
  });

  it("shows a tick and says so when the link was copied", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    mockedShare.mockResolvedValueOnce("copied");
    await openResults();
    await fireEvent.press(await shareButton("Borgarnes → Blönduós"));
    expect(await screen.findByTestId("share-copied")).toBeVisible();
    expect(announce).toHaveBeenCalledWith("Link copied. Paste it wherever you like.");
    announce.mockRestore();
  });

  it("shows the link to copy by hand when it could not be shared", async () => {
    mockedShare.mockResolvedValueOnce("failed");
    await openResults();
    await fireEvent.press(await shareButton("Borgarnes → Blönduós"));
    expect(
      await screen.findByText(
        `The link could not be shared. Here it is to copy: http://localhost:3000/trips/${northResult.tripId}?from=1&to=2`,
      ),
    ).toBeVisible();
  });

  it("is on the front page's rides leaving soon, for the whole route", async () => {
    const ride = soonRide("2026-11-15");
    await renderApp("/", {
      setUp: (fake) => {
        soonestApi(fake, [ride]);
      },
    });
    await fireEvent.press(await shareButton("BSÍ bus terminal → Hof, Akureyri"));
    expect(mockedShare).toHaveBeenCalledWith(
      `http://localhost:3000/trips/${ride.tripId}?from=0&to=3`,
      "BSÍ bus terminal → Hof, Akureyri on PuffinRide",
    );
    expect(screen).toHavePathname("/");
  });
});
