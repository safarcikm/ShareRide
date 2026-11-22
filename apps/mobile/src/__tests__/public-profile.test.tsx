import { act, fireEvent, screen } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import {
  annaProfile,
  annaProfileId,
  annaReviews,
  aProfileReview,
  newcomer,
  profileApi,
  reviewsAnswer,
} from "@/testing/people";
import { northResult, northTrip, tripDetailsApi } from "@/testing/search";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
// Saturday 14 November 2026, noon in Iceland.
jest.mock("@/lib/clock", () => ({ now: () => new Date("2026-11-14T12:00:00Z") }));

// Public profiles (spec 1, 3.5; spec 8, 3.7.5 and 3.8; screen 7). All made up.

const reviewCalls = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === "/v1/people/{profileId}/reviews")
    .map((call) => call.input["query"]);

/** Who wrote each review shown, and how they travelled, in order. */
const bylines = () =>
  screen.getAllByText(/, (driver|passenger) · /).map((line) => String(line.props.children));
const label = (element: { props: { accessibilityLabel?: unknown } }) =>
  String(element.props.accessibilityLabel);

/** Anna's profile, opened by a member signed in; `setUp` changes the answers. */
async function openProfile(
  setUp: (client: FakeClient) => void = (client) => {
    profileApi(client);
  },
) {
  const app = await renderApp(`/people/${annaProfileId}`, { me: completeMe, setUp });
  await screen.findByRole("header", { name: "Anna" });
  return app;
}

