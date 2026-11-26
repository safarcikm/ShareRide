import { fireEvent, screen } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { ok } from "@/testing/fake-client";
import { bookingApi, driverApi, northBooking, northMyTrip, northStop } from "@/testing/bookings";
import { unfoldPassenger } from "@/testing/driver-trip";
import { aProfileId, annaProfile, annaProfileId, newcomer, profileApi } from "@/testing/people";
import { northResult, northTrip, resultOn, searchApi, tripDetailsApi } from "@/testing/search";
import { blonduos, borgarnes, tripsApi } from "@/testing/trips";

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

// A person's rating and reliability beside their name (spec 4, 3.4 and 3.6;
// spec 5, 3.3.2), each opening their profile for members. All made up.

const rated = { rating: { average: 4.3, count: 3 }, reliabilityPercent: 91 };

describe("beside the driver of a trip (spec 4, 3.4 and 3.6)", () => {
  it("shows a rated driver's rating in the results, and New driver before the first", async () => {
    await renderApp(
      `/search/results?from=${borgarnes.id}&to=${blonduos.id}&fromName=Borgarnes&toName=Bl%C3%B6ndu%C3%B3s&seats=1`,
      {
        setUp: (client) => {
          searchApi(client, {
            results: () => [
              { ...northResult, driver: { ...northResult.driver, rating: rated.rating } },
              resultOn("2026-11-15", {
                tripId: "0190a1d6-0000-7000-8000-0000000000f2",
                driver: { firstName: "Bára", rating: newcomer.rating, photo: null, colour: 2 },
              }),
            ],
          });
        },
      },
    );
    expect(await screen.findByText("4.3 (3 ratings)")).toBeVisible();
    expect(screen.getByRole("button", { name: /, Anna, 4\.3 \(3 ratings\), / })).toBeVisible();
    expect(screen.getByRole("button", { name: /, Bára, New driver, / })).toBeVisible();
  });

  const base = northTrip({ board: 1, alight: 2 });
  const tripUrl = `/trips/${northResult.tripId}?from=1&to=2`;

  it("shows a visitor the driver's rating on trip details, without the figure or profile", async () => {
    // As the API answers a visitor: the rating, and nothing more.
    const forVisitors = {
      ...base,
      driver: { ...base.driver, ...rated, reliabilityPercent: null, profileId: null },
    };
    await renderApp(tripUrl, {
      setUp: (client) => {
        tripDetailsApi(client, () => ok(200, forVisitors));
      },
    });
    expect(await screen.findByText("4.3 (3 ratings)")).toBeVisible();
    expect(screen.queryByText("New driver")).toBeNull();
    expect(screen.queryByText(/^Reliability/)).toBeNull();
    expect(screen.queryByRole("link", { name: /^See profile/ })).toBeNull();
  });

  it("shows a member the driver's rating, figure and profile on trip details", async () => {
    const forMembers = {
      ...base,
      driver: { ...base.driver, ...rated, profileId: annaProfileId },
    };
    await renderApp(tripUrl, {
      me: completeMe,
      setUp: (client) => {
        tripDetailsApi(client, () => ok(200, forMembers));
      },
    });
    expect(await screen.findByText("4.3 (3 ratings)")).toBeVisible();
    expect(screen.getByText("Reliability: 91%")).toBeVisible();
    // The driver's line is the link, and its name says all the line holds.
    expect(
      screen.getByRole("link", {
        name: "See profile: Anna, 4.3 (3 ratings), Reliability: 91%",
      }),
    ).toBeVisible();
  });

  it("says a driver is new, with not enough trips yet for members", async () => {
    await renderApp(`/trips/${northResult.tripId}?from=1&to=2`, {
      me: completeMe,
      setUp: (client) => {
        tripDetailsApi(client, () =>
          ok(
            200,
            northTrip(
              { board: 1, alight: 2 },
              {
                driver: {
                  firstName: "Anna",
                  colour: 1,
                  profileId: annaProfileId,
                  photo: null,
                  ...newcomer,
                },
              },
            ),
          ),
        );
      },
    });
    expect(await screen.findByText("New driver")).toBeVisible();
    expect(screen.getByText("Reliability: not enough rides yet")).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "See profile: Anna, New driver, Reliability: not enough rides yet",
      }),
    ).toBeVisible();
  });
});

