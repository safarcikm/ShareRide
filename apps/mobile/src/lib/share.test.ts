import { Platform, Share } from "react-native";
import { shareLink, shareText } from "./share";

const url = "https://shareride.is/trips/0190a1d6-0000-7000-8000-0000000000d1?from=1&to=2";
const text = "Borgarnes → Blönduós on PuffinRide";

/** Stands in for the browser's navigator for one test. */
function browserWith(navigator: Partial<Navigator>) {
  jest.replaceProperty(Platform, "OS", "web");
  jest.spyOn(globalThis, "navigator", "get").mockReturnValue(navigator as Navigator);
}

const abort = () => Object.assign(new Error("Share canceled"), { name: "AbortError" });

let shareSheet: jest.SpiedFunction<typeof Share.share>;

beforeEach(() => {
  shareSheet = jest.spyOn(Share, "share");
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Sharing a link on phones", () => {
  it.each([
    ["ios", { message: text, url }],
    ["android", { message: `${text}\n${url}` }],
  ] as const)("opens the share sheet on %s", async (os, content) => {
    jest.replaceProperty(Platform, "OS", os);
    shareSheet.mockResolvedValueOnce({ action: Share.sharedAction, activityType: undefined });
    await expect(shareLink(url, text)).resolves.toBe("shared");
    expect(shareSheet).toHaveBeenCalledWith(content);
  });

  it("knows when the person closed the share sheet", async () => {
    shareSheet.mockResolvedValueOnce({ action: Share.dismissedAction, activityType: undefined });
    await expect(shareLink(url, text)).resolves.toBe("dismissed");
  });

  it("fails when the share sheet does", async () => {
    shareSheet.mockRejectedValueOnce(new Error("No share sheet"));
    await expect(shareLink(url, text)).resolves.toBe("failed");
  });
});

describe("Sharing a link on the web", () => {
  it("uses the browser's share sheet where it has one", async () => {
    const share = jest.fn(() => Promise.resolve());
    browserWith({ share });
    await expect(shareLink(url, text)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: text, text, url });
  });

  it("knows when the person closed the browser's share sheet", async () => {
    browserWith({ share: jest.fn(() => Promise.reject(abort())) });
    await expect(shareLink(url, text)).resolves.toBe("dismissed");
  });

  it("copies the link when the browser refuses to share it", async () => {
    const writeText = jest.fn(() => Promise.resolve());
    browserWith({
      share: jest.fn(() => Promise.reject(new Error("NotAllowedError"))),
      clipboard: { writeText } as unknown as Clipboard,
    });
    await expect(shareLink(url, text)).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(url);
  });

  it("copies the link in a browser without a share sheet", async () => {
    const writeText = jest.fn(() => Promise.resolve());
    browserWith({ clipboard: { writeText } as unknown as Clipboard });
    await expect(shareLink(url, text)).resolves.toBe("copied");
  });

  it.each([
    ["has no clipboard", {}],
    [
      "cannot write to it",
      {
        clipboard: { writeText: () => Promise.reject(new Error("Denied")) } as unknown as Clipboard,
      },
    ],
  ])("fails when the browser %s, so the screen shows the link", async (_, navigator) => {
    browserWith(navigator);
    await expect(shareLink(url, text)).resolves.toBe("failed");
  });
});

describe("Sharing a text, such as a trip's details (spec 9, 3.3.3)", () => {
  const details = "My trip: Saturday 14 November at 13:00 · Borgarnes → Blönduós";

  it.each(["ios", "android"] as const)("opens the share sheet with the text on %s", async (os) => {
    jest.replaceProperty(Platform, "OS", os);
    shareSheet.mockResolvedValueOnce({ action: Share.sharedAction, activityType: undefined });
    await expect(shareText(details)).resolves.toBe("shared");
    expect(shareSheet).toHaveBeenCalledWith({ message: details });
  });

  it("uses the browser's share sheet where it has one", async () => {
    const share = jest.fn(() => Promise.resolve());
    browserWith({ share });
    await expect(shareText(details)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: details });
  });

  it("copies the text in a browser without a share sheet", async () => {
    const writeText = jest.fn(() => Promise.resolve());
    browserWith({ clipboard: { writeText } as unknown as Clipboard });
    await expect(shareText(details)).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(details);
  });
});
