import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import type { DriverReadiness, Me } from "@shareride/contracts";
import { Dimensions } from "react-native";
import { failure, ok, tokens, type FakeClient } from "@/testing/fake-client";
import { completeMe, legalDocument, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { meetingPoints } from "@/testing/meeting-points";
import { annaProfile, profileApi } from "@/testing/people";
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
      screen.getByText("Phone number, language and signing out on all devices are in Settings."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  it("signs out of this device from Profile and returns to Find", async () => {
    const app = await openProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(app.client.calls.findLast((call) => call.path === "/v1/auth/sign-out")?.input).toEqual({
      body: { all: false },
      accessToken: "sr_at_access-1",
    });
    expect(app.store.value).toBeNull();
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
    const app = await openProfile();
    profileApi(app.client, [
      { ...annaProfile, profileId: completeMe.profileId, memberSince: "2026-11" },
    ]);
    await fireEvent.press(screen.getByRole("link", { name: "See it as others do" }));
    expect(await screen.findByRole("header", { name: "As others see you" })).toBeVisible();
    expect(screen).toHavePathname("/profile/preview");
    expect(await screen.findByRole("header", { name: "Anna" })).toBeVisible();
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

  it("ticks no language for someone who chose none, and shows the rest after the common ones", async () => {
    await renderApp("/profile/edit", {
      me: { ...completeMe, languages: [] },
      setUp: drivingApi,
    });
    expect(await screen.findByRole("checkbox", { name: "English" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Icelandic" })).not.toBeChecked();
    // The field is open on Edit profile.
    expect(screen.getByLabelText("About you")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "More languages" }));
    const names = screen
      .getAllByRole("checkbox")
      .map((chip) => chip.props.accessibilityLabel as string)
      .slice(0, 6);
    // The common ones keep their place; the rest come after them.
    expect(names).toEqual(["Icelandic", "English", "Polish", "German", "Spanish", "Lithuanian"]);
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

  it("keeps My cars and the preview to accounts that are set up", async () => {
    await renderApp("/profile/preview");
    expect(await screen.findByRole("header", { name: "Share your ride" })).toBeVisible();
    expect(screen).toHavePathname("/");
  });

  it("sends an account with sign-up steps left from My cars to its next step", async () => {
    await renderApp("/drive/cars", { me: { ...completeMe, missingSteps: ["legal"] } });
    expect(await screen.findByRole("header", { name: "Our terms have changed" })).toBeVisible();
    expect(screen).toHavePathname("/onboarding/terms");
  });

  it("asks a signed-out person to sign in", async () => {
    await renderApp("/profile");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeVisible();
  });
});

describe("My profile on a laptop (spec 18, 3.12)", () => {
  const phone = { width: 750, height: 1334, scale: 2, fontScale: 2 };
  const laptop = { width: 1280, height: 800, scale: 1, fontScale: 1 };

  beforeEach(() => {
    Dimensions.set({ window: laptop });
  });

  afterEach(async () => {
    // The screen is still on show here, so its update goes through act.
    await act(() => {
      Dimensions.set({ window: phone });
    });
  });

  it("has who I am at the left, in a card, and the rows beside it", async () => {
    await openProfile();
    expect(screen.getByTestId("page")).toBeVisible();
    expect(screen.getByRole("header", { name: "My profile" })).not.toHaveStyle({
      textAlign: "center",
    });
    // The side column is drawn at the left; a reader still gets the rows first.
    expect(screen.getByTestId("columns")).toHaveStyle({ flexDirection: "row-reverse" });

    const side = within(screen.getByTestId("columns-side"));
    expect(side.getByTestId("card")).toBeVisible();
    expect(side.getByText("Anna")).toBeVisible();
    expect(side.getByText("Speaks Icelandic, English · Member since November 2026")).toBeVisible();
    expect(side.getByRole("button", { name: "Edit profile" })).toBeVisible();
    expect(side.getByRole("link", { name: "See it as others do" })).toBeVisible();

    const main = within(screen.getByTestId("columns-main"));
    expect(await main.findByRole("button", { name: "Driving licence, Confirmed" })).toBeVisible();
    for (const row of [
      "My cars",
      "Meeting points",
      "Settings",
      "Terms, rules and privacy",
      "Send feedback",
      "Notices",
    ]) {
      expect(main.getByRole("button", { name: row })).toBeVisible();
    }
    expect(main.getAllByTestId("card")).toHaveLength(2);
    expect(
      main.getByText("Phone number, language and signing out on all devices are in Settings."),
    ).toBeVisible();
    expect(main.getByRole("button", { name: "Sign out" })).toBeVisible();
    // Each once.
    expect(screen.getAllByRole("button", { name: "Edit profile" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "My cars" })).toHaveLength(1);
  });

  it("opens Edit profile from the card", async () => {
    await openProfile();
    await fireEvent.press(
      within(screen.getByTestId("columns-side")).getByRole("button", { name: "Edit profile" }),
    );
    expect(screen).toHavePathname("/profile/edit");
  });

  it("opens a row from the main column", async () => {
    await openProfile();
    await fireEvent.press(
      within(screen.getByTestId("columns-main")).getByRole("button", { name: "Settings" }),
    );
    expect(screen).toHavePathname("/settings");
  });

  it("is the phone's one column when the window turns narrow, and loads nothing again", async () => {
    const { client } = await openProfile();
    const asked = () =>
      client.calls.filter((call) => call.path === "/v1/me/driver-readiness").length;
    expect(await screen.findByRole("button", { name: "Driving licence, Confirmed" })).toBeVisible();
    expect(asked()).toBe(1);

    await act(() => {
      Dimensions.set({ window: phone });
    });
    expect(screen.queryByTestId("page")).toBeNull();
    expect(screen.queryByTestId("columns")).toBeNull();
    expect(screen.getByText("Anna")).toBeVisible();
    expect(screen.getByRole("header", { name: "My profile" })).toHaveStyle({
      textAlign: "center",
    });
    expect(screen.getByRole("button", { name: "Driving licence, Confirmed" })).toBeVisible();

    await act(() => {
      Dimensions.set({ window: laptop });
    });
    expect(
      within(screen.getByTestId("columns-main")).getByRole("button", {
        name: "Driving licence, Confirmed",
      }),
    ).toBeVisible();
    expect(asked()).toBe(1);
  });

  it("stays one centred column signed out", async () => {
    await renderApp("/profile");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeVisible();
    expect(screen.queryByTestId("page")).toBeNull();
    expect(screen.queryByTestId("columns")).toBeNull();
    expect(screen.getByRole("header", { name: "Profile" })).toHaveStyle({ textAlign: "center" });
  });
});

describe("Settings", () => {
  const reminderSwitch = "Trip reminders. The evening before and an hour before each trip.";

  async function openSettings() {
    const app = await openProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("header", { name: "Settings" })).toBeVisible();
    return app;
  }

  it("groups the rows: Language, Your account, Notifications, Safety, Feedback, Legal documents, then signing out (spec 16, 3.8)", async () => {
    await openSettings();
    const headings = screen.getAllByRole("header").map((heading) => String(heading.props.children));
    expect(headings).toEqual([
      "Settings",
      "Language",
      "Your account",
      "Notifications",
      "Safety",
      "Feedback",
      "Legal documents",
    ]);
    // The language is two choices side by side, the current one ticked.
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Íslenska" })).not.toBeChecked();
    // Each name is read in its own language.
    expect(screen.getByRole("radio", { name: "Íslenska" })).toHaveProp(
      "accessibilityLanguage",
      "is",
    );
    expect(screen.getByRole("radio", { name: "English" })).toHaveProp(
      "accessibilityLanguage",
      "en",
    );
    // Rows and their headings start at the left.
    expect(screen.getByRole("header", { name: "Language" })).not.toHaveStyle({
      textAlign: "center",
    });
    expect(screen.getByRole("header", { name: "Legal documents" })).not.toHaveStyle({
      textAlign: "center",
    });
  });

  it("shows the phone number, marked as private", async () => {
    await openSettings();
    expect(screen.getByText("+354 690 0000")).toBeVisible();
    expect(screen.getByText("Only you can see your phone number.")).toBeVisible();
  });

  it("has trip reminders on, says what stays on, and turns them off (spec 7, 3.6)", async () => {
    const app = await openSettings();
    expect(screen.getByRole("header", { name: "Notifications" })).toBeVisible();
    const reminders = await screen.findByRole("switch", { name: reminderSwitch });
    await waitFor(() => {
      expect(reminders).toBeChecked();
    });
    expect(
      screen.getByText(
        "Notifications about bookings, trips, payments and messages are always on, because others rely on them.",
      ),
    ).toBeVisible();
    await fireEvent.press(reminders);
    expect(screen.getByRole("switch", { name: reminderSwitch })).not.toBeChecked();
    const changes = app.client.calls.filter(
      (call) => call.path === "/v1/me/notification-settings" && call.input["body"] !== undefined,
    );
    expect(changes.map((call) => call.input["body"])).toEqual([{ reminders: false }]);
  });

  it("has beta news on, turns it off on its own, and opens the news (spec 10, 3.5.4)", async () => {
    const app = await openSettings();
    const news = await screen.findByRole("switch", {
      name: "Beta news. News from PuffinRide about the beta, by notification and email.",
    });
    await waitFor(() => {
      expect(news).toBeChecked();
    });
    await fireEvent.press(news);
    expect(news).not.toBeChecked();
    // Only this switch is sent, and the other stays on.
    const changes = app.client.calls.filter(
      (call) => call.path === "/v1/me/notification-settings" && call.input["body"] !== undefined,
    );
    expect(changes.map((call) => call.input["body"])).toEqual([{ betaNews: false }]);
    expect(screen.getByRole("switch", { name: reminderSwitch })).toBeChecked();

    await fireEvent.press(screen.getByRole("button", { name: "Beta news" }));
    expect(await screen.findByRole("header", { name: "Beta news" })).toBeVisible();
    expect(await screen.findByText("No news yet.")).toBeVisible();
  });

  it("turns the switch back and says so when the change fails", async () => {
    await renderApp("/settings", {
      me: completeMe,
      setUp: (client) => {
        client.answer(
          "/v1/me/notification-settings",
          () => ok(200, { reminders: true, betaNews: true }),
          "get",
        );
        client.answer("/v1/me/notification-settings", () => failure(0, "network_error"), "patch");
      },
    });
    const reminders = await screen.findByRole("switch", { name: reminderSwitch });
    await waitFor(() => {
      expect(reminders).toBeChecked();
    });
    await fireEvent.press(reminders);
    expect(
      await screen.findByText("We couldn't reach PuffinRide. Check your connection and try again."),
    ).toBeVisible();
    expect(screen.getByRole("switch", { name: reminderSwitch })).toBeChecked();
  });

  it("saves quick changes one after the other, and ends on the last", async () => {
    const changes: unknown[] = [];
    let answerFirst: (answer: unknown) => void = () => undefined;
    await renderApp("/settings", {
      me: completeMe,
      setUp: (client) => {
        client.answer(
          "/v1/me/notification-settings",
          () => ok(200, { reminders: true, betaNews: true }),
          "get",
        );
        client.answer(
          "/v1/me/notification-settings",
          (input) => {
            changes.push(input["body"]);
            if (changes.length > 1) return ok(200, { reminders: true, betaNews: true });
            return new Promise((resolve) => {
              answerFirst = resolve;
            });
          },
          "patch",
        );
      },
    });
    const reminders = await screen.findByRole("switch", { name: reminderSwitch });
    await waitFor(() => {
      expect(reminders).toBeChecked();
    });
    await fireEvent.press(reminders);
    await fireEvent.press(screen.getByRole("switch", { name: reminderSwitch }));
    expect(screen.getByRole("switch", { name: reminderSwitch })).toBeChecked();
    // The second waits for the first, so the last one is what is kept.
    expect(changes).toEqual([{ reminders: false }]);
    await act(async () => {
      answerFirst(ok(200, { reminders: false, betaNews: true }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(changes).toEqual([{ reminders: false }, { reminders: true }]);
    });
    expect(screen.getByRole("switch", { name: reminderSwitch })).toBeChecked();
  });

  it("offers to try again when the reminders setting does not load", async () => {
    let loads = 0;
    await renderApp("/settings", {
      me: completeMe,
      setUp: (client) => {
        client.answer(
          "/v1/me/notification-settings",
          () => {
            loads += 1;
            return loads === 1
              ? failure(0, "network_error")
              : ok(200, { reminders: false, betaNews: true });
          },
          "get",
        );
      },
    });
    expect(
      await screen.findByText("We couldn't reach PuffinRide. Check your connection and try again."),
    ).toBeVisible();
    expect(screen.queryByRole("switch", { name: reminderSwitch })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("switch", { name: reminderSwitch })).not.toBeChecked();
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
      await screen.findByText("We couldn't reach PuffinRide. Check your connection and try again."),
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
    await fireEvent.press(screen.getByRole("radio", { name: "Íslenska" }));
    expect(await screen.findByRole("header", { name: "Stillingar" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Íslenska" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "English" })).not.toBeChecked();
    expect(app.client.calls.at(-1)?.input).toEqual({
      body: { locale: "is" },
      accessToken: "sr_at_access-1",
    });
  });

  it("opens the Privacy Policy from its row", async () => {
    const app = await openSettings();
    app.client.answer("/v1/legal/{type}/current", () =>
      ok(200, legalDocument("privacy", 1, "## What we collect\n\nYour **phone number**.")),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Privacy Policy" }));
    expect(await screen.findByRole("header", { name: "Privacy Policy" })).toBeVisible();
    expect(screen.getByRole("header", { name: "What we collect" })).toBeVisible();
    expect(screen.getByText("Your phone number.")).toBeVisible();
    // A legal document starts each line at the left, for reading.
    expect(screen.getByText("Your phone number.")).not.toHaveStyle({ textAlign: "center" });
    expect(screen.getByText("phone number")).toHaveStyle({ fontFamily: "Nunito_700Bold" });
  });

  it("shows the lists of a legal document as bullet points", async () => {
    const app = await openSettings();
    app.client.answer("/v1/legal/{type}/current", () =>
      ok(
        200,
        legalDocument(
          "privacy",
          2,
          "## Your rights\n\nYou can:\n\n- **Download your data** in the app.\n- Delete your account.",
        ),
      ),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Privacy Policy" }));
    expect(await screen.findByRole("header", { name: "Your rights" })).toBeVisible();
    expect(screen.getByText("You can:")).toBeVisible();
    expect(screen.getByText("• Download your data in the app.")).toBeVisible();
    expect(screen.getByText("Download your data")).toHaveStyle({ fontFamily: "Nunito_700Bold" });
    expect(screen.getByText("• Delete your account.")).toBeVisible();
    expect(screen.queryByText(/^- /)).toBeNull();
  });
});

describe("Starting the app", () => {
  it("says when PuffinRide cannot be reached and tries again", async () => {
    const app = await renderApp("/", {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/auth/refresh", () => failure(0, "network_error"));
      },
    });
    expect(
      await screen.findByText("We couldn't reach PuffinRide. Check your connection and try again."),
    ).toBeVisible();
    expect(app.store.value).toBe("sr_rt_stored");

    app.client.answer("/v1/auth/refresh", () => ok(200, tokens(2)));
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
  });
});
