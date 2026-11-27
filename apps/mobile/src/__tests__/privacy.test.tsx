import { act, fireEvent, screen, within } from "expo-router/testing-library";
import { AccessibilityInfo } from "react-native";
import type { DataExport, Me } from "@shareride/contracts";
import { readPreference } from "@/lib/preferences";
import { notificationPath } from "@/notifications/paths";
import { openDownload } from "@/privacy/open-download";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { filledButtons, inBar, inPage } from "@/testing/buttons";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/privacy/open-download", () => ({ openDownload: jest.fn(() => Promise.resolve()) }));

// Privacy and your data, from Profile, and "Download my data" (spec 11, 3.2; plan 4.9, PR 5):
// ask with a fresh code, wait while the file is made, and download it.

const none: DataExport = { state: "none" };
const preparing: DataExport = {
  state: "preparing",
  askedAt: "2026-11-16T22:00:00.000Z",
  nextAllowedAt: "2026-11-17T22:00:00.000Z",
};
const ready: DataExport = {
  state: "ready",
  askedAt: "2026-11-16T22:00:00.000Z",
  readyAt: "2026-11-16T22:05:00.000Z",
  expiresAt: "2026-11-23T22:05:00.000Z",
  byteSize: 12_345,
  nextAllowedAt: "2026-11-17T22:00:00.000Z",
};

interface Api {
  /** What GET /v1/me/export answers, in turn (null: a failed look); the last one stays. */
  readonly latest?: readonly (DataExport | null)[];
  readonly ask?: (code: string) => unknown;
  /** What POST /v1/me/confirm-code answers. */
  readonly sendCode?: () => unknown;
  /** What POST /v1/me/export/link answers. */
  readonly link?: () => unknown;
  readonly me?: Me;
}

const linkToFile = () =>
  ok(200, { path: "/v1/exports/sr_dx_once", expiresAt: "2026-11-16T22:07:00.000Z" });

async function openDownloadScreen({
  latest = [none],
  ask,
  sendCode = () => ok(202, { resendAfterSeconds: 30, channel: "sms", sentTo: "00" }),
  link = linkToFile,
  me = completeMe,
}: Api = {}) {
  let looked = 0;
  const app = await renderApp("/settings/privacy/download", {
    me,
    setUp: (client: FakeClient) => {
      client.answer(
        "/v1/me/export",
        () => {
          const found = latest[Math.min(looked++, latest.length - 1)];
          return found === null ? failure(503, "unavailable") : ok(200, found);
        },
        "get",
      );
      client.answer(
        "/v1/me/export",
        (input) => {
          const { code } = input["body"] as { code: string };
          return ask === undefined ? ok(202, preparing) : ask(code);
        },
        "post",
      );
      client.answer("/v1/me/confirm-code", sendCode);
      client.answer("/v1/me/export/link", link);
    },
  });
  expect(await screen.findByRole("header", { name: "Download my data" })).toBeVisible();
  return app;
}

const callsTo = (app: { client: FakeClient }, path: string) =>
  app.client.calls.filter((call) => call.path === path);

async function typeCode(code: string) {
  await fireEvent.changeText(await screen.findByLabelText("6-digit code"), code);
}