describe("on a booking (spec 5)", () => {
  it("shows the driver's standing, and opens their profile", async () => {
    await renderApp(`/bookings/${northBooking().id}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () => northBooking({ driver: { ...northBooking().driver, ...rated } }));
        profileApi(client);
      },
    });
    expect(await screen.findByText("4.3 (3 ratings)")).toBeVisible();
    expect(screen.getByText("Reliability: 91%")).toBeVisible();
    // The whole line about her is the link, and says all of it (spec 31, 3.7).
    await fireEvent.press(
      screen.getByRole("link", {
        name: "See profile: Anna, 4.3 (3 ratings), Reliability: 91%",
      }),
    );
    expect(await screen.findByRole("header", { name: "Anna" })).toBeVisible();
    expect(screen).toHavePathname(`/people/${annaProfileId}`);
  });

  it("shows nothing of the kind for a former member", async () => {
    await renderApp(`/bookings/${northBooking().id}`, {
      me: completeMe,
      setUp: (client) => {
        bookingApi(client, () =>
          northBooking({
            driver: { firstName: null, colour: 0, profileId: null, photo: null, ...newcomer },
          }),
        );
      },
    });
    expect(await screen.findByText("A former member")).toBeVisible();
    expect(screen.queryByText("New driver")).toBeNull();
    expect(screen.queryByText(/^Reliability/)).toBeNull();
    expect(screen.queryByRole("link", { name: /^See profile/ })).toBeNull();
  });
});

describe("a passenger, for the driver (spec 5, 3.3 and 3.7)", () => {
  const gunna = (changes = {}) =>
    northBooking({
      viewer: "driver",
      passenger: {
        firstName: "Gunna",
        colour: 2,
        memberSince: "2026-11",
        profileId: aProfileId(2),
        photo: null,
        ...rated,
        ...changes,
      },
    });

  const openTrip = (bookings: Parameters<typeof driverApi>[1]) =>
    renderApp(`/drive/trips/${northMyTrip.id}`, {
      me: completeMe,
      setUp: (client) => {
        tripsApi(client, [northMyTrip]);
        driverApi(client, bookings);
        profileApi(client, [{ ...annaProfile, profileId: aProfileId(2), firstName: "Gunna" }]);
      },
    });

  it("shows how the person asking stands, and opens their profile", async () => {
    await openTrip([gunna()]);
    expect(await screen.findByText("4.3 (3 ratings)")).toBeVisible();
    expect(screen.getByText("Reliability: 91%")).toBeVisible();
    // The person on the card is the way to their profile, and says how they stand.
    await fireEvent.press(
      screen.getByRole("link", { name: "See profile: Gunna, 4.3 (3 ratings), Reliability: 91%" }),
    );
    expect(await screen.findByRole("header", { name: "Gunna" })).toBeVisible();
  });

  it("says when the person asking has no reviews yet", async () => {
    await openTrip([gunna(newcomer)]);
    expect(await screen.findByText("No reviews yet")).toBeVisible();
    expect(screen.getByText("Reliability: not enough rides yet")).toBeVisible();
    // How long they have been here stands in for the reviews.
    expect(screen.getByText("Member since November 2026")).toBeVisible();
  });

  it("shows nothing of the kind for someone asking who is leaving PuffinRide", async () => {
    // As the API answers for someone leaving: no profile, and a newcomer's standing.
    await openTrip([gunna({ ...newcomer, profileId: null })]);
    expect((await screen.findAllByText(/Gunna/)).length).toBeGreaterThan(0);
    expect(screen.queryByText("No reviews yet")).toBeNull();
    expect(screen.queryByText(/^Reliability/)).toBeNull();
    expect(screen.queryByRole("link", { name: /^See profile/ })).toBeNull();
  });

  it("links each passenger to their profile", async () => {
    await openTrip([
      northBooking({
        id: "0190a1d6-0000-7000-8000-0000000000c1",
        viewer: "driver",
        status: "confirmed",
        board: northStop(0),
        alight: northStop(2),
        requestExpiresAt: null,
        passenger: {
          firstName: "Jón",
          colour: 3,
          memberSince: "2026-10",
          profileId: aProfileId(18),
          photo: null,
          ...rated,
        },
        confirmed: { registration: "AB 123", whereToStand: null },
      }),
    ]);
    // Under their row, once it is unfolded (spec 31, 3.12, item 4).
    await unfoldPassenger("Jón");
    expect(screen.getByRole("link", { name: "See profile: Jón" })).toBeVisible();
  });
});
