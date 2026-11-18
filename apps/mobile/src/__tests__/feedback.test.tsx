import { act, fireEvent, screen, waitFor } from "expo-router/testing-library";
import { completeMe, renderApp } from "@/testing/app";
import type * as TestApp from "@/testing/app";
import { failure, ok, type FakeClient } from "@/testing/fake-client";
import { listening, shake } from "@/testing/sensors";
import { captureScreen, screenshotIs } from "@/testing/view-shot";
import { readPreference, writePreference } from "@/lib/preferences";

jest.mock("@/auth/api", () => jest.requireActual<typeof TestApp>("@/testing/app").mockApiModule);
jest.mock("@/auth/token-store", () => {
  return jest.requireActual<typeof TestApp>("@/testing/app").mockTokenStoreModule;
});
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-GB" }] }));
jest.mock("@/lib/preferences", () => ({
  readPreference: jest.fn(() => Promise.resolve(null)),
  writePreference: jest.fn(() => Promise.resolve()),
}));

// Send feedback and My feedback (spec 12, 3.3; milestone 11, PR 6). The
// tests run as an iPhone, where a screenshot is taken and a shake opens
// the form.

const mockedReadPreference = readPreference as jest.Mock;
const mockedWritePreference = writePreference as jest.Mock;

const segment = (marker: number, data: readonly number[]) => [
  0xff,
  marker,
  (data.length + 2) >> 8,
  (data.length + 2) & 0xff,
  ...data,
];
const ascii = (text: string) => Array.from(text, (letter) => letter.charCodeAt(0));

/** A JPEG as a phone writes it, with or without a segment that says how it was taken. */
function jpeg(extra: readonly number[] = []) {
  return Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...extra,
    ...segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]),
    ...segment(0xc0, [8, 844 >> 8, 844 & 0xff, 390 >> 8, 390 & 0xff, 1, 1, 0x11, 0]),
    ...segment(0xc4, [0, 1, ...Array.from({ length: 15 }, () => 0), 0]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    0x12,
    0x34,
    0xff,
    0xd9,
  ]);
}

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const plain = base64(jpeg());
const withExif = base64(jpeg(segment(0xe1, ascii("Exif\0\0taken at home"))));

const received = {
  id: "0190a1d6-0000-7000-8000-0000000000f1",
  kind: "problem",
  message: "The map does not move.",
  hasScreenshot: true,
  reply: null,
  repliedAt: null,
  createdAt: "2026-11-17T10:00:00.000Z",
};

function start(
  url: string,
  {
    answer = () => ok(201, received),
    mine = [],
    beta = false,
  }: {
    readonly answer?: () => unknown;
    readonly mine?: readonly unknown[];
    readonly beta?: boolean;
  } = {},
) {
  return renderApp(url, {
    me: completeMe,
    setUp: (client: FakeClient) => {
      client.answer("/v1/feedback", answer, "post");
      client.answer("/v1/me/feedback", () => ok(200, { feedback: mine }));
      client.answer("/v1/config", () => ok(200, { beta, paused: [] }));
    },
  });
}

const sent = (app: { client: FakeClient }) =>
  app.client.calls.filter((call) => call.path === "/v1/feedback").map((call) => call.input["body"]);

async function openFromProfile() {
  await fireEvent.press(await screen.findByRole("button", { name: "Send feedback" }));
  expect(await screen.findByRole("header", { name: "Send feedback" })).toBeVisible();
}

beforeEach(() => {
  captureScreen.mockClear();
  screenshotIs(plain);
  mockedReadPreference.mockImplementation(() => Promise.resolve(null));
  mockedWritePreference.mockClear();
});

