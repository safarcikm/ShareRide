import { fireEvent, screen, within } from "expo-router/testing-library";
import type { DeletionCheck, Me } from "@shareride/contracts";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { filledButtons } from "@/testing/buttons";
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

// "Delete my account" (spec 11, 3.4; plan 4.5 and 4.9, PR 8): what is still
// open, each opened where it is cancelled under the normal rules; what
// happens, confirmed with a fresh code; then 7 days in which signing in
// shows only when the account goes, with "Keep my account".

const tripId = "0190a1d6-0000-7000-8000-00000000a001";
const bookingId = "0190a1d6-0000-7000-8000-00000000b001";
const requestId = "0190a1d6-0000-7000-8000-00000000b002";

const places = (from: string, to: string) => ({
  from: { is: from, en: from },
  to: { is: to, en: to },
});

const allowed: DeletionCheck = { allowed: true, mustSettle: [], canCancel: [] };

const blocked: DeletionCheck = {
  allowed: false,
  mustSettle: [
    {
      kind: "trip_under_way",
      tripId: "0190a1d6-0000-7000-8000-00000000a002",
      completesAt: "2026-11-13T15:30:00.000Z",
      places: places("Mjódd", "N1 Selfoss"),
    },
    { kind: "dispute", id: "0190a1d6-0000-7000-8000-00000000d001" },
  ],
  canCancel: [
    {
      kind: "trip",
      id: tripId,
      departsAt: "2026-11-14T09:00:00.000Z",
      places: places("BSÍ", "Hof, Akureyri"),
    },
    {
      kind: "booking",
      id: bookingId,
      tripId: "0190a1d6-0000-7000-8000-00000000a003",
      boardsAt: "2026-11-15T08:00:00.000Z",
      places: places("Mjódd", "Hella"),
    },
    {
      kind: "request",
      id: requestId,
      tripId: "0190a1d6-0000-7000-8000-00000000a004",
      boardsAt: "2026-11-16T17:30:00.000Z",
      places: places("Borgarnes", "Reykjavík"),
    },
  ],
};

const deleteAfter = "2026-11-20T12:00:00.000Z";
const waiting: Me = { ...completeMe, deletionScheduledFor: deleteAfter };

interface Api {
  /** What GET /v1/me/deletion-check answers, in turn; the last one stays. */
  readonly checks?: readonly DeletionCheck[];
  /** What POST /v1/me/delete answers. */
  readonly remove?: (code: string) => unknown;
}

async function openDeleteScreen({
  checks = [allowed],
  remove = () => ok(202, { deleteAfter }),
}: Api = {}) {
  let looked = 0;
  // Through Profile, which stays underneath and asks to sign in once signed out.
  const app = await renderApp("/profile", {
    me: completeMe,
    setUp: (client: FakeClient) => {
      client.answer("/v1/me/deletion-check", () =>
        ok(200, checks[Math.min(looked++, checks.length - 1)]),
      );
      client.answer("/v1/me/confirm-code", () =>
        ok(202, { resendAfterSeconds: 30, channel: "sms", sentTo: "00" }),
      );
      client.answer("/v1/me/delete", (input) => {
        const { code } = input["body"] as { code: string };
        return remove(code);
      });
      // The screens each open item leads to, which these tests do not use.
      for (const path of [
        "/v1/me/trips/{id}",
        "/v1/me/trips/{id}/bookings",
        "/v1/bookings/{id}",
        "/v1/bookings/{id}/cancellation-preview",
        // Cancelling a ride shows it as its ticket, with the car (spec 31, 3.19).
        "/v1/me/vehicles",
      ]) {
        client.answer(path, () => failure(503, "unavailable"));
      }
    },
  });
  await fireEvent.press(await screen.findByRole("link", { name: "Privacy and your data" }));
  await fireEvent.press(await screen.findByRole("link", { name: "Delete my account" }));
  expect(await screen.findByRole("header", { name: "Delete my account" })).toBeVisible();
  return app;
}

const callsTo = (app: { client: FakeClient }, path: string) =>
  app.client.calls.filter((call) => call.path === path);

