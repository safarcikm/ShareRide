import { fireEvent, screen } from "expo-router/testing-library";
import { readAppData, writeAppData } from "@/lib/app-data";
import { renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { failure, ok } from "@/testing/fake-client";
import { searchesOf, soonestApi, soonRide, soonRides } from "@/testing/search";

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

beforeEach(() => {
  (readAppData as jest.Mock).mockResolvedValue(null);
  (writeAppData as jest.Mock).mockClear();
});

/** Fifty rides: ten a day for five days. */
const fifty = Array.from({ length: 50 }, (_, n) =>
  soonRide(`2026-11-${String(15 + Math.floor(n / 10))}`, n),
);

describe("All rides leaving soon (spec 4, 3.8)", () => {
  it("opens from See all rides, with every ride and its day, and goes back", async () => {
    const { client } = await renderApp("/", {
      setUp: (fake) => {
        soonestApi(fake, soonRides(8));
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "See all rides" }));
    expect(await screen.findByRole("header", { name: "Rides leaving soon" })).toBeVisible();
    expect(screen).toHavePathname("/rides");
    expect(await screen.findAllByTestId("trip-result")).toHaveLength(8);
    expect(screen.getByRole("button", { name: /^Sun 22 Nov, Leaves BSÍ/ })).toBeVisible();
    expect(screen.queryByText(/50 soonest/)).toBeNull();
    expect(searchesOf(client, "/v1/trips/soonest")).toEqual([{ limit: 6 }, { limit: 50 }]);

    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("header", { name: "Leaving soon" })).toBeVisible();
  });

  it("says when it shows the 50 soonest, that a search finds more", async () => {
    await renderApp("/rides", {
      setUp: (fake) => {
        soonestApi(fake, [...fifty, soonRide("2026-11-20")]);
      },
    });
    expect(await screen.findAllByTestId("trip-result")).toHaveLength(50);
    expect(
      screen.getByText("These are the 50 soonest rides. Search your route to find more."),
    ).toBeVisible();
  });

  it("offers a retry when the rides can't be loaded", async () => {
    let tries = 0;
    await renderApp("/rides", {
      setUp: (fake) => {
        fake.answer("/v1/trips/soonest", () => {
          tries += 1;
          return tries === 1 ? failure(500, "internal_error") : ok(200, { results: soonRides(2) });
        });
      },
    });
    expect(await screen.findByText("The trips could not be loaded.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByTestId("trip-result")).toHaveLength(2);
  });

  it("offers Offer a ride when there are none, keeping the offer through sign-in", async () => {
    await renderApp("/rides");
    expect(await screen.findByText("No rides are coming up yet.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Offer a ride" }));
    expect(await screen.findByText("What's your phone number?")).toBeVisible();
    expect(writeAppData).toHaveBeenLastCalledWith(
      "pending-offer",
      JSON.stringify({ keptAt: "2026-11-14T12:00:00.000Z" }),
    );
  });
});
