import { router } from "expo-router";
import { act, fireEvent, screen } from "expo-router/testing-library";
import type { Me } from "@shareride/contracts";
import { failure, ok, testMe, type FakeClient } from "@/testing/fake-client";
import { completeMe, legalDocument, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
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
// The web asks for an email at sign-up; the phone apps do not (spec 20, 3.3).
let mockOnTheWeb = false;
jest.mock("@/onboarding/email-at-sign-up", () => ({ emailAtSignUp: () => mockOnTheWeb }));
// The app's own storage, in memory: a ride kept while signing up waits here.
const mockStored = new Map<string, string>();
jest.mock("@/lib/app-data", () => ({
  readAppData: jest.fn((key: string) => Promise.resolve(mockStored.get(key) ?? null)),
  writeAppData: jest.fn((key: string, value: string) => {
    mockStored.set(key, value);
    return Promise.resolve();
  }),
}));

beforeEach(() => {
  mockStored.clear();
  mockOnTheWeb = false;
});

/** Accepted the terms in an earlier version of the app, then left before the profile. */
const afterLegal: Me = { ...testMe, ageConfirmed: true, missingSteps: ["profile"] };
const accept = "I accept the Terms of Service and the Community Rules";

/** A new account, signed in: the app opens step 3. */
async function openAboutYou(
  versions: { terms: number; rules: number } = { terms: 1, rules: 1 },
  me: Me = testMe,
  setUp: (client: FakeClient) => void = (client) => {
    tripDetailsApi(client);
  },
) {
  const app = await renderApp("/", {
    me,
    setUp: (client) => {
      client.answer("/v1/legal/{type}/current", (input) => {
        const { type } = input["params"] as { type: string };
        return ok(200, legalDocument(type, type === "terms" ? versions.terms : versions.rules));
      });
      setUp(client);
    },
  });
  expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
  return app;
}

async function tickBoth() {
  await fireEvent.press(screen.getByRole("checkbox", { name: "I am 18 or older" }));
  await fireEvent.press(screen.getByRole("checkbox", { name: accept }));
}

const callsTo = (app: Awaited<ReturnType<typeof renderApp>>, path: string, method?: "patch") =>
  app.client.calls.filter(
    (call) => call.path === path && (method === undefined || "body" in call.input),
  );

describe("Step 3 of signing up, about you (spec 16, 3.5)", () => {
  it("asks for a first name, languages and the terms in one step", async () => {
    await openAboutYou();
    expect(screen).toHavePathname("/onboarding/about-you");
    expect(screen.getByText("Step 3 of 3")).toBeVisible();
    expect(screen.getByText("Everyone sees it. We never show your last name.")).toBeVisible();
    // The app's language is ticked already, and a few common ones show.
    expect(screen.getByRole("checkbox", { name: "English" })).toBeChecked();
    for (const name of ["Icelandic", "Polish", "German", "Spanish"]) {
      expect(screen.getByRole("checkbox", { name })).not.toBeChecked();
    }
    expect(screen.queryByRole("checkbox", { name: "Lithuanian" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "More languages" }));
    expect(screen.getByRole("checkbox", { name: "Lithuanian" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "More languages" })).toBeNull();
    // A few words about you, folded until asked for.
    expect(screen.queryByLabelText("About you")).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Add a few words about you (optional)" }),
    );
    expect(screen.getByLabelText("About you")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "I am 18 or older" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: accept })).not.toBeChecked();
    expect(screen.getByText("The Privacy Policy explains what we collect and why.")).toBeVisible();
    // Nothing kept: no ride card, and the button just creates the account.
    expect(screen.queryByTestId("kept-ride")).toBeNull();
    expect(screen.getByRole("button", { name: "Create account" })).toBeVisible();
  });

  it("asks for both boxes before sending anything", async () => {
    const app = await openAboutYou();
    await fireEvent.changeText(screen.getByLabelText("First name"), "Anna");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Tick both boxes to continue.")).toBeVisible();
    await fireEvent.press(screen.getByRole("checkbox", { name: "I am 18 or older" }));
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Tick both boxes to continue.")).toBeVisible();
    expect(callsTo(app, "/v1/me/legal-acceptances")).toHaveLength(0);
    expect(callsTo(app, "/v1/me", "patch")).toHaveLength(0);
  });

  it("checks the first name before anything is sent", async () => {
    const app = await openAboutYou();
    await tickBoth();
    await fireEvent.changeText(screen.getByLabelText("First name"), "Anna 2");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(
      await screen.findByText("Use 1 to 30 letters. Spaces, hyphens and apostrophes are fine."),
    ).toBeVisible();
    expect(callsTo(app, "/v1/me/legal-acceptances")).toHaveLength(0);
    expect(callsTo(app, "/v1/me", "patch")).toHaveLength(0);
  });

  it("keeps the few words about you to 300 characters", async () => {
    await openAboutYou();
    await fireEvent.press(
      screen.getByRole("button", { name: "Add a few words about you (optional)" }),
    );
    await fireEvent.changeText(screen.getByLabelText("First name"), "Anna");
    await fireEvent.changeText(screen.getByLabelText("About you"), "a".repeat(301));
    expect(screen.getByText("301 of 300")).toBeVisible();
    await tickBoth();
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Keep it to 300 characters.")).toBeVisible();
  });

  it("accepts the documents shown, then saves the profile, then opens Find", async () => {
    const app = await openAboutYou();
    app.client.answer("/v1/me/legal-acceptances", () => ok(200, afterLegal));
    app.client.answer("/v1/me", (input) => {
      const body = input["body"] as Partial<Me> | undefined;
      return ok(200, { ...afterLegal, ...body, missingSteps: [] });
    });
    await fireEvent.changeText(screen.getByLabelText("First name"), "  Anna ");
    await fireEvent.press(screen.getByRole("checkbox", { name: "Icelandic" }));
    await fireEvent.press(
      screen.getByRole("button", { name: "Add a few words about you (optional)" }),
    );
    await fireEvent.changeText(screen.getByLabelText("About you"), "Coffee and podcasts.");
    await tickBoth();
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(screen).toHavePathname("/");
    const legal = app.client.calls.findIndex((c) => c.path === "/v1/me/legal-acceptances");
    const profile = app.client.calls.findIndex((c) => c.path === "/v1/me" && "body" in c.input);
    expect(legal).toBeGreaterThan(-1);
    expect(profile).toBeGreaterThan(legal);
    expect(app.client.calls[legal]?.input).toEqual({
      body: {
        ageConfirmed: true,
        documents: [
          { type: "terms", version: 1 },
          { type: "community-rules", version: 1 },
        ],
        locale: "en",
      },
      accessToken: "sr_at_access-1",
    });
    expect(app.client.calls[profile]?.input).toEqual({
      body: { firstName: "Anna", about: "Coffee and podcasts.", languages: ["en", "is"] },
      accessToken: "sr_at_access-1",
    });
    await fireEvent.press(screen.getByRole("tab", { name: "Profile" }));
    expect(await screen.findByRole("header", { name: "My profile" })).toBeVisible();
    expect(
      screen.getByText("Speaks English, Icelandic · Member since November 2026"),
    ).toBeVisible();
  });

  it("keeps the answers when saving fails, and accepts the terms only once", async () => {
    const app = await openAboutYou();
    app.client.answer("/v1/me/legal-acceptances", () => ok(200, afterLegal));
    let saves = 0;
    app.client.answer("/v1/me", (input) => {
      const body = input["body"] as Partial<Me> | undefined;
      if (body === undefined) return ok(200, testMe);
      saves += 1;
      return saves === 1
        ? failure(0, "network_error")
        : ok(200, { ...afterLegal, ...body, missingSteps: [] });
    });
    await fireEvent.changeText(screen.getByLabelText("First name"), "Anna");
    await tickBoth();
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(
      await screen.findByText("We couldn't reach PuffinRide. Check your connection and try again."),
    ).toBeVisible();
    expect(screen.getByLabelText("First name")).toHaveDisplayValue("Anna");
    expect(screen.getByRole("checkbox", { name: "English" })).toBeChecked();
    // Nothing moves: the boxes stay, ticked, though the terms are accepted.
    expect(screen.getByRole("checkbox", { name: "I am 18 or older" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: accept })).toBeChecked();

    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(callsTo(app, "/v1/me/legal-acceptances")).toHaveLength(1);
    expect(callsTo(app, "/v1/me", "patch")).toHaveLength(2);
  });

  it("never asks for the terms again once accepted, even when step 3 opens afresh", async () => {
    const app = await openAboutYou();
    app.client.answer("/v1/me/legal-acceptances", () => ok(200, afterLegal));
    app.client.answer("/v1/me", (input) => {
      const body = input["body"] as Partial<Me> | undefined;
      return body === undefined ? ok(200, testMe) : failure(0, "network_error");
    });
    await fireEvent.changeText(screen.getByLabelText("First name"), "Anna");
    await tickBoth();
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(
      await screen.findByText("We couldn't reach PuffinRide. Check your connection and try again."),
    ).toBeVisible();
    // Leaving for Find comes back to step 3, now without the terms.
    await act(() => {
      router.navigate("/");
    });
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
    expect(screen.queryByRole("checkbox", { name: accept })).toBeNull();
    expect(callsTo(app, "/v1/me/legal-acceptances")).toHaveLength(1);
  });

  it("offers Try again when the terms cannot be loaded, and saves nothing", async () => {
    const app = await openAboutYou(undefined, testMe, (client) => {
      client.answer("/v1/legal/{type}/current", () => failure(0, "network_error"));
    });
    expect(
      await screen.findByText("We couldn't reach PuffinRide. Check your connection and try again."),
    ).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText("First name"), "Anna");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(callsTo(app, "/v1/me", "patch")).toHaveLength(0);
    app.client.answer("/v1/legal/{type}/current", (input) => {
      const { type } = input["params"] as { type: string };
      return ok(200, legalDocument(type, 1));
    });
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Terms of Service, version 1")).toBeVisible();
  });

  it("shows the new version when the terms changed while reading", async () => {
    const versions = { terms: 1, rules: 1 };
    const app = await openAboutYou(versions);
    app.client.answer("/v1/me/legal-acceptances", (input) => {
      const body = input["body"] as { documents: { version: number }[] };
      return body.documents[0]?.version === 2
        ? ok(200, afterLegal)
        : failure(409, "legal_version_outdated");
    });
    app.client.answer("/v1/me", (input) => {
      const body = input["body"] as Partial<Me> | undefined;
      return ok(200, { ...afterLegal, ...body, missingSteps: [] });
    });
    versions.terms = 2;
    await fireEvent.changeText(screen.getByLabelText("First name"), "Anna");
    await tickBoth();
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("The terms have just changed. Read them again.")).toBeVisible();
    expect(await screen.findByText("Terms of Service, version 2")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: accept })).not.toBeChecked();
    expect(callsTo(app, "/v1/me", "patch")).toHaveLength(0);

    await fireEvent.press(screen.getByRole("checkbox", { name: accept }));
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
  });

  it("opens a legal document to read", async () => {
    await openAboutYou();
    await fireEvent.press(screen.getByRole("link", { name: "Read the Terms of Service" }));
    expect(await screen.findByRole("header", { name: "Terms of Service" })).toBeVisible();
    expect(screen.getByText("Draft text.")).toBeVisible();
    expect(screen).toHavePathname("/legal/terms");
  });
});

