import { act, fireEvent, screen, waitFor, within } from "expo-router/testing-library";
import type { DriverReadiness, Me, Vehicle } from "@shareride/contracts";
import { Dimensions } from "react-native";
import { failure, ok, tokens, type FakeClient } from "@/testing/fake-client";
import { completeMe, legalDocument, ownProfile, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { filledButtons } from "@/testing/buttons";
import { meetingPoints } from "@/testing/meeting-points";
import { annaProfile, findPersonCard, profileApi } from "@/testing/people";
import { readyDriver, volvo, yaris } from "@/testing/trips";
import { colors, typography } from "@/theme/tokens";

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
function drivingApi(
  client: FakeClient,
  readiness: DriverReadiness = readyDriver,
  cars: readonly Vehicle[] = [yaris],
) {
  client.answer("/v1/me/driver-readiness", () => ok(200, readiness));
  client.answer("/v1/me/vehicles", () => ok(200, { vehicles: cars }));
  client.answer("/v1/meeting-points", () => ok(200, { meetingPoints }));
}

async function openProfile(
  readiness: DriverReadiness = readyDriver,
  options: { readonly me?: Me; readonly setUp?: (client: FakeClient) => void } = {},
) {
  const me = options.me ?? completeMe;
  const app = await renderApp("/profile", {
    me,
    setUp: (client) => {
      drivingApi(client, readiness);
      options.setUp?.(client);
    },
  });
  app.client.answer("/v1/me", (input) => {
    const body = input["body"] as Partial<Me> | undefined;
    return ok(200, { ...me, ...body });
  });
  app.client.answer("/v1/auth/sign-out", () => ok(204));
  expect(await screen.findByRole("header", { name: "My profile" })).toBeVisible();
  return app;
}

/** Each row of a group as "title: value", in the order shown. */
function rowsOf(group: ReturnType<typeof screen.getByTestId>): string[] {
  return within(group)
    .getAllByTestId("row-words")
    .map((words) =>
      within(words)
        .getAllByText(/./)
        .map((text) => String(text.props.children))
        .join(": "),
    );
}

describe("My profile (spec 31, 3.14)", () => {
  it("has its title at the left, with no Back, and who I am in a card", async () => {
    await openProfile();
    const head = within(screen.getByTestId("screen-head"));
    expect(head.getByRole("header", { name: "My profile" })).not.toHaveStyle({
      textAlign: "center",
    });
    expect(head.queryByRole("button", { name: "Back" })).toBeNull();

    const card = within(screen.getByTestId("person-card"));
    expect(card.getByText("Anna")).toBeVisible();
    expect(card.getByText("Speaks Icelandic, English")).toBeVisible();
    expect(card.getByText("Member since November 2026")).toBeVisible();
    const edit = card.getByRole("button", { name: "Edit profile" });
    expect(within(edit).getByTestId("button-face")).toHaveStyle({
      borderColor: colors.light.control,
    });
    expect(card.getByRole("link", { name: "See it as others do" })).toBeVisible();
    // The photo's controls are in the card, under who I am.
    expect(card.getByRole("button", { name: "Add a photo" })).toBeVisible();
    // The card has no main button: the page has none (R31.1).
    expect(filledButtons()).toBe(0);
  });

  it("shows my rating and what is checked, as others see them", async () => {
    await openProfile(readyDriver, {
      me: { ...completeMe, email: "anna@example.com" },
      setUp: (client) => {
        client.answer("/v1/people/{profileId}", () =>
          ok(
            200,
            ownProfile(
              { ...completeMe, email: "anna@example.com" },
              { rating: { average: 4.3, count: 3 } },
            ),
          ),
        );
      },
    });
    const card = within(screen.getByTestId("person-card"));
    expect(await card.findByText("4.3 (3 ratings)")).toBeVisible();
    expect(card.getByText("Phone verified")).toBeVisible();
    expect(card.getByText("Email verified")).toBeVisible();
  });

  it("says a new member has no ratings yet, and leaves out what is not checked", async () => {
    await openProfile();
    const card = within(screen.getByTestId("person-card"));
    expect(await card.findByText("No ratings yet")).toBeVisible();
    expect(card.getByText("Phone verified")).toBeVisible();
    expect(card.queryByText("Email verified")).toBeNull();
  });

  it("leaves the rating out, and shows the rest, when it cannot be loaded", async () => {
    await openProfile(readyDriver, {
      setUp: (client) => {
        client.answer("/v1/people/{profileId}", () => failure(0, "network_error"));
      },
    });
    expect(await screen.findByRole("link", { name: "Driving licence, Confirmed" })).toBeVisible();
    const card = within(screen.getByTestId("person-card"));
    expect(card.getByText("Anna")).toBeVisible();
    expect(card.queryByText("No ratings yet")).toBeNull();
    expect(card.queryByTestId("tag")).toBeNull();
    expect(
      card.queryByTestId("person-card-standing-room", { includeHiddenElements: true }),
    ).toBeNull();
  });

  it("keeps the room of the rating's line while it is read, so nothing under it moves when it comes", async () => {
    let answer: (value: unknown) => void = () => undefined;
    await openProfile(readyDriver, {
      setUp: (client) => {
        client.answer(
          "/v1/people/{profileId}",
          () =>
            new Promise((resolve) => {
              answer = resolve;
            }),
        );
      },
    });
    const card = within(screen.getByTestId("person-card"));
    // Nothing of it is read out or seen meanwhile: only a line's room.
    expect(card.queryByTestId("person-card-standing")).toBeNull();
    expect(card.queryByText("No ratings yet")).toBeNull();
    expect(card.queryByTestId("person-card-standing-room")).toBeNull();
    expect(
      card.getByTestId("person-card-standing-room", { includeHiddenElements: true }),
    ).toHaveStyle({ lineHeight: typography.bodyStrong.lineHeight });
    await act(async () => {
      answer(ok(200, ownProfile(completeMe)));
      await Promise.resolve();
    });
    expect(await card.findByText("No ratings yet")).toBeVisible();
    expect(
      card.queryByTestId("person-card-standing-room", { includeHiddenElements: true }),
    ).toBeNull();
  });

  it("groups the rows under Driving, Account, Safety and privacy and Help, each with what is set now, then Sign out", async () => {
    await openProfile();
    expect(await screen.findByRole("link", { name: "Driving licence, Confirmed" })).toBeVisible();
    expect(await screen.findByRole("link", { name: "My cars, Toyota Yaris" })).toBeVisible();
    const headings = screen.getAllByRole("header").map((heading) => String(heading.props.children));
    expect(headings).toEqual(["My profile", "Driving", "Account", "Safety and privacy", "Help"]);
    expect(screen.getByRole("header", { name: "Driving" })).not.toHaveStyle({
      textAlign: "center",
    });

    const groups = screen.getAllByTestId("action-rows");
    expect(groups.map(rowsOf)).toEqual([
      ["My cars: Toyota Yaris", "Driving licence: Confirmed"],
      [
        "Email: No email yet",
        "Phone number: +354 690 0000",
        "Sign-in methods",
        "Notifications",
        "Language: English",
      ],
      ["Privacy and your data", "Blocked people", "My reports", "Notices"],
      [
        "Meeting points",
        "Send feedback",
        // In the phone apps only, which these tests run as.
        "Shake to send feedback: Shaking your phone opens Send feedback.",
        "My feedback",
        "About PuffinRide",
        "Legal documents",
      ],
      ["Sign out"],
    ]);
    // Every row has its icon.
    for (const group of groups) {
      expect(
        within(group).getAllByTestId("row-icon", { includeHiddenElements: true }),
      ).toHaveLength(rowsOf(group).length);
    }
    // Settings is gone: its rows are here.
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(screen.queryByText(/are in Settings/)).toBeNull();
  });

  it.each([
    ["My cars, Toyota Yaris", "/drive/cars"],
    ["Driving licence, Confirmed", "/drive/licence"],
    ["Email, No email yet", "/settings/email"],
    ["Sign-in methods", "/settings/sign-in-methods"],
    ["Notifications", "/settings/notifications"],
    ["Language, English", "/settings/language"],
    ["Privacy and your data", "/settings/privacy"],
    ["Blocked people", "/settings/blocked"],
    ["My reports", "/settings/reports"],
    ["Notices", "/notices"],
    ["Meeting points", "/meeting-points"],
    ["My feedback", "/settings/feedback"],
    ["About PuffinRide", "/about"],
  ])("opens what the row %s opens today, as a link", async (row, path) => {
    await openProfile(readyDriver, {
      setUp: (client) => {
        client.answer("/v1/me/blocks", () => ok(200, { blocked: [] }));
        client.answer("/v1/me/reports", () => ok(200, { reports: [] }));
        client.answer("/v1/me/notices", () => ok(200, { notices: [] }));
        client.answer("/v1/me/feedback", () => ok(200, { feedback: [] }));
      },
    });
    await fireEvent.press(await screen.findByRole("link", { name: row }));
    await waitFor(() => {
      expect(screen).toHavePathname(path);
    });
  });

  it("only shows the phone number, with who can see it under the group", async () => {
    await openProfile();
    expect(screen.getByText("+354 690 0000")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Phone number/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Phone number/ })).toBeNull();
    expect(screen.getByText("Only you can see your phone number.")).toBeVisible();
  });

  it("leaves the phone number out for an account that has none yet", async () => {
    await openProfile(readyDriver, { me: { ...completeMe, phoneNumber: null } });
    expect(screen.getAllByTestId("action-rows").map(rowsOf)[1]).toEqual([
      "Email: No email yet",
      "Sign-in methods",
      "Notifications",
      "Language: English",
    ]);
    expect(screen.queryByText("Only you can see your phone number.")).toBeNull();
  });

  it("says my email", async () => {
    await openProfile(readyDriver, { me: { ...completeMe, email: "anna@example.com" } });
    expect(screen.getByRole("link", { name: "Email, anna@example.com" })).toBeVisible();
  });

  it("says which email waits for its link to be opened", async () => {
    await openProfile(readyDriver, {
      me: { ...completeMe, email: "anna@example.com", pendingEmail: "anna@new.example" },
    });
    expect(
      screen.getByRole("link", {
        name: "Email, Waiting for you to open the link sent to anna@new.example.",
      }),
    ).toBeVisible();
  });

  it("names the ways I sign in", async () => {
    await openProfile(readyDriver, {
      me: { ...completeMe, email: "anna@example.com" },
      setUp: (client) => {
        client.answer("/v1/me/sign-in-methods", () =>
          ok(200, {
            methods: [
              { provider: "google", email: "anna@example.com", linkedAt: "2026-11-20T10:00:00Z" },
            ],
            password: { setAt: "2026-11-21T10:00:00Z" },
            passkeys: [
              {
                id: "0190a1d6-0000-7000-8000-0000000000c1",
                credentialId: "Y3JlZGVudGlhbA",
                browser: "Safari",
                system: "iPhone",
                createdAt: "2026-11-22T10:00:00Z",
                lastUsedAt: null,
              },
            ],
          }),
        );
      },
    });
    expect(
      await screen.findByRole("link", {
        name: "Sign-in methods, Email, Google, Password, Face ID or fingerprint",
      }),
    ).toBeVisible();
  });

  it("names each car", async () => {
    await openProfile(readyDriver, {
      setUp: (client) => {
        drivingApi(client, readyDriver, [yaris, volvo]);
      },
    });
    expect(
      await screen.findByRole("link", { name: "My cars, Toyota Yaris, Volvo XC40" }),
    ).toBeVisible();
  });

  it("names no car for a driver without one", async () => {
    await openProfile(readyDriver, {
      setUp: (client) => {
        drivingApi(client, readyDriver, []);
      },
    });
    expect(await screen.findByRole("link", { name: "Driving licence, Confirmed" })).toBeVisible();
    expect(screen.getByRole("link", { name: "My cars" })).toBeVisible();
  });

  it("keeps what the rows and the card said when they cannot be read again on coming back", async () => {
    const me = { ...completeMe, email: "anna@example.com" };
    const app = await openProfile(readyDriver, { me });
    expect(await screen.findByRole("link", { name: "My cars, Toyota Yaris" })).toBeVisible();
    expect(await screen.findByRole("link", { name: "Sign-in methods, Email" })).toBeVisible();
    expect(await screen.findByText("No ratings yet")).toBeVisible();
    const read = [
      "/v1/me/vehicles",
      "/v1/me/driver-readiness",
      "/v1/me/sign-in-methods",
      "/v1/people/{profileId}",
    ];
    for (const path of read) app.client.answer(path, () => failure(0, "network_error"));
    const asked = () => app.client.calls.filter((call) => read.includes(call.path)).length;
    const before = asked();
    await fireEvent.press(screen.getByRole("link", { name: "Notifications" }));
    expect(await screen.findByRole("header", { name: "Notifications" })).toBeVisible();
    await fireEvent.press(
      within(screen.getByTestId("screen-head")).getByRole("button", { name: "Back" }),
    );
    expect(await screen.findByRole("header", { name: "My profile" })).toBeVisible();
    // Each is asked again on coming back, and none could be read.
    await waitFor(() => {
      expect(asked()).toBe(before + read.length);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("link", { name: "My cars, Toyota Yaris" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Driving licence, Confirmed" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign-in methods, Email" })).toBeVisible();
    const card = within(screen.getByTestId("person-card"));
    expect(card.getByText("No ratings yet")).toBeVisible();
    expect(card.getByText("Phone verified")).toBeVisible();
  });

  it("signs out of this device from its row and returns to Find", async () => {
    const app = await openProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(app.client.calls.findLast((call) => call.path === "/v1/auth/sign-out")?.input).toEqual({
      body: { all: false },
      accessToken: "sr_at_access-1",
    });
    expect(app.store.value).toBeNull();
  });

  it("signs out of this phone also when PuffinRide cannot be reached", async () => {
    const app = await openProfile();
    app.client.answer("/v1/auth/sign-out", () => failure(0, "network_error"));
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(app.store.value).toBeNull();
  });

  it("says the licence is not confirmed yet, and opens the licence screen", async () => {
    await openProfile(licenceToConfirm);
    await fireEvent.press(
      await screen.findByRole("link", { name: "Driving licence, Not confirmed yet" }),
    );
    expect(await screen.findByRole("header", { name: "Your driving licence" })).toBeVisible();
    expect(screen).toHavePathname("/drive/licence");
  });

  it("opens My cars, with each car and Add a car", async () => {
    await openProfile();
    await fireEvent.press(await screen.findByRole("link", { name: "My cars, Toyota Yaris" }));
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
    await fireEvent.press(screen.getByRole("link", { name: "Meeting points" }));
    expect(await screen.findByRole("header", { name: "Meeting points" })).toBeVisible();
    expect(screen).toHavePathname("/meeting-points");
  });

  it("opens the terms, the rules and the privacy policy on About, from one row", async () => {
    await openProfile();
    await fireEvent.press(screen.getByRole("link", { name: "About PuffinRide" }));
    expect(await screen.findByRole("header", { name: "About PuffinRide" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Community Rules" })).toBeVisible();
    await fireEvent.press(screen.getByRole("link", { name: "Privacy Policy" }));
    expect(screen).toHavePathname("/legal/privacy");
  });

  it("unfolds the three legal documents under their row, as links", async () => {
    await openProfile();
    expect(screen.queryByRole("link", { name: "Terms of Service" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Legal documents", expanded: false }));
    expect(screen.getByRole("button", { name: "Legal documents", expanded: true })).toBeVisible();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toBeVisible();
    await fireEvent.press(screen.getByRole("link", { name: "Community Rules" }));
    expect(screen).toHavePathname("/legal/community-rules");
  });

  it("opens Send feedback from its row", async () => {
    await openProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByRole("header", { name: "Send feedback" })).toBeVisible();
  });

  it("shows the profile as others see it, without the phone number", async () => {
    const app = await openProfile();
    profileApi(app.client, [
      { ...annaProfile, profileId: completeMe.profileId, memberSince: "2026-11" },
    ]);
    await fireEvent.press(screen.getByRole("link", { name: "See it as others do" }));
    expect(await screen.findByRole("header", { name: "As others see you" })).toBeVisible();
    expect(screen).toHavePathname("/profile/preview");
    expect(await findPersonCard("Anna")).toBeVisible();
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

    expect(await screen.findByText("Speaks Icelandic")).toBeVisible();
    expect(screen).toHavePathname("/profile");
    expect(app.client.calls.find((c) => c.path === "/v1/me" && "body" in c.input)?.input).toEqual({
      body: { firstName: "Anna", about: "Usually with a dog.", languages: ["is"] },
      accessToken: "sr_at_access-1",
    });
  });

  it("has Edit profile's title at the left, and who I am with the photo's controls in a card (spec 31, 3.19)", async () => {
    await renderApp("/profile/edit", { me: completeMe, setUp: drivingApi });
    const card = within(await findPersonCard("Anna"));
    const head = within(screen.getByTestId("screen-head"));
    expect(head.getByRole("header", { name: "Edit profile" })).not.toHaveStyle({
      textAlign: "center",
    });
    expect(card.getByText("Speaks Icelandic, English")).toBeVisible();
    expect(card.getByText("Member since November 2026")).toBeVisible();
    expect(card.getByRole("button", { name: "Add a photo" })).toBeVisible();
    // The card is whom the form is about: nothing in it leads away from the
    // form, and it has no rating to read.
    expect(card.queryByRole("button", { name: "Edit profile" })).toBeNull();
    expect(card.queryByRole("link", { name: "See it as others do" })).toBeNull();
    expect(screen.queryByTestId("person-card-standing")).toBeNull();
    expect(screen.queryByTestId("person-card-standing-room")).toBeNull();
    // The form is under the card, and Save is the screen's one main button (R31.1).
    const all = screen.getAllByText(/./).map((text) => String(text.props.children));
    expect(all.indexOf("First name")).toBeGreaterThan(all.indexOf("Member since November 2026"));
    expect(filledButtons()).toBe(1);
    await fireEvent.press(head.getByRole("button", { name: "Back" }));
    expect(screen).toHavePathname("/profile");
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

  it("asks a signed-out person to sign in, with a centred title", async () => {
    await renderApp("/profile");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeVisible();
    expect(screen.getByRole("header", { name: "Profile" })).toHaveStyle({ textAlign: "center" });
    expect(screen.queryByTestId("person-card")).toBeNull();
    expect(screen.queryByTestId("action-rows")).toBeNull();
  });
});

describe("My profile on a laptop (spec 31, 3.16 item 5)", () => {
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

  it("has who I am in the side column, at the left, and the groups in the main column", async () => {
    await openProfile();
    expect(screen.getByTestId("page")).toBeVisible();
    expect(screen.getByRole("header", { name: "My profile" })).not.toHaveStyle({
      textAlign: "center",
    });
    // The side column is drawn at the left; a reader still gets the rows first.
    expect(screen.getByTestId("columns")).toHaveStyle({ flexDirection: "row-reverse" });

    const side = within(screen.getByTestId("columns-side"));
    const card = within(side.getByTestId("person-card"));
    expect(card.getByText("Anna")).toBeVisible();
    expect(card.getByText("Member since November 2026")).toBeVisible();
    expect(card.getByRole("button", { name: "Edit profile" })).toBeVisible();
    expect(card.getByRole("link", { name: "See it as others do" })).toBeVisible();
    expect(await card.findByText("No ratings yet")).toBeVisible();
    // The side column holds the card and nothing else.
    expect(side.queryByTestId("action-rows")).toBeNull();

    const main = within(screen.getByTestId("columns-main"));
    expect(await main.findByRole("link", { name: "Driving licence, Confirmed" })).toBeVisible();
    expect(main.getAllByRole("header").map((heading) => String(heading.props.children))).toEqual([
      "Driving",
      "Account",
      "Safety and privacy",
      "Help",
    ]);
    expect(main.getAllByTestId("action-rows")).toHaveLength(5);
    expect(main.getByRole("button", { name: "Sign out" })).toBeVisible();
    // Each once.
    expect(screen.getAllByRole("button", { name: "Edit profile" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Notifications" })).toHaveLength(1);
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
      within(screen.getByTestId("columns-main")).getByRole("link", { name: "Notifications" }),
    );
    expect(screen).toHavePathname("/settings/notifications");
  });

  it("is the phone's one column when the window turns narrow, and loads nothing again", async () => {
    const { client } = await openProfile();
    const asked = (path: string) => client.calls.filter((call) => call.path === path).length;
    const loaded = [
      "/v1/me/driver-readiness",
      "/v1/me/vehicles",
      "/v1/me/sign-in-methods",
      "/v1/people/{profileId}",
    ];
    expect(await screen.findByRole("link", { name: "Driving licence, Confirmed" })).toBeVisible();
    expect(await screen.findByText("No ratings yet")).toBeVisible();
    expect(loaded.map(asked)).toEqual([1, 1, 1, 1]);
    // What is open stays open across the widths.
    await fireEvent.press(screen.getByRole("button", { name: "Legal documents" }));

    await act(() => {
      Dimensions.set({ window: phone });
    });
    expect(screen.queryByTestId("page")).toBeNull();
    expect(screen.queryByTestId("columns")).toBeNull();
    expect(within(screen.getByTestId("person-card")).getByText("Anna")).toBeVisible();
    expect(screen.getByRole("header", { name: "My profile" })).not.toHaveStyle({
      textAlign: "center",
    });
    expect(screen.getByRole("link", { name: "Driving licence, Confirmed" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toBeVisible();

    await act(() => {
      Dimensions.set({ window: laptop });
    });
    expect(
      within(screen.getByTestId("columns-main")).getByRole("link", {
        name: "Driving licence, Confirmed",
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toBeVisible();
    expect(loaded.map(asked)).toEqual([1, 1, 1, 1]);
  });

  it("stays one centred column signed out", async () => {
    await renderApp("/profile");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeVisible();
    expect(screen.queryByTestId("page")).toBeNull();
    expect(screen.queryByTestId("columns")).toBeNull();
    expect(screen.getByRole("header", { name: "Profile" })).toHaveStyle({ textAlign: "center" });
  });
});

describe("The language's page (spec 31, 3.14 item 2)", () => {
  async function openLanguage() {
    const app = await openProfile();
    await fireEvent.press(screen.getByRole("link", { name: "Language, English" }));
    expect(await screen.findByRole("header", { name: "Language" })).toBeVisible();
    expect(screen).toHavePathname("/settings/language");
    return app;
  }

  it("has its title at the left with Back, and the two languages to choose from", async () => {
    await openLanguage();
    const head = within(screen.getByTestId("screen-head"));
    expect(head.getByRole("header", { name: "Language" })).not.toHaveStyle({
      textAlign: "center",
    });
    expect(head.getByRole("button", { name: "Back" })).toBeVisible();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
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
  });

  it("changes the language of the app and of the account, and Profile says which", async () => {
    const app = await openLanguage();
    await fireEvent.press(screen.getByRole("radio", { name: "Íslenska" }));
    expect(await screen.findByRole("header", { name: "Tungumál" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Íslenska" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "English" })).not.toBeChecked();
    expect(app.client.calls.at(-1)?.input).toEqual({
      body: { locale: "is" },
      accessToken: "sr_at_access-1",
    });
    await fireEvent.press(screen.getByRole("button", { name: "Til baka" }));
    expect(await screen.findByRole("link", { name: "Tungumál, Íslenska" })).toBeVisible();
  });

  it("asks nothing of the account when the language in use is pressed", async () => {
    const app = await openLanguage();
    const before = app.client.calls.length;
    await fireEvent.press(screen.getByRole("radio", { name: "English" }));
    expect(app.client.calls).toHaveLength(before);
  });

  it("changes the app's language and says so when the account's could not be saved", async () => {
    const app = await openLanguage();
    app.client.answer("/v1/me", () => failure(0, "network_error"));
    await fireEvent.press(screen.getByRole("radio", { name: "Íslenska" }));
    expect(await screen.findByRole("header", { name: "Tungumál" })).toBeVisible();
    expect(
      await screen.findByText(
        "Ekki náðist samband við PuffinRide. Athugaðu tenginguna og reyndu aftur.",
      ),
    ).toBeVisible();
  });

  it("tries again when the language is chosen again after it could not be saved", async () => {
    const app = await openLanguage();
    const saves = () =>
      app.client.calls
        .filter((call) => call.path === "/v1/me" && "body" in call.input)
        .map((call) => (call.input as { body: unknown }).body);
    app.client.answer("/v1/me", () => failure(0, "network_error"));
    await fireEvent.press(screen.getByRole("radio", { name: "Íslenska" }));
    const sorry = "Ekki náðist samband við PuffinRide. Athugaðu tenginguna og reyndu aftur.";
    expect(await screen.findByText(sorry)).toBeVisible();
    app.client.answer("/v1/me", () => ok(200, { ...completeMe, locale: "is" }));
    // The one in use, but the account still has the other.
    await fireEvent.press(screen.getByRole("radio", { name: "Íslenska" }));
    await waitFor(() => {
      expect(saves()).toEqual([{ locale: "is" }, { locale: "is" }]);
    });
    await waitFor(() => {
      expect(screen.queryByText(sorry)).toBeNull();
    });
    // Saved now: pressing it once more asks nothing.
    await fireEvent.press(screen.getByRole("radio", { name: "Íslenska" }));
    expect(saves()).toHaveLength(2);
  });

  it("saves quick choices one after the other, ends on the last, and says only how the last went", async () => {
    const app = await openLanguage();
    const saves: unknown[] = [];
    let answerFirst: (answer: unknown) => void = () => undefined;
    app.client.answer("/v1/me", (input) => {
      saves.push(input["body"]);
      if (saves.length > 1) return ok(200, { ...completeMe, locale: "en" });
      return new Promise((resolve) => {
        answerFirst = resolve;
      });
    });
    await fireEvent.press(screen.getByRole("radio", { name: "Íslenska" }));
    await fireEvent.press(screen.getByRole("radio", { name: "English" }));
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    // The second waits for the first, so the last one is what the account keeps.
    expect(saves).toEqual([{ locale: "is" }]);
    await act(async () => {
      answerFirst(failure(0, "network_error"));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(saves).toEqual([{ locale: "is" }, { locale: "en" }]);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("header", { name: "Language" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "English" })).toBeChecked();
    // The first could not be saved, but the last was: nothing to say.
    expect(
      screen.queryByText("We couldn't reach PuffinRide. Check your connection and try again."),
    ).toBeNull();
  });

  it("closes back to the menu signed out", async () => {
    await renderApp("/settings/language");
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
  });
});

describe("The notifications' page (spec 31, 3.14 item 2)", () => {
  const reminderSwitch = "Ride reminders. The evening before and an hour before each ride.";

  async function openNotifications() {
    const app = await openProfile();
    await fireEvent.press(screen.getByRole("link", { name: "Notifications" }));
    expect(await screen.findByRole("header", { name: "Notifications" })).toBeVisible();
    expect(screen).toHavePathname("/settings/notifications");
    return app;
  }

  it("has its title at the left with Back to Profile", async () => {
    await openNotifications();
    const head = within(screen.getByTestId("screen-head"));
    expect(head.getByRole("header", { name: "Notifications" })).not.toHaveStyle({
      textAlign: "center",
    });
    await fireEvent.press(head.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("header", { name: "My profile" })).toBeVisible();
  });

  it("holds the two switches as rows of one card, each with what it does under its name", async () => {
    await renderApp("/settings/notifications", { me: completeMe });
    await screen.findByRole("switch", { name: reminderSwitch });
    // The switches' card, then the card of the way to the news.
    expect(screen.getAllByTestId("action-rows").map(rowsOf)).toEqual([
      [
        "Ride reminders: The evening before and an hour before each ride.",
        "Beta news: News from PuffinRide about the beta, by notification and email.",
      ],
      ["Beta news: What PuffinRide has told beta testers in the last three months."],
    ]);
    expect(screen.getAllByRole("switch")).toHaveLength(2);
    // Each row has its picture, as Profile's rows have.
    expect(screen.getAllByTestId("row-icon", { includeHiddenElements: true })).toHaveLength(3);
    // What is always on is a quiet line under the switches.
    expect(
      screen.getByText(
        "Notifications about bookings, rides, payments and messages are always on, because others rely on them.",
      ),
    ).toHaveStyle({ fontSize: typography.small.fontSize });
    expect(filledButtons()).toBe(0);
  });

  it("has trip reminders on, says what stays on, and turns them off (spec 7, 3.6)", async () => {
    const app = await openNotifications();
    const reminders = await screen.findByRole("switch", { name: reminderSwitch });
    await waitFor(() => {
      expect(reminders).toBeChecked();
    });
    expect(
      screen.getByText(
        "Notifications about bookings, rides, payments and messages are always on, because others rely on them.",
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
    const app = await openNotifications();
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

    await fireEvent.press(
      screen.getByRole("link", {
        name: "Beta news, What PuffinRide has told beta testers in the last three months.",
      }),
    );
    expect(await screen.findByRole("header", { name: "Beta news" })).toBeVisible();
    expect(await screen.findByText("No news yet.")).toBeVisible();
  });

  it("turns the switch back and says so when the change fails", async () => {
    await renderApp("/settings/notifications", {
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

  it("says once why two changes could not be saved", async () => {
    await renderApp("/settings/notifications", {
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
    const sorry = "We couldn't reach PuffinRide. Check your connection and try again.";
    const reminders = await screen.findByRole("switch", { name: reminderSwitch });
    await waitFor(() => {
      expect(reminders).toBeChecked();
    });
    await fireEvent.press(reminders);
    expect(await screen.findByText(sorry)).toBeVisible();
    await fireEvent.press(
      screen.getByRole("switch", {
        name: "Beta news. News from PuffinRide about the beta, by notification and email.",
      }),
    );
    await waitFor(() => {
      expect(
        screen.getByRole("switch", {
          name: "Beta news. News from PuffinRide about the beta, by notification and email.",
        }),
      ).toBeChecked();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getAllByText(sorry)).toHaveLength(1);
  });

  it("saves quick changes one after the other, and ends on the last", async () => {
    const changes: unknown[] = [];
    let answerFirst: (answer: unknown) => void = () => undefined;
    await renderApp("/settings/notifications", {
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
    await renderApp("/settings/notifications", {
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

  it("closes back to the menu signed out", async () => {
    await renderApp("/settings/notifications");
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
  });
});

describe("Settings is gone (spec 31, 3.14 item 3)", () => {
  it("leads to Profile from its old address", async () => {
    await renderApp("/settings", { me: completeMe, setUp: drivingApi });
    expect(await screen.findByRole("header", { name: "My profile" })).toBeVisible();
    expect(screen).toHavePathname("/profile");
    expect(screen.queryByRole("header", { name: "Settings" })).toBeNull();
  });

  it("leads a signed-out person to Profile too, which asks to sign in", async () => {
    await renderApp("/settings");
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeVisible();
    expect(screen).toHavePathname("/profile");
  });

  async function openSignInMethods() {
    const app = await openProfile();
    await fireEvent.press(screen.getByRole("link", { name: "Sign-in methods" }));
    expect(await screen.findByRole("header", { name: "Sign-in methods" })).toBeVisible();
    return app;
  }

  it("signs out on all devices at the end of Sign-in methods, and returns to Find", async () => {
    const app = await openSignInMethods();
    expect(
      screen.getByText("Use this if you lost a phone or signed in on a device other people use."),
    ).toBeVisible();
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out on all devices" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    // The front page then loads its rides; the sign-out came before.
    expect(app.client.calls.findLast((call) => call.path === "/v1/auth/sign-out")).toEqual({
      path: "/v1/auth/sign-out",
      input: { body: { all: true }, accessToken: "sr_at_access-1" },
    });
    expect(app.store.value).toBeNull();
  });

  it("signs out on all devices also when the ways to sign in cannot be read", async () => {
    const app = await openProfile();
    app.client.answer("/v1/me/sign-in-methods", () => failure(0, "network_error"));
    await fireEvent.press(screen.getByRole("link", { name: "Sign-in methods" }));
    expect(await screen.findByRole("header", { name: "Sign-in methods" })).toBeVisible();
    expect(
      await screen.findByText("We couldn't reach PuffinRide. Check your connection and try again."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(
      screen.getByText("Use this if you lost a phone or signed in on a device other people use."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out on all devices" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(app.client.calls.findLast((call) => call.path === "/v1/auth/sign-out")?.input).toEqual({
      body: { all: true },
      accessToken: "sr_at_access-1",
    });
    expect(app.store.value).toBeNull();
  });

  it("stays signed in and says so when signing out everywhere fails", async () => {
    const app = await openSignInMethods();
    app.client.answer("/v1/auth/sign-out", () => failure(0, "network_error"));
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out on all devices" }));
    expect(
      await screen.findByText("We couldn't reach PuffinRide. Check your connection and try again."),
    ).toBeVisible();
    expect(screen.getByRole("header", { name: "Sign-in methods" })).toBeVisible();
    expect(app.store.value).toBe("sr_rt_refresh-1");
  });

  async function openLegal(body: string) {
    const app = await openProfile();
    app.client.answer("/v1/legal/{type}/current", () => ok(200, legalDocument("privacy", 1, body)));
    await fireEvent.press(screen.getByRole("button", { name: "Legal documents" }));
    await fireEvent.press(screen.getByRole("link", { name: "Privacy Policy" }));
    return app;
  }

  it("opens the Privacy Policy from Legal documents", async () => {
    await openLegal("## What we collect\n\nYour **phone number**.");
    expect(await screen.findByRole("header", { name: "Privacy Policy" })).toBeVisible();
    expect(screen.getByRole("header", { name: "What we collect" })).toBeVisible();
    expect(screen.getByText("Your phone number.")).toBeVisible();
    // A legal document starts each line at the left, for reading.
    expect(screen.getByText("Your phone number.")).not.toHaveStyle({ textAlign: "center" });
    expect(screen.getByText("phone number")).toHaveStyle({ fontFamily: "Nunito_700Bold" });
  });

  it("shows the lists of a legal document as bullet points", async () => {
    await openLegal(
      "## Your rights\n\nYou can:\n\n- **Download your data** in the app.\n- Delete your account.",
    );
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