describe("Delete my account (spec 11, 3.4)", () => {
  it("is on the Privacy page", async () => {
    await renderApp("/settings/privacy", {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/me/deletion-check", () => ok(200, allowed));
      },
    });
    await fireEvent.press(await screen.findByRole("link", { name: "Delete my account" }));
    expect(await screen.findByRole("header", { name: "Delete my account" })).toBeVisible();
    expect(screen).toHavePathname("/settings/privacy/delete");
  });

  it("is the Privacy page's last row, and the red one (spec 31, R31.3)", async () => {
    await renderApp("/settings/privacy", { me: completeMe });
    const rows = within(await screen.findByTestId("action-rows"));
    expect(
      rows
        .getAllByTestId("row-words")
        .map((words) => String(within(words).getByText(/./).props.children)),
    ).toEqual(["Download my data", "Ask about my data", "Privacy Policy", "Delete my account"]);
    const hidden = { includeHiddenElements: true };
    expect(rows.getAllByTestId("row-icon", hidden)).toHaveLength(4);
    const last = rows.getByRole("link", { name: "Delete my account" });
    expect(within(last).getByText("Delete my account")).toHaveStyle({
      color: colors.light.error,
    });
    expect(within(last).queryByTestId("row-chevron", hidden)).toBeNull();
    expect(rows.getAllByTestId("row-chevron", hidden)).toHaveLength(3);
  });

  it("lists what is still open before it can be deleted, and nothing to delete with", async () => {
    await openDeleteScreen({ checks: [blocked] });
    expect(
      await screen.findByText("Before you can delete your account, these need to be settled:"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "BSÍ – Hof, Akureyri, Cancel your ride: Saturday 14 November at 09:00",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Mjódd – Hella, Cancel your booking: Sunday 15 November at 08:00",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Borgarnes – Reykjavík, Withdraw your request: Monday 16 November at 17:30",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Mjódd – N1 Selfoss is on its way. You can delete your account once it has ended, after Friday 13 November at 15:30.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "A report about a ride is waiting for an answer or for PuffinRide's decision.",
      ),
    ).toBeVisible();
    // What happens is said first; the button comes once nothing is open.
    expect(
      screen.getByText(
        "Your profile, photos, messages and contact details will be erased. Payment records are kept as the law requires, and reviews you wrote stay as written by a former member.",
      ),
    ).toBeVisible();
    expect(screen.queryAllByRole("button", { name: "Delete my account" })).toHaveLength(0);
  });

  it.each([
    ["Cancel your ride", `/drive/trips/${tripId}/cancel`],
    ["Cancel your booking", `/bookings/${bookingId}/cancel`],
    ["Withdraw your request", `/bookings/${requestId}`],
  ])("opens %s where it is done under the normal rules", async (action, path) => {
    await openDeleteScreen({ checks: [blocked] });
    await fireEvent.press(await screen.findByRole("button", { name: new RegExp(`, ${action}: `) }));
    expect(screen).toHavePathname(path);
  });

  it("looks again on coming back, and offers deleting once nothing is open", async () => {
    const app = await openDeleteScreen({ checks: [blocked, allowed] });
    await fireEvent.press(await screen.findByRole("button", { name: /, Cancel your booking: / }));
    expect(screen).toHavePathname(`/bookings/${bookingId}/cancel`);
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("button", { name: "Delete my account" })).toBeVisible();
    expect(
      screen.queryByText("Before you can delete your account, these need to be settled:"),
    ).toBeNull();
    expect(callsTo(app, "/v1/me/deletion-check")).toHaveLength(2);
  });

  it("deletes with a fresh code, signs out and says when the data goes", async () => {
    const app = await openDeleteScreen();
    expect(
      screen.getByText(
        "You'll be signed out on every device at once, and nobody can see your profile or rides any more. Your data is erased 7 days later. Until then, you can sign in and keep your account.",
      ),
    ).toBeVisible();
    expect(callsTo(app, "/v1/me/confirm-code")).toEqual([]);
    // It takes the account away: the one main button is red (decision 17).
    const red = { backgroundColor: colors.light.error };
    const start = screen.getByRole("button", { name: "Delete my account" });
    expect(within(start).getByTestId("button-face")).toHaveStyle(red);
    expect(filledButtons()).toBe(1);

    await fireEvent.press(start);
    expect(
      await screen.findByText("We sent a code by text message to your number ending in 00."),
    ).toBeVisible();
    // So is the button that deletes with the code.
    const confirm = await screen.findByRole("button", { name: "Delete my account" });
    expect(within(confirm).getByTestId("button-face")).toHaveStyle(red);
    expect(filledButtons()).toBe(1);
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");

    expect(
      await screen.findByRole("header", { name: "Your account will be deleted on 20 November." }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "You're signed out on every device. If you change your mind, sign in before then and keep your account.",
      ),
    ).toBeVisible();
    expect(callsTo(app, "/v1/me/delete").map((call) => call.input["body"])).toEqual([
      { code: "123456" },
    ]);
    // Every session ended on the API's side; this device forgets its own.
    expect(app.store.value).toBeNull();
    // What happened is the head, at the left, with nothing to go back to.
    const head = within(screen.getByTestId("screen-head"));
    expect(
      head.getByRole("header", { name: "Your account will be deleted on 20 November." }),
    ).not.toHaveStyle({ textAlign: "center" });
    expect(head.getByText(/^You're signed out on every device\./)).not.toHaveStyle({
      textAlign: "center",
    });
    expect(head.queryByRole("button", { name: "Back" })).toBeNull();
    expect(filledButtons()).toBe(1);

    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByRole("tab", { name: "Find" })).toBeVisible();
    expect(screen).toHavePathname("/");
  });

  it("says when something must be settled first after all, and shows it", async () => {
    const opened: DeletionCheck = { ...blocked, mustSettle: [], canCancel: blocked.canCancel };
    await openDeleteScreen({
      checks: [allowed, opened],
      remove: () => failure(409, "deletion_blocked"),
    });
    await fireEvent.press(screen.getByRole("button", { name: "Delete my account" }));
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
    expect(
      await screen.findByText(
        "Something new needs to be settled before you can delete your account.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Before you can delete your account, these need to be settled:"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /, Cancel your booking: / })).toBeVisible();
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });
});

