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
