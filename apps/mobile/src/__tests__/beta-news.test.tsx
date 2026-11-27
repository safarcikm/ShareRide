import { fireEvent, screen } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { failure, ok, type FakeClient } from "@/testing/fake-client";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));

// Beta news (spec 10, 3.5; milestone 11, PR 10): the announcements sent
// to me, under Notifications on Profile.

const sent = [
  {
    id: "0190a1d6-0000-7000-8000-0000000000a2",
    titleIs: "Nýir fundarstaðir",
    titleEn: "New meeting points",
    messageIs: "Fundarstaðir á Suðurlandi bættust við.",
    messageEn: "Meeting points in the south were added.",
    sentAt: "2026-11-18T10:00:00.000Z",
  },
  {
    id: "0190a1d6-0000-7000-8000-0000000000a1",
    titleIs: "Ný útgáfa",
    titleEn: "A new version",
    messageIs: "Við bættum kortið.",
    messageEn: "We improved the map.",
    sentAt: "2026-11-16T10:00:00.000Z",
  },
];

describe("Beta news", () => {
  it("lists the announcements sent to me, the latest first, in the app's language", async () => {
    await renderApp("/settings/beta-news", {
      me: completeMe,
      setUp: (client: FakeClient) => {
        client.answer("/v1/me/announcements", () => ok(200, { announcements: sent }));
      },
    });
    expect(await screen.findByRole("header", { name: "Beta news" })).toBeVisible();
    const titles = (await screen.findAllByRole("header"))
      .map((heading) => String(heading.props.children))
      .filter((title) => title !== "Beta news");
    expect(titles).toEqual(["New meeting points", "A new version"]);
    expect(screen.getByText("Meeting points in the south were added.")).toBeVisible();
    expect(screen.getByText("18 November 2026")).toBeVisible();
    expect(screen.getByText("We improved the map.")).toBeVisible();
    expect(screen.queryByText("Við bættum kortið.")).toBeNull();
  });

  it("says when there is no news yet", async () => {
    await renderApp("/settings/beta-news", { me: completeMe });
    expect(await screen.findByText("No news yet.")).toBeVisible();
  });

  it("goes back to Notifications, where its switch is, when opened by itself as from a notification", async () => {
    await renderApp("/settings/beta-news", { me: completeMe });
    expect(await screen.findByText("No news yet.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("header", { name: "Notifications" })).toBeVisible();
    expect(screen).toHavePathname("/settings/notifications");
  });

  it("offers to try again when the news cannot be loaded", async () => {
    let tries = 0;
    const app = await renderApp("/settings/beta-news", {
      me: completeMe,
      setUp: (client: FakeClient) => {
        client.answer("/v1/me/announcements", () => {
          tries += 1;
          return tries === 1 ? failure(500, "internal_error") : ok(200, { announcements: sent });
        });
      },
    });
    expect(await screen.findByText("We couldn't load the news.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("A new version")).toBeVisible();
    expect(app.client.calls.filter((call) => call.path === "/v1/me/announcements")).toHaveLength(2);
  });
});
