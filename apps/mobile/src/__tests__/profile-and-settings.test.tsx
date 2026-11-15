import { fireEvent, screen, within } from "expo-router/testing-library";
import type { DriverReadiness, Me } from "@shareride/contracts";
import { failure, ok, tokens, type FakeClient } from "@/testing/fake-client";
import { completeMe, legalDocument, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { meetingPoints } from "@/testing/meeting-points";
import { readyDriver, yaris } from "@/testing/trips";
import { colors } from "@/theme/tokens";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

/** A driver who has added a car but not confirmed the licence yet. */
const licenceToConfirm: DriverReadiness = {
  ...readyDriver,
  ready: false,
  items: readyDriver.items.map((item) =>
    item.item === "licence" ? { ...item, done: false } : item,
  ),
  licenceDeclaredAt: null,
};

/** The driver's readiness and cars, for the Profile rows and My cars. */
function drivingApi(client: FakeClient, readiness: DriverReadiness = readyDriver) {
  client.answer("/v1/me/driver-readiness", () => ok(200, readiness));
  client.answer("/v1/me/vehicles", () => ok(200, { vehicles: [yaris] }));
  client.answer("/v1/meeting-points", () => ok(200, { meetingPoints }));
}

async function openProfile(readiness: DriverReadiness = readyDriver) {
  const app = await renderApp("/profile", {
    me: completeMe,
    setUp: (client) => {
      drivingApi(client, readiness);
    },
  });
  app.client.answer("/v1/me", (input) => {
    const body = input["body"] as Partial<Me> | undefined;
    return ok(200, { ...completeMe, ...body });
  });
  app.client.answer("/v1/auth/sign-out", () => ok(204));
  expect(await screen.findByRole("header", { name: "My profile" })).toBeVisible();
  return app;
}

describe("My profile (spec 16, 3.4)", () => {
  it("shows the first name, the languages and when they joined, then the rows", async () => {
    await openProfile();
    expect(screen.getByText("Anna")).toBeVisible();
    expect(
      screen.getByText("Speaks Icelandic, English · Member since November 2026"),
    ).toBeVisible();
    const edit = screen.getByRole("button", { name: "Edit profile" });
    expect(within(edit).getByTestId("button-face")).toHaveStyle({
      borderColor: colors.light.control,
    });
    expect(screen.getByRole("link", { name: "See it as others do" })).toBeVisible();
    // The phone number is private, so it is in Settings.
    expect(screen.queryByText("+354 690 0000")).toBeNull();
    expect(await screen.findByRole("button", { name: "Driving licence, Confirmed" })).toBeVisible();
    for (const row of ["My cars", "Meeting points", "Settings", "Terms, rules and privacy"]) {
      expect(screen.getByRole("button", { name: row })).toBeVisible();
    }
    expect(
      screen.getByText("Phone number, language and signing out are in Settings."),
    ).toBeVisible();
  });

  it("says the licence is not confirmed yet, and opens the licence screen", async () => {
    await openProfile(licenceToConfirm);
    await fireEvent.press(
      await screen.findByRole("button", { name: "Driving licence, Not confirmed yet" }),
    );
    expect(await screen.findByRole("header", { name: "Your driving licence" })).toBeVisible();
    expect(screen).toHavePathname("/drive/licence");
  });

  it("opens My cars, with each car and Add a car", async () => {
    await openProfile();
    await fireEvent.press(screen.getByRole("button", { name: "My cars" }));
    expect(await screen.findByRole("header", { name: "My cars" })).toBeVisible();
    expect(screen).toHavePathname("/drive/cars");
    await fireEvent.press(
      await screen.findByRole("button", { name: "Toyota Yaris, white, No number plate yet" }),
    );
    expect(screen).toHavePathname(`/drive/cars/${yaris.id}`);
    await fireEvent.press(await screen.findByRole("button", { name: "Back" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Add a car" }));
    expect(screen).toHavePathname("/drive/cars/new");
  });

  it("opens the meeting points", async () => {
    await openProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Meeting points" }));
    expect(await screen.findByRole("header", { name: "Meeting points" })).toBeVisible();
    expect(screen).toHavePathname("/meeting-points");
  });

  it("opens the terms, the rules and the privacy policy from one row", async () => {
    await openProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Terms, rules and privacy" }));
    expect(await screen.findByRole("header", { name: "Terms, rules and privacy" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Terms of Service" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Community Rules" })).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Privacy Policy" }));
    expect(screen).toHavePathname("/legal/privacy");
  });

  it("shows the profile as others see it, without the phone number", async () => {
    await openProfile();
    await fireEvent.press(screen.getByRole("link", { name: "See it as others do" }));
    expect(await screen.findByRole("header", { name: "As others see you" })).toBeVisible();
    expect(screen).toHavePathname("/profile/preview");
    expect(screen.getByText("Anna")).toBeVisible();
    expect(screen.getByText("Speaks Icelandic, English")).toBeVisible();
    expect(screen.getByText("Member since November 2026")).toBeVisible();
    expect(screen.getByText(completeMe.about ?? "")).toBeVisible();
    expect(screen.queryByText("+354 690 0000")).toBeNull();
  });

  it("edits the profile", async () => {
    const app = await openProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Edit profile" }));
    const about = await screen.findByLabelText("About you");
    expect(about).toHaveDisplayValue(completeMe.about ?? "");
    await fireEvent.changeText(about, "Usually with a dog.");
    await fireEvent.press(screen.getByRole("checkbox", { name: "English" }));
    await fireEvent.press(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Speaks Icelandic · Member since November 2026")).toBeVisible();
    expect(screen).toHavePathname("/profile");
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
        drivingApi(client);
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

  it("asks a signed-out person to sign in", async () => {
    await renderApp("/profile");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeVisible();
  });
});

describe("Settings", () => {
  async function openSettings() {
    const app = await openProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("header", { name: "Settings" })).toBeVisible();
    return app;
  }

  it("shows the phone number, marked as private", async () => {
    await openSettings();
    expect(screen.getByText("+354 690 0000")).toBeVisible();
    expect(screen.getByText("Only you can see your phone number.")).toBeVisible();
  });

  it("signs out on all devices and returns to Find", async () => {
    const app = await openSettings();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out on all devices" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    // The front page then loads its rides; the sign-out came before.
    expect(app.client.calls.findLast((call) => call.path === "/v1/auth/sign-out")).toEqual({
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
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(app.client.calls.findLast((call) => call.path === "/v1/auth/sign-out")?.input).toEqual({
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
    // A legal document starts each line at the left, for reading.
    expect(screen.getByText("Your phone number.")).not.toHaveStyle({ textAlign: "center" });
    expect(screen.getByText("phone number")).toHaveStyle({ fontFamily: "Nunito_700Bold" });
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
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
  });
});