describe("a public profile (spec 1, 3.5)", () => {
  it("opens from the driver on trip details, for a member signed in", async () => {
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
        profileApi(client);
      },
    });
    await fireEvent.press(await screen.findByRole("link", { name: "See profile: Anna" }));
    expect(await screen.findByRole("header", { name: "Anna" })).toBeVisible();
    expect(screen).toHavePathname(`/people/${annaProfileId}`);
  });

  it("has no profile to open for a visitor not signed in", async () => {
    await renderApp(`/trips/${northResult.tripId}?from=1&to=2`, {
      setUp: (client) => {
        tripDetailsApi(client);
      },
    });
    expect(await screen.findByText("Anna")).toBeVisible();
    expect(screen.queryByRole("link", { name: /^See profile/ })).toBeNull();
  });

  it("shows the first name, about, languages, since when and the badges", async () => {
    await openProfile();
    expect(screen.getByText(annaProfile.about ?? "")).toBeVisible();
    expect(screen.getByText("Speaks Icelandic, English")).toBeVisible();
    expect(screen.getByText("Member since March 2026")).toBeVisible();
    expect(screen.getByText("Phone verified")).toBeVisible();
    expect(screen.queryByText("Email verified")).toBeNull();
  });

  it("shows the rating to one decimal, and no rating before the first", async () => {
    await openProfile();
    expect(screen.getByText("4.3 (3 ratings)")).toBeVisible();

    await openProfile((client) => {
      profileApi(client, [{ ...annaProfile, rating: { average: null, count: 0 } }], []);
    });
    expect(screen.getByText("No ratings yet")).toBeVisible();
    expect(await screen.findByText("No reviews yet.")).toBeVisible();
  });

  it("says when the person is not there any more, or the profile failed to load", async () => {
    await renderApp(`/people/${annaProfileId}`, {
      me: completeMe,
      setUp: (fake) => {
        profileApi(fake, []);
      },
    });
    expect(
      await screen.findByText("This profile isn't available. The person may have left PuffinRide."),
    ).toBeVisible();

    await renderApp(`/people/${annaProfileId}`, {
      me: completeMe,
      setUp: (fake) => {
        profileApi(fake);
        fake.answer("/v1/people/{profileId}", () => failure(500, "internal"));
      },
    });
    expect(await screen.findByText("The profile could not be loaded.")).toBeVisible();
  });

  it("is not there for an address that is no profile's, with nothing to try again", async () => {
    await renderApp("/people/not-a-profile", {
      me: completeMe,
      setUp: (client) => {
        profileApi(client);
      },
    });
    expect(
      await screen.findByText("This profile isn't available. The person may have left PuffinRide."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("loads again after a failure", async () => {
    let attempts = 0;
    await renderApp(`/people/${annaProfileId}`, {
      me: completeMe,
      setUp: (client) => {
        profileApi(client);
        client.answer("/v1/people/{profileId}", () => {
          attempts += 1;
          return attempts === 1 ? failure(500, "internal") : ok(200, annaProfile);
        });
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("header", { name: "Anna" })).toBeVisible();
  });
});

describe("the reliability figure (spec 8, 3.8)", () => {
  it("names the period as the operator has set it", async () => {
    await openProfile((client) => {
      profileApi(client);
      client.answer("/v1/config", () =>
        ok(200, {
          beta: false,
          paused: [],
          maxSeats: 8,
          freeCancellationMinutes: 15,
          maxMoveMinutes: 120,
          reliabilityMonths: 6,
          signInProviders: [],
        }),
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "Reliability: 91%" }));
    expect(
      await screen.findByText("Kept 11 of 12 trips and bookings in the last 6 months."),
    ).toBeVisible();
  });

  it("shows the share kept, and the counts by role once tapped", async () => {
    await openProfile();
    const figure = screen.getByRole("button", { name: "Reliability: 91%" });
    expect(figure).not.toBeExpanded();
    expect(screen.queryByText("As a driver: kept 10 of 10")).toBeNull();

    await fireEvent.press(figure);
    expect(
      screen.getByText("Kept 11 of 12 trips and bookings in the last 12 months."),
    ).toBeVisible();
    expect(screen.getByText("As a driver: kept 10 of 10")).toBeVisible();
    expect(screen.getByText("As a passenger: kept 1 of 2")).toBeVisible();
    expect(figure).toBeExpanded();
  });

  it("says there are not enough trips yet before 5 count, with the counts behind it", async () => {
    await openProfile((client) => {
      profileApi(client, [
        {
          ...annaProfile,
          reliability: {
            kept: 3,
            counted: 4,
            percent: null,
            byRole: { driver: { kept: 3, counted: 3 }, passenger: { kept: 0, counted: 1 } },
          },
        },
      ]);
    });
    await fireEvent.press(
      screen.getByRole("button", { name: "Reliability: not enough trips yet" }),
    );
    expect(screen.getByText("Kept 3 of 4 trips and bookings in the last 12 months.")).toBeVisible();
  });
});

describe("the reviews on a profile (spec 8, 3.7.5)", () => {
  it("lists them newest first, with who wrote each, how they travelled and when", async () => {
    await openProfile();
    expect(await screen.findByText("On time and careful.")).toBeVisible();
    expect(bylines()).toEqual([
      "Gunna, passenger · November 2026",
      "A former member, driver · October 2026",
      "Jón, passenger · October 2026",
    ]);
    expect(screen.getAllByRole("image", { name: /stars out of 5$/ }).map(label)).toEqual([
      "4 stars out of 5",
      "4 stars out of 5",
      "5 stars out of 5",
    ]);
  });

  it("shows only those given as a driver, or as a passenger", async () => {
    const { client } = await openProfile();
    await screen.findByText("On time and careful.");
    await fireEvent.press(screen.getByRole("radio", { name: "As a passenger" }));
    expect(await screen.findByText("Easy company.")).toBeVisible();
    expect(screen.queryByText("On time and careful.")).toBeNull();
    expect(reviewCalls(client).at(-1)).toEqual({ role: "passenger" });

    await fireEvent.press(screen.getByRole("radio", { name: "As a driver" }));
    expect(await screen.findByText("On time and careful.")).toBeVisible();
    expect(screen.queryByText("Easy company.")).toBeNull();
    expect(reviewCalls(client).at(-1)).toEqual({ role: "driver" });

    await fireEvent.press(screen.getByRole("radio", { name: "All" }));
    expect(await screen.findByText("Easy company.")).toBeVisible();
    expect(reviewCalls(client).at(-1)).toEqual({});
  });

  it("says when there are none for the role chosen", async () => {
    await openProfile((client) => {
      profileApi(client, [annaProfile], [aProfileReview(1, { comment: "Smooth ride." })]);
    });
    await screen.findByText("Smooth ride.");
    await fireEvent.press(screen.getByRole("radio", { name: "As a passenger" }));
    expect(await screen.findByText("No reviews as a passenger yet.")).toBeVisible();
    expect(screen.queryByText("Smooth ride.")).toBeNull();
  });

  it("drops a page asked for before the filter changed", async () => {
    let release: () => void = () => undefined;
    await openProfile((client) => {
      profileApi(client, [annaProfile], annaReviews, 2);
      const page = reviewsAnswer(annaReviews, 2);
      client.answer("/v1/people/{profileId}/reviews", (input) => {
        const { before } = input["query"] as { before?: string };
        if (before === undefined) return page(input);
        return new Promise((resolve) => {
          release = () => {
            resolve(page(input));
          };
        });
      });
    });
    await screen.findByText("Easy company.");
    await fireEvent.press(screen.getByRole("button", { name: "Show more reviews" }));
    await fireEvent.press(screen.getByRole("radio", { name: "As a passenger" }));
    expect(await screen.findByText("A former member, driver · October 2026")).toBeVisible();
    await act(() => {
      release();
    });
    expect(bylines()).toEqual(["A former member, driver · October 2026"]);
    expect(screen.queryByRole("button", { name: "Show more reviews" })).toBeNull();
  });

  it("says when the person left after the profile loaded", async () => {
    await openProfile((client) => {
      profileApi(client);
      client.answer("/v1/people/{profileId}/reviews", () => failure(404, "not_found"));
    });
    expect(
      await screen.findByText("This profile isn't available. The person may have left PuffinRide."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows more on asking, from where the last ones ended", async () => {
    const { client } = await openProfile((fake) => {
      profileApi(fake, [annaProfile], annaReviews, 2);
    });
    await screen.findByText("Easy company.");
    expect(screen.queryByText("Jón, passenger · October 2026")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show more reviews" }));
    expect(await screen.findByText("Jón, passenger · October 2026")).toBeVisible();
    expect(screen.getByText("On time and careful.")).toBeVisible();
    expect(reviewCalls(client).at(-1)).toEqual({ before: annaReviews[1]?.id });
    expect(screen.queryByRole("button", { name: "Show more reviews" })).toBeNull();
  });

  it("says when the reviews could not be loaded, and tries again", async () => {
    let attempts = 0;
    await openProfile((client) => {
      profileApi(client);
      client.answer("/v1/people/{profileId}/reviews", () => {
        attempts += 1;
        return attempts === 1
          ? failure(500, "internal")
          : ok(200, { reviews: [aProfileReview(9, { comment: "Lovely." })], more: false });
      });
    });
    expect(await screen.findByText("The reviews could not be loaded.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Lovely.")).toBeVisible();
  });
});

describe("See it as others do (spec 16, 3.4)", () => {
  it("shows my own profile as the API gives it to others", async () => {
    const mine = { ...annaProfile, profileId: completeMe.profileId };
    await renderApp("/profile/preview", {
      me: completeMe,
      setUp: (client) => {
        profileApi(client, [mine]);
      },
    });
    expect(await screen.findByRole("header", { name: "As others see you" })).toBeVisible();
    expect(await screen.findByText("4.3 (3 ratings)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Reliability: 91%" })).toBeVisible();
    expect(await screen.findByText("On time and careful.")).toBeVisible();
    expect(screen.queryByText("+354 690 0000")).toBeNull();
  });
});