describe("Privacy (spec 11)", () => {
  it("opens from Profile, with Download my data and the privacy policy", async () => {
    await renderApp("/profile", {
      me: completeMe,
      setUp: (client) => {
        client.answer("/v1/me/export", () => ok(200, none), "get");
      },
    });
    await fireEvent.press(await screen.findByRole("link", { name: "Privacy and your data" }));
    expect(await screen.findByRole("header", { name: "Privacy" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
    await fireEvent.press(screen.getByRole("link", { name: "Download my data" }));
    expect(await screen.findByRole("header", { name: "Download my data" })).toBeVisible();
  });

  it("is what the ready notice opens", () => {
    expect(notificationPath({ path: "/settings/privacy/download" })).toBe(
      "/settings/privacy/download",
    );
    expect(notificationPath({ path: "/settings/privacy/elsewhere" })).toBeNull();
  });
});

describe("Download my data (spec 11, 3.2)", () => {
  beforeEach(() => {
    jest.mocked(openDownload).mockClear();
  });

  it("asks with a fresh code sent to the person's own number, then says the file is coming", async () => {
    const app = await openDownloadScreen();
    expect(
      screen.getByText(
        "You get a ZIP file with what PuffinRide keeps about you: your account, rides, bookings, payments, messages and notifications. Other people appear by first name only. You can ask for one file a day.",
      ),
    ).toBeVisible();
    expect(callsTo(app, "/v1/me/confirm-code")).toEqual([]);

    await fireEvent.press(screen.getByRole("button", { name: "Make my file" }));
    expect(
      await screen.findByText("We sent a code by text message to your number ending in 00."),
    ).toBeVisible();
    expect(callsTo(app, "/v1/me/confirm-code")).toHaveLength(1);
    await typeCode("123456");

    expect(
      await screen.findByText("We're preparing your file. We'll let you know when it's ready."),
    ).toBeVisible();
    expect(callsTo(app, "/v1/me/export").flatMap((call) => call.input["body"] ?? [])).toEqual([
      { code: "123456" },
    ]);
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });

  it("has asking, and then the code's button, as the one main button in the bar, with Cancel a row (spec 31, R31.1)", async () => {
    await openDownloadScreen();
    const make = inBar().getByRole("button", { name: "Make my file" });
    expect(make).toHaveStyle({ minHeight: 56 });
    await fireEvent.press(make);
    await screen.findByLabelText("6-digit code");
    // The button that asks with the code took its place.
    expect(inBar().getByRole("button", { name: "Make my file" })).toHaveStyle({ minHeight: 56 });
    expect(filledButtons()).toBe(1);
    const cancel = within(screen.getByTestId("action-rows")).getByRole("button", {
      name: "Cancel",
    });
    expect(within(cancel).getByTestId("row-icon", { includeHiddenElements: true })).toBeTruthy();
    // What the code's field says stays under the field.
    await typeCode("12345");
    await fireEvent.press(inBar().getByRole("button", { name: "Make my file" }));
    expect(inPage().getByText("Enter all 6 digits of the code.")).toBeVisible();
  });

  it("says when the code went to the account's email instead (spec 26, 3.6)", async () => {
    await openDownloadScreen({
      sendCode: () =>
        ok(202, { resendAfterSeconds: 30, channel: "email", sentTo: "an•••@example.com" }),
    });
    await fireEvent.press(screen.getByRole("button", { name: "Make my file" }));
    expect(await screen.findByText("We emailed a code to an•••@example.com.")).toBeVisible();
  });

  it("says a wrong code, keeps the screen, and takes the right one", async () => {
    const app = await openDownloadScreen({
      ask: (code) =>
        code === "123456" ? ok(202, preparing) : failure(400, "code_invalid", { attemptsLeft: 4 }),
    });
    await fireEvent.press(screen.getByRole("button", { name: "Make my file" }));
    await typeCode("000000");
    expect(await screen.findByText("That code isn't right. 4 tries left.")).toBeVisible();
    expect(screen.getByLabelText("6-digit code")).toHaveDisplayValue("");
    await typeCode("123456");
    expect(
      await screen.findByText("We're preparing your file. We'll let you know when it's ready."),
    ).toBeVisible();
    expect(callsTo(app, "/v1/me/confirm-code")).toHaveLength(1);
  });

  it("says when another file can be asked for, one a day", async () => {
    await openDownloadScreen({
      ask: () => failure(429, "export_too_soon", { retryAfterSeconds: 23 * 3600 }),
    });
    await fireEvent.press(screen.getByRole("button", { name: "Make my file" }));
    await typeCode("123456");
    expect(
      await screen.findByText("You can ask for one file a day. Try again in 23 hours."),
    ).toBeVisible();
  });

  it("sends a new code after 30 seconds", async () => {
    jest.useFakeTimers();
    try {
      const app = await openDownloadScreen();
      await fireEvent.press(screen.getByRole("button", { name: "Make my file" }));
      expect(await screen.findByText("You can ask for a new code in 30 seconds.")).toBeVisible();
      expect(screen.queryByRole("button", { name: "Send a new code" })).toBeNull();

      await act(() => jest.advanceTimersByTimeAsync(30_000));
      // A row over Cancel, in the card of rows under the code.
      const rows = within(screen.getByTestId("action-rows"));
      expect(
        rows.getAllByRole("button").map((row) => String(row.props.accessibilityLabel)),
      ).toEqual(["Send a new code", "Cancel"]);
      await fireEvent.press(screen.getByRole("button", { name: "Send a new code" }));
      expect(await screen.findByText("We sent a new code.")).toBeVisible();
      expect(callsTo(app, "/v1/me/confirm-code")).toHaveLength(2);
      expect(screen.getByText("You can ask for a new code in 30 seconds.")).toBeVisible();
    } finally {
      jest.useRealTimers();
    }
  });

  it("uses the code already sent when the form is opened again within 30 seconds", async () => {
    const app = await openDownloadScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Make my file" }));
    await screen.findByLabelText("6-digit code");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    await fireEvent.press(screen.getByRole("button", { name: "Make my file" }));
    expect(
      await screen.findByText("We sent a code by text message to your number ending in 00."),
    ).toBeVisible();
    expect(screen.getByLabelText("6-digit code")).toBeVisible();
    expect(callsTo(app, "/v1/me/confirm-code")).toHaveLength(1);
    await typeCode("123456");
    expect(
      await screen.findByText("We're preparing your file. We'll let you know when it's ready."),
    ).toBeVisible();
  });

  it("says why no code was sent, and still takes a code the person has", async () => {
    await openDownloadScreen({
      sendCode: () => failure(429, "rate_limited", { retryAfterSeconds: 20 }),
    });
    await fireEvent.press(screen.getByRole("button", { name: "Make my file" }));
    expect(
      await screen.findByText("You've asked for a lot of codes. Try again in 20 seconds."),
    ).toBeVisible();
    expect(screen.queryByText("Sending a code to your number…")).toBeNull();
    expect(screen.getByText("You can ask for a new code in 20 seconds.")).toBeVisible();
    await typeCode("123456");
    expect(
      await screen.findByText("We're preparing your file. We'll let you know when it's ready."),
    ).toBeVisible();
  });

  it("can be cancelled before the code is entered", async () => {
    const app = await openDownloadScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Make my file" }));
    await screen.findByLabelText("6-digit code");
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
    expect(screen.getByRole("button", { name: "Make my file" })).toBeVisible();
    expect(callsTo(app, "/v1/me/export").filter((call) => call.input["body"])).toEqual([]);
  });

  it("looks again while the file is being made, through a failed look, and says once it is ready", async () => {
    jest.useFakeTimers();
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    try {
      const app = await openDownloadScreen({ latest: [preparing, null, preparing, ready] });
      const waiting = "We're preparing your file. We'll let you know when it's ready.";
      expect(screen.getByText(waiting)).toBeVisible();

      // A look that fails keeps the screen waiting, and the next one goes.
      await act(() => jest.advanceTimersByTimeAsync(5_000));
      expect(screen.getByText(waiting)).toBeVisible();
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
      await act(() => jest.advanceTimersByTimeAsync(5_000));
      await act(() => jest.advanceTimersByTimeAsync(5_000));
      const readyText = "Your file is ready. You can download it until 23 November at 22:05.";
      expect(await screen.findByText(readyText)).toBeVisible();
      expect(announce).toHaveBeenCalledWith(readyText);

      // Ready: no more looks.
      const looks = callsTo(app, "/v1/me/export").length;
      await act(() => jest.advanceTimersByTimeAsync(15_000));
      expect(callsTo(app, "/v1/me/export")).toHaveLength(looks);
    } finally {
      announce.mockRestore();
      jest.useRealTimers();
    }
  });

  it("downloads a ready file through a one-time link", async () => {
    const app = await openDownloadScreen({ latest: [ready] });
    expect(
      screen.getByText("Your file is ready. You can download it until 23 November at 22:05."),
    ).toBeVisible();
    expect(
      screen.getByText("You can ask for another file from 17 November at 22:00."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Make a new file" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Download the file" }));
    await act(() => Promise.resolve());
    expect(callsTo(app, "/v1/me/export/link")).toHaveLength(1);
    expect(openDownload).toHaveBeenCalledWith("http://localhost:3000/v1/exports/sr_dx_once");
  });

  it("says over the button, in the bar, why the file did not open (spec 31, 3.19)", async () => {
    await openDownloadScreen({ latest: [ready], link: () => failure(500, "internal_error") });
    await fireEvent.press(inBar().getByRole("button", { name: "Download the file" }));
    expect(await inBar().findByRole("alert")).toHaveTextContent(
      "Something went wrong on our side. Try again.",
    );
    expect(inPage().queryByRole("alert")).toBeNull();
  });

  it("shows what became of a file that can no longer be downloaded", async () => {
    await openDownloadScreen({
      latest: [ready, { ...ready, state: "expired", byteSize: null }],
      link: () => failure(409, "export_not_ready"),
    });
    await fireEvent.press(screen.getByRole("button", { name: "Download the file" }));
    expect(
      await screen.findByText("Your last file was deleted on 23 November at 22:05."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Download the file" })).toBeNull();
    expect(screen.queryByText("The file isn't ready to download.")).toBeNull();
    expect(openDownload).not.toHaveBeenCalled();
  });

  it("offers a new file in place of a ready one after a day", async () => {
    await openDownloadScreen({ latest: [{ ...ready, nextAllowedAt: null }] });
    expect(screen.getByRole("button", { name: "Download the file" })).toBeVisible();
    expect(screen.getByText("A new file replaces this one.")).toBeVisible();
    // Downloading is the main button, in the bar; a new file is a row.
    expect(inBar().getByRole("button", { name: "Download the file" })).toHaveStyle({
      minHeight: 56,
    });
    const makeNew = within(screen.getByTestId("action-rows")).getByRole("button", {
      name: "Make a new file",
    });
    expect(within(makeNew).getByTestId("row-icon", { includeHiddenElements: true })).toBeTruthy();
    expect(filledButtons()).toBe(1);
    await fireEvent.press(screen.getByRole("button", { name: "Make a new file" }));
    expect(await screen.findByLabelText("6-digit code")).toBeVisible();
    // Asking for the new one is the step now: its button has the bar, and
    // there are never two filled buttons (R31.1).
    expect(inBar().getByRole("button", { name: "Make my file" })).toHaveStyle({ minHeight: 56 });
    expect(screen.queryByRole("button", { name: "Download the file" })).toBeNull();
    expect(filledButtons()).toBe(1);
    // Leaving the code brings the file's own button back.
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(inBar().getByRole("button", { name: "Download the file" })).toBeVisible();
  });

  it("says when the last file expired, and asks again", async () => {
    await openDownloadScreen({
      latest: [{ ...ready, state: "expired", byteSize: null, nextAllowedAt: null }],
    });
    expect(screen.getByText("Your last file was deleted on 23 November at 22:05.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Make my file" })).toBeVisible();
  });

  it("says when the last file could not be made, and asks again", async () => {
    await openDownloadScreen({
      latest: [{ state: "failed", askedAt: preparing.askedAt, nextAllowedAt: null }],
    });
    expect(screen.getByText("We couldn't make your file. Please ask for it again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Make my file" })).toBeVisible();
  });

  it("is in Icelandic when the app is", async () => {
    jest
      .mocked(readPreference)
      .mockImplementation((key) => Promise.resolve(key === "language" ? "is" : null));
    try {
      await renderApp("/settings/privacy/download", {
        me: completeMe,
        setUp: (client) => {
          client.answer("/v1/me/export", () => ok(200, ready), "get");
        },
      });
      expect(await screen.findByRole("header", { name: "Sækja gögnin mín" })).toBeVisible();
      expect(
        await screen.findByText(
          "Skráin er tilbúin. Þú getur sótt hana til 23. nóvember kl. 22:05.",
        ),
      ).toBeVisible();
      expect(
        screen.getByText("Þú getur beðið um aðra skrá frá 17. nóvember kl. 22:00."),
      ).toBeVisible();
    } finally {
      jest.mocked(readPreference).mockImplementation(() => Promise.resolve(null));
    }
  });
});