describe("Send feedback (spec 12, 3.3)", () => {
  it("sends the kind and message with the screen's picture and the app's details", async () => {
    screenshotIs(withExif);
    const app = await start("/profile");
    await openFromProfile();

    expect(screen.getByLabelText("Screenshot of the screen you came from")).toBeVisible();
    expect(
      screen.getByText("Check that the screenshot shows nothing you don't want to share."),
    ).toBeVisible();
    await fireEvent.press(screen.getByRole("radio", { name: "Something isn't working" }));
    await fireEvent.changeText(screen.getByLabelText("Your message"), "The map does not move.");
    await fireEvent.press(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByText(/^Thank you\. We got your feedback\./)).toBeVisible();
    expect(sent(app)).toEqual([
      {
        kind: "problem",
        message: "The map does not move.",
        appVersion: "0.1.0",
        platform: "ios",
        osVersion: expect.any(String) as string,
        // The screen they came from, by its route; and the picture without
        // what the phone wrote about how it was taken.
        screen: "/profile",
        screenshot: plain,
      },
    ]);
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("header", { name: "My profile" })).toBeVisible();
  });

  it("sends no picture once the person removed it", async () => {
    const app = await start("/profile");
    await openFromProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Remove the screenshot" }));
    expect(screen.queryByLabelText("Screenshot of the screen you came from")).toBeNull();

    await fireEvent.press(screen.getByRole("radio", { name: "An idea" }));
    await fireEvent.changeText(screen.getByLabelText("Your message"), "Show the weather.");
    await fireEvent.press(screen.getByRole("button", { name: "Send feedback" }));
    await screen.findByText(/^Thank you\./);
    const [body] = sent(app) as Record<string, unknown>[];
    expect(body).toMatchObject({ kind: "idea", message: "Show the weather." });
    expect(Object.keys(body ?? {})).not.toContain("screenshot");
  });

  it("opens without a picture when none could be taken", async () => {
    screenshotIs(new Error("No permission"));
    await start("/profile");
    await openFromProfile();
    expect(screen.queryByLabelText("Screenshot of the screen you came from")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove the screenshot" })).toBeNull();
  });

  it("asks what it is about and for a message before sending", async () => {
    const app = await start("/profile");
    await openFromProfile();
    await fireEvent.press(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByText("Choose what it is about.")).toBeVisible();

    await fireEvent.press(screen.getByRole("radio", { name: "Something else" }));
    await fireEvent.changeText(screen.getByLabelText("Your message"), "   ");
    await fireEvent.press(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByText("Write a message.")).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText("Your message"), "a".repeat(2001));
    await fireEvent.press(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByText("Write at most 2,000 characters.")).toBeVisible();
    expect(sent(app)).toEqual([]);
  });

  it("says when the day's ten are used up, and keeps what was written", async () => {
    await start("/profile", {
      answer: () => failure(429, "rate_limited", { retryAfterSeconds: 2 * 3600 }),
    });
    await openFromProfile();
    await fireEvent.press(screen.getByRole("radio", { name: "An idea" }));
    await fireEvent.changeText(screen.getByLabelText("Your message"), "One more idea.");
    await fireEvent.press(screen.getByRole("button", { name: "Send feedback" }));
    expect(
      await screen.findByText("You've sent a lot of feedback today. Try again in 2 hours."),
    ).toBeVisible();
    expect(screen.getByLabelText("Your message").props["value"]).toBe("One more idea.");
  });

  it("removes a picture the API would not take, so the message can go without it", async () => {
    let tries = 0;
    const app = await start("/profile", {
      answer: () => {
        tries += 1;
        return tries === 1
          ? failure(400, "validation_failed", {
              details: [{ path: "screenshot", issue: "not_jpeg" }],
            })
          : ok(201, received);
      },
    });
    await openFromProfile();
    await fireEvent.press(screen.getByRole("radio", { name: "An idea" }));
    await fireEvent.changeText(screen.getByLabelText("Your message"), "An idea.");
    await fireEvent.press(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByText(/^We couldn't take the screenshot/)).toBeVisible();
    expect(screen.queryByLabelText("Screenshot of the screen you came from")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Send feedback" }));
    await screen.findByText(/^Thank you\./);
    const bodies = sent(app) as Record<string, unknown>[];
    expect(Object.keys(bodies[0] ?? {})).toContain("screenshot");
    expect(Object.keys(bodies[1] ?? {})).not.toContain("screenshot");
  });

  it("opens from the Beta label while the beta is closed", async () => {
    await start("/", { beta: true });
    await fireEvent.press(await screen.findByRole("button", { name: "Beta. Send feedback" }));
    expect(await screen.findByRole("header", { name: "Send feedback" })).toBeVisible();
  });

  it("opens from Settings, and from there shows My feedback", async () => {
    await start("/settings", {
      mine: [
        {
          ...received,
          reply: "Thanks, fixed in the next version.",
          repliedAt: "2026-11-18T09:00:00.000Z",
        },
        {
          ...received,
          id: "0190a1d6-0000-7000-8000-0000000000f2",
          kind: "idea",
          message: "Show the weather.",
          hasScreenshot: false,
          createdAt: "2026-11-16T10:00:00.000Z",
        },
      ],
    });
    await fireEvent.press(await screen.findByRole("button", { name: "My feedback" }));
    expect(await screen.findByRole("header", { name: "My feedback" })).toBeVisible();
    expect(await screen.findByText("Something isn't working · 17 November 2026")).toBeVisible();
    expect(screen.getByText("The map does not move.")).toBeVisible();
    expect(screen.getByText("Sent with a screenshot.")).toBeVisible();
    expect(screen.getByText("ShareRide replied on 18 November 2026")).toBeVisible();
    expect(screen.getByText("Thanks, fixed in the next version.")).toBeVisible();
    expect(screen.getByText("An idea · 16 November 2026")).toBeVisible();
    expect(screen.getByText("No reply yet.")).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByRole("header", { name: "Send feedback" })).toBeVisible();
  });

  it("says when nothing was sent yet", async () => {
    await start("/settings/feedback");
    expect(await screen.findByText("You haven't sent any feedback yet.")).toBeVisible();
  });

  it("offers to try again when the list cannot be loaded", async () => {
    const again = await renderApp("/settings/feedback", {
      me: completeMe,
      setUp: (client: FakeClient) => {
        let tries = 0;
        client.answer("/v1/me/feedback", () => {
          tries += 1;
          return tries === 1 ? failure(500, "internal_error") : ok(200, { feedback: [] });
        });
      },
    });
    expect(await screen.findByText("We couldn't load your feedback.")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You haven't sent any feedback yet.")).toBeVisible();
    expect(again.client.calls.filter((call) => call.path === "/v1/me/feedback")).toHaveLength(2);
  });
});

describe("Shake to send feedback (spec 12, 3.3.1)", () => {
  it("opens the form from the screen on show, once", async () => {
    await start("/profile");
    await screen.findByRole("header", { name: "My profile" });
    await waitFor(() => {
      expect(listening()).toBe(1);
    });
    await act(async () => {
      shake();
      await Promise.resolve();
    });
    expect(await screen.findByRole("header", { name: "Send feedback" })).toBeVisible();
    expect(captureScreen).toHaveBeenCalledTimes(1);
    // On the form itself a shake opens nothing more.
    await act(async () => {
      shake();
      await Promise.resolve();
    });
    expect(captureScreen).toHaveBeenCalledTimes(1);
  });

  it("can be turned off in Settings, and stays off", async () => {
    await start("/settings");
    const toggle = await screen.findByRole("switch", { name: /^Shake to send feedback/ });
    expect(toggle).toBeChecked();
    await waitFor(() => {
      expect(listening()).toBe(1);
    });
    await fireEvent.press(toggle);
    expect(mockedWritePreference).toHaveBeenCalledWith("shareride.shakeForFeedback", "off");
    await waitFor(() => {
      expect(listening()).toBe(0);
    });
  });

  it("does not listen when it was turned off before, or signed out", async () => {
    mockedReadPreference.mockImplementation((key: string) =>
      Promise.resolve(key === "shareride.shakeForFeedback" ? "off" : null),
    );
    await start("/profile");
    await screen.findByRole("header", { name: "My profile" });
    expect(listening()).toBe(0);
  });
});