describe("While the deletion waits (spec 11, 3.4.4)", () => {
  async function openApp(url = "/", keep: () => unknown = () => ok(200, completeMe)) {
    const app = await renderApp(url, {
      me: waiting,
      setUp: (client) => {
        client.answer("/v1/me/delete/cancel", keep);
        client.answer("/v1/auth/sign-out", () => ok(204));
      },
    });
    expect(
      await screen.findByRole("header", { name: "Your account will be deleted on 20 November." }),
    ).toBeVisible();
    return app;
  }

  it("shows only when the account goes, with Keep my account and Sign out", async () => {
    await openApp();
    expect(screen).toHavePathname("/account/deletion");
    expect(
      screen.getByText(
        "Nobody can see your profile or rides, book with you or message you. Keep your account to use PuffinRide again, as it was.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Keep my account" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Find" })).toBeNull();
  });

  it("says so at the left, with nothing to go back to (spec 31, 3.19)", async () => {
    await openApp();
    const head = within(screen.getByTestId("screen-head"));
    expect(
      head.getByRole("header", { name: "Your account will be deleted on 20 November." }),
    ).not.toHaveStyle({ textAlign: "center" });
    expect(head.getByText(/^Nobody can see your profile or rides/)).not.toHaveStyle({
      textAlign: "center",
    });
    expect(head.queryByRole("button", { name: "Back" })).toBeNull();
    // Keeping the account is the one main button; Sign out is beside it.
    expect(filledButtons()).toBe(1);
  });

  it.each([
    "/drive/trips/new",
    "/settings",
    "/settings/privacy/delete",
    "/settings/privacy/ask",
    "/settings/language",
    "/settings/notifications",
    "/settings/blocked",
    "/settings/reports",
    `/messages/${bookingId}`,
  ])("is what %s opens meanwhile", async (url) => {
    await openApp(url);
    expect(screen).toHavePathname("/account/deletion");
  });

  it("does one thing at a time: no signing out while keeping", async () => {
    let answer: (value: unknown) => void = () => undefined;
    const app = await openApp("/", () => new Promise((resolve) => (answer = resolve)));
    await fireEvent.press(screen.getByRole("button", { name: "Keep my account" }));
    expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(callsTo(app, "/v1/auth/sign-out")).toEqual([]);
    answer(ok(200, completeMe));
    expect(await screen.findByRole("tab", { name: "Find" })).toBeVisible();
  });

  it("keeps the account, and the app is as it was", async () => {
    const app = await openApp();
    await fireEvent.press(screen.getByRole("button", { name: "Keep my account" }));
    expect(await screen.findByRole("tab", { name: "Find" })).toBeVisible();
    expect(callsTo(app, "/v1/me/delete/cancel")).toHaveLength(1);
    expect(screen.queryByText("Your account will be deleted on 20 November.")).toBeNull();
  });

  it("signs out", async () => {
    const app = await openApp();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("tab", { name: "Find" })).toBeVisible();
    expect(app.store.value).toBeNull();
    expect(callsTo(app, "/v1/auth/sign-out").map((call) => call.input["body"])).toEqual([
      { all: false },
    ]);
  });
});
