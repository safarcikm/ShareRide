import { providerReturnPath } from "@shareride/domain";
import { maybeCompleteAuthSession } from "expo-web-browser";

/**
 * In the Google or Apple pop-up, back on sign-in/return (ADR 0034): hands
 * the address with its ticket to the window that opened the pop-up, which
 * then closes it, and takes the ticket out of this window's address at
 * once, so it stays out of its history and error reports. Runs when the app
 * loads, before error reporting starts and before any screen can move on.
 */
export function completeProviderPopup(): void {
  if (window.location.pathname !== `/${providerReturnPath}`) return;
  try {
    maybeCompleteAuthSession();
  } catch {
    // The window that opened it is gone, such as after a reload: the
    // return screen says to close this one.
  }
  window.history.replaceState(null, "", window.location.pathname);
}
