import { Platform, Share } from "react-native";

/** How sharing a link ended: shared or copied, closed by the person, or not possible. */
export type ShareOutcome = "shared" | "copied" | "dismissed" | "failed";

/** A link the person shared, and how that ended. */
export interface Shared {
  readonly outcome: ShareOutcome;
  readonly url: string;
}

const isAbort = (error: unknown) => error instanceof Error && error.name === "AbortError";

/**
 * Shares a web address with the phone's share sheet, or the browser's where
 * it has one; otherwise copies it. A browser without either (an address
 * that is not https) answers "failed", so the screen can show the link to
 * copy by hand. A browser's share window may take a `title` apart from the
 * text, such as the route for a driver's post (spec 28, 3.2).
 */
export function shareLink(url: string, text: string, title: string = text): Promise<ShareOutcome> {
  return share(text, url, title);
}

/**
 * Shares a text, such as a trip's details (spec 9, 3.3.3), the same way, or
 * copies it. Nothing is stored and no link is made (R9.8).
 */
export function shareText(text: string): Promise<ShareOutcome> {
  return share(text, null);
}

/**
 * Whether the phone or the browser has a share window of its own: phones
 * always, browsers on phones and some on laptops (spec 28, 3.2).
 */
export function canShareWindow(): boolean {
  if (Platform.OS !== "web") return true;
  const browser = globalThis.navigator as Partial<Navigator> | undefined;
  return typeof browser?.share === "function";
}

/**
 * Whether a text can be copied: in a browser with a clipboard. The app has
 * no clipboard of its own, so on a phone the share window takes the text.
 */
export function canCopy(): boolean {
  if (Platform.OS !== "web") return false;
  const browser = globalThis.navigator as Partial<Navigator> | undefined;
  return browser?.clipboard !== undefined;
}

/**
 * Copies a text, such as a driver's post (spec 28, 3.2): in a browser with
 * a clipboard. Phones share it instead, so this answers "failed" there.
 */
export async function copyText(text: string): Promise<"copied" | "failed"> {
  if (Platform.OS !== "web") return "failed";
  const browser = globalThis.navigator as Partial<Navigator> | undefined;
  try {
    if (browser?.clipboard === undefined) return "failed";
    await browser.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

/**
 * How a picture, such as a ride's story (spec 28, 3.5), can be shared
 * here: as a file in the share window and saved with a download ("share",
 * browsers that can share a file, mostly on phones), saved with a download
 * only ("download", other browsers), or not yet ("none", the apps, which
 * need a package of their own to share a file).
 */
export function pictureSharing(): "share" | "download" | "none" {
  if (Platform.OS !== "web") return "none";
  const browser = globalThis.navigator as Partial<Navigator> | undefined;
  try {
    const probe = new File([], "picture.png", { type: "image/png" });
    if (typeof browser?.canShare === "function" && browser.canShare({ files: [probe] })) {
      return "share";
    }
  } catch {
    // A browser without File, or one that throws on canShare, downloads.
  }
  return "download";
}

/** How long a picture may take to come, in milliseconds, before it is given up. */
export const pictureWait = 20_000;

/**
 * Fetches a picture ahead of sharing or saving it: a browser opens the
 * share window only straight after a tap, with no time to fetch then. Its
 * file is named as the API names it (`Content-Disposition`), else `name`.
 * Null when it could not be fetched in time, or `signal` said it is no
 * longer wanted.
 */
export async function fetchPicture(
  url: string,
  name: string,
  signal?: AbortSignal,
): Promise<File | null> {
  const controller = new AbortController();
  const stop = () => {
    controller.abort();
  };
  signal?.addEventListener("abort", stop);
  const timer = setTimeout(stop, pictureWait);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const named = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "");
    return new File([await response.blob()], named?.[1] ?? name, { type: "image/png" });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}

/** An address in this page for a picture fetched before, for an image to show it. */
export function pictureAddress(file: File): string {
  return URL.createObjectURL(file);
}

/** Lets the page forget a picture's address once nothing shows it. */
export function forgetPictureAddress(address: string): void {
  URL.revokeObjectURL(address);
}

/**
 * Saves a picture fetched before as a download, named after its file, on
 * the web. The page stays: nothing is opened that could fail.
 */
export function savePicture(file: File): void {
  const address = pictureAddress(file);
  const link = document.createElement("a");
  link.href = address;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  // Some browsers start the download only after the click has returned.
  setTimeout(() => {
    forgetPictureAddress(address);
  }, 60_000);
}

/** Opens the browser's share window with a picture fetched before. */
export async function sharePicture(file: File): Promise<ShareOutcome> {
  const browser = globalThis.navigator as Partial<Navigator> | undefined;
  if (typeof browser?.share !== "function") return "failed";
  try {
    await browser.share({ files: [file] });
    return "shared";
  } catch (error) {
    return isAbort(error) ? "dismissed" : "failed";
  }
}

/** A text, with a web address or without. */
async function share(text: string, url: string | null, title = text): Promise<ShareOutcome> {
  if (Platform.OS !== "web") {
    try {
      // iOS shares the address on its own; Android only shares a message.
      const result = await Share.share(
        url === null
          ? { message: text }
          : Platform.OS === "ios"
            ? { message: text, url }
            : { message: `${text}\n${url}` },
      );
      return result.action === Share.dismissedAction ? "dismissed" : "shared";
    } catch {
      return "failed";
    }
  }
  const browser = globalThis.navigator as Partial<Navigator> | undefined;
  if (typeof browser?.share === "function") {
    try {
      await browser.share(url === null ? { text } : { title, text, url });
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "dismissed";
      // Some browsers refuse without a reason we can act on: copy instead.
    }
  }
  try {
    if (browser?.clipboard === undefined) return "failed";
    await browser.clipboard.writeText(url ?? text);
    return "copied";
  } catch {
    return "failed";
  }
}
