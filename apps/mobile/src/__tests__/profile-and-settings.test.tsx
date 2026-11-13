import { fireEvent, screen } from "expo-router/testing-library";
import type { Me } from "@shareride/contracts";
import { failure, ok, tokens } from "@/testing/fake-client";
import { completeMe, legalDocument, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

async function openProfile() {
  const app = await renderApp("/", { me: completeMe });
  app.client.answer("/v1/me", (input) => {
    const body = input["body"] as Partial<Me> | undefined;
    return ok(200, { ...completeMe, ...body });
  });
  app.client.answer("/v1/auth/sign-out", () => ok(204));
  expect(await screen.findByRole("header", { name: "My profile" })).toBeVisible();
  return app;
}

describe("My profile", () => {
  it("shows the profile, with the phone number marked as private", async () => {
    await openProfile();
    expect(screen.getByText("Anna")).toBeVisible();
    expect(screen.getByText(completeMe.about ?? "")).toBeVisible();
    expect(screen.getByText("Icelandic, English")).toBeVisible();
    expect(screen.getByText("+354 690 0000")).toBeVisible();
    expect(screen.getByText("Only you can see your phone number.")).toBeVisible();
  });

  it("edits the profile", async () => {
    const app = await openProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Edit profile" }));
    const about = await screen.findByLabelText("About you");
    expect(about).toHaveDisplayValue(completeMe.about ?? "");
    await fireEvent.changeText(about, "Usually with a dog.");
    await fireEvent.press(screen.getByRole("checkbox", { name: "English" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Usually with a dog.")).toBeVisible();
    expect(screen).toHavePathname("/profile");
    expect(screen.getByText("Icelandic")).toBeVisible();
    expect(app.client.calls.find((c) => c.path === "/v1/me" && "body" in c.input)?.input).toEqual({
      body: { firstName: "Anna", about: "Usually with a dog.", languages: ["is"] },
      accessToken: "sr_at_access-1",
    });
  });

  it("keeps a language this version does not know off the form", async () => {
    const me = { ...completeMe, languages: ["is", "xx"] };
    const app = await renderApp("/profile/edit", {
      me,
      setUp: (client) => {
        client.answer("/v1/me", (input) => {
          const body = input["body"] as Partial<Me> | undefined;
          return ok(200, { ...me, ...body });
        });
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("header", { name: "My profile" })).toBeVisible();
    expect(
      app.client.calls.find((c) => c.path === "/v1/me" && "body" in c.input)?.input,
    ).toMatchObject({ body: { languages: ["is"] } });
  });

  it("sends a signed-out person to the welcome screen", async () => {
    await renderApp("/profile");
    expect(await screen.findByRole("button", { name: "Continue with phone" })).toBeVisible();
  });
});

describe("Settings", () => {
  async function openSettings() {
    const app = await openProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("header", { name: "Settings" })).toBeVisible();
    return app;
  }

  it("signs out on all devices and returns to the welcome screen", async () => {
    const app = await openSettings();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out on all devices" }));
    expect(await screen.findByRole("button", { name: "Continue with phone" })).toBeVisible();
    expect(app.client.calls.at(-1)).toEqual({
      path: "/v1/auth/sign-out",
      input: { body: { all: true }, accessToken: "sr_at_access-1" },
    });
    expect(app.store.value).toBeNull();
  });

  it("stays signed in and says so when signing out everywhere fails", async () => {
    const app = await openSettings();
    app.client.answer("/v1/auth/sign-out", () => failure(0, "network_error"));
    await fireEvent.press(screen.getByRole("button", { name: "Sign out on all devices" }));
    expect(
      await screen.findByText("We couldn't reach ShareRide. Check your connection and try again."),
    ).toBeVisible();
    expect(screen.getByRole("header", { name: "Settings" })).toBeVisible();
    expect(app.store.value).toBe("sr_rt_refresh-1");
  });

  it("signs out of this device only", async () => {
    const app = await openSettings();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("button", { name: "Continue with phone" })).toBeVisible();
    expect(app.client.calls.at(-1)?.input).toEqual({
      body: { all: false },
      accessToken: "sr_at_access-1",
    });
  });

  it("changes the language of the app and of the account", async () => {
    const app = await openSettings();
    await fireEvent.press(screen.getByRole("button", { name: "Change the language to Icelandic" }));
    expect(await screen.findByRole("header", { name: "Stillingar" })).toBeVisible();
    expect(app.client.calls.at(-1)?.input).toEqual({
      body: { locale: "is" },
      accessToken: "sr_at_access-1",
    });
  });

  it("links to the Privacy Policy", async () => {
    const app = await openSettings();
    app.client.answer("/v1/legal/{type}/current", () =>
      ok(200, legalDocument("privacy", 1, "## What we collect\n\nYour **phone number**.")),
    );
    await fireEvent.press(screen.getByRole("link", { name: "Read the Privacy Policy" }));
    expect(await screen.findByRole("header", { name: "Privacy Policy" })).toBeVisible();
    expect(screen.getByRole("header", { name: "What we collect" })).toBeVisible();
    expect(screen.getByText("Your phone number.")).toBeVisible();
    expect(screen.getByText("phone number")).toHaveStyle({ fontWeight: "700" });
  });
});

describe("Starting the app", () => {
  it("says when ShareRide cannot be reached and tries again", async () => {
    const app = await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/auth/refresh", () => failure(0, "network_error"));
      },
    });
    expect(
      await screen.findByText("We couldn't reach ShareRide. Check your connection and try again."),
    ).toBeVisible();
    expect(app.store.value).toBe("sr_rt_stored");

    app.client.answer("/v1/auth/refresh", () => ok(200, tokens(2)));
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("header", { name: "My profile" })).toBeVisible();
  });
});