describe("The button names what comes after step 3 (3.5 item 4)", () => {
  function keepBooking() {
    mockStored.set(
      "pending-booking",
      JSON.stringify({
        tripId: northResult.tripId,
        board: 1,
        alight: 2,
        seats: 1,
        keptAt: new Date().toISOString(),
      }),
    );
  }

  it("says send request for a trip the driver approves, under the ride", async () => {
    keepBooking();
    await openAboutYou();
    expect(
      await screen.findByRole("button", { name: "Create account and send request" }),
    ).toBeVisible();
    expect(screen.getByTestId("kept-ride")).toHaveAccessibleName(
      "You're booking, Sunday 15 November, Leaves Borgarnes at 10:00, arrives at Blönduós at 12:05",
    );
  });

  it("says book for a trip that books instantly", async () => {
    keepBooking();
    await openAboutYou(undefined, testMe, (client) => {
      tripDetailsApi(client, (query) =>
        ok(
          200,
          northTrip(
            { board: Number(query["fromStop"]), alight: Number(query["toStop"]) },
            { bookingMode: "instant" },
          ),
        ),
      );
    });
    expect(await screen.findByRole("button", { name: "Create account and book" })).toBeVisible();
  });

  it.each([
    [
      "is full now",
      (client: FakeClient) => {
        tripDetailsApi(client, (query) =>
          ok(
            200,
            northTrip(
              { board: Number(query["fromStop"]), alight: Number(query["toStop"]) },
              { part: { state: "full", freeSeats: 0 } },
            ),
          ),
        );
      },
    ],
    [
      "cannot be loaded",
      (client: FakeClient) => {
        client.answer("/v1/trips/{id}", () => failure(0, "network_error"));
      },
    ],
  ])("just says Create account when the trip %s", async (_case, setUp) => {
    keepBooking();
    const app = await openAboutYou(undefined, testMe, setUp);
    await screen.findByText("Step 3 of 3");
    expect(app.client.calls.some((call) => call.path === "/v1/trips/{id}")).toBe(true);
    expect(await screen.findByRole("button", { name: "Create account" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Create account and / })).toBeNull();
  });

  it("says offer a ride after Offer a ride", async () => {
    mockStored.set("pending-offer", JSON.stringify({ keptAt: new Date().toISOString() }));
    await openAboutYou();
    expect(
      await screen.findByRole("button", { name: "Create account and offer a ride" }),
    ).toBeVisible();
    expect(screen.getByText("Next: offer a ride")).toBeVisible();
  });
});

