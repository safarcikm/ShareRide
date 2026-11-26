import { Platform, Share } from "react-native";
import {
  canCopy,
  canShareWindow,
  copyText,
  fetchPicture,
  pictureSharing,
  pictureWait,
  savePicture,
  shareLink,
  sharePicture,
  shareText,
} from "./share";

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

describe("A share window's title, apart from its text (spec 28, 3.2)", () => {
  it("gives the browser the title, the text and the link", async () => {
    const share = jest.fn(() => Promise.resolve());
    browserWith({ share });
    await expect(shareLink(url, "Offering a ride: …", text)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: text, text: "Offering a ride: …", url });
  });
});

describe("Whether there is a share window (spec 28, 3.2)", () => {
  it.each(["ios", "android"] as const)("there is on %s", (os) => {
    jest.replaceProperty(Platform, "OS", os);
    expect(canShareWindow()).toBe(true);
  });

  it("there is in a browser that has one", () => {
    browserWith({ share: jest.fn() });
    expect(canShareWindow()).toBe(true);
  });

  it("there is not in most laptop browsers", () => {
    browserWith({});
    expect(canShareWindow()).toBe(false);
  });
});

describe("Copying a text (spec 28, 3.2)", () => {
  it("can in a browser with a clipboard, and not on a phone or without one", () => {
    browserWith({ clipboard: { writeText: jest.fn() } as unknown as Clipboard });
    expect(canCopy()).toBe(true);
    browserWith({});
    expect(canCopy()).toBe(false);
    jest.replaceProperty(Platform, "OS", "android");
    expect(canCopy()).toBe(false);
  });

  it("copies it in a browser", async () => {
    const writeText = jest.fn(() => Promise.resolve());
    browserWith({ clipboard: { writeText } as unknown as Clipboard });
    await expect(copyText("Býð far")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("Býð far");
  });

  it("fails where it cannot, so the screen says to select it", async () => {
    browserWith({
      clipboard: { writeText: () => Promise.reject(new Error("Denied")) } as unknown as Clipboard,
    });
    await expect(copyText("Býð far")).resolves.toBe("failed");
    browserWith({});
    await expect(copyText("Býð far")).resolves.toBe("failed");
  });

  it("fails on a phone, which shares instead", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    await expect(copyText("Býð far")).resolves.toBe("failed");
  });
});

describe("Sharing a picture, such as a ride's story (spec 28, 3.5)", () => {
  it("shares it as a file where the browser can, downloads it elsewhere, and waits in the apps", () => {
    browserWith({ canShare: () => true, share: jest.fn() });
    expect(pictureSharing()).toBe("share");
    browserWith({ canShare: () => false, share: jest.fn() });
    expect(pictureSharing()).toBe("download");
    browserWith({});
    expect(pictureSharing()).toBe("download");
    jest.replaceProperty(Platform, "OS", "ios");
    expect(pictureSharing()).toBe("none");
  });

  it("fetches the picture ahead, as a PNG file with a name", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const fetched = jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers(),
      blob: () => Promise.resolve(blob),
    } as Response);
    const file = await fetchPicture("https://puffinride.is/v1/trips/1/story.png", "puffinride.png");
    expect(fetched).toHaveBeenCalledWith("https://puffinride.is/v1/trips/1/story.png", {
      signal: expect.any(AbortSignal) as AbortSignal,
    });
    expect(file?.name).toBe("puffinride.png");
    expect(file?.type).toBe("image/png");
    fetched.mockResolvedValue({ ok: false } as Response);
    await expect(fetchPicture("https://puffinride.is/x.png", "x.png")).resolves.toBeNull();
    fetched.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchPicture("https://puffinride.is/x.png", "x.png")).resolves.toBeNull();
  });

  it("names the file as the API does, after the route", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-disposition": 'attachment; filename="puffinride-bsi-hofn-n1.png"',
      }),
      blob: () => Promise.resolve(new Blob(["png"], { type: "image/png" })),
    } as Response);
    const file = await fetchPicture("https://puffinride.is/x.png?download=1", "puffinride.png");
    expect(file?.name).toBe("puffinride-bsi-hofn-n1.png");
  });

  it("gives up on a picture that takes too long, or that is no longer wanted", async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          });
        }),
    );
    const slow = fetchPicture("https://puffinride.is/x.png", "x.png");
    jest.advanceTimersByTime(pictureWait);
    await expect(slow).resolves.toBeNull();
    const stop = new AbortController();
    const unwanted = fetchPicture("https://puffinride.is/x.png", "x.png", stop.signal);
    stop.abort();
    await expect(unwanted).resolves.toBeNull();
    jest.useRealTimers();
  });

  it("saves it from the page, without leaving the page", () => {
    jest.useFakeTimers();
    const click = jest.fn();
    const link = { href: "", download: "", click, remove: jest.fn() };
    const append = jest.fn();
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: () => link, body: { append } },
    });
    const createObjectURL = jest.fn(() => "blob:story");
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const file = new File(["png"], "puffinride-bsi-hofn-n1.png", { type: "image/png" });
    savePicture(file);
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(link).toMatchObject({ href: "blob:story", download: "puffinride-bsi-hofn-n1.png" });
    expect(append).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalled();
    expect(link.remove).toHaveBeenCalled();
    // The browser starts the download after the click; the address goes later.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:story");
    Reflect.deleteProperty(globalThis, "document");
    jest.useRealTimers();
  });

  it("opens the share window with the file, and knows when it was closed", async () => {
    const share = jest.fn(() => Promise.resolve());
    browserWith({ share });
    const file = new File(["png"], "puffinride.png", { type: "image/png" });
    await expect(sharePicture(file)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [file] });
    share.mockRejectedValueOnce(abort());
    await expect(sharePicture(file)).resolves.toBe("dismissed");
    share.mockRejectedValueOnce(new Error("NotAllowedError"));
    await expect(sharePicture(file)).resolves.toBe("failed");
  });
});
