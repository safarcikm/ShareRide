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
 * copy by hand.
 */
export function shareLink(url: string, text: string): Promise<ShareOutcome> {
  return share(text, url);
}

/**
 * Shares a text, such as a trip's details (spec 9, 3.3.3), the same way, or
 * copies it. Nothing is stored and no link is made (R9.8).
 */
export function shareText(text: string): Promise<ShareOutcome> {
  return share(text, null);
}

/** A text, with a web address or without. */
async function share(text: string, url: string | null): Promise<ShareOutcome> {
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
      await browser.share(url === null ? { text } : { title: text, text, url });
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