describe("Only the part of step 3 that is left", () => {
  it("asks only about you when the terms were accepted before", async () => {
    const app = await openAboutYou(undefined, afterLegal);
    expect(screen.queryByRole("checkbox", { name: accept })).toBeNull();
    app.client.answer("/v1/me", (input) => {
      const body = input["body"] as Partial<Me> | undefined;
      return ok(200, { ...afterLegal, ...body, missingSteps: [] });
    });
    await fireEvent.changeText(screen.getByLabelText("First name"), "Anna");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(callsTo(app, "/v1/me/legal-acceptances")).toHaveLength(0);
  });

  it("asks only for the terms when they change later (3.5 item 5)", async () => {
    const app = await renderApp("/", { me: { ...completeMe, missingSteps: ["legal"] } });
    expect(await screen.findByRole("header", { name: "Our terms have changed" })).toBeVisible();
    expect(screen).toHavePathname("/onboarding/terms");
    expect(screen.queryByLabelText("First name")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "I am 18 or older" })).toBeNull();
    app.client.answer("/v1/me/legal-acceptances", () => ok(200, completeMe));
    await fireEvent.press(screen.getByRole("checkbox", { name: accept }));
    await fireEvent.press(screen.getByRole("button", { name: "Accept and continue" }));
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(callsTo(app, "/v1/me/legal-acceptances")[0]?.input["body"]).toEqual({
      documents: [
        { type: "terms", version: 1 },
        { type: "community-rules", version: 1 },
      ],
      locale: "en",
    });
  });

  it("asks for step 3 before anything else, even when Profile is opened directly", async () => {
    await renderApp("/profile", { me: testMe });
    expect(await screen.findByRole("header", { name: "Last step: about you" })).toBeVisible();
  });
});

