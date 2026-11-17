import { fireEvent, screen } from "expo-router/testing-library";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { bsi, details } from "@/testing/meeting-points";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

const issuesPath = "/v1/meeting-points/{id}/issues";

function pointApi(client: FakeClient, answer = () => ok(204)) {
  client.answer("/v1/meeting-points/{id}", () => ok(200, details(bsi)));
  client.answer(issuesPath, answer);
}

/** What was sent, without the access token. */
const sent = (client: FakeClient) =>
  client.calls
    .filter((call) => call.path === issuesPath)
    .map((call) => ({ params: call.input["params"], body: call.input["body"] }));

async function openProblem(answer?: () => unknown) {
  const app = await renderApp(`/meeting-points/${bsi.id}`, {
    me: completeMe,
    setUp: (client) => {
      pointApi(client, answer as () => ReturnType<typeof ok>);
    },
  });
  await fireEvent.press(await screen.findByRole("button", { name: "Something wrong here?" }));
  expect(await screen.findByRole("header", { name: "What's wrong here?" })).toBeVisible();
  return app;
}

describe("Something wrong here? (spec 2, 3.5)", () => {
  it("asks what is wrong, sends it, and thanks", async () => {
    const { client } = await openProblem();
    expect(screen).toHavePathname(`/meeting-points/${bsi.id}/problem`);
    expect(screen.getByText("BSÍ bus terminal")).toBeVisible();

    // Nothing is sent before choosing what is wrong.
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Choose what is wrong.")).toBeVisible();
    expect(sent(client)).toEqual([]);

    await fireEvent.press(screen.getByRole("radio", { name: "It's not safe to wait here" }));
    await fireEvent.changeText(
      screen.getByLabelText("Tell us more (optional)"),
      "  No light after dark.  ",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByRole("header", { name: "Thank you. We'll check this meeting point." }),
    ).toBeVisible();
    expect(sent(client)).toEqual([
      { params: { id: bsi.id }, body: { reason: "unsafe", note: "No light after dark." } },
    ]);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(screen).toHavePathname(`/meeting-points/${bsi.id}`);
  });

  it("offers each reason of spec 2, 3.5", async () => {
    await openProblem();
    expect(
      screen.getAllByRole("radio").map((radio) => radio.props["accessibilityLabel"] as unknown),
    ).toEqual([
      "It's closed or has moved",
      "It's not safe to wait here",
      "It's in the wrong place on the map",
      "Some of the details are wrong",
      "Something else",
    ]);
  });

  it("asks for a shorter note over 300 characters, and sends nothing", async () => {
    const { client } = await openProblem();
    await fireEvent.press(screen.getByRole("radio", { name: "Something else" }));
    await fireEvent.changeText(screen.getByLabelText("Tell us more (optional)"), "a".repeat(301));
    expect(screen.getByText("Shorten it to 300 characters or fewer.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(sent(client)).toEqual([]);
  });

  it.each([
    ["too_many_reports", 429, "You've sent 5 reports in the last 24 hours. Try again later."],
    ["not_found", 404, "This meeting point is no longer in use."],
    ["internal_error", 500, "Something went wrong on our side. Try again."],
  ] as const)("says so when the server answers %s", async (code, status, text) => {
    await openProblem(() => failure(status, code));
    await fireEvent.press(screen.getByRole("radio", { name: "Something else" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(text)).toBeVisible();
  });

  it("asks to sign in first, signed out", async () => {
    await renderApp(`/meeting-points/${bsi.id}`, {
      setUp: (client) => {
        pointApi(client);
      },
    });
    await fireEvent.press(await screen.findByRole("button", { name: "Something wrong here?" }));
    expect(
      await screen.findByRole("header", { name: "Sign in to tell us what's wrong" }),
    ).toBeVisible();
    expect(screen.queryByRole("radio")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(screen).toHavePathname("/sign-in");
  });
});
