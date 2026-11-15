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
export async function shareLink(url: string, text: string): Promise<ShareOutcome> {
  if (Platform.OS !== "web") {
    try {
      // iOS shares the address on its own; Android only shares a message.
      const result = await Share.share(
        Platform.OS === "ios" ? { message: text, url } : { message: `${text}\n${url}` },
      );
      return result.action === Share.dismissedAction ? "dismissed" : "shared";
    } catch {
      return "failed";
    }
  }
  const browser = globalThis.navigator as Partial<Navigator> | undefined;
  if (typeof browser?.share === "function") {
    try {
      await browser.share({ title: text, text, url });
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "dismissed";
      // Some browsers refuse without a reason we can act on: copy instead.
    }
  }
  try {
    if (browser?.clipboard === undefined) return "failed";
    await browser.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