describe("On the web, step 3 asks for an email (spec 20, 3.3)", () => {
  const address = "dora@example.com";
  const emailHelp = "We email you about your rides: requests, reminders and how your trip went.";
  const wrongEmail = "Enter an email address, such as anna@example.com.";

  beforeEach(() => {
    mockOnTheWeb = true;
  });

  /** Fills in step 3 but the email, and answers the terms and the profile. */
  async function fillIn(app: Awaited<ReturnType<typeof renderApp>>, saves: unknown[] = []) {
    app.client.answer("/v1/me/legal-acceptances", () => ok(200, afterLegal));
    app.client.answer("/v1/me", (input) => {
      const body = input["body"] as Partial<Me> | undefined;
      if (body === undefined) return ok(200, testMe);
      return saves.shift() ?? ok(200, { ...afterLegal, ...body, missingSteps: [] });
    });
    await fireEvent.changeText(screen.getByLabelText("First name"), "Dóra");
    await tickBoth();
  }

  const create = () => fireEvent.press(screen.getByRole("button", { name: "Create account" }));

  it("asks for it after the first name, saying why", async () => {
    await openAboutYou();
    expect(screen.getByLabelText("Email")).toBeVisible();
    expect(screen.getByText(emailHelp)).toBeVisible();
  });

  it("refuses an empty or wrong address, and sends nothing", async () => {
    const app = await openAboutYou();
    await fillIn(app);
    await create();
    expect(await screen.findByText(wrongEmail)).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText("Email"), "dora@");
    await create();
    expect(await screen.findByText(wrongEmail)).toBeVisible();
    expect(callsTo(app, "/v1/me/email")).toHaveLength(0);
    expect(callsTo(app, "/v1/me/legal-acceptances")).toHaveLength(0);
    expect(callsTo(app, "/v1/me", "patch")).toHaveLength(0);
    expect(screen).toHavePathname("/onboarding/about-you");
  });

  it("sends the link before saving, and only once when saving fails", async () => {
    const app = await openAboutYou();
    app.client.answer("/v1/me/email", () => ok(200, { ...testMe, pendingEmail: address }));
    await fillIn(app, [failure(0, "network_error")]);
    await fireEvent.changeText(screen.getByLabelText("Email"), ` ${address} `);
    await create();
    expect(
      await screen.findByText("We couldn't reach PuffinRide. Check your connection and try again."),
    ).toBeVisible();
    // The answers stay, the email too.
    expect(screen.getByLabelText("Email")).toHaveDisplayValue(` ${address} `);
    await create();
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    const emails = callsTo(app, "/v1/me/email");
    expect(emails).toHaveLength(1);
    expect(emails[0]?.input["body"]).toEqual({ email: address });
    const sent = app.client.calls.findIndex((c) => c.path === "/v1/me/email");
    const legal = app.client.calls.findIndex((c) => c.path === "/v1/me/legal-acceptances");
    expect(sent).toBeLessThan(legal);
    expect(callsTo(app, "/v1/me", "patch")).toHaveLength(2);
  });

  it("sends it again to an address changed after it was sent", async () => {
    const app = await openAboutYou();
    app.client.answer("/v1/me/email", (input) => {
      const { email } = input["body"] as { email: string };
      return ok(200, { ...testMe, pendingEmail: email });
    });
    await fillIn(app, [failure(0, "network_error")]);
    await fireEvent.changeText(screen.getByLabelText("Email"), "dora@exmaple.com");
    await create();
    await screen.findByText("We couldn't reach PuffinRide. Check your connection and try again.");
    await fireEvent.changeText(screen.getByLabelText("Email"), address);
    await create();
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(callsTo(app, "/v1/me/email").map((call) => call.input["body"])).toEqual([
      { email: "dora@exmaple.com" },
      { email: address },
    ]);
  });

  it("keeps the answers when the link cannot be sent, and saves nothing", async () => {
    const app = await openAboutYou();
    app.client.answer("/v1/me/email", () => failure(502, "email_failed"));
    await fillIn(app);
    await fireEvent.changeText(screen.getByLabelText("Email"), address);
    await create();
    expect(
      await screen.findByText("We couldn't send the email. Try again in a minute."),
    ).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveDisplayValue(address);
    expect(screen.getByLabelText("First name")).toHaveDisplayValue("Dóra");
    expect(callsTo(app, "/v1/me/legal-acceptances")).toHaveLength(0);
    expect(callsTo(app, "/v1/me", "patch")).toHaveLength(0);
  });

  it("goes on without it when this server sends no email", async () => {
    const app = await openAboutYou();
    app.client.answer("/v1/me/email", () => failure(503, "email_unavailable"));
    await fillIn(app);
    await fireEvent.changeText(screen.getByLabelText("Email"), address);
    await create();
    expect(await screen.findByRole("tab", { name: "Find", selected: true })).toBeVisible();
    expect(callsTo(app, "/v1/me/email")).toHaveLength(1);
  });

  it("does not ask with a verified email or a link waiting", async () => {
    await openAboutYou(undefined, { ...testMe, email: address });
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByText(emailHelp)).toBeNull();
  });

  it("does not ask while a link waits", async () => {
    await openAboutYou(undefined, { ...testMe, pendingEmail: address });
    expect(screen.queryByLabelText("Email")).toBeNull();
  });
});

describe("On phones, step 3 does not ask for an email (spec 20, 3.3 item 4)", () => {
  it("has no email field", async () => {
    await openAboutYou();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });
});
